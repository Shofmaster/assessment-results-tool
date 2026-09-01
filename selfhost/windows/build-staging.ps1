<#
.SYNOPSIS
    Assembles the staging directory that install.ps1 and the Inno Setup
    installer consume.

.DESCRIPTION
    Produces a self-contained folder holding everything a customer machine
    needs, with no build tooling and no network access required at install
    time:

        convex-local-backend.exe   pinned Convex backend
        node.exe                   pinned Node runtime
        server.js(+.map)           bundled AeroGap application server
        node_modules\              production dependencies only
        www\                       built SPA
        WinSW.exe                  service wrapper
        install.ps1, uninstall.ps1, services\

    Third-party binaries are downloaded once into a cache and verified against
    the sha256 values pinned in versions.json. A mismatch aborts the build - see
    the comment at the top of that file.

    NOTE ON ENCODING: this file is deliberately ASCII-only. Windows PowerShell
    5.1 (Server 2016/2019) reads BOM-less .ps1 files as ANSI, so a stray
    non-ASCII character parses as garbage and produces misleading syntax errors
    far from the real line. Keep it ASCII, or save as UTF-8 with BOM.

.PARAMETER OutDir
    Where to write the staging directory. Cleared first unless -NoClean.

.PARAMETER ConvexPublicUrl
    OPTIONAL. Bakes a Convex URL into the bundle. Normally omitted: the server
    supplies it at run time via /config.js, so one artifact serves any customer.

.PARAMETER ClerkPublishableKey
    OPTIONAL. Same - normally supplied at install time, not build time.

.EXAMPLE
    # Generic artifact - any customer, any hostname (the normal case)
    .\build-staging.ps1 -OutDir C:\build\aerogap
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $OutDir,

    <#
    Which product this staging directory becomes.

      desktop  Per-user install. AeroGap.exe supervises the Convex backend and
               the application server as its own child processes on loopback.
               No services, no elevation, no reverse proxy, no certificate - so
               the installer has nothing to ask.
      server   The historical build: three Windows Services, Caddy in front for
               TLS, reachable across the LAN by hostname.
      both     Stage everything. One directory can produce either installer,
               because the only difference in the payload is a marker file.

    The payload is deliberately near-identical between modes: caddy.exe and
    WinSW.exe are a few tens of MB and staging them unconditionally keeps ONE
    build to test rather than two that can diverge.
    #>
    [ValidateSet('desktop', 'server', 'both')]
    [string] $Mode = 'both',

    <#
    OPTIONAL since runtime config injection landed.

    The application now reads its public configuration from /config.js, which
    the server generates per install (see selfhost/server/src/clientConfig.ts),
    so the bundle no longer has to carry a hostname or a Clerk key. Leaving
    these blank produces a GENERIC artifact that any customer can install under
    any hostname - which is the whole point: one installer, not one per site.

    They are kept only as a fallback for a build that will never be served by
    our own server. Supplying them bakes values in and reintroduces the
    per-customer build, so leave them empty unless you specifically need that.
    #>
    [string] $ConvexPublicUrl = '',
    [string] $ClerkPublishableKey = '',

    <#
    Clerk configuration compiled into the build, so no installer has to ask for
    it. All three identify OUR tenant, are identical at every customer site, and
    none is a secret:

      -ClerkIssuerDomain  https://clerk.aerogaptechnologies.com
      -ClerkJwtKey        the JWT verification PUBLIC key (PEM), from
                          Clerk Dashboard > API keys > Show JWT public key

    The JWT key is what replaced CLERK_SECRET_KEY. It verifies a signature
    without being able to produce one, so it is safe to ship; the secret key is
    not, and build-config.json refuses to carry it.

    Written to build-config.json, which the server applies UNDER real
    environment variables - so a site that must point at a different Clerk
    instance still can.
    #>
    [string] $ClerkIssuerDomain = '',
    [string] $ClerkJwtKey = '',

    [string] $CacheDir = (Join-Path $env:LOCALAPPDATA 'AeroGapBuildCache'),
    [switch] $NoClean,
    [switch] $SkipDownloads,

    <#
    Command used to Authenticode-sign the executables this project produces.
    "{f}" is replaced with the file path. Leave blank for an unsigned build.

    Only OUR binaries are signed - AeroGap.exe here, and the installer itself
    (see -DSignTool in aerogap.iss). node.exe, caddy.exe and
    convex-local-backend.exe carry their vendors' signatures; re-signing
    third-party binaries would strip the provenance a customer's security team
    may want to verify.

    EV keys live in FIPS-certified hardware, so the shape of this command
    depends on where the key is:

      USB token (traditional EV):
        -SignCommand 'signtool.exe sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "{f}"'

      Azure Trusted Signing:
        -SignCommand 'signtool.exe sign /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256 /dlib C:\path\Azure.CodeSigning.Dlib.dll /dmdf C:\path\metadata.json "{f}"'

    ALWAYS timestamp (/tr). Without it every signature becomes invalid the day
    the certificate expires, including on copies already installed.
    #>
    [string] $SignCommand = '',

    [string] $AppVersion = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$WindowsDir  = $PSScriptRoot
$SelfhostDir = Split-Path $WindowsDir -Parent
$RepoRoot    = Split-Path $SelfhostDir -Parent

if (-not $AppVersion) {
    $AppVersion = (Get-Content (Join-Path $SelfhostDir 'package.json') -Raw | ConvertFrom-Json).version
}

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Act($m)  { Write-Host "    $m" }
function Write-Warn($m) { Write-Host "    ! $m" -ForegroundColor Yellow }

<#
.SYNOPSIS
    Authenticode-signs one file, and verifies the signature took.

.DESCRIPTION
    Signing is easy to get wrong in a way that looks fine: signtool can exit 0
    while producing a signature Windows will not honour, and a build that
    silently ships unsigned binaries is worse than one that fails, because the
    problem surfaces at a customer's machine as a SmartScreen block.

    So the result is checked with Get-AuthenticodeSignature rather than trusted.
#>
function Invoke-Sign {
    param(
        [Parameter(Mandatory = $true)] [string] $Path,
        [Parameter(Mandatory = $true)] [string] $What
    )

    if (-not $SignCommand) { return $false }

    $cmd = $SignCommand.Replace('{f}', $Path)
    Write-Act "sign $What"

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        # cmd.exe rather than parsing the command ourselves: the signing
        # invocation differs per provider and operators will paste one in.
        & cmd.exe /c $cmd
        if ($LASTEXITCODE -ne 0) { throw "Signing failed for $Path (exit $LASTEXITCODE)." }
    } finally {
        $ErrorActionPreference = $previous
    }

    $sig = Get-AuthenticodeSignature -FilePath $Path
    if ($sig.Status -ne 'Valid') {
        throw "Signature on $Path is '$($sig.Status)', not Valid. $($sig.StatusMessage)"
    }
    if (-not $sig.TimeStamperCertificate) {
        # Not fatal, but it means every signature dies with the certificate.
        Write-Warn "$What is signed but NOT timestamped - the signature will expire with the certificate. Add /tr to the sign command."
    }
    Write-Act "  signed by: $($sig.SignerCertificate.Subject)"
    return $true
}

<#
.SYNOPSIS
    Runs a native executable and fails only on a non-zero exit code.

.DESCRIPTION
    Windows PowerShell 5.1 wraps every stderr line from a native command in a
    NativeCommandError whenever stderr is redirected - which any caller doing
    "... 2>&1 | ..." triggers. Combined with $ErrorActionPreference = 'Stop',
    a single npm deprecation WARNING aborts the build even though npm exited 0.

    Exit code is the only trustworthy success signal for a native process, so
    error preference is relaxed for the duration of the call and the exit code
    is checked explicitly.
#>
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)] [string]   $Exe,
        [Parameter(Mandatory = $true)] [string[]] $Arguments,
        [Parameter(Mandatory = $true)] [string]   $What
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Exe @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$What failed (exit code $LASTEXITCODE)."
        }
    } finally {
        $ErrorActionPreference = $previous
    }
}

# -----------------------------------------------------------------------------
# Preflight
# -----------------------------------------------------------------------------
# 'npm ci' later in this script DELETES and recreates the repo's node_modules.
# Anything holding a file in there - most often a running dev server - makes it
# fail partway with EPERM (-4048), and the casualty is the DEVELOPER'S
# node_modules, not just this build. Observed: it removed typescript and react,
# and every command in the repo failed until 'npm ci' was re-run by hand.
#
# Checked HERE rather than beside the npm call: by then the desktop shell has
# already been built, so a five-minute wait precedes an entirely avoidable
# failure.
#
# Matches on the command line, which is where a dev server or watcher shows up
# (they run node against a script under the repo's node_modules). It will NOT
# catch a bare 'node -e ...' started from the repo directory - the cwd is not on the
# command line - so this is a high-value guard, not a guarantee.
Write-Step 'Preflight'

$holders = @(
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($RepoRoot) }
)
if ($holders.Count -gt 0) {
    $list = ($holders | ForEach-Object { "    PID $($_.ProcessId)" }) -join "`r`n"
    throw @"
A node process is running out of this repo and will make 'npm ci' fail partway,
leaving node_modules broken:

$list

Stop it - a dev server, a file watcher, a test runner - and build again.
"@
}
Write-Act 'no repo-rooted node processes holding node_modules'

# -----------------------------------------------------------------------------
# Pinned dependencies
# -----------------------------------------------------------------------------
Write-Step 'Reading pinned versions'

$versionsFile = Join-Path $WindowsDir 'versions.json'
if (-not (Test-Path $versionsFile)) { throw "Missing $versionsFile" }
$versions = Get-Content $versionsFile -Raw | ConvertFrom-Json
Write-Act "convex $($versions.convexBackend.version)"
Write-Act "node   $($versions.node.version)"
Write-Act "winsw  $($versions.winsw.version)"

New-Item -ItemType Directory -Force $CacheDir | Out-Null

function Get-Pinned($spec) {
    $dest = Join-Path $CacheDir $spec.file

    if (Test-Path $dest) {
        $have = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
        if ($have -eq $spec.sha256.ToLower()) {
            Write-Act "cached  $($spec.file)"
            return $dest
        }
        Write-Warn "cached copy of $($spec.file) failed verification - re-downloading"
        Remove-Item $dest -Force
    }

    if ($SkipDownloads) { throw "-SkipDownloads set but $($spec.file) is not in the cache." }

    Write-Act "download $($spec.url)"
    Invoke-WebRequest -Uri $spec.url -OutFile $dest -UseBasicParsing

    $have = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
    if ($have -ne $spec.sha256.ToLower()) {
        Remove-Item $dest -Force
        throw @"
Checksum mismatch for $($spec.file).
  expected: $($spec.sha256)
  actual:   $have
Refusing to build. Either the upstream artifact changed (update versions.json
deliberately, and record why) or the download was tampered with.
"@
    }
    Write-Act "verified $($spec.file)"
    return $dest
}

$convexZip = Get-Pinned $versions.convexBackend
$nodeZip   = Get-Pinned $versions.node
$winswExe  = Get-Pinned $versions.winsw
$caddyZip  = Get-Pinned $versions.caddy

# -----------------------------------------------------------------------------
# Output directory
# -----------------------------------------------------------------------------
Write-Step 'Preparing output directory'

if ((Test-Path $OutDir) -and -not $NoClean) {
    # Fail fast if something else holds the directory. Running this while the
    # Inno compiler was reading the same staging tree produced a half-deleted
    # output and an IOException naming a random .d.ts.map file - which reads
    # like a corrupt build rather than "two things ran at once".
    $probe = Join-Path $OutDir '.writecheck'
    try {
        Set-Content -Path $probe -Value 'x' -ErrorAction Stop
        Remove-Item $probe -Force -ErrorAction Stop
    } catch {
        throw @"
Cannot write to $OutDir - something else is using it.

The usual cause is a compile (ISCC.exe) or a running AeroGap.exe holding files
in this directory. Close it and re-run; do not run a build and a compile against
the same staging directory at the same time.
"@
    }

    Write-Act "clean $OutDir"
    Remove-Item $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force $OutDir | Out-Null
Write-Act $OutDir

# -----------------------------------------------------------------------------
# Third-party binaries
# -----------------------------------------------------------------------------
Write-Step 'Extracting pinned binaries'

$tmp = Join-Path $OutDir '_extract'
New-Item -ItemType Directory -Force $tmp | Out-Null

Expand-Archive -Path $convexZip -DestinationPath $tmp -Force
$convexSrc = Get-ChildItem $tmp -Recurse -Filter 'convex-local-backend.exe' | Select-Object -First 1
if (-not $convexSrc) { throw 'convex-local-backend.exe not found in the downloaded archive.' }
Copy-Item $convexSrc.FullName (Join-Path $OutDir 'convex-local-backend.exe') -Force
Write-Act 'convex-local-backend.exe'

Expand-Archive -Path $nodeZip -DestinationPath $tmp -Force
$nodeSrc = Get-ChildItem $tmp -Recurse -Filter 'node.exe' | Select-Object -First 1
if (-not $nodeSrc) { throw 'node.exe not found in the downloaded archive.' }
Copy-Item $nodeSrc.FullName (Join-Path $OutDir 'node.exe') -Force
Write-Act 'node.exe'

Copy-Item $winswExe (Join-Path $OutDir 'WinSW.exe') -Force
Write-Act 'WinSW.exe'

Expand-Archive -Path $caddyZip -DestinationPath $tmp -Force
$caddySrc = Get-ChildItem $tmp -Recurse -Filter 'caddy.exe' | Select-Object -First 1
if (-not $caddySrc) { throw 'caddy.exe not found in the downloaded archive.' }
Copy-Item $caddySrc.FullName (Join-Path $OutDir 'caddy.exe') -Force
Write-Act 'caddy.exe'

Remove-Item $tmp -Recurse -Force

# -----------------------------------------------------------------------------
# Application server bundle
# -----------------------------------------------------------------------------
Write-Step 'Building the application server'

Push-Location $SelfhostDir
try {
    Write-Act 'npm ci (selfhost build deps)'
    Invoke-Native -Exe 'npm' -Arguments @('ci', '--no-audit', '--no-fund') -What 'npm ci'

    Write-Act 'esbuild bundle'
    Invoke-Native -Exe 'node' -Arguments @((Join-Path $SelfhostDir 'scripts\build-server.mjs')) -What 'Server bundle'
} finally {
    Pop-Location
}

Copy-Item (Join-Path $SelfhostDir 'dist\server.js') $OutDir -Force
$map = Join-Path $SelfhostDir 'dist\server.js.map'
# Shipped on purpose: an on-prem stack trace arrives as pasted text in a support
# ticket, and without the map it is unreadable.
if (Test-Path $map) { Copy-Item $map $OutDir -Force }
Write-Act 'server.js'

# -----------------------------------------------------------------------------
# Production dependencies
# -----------------------------------------------------------------------------
Write-Step 'Installing runtime dependencies (production only)'

# Built in a scratch directory so the repo's own node_modules is left intact -
# --omit=dev here would otherwise strip the tooling the developer is using.
$depDir = Join-Path $OutDir '_deps'
New-Item -ItemType Directory -Force $depDir | Out-Null
Copy-Item (Join-Path $SelfhostDir 'package.json') $depDir -Force
Copy-Item (Join-Path $SelfhostDir 'package-lock.json') $depDir -Force

Push-Location $depDir
try {
    Invoke-Native -Exe 'npm' -Arguments @('ci', '--omit=dev', '--no-audit', '--no-fund') -What 'Production dependency install'
} finally {
    Pop-Location
}

Move-Item (Join-Path $depDir 'node_modules') (Join-Path $OutDir 'node_modules') -Force
Remove-Item $depDir -Recurse -Force
$depCount = (Get-ChildItem (Join-Path $OutDir 'node_modules') -Directory).Count
Write-Act "node_modules ($depCount top-level packages)"

# -----------------------------------------------------------------------------
# Convex function source
# -----------------------------------------------------------------------------
# WITHOUT THIS, FIRST-RUN SETUP CANNOT WORK ON A CUSTOMER MACHINE.
#
# bootstrap.mjs finishes by running `convex deploy`, which pushes the schema and
# functions into the local backend. A deploy needs the FUNCTION SOURCE. It was
# never staged, and bootstrap.mjs ran the CLI with its cwd set to the git
# checkout - so the documented "run node bootstrap.mjs" step only ever worked on
# a machine that happened to have the repository. Every real customer install
# would have had an empty backend and a completely non-functional application.
#
# The source is staged into convex-src\ rather than the payload root so the CLI
# sees a clean project directory. Node resolves modules by walking UP, so the
# imports inside these functions (convex, stripe, svix, openai, @anthropic-ai)
# resolve against the node_modules staged beside it - no second install.
Write-Step 'Staging Convex function source'

$convexSrcOut = Join-Path $OutDir 'convex-src'
New-Item -ItemType Directory -Force $convexSrcOut | Out-Null

# /XD excludes the test directory: vitest specs are not deployable functions and
# would only add surface area on a customer machine.
$null = robocopy (Join-Path $RepoRoot 'convex') (Join-Path $convexSrcOut 'convex') `
    /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 /XD '__tests__'
if ($LASTEXITCODE -ge 8) { throw "robocopy failed staging convex\ (exit $LASTEXITCODE)" }

# convex.json names the functions directory and declares stripe as an external
# package for the Node runtime; the deploy reads both.
Copy-Item (Join-Path $RepoRoot 'convex.json') $convexSrcOut -Force

# The CLI expects a project root with a package.json, and it REFUSES to run
# ("In order to env set, add `convex` to your package.json dependencies") unless
# that file DECLARES convex as a dependency - it checks the manifest, not what
# is actually resolvable. The version is pinned to match the staged package.
#
# A minimal manifest is preferable to shipping the app's, which lists ~100 dev
# dependencies that are not present here and would make the file misleading.
# Nothing is installed from it: modules resolve from the node_modules staged one
# directory up, which is why the dependency block can be this short.
$convexVersion = (Get-Content (Join-Path $OutDir 'node_modules\convex\package.json') -Raw | ConvertFrom-Json).version
@"
{
  "name": "aerogap-convex-functions",
  "private": true,
  "version": "0.0.0",
  "description": "Convex schema and functions, staged for deployment into the local backend at first run. Not a buildable project: dependencies resolve from the node_modules staged one directory up.",
  "dependencies": {
    "convex": "$convexVersion"
  }
}
"@ | Set-Content -Path (Join-Path $convexSrcOut 'package.json') -Encoding utf8

$fnCount = (Get-ChildItem (Join-Path $convexSrcOut 'convex') -Recurse -File -Filter '*.ts').Count
Write-Act "convex-src\ ($fnCount .ts files)"

# Fail here, not on a customer machine. These two are imported by the Convex
# functions (svix by convex\http.ts, stripe by the billing modules and named in
# convex.json externalPackages) but NOT by the application server, so nothing
# else in this build would notice them missing - and the deploy that needs them
# runs for the first time at a customer site.
foreach ($pkg in @('convex', 'stripe', 'svix')) {
    $probe = Join-Path $OutDir "node_modules\$pkg\package.json"
    if (-not (Test-Path $probe)) {
        throw "Convex deploy dependency '$pkg' is missing from the staged node_modules. Add it to selfhost\package.json dependencies."
    }
}
Write-Act 'deploy dependencies present: convex, stripe, svix'

# -----------------------------------------------------------------------------
# Desktop shell
# -----------------------------------------------------------------------------
# Built here rather than copied in by hand. It was manual once, and the next
# rebuild cleaned the output directory and silently dropped it - producing an
# installer whose Start Menu shortcut pointed at a file that did not exist.
Write-Step 'Building the desktop shell'

$desktopDir = Join-Path $SelfhostDir 'desktop'
if (-not (Test-Path (Join-Path $desktopDir 'package.json'))) {
    throw "Missing $desktopDir\package.json - the desktop shell source is not present."
}

Write-Act "stamping version $AppVersion"
foreach ($pkgPath in @(
    (Join-Path $SelfhostDir 'package.json'),
    (Join-Path $desktopDir 'package.json')
)) {
    $json = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $json.version = $AppVersion
    ($json | ConvertTo-Json -Depth 20) | Set-Content -Path $pkgPath -Encoding utf8
}
Set-Content -Path (Join-Path $OutDir 'app-version.txt') -Value $AppVersion -Encoding ascii

Push-Location $desktopDir
try {
    Write-Act 'npm ci (electron)'
    Invoke-Native -Exe 'npm' -Arguments @('ci', '--no-audit', '--no-fund') -What 'npm ci in desktop/'

    Write-Act 'electron-builder --win --dir'
    Invoke-Native -Exe 'npx' -Arguments @('electron-builder', '--win', '--dir') -What 'Desktop shell package'
} finally {
    Pop-Location
}

$unpacked = Join-Path $desktopDir 'dist\win-unpacked'
if (-not (Test-Path (Join-Path $unpacked 'AeroGap.exe'))) {
    throw "electron-builder did not produce $unpacked\AeroGap.exe"
}

# The icon has to exist BEFORE electron-builder runs, or the packaged AeroGap.exe
# carries Electron's default icon - the single most obvious "this is not a real
# product" tell, and one that is invisible in a dev run because `npm start` uses
# the BrowserWindow icon instead of the executable resource.
$iconSource = Join-Path $desktopDir 'build\AeroGap.ico'
if (-not (Test-Path $iconSource)) {
    throw "Missing $iconSource. Generate it with: npx electron scripts\make-icon.cjs (from selfhost\desktop)"
}
# A loose copy for ISCC: SetupIconFile needs a real file, and the one used by the
# shell is packed inside app.asar where the compiler cannot reach it.
Copy-Item $iconSource (Join-Path $OutDir 'AeroGap.ico') -Force
Write-Act 'AeroGap.ico (installer + shell)'

# robocopy rather than Copy-Item: the Electron tree nests deeply enough that
# Copy-Item hits path-length problems on some machines.
$desktopOut = Join-Path $OutDir 'desktop'
$null = robocopy $unpacked $desktopOut /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2
if ($LASTEXITCODE -ge 8) { throw "robocopy failed staging the desktop shell (exit $LASTEXITCODE)" }
Write-Act "desktop\ ($([math]::Round((Get-ChildItem $desktopOut -Recurse -File | Measure-Object Length -Sum).Sum/1MB,1)) MB)"

# Signed here, before the installer wraps it. Signing after packaging would
# leave the copy inside the installer unsigned - and that copy is the one users
# actually launch from the Start Menu.
if ($SignCommand) {
    [void](Invoke-Sign -Path (Join-Path $desktopOut 'AeroGap.exe') -What 'desktop\AeroGap.exe')
} else {
    Write-Warn 'No -SignCommand: AeroGap.exe will be unsigned and SmartScreen will warn on launch.'
}

# -----------------------------------------------------------------------------
# SPA
# -----------------------------------------------------------------------------
Write-Step 'Building the SPA'

Write-Warn 'VITE_* values are inlined at build time - this output is specific to the URLs above.'

# CRITICAL: Vite automatically loads .env, .env.local and friends from the repo
# root and inlines every VITE_* value it finds into the bundle. A developer's
# .env.local therefore leaks straight into a customer artifact - an early build
# of this script shipped our production Convex deployment AND a Supabase URL and
# anon key into the output.
#
# Process environment variables take precedence over .env files in Vite, so the
# defence is to explicitly set EVERY VITE_* key that appears in any repo .env
# file: the ones this build intends, and empty strings for all the rest.
# Enumerating rather than hardcoding means a newly-added key in someone's
# .env.local cannot silently reintroduce the leak.
Write-Step 'Isolating the build from local .env files'

# Only bake in what was explicitly supplied. An empty entry here would inline an
# empty string into the bundle, which runtimeEnv treats as absent anyway - but
# leaving it out keeps the generic build genuinely free of deployment values.
$intended = @{}
if ($ConvexPublicUrl) {
    $intended['VITE_CONVEX_URL'] = $ConvexPublicUrl
    $intended['VITE_CONVEX_SITE_URL'] = "$ConvexPublicUrl/http"
}
if ($ClerkPublishableKey) {
    $intended['VITE_CLERK_PUBLISHABLE_KEY'] = $ClerkPublishableKey
}

if ($intended.Count -eq 0) {
    Write-Act 'generic build - no deployment values baked in; config comes from /config.js at run time'
} else {
    Write-Warn 'Baking deployment values into the bundle. This artifact is specific to one install.'
}

# Blanking the unwanted keys does NOT work here: on Windows, assigning an empty
# string to an environment variable deletes it, so the .env.local value flows
# through unopposed. Verified directly - this was the first attempt and it
# silently shipped the leak.
#
# Instead vite.selfhost.config.ts repoints Vite's envDir at a directory with no
# .env files, so nothing is read from disk at all. Any VITE_* still present in
# this shell is removed so only the intended three remain.
foreach ($v in (Get-ChildItem Env: | Where-Object { $_.Name -like 'VITE_*' })) {
    if (-not $intended.ContainsKey($v.Name)) {
        Remove-Item "Env:$($v.Name)" -ErrorAction SilentlyContinue
    }
}
foreach ($key in $intended.Keys) { Set-Item -Path "Env:$key" -Value $intended[$key] }

$viteConfig = Join-Path $WindowsDir 'vite.selfhost.config.ts'
if (-not (Test-Path $viteConfig)) { throw "Missing $viteConfig - required to isolate the build from local .env files." }

if ($intended.Count -gt 0) { Write-Act "baked: $(($intended.Keys | Sort-Object) -join ', ')" }
Write-Act "envDir repointed away from the repo root via vite.selfhost.config.ts"

Push-Location $RepoRoot
try {

    Write-Act 'npm ci (app)'
    Invoke-Native -Exe 'npm' -Arguments @('ci', '--no-audit', '--no-fund') -What 'npm ci'

    # Deliberately not `npm run build`: that also generates a sitemap and
    # prerenders marketing pages, which are meaningless for an internal install
    # and reach the network at build time.
    Write-Act 'tsc'
    Invoke-Native -Exe 'npx' -Arguments @('tsc', '--noEmit') -What 'Typecheck'

    Write-Act 'vite build (isolated env)'
    Invoke-Native -Exe 'npx' -Arguments @('vite', 'build', '--config', $viteConfig) -What 'SPA build'
} finally {
    Pop-Location
}

Copy-Item (Join-Path $RepoRoot 'dist') (Join-Path $OutDir 'www') -Recurse -Force
Write-Act 'www\'

# -----------------------------------------------------------------------------
# Installer scripts
# -----------------------------------------------------------------------------
Write-Step 'Copying installer scripts'

# Every operator-facing script ships. backup.ps1 and restore.ps1 were missed
# initially, which meant the documented backup command pointed at a file that
# was not on the machine.
foreach ($script in @('install.ps1', 'uninstall.ps1', 'backup.ps1', 'restore.ps1', 'set-config.ps1')) {
    $src = Join-Path $WindowsDir $script
    if (-not (Test-Path $src)) { throw "Missing operator script: $src" }
    Copy-Item $src $OutDir -Force
}
Copy-Item (Join-Path $WindowsDir 'services') (Join-Path $OutDir 'services') -Recurse -Force
Copy-Item (Join-Path $SelfhostDir 'scripts\doctor.mjs') $OutDir -Force
Copy-Item (Join-Path $SelfhostDir 'scripts\bootstrap.mjs') $OutDir -Force
# bootstrap.mjs imports ./lib/backendVars.mjs. Both .mjs files are copied FLAT
# into the payload root, so the lib folder has to land beside them or bootstrap
# dies at import with ERR_MODULE_NOT_FOUND on the customer's machine.
Copy-Item (Join-Path $SelfhostDir 'scripts\lib') (Join-Path $OutDir 'lib') -Recurse -Force
Copy-Item (Join-Path $SelfhostDir '.env.example') $OutDir -Force
Copy-Item (Join-Path $WindowsDir 'LICENSE.txt') $OutDir -Force
Write-Act 'install.ps1, uninstall.ps1, services\, doctor.mjs, bootstrap.mjs, lib\, .env.example, LICENSE.txt'

# -----------------------------------------------------------------------------
# Mode marker
# -----------------------------------------------------------------------------
# main.cjs reads this to decide whether it supervises the backend itself
# (desktop) or is only a window onto services someone else runs (server).
#
# It DEFAULTS TO SERVER when the file is absent, which is what every install
# predating desktop mode looks like. Guessing desktop there would start a second
# Convex backend against a database already opened by the running service.
#
# When staging 'both', the marker written here is overwritten by the installer
# that consumes the directory - the desktop .iss writes 'desktop' during install.
$modeMarker = if ($Mode -eq 'desktop') { 'desktop' } else { 'server' }
Set-Content -Path (Join-Path $OutDir 'aerogap-mode.txt') -Value $modeMarker -Encoding ascii -NoNewline
Write-Act "aerogap-mode.txt = $modeMarker"

# -----------------------------------------------------------------------------
# Baked build configuration
# -----------------------------------------------------------------------------
# Read at boot by selfhost\server\src\buildConfig.ts, UNDER real environment
# variables. This is what lets both installers stop asking for Clerk values.
#
# PUBLIC VALUES ONLY. buildConfig.ts enforces an allowlist and logs a loud
# refusal for anything else, so a mistake here is caught at the customer's first
# boot rather than shipping a secret silently - but the first line of defence is
# not putting one in.
Write-Step 'Baked build configuration'

$buildConfig = [ordered]@{}
if ($ClerkIssuerDomain)   { $buildConfig['CLERK_JWT_ISSUER_DOMAIN']    = $ClerkIssuerDomain }
if ($ClerkJwtKey)         { $buildConfig['CLERK_JWT_KEY']              = $ClerkJwtKey }
if ($ClerkPublishableKey) { $buildConfig['VITE_CLERK_PUBLISHABLE_KEY'] = $ClerkPublishableKey }
$buildConfig['EMBEDDING_PROVIDER'] = 'voyage'

# A secret reaching this file would be shipped to every customer, so refuse to
# build rather than trusting the runtime allowlist to catch it later.
foreach ($k in $buildConfig.Keys) {
    if ($k -match 'SECRET|_API_KEY|ADMIN_KEY|TOKEN') {
        throw "build-config.json must never carry '$k'. It ships unencrypted to every customer."
    }
}
if ($ClerkJwtKey -and $ClerkJwtKey -like 'sk_*') {
    throw "-ClerkJwtKey was given a SECRET key (sk_...). It expects the JWT verification PUBLIC key (PEM)."
}

$buildConfig | ConvertTo-Json -Depth 3 |
    Set-Content -Path (Join-Path $OutDir 'build-config.json') -Encoding utf8

if ($ClerkIssuerDomain -and $ClerkJwtKey -and $ClerkPublishableKey) {
    Write-Act "build-config.json ($($buildConfig.Count) values - installers will ask for nothing)"
} else {
    Write-Warn 'build-config.json is INCOMPLETE: Clerk values were not supplied to this build.'
    Write-Warn 'Pass -ClerkIssuerDomain, -ClerkJwtKey and -ClerkPublishableKey, or the'
    Write-Warn 'installed app will have no way to sign anyone in.'
}

# -----------------------------------------------------------------------------
# Verify
# -----------------------------------------------------------------------------
Write-Step 'Verifying staging output'

$required = @(
    'convex-local-backend.exe', 'node.exe', 'server.js', 'WinSW.exe', 'caddy.exe',
    'www', 'node_modules', 'services',
    'install.ps1', 'uninstall.ps1', 'backup.ps1', 'restore.ps1',
    # bootstrap.mjs imports from here; a missing lib\ only surfaces when an
    # operator runs bootstrap, long after the build looked successful.
    'lib\backendVars.mjs',
    # The installer's Start Menu entry and post-install launch both point here.
    'desktop\AeroGap.exe',
    # The shell IS the backend supervisor in desktop mode; without this the
    # packaged app is a window onto nothing.
    'desktop\resources\app.asar',
    'aerogap-mode.txt',
    # Without this the installer compile fails on SetupIconFile, and the app
    # ships with Electron's default icon.
    'AeroGap.ico',
    # Without these the first-run deploy has nothing to push and the customer
    # gets a working sign-in over a completely empty database.
    'convex-src\convex.json',
    'convex-src\convex\schema.ts'
)
$missing = $required | Where-Object { -not (Test-Path (Join-Path $OutDir $_)) }
if ($missing) { throw "Staging output is incomplete. Missing: $($missing -join ', ')" }

# The staged copy is what ships; if it lost its encoding it fails on a customer
# box, not here. See the encoding note in this file's header.
foreach ($ps1 in (Get-ChildItem $OutDir -Filter '*.ps1')) {
    $bytes = [System.IO.File]::ReadAllBytes($ps1.FullName)
    $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    $nonAscii = ($bytes | Where-Object { $_ -gt 127 } | Select-Object -First 1) -ne $null
    if ($nonAscii -and -not $hasBom) {
        throw "$($ps1.Name) contains non-ASCII bytes but has no UTF-8 BOM. Windows PowerShell 5.1 will misparse it."
    }
}
Write-Act 'PowerShell encoding check passed'

# Belt and braces for the .env leak above. The neutralisation happens before the
# build; this asserts on the actual bytes we are about to ship, so a future
# refactor that breaks the isolation fails here rather than at a customer site.
$bundle = (Get-ChildItem (Join-Path $OutDir 'www') -Recurse -File -Include '*.js', '*.html', '*.css' |
    ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"

# Matching vendor domains does not work: the SDKs legitimately embed
# "convex.cloud", "sentry.io" and "posthog.com" in their own error strings and
# default endpoints - the Convex client even ships the example URL
# "https://happy-otter-123.convex.cloud". Shape-based patterns therefore fire on
# library code and train everyone to ignore this check.
#
# So assert on the ACTUAL values instead: every credential-looking value in this
# machine's .env files must be absent from the bundle. That is precise, has no
# false positives, and needs no maintenance when a new key is introduced.
$leaks = @()

$localSecrets = @{}
foreach ($envFile in (Get-ChildItem $RepoRoot -Filter '.env*' -Force -File)) {
    # Templates hold placeholders, not secrets.
    if ($envFile.Name -like '*.example') { continue }
    foreach ($line in (Get-Content $envFile.FullName)) {
        if ($line -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim('"').Trim("'")
            # Short values produce accidental substring hits; real credentials
            # and URLs are comfortably longer than this.
            if ($value.Length -lt 12) { continue }
            # Values this build deliberately bakes in are not leaks.
            if ($intended.Values -contains $value) { continue }
            $localSecrets[$value] = $name
        }
    }
}

foreach ($entry in $localSecrets.GetEnumerator()) {
    if ($bundle.Contains($entry.Key)) {
        $leaks += "the value of $($entry.Name) from a local .env file"
    }
}

# A few shapes that may not be present locally but must never ship regardless.
foreach ($f in @(
    @{ Pattern = 'sb_publishable_|sb_secret_'; What = 'a Supabase key' },
    @{ Pattern = 'phc_[A-Za-z0-9]{20,}';       What = 'a PostHog project key' },
    @{ Pattern = 'https://[0-9a-f]{16,}@[a-z0-9.]*ingest[a-z0-9.]*sentry\.io'; What = 'a Sentry DSN' }
)) {
    if ($bundle -match $f.Pattern) { $leaks += $f.What }
}
if ($leaks.Count -gt 0) {
    throw @"
Refusing to ship: the built SPA contains $($leaks -join '; ').

This means a local .env file leaked into the bundle. Vite inlines every VITE_*
value it can see, so a developer's .env.local becomes part of a customer
artifact. Check the "Isolating the build" step above.
"@
}
Write-Act 'Bundle leak check passed (no cloud endpoints or third-party keys)'

# MAX_PATH guard. node_modules nests deeply (@clerk/shared/dist/runtime/... runs
# past 100 chars on its own), so a staging directory more than ~130 characters
# from the drive root pushes files past the 260-char limit. The Inno Setup
# compiler then fails most of the way through compression with nothing more
# useful than "The system cannot find the path specified."
$longest = (Get-ChildItem $OutDir -Recurse -File -ErrorAction SilentlyContinue |
    ForEach-Object { $_.FullName.Length } | Measure-Object -Maximum).Maximum
if ($longest -ge 260) {
    throw @"
Staging output contains paths of $longest characters, over the 260-char MAX_PATH limit.
The Inno Setup compiler will fail on these.

Re-run with a shorter -OutDir (e.g. C:\aerogap-build). Current: $OutDir
"@
}
if ($longest -ge 230) {
    Write-Warn "Longest path is $longest characters - close to the 260 limit. Consider a shorter -OutDir."
} else {
    Write-Act "Path length check passed (longest $longest chars)"
}

$sizeMb = [math]::Round((Get-ChildItem $OutDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "`n  Staging complete: $OutDir  ($sizeMb MB)`n" -ForegroundColor Green
Write-Host "  Next:  .\install.ps1 -SourceDir `"$OutDir`" -DryRun`n" -ForegroundColor DarkGray
