# Expense Tracker Audit Checklist

Layer-specific, high-signal checks. Confirm each finding against source before reporting.

## Backend (Express / Node / SQLite)

### Async & error handling
- [ ] Async route handlers use `asyncHandler(...)` OR controllers consistently
      `try/catch`. Flag blanket `res.status(400)` catch-alls that hide 500-class errors.
- [ ] No unawaited promises that should be awaited; no missing `await` on
      service/repository calls.
- [ ] Fire-and-forget calls (e.g. `activityLogService.logEvent(...).catch(...)`)
      are intentional and errors are at least logged — not silently swallowed.
- [ ] Multi-step writes (expense + activity log, backup + config restore) use a
      transaction or are idempotent; otherwise flag partial-state risk.

### SQL & data
- [ ] All queries parameterized (`?` placeholders) — no string concatenation of
      user input into SQL.
- [ ] Filter params (year/month/id) validated as integers/ranges before use.
- [ ] No N+1 queries: `for (const x of items) { await repo.findById(...) }` should
      usually be `Promise.all(items.map(...))`.

### Security
- [ ] Path traversal in file handling (invoices, backups, statements): resolve with
      `path.resolve` + verify with `path.relative(base, target)` not containing `..`;
      consider `fs.realpathSync` for symlinks. `filename.includes('..')` is insufficient
      (URL-encoding bypass) — prefer a strict filename whitelist regex.
- [ ] Auth middleware (`backend/middleware/authMiddleware.js`): understand Open_Mode
      vs Password_Gate. Note absence of resource-ownership checks (acceptable for
      single-user, but flag if schema implies multi-user).
- [ ] CORS (`server.js`): `CORS_ORIGIN` unset disables protection — flag for prod.
- [ ] No secrets/sensitive amounts/paths logged at info level without need.

### Smells / refactor
- [ ] `console.*` in backend prod code → should use `config/logger.js`.
- [ ] Repository boilerplate (`new Promise((res,rej)=>db.run/get/all))` duplicated
      across ~40 repos → candidate for a `BaseRepository`.
- [ ] God methods in services (e.g. `expenseService.createExpense` doing validation
      + future months + balance updates + logging) → extract private helpers.
- [ ] Magic numbers (sizes, expiries, rates) → centralize constants.
- [ ] Inline validation duplicated instead of using `backend/utils/validators.js`.

## Frontend (React / Vite)

### Effects & lifecycle
- [ ] `useEffect` dependency arrays include every captured value — but VERIFY the
      array; do not assume it's empty. Watch for genuinely stale closures.
- [ ] Cleanup present: `removeEventListener`, AbortController, SSE/interval teardown.
- [ ] `isMounted` guards before `setState` after await; better, AbortController to
      actually cancel in-flight requests and avoid out-of-order responses.
- [ ] Duplicated fetch logic (e.g. main effect + an `expensesUpdated` listener that
      re-implements the same fetch) → extract a shared fetch function/hook.
- [ ] No state mutation; correct, stable list `key`s.

### Data layer
- [ ] All requests via `authAwareFetch`/`apiClient` (per `config.js`), not raw `fetch`.
      Run `scripts/validate-no-raw-fetch.js` mentally / flag violations.
- [ ] Consistent API pattern — flag mixing `apiClient`, `authAwareFetch`,
      `fetchWithRetry` arbitrarily.
- [ ] Failed fetches surface an error state/retry to the user, not silent `console.error`.

### Performance
- [ ] Expensive per-render computations (grouping/sorting) wrapped in `useMemo`.
- [ ] Large context values split by domain or selector to avoid re-render storms
      (e.g. `SharedDataContext` bundling paymentMethods + people + budgets).
- [ ] Long lists consider virtualization (`react-window`) for years of data.

### Smells / refactor (size signals)
- [ ] Mega-components — flag and recommend splitting. Known large files:
      `ExpenseForm.jsx` (~1500 lines, 20+ useState), `FinancialOverviewModal.jsx`,
      `TaxDeductible.jsx`, `ExpenseList.jsx` (16+ useState), `useDataSync.js`.
- [ ] >5 `useState` in a component → `useReducer` or extracted custom hooks
      (`useInsuranceTracking`, `usePeopleAllocation`, `useInvoiceUpload`, ...).
- [ ] Prop drilling (e.g. `SearchBar` with 11+ props) → filter object/context.
- [ ] `console.*` in prod → centralized `utils/logger.js`.
- [ ] Error boundaries around heavy modals.

## Money / Date correctness (both layers)
- [ ] Currency math rounds correctly; no accumulated float error; cents handled.
- [ ] `new Date('YYYY-MM-DD')` parses as UTC — confirm repo's `+ 'T00:00:00'`
      local-time pattern is used wherever a date string is turned into a Date.
- [ ] Month arithmetic stays in 1–12; billing-cycle / future-month logic guarded.
- [ ] Timezone handling via `backend/config/timezone.js` where applicable.

## Severity guide
- **Critical**: exploitable security hole, data loss/corruption, crash on normal input.
- **High**: incorrect results for common cases, race conditions, missing authz on
  multi-user data.
- **Medium**: silent failures, perf cliffs, inconsistent error handling.
- **Low**: magic numbers, naming, minor duplication, style.
