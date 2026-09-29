# Desktop installer rollback

AeroGap desktop updates are handed out as Windows setup executables. The
auto-update feed is not a rollback path:

- `UPDATE_PUBLIC_KEY_PEM` is empty, so the app refuses every feed
  (`no-signing-key-configured`). Nothing is installed from the feed until a
  signing key is configured.
- When a feed is signed, a manifest older than the installed version is refused
  (`downgrade-refused`) unless that check is explicitly turned off. Do not point
  a site at an older manifest and expect the app to downgrade itself.

Falling back means running an older `AeroGapSetup-Desktop-<version>.exe`.
The build keeps those files.

## Where the installers are kept

`windows/build-desktop.ps1` (also `npm run build:desktop` from `selfhost/`)
compiles into:

```text
selfhost/windows/Output/AeroGapSetup-Desktop-<version>.exe
```

That directory is build output. Inno replaces the file when the same version
is compiled again, and a clean of `Output` removes whatever else was in it.
`Output` is gitignored.

Before and after that compile, the build runs
`windows/archive-desktop-installer.mjs`, which copies every
`AeroGapSetup-Desktop-<version>.exe` into:

```text
selfhost/windows/installer-archive/
```

That directory is not cleared by the next build.

| File | What it is |
|---|---|
| `AeroGapSetup-Desktop-0.6.7.exe` | First archived copy of 0.6.7. This name is never replaced. |
| `AeroGapSetup-Desktop-0.6.8.exe` | First archived copy of 0.6.8. |
| `AeroGapSetup-Desktop-0.6.8.20260929T144400Z.exe` | A later 0.6.8 compile whose bytes differed. The plain `0.6.8` file is left as it was. |
| `manifest.json` | Index: version, file name, sha256, size, when it was archived. Local to the build machine; not committed. |
| `README.md` | Short copy of this procedure, next to the exes. |

Rules the script enforces:

- It never deletes a file in `installer-archive`.
- It never overwrites an archived exe whose sha256 differs.
- Archiving 0.6.8 does not remove 0.6.7.
- Running it again on the same bytes is a no-op.

The exes are large and stay on the build machine (gitignored). Copy
`installer-archive` to the file share you already use for releases. The copy
off the build machine is what you reinstall from if that machine is wiped.

If an older setup still exists somewhere else (a previous share, another disk),
add it once. The script will not overwrite a different file that is already
archived under that version:

```powershell
node selfhost\windows\archive-desktop-installer.mjs `
  --setup D:\drops\AeroGapSetup-Desktop-0.6.7.exe `
  --archive-dir selfhost\windows\installer-archive
```

Compiling `aerogap-desktop.iss` by hand does not archive. Use
`build-desktop.ps1`, or run the command above on the exe Inno just wrote.

## Reinstall an older release

1. Take a copy of the data directory before you downgrade if you may need the
   records as they were before the newer app wrote them:
   `%LOCALAPPDATA%\AeroGap`
   (database, uploaded documents, instance secret). The installer does not
   make this copy.
2. Quit AeroGap. The setup also stops the shell and the `node.exe` /
   `convex-local-backend.exe` processes whose executables live under the
   install directory.
3. Run the archived `AeroGapSetup-Desktop-<version>.exe` for the release you
   want. It is the same per-user product (`AppId` unchanged), installed to
   `%LOCALAPPDATA%\Programs\AeroGap`. Inno replaces the program files with that
   version. File copies are marked `ignoreversion`, so an older build does
   replace a newer one.
4. Leave `%LOCALAPPDATA%\AeroGap` in place. Install and uninstall do not delete
   it. Without the instance secret in that folder, the database cannot be read.
5. Start AeroGap and confirm the version in the app menu (Help / About shows
   `Version:`) matches the installer you ran. Apps & Features shows the same
   version on the AeroGap entry.
6. If the older app cannot open data written by the newer one, quit, replace
   `%LOCALAPPDATA%\AeroGap` with the copy from step 1, and start again.

Do not delete `installer-archive` when you clean `Output`.
