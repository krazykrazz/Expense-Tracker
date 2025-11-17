# Design Document: Monthly Loans Balance

## Overview

The Monthly Loans Balance feature adds loan tracking capabilities to the expense tracker application. Users can manage multiple loans, record monthly balance updates, and view current outstanding debt alongside their monthly financial summary. The feature integrates seamlessly into the existing monthly summary view, displaying loan information at the bottom of the summary panel.

## Architecture

The feature follows the existing layered architecture pattern:

```
Controller → Service → Repository → Database
```

### Component Flow

1. **Frontend**: `SummaryPanel.jsx` displays loan data; new `LoansModal.jsx` manages loan CRUD operations
2. **API Routes**: RESTful endpoints under `/api/loans` and `/api/loan-balances`
3. **Controller**: Handles HTTP requests, validates input, returns responses
4. **Service**: Business logic, validation, orchestration
5. **Repository**: Data access layer for database operations
6. **Database**: Two new SQLite tables for loans and balance entries

## Components and Interfaces

### Database Schema

#### loans Table

```sql
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
  start_date TEXT NOT NULL,
  notes TEXT,
  is_paid_off INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off);
```

#### loan_balances Table

```sql
CREATE TABLE IF NOT EXISTS loan_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
  rate REAL NOT NULL CHECK(rate >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  UNIQUE(loan_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_loan_balances_loan_id ON loan_balances(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month);
```

### Backend API Endpoints

#### Loan Management

- `GET /api/loans` - Get all loans with current balances
- `POST /api/loans` - Create a new loan
- `PUT /api/loans/:id` - Update loan details
- `DELETE /api/loans/:id` - Delete a loan (cascades to balance entries)
- `PUT /api/loans/:id/paid-off` - Mark loan as paid off or reactivate

#### Balance Management

- `GET /api/loan-balances/:loanId` - Get all balance entries for a loan
- `GET /api/loan-balances/:loanId/:year/:month` - Get specific balance entry
- `POST /api/loan-balances` - Create or update a balance entry
- `PUT /api/loan-balances/:id` - Update a balance entry
- `DELETE /api/loan-balances/:id` - Delete a balance entry

#### Summary Integration

- `GET /api/summary?year=X&month=Y` - Enhanced to include loan data (only loans with start_date <= selected month)

### Repository Layer

**loanRepository.js**

```javascript
class LoanRepository {
  async create(loan)
  async findAll()
  async findById(id)
  async update(id, loan)
  async delete(id)
  async markPaidOff(id, isPaidOff)
  async getCurrentBalance(loanId)
  async getAllWithCurrentBalances()
  async getLoansForMonth(year, month) // Get loans where start_date <= selected month
}
```

**loanBalanceRepository.js**

```javascript
class LoanBalanceRepository {
  async create(balanceEntry)
  async findByLoan(loanId)
  async findByLoanAndMonth(loanId, year, month)
  async update(id, balanceEntry)
  async delete(id)
  async upsert(balanceEntry) // Create or update if exists
  async getBalanceHistory(loanId)
}
```

### Service Layer

**loanService.js**

- Validates loan data (name, initial_balance, start_date)
- Enforces business rules (e.g., balance >= 0)
- Orchestrates repository calls
- Calculates derived values (total outstanding debt, current rate from most recent balance entry)
- Auto-marks loans as paid off when balance reaches zero
- Filters out paid off loans from monthly summary data
- Includes paid off loans in modal view for historical reference

**loanBalanceService.js**

- Validates balance entries (year, month, remaining_balance, rate)
- Enforces business rules (balance >= 0, rate >= 0)
- Enforces one balance entry per loan per month
- Calculates balance changes from previous month
- Calculates rate changes from previous month
- Handles upsert logic for monthly updates
- Auto-marks loans as paid off when balance reaches zero

### Controller Layer

**loanController.js**

- HTTP request/response handling
- Input validation and error responses
- Calls service layer methods
- Returns appropriate status codes (200, 201, 400, 404, 500)

**loanBalanceController.js**

- Similar pattern to loanController
- Handles balance-specific operations

### Frontend Components

#### Enhanced SummaryPanel.jsx

Add a new "Loans" section at the bottom of the monthly summary:

```jsx
<div className="loans-section">
  <h3>Outstanding Loans</h3>
  <div className="loans-list">
    {loans.map(loan => (
      <div key={loan.id} className="loan-item">
        <span className="loan-name">{loan.name}</span>
        <span className="loan-balance">${formatAmount(loan.currentBalance)}</span>
      </div>
    ))}
  </div>
  <div className="loans-total">
    <span className="loans-label">Total Outstanding Debt:</span>
    <span className="loans-value">${formatAmount(totalLoans)}</span>
  </div>
  <button className="view-loans-button" onClick={handleOpenLoansModal}>
    👁️ View/Edit
  </button>
</div>
```

#### New LoansModal.jsx

Modal component for managing loans and balance entries:

- **Loan List View**: Display all loans with current remaining balances and current interest rates
- **Add/Edit Loan Form**: Name, initial balance, start date, notes (rate is tracked per month, not at loan level)
- **View Button**: Opens detailed loan view for selected loan
- **Paid Off Toggle**: Mark loans as paid off or reactivate

#### New LoanDetailView.jsx

Detailed view component for individual loan (opened from LoansModal):

- **Loan Summary Section**: 
  - Loan name and current interest rate
  - Original amount (initial balance)
  - Current remaining balance
  - Total amount paid down
  - Start date
  - Notes
- **Balance History Timeline**: 
  - Chronological list of all monthly balance entries
  - Display month/year, remaining balance, interest rate, balance change, and rate change from previous month
  - Visual indicators (arrows/colors) for balance and rate changes
  - Add/Edit balance entry inline (both balance and rate)
- **Actions**:
  - Edit loan details button (name, notes, start date only)
  - Add new balance entry button (balance + rate)
  - Delete balance entry buttons
  - Mark as paid off toggle

#### New TotalDebtView.jsx

Modal component showing aggregate debt across all active loans over time (opened from LoansModal):

- **Summary Statistics Section**:
  - Current Total Debt (sum of all active loan balances)
  - Starting Total Debt (first recorded total)
  - Total Reduction (amount paid down)
  - Active Loans Count
- **Monthly History Table**:
  - Chronological list of all months with balance data
  - Display month/year, total debt, change from previous month (amount and percentage)
  - Visual indicators (▼/▲) for debt increase/decrease
  - Color coding (green for decrease, red for increase)
  - Number of active loans per month
- **API Endpoint**: `GET /api/loan-balances/total/history`
  - Returns aggregated monthly totals across all active loans
  - Excludes paid-off loans from calculations

#### New loanApi.js

Frontend API service for loan operations:

```javascript
export const loanApi = {
  getAllLoans: async () => { ... },
  createLoan: async (loanData) => { ... },
  updateLoan: async (id, loanData) => { ... },
  deleteLoan: async (id) => { ... },
  markPaidOff: async (id, isPaidOff) => { ... },
  
  getBalanceHistory: async (loanId) => { ... },
  createOrUpdateBalance: async (balanceData) => { ... },
  deleteBalance: async (id) => { ... }
};
```

## Data Models

### Loan Object

```javascript
{
  id: number,
  name: string,
  initial_balance: number,
  start_date: string, // ISO date format "YYYY-MM-DD"
  notes: string | null,
  is_paid_off: number, // 0 or 1
  created_at: string,
  updated_at: string,
  currentBalance: number, // Calculated field - most recent remaining balance
  currentRate: number // Calculated field - most recent interest rate
}
```

### Balance Entry Object

```javascript
{
  id: number,
  loan_id: number,
  year: number,
  month: number, // 1-12
  remaining_balance: number, // Outstanding balance at end of month
  rate: number, // Interest rate for this month (e.g., 5.5 for 5.5%)
  created_at: string,
  updated_at: string,
  balanceChange: number, // Calculated: difference from previous month (negative = paid down)
  rateChange: number // Calculated: difference from previous month rate
}
```

### Summary Response Enhancement

```javascript
{
  // ... existing summary fields
  loans: [
    {
      id: number,
      name: string,
      currentRate: number, // Most recent rate from balance entries
      currentBalance: number,
      isPaidOff: boolean
    }
  ],
  totalOutstandingDebt: number
}

// Note: Only includes loans where start_date <= selected month/year
// Rate is retrieved from the most recent balance entry for each loan
```

## Error Handling

### Validation Errors (400)

- Missing required fields for loan: name, initial_balance, start_date
- Missing required fields for balance entry: loan_id, year, month, remaining_balance, rate
- Invalid data types or formats
- Negative balance or rate values
- Invalid month (not 1-12)
- Name exceeds 100 characters
- Rate exceeds reasonable limits (e.g., > 100%)

### Not Found Errors (404)

- Loan ID does not exist
- Balance entry not found

### Conflict Errors (409)

- Duplicate balance entry for same loan/month (handled via upsert)

### Server Errors (500)

- Database connection failures
- Unexpected errors during operations

### Error Response Format

```javascript
{
  error: "Error message describing what went wrong"
}
```

## Testing Strategy

### Backend Unit Tests

- **Repository Layer**: Test CRUD operations, foreign key constraints, unique constraints
- **Service Layer**: Test validation logic, business rules, calculations
- **Controller Layer**: Test request handling, error responses, status codes

### Frontend Component Tests

- **LoansModal**: Test form validation, CRUD operations, modal open/close
- **SummaryPanel**: Test loan data display, total calculations, integration

### Integration Tests

- Test full flow: Create loan → Add balance entries → View in summary
- Test cascade delete: Delete loan removes all balance entries
- Test auto paid-off: Balance reaches zero marks loan as paid off
- Test upsert: Adding duplicate month/year updates existing entry

### Manual Testing Scenarios

1. Create multiple loans and verify display in summary
2. Add balance entries for different months
3. Verify balance history shows correct changes
4. Mark loan as paid off and verify exclusion from total
5. Delete loan and verify cascade to balance entries
6. Test with no loans (empty state)
7. Test with loans but no balance entries (shows initial balance)

## Database Migration

Add migration script `backend/scripts/addLoansTable.js`:

```javascript
// Create loans and loan_balances tables
// Add indexes for performance
// Include in database initialization
```

Update `backend/database/db.js` to include new tables in initialization.

## UI/UX Considerations

### Loans Section in Summary Panel

- Display below the balance sheet section
- Show only loans where start_date is on or before the selected month
- Show only active loans (exclude paid off loans with balance = 0)
- Do NOT provide toggle for paid off loans in summary (they remain hidden)
- Use consistent styling with existing summary sections
- Display total outstanding debt prominently (only active loans)
- If no active loans exist for the selected month, show empty state message or hide section

### Loans Modal

- Tabbed interface: "Active Loans" | "Paid Off Loans"
- Active Loans tab shows loans with balance > 0
- Paid Off Loans tab shows historical loans with balance = 0 (for reference)
- Each loan row displays: name, rate, current balance, and "View" button
- Click "View" button to open detailed loan view
- Add new loan button at top
- Confirmation dialog for delete operations
- Users can view full history of paid off loans but they don't appear in monthly summary

### Loan Detail View

- Full-screen or large modal overlay
- Header shows loan name with edit button
- Summary card displays:
  - Original Amount: $X,XXX.XX
  - Current Balance: $X,XXX.XX
  - Total Paid Down: $X,XXX.XX (calculated)
  - Current Interest Rate: X.XX% (from most recent balance entry)
  - Start Date: MM/DD/YYYY
- Balance history table/timeline:
  - Columns: Month/Year, Remaining Balance, Interest Rate, Balance Change, Rate Change, Actions
  - Sorted chronologically (most recent first)
  - Color coding: green for balance decreases, red for increases; visual indicator for rate changes
  - Inline add/edit forms for balance entries (both balance and rate)
- Month/year picker for adding new balance entries with both balance and rate fields
- Visual progress indicator showing paydown percentage
- Back button to return to loans list

### Responsive Design

- Modal adapts to mobile screens
- Loan list scrollable on small screens
- Touch-friendly buttons and inputs

## Performance Considerations

- Index on `loan_id` for fast balance lookups
- Index on `year, month` for monthly queries
- Eager load current balances when fetching loans
- Cache loan data in frontend state
- Debounce balance entry updates

## Security Considerations

- Validate all input on backend
- Sanitize user input (loan names, notes)
- Use parameterized queries to prevent SQL injection
- Enforce foreign key constraints
- Validate numeric ranges (balance >= 0)

## Future Enhancements

- Loan payment tracking (separate from balance updates)
- Interest calculations based on rate and balance
- Loan payoff projections and amortization schedules
- Export loan data to CSV
- Loan categories (mortgage, car loan, personal loan)
- Graphical chart visualization of loan paydown over time
- Integration with expense tracking (link payments to expenses)
- Payment reminders and due date tracking
