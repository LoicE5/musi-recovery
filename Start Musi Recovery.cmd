@echo off
setlocal DisableDelayedExpansion

set "MUSI_BUN="
for /f "delims=" %%I in ('""%SystemRoot%\System32\where.exe" $PATH:bun.exe"') do if not defined MUSI_BUN set "MUSI_BUN=%%~fI"
if not defined MUSI_BUN (
  echo Install Bun from https://bun.sh, then reopen this launcher.
  goto :failed
)

pushd "%~dp0"
if errorlevel 1 (
  echo Windows could not open the folder containing this launcher.
  goto :failed
)

"%MUSI_BUN%" --no-env-file setup.ts || goto :run_failed
"%MUSI_BUN%" --no-env-file musi.ts --windows-launcher || goto :run_failed

popd
pause
exit /b 0

:run_failed
popd
:failed
echo.
echo Musi Recovery stopped. Read the message above before closing this window.
pause
exit /b 1
