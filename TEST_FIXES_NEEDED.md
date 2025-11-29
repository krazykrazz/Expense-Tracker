# Test Fixes Needed

## Backend Test Failures

### 1. budgetService.integration.test.js
**Issue**: Tests use "Food" category which doesn't exist
**Fix**: Replace all instances of "Food" with "Groceries"
**Files**: backend/services/budgetService.integration.test.js
**Status**: In Progress

### 2. expenseService.fixedaggregation.pbt.test.js
**Issue**: Property test failing - category totals calculation issue
**Error**: Expected 0.02, Received 0.03
**Fix**: Need to investigate the fixed expense aggregation logic
**Status**: Needs Investigation

### 3. backupService.pbt.test.js
**Issue**: Budget persistence tests failing due to UNIQUE constraint violations
**Error**: UNIQUE constraint failed: budgets.year, budgets.month, budgets.category
**Fix**: Tests need to clean up budgets between runs or use unique test data
**Status**: Needs Fix

### 4. placeNameService.integration.test.js
**Issue**: CHECK constraint failure on expense type
**Error**: CHECK constraint failed: type IN (...)
**Fix**: Test is using invalid expense category
**Status**: Needs Investigation

## Frontend Test Failures

### 1. App.performance.test.jsx
**Issue**: Test timeout on "clear all filters" test
**Fix**: Increase timeout or optimize test
**Status**: Needs Fix

### 2. BudgetManagementModal.test.jsx
**Issue**: Test expecting "Housing" but getting "Groceries"
**Fix**: Category ordering issue - test needs to be updated or component needs consistent ordering
**Status**: Needs Fix

### 3. Multiple integration tests (App.integration.test.jsx, App.performance.test.jsx)
**Issue**: SummaryPanel trying to access undefined `methodTotals.Cash`
**Error**: Cannot read properties of undefined (reading 'Cash')
**Fix**: SummaryPanel needs to handle undefined methodTotals gracefully
**Status**: Critical - Needs Immediate Fix

## Priority Order

1. **CRITICAL**: Fix SummaryPanel methodTotals undefined issue (affects 11 tests)
2. **HIGH**: Replace "Food" with "Groceries" in budget tests (affects 11 tests)
3. **MEDIUM**: Fix budget test cleanup/unique constraint issues
4. **MEDIUM**: Fix BudgetManagementModal category ordering
5. **LOW**: Investigate fixed expense aggregation PBT failure
6. **LOW**: Fix performance test timeout
7. **LOW**: Investigate placeNameService constraint failure

## Next Steps

1. Fix SummaryPanel to handle undefined methodTotals
2. Batch replace "Food" with "Groceries" in budget integration tests
3. Run tests again to verify fixes
4. Address remaining failures
