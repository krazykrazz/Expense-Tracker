# Design Document

## Overview

This feature enhances the fixed expenses functionality by adding `category` and `payment_type` fields to align with regular expenses. This change enables better expense tracking, reporting, and analysis by allowing users to categorize fixed expenses and track payment methods. The implementation includes database schema migration, backend service updates, and frontend UI enhancements to support the new fields.

## Architecture

The solution follows the existing layered architecture pattern:

**Frontend Component → Backend Controller → Service Layer → Repository Layer → Database**

### Key Changes

1. **Database Layer**: Add `category` and `payment_type` columns to `fixed_expenses` table via migration
2. **Migration System**: Create migration script to add new columns with default values for existing records
3. **Repository Layer**: Update `FixedExpenseRepository` to handle new fields
4. **Service Layer**: Update `FixedExpenseService` to validate new fields and include them in aggregations
5. **Controller Layer**: Update `FixedExpenseController` to accept and return new fields
6. **Frontend Component**: Update `FixedExpensesModal` to include category and payment type dropdowns
7. **Aggregation Logic**: Update expense service to include fixed expenses in category and payment type totals

## Components and Interfaces

### Database Schema Changes

#### Migration: Add Category and Payment Type to Fixed Expenses

**File**: `backend/database/migrations.js`

Add new migration function:

```javascript
/**
 * Migration: Add category and payment_type to fixed_expenses table
 * Adds category and payment_type columns with default values for existing records
 */
async function addCategoryAndPaymentTypeToFixedExpenses(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Check if columns already exist
      db.all("PRAGMA table_info(fixed_expenses)", (err, columns) => {
        if (err) {
          reject(err);
          return;
        }
        
        const hasCategory = columns.some(col => col.name === 'category');
        const hasPaymentType = columns.some(col => col.name === 'payment_type');
        
        if (hasCategory && hasPaymentType) {
          console.log('Fixed expenses already has category and payment_type columns');
          resolve();
          return;
        }
        
        // Add category column with default value 'Other'
        if (!hasCategory) {
          db.run(`
            ALTER TABLE fixed_expenses 
            ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }
            console.log('Added category column to fixed_expenses');
          });
        }
        
        // Add payment_type column with default value 'Debit'
        if (!hasPaymentType) {
          db.run(`
            ALTER TABLE fixed_expenses 
            ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'Debit'
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }
            console.log('Added payment_type column to fixed_expenses');
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  });
}
```

**Migration Registration**:
Add to the migrations array in `runMigrations` function:
```javascript
const migrations = [
  // ... existing migrations ...
  { name: 'addCategoryAndPaymentTypeToFixedExpenses', fn: addCategoryAndPaymentTypeToFixedExpenses }
];
```

**Default Values**:
- `category`: 'Other' (safe default that exists in all category lists)
- `payment_type`: 'Debit' (most common payment method)

#### Updated Fixed Expenses Table Schema

```sql
CREATE TABLE fixed_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  category TEXT NOT NULL DEFAULT 'Other',
  payment_type TEXT NOT NULL DEFAULT 'Debit',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

### Backend Components

#### FixedExpenseRepository Updates

**File**: `backend/repositories/fixedExpenseRepository.js`

**Changes Required**:

1. Update `getFixedExpenses` to include new fields:
```javascript
const sql = `
  SELECT id, year, month, name, amount, category, payment_type, created_at, updated_at
  FROM fixed_expenses
  WHERE year = ? AND month = ?
  ORDER BY name ASC
`;
```

2. Update `createFixedExpense` to accept new fields:
```javascript
const sql = `
  INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type)
  VALUES (?, ?, ?, ?, ?, ?)
`;
const params = [
  fixedExpense.year,
  fixedExpense.month,
  fixedExpense.name,
  fixedExpense.amount,
  fixedExpense.category,
  fixedExpense.payment_type
];
```

3. Update `updateFixedExpense` to handle new fields:
```javascript
const sql = `
  UPDATE fixed_expenses
  SET name = ?, amount = ?, category = ?, payment_type = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`;
const params = [updates.name, updates.amount, updates.category, updates.payment_type, id];
```

4. Add new method to get fixed expenses by category:
```javascript
/**
 * Get fixed expenses for a specific category and month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {string} category - Category name
 * @returns {Promise<Array>} Array of fixed expense objects
 */
async getFixedExpensesByCategory(year, month, category) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, year, month, name, amount, category, payment_type, created_at, updated_at
      FROM fixed_expenses
      WHERE year = ? AND month = ? AND category = ?
      ORDER BY name ASC
    `;
    db.all(sql, [year, month, category], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}
```

5. Add new method to get fixed expenses by payment type:
```javascript
/**
 * Get fixed expenses for a specific payment type and month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {string} paymentType - Payment type
 * @returns {Promise<Array>} Array of fixed expense objects
 */
async getFixedExpensesByPaymentType(year, month, paymentType) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, year, month, name, amount, category, payment_type, created_at, updated_at
      FROM fixed_expenses
      WHERE year = ? AND month = ? AND payment_type = ?
      ORDER BY name ASC
    `;
    db.all(sql, [year, month, paymentType], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}
```

6. Add method to get category totals including fixed expenses:
```javascript
/**
 * Get total amount by category for fixed expenses
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Object with category names as keys and totals as values
 */
async getCategoryTotals(year, month) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT category, SUM(amount) as total
      FROM fixed_expenses
      WHERE year = ? AND month = ?
      GROUP BY category
    `;
    db.all(sql, [year, month], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const totals = {};
        rows.forEach(row => {
          totals[row.category] = row.total;
        });
        resolve(totals);
      }
    });
  });
}
```

7. Add method to get payment type totals including fixed expenses:
```javascript
/**
 * Get total amount by payment type for fixed expenses
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Object with payment types as keys and totals as values
 */
async getPaymentTypeTotals(year, month) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT payment_type, SUM(amount) as total
      FROM fixed_expenses
      WHERE year = ? AND month = ?
      GROUP BY payment_type
    `;
    db.all(sql, [year, month], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const totals = {};
        rows.forEach(row => {
          totals[row.payment_type] = row.total;
        });
        resolve(totals);
      }
    });
  });
}
```

#### FixedExpenseService Updates

**File**: `backend/services/fixedExpenseService.js`

**Changes Required**:

1. Update validation to include new fields:
```javascript
validateFixedExpense(fixedExpense) {
  const { name, amount, category, payment_type } = fixedExpense;
  
  // Existing validations
  if (!name || name.trim().length === 0) {
    throw new Error('Name is required');
  }
  if (name.length > 100) {
    throw new Error('Name must not exceed 100 characters');
  }
  if (amount === undefined || amount === null) {
    throw new Error('Amount is required');
  }
  if (amount < 0) {
    throw new Error('Amount must be a non-negative number');
  }
  
  // New validations
  if (!category || category.trim().length === 0) {
    throw new Error('Category is required');
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error(`Invalid category. Must be one of: ${CATEGORIES.join(', ')}`);
  }
  if (!payment_type || payment_type.trim().length === 0) {
    throw new Error('Payment type is required');
  }
  const validPaymentTypes = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
  if (!validPaymentTypes.includes(payment_type)) {
    throw new Error(`Invalid payment type. Must be one of: ${validPaymentTypes.join(', ')}`);
  }
}
```

2. Update `createFixedExpense` to pass new fields:
```javascript
async createFixedExpense(data) {
  this.validateFixedExpense(data);
  return await fixedExpenseRepository.createFixedExpense(data);
}
```

3. Update `updateFixedExpense` to pass new fields:
```javascript
async updateFixedExpense(id, data) {
  this.validateFixedExpense(data);
  return await fixedExpenseRepository.updateFixedExpense(id, data);
}
```

#### ExpenseService Updates

**File**: `backend/services/expenseService.js`

**Changes Required**:

1. Update `getExpensesByCategory` to include fixed expenses:
```javascript
async getExpensesByCategory(year, month, category) {
  // Get regular expenses
  const regularExpenses = await expenseRepository.getExpensesByCategory(year, month, category);
  
  // Get fixed expenses for this category
  const fixedExpenses = await fixedExpenseRepository.getFixedExpensesByCategory(year, month, category);
  
  // Mark fixed expenses as such
  const markedFixedExpenses = fixedExpenses.map(exp => ({
    ...exp,
    isFixed: true
  }));
  
  return {
    regular: regularExpenses,
    fixed: markedFixedExpenses,
    total: regularExpenses.reduce((sum, e) => sum + e.amount, 0) + 
           fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
  };
}
```

2. Update `getExpensesByPaymentMethod` to include fixed expenses:
```javascript
async getExpensesByPaymentMethod(year, month, method) {
  // Get regular expenses
  const regularExpenses = await expenseRepository.getExpensesByPaymentMethod(year, month, method);
  
  // Get fixed expenses for this payment type
  const fixedExpenses = await fixedExpenseRepository.getFixedExpensesByPaymentType(year, month, method);
  
  // Mark fixed expenses as such
  const markedFixedExpenses = fixedExpenses.map(exp => ({
    ...exp,
    isFixed: true
  }));
  
  return {
    regular: regularExpenses,
    fixed: markedFixedExpenses,
    total: regularExpenses.reduce((sum, e) => sum + e.amount, 0) + 
           fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
  };
}
```

3. Update `getMonthlySummary` to include category and payment type breakdowns with fixed expenses:
```javascript
async getMonthlySummary(year, month) {
  // ... existing code ...
  
  // Get category totals including fixed expenses
  const regularCategoryTotals = await expenseRepository.getCategoryTotals(year, month);
  const fixedCategoryTotals = await fixedExpenseRepository.getCategoryTotals(year, month);
  
  const categoryTotals = {};
  CATEGORIES.forEach(category => {
    categoryTotals[category] = (regularCategoryTotals[category] || 0) + (fixedCategoryTotals[category] || 0);
  });
  
  // Get payment type totals including fixed expenses
  const regularPaymentTotals = await expenseRepository.getPaymentTypeTotals(year, month);
  const fixedPaymentTotals = await fixedExpenseRepository.getPaymentTypeTotals(year, month);
  
  const paymentTypeTotals = {};
  const validPaymentTypes = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
  validPaymentTypes.forEach(type => {
    paymentTypeTotals[type] = (regularPaymentTotals[type] || 0) + (fixedPaymentTotals[type] || 0);
  });
  
  return {
    // ... existing fields ...
    categoryTotals,
    paymentTypeTotals
  };
}
```

### Frontend Components

#### FixedExpensesModal Updates

**File**: `frontend/src/components/FixedExpensesModal.jsx`

**Changes Required**:

1. Add state for new fields:
```javascript
const [newExpenseCategory, setNewExpenseCategory] = useState('');
const [newExpensePaymentType, setNewExpensePaymentType] = useState('');
const [editCategory, setEditCategory] = useState('');
const [editPaymentType, setEditPaymentType] = useState('');
```

2. Import categories and payment types:
```javascript
import { CATEGORIES, PAYMENT_METHODS } from '../utils/constants';
```

3. Update add form to include dropdowns:
```jsx
<div className="add-form">
  <input
    type="text"
    placeholder="Name"
    value={newExpenseName}
    onChange={(e) => setNewExpenseName(e.target.value)}
  />
  <select
    value={newExpenseCategory}
    onChange={(e) => setNewExpenseCategory(e.target.value)}
  >
    <option value="">Select Category</option>
    {CATEGORIES.map(cat => (
      <option key={cat} value={cat}>{cat}</option>
    ))}
  </select>
  <select
    value={newExpensePaymentType}
    onChange={(e) => setNewExpensePaymentType(e.target.value)}
  >
    <option value="">Select Payment Type</option>
    {PAYMENT_METHODS.map(method => (
      <option key={method} value={method}>{method}</option>
    ))}
  </select>
  <input
    type="number"
    placeholder="Amount"
    value={newExpenseAmount}
    onChange={(e) => setNewExpenseAmount(e.target.value)}
  />
  <button onClick={handleAddExpense}>Add</button>
</div>
```

4. Update list display to show new fields:
```jsx
<div className="expense-item">
  <div className="expense-details">
    <span className="expense-name">{expense.name}</span>
    <span className="expense-category">{expense.category}</span>
    <span className="expense-payment">{expense.payment_type}</span>
    <span className="expense-amount">${expense.amount.toFixed(2)}</span>
  </div>
  <div className="expense-actions">
    <button onClick={() => handleEditExpense(expense)}>Edit</button>
    <button onClick={() => handleDeleteExpense(expense.id)}>Delete</button>
  </div>
</div>
```

5. Update edit mode to include dropdowns:
```jsx
{editingId === expense.id ? (
  <div className="edit-form">
    <input
      type="text"
      value={editName}
      onChange={(e) => setEditName(e.target.value)}
    />
    <select
      value={editCategory}
      onChange={(e) => setEditCategory(e.target.value)}
    >
      {CATEGORIES.map(cat => (
        <option key={cat} value={cat}>{cat}</option>
      ))}
    </select>
    <select
      value={editPaymentType}
      onChange={(e) => setEditPaymentType(e.target.value)}
    >
      {PAYMENT_METHODS.map(method => (
        <option key={method} value={method}>{method}</option>
      ))}
    </select>
    <input
      type="number"
      value={editAmount}
      onChange={(e) => setEditAmount(e.target.value)}
    />
    <button onClick={handleSaveEdit}>Save</button>
    <button onClick={() => setEditingId(null)}>Cancel</button>
  </div>
) : (
  // ... display mode ...
)}
```

6. Update validation in `handleAddExpense`:
```javascript
const handleAddExpense = async () => {
  if (!newExpenseName.trim()) {
    alert('Please enter a name');
    return;
  }
  if (!newExpenseCategory) {
    alert('Please select a category');
    return;
  }
  if (!newExpensePaymentType) {
    alert('Please select a payment type');
    return;
  }
  if (!newExpenseAmount || parseFloat(newExpenseAmount) < 0) {
    alert('Please enter a valid amount');
    return;
  }
  
  // ... API call with new fields ...
};
```

#### Constants File

**File**: `frontend/src/utils/constants.js`

Add payment methods constant if not already present:
```javascript
export const PAYMENT_METHODS = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
```

#### Styling Updates

**File**: `frontend/src/components/FixedExpensesModal.css`

Add styles for new fields:
```css
.expense-item {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #eee;
}

.expense-name {
  font-weight: 500;
}

.expense-category {
  color: #666;
  font-size: 0.9em;
}

.expense-payment {
  color: #666;
  font-size: 0.9em;
}

.expense-amount {
  text-align: right;
  font-weight: 600;
}

.add-form,
.edit-form {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr auto;
  gap: 10px;
  margin: 15px 0;
}

.add-form select,
.edit-form select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}
```

## Data Models

### Updated Fixed Expense Object

```javascript
{
  id: number,              // Primary key
  year: number,            // Year (e.g., 2025)
  month: number,           // Month 1-12
  name: string,            // Fixed expense name (e.g., "Rent")
  amount: number,          // Expense amount (non-negative, 2 decimals)
  category: string,        // Expense category (e.g., "Housing")
  payment_type: string,    // Payment method (e.g., "Debit")
  created_at: string,      // ISO timestamp
  updated_at: string       // ISO timestamp
}
```

### Category and Payment Type Breakdown Response

```javascript
{
  categoryTotals: {
    "Housing": 1500.00,
    "Utilities": 200.00,
    "Groceries": 450.00,
    // ... other categories
  },
  paymentTypeTotals: {
    "Debit": 800.00,
    "CIBC MC": 1200.00,
    "Cash": 150.00,
    // ... other payment types
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Category validation rejects invalid categories
*For any* fixed expense data with an invalid category value, the validation function should reject it with an appropriate error message
**Validates: Requirements 1.2**

### Property 2: Fixed expense storage round trip preserves category
*For any* valid fixed expense with a category, creating it and then retrieving it should return the same category value
**Validates: Requirements 1.3**

### Property 3: Payment type validation rejects invalid payment types
*For any* fixed expense data with an invalid payment type value, the validation function should reject it with an appropriate error message
**Validates: Requirements 2.2**

### Property 4: Fixed expense storage round trip preserves payment type
*For any* valid fixed expense with a payment type, creating it and then retrieving it should return the same payment type value
**Validates: Requirements 2.3**

### Property 5: Migration preserves existing data
*For any* set of existing fixed expenses, running the migration should preserve all original name, amount, year, and month values
**Validates: Requirements 3.4**

### Property 6: Carry forward copies all fields
*For any* fixed expense in month M, carrying forward to month M+1 should create a new expense with identical name, amount, category, and payment_type values
**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 7: Category totals include fixed expenses
*For any* month with both regular and fixed expenses in category C, the category total for C should equal the sum of regular expense amounts plus fixed expense amounts in that category
**Validates: Requirements 7.1, 7.2**

### Property 8: Payment type totals include fixed expenses
*For any* month with both regular and fixed expenses using payment type P, the payment type total for P should equal the sum of regular expense amounts plus fixed expense amounts using that payment type
**Validates: Requirements 8.1, 8.2**

### Property 9: Adding fixed expense updates category totals
*For any* month and category, adding a fixed expense in that category should increase the category total by exactly the expense amount
**Validates: Requirements 7.5**

### Property 10: Adding fixed expense updates payment type totals
*For any* month and payment type, adding a fixed expense with that payment type should increase the payment type total by exactly the expense amount
**Validates: Requirements 8.5**

### Property 11: Validation requires non-empty category
*For any* fixed expense data with an empty or missing category, the validation function should reject it
**Validates: Requirements 6.1, 6.3**

### Property 12: Validation requires non-empty payment type
*For any* fixed expense data with an empty or missing payment type, the validation function should reject it
**Validates: Requirements 6.2, 6.4**

## Error Handling

### Validation Errors

**New Error Messages**:
- "Category is required"
- "Invalid category. Must be one of: [category list]"
- "Payment type is required"
- "Invalid payment type. Must be one of: [payment type list]"

### Migration Errors

- Log errors but don't fail application startup
- Check for column existence before attempting to add
- Use default values to ensure data integrity

### Frontend Validation

- Validate category and payment type selection before API calls
- Display clear error messages for missing required fields
- Disable submit button until all required fields are filled

## Testing Strategy

### Unit Testing

**Backend Tests**:
1. Test validation with valid and invalid categories
2. Test validation with valid and invalid payment types
3. Test repository CRUD operations with new fields
4. Test carry forward includes new fields
5. Test category totals aggregation
6. Test payment type totals aggregation

**Frontend Tests**:
1. Test dropdown rendering with correct options
2. Test form validation for required fields
3. Test display of new fields in list view
4. Test edit mode includes new fields

### Property-Based Testing

Use fast-check library for JavaScript property-based testing.

**Property Tests**:
1. Property 1: Category validation (generate random strings, verify only valid categories accepted)
2. Property 2: Storage round trip for category (generate valid fixed expenses, verify category preserved)
3. Property 3: Payment type validation (generate random strings, verify only valid payment types accepted)
4. Property 4: Storage round trip for payment type (generate valid fixed expenses, verify payment type preserved)
5. Property 5: Migration data preservation (generate fixed expenses, run migration, verify data intact)
6. Property 6: Carry forward field copying (generate fixed expenses, carry forward, verify all fields copied)
7. Property 7: Category totals aggregation (generate mixed expenses, verify totals include both types)
8. Property 8: Payment type totals aggregation (generate mixed expenses, verify totals include both types)
9. Property 9: Category total updates (add fixed expense, verify category total increases correctly)
10. Property 10: Payment type total updates (add fixed expense, verify payment type total increases correctly)
11. Property 11: Empty category validation (generate expenses with empty categories, verify rejection)
12. Property 12: Empty payment type validation (generate expenses with empty payment types, verify rejection)

### Integration Testing

1. Create fixed expense with category and payment type via API
2. Verify fixed expense appears in category breakdown
3. Verify fixed expense appears in payment type breakdown
4. Test carry forward preserves all fields
5. Test migration on database with existing fixed expenses
6. Verify UI displays and allows editing of new fields

### Edge Cases

- Migration with empty fixed_expenses table
- Migration with large number of existing records
- Carry forward with all possible category/payment type combinations
- Category and payment type totals with zero fixed expenses
- Category and payment type totals with only fixed expenses (no regular expenses)

## Implementation Notes

### Migration Timing

The migration will run automatically when the application starts, triggered by the existing migration system in `backend/database/migrations.js`. This ensures the schema is updated before any code attempts to use the new fields.

### Backward Compatibility

The migration uses default values ('Other' for category, 'Debit' for payment_type) to ensure existing records remain valid. These defaults are safe choices that exist in all category and payment type lists.

### Performance Considerations

- Indexes on `category` and `payment_type` columns are not necessary initially due to small table size
- If performance issues arise with large datasets, consider adding indexes:
  - `CREATE INDEX idx_fixed_expenses_category ON fixed_expenses(category)`
  - `CREATE INDEX idx_fixed_expenses_payment_type ON fixed_expenses(payment_type)`

### UI/UX Considerations

- Use the same dropdown styling as regular expense forms for consistency
- Display category and payment type in a compact format in list view
- Consider color-coding categories for visual distinction
- Ensure mobile responsiveness with new fields
