---
inclusion: fileMatch
fileMatchPattern: 'docker-compose*,Dockerfile*'
---

# Docker Compose Rules

## Service Naming

The Docker Compose service name MUST match the GHCR package name: `expense-tracker`

- GHCR package: `ghcr.io/krazykrazz/expense-tracker`
- Image tags: `latest` (production), `staging`, or specific SHA (e.g., `sha-abc1234`)

## Rules

1. Service name in all compose files must be `expense-tracker`
2. Image field: `ghcr.io/krazykrazz/expense-tracker:<tag>`
3. Data volume mount: `expense-data:/app/data`

## Example

```yaml
services:
  expense-tracker:
    image: ghcr.io/krazykrazz/expense-tracker:latest
    ports:
      - "2424:2424"
    volumes:
      - expense-data:/app/data
```

## Container Runtime

- Runs as non-root `node` user (UID 1000) — volume mounts must be writable by UID 1000
- `/config` directory structure created at build time: `database/`, `backups/`, `config/`, `invoices/`, `invoices/temp/`
- Health check: `GET /api/health` via wget (30s interval, 10s timeout, 40s start period)
- Build args: `IMAGE_TAG`, `BUILD_DATE`, `GIT_COMMIT` — exposed as env vars for version tracking
