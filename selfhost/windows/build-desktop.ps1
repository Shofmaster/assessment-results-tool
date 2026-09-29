<#
.SYNOPSIS
    Stage the desktop payload and compile AeroGapSetup-Desktop-<version>.exe.

.DESCRIPTION
    Runs build-staging.ps1 -Mode desktop, then ISCC with AppVersion taken from
    selfhost\package.json (or -AppVersion). Forwards Clerk / hosted / update
    parameters to staging so one command produces a complete installer.

    The installer is compiled into the versioned release archive, not into
    windows\Output. Output is only a copy of the exe from this compile.
    Previous versions stay in the archive. See docs\DESKTOP-ROLLBACK.md.

.EXAMPLE
    .\build-desktop.ps1 -OutDir C:\aerogap-build

.EXAMPLE
    .\build-desktop.ps1 -ReleaseArchive D:\AeroGapReleases
#>
[CmdletBinding()]
param(
    [string] $OutDir = 'C:\aerogap-build',
    [string] $AppVersion = '',
    [string] $ClerkIssuerDomain = '',
    [string] $ClerkJwtKey = '',
    [string] $ClerkJwtKeyFile = '',
    [string] $ClerkPublishableKey = '',
    [string] $HostedAppUrl = '',
    [string] $HostedConvexUrl = '',
    [string] $UpdateFeedUrl = '',
    [string] $UpdatePublicKeyFile = '',
    [string] $SignCommand = '',
    [string] $IsccPath = '',
    <#
    Directory that retains every AeroGapSetup-Desktop-<version>.exe.
    Default: %LOCALAPPDATA%\AeroGapBuildCache\desktop-releases.
    Must not be inside windows\Output. That folder is only the latest compile
    and is not the rollback store.
    #>
    [string] $ReleaseArchive = ''
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$selfhostRoot = Split-Path $here -Parent

if (-not $AppVersion) {
    $pkg = Get-Content (Join-Path $selfhostRoot 'package.json') -Raw | ConvertFrom-Json
    $AppVersion = [string]$pkg.version
}
if (-not $AppVersion) { throw 'Could not resolve AppVersion from selfhost\package.json' }
# Version becomes a path segment under the archive. x.y.z cannot escape it.
if ($AppVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "AppVersion '$AppVersion' must be x.y.z so the release archive cannot be pointed outside its root."
}

function Normalize-Dir([string] $Path) {
    return ([IO.Path]::GetFullPath($Path)).TrimEnd('\')
}

if (-not $ReleaseArchive) {
    if (-not $env:LOCALAPPDATA) {
        throw 'LOCALAPPDATA is not set. Pass -ReleaseArchive <directory outside windows\Output>.'
    }
    $ReleaseArchive = Join-Path $env:LOCALAPPDATA 'AeroGapBuildCache\desktop-releases'
}

$outputDrop = Join-Path $here 'Output'
$archiveFull = Normalize-Dir $ReleaseArchive
$outputFull = Normalize-Dir $outputDrop
# Child check, not a raw prefix: "...\Output-extra" is not inside "...\Output".
if ($archiveFull.Equals($outputFull, [StringComparison]::OrdinalIgnoreCase) -or
    $archiveFull.StartsWith($outputFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "ReleaseArchive ($ReleaseArchive) is inside windows\Output, which is not retained. Pass a directory outside that folder."
}

$stagingArgs = @{
    OutDir = $OutDir
    Mode = 'desktop'
    AppVersion = $AppVersion
}
if ($ClerkIssuerDomain) { $stagingArgs.ClerkIssuerDomain = $ClerkIssuerDomain }
if ($ClerkJwtKey) { $stagingArgs.ClerkJwtKey = $ClerkJwtKey }
if ($ClerkJwtKeyFile) { $stagingArgs.ClerkJwtKeyFile = $ClerkJwtKeyFile }
if ($ClerkPublishableKey) { $stagingArgs.ClerkPublishableKey = $ClerkPublishableKey }
if ($HostedAppUrl) { $stagingArgs.HostedAppUrl = $HostedAppUrl }
if ($HostedConvexUrl) { $stagingArgs.HostedConvexUrl = $HostedConvexUrl }
if ($UpdateFeedUrl) { $stagingArgs.UpdateFeedUrl = $UpdateFeedUrl }
if ($UpdatePublicKeyFile) { $stagingArgs.UpdatePublicKeyFile = $UpdatePublicKeyFile }
if ($SignCommand) { $stagingArgs.SignCommand = $SignCommand }

& (Join-Path $here 'build-staging.ps1') @stagingArgs
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "build-staging.ps1 failed with exit $LASTEXITCODE" }

$iscc = $IsccPath
if (-not $iscc) {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { $iscc = $c; break }
    }
    if (-not $iscc) {
        $cmd = Get-Command iscc -ErrorAction SilentlyContinue
        if ($cmd) { $iscc = $cmd.Source }
    }
}
if (-not $iscc) {
    throw 'ISCC.exe not found. Install Inno Setup 6 or pass -IsccPath.'
}

# One directory per version. ISCC writes the setup exe here and does not
# remove sibling version directories. Never delete $ReleaseArchive.
$versionDir = Join-Path $ReleaseArchive $AppVersion
New-Item -ItemType Directory -Force -Path $versionDir | Out-Null

$iss = Join-Path $here 'aerogap-desktop.iss'
Write-Host "Compiling $iss with StagingDir=$OutDir AppVersion=$AppVersion OutputDir=$versionDir"
& $iscc "/DStagingDir=$OutDir" "/DAppVersion=$AppVersion" "/O$versionDir" $iss
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "ISCC failed with exit $LASTEXITCODE" }

$setup = Join-Path $versionDir "AeroGapSetup-Desktop-$AppVersion.exe"
if (-not (Test-Path -LiteralPath $setup)) {
    throw "Expected installer not found at $setup"
}

$recorder = Join-Path $here 'desktopReleaseArchive.cjs'
& node $recorder publish --archive $ReleaseArchive --installer $setup --version $AppVersion
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "desktop release archive failed with exit $LASTEXITCODE" }

# Latest compile only, as a real copy. A hard link would let an in-place
# rewrite of the Output file truncate the archived bytes.
New-Item -ItemType Directory -Force -Path $outputDrop | Out-Null
$latestExe = Join-Path $outputDrop "AeroGapSetup-Desktop-$AppVersion.exe"
Copy-Item -LiteralPath $setup -Destination $latestExe -Force

$rollbackNote = @"
AeroGap desktop installers are retained in:
  $ReleaseArchive

windows\Output holds only the installer from the latest compile
(AeroGapSetup-Desktop-$AppVersion.exe). Older versions stay in the archive.
Cleaning this folder does not remove them. Rebuilding one version replaces
only that version's exe.

To roll back a machine, quit AeroGap and run:
  $ReleaseArchive\<version>\AeroGapSetup-Desktop-<version>.exe

User data in %LOCALAPPDATA%\AeroGap is kept.
Help > Check for updates will not install an older build.
See selfhost\docs\DESKTOP-ROLLBACK.md.
"@
Set-Content -LiteralPath (Join-Path $outputDrop 'ROLLBACK.txt') -Value $rollbackNote -Encoding utf8

Write-Host "Installer (archived): $setup"
Write-Host "Installer (latest copy): $latestExe"
Write-Host "Rollback: reinstall AeroGapSetup-Desktop-<version>.exe from $ReleaseArchive"
& node $recorder list --archive $ReleaseArchive
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "desktop release archive list failed with exit $LASTEXITCODE" }
