# Tech Debt

Backlog of code-quality findings from the May 2026 codebase audit that were **not**
fixed in the bug/security pass. Grouped by area, with severity and a suggested approach.

> Already fixed (for reference, do not re-log): create/update error status codes,
> expense year/month range validation, `ExpenseContext` duplicate fetch + `AbortController`,
> backup restore filename hardening, CORS-unset prod warning, SSE token log redaction.

---

## Backend

### High
- **Migrate controllers to `asyncHandler` + centralized `errorHandler`.**
  Controllers hand-roll `try/catch` and return ad-hoc status codes. The status-code
  bug in expense create/update was fixed, but the broader pattern remains. Wrap async
  handlers in `asyncHandler` (`backend/middleware/errorHandler.js`) and throw typed
  errors (introduce a shared `ValidationError`/`AppError` with `statusCode`) so all
  controllers get consistent handling and the catch blocks disappear.
- **Add transaction support for multi-step writes.** Operations like
  expense + people allocations + activity log, and backup + config restore, can leave
  partial state on failure. Add `beginTransaction`/`commit`/`rollback` helpers in the
  DB layer and wrap multi-step service methods.

### Medium
- **Introduce a `BaseRepository`.** ~40 repositories repeat the same
  `new Promise((res, rej) => db.run/get/all(...))` boilerplate. Extract a base class
  with `create/findById/findAll/update/delete` to remove most duplication.
- **Split the `expenseService.createExpense` god method.** It mixes validation,
  future-month generation, payment-method/balance updates, and activity logging.
  Extract focused private helpers.
- **Parallelize serial awaits.** `expenseService._validatePeopleExist` (and similar
  loops) `await peopleRepository.findById` one-by-one; use `Promise.all` for
  independent lookups.
- **Use `backend/utils/validators.js` consistently.** Controllers re-implement inline
  validation instead of the shared validators.
- **Harden activity-log fire-and-forget calls.** `activityLogService.logEvent(...)`
  is called without `await` and errors are swallowed. Confirm intent; consider a
  small retry/queue or at least guaranteed error logging.

### Low
- **Centralize magic numbers** (backup size limits, token expiry, interest divisors).
- **Audit sensitive data in logs** more broadly (amounts, paths, personal data);
  the token redaction added to the logger is a starting point — extend redaction rules.

---

## Frontend

### High
- **Break up mega-components.** Extract hooks/subcomponents:
  - `components/expenses/ExpenseForm.jsx` (~1500 lines, 20+ `useState`) →
    `useInsuranceTracking`, `usePeopleAllocation`, `useInvoiceUpload`, plus
    `<InsuranceSection>`, `<PeopleSection>`, `<InvoiceSection>`.
  - `components/financial/FinancialOverviewModal.jsx` (~900 lines) → section components.
  - `components/expenses/ExpenseList.jsx` (16+ `useState`) → `<ExpenseRow memo>`,
    `<ExpenseListFilters>`, `<PaginationControls>`; consider `useReducer`.
- **Extract a shared `useFetchData` hook.** The `isMounted` + fetch + error pattern is
  duplicated ~20 times across contexts/hooks with subtle differences. Consolidate
  (with `AbortController` + error state) — `ExpenseContext` now models this; apply the
  same to `SharedDataContext` and others.

### Medium
- **Add error-state UI for failed fetches.** `SharedDataContext` (payment methods,
  people, budgets) fails silently to `console.error`. Expose an error + retry to the user.
- **Split or selector-ize large contexts.** `SharedDataContext` bundles three unrelated
  resources, so any update re-renders all consumers. Split by domain or use a context
  selector.
- **Standardize the API-calling pattern.** Code mixes `apiClient`, `authAwareFetch`,
  and `fetchWithRetry`. Pick one default (prefer `apiClient`) and reserve the others
  for specific needs.
- **Reduce `SearchBar` prop drilling** (11+ props) via a `filters` object +
  `onFilterChange(type, value)` or a filter context.
- **Memoize expensive per-render work** (e.g. `generateGroupedMethodOptions` in
  `ExpenseList` → `useMemo`).
- **Replace `console.*` with the centralized `utils/logger.js`** across components/contexts.

### Low
- **List virtualization** (`react-window`) for long expense lists.
- **Error boundaries** around heavy modals (FinancialOverview, AnalyticsHub, ExpenseForm).
- **SSE token in URL (architectural follow-up).** The EventSource API can't send headers,
  so the JWT is passed as `?token=`. Log redaction was added as defense-in-depth; the
  proper fix is a short-lived single-use SSE "ticket" issued via an authenticated POST,
  then used to open the stream.

---

## Notes
- Verify each item against current source before starting — some may have shifted.
- The `backupController` happy-path restore integration test can exceed the 30s Jest
  timeout under parallel load (passes in isolation at ~37s); consider raising its
  per-test timeout to de-flake CI.
