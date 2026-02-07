@echo off
echo Stopping Expense Tracker servers...
echo.
echo NOTE: This script stops local Node.js servers only.
echo To stop Docker containers, use: docker-compose down
echo.

REM Kill Node.js processes on port 2424 (backend)
echo Stopping Backend Node.js (Port 2424)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :2424') do (
    for /f "tokens=1" %%b in ('tasklist /FI "PID eq %%a" /NH ^| findstr "node.exe"') do (
        echo Stopping Node.js process (PID: %%a)
        taskkill /F /PID %%a >nul 2>&1
    )
)

REM Kill Node.js processes on port 5173 (frontend)
echo Stopping Frontend Node.js (Port 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    for /f "tokens=1" %%b in ('tasklist /FI "PID eq %%a" /NH ^| findstr "node.exe"') do (
        echo Stopping Node.js process (PID: %%a)
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo.
echo Local Node.js servers stopped!
echo Docker containers remain running (use 'docker-compose down' to stop them)
echo.
pause
