#!/usr/bin/env pwsh
# GitHub Release and Tag Cleanup Script
#
# Deletes all GitHub releases and git tags to prepare for the 1.0.0 version rebase.
# Uses gh release delete --yes --cleanup-tag to remove releases and their associated tags,
# then cleans up any remaining local and remote tags matching v*.
#
# Usage:
#   .\scripts\cleanup-github-releases.ps1 -DryRun    # Preview actions without executing
#   .\scripts\cleanup-github-releases.ps1             # Execute cleanup

param(
    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

function Write-Step { Write-Host "`n▶ $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Err { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Warn { Write-Host "⚠️  $args" -ForegroundColor Yellow }

# --- Preflight checks ---

Write-Step "Checking prerequisites..."

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Err "gh CLI is not installed. Install from https://cli.github.com/"
    exit 1
}

$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "gh CLI is not authenticated. Run 'gh auth login' first."
    exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Err "git is not installed."
    exit 1
}

Write-Success "Prerequisites OK"

if ($DryRun) {
    Write-Warn "DRY RUN MODE — no changes will be made"
}

# --- Step 1: Delete all GitHub releases ---

Write-Step "Fetching GitHub releases..."

$releases = gh release list --limit 1000 --json tagName --jq '.[].tagName' 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to list releases: $releases"
    exit 1
}

$releaseList = @($releases | Where-Object { $_ -and $_.Trim() })

if ($releaseList.Count -eq 0) {
    Write-Success "No GitHub releases found"
} else {
    Write-Host "Found $($releaseList.Count) release(s) to delete"
    foreach ($tag in $releaseList) {
        if ($DryRun) {
            Write-Host "  [DRY RUN] Would delete release: $tag"
        } else {
            Write-Host "  Deleting release: $tag"
            gh release delete $tag --yes --cleanup-tag 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Failed to delete release $tag (may already be deleted)"
            }
        }
    }
    Write-Success "Releases processed"
}

# --- Step 2: Delete remaining local tags matching v* ---

Write-Step "Checking local tags..."

$localTags = @(git tag -l "v*" | Where-Object { $_ -and $_.Trim() })

if ($localTags.Count -eq 0) {
    Write-Success "No local v* tags found"
} else {
    Write-Host "Found $($localTags.Count) local tag(s) to delete"
    foreach ($tag in $localTags) {
        if ($DryRun) {
            Write-Host "  [DRY RUN] Would delete local tag: $tag"
        } else {
            Write-Host "  Deleting local tag: $tag"
            git tag -d $tag 2>&1 | Out-Null
        }
    }
    Write-Success "Local tags processed"
}

# --- Step 3: Delete remaining remote tags matching v* ---

Write-Step "Checking remote tags..."

$remoteTags = @(
    git ls-remote --tags origin 2>&1 |
    ForEach-Object { if ($_ -match 'refs/tags/(.+)$') { $matches[1] } } |
    Where-Object { $_ -match '^v' -and $_ -notmatch '\^' }
)

if ($remoteTags.Count -eq 0) {
    Write-Success "No remote v* tags found"
} else {
    Write-Host "Found $($remoteTags.Count) remote tag(s) to delete"
    foreach ($tag in $remoteTags) {
        if ($DryRun) {
            Write-Host "  [DRY RUN] Would delete remote tag: $tag"
        } else {
            Write-Host "  Deleting remote tag: $tag"
            git push --delete origin $tag 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Failed to delete remote tag $tag (may already be deleted)"
            }
        }
    }
    Write-Success "Remote tags processed"
}

# --- Step 4: Verify cleanup ---

Write-Step "Verifying cleanup..."

$remainingReleases = gh release list --limit 10 2>&1
$remainingRemoteTags = git ls-remote --tags origin 2>&1
$remainingLocalTags = git tag -l "v*" 2>&1

Write-Host "`nRemaining releases:"
if ($DryRun) {
    Write-Warn "Skipped (dry run)"
} elseif (-not $remainingReleases -or $remainingReleases -match "no releases") {
    Write-Success "  None"
} else {
    Write-Host "  $remainingReleases"
}

Write-Host "`nRemaining remote v* tags:"
if ($DryRun) {
    Write-Warn "Skipped (dry run)"
} elseif (-not $remainingRemoteTags) {
    Write-Success "  None"
} else {
    Write-Host "  $remainingRemoteTags"
}

Write-Host "`nRemaining local v* tags:"
if ($DryRun) {
    Write-Warn "Skipped (dry run)"
} elseif (-not $remainingLocalTags) {
    Write-Success "  None"
} else {
    Write-Host "  $remainingLocalTags"
}

# --- Done ---

Write-Host ""
if ($DryRun) {
    Write-Warn "Dry run complete. Re-run without -DryRun to execute."
} else {
    Write-Success "Cleanup complete!"
}
