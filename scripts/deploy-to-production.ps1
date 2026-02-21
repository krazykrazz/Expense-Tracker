#!/usr/bin/env pwsh
# Automated Production Deployment Script (Branch Protection Compatible)
# 
# Workflow:
#   1. Create release/vX.Y.Z branch from main
#   2. Bump version in all 6 locations
#   3. Build frontend
#   4. Commit, push, create PR
#   5. Wait for CI to pass and PR to merge
#   6. Tag the merge commit on main
#   7. Pull CI-built image from GHCR
#   8. Promote: staging → production
#
# Usage:
#   .\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes and test improvements"
#   .\scripts\deploy-to-production.ps1 -BumpType MINOR -Description "New feature" -SkipStaging
#   .\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Fix" -DryRun

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

function Write-Step { Write-Host "`n▶ $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Err { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Warn { Write-Host "⚠️  $args" -ForegroundColor Yellow }
function Write-Info { Write-Host "   $args" -ForegroundColor Gray }

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Production Deployment (PR Workflow)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# ─────────────────────────────────────────────
# PHASE 1: Pre-flight checks
# ─────────────────────────────────────────────

Write-Step "Pre-flight checks..."

# Must be on main
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") {
    Write-Err "Must be on 'main' branch. Current: $currentBranch"
    exit 1
}

# No uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Err "Uncommitted changes detected!"
    git status --short
    exit 1
}

# Pull latest
git pull origin main 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to pull from origin/main"
    exit 1
}

# gh CLI available
$ghAvailable = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghAvailable) {
    Write-Err "GitHub CLI (gh) is required. Install: https://cli.github.com/"
    exit 1
}

Write-Success "Pre-flight checks passed"

# ─────────────────────────────────────────────
# PHASE 2: Calculate version
# ─────────────────────────────────────────────

Write-Step "Calculating new version..."

$backendPkg = Get-Content backend/package.json | ConvertFrom-Json
$currentVersion = $backendPkg.version
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
$releaseBranch = "release/v$newVersion"

Write-Info "Current: $currentVersion → New: $newVersion"
Write-Info "Branch: $releaseBranch"

# ─────────────────────────────────────────────
# DRY RUN - show plan and exit
# ─────────────────────────────────────────────

if ($DryRun) {
    Write-Warn "DRY RUN - No changes will be made"
    Write-Host ""
    Write-Host "Plan:" -ForegroundColor White
    Write-Host "  1. Create branch: $releaseBranch"
    Write-Host "  2. Update version to $newVersion in all 6 locations"
    Write-Host "  3. Build frontend"
    Write-Host "  4. Commit: v${newVersion}: $Description"
    Write-Host "  5. Push branch, create PR"
    Write-Host "  6. [Manual] Wait for CI, merge PR"
    Write-Host "  7. Tag merge commit: v$newVersion"
    Write-Host "  8. Wait for CI to build Docker image"
    if (-not $SkipStaging) {
        Write-Host "  9. Promote to staging"
        Write-Host " 10. Confirm staging"
        Write-Host " 11. Promote to production (latest)"
    } else {
        Write-Host "  9. Promote to production (latest)"
    }
    exit 0
}

# ─────────────────────────────────────────────
# PHASE 3: Create release branch & bump version
# ─────────────────────────────────────────────

Write-Step "Creating release branch: $releaseBranch"

git checkout -b $releaseBranch
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to create release branch (may already exist)"
    exit 1
}

Write-Step "Updating version in all files..."

# 1. backend/package.json
$backendPkg.version = $newVersion
$backendPkg | ConvertTo-Json -Depth 10 | Set-Content backend/package.json

# 2. frontend/package.json
$frontendPkg = Get-Content frontend/package.json | ConvertFrom-Json
$frontendPkg.version = $newVersion
$frontendPkg | ConvertTo-Json -Depth 10 | Set-Content frontend/package.json

# 3. frontend/src/App.jsx (fallback version in footer)
$appContent = Get-Content frontend/src/App.jsx -Raw
$appContent = $appContent -replace "v\d+\.\d+\.\d+'", "v$newVersion'"
$appContent | Set-Content frontend/src/App.jsx -NoNewline

# 4. CHANGELOG.md
$date = Get-Date -Format "yyyy-MM-dd"
$changelogEntry = @"

## [$newVersion] - $date

### $Description

"@

$changelog = Get-Content CHANGELOG.md -Raw
$changelog = $changelog -replace '(# Changelog\s*)', "`$1`n$changelogEntry"
$changelog | Set-Content CHANGELOG.md -NoNewline

# 5. BackupSettings.jsx (in-app changelog)
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
    Write-Warn "Could not find changelog insertion point in BackupSettings.jsx"
    Write-Host "Please manually add changelog entry for v$newVersion"
    Read-Host "Press Enter when BackupSettings.jsx is updated"
}

# 6. SystemModal.jsx (in-app changelog in Updates tab)
$systemModalPath = "frontend/src/components/SystemModal.jsx"
$systemModalContent = Get-Content $systemModalPath -Raw

$newSystemEntry = @"
            <div className="changelog-entry">
              <div className="changelog-version">
                v$newVersion
                {isCurrentVersion('v$newVersion') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">$changelogDate</div>
              <ul className="changelog-items">
                <li>$Description</li>
              </ul>
            </div>
"@

$systemInsertionPattern = '(<div className="changelog">)\s*(<div className="changelog-entry">)'
$systemReplacement = "`$1`n$newSystemEntry`n            `$2"

if ($systemModalContent -match $systemInsertionPattern) {
    $systemModalContent = $systemModalContent -replace $systemInsertionPattern, $systemReplacement
    $systemModalContent | Set-Content $systemModalPath -NoNewline
    Write-Success "All 6 version locations updated"
} else {
    Write-Warn "Could not find changelog insertion point in SystemModal.jsx"
    Write-Host "Please manually add changelog entry for v$newVersion"
    Read-Host "Press Enter when SystemModal.jsx is updated"
}

# ─────────────────────────────────────────────
# PHASE 4: Build frontend
# ─────────────────────────────────────────────

Write-Step "Building frontend..."
Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Err "Frontend build failed!"
    Pop-Location
    git checkout main
    git branch -D $releaseBranch
    exit 1
}
Pop-Location
Write-Success "Frontend built"

# ─────────────────────────────────────────────
# PHASE 5: Commit, push, create PR
# ─────────────────────────────────────────────

Write-Step "Committing version bump..."
git add -A
git commit -m "v${newVersion}: $Description"
if ($LASTEXITCODE -ne 0) {
    Write-Err "Commit failed!"
    exit 1
}
Write-Success "Committed on $releaseBranch"

Write-Step "Pushing release branch..."
git push -u origin $releaseBranch
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to push release branch"
    exit 1
}

Write-Step "Creating Pull Request..."
$prBody = "## Release v$newVersion`n`n$Description`n`n### Version Bump`n- Updated version in all 6 locations`n- Frontend built`n`n### Post-Merge Steps`nAfter merging, the deploy script will:`n1. Tag the merge commit``n2. Pull CI-built image from GHCR`n3. Promote to staging → production"

$prUrl = gh pr create --base main --head $releaseBranch --title "Release v${newVersion}: $Description" --body $prBody 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Success "PR created: $prUrl"
} else {
    Write-Err "Failed to create PR: $prUrl"
    Write-Info "Create manually and merge, then re-run this script with the same args"
    exit 1
}

# ─────────────────────────────────────────────
# PHASE 6: Wait for CI and merge
# ─────────────────────────────────────────────

Write-Step "Waiting for CI checks to pass..."
Write-Info "Polling PR status (timeout: ${CITimeout}s)..."

$elapsed = 0
$pollInterval = 20
$ciPassed = $false

while ($elapsed -lt $CITimeout) {
    # Check PR check status
    $checkStatus = gh pr checks $releaseBranch --json name,state 2>$null | ConvertFrom-Json
    
    if ($checkStatus) {
        $allComplete = $true
        $anyFailed = $false
        
        foreach ($check in $checkStatus) {
            if ($check.state -eq "FAILURE" -or $check.state -eq "ERROR") {
                $anyFailed = $true
                break
            }
            if ($check.state -ne "SUCCESS" -and $check.state -ne "SKIPPED") {
                $allComplete = $false
            }
        }
        
        if ($anyFailed) {
            Write-Err "CI checks failed!"
            Write-Info "Fix the issues, push to the release branch, and CI will re-run."
            Write-Info "Once CI passes, merge the PR manually, then run:"
            Write-Info "  .\scripts\deploy-to-production.ps1 -BumpType $BumpType -Description `"$Description`""
            exit 1
        }
        
        if ($allComplete -and $checkStatus.Count -gt 0) {
            $ciPassed = $true
            break
        }
    }
    
    $remaining = $CITimeout - $elapsed
    Write-Host "`r   Waiting for CI... (${elapsed}s elapsed, ${remaining}s remaining)    " -NoNewline
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval
}

Write-Host ""

if (-not $ciPassed) {
    Write-Warn "Timed out waiting for CI (${CITimeout}s)"
    Write-Info "The PR is open. Once CI passes, merge it manually, then continue below."
    Write-Host ""
}

# Merge the PR
if ($ciPassed) {
    Write-Step "Merging PR..."
    gh pr merge $releaseBranch --merge --delete-branch
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Auto-merge failed. Please merge the PR manually via GitHub."
    } else {
        Write-Success "PR merged and release branch deleted"
    }
} else {
    Write-Host ""
    Write-Warn "Please merge the PR manually when CI passes."
    $waitForMerge = Read-Host "Press Enter once the PR is merged (or Ctrl+C to abort)"
}

# ─────────────────────────────────────────────
# PHASE 7: Tag on main and push
# ─────────────────────────────────────────────

Write-Step "Switching to main and pulling merge commit..."
git checkout main
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to pull main after merge"
    exit 1
}

$mergeCommitSha = git rev-parse --short HEAD
Write-Success "On main at $mergeCommitSha"

# Clean up local release branch
$localBranches = git branch --list $releaseBranch
if ($localBranches) {
    git branch -D $releaseBranch 2>$null
    Write-Info "Cleaned up local branch: $releaseBranch"
}

# Prune stale remote-tracking refs
git remote prune origin 2>$null

Write-Step "Tagging v$newVersion..."
git tag -a "v$newVersion" -m "Release v${newVersion}: $Description"
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to create tag"
    exit 1
}

git push origin "v$newVersion"
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Failed to push tag. Push manually: git push origin v$newVersion"
} else {
    Write-Success "Tag v$newVersion pushed"
}

# ─────────────────────────────────────────────
# PHASE 8: Wait for CI to build Docker image
# ─────────────────────────────────────────────

Write-Step "Waiting for CI to build Docker image for $mergeCommitSha..."

$shaImage = "ghcr.io/krazykrazz/expense-tracker:$mergeCommitSha"
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
    Write-Host "`r   Waiting for Docker image... (${elapsed}s elapsed, ${remaining}s remaining)    " -NoNewline
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval
}

Write-Host ""

if (-not $ciReady) {
    Write-Warn "Timed out waiting for CI Docker build (${CITimeout}s)"
    Write-Info "Once CI completes, promote manually:"
    Write-Info "  .\scripts\build-and-push.ps1 -Environment staging"
    Write-Info "  .\scripts\build-and-push.ps1 -Environment latest"
    exit 1
}

Write-Success "Docker image available: $shaImage"

# ─────────────────────────────────────────────
# PHASE 9: Promote to staging → production
# ─────────────────────────────────────────────

if (-not $SkipStaging) {
    Write-Step "Promoting to staging..."
    .\scripts\build-and-push.ps1 -Environment staging
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Staging deployment failed!"
        exit 1
    }
    Write-Success "Deployed to staging"
    
    Write-Host ""
    Write-Warn "Test the staging deployment before promoting to production."
    $confirm = Read-Host "Deploy to production? (yes/no)"
    
    if ($confirm -ne "yes") {
        Write-Warn "Production deployment cancelled."
        Write-Info "When ready: .\scripts\build-and-push.ps1 -Environment latest"
        exit 0
    }
}

Write-Step "Promoting to production (latest)..."
.\scripts\build-and-push.ps1 -Environment latest
if ($LASTEXITCODE -ne 0) {
    Write-Err "Production deployment failed!"
    exit 1
}

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Version:    v$newVersion" -ForegroundColor Green
Write-Host "Git Tag:    v$newVersion" -ForegroundColor Green
Write-Host "SHA:        $mergeCommitSha" -ForegroundColor Green
Write-Host "Docker:     latest" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
