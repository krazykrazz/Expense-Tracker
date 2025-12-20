param(
    [Parameter(Mandatory=$true)]
    [string]$FeatureName
)

$BranchName = "feature/$FeatureName"

Write-Host "Creating feature branch: $BranchName" -ForegroundColor Green

# Ensure we're on main and up to date
Write-Host "Switching to main branch..." -ForegroundColor Yellow
git checkout main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to checkout main branch" -ForegroundColor Red
    exit 1
}

Write-Host "Pulling latest changes from origin/main..." -ForegroundColor Yellow
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to pull from origin/main" -ForegroundColor Red
    exit 1
}

# Check if branch already exists
$existingBranch = git branch --list $BranchName
if ($existingBranch) {
    Write-Host "Branch '$BranchName' already exists locally" -ForegroundColor Red
    Write-Host "Use: git checkout $BranchName" -ForegroundColor Yellow
    exit 1
}

# Create and switch to feature branch
Write-Host "Creating and switching to feature branch..." -ForegroundColor Yellow
git checkout -b $BranchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create feature branch" -ForegroundColor Red
    exit 1
}

# Push to remote
Write-Host "Pushing feature branch to remote..." -ForegroundColor Yellow
git push -u origin $BranchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push to remote" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Feature branch '$BranchName' created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Start implementing tasks from .kiro/specs/$FeatureName/tasks.md" -ForegroundColor White
Write-Host "2. Commit changes regularly: git add . && git commit -m 'feat: description'" -ForegroundColor White
Write-Host "3. Push changes: git push origin $BranchName" -ForegroundColor White
Write-Host "4. When ready to promote: .\scripts\promote-feature.ps1 -FeatureName $FeatureName" -ForegroundColor White
Write-Host ""