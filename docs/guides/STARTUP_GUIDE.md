# Expense Tracker - Automatic Startup Guide

## Quick Start (Development Mode)

### Option 1: System Tray Icon ⭐⭐ BEST for Daily Use
1. Double-click `start-tray-icon.vbs` in the project root
2. Icon appears in system tray (bottom-right of taskbar)
3. Servers start automatically in background
4. **Right-click icon** for menu:
   - Open Expense Tracker (browser)
   - Start/Stop Servers
   - Exit
5. **Double-click icon** to open app in browser
6. Access at http://localhost:5173

### Option 2: Silent Mode (No Windows)
1. Double-click `start-silent.vbs` in the project root
2. Servers start in background (no terminal windows)
3. Brief notification popup appears
4. Access the app at http://localhost:5173
5. **Auto-reload enabled**: Changes to code will automatically refresh
6. To stop: Double-click `stop-servers-silent.vbs`

### Option 2: Visible Terminals (Recommended for Development)
1. Double-click `start-dev.bat` in the project root
2. Two terminal windows will open (Backend and Frontend)
3. Access the app at http://localhost:5173
4. **Auto-reload enabled**: Changes to code will automatically refresh
5. To stop: Close both terminal windows

### Option 3: Production Mode (Silent)
1. Double-click `start-silent-prod.vbs` in the project root
2. Server starts in background
3. Access the app at http://localhost:2424
4. To stop: Double-click `stop-servers-silent.vbs`

### Option 4: Production Mode (Visible)
1. Double-click `start-prod.bat` in the project root
2. Frontend will be built and served by backend
3. Access the app at http://localhost:2424
4. To stop: Close the terminal window

## Auto-Reload Features

### Frontend (Vite)
- ✅ **Already configured** - Vite automatically reloads on file changes
- Watches: `.jsx`, `.js`, `.css` files in `frontend/src/`
- Hot Module Replacement (HMR) for instant updates

### Backend (Nodemon)
- ✅ **Configured with nodemon** - Backend restarts on file changes
- Watches: `.js` files in `backend/`
- Automatically restarts server when you save changes

## Windows Startup (Run on Boot)

### Method 1: Startup Folder - System Tray Icon (Recommended) ⭐⭐

1. Press `Win + R` and type: `shell:startup`
2. Right-click in the folder → New → Shortcut
3. Browse to `start-tray-icon.vbs`
4. Name it "Expense Tracker"
5. The app will start with a system tray icon when Windows boots

**Benefits:**
- ✅ System tray icon for easy control
- ✅ Right-click menu to start/stop servers
- ✅ Double-click to open app
- ✅ No terminal windows
- ✅ Clean and professional

### Method 2: Startup Folder - Silent Mode

1. Press `Win + R` and type: `shell:startup`
2. Right-click in the folder → New → Shortcut
3. Browse to `start-silent.vbs` or `start-silent-prod.vbs`
4. Name it "Expense Tracker"
5. The app will start silently when Windows boots (no windows!)

**To stop the app:**
- Create another shortcut to `stop-servers-silent.vbs` on your desktop
- Or run `stop-servers.bat`

### Method 2: Startup Folder - With Terminals

1. Press `Win + R` and type: `shell:startup`
2. Create a shortcut to `start-dev.bat` or `start-prod.bat`
3. The app will start with visible terminal windows when Windows boots

### Method 3: Task Scheduler (More Control)

**For Silent Mode:**
1. Open Task Scheduler (search in Start menu)
2. Click "Create Basic Task"
3. Name: "Expense Tracker"
4. Trigger: "When I log on"
5. Action: "Start a program"
6. Program: `wscript.exe`
7. Arguments: `"C:\Users\YourUsername\Projects\Expense Tracker\start-silent.vbs"`
8. Finish

**Advanced Options:**
- Run whether user is logged on or not
- Run with highest privileges
- Configure for: Windows 10/11
- Hidden: Check "Hidden" to run completely in background

## Installing Dependencies

Before first run, install nodemon for backend auto-reload:

```cmd
cd backend
npm install
```

This will install nodemon as a dev dependency.

## Stopping the Application

### Silent Mode (No Windows):
- **Easy way**: Double-click `stop-servers-silent.vbs`
- **Manual way**: Run `stop-servers.bat`
- **Command line**: 
  ```cmd
  taskkill /F /IM node.exe
  ```

### With Terminal Windows:
- Close both terminal windows (Backend and Frontend)
- Or press `Ctrl+C` in each terminal

## Troubleshooting

### Port Already in Use
If you see "Port already in use" errors:
```cmd
# Find and kill process on port 2424 (backend)
netstat -ano | findstr :2424
taskkill /PID <PID> /F

# Find and kill process on port 5173 (frontend)
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Nodemon Not Found
```cmd
cd backend
npm install nodemon --save-dev
```

### Changes Not Reloading
1. Check that nodemon is running (you'll see "watching for changes" in backend terminal)
2. Check that Vite dev server is running (frontend terminal)
3. Try hard refresh in browser: `Ctrl + Shift + R`

## Network Access

To access from other devices on your network:

1. Find your local IP address:
   ```cmd
   ipconfig
   ```
   Look for "IPv4 Address" (e.g., 192.168.1.100)

2. Access from other devices:
   - Development: `http://YOUR_IP:5173`
   - Production: `http://YOUR_IP:2424`

3. Make sure Windows Firewall allows the ports:
   ```cmd
   netsh advfirewall firewall add rule name="Expense Tracker Frontend" dir=in action=allow protocol=TCP localport=5173
   netsh advfirewall firewall add rule name="Expense Tracker Backend" dir=in action=allow protocol=TCP localport=2424
   ```

## Recommended Setup for Daily Use

1. **Development** (if you're making changes):
   - Use `start-dev.bat`
   - Keep terminal windows open
   - Enjoy auto-reload on every save

2. **Production** (for regular use):
   - Use `start-prod.bat`
   - Minimize terminal window
   - More stable, less resource usage

3. **Auto-start on Windows Boot**:
   - Add shortcut to Startup folder
   - Use production mode for daily use
   - Use development mode when coding
