---
name: expense-tracker-audit
description: 'Audit the Expense Tracker codebase for bugs, security issues, code smells, and refactor opportunities. Use when asked to review, audit, or do a code-quality pass on the backend (Express/Node/SQLite) or frontend (React/Vite), find bugs/smells, or assess tech debt. Covers async error handling, SQL/parameterization, money/date/timezone correctness, React effect/closure bugs, fetch lifecycle, and mega-component detection.'
argument-hint: 'optional: backend | frontend | a specific path or area'
---

# Expense Tracker Code Audit

Repeatable technique for reviewing the Expense Tracker for bugs, security issues,
code smells, and refactor opportunities. Optimized for this repo's conventions
(Express + SQLite backend, React + Vite frontend).

## When to Use
- "Review/audit the code for bugs and code smells"
- Pre-release quality pass, tech-debt assessment, or PR review
- Targeted review of a subsystem (expenses, invoices, backups, analytics, billing cycle, loans/LOC)
- After removing feature-gates or type-exclusions (loan type changes, LOC handling)

## Procedure

### 1. Scope and parallelize
- Decide scope: backend, frontend, or a specific area. Default to both.
- Exclude test files from the audit (`*.test.js`, `*.test.jsx`, `*.pbt.test.*`,
  `*.integration.test.*`) — skim them only for intent/context.
- For broad audits, dispatch read-only `Explore` subagents in parallel (one
  backend, one frontend). Ask each for: severity, file + line, 1-2 sentence
  description, suggested fix, grouped by category, plus recurring anti-patterns.

### 2. ALWAYS verify before reporting (critical)
Subagent/LLM findings frequently contain false positives and wrong line numbers.
Before presenting any High/Critical finding as fact, open the cited file and confirm.
Past false positives on THIS repo:
- "Empty useEffect dependency array → stale closure" — the deps were actually
  present in `ExpenseContext.jsx`. Verify the real `[...]` array.
- "Missing asyncHandler → server will crash" — controllers actually wrap bodies
  in `try/catch`. The real issue is a *smell* (see backend checklist), not a crash.
- "LoanPaymentHistory conditional columns break table" — React renders nothing for
  `{false && <th>}`, and both thead/tbody exclude the column consistently. Valid.
- "Unreachable controller catch branches for `Payment amount`/`Payment date`/
  `Balance override`" — `loanPaymentService.validatePayment` DOES throw those exact
  message prefixes, so the `error.message.includes(...)` branches in
  `loanPaymentController` are reachable. Confirm the service's actual `throw` strings
  before calling a branch dead.
- "`autoPaymentLoggerService` builds dates without clamping the due day" — it DOES
  clamp via `Math.min(dueDay, new Date(year, month, 0).getDate())`. Read the map()
  body before flagging.
- "`hasPaymentForMonth` uses `${year}-${month}-31` → invalid-date bug" — that's a
  lexicographic STRING comparison upper bound against `YYYY-MM-DD` text columns
  (`'2024-02-29' <= '2024-02-31'` holds), so it is correct, not a bug. Date-string
  clamping only matters when the string is parsed into a `Date` or persisted.
- "`LoanDetailView` doesn't reset form state on loan switch" — it DOES, in the
  `isOpen && loan` effect (`setEditingPayment(null)`, `setShowPaymentForm(false)`).

Past confirmed-true patterns on THIS repo:
- Dead error-message branches left in catch blocks after feature-gate removal.
  When a `throw` is removed from a service, the matching `if (error.message === '...')`
  in the controller becomes unreachable. Always audit controller catch blocks
  after modifying service-layer throws.
- `parseFloat(null)` → NaN when destructuring optional body params. Always guard
  with `!= null && !== ''` before parseFloat.
- Invalid date construction: `"${year}-${month}-${day}"` without clamping day to
  month length (e.g. day 31 in Feb → `"2024-02-31"`). Any code building date
  strings from a user-configured `due_day` must clamp.
- Duplicate activity log events when a helper already logs and the caller logs again.
- `editingPayment`/form state not reset in useEffect when the underlying entity
  (loan, expense) changes — stale form data from a previous entity persists.
- Auto-log path bypasses the service layer: `autoPaymentLoggerService`.
  `createPaymentFromFixedExpense` writes directly via `loanPaymentRepository.create()`
  instead of `loanPaymentService.createPayment()`, so it SKIPS the shared
  amount/date validation. Note: it DOES call `autoSnapshotMortgageBalance()` after
  the create (line ~80), so snapshot anchoring is NOT skipped — only validation is.
- Inconsistent fire-and-forget `activityLogService.logEvent(...)`: some calls are
  `await`ed, siblings are not and lack `.catch()` (e.g. `balance_override_applied`
  in `loanPaymentService.updatePayment` line ~318). Un-awaited + uncaught =
  unhandled rejection risk. Flag the inconsistency, pick one convention.
- `_getMortgageBalanceHistory` multi-payment-in-month bug: when 2+ payments occur
  in the same month, each payment's `interestAccrued` is set to the full month's
  interest (line ~512), double-counting interest for display. First payment should
  absorb the interest, subsequent ones should show `interestAccrued: 0`.
- Duplicate `findById()` method in `loanBalanceRepository.js` (lines 9 and 67) —
  identical, one should be removed.
- Dead frontend API: `loanPaymentApi.getBalanceHistory` is exported and the
  `/api/loans/:id/payment-balance-history` endpoint exists and returns
  `interestAccrued`/`principalPaid` per payment, BUT no component imports it.
  `LoanPaymentHistory.jsx` computes its own naive running balances from raw payments.
  The per-payment interest/principal breakdown is never shown to the user.
- `totalInterestAccrued` in the Payment Summary is always 0 when mortgage is paid
  monthly (snapshot created each payment anchors to current month → zero months to
  walk → zero interest). Field was removed from `MortgageTabbedContent.jsx`.
- `formatCurrency()` already includes `$`. Any wrapper that prepends `$` causes
  double-`$$` display (was in `MortgageKpiStrip.jsx fmt()` function, now fixed).
- In-lieu holiday observance collision in `frontend/src/utils/businessDays.js`
  `addObserved()`: the original two-branch form (weekday → `set.add` as-is;
  weekend → roll forward skipping weekends AND already-taken days) loses the second
  holiday when two fixed holidays are adjacent and the first lands on a weekday in
  the other's in-lieu slot. Concrete case: when **Dec 25 is a Sunday** (2022, 2033),
  Christmas rolls to Mon Dec 26, then Boxing Day (Mon Dec 26) hits the weekday branch
  and re-adds Dec 26 — the intended Tue Dec 27 in-lieu day is never registered.
  Fix is to unify both branches into one loop:
  `let d = dateStr; while (isWeekend(d) || set.has(d)) d = addDays(d, 1); set.add(d);`
  Tests covering only the Saturday-Christmas cascade (2027) miss this — always test
  the Sunday-Christmas year too. The posted-date auto-suggestion is frontend-only and
  user-overridable, so this is Medium, not High.

Past confirmed-false patterns (subagent hallucinations on THIS repo):
- "Duplicate `findById()` in `loanPaymentRepository.js`" — FALSE, there is only
  one `findById()` (line 98). The two methods at lines 47/68 are `findByLoan` and
  `findByLoanOrdered` (different methods). Always verify method names.
- "`mortgageInsights` state never fetched in LoanDetailView" — FALSE, the fetch is
  at line 197 (`fetchMortgageInsights` callback) and called in a useEffect at line
  222. The subagent only read lines 1-150 and missed it. Always read the full file.
- "`parseFloat` without NaN guard in controller is a bug" — DOWNGRADE to smell.
  `loanPaymentService.createPayment` validates `balanceOverride` at line 151 with
  `typeof !== 'number' || isNaN(...)`. NaN from `parseFloat("abc")` IS caught by
  the service. The controller guard is redundant but not a bypass.
- "`createPayment` vs `updatePayment` guard drift on `balanceOverride`" — FALSE
  for current code. Both now use identical `!= null && !== ''` guards (lines 38
  and 150 in the controller). Was true historically but since fixed.

Downgrade or drop any finding you cannot reproduce by reading the source.

### 2b. Performance-specific audit patterns
When auditing for performance issues, check these verified patterns:

**Confirmed performance issues (fixed in this repo):**
- `strftime()` in WHERE clauses prevents SQLite from using indexes — always use
  `date >= ? AND date < ?` range comparisons instead.
- Services calling `expenseRepository.findAll()` without date bounds load ALL rows
  (21k+) into memory. Use `findByDateRange(start, end)` with a bounded window.
- `predictionService._getHistoricalMonthlyAverage()` and `calculateConfidenceLevel()`
  were loading all expenses into JS and iterating — replaced with SQL aggregations.
- `trendsService._fetchMonthlyHistory()` was making 6 separate strftime queries in a
  loop — replaced with single GROUP BY query with date range bounds.
- `spendingPatternsService.checkDataSufficiency()` loaded all expenses to get
  min/max/count — replaced with `SELECT MIN(date), MAX(date), COUNT(*)`.
- Missing WAL mode on production database — only test DB had it enabled.
- Missing compound indexes on expenses (date+type, date+method, week, place+type).
- Missing index on `activity_logs(timestamp)`.
- Frontend `ExpenseContext` fetched all current-month expenses just to get `.length`
  — replaced with lightweight `/api/expenses/count` endpoint.
- Frontend `ExpenseList` payment method filter used `.find()` inside `.filter()` loop
  (O(n×m)) — replaced with pre-built Map for O(1) lookup.

**Performance anti-patterns to flag:**
- Any `findAll()` call without year/month/date filters in analytics services
- `strftime('%Y', date)` or `strftime('%m', date)` in WHERE clauses
- N+1 query patterns (loops making DB calls per iteration)
- Services that call `findAll()` multiple times in the same request path
- Missing WAL mode (`PRAGMA journal_mode = WAL`) in database initialization

### 3. Apply the checklists
Work through [the audit checklist](./references/audit-checklist.md). It encodes
repo-specific conventions and the highest-signal checks for each layer.

### 4. Report
- Group by category: Bugs, Security, Code Smells, Refactor Opportunities.
- Each finding: **severity** · `path#Lnn` link · what & why · suggested fix.
- Lead with a short prioritized summary table (Critical/High first).
- Distinguish *verified* findings from *worth-investigating* ones.
- Do NOT create markdown report files unless explicitly requested — answer inline.
- Do NOT make code changes during an audit unless the user asks for fixes.

## Repo Conventions (ground truth for judging findings)
- Backend errors: prefer `asyncHandler` + centralized `errorHandler`
  (`backend/middleware/errorHandler.js`). Inline `try/catch` returning a blanket
  `res.status(400)` is a smell — it mislabels 500-class errors and duplicates logic.
- Logging: use `backend/config/logger.js`; flag `console.*` in backend prod code.
- DB/schema: SQLite via `backend/database/db.js`; schema changes must touch
  migrations + `initializeDatabase` + `initializeTestDatabase`.
- New API flow: route → controller → service → repository, plus frontend
  `config.js` `API_ENDPOINTS` and `authAwareFetch`/`apiClient`.
- Frontend data calls should go through `authAwareFetch`/`apiClient`, not raw `fetch`.
- Money: never use floats for currency math without rounding; check cents handling.
- Dates: watch `new Date('YYYY-MM-DD')` UTC parsing; repo uses `+ 'T00:00:00'` to
  force local time — flag date construction that omits it.

## References
- [Audit checklist](./references/audit-checklist.md) — backend, frontend, security checks
