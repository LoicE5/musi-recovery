@echo off
setlocal

where /q bun.exe
if errorlevel 1 (
  echo Install Bun from https://bun.sh, then reopen this launcher.
  goto :failed
)

pushd "%~dp0"
if errorlevel 1 (
  echo Windows could not open the folder containing this launcher.
  goto :failed
)

bun.exe setup.ts || goto :run_failed

echo.
echo Use the Apple Account that previously acquired Musi.
bun.exe musi.ts || goto :run_failed

echo.
echo Connect only your iPhone with a USB cable and unlock it.
echo Tap Trust if the iPhone asks whether to trust this computer.
echo In Apple Devices, check that your iPhone appears.
echo Use the same Apple Account for Media and Purchases on the iPhone.
echo Press any key when the iPhone is ready.
pause >nul

bun.exe musi.ts install || goto :run_failed

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
