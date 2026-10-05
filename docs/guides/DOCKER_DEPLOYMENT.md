# Docker Deployment Guide

This guide covers running the Expense Tracker with pre-built images from GitHub Container Registry.

## Quick Start

Pull the latest image and run it with a bind mount for persistent data:

```bash
docker pull ghcr.io/krazykrazz/expense-tracker:latest
docker run -d --name expense-tracker -p 2424:2424 -v ./config:/config ghcr.io/krazykrazz/expense-tracker:latest
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
    # The app needs up to 10s to shut down cleanly; Docker's default is 10s.
    stop_grace_period: 15s
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

The repo also includes [docker-compose.ghcr.yml](../../docker-compose.ghcr.yml) as a minimal GHCR deployment example, and each GitHub Release has a version-pinned `docker-compose-vX.Y.Z.yml` attached. The repo's [docker-compose.yml](../../docker-compose.yml) additionally sets a memory/CPU limit with a matching `NODE_OPTIONS=--max-old-space-size=384`, `no-new-privileges` and `cap_drop: ALL`; see [Container Resource Limits](../deployment/DEPLOYMENT_WORKFLOW.md#container-resource-limits) before copying the limits.

## Environment Variables

| Variable | Default in image | Purpose |
|----------|------------------|---------|
| `PORT` | `2424` | Port the server listens on inside the container |
| `NODE_ENV` | `production` | `production` or `staging` serve the bundled frontend from `/app/frontend/dist` |
| `LOG_LEVEL` | `info` | Logging verbosity (e.g. `debug`) |
| `TZ` | `Etc/UTC` | Process timezone; leave as UTC. The business timezone used for dates is an in-app setting (default `America/Toronto`) |
| `CORS_ORIGIN` | unset | Allowed cross-origin browser origin. Unset means same-origin only (a warning is logged in production) |
| `APP_ENV` | unset | Overrides the environment name reported by `/api/version` and shown in the UI banner |
| `CONFIG_DIR` | unset (`/config` is used) | Root of persistent data |

`IMAGE_TAG`, `GIT_COMMIT` and `BUILD_DATE` are baked in at build time and reported by `/api/version` and `/api/health`.

## Available Tags

- `latest`: the build the maintainer has promoted to production (not every `main` build)
- `staging`: pre-production validation tag
- `vX.Y.Z`: version tags, for example `v1.11.0`. CI re-pushes this tag on every `main` build until the next version bump, so it may include commits made after the release
- `<git-sha>`: immutable commit-tagged images used by the promotion workflow (older ones are periodically cleaned up)

Images are published for `linux/amd64`. For production, prefer a specific version tag when you want a fixed version.

## Persistent Data Layout

All persistent data lives under `/config` inside the container.

Typical structure:

```text
/config
├── backups/
├── config/
│   └── backupConfig.json
├── database/
│   └── expenses.db
├── invoices/
└── statements/
```

That means the correct host mount is:

```bash
-v ./config:/config
```

Do not mount only `/config/database`; the application persists more than the SQLite file.

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
docker run -d --name expense-tracker -p 2424:2424 -v ./config:/config ghcr.io/krazykrazz/expense-tracker:latest
```

## Backup and Restore

### Application-level backup

Use the built-in backup and restore features from the UI. Backups are `.tar.gz` archives containing the database, invoices, statements and backup configuration, written to `/config/backups/` by default.

### Manual backup

The database runs in SQLite WAL mode, so copying `expenses.db` from a running container can miss recent writes. Stop the container first (shutdown checkpoints the WAL), then copy the host `config/` directory:

```bash
docker stop expense-tracker
cp -r ./config ./config-backup-$(date +%Y%m%d)
docker start expense-tracker
```

### Manual restore

```bash
docker stop expense-tracker
rm -f ./config/database/expenses.db-wal ./config/database/expenses.db-shm
cp ./backup-20260209.db ./config/database/expenses.db
docker start expense-tracker
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
docker run -d --name expense-tracker -p 3000:2424 -v ./config:/config ghcr.io/krazykrazz/expense-tracker:latest
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
