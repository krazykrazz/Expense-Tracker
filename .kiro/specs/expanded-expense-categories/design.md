# Design Document

## Overview

This design document outlines the implementation approach for expanding the expense tracking system's category options from 5 categories to 14 categories. The expansion will maintain full backward compatibility with existing data while providing users with more granular spending categorization. A key aspect of this design is the migration of existing "Food" expenses to "Dining Out" to better reflect the category's purpose.

The implementation follows the existing layered architecture (Controller → Service → Repository → Database) and ensures that all features that currently work with categories (budgets, recurring expenses, CSV import, summaries, filtering) continue to function seamlessly with the expanded category list.

## Architecture

### System Components

The expense category expansion touches the following system layers:

1. **Database Layer**: SQLite schema with CHECK constraints on the `type` column
2. **Repository Layer**: Data access methods that query and filter by category
3. **Service Layer**: Business logic for validation and category-related operations
4. **Controller Layer**: API endpoints that accept and return category data
5. **Frontend Components**: UI elements that display and allow selection of categories
6. **Migration Scripts**: Database migration to update schema and rename "Food" to "Dining Out"

### Data Flow

```
User Selection → Frontend Dropdown → API Request → Controller Validation → 
Service Validation → Repository Query → Database Constraint Check → 
Response → Frontend Display
```

## Components and Interfaces

### 1. Category Definition Module

**Location**: `backend/utils/categories.js` (new file)

**Purpose**: Single source of truth for all valid expense categories

**Interface**:
```javascript
module.exports = {
  CATEGORIES: [
    'Housing',
    'Utilities',
    'Groceries',
    'Dining Out',
    'Insurance',
    'Gas',
    'Vehicle Maintenance',
    'Entertainment',
    'Subscriptions',
    'Recreation Activities',
    'Pet Care',
    'Tax - Medical',
    'Tax - Donation',
    'Other'
  ],
  
  BUDGETABLE_CATEGORIES: [
    'Housing',
    'Utilities',
    'Groceries',
    'Dining Out',
    'Insurance',
    'Gas',
    'Vehicle Maintenance',
    'Entertainment',
    'Subscriptions',
    'Recreation Activities',
    'Pet Care',
    'Other'
  ],
  
  TAX_DEDUCTIBLE_CATEGORIES: [
    'Tax - Medical',
    'Tax - Donation'
  ],
  
  isTaxDeductible(category) {
    return this.TAX_DEDUCTIBLE_CATEGORIES.includes(category);
  },
  
  isBudgetable(category) {
    return this.BUDGETABLE_CATEGORIES.includes(category);
  },
  
  isValid(category) {
    return this.CATEGORIES.includes(category);
  }
};
```

### 2. Database Schema Updates

**Table**: `expenses`

**Current CHECK Constraint**:
```sql
type TEXT NOT NULL CHECK(type IN ('Other', 'Food', 'Gas', 'Tax - Medical', 'Tax - Donation'))
```

**Updated CHECK Constraint**:
```sql
type TEXT NOT NULL CHECK(type IN (
  'Housing', 'Utilities', 'Groceries', 'Dining Out', 'Insurance',
  'Gas', 'Vehicle Maintenance', 'Entertainment', 'Subscriptions',
  'Recreation Activities', 'Pet Care', 'Tax - Medical', 'Tax - Donation', 'Other'
))
```

**Table**: `recurring_expenses`

Same constraint update as `expenses` table.

**Table**: `budgets`

**Current CHECK Constraint**:
```sql
category TEXT NOT NULL CHECK(category IN ('Food', 'Gas', 'Other'))
```

**Updated CHECK Constraint**:
```sql
category TEXT NOT NULL CHECK(category IN (
  'Housing', 'Utilities', 'Groceries', 'Dining Out', 'Insurance',
  'Gas', 'Vehicle Maintenance', 'Entertainment', 'Subscriptions',
  'Recreation Activities', 'Pet Care', 'Other'
))
```

### 3. Migration Script

**Location**: `backend/scripts/expandCategories.js` (new file)

**Purpose**: Migrate database schema and rename "Food" to "Dining Out"

**Steps**:
1. Create backup of database
2. Drop existing CHECK constraints on `expenses`, `recurring_expenses`, and `budgets` tables
3. Update all records with category "Food" to "Dining Out" in all three tables
4. Add new CHECK constraints with expanded category list
5. Verify migration success
6. Log migration results

### 4. Service Layer Updates

**File**: `backend/services/expenseService.js`

**Changes**:
- Import category definitions from `categories.js`
- Update `validateExpense()` to use `CATEGORIES` array
- Update validation error messages to reference the new category list

**File**: `backend/services/budgetService.js`

**Changes**:
- Import category definitions from `categories.js`
- Update budget validation to use `BUDGETABLE_CATEGORIES` array
- Ensure budget calculations work with all new categories
- Add `suggestBudgetAmount(year, month, category)` method that:
  - Calculates average spending for the category over the past 3-6 months
  - Rounds to nearest $50
  - Returns 0 if no historical data exists

**File**: `backend/services/recurringExpenseService.js`

**Changes**:
- Import category definitions from `categories.js`
- Update validation to use `CATEGORIES` array

### 5. Frontend Component Updates

**File**: `frontend/src/components/ExpenseForm.jsx`

**Changes**:
- Replace hardcoded `typeOptions` array with API call to fetch categories
- Update dropdown to display categories in logical groupings (optional enhancement)
- Maintain current UI/UX patterns

**File**: `frontend/src/components/SummaryPanel.jsx`

**Changes**:
- Update expense type display section to dynamically render all categories
- Ensure trend indicators work with new categories
- Update layout to accommodate more categories (may need scrolling or grid layout)

**File**: `frontend/src/components/BudgetManagementModal.jsx`

**Changes**:
- Update category dropdown to include all budgetable categories
- Ensure budget creation/editing works with new categories
- Add budget suggestion feature:
  - When user selects a category, fetch suggested amount from API
  - Display suggested amount with explanation (e.g., "Based on 3 months average: $450")
  - Allow user to accept suggestion or enter custom amount
  - Show "No historical data" if suggestion is $0

**File**: `frontend/src/components/ExpenseList.jsx`

**Changes**:
- Update category filter dropdown to include all categories
- Ensure filtering works correctly with new categories

### 6. API Endpoints

**New Endpoint**: `GET /api/categories`

**Purpose**: Provide frontend with the complete list of valid categories

**Response**:
```json
{
  "categories": ["Housing", "Utilities", ...],
  "budgetableCategories": ["Housing", "Utilities", ...],
  "taxDeductibleCategories": ["Tax - Medical", "Tax - Donation"]
}
```

**Controller**: `backend/controllers/categoryController.js` (new file)

**Route**: `backend/routes/categoryRoutes.js` (new file)

**New Endpoint**: `GET /api/budgets/suggest?year=2024&month=3&category=Groceries`

**Purpose**: Suggest a budget amount based on historical spending data

**Response**:
```json
{
  "category": "Groceries",
  "suggestedAmount": 450,
  "basedOnMonths": 3,
  "averageSpending": 437.50
}
```

**Logic**:
- Calculate average spending for the category over past 3-6 months
- Round to nearest $50
- Return 0 if no historical data exists

### 7. CSV Import Updates

**File**: `validate_csv.py`

**Changes**:
- Update valid category list to include all 14 categories
- Update validation error messages
- Update documentation/comments

**File**: `backend/controllers/expenseController.js` (CSV import handler)

**Changes**:
- Ensure CSV import validates against new category list
- Update error messages for invalid categories

## Data Models

### Category Model (Conceptual)

```javascript
{
  name: string,           // e.g., "Housing"
  isBudgetable: boolean,  // Can this category have budgets?
  isTaxDeductible: boolean, // Is this a tax-deductible category?
  displayOrder: number    // Optional: for UI ordering
}
```

### Expense Model (Updated)

```javascript
{
  id: number,
  date: string,           // YYYY-MM-DD
  place: string,
  notes: string,
  amount: number,
  type: string,           // One of 14 valid categories
  week: number,           // 1-5
  method: string,         // Payment method
  recurring_id: number,   // Optional
  is_generated: boolean,
  created_at: string
}
```

### Budget Model (Updated)

```javascript
{
  id: number,
  year: number,
  month: number,          // 1-12
  category: string,       // One of 12 budgetable categories
  limit: number,
  created_at: string,
  updated_at: string
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Acceptance Criteria Testing Prework

1.1 WHEN a user views the expense type dropdown THEN the Expense Tracker System SHALL display all available categories organized in a logical grouping
Thoughts: This is about UI presentation. We can test that the dropdown contains all expected categories by generating a random subset of categories and verifying they all appear in the rendered output.
Testable: yes - property

1.2 WHEN a user selects a category from the dropdown THEN the Expense Tracker System SHALL accept and store the selected category value
Thoughts: This is about the system accepting any valid category. We can generate random valid categories and verify they are stored correctly.
Testable: yes - property

1.3 WHEN a user adds an expense with an expanded category THEN the Expense Tracker System SHALL persist the category to the database without data loss
Thoughts: This is a round-trip property. For any valid category, creating an expense and then retrieving it should return the same category.
Testable: yes - property

1.4 WHEN a user views existing expenses with legacy categories THEN the Expense Tracker System SHALL display those expenses with their original category values unchanged
Thoughts: This is about data preservation during migration. After migration, "Dining Out" should appear for all previously "Food" expenses, and other legacy categories should remain unchanged.
Testable: yes - example

1.5 WHEN a user filters or searches expenses by category THEN the Expense Tracker System SHALL return accurate results for both legacy and expanded categories
Thoughts: For any category and any set of expenses, filtering should return only expenses matching that category.
Testable: yes - property

2.1 WHEN the database schema is updated THEN the Expense Tracker System SHALL allow all legacy category values to remain valid
Thoughts: This is about migration correctness. After migration, "Gas", "Tax - Medical", "Tax - Donation", and "Other" should still be valid, while "Food" should be replaced by "Dining Out".
Testable: yes - example

2.2 WHEN the database schema is updated THEN the Expense Tracker System SHALL accept all expanded category values as valid entries
Thoughts: For any category in the expanded list, the database should accept it without constraint violations.
Testable: yes - property

2.3 WHEN an expense record is created or updated THEN the Expense Tracker System SHALL validate the category against the complete list of allowed values
Thoughts: For any invalid category string, the system should reject it. For any valid category, the system should accept it.
Testable: yes - property

2.4 WHEN the system queries expenses THEN the Expense Tracker System SHALL retrieve expenses with any valid category value without errors
Thoughts: For any valid category, querying expenses by that category should not produce errors.
Testable: yes - property

2.5 WHEN the database constraint is applied THEN the Expense Tracker System SHALL reject category values that are not in the approved list
Thoughts: For any string that is not in the approved category list, attempting to insert it should fail.
Testable: yes - property

3.1 WHEN a user creates a budget for an expanded category THEN the Expense Tracker System SHALL accept and store the budget limit
Thoughts: For any budgetable category, creating a budget should succeed.
Testable: yes - property

3.2 WHEN a user adds an expense in a budgeted expanded category THEN the Expense Tracker System SHALL calculate the spending against the budget limit
Thoughts: For any budget and any expense in that category, the spending calculation should include that expense.
Testable: yes - property

3.3 WHEN a user views budget progress THEN the Expense Tracker System SHALL display accurate spending totals for expanded categories
Thoughts: For any category with a budget, the displayed spending should equal the sum of all expenses in that category.
Testable: yes - property

3.4 WHEN a user exceeds a budget limit for an expanded category THEN the Expense Tracker System SHALL indicate the budget status appropriately
Thoughts: For any budget where spending exceeds the limit, the status should indicate "over budget".
Testable: yes - property

3.5 WHEN the budget system queries expense totals THEN the Expense Tracker System SHALL aggregate expenses by expanded category correctly
Thoughts: For any category, the aggregated total should equal the sum of all expense amounts in that category.
Testable: yes - property

4.1 WHEN a user creates a recurring expense template with an expanded category THEN the Expense Tracker System SHALL store the category in the template
Thoughts: For any valid category, creating a recurring template should persist that category.
Testable: yes - property

4.2 WHEN the system generates expenses from a recurring template THEN the Expense Tracker System SHALL apply the template's expanded category to generated expenses
Thoughts: For any recurring template, generated expenses should have the same category as the template.
Testable: yes - property

4.3 WHEN a user views recurring expense templates THEN the Expense Tracker System SHALL display the assigned expanded category
Thoughts: For any recurring template, retrieving it should return the correct category.
Testable: yes - property

4.4 WHEN a user edits a recurring template category THEN the Expense Tracker System SHALL update the template with the new expanded category value
Thoughts: For any recurring template and any new valid category, updating should persist the new category.
Testable: yes - property

4.5 WHEN a recurring template with an expanded category is paused or deleted THEN the Expense Tracker System SHALL maintain data integrity
Thoughts: This is about referential integrity. Pausing or deleting a template should not corrupt related data.
Testable: yes - property

5.1 WHEN a CSV file contains expenses with expanded category values THEN the Expense Tracker System SHALL parse and import those expenses successfully
Thoughts: For any CSV with valid expanded categories, import should succeed.
Testable: yes - property

5.2 WHEN a CSV file contains expenses with legacy category values THEN the Expense Tracker System SHALL import those expenses without modification
Thoughts: This is about backward compatibility. "Gas", "Other", "Tax - Medical", "Tax - Donation" should import as-is. "Food" should be rejected since it's no longer valid post-migration.
Testable: yes - example

5.3 WHEN a CSV file contains an invalid category value THEN the Expense Tracker System SHALL reject the import and provide a clear error message
Thoughts: For any invalid category string, import should fail with an error.
Testable: yes - property

5.4 WHEN the CSV validation script runs THEN the Expense Tracker System SHALL validate category values against the complete approved list
Thoughts: For any CSV row, validation should check against the complete category list.
Testable: yes - property

5.5 WHEN a user views the CSV import template or documentation THEN the Expense Tracker System SHALL list all valid category options
Thoughts: This is about documentation accuracy. The documentation should list all 14 categories.
Testable: no

6.1 WHEN a user views the monthly summary THEN the Expense Tracker System SHALL display spending totals grouped by expanded categories
Thoughts: For any month, the summary should include totals for all categories that have expenses.
Testable: yes - property

6.2 WHEN a user views the annual summary THEN the Expense Tracker System SHALL aggregate expenses by expanded categories across all months
Thoughts: For any year, the annual summary should correctly aggregate by category.
Testable: yes - property

6.3 WHEN a user views category breakdowns in charts THEN the Expense Tracker System SHALL include expanded categories in the visualization
Thoughts: For any category with expenses, it should appear in the chart.
Testable: yes - property

6.4 WHEN a user filters the expense list by category THEN the Expense Tracker System SHALL support filtering by any expanded category
Thoughts: For any category, filtering should return only expenses in that category.
Testable: yes - property

6.5 WHEN the system calculates spending trends THEN the Expense Tracker System SHALL include expanded categories in trend calculations
Thoughts: For any category, trend calculations should include all expenses in that category.
Testable: yes - property

7.1 WHEN a user views the category list THEN the Expense Tracker System SHALL clearly mark tax-deductible categories with a distinguishing prefix or indicator
Thoughts: This is about UI presentation. Tax-deductible categories have "Tax - " prefix.
Testable: yes - example

7.2 WHEN a user selects a tax-deductible category THEN the Expense Tracker System SHALL flag the expense as tax-deductible in the database
Thoughts: For any tax-deductible category, the system should recognize it as such.
Testable: yes - property

7.3 WHEN a user views the tax-deductible report THEN the Expense Tracker System SHALL include all expenses from tax-deductible categories
Thoughts: For any tax-deductible expense, it should appear in the tax report.
Testable: yes - property

7.4 WHEN the system identifies tax-deductible expenses THEN the Expense Tracker System SHALL recognize both legacy and expanded tax-deductible categories
Thoughts: Both "Tax - Medical" and "Tax - Donation" should be recognized as tax-deductible.
Testable: yes - example

7.5 WHEN a user exports tax-deductible data THEN the Expense Tracker System SHALL include expenses from all tax-deductible category types
Thoughts: For any tax-deductible category, expenses should be included in the export.
Testable: yes - property

8.1 WHEN categories are defined in the codebase THEN the Expense Tracker System SHALL maintain a single source of truth for the category list
Thoughts: This is about code organization. The categories.js module should be the only place categories are defined.
Testable: no

8.2 WHEN the category list is updated THEN the Expense Tracker System SHALL reflect changes in all components that reference categories
Thoughts: This is about maintainability. If categories.js is updated, all components should use the updated list.
Testable: no

8.3 WHEN the frontend requests category options THEN the Expense Tracker System SHALL provide the complete list from the backend
Thoughts: The API endpoint should return all categories from the categories.js module.
Testable: yes - example

8.4 WHEN the database schema enforces category constraints THEN the Expense Tracker System SHALL use the same category list as the application code
Thoughts: The database CHECK constraint should match the categories.js list.
Testable: yes - example

8.5 WHEN a developer adds a new category THEN the Expense Tracker System SHALL require updates in no more than three locations
Thoughts: This is about maintainability. Adding a category should require updates in: categories.js, migration script, and database schema.
Testable: no

9.1 WHEN the system is updated with expanded categories THEN the Expense Tracker System SHALL preserve all existing expense data without modification
Thoughts: This is about migration safety. All expense records should exist before and after migration.
Testable: yes - example

9.2 WHEN a user opens the application after the update THEN the Expense Tracker System SHALL display all existing expenses with their updated or original categories
Thoughts: After migration, "Food" expenses should show as "Dining Out", others should be unchanged.
Testable: yes - example

9.3 WHEN a user adds a new expense after the update THEN the Expense Tracker System SHALL offer all expanded category options
Thoughts: The dropdown should contain all 14 categories.
Testable: yes - example

9.4 WHEN the database migration runs THEN the Expense Tracker System SHALL complete without data loss or corruption
Thoughts: Record count before and after migration should be the same.
Testable: yes - example

9.5 WHEN a user views historical reports after the update THEN the Expense Tracker System SHALL display accurate data for all time periods
Thoughts: Historical summaries should show correct totals with updated category names.
Testable: yes - example

10.1 WHEN the database migration executes THEN the Expense Tracker System SHALL update all expense records with category "Food" to category "Dining Out"
Thoughts: All "Food" expenses should become "Dining Out" expenses.
Testable: yes - example

10.2 WHEN the database migration executes THEN the Expense Tracker System SHALL update all recurring expense templates with category "Food" to category "Dining Out"
Thoughts: All "Food" recurring templates should become "Dining Out" templates.
Testable: yes - example

10.3 WHEN the database migration executes THEN the Expense Tracker System SHALL update all budget records with category "Food" to category "Dining Out"
Thoughts: All "Food" budgets should become "Dining Out" budgets.
Testable: yes - example

10.4 WHEN a user views expenses after migration THEN the Expense Tracker System SHALL display "Dining Out" for all previously "Food" categorized expenses
Thoughts: No "Food" expenses should exist after migration; they should all be "Dining Out".
Testable: yes - example

10.5 WHEN the migration completes THEN the Expense Tracker System SHALL log the number of records updated for verification purposes
Thoughts: Migration script should output counts of updated records.
Testable: yes - example

### Property Reflection

After reviewing all properties, the following consolidations can be made:

- Properties 2.2, 2.3, 2.4, and 2.5 all test category validation and can be combined into a single comprehensive property about category validation
- Properties 3.2, 3.3, and 3.5 all test budget calculation accuracy and can be combined
- Properties 4.1, 4.3, and 4.4 all test recurring template category persistence and can be combined
- Properties 6.1, 6.2, 6.3, 6.4, and 6.5 all test category aggregation in various contexts and can be combined into a single property about correct category aggregation
- Properties 7.2, 7.3, and 7.5 all test tax-deductible category handling and can be combined

### Correctness Properties

Property 1: Category dropdown completeness
*For any* valid category from the approved list, the expense form dropdown should include that category as an option
**Validates: Requirements 1.1**

Property 2: Category persistence round-trip
*For any* valid category, creating an expense with that category and then retrieving it should return an expense with the same category value
**Validates: Requirements 1.2, 1.3**

Property 3: Category filtering accuracy
*For any* category and any set of expenses, filtering by that category should return only expenses where the type field matches that category
**Validates: Requirements 1.5**

Property 4: Category validation enforcement
*For any* string value, the system should accept it as a category if and only if it appears in the approved category list
**Validates: Requirements 2.2, 2.3, 2.4, 2.5**

Property 5: Budget calculation accuracy
*For any* budgetable category and any set of expenses, the calculated spending for that category should equal the sum of all expense amounts where type matches that category
**Validates: Requirements 3.2, 3.3, 3.5**

Property 6: Budget status indication
*For any* budget, if the calculated spending exceeds the limit, the budget status should indicate "over budget"
**Validates: Requirements 3.4**

Property 7: Recurring template category persistence
*For any* valid category, creating a recurring template with that category, updating it to a different valid category, and retrieving it should return the updated category value
**Validates: Requirements 4.1, 4.3, 4.4**

Property 8: Recurring template generation consistency
*For any* recurring template, all expenses generated from that template should have the same category as the template
**Validates: Requirements 4.2**

Property 9: CSV import category validation
*For any* CSV row with a category value, the import should succeed if and only if the category is in the approved list
**Validates: Requirements 5.1, 5.3, 5.4**

Property 10: Category aggregation correctness
*For any* category and any time period, the aggregated total for that category should equal the sum of all expense amounts where type matches that category within that time period
**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

Property 11: Tax-deductible category identification
*For any* expense with a category starting with "Tax - ", the system should identify it as tax-deductible and include it in tax reports
**Validates: Requirements 7.2, 7.3, 7.5**

## Error Handling

### Validation Errors

1. **Invalid Category**: Return 400 Bad Request with message listing valid categories
2. **Migration Failure**: Rollback changes and log detailed error information
3. **Constraint Violation**: Return 400 Bad Request with specific constraint that failed
4. **CSV Import Error**: Return detailed error with row number and invalid category value

### Migration Error Handling

The migration script should:
1. Create a backup before starting
2. Use database transactions to ensure atomicity
3. Verify each step before proceeding
4. Rollback on any error
5. Log all operations for audit trail
6. Provide clear success/failure messages

### Runtime Error Handling

- If category validation fails, provide clear error message with list of valid categories
- If database constraint fails, catch and translate to user-friendly message
- If API endpoint fails, return appropriate HTTP status code with error details

## Testing Strategy

### Unit Testing

Unit tests will verify:
- Category validation logic in service layer
- Category utility functions (isTaxDeductible, isBudgetable, isValid)
- API endpoint responses for category-related requests
- Frontend dropdown rendering with all categories
- Filter functionality with new categories

### Property-Based Testing

Property-based tests will use **fast-check** (JavaScript property testing library) to verify universal properties across all valid inputs. Each test will run a minimum of 100 iterations.

**Test Configuration**:
```javascript
const fc = require('fast-check');

// Run each property test with 100 iterations
fc.assert(property, { numRuns: 100 });
```

**Property Test Implementations**:

1. **Property 1: Category dropdown completeness**
   - **Feature: expanded-expense-categories, Property 1: Category dropdown completeness**
   - Generate: Random subset of valid categories
   - Test: Verify all appear in rendered dropdown

2. **Property 2: Category persistence round-trip**
   - **Feature: expanded-expense-categories, Property 2: Category persistence round-trip**
   - Generate: Random valid category, random expense data
   - Test: Create expense, retrieve it, verify category matches

3. **Property 3: Category filtering accuracy**
   - **Feature: expanded-expense-categories, Property 3: Category filtering accuracy**
   - Generate: Random category, random set of expenses with various categories
   - Test: Filter by category, verify all results match that category

4. **Property 4: Category validation enforcement**
   - **Feature: expanded-expense-categories, Property 4: Category validation enforcement**
   - Generate: Random strings (both valid and invalid categories)
   - Test: Verify validation accepts valid categories and rejects invalid ones

5. **Property 5: Budget calculation accuracy**
   - **Feature: expanded-expense-categories, Property 5: Budget calculation accuracy**
   - Generate: Random budgetable category, random set of expenses
   - Test: Verify calculated spending equals sum of matching expenses

6. **Property 6: Budget status indication**
   - **Feature: expanded-expense-categories, Property 6: Budget status indication**
   - Generate: Random budget with limit, random expenses that exceed limit
   - Test: Verify status indicates "over budget"

7. **Property 7: Recurring template category persistence**
   - **Feature: expanded-expense-categories, Property 7: Recurring template category persistence**
   - Generate: Random valid categories, random template data
   - Test: Create template, update category, verify persistence

8. **Property 8: Recurring template generation consistency**
   - **Feature: expanded-expense-categories, Property 8: Recurring template generation consistency**
   - Generate: Random recurring template with category
   - Test: Generate expenses, verify all have template's category

9. **Property 9: CSV import category validation**
   - **Feature: expanded-expense-categories, Property 9: CSV import category validation**
   - Generate: Random CSV rows with valid and invalid categories
   - Test: Verify import succeeds for valid, fails for invalid

10. **Property 10: Category aggregation correctness**
    - **Feature: expanded-expense-categories, Property 10: Category aggregation correctness**
    - Generate: Random category, random time period, random expenses
    - Test: Verify aggregated total equals sum of matching expenses

11. **Property 11: Tax-deductible category identification**
    - **Feature: expanded-expense-categories, Property 11: Tax-deductible category identification**
    - Generate: Random expenses with tax-deductible categories
    - Test: Verify all are identified and included in tax reports

### Integration Testing

Integration tests will verify:
- End-to-end expense creation with new categories
- Budget creation and tracking with new categories
- Recurring expense generation with new categories
- CSV import with new categories
- Summary and report generation with new categories
- Migration script execution and verification

### Migration Testing

Migration tests will verify:
- All "Food" expenses are renamed to "Dining Out"
- All "Food" recurring templates are renamed to "Dining Out"
- All "Food" budgets are renamed to "Dining Out"
- No data loss occurs during migration
- Record counts remain consistent
- Database constraints are properly updated

## Implementation Notes

### Migration Strategy

1. **Pre-Migration**:
   - Create automatic backup
   - Count records in each table
   - Verify database integrity

2. **Migration Execution**:
   - Begin transaction
   - Drop old CHECK constraints
   - Update all "Food" records to "Dining Out"
   - Add new CHECK constraints
   - Commit transaction

3. **Post-Migration**:
   - Verify record counts match
   - Verify no "Food" records remain
   - Verify "Dining Out" records exist
   - Test expense creation with new categories

### Backward Compatibility

- Existing "Gas", "Tax - Medical", "Tax - Donation", and "Other" categories remain unchanged
- "Food" is automatically migrated to "Dining Out"
- All existing budgets, recurring templates, and expenses continue to work
- Historical reports show updated category names

### Performance Considerations

- Category validation uses in-memory array lookup (O(n) where n=14)
- Database CHECK constraints provide fast validation at insert/update time
- No performance impact on existing queries
- Summary queries may need optimization if many categories have expenses

### UI/UX Considerations

- Dropdown may need scrolling or grouping for 14 categories
- Consider alphabetical ordering or logical grouping
- Maintain consistent category naming across all UI elements
- Provide clear visual distinction for tax-deductible categories
