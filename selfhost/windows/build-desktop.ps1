<#
.SYNOPSIS
    Stage the desktop payload and compile AeroGapSetup-Desktop-<version>.exe.

.DESCRIPTION
    Runs build-staging.ps1 -Mode desktop, then ISCC with AppVersion taken from
    selfhost\package.json (or -AppVersion). Forwards Clerk / hosted / update
    parameters to staging so one command produces a complete installer.

    Inno writes the setup to windows\Output, which a later compile of the same
    version replaces. Before and after ISCC this script copies every
    AeroGapSetup-Desktop-<version>.exe into -InstallerArchiveDir (default
    windows\installer-archive). That directory is not cleaned here, and the
    archiver never overwrites an archived exe whose bytes differ. See
    docs\DESKTOP-ROLLBACK.md for how to reinstall an older setup.

.EXAMPLE
    .\build-desktop.ps1 -OutDir C:\aerogap-build
#>
[CmdletBinding()]
param(
    [string] $OutDir = 'C:\aerogap-build',
    [string] $AppVersion = '',
    [string] $InstallerArchiveDir = '',
    [string] $ClerkIssuerDomain = '',
    [string] $ClerkJwtKey = '',
    [string] $ClerkJwtKeyFile = '',
    [string] $ClerkPublishableKey = '',
    [string] $HostedAppUrl = '',
    [string] $HostedConvexUrl = '',
    [string] $UpdateFeedUrl = '',
    [string] $UpdatePublicKeyFile = '',
    [string] $SignCommand = '',
    [string] $IsccPath = ''
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$selfhostRoot = Split-Path $here -Parent

if (-not $AppVersion) {
    $pkg = Get-Content (Join-Path $selfhostRoot 'package.json') -Raw | ConvertFrom-Json
    $AppVersion = [string]$pkg.version
}
if (-not $AppVersion) { throw 'Could not resolve AppVersion from selfhost\package.json' }

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

$iss = Join-Path $here 'aerogap-desktop.iss'
$outputDir = Join-Path $here 'Output'
if (-not $InstallerArchiveDir) { $InstallerArchiveDir = Join-Path $here 'installer-archive' }
$archiveScript = Join-Path $here 'archive-desktop-installer.mjs'

function Invoke-InstallerArchive([string] $Label) {
    # Retain whatever is already in Output before ISCC replaces a same-version
    # filename, then retain the exe the compile just wrote. The script itself
    # refuses to delete or overwrite a different archived copy.
    Write-Host "Archiving desktop installers ($Label) -> $InstallerArchiveDir"
    & node $archiveScript --output-dir $outputDir --archive-dir $InstallerArchiveDir
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "archive-desktop-installer.mjs failed ($Label) with exit $LASTEXITCODE"
    }
}

Invoke-InstallerArchive 'before compile'

Write-Host "Compiling $iss with StagingDir=$OutDir AppVersion=$AppVersion"
& $iscc "/DStagingDir=$OutDir" "/DAppVersion=$AppVersion" $iss
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "ISCC failed with exit $LASTEXITCODE" }

$setup = Join-Path $outputDir "AeroGapSetup-Desktop-$AppVersion.exe"
if (-not (Test-Path $setup)) {
    Write-Warning "Expected installer not found at $setup (check Output\)."
} else {
    Write-Host "Installer: $setup"
}

Invoke-InstallerArchive 'after compile'
Write-Host "Rollback copies are in $InstallerArchiveDir (not cleared by the next build)."
Write-Host "Reinstall an older release by running its AeroGapSetup-Desktop-<version>.exe. See docs\DESKTOP-ROLLBACK.md."
