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

; Restart Manager closes a running AeroGap.exe so its files can be replaced.
; Unlike server mode there are no services to stop first - the shell owns the
; backend, so closing it stops everything.
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
Name: "associate"; Description: "Open AeroGap project files (.aqp.json) with AeroGap"; GroupDescription: "File associations:"

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
