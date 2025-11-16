# Implementation Plan

- [ ] 1. Create backend configuration modules for paths, logging, and timezone
  - Create `backend/config/paths.js` module with functions to manage /config directory structure
  - Create `backend/config/logger.js` module with LOG_LEVEL environment variable support
  - Create `backend/config/timezone.js` module with SERVICE_TZ environment variable support
  - Implement directory creation logic with fallback for development environments
  - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 2. Update database initialization to use /config directory
  - Modify `backend/database/db.js` to import and use paths configuration
  - Replace hardcoded DB_PATH with dynamic path from `getDatabasePath()`
  - Call `ensureDirectories()` before database initialization
  - Update database connection logic to handle /config directory
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 3. Update backup service to use /config directory
  - Modify `backend/services/backupService.js` to import paths configuration
  - Replace hardcoded backup paths with `getBackupPath()` and `getBackupConfigPath()`
  - Remove absolute path validation logic (always use /config)
  - Update default configuration to use /config paths
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 4. Create enhanced health check endpoint
  - Create `backend/routes/healthRoutes.js` with comprehensive health check
  - Implement database connectivity test in health check
  - Include uptime, version, and timestamp in health response
  - Return HTTP 503 for unhealthy state, HTTP 200 for healthy
  - Add health route to `backend/server.js`
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 5. Update server startup with new configuration modules
  - Modify `backend/server.js` to import and configure timezone at startup
  - Replace console.log statements with logger module calls
  - Log environment configuration (LOG_LEVEL, SERVICE_TZ, PORT) on startup
  - Update frontend static file serving path to `/app/frontend/dist`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6. Create multi-stage Dockerfile for unified container
  - Create new `Dockerfile` in root directory with three stages
  - Implement frontend-builder stage: install deps, build React app
  - Implement backend-deps stage: install production dependencies only
  - Implement runtime stage: copy artifacts, create non-root user, set up /config
  - Install tzdata package for timezone support
  - Create appuser with uid 1000 and gid 1000
  - Set ownership of /config to appuser
  - Add HEALTHCHECK instruction using wget
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 7. Update .dockerignore for optimized build context
  - Replace `.dockerignore` with comprehensive exclusion patterns
  - Exclude node_modules, .git, development files, and test files
  - Exclude existing database and backup files
  - Exclude documentation except README.md
  - Exclude scripts, batch files, and OS-specific files
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 8. Create production docker-compose.yml configuration
  - Replace `docker-compose.yml` with unified container configuration
  - Configure single service named "expense-tracker"
  - Set container_name to "expense-tracker"
  - Map port 2424 to host
  - Configure volume mount for /config directory
  - Add environment variables: LOG_LEVEL, SERVICE_TZ, NODE_ENV
  - Add healthcheck configuration with 30s interval
  - Set restart policy to unless-stopped
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 8.5_

- [ ] 9. Create GitHub Actions workflow for GHCR publishing
  - Create `.github/workflows/docker-publish.yml` workflow file
  - Configure triggers: push to main, version tags, manual dispatch
  - Add job to checkout code and set up Docker Buildx
  - Add step to log in to GHCR using GITHUB_TOKEN
  - Add step to extract metadata for tags and labels
  - Add step to build and push multi-platform image (linux/amd64, linux/arm64)
  - Configure image tags: latest, git SHA, version tags
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4_

- [ ] 10. Create comprehensive Docker documentation
  - Create `DOCKER.md` with architecture overview and build instructions
  - Update `README.md` with Quick Start section for Docker deployment
  - Document all environment variables with descriptions and defaults
  - Document /config directory structure and volume mounting
  - Add backup and restore procedures for /config directory
  - Add troubleshooting section for common container issues
  - Document GHCR image location and pull commands
  - Add update procedure for pulling new versions
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 11. Test unified container build and deployment
  - Build Docker image locally and verify size < 300MB
  - Test container startup with default configuration
  - Verify /config directory structure is created automatically
  - Test with LOG_LEVEL=debug and verify debug logs appear
  - Test with SERVICE_TZ=America/New_York and verify timezone
  - Test data persistence by creating expense, restarting container
  - Test health check endpoint returns correct status
  - Verify frontend loads at http://localhost:2424
  - Verify API endpoints work correctly
  - Test backup creation and verify files in /config/backups
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 12. Archive old Docker configuration files
  - Move `backend/Dockerfile` to `backend/Dockerfile.old`
  - Move `frontend/Dockerfile` to `frontend/Dockerfile.old`
  - Move `docker-compose.prod.yml` to `docker-compose.prod.yml.old`
  - Add note in archived files pointing to new unified Dockerfile
  - Update .gitignore to exclude *.old files
  - _Requirements: 1.1, 6.1_
