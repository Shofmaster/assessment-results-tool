<#
.SYNOPSIS
    Updates keys in an installed AeroGap configuration, then restarts services.

.DESCRIPTION
    The config file lives under ProgramData and is ACL'd to Administrators and
    SYSTEM, so it cannot be edited casually - which is correct, and also means
    changing a key needs a deliberate elevated action. This is that action.

    Only the keys you name are touched; everything else in the file is left
    exactly as it was. The previous file is copied aside first, because a typo
    in a key that fails closed leaves the application refusing to start.

    Values can come from the command line or from a source .env file, so
    credentials need not be pasted into a shell and end up in history.

    ASCII-only - see the encoding note in build-staging.ps1.

.PARAMETER FromFile
    Read values from this .env-format file. Only keys named in -Keys are taken.

.PARAMETER Keys
    Which keys to update. Defaults to the ones that commonly differ between a
    test install and a real one.

    NOTE: AI provider keys are NOT normally set here any more. They are supplied
    per company in the app under Settings > AI Keys and stored in Convex, which
    is also the only way to rotate them without an elevated shell on this
    machine. This script only edits the .env file - it cannot reach Convex - so
    setting ANTHROPIC_API_KEY here changes the deployment-wide FALLBACK used by
    companies that have no key of their own.

.EXAMPLE
    # Rotate the Clerk secret from a source env file
    .\set-config.ps1 -FromFile C:\secure\clerk.env -Keys CLERK_SECRET_KEY

.EXAMPLE
    # Set one value directly
    .\set-config.ps1 -Set @{ EMBEDDING_PROVIDER = 'openai' }
#>
[CmdletBinding()]
param(
    [string] $FromFile = '',
    [string[]] $Keys = @('CLERK_SECRET_KEY', 'CLERK_JWT_ISSUER_DOMAIN',
                         'VITE_CLERK_PUBLISHABLE_KEY'),
    [hashtable] $Set = @{},
    [string] $ConfigFile = "$env:ProgramData\AeroGap\config\.env",
    [switch] $NoRestart,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Act($m)  { if ($DryRun) { Write-Host "    [dry-run] $m" -ForegroundColor DarkGray } else { Write-Host "    $m" } }
function Write-Warn($m) { Write-Host "    ! $m" -ForegroundColor Yellow }

Write-Step 'Preflight'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw 'Administrator rights are required: the configuration directory is restricted to Administrators and SYSTEM.'
}
if (-not (Test-Path $ConfigFile)) {
    throw "No configuration at $ConfigFile. Is AeroGap installed?"
}
Write-Act "config: $ConfigFile"

# -----------------------------------------------------------------------------
# Gather the new values
# -----------------------------------------------------------------------------
Write-Step 'Collecting values'

$updates = @{}

if ($FromFile) {
    if (-not (Test-Path $FromFile)) { throw "Source file not found: $FromFile" }
    foreach ($line in (Get-Content $FromFile)) {
        if ($line -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            if (($Keys -contains $name) -and $value) { $updates[$name] = $value }
        }
    }
    Write-Act "read $($updates.Count) of $($Keys.Count) requested keys from $FromFile"

    $absent = $Keys | Where-Object { -not $updates.ContainsKey($_) }
    if ($absent) {
        # Named explicitly rather than silently skipped: a key that is missing
        # here is one the application will fail closed on later.
        Write-Warn "Not present in the source file: $($absent -join ', ')"
    }
}

foreach ($k in $Set.Keys) { $updates[$k] = $Set[$k] }

if ($updates.Count -eq 0) { throw 'Nothing to update. Pass -FromFile with matching keys, or -Set.' }

# -----------------------------------------------------------------------------
# Apply
# -----------------------------------------------------------------------------
Write-Step 'Updating configuration'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$ConfigFile.bak-$stamp"
Write-Act "backup existing config to $(Split-Path $backup -Leaf)"
if (-not $DryRun) { Copy-Item $ConfigFile $backup -Force }

$lines = [System.Collections.Generic.List[string]](Get-Content $ConfigFile)
foreach ($name in ($updates.Keys | Sort-Object)) {
    $value = $updates[$name]
    # Never echo the value itself; a config change is often done over a shared
    # screen, and these are live credentials.
    $shown = if ($value.Length -gt 10) { "$($value.Substring(0,6))... ($($value.Length) chars)" } else { $value }

    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*$([regex]::Escape($name))\s*=") {
            $lines[$i] = "$name=$value"
            $found = $true
            break
        }
    }
    if (-not $found) { $lines.Add("$name=$value") }
    Write-Act "$name = $shown$(if (-not $found) { '  (added)' })"
}

if (-not $DryRun) {
    Set-Content -Path $ConfigFile -Value $lines -Encoding utf8
}

# -----------------------------------------------------------------------------
# Restart so the change takes effect
# -----------------------------------------------------------------------------
if ($NoRestart) {
    Write-Step 'Skipping restart (-NoRestart)'
    Write-Warn 'The running services are still using the previous configuration.'
} else {
    Write-Step 'Restarting services'
    # App and Convex read config at startup; the proxy does not, but restarting
    # in dependency order keeps the sequence predictable.
    foreach ($id in @('AeroGapApp', 'AeroGapConvex')) {
        Write-Act "stop $id"
        if (-not $DryRun) { Stop-Service $id -Force -ErrorAction SilentlyContinue }
    }
    foreach ($id in @('AeroGapConvex', 'AeroGapApp')) {
        Write-Act "start $id"
        if (-not $DryRun) {
            try { Start-Service $id -ErrorAction Stop }
            catch { Write-Warn "$id did not start: $($_.Exception.Message)" }
        }
    }
    if (-not $DryRun) {
        Get-Service AeroGapApp, AeroGapConvex, AeroGapProxy -ErrorAction SilentlyContinue |
            Format-Table Name, Status -AutoSize | Out-String | Write-Host
    }
}

Write-Step 'Done'
if ($DryRun) {
    Write-Host "`n  Dry run complete. Nothing was changed.`n" -ForegroundColor Green
} else {
    Write-Host "`n  Configuration updated. Previous file kept as $(Split-Path $backup -Leaf).`n" -ForegroundColor Green
    Write-Host "  If a service failed to start, the reason is in $(Split-Path $ConfigFile -Parent | Split-Path -Parent)\logs\`n" -ForegroundColor DarkGray
}
