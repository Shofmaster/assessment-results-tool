<#
.SYNOPSIS
    Stage the desktop payload and compile AeroGapSetup-Desktop-<version>.exe.

.DESCRIPTION
    Runs build-staging.ps1 -Mode desktop, then ISCC with AppVersion taken from
    selfhost\package.json (or -AppVersion). Forwards Clerk / hosted / update
    parameters to staging so one command produces a complete installer.

.EXAMPLE
    .\build-desktop.ps1 -OutDir C:\aerogap-build
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
Write-Host "Compiling $iss with StagingDir=$OutDir AppVersion=$AppVersion"
& $iscc "/DStagingDir=$OutDir" "/DAppVersion=$AppVersion" $iss
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "ISCC failed with exit $LASTEXITCODE" }

$setup = Join-Path $here "Output\AeroGapSetup-Desktop-$AppVersion.exe"
if (-not (Test-Path $setup)) {
    Write-Warning "Expected installer not found at $setup (check Output\)."
} else {
    Write-Host "Installer: $setup"
}
