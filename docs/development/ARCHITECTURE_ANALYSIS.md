# Architecture Analysis & Improvement Recommendations

> Analysis date: February 2026 | Version: 1.0.0

## Codebase Metrics

| Layer | Source Files | Largest File (lines) |
|---|---|---|
| Backend services | ~32 | billingCycleHistoryService: 878 / expenseService: 814 / paymentMethodService: 310 (split into 3 sub-services) / authService |
| Backend controllers | ~21 | — |
| Backend repositories | ~19 | — |
| Backend routes | 25 | — |
| Frontend components | ~80 JSX + ~65 CSS | ExpenseForm: 1,533 / ExpenseList: 1,163 / FinancialOverviewModal: 1,080 |
| Frontend hooks | ~17 | — |
| Frontend API services | 21 | — |
| Database migrations | 1 file | ~50 lines (consolidated schema in schema.js) |
| Database init (db.js) | 1 file | ~200 lines (imports from schema.js) |
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
- Auth infrastructure with optional Password_Gate preserves backward compatibility — Open_Mode works exactly as before, Password_Gate adds JWT-based auth with in-memory cache for zero-overhead passthrough

---

## Improvement Recommendations

### 1. ~~Split migrations.js into individual files~~ ✅ COMPLETED

**Priority: HIGH | Effort: LOW | Risk: LOW**

**Status:** Completed via migration consolidation spec. Rather than splitting into individual files, the ~5,395-line `migrations.js` was replaced with a ~50-line module exporting only `runMigrations`, `checkMigrationApplied`, and `markMigrationApplied`. All schema definitions were consolidated into `backend/database/schema.js` as a single declarative source of truth. The `runMigrations` function now simply marks `consolidated_schema_v1` if not already present.

---

### 2. ~~Unify test database setup with production schema~~ ✅ COMPLETED

**Priority: HIGH | Effort: MEDIUM | Risk: MEDIUM**

**Status:** Completed via migration consolidation spec. All three database initialization paths (`initializeDatabase()` in `db.js`, `createTestDatabase()` in `db.js`, and `createSchema()` in `dbIsolation.js`) now import `ALL_STATEMENTS` from the shared `backend/database/schema.js` module. This eliminated ~500 lines of duplicated DDL and ensures test-production schema parity. Property-based tests verify schema parity across all paths.

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
  system/          SettingsModal, SystemModal, BackupSettings, ActivityLogTable, UpdateBanner
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
| 1 | ~~Split migrations.js~~ ✅ | HIGH | LOW | LOW | None |
| 2 | ~~Unify test DB setup~~ ✅ | HIGH | MEDIUM | MEDIUM | After #1 |
| 3 | ~~ModalContext reducer~~ ✅ | MEDIUM | LOW | LOW | None |
| 4 | Group frontend components | MEDIUM | MEDIUM | LOW | None |
| 5 | ~~Split paymentMethodService~~ ✅ | MEDIUM | LOW | LOW | None |
| 6 | ~~Clean config.js aliases~~ ✅ | LOW | LOW | LOW | None |
| 7 | ~~Prune archive/docs~~ ✅ | LOW | LOW | NONE | None |
| 8 | ESM migration | LOW | HIGH | MEDIUM | None |

Items 1-2 are the highest-value changes. Items 4-5 are good refactoring targets when touching those areas. Item 8 is opportunistic.

---

## Fetch Infrastructure Analysis

> Added after auth-infrastructure spec completion (February 2026)

During the wiring of `authFetch` into the frontend, several structural observations emerged. None are bugs or regressions — the app works correctly. These are consolidation opportunities for a future PR.

### Finding 1: ~~Duplicated `fetchWithRetry` across service files~~ ✅ COMPLETED

**Files:** `creditCardApi.js`, `paymentMethodApi.js`, `invoiceApi.js`

**Status:** Completed via fetch-infrastructure-consolidation spec. Extracted shared `fetchWithRetry` and `apiGetWithRetry` into `frontend/src/utils/fetchWithRetry.js`. All three service files migrated to use `apiClient.js` methods (`apiGet`, `apiPost`, `apiPut`, `apiDelete`, `apiPatch`) with `apiGetWithRetry` for GET operations. Inline retry implementations removed.

### Finding 2: ~~Overlapping error handling patterns~~ ✅ COMPLETED

**Status:** Completed via fetch-infrastructure-consolidation spec. All three service files now use `apiClient.js` for mutations and `apiGetWithRetry` for GETs. The two parallel patterns have been unified — only custom operations (XHR uploads, blob downloads, FormData bodies) retain direct fetch calls with explanatory comments.

### Finding 3: ~~`authAwareFetch` is a thin convenience wrapper~~ ✅ COMPLETED

**Status:** Completed. Enhanced JSDoc added to `authAwareFetch` in `fetchProvider.js` documenting that it is an intentional thin wrapper around `getFetchFn()()` for readability, and should not be removed.

### Finding 4: ~~Duplicate X-Tab-ID header injection~~ ✅ COMPLETED

**Status:** Completed via fetch-infrastructure-consolidation spec. `fetchWithTabId` removed from `tabId.js` — X-Tab-ID injection is now handled solely by `apiClient.js`. Custom operations that can't use apiClient import `TAB_ID` directly for header injection. The `getFetchFn` import was removed from `tabId.js`.

### Recommendation

~~Extract `fetchWithRetry` into a shared utility (Finding 1) — this is the only change worth making.~~ All four findings addressed by the fetch-infrastructure-consolidation spec.

---

## Relationship to Existing Specs

- **billing-cycle-simplification** already addresses the `billingCycleHistoryService.js` (878 lines) split — no separate recommendation needed
- **billing-cycle-api-optimization** will reduce endpoint count in config.js, partially addressing recommendation #6
- **financial-overview-redesign** is frontend-only and independent of all recommendations above
- Recommendation #1 (migrations consolidation) and #2 (test DB unification) were completed by the **migration-consolidation** spec — `backend/database/schema.js` is now the single source of truth for all schema definitions
