#!/usr/bin/env pwsh
# Automated Production Deployment Script
# Enforces correct workflow: version bump → push → CI build → pull → staging → production

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('MAJOR', 'MINOR', 'PATCH')]
    [string]$BumpType,
    
    [Parameter(Mandatory=$true)]
    [string]$Description,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipStaging,
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun,
    
    [Parameter(Mandatory=$false)]
    [int]$CITimeout = 600
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
    Write-Host "  6. Push to origin (triggers CI build)"
    Write-Host "  7. Wait for CI to build Docker image"
    Write-Host "  8. Pull CI-built image from GHCR"
    if (-not $SkipStaging) {
        Write-Host "  9. Promote to staging"
        Write-Host " 10. Wait for confirmation"
        Write-Host " 11. Promote to production (latest)"
    } else {
        Write-Host "  9. Promote to production (latest)"
    }
    exit 0
}

# Step 6: Update version in all files
Write-Step "Updating version in all files..."

$backendPackage.version = $newVersion
$backendPackage | ConvertTo-Json -Depth 10 | Set-Content backend/package.json

$frontendPackage = Get-Content frontend/package.json | ConvertFrom-Json
$frontendPackage.version = $newVersion
$frontendPackage | ConvertTo-Json -Depth 10 | Set-Content frontend/package.json

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

# Step 8: Update BackupSettings.jsx changelog
Write-Step "Updating BackupSettings.jsx changelog..."
$backupSettingsPath = "frontend/src/components/BackupSettings.jsx"
$backupSettingsContent = Get-Content $backupSettingsPath -Raw

$changelogDate = Get-Date -Format "MMMM d, yyyy"
$newChangelogEntry = @"
              <div className="changelog-entry">
                <div className="changelog-version">v$newVersion</div>
                <div className="changelog-date">$changelogDate</div>
                <ul className="changelog-items">
                  <li>$Description</li>
                </ul>
              </div>
"@

$insertionPattern = '(<div className="changelog">)\s*(<div className="changelog-entry">)'
$replacement = "`$1`n$newChangelogEntry`n              `$2"

if ($backupSettingsContent -match $insertionPattern) {
    $backupSettingsContent = $backupSettingsContent -replace $insertionPattern, $replacement
    $backupSettingsContent | Set-Content $backupSettingsPath -NoNewline
    Write-Success "BackupSettings.jsx changelog updated"
} else {
    Write-Warning "Could not find changelog insertion point in BackupSettings.jsx"
    Write-Host "Please manually add changelog entry for v$newVersion"
    Read-Host "Press Enter when BackupSettings.jsx is updated"
}

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

# Step 11: Push to origin (triggers CI build)
Write-Step "Pushing to origin (triggers CI build)..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to push to origin"
    exit 1
}
Write-Success "Pushed to origin/main"

git push origin "v$newVersion"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to push tag - push manually: git push origin v$newVersion"
} else {
    Write-Success "Pushed tag v$newVersion to origin"
}

# Step 12: Wait for CI to build the Docker image
Write-Step "Waiting for CI to build Docker image..."
Write-Info "CI will build and push: ghcr.io/krazykrazz/expense-tracker:$commitSha"
Write-Info "Timeout: $CITimeout seconds"

$shaImage = "ghcr.io/krazykrazz/expense-tracker:$commitSha"
$elapsed = 0
$pollInterval = 15
$ciReady = $false

while ($elapsed -lt $CITimeout) {
    docker pull $shaImage 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ciReady = $true
        break
    }
    
    $remaining = $CITimeout - $elapsed
    Write-Host "`r  Waiting for CI... ($elapsed`s elapsed, ${remaining}s remaining)" -NoNewline
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval
}

Write-Host ""

if (-not $ciReady) {
    Write-Error "Timed out waiting for CI to build image ($CITimeout`s)"
    Write-Host ""
    Write-Info "The commit and tag have been pushed. CI may still be running."
    Write-Info "Once CI completes, promote manually:"
    Write-Info "  .\scripts\build-and-push.ps1 -Environment staging"
    Write-Info "  .\scripts\build-and-push.ps1 -Environment latest"
    Write-Host ""
    Write-Info "Or increase timeout: -CITimeout 900"
    exit 1
}

Write-Success "CI-built image available: $shaImage"

# Step 13: Deploy to staging (unless skipped)
if (-not $SkipStaging) {
    Write-Step "Promoting to staging..."
    .\scripts\build-and-push.ps1 -Environment staging
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
        Write-Host "CI-built image $commitSha is ready for production when you're ready:"
        Write-Host "  .\scripts\build-and-push.ps1 -Environment latest"
        exit 0
    }
}

# Step 14: Promote to production (latest)
Write-Step "Promoting to production (latest)..."
.\scripts\build-and-push.ps1 -Environment latest
if ($LASTEXITCODE -ne 0) {
    Write-Error "Production deployment failed!"
    exit 1
}
Write-Success "Deployed to production (latest tag)"

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
Write-Host "Image built by CI and pulled from GHCR (ghcr.io/krazykrazz/expense-tracker)" -ForegroundColor Cyan
Write-Host ""
