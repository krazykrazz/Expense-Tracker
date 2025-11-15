@echo off
REM Start Expense Tracker with System Tray Icon
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tray-icon.ps1"
