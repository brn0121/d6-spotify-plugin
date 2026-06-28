@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "LOGDIR=%SCRIPT_DIR%log"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul
echo [%DATE% %TIME%] launch.bat v1.0.6 > "%LOGDIR%\launch.log"
echo SCRIPT_DIR: %SCRIPT_DIR% >> "%LOGDIR%\launch.log"

set "NODE_EXE="

:: Check likely locations first (fast)
for %%N in (
    "%LOCALAPPDATA%\HotSpot\StreamDock\Helpers\node20.exe"
    "%LOCALAPPDATA%\Programs\HotSpot\StreamDock\Helpers\node20.exe"
    "%PROGRAMFILES%\HotSpot\StreamDock\Helpers\node20.exe"
    "%PROGRAMFILES(X86)%\HotSpot\StreamDock\Helpers\node20.exe"
    "%LOCALAPPDATA%\Programs\fifine Control Deck\Helpers\node20.exe"
    "%PROGRAMFILES%\fifine Control Deck\Helpers\node20.exe"
) do (
    if exist %%N (
        set "NODE_EXE=%%~N"
        echo Found at hardcoded path: %%~N >> "%LOGDIR%\launch.log"
        goto :run
    )
)

:: Broader search in LocalAppData
echo Searching %LOCALAPPDATA% for node20.exe... >> "%LOGDIR%\launch.log"
for /f "tokens=*" %%F in ('where /r "%LOCALAPPDATA%" node20.exe 2^>nul') do (
    if "!NODE_EXE!"=="" (
        set "NODE_EXE=%%F"
        echo Found via search: %%F >> "%LOGDIR%\launch.log"
    )
)

:: Broader search in Program Files
if "!NODE_EXE!"=="" (
    echo Searching %PROGRAMFILES% for node20.exe... >> "%LOGDIR%\launch.log"
    for /f "tokens=*" %%F in ('where /r "%PROGRAMFILES%" node20.exe 2^>nul') do (
        if "!NODE_EXE!"=="" (
            set "NODE_EXE=%%F"
            echo Found via search: %%F >> "%LOGDIR%\launch.log"
        )
    )
)

:: Fall back to system node
if "!NODE_EXE!"=="" (
    echo No node20.exe found, trying system node >> "%LOGDIR%\launch.log"
    set "NODE_EXE=node"
)

:run
echo NODE_EXE: !NODE_EXE! >> "%LOGDIR%\launch.log"
echo Args: %* >> "%LOGDIR%\launch.log"
"!NODE_EXE!" "%SCRIPT_DIR%build\index.js" %*
echo Exit code: %ERRORLEVEL% >> "%LOGDIR%\launch.log"
