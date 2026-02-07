@echo off
echo ========================================
echo Expense Tracker - Installation
echo ========================================
echo.

echo [1/3] Installing Backend Dependencies...
cd backend
call npm install
cd ..
echo Backend dependencies installed!
echo.

echo [2/3] Installing Frontend Dependencies...
cd frontend
call npm install
cd ..
echo Frontend dependencies installed!
echo.

echo [3/3] Setup Complete!
echo.
echo ========================================
echo Installation Successful!
echo ========================================
echo.
echo Next steps:
echo 1. Run 'start-dev.bat' for development mode (with auto-reload)
echo 2. Run 'start-prod.bat' for production mode
echo 3. See STARTUP_GUIDE.md for auto-startup configuration
echo.
pause
