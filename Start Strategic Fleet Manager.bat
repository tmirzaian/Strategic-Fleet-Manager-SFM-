@echo off
setlocal

pushd "%~dp0"

echo ==========================================================
echo  Strategic Fleet Manager - Start
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js was not found on this computer.
    echo.
    echo Strategic Fleet Manager requires Node.js 18 or newer.
    echo Please install it from https://nodejs.org/, then run
    echo "Setup Strategic Fleet Manager.bat" before starting the app.
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
    echo Node.js 18 or newer from https://nodejs.org/, then run
    echo "Setup Strategic Fleet Manager.bat" before starting the app.
    echo.
    popd
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Strategic Fleet Manager has not been set up on this computer yet.
    echo.
    echo Please double-click "Setup Strategic Fleet Manager.bat" first,
    echo then run this file again.
    echo.
    popd
    pause
    exit /b 1
)

echo Starting Strategic Fleet Manager...
echo.
echo   Local address: http://localhost:5173
echo.
echo IMPORTANT: keep this window open while using Strategic Fleet
echo Manager. Closing this window stops the application.
echo.

call npm run dev
set "START_RESULT=%errorlevel%"

if not "%START_RESULT%"=="0" (
    echo.
    echo ==========================================================
    echo  Strategic Fleet Manager stopped unexpectedly (code %START_RESULT%)
    echo ==========================================================
    echo.
    popd
    pause
    exit /b %START_RESULT%
)

popd
pause
exit /b 0
