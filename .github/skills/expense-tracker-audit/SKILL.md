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
  instead of `loanPaymentService.createPayment()`, so it SKIPS the mortgage
  auto-snapshot step and the shared amount/date validation. This causes stale
  `loan_balances` anchors → historical-balance discrepancies for mortgages linked to
  fixed expenses. When auditing linked payments or balance drift, check whether the
  write goes through the service or straight to the repository.
- `parseFloat` guard drift between sibling controller actions: `createPayment` guards
  `balanceOverride != null && !== ''` but `updatePayment` only checks `!== undefined`,
  so an explicit `null` becomes `parseFloat(null)=NaN` and trips validation. Compare
  create vs update handlers for the same optional field.
- Inconsistent fire-and-forget `activityLogService.logEvent(...)`: some calls are
  `await`ed, siblings are not and lack `.catch()` (e.g. `balance_override_applied`,
  `auto_payment_logged`). Un-awaited + uncaught = unhandled rejection risk. Flag the
  inconsistency, pick one convention.

Downgrade or drop any finding you cannot reproduce by reading the source.

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
