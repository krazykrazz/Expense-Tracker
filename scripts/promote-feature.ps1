param(
    [Parameter(Mandatory=$true)]
    [string]$FeatureName,
    [switch]$SkipTests,
    [switch]$Force,
    [switch]$DirectMerge
)

$BranchName = "feature/$FeatureName"

# Function to convert kebab-case to Title Case for PR titles
function ConvertTo-PRTitle {
    param([string]$FeatureName)
    $words = $FeatureName -split '-'
    $titled = $words | ForEach-Object { $_.Substring(0,1).ToUpper() + $_.Substring(1) }
    return "feat: " + ($titled -join ' ')
}

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

# Function to clean up test database files that shouldn't be tracked
function Remove-TestDatabaseFiles {
    $testDbPatterns = @(
        "backend/config/database/*.db-shm",
        "backend/config/database/*.db-wal"
    )
    
    $filesRemoved = $false
    
    foreach ($pattern in $testDbPatterns) {
        # Check if any matching files are tracked by git
        $trackedFiles = git ls-files $pattern 2>$null
        if ($trackedFiles) {
            Write-Host "🧹 Removing tracked test database files from git..." -ForegroundColor Yellow
            foreach ($file in $trackedFiles -split "`n") {
                if ($file) {
                    git rm --cached $file 2>$null
                    Write-Host "   Removed from tracking: $file" -ForegroundColor Gray
                    $filesRemoved = $true
                }
            }
        }
        
        # Also check for untracked/modified files matching the pattern
        $localFiles = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
        foreach ($file in $localFiles) {
            # Reset any changes to these files
            git checkout -- $file.FullName 2>$null
        }
    }
    
    if ($filesRemoved) {
        # Commit the removal
        git commit -m "chore: remove test database WAL files from tracking" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Test database files removed from git tracking" -ForegroundColor Green
        }
    }
}

if ($DirectMerge) {
    Write-Host "🚀 Promoting feature branch: $BranchName to main (Direct Merge)" -ForegroundColor Green
} else {
    Write-Host "🚀 Creating PR for feature branch: $BranchName" -ForegroundColor Green
}
Write-Host ""

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "❌ Not in a git repository" -ForegroundColor Red
    exit 1
}

# Check if feature branch exists
$branchExists = git branch --list $BranchName
if (-not $branchExists) {
    Write-Host "❌ Feature branch '$BranchName' does not exist" -ForegroundColor Red
    exit 1
}

# Ensure we're on the feature branch
Write-Host "📋 Switching to feature branch..." -ForegroundColor Yellow
git checkout $BranchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to checkout feature branch" -ForegroundColor Red
    exit 1
}

# Clean up test database files that shouldn't be tracked
Remove-TestDatabaseFiles

# Check for uncommitted changes
$status = git status --porcelain
if ($status -and -not $Force) {
    Write-Host "❌ You have uncommitted changes:" -ForegroundColor Red
    git status --short
    Write-Host "Please commit or stash changes, or use -Force to proceed anyway" -ForegroundColor Yellow
    exit 1
}

# Sync with main
Write-Host "🔄 Syncing with main branch..." -ForegroundColor Yellow
git checkout main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to checkout main branch" -ForegroundColor Red
    exit 1
}

git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to pull from origin/main" -ForegroundColor Red
    exit 1
}

git checkout $BranchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to return to feature branch" -ForegroundColor Red
    exit 1
}

Write-Host "🔀 Merging main into feature branch..." -ForegroundColor Yellow
git merge main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Merge conflicts detected!" -ForegroundColor Red
    Write-Host "Please resolve conflicts and try again:" -ForegroundColor Yellow
    Write-Host "1. Resolve conflicts in the listed files" -ForegroundColor White
    Write-Host "2. git add ." -ForegroundColor White
    Write-Host "3. git commit -m 'resolve merge conflicts'" -ForegroundColor White
    Write-Host "4. Run this script again" -ForegroundColor White
    exit 1
}

# Run tests unless skipped
if (-not $SkipTests) {
    Write-Host "🧪 Running tests..." -ForegroundColor Yellow
    
    # Check if we have npm
    $npmExists = Get-Command npm -ErrorAction SilentlyContinue
    if ($npmExists) {
        # Run frontend tests (parallel for speed)
        Write-Host "Running frontend tests (parallel)..." -ForegroundColor Cyan
        Set-Location frontend
        npm run test:parallel 2>$null
        $frontendTestResult = $LASTEXITCODE
        Set-Location ..
        
        # Run backend tests (parallel for speed)
        Write-Host "Running backend tests (parallel)..." -ForegroundColor Cyan
        Set-Location backend
        npm run test:parallel 2>$null
        $backendTestResult = $LASTEXITCODE
        Set-Location ..
        
        if ($frontendTestResult -ne 0 -or $backendTestResult -ne 0) {
            Write-Host "❌ Tests failed!" -ForegroundColor Red
            Write-Host "Frontend tests: $(if ($frontendTestResult -eq 0) { '✅ PASSED' } else { '❌ FAILED' })" -ForegroundColor $(if ($frontendTestResult -eq 0) { 'Green' } else { 'Red' })
            Write-Host "Backend tests: $(if ($backendTestResult -eq 0) { '✅ PASSED' } else { '❌ FAILED' })" -ForegroundColor $(if ($backendTestResult -eq 0) { 'Green' } else { 'Red' })
            Write-Host "Please fix failing tests and try again, or use -SkipTests to bypass" -ForegroundColor Yellow
            exit 1
        }
        
        Write-Host "✅ All tests passed!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  npm not found, skipping tests" -ForegroundColor Yellow
    }
} else {
    Write-Host "⏭️  Skipping tests (as requested)" -ForegroundColor Yellow
}

# Pre-promotion checklist
Write-Host ""
Write-Host "📋 Pre-promotion checklist:" -ForegroundColor Cyan
Write-Host "✅ Feature branch synced with main" -ForegroundColor Green
if (-not $SkipTests) {
    Write-Host "✅ Tests passing" -ForegroundColor Green
} else {
    Write-Host "⏭️  Tests skipped" -ForegroundColor Yellow
}

# Check for spec completion (if spec exists)
$specPath = ".kiro/specs/$FeatureName"
if (Test-Path $specPath) {
    Write-Host "📋 Spec found at $specPath" -ForegroundColor Cyan
    
    # Check if tasks.md exists and count completed tasks
    $tasksPath = "$specPath/tasks.md"
    if (Test-Path $tasksPath) {
        $tasksContent = Get-Content $tasksPath -Raw
        $totalTasks = ([regex]::Matches($tasksContent, '- \[[ x]\]')).Count
        $completedTasks = ([regex]::Matches($tasksContent, '- \[x\]')).Count
        
        Write-Host "📊 Task completion: $completedTasks/$totalTasks tasks completed" -ForegroundColor $(if ($completedTasks -eq $totalTasks) { 'Green' } else { 'Yellow' })
        
        if ($completedTasks -lt $totalTasks -and -not $Force) {
            Write-Host "⚠️  Not all tasks are completed. Use -Force to promote anyway" -ForegroundColor Yellow
            Write-Host "Incomplete tasks may indicate the feature is not ready for production" -ForegroundColor Yellow
            exit 1
        }
    }
}

# Branch based on DirectMerge flag
if ($DirectMerge) {
    # ============================================
    # DIRECT MERGE WORKFLOW (Original behavior)
    # ============================================
    
    # Final confirmation
    if (-not $Force) {
        Write-Host ""
        Write-Host "🤔 Ready to promote '$FeatureName' to main branch?" -ForegroundColor Yellow
        $confirmation = Read-Host "Type 'yes' to continue"
        if ($confirmation -ne 'yes') {
            Write-Host "❌ Promotion cancelled" -ForegroundColor Red
            exit 1
        }
    }

    # Merge to main
    Write-Host ""
    Write-Host "🔀 Merging feature to main..." -ForegroundColor Yellow
    git checkout main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to checkout main branch" -ForegroundColor Red
        exit 1
    }

    git merge $BranchName --no-ff -m "feat: merge $FeatureName feature"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to merge feature branch" -ForegroundColor Red
        exit 1
    }

    # Push to main
    Write-Host "📤 Pushing to origin/main..." -ForegroundColor Yellow
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to push to origin/main" -ForegroundColor Red
        Write-Host "You may need to resolve this manually" -ForegroundColor Yellow
        exit 1
    }

    Write-Host ""
    Write-Host "🎉 Feature '$FeatureName' successfully promoted to main!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Consider building and pushing Docker image: .\scripts\build-and-push.ps1 -Tag latest" -ForegroundColor White
    Write-Host "2. Monitor application for any issues" -ForegroundColor White
    Write-Host "3. Clean up feature branch (optional):" -ForegroundColor White
    Write-Host "   git branch -d $BranchName" -ForegroundColor Gray
    Write-Host "   git push origin --delete $BranchName" -ForegroundColor Gray
    Write-Host ""

    # Offer to clean up branch
    $cleanup = Read-Host "Delete feature branch '$BranchName'? (y/n)"
    if ($cleanup -eq 'y' -or $cleanup -eq 'yes') {
        Write-Host "🧹 Cleaning up feature branch..." -ForegroundColor Yellow
        git branch -d $BranchName
        git push origin --delete $BranchName
        Write-Host "✅ Feature branch deleted" -ForegroundColor Green
    }
} else {
    # ============================================
    # PR WORKFLOW (New default behavior)
    # ============================================
    
    # Generate PR title from feature name
    $prTitle = ConvertTo-PRTitle -FeatureName $FeatureName
    $prBody = "## Summary`n`nThis PR promotes the ``$FeatureName`` feature to main.`n`n## Checklist`n`n- [ ] CI passes`n- [ ] Code reviewed`n- [ ] Ready to merge"
    
    # Push feature branch to origin
    Write-Host ""
    Write-Host "📤 Pushing feature branch to origin..." -ForegroundColor Yellow
    git push -u origin $BranchName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to push feature branch to origin" -ForegroundColor Red
        Write-Host "You may need to resolve this manually" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ Feature branch pushed to origin" -ForegroundColor Green
    
    # Check if GitHub CLI is available
    $ghAvailable = Get-Command gh -ErrorAction SilentlyContinue
    
    if ($ghAvailable) {
        # Create PR via GitHub CLI
        Write-Host ""
        Write-Host "🔗 Creating Pull Request via GitHub CLI..." -ForegroundColor Yellow
        
        $prUrl = gh pr create --base main --head $BranchName --title $prTitle --body $prBody 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "🎉 Pull Request created successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "PR URL: $prUrl" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Next steps:" -ForegroundColor Cyan
            Write-Host "1. CI will run automatically on the PR" -ForegroundColor White
            Write-Host "2. Check CI status at the PR page" -ForegroundColor White
            Write-Host "3. When CI passes and ready to merge:" -ForegroundColor White
            Write-Host "   gh pr merge --merge --delete-branch" -ForegroundColor Gray
            Write-Host "   Or merge via the GitHub web UI" -ForegroundColor Gray
            Write-Host ""
        } else {
            # Check if PR already exists
            if ($prUrl -match "already exists") {
                Write-Host "⚠️  A PR for this branch already exists" -ForegroundColor Yellow
                $existingPr = gh pr view $BranchName --json url --jq '.url' 2>$null
                if ($existingPr) {
                    Write-Host "PR URL: $existingPr" -ForegroundColor Cyan
                }
            } else {
                Write-Host "❌ Failed to create PR: $prUrl" -ForegroundColor Red
                Write-Host ""
                Write-Host "You can create the PR manually via the GitHub web UI" -ForegroundColor Yellow
                $compareUrl = Get-GitHubCompareUrl -BranchName $BranchName
                if ($compareUrl) {
                    Write-Host "Open: $compareUrl" -ForegroundColor Cyan
                }
            }
        }
    } else {
        # GitHub CLI not available - provide web UI instructions
        Write-Host ""
        Write-Host "⚠️  GitHub CLI (gh) not found" -ForegroundColor Yellow
        Write-Host "To install: https://cli.github.com/" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Create your PR manually via the GitHub web UI:" -ForegroundColor Cyan
        
        $compareUrl = Get-GitHubCompareUrl -BranchName $BranchName
        if ($compareUrl) {
            Write-Host ""
            Write-Host "Open this URL to create the PR:" -ForegroundColor White
            Write-Host $compareUrl -ForegroundColor Green
            Write-Host ""
            Write-Host "Suggested PR title: $prTitle" -ForegroundColor Gray
        } else {
            Write-Host ""
            Write-Host "1. Go to your repository on GitHub" -ForegroundColor White
            Write-Host "2. Click 'Pull requests' > 'New pull request'" -ForegroundColor White
            Write-Host "3. Set base: main, compare: $BranchName" -ForegroundColor White
            Write-Host "4. Click 'Create pull request'" -ForegroundColor White
        }
        
        Write-Host ""
        Write-Host "Next steps after creating PR:" -ForegroundColor Cyan
        Write-Host "1. CI will run automatically on the PR" -ForegroundColor White
        Write-Host "2. Check CI status at the PR page" -ForegroundColor White
        Write-Host "3. Merge when CI passes and code is reviewed" -ForegroundColor White
    }
}
