#!/usr/bin/env pwsh
# SHA-Based Container Build and Deploy Script
# Implements immutable SHA-tagged images with environment promotion

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('staging', 'latest')]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [string]$Registry = 'ghcr.io/krazykrazz',
    
    [Parameter(Mandatory=$false)]
    [switch]$BuildOnly,
    
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

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "SHA-Based Container Build & Deploy" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

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

# Get git metadata
$gitSha = git rev-parse --short HEAD 2>$null
$gitBranch = git rev-parse --abbrev-ref HEAD 2>$null
$buildDate = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
$version = (Get-Content backend/package.json | ConvertFrom-Json).version

if (-not $gitSha) {
    Write-Error "Failed to get git SHA. Are you in a git repository?"
    exit 1
}

$imageName = "$Registry/expense-tracker"
$shaImage = "${imageName}:${gitSha}"

Write-Info "Build metadata:"
Write-Info "  Version: $version"
Write-Info "  Git SHA: $gitSha"
Write-Info "  Git Branch: $gitBranch"
Write-Info "  Build Date: $buildDate"
Write-Info "  SHA Image: $shaImage"

# Check if SHA image already exists
$imageExists = docker images -q $shaImage 2>$null
if ($imageExists -and -not $BuildOnly -and $Environment) {
    Write-Info "SHA image already exists: $shaImage"
    Write-Info "Skipping build (image already built for this commit)"
    $skipBuild = $true
} else {
    $skipBuild = $false
}

# Build SHA image if needed
if (-not $skipBuild) {
    Write-Info "Building SHA image: $shaImage"
    
    # Check registry accessibility (optional, skip if SkipAuth)
    if (-not $SkipAuth) {
        Write-Info "Checking GHCR authentication..."
        $authCheck = docker login ghcr.io --get-login 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Not authenticated to GHCR. Attempting login via gh CLI..."
            $ghToken = gh auth token 2>$null
            if ($LASTEXITCODE -eq 0 -and $ghToken) {
                $ghToken | docker login ghcr.io -u krazykrazz --password-stdin 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Authenticated to GHCR via gh CLI"
                } else {
                    Write-Error "Failed to authenticate to GHCR. Run: gh auth login"
                    exit 1
                }
            } else {
                Write-Error "Not authenticated. Run: gh auth login  OR  docker login ghcr.io"
                exit 1
            }
        } else {
            Write-Success "Authenticated to GHCR"
        }
    }
    
    # Build arguments for labels
    $buildArgs = @(
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
        "--label", "app.sha=$gitSha"
    )
    
    if ($MultiPlatform) {
        # Multi-platform build with buildx
        Write-Info "Setting up Docker Buildx for multi-platform build..."
        
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
        
        Write-Info "Bootstrapping builder..."
        docker buildx inspect --bootstrap
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to bootstrap buildx builder"
            exit 1
        }
        
        Write-Info "Building for linux/amd64 and linux/arm64..."
        
        $buildxArgs = @(
            "buildx", "build",
            "--platform", "linux/amd64,linux/arm64",
            "--push",
            "-t", $shaImage,
            "-f", "Dockerfile"
        ) + $buildArgs + @(".")
        
        & docker $buildxArgs
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Multi-platform build failed"
            exit 1
        }
        
        Write-Success "Multi-platform SHA image built and pushed"
    } else {
        # Standard single-platform build
        Write-Info "Building for current platform..."
        
        $buildStandardArgs = @(
            "build",
            "-t", $shaImage,
            "-f", "Dockerfile"
        ) + $buildArgs + @(".")
        
        & docker $buildStandardArgs
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Build failed"
            exit 1
        }
        
        Write-Success "SHA image built successfully"
        
        # Push SHA image to registry
        Write-Info "Pushing SHA image to registry..."
        docker push $shaImage
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Push failed"
            exit 1
        }
        
        Write-Success "SHA image pushed to registry"
    }
}

# If BuildOnly flag is set, stop here
if ($BuildOnly) {
    Write-Success "========================================="
    Write-Success "Build completed (BuildOnly mode)"
    Write-Success "========================================="
    Write-Info "SHA Image: $shaImage"
    Write-Info "Version: $version"
    Write-Info "Git SHA: $gitSha"
    exit 0
}

# Tag for environment if specified
if ($Environment) {
    $envImage = "${imageName}:${Environment}"
    
    Write-Info "Tagging SHA image for environment: $Environment"
    docker tag $shaImage $envImage
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to tag image for environment"
        exit 1
    }
    
    Write-Info "Pushing environment tag to registry..."
    docker push $envImage
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to push environment tag"
        exit 1
    }
    
    Write-Success "Environment tag pushed: $envImage"
    
    # Deploy to container if not skipped
    if (-not $SkipDeploy) {
        # Map environment to compose service names
        $serviceMap = @{
            'staging' = 'expense-tracker-test'
            'latest'  = 'expense-tracker'
        }
        
        $serviceName = $serviceMap[$Environment]
        
        if ($serviceName) {
            Write-Info "Deploying to container: $serviceName"
            
            # Check compose file exists
            if (Test-Path $ComposeFile) {
                Write-Info "Pulling latest image for $serviceName..."
                docker-compose -f $ComposeFile pull $serviceName 2>$null
                
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
            Write-Warning "No service mapping for environment '$Environment'. Skipping deploy."
        }
    } else {
        Write-Info "Skipping deploy (--SkipDeploy flag set)"
    }
}

# Summary
Write-Host ""
Write-Success "========================================="
Write-Success "Operation completed successfully!"
Write-Success "========================================="
Write-Info "SHA Image: $shaImage"
Write-Info "Version: $version"
Write-Info "Git SHA: $gitSha"
if ($Environment) {
    Write-Info "Environment Tag: ${imageName}:${Environment}"
    if (-not $SkipDeploy) {
        Write-Info "Deployed to: $serviceName"
    }
}
Write-Host ""

