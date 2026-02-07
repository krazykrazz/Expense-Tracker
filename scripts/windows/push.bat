@echo off
REM Navigate to project root (two levels up from scripts/windows/)
cd /d "%~dp0..\.."

echo Adding all changes...
git add .

echo.
set /p commit_msg="Enter commit message: "

echo.
echo Committing changes...
git commit -m "%commit_msg%"

echo.
echo Pushing to GitHub...
git push

echo.
echo Done!
pause
