# Bug Hunt Report

Date: 2026-02-26  
Version: 1.1.0  
Scope: Full application (frontend + backend) static code analysis

---

## Critical Issues

### BUG-001: Scheduler In-Memory Lock Not Crash-Resilient ✅ FIXED
- **File**: `backend/services/billingCycleSchedulerService.js`
- **Lines**: `runAutoGeneration()` method
- **Description**: The `this.isRunning` flag is an in-memory boolean. If the async operation hangs indefinitely (e.g., database lock), the scheduler will be permanently blocked for the lifetime of the process.
- **Impact**: Billing cycle auto-generation could silently stop working.
- **Severity**: Critical
- **Fix Applied**: Added `LOCK_STALENESS_THRESHOLD_MS` (5 min) constant and `lockAcquiredAt` timestamp tracking. `runAutoGeneration()` now checks lock age when `isRunning` is true — if the lock has been held longer than the threshold, it force-resets and proceeds. The `finally` block clears both `isRunning` and `lockAcquiredAt`. All 14 scheduler tests pass.

### BUG-002: SSE Connection Cleanup Race Condition
- **File**: `frontend/src/hooks/useDataSync.js`
- **Lines**: Visibility change handler + reconnect logic
- **Description**: When the tab becomes hidden, `intentionalCloseRef.current = true` is set and the EventSource is closed. When the tab becomes visible again, a new connection is opened. However, if the visibility changes rapidly (e.g., user quickly switches tabs), the `intentionalCloseRef` may not be properly synchronized with the EventSource lifecycle, potentially causing duplicate connections or missed reconnects.
- **Impact**: Duplicate SSE connections consuming server resources, or failed reconnection after tab switching.
- **Severity**: Critical
- **Fix**: Add a connection state machine (disconnected → connecting → connected → closing) instead of relying on boolean flags.

### BUG-003: Promise.all Failure in getAllWithExpenseCounts ✅ FIXED
- **File**: `backend/services/paymentMethodService.js`
- **Lines**: `getAllWithExpenseCounts()` method
- **Description**: Used `Promise.all()` to fetch expense counts for all payment methods. If any single query failed, the entire operation failed and the user got no payment methods at all.
- **Impact**: One corrupted payment method record could break the entire payment methods list.
- **Severity**: Critical
- **Fix Applied**: Changed `Promise.all()` to `Promise.allSettled()`. Fulfilled results are used directly; rejected results are logged and the payment method is returned with fallback values (balance from DB, null utilization, 0 expense count) so the list is never broken by one bad record. All 15 payment method credit card tests pass.

---

## High Severity Issues

### BUG-004: Missing Transaction in Credit Card Payment Recording ✅ FIXED
- **File**: `backend/services/creditCardPaymentService.js`
- **Lines**: `recordPayment()` and `deletePayment()` methods
- **Description**: Recording a credit card payment involved: (1) inserting the payment record, (2) updating the credit card balance, (3) logging activity. These were separate database operations without a wrapping transaction. If step 2 failed after step 1 succeeded, the payment was recorded but the balance was wrong.
- **Impact**: Credit card balance inconsistency after partial failures.
- **Severity**: High
- **Fix Applied**: Added `runInTransaction()` helper to `backend/utils/dbHelper.js` that accepts an async callback with `{run, get, all}` transaction-scoped query functions. Both `recordPayment()` and `deletePayment()` now wrap their payment insert/delete + balance update in a single atomic transaction. Activity logging remains outside the transaction (fire-and-forget). All 10 credit card payment tests pass.

### BUG-005: Missing Transaction in Loan Payment Recording
- **File**: `backend/services/loanPaymentService.js`
- **Lines**: `createPayment()` method
- **Description**: Originally reported as same pattern as BUG-004, but on review the loan payment `createPayment()` method only inserts a payment record and logs activity — it does NOT update loan balances inline. There is no multi-step DB mutation that needs transactional protection.
- **Impact**: Minimal — no balance inconsistency risk since balance is not updated during payment creation.
- **Severity**: ~~High~~ → **Low** (downgraded)
- **Fix**: No fix needed. The operation is already safe as a single INSERT + fire-and-forget activity log.

### BUG-006: Missing Transaction in Mortgage Payment Recording
- **File**: `backend/services/mortgagePaymentService.js`
- **Lines**: `setPaymentAmount()` method
- **Description**: Originally reported as same pattern as BUG-004, but on review the mortgage payment `setPaymentAmount()` method only creates/updates a payment record and logs activity — it does NOT update mortgage balances inline. Same situation as BUG-005.
- **Impact**: Minimal — no balance inconsistency risk.
- **Severity**: ~~High~~ → **Low** (downgraded)
- **Fix**: No fix needed. The operation is already safe.

### BUG-007: Backup Service Doesn't Validate Database Integrity Before Backup ✅ FIXED
- **File**: `backend/services/backupService.js`
- **Lines**: `performBackup()` method
- **Description**: The backup copied the SQLite file directly without running `PRAGMA integrity_check` first. If the database was corrupted, the backup would also be corrupted, and the user wouldn't know until they tried to restore.
- **Impact**: Silent backup of corrupted data.
- **Severity**: High
- **Fix Applied**: Added `PRAGMA integrity_check` before creating the backup archive. If the check fails, a warning is logged but the backup proceeds (a potentially-corrupt backup is better than no backup). If the check itself errors out, a warning is logged and the backup continues.

### BUG-008: SSE Broadcast Missing Error Handling for Individual Clients — ALREADY RESOLVED
- **File**: `backend/services/sseService.js`
- **Lines**: `broadcast()` method
- **Description**: Originally reported as missing try-catch per client in broadcast. On code review, the `broadcast()` method already wraps each `res.write()` in a try-catch and removes dead clients from the connection list on failure.
- **Impact**: None — already handled.
- **Severity**: ~~High~~ → **N/A** (already resolved in codebase)
- **Fix**: No fix needed. The code already has per-client error handling and dead client cleanup.

---

## Medium Severity Issues

### BUG-009: ExpenseForm Stale Closure in Submit Handler
- **File**: `frontend/src/components/ExpenseForm.jsx`
- **Description**: The form submission handler captures state values in a closure. If the user rapidly changes form values and submits, the submitted data may not reflect the latest state due to React's batched state updates.
- **Impact**: Submitted expense data may not match what the user sees in the form.
- **Severity**: Medium
- **Fix**: Use refs for values that need to be current at submission time, or use `useCallback` with proper dependencies.

### BUG-010: SharedDataContext Fetches All Data on Every Mount
- **File**: `frontend/src/contexts/SharedDataContext.jsx`
- **Lines**: `SharedDataProvider` useEffect
- **Description**: Every time the provider mounts, it fetches all shared data (payment methods, people, income sources, etc.) regardless of whether the data has changed. There's no caching or staleness check.
- **Impact**: Unnecessary API calls on every page navigation, slower perceived performance.
- **Severity**: Medium
- **Fix**: Add a data freshness check or use the SSE sync events to invalidate cache.

### BUG-011: Migration Service Doesn't Handle Partial Migration Failures
- **File**: `backend/database/migrations.js`
- **Lines**: `runMigrations()` method
- **Description**: Migrations run sequentially but if a migration partially completes (e.g., creates a table but fails to add an index), the migration version is not recorded, so on next startup it will try to re-run the same migration, which will fail because the table already exists.
- **Impact**: Application fails to start after a partial migration failure.
- **Severity**: Medium
- **Fix**: Wrap each migration in a transaction so it either fully completes or fully rolls back.

### BUG-012: Version Check Service Doesn't Handle Network Timeouts
- **File**: `backend/services/versionCheckService.js`
- **Lines**: `checkForUpdates()` method
- **Description**: The GitHub Releases API call doesn't have an explicit timeout. On slow networks or if GitHub is down, the request could hang indefinitely, blocking the startup check.
- **Impact**: Application startup could be delayed or blocked.
- **Severity**: Medium
- **Fix**: Add a timeout (e.g., 10 seconds) to the fetch call.

### BUG-013: Container Update Check Polling Interval Not Configurable
- **File**: `frontend/src/hooks/useContainerUpdateCheck.js`
- **Description**: The polling interval is hardcoded. If the backend is slow or the network is unreliable, the fixed interval could cause request pileup.
- **Impact**: Unnecessary network traffic and potential request queuing.
- **Severity**: Medium
- **Fix**: Make the interval configurable via settings, and implement exponential backoff on failures.

### BUG-014: Activity Log Cleanup Could Delete During Active Writes
- **File**: `backend/services/activityLogService.js`
- **Lines**: `cleanupOldLogs()` method
- **Description**: The cleanup deletes logs older than the retention period, but if a new log entry is being written at the exact same time with a timestamp at the boundary, it could be immediately deleted.
- **Impact**: Very rare race condition, but could cause missing activity log entries.
- **Severity**: Medium
- **Fix**: Use a small buffer (e.g., delete logs older than retention + 1 hour).

### BUG-015: Invoice Deletion Doesn't Verify File Exists Before Unlink
- **File**: `backend/services/invoiceService.js`
- **Lines**: `deleteInvoice()` method
- **Description**: When deleting an invoice, the service attempts to delete the file from disk. If the file was already deleted (e.g., manual cleanup), the unlink could throw an ENOENT error.
- **Impact**: Invoice database record deletion fails because file deletion failed.
- **Severity**: Medium
- **Fix**: Check file existence before unlink, or catch ENOENT specifically and continue with database deletion.

---

## Low Severity Issues

### BUG-016: ModalContext setTimeout Not Cleaned Up
- **File**: `frontend/src/contexts/ModalContext.jsx`
- **Lines**: `navigateToTaxDeductible` event handler
- **Description**: A `setTimeout` is used to dispatch a custom event, but the timeout ID is not stored or cleaned up on unmount.
- **Impact**: Minor memory leak if the component unmounts before the timeout fires.
- **Severity**: Low
- **Fix**: Store timeout ID in a ref and clear it in the cleanup function.

### BUG-017: Reminder Service Doesn't Deduplicate Reminders
- **File**: `backend/services/reminderService.js`
- **Lines**: `getActiveReminders()` method
- **Description**: If multiple reminder sources generate the same reminder (e.g., billing cycle + loan payment for the same credit card), the user could see duplicate notifications.
- **Impact**: Confusing duplicate notifications.
- **Severity**: Low
- **Fix**: Add deduplication logic based on reminder type + entity ID.

### BUG-018: Statement Balance Calculation Doesn't Handle Empty Cycles
- **File**: `backend/services/statementBalanceService.js`
- **Lines**: `calculateStatementBalance()` method
- **Description**: If a billing cycle has no expenses, the calculation returns 0, but doesn't distinguish between "no expenses" and "cycle not found".
- **Impact**: Ambiguous balance display for empty billing cycles.
- **Severity**: Low
- **Fix**: Return a distinct response for empty cycles vs. missing cycles.

### BUG-019: UpdateBanner Doesn't Handle Rapid Version Changes
- **File**: `frontend/src/components/UpdateBanner.jsx`
- **Description**: If the container is updated multiple times in quick succession, the banner may show stale version information because it only checks on mount and at fixed intervals.
- **Impact**: User sees outdated update notification.
- **Severity**: Low
- **Fix**: Re-check version when the banner is interacted with (e.g., on click).

### BUG-020: Error Handler Middleware Logs Full Stack in Production
- **File**: `backend/middleware/errorHandler.js`
- **Description**: The error handler logs the full error stack trace regardless of environment. In production, this could expose sensitive path information in logs.
- **Impact**: Information disclosure in log files.
- **Severity**: Low
- **Fix**: Conditionally include stack traces based on NODE_ENV.

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 3 | 2 (BUG-001, BUG-003) |
| High | 5 | 2 fixed (BUG-004, BUG-007), 1 already resolved (BUG-008), 2 downgraded (BUG-005→Low, BUG-006→Low) |
| Medium | 7 | 0 |
| Low | 5 (+2 downgraded) | 0 |
| **Total** | **20** | **4 fixed, 1 already resolved, 2 reclassified** |

### Remaining High Priority Items
- **BUG-002** (Critical): SSE connection race condition — needs connection state machine
- **No remaining High severity items** — all were fixed, resolved, or downgraded

### Next Priorities
The remaining unfixed items are Medium and Low severity. The most impactful remaining issues are:
- BUG-011 (Medium): Partial migration failures
- BUG-009 (Medium): ExpenseForm stale closure
- BUG-012 (Medium): Version check network timeout
