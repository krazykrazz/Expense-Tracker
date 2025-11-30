# Design Document: Investment Tracking

## Overview

The Investment Tracking feature adds portfolio monitoring capabilities to the expense tracker application. Users can manage multiple investments (TFSA and RRSP accounts), record monthly value updates, and view performance over time with visual indicators and charts. The feature integrates seamlessly into the existing monthly summary view, displaying investment information alongside financial data.

## Architecture

The feature follows the existing layered architecture pattern:

```
Controller → Service → Repository → Database
```

### Component Flow

1. **Frontend**: `SummaryPanel.jsx` displays investment data; new `InvestmentsModal.jsx` manages investment CRUD operations
2. **API Routes**: RESTful endpoints under `/api/investments` and `/api/investment-values`
3. **Controller**: Handles HTTP requests, validates input, returns responses
4. **Service**: Business logic, validation, orchestration
5. **Repository**: Data access layer for database operations
6. **Database**: Two new SQLite tables for investments and value entries

## Components and Interfaces

### Database Schema

#### investments Table

```sql
CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
  initial_value REAL NOT NULL CHECK(initial_value >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type);
```

#### investment_values Table

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

CREATE INDEX IF NOT EXISTS idx_investment_values_investment_id ON investment_values(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_values_year_month ON investment_values(year, month);
```

### Backend API Endpoints

#### Investment Management

- `GET /api/investments` - Get all investments with current values
- `POST /api/investments` - Create a new investment
- `PUT /api/investments/:id` - Update investment details
- `DELETE /api/investments/:id` - Delete an investment (cascades to value entries)

#### Value Management

- `GET /api/investment-values/:investmentId` - Get all value entries for an investment
- `GET /api/investment-values/:investmentId/:year/:month` - Get specific value entry
- `POST /api/investment-values` - Create or update a value entry
- `PUT /api/investment-values/:id` - Update a value entry
- `DELETE /api/investment-values/:id` - Delete a value entry

#### Summary Integration

- `GET /api/summary?year=X&month=Y` - Enhanced to include investment data

### Repository Layer

**investmentRepository.js**

```javascript
class InvestmentRepository {
  async create(investment)
  async findAll()
  async findById(id)
  async update(id, investment)
  async delete(id)
  async getCurrentValue(investmentId)
  async getAllWithCurrentValues()
}
```

**investmentValueRepository.js**

```javascript
class InvestmentValueRepository {
  async create(valueEntry)
  async findByInvestment(investmentId)
  async findByInvestmentAndMonth(investmentId, year, month)
  async update(id, valueEntry)
  async delete(id)
  async upsert(valueEntry) // Create or update if exists
  async getValueHistory(investmentId)
}
```

### Service Layer

**investmentService.js**

- Validates investment data (name, type, initial_value)
- Enforces business rules (value >= 0, type in ['TFSA', 'RRSP'])
- Orchestrates repository calls
- Calculates derived values (total portfolio value, current value)

**investmentValueService.js**

- Validates value entries (year, month, value)
- Enforces business rules (value >= 0)
- Enforces one value entry per investment per month
- Calculates value changes from previous month
- Calculates percentage changes
- Handles upsert logic for monthly updates

### Controller Layer

**investmentController.js**

- HTTP request/response handling
- Input validation and error responses
- Calls service layer methods
- Returns appropriate status codes (200, 201, 400, 404, 500)

**investmentValueController.js**

- Similar pattern to investmentController
- Handles value-specific operations

### Frontend Components

#### Enhanced SummaryPanel.jsx

Add a new "Investments" section at the bottom of the monthly summary:

```jsx
<div className="investments-section">
  <h3>Investments</h3>
  <div className="investments-list">
    {investments.map(investment => (
      <div key={investment.id} className="investment-item">
        <span className="investment-name">{investment.name} ({investment.type})</span>
        <span className="investment-value">${formatAmount(investment.currentValue)}</span>
      </div>
    ))}
  </div>
  <div className="investments-total">
    <span className="investments-label">Total Investment Value:</span>
    <span className="investments-value">${formatAmount(totalInvestments)}</span>
  </div>
  <button className="view-investments-button" onClick={handleOpenInvestmentsModal}>
    👁️ View/Edit
  </button>
</div>
```

#### New InvestmentsModal.jsx

Modal component for managing investments and value entries:

- **Investment List View**: Display all investments with current values
- **Add/Edit Investment Form**: Name, type (TFSA/RRSP), initial value
- **View Button**: Opens detailed investment view for selected investment

#### New InvestmentDetailView.jsx

Detailed view component for individual investment (opened from InvestmentsModal):

- **Investment Summary Section**: 
  - Investment name and type
  - Initial value
  - Current value
  - Total change (current - initial)
  - Percentage change
- **Line Graph**: Visual chart showing value over time
- **Value History Timeline**: 
  - Chronological list of all monthly value entries
  - Display month/year, value, change from previous month, percentage change
  - Arrow indicators (▲ for increase, ▼ for decrease)
  - Color coding (green for increases, red for decreases)
  - Add/Edit value entry inline
- **Actions**:
  - Edit investment details button
  - Add new value entry button
  - Delete value entry buttons

#### New investmentApi.js

Frontend API service for investment operations:

```javascript
export const investmentApi = {
  getAllInvestments: async () => { ... },
  createInvestment: async (investmentData) => { ... },
  updateInvestment: async (id, investmentData) => { ... },
  deleteInvestment: async (id) => { ... },
  
  getValueHistory: async (investmentId) => { ... },
  createOrUpdateValue: async (valueData) => { ... },
  deleteValue: async (id) => { ... }
};
```

## Data Models

### Investment Object

```javascript
{
  id: number,
  name: string,
  type: string, // 'TFSA' or 'RRSP'
  initial_value: number,
  created_at: string,
  updated_at: string,
  currentValue: number // Calculated field - most recent value
}
```

### Value Entry Object

```javascript
{
  id: number,
  investment_id: number,
  year: number,
  month: number, // 1-12
  value: number, // Current value at end of month
  created_at: string,
  updated_at: string,
  valueChange: number, // Calculated: difference from previous month
  percentageChange: number // Calculated: (valueChange / previousValue) * 100
}
```

### Summary Response Enhancement

```javascript
{
  // ... existing summary fields
  investments: [
    {
      id: number,
      name: string,
      type: string,
      currentValue: number
    }
  ],
  totalInvestmentValue: number
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After reviewing all testable properties from the prework, I've identified the following consolidations:

- Properties 1.1 and 5.1 both test investment creation and persistence - can be combined
- Properties 2.1 and 5.2 both test value entry creation and persistence - can be combined
- Properties 3.3 and 3.5 both test current value retrieval logic - can be combined
- Properties 3.4 and 6.1 both test total portfolio value calculation - duplicate, keep one
- Properties 4.1 and 2.6 both test chronological sorting - can be combined
- Properties 1.4 and 4.7 test deletion at different levels but are distinct
- Properties 2.4 and 2.5 test related calculations but are distinct (absolute vs percentage)

### Correctness Properties

Property 1: Investment creation and persistence
*For any* valid investment data (name, type in ['TFSA', 'RRSP'], initial_value >= 0), creating an investment should result in a stored record that can be retrieved with all fields intact
**Validates: Requirements 1.1, 5.1**

Property 2: Investment type validation
*For any* investment type string, the system should accept only 'TFSA' and 'RRSP' and reject all other values
**Validates: Requirements 1.2**

Property 3: Investment update persistence
*For any* existing investment and valid update data, updating the investment should result in the changes being persisted and retrievable
**Validates: Requirements 1.3**

Property 4: Investment deletion
*For any* existing investment, deleting it should result in the investment no longer being retrievable
**Validates: Requirements 1.4**

Property 5: Investment list retrieval
*For any* set of created investments, querying all investments should return all created investments with their current values
**Validates: Requirements 1.5**

Property 6: Value entry creation and persistence
*For any* valid value entry data (investment_id, year, month, value >= 0), creating a value entry should result in a stored record that can be retrieved with all fields intact
**Validates: Requirements 2.1, 5.2**

Property 7: Value entry uniqueness constraint
*For any* investment and month/year combination, attempting to create a second value entry should update the existing entry rather than creating a duplicate
**Validates: Requirements 2.2, 2.3**

Property 8: Value change calculation
*For any* sequence of value entries for an investment, the calculated value change for each entry should equal the difference between its value and the previous month's value
**Validates: Requirements 2.4**

Property 9: Percentage change calculation
*For any* sequence of value entries for an investment, the calculated percentage change should equal ((current value - previous value) / previous value) * 100
**Validates: Requirements 2.5**

Property 10: Value entry chronological sorting
*For any* set of value entries for an investment, retrieving the value history should return entries sorted by year and month with most recent first
**Validates: Requirements 2.6, 4.1**

Property 11: Current value retrieval
*For any* investment, the current value should be the value from the most recent value entry, or the initial_value if no value entries exist
**Validates: Requirements 3.3, 3.5**

Property 12: Total portfolio value calculation
*For any* set of investments, the total portfolio value should equal the sum of all current values
**Validates: Requirements 3.4, 6.1**

Property 13: Currency formatting
*For any* numeric value, formatting as currency should result in a string with exactly two decimal places
**Validates: Requirements 3.6**

Property 14: Value history structure
*For any* value entry in a history response, it should contain month, year, value, valueChange, and percentageChange fields
**Validates: Requirements 4.2**

Property 15: Change indicator logic
*For any* value change, the indicator should be up arrow (▲) when change > 0, down arrow (▼) when change < 0, and neutral when change = 0
**Validates: Requirements 4.3**

Property 16: Color coding logic
*For any* value change, the color should be green when change > 0, red when change < 0, and neutral when change = 0
**Validates: Requirements 4.4**

Property 17: Value entry update persistence
*For any* existing value entry and valid update data, updating the value entry should result in the changes being persisted and retrievable
**Validates: Requirements 4.6**

Property 18: Value entry deletion
*For any* existing value entry, deleting it should result in the value entry no longer being retrievable
**Validates: Requirements 4.7**

Property 19: Referential integrity cascade
*For any* investment with value entries, deleting the investment should also delete all associated value entries
**Validates: Requirements 5.5**

## Error Handling

### Validation Errors (400)

- Missing required fields for investment: name, type, initial_value
- Missing required fields for value entry: investment_id, year, month, value
- Invalid data types or formats
- Negative initial_value or value
- Invalid type (not 'TFSA' or 'RRSP')
- Invalid month (not 1-12)
- Name exceeds 100 characters

### Not Found Errors (404)

- Investment ID does not exist
- Value entry not found

### Conflict Errors (409)

- Duplicate value entry for same investment/month (handled via upsert)

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

### Property-Based Testing

The design specifies 19 correctness properties that must be validated using property-based testing. We will use `fast-check` for JavaScript property-based testing.

**Property-based testing requirements**:
- Each property test should run a minimum of 100 iterations
- Each test must be tagged with a comment referencing the correctness property
- Tag format: `**Feature: investment-tracking, Property {number}: {property_text}**`
- Properties test universal behaviors across all valid inputs
- Generators should create realistic test data within valid ranges

**Example property test structure**:

```javascript
// **Feature: investment-tracking, Property 1: Investment creation and persistence**
test('Property 1: Investment creation and persistence', async () => {
  await fc.assert(
    fc.asyncProperty(
      investmentGenerator(), // Generates random valid investment data
      async (investmentData) => {
        const created = await investmentService.createInvestment(investmentData);
        const retrieved = await investmentService.getInvestmentById(created.id);
        
        expect(retrieved.name).toBe(investmentData.name);
        expect(retrieved.type).toBe(investmentData.type);
        expect(retrieved.initial_value).toBe(investmentData.initial_value);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing

Unit tests complement property tests by covering:
- Specific edge cases (empty strings, boundary values)
- Error conditions and validation
- Integration points between layers
- API endpoint responses

**Unit testing focus areas**:
- Repository CRUD operations
- Service validation logic
- Controller request/response handling
- Calculation functions (changes, percentages)

### Integration Testing

- Test full flow: Create investment → Add value entries → View in summary
- Test cascade delete: Delete investment removes all value entries
- Test upsert: Adding duplicate month/year updates existing entry
- Test summary integration: Investments appear in monthly summary

### Manual Testing Scenarios

1. Create multiple investments (TFSA and RRSP) and verify display in summary
2. Add value entries for different months
3. Verify value history shows correct changes with arrows and colors
4. Delete investment and verify cascade to value entries
5. Test with no investments (empty state)
6. Test with investments but no value entries (shows initial value)
7. Verify line graph displays correctly

## Database Migration

Add migration script `backend/database/migrations.js`:

```javascript
// Add investments and investment_values tables
// Add indexes for performance
// Include in database initialization
```

Update `backend/database/db.js` to include new tables in initialization.

## UI/UX Considerations

### Investments Section in Summary Panel

- Display below the loans section (or balance sheet if no loans)
- Show all investments with current values
- Use consistent styling with existing summary sections
- Display total investment value prominently
- If no investments exist, show empty state message or hide section

### Investments Modal

- Simple list view showing all investments
- Each investment row displays: name, type, current value, and "View" button
- Click "View" button to open detailed investment view
- Add new investment button at top
- Confirmation dialog for delete operations

### Investment Detail View

- Full-screen or large modal overlay
- Header shows investment name and type with edit button
- Summary card displays:
  - Initial Value: $X,XXX.XX
  - Current Value: $X,XXX.XX
  - Total Change: $X,XXX.XX (calculated)
  - Percentage Change: X.XX%
- Line graph showing value over time
- Value history table/timeline:
  - Columns: Month/Year, Value, Change, % Change, Actions
  - Sorted chronologically (most recent first)
  - Arrow indicators: ▲ for increases, ▼ for decreases
  - Color coding: green for increases, red for decreases
  - Inline add/edit forms for value entries
- Month/year picker for adding new value entries
- Back button to return to investments list

### Responsive Design

- Modal adapts to mobile screens
- Investment list scrollable on small screens
- Touch-friendly buttons and inputs
- Chart responsive to screen size

## Performance Considerations

- Index on `investment_id` for fast value lookups
- Index on `year, month` for monthly queries
- Eager load current values when fetching investments
- Cache investment data in frontend state
- Debounce value entry updates

## Security Considerations

- Validate all input on backend
- Sanitize user input (investment names)
- Use parameterized queries to prevent SQL injection
- Enforce foreign key constraints
- Validate numeric ranges (value >= 0)

## Future Enhancements

- Additional investment types (FHSA, Non-Registered, etc.)
- Contribution tracking (separate from value updates)
- Return on investment calculations
- Investment allocation pie charts
- Export investment data to CSV
- Investment goals and targets
- Comparison between TFSA and RRSP performance
- Integration with expense tracking (link contributions to expenses)
- Dividend/interest income tracking
