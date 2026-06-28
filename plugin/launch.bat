@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "LOGDIR=%SCRIPT_DIR%log"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul
echo [%DATE% %TIME%] launch.bat started > "%LOGDIR%\launch.log"
echo SCRIPT_DIR: %SCRIPT_DIR% >> "%LOGDIR%\launch.log"

set "NODE_EXE="

if exist "%PROGRAMFILES%\HotSpot\StreamDock\Helpers\node20.exe" (
    set "NODE_EXE=%PROGRAMFILES%\HotSpot\StreamDock\Helpers\node20.exe"
) else if exist "%LOCALAPPDATA%\Programs\HotSpot\StreamDock\Helpers\node20.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\Programs\HotSpot\StreamDock\Helpers\node20.exe"
) else if exist "%PROGRAMFILES(X86)%\HotSpot\StreamDock\Helpers\node20.exe" (
    set "NODE_EXE=%PROGRAMFILES(X86)%\HotSpot\StreamDock\Helpers\node20.exe"
) else if exist "%PROGRAMFILES%\fifine Control Deck\Helpers\node20.exe" (
    set "NODE_EXE=%PROGRAMFILES%\fifine Control Deck\Helpers\node20.exe"
) else if exist "%LOCALAPPDATA%\Programs\fifine Control Deck\Helpers\node20.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\Programs\fifine Control Deck\Helpers\node20.exe"
)

if "%NODE_EXE%"=="" (
    echo No bundled node found, trying system node >> "%LOGDIR%\launch.log"
    where node >> "%LOGDIR%\launch.log" 2>&1
    set "NODE_EXE=node"
) else (
    echo Found node: %NODE_EXE% >> "%LOGDIR%\launch.log"
)

echo Running node with args: %* >> "%LOGDIR%\launch.log"
"%NODE_EXE%" "%SCRIPT_DIR%build\index.js" %*
echo Exit code: %ERRORLEVEL% >> "%LOGDIR%\launch.log"
