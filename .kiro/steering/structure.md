# Project Structure & Technology

## Stack

- **Frontend**: React 18 (functional components/hooks), Vite, Vanilla CSS3
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
  server.js
frontend/src/
  components/ contexts/ hooks/ services/
  utils/ test-utils/ styles/
  App.jsx config.js
```

## Database

Schema: `docs/DATABASE_SCHEMA.md`

Key tables: expenses, income_sources, fixed_expenses, loans, loan_balances, loan_payments, mortgage_payments, investments, investment_values, budgets, people, expense_people, expense_invoices, payment_methods, credit_card_payments, credit_card_statements, credit_card_billing_cycles, place_names, reminders, dismissed_anomalies, activity_logs, settings, schema_migrations

Key constraints: FK CASCADE DELETE, UNIQUE (loan_id, year, month), UNIQUE (expense_id, person_id), loan_type in ('loan','line_of_credit','mortgage')

## Frontend Contexts

- FilterContext: expense filtering (category, payment method, year)
- ExpenseContext: CRUD operations
- ModalContext: modal visibility/state
- SharedDataContext: shared data loading

## API

- RESTful under `/api`, JSON bodies, multer for uploads
- Base URL in `frontend/src/config.js`
