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

---

## Notes
- Verify each item against current source before starting — some may have shifted.
- The `backupController` happy-path restore integration test can exceed the 30s Jest
  timeout under parallel load (passes in isolation at ~37s); consider raising its
  per-test timeout to de-flake CI.
