# Expense Tracker - Startup Guide

## Quick Start (Docker - Recommended)

### Docker Deployment (Production)
1. Ensure Docker is installed and running
2. Run `docker-compose up -d` or use `scripts\build-and-push.ps1`
3. Access the app at http://localhost:2424
4. To stop: `docker-compose down`

**Benefits:**
- ✅ Single container deployment
- ✅ Automatic database persistence via volumes
- ✅ Easy updates with image pulls
- ✅ Consistent environment

## Development Mode

### Option 1: Silent Mode (No Windows)
1. Double-click `start-silent.vbs` in `scripts/windows/`
2. Servers start in background (no terminal windows)
3. Brief notification popup appears
4. Access the app at http://localhost:5173
5. **Auto-reload enabled**: Changes to code will automatically refresh
6. To stop: Double-click `scripts/windows/stop-servers-silent.vbs`

### Option 2: Visible Terminals (Recommended for Development)
1. Double-click `start-dev.bat` in `scripts/windows/`
2. Two terminal windows will open (Backend and Frontend)
3. Access the app at http://localhost:5173
4. **Auto-reload enabled**: Changes to code will automatically refresh
5. To stop: Close both terminal windows

### Option 3: Production Mode (Silent)
1. Double-click `start-silent-prod.vbs` in `scripts/windows/`
2. Server starts in background
3. Access the app at http://localhost:2424
4. To stop: Double-click `scripts/windows/stop-servers-silent.vbs`

### Option 4: Production Mode (Visible)
1. Double-click `start-prod.bat` in `scripts/windows/`
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

## Installing Dependencies

Before first run, install dependencies:

```cmd
npm run install-all
```

Or manually:
```cmd
cd backend && npm install
cd ../frontend && npm install
```

## Stopping the Application

### Docker:
- Run `docker-compose down`

### Silent Mode (No Windows):
- **Easy way**: Double-click `scripts/windows/stop-servers-silent.vbs`
- **Manual way**: Run `scripts\windows\stop-servers.bat`
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

## Recommended Setup

1. **Daily Use (Production)**:
   - Use Docker: `docker-compose up -d`
   - Access at http://localhost:2424
   - Stable and resource-efficient

2. **Development** (if you're making changes):
   - Use `scripts\windows\start-dev.bat`
   - Keep terminal windows open
   - Enjoy auto-reload on every save
