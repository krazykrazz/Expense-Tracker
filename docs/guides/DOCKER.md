# Docker Deployment Guide

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Build Instructions](#build-instructions)
- [Environment Variables](#environment-variables)
- [Configuration Directory](#configuration-directory)
- [Backup and Restore](#backup-and-restore)
- [Update Procedures](#update-procedures)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## Architecture Overview

The expense tracker application runs as a unified Docker container that combines both the Node.js backend and React frontend into a single deployable unit.

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
└─────────────────────────────────────────────────────────┘
```

### Multi-Stage Build Process

The Docker image is built using a multi-stage process for optimal size and security:

1. **Frontend Build Stage**: Compiles React application into static assets
2. **Backend Dependencies Stage**: Installs production Node.js dependencies
3. **Runtime Stage**: Combines artifacts and creates minimal runtime image

**Key Benefits:**
- Small image size (< 300MB)
- No development dependencies in production
- Optimized layer caching for faster rebuilds
- Secure non-root user execution

## Quick Start

### Prerequisites

- Docker installed and running
- Docker Compose (optional, but recommended)
- Access to local Docker registry at `localhost:5000` (for pulling pre-built images)

### Using Docker Compose (Recommended)

1. **Create a docker-compose.yml file:**

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

2. **Start the container:**

```bash
docker-compose up -d
```

3. **Access the application:**

Open your browser to `http://localhost:2424`

### Using Docker CLI

```bash
# Pull the image from local registry
docker pull localhost:5000/expense-tracker:latest

# Run the container
docker run -d \
  --name expense-tracker \
  -p 2424:2424 \
  -v $(pwd)/config:/config \
  -e LOG_LEVEL=info \
  -e SERVICE_TZ=Etc/UTC \
  -e NODE_ENV=production \
  --restart unless-stopped \
  localhost:5000/expense-tracker:latest
```

## Build Instructions

### Building Locally

To build the Docker image locally from source:

```bash
# Build the image
docker build -t expense-tracker:local .

# Run the locally built image
docker run -d \
  --name expense-tracker \
  -p 2424:2424 \
  -v $(pwd)/config:/config \
  expense-tracker:local
```

### Building for Local Registry

Use the provided PowerShell script to build and push to your local registry:

```powershell
# Build and push with latest tag
.\build-and-push.ps1 -Tag latest

# Build and push with custom tag
.\build-and-push.ps1 -Tag v3.3.0

# Build multi-platform image (x86_64 and ARM64)
.\build-and-push.ps1 -Tag latest -MultiPlatform
```

### Build Optimization

The Dockerfile is optimized for layer caching:

- Package files are copied before source code
- Dependencies are installed in separate stages
- Only production dependencies are included in final image
- Frontend build artifacts are copied from build stage

**Tips for faster builds:**
- Keep `package.json` and `package-lock.json` stable
- Use `.dockerignore` to exclude unnecessary files
- Leverage Docker BuildKit for parallel builds

## Environment Variables

Configure the container behavior using environment variables:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | string | `info` | Logging verbosity: `debug` or `info` |
| `SERVICE_TZ` | string | `Etc/UTC` | Timezone for date/time operations (e.g., `America/New_York`, `Europe/London`) |
| `PORT` | number | `2424` | HTTP server port (usually not changed) |
| `NODE_ENV` | string | `production` | Node environment mode |

### LOG_LEVEL

Controls the verbosity of application logs:

- **`info`** (default): Standard operational logs
- **`debug`**: Detailed debug information including request/response details

**Example:**
```yaml
environment:
  - LOG_LEVEL=debug
```

### SERVICE_TZ

Sets the timezone for all date and time operations in the application:

**Common timezones:**
- `America/New_York` - Eastern Time
- `America/Chicago` - Central Time
- `America/Denver` - Mountain Time
- `America/Los_Angeles` - Pacific Time
- `Europe/London` - UK Time
- `Europe/Paris` - Central European Time
- `Asia/Tokyo` - Japan Time
- `Australia/Sydney` - Australian Eastern Time

**Example:**
```yaml
environment:
  - SERVICE_TZ=America/New_York
```

**Note:** Use standard IANA timezone identifiers. Invalid timezones will fall back to UTC with a warning in logs.

## Configuration Directory

All persistent data is stored in the `/config` directory inside the container. This directory should be mounted as a volume to preserve data across container restarts.

### Directory Structure

```
config/
├── database/
│   └── expenses.db              # SQLite database file
├── backups/
│   ├── expense-tracker-backup-2024-01-15_10-30-00-000Z.db
│   ├── expense-tracker-backup-2024-01-14_10-30-00-000Z.db
│   └── ...                      # Automated backup files
└── config/
    └── backupConfig.json        # Backup configuration settings
```

### Volume Mounting

**Docker Compose:**
```yaml
volumes:
  - ./config:/config
```

**Docker CLI:**
```bash
-v $(pwd)/config:/config
```

**Windows (PowerShell):**
```powershell
-v ${PWD}/config:/config
```

### Permissions

The container runs as a non-root user (UID 1000, GID 1000). Ensure the host directory has appropriate permissions:

```bash
# Linux/Mac
mkdir -p config
chmod 755 config

# The container will automatically create subdirectories
```

### Automatic Directory Creation

When the container starts, it automatically creates the required subdirectories if they don't exist:
- `/config/database/`
- `/config/backups/`
- `/config/config/`

## Backup and Restore

### Automated Backups

The application includes built-in automated backup functionality:

1. **Configure backups** through the web UI (Settings → Backup Settings)
2. **Backup files** are stored in `/config/backups/`
3. **Backup schedule** can be set to daily or weekly
4. **Retention policy** keeps the last N backups (configurable)

### Manual Backup

To manually backup your data:

```bash
# Stop the container
docker-compose down

# Copy the entire config directory
cp -r config config-backup-$(date +%Y%m%d)

# Or just backup the database
cp config/database/expenses.db expenses-backup-$(date +%Y%m%d).db

# Restart the container
docker-compose up -d
```

### Restore from Backup

#### Option 1: Fresh Installation with Empty Database

1. **Create config directory structure:**
```bash
mkdir -p config/database config/backups config/config
```

2. **Start the container:**
```bash
docker-compose up -d
```

3. **Access the application:**
The container will automatically create an empty database. You can now start adding expenses.

#### Option 2: Restore from Backup File

1. **Create config directory structure:**
```bash
mkdir -p config/database config/backups config/config
```

2. **Copy your backup file:**
```bash
# Copy backup as the main database
cp /path/to/backup/expense-tracker-backup-2024-01-15.db config/database/expenses.db
```

3. **Start the container:**
```bash
docker-compose up -d
```

4. **Verify the restore:**
Access the application and confirm your data is present.

#### Option 3: Restore Using Application UI

1. **Start the container** with an empty or existing database
2. **Access the application** at `http://localhost:2424`
3. **Navigate to Settings → Backup Settings**
4. **Use the restore feature** to select and restore from a backup file

### Backup Best Practices

- **Regular backups**: Enable automated daily backups
- **External storage**: Periodically copy `/config/backups/` to external storage
- **Test restores**: Verify backup integrity by testing restore procedures
- **Version control**: Keep backups before major updates or changes
- **Offsite copies**: Store critical backups in a separate location

## Update Procedures

### Pulling New Versions

#### Using Docker Compose

```bash
# Pull the latest image
docker-compose pull

# Stop and remove the old container
docker-compose down

# Start with the new image
docker-compose up -d

# Verify the update
docker logs expense-tracker
```

#### Using Docker CLI

```bash
# Pull the latest image
docker pull localhost:5000/expense-tracker:latest

# Stop and remove the old container
docker stop expense-tracker
docker rm expense-tracker

# Start with the new image
docker run -d \
  --name expense-tracker \
  -p 2424:2424 \
  -v $(pwd)/config:/config \
  -e LOG_LEVEL=info \
  -e SERVICE_TZ=Etc/UTC \
  localhost:5000/expense-tracker:latest

# Verify the update
docker logs expense-tracker
```

### Version Tags

Images are tagged based on the branch:

- **`latest`**: Production releases from the `main` branch
- **`dev`**: Development releases from the `development` branch

**Pull specific version:**
```bash
docker pull localhost:5000/expense-tracker:latest
docker pull localhost:5000/expense-tracker:dev
```

### Update Checklist

Before updating:

1. ✅ **Backup your data** (copy `/config` directory)
2. ✅ **Check release notes** for breaking changes
3. ✅ **Review environment variables** for new options
4. ✅ **Test in development** if possible

After updating:

1. ✅ **Verify health check** passes
2. ✅ **Check logs** for errors
3. ✅ **Test core functionality** (add/edit/delete expenses)
4. ✅ **Verify backups** are working

### Rollback Procedure

If an update causes issues:

```bash
# Stop the current container
docker-compose down

# Restore from backup
rm -rf config
cp -r config-backup-YYYYMMDD config

# Pull previous version (if available) or rebuild from git
git checkout <previous-version-tag>
docker build -t expense-tracker:rollback .

# Update docker-compose.yml to use rollback image
# Then start the container
docker-compose up -d
```

## Troubleshooting

### Container Won't Start

**Symptom:** Container exits immediately after starting

**Possible causes:**

1. **Port already in use:**
```bash
# Check if port 2424 is in use
netstat -an | grep 2424

# Solution: Stop the conflicting service or change the port mapping
ports:
  - "2425:2424"  # Map to different host port
```

2. **Permission issues with /config:**
```bash
# Check permissions
ls -la config/

# Fix permissions (Linux/Mac)
sudo chown -R 1000:1000 config/
chmod -R 755 config/
```

3. **Invalid environment variables:**
```bash
# Check logs for validation errors
docker logs expense-tracker

# Verify timezone is valid
docker run --rm expense-tracker:latest node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"
```

### Health Check Failing

**Symptom:** Container marked as unhealthy

**Diagnosis:**
```bash
# Check health status
docker ps

# View health check logs
docker inspect expense-tracker | grep -A 10 Health

# Check application logs
docker logs expense-tracker
```

**Common causes:**

1. **Database connection issues:**
   - Check `/config/database/` permissions
   - Verify database file is not corrupted
   - Check disk space

2. **Application startup delay:**
   - Health check has 40s start period
   - Check if application is still initializing

3. **Network issues:**
   - Verify container can reach localhost:2424
   - Check firewall rules

### Database Errors

**Symptom:** "Database locked" or "Unable to open database"

**Solutions:**

1. **Stop all containers accessing the database:**
```bash
docker-compose down
docker-compose up -d
```

2. **Check for file corruption:**
```bash
# Verify database integrity
docker exec expense-tracker sqlite3 /config/database/expenses.db "PRAGMA integrity_check;"
```

3. **Restore from backup:**
```bash
docker-compose down
cp config/backups/expense-tracker-backup-latest.db config/database/expenses.db
docker-compose up -d
```

### Application Not Accessible

**Symptom:** Cannot access http://localhost:2424

**Checks:**

1. **Verify container is running:**
```bash
docker ps | grep expense-tracker
```

2. **Check port mapping:**
```bash
docker port expense-tracker
# Should show: 2424/tcp -> 0.0.0.0:2424
```

3. **Test from inside container:**
```bash
docker exec expense-tracker wget -O- http://localhost:2424/api/health
```

4. **Check firewall:**
```bash
# Windows
netsh advfirewall firewall show rule name=all | grep 2424

# Linux
sudo iptables -L | grep 2424
```

### Logs Not Appearing

**Symptom:** No logs visible with `docker logs`

**Solutions:**

1. **Check log level:**
```yaml
environment:
  - LOG_LEVEL=debug  # Increase verbosity
```

2. **View real-time logs:**
```bash
docker logs -f expense-tracker
```

3. **Check Docker logging driver:**
```bash
docker inspect expense-tracker | grep LogConfig
```

### High Memory Usage

**Symptom:** Container using excessive memory

**Diagnosis:**
```bash
# Check container stats
docker stats expense-tracker
```

**Solutions:**

1. **Set memory limits:**
```yaml
services:
  expense-tracker:
    mem_limit: 512m
    mem_reservation: 256m
```

2. **Check for memory leaks:**
```bash
# Monitor over time
docker stats expense-tracker --no-stream
```

3. **Restart container periodically:**
```yaml
restart: unless-stopped
```

### Backup Files Growing Too Large

**Symptom:** `/config/backups/` consuming too much disk space

**Solutions:**

1. **Configure retention policy:**
   - Access Settings → Backup Settings in the UI
   - Set "Keep Last N Backups" to a lower number (e.g., 7)

2. **Manual cleanup:**
```bash
# Keep only last 7 backups
cd config/backups
ls -t expense-tracker-backup-*.db | tail -n +8 | xargs rm
```

3. **Move old backups to external storage:**
```bash
# Archive old backups
tar -czf backups-archive-$(date +%Y%m%d).tar.gz config/backups/*.db
mv backups-archive-*.tar.gz /external/storage/
```

### Time Zone Not Working

**Symptom:** Timestamps showing wrong timezone

**Diagnosis:**
```bash
# Check container timezone
docker exec expense-tracker date
docker exec expense-tracker cat /etc/timezone
```

**Solutions:**

1. **Verify SERVICE_TZ is set correctly:**
```yaml
environment:
  - SERVICE_TZ=America/New_York
```

2. **Check for typos in timezone name:**
```bash
# List valid timezones
docker exec expense-tracker ls /usr/share/zoneinfo/
```

3. **Restart container after changing timezone:**
```bash
docker-compose restart
```

## Security Considerations

### Non-Root User

The container runs as a non-root user (UID 1000, GID 1000) for security:

- Limits potential damage from container escape vulnerabilities
- Prevents privilege escalation attacks
- Follows Docker security best practices

### Network Security

- **Single port exposure:** Only port 2424 is exposed
- **No privileged ports:** Port 2424 doesn't require root privileges
- **Internal health checks:** Health endpoint is for Docker only

### Data Security

- **Volume isolation:** Only `/config` is writable
- **Database encryption:** Consider encrypting the volume at the host level
- **Backup security:** Protect backup files with appropriate permissions

### Image Security

- **Minimal base image:** Uses Alpine Linux for smaller attack surface
- **No development tools:** Production image excludes dev dependencies
- **Regular updates:** Keep base image and dependencies updated

### Best Practices

1. **Use HTTPS:** Put container behind reverse proxy with TLS
2. **Firewall rules:** Restrict access to port 2424
3. **Regular updates:** Pull new images regularly for security patches
4. **Backup encryption:** Encrypt sensitive backup files
5. **Access control:** Implement authentication if exposing to internet
6. **Network isolation:** Use Docker networks to isolate containers
7. **Scan images:** Regularly scan for vulnerabilities

### Recommended Reverse Proxy Setup

For production deployments, use a reverse proxy with HTTPS:

**Nginx example:**
```nginx
server {
    listen 443 ssl http2;
    server_name expenses.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:2424;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Traefik example:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.expense-tracker.rule=Host(`expenses.example.com`)"
  - "traefik.http.routers.expense-tracker.entrypoints=websecure"
  - "traefik.http.routers.expense-tracker.tls.certresolver=letsencrypt"
```

---

## Additional Resources

- **GitHub Repository:** [Link to repository]
- **Issue Tracker:** [Link to issues]
- **Release Notes:** See `CHANGELOG.md`
- **Build Documentation:** See `BUILD_AND_PUSH.md`

## Support

For issues, questions, or contributions:

1. Check this documentation first
2. Review the troubleshooting section
3. Check existing GitHub issues
4. Create a new issue with:
   - Container logs (`docker logs expense-tracker`)
   - Docker version (`docker --version`)
   - Host OS and version
   - Steps to reproduce the issue
