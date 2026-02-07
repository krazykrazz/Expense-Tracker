@echo off
echo Starting Expense Tracker Development Environment...
echo.

REM Navigate to project root (two levels up from scripts/windows/)
cd /d "%~dp0..\.."

REM Start backend server with auto-reload
echo [1/2] Starting Backend Server with Auto-Reload (Port 2424)...
start "Expense Tracker - Backend" cmd /k "cd backend && npm run dev"

REM Wait a moment for backend to initialize
timeout /t 3 /nobreak >nul

REM Start frontend dev server
echo [2/2] Starting Frontend Dev Server (Port 5173)...
start "Expense Tracker - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo Expense Tracker is starting up!
echo ========================================
echo.
echo Backend:  http://localhost:2424
echo Frontend: http://localhost:5173
echo.
echo Both servers will automatically reload when you make changes.
echo Close the terminal windows to stop the servers.
echo.
pause
