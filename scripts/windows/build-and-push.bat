@echo off
REM Navigate to project root (two levels up from scripts/windows/)
cd /d "%~dp0..\.."

REM Pull-and-Promote Script for GHCR (Windows Batch Wrapper)
REM This script calls the PowerShell script with appropriate parameters

setlocal

REM Default values
set ENVIRONMENT=
set REGISTRY=ghcr.io/krazykrazz
set LOCAL_BUILD=
set MULTI_PLATFORM=

REM Parse command line arguments
:parse_args
if "%~1"=="" goto end_parse
if /i "%~1"=="--environment" (
    set ENVIRONMENT=-Environment %~2
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--staging" (
    set ENVIRONMENT=-Environment staging
    shift
    goto parse_args
)
if /i "%~1"=="--latest" (
    set ENVIRONMENT=-Environment latest
    shift
    goto parse_args
)
if /i "%~1"=="--local-build" (
    set LOCAL_BUILD=-LocalBuild
    shift
    goto parse_args
)
if /i "%~1"=="--multi-platform" (
    set MULTI_PLATFORM=-MultiPlatform
    shift
    goto parse_args
)
if /i "%~1"=="--registry" (
    set REGISTRY=%~2
    shift
    shift
    goto parse_args
)
shift
goto parse_args
:end_parse

echo ========================================
echo Expense Tracker - Pull and Promote
echo ========================================
echo Registry: %REGISTRY%
echo.

REM Check if PowerShell is available
where pwsh >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Using PowerShell Core...
    pwsh -ExecutionPolicy Bypass -File "%~dp0..\build-and-push.ps1" %ENVIRONMENT% -Registry %REGISTRY% %LOCAL_BUILD% %MULTI_PLATFORM%
) else (
    where powershell >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo Using Windows PowerShell...
        powershell -ExecutionPolicy Bypass -File "%~dp0..\build-and-push.ps1" %ENVIRONMENT% -Registry %REGISTRY% %LOCAL_BUILD% %MULTI_PLATFORM%
    ) else (
        echo ERROR: PowerShell is not available
        exit /b 1
    )
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo Operation failed!
    exit /b 1
)

echo.
echo Operation completed successfully!
endlocal
