# Silent Mode - Quick Reference

All batch and VBS scripts are located in `scripts/windows/`.

## Starting the App (No Windows)

### Development Mode (with auto-reload)
```
Double-click: scripts/windows/start-silent.vbs
```
- Runs in background
- Auto-reloads on file changes
- Access at: http://localhost:5173

### Production Mode
```
Double-click: scripts/windows/start-silent-prod.vbs
```
- Runs in background
- Single server
- Access at: http://localhost:2424

## Stopping the App

```
Double-click: scripts/windows/stop-servers-silent.vbs
```
Or run: `scripts\windows\stop-servers.bat`

## Windows Auto-Startup (Silent)

1. Press `Win + R`
2. Type: `shell:startup`
3. Create shortcut to `scripts/windows/start-silent.vbs`
4. Done! App starts silently on boot

## Checking if App is Running

Open browser and go to:
- Development: http://localhost:5173
- Production: http://localhost:2424

Or check Task Manager for `node.exe` processes.

## Benefits of Silent Mode

✅ No terminal windows cluttering your screen
✅ Runs completely in background
✅ Perfect for auto-startup
✅ Brief notification when starting/stopping
✅ Still has auto-reload for development

## Files Overview

All files in `scripts/windows/`:

| File | Purpose |
|------|---------|
| `start-silent.vbs` | Start dev mode (silent) |
| `start-silent-prod.vbs` | Start production (silent) |
| `stop-servers-silent.vbs` | Stop all servers (silent) |
| `stop-servers.bat` | Stop all servers (with output) |
| `start-dev.bat` | Start dev mode (with terminals) |
| `start-prod.bat` | Start production (with terminal) |

## Troubleshooting

**App not starting?**
- Check if ports 2424 or 5173 are already in use
- Run `scripts\windows\stop-servers.bat` first to clean up

**No notification popup?**
- The app is still starting, just without notification
- Wait 5 seconds and check http://localhost:5173

**Want to see logs?**
- Use `scripts\windows\start-dev.bat` instead to see terminal output
- Useful for debugging
