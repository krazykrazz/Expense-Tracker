# Design Document

## Overview

This design implements a production-ready, unified Docker container for the expense tracker application. The container consolidates the Node.js backend and React frontend into a single deployable unit, standardizes data persistence to a `/config` directory, and provides automated publishing to a local Docker registry. The design emphasizes simplicity, maintainability, and ease of deployment for self-hosted environments.

## Architecture

### Container Architecture

```
┌─────────────────────────────────────────────────────────┐
│  expense-tracker Container (Port 2424)                  │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Node.js Express Server                        │    │
│  │  - API Routes (/api/*)                         │    │
│  │  - Static File Serving (React build)           │    │
│  │  - Health Check Endpoint (/api/health)         │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  /config Directory (Volume Mount)              │    │
│  │  ├── database/                                 │    │
│  │  │   └── expenses.db                           │    │
│  │  ├── backups/                                  │    │
│  │  │   └── expense-tracker-backup-*.db           │    │
│  │  └── config/                                   │    │
│  │      └── backupConfig.json                     │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Environment Variables:                                 │
│  - LOG_LEVEL (debug|info)                              │
│  - SERVICE_TZ (timezone)                               │
│  - PORT (2424)                                         │
└─────────────────────────────────────────────────────────┘
```

### Multi-Stage Build Process

```
Stage 1: Frontend Build
├── Base: node:18-alpine
├── Install frontend dependencies
├── Build React application (npm run build)
└── Output: /app/frontend/dist

Stage 2: Backend Dependencies
├── Base: node:18-alpine
├── Install production dependencies only
└── Output: /app/node_modules

Stage 3: Final Runtime
├── Base: node:18-alpine
├── Copy backend application code
├── Copy frontend build from Stage 1
├── Copy node_modules from Stage 2
├── Create non-root user (uid 1000)
├── Set up /config directory structure
└── Configure healthcheck and entrypoint
```

## Components and Interfaces

### 1. Dockerfile (Multi-Stage Build)

**Location:** `Dockerfile` (root directory)

**Purpose:** Build optimized unified container image

**Stages:**

1. **frontend-builder**
   - Base image: `node:18-alpine`
   - Workdir: `/build/frontend`
   - Actions:
     - Copy `frontend/package*.json`
     - Run `npm ci` (clean install)
     - Copy `frontend/` source
     - Run `npm run build`
   - Output: `/build/frontend/dist`

2. **backend-deps**
   - Base image: `node:18-alpine`
   - Workdir: `/build/backend`
   - Actions:
     - Copy `backend/package*.json`
     - Run `npm ci --only=production`
   - Output: `/build/backend/node_modules`

3. **runtime**
   - Base image: `node:18-alpine`
   - Workdir: `/app`
   - Actions:
     - Install `tzdata` for timezone support
     - Create non-root user `appuser` (uid 1000, gid 1000)
     - Copy backend source to `/app`
     - Copy frontend build to `/app/frontend/dist`
     - Copy production node_modules to `/app/node_modules`
     - Create `/config` directory structure
     - Set ownership to `appuser`
     - Switch to `appuser`
   - Expose: Port 2424
   - Healthcheck: `curl -f http://localhost:2424/api/health || exit 1`
   - CMD: `["node", "server.js"]`

### 2. Backend Configuration Module

**Location:** `backend/config/paths.js` (new file)

**Purpose:** Centralize path configuration with /config directory support

**Interface:**
```javascript
module.exports = {
  getConfigDir: () => string,           // Returns /config or fallback
  getDatabasePath: () => string,        // Returns /config/database/expenses.db
  getBackupPath: () => string,          // Returns /config/backups
  getBackupConfigPath: () => string,    // Returns /config/config/backupConfig.json
  ensureDirectories: () => Promise<void> // Creates directory structure
};
```

**Implementation Details:**
- Check for `/config` directory existence
- Fall back to local paths for development
- Create subdirectories: `database/`, `backups/`, `config/`
- Set appropriate permissions

### 3. Logging Configuration Module

**Location:** `backend/config/logger.js` (new file)

**Purpose:** Configure logging based on LOG_LEVEL environment variable

**Interface:**
```javascript
module.exports = {
  log: (level, message, ...args) => void,
  debug: (message, ...args) => void,
  info: (message, ...args) => void,
  warn: (message, ...args) => void,
  error: (message, ...args) => void,
  getLogLevel: () => string
};
```

**Implementation Details:**
- Read `LOG_LEVEL` environment variable (default: "info")
- Support levels: "debug", "info", "warn", "error"
- Prefix logs with timestamp and level
- Filter logs based on configured level
- Use console methods for output

### 4. Timezone Configuration

**Location:** `backend/config/timezone.js` (new file)

**Purpose:** Configure container timezone based on SERVICE_TZ environment variable

**Interface:**
```javascript
module.exports = {
  configureTimezone: () => void,
  getTimezone: () => string,
  validateTimezone: (tz) => boolean
};
```

**Implementation Details:**
- Read `SERVICE_TZ` environment variable (default: "Etc/UTC")
- Set `TZ` environment variable
- Validate timezone using Intl.DateTimeFormat
- Log configured timezone on startup

### 5. Enhanced Health Check Endpoint

**Location:** `backend/routes/healthRoutes.js` (new file)

**Purpose:** Comprehensive health check with database connectivity

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected",
  "uptime": 3600,
  "version": "3.2.0"
}
```

**Implementation Details:**
- Test database connection with simple query
- Return HTTP 200 if healthy, 503 if unhealthy
- Include uptime in seconds
- Include version from package.json
- Log health check failures

### 6. Database Initialization Updates

**Location:** `backend/database/db.js` (modifications)

**Changes:**
- Import path configuration from `config/paths.js`
- Use `getDatabasePath()` instead of hardcoded path
- Call `ensureDirectories()` before database initialization
- Update `DB_PATH` export to use dynamic path

### 7. Backup Service Updates

**Location:** `backend/services/backupService.js` (modifications)

**Changes:**
- Import path configuration from `config/paths.js`
- Use `getBackupPath()` for backup directory
- Use `getBackupConfigPath()` for config file
- Remove absolute path validation (always use /config)
- Update default paths in config

### 8. Server Startup Updates

**Location:** `backend/server.js` (modifications)

**Changes:**
- Import and configure timezone at startup
- Import and use logger module
- Replace console.log with logger methods
- Add health check route
- Log environment configuration (LOG_LEVEL, SERVICE_TZ)
- Serve frontend from `/app/frontend/dist`

### 9. Docker Compose Configuration

**Location:** `docker-compose.yml` (replacement)

**Purpose:** Simple deployment configuration

**Configuration:**
```yaml
version: '3.8'

services:
  expense-tracker:
    image: localhost:5000/expense-tracker:latest
    container_name: expense-tracker
    ports:
      - "2424:2424"
    volumes:
      - ./config:/config
    environment:
      - LOG_LEVEL=info
      - SERVICE_TZ=Etc/UTC
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:2424/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 10. Automated CI/CD Pipeline

**Location:** `.github/workflows/docker-publish.yml` (new file) or local script

**Purpose:** Automated container build and publish to local Docker registry for both production and development

**Triggers:**
- Push to `main` branch (production)
- Push to `development` branch (development)
- Push of version tags (v*)
- Manual workflow dispatch or script execution

**Steps:**
1. Checkout code
2. Set up Docker Buildx
3. Log in to local registry (if authentication enabled)
4. Determine image tag based on branch:
   - `main` branch → `latest` tag
   - `development` branch → `dev` tag
5. Extract metadata (labels)
6. Build and push multi-platform image (linux/amd64, linux/arm64)
7. Tag and push with single tag (`latest` or `dev`), overwriting previous image

**Image Tagging Strategy:**

**Production Images (main branch):**
- `localhost:5000/expense-tracker:latest` (overwrites previous)

**Development Images (development branch):**
- `localhost:5000/expense-tracker:dev` (overwrites previous)

**Retention Policy:**
- Only the most recent `latest` and `dev` images are kept
- Each push overwrites the previous image with the same tag
- No historical versions or SHA tags are retained
- Minimal storage footprint (2 images total)

**Important Notes:**
- Simple retention strategy - always pull `latest` or `dev` for current version
- No rollback capability (use git to rebuild older versions if needed)
- Minimal registry maintenance required
- Local registry must be accessible from the build environment

**Environment:**
- Registry: `localhost:5000` (or configured registry host)
- Image name: `localhost:5000/expense-tracker`
- Authentication: Optional, based on registry configuration

### 11. .dockerignore Updates

**Location:** `.dockerignore` (replacement)

**Purpose:** Minimize build context

**Exclusions:**
```
# Dependencies
node_modules
npm-debug.log*
package-lock.json

# Development
.git
.gitignore
.env*
.vscode
.kiro

# Build artifacts
dist
build
frontend/dist
frontend/build

# Documentation
*.md
!README.md
docs/

# Tests
**/*.test.js
**/*.spec.js
__tests__/
coverage/

# Scripts
backend/scripts/
*.bat
*.ps1
*.vbs

# Data
backend/database/*.db
backend/backups/
data/
config/

# OS
.DS_Store
Thumbs.db
```

## Data Models

### Configuration Directory Structure

```
/config/
├── database/
│   └── expenses.db              # SQLite database
├── backups/
│   ├── expense-tracker-backup-2024-01-15_10-30-00.db
│   ├── expense-tracker-backup-2024-01-14_10-30-00.db
│   └── ...
└── config/
    └── backupConfig.json        # Backup configuration
```

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | string | `info` | Logging verbosity: `debug` or `info` |
| `SERVICE_TZ` | string | `Etc/UTC` | Timezone for date/time operations |
| `PORT` | number | `2424` | HTTP server port |
| `NODE_ENV` | string | `production` | Node environment |

### Backup Configuration Schema

```json
{
  "enabled": boolean,
  "schedule": "daily" | "weekly",
  "time": "HH:MM",
  "targetPath": "/config/backups",
  "keepLastN": number,
  "lastBackup": "ISO8601 timestamp"
}
```

## Error Handling

### Container Startup Errors

1. **Missing /config directory**
   - Action: Create directory structure automatically
   - Log: Warning about directory creation
   - Fallback: Use local paths if creation fails

2. **Database initialization failure**
   - Action: Log error and exit with code 1
   - Healthcheck: Will fail, triggering restart
   - User action: Check /config permissions

3. **Invalid timezone**
   - Action: Log warning and use UTC
   - Continue startup with default timezone

4. **Port binding failure**
   - Action: Log error and exit with code 1
   - User action: Check port availability

### Runtime Errors

1. **Database connection loss**
   - Healthcheck: Will fail after 3 retries
   - Action: Container restart via Docker
   - Data: Preserved in /config volume

2. **Backup failure**
   - Action: Log error, continue operation
   - Healthcheck: Remains healthy (non-critical)
   - User notification: Via logs

3. **Disk space exhaustion**
   - Action: Log error on write operations
   - Healthcheck: May fail if database writes fail
   - User action: Increase volume size

## Testing Strategy

### Build Testing

1. **Multi-stage build verification**
   - Test: Build image locally
   - Verify: Image size < 300MB
   - Verify: All stages complete successfully
   - Verify: Frontend assets present in final image

2. **Layer caching efficiency**
   - Test: Rebuild with no changes
   - Verify: Most layers use cache
   - Test: Rebuild with code changes only
   - Verify: Only final layers rebuild

### Runtime Testing

1. **Container startup**
   - Test: Start container with default config
   - Verify: Server starts on port 2424
   - Verify: /config directory created
   - Verify: Database initialized
   - Verify: Healthcheck passes

2. **Environment variable configuration**
   - Test: Start with LOG_LEVEL=debug
   - Verify: Debug logs appear
   - Test: Start with SERVICE_TZ=America/New_York
   - Verify: Timestamps use correct timezone

3. **Data persistence**
   - Test: Create expense, stop container, restart
   - Verify: Data persists across restarts
   - Test: Backup creation
   - Verify: Backup files in /config/backups

4. **Health check**
   - Test: Query /api/health endpoint
   - Verify: Returns 200 with status object
   - Test: Stop database
   - Verify: Health check fails

### Integration Testing

1. **Frontend serving**
   - Test: Access http://localhost:2424
   - Verify: React app loads
   - Test: API calls from frontend
   - Verify: Backend responds correctly

2. **Volume mounting**
   - Test: Mount host directory to /config
   - Verify: Database file appears on host
   - Verify: Backups accessible from host

3. **CI/CD pipeline**
   - Test: Push to main branch or run build script
   - Verify: Automated workflow triggers
   - Verify: Image builds successfully
   - Verify: Image pushed to local registry
   - Verify: Image pullable from localhost:5000

### Security Testing

1. **Non-root user**
   - Test: Inspect running container
   - Verify: Process runs as uid 1000
   - Verify: Cannot write outside /config

2. **Image scanning**
   - Test: Run `docker scout cves` on image
   - Verify: No HIGH or CRITICAL vulnerabilities
   - Document: Any accepted vulnerabilities

## Migration Strategy

### Fresh Installation (Empty Database)

1. **Create /config directory structure**
   - `mkdir -p config/database config/backups config/config`

2. **Start container**
   - `docker-compose up -d`
   - Container will create an empty database automatically
   - Verify health check passes

3. **Access application**
   - Navigate to `http://localhost:2424`
   - Start adding expenses

### Restore from Backup

1. **Create /config directory structure**
   - `mkdir -p config/database config/backups config/config`

2. **Copy backup file to config directory**
   - Copy your backup file (e.g., `expense-tracker-backup-2024-01-15.db`) to `config/database/expenses.db`
   - Or use the restore feature in the application UI

3. **Start container**
   - `docker-compose up -d`
   - Container will use the restored database
   - Verify health check passes

### From Current Setup to Unified Container

1. **Backup existing data**
   - Export current database
   - Save backup files

2. **Stop existing containers**
   - `docker-compose down`

3. **Create /config directory structure**
   - `mkdir -p config/database config/backups config/config`

4. **Copy existing data**
   - Copy `backend/database/expenses.db` to `config/database/`
   - Copy backups to `config/backups/`
   - Copy `backend/config/backupConfig.json` to `config/config/`

5. **Update docker-compose.yml**
   - Replace with new unified configuration
   - Update image reference to local registry

6. **Start new container**
   - `docker-compose up -d`
   - Verify health check passes
   - Test application functionality

7. **Cleanup old files**
   - Remove old docker-compose.yml
   - Remove individual Dockerfiles
   - Archive old configuration

## Performance Considerations

### Build Optimization

- **Layer caching:** Package files copied before source code
- **Multi-stage builds:** Separate build artifacts from runtime
- **Production dependencies:** Only production node_modules in final image
- **Alpine base:** Minimal base image size

### Runtime Optimization

- **Static file serving:** Express serves pre-built React assets
- **Database location:** /config on fast storage (SSD recommended)
- **Log rotation:** Docker handles log file rotation
- **Memory limits:** Recommended 512MB for typical usage

### Network Optimization

- **Single port:** Only 2424 exposed, reducing attack surface
- **Health checks:** Lightweight endpoint, minimal overhead
- **Keep-alive:** Express default keep-alive for persistent connections

## Security Considerations

### Container Security

1. **Non-root user:** All processes run as uid 1000
2. **Minimal base image:** Alpine Linux with minimal packages
3. **No package managers:** apk removed after tzdata installation
4. **Read-only filesystem:** Application code read-only, only /config writable
5. **Specific versions:** Base image pinned to node:18-alpine

### Network Security

1. **Single port exposure:** Only 2424 exposed
2. **No privileged ports:** Port 2424 doesn't require root
3. **Health check:** Internal only, no external dependencies

### Data Security

1. **Volume isolation:** /config is only persistent volume
2. **Backup encryption:** User responsibility (volume-level)
3. **Database permissions:** Owned by uid 1000, not accessible by other users

### Supply Chain Security

1. **Base image verification:** Official Node.js images
2. **Dependency scanning:** npm audit during build
3. **Image scanning:** GitHub Actions security scanning
4. **SBOM generation:** Docker buildx generates SBOM

## Documentation Requirements

### README.md Updates

1. **Quick Start section**
   - Docker pull command
   - docker-compose.yml example
   - Environment variable reference

2. **Configuration section**
   - LOG_LEVEL options
   - SERVICE_TZ examples
   - Volume mount requirements

3. **Deployment section**
   - Local registry image location
   - Version tagging strategy
   - Update procedure

4. **Backup and Restore section**
   - Backup location (/config/backups)
   - Manual backup procedure
   - Restore procedure

5. **Troubleshooting section**
   - Common issues
   - Log access
   - Health check debugging

### DOCKER.md (New File)

1. **Architecture overview**
2. **Build instructions**
3. **Development vs production**
4. **CI/CD pipeline details**
5. **Security considerations**
6. **Performance tuning**

## Deployment Workflow

### Development

```bash
# Option 1: Build image locally
docker build -t expense-tracker:dev .

# Option 2: Pull from local registry
docker pull localhost:5000/expense-tracker:dev

# Run with development settings
docker run -d \
  -p 2424:2424 \
  -v $(pwd)/config:/config \
  -e LOG_LEVEL=debug \
  -e SERVICE_TZ=America/New_York \
  --name expense-tracker \
  localhost:5000/expense-tracker:dev
```

### Production (Local Registry)

```bash
# Pull latest production image from local registry
docker pull localhost:5000/expense-tracker:latest

# Run with docker-compose
docker-compose up -d

# View logs
docker logs -f expense-tracker

# Check health
curl http://localhost:2424/api/health
```

### Updates

```bash
# Pull new version
docker-compose pull

# Restart with new image
docker-compose up -d

# Verify health
docker ps
docker logs expense-tracker
```

## Monitoring and Observability

### Health Monitoring

- **Endpoint:** `/api/health`
- **Frequency:** Every 30 seconds
- **Failure threshold:** 3 consecutive failures
- **Startup grace period:** 40 seconds

### Log Monitoring

- **Location:** Docker logs (`docker logs expense-tracker`)
- **Format:** Timestamped JSON-like format
- **Levels:** DEBUG, INFO, WARN, ERROR
- **Rotation:** Docker handles (10MB max, 3 files)

### Metrics

- **Uptime:** Included in health check response
- **Database size:** Monitor /config/database/expenses.db
- **Backup count:** Monitor /config/backups/
- **Container stats:** `docker stats expense-tracker`

## Future Enhancements

1. **Multi-architecture support:** ARM64 for Raspberry Pi
2. **Prometheus metrics:** Expose /metrics endpoint
3. **Structured logging:** JSON format for log aggregation
4. **Configuration file:** Support config.yml in /config
5. **Database migrations:** Automated schema updates
6. **Backup encryption:** Built-in GPG encryption
7. **S3 backup support:** Remote backup storage
8. **HTTPS support:** Built-in TLS termination
