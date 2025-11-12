# Design Document

## Overview

This feature transforms the monthly gross income system from a single-value model to a multi-source income tracking system. Users will be able to define multiple named income sources (e.g., "Salary", "Freelance", "Investments") for each month, with the total monthly gross calculated as the sum of all sources. The implementation requires database schema changes, new backend API endpoints, and a modal-based UI component for managing income sources.

## Architecture

The solution follows the existing layered architecture pattern:

**Frontend Modal Component → Backend Controller → Service Layer → Repository Layer → Database**

### Key Components

1. **Database Layer**: New `income_sources` table to store individual income entries
2. **Repository Layer**: New `IncomeRepository` for data access operations
3. **Service Layer**: New `IncomeService` for business logic and validation
4. **Controller Layer**: New `IncomeController` for HTTP request handling
5. **Frontend Component**: New `IncomeManagementModal` React component
6. **Integration**: Update `SummaryPanel` component to launch the modal

## Components and Interfaces

### Database Schema

#### New Table: income_sources

```sql
CREATE TABLE IF NOT EXISTS income_sources (
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
CREATE INDEX IF NOT EXISTS idx_income_year_month ON income_sources(year, month)
```

#### Migration Strategy

The existing `monthly_gross` table will be deprecated but retained for backward compatibility. A one-time migration will:
1. Read existing `monthly_gross` records
2. Create corresponding `income_sources` entries with name "Monthly Gross"
3. Keep `monthly_gross` table for rollback capability

### Backend Components

#### IncomeRepository

**File**: `backend/repositories/incomeRepository.js`

```javascript
class IncomeRepository {
  /**
   * Get all income sources for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of income source objects
   */
  async getIncomeSources(year, month)

  /**
   * Get total monthly gross (sum of all sources)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<number>} Total gross amount
   */
  async getTotalMonthlyGross(year, month)

  /**
   * Create a new income source
   * @param {Object} incomeSource - { year, month, name, amount }
   * @returns {Promise<Object>} Created income source with ID
   */
  async createIncomeSource(incomeSource)

  /**
   * Update an income source by ID
   * @param {number} id - Income source ID
   * @param {Object} updates - { name, amount }
   * @returns {Promise<Object|null>} Updated income source or null
   */
  async updateIncomeSource(id, updates)

  /**
   * Delete an income source by ID
   * @param {number} id - Income source ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteIncomeSource(id)
}
```

#### IncomeService

**File**: `backend/services/incomeService.js`

```javascript
class IncomeService {
  /**
   * Validate income source data
   * @param {Object} incomeSource - Income source data
   * @throws {Error} If validation fails
   */
  validateIncomeSource(incomeSource)

  /**
   * Get all income sources for a month with total
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} { sources: Array, total: number }
   */
  async getMonthlyIncome(year, month)

  /**
   * Create a new income source
   * @param {Object} data - { year, month, name, amount }
   * @returns {Promise<Object>} Created income source
   */
  async createIncomeSource(data)

  /**
   * Update an income source
   * @param {number} id - Income source ID
   * @param {Object} data - { name, amount }
   * @returns {Promise<Object|null>} Updated income source
   */
  async updateIncomeSource(id, data)

  /**
   * Delete an income source
   * @param {number} id - Income source ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteIncomeSource(id)
}
```

**Validation Rules:**
- Name: Required, non-empty string, max 100 characters
- Amount: Required, non-negative number, max 2 decimal places
- Year: Required, valid integer
- Month: Required, integer between 1-12

#### IncomeController

**File**: `backend/controllers/incomeController.js`

```javascript
/**
 * GET /api/income/:year/:month
 * Get all income sources for a specific month
 */
async getMonthlyIncome(req, res)

/**
 * POST /api/income
 * Create a new income source
 * Body: { year, month, name, amount }
 */
async createIncomeSource(req, res)

/**
 * PUT /api/income/:id
 * Update an income source
 * Body: { name, amount }
 */
async updateIncomeSource(req, res)

/**
 * DELETE /api/income/:id
 * Delete an income source
 */
async deleteIncomeSource(req, res)
```

#### Routes

**File**: `backend/routes/incomeRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');

router.get('/:year/:month', incomeController.getMonthlyIncome);
router.post('/', incomeController.createIncomeSource);
router.put('/:id', incomeController.updateIncomeSource);
router.delete('/:id', incomeController.deleteIncomeSource);

module.exports = router;
```

Register in `server.js`:
```javascript
app.use('/api/income', incomeRoutes);
```

### Frontend Components

#### IncomeManagementModal Component

**File**: `frontend/src/components/IncomeManagementModal.jsx`

**Props:**
- `isOpen` (boolean): Controls modal visibility
- `onClose` (function): Callback to close modal
- `year` (number): Selected year
- `month` (number): Selected month (1-12)
- `onUpdate` (function): Callback when income sources are modified

**State:**
- `incomeSources` (array): List of income sources for the month
- `totalGross` (number): Calculated total
- `isAdding` (boolean): Whether add form is visible
- `newSourceName` (string): Name input for new source
- `newSourceAmount` (string): Amount input for new source
- `editingId` (number|null): ID of source being edited
- `editName` (string): Name input for editing
- `editAmount` (string): Amount input for editing

**Key Functions:**
```javascript
// Fetch income sources on mount and when year/month changes
useEffect(() => fetchIncomeSources(), [year, month])

// Add new income source
const handleAddSource = async () => { ... }

// Start editing an income source
const handleEditSource = (source) => { ... }

// Save edited income source
const handleSaveEdit = async () => { ... }

// Delete income source with confirmation
const handleDeleteSource = async (id) => { ... }

// Calculate total from sources
const calculateTotal = (sources) => { ... }
```

**UI Structure:**
```
Modal Overlay
└── Modal Container
    ├── Header ("Manage Income - [Month] [Year]")
    ├── Income Sources List
    │   └── For each source:
    │       ├── Name and Amount (or edit inputs)
    │       ├── Edit Button
    │       └── Delete Button
    ├── Add New Source Form (collapsible)
    │   ├── Name Input
    │   ├── Amount Input
    │   └── Add Button
    ├── Total Display
    └── Close Button
```

**Styling File**: `frontend/src/components/IncomeManagementModal.css`

Key styles:
- Modal overlay with semi-transparent background
- Centered modal container with max-width
- List items with hover effects
- Inline edit mode styling
- Form inputs with validation feedback
- Responsive design for mobile

#### SummaryPanel Integration

**File**: `frontend/src/components/SummaryPanel.jsx`

**Changes Required:**

1. Replace inline edit functionality with modal trigger:
```javascript
// Remove: isEditingGross, grossInput, handleEditGross, handleSaveGross, handleCancelEdit

// Add:
const [showIncomeModal, setShowIncomeModal] = useState(false);

const handleOpenIncomeModal = () => {
  setShowIncomeModal(true);
};

const handleCloseIncomeModal = () => {
  setShowIncomeModal(false);
  // Refresh summary to reflect changes
  onMonthChange(selectedMonth, selectedYear);
};
```

2. Update JSX to show view/edit button:
```jsx
<div className="balance-row">
  <span className="balance-label">Monthly Gross Income:</span>
  <div className="balance-value-container">
    <span className="balance-value">${formatAmount(summary.monthlyGross)}</span>
    <button className="view-income-button" onClick={handleOpenIncomeModal}>
      👁️ View/Edit
    </button>
  </div>
</div>

{showIncomeModal && (
  <IncomeManagementModal
    isOpen={showIncomeModal}
    onClose={handleCloseIncomeModal}
    year={selectedYear}
    month={selectedMonth}
    onUpdate={handleCloseIncomeModal}
  />
)}
```

3. Update API call to use new income endpoint (backward compatible):
```javascript
// The existing getSummary endpoint will be updated to calculate
// monthlyGross from income_sources table instead of monthly_gross
```

### API Integration

**Frontend API Service**

Add to `frontend/src/config.js` or create new service file:

```javascript
// Get income sources for a month
export const getMonthlyIncome = async (year, month) => {
  const response = await fetch(`${API_BASE_URL}/income/${year}/${month}`);
  if (!response.ok) throw new Error('Failed to fetch income sources');
  return response.json();
};

// Create income source
export const createIncomeSource = async (data) => {
  const response = await fetch(`${API_BASE_URL}/income`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to create income source');
  return response.json();
};

// Update income source
export const updateIncomeSource = async (id, data) => {
  const response = await fetch(`${API_BASE_URL}/income/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to update income source');
  return response.json();
};

// Delete income source
export const deleteIncomeSource = async (id) => {
  const response = await fetch(`${API_BASE_URL}/income/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete income source');
  return response.json();
};
```

## Data Models

### Income Source Object

```javascript
{
  id: number,              // Primary key
  year: number,            // Year (e.g., 2025)
  month: number,           // Month 1-12
  name: string,            // Income source name (e.g., "Salary")
  amount: number,          // Income amount (non-negative, 2 decimals)
  created_at: string,      // ISO timestamp
  updated_at: string       // ISO timestamp
}
```

### Monthly Income Response

```javascript
{
  sources: [               // Array of income source objects
    {
      id: 1,
      year: 2025,
      month: 11,
      name: "Salary",
      amount: 5000.00,
      created_at: "2025-11-01T00:00:00Z",
      updated_at: "2025-11-01T00:00:00Z"
    },
    {
      id: 2,
      year: 2025,
      month: 11,
      name: "Freelance",
      amount: 1200.50,
      created_at: "2025-11-05T00:00:00Z",
      updated_at: "2025-11-05T00:00:00Z"
    }
  ],
  total: 6200.50          // Sum of all source amounts
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

## Testing Strategy

### Backend Testing

**Unit Tests** (if implemented):
- Repository methods: CRUD operations
- Service validation logic
- Controller request/response handling

**Manual Testing:**
1. Test GET endpoint with various year/month combinations
2. Test POST with valid and invalid data
3. Test PUT with existing and non-existing IDs
4. Test DELETE with existing and non-existing IDs
5. Verify database constraints (non-negative amounts)
6. Test concurrent operations

### Frontend Testing

**Manual Testing:**
1. Open modal from SummaryPanel
2. Add income sources with various names and amounts
3. Edit existing income sources
4. Delete income sources (verify confirmation)
5. Verify total calculation updates correctly
6. Test validation (empty name, negative amount, invalid format)
7. Test modal close and reopen (state persistence)
8. Verify SummaryPanel updates after modal changes
9. Test responsive design on mobile devices
10. Test keyboard navigation and accessibility

### Integration Testing

1. Create income sources and verify they appear in SummaryPanel
2. Verify monthly gross in summary matches sum of income sources
3. Test navigation between months (modal should show correct data)
4. Verify database persistence across server restarts
5. Test migration from old monthly_gross to new income_sources

### Edge Cases

- Month with no income sources (should show $0.00)
- Very large amounts (test number precision)
- Special characters in income source names
- Rapid add/edit/delete operations
- Browser refresh during modal operation
- Multiple browser tabs editing same month

## Migration Plan

### Phase 1: Database Setup

1. Create `income_sources` table
2. Create indexes
3. Run migration script to convert existing `monthly_gross` data

### Phase 2: Backend Implementation

1. Implement IncomeRepository
2. Implement IncomeService
3. Implement IncomeController
4. Register routes in server.js
5. Update ExpenseRepository.getMonthlyGross to query income_sources

### Phase 3: Frontend Implementation

1. Create IncomeManagementModal component
2. Create IncomeManagementModal.css
3. Update SummaryPanel to use modal
4. Add API service functions
5. Test integration

### Phase 4: Testing & Deployment

1. Manual testing of all features
2. Verify backward compatibility
3. Deploy to production
4. Monitor for issues

## Backward Compatibility

- Keep `monthly_gross` table for rollback capability
- Update `ExpenseRepository.getMonthlyGross()` to query `income_sources` and sum amounts
- Existing API endpoints continue to work (they internally use the new system)
- No breaking changes to frontend components outside of SummaryPanel
