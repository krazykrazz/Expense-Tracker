# Git Helper Functions for Feature Branch Workflow
# Usage: . .\scripts\git-helpers.ps1 (to load functions)

function Show-Branches {
    Write-Host "📋 Current branches:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Local branches:" -ForegroundColor Yellow
    git branch
    Write-Host ""
    Write-Host "Remote branches:" -ForegroundColor Yellow
    git branch -r
}

function Show-Status {
    Write-Host "📊 Repository status:" -ForegroundColor Cyan
    Write-Host ""
    git status
    Write-Host ""
    Write-Host "Recent commits:" -ForegroundColor Yellow
    git log --oneline -5
}

function Sync-WithMain {
    Write-Host "🔄 Syncing current branch with main..." -ForegroundColor Yellow
    $currentBranch = git branch --show-current
    
    git checkout main
    git pull origin main
    git checkout $currentBranch
    git merge main
    
    Write-Host "✅ Synced '$currentBranch' with main" -ForegroundColor Green
}

function New-FeatureBranch {
    param([string]$Name)
    
    if (-not $Name) {
        $Name = Read-Host "Enter feature name"
    }
    
    & ".\scripts\create-feature-branch.ps1" -FeatureName $Name
}

function Promote-Feature {
    param([string]$Name, [switch]$SkipTests)
    
    if (-not $Name) {
        $currentBranch = git branch --show-current
        if ($currentBranch -match "feature/(.+)") {
            $Name = $matches[1]
        } else {
            $Name = Read-Host "Enter feature name"
        }
    }
    
    $params = @{ FeatureName = $Name }
    if ($SkipTests) { $params.SkipTests = $true }
    
    & ".\scripts\promote-feature.ps1" @params
}

function Show-FeatureBranches {
    Write-Host "🌿 Feature branches:" -ForegroundColor Cyan
    git branch | Where-Object { $_ -match "feature/" } | ForEach-Object {
        $branch = $_.Trim().Replace("* ", "")
        $lastCommit = git log -1 --format="%cr" $branch
        Write-Host "  $branch (last commit: $lastCommit)" -ForegroundColor White
    }
}

function Remove-FeatureBranch {
    param([string]$Name)
    
    if (-not $Name) {
        Show-FeatureBranches
        $Name = Read-Host "Enter feature name to delete"
    }
    
    $branchName = "feature/$Name"
    
    Write-Host "🗑️  Deleting feature branch: $branchName" -ForegroundColor Yellow
    
    # Switch to main if we're on the branch to be deleted
    $currentBranch = git branch --show-current
    if ($currentBranch -eq $branchName) {
        git checkout main
    }
    
    # Delete local branch
    git branch -d $branchName
    
    # Delete remote branch
    git push origin --delete $branchName
    
    Write-Host "✅ Feature branch '$branchName' deleted" -ForegroundColor Green
}

function Show-Help {
    Write-Host "🔧 Git Helper Functions:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Show-Branches          - List all local and remote branches" -ForegroundColor White
    Write-Host "Show-Status            - Show repository status and recent commits" -ForegroundColor White
    Write-Host "Show-FeatureBranches   - List all feature branches with last commit info" -ForegroundColor White
    Write-Host "Sync-WithMain          - Sync current branch with main" -ForegroundColor White
    Write-Host "New-FeatureBranch      - Create new feature branch" -ForegroundColor White
    Write-Host "Promote-Feature        - Promote feature branch to main" -ForegroundColor White
    Write-Host "Remove-FeatureBranch   - Delete feature branch (local and remote)" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  New-FeatureBranch budget-alert-notifications" -ForegroundColor Gray
    Write-Host "  Promote-Feature budget-alert-notifications" -ForegroundColor Gray
    Write-Host "  Promote-Feature budget-alert-notifications -SkipTests" -ForegroundColor Gray
    Write-Host "  Remove-FeatureBranch budget-alert-notifications" -ForegroundColor Gray
}

# Show help when script is loaded
Write-Host "🔧 Git helper functions loaded!" -ForegroundColor Green
Write-Host "Type 'Show-Help' for available commands" -ForegroundColor Yellow