@echo off
setlocal
title Road Network Control Agent Demo

cd /d "%~dp0"

echo ========================================
echo   Road Network Control Agent Demo
echo ========================================
echo.

set "NODE_EXE="
set "NPM_CMD="
set "PNPM_CMD="

for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NPM_CMD if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NPM_CMD if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" set "NPM_CMD=%LOCALAPPDATA%\Programs\nodejs\npm.cmd"

set "CODEX_RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
if not defined NODE_EXE if exist "%CODEX_RUNTIME%\node\bin\node.exe" set "NODE_EXE=%CODEX_RUNTIME%\node\bin\node.exe"
if not defined NPM_CMD if exist "%CODEX_RUNTIME%\bin\fallback\pnpm.cmd" set "PNPM_CMD=%CODEX_RUNTIME%\bin\fallback\pnpm.cmd"

if not defined NODE_EXE (
    echo [ERROR] Node.js was not found.
    echo Install Node.js ^20.19.0 or ^>=22.12.0, then run this file again.
    echo Download: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

"%NODE_EXE%" -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22 ? 0 : 1)"
if errorlevel 1 (
    echo [ERROR] The installed Node.js version is not supported.
    "%NODE_EXE%" --version
    echo Install Node.js ^20.19.0 or ^>=22.12.0, then run this file again.
    echo.
    pause
    exit /b 1
)

for %%I in ("%NODE_EXE%") do set "PATH=%%~dpI;%PATH%"


if not exist "node_modules\.bin\vite.cmd" (
    echo [SETUP] Installing project dependencies for the first run...
    if defined NPM_CMD (
        call "%NPM_CMD%" ci
    ) else (
        if not defined PNPM_CMD (
            echo [ERROR] npm or pnpm was not found. Dependencies cannot be installed.
            echo.
            pause
            exit /b 1
        )
        call "%PNPM_CMD%" install --no-frozen-lockfile
    )
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
    "%NODE_EXE%" -e "console.log('[OK] Node.js ' + process.version + ' and project dependencies are ready.')"
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

if defined NPM_CMD (
    call "%NPM_CMD%" run dev -- --host 127.0.0.1 --open
) else (
    "%NODE_EXE%" scripts\sync-llm-keys.mjs
    if errorlevel 1 (
        echo [ERROR] Failed to prepare the local service configuration.
        pause
        exit /b 1
    )
    "%NODE_EXE%" node_modules\vite\bin\vite.js --host 127.0.0.1 --open
)
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
