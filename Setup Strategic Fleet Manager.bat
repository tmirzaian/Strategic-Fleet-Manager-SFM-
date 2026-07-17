@echo off
setlocal

pushd "%~dp0"

echo ==========================================================
echo  Strategic Fleet Manager - Setup
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js was not found on this computer.
    echo.
    echo Strategic Fleet Manager requires Node.js 18 or newer.
    echo Please install it from https://nodejs.org/ and run this
    echo setup again afterward.
    echo.
    popd
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm was not found on this computer.
    echo.
    echo npm is installed together with Node.js. Please install
    echo Node.js 18 or newer from https://nodejs.org/ and run this
    echo setup again afterward.
    echo.
    popd
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node --version') do set "NODE_VERSION=%%v"
for /f "delims=" %%v in ('npm --version') do set "NPM_VERSION=%%v"

echo Detected Node.js version: %NODE_VERSION%
echo Detected npm version:     %NPM_VERSION%
echo ( Strategic Fleet Manager requires Node.js 18 or newer. )
echo.
echo Installing dependencies - this may take a few minutes...
echo.

call npm install
set "INSTALL_RESULT=%errorlevel%"

if not "%INSTALL_RESULT%"=="0" (
    echo.
    echo ==========================================================
    echo  Setup FAILED - npm install exited with code %INSTALL_RESULT%
    echo ==========================================================
    echo.
    echo Strategic Fleet Manager was NOT set up successfully.
    echo Please review the messages above before trying again, or
    echo share them when reporting an issue.
    echo.
    popd
    pause
    exit /b %INSTALL_RESULT%
)

echo.
echo ==========================================================
echo  Setup complete!
echo ==========================================================
echo.
echo Next step: double-click "Start Strategic Fleet Manager.bat"
echo.

popd
pause
exit /b 0
