# Design Document: Credit Card Posted Date

## Overview

This feature adds an optional `posted_date` field to expenses, allowing users to distinguish between when a transaction occurred (transaction date) and when it posts to their credit card statement (posted date). This enables accurate credit card balance calculations for users who pre-log future expenses.

The key design principle is **backward compatibility**: existing expenses with NULL posted_date behave exactly as before, using the transaction date for balance calculations.

## Architecture

The feature follows the existing layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ExpenseForm.jsx                                      │    │
│  │ - Conditional posted_date field (credit cards only)  │    │
│  │ - Validation: posted_date >= date                    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express)                         │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ expenseService  │  │ paymentMethod   │                   │
│  │ - Validation    │  │ Service         │                   │
│  │ - CRUD ops      │  │ - Balance calc  │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database (SQLite)                         │
│  expenses table: + posted_date TEXT (nullable)               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User selects credit card payment method → posted_date field appears
2. User optionally enters posted_date (or leaves blank)
3. Frontend validates: posted_date >= date (if provided)
4. API receives expense with optional posted_date
5. Backend validates and stores posted_date
6. Balance calculation uses `COALESCE(posted_date, date) <= today`

## Components and Interfaces

### Database Migration

**File:** `backend/database/migrations.js`

```javascript
async function migrateAddPostedDate(db) {
  const migrationName = 'add_posted_date_v1';
  
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) return;

  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Add posted_date column (nullable, no default)
      db.run(
        'ALTER TABLE expenses ADD COLUMN posted_date TEXT DEFAULT NULL',
        (err) => {
          if (err) return reject(err);
          
          // Create index for query performance
          db.run(
            'CREATE INDEX IF NOT EXISTS idx_expenses_posted_date ON expenses(posted_date)',
            async (err) => {
              if (err) return reject(err);
              
              await markMigrationApplied(db, migrationName);
              logger.info('Migration completed: add_posted_date_v1');
              resolve();
            }
          );
        }
      );
    });
  });
}
```

### Expense Service Updates

**File:** `backend/services/expenseService.js`

```javascript
// Add to validateExpense method
validatePostedDate(expense) {
  if (expense.posted_date === undefined || expense.posted_date === null) {
    return; // NULL is valid (means "use transaction date")
  }
  
  // Validate format
  if (!this.isValidDate(expense.posted_date)) {
    throw new Error('Posted date must be a valid date in YYYY-MM-DD format');
  }
  
  // Validate posted_date >= date
  if (expense.date && expense.posted_date < expense.date) {
    throw new Error('Posted date cannot be before transaction date');
  }
}
```

### Payment Method Service Updates

**File:** `backend/services/paymentMethodService.js`

```javascript
// Update _calculateDynamicBalance method
async _calculateDynamicBalance(id) {
  const { getDatabase } = require('../database/db');
  const db = await getDatabase();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Use COALESCE(posted_date, date) for effective posting date
  const expenseTotal = await new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) <= ?`,
      [id, todayStr],
      (err, row) => {
        if (err) return reject(err);
        resolve(row?.total || 0);
      }
    );
  });

  // ... rest of balance calculation unchanged
}
```

### Frontend ExpenseForm Updates

**File:** `frontend/src/components/ExpenseForm.jsx`

```jsx
// Add state for posted_date
const [postedDate, setPostedDate] = useState(expense?.posted_date || '');

// Check if selected payment method is credit card
const selectedPaymentMethod = paymentMethods.find(
  pm => pm.id === formData.payment_method_id
);
const isCreditCard = selectedPaymentMethod?.type === 'credit_card';

// Validation function
const validatePostedDate = (posted, transaction) => {
  if (!posted) return true; // Empty is valid
  if (posted < transaction) {
    setMessage({ text: 'Posted date cannot be before transaction date', type: 'error' });
    return false;
  }
  return true;
};

// Render posted_date field conditionally
{isCreditCard && (
  <div className="form-group">
    <label htmlFor="posted_date">Posted Date (optional)</label>
    <input
      type="date"
      id="posted_date"
      name="posted_date"
      value={postedDate}
      onChange={(e) => setPostedDate(e.target.value)}
      placeholder="Uses transaction date if empty"
    />
    <small className="form-hint">
      Leave empty to use transaction date, or set to when this posts to your statement
    </small>
  </div>
)}
```

## Data Models

### Expenses Table Schema

```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                    -- Transaction date (when purchase occurred)
  posted_date TEXT DEFAULT NULL,         -- Posted date (when it posts to statement)
  place TEXT,
  notes TEXT,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  week INTEGER NOT NULL,
  method TEXT NOT NULL,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  insurance_eligible INTEGER DEFAULT 0,
  claim_status TEXT DEFAULT NULL,
  original_cost REAL DEFAULT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for balance calculation queries
CREATE INDEX idx_expenses_posted_date ON expenses(posted_date);
```

### API Request/Response

**Create/Update Expense Request:**
```json
{
  "date": "2025-01-27",
  "posted_date": "2025-01-29",  // Optional, can be null or omitted
  "place": "Amazon",
  "amount": 50.00,
  "type": "Other",
  "payment_method_id": 4
}
```

**Expense Response:**
```json
{
  "id": 123,
  "date": "2025-01-27",
  "posted_date": "2025-01-29",  // null if not set
  "place": "Amazon",
  "amount": 50.00,
  "type": "Other",
  "method": "CIBC MC",
  "payment_method_id": 4,
  "created_at": "2025-01-27T10:30:00Z"
}
```

### Balance Calculation Logic

```
Effective Posting Date = COALESCE(posted_date, date)

Include in Balance IF:
  - payment_method_id matches the credit card
  - Effective Posting Date <= today

Examples:
┌─────────────┬─────────────┬─────────────┬──────────────────┐
│ date        │ posted_date │ Today       │ In Balance?      │
├─────────────┼─────────────┼─────────────┼──────────────────┤
│ 2025-01-25  │ NULL        │ 2025-01-27  │ YES (25 <= 27)   │
│ 2025-01-30  │ NULL        │ 2025-01-27  │ NO  (30 > 27)    │
│ 2025-01-25  │ 2025-01-29  │ 2025-01-27  │ NO  (29 > 27)    │
│ 2025-01-30  │ 2025-01-27  │ 2025-01-27  │ YES (27 <= 27)   │
└─────────────┴─────────────┴─────────────┴──────────────────┘
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Posted Date Field Visibility

*For any* payment method selection in the ExpenseForm, the posted_date field SHALL be visible if and only if the selected payment method has type 'credit_card'.

**Validates: Requirements 1.1, 6.1, 6.4, 6.5**

### Property 2: Balance Calculation Uses Effective Posting Date

*For any* credit card expense with payment_method_id matching a credit card, the balance calculation SHALL use `COALESCE(posted_date, date)` as the effective posting date. When posted_date is NULL, the transaction date is used; when posted_date is provided, it is used instead.

**Validates: Requirements 1.2, 1.3, 2.1, 5.1, 5.3**

### Property 3: Balance Date Filtering

*For any* credit card and any reference date (today), the calculated balance SHALL only include expenses where `COALESCE(posted_date, date) <= today`. Expenses with effective posting date in the future are excluded.

**Validates: Requirements 2.2, 2.3, 2.4**

### Property 4: Non-Balance Views Use Transaction Date

*For any* expense with a posted_date different from its transaction date, all non-balance views (expense lists, monthly reports, budget calculations, analytics) SHALL use the transaction date (not posted_date) for filtering and display.

**Validates: Requirements 2.5**

### Property 5: Migration Data Preservation

*For any* existing expense before migration, after the migration runs, the expense SHALL have posted_date = NULL and all other fields unchanged. The balance calculation for these expenses SHALL produce the same result as before migration.

**Validates: Requirements 3.2, 3.3, 5.2**

### Property 6: API Posted Date Acceptance

*For any* valid expense data with an optional posted_date field (NULL, omitted, or valid date), the create and update API endpoints SHALL accept the request and persist the posted_date value correctly.

**Validates: Requirements 4.1, 4.2**

### Property 7: API Response Includes Posted Date

*For any* expense returned by the API (create, update, get, list), the response SHALL include the posted_date field with its current value (including NULL).

**Validates: Requirements 4.3**

### Property 8: Posted Date Format Validation

*For any* posted_date value that is not NULL and does not match the YYYY-MM-DD format, the API SHALL reject the request with a validation error.

**Validates: Requirements 4.4, 4.7**

### Property 9: Posted Date Ordering Validation

*For any* expense where posted_date is provided and posted_date < date (transaction date), the API SHALL reject the request with the error "Posted date cannot be before transaction date".

**Validates: Requirements 4.5, 4.6**

## Error Handling

### Validation Errors

| Error Condition | Error Message | HTTP Status |
|-----------------|---------------|-------------|
| posted_date format invalid | "Posted date must be a valid date in YYYY-MM-DD format" | 400 |
| posted_date < date | "Posted date cannot be before transaction date" | 400 |

### Database Errors

- Migration failure: Log error, rollback transaction, preserve existing data
- Query failure: Return 500 with generic error message, log details

### Frontend Validation

- Client-side validation prevents submission of invalid posted_date
- Shows inline error message when posted_date < date
- Clears error when user corrects the value

## Testing Strategy

### Unit Tests

Unit tests focus on specific examples and edge cases:

1. **Validation edge cases:**
   - posted_date exactly equal to date (valid)
   - posted_date one day before date (invalid)
   - posted_date with invalid format (invalid)
   - posted_date as empty string vs NULL

2. **Balance calculation edge cases:**
   - Expense with posted_date = today (included)
   - Expense with posted_date = tomorrow (excluded)
   - Expense with NULL posted_date and date = today (included)
   - Expense with NULL posted_date and date = tomorrow (excluded)

3. **Migration edge cases:**
   - Empty database migration
   - Database with existing expenses

### Property-Based Tests

Property-based tests verify universal properties across many generated inputs. Each test runs minimum 100 iterations.

**Testing Framework:** fast-check (JavaScript property-based testing library)

**Property Test Configuration:**
- Minimum 100 iterations per property
- Each test tagged with: `Feature: credit-card-posted-date, Property N: {property_text}`

**Property Tests to Implement:**

1. **Balance COALESCE Property** (Property 2)
   - Generate random expenses with various date/posted_date combinations
   - Verify balance uses COALESCE(posted_date, date) correctly

2. **Balance Date Filtering Property** (Property 3)
   - Generate random expenses and reference dates
   - Verify only expenses with effective date <= reference are included

3. **Posted Date Validation Property** (Property 9)
   - Generate random date pairs where posted_date < date
   - Verify all such requests are rejected

4. **API Round-Trip Property** (Properties 6, 7)
   - Generate random valid expenses with posted_date
   - Create via API, retrieve, verify posted_date matches

5. **Backward Compatibility Property** (Property 5)
   - Generate expenses with NULL posted_date
   - Verify balance calculation matches legacy behavior
