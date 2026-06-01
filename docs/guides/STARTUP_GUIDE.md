# Expense Tracker - Startup Guide

This guide covers the fastest ways to run the application locally, either with Docker or in local development mode.

## Quick Start (Docker)

The easiest way to run the app is with the pre-built GHCR image:

```bash
docker pull ghcr.io/krazykrazz/expense-tracker:latest
docker run -d -p 2424:2424 -v ./config:/config ghcr.io/krazykrazz/expense-tracker:latest
```

Or with Docker Compose:

```yaml
version: '3.8'

services:
  expense-tracker:
    image: ghcr.io/krazykrazz/expense-tracker:latest
    container_name: expense-tracker
    ports:
      - "2424:2424"
    volumes:
      - ./config:/config
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - TZ=Etc/UTC
    restart: unless-stopped
```

Access the app at `http://localhost:2424`.

### Persisted Data

The container stores persistent data under `/config`, including:

- `/config/database/expenses.db`
- `/config/backups/`
- `/config/config/`
- `/config/invoices/`
- `/config/statements/`

For full Docker details, see [Docker Deployment Guide](DOCKER_DEPLOYMENT.md).

## Development Mode

### Prerequisites

Install all dependencies from the repo root:

```bash
npm run install-all
```

### Start Development Servers

Backend server:

```bash
cd backend
npm start
```

The backend listens on `http://localhost:2626` by default in local development.

Frontend dev server:

```bash
cd frontend
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend on port `2626`.

### Production Build Output

To build the frontend bundle:

```bash
cd frontend
npm run build
```

The built files are written to `frontend/dist/` and are served by the backend when running the production app.
In local development the backend default is port `2626`; in Docker the container sets `PORT=2424`.

## Authentication Modes

The app supports two runtime modes:

- **Open mode**: no password configured, the app opens directly.
- **Password gate**: a password has been configured, and users must log in.

From a Docker or production user's perspective, nothing special is required at startup beyond accessing the app. If password protection has already been enabled, the login screen appears automatically.

## Common Developer Tasks

### Build and promote a Docker image

```powershell
.\scripts\build-and-push.ps1 -Environment staging
.\scripts\build-and-push.ps1 -Environment latest
```

See [SHA-Based Container Deployment](../deployment/SHA_BASED_CONTAINERS.md) for the full maintainer workflow.

### Run tests

Backend:

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm test
```

See [Testing Steering](../steering/testing.md) for the canonical test commands.

## Troubleshooting

### Port already in use

Backend (development port `2626`):

```bash
# Windows
netstat -ano | findstr :2626
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:2626 | xargs kill -9
```

Frontend (port `5173`):

```bash
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:5173 | xargs kill -9
```

### Docker container will not start

```bash
docker logs expense-tracker
docker images | grep expense-tracker
```

### Database issues in local development

In local development the app uses `backend/config/database/expenses.db`.

```bash
# Backup current development database
cp backend/config/database/expenses.db backend/config/database/expenses.db.backup

# Start fresh (development only)
rm backend/config/database/expenses.db
cd backend && npm start
```

In Docker and other containerized environments, the database lives at `/config/database/expenses.db` inside the container.

## Network Access

- Development frontend: `http://YOUR_IP:5173`
- Docker / production container: `http://YOUR_IP:2424`

## Additional Resources

- [User Guide](USER_GUIDE.md)
- [Docker Deployment Guide](DOCKER_DEPLOYMENT.md)
- [API Documentation](../API_DOCUMENTATION.md)
- [Database Schema](../DATABASE_SCHEMA.md)
- [Feature Branch Workflow](../development/FEATURE_BRANCH_WORKFLOW.md)
