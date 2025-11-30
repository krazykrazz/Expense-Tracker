# Spec Update: Automatic Budget Carry-Forward

**Date**: November 22, 2025  
**Feature**: Budget Tracking & Alerts  
**Change Type**: Enhancement - Automatic Carry-Forward

## Summary

Updated the budget tracking specification to include **automatic budget carry-forward** functionality. When a user accesses a month with no existing budgets, the system will automatically copy budget limits from the previous month, providing seamless continuity while maintaining the ability to modify budgets as needed.

## Changes Made

### 1. Requirements Document Updates

**Modified Requirement 5** - Changed from manual-only copy to automatic carry-forward:
- **5.1**: System automatically copies budgets from previous month when accessing empty month
- **5.2**: Automatic carry-forward preserves category associations and limit amounts
- **5.3**: Returns empty list (no error) when previous month has no budgets
- **5.4**: Carried forward budgets can be modified or deleted
- **5.5**: No automatic carry-forward if budgets already exist for the month

**Added Requirement 5A** - Manual budget copy (preserved from original Requirement 5):
- **5A.1**: User can manually initiate budget copy from any previous month
- **5A.2**: Manual copy from source to target month
- **5A.3**: Prompt for confirmation when overwriting existing budgets
- **5A.4**: Display confirmation message with copy statistics
- **5A.5**: Manual copy preserves category associations and limit amounts

### 2. Design Document Updates

**Overview Section**:
- Added description of automatic carry-forward behavior
- Clarified that manual copy is still available for additional flexibility

**Data Flow Section**:
- Added "Budget Retrieval with Auto-Carry-Forward" flow
- Updated "Manual Budget Copy" flow (previously just "Budget Copy")

**Correctness Properties**:
- **Property 9** (NEW): Automatic carry-forward preserves data
  - Validates: Requirements 5.1, 5.2
- **Property 10** (renumbered from 9): Budget copy preserves data
  - Now validates: Requirements 5A.2, 5A.5 (manual copy)
- **Property 11** (renumbered from 10): Copy operation count accuracy
  - Now validates: Requirements 5A.4 (manual copy)
- **Properties 12-19**: Renumbered (previously 11-18)

### 3. Tasks Document Updates

**Task 3.1** - Core budget operations:
- Updated `getBudgets(year, month)` to include automatic carry-forward logic
- Added requirements: 5.1, 5.2, 5.3

**Task 3.2** (NEW) - Property test for automatic carry-forward:
- **Property 9**: Automatic carry-forward preserves data
- Validates: Requirements 5.1, 5.2

**Task 3.3** (renumbered from 3.2) - Unit tests:
- Added test cases for automatic carry-forward scenarios
- Test no carry-forward when budgets already exist
- Test carry-forward when no budgets exist

**Task 6** - Renamed to "manual budget copy functionality":
- Updated all subtasks to reference Requirement 5A (manual copy)
- Updated property numbers (10, 11)

**All subsequent tasks**: Updated property numbers to reflect new numbering

## Implementation Impact

### Backend Changes Required

1. **budgetService.getBudgets(year, month)**:
   - Check if budgets exist for requested month
   - If no budgets exist, automatically copy from previous month
   - Return budgets (existing or newly carried forward)

2. **budgetService.copyBudgets()** (manual copy):
   - Remains unchanged, used for manual copy operations
   - Provides user control for copying from any previous month

### Frontend Changes Required

1. **Budget retrieval**: No changes needed - automatic carry-forward is transparent
2. **Budget management modal**: Can still trigger manual copy for specific months
3. **User experience**: Seamless - budgets appear automatically when switching months

## Benefits

1. **User Convenience**: Budgets automatically continue month-to-month
2. **Flexibility**: Users can still modify or delete carried-forward budgets
3. **Manual Control**: Manual copy still available for special cases
4. **Consistency**: Similar to how fixed expenses work in the application

## Testing Strategy

- **Property 9**: Tests automatic carry-forward preserves data correctly
- **Unit tests**: Cover edge cases (no previous month, empty previous month, existing budgets)
- **Integration tests**: Verify automatic carry-forward works with budget retrieval

## Backward Compatibility

- No breaking changes
- Existing manual copy functionality preserved as Requirement 5A
- Database schema unchanged
- API endpoints unchanged (behavior enhanced, not modified)
