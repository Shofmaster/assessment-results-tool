# AeroGap Desktop — installer archive and rollback

Desktop updates are distributed by hand. The app will not roll itself back.

`UPDATE_PUBLIC_KEY_PEM` is empty, so Help → Check for updates refuses every
feed (`no-signing-key-configured`). When a signing key is configured later, the
feed still refuses a manifest older than the installed version unless an
operator explicitly allows a downgrade. Do not use Check for updates to return
to an older build.

The way back is the setup program for that version:

`AeroGapSetup-Desktop-<version>.exe`

## Where previous installers are kept

`build-desktop.ps1` compiles each installer **into a versioned archive** and
does not delete other versions:

```text
%LOCALAPPDATA%\AeroGapBuildCache\desktop-releases\
  index.json
  0.6.7\AeroGapSetup-Desktop-0.6.7.exe
  0.6.8\AeroGapSetup-Desktop-0.6.8.exe
```

That directory is the same persistent cache `build-staging.ps1` already uses
for downloaded toolchains. It is outside the git checkout and outside
`selfhost\windows\Output`.

`selfhost\windows\Output` is only a convenience copy of the **latest** compile,
plus `ROLLBACK.txt` pointing at the archive. Cleaning `Output`, rebuilding, or
losing the OneDrive copy of the repo does not remove older archived installers.
Rebuilding `0.6.8` replaces only the `0.6.8` file. `0.6.7` stays.

The setup exe is stored once per version. It is not zipped again; Inno already
compressed it, and rollback means running that exe.

To put the archive on a share or another disk:

```powershell
.\build-desktop.ps1 -ReleaseArchive D:\AeroGapReleases
```

The path must not be inside `selfhost\windows\Output`.

`index.json` lists version, relative path, sha256, size, and when that version
was archived. List it from a shell:

```powershell
node .\desktopReleaseArchive.cjs list --archive "$env:LOCALAPPDATA\AeroGapBuildCache\desktop-releases"
```

### Seeding an installer you already have

Installers that were only in `Output` and are already gone cannot be rebuilt
from git. If you still have an older `AeroGapSetup-Desktop-<version>.exe`
anywhere, copy it into the archive once:

```powershell
node .\selfhost\windows\desktopReleaseArchive.cjs publish `
  --archive "$env:LOCALAPPDATA\AeroGapBuildCache\desktop-releases" `
  --installer C:\path\AeroGapSetup-Desktop-0.6.7.exe `
  --version 0.6.7
```

A later build will not remove it.

## Roll back a machine

1. Quit AeroGap. The installer also stops a running copy, and anything it
   spawned, before it replaces files.
2. Open the archive printed at the end of the build (also in
   `selfhost\windows\Output\ROLLBACK.txt` after a build).
3. Run the older setup, for example:

   `%LOCALAPPDATA%\AeroGapBuildCache\desktop-releases\0.6.7\AeroGapSetup-Desktop-0.6.7.exe`

4. The installer uses the desktop AppId, so it replaces the program under
   `%LOCALAPPDATA%\Programs\AeroGap`.

User data is not part of the installer. The database, uploaded documents, and
instance secret stay in `%LOCALAPPDATA%\AeroGap`. Uninstall, including the
uninstall an upgrade performs, does not delete that folder.

A failed upgrade is different from choosing an older release. If file copy
fails, Inno aborts and leaves the previous program files in place. You do not
need an older exe for that case. You need the archived exe when the new build
installed successfully and you want the previous one back.

### Database

Installing an older build re-deploys that build's Convex schema on next launch
(the deploy marker is per version). The data directory is not rewritten to an
older snapshot. If the newer build migrated data, the older program may fail
its deploy. The files are still in `%LOCALAPPDATA%\AeroGap`. Copy that folder
aside **before** an upgrade when you may need the pre-upgrade database, and do
not delete it as part of a rollback.
