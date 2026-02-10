# Docker Deployment Guide

This guide covers deploying the Expense Tracker using pre-built Docker images from GitHub Container Registry (GHCR).

## Prerequisites

- Docker installed and running
- Internet connection to pull images from GHCR

## Quick Start

### Pull and Run

Pull the latest stable release:

```bash
docker pull ghcr.io/krazykrazz/expense-tracker:latest
docker run -d -p 2424:2424 -v expense-data:/app/backend/database ghcr.io/krazykrazz/expense-tracker:latest
```

Access the application at http://localhost:2424

### Using Docker Compose

Create a `docker-compose.yml` file:

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

Start the application:

```bash
docker-compose up -d
```

## Available Tags

Images are available with the following tags:

- `latest` - Latest stable release (recommended for production)
- `v5.8.1` - Specific version tags (e.g., v5.8.1, v5.8.0)
- `staging` - Pre-release testing builds

### Using Specific Versions

For production deployments, it's recommended to use specific version tags:

```bash
docker pull ghcr.io/krazykrazz/expense-tracker:v5.8.1
docker run -d -p 2424:2424 -v expense-data:/app/backend/database ghcr.io/krazykrazz/expense-tracker:v5.8.1
```

Or in docker-compose.yml:

```yaml
services:
  expense-tracker:
    image: ghcr.io/krazykrazz/expense-tracker:v5.8.1
    # ... rest of configuration
```

## Data Persistence

The application stores data in an SQLite database. To persist data across container restarts:

### Using Named Volumes (Recommended)

```bash
docker run -d \
  -p 2424:2424 \
  -v expense-data:/app/backend/database \
  ghcr.io/krazykrazz/expense-tracker:latest
```

### Using Bind Mounts

```bash
docker run -d \
  -p 2424:2424 \
  -v /path/on/host:/app/backend/database \
  ghcr.io/krazykrazz/expense-tracker:latest
```

## Network Access

By default, the application is accessible on:
- Local machine: http://localhost:2424
- Local network: http://YOUR_IP:2424

To restrict access to localhost only:

```bash
docker run -d -p 127.0.0.1:2424:2424 -v expense-data:/app/backend/database ghcr.io/krazykrazz/expense-tracker:latest
```

## Updating to New Versions

1. Pull the new version:
   ```bash
   docker pull ghcr.io/krazykrazz/expense-tracker:latest
   ```

2. Stop and remove the old container:
   ```bash
   docker stop expense-tracker
   docker rm expense-tracker
   ```

3. Start a new container with the updated image:
   ```bash
   docker run -d -p 2424:2424 -v expense-data:/app/backend/database ghcr.io/krazykrazz/expense-tracker:latest
   ```

With docker-compose:

```bash
docker-compose pull
docker-compose up -d
```

## Backup and Restore

### Backup

The application includes built-in backup functionality accessible through the Settings page. Backups are stored in the database volume.

To manually backup the database:

```bash
docker cp expense-tracker:/app/backend/database/expenses.db ./backup-$(date +%Y%m%d).db
```

### Restore

To restore from a backup:

```bash
docker cp ./backup-20260209.db expense-tracker:/app/backend/database/expenses.db
docker restart expense-tracker
```

## Troubleshooting

### Container Won't Start

Check container logs:
```bash
docker logs expense-tracker
```

### Port Already in Use

If port 2424 is already in use, map to a different port:
```bash
docker run -d -p 3000:2424 -v expense-data:/app/backend/database ghcr.io/krazykrazz/expense-tracker:latest
```

### Database Permissions

If you encounter permission issues with bind mounts, ensure the directory is writable:
```bash
chmod 755 /path/on/host
```

## Multi-Platform Support

Images are available for multiple architectures:
- linux/amd64 (x86_64)
- linux/arm64 (ARM64)

Docker automatically pulls the correct image for your platform.

## Security Considerations

- The application runs on port 2424 by default
- No authentication is built-in - use network-level security (firewall, VPN)
- Keep the Docker image updated to receive security patches
- Use specific version tags in production for stability

## Getting Help

- Check the [User Guide](USER_GUIDE.md) for feature documentation
- Review [Database Schema](../DATABASE_SCHEMA.md) for data structure
- See [GitHub Issues](https://github.com/krazykrazz/expense-tracker/issues) for known issues

## For Developers

If you want to build images locally or contribute to development, see:
- [Development Setup](../development/SETUP.md)
- [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md)
