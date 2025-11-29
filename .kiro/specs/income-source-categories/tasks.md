# Implementation Plan

- [ ] 1. Create database migration for income category column
  - Create migration function `migrateAddIncomeCategoryColumn` in `backend/database/migrations.js`
  - Add category column with default 'Other' and CHECK constraint for valid values
  - Implement idempotent migration (safe to run multiple times)
  - Add migration to `runMigrations()` function
  - Test migration on database with existing income sources
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

- [ ] 2. Update backend repository layer for category support
  - [ ] 2.1 Modify `getIncomeSources()` to include category and sort by category
    - Update SQL query to SELECT category column
    - Add ORDER BY category ASC to query
    - _Requirements: 1.5, 2.3_

  - [ ] 2.2 Add `getIncomeByCategoryForMonth()` method
    - Create method to aggregate income by category for a specific month
    - Return object with category totals
    - _Requirements: 2.5_

  - [ ] 2.3 Add `getIncomeByCategoryForYear()` method
    - Create method to aggregate income by category for entire year
    - Return object with annual category totals
    - _Requirements: 4.2_

  - [ ] 2.4 Update `createIncomeSource()` to accept and store category
    - Add category parameter to INSERT statement
    - Default to 'Other' if not provided
    - _Requirements: 1.4, 1.5_

  - [ ] 2.5 Update `updateIncomeSource()` to accept and update category
    - Add category to UPDATE statement
    - _Requirements: 3.3_

  - [ ] 2.6 Update `copyFromPreviousMonth()` to preserve categories
    - Include category in SELECT and INSERT statements
    - _Requirements: 6.1, 6.2_

- [ ] 3. Update backend service layer for category validation
  - [ ] 3.1 Create constants file with income categories
    - Create `backend/utils/constants.js` if it doesn't exist
    - Export INCOME_CATEGORIES array with four valid values
    - _Requirements: 1.2_

  - [ ] 3.2 Update `validateIncomeSource()` to validate category
    - Add category validation to check against INCOME_CATEGORIES
    - Provide clear error message for invalid categories
    - _Requirements: 1.2, 1.3, 3.2, 3.5_

  - [ ] 3.3 Update `getMonthlyIncome()` to return category breakdown
    - Call repository method to get category breakdown
    - Include byCategory in response object
    - _Requirements: 2.5_

  - [ ] 3.4 Update `createIncomeSource()` to handle category
    - Accept category parameter with default 'Other'
    - Pass category to repository
    - _Requirements: 1.4, 1.5_

  - [ ] 3.5 Update `updateIncomeSource()` to handle category
    - Accept category parameter
    - Pass category to repository
    - _Requirements: 3.1, 3.3_

  - [ ] 3.6 Add `getAnnualIncomeByCategory()` method
    - Create method to get annual category breakdown
    - Call repository method
    - _Requirements: 4.2_

- [ ] 4. Update backend controller and routes
  - [ ] 4.1 Update `getMonthlyIncome()` controller
    - Response now includes byCategory field
    - _Requirements: 2.5_

  - [ ] 4.2 Update `createIncomeSource()` controller
    - Accept category from request body
    - Pass to service layer
    - _Requirements: 1.1, 1.5_

  - [ ] 4.3 Update `updateIncomeSource()` controller
    - Accept category from request body
    - Pass to service layer
    - _Requirements: 3.1, 3.3_

  - [ ] 4.4 Add `getAnnualIncomeByCategory()` controller
    - Create new controller method
    - Call service method
    - Return category breakdown
    - _Requirements: 4.2_

  - [ ] 4.5 Add new route for annual category breakdown
    - Add GET `/api/income/annual/:year/by-category` route
    - Wire to controller method
    - _Requirements: 4.1_

- [ ] 5. Update Income Management Modal component
  - [ ] 5.1 Add category state management
    - Add newSourceCategory state (default 'Other')
    - Add editCategory state
    - Add byCategory state for breakdown display
    - _Requirements: 1.4, 3.1_

  - [ ] 5.2 Update fetchIncomeSources to handle category data
    - Extract byCategory from API response
    - Store in state
    - _Requirements: 2.5_

  - [ ] 5.3 Add category selector to add form
    - Add dropdown with four category options
    - Bind to newSourceCategory state
    - _Requirements: 1.1, 1.2_

  - [ ] 5.4 Update handleAddSource to include category
    - Pass category to API call
    - Reset category to 'Other' after add
    - _Requirements: 1.4, 1.5_

  - [ ] 5.5 Add category selector to edit mode
    - Add dropdown in edit mode
    - Pre-populate with current category
    - Bind to editCategory state
    - _Requirements: 3.1, 3.2_

  - [ ] 5.6 Update handleEditSource to set category
    - Set editCategory from source.category
    - _Requirements: 3.1_

  - [ ] 5.7 Update handleSaveEdit to include category
    - Pass category to API call
    - _Requirements: 3.3_

  - [ ] 5.8 Add category badges to income source display
    - Display category badge with color coding
    - Show category name
    - _Requirements: 2.1, 2.4_

  - [ ] 5.9 Add category breakdown display section
    - Create section showing subtotals by category
    - Display category icon, name, and amount
    - _Requirements: 2.5_

  - [ ] 5.10 Add getCategoryIcon helper function
    - Map categories to emoji icons
    - _Requirements: 2.1_

- [ ] 6. Update Income Management Modal styles
  - [ ] 6.1 Add category breakdown section styles
    - Style breakdown grid and items
    - Add category icons and amounts
    - _Requirements: 2.5_

  - [ ] 6.2 Add category badge styles
    - Create color-coded badges for each category
    - Style for Salary, Government, Gifts, Other
    - _Requirements: 2.2_

  - [ ] 6.3 Add category selector styles
    - Style dropdown for add and edit forms
    - Add focus and disabled states
    - _Requirements: 1.1, 3.1_

- [ ] 7. Update Annual Summary component
  - [ ] 7.1 Add state for income by category
    - Add incomeByCategory state
    - _Requirements: 4.1_

  - [ ] 7.2 Fetch annual income by category
    - Call new API endpoint in fetchAnnualSummary
    - Store in state
    - _Requirements: 4.2_

  - [ ] 7.3 Add "Income by Category" section
    - Create new section in UI
    - Display category grid with icons
    - Show category name, amount, and percentage
    - _Requirements: 4.1, 4.3_

  - [ ] 7.4 Add getCategoryIcon helper function
    - Map categories to emoji icons
    - _Requirements: 4.3_

- [ ] 8. Update Annual Summary styles
  - [ ] 8.1 Add income category section styles
    - Style category grid and items
    - Add gradient background for income items
    - Style category icons
    - _Requirements: 4.1, 4.4_

- [ ] 9. Update API service functions
  - [ ] 9.1 Update getMonthlyIncomeSources to handle byCategory
    - Parse byCategory from response
    - _Requirements: 2.5_

  - [ ] 9.2 Update createIncomeSource to send category
    - Include category in request body
    - _Requirements: 1.5_

  - [ ] 9.3 Update updateIncomeSource to send category
    - Include category in request body
    - _Requirements: 3.3_

  - [ ] 9.4 Add getAnnualIncomeByCategory API function
    - Create new API function
    - Call annual category endpoint
    - _Requirements: 4.2_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
