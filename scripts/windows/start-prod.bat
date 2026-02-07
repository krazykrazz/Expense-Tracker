@echo off
echo Starting Expense Tracker (Production Mode)...
echo.

REM Navigate to project root (two levels up from scripts/windows/)
cd /d "%~dp0..\.."

REM Build frontend first
echo [1/2] Building Frontend...
cd frontend
call npm run build
cd ..

REM Start backend server
echo [2/2] Starting Backend Server...
start "Expense Tracker - Server" cmd /k "cd backend && npm start"

echo.
echo ========================================
echo Expense Tracker is running!
echo ========================================
echo.
echo Access the application at:
echo http://localhost:2424
echo.
echo Close the terminal window to stop the server.
echo.
pause
