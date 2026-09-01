<#
.SYNOPSIS
    Backs up a self-hosted AeroGap install to a single archive.

.DESCRIPTION
    Captures everything needed to rebuild this deployment on another machine:

        config\.env             connection settings and API keys
        config\instance-secret  WITHOUT THIS THE DATABASE CANNOT BE READ
        data\                   the Convex SQLite database - all records
        storage\                uploaded document files

    Program Files is deliberately NOT backed up. It contains no customer data
    and is replaced wholesale by the installer.

    COLD BY DEFAULT. SQLite is being written continuously by a running service,
    and copying those files live can capture a torn database that only fails
    when you try to restore it - the worst possible time to discover a problem.
    So the services are stopped for the duration of the copy (typically well
    under a minute) and restarted afterwards, even if the copy fails.

    THE ARCHIVE CONTAINS SECRETS. The instance secret and every API key are in
    it. It is written with an ACL limited to Administrators and SYSTEM; treat it
    with the same care as the database itself.

    ASCII-only - see the encoding note in build-staging.ps1.

.PARAMETER Hot
    Skip stopping the services. Faster and non-disruptive, but the database copy
    may be inconsistent. Only reasonable for a throwaway pre-change snapshot.

.EXAMPLE
    .\backup.ps1 -OutDir D:\Backups\AeroGap
    .\backup.ps1 -OutDir D:\Backups\AeroGap -Hot
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $OutDir,
    [string] $DataRoot = "$env:ProgramData\AeroGap",
    [switch] $Hot,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Act($m)  { if ($DryRun) { Write-Host "    [dry-run] $m" -ForegroundColor DarkGray } else { Write-Host "    $m" } }
function Write-Warn($m) { Write-Host "    ! $m" -ForegroundColor Yellow }

$services = @('AeroGapApp', 'AeroGapConvex')   # app first: it depends on convex

Write-Step 'Preflight'

if (-not (Test-Path $DataRoot)) {
    throw "No AeroGap data directory at $DataRoot. Nothing to back up."
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    # config\ is ACL'd to Administrators + SYSTEM, so an unelevated backup would
    # silently produce an archive with no secret in it - restorable to nothing.
    throw 'Administrator rights are required: the config directory (which holds the instance secret) is not readable otherwise.'
}
Write-Act 'Running elevated: yes'

foreach ($d in @('config', 'data')) {
    if (-not (Test-Path (Join-Path $DataRoot $d))) { throw "Expected $DataRoot\$d - this does not look like an AeroGap install." }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $OutDir "aerogap-backup-$stamp.zip"
Write-Act "target: $archive"

# -----------------------------------------------------------------------------
# Stop services for a consistent copy
# -----------------------------------------------------------------------------
$stopped = @()
if ($Hot) {
    Write-Step 'Hot backup requested - services will keep running'
    Write-Warn 'The database copy may be inconsistent. Do not rely on this as your only backup.'
} else {
    Write-Step 'Stopping services for a consistent copy'
    foreach ($id in $services) {
        $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') {
            Write-Act "stop $id"
            if (-not $DryRun) {
                Stop-Service -Name $id -Force
                (Get-Service $id).WaitForStatus('Stopped', '00:01:00')
            }
            $stopped += $id
        } else {
            Write-Act "$id already stopped"
        }
    }
}

try {
    # -------------------------------------------------------------------------
    # Copy
    # -------------------------------------------------------------------------
    Write-Step 'Copying data'

    $staging = Join-Path ([System.IO.Path]::GetTempPath()) "aerogap-backup-$stamp"
    Write-Act "staging: $staging"
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force $staging | Out-Null
        foreach ($d in @('config', 'data', 'storage')) {
            $src = Join-Path $DataRoot $d
            if (Test-Path $src) {
                $null = robocopy $src (Join-Path $staging $d) /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2
                # robocopy exit codes 0-7 are success; 8+ are real failures.
                if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $d (exit $LASTEXITCODE)" }
                Write-Act "copied $d"
            } else {
                Write-Act "$d not present - skipping"
            }
        }

        # A manifest makes a restore verifiable instead of hopeful.
        $manifest = [ordered]@{
            createdAt    = (Get-Date).ToString('o')
            machine      = $env:COMPUTERNAME
            dataRoot     = $DataRoot
            mode         = if ($Hot) { 'hot' } else { 'cold' }
            instanceName = ''
            appVersion   = ''
        }
        $envFile = Join-Path $DataRoot 'config\.env'
        if (Test-Path $envFile) {
            $m = (Get-Content $envFile | Select-String '^\s*CONVEX_INSTANCE_NAME\s*=\s*(.+)$').Matches
            if ($m.Count -gt 0) { $manifest.instanceName = $m[0].Groups[1].Value.Trim() }
        }
        $manifest | ConvertTo-Json | Set-Content (Join-Path $staging 'backup-manifest.json') -Encoding utf8
        Write-Act 'wrote backup-manifest.json'
    }

    # -------------------------------------------------------------------------
    # Archive
    # -------------------------------------------------------------------------
    Write-Step 'Creating archive'
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force $OutDir | Out-Null
        Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive -CompressionLevel Optimal
        Remove-Item $staging -Recurse -Force

        # The archive holds the instance secret and every API key.
        $acl = Get-Acl $archive
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($id in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
            $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
                $id, 'FullControl', 'None', 'None', 'Allow')))
        }
        Set-Acl -Path $archive -AclObject $acl
        Write-Act 'ACL restricted to Administrators + SYSTEM'
    }
} finally {
    # Always restart, even if the copy threw. Leaving a customer's system down
    # because a backup failed would be a far worse outcome than a failed backup.
    if ($stopped.Count -gt 0) {
        Write-Step 'Restarting services'
        [array]::Reverse($stopped)   # convex before app
        foreach ($id in $stopped) {
            Write-Act "start $id"
            if (-not $DryRun) { Start-Service -Name $id }
        }
    }
}

Write-Step 'Done'
if ($DryRun) {
    Write-Host "`n  Dry run complete. Nothing was changed.`n" -ForegroundColor Green
} else {
    # Scale the unit. A small install compresses to tens of KB, and reporting
    # that as "0 MB" reads exactly like a backup that captured nothing - the one
    # impression a backup tool must never give.
    $bytes = (Get-Item $archive).Length
    if ($bytes -ge 1MB) { $size = "{0:N1} MB" -f ($bytes / 1MB) }
    elseif ($bytes -ge 1KB) { $size = "{0:N0} KB" -f ($bytes / 1KB) }
    else { $size = "$bytes bytes" }
    Write-Host "`n  Backup complete: $archive ($size)`n" -ForegroundColor Green

    # An archive far smaller than the data it should contain means the copy
    # silently produced nothing useful.
    if ($bytes -lt 4KB) {
        Write-Warn 'That archive is suspiciously small. Verify it with: .\restore.ps1 -Archive <path> -DryRun'
    }
    Write-Warn 'This archive contains the instance secret and your API keys. Store it accordingly.'
    Write-Host "  Restore with:  .\restore.ps1 -Archive `"$archive`"`n" -ForegroundColor DarkGray
}
