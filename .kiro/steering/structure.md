# Project Structure

## Architecture Pattern

The backend follows a layered architecture with clear separation of concerns:

**Controller → Service → Repository → Database**

- **Controllers**: Handle HTTP requests/responses, input validation, error handling
- **Services**: Business logic, data validation, orchestration between repositories
  - Large services may be split into focused sub-services (e.g., expenseService delegates to expenseValidationService, expenseInsuranceService, expensePeopleService, expenseTaxService, expenseAggregationService, expenseCategoryService)
- **Repositories**: Data access layer, direct database operations
- **Database**: SQLite initialization and schema management

## Directory Layout

```
expense-tracker/
├── backend/
│   ├── config/            # Logger, paths configuration
│   ├── controllers/       # HTTP request handlers
│   ├── services/          # Business logic layer
│   ├── repositories/      # Data access layer
│   ├── routes/            # Express route definitions
│   ├── database/          # DB initialization, migrations, SQLite file
│   ├── middleware/        # Express middleware (error handler, upload)
│   ├── utils/             # Helper functions (date, file storage, etc.)
│   ├── scripts/           # Utility scripts
│   └── server.js          # Express app entry point
├── frontend/
│   ├── src/
│   │   ├── components/    # React components (paired with .css)
│   │   ├── contexts/      # React Context providers
│   │   ├── services/      # API call functions
│   │   ├── utils/         # Frontend utilities
│   │   ├── test-utils/    # Shared test utilities (arbitraries, wrappers, assertions, mocks)
│   │   ├── styles/        # Shared CSS variables
│   │   ├── App.jsx        # Main application component
│   │   └── config.js      # API endpoint configuration
│   ├── index.html
│   ├── vite.config.js
│   └── vitest.config.js
└── docker-compose.yml
```


## Database Schema

### Tables
- **expenses**: Main expense records with date, place, amount, type, method, week, posted_date, insurance fields
- **monthly_gross**: Monthly income records (deprecated - replaced by income_sources)
- **income_sources**: Monthly income from multiple sources with category tracking
- **fixed_expenses**: Fixed monthly expenses with category, payment type, loan linkage, due dates
- **loans**: Loan, line of credit, and mortgage tracking with type differentiation
- **loan_balances**: Monthly balance and rate history for loans
- **loan_payments**: Payment-based tracking for loans and mortgages
- **mortgage_payments**: Mortgage payment amount tracking over time
- **investments**: Investment accounts (TFSA, RRSP)
- **investment_values**: Monthly investment value snapshots
- **budgets**: Monthly budget limits per category
- **people**: Family members for medical expense tracking
- **expense_people**: Junction table linking expenses to people with allocation amounts
- **expense_invoices**: Invoice PDF attachments with optional person linking
- **payment_methods**: Configurable payment methods (cash, cheque, debit, credit_card)
- **credit_card_payments**: Credit card payment history
- **credit_card_statements**: Credit card statement file uploads
- **credit_card_billing_cycles**: Billing cycle history with statement balances
- **place_names**: Place name standardization mapping
- **reminders**: Monthly data reminder tracking
- **dismissed_anomalies**: Persisted anomaly dismissals for analytics
- **schema_migrations**: Migration tracking

### Key Fields
- Week calculation (1-5) based on date
- Tax-deductible types: "Tax - Medical" and "Tax - Donation"
- Loans include `loan_type` ('loan', 'line_of_credit', or 'mortgage')
- Loan balances have UNIQUE constraint on (loan_id, year, month)
- expense_people has UNIQUE constraint on (expense_id, person_id)
- Foreign keys enabled with CASCADE DELETE for referential integrity

## Frontend Architecture

### Context Providers
State management uses React Context with dedicated providers:
- **FilterContext**: Global expense filtering state (category, payment method, year)
- **ExpenseContext**: Expense CRUD operations and data management
- **ModalContext**: Modal visibility and state management (replaces App.jsx conditional rendering)
- **SharedDataContext**: Shared data loading (payment methods, people, loans, etc.)

### Component Organization
Components follow a pattern of paired .jsx and .css files. Modal components are managed through ModalContext rather than directly in App.jsx.

## API Conventions

- RESTful endpoints under `/api` prefix
- Query parameters for filtering (year, month)
- Standard HTTP methods (GET, POST, PUT, DELETE)
- JSON request/response bodies
- File uploads use multer middleware
