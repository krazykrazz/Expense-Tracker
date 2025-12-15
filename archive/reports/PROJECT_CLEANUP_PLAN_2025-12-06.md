# Project Cleanup Plan
**Date:** December 6, 2025
**Status:** Ready for Execution

## Overview

Comprehensive analysis identified multiple categories of files that can be archived or deleted to improve project organization and reduce clutter.

## Files to Archive

### Category 1: Old Deployment Summaries (Root Directory)
**Action:** Move to `archive/deployments/`

Files to move:
- `DEPLOYMENT_SUMMARY_v4.3.2.md`
- `DEPLOYMENT_SUMMARY_v4.3.3.md`
- `DEPLOYMENT_SUMMARY_v4.4.2.md`
- `DEPLOYMENT_SUMMARY_v4.4.3.md`
- `DEPLOYMENT_SUMMARY_v4.4.4.md`
- `DEPLOYMENT_SUMMARY_v4.4.5.md`
- `DEPLOYMENT_SUMMARY_v4.4.6.md`
- `DEPLOYMENT_SUMMARY_v4.4.7.md`
- `DEPLOYMENT_v4.3.2.md`
- `DEPLOYMENT_v4.3.3.md`
- `DEPLOYMENT_v4.4.2.md`

**Rationale:** These are historical deployment records. Keep only the FINAL version in root.

**Keep in Root:**
- `DEPLOYMENT_SUMMARY_v4.4.7_FINAL.md` (most recent)

---

### Category 2: Old Audit/Cleanup Reports (Root Directory)
**Action:** Move to `archive/reports/`

Files to move:
- `CODEBASE_AUDIT_REPORT_2025-12-03.md`
- `COMPREHENSIVE_AUDIT_COMPLETE_2025-12-03.md`
- `COMPREHENSIVE_CLEANUP_SUMMARY.md`
- `PROJECT_CLEANUP_COMPLETE_2025-11-30.md`
- `PROJECT_CLEANUP_REPORT_2025-11-30.md`
- `LOGGING_IMPROVEMENTS_COMPLETE.md`

**Rationale:** Historical audit reports. Current optimization reports should stay in root temporarily.

**Keep in Root (Temporarily):**
- `CODE_AUDIT_OPTIMIZATION_REPORT_2025-12-06.md` (current)
- `CODE_OPTIMIZATION_PROGRESS.md` (current)
- `CODE_OPTIMIZATION_SUMMARY_2025-12-06.md` (current)

---

### Category 3: Test Status Files (Root Directory)
**Action:** Move to `archive/reports/` or delete if obsolete

Files to evaluate:
- `TEST_FIXES_NEEDED.md` - Check if issues are resolved
- `TEST_FIXES_SUMMARY.md` - Archive if complete

**Rationale:** These are point-in-time test status reports.

---

### Category 4: Obsolete Backend Scripts
**Action:** Already in `backend/scripts/archive/` - verify and document

Current archived scripts:
- Migration scripts (already moved)
- Debug scripts (already moved)
- Old test scripts (already moved)

**Action:** Verify no active scripts should be archived

---

## Files to Keep in Root

### Essential Documentation
- `README.md` - Main project documentation
- `CHANGELOG.md` - Version history
- `FEATURE_ROADMAP.md` - Future planning
- `DOCKER.md` - Docker documentation
- `BUILD_AND_PUSH.md` - Build documentation
- `QUICK_BUILD_GUIDE.md` - Quick reference
- `RESTORE_BACKUP_GUIDE.md` - Backup procedures

### Current Reports (Temporary)
- `CODE_AUDIT_OPTIMIZATION_REPORT_2025-12-06.md`
- `CODE_OPTIMIZATION_PROGRESS.md`
- `CODE_OPTIMIZATION_SUMMARY_2025-12-06.md`
- `DEPLOYMENT_SUMMARY_v4.4.7_FINAL.md`

### Configuration & Scripts
- All `.bat`, `.ps1`, `.vbs` files (active scripts)
- `package.json`
- `docker-compose.yml`
- `Dockerfile`
- `.dockerignore`
- `.gitignore`

### Utility Scripts
- `validate_csv.py`
- `xls_to_csv.py`
- `cleanup-project.ps1`

---

## Execution Plan

### Phase 1: Archive Old Deployments
```
Move 11 deployment files → archive/deployments/
```

### Phase 2: Archive Old Reports
```
Move 6 audit/cleanup reports → archive/reports/
```

### Phase 3: Handle Test Status Files
```
Evaluate TEST_FIXES_*.md files
Archive or delete based on current status
```

### Phase 4: Update Archive README
```
Update archive/README.md with new archived files
```

### Phase 5: Verification
```
- Verify all essential files remain in root
- Verify archive structure is logical
- Update .gitignore if needed
```

---

## Expected Results

### Before Cleanup
- Root directory: ~60 files
- Many historical reports cluttering root
- Difficult to find current documentation

### After Cleanup
- Root directory: ~35 files
- Only current/essential docs in root
- Clear separation of active vs historical files
- Improved project navigation

---

## Archive Structure (After Cleanup)

```
archive/
├── bug-fixes/
├── completion-reports/
├── deployments/
│   ├── [OLD] DEPLOYMENT_v4.0.3.md through v4.3.1.md
│   ├── [NEW] DEPLOYMENT_SUMMARY_v4.3.2.md
│   ├── [NEW] DEPLOYMENT_SUMMARY_v4.3.3.md
│   ├── [NEW] DEPLOYMENT_SUMMARY_v4.4.2.md through v4.4.7.md
│   └── [NEW] DEPLOYMENT_v4.3.2.md, v4.3.3.md, v4.4.2.md
├── migration-scripts/
├── reports/
│   ├── [OLD] Various audit reports
│   ├── [NEW] CODEBASE_AUDIT_REPORT_2025-12-03.md
│   ├── [NEW] COMPREHENSIVE_AUDIT_COMPLETE_2025-12-03.md
│   ├── [NEW] COMPREHENSIVE_CLEANUP_SUMMARY.md
│   ├── [NEW] PROJECT_CLEANUP_COMPLETE_2025-11-30.md
│   ├── [NEW] PROJECT_CLEANUP_REPORT_2025-11-30.md
│   ├── [NEW] LOGGING_IMPROVEMENTS_COMPLETE.md
│   └── [NEW] TEST_FIXES_*.md (if applicable)
├── spec-implementations/
├── spec-summaries/
└── test-scripts/
```

---

## Rollback Plan

If any issues arise:
1. All files are moved, not deleted
2. Can easily restore from archive/
3. Git history preserves all changes

---

## Post-Cleanup Tasks

1. ✅ Update archive/README.md
2. ✅ Verify all links in remaining docs still work
3. ✅ Update any references to moved files
4. ✅ Commit changes with clear message
5. ✅ Document cleanup in CHANGELOG.md

---

**Estimated Time:** 15-20 minutes
**Risk Level:** Low (files moved, not deleted)
**Reversibility:** High (easy to restore)
