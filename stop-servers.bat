@echo off
echo Stopping Expense Tracker servers...
echo.

REM Kill processes on port 2424 (backend)
echo Stopping Backend (Port 2424)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :2424') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Kill processes on port 5173 (frontend)
echo Stopping Frontend (Port 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo All servers stopped!
echo.
pause
