@echo off
setlocal
title Road Network Control Agent Demo

cd /d "%~dp0"

echo ========================================
echo   Road Network Control Agent Demo
echo ========================================
echo.

where node.exe >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    echo Install Node.js 20.19 or later, then run this file again.
    echo Download: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found. Check the Node.js installation.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
    echo [SETUP] Installing project dependencies for the first run...
    call npm.cmd ci
    if errorlevel 1 (
        echo.
        echo [ERROR] Dependency installation failed. Check the network and retry.
        echo.
        pause
        exit /b 1
    )
    echo.
)

if /i "%~1"=="--check" (
    echo [OK] Node.js, npm, and project dependencies are ready.
    exit /b 0
)

set "VITE_CACHE_DIR=node_modules\.vite-launch"
if exist "%VITE_CACHE_DIR%" rd /s /q "%VITE_CACHE_DIR%" >nul 2>nul
if exist "%VITE_CACHE_DIR%" (
    set "VITE_CACHE_DIR=%TEMP%\road-network-demo-vite-%RANDOM%-%RANDOM%"
    echo [INFO] The previous cache is busy. Using a temporary cache instead.
)

echo [START] Starting the demo. The browser will open automatically...
echo [INFO] Keep this window open. Close it to stop the demo.
echo.

call npm.cmd run dev -- --host 127.0.0.1 --open
set "START_EXIT_CODE=%ERRORLEVEL%"

if defined VITE_CACHE_DIR if exist "%VITE_CACHE_DIR%" rd /s /q "%VITE_CACHE_DIR%" >nul 2>nul

if not "%START_EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] The demo failed to start. Review the error above.
    echo.
    pause
    exit /b 1
)

endlocal
