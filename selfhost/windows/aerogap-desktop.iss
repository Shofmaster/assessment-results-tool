; ============================================================================
; AeroGap Desktop - Windows installer (Inno Setup 6)
; ============================================================================
; The zero-question install. Wraps the folder produced by build-staging.ps1
; into a setup .exe that asks the user nothing at all:
;
;   .\build-staging.ps1 -OutDir C:\aerogap-build -Mode desktop
;   iscc.exe aerogap-desktop.iss /DStagingDir=C:\aerogap-build /DAppVersion=0.4.0
;
; WHAT IS DELIBERATELY ABSENT, AND WHY
;
;   No [Code] wizard pages. The server installer collects a hostname, a port and
;   three Clerk values across four pages. None apply here: the app is reached at
;   http://127.0.0.1 on a port chosen at launch, and the Clerk configuration is
;   compiled into the build. There is nothing left to ask.
;
;   No PrivilegesRequired=admin. Nothing is registered with the Service Control
;   Manager, nothing is written to Program Files, and no firewall rule is
;   created - so the install needs no elevation and raises no UAC prompt. That
;   is the single biggest difference in how this feels to a user.
;
;   No install.ps1 in [Run]. Services, ACLs and firewall rules are what that
;   script exists for. Here the desktop shell starts the backend itself as child
;   processes, and the per-user data directory needs no ACL because it is
;   already inside the user's own profile.
;
;   No caddy.exe or WinSW.exe. A reverse proxy exists in server mode only
;   because the Convex backend has no native TLS and a remote browser must reach
;   it. Loopback is a secure context, so both are dead weight - and they are
;   ~67 MB of it.
;
; ASCII-only by convention with the rest of windows\ - see the encoding note in
; build-staging.ps1.
; ============================================================================

#ifndef StagingDir
  #error StagingDir is required. Pass /DStagingDir=<path to build-staging output>
#endif

#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

#define AppName "AeroGap"
#define AppPublisher "Aviation Quality Company"

; Signing. See the note in aerogap-server.iss - identical mechanism.
#ifdef SignedBuild
  #define DoSign
#endif

[Setup]
; A DIFFERENT AppId from the server build on purpose. The two are separate
; products with separate uninstall entries, and a machine may carry both: a
; shared server install for the shop plus a desktop install on one workstation.
; Sharing an AppId would make installing one silently uninstall the other.
AppId={{2C7E4B19-6A3F-4D82-9E15-B740C8A3F6D2}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}

; Per-user, inside the profile. This is what removes the UAC prompt.
DefaultDirName={localappdata}\Programs\AeroGap
DefaultGroupName=AeroGap
PrivilegesRequired=lowest
; Do not offer the "install for all users" choice: it would need elevation and
; put the app somewhere the per-user data model does not match.
PrivilegesRequiredOverridesAllowed=

OutputBaseFilename=AeroGapSetup-Desktop-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; The setup program's own icon, and the one shown in Apps & Features. Generated
; from public/favicon.svg by desktop\scripts\make-icon.cjs, so the installer,
; the taskbar and the web app all show the same mark.
;
; A LOOSE copy at the staging root, not the one inside the shell: electron-builder
; packs everything in its `files` list into app.asar, and ISCC needs a real file
; on disk at compile time. build-staging.ps1 stages both.
SetupIconFile={#StagingDir}\AeroGap.ico
UninstallDisplayIcon={app}\desktop\AeroGap.exe

; The Convex backend and Node runtime are x64-only.
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Windows 10 1607+. Older than the server floor is pointless: the same binaries
; run in both.
MinVersion=10.0.14393

UninstallDisplayName={#AppName} {#AppVersion}

; Every page that could ask a question is off. What remains is: welcome,
; installing, finished.
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableWelcomePage=no

; Restart Manager is kept as a second line of defence, but it is NOT what stops
; a running AeroGap - see StopRunningAeroGap in [Code]. Restart Manager only
; sees processes holding files it is about to replace; it closes the Electron
; shell and never learns about node.exe and convex-local-backend.exe, which
; the shell spawned and which keep those two binaries locked. The copy then
; fails, the user clicks Ignore or the silent install skips, and the result is
; an install missing files that fails with "Application shell failed to start".
CloseApplications=yes
RestartApplications=no

#ifdef DoSign
SignTool=signtool
SignedUninstaller=yes
#endif

LicenseFile={#StagingDir}\LICENSE.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Excludes are the only difference from the server payload. One staging
; directory builds both installers, so there is a single build to test.
Source: "{#StagingDir}\*"; DestDir: "{app}"; \
  Flags: ignoreversion recursesubdirs createallsubdirs; \
  Excludes: "caddy.exe,WinSW.exe,install.ps1,uninstall.ps1,backup.ps1,restore.ps1,services\*,aerogap-mode.txt"

; Written here rather than taken from staging so this installer always produces
; a desktop install, whatever mode the staging directory was built for.
; main.cjs reads it to decide whether to supervise the backend or merely display
; it, and it defaults to server when absent - so getting this wrong would leave
; the shell waiting forever on services that do not exist.
[UninstallDelete]
Type: files; Name: "{app}\aerogap-mode.txt"

[Icons]
Name: "{group}\AeroGap"; Filename: "{app}\desktop\AeroGap.exe"; WorkingDir: "{app}\desktop"
Name: "{autodesktop}\AeroGap"; Filename: "{app}\desktop\AeroGap.exe"; WorkingDir: "{app}\desktop"; Tasks: desktopicon
Name: "{group}\Uninstall AeroGap"; Filename: "{uninstallexe}"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "associate"; Description: "Open AeroGap project files (.aqp.json) and organization bundles (.aqo.json) with AeroGap"; GroupDescription: "File associations:"

[Registry]
; Double-clicking an exported project bundle should open it here rather than in
; Notepad or a browser. The app already produces this format via
; projects.exportBundle, so the file exists and currently has no owner.
;
; HKCU, not HKCR: this is a per-user install with no elevation, so it may only
; register associations for the user who installed it. Writing to HKCR would
; fail silently on a standard account and leave a half-registered type.
;
; uninsdeletekey removes the whole tree on uninstall - an association pointing
; at a deleted executable produces an error dialog on every double-click.
Root: HKCU; Subkey: "Software\Classes\.aqp.json"; ValueType: string; ValueName: ""; ValueData: "AeroGap.Project"; Flags: uninsdeletevalue uninsdeletekeyifempty; Tasks: associate
Root: HKCU; Subkey: "Software\Classes\AeroGap.Project"; ValueType: string; ValueName: ""; ValueData: "AeroGap Project"; Flags: uninsdeletekey; Tasks: associate
Root: HKCU; Subkey: "Software\Classes\AeroGap.Project\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\desktop\AeroGap.exe,0"; Flags: uninsdeletekey; Tasks: associate
Root: HKCU; Subkey: "Software\Classes\AeroGap.Project\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\desktop\AeroGap.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: associate
Root: HKCU; Subkey: "Software\Classes\.aqo.json"; ValueType: string; ValueName: ""; ValueData: "AeroGap.Organization"; Flags: uninsdeletevalue uninsdeletekeyifempty; Tasks: associate
Root: HKCU; Subkey: "Software\Classes\AeroGap.Organization"; ValueType: string; ValueName: ""; ValueData: "AeroGap Organization"; Flags: uninsdeletekey; Tasks: associate
Root: HKCU; Subkey: "Software\Classes\AeroGap.Organization\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\desktop\AeroGap.exe,0"; Flags: uninsdeletekey; Tasks: associate
Root: HKCU; Subkey: "Software\Classes\AeroGap.Organization\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\desktop\AeroGap.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: associate

[Run]
; Offered, not automatic, and skipped in silent mode where nobody is watching.
; Launching immediately is safe: the shell shows a progress screen while it
; starts the backend and, on a first install, deploys the database schema.
Filename: "{app}\desktop\AeroGap.exe"; \
  Description: "Start AeroGap now"; \
  WorkingDir: "{app}\desktop"; \
  Flags: nowait postinstall skipifsilent

[Code]
{ ---------------------------------------------------------------------------
  The entire [Code] section of the server installer - hostname detection, DNS
  probing, Clerk key validation, and the routine that writes a .env - is absent
  here. It is not that those steps were moved somewhere else; they no longer
  exist for this product.

  What remains is one line: stamp the mode marker. Everything else the install
  used to decide is now decided at launch by the shell, or compiled in.
  --------------------------------------------------------------------------- }

{ ---------------------------------------------------------------------------
  Stop a running AeroGap - the shell AND everything it spawned - before files
  are touched, on install and on uninstall alike.

  Why not leave it to CloseApplications: Restart Manager asks "who holds the
  files I am about to replace?" and gets back AeroGap.exe, which it closes.
  It never hears about node.exe and convex-local-backend.exe, the shell's
  children, which hold THEIR binaries open. If the shell was closed hard (a
  modal error dialog up, say) it does not get to stop them either. The copy of
  those two files then fails; interactively the user sees Abort/Retry/Ignore,
  silently the file is skipped - and either way the result is an install with
  files missing that fails with "The application shell failed to start".
  Uninstall has the mirror problem: locked files stay behind, the entry is
  gone from Apps & Features, and the next install lands on top of the residue.

  Mechanism: a small PowerShell script (written to the setup temp directory,
  so no quoting has to survive a command line) that finds every process whose
  image lives under the
  install directory, asks the shell to close (which lets it stop its children
  cleanly), waits up to ten seconds, and force-terminates whatever is left.
  Matching on the executable PATH rather than the name is what keeps this from
  killing an unrelated node.exe - this is a developer's machine as often as a
  customer's. The uninstaller itself (unins000.exe, launched from the install
  directory) is excluded, or the uninstall would wait ten seconds on its own
  parent and then shoot it. Force-stopping the database is safe: it is SQLite, and the
  supervisor already kills the tree the same way on a normal quit.

  This is process control, not the elevation-requiring provisioning that the
  desktop installer refuses to run PowerShell for (see the tests) - it runs as
  the user, against the user's own processes.
  --------------------------------------------------------------------------- }

function StopScript(): string;
begin
  Result :=
    'param([string]$AppDir)' + #13#10 +
    '$prefix = $AppDir.TrimEnd("\") + "\"' + #13#10 +
    'function Ours {' + #13#10 +
    '  Get-CimInstance Win32_Process | Where-Object {' + #13#10 +
    '    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and' + #13#10 +
    '    $_.Name -notlike "unins*"' + #13#10 +
    '  }' + #13#10 +
    '}' + #13#10 +
    'foreach ($p in @(Ours | Where-Object { $_.Name -ieq "AeroGap.exe" })) {' + #13#10 +
    '  try { (Get-Process -Id $p.ProcessId -ErrorAction Stop).CloseMainWindow() | Out-Null } catch { }' + #13#10 +
    '}' + #13#10 +
    '$deadline = (Get-Date).AddSeconds(10)' + #13#10 +
    'while ((Get-Date) -lt $deadline -and @(Ours).Count -gt 0) { Start-Sleep -Milliseconds 300 }' + #13#10 +
    'foreach ($p in @(Ours)) {' + #13#10 +
    '  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { }' + #13#10 +
    '}' + #13#10 +
    'Start-Sleep -Milliseconds 500' + #13#10;
end;

procedure StopRunningAeroGap(const AppDir: string);
var
  ScriptPath, PowerShell: string;
  ResultCode: Integer;
begin
  if not DirExists(AppDir) then
    Exit;
  ScriptPath := ExpandConstant('{tmp}\stop-aerogap.ps1');
  if not SaveStringToFile(ScriptPath, StopScript(), False) then
  begin
    Log('StopRunningAeroGap: could not write ' + ScriptPath + '; relying on Restart Manager');
    Exit;
  end;
  PowerShell := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  Log('StopRunningAeroGap: stopping processes under ' + AppDir);
  if Exec(PowerShell,
          '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ScriptPath + '" -AppDir "' + AppDir + '"',
          '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Log('StopRunningAeroGap: powershell exited ' + IntToStr(ResultCode))
  else
    Log('StopRunningAeroGap: powershell could not be started (' + SysErrorMessage(ResultCode) + '); relying on Restart Manager');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningAeroGap(ExpandConstant('{app}'));
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  StopRunningAeroGap(ExpandConstant('{app}'));
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  DataNote: string;
begin
  if CurStep = ssPostInstall then
  begin
    { No newline: main.cjs trims, but a marker file is compared as a whole
      string and a stray CRLF has caused this class of bug before. }
    SaveStringToFile(ExpandConstant('{app}\aerogap-mode.txt'), 'desktop', False);

    { The data location matters to a customer who chose on-prem precisely so
      they would know where their records are. Stated once, plainly, at the end
      - rather than as a wizard page they would click past on the way in. }
    DataNote := ExpandConstant('{localappdata}\AeroGap');
    Log('AeroGap desktop install complete. Data root: ' + DataNote);
  end;
end;

{ Uninstall must NEVER remove the data directory. It holds the database, the
  uploaded documents and the instance secret, and without that secret a backup
  of the database cannot be read. Removing customer data is a deliberate,
  separate action - never a side effect of uninstalling, and never of the
  uninstall an upgrade performs. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    Log('AeroGap uninstalled. Data left in place at: ' + ExpandConstant('{localappdata}\AeroGap'));
end;
