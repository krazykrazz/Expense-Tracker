@echo off
echo ========================================
echo Expense Tracker - Restore Database Backup
echo ========================================
echo.

REM Check if backup file path is provided
if "%~1"=="" (
    echo ERROR: No backup file specified
    echo.
    echo Usage: restore-backup.bat "path\to\backup.db"
    echo Example: restore-backup.bat "backend\database\expenses.db"
    echo Example: restore-backup.bat "backend\backups\expense-tracker-backup-2025-11-19.db"
    echo.
    pause
    exit /b 1
)

REM Check if backup file exists
if not exist "%~1" (
    echo ERROR: Backup file not found: %~1
    echo.
    pause
    exit /b 1
)

echo Step 1: Stopping Docker container...
docker-compose down
echo.

echo Step 2: Creating config directory structure...
if not exist "config\database" mkdir config\database
if not exist "config\backups" mkdir config\backups
if not exist "config\config" mkdir config\config
echo.

echo Step 3: Copying backup to config/database/expenses.db...
copy /Y "%~1" "config\database\expenses.db"
if errorlevel 1 (
    echo ERROR: Failed to copy backup file
    pause
    exit /b 1
)
echo.

echo Step 4: Starting Docker container...
docker-compose up -d
echo.

echo Step 5: Waiting for container to be healthy...
timeout /t 5 /nobreak >nul
docker ps --filter "name=expense-tracker"
echo.

echo ========================================
echo SUCCESS: Database restored!
echo ========================================
echo.
echo Your backup has been loaded into the Docker container.
echo Access the application at: http://localhost:2424
echo.
pause
