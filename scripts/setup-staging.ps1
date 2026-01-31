<#
.SYNOPSIS
    Sets up the staging environment with a copy of production data for testing new versions.

.DESCRIPTION
    This script:
    1. Creates the staging-data directory if needed
    2. Copies a production backup (or current production data) to staging
    3. Optionally starts the staging container

.PARAMETER BackupFile
    Path to a backup file (.tar.gz or .zip) to restore. If not provided, copies current production data.

.PARAMETER Start
    If specified, starts the staging container after setup.

.EXAMPLE
    .\scripts\setup-staging.ps1
    # Copies current production data to staging

.EXAMPLE
    .\scripts\setup-staging.ps1 -BackupFile "test-data\expense-tracker-backup-2026-01-29_00-18-35.tar.gz"
    # Restores a specific tar.gz backup to staging

.EXAMPLE
    .\scripts\setup-staging.ps1 -BackupFile "G:\My Drive\Documents\Financial\Expense Tracker Backups\backup-2026-01-28.zip"
    # Restores a specific zip backup to staging

.EXAMPLE
    .\scripts\setup-staging.ps1 -Start
    # Copies production data and starts staging container
#>

param(
    [string]$BackupFile,
    [switch]$Start
)

$ErrorActionPreference = "Stop"

$stagingDir = ".\staging-data"
$productionDir = ".\config"

Write-Host "=== Staging Environment Setup ===" -ForegroundColor Cyan

# Create staging directory
if (-not (Test-Path $stagingDir)) {
    Write-Host "Creating staging directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $stagingDir | Out-Null
    New-Item -ItemType Directory -Path "$stagingDir\database" | Out-Null
    New-Item -ItemType Directory -Path "$stagingDir\invoices" | Out-Null
}

# Stop staging container if running
$stagingContainer = docker ps -q -f "name=expense-tracker-staging" 2>$null
if ($stagingContainer) {
    Write-Host "Stopping existing staging container..." -ForegroundColor Yellow
    docker stop expense-tracker-staging | Out-Null
}

if ($BackupFile) {
    # Restore from backup file
    if (-not (Test-Path $BackupFile)) {
        Write-Host "Error: Backup file not found: $BackupFile" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Restoring from backup: $BackupFile" -ForegroundColor Yellow
    
    # Clear existing staging data
    if (Test-Path "$stagingDir\database\expenses.db") {
        Remove-Item "$stagingDir\database\expenses.db" -Force
    }
    
    # Extract backup
    $tempDir = "$stagingDir\temp_restore"
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    
    # Determine archive type and extract accordingly
    if ($BackupFile -match '\.tar\.gz$') {
        # Extract tar.gz using tar command
        Write-Host "  Extracting tar.gz archive..." -ForegroundColor Yellow
        tar -xzf $BackupFile -C $tempDir
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: Failed to extract tar.gz archive" -ForegroundColor Red
            exit 1
        }
    } elseif ($BackupFile -match '\.zip$') {
        # Extract zip using Expand-Archive
        Write-Host "  Extracting zip archive..." -ForegroundColor Yellow
        Expand-Archive -Path $BackupFile -DestinationPath $tempDir -Force
    } else {
        Write-Host "Error: Unsupported archive format. Use .tar.gz or .zip" -ForegroundColor Red
        exit 1
    }
    
    # Find and copy database
    $dbFile = Get-ChildItem -Path $tempDir -Filter "expenses.db" -Recurse | Select-Object -First 1
    if ($dbFile) {
        Copy-Item $dbFile.FullName -Destination "$stagingDir\database\expenses.db" -Force
        Write-Host "  Database restored" -ForegroundColor Green
    } else {
        Write-Host "  Warning: No database found in backup" -ForegroundColor Yellow
    }
    
    # Copy invoices if present
    $invoicesDir = Get-ChildItem -Path $tempDir -Directory -Filter "invoices" -Recurse | Select-Object -First 1
    if ($invoicesDir) {
        Copy-Item "$($invoicesDir.FullName)\*" -Destination "$stagingDir\invoices\" -Recurse -Force
        Write-Host "  Invoices restored" -ForegroundColor Green
    }
    
    # Copy statements if present
    $statementsDir = Get-ChildItem -Path $tempDir -Directory -Filter "statements" -Recurse | Select-Object -First 1
    if ($statementsDir) {
        if (-not (Test-Path "$stagingDir\statements")) {
            New-Item -ItemType Directory -Path "$stagingDir\statements" | Out-Null
        }
        Copy-Item "$($statementsDir.FullName)\*" -Destination "$stagingDir\statements\" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Statements restored" -ForegroundColor Green
    }
    
    # Cleanup temp
    Remove-Item $tempDir -Recurse -Force
    
} else {
    # Copy from current production
    Write-Host "Copying current production data to staging..." -ForegroundColor Yellow
    
    if (Test-Path "$productionDir\database\expenses.db") {
        Copy-Item "$productionDir\database\expenses.db" -Destination "$stagingDir\database\expenses.db" -Force
        Write-Host "  Database copied" -ForegroundColor Green
    } else {
        Write-Host "  Warning: No production database found at $productionDir\database\expenses.db" -ForegroundColor Yellow
    }
    
    if (Test-Path "$productionDir\invoices") {
        Copy-Item "$productionDir\invoices\*" -Destination "$stagingDir\invoices\" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Invoices copied" -ForegroundColor Green
    }
}

# Show staging data info
if (Test-Path "$stagingDir\database\expenses.db") {
    $dbSize = (Get-Item "$stagingDir\database\expenses.db").Length / 1KB
    Write-Host "`nStaging database: $([math]::Round($dbSize, 2)) KB" -ForegroundColor Cyan
}

Write-Host "`n=== Staging Setup Complete ===" -ForegroundColor Green

if ($Start) {
    Write-Host "`nStarting staging container..." -ForegroundColor Yellow
    docker-compose --profile staging up -d expense-tracker-staging
    
    Write-Host "`nStaging container started!" -ForegroundColor Green
    Write-Host "  URL: http://localhost:2627" -ForegroundColor Cyan
    Write-Host "  Logs: docker logs -f expense-tracker-staging" -ForegroundColor Cyan
} else {
    Write-Host "`nTo start staging container:" -ForegroundColor Yellow
    Write-Host "  docker-compose --profile staging up -d expense-tracker-staging" -ForegroundColor White
    Write-Host "`nOr run this script with -Start flag" -ForegroundColor Yellow
}

Write-Host "`nTo stop staging:" -ForegroundColor Yellow
Write-Host "  docker-compose --profile staging down" -ForegroundColor White
