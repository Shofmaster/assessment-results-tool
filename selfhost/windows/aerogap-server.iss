; ============================================================================
; AeroGap Self-Hosted - Windows installer (Inno Setup 6)
; ============================================================================
; Wraps the folder produced by build-staging.ps1 into a single setup .exe.
;
;   .\build-staging.ps1 -OutDir C:\build\aerogap
;   iscc.exe aerogap.iss /DStagingDir=C:\build\aerogap /DAppVersion=0.1.0
;
; The installer collects configuration in its wizard, writes it to an ACL'd
; file under ProgramData, then hands off to install.ps1 for the parts that need
; real Windows plumbing (services, ACLs, firewall). The PowerShell scripts stay
; the single source of truth so a headless/scripted install and a GUI install
; take exactly the same code path.
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

; NOTHING DEPLOYMENT-SPECIFIC IS COMPILED IN.
;
; The application reads its public configuration at run time from /config.js,
; which the server generates from the installed config file. So one artifact
; installs at any customer, under any hostname, against any Clerk instance -
; the hostname and publishable key are collected by the wizard below.
;
; This replaced a set of guards that existed only to stop an operator choosing a
; hostname the bundle could not serve. They are gone because the mismatch they
; defended against can no longer happen.

; Signing. Define SignedBuild to sign the installer and its uninstaller.
;
;   iscc aerogap.iss /DSignedBuild ^
;        "/Ssigntool=signtool.exe sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a $f"
;
; The /S switch names a tool; the SignTool directive below invokes it. $f is
; replaced by Inno with the file being signed.
;
; This signs the SETUP program - the thing SmartScreen judges when a customer
; downloads it. AeroGap.exe inside is signed earlier, by build-staging.ps1,
; because signing after packaging would leave the packaged copy unsigned.
;
; ALWAYS timestamp. Without /tr the signature stops validating the day the
; certificate expires, including on already-installed copies.
#ifdef SignedBuild
  #define DoSign
#endif

#define AppName "AeroGap"
#define AppPublisher "Aviation Quality Company"

[Setup]
AppId={{8F3A2C41-9D5E-4B7A-A1C2-6E4F8B9D0A31}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\AeroGap
DefaultGroupName=AeroGap
OutputBaseFilename=AeroGapSetup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; Services, Program Files, and firewall rules all require elevation. Asking up
; front is better than failing three pages in.
PrivilegesRequired=admin

; The Convex backend and Node runtime are x64-only.
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Server 2016 is the realistic floor: it is the oldest OS with the .NET
; Framework 4.6.1 that WinSW v2 targets.
MinVersion=10.0.14393

UninstallDisplayName={#AppName} {#AppVersion}
DisableProgramGroupPage=yes

#ifdef DoSign
; Sign the setup program and the generated uninstaller. The uninstaller matters
; too: it is an executable left on the customer's machine, and an unsigned one
; there looks exactly like malware pretending to be an uninstaller.
SignTool=signtool
SignedUninstaller=yes
#endif

; Use Restart Manager to close the desktop shell if it is open, otherwise it
; holds AeroGap.exe and the file copy fails. Services are handled separately in
; PrepareToInstall - Restart Manager does not stop them for us.
CloseApplications=yes
RestartApplications=no

; NO LicenseFile ON PURPOSE.
; This is commercial software sold to customers, and the repo has no LICENSE
; file (package.json says "MIT", which is almost certainly wrong for what is
; being sold here). Rather than invent an agreement or show the wrong one, the
; licence page is omitted until someone decides what the EULA should say.
;
LicenseFile={#StagingDir}\LICENSE.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#StagingDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Icons]
; The desktop shell is the primary way in: its own window, taskbar entry and
; icon, no address bar. It is only a window onto the local server - the services
; are what actually run the application.
Name: "{group}\AeroGap"; Filename: "{app}\desktop\AeroGap.exe"; WorkingDir: "{app}\desktop"
Name: "{autodesktop}\AeroGap"; Filename: "{app}\desktop\AeroGap.exe"; WorkingDir: "{app}\desktop"; Tasks: desktopicon
Name: "{group}\Uninstall AeroGap"; Filename: "{uninstallexe}"

[INI]
; Kept as a secondary entry. When the shell will not start, opening the same URL
; in a real browser separates "the shell is broken" from "the services are down"
; in one click - the first question support will ask.
; It has to be a .url: an [Icons] entry builds a .lnk to a filesystem path, so
; pointing one at a URL produces a shortcut that silently does nothing.
Filename: "{group}\AeroGap (open in browser).url"; Section: "InternetShortcut"; Key: "URL"; String: "{code:GetAppOrigin}"

[UninstallDelete]
; Inno removes files it installed; the .url is generated at runtime, so it has
; to be cleaned up explicitly or it outlives the uninstall.
Type: files; Name: "{group}\AeroGap (open in browser).url"

[Run]
; Elevated, non-interactive. install.ps1 is idempotent, so a repair or upgrade
; re-runs it safely.
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\install.ps1"" -SourceDir ""{app}"" -InstallDir ""{app}"" -AppPort {code:GetAppPort} -AppDomain ""{code:GetAppDomain}"""; \
  StatusMsg: "Registering Windows services..."; \
  Flags: runhidden waituntilterminated

; Offered, not automatic. The shell waits for /healthz and shows a progress
; screen, so launching straight after install is safe even while the services
; are still coming up. Skipped in silent mode, where there is no user to see it.
Filename: "{app}\desktop\AeroGap.exe"; \
  Description: "Start AeroGap now"; \
  WorkingDir: "{app}\desktop"; \
  Flags: nowait postinstall skipifsilent

[UninstallRun]
; NOTE the absence of -RemoveData. An uninstall - including the one an upgrade
; performs - must never delete the customer's database, documents, or instance
; secret. Removing data is a deliberate, separate operator action.
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\uninstall.ps1"" -InstallDir ""{app}"" -Force"; \
  RunOnceId: "AeroGapUninstallServices"; \
  Flags: runhidden waituntilterminated

[Code]
var
  HostChoicePage: TInputOptionWizardPage;
  UrlPage: TInputQueryWizardPage;
  DataNoticePage: TOutputMsgWizardPage;
  DetectedNetbios: String;
  DetectedFqdn: String;
  HostResolveChecked: String;
  HostResolveOk: Boolean;

{ ---------------------------------------------------------------------------
  Hostname selection.

  Everything else derives from this one value: the certificate subject, the
  application origin, and the Convex URLs the browser is told to connect to. A
  name that does not resolve produces an install that completes cleanly and is
  simply unreachable - so it is chosen from what this machine actually answers
  to, and checked before the install proceeds.
  --------------------------------------------------------------------------- }

{ The machine's fully-qualified name, when it is domain-joined and differs from
  the short name. Returns '' when there is nothing extra to offer. }
function GetFqdn(): String;
var
  Domain: String;
begin
  Result := '';
  RegQueryStringValue(HKLM, 'SYSTEM\CurrentControlSet\Services\Tcpip\Parameters', 'Domain', Domain);
  Domain := Trim(Domain);
  if (Domain <> '') and (DetectedNetbios <> '') then
    Result := Lowercase(DetectedNetbios) + '.' + Lowercase(Domain);
end;

{ True when the name resolves from THIS machine. Not proof that a user's
  workstation can resolve it, but it catches the common case of a typo or a
  hostname that was never added to DNS. }
function HostnameResolves(const Name: String): Boolean;
var
  ResultCode: Integer;
  Command: String;
begin
  if Name = HostResolveChecked then begin
    Result := HostResolveOk;
    Exit;
  end;

  { GetHostEntry throws when the name cannot be resolved, so a non-zero exit is
    the signal. -NoProfile keeps a slow user profile out of the path. }
  Command := '-NoProfile -NonInteractive -Command "try { [void][System.Net.Dns]::GetHostEntry(''' +
             Name + '''); exit 0 } catch { exit 1 }"';
  if not Exec('powershell.exe', Command, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    ResultCode := 1;

  HostResolveChecked := Name;
  HostResolveOk := (ResultCode = 0);
  Result := HostResolveOk;
end;

{ The hostname the operator settled on. }
function SelectedHostname(): String;
begin
  if HostChoicePage.SelectedValueIndex = 0 then
    Result := DetectedNetbios
  else if (DetectedFqdn <> '') and (HostChoicePage.SelectedValueIndex = 1) then
    Result := DetectedFqdn
  else
    Result := Trim(UrlPage.Values[0]);
end;

{ ---------------------------------------------------------------------------
  Unattended install support.

  Wizard pages are the only source of configuration in an interactive install,
  but a silent install never shows them - and Inno still runs the validation in
  NextButtonClick, so a required-field check aborted /VERYSILENT outright.
  That made unattended deployment impossible, which is precisely what Intune,
  SCCM and Group Policy need.

  So every value can also arrive on the command line:

    AeroGapSetup.exe /VERYSILENT /APPHOST=aerogap.acme.local /APPPORT=443

  That is the WHOLE command line now, and it carries no credentials at all.

  There are no AI-key parameters: those are entered in the app after sign-in and
  stored per company. There are no Clerk parameters either: that configuration
  is compiled into the build. What is left is genuinely per-site - a hostname -
  so an unattended deployment no longer has to distribute secrets through an
  Intune script, a Group Policy object, or an SCCM package that logs its own
  command line.

  Anything omitted falls back to the wizard default, so an interactive install
  behaves exactly as before.
  --------------------------------------------------------------------------- }
function Param(const Name, Default: string): string;
begin
  Result := ExpandConstant('{param:' + Name + '|' + Default + '}');
end;

{ Reports a validation failure the right way for the current mode: a message box
  interactively, a log line when silent (where a message box is invisible and,
  with /SUPPRESSMSGBOXES, silently answered). }
procedure Reject(const Message: string);
begin
  if WizardSilent then
    Log('CONFIGURATION ERROR: ' + Message)
  else
    MsgBox(Message, mbError, MB_OK);
end;

{ ---------------------------------------------------------------------------
  Stop the services BEFORE any file is replaced.

  install.ps1 also stops them, but it runs from [Run], which Inno executes
  AFTER [Files]. On an upgrade that is far too late: the running Convex service
  holds convex-local-backend.exe open, DeleteFile fails with "Access is denied",
  and with /SUPPRESSMSGBOXES the Abort/Retry/Ignore prompt defaults to Abort -
  so the whole upgrade silently rolls back to the previous version.

  'net stop' is used rather than 'sc stop' because it blocks until the service
  has actually stopped. A queued stop is not good enough when the next step
  immediately tries to replace the binary.
  --------------------------------------------------------------------------- }
procedure StopServiceAndWait(const ServiceName: string);
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\net.exe'), 'stop "' + ServiceName + '" /y',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Log('net stop ' + ServiceName + ' -> ' + IntToStr(ResultCode));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  NeedsRestart := False;

  { Proxy first (the front door), then App, then Convex which App depends on.
    The proxy holds caddy.exe and AeroGapProxy.exe open; leaving it running
    makes an upgrade fail to replace them and silently roll back, exactly as
    a running Convex once did. Harmless when not yet installed: net stop
    simply reports the service does not exist. }
  StopServiceAndWait('AeroGapProxy');
  StopServiceAndWait('AeroGapApp');
  StopServiceAndWait('AeroGapConvex');

  { WinSW returns once the SCM reports Stopped, but the child process can take
    a moment longer to release its file handles. }
  Sleep(2000);
end;

procedure InitializeWizard;
begin
  DetectedNetbios := GetComputerNameString();
  DetectedFqdn := GetFqdn();

  HostChoicePage := CreateInputOptionPage(wpSelectDir,
    'Server address',
    'How will users reach AeroGap?',
    'This name goes on the TLS certificate and into every URL the application' + #13#10 +
    'hands to a browser, so it must resolve from your users'' workstations - not' + #13#10 +
    'just from this machine.',
    True,   { radio buttons - exactly one answer }
    False);

  HostChoicePage.Add('This computer''s name:  ' + DetectedNetbios);
  if DetectedFqdn <> '' then
    HostChoicePage.Add('This computer''s full DNS name:  ' + DetectedFqdn);
  HostChoicePage.Add('A different hostname (enter on the next page)');

  { Prefer the fully-qualified name when the machine is domain-joined: it is the
    one that resolves reliably from other subnets. ANY hostname is valid now -
    the app is told which to use at run time via /config.js. }
  if DetectedFqdn <> '' then
    HostChoicePage.SelectedValueIndex := 1
  else
    HostChoicePage.SelectedValueIndex := 0;

  UrlPage := CreateInputQueryPage(HostChoicePage.ID,
    'Server address',
    'Enter the hostname',
    'A DNS name or an IP address that your users can reach. Do not include' + #13#10 +
    'https:// or a port - those are added automatically.');
  UrlPage.Add('Hostname:', False);
  UrlPage.Add('Application port:', False);

  { THE CREDENTIALS PAGE IS GONE.

    It collected a Clerk secret key, a JWT issuer URL and a publishable key.
    None of those is per-customer: all three identify OUR Clerk tenant and were
    identical at every site, so asking each operator to paste them was friction
    that bought nothing - and it made unattended deployment require a command
    line carrying credentials.

    They are compiled into the build now (build-config.json, written by
    build-staging.ps1 and applied by selfhost\server\src\buildConfig.ts UNDER
    real environment variables). A site that genuinely needs a different Clerk
    instance sets the variables in config\.env and the baked values step aside.

    The secret key is not merely no longer asked for - it is no longer used
    anywhere. api\_lib\auth.ts verifies tokens with the PUBLIC JWT key instead,
    which cannot mint a token, so nothing that ships to a customer can
    impersonate a user in our tenant. }

  DataNoticePage := CreateOutputMsgPage(UrlPage.ID,
    'Where your data lives',
    'Please read before continuing',
    'Application files install to the folder you chose and are replaced on upgrade.' + #13#10 + #13#10 +
    'All customer data - the database, uploaded documents, and the instance secret -' + #13#10 +
    'is stored separately under:' + #13#10 + #13#10 +
    '    C:\ProgramData\AeroGap' + #13#10 + #13#10 +
    'Uninstalling AeroGap does NOT delete that folder.' + #13#10 + #13#10 +
    'Back it up together with the instance secret. Without the secret, a backup of' + #13#10 +
    'the database cannot be read.');

  { Prefilled so the operator edits a working example rather than typing three
    values from scratch - the empty fields were tripping the scheme check on the
    very first Next click. }
  { Command line wins, wizard default otherwise - so the same code path serves
    an interactive install and an unattended one. }
  { An unattended install can name the host directly; /APPHOST wins and forces
    the "different hostname" branch so the radio choice is not consulted. }
  UrlPage.Values[0] := Param('APPHOST', DetectedNetbios);
  UrlPage.Values[1] := Param('APPPORT', '443');
  if Param('APPHOST', '') <> '' then
    HostChoicePage.SelectedValueIndex := HostChoicePage.CheckListBox.Items.Count - 1;

  { /ANTHROPICKEY and /VOYAGEKEY are deliberately gone: AI keys live in the
    database now, per company, and are entered in the app.
    /CLERKSECRET, /CLERKISSUER and /CLERKPUBKEY are gone too: that configuration
    is compiled into the build. An unattended install now needs only a hostname,
    so a single command line serves every site. }

  { Read-only: this value is inlined in the SPA bundle. Letting it be edited
    would write a config the application cannot honour. }
  UrlPage.Edits[1].ReadOnly := True;
  UrlPage.Edits[1].Color := clBtnFace;
end;

function GetAppDomain(Param: string): string;
begin
  Result := SelectedHostname();
end;

function GetAppOrigin(Param: string): string;
begin
  { Port 443 is implicit in an https URL; including it produces an origin that
    does not match the one the browser reports, which breaks the CORS allowlist. }
  if Trim(UrlPage.Values[1]) = '443' then
    Result := 'https://' + SelectedHostname()
  else
    Result := 'https://' + SelectedHostname() + ':' + Trim(UrlPage.Values[1]);
end;

function GetAppPort(Param: string): string;
begin
  Result := Trim(UrlPage.Values[1]);
end;

{ Reject obviously-wrong input at the page that collected it, rather than
  letting the service fail to start later with a less traceable message. }
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  { Only ask for a hostname when the operator did not pick a detected one. }
  if PageID = UrlPage.ID then
    Result := (HostChoicePage.SelectedValueIndex <> HostChoicePage.CheckListBox.Items.Count - 1);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
  Host: String;
begin
  Result := True;

  if CurPageID = UrlPage.ID then
  begin
    Host := Trim(UrlPage.Values[0]);
    if Host = '' then
    begin
      Reject('Please enter a hostname.' + #13#10 + #13#10 +
             'For example:  aerogap.yourcompany.local' + #13#10 +
             '(unattended: pass /APPHOST=...)');
      Result := False;
      Exit;
    end;
    { A scheme or a port here would end up doubled in every generated URL. }
    if (Pos('://', Host) > 0) or (Pos('/', Host) > 0) or (Pos(':', Host) > 0) then
    begin
      Reject('Enter the hostname only - no scheme, port or path.' + #13#10 + #13#10 +
             'You entered:  ' + Host + #13#10 +
             'Expected:     aerogap.yourcompany.local');
      Result := False;
      Exit;
    end;
    { Resolution is a warning, not a block. The name only has to resolve from
      the USERS' workstations, and this machine may legitimately not resolve a
      name that a split-horizon DNS or a hosts-file entry elsewhere provides.
      Silently accepting a typo, though, produces an install that completes and
      is simply unreachable - so make the operator confirm. }
    if not WizardSilent and not HostnameResolves(Host) then
    begin
      if MsgBox('"' + Host + '" does not resolve from this machine.' + #13#10 + #13#10 +
                'That is fine if your DNS serves it only to user workstations, but a typo' + #13#10 +
                'here produces an install that finishes cleanly and cannot be reached.' + #13#10 + #13#10 +
                'Use this hostname anyway?', mbConfirmation, MB_YESNO) = IDNO then
      begin
        Result := False;
        Exit;
      end;
    end;

    Port := StrToIntDef(UrlPage.Values[1], -1);
    if (Port < 1) or (Port > 65535) then
    begin
      Reject('The application port must be a number between 1 and 65535.' + #13#10 +
             '(unattended: pass /APPPORT=...)');
      Result := False;
      Exit;
    end;
  end;
end;

{ Derive the bare hostname the reverse proxy serves from a full URL. }
function HostFromUrl(Url: string): string;
var
  P: Integer;
begin
  Result := Url;
  P := Pos('://', Result);
  if P > 0 then Result := Copy(Result, P + 3, Length(Result));
  P := Pos('/', Result);
  if P > 0 then Result := Copy(Result, 1, P - 1);
  P := Pos(':', Result);
  if P > 0 then Result := Copy(Result, 1, P - 1);
end;

procedure WriteConfigFile;
var
  ConfigDir: string;
  Lines: TArrayOfString;
  AppHost: string;
begin
  ConfigDir := ExpandConstant('{commonappdata}\AeroGap\config');
  ForceDirectories(ConfigDir);
  AppHost := SelectedHostname();

  { Contiguous 0..N-1. Inno writes every element, so a gap emits a blank line
    and a wrong N silently truncates the tail of the .env. There is no
    compile-time check: selfhost/__tests__/installerConfig.test.ts pins it. }
  SetArrayLength(Lines, 19);
  Lines[0]  := '# Written by the AeroGap installer. Edit and restart the services to change.';
  Lines[1]  := '# Validate with:  node "' + ExpandConstant('{app}') + '\doctor.mjs"';
  Lines[2]  := '';
  Lines[3]  := 'APP_ORIGIN=' + GetAppOrigin('');
  Lines[4]  := 'APP_PORT=' + Trim(UrlPage.Values[1]);
  Lines[5]  := 'APP_DOMAIN=' + AppHost;
  { Convex is served by the same proxy on its own port, so it shares the
    hostname and certificate - one DNS name and one cert for the whole stack. }
  Lines[6]  := 'CONVEX_PUBLIC_URL=https://' + AppHost + ':3210';
  Lines[7]  := 'CONVEX_DOMAIN=' + AppHost;
  { Convex serves HTTP actions from the origin plus a /http suffix when there is
    no separate hostname, which is what keeps this to one certificate. }
  Lines[8]  := 'CONVEX_SITE_URL=https://' + AppHost + ':3211';
  Lines[9]  := 'CONVEX_SITE_DOMAIN=' + AppHost;
  { Server-side Convex URL, read by api/_lib/auth.ts for the approval check.
    This MUST be the backend's LOOPBACK port (install.ps1 $ConvexInternalPort),
    not the public one: public 3210 is Caddy, over TLS and bound to APP_DOMAIN,
    so nothing answers plain http on 127.0.0.1:3210. Pointing at 3210 makes
    verifyRequestAuth fail closed with 503 on every AI request. }
  Lines[10] := 'CONVEX_URL=http://127.0.0.1:13210';
  { Convex HTTP actions, on the backend's LOOPBACK port. api/_lib/aiCredentials.ts
    calls this to resolve a company's AI key. Public 3211 is the TLS proxy, which
    from this machine would mean trusting an internal CA for no benefit. }
  Lines[11] := 'CONVEX_SITE_INTERNAL_URL=http://127.0.0.1:13211';
  Lines[12] := 'CONVEX_INSTANCE_NAME=aerogap_onprem';
  Lines[13] := '';
  Lines[14] := 'AUTH_MODE=clerk';
  Lines[15] := 'CLERK_JWT_AUDIENCE=convex';
  { NO CLERK_SECRET_KEY, CLERK_JWT_ISSUER_DOMAIN OR VITE_CLERK_PUBLISHABLE_KEY.

    Those three used to be collected by a wizard page and written here. They are
    compiled into the build now (build-config.json, applied at boot by
    selfhost\server\src\buildConfig.ts) because they identify our Clerk tenant
    and were identical at every customer - so asking for them bought nothing.

    Baked values are applied UNDER real environment variables, so a site that
    must point at a different Clerk instance still can: add the variables to
    this file by hand and they win. That is why nothing is written here by
    default - an empty value here would OVERRIDE the baked one with nothing. }
  Lines[16] := '';
  { Deployment-wide, not a secret: EMBEDDING_DIMENSIONS is baked into the vector
    index, so the provider cannot vary per company - only the key does. The key
    itself is added in the app and stored in Convex.
    AI_CREDENTIAL_SERVICE_TOKEN is generated by install.ps1 rather than here:
    Inno has no cryptographic RNG, and it must exist before the services start. }
  Lines[17] := 'EMBEDDING_PROVIDER=voyage';
  { Telemetry stays off on self-hosted installs. }
  Lines[18] := 'BILLING_ENFORCEMENT_ENABLED=false';

  SaveStringsToFile(ConfigDir + '\.env', Lines, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  { Written before [Run] fires, because install.ps1 starts the services and they
    refuse to boot without a complete configuration. }
  if CurStep = ssPostInstall then
    WriteConfigFile;
end;
