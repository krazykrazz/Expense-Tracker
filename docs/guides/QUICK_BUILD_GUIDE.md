# Quick Build Guide

Fast reference for building and pushing the expense-tracker Docker image.

## Prerequisites

```bash
# Start local registry (if not running)
docker run -d -p 5000:5000 --restart=always --name registry registry:2
```

## Quick Commands

### Windows (PowerShell)

```powershell
# Production build (auto-detects 'main' branch → 'latest' tag)
.\build-and-push.ps1

# Development build (auto-detects 'development' branch → 'dev' tag)
.\build-and-push.ps1

# Force specific tag
.\build-and-push.ps1 -Tag latest
.\build-and-push.ps1 -Tag dev

# Multi-platform build (x86_64 + ARM64)
.\build-and-push.ps1 -MultiPlatform
```

### Windows (Batch)

```batch
# Default build
build-and-push.bat

# Development build
build-and-push.bat --dev

# Multi-platform build
build-and-push.bat --multi-platform
```

### Manual Docker Commands

```bash
# Build
docker build -t localhost:5000/expense-tracker:latest .

# Push
docker push localhost:5000/expense-tracker:latest
```

## Deploy

```bash
# Pull latest image
docker pull localhost:5000/expense-tracker:latest

# Start with docker-compose
docker-compose pull
docker-compose up -d
```

## Verify

```bash
# Check image in registry
curl http://localhost:5000/v2/expense-tracker/tags/list

# Check running container
docker ps | grep expense-tracker

# Check health
curl http://localhost:2424/api/health
```

## Troubleshooting

```bash
# Registry not running?
docker start registry

# Build cache issues?
docker builder prune

# Need to rebuild from scratch?
docker build --no-cache -t localhost:5000/expense-tracker:latest .
```

## Tags

- **latest**: Production (from `main` branch)
- **dev**: Development (from `development` branch)

Each push overwrites the previous image with the same tag.

---

For detailed documentation, see [BUILD_AND_PUSH.md](BUILD_AND_PUSH.md)
