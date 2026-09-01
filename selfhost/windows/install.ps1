<#
.SYNOPSIS
    Headless install of AeroGap as two Windows Services. No Docker required.

.DESCRIPTION
    Phase 1 of the Windows distribution channel: lays down the file layout,
    generates WinSW service definitions from the templates in services\, and
    registers AeroGapConvex + AeroGapApp to start automatically.

    Layout, and why it is split:
      C:\Program Files\AeroGap   binaries, SPA, service wrappers  (replaced wholesale on upgrade)
      C:\ProgramData\AeroGap     config, database, storage, logs  (NEVER touched by an upgrade)

    Run -DryRun first. It prints every action and changes nothing.

.PARAMETER DryRun
    Print the planned actions and exit without modifying the system.

.PARAMETER SourceDir
    Staging directory holding the built artifacts (see -Help output for layout).

.EXAMPLE
    .\install.ps1 -SourceDir C:\build\aerogap -DryRun
    .\install.ps1 -SourceDir C:\build\aerogap
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $SourceDir,

    [string] $InstallDir = "$env:ProgramFiles\AeroGap",
    [string] $DataRoot = "$env:ProgramData\AeroGap",

    [string] $InstanceName = 'aerogap_onprem',
    # PUBLIC ports, served by the reverse proxy with TLS. The backends listen on
    # fixed loopback-only internal ports (see below) and are not reachable
    # directly.
    [int]    $AppPort = 443,
    [int]    $ConvexPort = 3210,
    [int]    $ConvexSitePort = 3211,

    # Hostname on the certificate and in every URL. Must resolve from user
    # browsers. Defaults to this machine's name.
    [string] $AppDomain = $env:COMPUTERNAME,

    # Operator-supplied certificate. Leave both blank to use Caddy's internal
    # CA, which is fine for a pilot but requires distributing that CA to clients
    # before browsers will trust it.
    [string] $CertPath = '',
    [string] $CertKeyPath = '',

    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

# Loopback-only ports the backends actually bind. Deliberately fixed rather than
# configurable: they are an implementation detail behind the proxy, and every
# extra knob is another way for an install to be subtly wrong.
$AppInternalPort        = 18080
$ConvexInternalPort     = 13210
$ConvexSiteInternalPort = 13211

$AppPublicUrl        = if ($AppPort -eq 443) { "https://$AppDomain" } else { "https://${AppDomain}:$AppPort" }
$ConvexPublicUrl     = "https://${AppDomain}:$ConvexPort"
$ConvexSitePublicUrl = "https://${AppDomain}:$ConvexSitePort"

$ConfigDir  = Join-Path $DataRoot 'config'
$DataDir    = Join-Path $DataRoot 'data'
$StorageDir = Join-Path $DataRoot 'storage'
$LogDir     = Join-Path $DataRoot 'logs'
$EnvFile    = Join-Path $ConfigDir '.env'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Act($msg)  { if ($DryRun) { Write-Host "    [dry-run] $msg" -ForegroundColor DarkGray } else { Write-Host "    $msg" } }
function Write-Warn($msg) { Write-Host "    ! $msg" -ForegroundColor Yellow }

# -----------------------------------------------------------------------------
# Preflight
# -----------------------------------------------------------------------------
Write-Step 'Preflight'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    # A dry run changes nothing, so it must be previewable without elevating —
    # otherwise the safe mode is harder to reach than the destructive one.
    if (-not $DryRun) {
        throw 'Administrator rights are required to register Windows Services. Re-run this from an elevated PowerShell.'
    }
    Write-Warn 'Not elevated — dry run only. The real install requires an elevated PowerShell.'
} else {
    Write-Act 'Running elevated: yes'
}

# Every artifact must be present before anything is registered. A half-installed
# service that points at a missing binary is worse than a clean failure.
$required = @(
    @{ Path = 'convex-local-backend.exe'; What = 'Convex backend binary' },
    @{ Path = 'node.exe';                 What = 'Node runtime' },
    @{ Path = 'server.js';                What = 'AeroGap application server bundle' },
    @{ Path = 'WinSW.exe';                What = 'service wrapper' },
    @{ Path = 'www';                      What = 'built SPA directory' },
    @{ Path = 'node_modules';             What = 'server runtime dependencies' },
    @{ Path = 'caddy.exe';                What = 'reverse proxy (terminates TLS)' }
)
$missing = @()
foreach ($item in $required) {
    $full = Join-Path $SourceDir $item.Path
    if (-not (Test-Path $full)) { $missing += "$($item.Path)  ($($item.What))" }
}
if ($missing.Count -gt 0) {
    throw "Staging directory is incomplete. Missing from '$SourceDir':`n  - " + ($missing -join "`n  - ")
}
Write-Act "Staging directory complete: $SourceDir"

# Port conflicts surface here rather than as a service that flaps on boot.
foreach ($p in @($AppPort, $ConvexPort, $ConvexSitePort, $AppInternalPort, $ConvexInternalPort, $ConvexSiteInternalPort)) {
    $inUse = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
    if ($inUse) { Write-Warn "Port $p is already in use. The service will fail to bind until that is resolved." }
}

# -----------------------------------------------------------------------------
# Instance secret — generated once, then never regenerated
# -----------------------------------------------------------------------------
Write-Step 'Instance secret'

$secretFile = Join-Path $ConfigDir 'instance-secret'
if (Test-Path $secretFile) {
    Write-Act 'Existing instance secret found — reusing it.'
    $instanceSecret = (Get-Content $secretFile -Raw).Trim()
} else {
    # Regenerating this against an existing database makes the data unreadable,
    # so it is written once and treated as part of the backup set.
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $instanceSecret = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    Write-Act 'Generated a new 32-byte instance secret.'
    Write-Warn 'Back up config\instance-secret with your database. Without it the data cannot be read.'
}

# -----------------------------------------------------------------------------
# Directory layout
# -----------------------------------------------------------------------------
Write-Step 'Directory layout'

# Start a transcript as soon as the log directory exists. The Inno installer
# runs this with `runhidden`, so without a transcript a failure surfaces only as
# "Process exit code: 1" with no indication of what went wrong.
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    try {
        Start-Transcript -Path (Join-Path $LogDir 'install-ps1.log') -Append -ErrorAction Stop | Out-Null
    } catch {
        # Transcription is a diagnostic aid, never a reason to fail the install.
        Write-Warn "Could not start transcript: $($_.Exception.Message)"
    }
}

foreach ($dir in @($InstallDir, $ConfigDir, $DataDir, $StorageDir, $LogDir)) {
    if (Test-Path $dir) {
        Write-Act "exists: $dir"
    } else {
        Write-Act "create: $dir"
        if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    }
}

if (-not $DryRun) {
    Set-Content -Path $secretFile -Value $instanceSecret -Encoding ascii -NoNewline
}

# The desktop shell runs as the logged-in USER, but config\ is restricted to
# Administrators and SYSTEM because it holds the API keys. The shell therefore
# cannot read APP_ORIGIN from there and would silently fall back to its built-in
# default of http://localhost:8080 - which nothing listens on once TLS is in
# play, so the Start Menu shortcut just reports that AeroGap is not responding.
#
# The origin is not a secret (it is in every user's address bar), so it is
# published separately in a plain file any user can read.
$urlFile = Join-Path $DataRoot 'app-url.txt'
Write-Act "publish app URL for the desktop shell: $urlFile"
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
    Set-Content -Path $urlFile -Value $AppPublicUrl -Encoding ascii -NoNewline
}

# The log directory needs the same protection as config. The Convex backend
# requires --instance-secret as a command-line argument (it does not read the
# environment), and WinSW logs every child command line - so the key to the
# whole database ends up in AeroGapConvex.wrapper.log. Left at default
# permissions that file is readable by BUILTIN\Users, which would undo the ACL
# on the service XML entirely.
Write-Act "restrict ACL on $LogDir to SYSTEM + Administrators (logs contain the instance secret)"
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $logAcl = Get-Acl $LogDir
    $logAcl.SetAccessRuleProtection($true, $false)
    foreach ($id in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
        $logAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $id, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    }
    Set-Acl -Path $LogDir -AclObject $logAcl
}

# The config directory holds the Anthropic and Clerk secrets. Break inheritance
# and grant only SYSTEM (the service identity) and Administrators.
Write-Act "restrict ACL on $ConfigDir to SYSTEM + Administrators"
if (-not $DryRun) {
    $acl = Get-Acl $ConfigDir
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($id in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
        $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $id, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    }
    Set-Acl -Path $ConfigDir -AclObject $acl
}

# -----------------------------------------------------------------------------
# Copy artifacts
# -----------------------------------------------------------------------------
Write-Step 'Copying application files'

# Stop services first: a running process holds locks on node.exe and the backend
# binary, and the copy would fail partway leaving a mixed-version install.
foreach ($svc in @('AeroGapProxy', 'AeroGapApp', 'AeroGapConvex')) {
    $existing = Get-Service -Name $svc -ErrorAction SilentlyContinue
    if ($existing -and $existing.Status -ne 'Stopped') {
        Write-Act "stop service $svc (in-place upgrade)"
        if (-not $DryRun) { Stop-Service -Name $svc -Force; (Get-Service $svc).WaitForStatus('Stopped', '00:00:60') }
    }
}

# When the Inno installer drives this, it has already extracted everything to
# {app} and passes the same path as both -SourceDir and -InstallDir. Copying a
# directory onto itself fails, which is how the first real install died with a
# bare "Process exit code: 1".
# GetFullPath, not Resolve-Path: Resolve-Path throws when the target does not
# exist yet, which is the normal state during a dry run and on a fresh install
# before the layout step has run. Normalising the string is all that is needed
# to compare the two paths.
$sourceResolved = [System.IO.Path]::GetFullPath($SourceDir).TrimEnd('\')
$installResolved = [System.IO.Path]::GetFullPath($InstallDir).TrimEnd('\')

if ($sourceResolved -eq $installResolved) {
    Write-Act 'files already in place (installer-driven) - skipping copy'
} else {
    Write-Act "copy $SourceDir\* -> $InstallDir"
    if (-not $DryRun) {
        Copy-Item -Path (Join-Path $SourceDir '*') -Destination $InstallDir -Recurse -Force
    }
}

# -----------------------------------------------------------------------------
# Service definitions
# -----------------------------------------------------------------------------
Write-Step 'TLS'

# Caddy needs either a certificate pair or permission to mint its own.
if ($CertPath -and $CertKeyPath) {
    foreach ($f in @($CertPath, $CertKeyPath)) {
        if (-not (Test-Path $f)) { throw "Certificate file not found: $f" }
    }
    # Copied into config\ so the proxy does not depend on a path outside the
    # install that an operator may later move or delete.
    $certDir = Join-Path $ConfigDir 'certs'
    $destCert = Join-Path $certDir 'aerogap.crt'
    $destKey  = Join-Path $certDir 'aerogap.key'
    Write-Act "using supplied certificate for $AppDomain"
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force $certDir | Out-Null
        Copy-Item $CertPath $destCert -Force
        Copy-Item $CertKeyPath $destKey -Force
    }
    # Caddyfile paths use forward slashes to avoid backslash escaping.
    # -replace takes a REGEX, so a literal backslash must be escaped as '\\'.
    $tlsDirective = 'tls "' + ($destCert -replace '\\', '/') + '" "' + ($destKey -replace '\\', '/') + '"'
} else {
    $tlsDirective = 'tls internal'
    Write-Act "no certificate supplied - using Caddy's internal CA"
    Write-Warn 'Browsers will not trust this until that CA is distributed to clients. Fine for a pilot, not for rollout.'
    Write-Warn "The CA lives at $DataRoot\caddy\caddy\pki\authorities\local\root.crt after first start."
}

Write-Step 'Generating service definitions'

$templateDir = Join-Path $PSScriptRoot 'services'
$tokens = @{
    '{{INSTALL_DIR}}'     = $InstallDir
    '{{DATA_DIR}}'        = $DataDir
    '{{STORAGE_DIR}}'     = $StorageDir
    '{{LOG_DIR}}'         = $LogDir
    '{{CONFIG_DIR}}'      = $ConfigDir
    '{{INSTANCE_NAME}}'   = $InstanceName
    '{{INSTANCE_SECRET}}' = $instanceSecret
    '{{DATA_ROOT}}'                 = $DataRoot
    '{{APP_DOMAIN}}'                = $AppDomain
    '{{APP_INTERNAL_PORT}}'         = "$AppInternalPort"
    '{{CONVEX_INTERNAL_PORT}}'      = "$ConvexInternalPort"
    '{{CONVEX_SITE_INTERNAL_PORT}}' = "$ConvexSiteInternalPort"
    '{{CONVEX_PUBLIC_URL}}'         = $ConvexPublicUrl
    '{{CONVEX_SITE_PUBLIC_URL}}'    = $ConvexSitePublicUrl
    '{{TLS_DIRECTIVE}}'             = $tlsDirective
}

$services = @(
    @{ Id = 'AeroGapConvex'; Template = 'aerogap-convex.xml' },
    @{ Id = 'AeroGapApp';    Template = 'aerogap-app.xml' },
    @{ Id = 'AeroGapProxy';  Template = 'aerogap-proxy.xml' }
)

foreach ($svc in $services) {
    $src = Join-Path $templateDir $svc.Template
    if (-not (Test-Path $src)) { throw "Missing service template: $src" }

    $xml = Get-Content $src -Raw
    foreach ($k in $tokens.Keys) { $xml = $xml.Replace($k, $tokens[$k]) }

    $leftover = [regex]::Matches($xml, '\{\{[A-Z_]+\}\}')
    if ($leftover.Count -gt 0) {
        # Built outside the string on purpose: a script block inside a $()
        # subexpression inside a double-quoted string is a parse error on
        # Windows PowerShell 5.1, which is what ships on Server 2016/2019.
        $names = ($leftover | ForEach-Object { $_.Value }) -join ', '
        throw "Template $($svc.Template) has unsubstituted tokens: $names"
    }

    # WinSW pairs each service with a same-named copy of its executable.
    $exe = Join-Path $InstallDir "$($svc.Id).exe"
    $cfg = Join-Path $InstallDir "$($svc.Id).xml"
    Write-Act "write $cfg"
    Write-Act "write $exe (WinSW wrapper)"
    if (-not $DryRun) {
        Set-Content -Path $cfg -Value $xml -Encoding utf8
        Copy-Item -Path (Join-Path $InstallDir 'WinSW.exe') -Destination $exe -Force
    }
}

# The proxy config is generated from the same token set, so ports and hostnames
# cannot drift between the services and the proxy that fronts them.
$caddySrc = Join-Path $templateDir 'Caddyfile.template'
if (-not (Test-Path $caddySrc)) { throw "Missing $caddySrc" }
$caddyConf = Get-Content $caddySrc -Raw
foreach ($k in $tokens.Keys) { $caddyConf = $caddyConf.Replace($k, $tokens[$k]) }
$leftoverCaddy = [regex]::Matches($caddyConf, '\{\{[A-Z_]+\}\}')
if ($leftoverCaddy.Count -gt 0) {
    $names = ($leftoverCaddy | ForEach-Object { $_.Value }) -join ', '
    throw "Caddyfile.template has unsubstituted tokens: $names"
}
$caddyDest = Join-Path $ConfigDir 'Caddyfile'
Write-Act "write $caddyDest"
if (-not $DryRun) { Set-Content -Path $caddyDest -Value $caddyConf -Encoding utf8 }

# The generated Convex XML embeds the instance secret in a Program Files file.
Write-Act 'restrict ACL on AeroGapConvex.xml (contains the instance secret)'
if (-not $DryRun) {
    $cfg = Join-Path $InstallDir 'AeroGapConvex.xml'
    $acl = Get-Acl $cfg
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($id in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
        $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $id, 'FullControl', 'None', 'None', 'Allow')))
    }
    Set-Acl -Path $cfg -AclObject $acl
}

# -----------------------------------------------------------------------------
# Register services
# -----------------------------------------------------------------------------
Write-Step 'Registering services'

foreach ($svc in $services) {
    $exe = Join-Path $InstallDir "$($svc.Id).exe"
    $existing = Get-Service -Name $svc.Id -ErrorAction SilentlyContinue
    if ($existing) {
        # WinSW v2 has NO 'refresh' command - it exists only in v3. Calling it
        # threw a fatal "Unknown command", so an upgrade left the old service
        # registration in place while the XML beside it had changed, and the
        # service then failed to start at all. Re-register instead.
        Write-Act "$($svc.Id) already registered — re-registering (WinSW v2 has no 'refresh')"
        if (-not $DryRun) {
            & $exe uninstall
            # The SCM releases a service name asynchronously; installing again
            # too quickly fails with "marked for deletion".
            Start-Sleep -Seconds 3
            & $exe install
        }
    } else {
        Write-Act "install service $($svc.Id)"
        if (-not $DryRun) { & $exe install }
    }
}

# -----------------------------------------------------------------------------
# Firewall
# -----------------------------------------------------------------------------
Write-Step 'Firewall rules'

$rules = @(
    @{ Name = 'AeroGap Application (HTTPS)'; Port = $AppPort },
    @{ Name = 'AeroGap Convex';      Port = $ConvexPort },
    @{ Name = 'AeroGap Convex Site'; Port = $ConvexSitePort }
)
foreach ($rule in $rules) {
    Write-Act "allow inbound TCP $($rule.Port) — $($rule.Name)"
    if (-not $DryRun) {
        Remove-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $rule.Port -Profile Domain, Private | Out-Null
    }
}
Write-Warn 'Rules are scoped to Domain and Private profiles only — not Public.'

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
Write-Step 'Summary'

if ($DryRun) {
    Write-Host "`n  Dry run complete. Nothing was changed.`n" -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $EnvFile)) {
    Write-Warn "No configuration file yet at $EnvFile"
    Write-Host @"

  Services are registered but NOT started, because configuration is missing.

  Next:
    1. Copy selfhost\.env.example to $EnvFile and fill it in.
       (No AI provider keys are needed - those are added in the app after
       sign-in, under Settings > AI Keys.)
    2. Validate it:   node scripts\doctor.mjs
    3. Re-run this installer so it can generate AI_CREDENTIAL_SERVICE_TOKEN,
       or add one yourself; the app service will not start without it.
    4. Start:         Start-Service AeroGapConvex; Start-Service AeroGapApp
    5. Bootstrap:     node scripts\bootstrap.mjs

"@ -ForegroundColor Yellow
    exit 0
}

# -----------------------------------------------------------------------------
# Server-to-server credential token
# -----------------------------------------------------------------------------
# The app tier cannot call Convex internal functions, so it fetches a company's
# AI provider key over a service-token-gated HTTP route. The SAME value has to
# exist in the app environment (this file) and in the Convex deployment, where
# bootstrap.mjs pushes it from here.
#
# Generated here rather than by the Inno installer or by bootstrap.mjs: Inno has
# no cryptographic RNG, and requireConfig() refuses to boot without this - so it
# must exist before the services start, which is several steps before an
# operator runs bootstrap.
Write-Step 'Credential service token'

$envText = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue
if ($envText -match '(?m)^\s*AI_CREDENTIAL_SERVICE_TOKEN\s*=\s*\S') {
    Write-Act 'Existing AI_CREDENTIAL_SERVICE_TOKEN found - reusing it.'
} else {
    $tokenBytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($tokenBytes)
    # base64url: no '+', '/' or '=' to be mangled by .env parsing or a shell.
    $token = [Convert]::ToBase64String($tokenBytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')

    # AppendAllText with an explicit no-BOM encoding: Add-Content -Encoding utf8
    # can emit a BOM, and a BOM in the middle of the file would break parsing.
    $line = "`r`nAI_CREDENTIAL_SERVICE_TOKEN=$token`r`n"
    [System.IO.File]::AppendAllText($EnvFile, $line, (New-Object System.Text.UTF8Encoding($false)))

    # Deliberately not echoed: this file is ACL'd, the console scrollback is not.
    Write-Act 'Generated a new AI_CREDENTIAL_SERVICE_TOKEN (32 bytes).'
}

if ($envText -notmatch '(?m)^\s*AI_CREDENTIAL_ENCRYPTION_KEY\s*=\s*\S') {
    $encBytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($encBytes)
    $encKey = [Convert]::ToBase64String($encBytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
    $encLine = "`r`nAI_CREDENTIAL_ENCRYPTION_KEY=$encKey`r`n"
    [System.IO.File]::AppendAllText($EnvFile, $encLine, (New-Object System.Text.UTF8Encoding($false)))
    Write-Act 'Generated a new AI_CREDENTIAL_ENCRYPTION_KEY (32 bytes).'
}

if ($envText -notmatch '(?m)^\s*AEROGAP_INSTALL_DIR\s*=\s*\S') {
    $installLine = "`r`nAEROGAP_INSTALL_DIR=$InstallDir`r`n"
    [System.IO.File]::AppendAllText($EnvFile, $installLine, (New-Object System.Text.UTF8Encoding($false)))
    Write-Act "Recorded AEROGAP_INSTALL_DIR=$InstallDir"
}

Write-Host "`n  Installed. Starting services...`n" -ForegroundColor Green

# Dependency order: the database first, then the app that queries it, then the
# proxy that fronts both. AeroGapProxy was previously registered but never
# started here, so a fresh install left nothing listening on 443 until the
# machine was next rebooted - the services were all "Automatic" and looked
# correctly configured, which made it easy to miss.
$startOrder = @('AeroGapConvex', 'AeroGapApp', 'AeroGapProxy')
$failed = @()

foreach ($id in $startOrder) {
    try {
        # Not fatal: one service failing to start should still leave the others
        # running and the reason visible, rather than aborting the install with
        # a single opaque exit code.
        Start-Service -Name $id -ErrorAction Stop
        Write-Act "started $id"
    } catch {
        $failed += $id
        Write-Warn "$id did not start: $($_.Exception.Message)"
    }
}

Get-Service $startOrder -ErrorAction SilentlyContinue | Format-Table -AutoSize

if ($failed.Count -gt 0) {
    Write-Warn "These services are not running: $($failed -join ', ')"
    Write-Warn "Their reason is in $LogDir (readable by Administrators only)."
}

# Bootstrap is still a manual step, and AI keys are now added in the app rather
# than collected by the installer - so an operator who is not told this ends up
# with a working sign-in and every AI feature failing, which reads as a bug.
Write-Host @"

  Next steps
  ----------
  1. Bootstrap the Convex backend (pushes config and deploys the schema):
         node "$InstallDir\bootstrap.mjs"

     This runs entirely offline: it deploys the function source staged in
     $InstallDir\convex-src using the bundled Convex CLI. No npm registry
     access is needed.

  2. Open $AppPublicUrl and sign in. The first account lands in
     "pending" - approve it out of band:
         npx convex run users:promoteToAdmin '{\"email\":\"you@example.com\"}'

  3. Signed in as an administrator, open Settings > AI Keys and add your
     Anthropic key (and a Voyage key for document search).

     AI provider keys are NOT stored on this machine's config file: they live in
     the database, per company, so they can be rotated from the app without an
     elevated shell here.

     No Clerk keys are collected any more - that configuration is compiled into
     the build (build-config.json). To point this site at a different Clerk
     instance, add CLERK_JWT_ISSUER_DOMAIN, CLERK_JWT_KEY and
     VITE_CLERK_PUBLISHABLE_KEY to $EnvFile; values there override the build.

"@ -ForegroundColor Cyan

try { Stop-Transcript | Out-Null } catch { }
