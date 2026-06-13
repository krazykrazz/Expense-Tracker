# Tech Debt

Backlog of code-quality findings from the May 2026 codebase audit that were **not**
fixed in the bug/security pass. Grouped by area, with severity and a suggested approach.

This document now serves two purposes:

1. Preserve the original audit findings and rationale.
2. Turn those findings into an execution-ready backlog that can be tackled in small,
   low-risk increments instead of broad rewrites.

> Already fixed (for reference, do not re-log): create/update error status codes,
> expense year/month range validation, `ExpenseContext` duplicate fetch + `AbortController`,
> backup restore filename hardening, CORS-unset prod warning, SSE token log redaction.

---

## How To Use This Backlog

- Treat each roadmap item as a **bounded work package**, not a mandate for a full rewrite.
- Prefer 1-3 PR slices per item. If a task feels "repo-wide", split it again.
- Preserve public APIs and behavior unless the item explicitly calls for a behavior change.
- Run the narrowest validation available after each slice.
- If new debt is discovered while executing an item, record it here instead of broadening the PR.

### Prioritization Criteria

Use this order when choosing what to do next:

1. **Correctness / data safety**: can this leave incorrect or partial state?
2. **Change amplification**: does this debt make many other changes harder or riskier?
3. **User-visible reliability**: does the user experience degrade on error, slow paths, or accessibility gaps?
4. **Execution cost**: can this be landed safely in a small PR?
5. **Strategic leverage**: does this unlock later cleanup or simplify future feature work?

### Delivery Guardrails

- Do not replace the modular monolith architecture as part of tech-debt work.
- Do not introduce new infrastructure (Postgres, microservices, queues) unless product requirements change.
- Prefer repo-consistent patterns already present in the codebase.
- For refactors, land scaffolding first, migration second, cleanup last.
- For frontend state work, avoid large rewrites that combine routing, data fetching, and component decomposition in one pass.

---

## Executive Summary

The highest-value debt in the current codebase is not cosmetic. It is concentrated in four areas:

1. **Backend correctness infrastructure**: controller error handling, multi-step write safety, and logging reliability.
2. **Frontend composition pressure**: large components and shared contexts are starting to carry too much orchestration.
3. **Frontend consistency gaps**: mixed data-fetching and API-access patterns create drift and duplicated fixes.
4. **User-facing resilience and accessibility**: failed fetches, inconsistent modal semantics, and missing form accessibility affordances.

The recommended sequence is:

1. Backend error/transaction foundations.
2. Frontend shared fetch/error infrastructure.
3. Frontend largest refactor targets (`ExpenseForm`, then adjacent heavy components).
4. UX/accessibility normalization.
5. CI and low-risk cleanup items.

---

## Recommended Priority Queue

| Rank | Work Package | Area | Why First | Effort | Risk | Dependencies |
|---|---|---|---|---|---|---|
| 1 | Controller error pipeline (`asyncHandler` + typed errors) | Backend | High correctness leverage across many endpoints | Medium | Medium | None |
| 2 | Transaction support for multi-step writes | Backend | Prevents partial state on failure | Medium | Medium | None |
| 3 | Shared fetch abstraction + error-state UI | Frontend | Reduces duplicated bugs, unlocks safer cleanup | Medium | Low | None |
| 4 | API-calling pattern standardization | Frontend | Stops further drift and duplicated retry/error logic | Medium | Low | After #3 |
| 5 | `ExpenseForm` decomposition | Frontend | Biggest maintainability hotspot | High | Medium | Prefer after #3 |
| 6 | `SharedDataContext` split or selectorization | Frontend | Re-render reduction, clearer ownership | Medium | Medium | Prefer after #3 |
| 7 | Activity-log reliability hardening | Backend | Improves auditability and error diagnosis | Medium | Low | Benefits from #1 and #2 |
| 8 | Modal/accessibility normalization | UI/UX | Broad UX quality improvement with bounded scope | Medium | Low | None |
| 9 | `ExpenseList` / `FinancialOverviewModal` decomposition | Frontend | Large components, but lower leverage than `ExpenseForm` | High | Medium | After #5 |
| 10 | CI cache / worker tuning | CI | Faster feedback loops, lower dev friction | Low | Low | None |

Items below rank 10 remain valid backlog, but are better treated as opportunistic or piggyback work.

---

## Phased Roadmap

### Phase 0 — Backlog Hygiene

Goal: keep the backlog actionable before code changes begin.

- Re-verify each "spot-check" UX item before opening implementation work.
- Convert each roadmap item into a tracked issue/spec with owner, status, and validation command.
- Mark items as `blocked`, `active`, `done`, or `deferred` rather than leaving them as static bullets.

### Phase 1 — Correctness Foundations

Goal: reduce the chance of bad state or inconsistent server behavior.

- Migrate controllers to `asyncHandler` + centralized typed error flow.
- Add transaction helpers in the DB layer.
- Harden activity-log fire-and-forget behavior.
- Opportunistically adopt shared validators while touching controllers.

Recommended outcome before moving on:

- New or touched backend endpoints no longer hand-roll generic `try/catch` response handling.
- At least the highest-risk multi-step write flows are transactional.

### Phase 2 — Frontend Fetch and Error Infrastructure

Goal: stop repeated reinvention of fetch/error patterns before component refactors.

- Extract shared `useFetchData`-style hook or equivalent abstraction.
- Add user-visible error and retry UI for shared fetch failures.
- Standardize on `apiClient` as the default API access pattern.
- Replace raw `console.*` calls in active codepaths with centralized frontend logging.

Recommended outcome before moving on:

- Shared data surfaces have consistent loading, error, and retry behavior.
- New frontend API calls follow one default path.

### Phase 3 — Frontend Composition Refactors

Goal: reduce maintenance risk in the largest React surfaces.

- Decompose `ExpenseForm` first.
- Then split `SharedDataContext` or selector-ize it.
- Then tackle `ExpenseList` and `FinancialOverviewModal`.
- Memoize proven expensive render-time work while in those files.

Recommended outcome before moving on:

- Largest components are orchestrators over focused hooks/sections, not single-file feature stacks.

### Phase 4 — UX and Accessibility Normalization

Goal: remove recurring UI inconsistency and accessibility debt.

- Modal semantics/focus management wrapper.
- Form error wiring (`aria-invalid`, `aria-describedby`, `aria-live`).
- Tab semantics where still missing.
- Loading state and success feedback consistency.

### Phase 5 — CI and Opportunistic Cleanup

Goal: improve team throughput and clean low-risk debt.

- Cache `node_modules` or artifact dependency installation outputs across jobs.
- Tune backend worker count in CI.
- Add timing delta visibility on PRs.
- Handle low-risk cleanup items like magic numbers, logging redaction expansion, formatters, label consistency, and breakpoint/token drift.

### Phase 6 — Long-Horizon / Optional

These items are real, but should not displace higher-leverage work:

- SSE ticket flow instead of query-string token.
- Expense-list virtualization.
- PBT result caching.
- Trivy SARIF upload.
- Backend ESM migration if code-sharing needs become real.

---

## Incremental Work Package Template

Use this template when spinning up any item below:

| Field | Guidance |
|---|---|
| Goal | What gets safer, simpler, or faster? |
| Smallest useful slice | What is the first PR that proves the direction? |
| Non-goals | What is explicitly out of scope? |
| Dependencies | What should land first? |
| Validation | Narrow test/command that proves the slice works |
| Exit criteria | Observable conditions that make the item "done enough" |

---

## Backend

### Recommended Execution Order

1. `asyncHandler` + typed errors
2. Transactions for multi-step writes
3. Activity-log reliability hardening
4. Validator consistency on touched controllers
5. `expenseService.createExpense` decomposition
6. Parallelize serial awaits
7. `BaseRepository`
8. Magic numbers and log redaction cleanup

### High
- **Migrate controllers to `asyncHandler` + centralized `errorHandler`.**
  Controllers hand-roll `try/catch` and return ad-hoc status codes. The status-code
  bug in expense create/update was fixed, but the broader pattern remains. Wrap async
  handlers in `asyncHandler` (`backend/middleware/errorHandler.js`) and throw typed
  errors (introduce a shared `ValidationError`/`AppError` with `statusCode`) so all
  controllers get consistent handling and the catch blocks disappear.

  Suggested execution:
  - PR 1: introduce/expand typed error classes and document controller conventions.
  - PR 2: migrate 2-3 representative controllers with existing tests.
  - PR 3+: migrate remaining controllers by domain when touched.

  Done when:
  - New controller code does not return blanket error responses from ad-hoc catches.
  - Central error middleware determines most response status codes.

  Validation:
  - Targeted controller tests for migrated routes.
  - Regression check that 4xx vs 5xx statuses remain correct.

- **Add transaction support for multi-step writes.** Operations like
  expense + people allocations + activity log, and backup + config restore, can leave
  partial state on failure. Add `beginTransaction`/`commit`/`rollback` helpers in the
  DB layer and wrap multi-step service methods.

  Suggested execution:
  - PR 1: add transaction helper utilities in DB layer only.
  - PR 2: migrate one high-risk path (`expense` create/update or backup restore).
  - PR 3+: expand to other multi-write flows after proving test ergonomics.

  Implementation status (2026-06-13):
  - ✅ PR 1 completed.
  - ✅ PR 2 completed (two high-risk expense flows migrated + backup-restore hardening, including invoices/statements rollback).
  - Added transaction primitives in `backend/database/db.js`:
    - `beginTransaction(db)`
    - `commitTransaction(db)`
    - `rollbackTransaction(db)`
    - `withTransaction(db, operation)`
  - Migrated `expenseService.createExpense` future-month multi-write path to use `withTransaction` and removed manual delete-loop rollback cleanup.
  - Migrated `expenseService.updateExpense` future-month multi-write path to use `withTransaction` and removed manual delete-loop rollback cleanup.
  - Hardened `backupService.restoreBackup` with pre-restore DB/config/invoices/statements snapshots and best-effort rollback of all four if restore fails mid-operation.
  - Added `_copyDirectorySnapshot` / `_restoreDirectorySnapshot` helpers in `backupService` to snapshot and revert invoices/statements directory trees (including removal of files added by a failed restore when no prior directory existed).
  - Added restore rollback observability in `backupService.restoreBackup` with structured rollback summary logging (now covering DB, config, invoices, and statements) on failure.
  - Added focused tests in:
    - `backend/database/db.transaction.test.js` (transaction primitives)
    - `backend/services/expenseService.transaction.integration.test.js` (rollback of inserted expenses + credit-card balance on create-flow failure, and rollback of updated row + card balance on update-flow failure)
    - `backend/services/backupService.integration.test.js` (failure-injection coverage for config, invoices, and statements rollback on post-restore failure)
  - Validation run: `cd backend && npm test -- database/db.transaction.test.js services/backupService.integration.test.js` (22 tests passing).
  - PR 2 is complete. Remaining optional follow-up: extend transaction coverage to adjacent multi-write service paths beyond expense create/update.

  Done when:
  - At least the most failure-sensitive multi-step operations are atomic.
  - Rollback behavior is covered by focused tests.

  Validation:
  - Integration tests that force a mid-operation failure and verify no partial writes remain.

### Medium
- **Introduce a `BaseRepository`.** ~40 repositories repeat the same
  `new Promise((res, rej) => db.run/get/all(...))` boilerplate. Extract a base class
  with `create/findById/findAll/update/delete` to remove most duplication.

  Suggested execution:
  - Defer until controller/transaction work stabilizes.
  - Start with one low-risk repository family and confirm the abstraction does not fight domain-specific queries.

  Done when:
  - Boilerplate meaningfully drops without obscuring SQL.
  - The abstraction helps more than it hides.

- **Split the `expenseService.createExpense` god method.** It mixes validation,
  future-month generation, payment-method/balance updates, and activity logging.
  Extract focused private helpers.

  Suggested execution:
  - Extract pure helpers first.
  - Then isolate side-effect boundaries.
  - Do not combine with behavior changes.

  Done when:
  - The top-level method reads like orchestration.
  - Each helper has a single reason to change.

- **Parallelize serial awaits.** `expenseService._validatePeopleExist` (and similar
  loops) `await peopleRepository.findById` one-by-one; use `Promise.all` for
  independent lookups.

  Suggested execution:
  - Treat as opportunistic work while refactoring touched services.
  - Favor readability over micro-optimization; only parallelize independent calls.

  Implementation status (2026-06-07):
  - ✅ Opportunistic slice completed for `expenseService._validatePeopleExist` using `Promise.all` while touching transaction-related service paths.

- **Use `backend/utils/validators.js` consistently.** Controllers re-implement inline
  validation instead of the shared validators.

  Suggested execution:
  - Piggyback on controller migration work instead of opening a standalone wide-scope PR.

- **Harden activity-log fire-and-forget calls.** `activityLogService.logEvent(...)`
  is called without `await` and errors are swallowed. Confirm intent; consider a
  small retry/queue or at least guaranteed error logging.

  Suggested execution:
  - Decide one convention: awaited, or explicitly unawaited with `.catch()` and structured logging.
  - Apply it first to high-value event paths.

  Done when:
  - Activity-log failures are never silent.
  - The convention is consistent across sibling codepaths.

### Low
- **Centralize magic numbers** (backup size limits, token expiry, interest divisors).
- **Audit sensitive data in logs** more broadly (amounts, paths, personal data);
  the token redaction added to the logger is a starting point — extend redaction rules.

  Suggested execution:
  - Batch these into small cleanup PRs after higher-risk items land.

---

## Frontend

### Recommended Execution Order

1. Shared fetch/error abstraction
2. Error-state UI for shared fetches
3. API-calling pattern standardization
4. `ExpenseForm` decomposition
5. `SharedDataContext` split or selectorization
6. `ExpenseList` and `FinancialOverviewModal` decomposition
7. Prop-drilling and memoization cleanup
8. Logger migration and low-risk polish

### High
- **Break up mega-components.** Extract hooks/subcomponents:
  - `components/expenses/ExpenseForm.jsx` (~1500 lines, 20+ `useState`) →
    `useInsuranceTracking`, `usePeopleAllocation`, `useInvoiceUpload`, plus
    `<InsuranceSection>`, `<PeopleSection>`, `<InvoiceSection>`.
  - `components/financial/FinancialOverviewModal.jsx` (~900 lines) → section components.
  - `components/expenses/ExpenseList.jsx` (16+ `useState`) → `<ExpenseRow memo>`,
    `<ExpenseListFilters>`, `<PaginationControls>`; consider `useReducer`.

  Suggested execution:
  - Start with `ExpenseForm`; it has the highest change frequency and complexity.
  - Use extraction order: pure helpers -> local hooks -> presentational sections.
  - Keep the parent component as orchestration until behavior is stable.

  `ExpenseForm` first-slice plan:
  - PR 1: extract one self-contained section such as invoices or insurance.
  - PR 2: extract shared form state/helpers.
  - PR 3+: continue by section until the file becomes an orchestrator.

  Done when:
  - Large components primarily coordinate children/hooks rather than embed every rule inline.
  - Section-level tests are possible without rendering the entire workflow.

- **Extract a shared `useFetchData` hook.** The `isMounted` + fetch + error pattern is
  duplicated ~20 times across contexts/hooks with subtle differences. Consolidate
  (with `AbortController` + error state) — `ExpenseContext` now models this; apply the
  same to `SharedDataContext` and others.

  Suggested execution:
  - Design the abstraction around current repo needs: `loading`, `error`, `retry`, cancellation, and stale-response protection.
  - Migrate one shared context first, then roll out to other consumers.

  Done when:
  - New fetching code does not reimplement `isMounted` guards by default.
  - Error and retry semantics are consistent across contexts.

  Validation:
  - Focused hook/context tests for loading, success, error, abort, and retry.

### Medium
- **Add error-state UI for failed fetches.** `SharedDataContext` (payment methods,
  people, budgets) fails silently to `console.error`. Expose an error + retry to the user.

  Suggested execution:
  - Land immediately after or alongside shared fetch abstraction.
  - Start with one visible shared surface rather than all contexts at once.

- **Split or selector-ize large contexts.** `SharedDataContext` bundles three unrelated
  resources, so any update re-renders all consumers. Split by domain or use a context
  selector.

  Suggested execution:
  - Only do this after fetch/error behavior is standardized.
  - Prefer the smallest change that reduces fan-out: split by domain if consumption is already naturally separated.

- **Standardize the API-calling pattern.** Code mixes `apiClient`, `authAwareFetch`,
  and `fetchWithRetry`. Pick one default (prefer `apiClient`) and reserve the others
  for specific needs.

  Suggested execution:
  - Write down the rule in comments/docs first:
    - `apiClient` for standard JSON CRUD.
    - direct fetch only for cases like file uploads, blob downloads, or SSE-related needs.
  - Migrate touched files opportunistically after the rule exists.

- **Reduce `SearchBar` prop drilling** (11+ props) via a `filters` object +
  `onFilterChange(type, value)` or a filter context.

  Suggested execution:
  - Treat as local cleanup while touching `SearchBar`/filter surfaces, not a standalone project.

- **Memoize expensive per-render work** (e.g. `generateGroupedMethodOptions` in
  `ExpenseList` → `useMemo`).

  Suggested execution:
  - Only add memoization where measurement or obvious repeated work justifies it.

- **Replace `console.*` with the centralized `utils/logger.js`** across components/contexts.

  Suggested execution:
  - Pair this with API/fetch cleanup work so logging conventions land together.
  - Avoid mass mechanical changes with no behavior benefit.

### Low
- **List virtualization** (`react-window`) for long expense lists.
- **Error boundaries** around heavy modals (FinancialOverview, AnalyticsHub, ExpenseForm).
- **SSE token in URL (architectural follow-up).** The EventSource API can't send headers,
  so the JWT is passed as `?token=`. Log redaction was added as defense-in-depth; the
  proper fix is a short-lived single-use SSE "ticket" issued via an authenticated POST,
  then used to open the stream.

  Suggested execution:
  - Keep these as separate follow-up tracks; do not combine them with current high-priority refactors.

---

## UI / UX

Findings from the May 2026 user-facing UI audit (layout/responsiveness, accessibility,
performance, interaction & feedback), in priority order. Items marked *(verified)* were
confirmed against current source; others are *(spot-check)* and should be re-confirmed
before starting.

### P1 — High impact (do first)
1. ~~**No code splitting — whole app loads upfront**~~ ✅ **DONE**.
   Converted 9 rarely-opened modals to `React.lazy()` + `<Suspense fallback={null}>` in
   `App.jsx`. Initial bundle reduced by deferring Analytics, Tax, Financial Overview,
   Annual Summary, Budgets, People, Settings, System, and CreditCardDetailView.
2. ~~**Native `window.confirm()` / `alert()` for critical actions**~~ ✅ **DONE**.
   Created shared `ConfirmDialog` component (`role="alertdialog"`, Escape-to-close,
   auto-focus, danger/warning/info variants, alertOnly mode). Replaced all 12+ sites
   across BudgetsModal, IncomeManagementModal, FixedExpensesModal, FinancialOverviewModal,
   LoanDetailView, and ExpenseList. Tests updated.
3. ~~**Place autocomplete is mouse-only**~~ ✅ **DONE**.
   Added `role="combobox"` + `aria-expanded/controls/activedescendant` on input,
   `role="listbox"` on suggestions list, `role="option"` + `aria-selected` on items.
   Arrow-key navigation (Up/Down/Enter/Escape) with active-descendant tracking and
   visual highlight.
4. ~~**Sticky sidebar height ignores header**~~ ✅ **DONE**.
   Changed `.content-right` to use `max-height: calc(100vh - var(--spacing-4) * 2)` with
   responsive breakpoint adjustments. Removed fixed `height` in favor of `max-height`.
5. ~~**Form inputs editable during submit**~~ ✅ **DONE**.
   Wrapped `ExpenseForm` content in `<fieldset disabled={isSubmitting}>` which natively
   disables all child inputs/selects/buttons during submission. Added CSS reset for
   fieldset styling.

### P2 — Medium impact
6. **Heavy synchronous work in render — `TaxDeductible.jsx`** *(spot-check)*.
   Per-render date parsing (`date.substring(5,7)`) + per-month filtering inside nested
   `.map()`, no virtualization. Pre-bucket by month in `useMemo`; consider `react-window`.
7. **Icon-only buttons lack accessible names** *(spot-check)*.
   `✕ / ✏️ / 🗑️` buttons in `PeopleManagementModal.jsx` (and peers) use only `title`.
   Add `aria-label` (e.g. `Delete {name}`).
8. **Form errors not linked to inputs** *(spot-check)*.
   Error text renders without `aria-invalid` / `aria-describedby`; success/error banners
   lack `aria-live`. Wire associations and a polite live region.
9. **Modals lack consistent dialog semantics / focus management** *(spot-check)*.
   Several overlays miss `role="dialog"`, `aria-modal`, Escape-to-close, focus trap, and
   focus-return-on-close (`PeopleManagementModal`, `VersionUpgradeModal`,
   `PersonAllocationModal`). Standardize one `Modal` wrapper.
10. **Tabs missing ARIA roles** *(spot-check)*.
    `AnalyticsHubModal.jsx`, `CreditCardDetailView.jsx` tabs rely on `className="active"`
    only. Add `role="tablist"/tab"`, `aria-selected`, `aria-controls`.
11. **`ModalContext` re-render fan-out** *(spot-check)*.
    `contexts/ModalContext.jsx` bundles ~20 handlers + all state into one value; any
    modal toggle re-renders every consumer. Split state vs. handlers (or selectorize).
12. **Color-only budget status** *(spot-check)*.
    `BudgetProgressBar.jsx` signals safe/warning/danger via color alone. Add text/icon
    for color-blind users.

### P3 — Lower impact / consistency
13. **Inconsistent loading UI** — bare `Loading...` text vs. spinners, no skeletons
    (layout shift). Introduce one shared `<LoadingState>` component.
14. **Weak success feedback** — create/update/delete rely on button text only; reuse the
    existing `SyncToast` for confirmations.
15. **Duplicate formatters** — local `formatDate`/currency reimplementations vs.
    `utils/formatters.js`; consolidate (also fixes `en-US` vs `en-CA` mismatch).
16. **Inconsistent button labels/terminology** — "Add Expense" / "Log Payment" /
    "Save Changes" / "Dismiss"; standardize verbs.
17. **CSS units & breakpoint drift** — mix of `px`, `em`, and tokens; magic breakpoints
    (360/480/768/1024) vary per file. Centralize tokens and breakpoints in
    `styles/variables.css`.
18. **Mobile overflow** — `MonthSelector` selects (`min-width:110px` + `flex-shrink:0`)
    force horizontal scroll < 360px; expense-table `min-width` columns cause scroll on
    portrait tablets before the 768px card view activates.
19. **Login logo lacks `width`/`height`** — minor CLS on `LoginScreen.jsx`.

### Recommended Execution Order

1. Re-verify all spot-check findings against current source.
2. Standardize modal dialog semantics and focus behavior.
3. Wire form error accessibility and live regions.
4. Fix tab semantics and icon-button accessible names.
5. Normalize loading/success feedback.
6. Tackle lower-risk polish items such as labels, formatters, and breakpoint drift.

### Suggested Packaging

- **Package A: Modal/accessibility primitives**
  - modal wrapper
  - focus trap / return focus
  - `role="dialog"`, `aria-modal`, Escape handling

- **Package B: Form accessibility**
  - `aria-invalid`
  - `aria-describedby`
  - `aria-live` regions

- **Package C: UI consistency**
  - loading state component
  - success toasts/feedback
  - label/terminology cleanup

- **Package D: Responsive/layout polish**
  - small-screen overflow fixes
  - width/height hints
  - breakpoint/token cleanup

---

## CI / DevOps

> Already fixed (PR #272): created `test-budget.json` (activates runtime budget checks),
> added npm cache to security-audit job, moved PBT guardrails into shard 1 (eliminates
> a redundant checkout+install job), consolidated duplicate Trivy scan to single run,
> removed fixed `sleep 10` before health-check polling, enabled 2-fork parallel frontend
> in CI (was single-fork).

### Medium
- **Cache `node_modules` across jobs.** npm cache only speeds resolution; installs still
  run 5× (unit, 3 PBT shards, frontend). Use `actions/cache` with the full
  `node_modules` path keyed on `package-lock.json` hash, or a shared setup job that
  uploads `node_modules` as an artifact for downstream restore.
- **Add `--maxWorkers=75%` to backend unit test step.** The main unit-test Jest run
  doesn't specify worker count; CI runners have 2 vCPUs — explicit parallelism helps.
- **PR comment with test timing delta.** Cache the runtime from `main` and add a step
  that comments "+5s / −3s vs main" on PRs to surface regressions early.

### Low
- **Pin `dorny/paths-filter` to SHA.** Currently `@v4`; a SHA pin is more reproducible
  and safer against tag-move attacks.
- **PBT result caching.** For PBT shards with deterministic seeds, cache test results
  keyed on `source hash + test hash`; skip unchanged shards entirely on re-runs.
- **Separate Trivy upload as SARIF** for GitHub Security tab integration instead of
  plain-text artifact.

### Recommended Execution Order

1. Dependency install caching / artifact reuse
2. Backend worker-count tuning
3. PR timing delta reporting
4. Supply-chain hardening and security reporting polish

### Suggested Packaging

- **Package 1: CI throughput**
  - dependency caching
  - backend worker tuning

- **Package 2: CI visibility**
  - timing delta comment/reporting

- **Package 3: CI hardening**
  - SHA pinning
  - SARIF upload
  - optional deterministic PBT caching experiments

---

## Proposed 90-Day Plan

This plan assumes debt work is done alongside normal feature delivery, not as a full freeze.

### Month 1

- Backend error pipeline scaffolding.
- Transaction helper introduction.
- Shared frontend fetch abstraction design and first migration.
- Error-state UI for one shared data surface.

### Month 2

- Expand backend controller migration by domain.
- Transactionalize at least one high-risk write path.
- Standardize frontend API-calling conventions.
- Start `ExpenseForm` decomposition with one extracted section/hook.

### Month 3

- Continue `ExpenseForm` decomposition.
- Split or selector-ize `SharedDataContext`.
- Modal/focus/accessibility wrapper package.
- CI throughput improvements.

If capacity is limited, protect Month 1 first. It has the highest leverage and lowest regret.

---

## Suggested Issue Breakdown

Create separate tracked items instead of one umbrella "tech debt" effort:

- Backend: controller error handling migration
- Backend: DB transaction support
- Backend: activity log reliability
- Frontend: shared fetch/error hook
- Frontend: shared data error UI + retry
- Frontend: API-calling standardization
- Frontend: `ExpenseForm` decomposition
- Frontend: `SharedDataContext` split/selectorization
- UX: modal semantics/focus management
- UX: form accessibility wiring
- CI: dependency caching and test parallelism

Each issue should capture:

- target files
- first PR slice
- validation command
- explicit non-goals
- rollback plan if the refactor regresses behavior

---

## Notes
- Verify each item against current source before starting — some may have shifted.
- The `backupController` happy-path restore integration test can exceed the 30s Jest
  timeout under parallel load (passes in isolation at ~37s); consider raising its
  per-test timeout to de-flake CI.
- Current architectural direction remains sound: keep the single-container modular monolith,
  React/Vite frontend, Express/SQLite backend, and SSE-based sync unless product
  requirements materially change.
- A few repo-level drift items are worth fixing opportunistically during adjacent work,
  such as documentation/config mismatches around versioning and local port defaults.
