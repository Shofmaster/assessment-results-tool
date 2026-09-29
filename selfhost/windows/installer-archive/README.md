# Desktop installer archive

This folder is the rollback copy of `AeroGapSetup-Desktop-<version>.exe`.

`windows/build-desktop.ps1` copies each setup here before and after Inno
compiles. The next build does not delete this folder and does not overwrite an
archived exe whose bytes differ. A later compile of the same version is stored
beside the original as `AeroGapSetup-Desktop-<version>.<UTC timestamp>.exe`.

The exes and `manifest.json` are gitignored (they are large and local to the
build machine). Copy this folder to your release share. Reinstall by running
the older exe. The signed update feed will not downgrade an install.

Full steps: [selfhost/docs/DESKTOP-ROLLBACK.md](../../docs/DESKTOP-ROLLBACK.md).
