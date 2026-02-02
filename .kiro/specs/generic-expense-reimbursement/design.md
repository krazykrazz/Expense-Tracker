# Design Document: Generic Expense Reimbursement Tracking

## Overview

This feature extends the existing expense reimbursement tracking capability to support generic partial reimbursements on any expense type. The implementation leverages the existing `original_cost` column in the expenses table, which is already used for medical insurance tracking.

The key insight is that the data model already supports this use case:
- `original_cost` = the full amount charged to the payment method
- `amount` = the net out-of-pocket cost after reimbursement

**UX Consistency**: The generic reimbursement UI now matches the medical expense insurance tracking pattern:
- **Amount field** = net out-of-pocket cost (what you actually paid)
- **Original Cost field** (optional) = full amount charged before reimbursement
- **Reimbursement** = calculated as `original_cost - amount`

This ensures a consistent user experience across all expense types.

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ExpenseForm                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Amount Field: $75.00 (net out-of-pocket)                     │   │
│  │ Original Cost Field: $100.00 (optional, charged amount)      │   │
│  │ ─────────────────────────────────────────────────────────── │   │
│  │ Preview: Charged: $100 | Reimbursed: $25 | Net: $75         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ExpenseList                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [💰] Groceries - $75.00 (reimbursed)                        │   │
│  │      Tooltip: Charged $100, Reimbursed $25                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Backend                                      │
├─────────────────────────────────────────────────────────────────────┤
│  ExpenseService                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ createExpense(data):                                         │   │
│  │   // Frontend sends original_cost directly                   │   │
│  │   // Amount is already the net out-of-pocket cost            │   │
│  │   // Validate: amount <= original_cost                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Database                                     │
├─────────────────────────────────────────────────────────────────────┤
│  expenses table                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ id | amount | original_cost | type      | ...               │   │
│  │ 1  | 75.00  | 100.00        | Groceries | ...               │   │
│  │ 2  | 50.00  | NULL          | Gas       | ...               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Existing Infrastructure Reuse

The following existing components are leveraged:

1. **Database Column**: `original_cost` column already exists on the `expenses` table
2. **Credit Card Balance Calculation**: Already uses `COALESCE(original_cost, amount)` pattern
3. **Backend Validation**: `validateInsuranceData` method can be adapted for generic reimbursement validation
4. **UI Patterns**: `InsuranceStatusIndicator` component provides a template for the reimbursement indicator

## Components and Interfaces

### Frontend Components

#### 1. ExpenseForm Modifications

**New State Variables:**
```javascript
// Original cost for generic reimbursement (matches medical expense pattern)
// Initialize from expense.original_cost when editing
const [genericOriginalCost, setGenericOriginalCost] = useState(
  expense?.original_cost?.toString() || ''
);
```

**New UI Section:**
```jsx
{/* Original Cost Section - shown for all expense types except medical with insurance */}
{/* Matches medical expense pattern: Amount = net, Original Cost = charged */}
{showGenericReimbursementUI && (
  <div className="form-group reimbursement-section">
    <label htmlFor="genericOriginalCost">Original Cost $ (optional)</label>
    <input
      type="number"
      id="genericOriginalCost"
      value={genericOriginalCost}
      onChange={handleGenericOriginalCostChange}
      min="0"
      step="0.01"
      placeholder="0.00"
    />
    <small className="form-hint">
      If you were reimbursed, enter the full amount charged here. 
      Amount above is what you paid out-of-pocket.
    </small>
    {genericOriginalCost && parseFloat(genericOriginalCost) > 0 && (
      <div className="reimbursement-preview">
        <span>Charged: ${genericOriginalCost}</span>
        <span>Reimbursed: ${calculateGenericReimbursement().toFixed(2)}</span>
        <span>Net (out-of-pocket): ${formData.amount}</span>
      </div>
    )}
  </div>
)}
```

**Condition for Showing Reimbursement Field:**
```javascript
// Show generic reimbursement UI when:
// 1. NOT a medical expense, OR
// 2. IS a medical expense but insurance tracking is NOT enabled
const showMedicalInsuranceUI = formData.type === 'Tax - Medical' && insuranceEligible;
const showGenericReimbursementUI = !showMedicalInsuranceUI && !isMedicalExpense;
```

#### 2. ReimbursementIndicator Component (New)

A new component to display reimbursement status in the expense list:

```jsx
/**
 * ReimbursementIndicator Component
 * 
 * Displays a visual indicator for expenses that have been partially reimbursed.
 * Shows the breakdown on hover/click.
 */
const ReimbursementIndicator = ({
  originalCost,
  netAmount,
  size = 'small',
  className = ''
}) => {
  // Only show if there's a reimbursement (original_cost is set and differs from amount)
  if (!originalCost || originalCost === netAmount) {
    return null;
  }

  const reimbursement = originalCost - netAmount;
  const tooltipText = `Charged: $${originalCost.toFixed(2)}\nReimbursed: $${reimbursement.toFixed(2)}\nNet: $${netAmount.toFixed(2)}`;

  return (
    <span
      className={`reimbursement-indicator ${size} ${className}`}
      title={tooltipText}
      aria-label={`Reimbursed expense: ${tooltipText.replace(/\n/g, ', ')}`}
    >
      <span className="reimbursement-icon" aria-hidden="true">💰</span>
    </span>
  );
};
```

#### 3. ExpenseList Modifications

Add the ReimbursementIndicator to the expense row:

```jsx
{/* Reimbursement Indicator - for non-medical expenses with original_cost set */}
{expense.type !== 'Tax - Medical' && expense.original_cost && expense.original_cost !== expense.amount && (
  <ReimbursementIndicator
    originalCost={expense.original_cost}
    netAmount={expense.amount}
    size="small"
  />
)}
```

### Backend Modifications

#### ExpenseService Changes

**Validation Method (Updated):**
```javascript
/**
 * Validate that net amount does not exceed original cost
 * @param {number} amount - Net out-of-pocket amount
 * @param {number} originalCost - Original charged amount
 * @throws {Error} If validation fails
 */
validateOriginalCost(amount, originalCost) {
  if (originalCost === undefined || originalCost === null) {
    return; // No original cost is valid
  }

  const amountNum = parseFloat(amount);
  const origCostNum = parseFloat(originalCost);

  if (isNaN(origCostNum) || origCostNum < 0) {
    throw new Error('Original cost must be a non-negative number');
  }

  if (amountNum > origCostNum) {
    throw new Error('Net amount cannot exceed original cost');
  }
}
```

**Modified _processReimbursement (Backward Compatible):**
```javascript
// New pattern: original_cost is sent directly from frontend
// Validate that amount (net) does not exceed original_cost (charged)
if (result.original_cost !== undefined && result.original_cost !== null) {
  const origCostNum = parseFloat(result.original_cost);
  const amountNum = parseFloat(result.amount);
  
  if (!isNaN(origCostNum) && !isNaN(amountNum) && amountNum > origCostNum) {
    throw new Error('Net amount cannot exceed original cost');
  }
}

// Legacy support: if reimbursement field is provided, convert to new pattern
if (expenseData.reimbursement && parseFloat(expenseData.reimbursement) > 0) {
  expense.original_cost = parseFloat(expenseData.amount);
  expense.amount = parseFloat(expenseData.amount) - parseFloat(expenseData.reimbursement);
}
```

### API Contract

**Create/Update Expense Request (New Pattern - Consistent with Medical Expenses):**
```json
{
  "date": "2025-01-27",
  "place": "Costco",
  "amount": "75.00",
  "original_cost": "100.00",
  "type": "Groceries",
  "payment_method_id": 3
}
```

**Legacy API Request (Still Supported for Backward Compatibility):**
```json
{
  "date": "2025-01-27",
  "place": "Costco",
  "amount": "100.00",
  "reimbursement": "25.00",
  "type": "Groceries",
  "payment_method_id": 3
}
```

**Expense Response:**
```json
{
  "id": 123,
  "date": "2025-01-27",
  "place": "Costco",
  "amount": 75.00,
  "original_cost": 100.00,
  "type": "Groceries",
  "payment_method_id": 3,
  "method": "CIBC MC"
}
```

## Data Models

### Existing Database Schema (No Changes Required)

```sql
-- expenses table already has original_cost column
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  place TEXT,
  notes TEXT,
  amount REAL NOT NULL,           -- Net out-of-pocket cost
  original_cost REAL DEFAULT NULL, -- Full charged amount (when reimbursed)
  type TEXT NOT NULL,
  week INTEGER NOT NULL,
  method TEXT NOT NULL,
  payment_method_id INTEGER,
  -- ... other columns
);
```

### Data Interpretation

| Scenario | original_cost | amount | Interpretation |
|----------|---------------|--------|----------------|
| No reimbursement | NULL | 100.00 | Full amount is $100, no reimbursement |
| Partial reimbursement | 100.00 | 75.00 | Charged $100, reimbursed $25, net $75 |
| Full reimbursement | 100.00 | 0.00 | Charged $100, fully reimbursed |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Reimbursement Validation

*For any* expense with a reimbursement amount, the reimbursement SHALL NOT exceed the original expense amount.

**Validates: Requirements 1.3**

### Property 2: Data Storage Consistency

*For any* expense with a non-zero reimbursement, `original_cost` SHALL equal the original amount entered, and `amount` SHALL equal `original_cost - reimbursement`.

**Validates: Requirements 2.1, 2.2**

### Property 3: Credit Card Balance Calculation

*For any* credit card expense, the balance calculation SHALL use `COALESCE(original_cost, amount)` to include the full charged amount.

**Validates: Requirements 3.1, 3.2**

### Property 4: Spending Report Accuracy

*For any* expense summary calculation, the total SHALL use the `amount` field (net cost) rather than `original_cost`.

**Validates: Requirements 4.1**

### Property 5: Reimbursement Indicator Display

*For any* expense where `original_cost` is set and differs from `amount`, the expense list SHALL display a reimbursement indicator.

**Validates: Requirements 5.1**

### Property 6: Edit Round-Trip Consistency

*For any* expense with reimbursement, editing and saving without changes SHALL preserve the same `original_cost` and `amount` values.

**Validates: Requirements 6.1, 6.2**

### Property 7: Backward Compatibility

*For any* expense where `original_cost` is NULL, the system SHALL treat it as having no reimbursement and display no indicator.

**Validates: Requirements 7.1, 7.2**

### Property 8: Medical Expense Exclusion

*For any* medical expense with insurance tracking enabled, the generic reimbursement field SHALL NOT be displayed.

**Validates: Requirements 1.2**

## Error Handling

### Validation Errors

| Error Condition | Error Message | HTTP Status |
|-----------------|---------------|-------------|
| Reimbursement exceeds amount | "Reimbursement cannot exceed the expense amount" | 400 |
| Negative reimbursement | "Reimbursement must be a non-negative number" | 400 |
| Invalid reimbursement format | "Reimbursement must be a valid number" | 400 |

### Edge Cases

1. **Reimbursement equals amount (full reimbursement)**: Valid - results in `amount = 0`
2. **Reimbursement is 0 or empty**: Valid - no reimbursement, `original_cost = NULL`
3. **Editing expense to remove reimbursement**: Set `original_cost = NULL`, keep current `amount`
4. **Medical expense with insurance**: Generic reimbursement UI hidden, insurance UI shown instead

## Testing Strategy

### Unit Tests

1. **ExpenseForm Component Tests**
   - Reimbursement field visibility based on expense type
   - Reimbursement validation (cannot exceed amount)
   - Preview calculation accuracy
   - Edit mode pre-population of reimbursement field

2. **ReimbursementIndicator Component Tests**
   - Renders when original_cost differs from amount
   - Does not render when original_cost is NULL
   - Tooltip content accuracy

3. **ExpenseService Tests**
   - Reimbursement validation logic
   - Data transformation (amount/original_cost calculation)
   - Backward compatibility with existing expenses

### Property-Based Tests

Property-based tests should be configured with minimum 100 iterations per test.

1. **Property Test: Reimbursement Validation**
   - **Feature: generic-expense-reimbursement, Property 1: Reimbursement Validation**
   - Generate random amounts and reimbursements
   - Verify validation rejects reimbursement > amount

2. **Property Test: Data Storage Round-Trip**
   - **Feature: generic-expense-reimbursement, Property 2: Data Storage Consistency**
   - Generate random expense with reimbursement
   - Create expense, retrieve, verify original_cost and amount are correct

3. **Property Test: Edit Round-Trip**
   - **Feature: generic-expense-reimbursement, Property 6: Edit Round-Trip Consistency**
   - Create expense with reimbursement
   - Edit and save without changes
   - Verify values unchanged

### Integration Tests

1. **End-to-End Flow**
   - Create expense with reimbursement
   - Verify expense list shows indicator
   - Edit expense, verify reimbursement pre-populated
   - Remove reimbursement, verify indicator removed

2. **Credit Card Balance Integration**
   - Create credit card expense with reimbursement
   - Verify balance includes full original_cost amount
