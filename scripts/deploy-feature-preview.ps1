#!/usr/bin/env pwsh
# Feature Branch Preview Deployment Script
# Builds and deploys feature branches to preview containers for testing before merge

param(
    [Parameter(Mandatory=$false)]
    [string]$Registry = 'localhost:5000',

    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild,

    [Parameter(Mandatory=$false)]
    [switch]$SkipDeploy,

    [Parameter(Mandatory=$false)]
    [switch]$Stop
)

# Color output functions
function Write-Info { Write-Host "INFO: $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "SUCCESS: $args" -ForegroundColor Green }
function Write-ErrorMsg { Write-Host "ERROR: $args" -ForegroundColor Red }
function Write-Warn { Write-Host "WARNING: $args" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Feature Branch Preview Deployment" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Docker is not running. Please start Docker and try again."
        exit 1
    }
} catch {
    Write-ErrorMsg "Docker is not available. Please install Docker and try again."
    exit 1
}

# Handle stop request
if ($Stop) {
    Write-Info "Stopping preview container..."
    docker-compose -f docker-compose.preview.yml down
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Preview container stopped and removed"
    } else {
        Write-ErrorMsg "Failed to stop preview container"
        exit 1
    }
    exit 0
}

# Get git metadata
$gitSha = git rev-parse --short HEAD 2>$null
$gitBranch = git rev-parse --abbrev-ref HEAD 2>$null
$buildDate = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
$version = (Get-Content backend/package.json | ConvertFrom-Json).version

if (-not $gitSha) {
    Write-ErrorMsg "Failed to get git SHA. Are you in a git repository?"
    exit 1
}

# Prevent running on main branch
if ($gitBranch -eq "main") {
    Write-ErrorMsg "Cannot deploy preview from main branch. Use build-and-push.ps1 for main deployments."
    Write-Info "Feature previews are for testing feature branches before merging to main."
    exit 1
}

# Sanitize branch name for Docker tag (replace / with -)
$branchTag = $gitBranch -replace '/', '-'
$imageName = "$Registry/expense-tracker"
$shaImage = "${imageName}:${gitSha}"
$previewImage = "${imageName}:preview-${branchTag}"

Write-Info "Preview deployment metadata:"
Write-Info "  Version: $version"
Write-Info "  Git SHA: $gitSha"
Write-Info "  Git Branch: $gitBranch"
Write-Info "  Build Date: $buildDate"
Write-Info "  SHA Image: $shaImage"
Write-Info "  Preview Tag: preview-${branchTag}"

# Check if SHA image already exists
$imageExists = docker images -q $shaImage 2>$null

if ($SkipBuild -and -not $imageExists) {
    Write-ErrorMsg "Cannot skip build - SHA image does not exist: $shaImage"
    Write-Info "Run without -SkipBuild to build the image first."
    exit 1
}

# Build SHA image if needed
if (-not $SkipBuild) {
    if ($imageExists) {
        Write-Info "SHA image already exists: $shaImage"
        Write-Info "Skipping build (use existing image)"
    } else {
        Write-Info "Building SHA image: $shaImage"

        # Build frontend first (required for Docker image)
        Write-Info "Building frontend..."
        Push-Location frontend
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Frontend build failed"
            Pop-Location
            exit 1
        }
        Pop-Location
        Write-Success "Frontend built successfully"

        # Build arguments for labels
        $buildArgs = @(
            "build",
            "-t", $shaImage,
            "-f", "Dockerfile",
            "--build-arg", "IMAGE_TAG=$gitSha",
            "--build-arg", "BUILD_DATE=$buildDate",
            "--build-arg", "GIT_COMMIT=$gitSha",
            "--label", "org.opencontainers.image.created=$buildDate",
            "--label", "org.opencontainers.image.version=$version",
            "--label", "org.opencontainers.image.revision=$gitSha",
            "--label", "org.opencontainers.image.source=https://github.com/yourusername/expense-tracker",
            "--label", "org.opencontainers.image.title=expense-tracker",
            "--label", "org.opencontainers.image.description=Personal expense tracking application",
            "--label", "app.name=expense-tracker",
            "--label", "app.version=$version",
            "--label", "app.branch=$gitBranch",
            "--label", "app.sha=$gitSha",
            "--label", "app.preview=true",
            "."
        )

        & docker $buildArgs

        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Build failed"
            exit 1
        }

        Write-Success "SHA image built successfully"

        # Push SHA image to registry
        Write-Info "Pushing SHA image to registry..."
        docker push $shaImage

        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Push failed"
            exit 1
        }

        Write-Success "SHA image pushed to registry"
    }
}

# Tag for preview
Write-Info "Tagging SHA image for preview: preview-${branchTag}"
docker tag $shaImage $previewImage

if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "Failed to tag image for preview"
    exit 1
}

Write-Info "Pushing preview tag to registry..."
docker push $previewImage

if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "Failed to push preview tag"
    exit 1
}

Write-Success "Preview tag pushed: $previewImage"

# Deploy to preview container if not skipped
if (-not $SkipDeploy) {
    Write-Info "Deploying to preview container..."

    # Check if docker-compose.preview.yml exists
    if (-not (Test-Path "docker-compose.preview.yml")) {
        Write-ErrorMsg "docker-compose.preview.yml not found"
        Write-Info "Create docker-compose.preview.yml in the project root to enable preview deployments."
        exit 1
    }

    # Set environment variable for branch tag
    $env:PREVIEW_BRANCH_TAG = $branchTag

    Write-Info "Pulling latest preview image..."
    docker-compose -f docker-compose.preview.yml pull expense-tracker-preview 2>$null

    Write-Info "Starting preview container..."
    docker-compose -f docker-compose.preview.yml up -d expense-tracker-preview

    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Failed to start preview container"
        Write-Warn "Image was built and pushed successfully, but container deploy failed."
        Write-Info "Manual deploy: docker-compose -f docker-compose.preview.yml up -d expense-tracker-preview"
        exit 1
    }

    # Brief wait then check health
    Start-Sleep -Seconds 3
    $containerStatus = docker ps --filter "name=expense-tracker-preview" --format "{{.Status}}" 2>$null
    if ($containerStatus) {
        Write-Success "Preview container is running: $containerStatus"
    } else {
        Write-Warn "Container may still be starting. Check with: docker ps --filter name=expense-tracker-preview"
    }

    Write-Host ""
    Write-Success "========================================="
    Write-Success "Preview deployment complete!"
    Write-Success "========================================="
    Write-Info "Frontend: http://localhost:3001"
    Write-Info "Backend API: http://localhost:2425"
    Write-Info "Branch: $gitBranch"
    Write-Info "SHA: $gitSha"
    Write-Info "Preview Tag: preview-${branchTag}"
    Write-Host ""
    Write-Info "To stop the preview container:"
    Write-Info "  .\scripts\deploy-feature-preview.ps1 -Stop"
    Write-Host ""
} else {
    Write-Info "Skipping deploy (--SkipDeploy flag set)"
    Write-Host ""
    Write-Success "========================================="
    Write-Success "Build completed (SkipDeploy mode)"
    Write-Success "========================================="
    Write-Info "SHA Image: $shaImage"
    Write-Info "Preview Tag: $previewImage"
    Write-Info "Version: $version"
    Write-Info "Git SHA: $gitSha"
    Write-Info "Branch: $gitBranch"
    Write-Host ""
}
