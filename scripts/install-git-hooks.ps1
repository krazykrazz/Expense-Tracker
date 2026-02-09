#!/usr/bin/env pwsh
# Install Git Hooks for Workflow Enforcement

Write-Host "Installing Git Hooks..." -ForegroundColor Cyan

# Create .git/hooks directory if it doesn't exist
$hooksDir = ".git/hooks"
if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir | Out-Null
}

# Copy pre-commit hook
$sourceHook = "scripts/git-hooks/pre-commit"
$targetHook = "$hooksDir/pre-commit"

if (Test-Path $sourceHook) {
    Copy-Item $sourceHook $targetHook -Force
    
    # Make executable on Unix-like systems
    if ($IsLinux -or $IsMacOS) {
        chmod +x $targetHook
    }
    
    Write-Host "✅ Installed pre-commit hook" -ForegroundColor Green
    Write-Host "   Prevents version bumps on feature branches" -ForegroundColor Gray
} else {
    Write-Host "❌ Source hook not found: $sourceHook" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Git hooks installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "The pre-commit hook will now:" -ForegroundColor Cyan
Write-Host "  • Block version bumps on feature branches" -ForegroundColor Gray
Write-Host "  • Ensure version changes only happen on main" -ForegroundColor Gray
Write-Host ""
