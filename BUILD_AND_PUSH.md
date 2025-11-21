# Build and Push Documentation

This document describes how to build and push the expense-tracker Docker image to a local registry.

## Overview

The expense-tracker application uses a unified Docker container that includes both the frontend and backend. Images are published to a local Docker registry for easy deployment across your network.

## Prerequisites

1. **Docker** installed and running
2. **Local Docker Registry** running at `localhost:5000`
3. **Git** for version control and metadata extraction

### Setting Up a Local Docker Registry

If you don't have a local registry running, start one with:

```bash
docker run -d -p 5000:5000 --restart=always --name registry registry:2
```

For a registry with persistent storage:

```bash
docker run -d -p 5000:5000 --restart=always --name registry \
  -v /path/to/registry/data:/var/lib/registry \
  registry:2
```

## Build Methods

### Method 1: PowerShell Script (Recommended for Windows)

The PowerShell script provides the most flexibility and features.

#### Basic Usage

```powershell
# Build and push with automatic tag detection (based on git branch)
.\build-and-push.ps1

# Build and push with specific tag
.\build-and-push.ps1 -Tag latest
.\build-and-push.ps1 -Tag dev

# Build for multiple platforms (requires Docker Buildx)
.\build-and-push.ps1 -MultiPlatform

# Use custom registry
.\build-and-push.ps1 -Registry myregistry.local:5000
```

#### Parameters

- `-Tag`: Image tag (`latest` or `dev`). Auto-detected from git branch if not specified.
- `-Registry`: Registry URL (default: `localhost:5000`)
- `-SkipAuth`: Skip registry authentication check
- `-MultiPlatform`: Build for both linux/amd64 and linux/arm64

### Method 2: Batch Script (Simple Windows Wrapper)

The batch script is a simple wrapper around the PowerShell script.

```batch
REM Build and push with default settings
build-and-push.bat

REM Build and push with dev tag
build-and-push.bat --dev

REM Build and push with multi-platform support
build-and-push.bat --multi-platform

REM Build and push with custom registry
build-and-push.bat --registry myregistry.local:5000
```

### Method 3: Manual Docker Commands

For advanced users who want full control:

```bash
# Build the image
docker build -t localhost:5000/expense-tracker:latest -f Dockerfile .

# Push to registry
docker push localhost:5000/expense-tracker:latest
```

## Image Tagging Strategy

### Tag Naming

- **`latest`**: Production-ready images from the `main` branch
- **`dev`**: Development images from the `development` branch

### Retention Policy

- Only the most recent `latest` and `dev` images are kept
- Each push overwrites the previous image with the same tag
- No historical versions are retained (use git to rebuild older versions if needed)

### Version Information

Version information is embedded in image labels:

```bash
# Inspect image labels
docker inspect localhost:5000/expense-tracker:latest | jq '.[0].Config.Labels'
```

Labels include:
- `app.version`: Application version from package.json
- `app.branch`: Git branch
- `org.opencontainers.image.revision`: Git commit SHA
- `org.opencontainers.image.created`: Build timestamp

## Multi-Platform Builds

Multi-platform builds create images that work on both x86_64 (Intel/AMD) and ARM64 (Apple Silicon, Raspberry Pi) architectures.

### Requirements

- Docker Buildx installed (included in Docker Desktop)
- QEMU for cross-platform emulation (automatically set up by Buildx)

### Building Multi-Platform Images

```powershell
# PowerShell
.\build-and-push.ps1 -MultiPlatform

# Batch
build-and-push.bat --multi-platform
```

The first multi-platform build will take longer as it sets up the builder and downloads emulators.

## Pulling and Using Images

### Pull from Local Registry

```bash
# Pull latest production image
docker pull localhost:5000/expense-tracker:latest

# Pull development image
docker pull localhost:5000/expense-tracker:dev
```

### Using with Docker Compose

Update your `docker-compose.yml`:

```yaml
services:
  expense-tracker:
    image: localhost:5000/expense-tracker:latest
    # ... rest of configuration
```

Then:

```bash
# Pull and start
docker-compose pull
docker-compose up -d

# Update to new version
docker-compose pull
docker-compose up -d
```

## Troubleshooting

### Registry Connection Issues

**Problem**: Cannot connect to registry at localhost:5000

**Solutions**:
1. Verify registry is running: `docker ps | grep registry`
2. Start registry if not running: `docker start registry`
3. Check registry health: `curl http://localhost:5000/v2/`

### Build Failures

**Problem**: Docker build fails

**Solutions**:
1. Ensure Docker is running: `docker info`
2. Check disk space: `docker system df`
3. Clean up if needed: `docker system prune`
4. Check Dockerfile syntax

### Push Failures

**Problem**: Cannot push to registry

**Solutions**:
1. Verify registry is accessible: `curl http://localhost:5000/v2/`
2. Check if registry requires authentication
3. Ensure image is tagged correctly with registry prefix

### Multi-Platform Build Issues

**Problem**: Multi-platform build fails

**Solutions**:
1. Ensure Buildx is installed: `docker buildx version`
2. Remove and recreate builder: 
   ```bash
   docker buildx rm expense-tracker-builder
   docker buildx create --name expense-tracker-builder --use
   ```
3. Bootstrap builder: `docker buildx inspect --bootstrap`

### Permission Issues

**Problem**: Permission denied when accessing registry

**Solutions**:
1. Check registry configuration for authentication requirements
2. Ensure Docker daemon has network access
3. On Linux, ensure user is in docker group: `sudo usermod -aG docker $USER`

## Registry Management

### Viewing Images in Registry

```bash
# List repositories
curl http://localhost:5000/v2/_catalog

# List tags for expense-tracker
curl http://localhost:5000/v2/expense-tracker/tags/list
```

### Cleaning Up Old Images

Since we only keep `latest` and `dev` tags, cleanup is minimal. However, you can remove unused layers:

```bash
# Run garbage collection (requires registry restart)
docker exec registry bin/registry garbage-collect /etc/docker/registry/config.yml
```

### Backing Up Registry Data

If you're using persistent storage:

```bash
# Stop registry
docker stop registry

# Backup data directory
tar -czf registry-backup-$(date +%Y%m%d).tar.gz /path/to/registry/data

# Start registry
docker start registry
```

## Best Practices

1. **Always test locally** before pushing to registry
2. **Use `dev` tag** for development and testing
3. **Use `latest` tag** only for production-ready code
4. **Document breaking changes** in CHANGELOG.md
5. **Update version** in package.json before building production images
6. **Test multi-platform images** on target architectures when possible
7. **Monitor registry disk usage** and clean up periodically

## Integration with Deployment

After pushing to the registry, deploy using:

```bash
# On any machine with access to the registry
docker pull localhost:5000/expense-tracker:latest
docker-compose up -d
```

For remote machines, replace `localhost:5000` with your registry's network address (e.g., `192.168.1.100:5000`).

## Security Considerations

### Registry Security

1. **Network isolation**: Keep registry on private network
2. **Authentication**: Consider enabling authentication for production
3. **TLS**: Use HTTPS for registries exposed beyond localhost
4. **Access control**: Limit who can push images

### Image Security

1. **Scan images**: Use `docker scout cves` to check for vulnerabilities
2. **Minimal base**: We use Alpine Linux for smaller attack surface
3. **Non-root user**: Container runs as uid 1000
4. **Regular updates**: Rebuild images regularly to get security patches

## Additional Resources

- [Docker Registry Documentation](https://docs.docker.com/registry/)
- [Docker Buildx Documentation](https://docs.docker.com/buildx/working-with-buildx/)
- [Multi-platform Images](https://docs.docker.com/build/building/multi-platform/)
- [OCI Image Spec](https://github.com/opencontainers/image-spec)
