# Project Structure & Technology

## Stack

- **Frontend**: React 19 (functional components/hooks), Vite, Vanilla CSS3 + CSS Modules (incremental adoption)
- **Backend**: Node.js + Express, SQLite3, CommonJS modules
- **Infrastructure**: Docker + Docker Compose

## Commands

```bash
npm run install-all          # Install all dependencies
cd backend && npm start      # Backend (port 2424)
cd frontend && npm run dev   # Frontend dev (port 5173)
npm run build                # Build frontend
docker-compose up            # Docker dev
```

## Architecture

**Controller → Service → Repository → Database**

- Controllers: HTTP layer, input validation
- Services: Business logic (large ones split: expenseService → expenseValidationService, etc.)
- Repositories: Data access
- Database: SQLite init, migrations

## Layout

```
backend/
  config/ controllers/ services/ repositories/
  routes/ database/ middleware/ utils/ scripts/
  events/
  server.js
frontend/src/
  components/
    expenses/        # ExpenseForm, ExpenseList, AdvancedFilters, FilterChip, SearchBar, etc.
    financial/       # FinancialOverviewModal, AnnualSummary, SummaryPanel, BudgetsModal, etc.
    credit-cards/    # CreditCardDetailView, PaymentMethodForm, BillingCycleHistoryForm, etc.
    loans/           # LoanDetailView, LoanPaymentForm, MortgageInsightsPanel, TotalDebtView, etc.
    tax/             # TaxDeductible, InvoiceUpload, PeopleManagementModal, etc.
    analytics/       # AnalyticsHubModal, MerchantAnalyticsModal, SpendingPatternsView, etc.
    notifications/   # NotificationsSection, DataReminderBanner, InsuranceClaimReminderBanner
    system/          # SettingsModal, SystemModal, BackupSettings, ActivityLogTable, etc.
    shared/          # CollapsibleSection, HelpTooltip, FloatingAddButton, MonthSelector, etc.
  contexts/ hooks/ services/
  utils/ test-utils/ styles/
  App.jsx config.js
specs/
  <feature-name>/     # Active specs in progress
  archive/            # Completed specs and historical spec artifacts
```

## Spec Format & Location Policy

- Canonical spec root: `specs/`
- New specs must be created at `specs/<feature-name>/spec.md` (single file combining requirements, design, and tasks)
- Completed specs must be moved to `specs/archive/`
- Do not create or use alternate spec roots in docs or workflows
- Do NOT split into separate `requirements.md`, `design.md`, `tasks.md` — use one `spec.md`

**Frontend Architecture (v5.12.0):**
- **AppShell**: Three-column layout (Sidebar + main content + SummaryPanel)
- **Sidebar**: Persistent navigation with 7 main items + Settings/System
- **ContextBar**: Arrow-based month navigation (← Month Year →)
- **PageRouter**: Hash-based routing with nested sub-routes
- **Page Components**: FinancialOverviewPage, BudgetsPage, AnnualSummaryPage, TaxPage, AnalyticsPage, MerchantAnalyticsPage
- **CSS Modules**: Adopted incrementally for new components alongside existing global styles

## Database

Schema: `docs/DATABASE_SCHEMA.md`

Key tables: expenses, income_sources, fixed_expenses, loans, loan_balances, loan_payments, mortgage_payments, investments, investment_values, budgets, people, expense_people, expense_invoices, payment_methods, credit_card_payments, credit_card_statements, credit_card_billing_cycles, place_names, reminders, dismissed_anomalies, activity_logs, settings, schema_migrations

Key constraints: FK CASCADE DELETE, UNIQUE (loan_id, year, month), UNIQUE (expense_id, person_id), loan_type in ('loan','line_of_credit','mortgage')

## Frontend Contexts

- RouterContext: hash-based client-side routing with nested sub-routes
- ThemeContext: light/dark mode toggle with .theme-dark class
- FilterContext: expense filtering (category, payment method, year)
- ExpenseContext: CRUD operations
- ModalContext: modal visibility/state (reduced to essential modals only)
- SharedDataContext: shared data loading
- AuthContext: JWT auth state, token refresh, Password_Gate / Open_Mode detection

## API

- RESTful under `/api`, JSON bodies, multer for uploads
- Base URL in `frontend/src/config.js`
