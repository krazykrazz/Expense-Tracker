# Project Archive

**Created:** 2025-11-24  
**Last Updated:** 2026-01-18

This archive contains historical documentation and scripts that have served their purpose but are retained for reference.

## Contents

### bug-fixes/ (NEW - Nov 30, 2025)
Documentation for completed bug fixes:
- Budget display fixes
- ExpenseList filter fixes
- Migration fix summaries

### completion-reports/ (Nov 24, 2025)
Completion reports for various features and optimizations:
- Migration system implementations
- Feature implementations (category suggestions, etc.)
- Code optimization reports
- Test coverage analyses
- Cleanup summaries

### deployments/ (Updated - Jan 18, 2026)
Historical deployment documentation:
- v3.2.0 through v4.9.1 deployment guides
- Deployment summaries and changelogs
- Version-specific implementation notes
- **Latest:** Added v3.2.0-v3.3.2, v4.6.0-v4.9.1 deployment files

### migration-scripts/ (Nov 24, 2025)
Database migration scripts (kept for reference):
- Budget table migrations
- Category expansion migrations
- Recurring expenses removal
- Quick migration utilities

### reports/ (Updated - Jan 18, 2026)
Point-in-time audit and analysis reports:
- Code audit reports (2025-12-03)
- Code optimization reports
- Code quality reports
- Cleanup reports (2025-11-30 through 2026-01-16)
- Docker implementation documentation
- Test fix summaries
- Logging improvements documentation
- Project cleanup summaries

### spec-implementations/ (NEW - Nov 30, 2025)
Implementation summaries from completed specs:
- Feature-specific implementation notes
- Integration test summaries
- Task completion summaries
- Spec impact analyses

### spec-summaries/ (Nov 24, 2025)
Spec update summaries and cleanup documentation:
- Spec update guides
- Cleanup analyses
- Historical spec changes

### specs/ (Updated - Jan 18, 2026)
Completed feature specifications that have been fully implemented:
- 27 archived spec directories for completed features
- Includes deprecated features (recurring-expenses)
- Infrastructure specs (code-optimization, containerization-optimization)
- All major feature implementations from v3.0.0 through v4.12.4
- **Latest:** Added invoice-backup-enhancement, multi-invoice-support, ui-modernization

### test-scripts/ (Nov 24, 2025)
One-time test scripts used during feature development:
- Integration tests
- Performance tests
- Edge case tests
- Requirements verification tests

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

```powershell
Copy-Item archive/[subfolder]/[filename] ./
```

## Cleanup History

- **2025-11-24:** Initial archive creation (45 files)
  - Moved completion reports, test scripts, migration scripts, spec summaries
  
- **2025-11-30:** Major cleanup (29 files + 131 backups)
  - Added bug-fixes/ folder (3 files)
  - Added deployments/ folder (8 files)
  - Added reports/ folder (5 files)
  - Added spec-implementations/ folder (13 files)
  - Archived 16 test scripts to backend/scripts/archive/
  - Deleted 131 old database backups (kept last 7)

- **2025-12-06:** Code optimization cleanup (19 files)
  - Moved 11 deployment summaries to deployments/ (v4.3.2 through v4.4.7)
  - Moved 8 audit/cleanup reports to reports/
  - Kept current optimization reports in root temporarily
  - Root directory reduced from ~60 to ~35 files

- **2025-12-14:** Post v4.6.0 cleanup (10 items)
  - Moved 7 dated report files from root to archive/reports/:
    - CLEANUP_AND_OPTIMIZATION_SUMMARY_2025-12-06.md
    - CODE_AUDIT_OPTIMIZATION_REPORT_2025-12-06.md
    - CODE_OPTIMIZATION_PROGRESS.md
    - CODE_OPTIMIZATION_SUMMARY_2025-12-06.md
    - PROJECT_CLEANUP_COMPLETE_2025-12-06.md
    - PROJECT_CLEANUP_PLAN_2025-12-06.md
  - Moved DEPLOYMENT_SUMMARY_v4.5.1.md to archive/deployments/
  - Deleted empty folders: backend/uploads/, backend/Expense Tracker Backups/
  - Deleted temporary files: backend/migration-debug.txt, frontend/test-results.txt, frontend/test-results2.txt
  - Removed empty .github/ folder (no workflows)
  - Root directory now has ~30 files (clean and organized)

- **2025-12-16:** Post v4.7.0 major spec cleanup (18+ items)
  - **NEW:** Created archive/specs/ folder for completed feature specifications
  - Archived 18 completed spec directories from .kiro/specs/ to archive/specs/:
    - recurring-expenses (deprecated in v4.0.0)
    - expanded-expense-categories, enhanced-annual-summary, expense-trend-indicators
    - configurable-fixed-expenses, configurable-monthly-gross, monthly-loans-balance
    - enhanced-fixed-expenses, global-expense-filtering, income-source-categories
    - investment-tracking, monthly-data-reminders, net-worth-card
    - personal-care-category, place-name-standardization, smart-expense-entry
    - tax-deductible-view, code-optimization, containerization-optimization, expense-tracker
  - Deleted old database file: backend/database/expenses.db (app uses config/database/)
  - Moved migration docs: backend/database/PEOPLE_TABLES_MIGRATION.md to archive/migration-scripts/
  - Deleted empty directories: backend/backups/, backend/uploads/, backend/config/config/
  - Deleted obsolete scripts: calculateEstimatedMonthsLeft.js, setEstimatedMonthsLeft.js, updateEstimatedMonthsLeft.js
  - **NEW:** Created utils/ folder and moved Python utilities: validate_csv.py, xls_to_csv.py
  - .kiro/specs/ now contains only active specs: budget-tracking-alerts, medical-expense-people-tracking, merchant-analytics

- **2026-01-16:** Post v4.12.0 final spec cleanup (11 items)
  - Archived 6 remaining completed spec directories from .kiro/specs/ to archive/specs/:
    - budget-alert-notifications (v4.10.0)
    - budget-tracking-alerts (v3.7.0)
    - medical-expense-invoices (v4.12.0)
    - medical-expense-people-tracking (v4.6.0)
    - merchant-analytics (v4.7.0 + v4.9.0)
    - sticky-summary-scrolling (v4.11.0)
  - Moved 5 root directory reports to archive/reports/:
    - CODE_ANALYSIS_REPORT.md → CODE_ANALYSIS_REPORT_2025-12-24.md
    - CODE_REVIEW_INVOICE_FEATURE.md → CODE_REVIEW_INVOICE_FEATURE_2026-01-15.md
    - TEST_FIXES_SUMMARY.md → TEST_FIXES_SUMMARY_2025-12-23.md
    - PROJECT_CLEANUP_SUMMARY_2025-12-16.md
    - OPTIMIZATION_COMPLETION_SUMMARY.md (deleted - duplicate)
  - Deleted empty/incomplete spec: merchant-analytics-fixed-expenses
  - **Result:** .kiro/specs/ now contains ONLY metadata files (CHANGELOG.md, SPEC_AUDIT_REPORT.md)
  - **Total archived specs:** 24 complete feature specifications (v3.0.0 through v4.12.0)
  - Root directory now extremely clean with only active documentation

- **2026-01-18:** Post v4.12.4 comprehensive cleanup (25+ items)
  - **Archived 3 completed specs** from .kiro/specs/ to archive/specs/:
    - invoice-backup-enhancement (v4.12.x - archive backup system)
    - multi-invoice-support (v4.12.x - multiple invoices per expense)
    - ui-modernization (v4.12.x - modern CSS design system)
  - **Archived 10 older deployment docs** from docs/deployments/ to archive/deployments/:
    - CHANGELOG_v3.2.0.md, DATABASE_MIGRATION_COMPLETE.md
    - DEPLOYMENT_v3.2.0.md, DEPLOYMENT_v3.3.1.md, DEPLOYMENT_v3.3.2.md
    - DEPLOYMENT_v4.6.0.md, DEPLOYMENT_v4.8.0.md, DEPLOYMENT_v4.9.0.md, DEPLOYMENT_v4.9.1.md
    - OPTIMIZATION_PROGRESS.md → archive/reports/
  - **Archived root cleanup summary** to archive/reports/:
    - PROJECT_CLEANUP_SUMMARY_2026-01-16.md
  - **Archived 12 one-time backend scripts** to backend/scripts/archive/:
    - Schema check scripts: checkBudgetsSchema.js, checkIncomeSchema.js, checkInvestmentSchema.js, checkPeopleSchema.js, checkPersonalCare.js
    - One-time fix: fixCategoryConstraint.js
    - Completed migrations: runPeopleMigration.js, runIncomeCategoryMigration.js, runPersonalCareMigration.js
    - Verification scripts: testPeopleConstraints.js, verifyBudgetsTrigger.js, verifyPeopleTablesRequirements.js
  - **Deleted outdated file**: .kiro/specs/CHANGELOG.md (main CHANGELOG.md is source of truth)
  - **Result:** .kiro/specs/ now contains only 1 active spec (medical-insurance-tracking) + SPEC_AUDIT_REPORT.md
  - **Total archived specs:** 27 complete feature specifications
  - docs/deployments/ now contains only v4.10.0+ deployment docs

## Next Review

**Scheduled:** 2026-07-18 (6 months from last cleanup)

**Actions to consider:**
- Delete files older than 12 months if not referenced
- Review archive size and consolidate if needed
- Update this README with any new archive categories
