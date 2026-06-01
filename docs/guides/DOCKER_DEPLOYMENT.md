# Docker Deployment Guide

This guide covers running the Expense Tracker with pre-built images from GitHub Container Registry.

## Quick Start

Pull the latest image and run it with a bind mount for persistent data:

```bash
docker pull ghcr.io/krazykrazz/expense-tracker:latest
docker run -d -p 2424:2424 -v ./config:/config ghcr.io/krazykrazz/expense-tracker:latest
```

The app is available at `http://localhost:2424`.

## Recommended Compose Setup

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
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:2424/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Start it with:

```bash
docker compose up -d
```

The repo also includes [docker-compose.ghcr.yml](../../docker-compose.ghcr.yml) as a minimal GHCR deployment example.

## Available Tags

- `latest`: current production tag
- `staging`: pre-production validation tag
- `vX.Y.Z`: release tags, for example `v1.9.1`
- `<git-sha>`: immutable commit-tagged images used by the promotion workflow

For production, prefer a specific release tag when you want a fixed version.

## Persistent Data Layout

All persistent data lives under `/config` inside the container.

Typical structure:

```text
/config
├── backups/
├── config/
├── database/
│   └── expenses.db
├── invoices/
└── statements/
```

That means the correct host mount is:

```bash
-v ./config:/config
```

Do not mount only `/app/backend/database`; the application persists more than the SQLite file.

## Authentication Behavior

The container can run in either:

- **Open mode**: no password is configured.
- **Password gate**: a password has already been configured and users must log in.

From a deployment perspective there is no extra startup flag required for normal use. If password protection is already enabled, the login screen appears automatically.

## Updating the Container

### Docker Compose

```bash
docker compose pull
docker compose up -d
```

### Docker CLI

```bash
docker pull ghcr.io/krazykrazz/expense-tracker:latest
docker stop expense-tracker
docker rm expense-tracker
docker run -d -p 2424:2424 -v ./config:/config ghcr.io/krazykrazz/expense-tracker:latest
```

## Backup and Restore

### Application-level backup

Use the built-in backup and restore features from the UI.

### Manual backup

To copy the live database from the running container:

```bash
docker cp expense-tracker:/config/database/expenses.db ./backup-$(date +%Y%m%d).db
```

To back up the entire persisted data set, copy the host `config/` directory.

### Manual restore

```bash
docker cp ./backup-20260209.db expense-tracker:/config/database/expenses.db
docker restart expense-tracker
```

For full restore workflows, see [Restore Backup Guide](RESTORE_BACKUP_GUIDE.md).

## Troubleshooting

### Container will not start

```bash
docker logs expense-tracker
```

### Port 2424 already in use

Map a different host port:

```bash
docker run -d -p 3000:2424 -v ./config:/config ghcr.io/krazykrazz/expense-tracker:latest
```

### Permissions issues with bind mounts

Make sure the host `config/` directory is writable by a container running as UID `1000`.

### Health checks failing

```bash
docker inspect expense-tracker | grep -A 10 Health
docker logs expense-tracker
```

## Security Notes

- The container listens on port `2424` by default.
- Helmet, rate limiting, and the application auth system are enabled in the app itself.
- If you expose the app beyond a trusted local network, put it behind TLS and appropriate network controls.
- Keep images updated and prefer fixed version tags in production.

## Related Docs

- [Startup Guide](STARTUP_GUIDE.md)
- [Restore Backup Guide](RESTORE_BACKUP_GUIDE.md)
- [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md)
- [SHA-Based Container Deployment](../deployment/SHA_BASED_CONTAINERS.md)
