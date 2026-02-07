#!/usr/bin/env pwsh
# Build and Push Script for Local Docker Registry
# This script builds the unified expense-tracker container and pushes it to a local registry

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('latest', 'dev', 'staging')]
    [string]$Tag = 'latest',
    
    [Parameter(Mandatory=$false)]
    [string]$Registry = 'localhost:5000',
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipAuth,
    
    [Parameter(Mandatory=$false)]
    [switch]$MultiPlatform,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipDeploy,
    
    [Parameter(Mandatory=$false)]
    [string]$ComposeFile = "G:\My Drive\Media Related\docker\media-applications.yml"
)

# Color output functions
function Write-Info { Write-Host "INFO: $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "SUCCESS: $args" -ForegroundColor Green }
function Write-Error { Write-Host "ERROR: $args" -ForegroundColor Red }
function Write-Warning { Write-Host "WARNING: $args" -ForegroundColor Yellow }

# Determine branch-based tag if not explicitly set
$currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
# Only auto-detect tag if user didn't explicitly specify one via parameter
$defaultTag = 'latest'
if ($PSBoundParameters.ContainsKey('Tag')) {
    Write-Info "Using explicitly specified tag: $Tag"
} elseif ($currentBranch -eq 'main') {
    $Tag = 'latest'
    Write-Info "Detected main branch, using tag: latest"
} elseif ($currentBranch -eq 'development') {
    $Tag = 'dev'
    Write-Info "Detected development branch, using tag: dev"
} else {
    Write-Info "Using tag: $Tag (branch: $currentBranch)"
}

$imageName = "$Registry/expense-tracker"
$fullImageTag = "${imageName}:${Tag}"

Write-Info "Building and pushing Docker image"
Write-Info "Image: $fullImageTag"
Write-Info "Multi-platform: $MultiPlatform"

# Check if Docker is running
try {
    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker is not running. Please start Docker and try again."
        exit 1
    }
} catch {
    Write-Error "Docker is not available. Please install Docker and try again."
    exit 1
}

# Check if registry is accessible (optional, skip if SkipAuth)
if (-not $SkipAuth) {
    Write-Info "Checking registry accessibility..."
    try {
        $response = Invoke-WebRequest -Uri "http://$Registry/v2/" -Method Get -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Success "Registry is accessible"
        }
    } catch {
        Write-Warning "Could not verify registry accessibility. Proceeding anyway..."
    }
}

# Set up Docker Buildx if multi-platform build is requested
if ($MultiPlatform) {
    Write-Info "Setting up Docker Buildx for multi-platform build..."
    
    # Check if buildx builder exists
    $builderName = "expense-tracker-builder"
    $builderExists = docker buildx ls | Select-String $builderName
    
    if (-not $builderExists) {
        Write-Info "Creating new buildx builder: $builderName"
        docker buildx create --name $builderName --use
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to create buildx builder"
            exit 1
        }
    } else {
        Write-Info "Using existing buildx builder: $builderName"
        docker buildx use $builderName
    }
    
    # Bootstrap the builder
    Write-Info "Bootstrapping builder..."
    docker buildx inspect --bootstrap
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to bootstrap buildx builder"
        exit 1
    }
}

# Extract metadata for labels
$gitCommit = git rev-parse --short HEAD 2>$null
$gitBranch = git rev-parse --abbrev-ref HEAD 2>$null
$buildDate = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
$version = (Get-Content backend/package.json | ConvertFrom-Json).version

Write-Info "Build metadata:"
Write-Info "  Version: $version"
Write-Info "  Git Commit: $gitCommit"
Write-Info "  Git Branch: $gitBranch"
Write-Info "  Build Date: $buildDate"

# Build arguments for labels and environment variables
$buildArgs = @(
    "--build-arg", "IMAGE_TAG=$Tag",
    "--build-arg", "BUILD_DATE=$buildDate",
    "--build-arg", "GIT_COMMIT=$gitCommit",
    "--label", "org.opencontainers.image.created=$buildDate",
    "--label", "org.opencontainers.image.version=$version",
    "--label", "org.opencontainers.image.revision=$gitCommit",
    "--label", "org.opencontainers.image.source=https://github.com/yourusername/expense-tracker",
    "--label", "org.opencontainers.image.title=expense-tracker",
    "--label", "org.opencontainers.image.description=Personal expense tracking application",
    "--label", "app.name=expense-tracker",
    "--label", "app.version=$version",
    "--label", "app.branch=$gitBranch"
)

# Build and push
Write-Info "Building Docker image..."

if ($MultiPlatform) {
    # Multi-platform build with buildx
    Write-Info "Building for linux/amd64 and linux/arm64..."
    
    $buildxArgs = @(
        "buildx", "build",
        "--platform", "linux/amd64,linux/arm64",
        "--push",
        "-t", $fullImageTag,
        "-f", "Dockerfile"
    ) + $buildArgs + @(".")
    
    & docker $buildxArgs
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Multi-platform build failed"
        exit 1
    }
    
    Write-Success "Multi-platform image built and pushed successfully"
} else {
    # Standard single-platform build
    Write-Info "Building for current platform..."
    
    $buildStandardArgs = @(
        "build",
        "-t", $fullImageTag,
        "-f", "Dockerfile"
    ) + $buildArgs + @(".")
    
    & docker $buildStandardArgs
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed"
        exit 1
    }
    
    Write-Success "Image built successfully"
    
    # Push to registry
    Write-Info "Pushing image to registry..."
    docker push $fullImageTag
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Push failed"
        exit 1
    }
    
    Write-Success "Image pushed successfully"
}

# Deploy to containers via compose file
if (-not $SkipDeploy) {
    # Map tags to compose service names
    $serviceMap = @{
        'staging' = 'expense-tracker-test'
        'latest'  = 'expense-tracker'
        'dev'     = 'expense-tracker-test'
    }
    
    $serviceName = $serviceMap[$Tag]
    
    if ($serviceName) {
        Write-Info "Deploying to container: $serviceName"
        
        # Check compose file exists
        if (Test-Path $ComposeFile) {
            Write-Info "Pulling latest image for $serviceName..."
            docker-compose -f $ComposeFile pull $serviceName
            
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Pull failed, but image was just pushed locally. Continuing with restart..."
            }
            
            Write-Info "Restarting $serviceName..."
            docker-compose -f $ComposeFile up -d $serviceName
            
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to restart $serviceName"
                Write-Warning "Image was built and pushed successfully, but container deploy failed."
                Write-Info "Manual deploy: docker-compose -f `"$ComposeFile`" up -d $serviceName"
            } else {
                # Brief wait then check health
                Start-Sleep -Seconds 3
                $containerStatus = docker ps --filter "name=$serviceName" --format "{{.Status}}" 2>$null
                if ($containerStatus) {
                    Write-Success "Container $serviceName is running: $containerStatus"
                } else {
                    Write-Warning "Container may still be starting. Check with: docker ps --filter name=$serviceName"
                }
            }
        } else {
            Write-Warning "Compose file not found: $ComposeFile"
            Write-Info "Skipping deploy. Pull and restart manually."
        }
    } else {
        Write-Warning "No service mapping for tag '$Tag'. Skipping deploy."
    }
} else {
    Write-Info "Skipping deploy (--SkipDeploy flag set)"
}

# Summary
Write-Success "========================================="
Write-Success "Build and push completed successfully!"
Write-Success "========================================="
Write-Info "Image: $fullImageTag"
Write-Info "Tag: $Tag"
Write-Info "Version: $version"
if (-not $SkipDeploy -and $serviceName) {
    Write-Info "Deployed to: $serviceName"
}
