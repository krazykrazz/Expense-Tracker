# Architecture Analysis & Improvement Recommendations

> Analysis date: February 2026 | Version: 5.16.3

## Codebase Metrics

| Layer | Source Files | Largest File (lines) |
|---|---|---|
| Backend services | ~30 | billingCycleHistoryService: 878 / expenseService: 814 / paymentMethodService: 310 (split into 3 sub-services) |
| Backend controllers | ~20 | — |
| Backend repositories | ~18 | — |
| Backend routes | 24 | — |
| Frontend components | ~80 JSX + ~65 CSS | ExpenseForm: 1,533 / ExpenseList: 1,163 / FinancialOverviewModal: 1,080 |
| Frontend hooks | ~15 | — |
| Frontend API services | 21 | — |
| Database migrations | 1 file | 5,395 lines (40+ migrations) |
| Database init (db.js) | 1 file | 1,118 lines |
| Test files | 348 total | 200 backend (96 PBT), 148 frontend (49 PBT) |
| API endpoints (config.js) | 1 file | ~180 endpoint definitions |
| Documentation | 58+ markdown files | across docs/, archive/, root |

## Technology Assessment

| Choice | Verdict | Notes |
|---|---|---|
| SQLite3 | ✅ Right | Single-user household app, Docker-deployed. No need for Postgres. |
| Express 5 | ✅ Good | Stable, well-supported, already on latest major. |
| React 19 | ✅ Good | Latest, functional components throughout. |
| Vanilla CSS | ⚠️ Debatable | 65+ CSS files with no design system. CSS Modules would reduce scope issues. |
| SSE for sync | ✅ Right | Simpler than WebSockets, sufficient for local network multi-device. |
| fast-check PBT | ✅ Excellent | 145 PBT files across frontend/backend. Strong correctness guarantees. |
| Jest + Vitest | ✅ Fine | Two runners is slightly annoying but both well-configured for their targets. |
| CommonJS (backend) | ⚠️ Legacy | Frontend uses ESM. Prevents code sharing between layers. |

## What's Working Well

- Layered architecture (Controller → Service → Repository) is clean and consistent
- Smart service decomposition where it matters (expenseService split into validation/tax/people sub-services)
- PBT testing with fast-check and sharded CI execution is genuinely impressive
- Deployment pipeline with automated rollback, health checks, and PR-based flow is production-grade
- SSE real-time sync with visibility-based lifecycle is well-engineered
- Rate limiting is tiered appropriately (500 general, 60 writes, 30 uploads, 5 backups)
- Security middleware stack (Helmet, CORS, file validation, upload security) is comprehensive

---

## Improvement Recommendations

### 1. Split migrations.js into individual files

**Priority: HIGH | Effort: LOW | Risk: LOW**

**Problem:** `backend/database/migrations.js` is 5,395 lines containing 40+ migrations in a single file. Every migration ever written lives here, executed sequentially on startup. Hard to navigate, review, or reason about.

**Recommendation:** Move to a file-per-migration pattern:

```
backend/database/migrations/
  001_initial_schema.js
  002_add_budgets_table.js
  003_expand_categories.js
  ...
  index.js          // discovers and runs in order
```

The existing `checkMigrationApplied` / `markMigrationApplied` infrastructure already tracks by name — each file just exports a single `up(db)` function. The runner reads the directory, sorts by prefix, and skips already-applied ones. No behavioral change, just file organization.

**Why now:** Every new feature adds another migration to the bottom of a 5,400-line file. Code review is painful, merge conflicts are common, and finding a specific migration requires scrolling through thousands of lines.

---

### 2. Unify test database setup with production schema

**Priority: HIGH | Effort: MEDIUM | Risk: MEDIUM**

**Problem:** `backend/database/db.js` (1,118 lines) contains a `CREATE TABLE` block that duplicates the production schema for test isolation. When a migration adds a column or table, the test schema must be updated separately — and it's easy to forget, causing test failures that don't reflect production behavior.

**Recommendation:** Test setup should run the real migration pipeline against an in-memory or temp-file SQLite database, not maintain a parallel schema definition. The test helper (`backend/test/dbIsolation.js`) should call the same `runMigrations(db)` function that production uses.

**Benefits:**
- Tests always match production schema exactly
- No more "works in tests, fails in production" schema drift
- Removes ~500 lines of duplicated DDL from db.js

**Risk mitigation:** Run the full backend test suite after the switch to catch any assumptions about schema ordering.

---

### 3. ~~Replace ModalContext boolean factory with useReducer~~ ✅ COMPLETED

**Priority: MEDIUM | Effort: LOW | Risk: LOW**

**Status:** Completed. Replaced 11 `useState` calls, 22 `useCallback` open/close handlers, and a 30+ dependency `useMemo` with a single `useReducer` + `modalReducer`. Same public API, same behavior. All 36 tests pass (14 unit, 16 PBT, 6 integration). Adding a new modal is now a one-line change (add to `initialState`).

---

### 4. Group frontend components by domain

**Priority: MEDIUM | Effort: MEDIUM | Risk: LOW**

**Problem:** `frontend/src/components/` is a flat directory with 80+ JSX files and 65+ CSS files. Finding related components requires scanning alphabetically. Components like `BillingCycleHistoryForm`, `BillingCycleHistoryList`, `BillingCycleReminderBanner`, `CreditCardDetailView`, `CreditCardPaymentForm`, `CreditCardReminderBanner`, `CreditCardStatementUpload`, and `UnifiedBillingCycleList` all belong to the same domain but are scattered across the directory.

**Recommended grouping:**
```
components/
  expenses/        ExpenseForm, ExpenseList, AdvancedFilters, FilterChip, SearchBar,
                   ReimbursementIndicator, InsuranceStatusIndicator, QuickStatusUpdate
  financial/       FinancialOverviewModal, AnnualSummary, SummaryPanel, IncomeManagementModal,
                   FixedExpensesModal, BudgetsModal, BudgetCard, BudgetProgressBar,
                   BudgetSummaryPanel, BudgetAlertManager, BudgetReminderBanner
  credit-cards/    CreditCardDetailView, CreditCardPaymentForm, CreditCardStatementUpload,
                   CreditCardReminderBanner, BillingCycleHistoryForm, BillingCycleHistoryList,
                   BillingCycleReminderBanner, UnifiedBillingCycleList, AutoGeneratedCycleBanner,
                   PaymentMethodForm
  loans/           LoanDetailView, LoanPaymentForm, LoanPaymentHistory, LoanPaymentReminderBanner,
                   MortgageDetailSection, MortgageInsightsPanel, AmortizationChart, EquityChart,
                   PaymentBalanceChart, PayoffProjectionInsights, CurrentStatusInsights,
                   ScenarioAnalysisInsights, TotalDebtView, AutoLogPrompt, MigrationUtility,
                   PaymentTrackingHistory, InvestmentDetailView
  tax/             TaxDeductible, InvoiceUpload, InvoiceList, InvoicePDFViewer,
                   InvoiceIndicator, PeopleManagementModal, PersonAllocationModal
  analytics/       AnalyticsHubModal, SpendingPatternsView, PredictionsView,
                   SeasonalAnalysisView, AnomalyAlertsView, DataSufficiencyMessage,
                   MerchantAnalyticsModal, MerchantDetailView
  notifications/   NotificationsSection, DataReminderBanner, InsuranceClaimReminderBanner
  system/          SettingsModal, SystemModal, BackupSettings, ActivityLogTable
  shared/          CollapsibleSection, HelpTooltip, FloatingAddButton, MonthSelector,
                   SyncToast, EnvironmentBanner, TrendIndicator, SimilarityGroup,
                   PlaceNameStandardization
```

**Approach:** Use `index.js` barrel exports per folder so existing imports can be updated incrementally. This is a refactor-only change with no behavioral impact.

---

### 5. ~~Split paymentMethodService.js~~ ✅ COMPLETED

**Priority: MEDIUM | Effort: LOW | Risk: LOW**

**Status:** Completed. Split the 1,307-line monolith into three focused sub-services following the same pattern used for `expenseService`:

```
paymentMethodService.js              → CRUD + orchestration, delegates to sub-services (~310 lines)
paymentMethodValidationService.js    → input validation, display name uniqueness (~130 lines)
paymentMethodBalanceService.js       → balance/utilization calculations, recalculate (~280 lines)
paymentMethodBillingCycleService.js  → billing cycle dates, details, history (~220 lines)
```

The main `paymentMethodService.js` preserves the exact same public API via delegation methods, so no consumer imports needed updating. All 66 tests pass (53 paymentMethod + 13 billingCycleController.creditCardDetail).

---

### 6. ~~Clean up config.js endpoint aliases~~ ✅ COMPLETED

**Priority: LOW | Effort: LOW | Risk: LOW**

**Status:** Completed. Removed 7 duplicate aliases (`MORTGAGE_INSIGHTS`, `MORTGAGE_PAYMENTS`, `MORTGAGE_PAYMENT`, `MORTGAGE_SCENARIO`, `MORTGAGE_RATE`, `INVOICE_BY_EXPENSE`, `PAYMENT_METHOD_BILLING_CYCLE_CREATE`), consolidated to canonical `LOAN_*` / `INVOICES_FOR_EXPENSE` / `PAYMENT_METHOD_BILLING_CYCLES` names, added new `LOAN_PAYMENT(id, paymentId)` endpoint, and updated all consumers and test mocks.

---

### 7. ~~Prune archive directory and consolidate docs~~ ✅ COMPLETED

**Priority: LOW | Effort: LOW | Risk: NONE**

**Status:** Completed. Deleted the entire `archive/` directory (~220 files: 56 archived specs, 41 deployment docs, 36 reports, 22 completion reports, 21 deprecated components, 14 spec implementations, 13 test scripts, 7 migration scripts, 4 spec summaries, 3 bug fix docs, 2 deprecated docs). Also deleted `backend/scripts/archive/` (~63 one-time scripts) and root test artifacts (`test-budget.json`). All content preserved in git history. Zero code dependencies existed on any deleted files.

---

### 8. ESM migration for backend

**Priority: LOW | Effort: HIGH | Risk: MEDIUM**

**Problem:** Backend uses CommonJS (`require`/`module.exports`) while frontend uses ESM (`import`/`export`). This prevents sharing utility code between layers (e.g., validation logic, date formatting, constants).

**Recommendation:** This is a "nice to have" that should only be tackled when there's a natural opportunity (e.g., a major Node.js version bump). The migration involves:
- Changing all `require()` to `import`
- Changing all `module.exports` to `export`
- Adding `"type": "module"` to `backend/package.json`
- Updating Jest config for ESM support
- Fixing any dynamic `require()` calls

**Not urgent** because the backend and frontend don't currently share code, and CommonJS works fine with Express 5 and Node.js. Only pursue this if code sharing becomes a real need.

---

## Priority Order

| # | Recommendation | Priority | Effort | Risk | Dependency |
|---|---|---|---|---|---|
| 1 | Split migrations.js | HIGH | LOW | LOW | None |
| 2 | Unify test DB setup | HIGH | MEDIUM | MEDIUM | After #1 |
| 3 | ~~ModalContext reducer~~ ✅ | MEDIUM | LOW | LOW | None |
| 4 | Group frontend components | MEDIUM | MEDIUM | LOW | None |
| 5 | ~~Split paymentMethodService~~ ✅ | MEDIUM | LOW | LOW | None |
| 6 | ~~Clean config.js aliases~~ ✅ | LOW | LOW | LOW | None |
| 7 | ~~Prune archive/docs~~ ✅ | LOW | LOW | NONE | None |
| 8 | ESM migration | LOW | HIGH | MEDIUM | None |

Items 1-2 are the highest-value changes. Items 4-5 are good refactoring targets when touching those areas. Item 8 is opportunistic.

---

## Relationship to Existing Specs

- **billing-cycle-simplification** already addresses the `billingCycleHistoryService.js` (878 lines) split — no separate recommendation needed
- **billing-cycle-api-optimization** will reduce endpoint count in config.js, partially addressing recommendation #6
- **financial-overview-redesign** is frontend-only and independent of all recommendations above
- Recommendation #1 (migrations split) should ideally happen before any spec that adds new migrations, to avoid making the file even larger
