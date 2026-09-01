<#
.SYNOPSIS
    Restores a self-hosted AeroGap install from a backup archive.

.DESCRIPTION
    Replaces config, database and uploaded files with the contents of an archive
    produced by backup.ps1.

    THIS OVERWRITES THE CURRENT DATA. The existing data directory is moved aside
    first (not deleted), so a restore onto the wrong machine is recoverable.

    A restore only makes sense against a matching instance name: the Convex
    backend derives its database name from CONVEX_INSTANCE_NAME, so restoring a
    backup taken under a different name yields a backend pointed at a database
    that is not there. That is checked before anything is touched.

    ASCII-only - see the encoding note in build-staging.ps1.

.EXAMPLE
    .\restore.ps1 -Archive D:\Backups\AeroGap\aerogap-backup-20260820-141500.zip
    .\restore.ps1 -Archive ... -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Archive,
    [string] $DataRoot = "$env:ProgramData\AeroGap",
    [switch] $Force,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Act($m)  { if ($DryRun) { Write-Host "    [dry-run] $m" -ForegroundColor DarkGray } else { Write-Host "    $m" } }
function Write-Warn($m) { Write-Host "    ! $m" -ForegroundColor Yellow }

$services = @('AeroGapApp', 'AeroGapConvex')

Write-Step 'Preflight'

if (-not (Test-Path $Archive)) { throw "Archive not found: $Archive" }

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) {
    throw 'Administrator rights are required to stop services and write to ProgramData.'
}

# Unpack to a temp location first so the archive can be inspected before any
# existing data is disturbed.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$staging = Join-Path ([System.IO.Path]::GetTempPath()) "aerogap-restore-$stamp"
# NOT Write-Act: this happens for real even in a dry run, because the archive
# has to be opened to validate it. Labelling it "[dry-run]" would claim nothing
# was written when 130 KB of customer data just landed on disk.
Write-Host "    expanding archive to $staging"
New-Item -ItemType Directory -Force $staging | Out-Null

# The expanded copy contains the instance secret and every API key. %TEMP% is
# readable by anything running as this user, so lock it down before the bytes
# arrive, and remove it in the finally below - including on a dry run, which
# previously left the whole lot sitting there.
$stagingAcl = Get-Acl $staging
$stagingAcl.SetAccessRuleProtection($true, $false)
foreach ($id in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
    $stagingAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
        $id, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
}
Set-Acl -Path $staging -AclObject $stagingAcl

Expand-Archive -Path $Archive -DestinationPath $staging -Force

$manifestPath = Join-Path $staging 'backup-manifest.json'
if (Test-Path $manifestPath) {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    Write-Act "backup taken : $($manifest.createdAt)"
    Write-Act "from machine : $($manifest.machine)"
    Write-Act "mode         : $($manifest.mode)"
    if ($manifest.mode -eq 'hot') {
        Write-Warn 'This was a HOT backup - the database copy may be inconsistent.'
    }
} else {
    Write-Warn 'No manifest in this archive - it may not have been produced by backup.ps1.'
    $manifest = $null
}

foreach ($d in @('config', 'data')) {
    if (-not (Test-Path (Join-Path $staging $d))) {
        Remove-Item $staging -Recurse -Force
        throw "Archive is missing '$d'. Refusing to restore an incomplete backup."
    }
}
if (-not (Test-Path (Join-Path $staging 'config\instance-secret'))) {
    Write-Warn 'No instance-secret in the archive. If the target install does not already have the matching secret, the restored database will be unreadable.'
}

# Instance name must match, or the backend looks for a database that is not there.
$currentEnv = Join-Path $DataRoot 'config\.env'
if ((Test-Path $currentEnv) -and $manifest -and $manifest.instanceName) {
    $m = (Get-Content $currentEnv | Select-String '^\s*CONVEX_INSTANCE_NAME\s*=\s*(.+)$').Matches
    if ($m.Count -gt 0) {
        $currentName = $m[0].Groups[1].Value.Trim()
        if ($currentName -ne $manifest.instanceName) {
            Remove-Item $staging -Recurse -Force
            throw "Instance name mismatch: this install is '$currentName' but the backup is from '$($manifest.instanceName)'. Restoring would point the backend at a database that does not exist."
        }
        Write-Act "instance name matches: $currentName"
    }
}

# -----------------------------------------------------------------------------
# Confirm
# -----------------------------------------------------------------------------
if (-not $Force -and -not $DryRun) {
    Write-Warn "About to replace the contents of $DataRoot"
    Write-Warn 'Current data will be moved aside, not deleted.'
    $answer = Read-Host "    Type RESTORE to continue"
    if ($answer -cne 'RESTORE') {
        Remove-Item $staging -Recurse -Force
        Write-Host "    Aborted. Nothing changed." -ForegroundColor Green
        exit 0
    }
}

# -----------------------------------------------------------------------------
# Stop services
# -----------------------------------------------------------------------------
Write-Step 'Stopping services'
$stopped = @()
foreach ($id in $services) {
    $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        Write-Act "stop $id"
        if (-not $DryRun) {
            Stop-Service -Name $id -Force
            (Get-Service $id).WaitForStatus('Stopped', '00:01:00')
        }
        $stopped += $id
    }
}

try {
    # -------------------------------------------------------------------------
    # Move current data aside, then restore
    # -------------------------------------------------------------------------
    Write-Step 'Restoring'

    foreach ($d in @('config', 'data', 'storage')) {
        $target = Join-Path $DataRoot $d
        $source = Join-Path $staging $d
        if (-not (Test-Path $source)) { Write-Act "$d not in archive - leaving existing"; continue }

        if (Test-Path $target) {
            $aside = "$target.replaced-$stamp"
            Write-Act "move aside: $d -> $(Split-Path $aside -Leaf)"
            if (-not $DryRun) { Move-Item $target $aside }
        }
        Write-Act "restore: $d"
        if (-not $DryRun) {
            $null = robocopy $source $target /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2
            if ($LASTEXITCODE -ge 8) { throw "robocopy failed restoring $d (exit $LASTEXITCODE)" }
        }
    }

    # config\ holds the instance secret and API keys - reapply the lockdown that
    # install.ps1 sets, since a restored directory carries the archive's ACL.
    if (-not $DryRun) {
        $configDir = Join-Path $DataRoot 'config'
        $acl = Get-Acl $configDir
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($id in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
            $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
                $id, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
        }
        Set-Acl -Path $configDir -AclObject $acl
        Write-Act 'reapplied ACL on config'
    }
} finally {
    # Always, dry run included. The staging copy holds the instance secret and
    # API keys in cleartext; leaving it behind because "nothing was changed" is
    # precisely the wrong reading of what a dry run promises.
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $staging) {
        Write-Warn "Could not remove $staging - it contains secrets. Delete it manually."
    }

    if ($stopped.Count -gt 0) {
        Write-Step 'Restarting services'
        [array]::Reverse($stopped)
        foreach ($id in $stopped) {
            Write-Act "start $id"
            if (-not $DryRun) { Start-Service -Name $id -ErrorAction Continue }
        }
    }
}

Write-Step 'Done'
if ($DryRun) {
    Write-Host "`n  Dry run complete. Nothing was changed.`n" -ForegroundColor Green
} else {
    Write-Host "`n  Restore complete.`n" -ForegroundColor Green
    Write-Host "  The previous data was kept alongside as *.replaced-$stamp - delete it once you have" -ForegroundColor DarkGray
    Write-Host "  confirmed the restore is good.`n" -ForegroundColor DarkGray
}
