@echo off
REM Navigate to project root (two levels up from scripts/windows/)
cd /d "%~dp0..\.."

REM Build and Push Script for Local Docker Registry (Windows Batch Wrapper)
REM This script calls the PowerShell script with appropriate parameters

setlocal

REM Default values
set TAG=latest
set REGISTRY=localhost:5000
set MULTI_PLATFORM=

REM Parse command line arguments
:parse_args
if "%~1"=="" goto end_parse
if /i "%~1"=="--tag" (
    set TAG=%~2
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--dev" (
    set TAG=dev
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
echo Expense Tracker - Build and Push
echo ========================================
echo Tag: %TAG%
echo Registry: %REGISTRY%
echo.

REM Check if PowerShell is available
where pwsh >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Using PowerShell Core...
    pwsh -ExecutionPolicy Bypass -File "%~dp0..\build-and-push.ps1" -Tag %TAG% -Registry %REGISTRY% %MULTI_PLATFORM%
) else (
    where powershell >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo Using Windows PowerShell...
        powershell -ExecutionPolicy Bypass -File "%~dp0..\build-and-push.ps1" -Tag %TAG% -Registry %REGISTRY% %MULTI_PLATFORM%
    ) else (
        echo ERROR: PowerShell is not available
        exit /b 1
    )
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo Build and push failed!
    exit /b 1
)

echo.
echo Build and push completed successfully!
endlocal
