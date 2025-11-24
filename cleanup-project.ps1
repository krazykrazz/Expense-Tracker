# Project Cleanup Script
# Archives old completion reports, test scripts, and organizes project structure
# Date: November 24, 2025

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Project Cleanup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$archiveRoot = "archive"

# Create archive structure
Write-Host "Creating archive structure..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$archiveRoot" | Out-Null
New-Item -ItemType Directory -Force -Path "$archiveRoot/completion-reports" | Out-Null
New-Item -ItemType Directory -Force -Path "$archiveRoot/test-scripts" | Out-Null
New-Item -ItemType Directory -Force -Path "$archiveRoot/migration-scripts" | Out-Null
New-Item -ItemType Directory -Force -Path "$archiveRoot/spec-summaries" | Out-Null
Write-Host "✓ Archive structure created" -ForegroundColor Green
Write-Host ""

# 1. Archive completion reports from root
Write-Host "Archiving completion reports..." -ForegroundColor Yellow
$completionReports = @(
    "AUTO_MIGRATION_SYSTEM_COMPLETE.md",
    "CATEGORY_SUGGESTION_IMPLEMENTATION.md",
    "CODE_SMELLS_ANALYSIS.md",
    "CODE_SMELLS_FIXES_COMPLETE.md",
    "INTEGRATION_TESTING_COMPLETE.md",
    "MIGRATION_COMPLETE_EXPANDED_CATEGORIES.md",
    "NEW_SPEC_CREATION_COMPLETE.md",
    "OPTIMIZATION_COMPLETE.md",
    "OPTIMIZATION_COMPLETION_SUMMARY.md",
    "RECURRING_EXPENSES_REMOVAL.md",
    "RECURRING_EXPENSES_REMOVAL_COMPLETE.md",
    "DOCUMENTATION_CLEANUP_COMPLETE.md",
    "SPEC_CLEANUP_COMPLETE.md",
    "SPEC_REVIEW_COMPLETE.md",
    "FINAL_CLEANUP_SUMMARY.md",
    "ADDITIONAL_CLEANUP_RECOMMENDATIONS.md",
    "TEST_COVERAGE_ANALYSIS.md",
    "TEST_COVERAGE_COMPLETION_SUMMARY.md",
    "TEST_IMPLEMENTATION_NOTES.md",
    "DEPLOYMENT_GUIDE_EXPANDED_CATEGORIES.md"
)

$movedCount = 0
foreach ($file in $completionReports) {
    if (Test-Path $file) {
        Move-Item $file "$archiveRoot/completion-reports/" -Force
        Write-Host "  ✓ Moved $file" -ForegroundColor Gray
        $movedCount++
    }
}
Write-Host "✓ Archived $movedCount completion reports" -ForegroundColor Green
Write-Host ""

# 2. Archive test scripts from backend/scripts
Write-Host "Archiving test scripts..." -ForegroundColor Yellow
$testScripts = @(
    "backend/scripts/testBudgetsConstraints.js",
    "backend/scripts/testCategorySuggestion.js",
    "backend/scripts/testCategorySuggestionAPI.js",
    "backend/scripts/testCategorySuggestionIntegration.js",
    "backend/scripts/testCSVIntegration.js",
    "backend/scripts/testErrorScenarios.js",
    "backend/scripts/testFinalIntegration.js",
    "backend/scripts/testIntegration.js",
    "backend/scripts/testPlaceNameEdgeCases.js",
    "backend/scripts/testPlaceNamePerformance.js",
    "backend/scripts/testPlaceNamePerformanceStandalone.js",
    "backend/scripts/testPlaceNameStandardization.js",
    "backend/scripts/testRequirementsVerification.js",
    "backend/scripts/testWithSampleData.js",
    "backend/scripts/INTEGRATION_TEST_RESULTS.md"
)

$movedCount = 0
foreach ($file in $testScripts) {
    if (Test-Path $file) {
        $filename = Split-Path $file -Leaf
        Move-Item $file "$archiveRoot/test-scripts/$filename" -Force
        Write-Host "  ✓ Moved $filename" -ForegroundColor Gray
        $movedCount++
    }
}
Write-Host "✓ Archived $movedCount test scripts" -ForegroundColor Green
Write-Host ""

# 3. Archive migration scripts
Write-Host "Archiving migration scripts..." -ForegroundColor Yellow
$migrationScripts = @(
    "backend/scripts/addBudgetsTable.js",
    "backend/scripts/removeBudgetsTable.js",
    "backend/scripts/quickMigration.js",
    "backend/scripts/expandCategories.js",
    "backend/scripts/expandCategories.test.js",
    "backend/scripts/removeRecurringExpenses.js"
)

$movedCount = 0
foreach ($file in $migrationScripts) {
    if (Test-Path $file) {
        $filename = Split-Path $file -Leaf
        Move-Item $file "$archiveRoot/migration-scripts/$filename" -Force
        Write-Host "  ✓ Moved $filename" -ForegroundColor Gray
        $movedCount++
    }
}
Write-Host "✓ Archived $movedCount migration scripts" -ForegroundColor Green
Write-Host ""

# 4. Archive spec summary files
Write-Host "Archiving spec summary files..." -ForegroundColor Yellow
$specSummaries = @(
    ".kiro/specs/SPEC_UPDATES_SUMMARY.md",
    ".kiro/specs/SPEC_UPDATES_EXPANDED_CATEGORIES.md",
    ".kiro/specs/RECURRING_EXPENSES_SPEC_CLEANUP.md",
    ".kiro/specs/CODE_OPTIMIZATION_SPEC_UPDATE.md"
)

$movedCount = 0
foreach ($file in $specSummaries) {
    if (Test-Path $file) {
        $filename = Split-Path $file -Leaf
        Move-Item $file "$archiveRoot/spec-summaries/$filename" -Force
        Write-Host "  ✓ Moved $filename" -ForegroundColor Gray
        $movedCount++
    }
}
Write-Host "✓ Archived $movedCount spec summary files" -ForegroundColor Green
Write-Host ""

# 5. Remove empty folders
Write-Host "Checking for empty folders..." -ForegroundColor Yellow
$emptyFolders = @()

if (Test-Path "uploads") {
    $items = Get-ChildItem "uploads" -Force
    if ($items.Count -eq 0) {
        $emptyFolders += "uploads"
    }
}

if (Test-Path "backups") {
    $items = Get-ChildItem "backups" -Force
    if ($items.Count -eq 0) {
        $emptyFolders += "backups"
    }
}

if ($emptyFolders.Count -gt 0) {
    foreach ($folder in $emptyFolders) {
        Remove-Item $folder -Force -Recurse
        Write-Host "  ✓ Removed empty folder: $folder" -ForegroundColor Gray
    }
    Write-Host "✓ Removed $($emptyFolders.Count) empty folders" -ForegroundColor Green
} else {
    Write-Host "✓ No empty folders found" -ForegroundColor Green
}
Write-Host ""

# 6. Create archive README
Write-Host "Creating archive documentation..." -ForegroundColor Yellow
$readmeContent = @"
# Project Archive

**Created:** $timestamp

This archive contains historical documentation and scripts that have served their purpose but are retained for reference.

## Contents

### completion-reports/
Completion reports for various features and optimizations:
- Migration system implementations
- Feature implementations (category suggestions, etc.)
- Code optimization reports
- Test coverage analyses
- Cleanup summaries

### test-scripts/
One-time test scripts used during feature development:
- Integration tests
- Performance tests
- Edge case tests
- Requirements verification tests

### migration-scripts/
Database migration scripts (kept for reference):
- Budget table migrations
- Category expansion migrations
- Recurring expenses removal
- Quick migration utilities

### spec-summaries/
Spec update summaries and cleanup documentation:
- Spec update guides
- Cleanup analyses
- Historical spec changes

## Why These Files Were Archived

These files documented one-time events or completed work:
- Features are now implemented and working
- Migrations have been run
- Optimizations are complete
- Tests have been executed

The information is preserved in:
- CHANGELOG.md (version history)
- Git history (complete audit trail)
- Active specs (current requirements and design)

## Restoration

If you need to reference any of these files, they're all here in the archive folder. To restore a file:

``````powershell
Copy-Item archive/[subfolder]/[filename] ./
``````

## Cleanup Date

This cleanup was performed on: $timestamp
"@

Set-Content -Path "$archiveRoot/README.md" -Value $readmeContent
Write-Host "✓ Archive README created" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cleanup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "  • Completion reports archived" -ForegroundColor Gray
Write-Host "  • Test scripts archived" -ForegroundColor Gray
Write-Host "  • Migration scripts archived" -ForegroundColor Gray
Write-Host "  • Spec summaries archived" -ForegroundColor Gray
Write-Host "  • Empty folders removed" -ForegroundColor Gray
Write-Host ""
Write-Host "All archived files are in: $archiveRoot/" -ForegroundColor Yellow
Write-Host "See $archiveRoot/README.md for details" -ForegroundColor Yellow
Write-Host ""
Write-Host "Your project is now cleaner and better organized! 🎉" -ForegroundColor Green
