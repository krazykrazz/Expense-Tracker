# Project Archive

**Created:** 2025-11-24  
**Last Updated:** 2025-11-30

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

### deployments/ (NEW - Nov 30, 2025)
Historical deployment documentation:
- v4.0.3 through v4.3.1 deployment guides
- Deployment summaries and changelogs
- Version-specific implementation notes

### migration-scripts/ (Nov 24, 2025)
Database migration scripts (kept for reference):
- Budget table migrations
- Category expansion migrations
- Recurring expenses removal
- Quick migration utilities

### reports/ (NEW - Nov 30, 2025)
Point-in-time audit and analysis reports:
- Code audit reports
- Code optimization reports
- Code quality reports
- Cleanup reports
- Docker implementation documentation

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

## Next Review

**Scheduled:** 2026-05-30 (6 months from last cleanup)

**Actions to consider:**
- Delete files older than 12 months if not referenced
- Review archive size and consolidate if needed
- Update this README with any new archive categories
