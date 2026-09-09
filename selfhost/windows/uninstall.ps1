<#
.SYNOPSIS
    Removes the AeroGap Windows Services, firewall rules, and program files.

.DESCRIPTION
    Customer data under C:\ProgramData\AeroGap is NOT removed. That directory
    holds the database, uploaded documents, and the instance secret - a routine
    uninstall (or an installer-driven upgrade that uninstalls first) must never
    destroy a maintenance-records archive.

    Removing the data is a separate, explicit -RemoveData flag with its own
    typed confirmation.

    ASCII-only on purpose - see the encoding note in build-staging.ps1.

.PARAMETER RemoveData
    Also delete C:\ProgramData\AeroGap. Irreversible. Requires typing the
    confirmation phrase unless -Force is given.

.EXAMPLE
    .\uninstall.ps1 -DryRun
    .\uninstall.ps1
#>
[CmdletBinding()]
param(
    [string] $InstallDir = "$env:ProgramFiles\AeroGap",
    [string] $DataRoot = "$env:ProgramData\AeroGap",
    [switch] $RemoveData,
    [switch] $Force,
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
    if (-not $DryRun) { throw 'Administrator rights are required. Re-run from an elevated PowerShell.' }
    Write-Warn 'Not elevated - dry run only.'
}

# Proxy first: it is the front door, so stopping it drains inbound traffic
# before the backends disappear. App before Convex: the app depends on it.
#
# This MUST list every service install.ps1 registers. A service omitted here
# survives the uninstall, keeps its binary locked (so $InstallDir cannot be
# removed), and goes on serving its ports. AeroGapProxy was missing, which
# left an orphaned Caddy holding 443/3210/3211 and answering 502 after every
# uninstall. installServiceSymmetry.test.ts pins this against install.ps1.
$services = @('AeroGapProxy', 'AeroGapApp', 'AeroGapConvex')

# -----------------------------------------------------------------------------
# Services
# -----------------------------------------------------------------------------
Write-Step 'Stopping and removing services'

foreach ($id in $services) {
    $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
    if (-not $svc) { Write-Act "$id not installed - skipping"; continue }

    if ($svc.Status -ne 'Stopped') {
        Write-Act "stop $id"
        if (-not $DryRun) {
            Stop-Service -Name $id -Force
            (Get-Service $id).WaitForStatus('Stopped', '00:01:00')
        }
    }

    $exe = Join-Path $InstallDir "$id.exe"
    Write-Act "uninstall service $id"
    if (-not $DryRun) {
        if (Test-Path $exe) {
            # Preferred: let WinSW deregister itself, so it also cleans up the
            # event-log source it registered.
            & $exe uninstall | Out-Null
        } else {
            Write-Warn "$exe missing - falling back to sc.exe delete"
            & sc.exe delete $id | Out-Null
        }
    }
}

# WinSW returns before the SCM has finished releasing the service entry; a
# reinstall started immediately afterwards fails with "marked for deletion".
if (-not $DryRun) { Start-Sleep -Seconds 2 }

# -----------------------------------------------------------------------------
# Firewall
# -----------------------------------------------------------------------------
Write-Step 'Removing firewall rules'

# Names must match install.ps1's $rules exactly or the rule is never removed.
foreach ($name in @('AeroGap Application (HTTPS)', 'AeroGap Convex', 'AeroGap Convex Site')) {
    $rule = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
    if ($rule) {
        Write-Act "remove rule '$name'"
        if (-not $DryRun) { Remove-NetFirewallRule -DisplayName $name }
    } else {
        Write-Act "rule '$name' not present - skipping"
    }
}

# -----------------------------------------------------------------------------
# Program files
# -----------------------------------------------------------------------------
Write-Step 'Removing program files'

if (Test-Path $InstallDir) {
    Write-Act "delete $InstallDir"
    if (-not $DryRun) {
        try {
            Remove-Item $InstallDir -Recurse -Force
        } catch {
            # Usually a still-running process holding node.exe or the backend.
            Write-Warn "Could not fully remove $InstallDir : $($_.Exception.Message)"
            Write-Warn 'Reboot and delete it manually if files remain.'
        }
    }
} else {
    Write-Act "$InstallDir not present - skipping"
}

# -----------------------------------------------------------------------------
# Customer data - preserved unless explicitly requested
# -----------------------------------------------------------------------------
Write-Step 'Customer data'

if (-not (Test-Path $DataRoot)) {
    Write-Act "$DataRoot not present - nothing to consider"
} elseif (-not $RemoveData) {
    $sizeMb = [math]::Round((Get-ChildItem $DataRoot -Recurse -File -ErrorAction SilentlyContinue |
                Measure-Object -Property Length -Sum).Sum / 1MB, 1)
    Write-Host "    PRESERVED: $DataRoot ($sizeMb MB)" -ForegroundColor Green
    Write-Host "    Contains the database, uploaded documents, and the instance secret." -ForegroundColor DarkGray
    Write-Host "    Re-run with -RemoveData to delete it." -ForegroundColor DarkGray
} else {
    Write-Warn "About to permanently delete $DataRoot"
    Write-Warn 'This includes maintenance records, uploaded manuals, and the instance secret.'
    Write-Warn 'Without the instance secret, any backup of this database is unreadable.'

    $confirmed = $Force
    if (-not $confirmed -and -not $DryRun) {
        # Typed phrase, not y/N: this destroys regulated records, and a reflexive
        # keystroke should not be enough.
        $answer = Read-Host "    Type DELETE ALL DATA to confirm"
        $confirmed = ($answer -ceq 'DELETE ALL DATA')
        if (-not $confirmed) { Write-Host "    Aborted. Data left intact." -ForegroundColor Green }
    }

    if ($confirmed) {
        Write-Act "delete $DataRoot"
        if (-not $DryRun) { Remove-Item $DataRoot -Recurse -Force }
    }
}

Write-Step 'Done'
if ($DryRun) { Write-Host "`n  Dry run complete. Nothing was changed.`n" -ForegroundColor Green }
else { Write-Host "`n  AeroGap uninstalled.`n" -ForegroundColor Green }
