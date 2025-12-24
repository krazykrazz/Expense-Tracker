param(
    [Parameter(Mandatory=$true)]
    [string]$FeatureName,
    [switch]$SkipTests,
    [switch]$Force
)

$BranchName = "feature/$FeatureName"

Write-Host "🚀 Promoting feature branch: $BranchName to main" -ForegroundColor Green
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
        # Run frontend tests
        Write-Host "Running frontend tests..." -ForegroundColor Cyan
        Set-Location frontend
        npm test -- --run --reporter=verbose 2>$null
        $frontendTestResult = $LASTEXITCODE
        Set-Location ..
        
        # Run backend tests
        Write-Host "Running backend tests..." -ForegroundColor Cyan
        Set-Location backend
        npm test 2>$null
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
Write-Host "1. Consider building and pushing Docker image: .\build-and-push.ps1 -Tag latest" -ForegroundColor White
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