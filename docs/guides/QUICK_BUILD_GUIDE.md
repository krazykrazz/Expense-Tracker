# Quick Deployment Guide

Fast reference for pulling and promoting the expense-tracker Docker image.

## Prerequisites

```bash
# Authenticate to GHCR (if not already)
gh auth token | docker login ghcr.io -u krazykrazz --password-stdin
```

## Quick Commands

### Pull and Promote (Normal Workflow)

```powershell
# Pull CI-built image for current commit
.\scripts\build-and-push.ps1

# Pull and promote to staging
.\scripts\build-and-push.ps1 -Environment staging

# Promote to production
.\scripts\build-and-push.ps1 -Environment latest
```

### Local Build (Escape Hatch)

```powershell
# Build locally (only for testing Dockerfile changes)
.\scripts\build-and-push.ps1 -LocalBuild

# Multi-platform local build
.\scripts\build-and-push.ps1 -LocalBuild -MultiPlatform
```

### Automated Full Deployment

```powershell
# Version bump + push + wait for CI + staging + production
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes"
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

# SHA image not found? CI may still be building.
# Check GitHub Actions for build status.

# Need to build locally? (escape hatch)
.\scripts\build-and-push.ps1 -LocalBuild
```

## Tags

- **latest**: Production (promoted locally from CI-built image)
- **staging**: Pre-production testing (promoted locally)
- **v{x.y.z}**: Version-specific releases (built by CI)
- **{sha}**: Immutable SHA-tagged images (built by CI)

---

For detailed documentation, see [SHA-Based Containers](../deployment/SHA_BASED_CONTAINERS.md)
