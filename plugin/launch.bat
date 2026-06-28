@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"

for %%N in (
    "%PROGRAMFILES%\HotSpot\StreamDock\Helpers\node20.exe"
    "%PROGRAMFILES(X86)%\HotSpot\StreamDock\Helpers\node20.exe"
    "%LOCALAPPDATA%\Programs\HotSpot\StreamDock\Helpers\node20.exe"
    "%PROGRAMFILES%\fifine Control Deck\Helpers\node20.exe"
    "%LOCALAPPDATA%\Programs\fifine Control Deck\Helpers\node20.exe"
) do (
    if exist %%N (
        %%N "%SCRIPT_DIR%build\index.js" %*
        exit /b
    )
)

node "%SCRIPT_DIR%build\index.js" %*
