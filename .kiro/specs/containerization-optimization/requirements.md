# Requirements Document

## Introduction

This specification defines requirements for creating a production-ready, unified Docker container for the expense tracker application. The current implementation uses separate containers for frontend and backend services. This feature will consolidate both services into a single container image, implement automated publishing to GitHub Container Registry (GHCR), standardize data persistence to a /config directory, and provide configurable logging and timezone support. The goal is to create a simple, maintainable containerized application suitable for self-hosted deployment.

## Glossary

- **Application**: The expense tracker full-stack web application
- **Unified_Container**: A single Docker container running both the Node.js backend and serving the React frontend
- **Backend_Service**: The Node.js Express API service
- **Frontend_Assets**: The built React application static files served by the Backend_Service
- **Build_Stage**: A phase in multi-stage Docker builds that produces intermediate artifacts
- **Config_Directory**: The /config directory inside the container where all persistent data is stored
- **Health_Endpoint**: An HTTP endpoint that reports service health status
- **Base_Image**: The foundational Docker image (node:18-alpine) used to build the container
- **GHCR**: GitHub Container Registry, the registry where container images are published
- **CI_Pipeline**: GitHub Actions workflow that builds and publishes container images
- **Log_Level**: The verbosity of application logging (debug or info)
- **Service_Timezone**: The timezone configuration for the container's date/time operations

## Requirements

### Requirement 1

**User Story:** As a self-hoster, I want a single unified container that runs both frontend and backend, so that deployment is simplified with fewer moving parts

#### Acceptance Criteria

1. THE Unified_Container SHALL build the Frontend_Assets in a Build_Stage and copy them to the Backend_Service directory
2. THE Backend_Service SHALL serve the Frontend_Assets as static files from the built React application
3. THE Unified_Container SHALL expose only port 2424 for external access
4. WHEN users access port 2424, THE Backend_Service SHALL serve the frontend application for browser requests
5. WHEN API requests are made to port 2424, THE Backend_Service SHALL handle them with the Express API routes

### Requirement 2

**User Story:** As a self-hoster, I want all persistent data stored in /config directory, so that I can easily manage data with a single volume mount

#### Acceptance Criteria

1. THE Unified_Container SHALL store the SQLite database file in the Config_Directory at /config/database
2. THE Unified_Container SHALL store backup files in the Config_Directory at /config/backups
3. WHEN the Application starts, THE Backend_Service SHALL create the Config_Directory structure if it does not exist
4. THE Backend_Service SHALL write all persistent data exclusively to paths within the Config_Directory
5. WHEN the container is removed, THE Config_Directory SHALL be the only location requiring volume persistence

### Requirement 3

**User Story:** As a DevOps engineer, I want container images automatically published to GitHub Container Registry, so that I can pull the latest version without manual builds

#### Acceptance Criteria

1. THE CI_Pipeline SHALL build the Unified_Container image on every push to the main branch
2. THE CI_Pipeline SHALL tag images with both "latest" and the git commit SHA
3. THE CI_Pipeline SHALL publish built images to GHCR at ghcr.io/[username]/expense-tracker
4. THE CI_Pipeline SHALL authenticate to GHCR using GitHub Actions secrets
5. WHEN a new version is tagged, THE CI_Pipeline SHALL also publish an image with the version tag

### Requirement 4

**User Story:** As a system administrator, I want configurable log levels via environment variable, so that I can control logging verbosity without rebuilding the container

#### Acceptance Criteria

1. THE Unified_Container SHALL accept an environment variable LOG_LEVEL with values "debug" or "info"
2. WHEN LOG_LEVEL is set to "debug", THE Backend_Service SHALL output detailed debug logs
3. WHEN LOG_LEVEL is set to "info", THE Backend_Service SHALL output standard informational logs only
4. WHEN LOG_LEVEL is not set, THE Backend_Service SHALL default to "info" level logging
5. THE Backend_Service SHALL apply the Log_Level configuration to all logging output including Express middleware and application logs

### Requirement 5

**User Story:** As a self-hoster in a specific timezone, I want to configure the container timezone, so that timestamps in logs and data reflect my local time

#### Acceptance Criteria

1. THE Unified_Container SHALL accept an environment variable SERVICE_TZ for timezone configuration
2. WHEN SERVICE_TZ is set, THE Unified_Container SHALL configure the system timezone to the specified value
3. THE Backend_Service SHALL use the Service_Timezone for all date and time operations
4. WHEN SERVICE_TZ is not set, THE Unified_Container SHALL default to "Etc/UTC" timezone
5. THE Unified_Container SHALL validate that the SERVICE_TZ value is a valid timezone identifier

### Requirement 6

**User Story:** As a system administrator, I want the container named "expense-tracker", so that it is easily identifiable in Docker commands and logs

#### Acceptance Criteria

1. THE docker-compose configuration SHALL set the container name to "expense-tracker"
2. WHEN the container is started, THE Unified_Container SHALL be identifiable as "expense-tracker" in docker ps output
3. THE documentation SHALL reference the container by the name "expense-tracker" in all examples
4. THE CI_Pipeline SHALL tag the image repository as "expense-tracker"
5. THE Unified_Container SHALL include a label with the application name "expense-tracker"

### Requirement 7

**User Story:** As a DevOps engineer, I want multi-stage Docker builds with optimized layer caching, so that build times are minimized and image sizes are reduced

#### Acceptance Criteria

1. THE Unified_Container SHALL use multi-stage builds with separate stages for frontend build, backend dependencies, and final runtime
2. WHEN Docker builds execute, THE Unified_Container SHALL order COPY commands to maximize layer cache reuse by copying package files before application code
3. THE final runtime stage SHALL exclude development dependencies and build tools
4. THE Unified_Container SHALL use the Base_Image node:18-alpine for minimal image size
5. THE final image SHALL be smaller than 300MB in size

### Requirement 8

**User Story:** As a system administrator, I want container health checks implemented, so that unhealthy containers are automatically detected and restarted

#### Acceptance Criteria

1. THE Backend_Service SHALL expose a Health_Endpoint at /api/health that returns HTTP 200 when operational
2. THE Unified_Container SHALL include a HEALTHCHECK instruction that queries the Health_Endpoint every 30 seconds
3. IF a health check fails 3 consecutive times, THEN THE Unified_Container SHALL be marked as unhealthy
4. THE Health_Endpoint SHALL verify database connectivity before returning success
5. THE docker-compose configuration SHALL restart the container automatically when marked unhealthy

### Requirement 9

**User Story:** As a security engineer, I want the container to run as a non-root user, so that security vulnerabilities are mitigated

#### Acceptance Criteria

1. THE Unified_Container SHALL create and run as a non-root user with UID 1000
2. WHEN the container starts, THE Unified_Container SHALL set ownership of the Config_Directory to the non-root user
3. THE Unified_Container SHALL not require root privileges for any runtime operations
4. THE Dockerfile SHALL use the USER instruction to switch to the non-root user before CMD
5. THE non-root user SHALL have read and write permissions only for the Config_Directory

### Requirement 10

**User Story:** As a developer, I want clear documentation for deploying and managing the containerized application, so that setup is straightforward

#### Acceptance Criteria

1. THE documentation SHALL provide a docker-compose.yml example with the Config_Directory volume mount
2. THE documentation SHALL list all supported environment variables with descriptions and default values
3. THE documentation SHALL include commands for pulling the image from GHCR
4. THE documentation SHALL document the process for backing up and restoring the Config_Directory
5. THE documentation SHALL provide troubleshooting steps for common container issues
