# Expense Tracker - Startup Guide

## Quick Start (Docker - Recommended)

### Using Pre-Built Images from GHCR

The easiest way to run the application is using pre-built images from GitHub Container Registry:

```bash
docker pull ghcr.io/krazykrazz/expense-tracker:latest
docker run -d -p 2424:2424 -v expense-data:/app/backend/database ghcr.io/krazykrazz/expense-tracker:latest
```

Or use docker-compose with the GHCR image:

```yaml
version: '3.8'
services:
  expense-tracker:
    image: ghcr.io/krazykrazz/expense-tracker:latest
    container_name: expense-tracker
    ports:
      - "2424:2424"
    volumes:
      - expense-data:/app/backend/database
    restart: unless-stopped
volumes:
  expense-data:
```

Access the app at http://localhost:2424

**Benefits:**
- ✅ No build required - pull and run
- ✅ Automatic database persistence via volumes
- ✅ Easy updates with new releases
- ✅ Multi-platform support (amd64, arm64)

For detailed Docker deployment instructions, see [Docker Deployment Guide](DOCKER_DEPLOYMENT.md).

## Development Mode

### Prerequisites

Before first run, install dependencies:

```bash
npm run install-all
```

Or manually:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Starting Development Servers

**Backend (Port 2424):**
```bash
cd backend
npm start
```

**Frontend (Port 5173):**
```bash
cd frontend
npm run dev
```

Access the development app at http://localhost:5173

### Auto-Reload Features

**Frontend (Vite):**
- ✅ Automatically reloads on file changes
- Watches: `.jsx`, `.js`, `.css` files in `frontend/src/`
- Hot Module Replacement (HMR) for instant updates

**Backend (Nodemon):**
- ✅ Automatically restarts on file changes
- Watches: `.js` files in `backend/`
- Configured via `nodemon.json`

### Stopping Development Servers

- Press `Ctrl+C` in each terminal window
- Or close the terminal windows

## Building for Production

### Local Build

To build the frontend for production:

```bash
cd frontend
npm run build
```

The built files will be in `frontend/dist/` and served by the backend on port 2424.

### Docker Build (Developers)

For local development and testing, you can build Docker images using the SHA-based workflow:

```powershell
# Build SHA-tagged image
.\scripts\build-and-push.ps1

# Deploy to staging for testing
.\scripts\build-and-push.ps1 -Environment staging

# Promote to production
.\scripts\build-and-push.ps1 -Environment latest
```

See [SHA-Based Container Deployment](../deployment/SHA_BASED_CONTAINERS.md) for details.

### Version Releases

For official version releases, use the automated deployment script:

```powershell
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes"
```

This handles version bumping, changelog updates, building, tagging, and deployment automatically. Version numbering starts from 1.0.0 following the migration consolidation rebase.

See [Version Management](../../.kiro/steering/versioning.md) for details.

## Troubleshooting

### Port Already in Use

**Backend (Port 2424):**
```bash
# Windows
netstat -ano | findstr :2424
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:2424 | xargs kill -9
```

**Frontend (Port 5173):**
```bash
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:5173 | xargs kill -9
```

### Docker Container Won't Start

Check container logs:
```bash
docker logs expense-tracker
```

Verify the image exists:
```bash
docker images | grep expense-tracker
```

### Changes Not Reloading

1. Verify nodemon is running (backend terminal shows "watching for changes")
2. Verify Vite dev server is running (frontend terminal)
3. Try hard refresh in browser: `Ctrl + Shift + R`
4. Check for syntax errors in the terminal output

### Database Issues

If you encounter database errors, the SQLite file may be corrupted:

```bash
# Backup current database
cp backend/database/expenses.db backend/database/expenses.db.backup

# Start fresh (development only!)
rm backend/database/expenses.db
npm start  # Will recreate from consolidated schema (backend/database/schema.js)
```

## Network Access

To access the application from other devices on your local network:

### Find Your IP Address

**Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" (e.g., 192.168.1.100)

**Linux/Mac:**
```bash
ifconfig
# or
ip addr show
```

### Access from Other Devices

- **Development**: `http://YOUR_IP:5173`
- **Production**: `http://YOUR_IP:2424`
- **Docker**: `http://YOUR_IP:2424`

### Firewall Configuration

**Windows:**
```cmd
netsh advfirewall firewall add rule name="Expense Tracker Dev" dir=in action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="Expense Tracker Prod" dir=in action=allow protocol=TCP localport=2424
```

**Linux (ufw):**
```bash
sudo ufw allow 2424/tcp
sudo ufw allow 5173/tcp
```

## Testing

### Run All Tests

**Backend:**
```bash
cd backend
npm test
```

**Frontend:**
```bash
cd frontend
npm test
```

### Run Specific Test Suites

See [Testing Conventions](../../.kiro/steering/testing.md) for detailed test commands and patterns.

## Additional Resources

- [User Guide](USER_GUIDE.md) - Feature documentation
- [Docker Deployment Guide](DOCKER_DEPLOYMENT.md) - Production deployment
- [Database Schema](../DATABASE_SCHEMA.md) - Database structure
- [API Documentation](../API_DOCUMENTATION.md) - API endpoints
- [Feature Branch Workflow](../development/FEATURE_BRANCH_WORKFLOW.md) - Git workflow
- [Docker Deployment](./DOCKER_DEPLOYMENT.md) - Production deployment guide
