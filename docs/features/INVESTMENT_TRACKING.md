# Investment Tracking Feature

## Overview

The Investment Tracking feature enables users to monitor their investment portfolio performance over time. Users can track multiple investments (TFSA and RRSP accounts), record monthly value updates, and view performance with visual indicators and charts.

## Key Features

### Investment Management
- **Create Investments**: Add TFSA or RRSP investment accounts with initial values
- **Edit Investments**: Update investment names and types (initial value cannot be changed)
- **Delete Investments**: Remove investments (automatically deletes all value entries)
- **View All Investments**: See complete portfolio with current values

### Value Tracking
- **Monthly Values**: Record investment values at the end of each month
- **Historical Tracking**: Maintain complete value history for each investment
- **Upsert Logic**: Adding a value for an existing month updates the existing entry
- **Value Changes**: Automatic calculation of month-over-month changes
- **Percentage Changes**: Display percentage change from previous month

### Visual Indicators
- **Arrow Indicators**: 
  - ▲ Green arrow for value increases
  - ▼ Red arrow for value decreases
  - — Neutral indicator for no change
- **Color Coding**:
  - Green for positive changes
  - Red for negative changes
  - Neutral for no change
- **Line Graphs**: Visual charts showing investment performance over time

### Portfolio Overview
- **Total Portfolio Value**: Sum of all investment current values, shown in the Net Worth summary of the Financial Overview modal
- **Summary Integration**: `GET /api/expenses/summary` includes `investments` and `totalInvestmentValue`
- **Current Values**: Most recent value entry shown as current value
- **Initial Value Fallback**: Shows initial value when no value entries exist
- **Reminders**: Investments missing a value for the current month are highlighted (see [Monthly Data Reminders](MONTHLY_DATA_REMINDERS.md))

## User Interface

### Investments Section (Financial Overview Modal)
Open the Financial Overview modal with the "💼 Financial" button in the month selector. The "📈 Investments (N)" section is rendered by `InvestmentsSection` in `frontend/src/components/financial/FinancialOverviewModal.jsx`, with one `InvestmentRow` per investment.

**Features**:
- List of all investments with current values
- "+ Add" button in the section header (name, type TFSA/RRSP, initial value)
- View, edit and delete buttons for each investment (delete asks for confirmation)
- Selecting an investment replaces the list with `InvestmentDetailView`

### Investment Detail View
`frontend/src/components/loans/InvestmentDetailView.jsx` shows:

**Investment Summary**:
- Investment name and type
- Initial value
- Current value
- Total change (current - initial)
- Percentage change

**Line Graph** (inline SVG):
- Visual chart showing value changes over time
- X-axis: Month/Year
- Y-axis: Value

**Value History** table:
- Chronological list of all value entries (most recent first)
- Columns: Month/Year, Value, Change, % Change, Actions
- Arrow indicators and color coding for changes
- Edit and delete buttons for each entry

**Add Value Entry Form**:
- Month/year picker
- Value input
- Validation (month 1-12, value >= 0)
- Upsert behavior (updates existing entry if month exists)

## Technical Implementation

### Database Schema

Defined in `backend/database/schema.js`.

**investments table**:
```sql
CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
  initial_value REAL NOT NULL CHECK(initial_value >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**investment_values table**:
```sql
CREATE TABLE IF NOT EXISTS investment_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investment_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  value REAL NOT NULL CHECK(value >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
  UNIQUE(investment_id, year, month)
);
```

**Indexes**:
- `idx_investments_type` on investments(type)
- `idx_investment_values_investment_id` on investment_values(investment_id)
- `idx_investment_values_year_month` on investment_values(year, month)

### API Endpoints

**Investment Management**:
- `GET /api/investments` - Get all investments with current values
- `POST /api/investments` - Create a new investment
- `PUT /api/investments/:id` - Update investment details
- `DELETE /api/investments/:id` - Delete investment (cascades to values)

**Value Management**:
- `GET /api/investment-values/:investmentId` - Get value history
- `GET /api/investment-values/:investmentId/:year/:month` - Get specific value
- `POST /api/investment-values` - Create or update value (upsert)
- `PUT /api/investment-values/:id` - Update value entry
- `DELETE /api/investment-values/:id` - Delete value entry

**Summary Integration**:
- `GET /api/expenses/summary?year=X&month=Y` - Includes `investments` and `totalInvestmentValue`

### Architecture

- **Routes**: `backend/routes/investmentRoutes.js`, `investmentValueRoutes.js`
- **Controllers**: `backend/controllers/investmentController.js`, `investmentValueController.js`
- **Services**: `backend/services/investmentService.js`, `investmentValueService.js` (validation, activity logging)
- **Repositories**: `backend/repositories/investmentRepository.js`, `investmentValueRepository.js`
- **Frontend**: `FinancialOverviewModal.jsx` (`InvestmentsSection`), `components/loans/InvestmentRow.jsx`, `components/loans/InvestmentDetailView.jsx`; API clients `frontend/src/services/investmentApi.js`, `investmentValueApi.js`

### Data Validation

**Investment Validation** (`investmentService`):
- Name: Required, non-empty, max 100 characters
- Type: Must be 'TFSA' or 'RRSP' (also enforced by CHECK constraint)
- Initial Value: Required, >= 0, max 2 decimal places (also CHECK constraint)

**Value Entry Validation**:
- Investment ID: Required positive integer referencing an existing investment (foreign key)
- Year: Required, 1900-2100
- Month: Required, 1-12
- Value: Required, >= 0, max 2 decimal places (also CHECK constraint)
- Uniqueness: One value per investment per month (UNIQUE constraint)

## Data Integrity

### Foreign Key Constraints
- **CASCADE DELETE**: Deleting an investment automatically removes all associated value entries
- **Foreign Keys Enabled**: `PRAGMA foreign_keys = ON` ensures referential integrity

### Unique Constraints
- **One Value Per Month**: UNIQUE constraint on (investment_id, year, month)
- **Upsert Behavior**: Application handles updates when duplicate month detected

### CHECK Constraints
- **Type Validation**: Only 'TFSA' and 'RRSP' allowed
- **Non-Negative Values**: initial_value and value must be >= 0

## Backup Integration

The `investments` and `investment_values` tables are part of the SQLite database and are included in automated and manual backups and restores.

## Indexes

1. `idx_investments_type` - Filtering by investment type
2. `idx_investment_values_investment_id` - Value lookups by investment
3. `idx_investment_values_year_month` - Monthly queries

Tables and indexes are created at startup from `backend/database/schema.js`.

**Last Reviewed:** October 4, 2026

