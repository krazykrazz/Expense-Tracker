# Quick Build Guide

Fast reference for pulling and promoting the `expense-tracker` Docker image.

## Prerequisites

```bash
gh auth token | docker login ghcr.io -u krazykrazz --password-stdin
```

## Common Commands

### Pull and promote CI-built images

```powershell
# Pull CI-built image for the current commit
.\scripts\build-and-push.ps1

# Promote that image to staging
.\scripts\build-and-push.ps1 -Environment staging

# Promote the same image to production
.\scripts\build-and-push.ps1 -Environment latest
```

### Local build escape hatch

```powershell
.\scripts\build-and-push.ps1 -LocalBuild
.\scripts\build-and-push.ps1 -LocalBuild -MultiPlatform
```

### Automated full release

```powershell
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes"
```

## Verify a Deployment

```bash
docker ps
curl http://localhost:2424/api/health
docker image ls ghcr.io/krazykrazz/expense-tracker
```

## Tag Meanings

- `latest`: production environment tag
- `staging`: staging environment tag
- `vX.Y.Z`: release tags
- `<sha>`: immutable CI-built commit image

## Notes

- `build-and-push.ps1` defaults to the repo's `docker-compose.yml`.
- CI is the source of truth for normal builds; use `-LocalBuild` only when testing Dockerfile or image-build changes.

For the full workflow, see [SHA-Based Containers](./SHA_BASED_CONTAINERS.md) and [Deployment Workflow](./DEPLOYMENT_WORKFLOW.md).