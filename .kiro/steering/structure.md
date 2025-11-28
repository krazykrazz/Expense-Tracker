# Project Structure

## Architecture Pattern

The backend follows a layered architecture with clear separation of concerns:

**Controller → Service → Repository → Database**

- **Controllers**: Handle HTTP requests/responses, input validation, error handling
- **Services**: Business logic, data validation, orchestration between repositories
- **Repositories**: Data access layer, direct database operations
- **Database**: SQLite initialization and schema management

## Directory Layout

```
expense-tracker/
├── backend/
│   ├── controllers/       # HTTP request handlers
│   ├── services/          # Business logic layer
│   ├── repositories/      # Data access layer
│   ├── routes/            # Express route definitions
│   ├── database/          # DB initialization and SQLite file
│   ├── utils/             # Helper functions (date utils, etc.)
│   ├── scripts/           # Utility scripts
│   └── server.js          # Express app entry point
├── frontend/
│   ├── src/
│   │   ├── components/    # React components (paired with .css files)
│   │   ├── App.jsx        # Main application component
│   │   └── config.js      # API endpoint configuration
│   ├── index.html         # HTML entry point
│   └── vite.config.js     # Vite configuration
└── docker-compose.yml     # Container orchestration
```

## Database Schema

### Tables
- **expenses**: Main expense records with recurring tracking fields
- **monthly_gross**: Monthly income records (deprecated - replaced by income_sources)
- **recurring_expenses**: Recurring expense templates
- **income_sources**: Monthly income from multiple sources
- **fixed_expenses**: Fixed monthly expenses with category and payment type tracking
- **loans**: Loan and line of credit tracking
- **loan_balances**: Monthly balance and rate history for loans

### Key Fields
- Expenses include `recurring_id` and `is_generated` to track template relationships
- Week calculation (1-5) based on date
- Tax-deductible types: "Tax - Medical" and "Tax - Donation"
- Loans include `loan_type` ('loan' or 'line_of_credit') for different behavior
- Loan balances have UNIQUE constraint on (loan_id, year, month)
- Foreign keys enabled with CASCADE DELETE for referential integrity

## Component Organization

Frontend components follow a pattern of paired .jsx and .css files:
- ExpenseForm.jsx + ExpenseForm.css
- ExpenseList.jsx + ExpenseList.css
- SummaryPanel.jsx + SummaryPanel.css

Modal overlays are managed in App.jsx with conditional rendering.

## API Conventions

- RESTful endpoints under `/api` prefix
- Query parameters for filtering (year, month)
- Standard HTTP methods (GET, POST, PUT, DELETE)
- JSON request/response bodies
- File uploads use multer middleware
