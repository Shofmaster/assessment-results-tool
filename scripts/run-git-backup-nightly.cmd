@echo off
setlocal

set "REPO_DIR=%~dp0.."
for %%I in ("%REPO_DIR%") do set "REPO_DIR=%%~fI"

if "%GIT_MIRROR_OUT_DIR%"=="" (
  set "GIT_MIRROR_OUT_DIR=%REPO_DIR%\backups\git-mirror"
)

if not exist "%REPO_DIR%\backups\git-mirror" mkdir "%REPO_DIR%\backups\git-mirror"

set "LOG_FILE=%REPO_DIR%\backups\git-mirror\backup-nightly.log"

echo [%DATE% %TIME%] Starting nightly git mirror backup >> "%LOG_FILE%"
cd /d "%REPO_DIR%"
call npm run backup:git:run >> "%LOG_FILE%" 2>&1

if errorlevel 1 (
  echo [%DATE% %TIME%] Nightly git mirror backup FAILED >> "%LOG_FILE%"
  exit /b 1
)

echo [%DATE% %TIME%] Nightly git mirror backup completed successfully >> "%LOG_FILE%"
exit /b 0
