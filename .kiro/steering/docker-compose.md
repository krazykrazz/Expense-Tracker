---
inclusion: manual
---

# Docker Compose Configuration

## Custom Compose File Location

The user manages their Docker containers using a custom compose file located at:

```
G:\My Drive\Media Related\docker\media-applications.yml
```

## Container Management Commands

The `build-and-push.ps1` script automatically deploys after building. It maps tags to services:
- `staging` / `dev` → `expense-tracker-test`
- `latest` → `expense-tracker`

Use `-SkipDeploy` to build without restarting containers.

For manual container management, use this compose file:

```powershell
# Pull latest image
docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" pull expense-tracker

# Start/restart the expense-tracker service
docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" up -d expense-tracker

# Stop the expense-tracker service
docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" stop expense-tracker

# View logs
docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" logs -f expense-tracker

# Restart with fresh image
docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" pull expense-tracker
docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" up -d expense-tracker
```

## Service Names

- `expense-tracker-test` - Staging/test environment (uses `:staging` tag)
- Production service name TBD

## Notes

- The compose file is on Google Drive, so ensure the drive is mounted/synced
- Always use the `-f` flag to specify the custom compose file path
