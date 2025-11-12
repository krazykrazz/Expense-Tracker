# Design Document

## Overview

This feature enables users to configure multiple fixed expense items per month, similar to how income sources are managed. Users will be able to define named fixed expenses (e.g., "Rent", "Insurance", "Netflix") for each month, with the total fixed expenses displayed as a separate line in the monthly summary. The implementation includes a modal-based UI for managing fixed expenses and a carry-forward feature to copy items from the previous month.

## Architecture

The solution follows the existing layered architecture pattern:

**Frontend Modal Component → Backend Controller → Service Layer → Repository Layer → Database**

### Key Components

1. **Database Layer**: New `fixed_expenses` table to store individual fixed expense entries
2. **Repository Layer**: New `FixedExpenseRepository` for data access operations
3. **Service Layer**: New `FixedExpenseService` for business logic and validation
4. **Controller Layer**: New `FixedExpenseController` for HTTP request handling
5. **Frontend Component**: New `FixedExpensesModal` React component
6. **Integration**: Update `SummaryPanel` component to display fixed expenses and launch the modal

## Components and Interfaces

### Database Schema

#### New Table: fixed_expenses

```sql
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_year_month ON fixed_expenses(year, month)
```

### Backend Components

#### FixedExpenseRepository

**File**: `backend/repositories/fixedExpenseRepository.js`

```javascript
class FixedExpenseRepository {
  /**
   * Get all fixed expense items for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of fixed expense objects
   */
  async getFixedExpenses(year, month)

  /**
   * Get total fixed expenses (sum of all items)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<number>} Total fixed expenses amount
   */
  async getTotalFixedExpenses(year, month)

  /**
   * Create a new fixed expense item
   * @param {Object} fixedExpense - { year, month, name, amount }
   * @returns {Promise<Object>} Created fixed expense with ID
   */
  async createFixedExpense(fixedExpense)

  /**
   * Update a fixed expense item by ID
   * @param {number} id - Fixed expense ID
   * @param {Object} updates - { name, amount }
   * @returns {Promise<Object|null>} Updated fixed expense or null
   */
  async updateFixedExpense(id, updates)

  /**
   * Delete a fixed expense item by ID
   * @param {number} id - Fixed expense ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteFixedExpense(id)

  /**
   * Copy all fixed expenses from one month to another
   * @param {number} fromYear - Source year
   * @param {number} fromMonth - Source month (1-12)
   * @param {number} toYear - Target year
   * @param {number} toMonth - Target month (1-12)
   * @returns {Promise<Array>} Array of created fixed expense objects
   */
  async copyFixedExpenses(fromYear, fromMonth, toYear, toMonth)
}
```

#### FixedExpenseService

**File**: `backend/services/fixedExpenseService.js`

```javascript
class FixedExpenseService {
  /**
   * Validate fixed expense data
   * @param {Object} fixedExpense - Fixed expense data
   * @throws {Error} If validation fails
   */
  validateFixedExpense(fixedExpense)

  /**
   * Get all fixed expenses for a month with total
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} { items: Array, total: number }
   */
  async getMonthlyFixedExpenses(year, month)

  /**
   * Create a new fixed expense item
   * @param {Object} data - { year, month, name, amount }
   * @returns {Promise<Object>} Created fixed expense
   */
  async createFixedExpense(data)

  /**
   * Update a fixed expense item
   * @param {number} id - Fixed expense ID
   * @param {Object} data - { name, amount }
   * @returns {Promise<Object|null>} Updated fixed expense
   */
  async updateFixedExpense(id, data)

  /**
   * Delete a fixed expense item
   * @param {number} id - Fixed expense ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteFixedExpense(id)

  /**
   * Carry forward fixed expenses from previous month
   * @param {number} year - Target year
   * @param {number} month - Target month (1-12)
   * @returns {Promise<Object>} { items: Array, count: number }
   */
  async carryForwardFixedExpenses(year, month)
}
```

**Validation Rules:**
- Name: Required, non-empty string, max 100 characters
- Amount: Required, non-negative number, max 2 decimal places
- Year: Required, valid integer
- Month: Required, integer between 1-12

**Carry Forward Logic:**
- Calculate previous month (handle year boundary: Jan → Dec of previous year)
- Fetch all fixed expenses from previous month
- Create new entries for current month with same name and amount
- Return count of items carried forward

#### FixedExpenseController

**File**: `backend/controllers/fixedExpenseController.js`

```javascript
/**
 * GET /api/fixed-expenses/:year/:month
 * Get all fixed expense items for a specific month
 */
async getMonthlyFixedExpenses(req, res)

/**
 * POST /api/fixed-expenses
 * Create a new fixed expense item
 * Body: { year, month, name, amount }
 */
async createFixedExpense(req, res)

/**
 * PUT /api/fixed-expenses/:id
 * Update a fixed expense item
 * Body: { name, amount }
 */
async updateFixedExpense(req, res)

/**
 * DELETE /api/fixed-expenses/:id
 * Delete a fixed expense item
 */
async deleteFixedExpense(req, res)

/**
 * POST /api/fixed-expenses/carry-forward
 * Carry forward fixed expenses from previous month
 * Body: { year, month }
 */
async carryForwardFixedExpenses(req, res)
```

#### Routes

**File**: `backend/routes/fixedExpenseRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const fixedExpenseController = require('../controllers/fixedExpenseController');

router.get('/:year/:month', fixedExpenseController.getMonthlyFixedExpenses);
router.post('/', fixedExpenseController.createFixedExpense);
router.put('/:id', fixedExpenseController.updateFixedExpense);
router.delete('/:id', fixedExpenseController.deleteFixedExpense);
router.post('/carry-forward', fixedExpenseController.carryForwardFixedExpenses);

module.exports = router;
```

Register in `server.js`:
```javascript
app.use('/api/fixed-expenses', fixedExpenseRoutes);
```

### Frontend Components

#### FixedExpensesModal Component

**File**: `frontend/src/components/FixedExpensesModal.jsx`

**Props:**
- `isOpen` (boolean): Controls modal visibility
- `onClose` (function): Callback to close modal
- `year` (number): Selected year
- `month` (number): Selected month (1-12)
- `onUpdate` (function): Callback when fixed expenses are modified

**State:**
- `fixedExpenses` (array): List of fixed expense items for the month
- `totalFixed` (number): Calculated total
- `isAdding` (boolean): Whether add form is visible
- `newExpenseName` (string): Name input for new item
- `newExpenseAmount` (string): Amount input for new item
- `editingId` (number|null): ID of item being edited
- `editName` (string): Name input for editing
- `editAmount` (string): Amount input for editing
- `isCarryingForward` (boolean): Loading state for carry forward operation

**Key Functions:**
```javascript
// Fetch fixed expenses on mount and when year/month changes
useEffect(() => fetchFixedExpenses(), [year, month])

// Add new fixed expense item
const handleAddExpense = async () => { ... }

// Start editing a fixed expense item
const handleEditExpense = (expense) => { ... }

// Save edited fixed expense item
const handleSaveEdit = async () => { ... }

// Delete fixed expense item with confirmation
const handleDeleteExpense = async (id) => { ... }

// Carry forward from previous month
const handleCarryForward = async () => { ... }

// Calculate total from items
const calculateTotal = (expenses) => { ... }
```

**UI Structure:**
```
Modal Overlay
└── Modal Container
    ├── Header ("Manage Fixed Expenses - [Month] [Year]")
    ├── Carry Forward Button
    ├── Fixed Expense Items List
    │   └── For each item:
    │       ├── Name and Amount (or edit inputs)
    │       ├── Edit Button
    │       └── Delete Button
    ├── Add New Item Form (collapsible)
    │   ├── Name Input
    │   ├── Amount Input
    │   └── Add Button
    ├── Total Display
    └── Close Button
```

**Styling File**: `frontend/src/components/FixedExpensesModal.css`

Key styles:
- Modal overlay with semi-transparent background
- Centered modal container with max-width
- List items with hover effects
- Inline edit mode styling
- Form inputs with validation feedback
- Carry forward button with distinct styling
- Responsive design for mobile

#### SummaryPanel Integration

**File**: `frontend/src/components/SummaryPanel.jsx`

**Changes Required:**

1. Add state for fixed expenses modal:
```javascript
const [showFixedExpensesModal, setShowFixedExpensesModal] = useState(false);

const handleOpenFixedExpensesModal = () => {
  setShowFixedExpensesModal(true);
};

const handleCloseFixedExpensesModal = () => {
  setShowFixedExpensesModal(false);
  // Refresh summary to reflect changes
  onMonthChange(selectedMonth, selectedYear);
};
```

2. Update summary API to include total fixed expenses:
```javascript
// The getSummary endpoint will be updated to include totalFixedExpenses
// Response: { ..., totalFixedExpenses: number }
```

3. Add fixed expenses display in JSX (after Monthly Gross Income, before Total Expenses):
```jsx
<div className="balance-row">
  <span className="balance-label">Total Fixed Expenses:</span>
  <div className="balance-value-container">
    <span className="balance-value negative">${formatAmount(summary.totalFixedExpenses)}</span>
    <button className="view-fixed-expenses-button" onClick={handleOpenFixedExpensesModal}>
      👁️ View/Edit
    </button>
  </div>
</div>

{showFixedExpensesModal && (
  <FixedExpensesModal
    isOpen={showFixedExpensesModal}
    onClose={handleCloseFixedExpensesModal}
    year={selectedYear}
    month={selectedMonth}
    onUpdate={handleCloseFixedExpensesModal}
  />
)}
```

4. Update Total Expenses calculation to include fixed expenses:
```javascript
// Total Expenses = Regular Expenses + Total Fixed Expenses
const totalExpenses = summary.totalExpenses + summary.totalFixedExpenses;
```

#### ExpenseService Integration

**File**: `backend/services/expenseService.js`

Update `getMonthlySummary` method to include fixed expenses:

```javascript
async getMonthlySummary(year, month) {
  // ... existing code ...
  
  // Get total fixed expenses
  const totalFixedExpenses = await fixedExpenseRepository.getTotalFixedExpenses(year, month);
  
  return {
    // ... existing fields ...
    totalFixedExpenses: totalFixedExpenses || 0,
    totalExpenses: totalExpenses + totalFixedExpenses,  // Include in total
    netBalance: monthlyGross - (totalExpenses + totalFixedExpenses)
  };
}
```

### API Integration

**Frontend API Service**

Add to `frontend/src/config.js` or create new service file:

```javascript
// Get fixed expenses for a month
export const getMonthlyFixedExpenses = async (year, month) => {
  const response = await fetch(`${API_BASE_URL}/fixed-expenses/${year}/${month}`);
  if (!response.ok) throw new Error('Failed to fetch fixed expenses');
  return response.json();
};

// Create fixed expense
export const createFixedExpense = async (data) => {
  const response = await fetch(`${API_BASE_URL}/fixed-expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to create fixed expense');
  return response.json();
};

// Update fixed expense
export const updateFixedExpense = async (id, data) => {
  const response = await fetch(`${API_BASE_URL}/fixed-expenses/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to update fixed expense');
  return response.json();
};

// Delete fixed expense
export const deleteFixedExpense = async (id) => {
  const response = await fetch(`${API_BASE_URL}/fixed-expenses/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete fixed expense');
  return response.json();
};

// Carry forward fixed expenses
export const carryForwardFixedExpenses = async (year, month) => {
  const response = await fetch(`${API_BASE_URL}/fixed-expenses/carry-forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, month })
  });
  if (!response.ok) throw new Error('Failed to carry forward fixed expenses');
  return response.json();
};
```

## Data Models

### Fixed Expense Object

```javascript
{
  id: number,              // Primary key
  year: number,            // Year (e.g., 2025)
  month: number,           // Month 1-12
  name: string,            // Fixed expense name (e.g., "Rent")
  amount: number,          // Expense amount (non-negative, 2 decimals)
  created_at: string,      // ISO timestamp
  updated_at: string       // ISO timestamp
}
```

### Monthly Fixed Expenses Response

```javascript
{
  items: [                 // Array of fixed expense objects
    {
      id: 1,
      year: 2025,
      month: 11,
      name: "Rent",
      amount: 1500.00,
      created_at: "2025-11-01T00:00:00Z",
      updated_at: "2025-11-01T00:00:00Z"
    },
    {
      id: 2,
      year: 2025,
      month: 11,
      name: "Insurance",
      amount: 200.00,
      created_at: "2025-11-05T00:00:00Z",
      updated_at: "2025-11-05T00:00:00Z"
    }
  ],
  total: 1700.00          // Sum of all item amounts
}
```

### Carry Forward Response

```javascript
{
  items: [                 // Array of newly created fixed expense objects
    { id: 3, year: 2025, month: 12, name: "Rent", amount: 1500.00, ... },
    { id: 4, year: 2025, month: 12, name: "Insurance", amount: 200.00, ... }
  ],
  count: 2                // Number of items carried forward
}
```

## Error Handling

### Backend Error Responses

All errors return JSON with consistent structure:
```javascript
{
  error: string  // Human-readable error message
}
```

**HTTP Status Codes:**
- 200: Success
- 201: Created
- 400: Bad Request (validation errors)
- 404: Not Found
- 500: Internal Server Error

### Frontend Error Handling

- Display error messages in modal using alert or inline error display
- Show loading states during API calls
- Disable buttons during operations to prevent double-submission
- Validate inputs client-side before API calls
- Handle network errors gracefully with retry options

### Validation Error Messages

- "Name is required"
- "Name must not exceed 100 characters"
- "Amount is required"
- "Amount must be a non-negative number"
- "Amount must have at most 2 decimal places"
- "Year and month are required"
- "Month must be between 1 and 12"
- "No fixed expenses found in previous month to carry forward"

## Testing Strategy

### Backend Testing

**Manual Testing:**
1. Test GET endpoint with various year/month combinations
2. Test POST with valid and invalid data
3. Test PUT with existing and non-existing IDs
4. Test DELETE with existing and non-existing IDs
5. Test carry-forward across month boundaries (including year boundary)
6. Verify database constraints (non-negative amounts)
7. Test concurrent operations

### Frontend Testing

**Manual Testing:**
1. Open modal from SummaryPanel
2. Add fixed expense items with various names and amounts
3. Edit existing fixed expense items
4. Delete fixed expense items (verify confirmation)
5. Verify total calculation updates correctly
6. Test carry forward from previous month
7. Test carry forward when no previous month data exists
8. Test carry forward when current month already has items
9. Test validation (empty name, negative amount, invalid format)
10. Test modal close and reopen (state persistence)
11. Verify SummaryPanel updates after modal changes
12. Test responsive design on mobile devices

### Integration Testing

1. Create fixed expenses and verify they appear in SummaryPanel
2. Verify total fixed expenses in summary matches sum of items
3. Verify total expenses includes both regular and fixed expenses
4. Test navigation between months (modal should show correct data)
5. Verify database persistence across server restarts
6. Test carry forward from December to January (year boundary)

### Edge Cases

- Month with no fixed expense items (should show $0.00)
- Very large amounts (test number precision)
- Special characters in fixed expense names
- Rapid add/edit/delete operations
- Browser refresh during modal operation
- Multiple browser tabs editing same month
- Carry forward when previous month is empty
- Carry forward when current month already has items

## Implementation Plan

### Phase 1: Database Setup

1. Create `fixed_expenses` table in database initialization
2. Create indexes for performance

### Phase 2: Backend Implementation

1. Implement FixedExpenseRepository
2. Implement FixedExpenseService (including carry-forward logic)
3. Implement FixedExpenseController
4. Register routes in server.js
5. Update ExpenseService.getMonthlySummary to include fixed expenses

### Phase 3: Frontend Implementation

1. Create FixedExpensesModal component
2. Create FixedExpensesModal.css
3. Update SummaryPanel to display fixed expenses and launch modal
4. Add API service functions
5. Test integration

### Phase 4: Testing & Deployment

1. Manual testing of all features
2. Test carry-forward functionality thoroughly
3. Deploy to production
4. Monitor for issues
