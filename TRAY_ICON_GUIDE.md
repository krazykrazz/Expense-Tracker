# System Tray Icon - Quick Guide

## Starting the Tray Icon

**Double-click:** `start-tray-icon.vbs`

The icon will appear in your system tray (bottom-right corner of Windows taskbar, near the clock).

## Using the Tray Icon

### Right-Click Menu Options:

1. **Open Expense Tracker** - Opens the app in your default browser
2. **Start Servers** - Starts backend and frontend servers
3. **Stop Servers** - Stops all running servers
4. **Exit** - Closes the tray icon and stops all servers

### Double-Click:
- Opens the app directly in your browser (http://localhost:5173)

## Features

✅ **Auto-start servers** - Servers start automatically when tray icon launches
✅ **No terminal windows** - Everything runs in background
✅ **Easy control** - Right-click menu for all actions
✅ **Notifications** - Balloon tips show status updates
✅ **Auto-reload** - Code changes refresh automatically
✅ **Clean exit** - Stops all servers when you exit

## Windows Auto-Startup

To start the tray icon automatically when Windows boots:

1. Press `Win + R`
2. Type: `shell:startup`
3. Create a shortcut to `start-tray-icon.vbs`
4. Done!

## Troubleshooting

### Can't see the tray icon?
- Click the up arrow (^) in the system tray to show hidden icons
- The icon looks like a generic application icon

### PowerShell execution policy error?
Run this command as Administrator:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Icon not starting?
- Make sure you have PowerShell 5.0 or later
- Check Windows version (works on Windows 10/11)
- Try running `start-tray-icon.bat` to see any errors

### Servers not starting?
- Right-click icon → Stop Servers
- Wait 5 seconds
- Right-click icon → Start Servers

## Files

| File | Purpose |
|------|---------|
| `start-tray-icon.vbs` | Launch tray icon (silent) |
| `start-tray-icon.bat` | Launch tray icon (shows errors) |
| `tray-icon.ps1` | PowerShell script (don't run directly) |

## Comparison with Other Methods

| Method | Tray Icon | Terminals | Silent VBS |
|--------|-----------|-----------|------------|
| System tray control | ✅ | ❌ | ❌ |
| No windows | ✅ | ❌ | ✅ |
| Easy start/stop | ✅ | ✅ | ❌ |
| Auto-reload | ✅ | ✅ | ✅ |
| Best for | Daily use | Development | Auto-startup |

## Recommended Setup

**For daily use:**
1. Add `start-tray-icon.vbs` to Windows Startup folder
2. Icon appears on boot
3. Right-click to control servers
4. Double-click to open app

**For development:**
1. Use tray icon for background servers
2. Keep browser open with app
3. Edit code - changes reload automatically
4. Right-click icon to restart if needed
