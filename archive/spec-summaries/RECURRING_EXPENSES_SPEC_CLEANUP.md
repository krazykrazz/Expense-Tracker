# Recurring Expenses Spec Cleanup - Required Updates

**Date**: November 24, 2025  
**Context**: The recurring expenses feature was removed in v4.0.0. This document identifies all specs and documentation that need to be updated to reflect this removal.

## Summary

The recurring expenses feature has been completely removed from the application, but several specification documents and product documentation still reference it. These need to be updated to maintain accuracy and prevent confusion.

## Files Requiring Updates

### 1. Main Expense Tracker Spec
**Location**: `.kiro/specs/expense-tracker/`

#### requirements.md
- **Status**: ✅ No changes needed
- **Reason**: Does not mention recurring expenses

#### design.md
- **Status**: ✅ No changes needed  
- **Reason**: Does not mention recurring expenses

#### tasks.md
- **Status**: Needs review
- **Action**: Check if any tasks reference recurring expense generation

---

### 2. Recurring Expenses Spec
**Location**: `.kiro/specs/recurring-expenses/`

#### All Files (requirements.md, design.md, tasks.md)
- **Status**: ⚠️ DEPRECATE OR ARCHIVE
- **Current State**: Complete spec exists for a removed feature
- **Recommended Action**: 
  - Option A: Move entire folder to `.kiro/specs/archive/recurring-expenses/` with a README explaining removal
  - Option B: Add a prominent deprecation notice at the top of each file
  - Option C: Delete the spec entirely (not recommended - loses historical context)

**Suggested Deprecation Notice**:
```markdown
> **⚠️ DEPRECATED - Feature Removed in v4.0.0**
> 
> This feature was removed from the Expense Tracker application in version 4.0.0 (November 2025).
> The recurring expenses functionality has been replaced by the Fixed Expenses feature for 
> predictable monthly costs. This spec is retained for historical reference only.
> 
> See: RECURRING_EXPENSES_REMOVAL.md and RECURRING_EXPENSES_REMOVAL_COMPLETE.md
```

---

### 3. Product Documentation
**Location**: `.kiro/steering/product.md`

#### Current Content (Line 14):
```markdown
- Recurring expense templates with automatic generation
```

- **Status**: ❌ REMOVE
- **Action**: Delete this line from the Key Features list
- **Reason**: Feature no longer exists

---

### 4. Main README
**Location**: `README.md`

#### Current Content:
- **Status**: ✅ No changes needed
- **Reason**: Does not mention recurring expenses in features list

---

### 5. Feature Roadmap
**Location**: `FEATURE_ROADMAP.md`

#### Current Content (Lines 295-304):
```markdown
### 🟢 Recurring Expenses (v3.1.0)
**Completed**: November 2025  
**Description**: Create templates for recurring expenses with automatic generation.

**Features Delivered**:
- Recurring expense templates
- Automatic expense generation
- Template management interface
```

- **Status**: ⚠️ UPDATE
- **Action**: Add deprecation notice to this completed feature
- **Suggested Update**:
```markdown
### 🟢 Recurring Expenses (v3.1.0) - REMOVED IN v4.0.0
**Completed**: November 2025  
**Removed**: November 2025 (v4.0.0)  
**Description**: Create templates for recurring expenses with automatic generation.

**Features Delivered**:
- Recurring expense templates
- Automatic expense generation
- Template management interface

**Removal Reason**: Feature was replaced by the Fixed Expenses feature which better serves the use case of tracking predictable monthly costs. Recurring expenses added unnecessary complexity for generating actual expense entries.
```

---

## Other Specs to Review

### Specs That May Reference Recurring Expenses

The following specs should be reviewed to ensure they don't have any references to recurring expenses:

1. ✅ **budget-tracking-alerts** - Reviewed, no references
2. ✅ **code-optimization** - Reviewed, no references  
3. ✅ **configurable-fixed-expenses** - Reviewed, no references
4. ✅ **configurable-monthly-gross** - Reviewed, no references
5. ✅ **containerization-optimization** - Reviewed, no references
6. ✅ **enhanced-annual-summary** - Reviewed, no references
7. ✅ **expanded-expense-categories** - Reviewed, no references
8. ✅ **expense-trend-indicators** - Reviewed, no references
9. ✅ **monthly-loans-balance** - Reviewed, no references
10. ✅ **place-name-standardization** - Reviewed, no references
11. ✅ **tax-deductible-view** - Reviewed, no references

---

## Implementation Checklist

- [x] 1. Update `.kiro/steering/product.md` - Remove recurring expenses from Key Features
- [x] 2. Update `FEATURE_ROADMAP.md` - Add deprecation notice to completed recurring expenses feature
- [x] 3. Archive or deprecate `.kiro/specs/recurring-expenses/` folder
  - [x] 3a. Add deprecation notices to requirements.md, design.md, and tasks.md
  - [ ] 3b. OR move to `.kiro/specs/archive/recurring-expenses/` (optional - notices added instead)
- [x] 4. Review `.kiro/specs/expense-tracker/tasks.md` for any recurring expense references
- [x] 5. Update this document with completion status

---

## Recommended Approach

**Priority Order**:
1. **High Priority**: Update product.md (user-facing documentation)
2. **High Priority**: Update FEATURE_ROADMAP.md (historical accuracy)
3. **Medium Priority**: Archive recurring-expenses spec folder (historical reference)
4. **Low Priority**: Review expense-tracker tasks.md (likely no changes needed)

**Estimated Time**: 15-20 minutes

---

## Completion Summary

**Date Completed**: November 24, 2025  
**Status**: ✅ All spec updates complete

### Changes Made

1. **`.kiro/steering/product.md`** ✅
   - Removed "Recurring expense templates with automatic generation" from Key Features list
   - Product overview now accurately reflects current feature set

2. **`FEATURE_ROADMAP.md`** ✅
   - Added deprecation notice to Recurring Expenses (v3.1.0) entry
   - Marked as "REMOVED IN v4.0.0"
   - Added removal reason and reference to migration documentation

3. **`.kiro/specs/recurring-expenses/requirements.md`** ✅
   - Added prominent deprecation notice at top of document
   - Includes migration information and references to removal docs
   - Spec retained for historical reference

4. **`.kiro/specs/recurring-expenses/design.md`** ✅
   - Added prominent deprecation notice at top of document
   - Includes migration information and references to removal docs
   - Spec retained for historical reference

5. **`.kiro/specs/recurring-expenses/tasks.md`** ✅
   - Added prominent deprecation notice at top of document
   - Includes migration information and references to removal docs
   - Spec retained for historical reference

6. **`.kiro/specs/expense-tracker/tasks.md`** ✅
   - Verified no recurring expense references exist
   - No changes needed

### Result

All specification and documentation files have been updated to reflect the removal of the recurring expenses feature in v4.0.0. The recurring expenses spec folder has been preserved with clear deprecation notices for historical reference, making it clear to anyone reviewing the specs that this feature no longer exists in the application.

---

## Notes

- The removal was properly documented in `RECURRING_EXPENSES_REMOVAL.md` and `RECURRING_EXPENSES_REMOVAL_COMPLETE.md`
- Database migration was successfully implemented to remove recurring expense tables and columns
- All code files (controllers, services, repositories, routes, components) were already removed
- This cleanup focuses solely on specification and documentation files
- Specs are retained with deprecation notices rather than deleted to maintain historical context

---

## Related Documents

- `RECURRING_EXPENSES_REMOVAL.md` - Original removal plan
- `RECURRING_EXPENSES_REMOVAL_COMPLETE.md` - Removal completion report
- `backend/database/migrations.js` - Database migration implementation
- `backend/scripts/removeRecurringExpenses.js` - Migration script
