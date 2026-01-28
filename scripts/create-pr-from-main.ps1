# Create PR from Main Branch
# This script creates a PR from changes made directly on main branch
# It creates a temporary hotfix branch and opens a PR for CI verification

param(
    [Parameter(Mandatory=$true)]
    [string]$Title,
    [string]$Description = ""
)

# Function to get GitHub compare URL for manual PR creation
function Get-GitHubCompareUrl {
    param([string]$BranchName)
    
    $remoteUrl = git remote get-url origin 2>$null
    if (-not $remoteUrl) {
        return $null
    }
    
    # Convert SSH URL to HTTPS if needed
    if ($remoteUrl -match 'git@github\.com:(.+)\.git') {
        $repoPath = $Matches[1]
        return "https://github.com/$repoPath/compare/main...$BranchName`?expand=1"
    }
    elseif ($remoteUrl -match 'https://github\.com/(.+?)(\.git)?$') {
        $repoPath = $Matches[1] -replace '\.git$', ''
        return "https://github.com/$repoPath/compare/main...$BranchName`?expand=1"
    }
    
    return $null
}

Write-Host "🔧 Creating PR from main branch changes" -ForegroundColor Green
Write-Host ""

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "❌ Not in a git repository" -ForegroundColor Red
    exit 1
}

# Verify we're on main branch
$currentBranch = git branch --show-current
if ($currentBranch -ne "main") {
    Write-Host "❌ This script must be run from the main branch" -ForegroundColor Red
    Write-Host "Current branch: $currentBranch" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Switch to main first: git checkout main" -ForegroundColor White
    exit 1
}

Write-Host "✅ On main branch" -ForegroundColor Green


# Check for uncommitted changes
$status = git status --porcelain
$hasUncommittedChanges = $false
$hasStagedChanges = $false
$hasUnstagedChanges = $false

if ($status) {
    $hasUncommittedChanges = $true
    # Check for staged changes (lines starting with A, M, D, R, C in first column)
    $stagedLines = $status | Where-Object { $_ -match '^[AMDRC]' }
    if ($stagedLines) {
        $hasStagedChanges = $true
    }
    # Check for unstaged changes (lines with changes in second column or untracked ??)
    $unstagedLines = $status | Where-Object { $_ -match '^.[AMDRC?]' }
    if ($unstagedLines) {
        $hasUnstagedChanges = $true
    }
}

# Handle uncommitted changes
if ($hasUncommittedChanges) {
    Write-Host ""
    Write-Host "📝 Uncommitted changes detected:" -ForegroundColor Yellow
    git status --short
    Write-Host ""
    
    if ($hasStagedChanges) {
        Write-Host "You have staged changes ready to commit." -ForegroundColor Cyan
        $commitNow = Read-Host "Commit staged changes now? (y/n)"
        if ($commitNow -eq 'y' -or $commitNow -eq 'yes') {
            Write-Host "💾 Committing staged changes..." -ForegroundColor Yellow
            git commit -m $Title
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to commit changes" -ForegroundColor Red
                exit 1
            }
            Write-Host "✅ Changes committed" -ForegroundColor Green
        } else {
            Write-Host "❌ Please commit or stash your changes first" -ForegroundColor Red
            exit 1
        }
    } elseif ($hasUnstagedChanges) {
        Write-Host "You have unstaged changes." -ForegroundColor Cyan
        $stageAll = Read-Host "Stage and commit all changes? (y/n)"
        if ($stageAll -eq 'y' -or $stageAll -eq 'yes') {
            Write-Host "💾 Staging and committing all changes..." -ForegroundColor Yellow
            git add -A
            git commit -m $Title
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to commit changes" -ForegroundColor Red
                exit 1
            }
            Write-Host "✅ Changes committed" -ForegroundColor Green
        } else {
            Write-Host "❌ Please commit or stash your changes first" -ForegroundColor Red
            exit 1
        }
    }
}

# Check if there are commits on main that aren't on origin/main
Write-Host ""
Write-Host "🔍 Checking for local commits..." -ForegroundColor Yellow
git fetch origin main 2>$null
$localCommits = git log origin/main..HEAD --oneline 2>$null
if (-not $localCommits) {
    Write-Host "❌ No local commits found to create a PR from" -ForegroundColor Red
    Write-Host "Make some changes and commit them first, or use this script after committing." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Found local commits:" -ForegroundColor Green
$localCommits | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }


# Generate temporary branch name with timestamp
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$branchName = "hotfix/$timestamp"

Write-Host ""
Write-Host "🌿 Creating temporary branch: $branchName" -ForegroundColor Yellow

# Create the temporary branch from current HEAD
git checkout -b $branchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create temporary branch" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Branch created" -ForegroundColor Green

# Push the temporary branch to origin
Write-Host "📤 Pushing branch to origin..." -ForegroundColor Yellow
git push -u origin $branchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to push branch to origin" -ForegroundColor Red
    Write-Host "Cleaning up local branch..." -ForegroundColor Yellow
    git checkout main
    git branch -D $branchName
    exit 1
}
Write-Host "✅ Branch pushed to origin" -ForegroundColor Green

# Reset main to origin/main (remove the local commits from main)
Write-Host ""
Write-Host "🔄 Resetting main to origin/main..." -ForegroundColor Yellow
git checkout main
git reset --hard origin/main
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Warning: Failed to reset main branch" -ForegroundColor Yellow
    Write-Host "You may need to manually reset main after the PR is merged" -ForegroundColor Yellow
}


# Prepare PR body
$prBody = if ($Description) {
    "## Summary`n`n$Description`n`n## Checklist`n`n- [ ] CI passes`n- [ ] Ready to merge"
} else {
    "## Summary`n`n$Title`n`n## Checklist`n`n- [ ] CI passes`n- [ ] Ready to merge"
}

# Check if GitHub CLI is available
$ghAvailable = Get-Command gh -ErrorAction SilentlyContinue

if ($ghAvailable) {
    # Create PR via GitHub CLI
    Write-Host ""
    Write-Host "🔗 Creating Pull Request via GitHub CLI..." -ForegroundColor Yellow
    
    $prUrl = gh pr create --base main --head $branchName --title $Title --body $prBody 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "🎉 Pull Request created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "PR URL: $prUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. CI will run automatically on the PR" -ForegroundColor White
        Write-Host "2. Check CI status at the PR page" -ForegroundColor White
        Write-Host "3. When CI passes, merge the PR:" -ForegroundColor White
        Write-Host "   gh pr merge $branchName --merge --delete-branch" -ForegroundColor Gray
        Write-Host "   Or merge via the GitHub web UI" -ForegroundColor Gray
        Write-Host ""
        Write-Host "4. After merging, pull the changes:" -ForegroundColor White
        Write-Host "   git pull origin main" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Failed to create PR: $prUrl" -ForegroundColor Red
        Write-Host ""
        Write-Host "You can create the PR manually via the GitHub web UI" -ForegroundColor Yellow
        $compareUrl = Get-GitHubCompareUrl -BranchName $branchName
        if ($compareUrl) {
            Write-Host "Open: $compareUrl" -ForegroundColor Cyan
        }
    }
} else {
    # GitHub CLI not available - provide web UI instructions
    Write-Host ""
    Write-Host "⚠️  GitHub CLI (gh) not found" -ForegroundColor Yellow
    Write-Host "To install: https://cli.github.com/" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Create your PR manually via the GitHub web UI:" -ForegroundColor Cyan
    
    $compareUrl = Get-GitHubCompareUrl -BranchName $branchName
    if ($compareUrl) {
        Write-Host ""
        Write-Host "Open this URL to create the PR:" -ForegroundColor White
        Write-Host $compareUrl -ForegroundColor Green
        Write-Host ""
        Write-Host "Suggested PR title: $Title" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "1. Go to your repository on GitHub" -ForegroundColor White
        Write-Host "2. Click 'Pull requests' > 'New pull request'" -ForegroundColor White
        Write-Host "3. Set base: main, compare: $branchName" -ForegroundColor White
        Write-Host "4. Click 'Create pull request'" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "Next steps after creating and merging PR:" -ForegroundColor Cyan
    Write-Host "1. CI will run automatically on the PR" -ForegroundColor White
    Write-Host "2. Check CI status at the PR page" -ForegroundColor White
    Write-Host "3. Merge when CI passes" -ForegroundColor White
    Write-Host "4. Pull the merged changes: git pull origin main" -ForegroundColor White
}

Write-Host ""
Write-Host "📍 You are now on the main branch" -ForegroundColor Cyan
Write-Host "The hotfix branch '$branchName' is ready for PR review" -ForegroundColor Gray
