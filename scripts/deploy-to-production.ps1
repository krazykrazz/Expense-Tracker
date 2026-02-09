#!/usr/bin/env pwsh
# Automated Production Deployment Script
# Enforces correct workflow: version bump → build → staging → production

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('MAJOR', 'MINOR', 'PATCH')]
    [string]$BumpType,
    
    [Parameter(Mandatory=$true)]
    [string]$Description,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipStaging,
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

function Write-Step { Write-Host "▶ $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Error { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Warning { Write-Host "⚠️  $args" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Production Deployment Workflow" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify on main branch
Write-Step "Checking current branch..."
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") {
    Write-Error "Must be on 'main' branch for deployment!"
    Write-Host "Current branch: $currentBranch"
    Write-Host "Run: git checkout main"
    exit 1
}
Write-Success "On main branch"

# Step 2: Check for uncommitted changes
Write-Step "Checking for uncommitted changes..."
$status = git status --porcelain
if ($status) {
    Write-Error "Uncommitted changes detected!"
    Write-Host ""
    git status --short
    Write-Host ""
    Write-Host "Commit or stash changes before deploying."
    exit 1
}
Write-Success "Working directory clean"

# Step 3: Pull latest from origin
Write-Step "Pulling latest from origin/main..."
if (-not $DryRun) {
    git pull origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to pull from origin"
        exit 1
    }
}
Write-Success "Up to date with origin/main"

# Step 4: Read current version
Write-Step "Reading current version..."
$backendPackage = Get-Content backend/package.json | ConvertFrom-Json
$currentVersion = $backendPackage.version
Write-Host "Current version: $currentVersion"

# Step 5: Calculate new version
Write-Step "Calculating new version ($BumpType bump)..."
$versionParts = $currentVersion -split '\.'
$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]

switch ($BumpType) {
    'MAJOR' { $major++; $minor = 0; $patch = 0 }
    'MINOR' { $minor++; $patch = 0 }
    'PATCH' { $patch++ }
}

$newVersion = "$major.$minor.$patch"
Write-Success "New version: $newVersion"

if ($DryRun) {
    Write-Warning "DRY RUN - No changes will be made"
    Write-Host ""
    Write-Host "Would perform:"
    Write-Host "  1. Update version to $newVersion"
    Write-Host "  2. Update CHANGELOG.md"
    Write-Host "  3. Build frontend"
    Write-Host "  4. Commit: v$newVersion`: $Description"
    Write-Host "  5. Tag commit: v$newVersion"
    Write-Host "  6. Build SHA image"
    if (-not $SkipStaging) {
        Write-Host "  7. Deploy to staging"
        Write-Host "  8. Wait for confirmation"
        Write-Host "  9. Deploy to latest (production)"
        Write-Host " 10. Push commits and tags to origin"
    } else {
        Write-Host "  7. Deploy to latest (production)"
        Write-Host "  8. Push commits and tags to origin"
    }
    exit 0
}

# Step 6: Update version in all files
Write-Step "Updating version in all files..."

# Update backend/package.json
$backendPackage.version = $newVersion
$backendPackage | ConvertTo-Json -Depth 10 | Set-Content backend/package.json

# Update frontend/package.json
$frontendPackage = Get-Content frontend/package.json | ConvertFrom-Json
$frontendPackage.version = $newVersion
$frontendPackage | ConvertTo-Json -Depth 10 | Set-Content frontend/package.json

# Update App.jsx
$appContent = Get-Content frontend/src/App.jsx -Raw
$appContent = $appContent -replace 'v\d+\.\d+\.\d+', "v$newVersion"
$appContent | Set-Content frontend/src/App.jsx -NoNewline

Write-Success "Version updated in package.json files and App.jsx"

# Step 7: Update CHANGELOG.md
Write-Step "Updating CHANGELOG.md..."
$date = Get-Date -Format "yyyy-MM-dd"
$changelogEntry = @"
## [$newVersion] - $date

### $Description

"@

$changelog = Get-Content CHANGELOG.md -Raw
$changelog = $changelog -replace '(# Changelog\s+)', "`$1`n$changelogEntry`n"
$changelog | Set-Content CHANGELOG.md -NoNewline

Write-Success "CHANGELOG.md updated"

# Step 8: Update BackupSettings.jsx
Write-Step "Updating BackupSettings.jsx changelog..."
Write-Warning "Manual update required for BackupSettings.jsx"
Write-Host "Add changelog entry for v$newVersion in frontend/src/components/BackupSettings.jsx"
Write-Host ""
Read-Host "Press Enter when BackupSettings.jsx is updated"

# Step 9: Build frontend
Write-Step "Building frontend..."
Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed!"
    Pop-Location
    exit 1
}
Pop-Location
Write-Success "Frontend built successfully"

# Step 10: Commit version bump
Write-Step "Committing version bump..."
git add -A
git commit -m "v$newVersion`: $Description"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Commit failed!"
    exit 1
}
$commitSha = git rev-parse --short HEAD
Write-Success "Committed: $commitSha"

# Step 10.5: Tag the commit
Write-Step "Tagging commit with v$newVersion..."
git tag -a "v$newVersion" -m "Release v$newVersion`: $Description"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to tag commit!"
    exit 1
}
Write-Success "Tagged: v$newVersion"

# Step 11: Build SHA image
Write-Step "Building SHA image..."
.\build-and-push.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed!"
    exit 1
}
Write-Success "SHA image built: $commitSha"

# Step 12: Deploy to staging (unless skipped)
if (-not $SkipStaging) {
    Write-Step "Deploying to staging..."
    .\build-and-push.ps1 -Environment staging
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Staging deployment failed!"
        exit 1
    }
    Write-Success "Deployed to staging"
    
    Write-Host ""
    Write-Warning "Test the deployment in staging environment"
    Write-Host "Staging URL: http://your-staging-url"
    Write-Host ""
    $confirm = Read-Host "Deploy to production? (yes/no)"
    
    if ($confirm -ne "yes") {
        Write-Warning "Production deployment cancelled"
        Write-Host "SHA image $commitSha is ready for production when you're ready:"
        Write-Host "  .\build-and-push.ps1 -Environment latest"
        exit 0
    }
}

# Step 13: Deploy to latest (production)
Write-Step "Deploying to latest (production)..."
.\build-and-push.ps1 -Environment latest
if ($LASTEXITCODE -ne 0) {
    Write-Error "Production deployment failed!"
    exit 1
}
Write-Success "Deployed to production (latest tag)"

# Step 14: Push to origin (including tags)
Write-Step "Pushing to origin (with tags)..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to push commits to origin - push manually"
} else {
    Write-Success "Pushed to origin/main"
}

git push origin "v$newVersion"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to push tag to origin - push manually: git push origin v$newVersion"
} else {
    Write-Success "Pushed tag v$newVersion to origin"
}

# Summary
Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Version: v$newVersion" -ForegroundColor Green
Write-Host "Git Tag: v$newVersion" -ForegroundColor Green
Write-Host "SHA: $commitSha" -ForegroundColor Green
Write-Host "Docker Tag: latest" -ForegroundColor Green
Write-Host "Container: expense-tracker" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
