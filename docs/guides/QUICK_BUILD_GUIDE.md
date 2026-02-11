# Quick Build Guide

Fast reference for building and pushing the expense-tracker Docker image.

## Prerequisites

```bash
# Authenticate to GHCR (if not already)
gh auth token | docker login ghcr.io -u krazykrazz --password-stdin
```

## Quick Commands

### Windows (PowerShell)

```powershell
# Build SHA image and push to GHCR
.\scripts\build-and-push.ps1

# Build and deploy to staging
.\scripts\build-and-push.ps1 -Environment staging

# Promote to production
.\scripts\build-and-push.ps1 -Environment latest

# Multi-platform build (x86_64 + ARM64)
.\scripts\build-and-push.ps1 -MultiPlatform
```

### Manual Docker Commands

```bash
# Build
docker build -t ghcr.io/krazykrazz/expense-tracker:latest .

# Push
docker push ghcr.io/krazykrazz/expense-tracker:latest
```

## Deploy

```bash
# Pull latest image
docker pull ghcr.io/krazykrazz/expense-tracker:latest

# Start with docker-compose
docker compose pull
docker compose up -d
```

## Verify

```bash
# Check running container
docker ps | grep expense-tracker

# Check health
curl http://localhost:2424/api/health

# List GHCR tags
docker image ls ghcr.io/krazykrazz/expense-tracker
```

## Troubleshooting

```bash
# Not authenticated to GHCR?
gh auth token | docker login ghcr.io -u krazykrazz --password-stdin

# Build cache issues?
docker builder prune

# Need to rebuild from scratch?
docker build --no-cache -t ghcr.io/krazykrazz/expense-tracker:latest .
```

## Tags

- **latest**: Production (from `main` branch)
- **staging**: Pre-production testing
- **v{x.y.z}**: Version-specific releases
- **{sha}**: Immutable SHA-tagged images

Each push overwrites the previous image with the same tag.

---

For detailed documentation, see [BUILD_AND_PUSH.md](BUILD_AND_PUSH.md)
