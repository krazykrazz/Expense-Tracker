# Design Document

## Overview

This design adds the "Personal Care" expense category to the expense tracking system. The implementation follows the established pattern used for previous category additions (Clothing, Gifts) and ensures consistency across the entire application stack - from database constraints to frontend UI components.

The change is minimal but requires careful coordination across multiple layers:
- Backend category definitions
- Database schema constraints via migration
- Frontend UI components
- CSV import/export validation
- Testing infrastructure

## Architecture

The application uses a centralized category management approach:

1. **Single Source of Truth**: `backend/utils/categories.js` defines all valid categories
2. **Database Constraints**: SQLite CHECK constraints enforce category validity at the database level
3. **Migration System**: Automatic migrations update constraints when new categories are added
4. **Frontend Synchronization**: Frontend components reference backend category lists or maintain synchronized copies

### Data Flow

```
User Action (Add Expense with Personal Care)
    ↓
Frontend Validation (category dropdown)
    ↓
API Request (POST /api/expenses)
    ↓
Backend Validation (categories.isValid())
    ↓
Database Constraint Check (CHECK constraint)
    ↓
Data Persisted
```

## Components and Interfaces

### Backend Components

#### 1. Category Utility Module (`backend/utils/categories.js`)
- **Purpose**: Central definition of all valid categories
- **Changes**: Add "Personal Care" to CATEGORIES and BUDGETABLE_CATEGORIES arrays
- **Interface**:
  ```javascript
  const CATEGORIES = [
    'Clothing',
    'Dining Out',
    'Entertainment',
    'Gas',
    'Gifts',
    'Groceries',
    'Housing',
    'Insurance',
    'Personal Care',  // NEW
    'Pet Care',
    'Recreation Activities',
    'Subscriptions',
    'Utilities',
    'Vehicle Maintenance',
    'Other',
    'Tax - Donation',
    'Tax - Medical'
  ];
  
  const BUDGETABLE_CATEGORIES = [
    // ... all non-tax categories including Personal Care
  ];
  ```

#### 2. Database Migration Module (`backend/database/migrations.js`)
- **Purpose**: Automatically update database schema on application startup
- **Changes**: Add new migration function `migrateAddPersonalCareCategory()`
- **Migration Steps**:
  1. Check if migration already applied
  2. Create automatic backup
  3. Begin transaction
  4. Recreate expenses table with updated CHECK constraint
  5. Copy all existing data
  6. Recreate budgets table with updated CHECK constraint
  7. Recreate indexes and triggers
  8. Mark migration as applied
  9. Commit transaction

#### 3. CSV Validation Scripts
- **Files**: `validate_csv.py`, `xls_to_csv.py`
- **Changes**: Add "Personal Care" to valid categories list
- **Purpose**: Ensure CSV import/export handles the new category

### Frontend Components

#### 1. Expense Form Component (`frontend/src/components/ExpenseForm.jsx`)
- **Changes**: Category dropdown will automatically include "Personal Care" if it fetches from backend
- **Verification**: Ensure category list is not hardcoded

#### 2. Budget Management Modal (`frontend/src/components/BudgetManagementModal.jsx`)
- **Changes**: Budget category selection will include "Personal Care"
- **Verification**: Ensure category list is not hardcoded

#### 3. Constants File (`frontend/src/utils/constants.js`)
- **Changes**: If categories are defined here, add "Personal Care"
- **Note**: Currently only defines PAYMENT_METHODS, may not need changes

## Data Models

### Expenses Table Schema (After Migration)

```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  place TEXT,
  notes TEXT,
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'Clothing', 'Dining Out', 'Entertainment', 'Gas', 'Gifts',
    'Groceries', 'Housing', 'Insurance', 'Personal Care', 'Pet Care',
    'Recreation Activities', 'Subscriptions', 'Utilities',
    'Vehicle Maintenance', 'Other', 'Tax - Donation', 'Tax - Medical'
  )),
  week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
  method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

### Budgets Table Schema (After Migration)

```sql
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
  category TEXT NOT NULL CHECK(category IN (
    'Clothing', 'Dining Out', 'Entertainment', 'Gas', 'Gifts',
    'Groceries', 'Housing', 'Insurance', 'Personal Care', 'Pet Care',
    'Recreation Activities', 'Subscriptions', 'Utilities',
    'Vehicle Maintenance', 'Other'
  )),
  "limit" REAL NOT NULL CHECK("limit" > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, month, category)
)
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Category validation accepts Personal Care
*For any* expense with category "Personal Care", the validation function `isValid("Personal Care")` should return true
**Validates: Requirements 1.2, 3.3**

### Property 2: Personal Care is budgetable
*For any* budget creation request with category "Personal Care", the validation function `isBudgetable("Personal Care")` should return true
**Validates: Requirements 1.5, 3.2**

### Property 3: Personal Care is not tax-deductible
*For any* expense with category "Personal Care", the function `isTaxDeductible("Personal Care")` should return false
**Validates: Requirements 3.3**

### Property 4: Database constraint accepts Personal Care
*For any* expense record with category "Personal Care", inserting it into the expenses table should succeed without constraint violations
**Validates: Requirements 1.2, 2.3**

### Property 5: Migration preserves existing data
*For any* database state before migration, after running the Personal Care migration, all existing expense records should remain unchanged in count and content
**Validates: Requirements 2.1, 2.2**

### Property 6: CSV import accepts Personal Care
*For any* valid CSV file containing expenses with "Personal Care" category, the import process should successfully create expense records
**Validates: Requirements 4.1, 4.2**

### Property 7: Category list ordering is maintained
*For any* category list retrieval, "Personal Care" should appear in alphabetical order between "Insurance" and "Pet Care"
**Validates: Requirements 1.1, 3.1**

## Error Handling

### Migration Errors

1. **Migration Already Applied**
   - Detection: Check schema_migrations table
   - Action: Skip migration, log message, continue startup
   - User Impact: None

2. **Backup Creation Failure**
   - Detection: File system error during backup
   - Action: Abort migration, throw error, prevent startup
   - User Impact: Application won't start, manual intervention required

3. **Transaction Failure**
   - Detection: Any SQL error during migration
   - Action: Rollback transaction, restore from backup if needed
   - User Impact: Application won't start, database remains in pre-migration state

4. **Constraint Violation During Data Copy**
   - Detection: Existing data violates new constraints (unlikely)
   - Action: Rollback, log specific records, require manual fix
   - User Impact: Migration fails, manual data cleanup required

### Runtime Errors

1. **Invalid Category Submission**
   - Detection: Backend validation before database insert
   - Response: 400 Bad Request with error message
   - User Impact: Clear error message, expense not saved

2. **Frontend-Backend Category Mismatch**
   - Detection: Category accepted by frontend but rejected by backend
   - Prevention: Ensure frontend updates deployed with backend
   - Mitigation: Backend validation catches mismatches

## Testing Strategy

### Unit Tests

1. **Category Validation Tests** (`backend/utils/categories.test.js`)
   - Test `isValid("Personal Care")` returns true
   - Test `isBudgetable("Personal Care")` returns true
   - Test `isTaxDeductible("Personal Care")` returns false
   - Test CATEGORIES array includes "Personal Care"
   - Test BUDGETABLE_CATEGORIES array includes "Personal Care"

2. **Migration Tests** (`backend/database/migrations.test.js`)
   - Test migration creates backup before running
   - Test migration updates expenses table constraint
   - Test migration updates budgets table constraint
   - Test migration preserves existing data
   - Test migration marks itself as applied
   - Test migration skips if already applied

3. **CSV Validation Tests**
   - Test validate_csv.py accepts "Personal Care"
   - Test xls_to_csv.py preserves "Personal Care"

### Property-Based Tests

Property-based testing will use the `fast-check` library for JavaScript tests. Each test will run a minimum of 100 iterations with randomly generated inputs.

1. **Property Test: Category Validation** (`backend/utils/categories.pbt.test.js`)
   - Generate random category strings
   - Verify "Personal Care" always validates as true
   - Verify invalid categories always validate as false
   - **Validates: Property 1, Property 2, Property 3**

2. **Property Test: Database Constraints** (`backend/repositories/expenseRepository.pbt.test.js`)
   - Generate random expense objects with "Personal Care" category
   - Verify all can be inserted successfully
   - Verify constraint violations are caught for invalid categories
   - **Validates: Property 4**

3. **Property Test: Migration Idempotence** (`backend/database/migrations.pbt.test.js`)
   - Run migration multiple times
   - Verify data integrity maintained
   - Verify no duplicate migrations applied
   - **Validates: Property 5**

### Integration Tests

1. **End-to-End Expense Creation**
   - Create expense with "Personal Care" category via API
   - Verify expense is stored correctly
   - Verify expense appears in queries
   - Verify expense appears in summaries

2. **Budget Creation with Personal Care**
   - Create budget for "Personal Care" category
   - Add expenses in that category
   - Verify budget tracking works correctly
   - Verify alerts trigger appropriately

3. **CSV Import/Export**
   - Import CSV with "Personal Care" expenses
   - Verify expenses created correctly
   - Export expenses to CSV
   - Verify "Personal Care" category preserved

### Manual Testing Checklist

1. Start application with existing database
2. Verify migration runs successfully
3. Create new expense with "Personal Care" category
4. Edit existing expense to "Personal Care" category
5. Create budget for "Personal Care"
6. View monthly summary with "Personal Care" expenses
7. View annual summary with "Personal Care" expenses
8. Import CSV with "Personal Care" expenses
9. Export expenses and verify "Personal Care" included
10. Verify budget alerts work for "Personal Care"

## Deployment Considerations

### Version Bump
- Type: MINOR (new feature)
- Rationale: Adding a new category is a new feature, not a breaking change

### Deployment Steps
1. Update backend code (categories.js, migrations.js)
2. Update CSV validation scripts
3. Update frontend code (if categories are hardcoded)
4. Build frontend production bundle
5. Deploy backend and frontend together
6. On first startup, migration runs automatically
7. Verify migration success in logs
8. Test category in production

### Rollback Plan
If issues arise:
1. Stop application
2. Restore database from automatic migration backup
3. Deploy previous version of code
4. Restart application

### Database Backup
- Automatic backup created before migration
- Location: `backend/config/backups/`
- Naming: `expense-tracker-auto-migration-{timestamp}.db`
- Retention: Keep all migration backups

## Performance Considerations

- Migration runs once on first startup after deployment
- Migration time: < 1 second for typical database sizes (< 10,000 records)
- No performance impact on runtime operations
- Category validation is in-memory array lookup (O(n) where n=16 categories)

## Security Considerations

- No new security concerns introduced
- Category validation prevents SQL injection (parameterized queries)
- Database constraints provide defense-in-depth
- No user input directly affects category list

## Future Enhancements

- Consider making categories user-configurable
- Add category icons/colors for better UX
- Add category grouping (e.g., "Personal" group containing "Personal Care", "Clothing")
- Add category-specific analytics and insights
