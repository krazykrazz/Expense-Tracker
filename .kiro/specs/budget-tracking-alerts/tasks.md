# Implementation Plan

- [x] 1. Database setup and migrations




  - Create budgets table with proper constraints and indexes
  - Add CHECK constraints for positive limits and valid categories
  - Create indexes for performance (year/month composite, category)
  - Add timestamp trigger for updated_at field
  - Test migration script (up and down)
  - _Requirements: 1.1, 1.5, 1.6, 7.5_

- [x] 2. Backend repository layer






  - [x] 2.1 Implement budgetRepository with CRUD operations

    - Create budget with validation
    - Get budget by ID
    - Get budgets by year/month
    - Update budget limit
    - Delete budget
    - Get budgets for copy operation (source month)
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 2.2 Write property test for budget storage round-trip


    - **Property 1: Budget storage round-trip**
    - **Validates: Requirements 1.2**


  - [x] 2.3 Write property test for budget update

    - **Property 2: Budget update replaces old value**
    - **Validates: Requirements 1.3**


  - [x] 2.4 Write property test for budget deletion

    - **Property 3: Budget deletion removes data**
    - **Validates: Requirements 1.4**



  - [x] 2.5 Write property test for positive limit validation


    - **Property 4: Positive limit validation**
    - **Validates: Requirements 1.5**

- [x] 3. Backend service layer - core budget operations





  - [x] 3.1 Implement budgetService core methods


    - createBudget(year, month, category, limit)
    - updateBudget(id, limit)
    - deleteBudget(id)
    - getBudgets(year, month) - with automatic carry-forward from previous month
    - Validate category is budgetable (all non-tax-deductible categories: 15 total)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 5.2, 5.3_

  - [x] 3.2 Write property test for automatic carry-forward


    - **Property 9: Automatic carry-forward preserves data**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 3.3 Write unit tests for budget service validation


    - Test category validation (reject tax categories)
    - Test amount validation (reject zero/negative)
    - Test duplicate budget handling
    - Test automatic carry-forward when no budgets exist
    - Test no carry-forward when budgets already exist
    - _Requirements: 1.5, 1.6, 5.1, 5.4, 5.5_

- [x] 4. Backend service layer - progress calculations






  - [x] 4.1 Implement budget progress calculation methods

    - calculateProgress(spent, limit) - returns percentage
    - calculateBudgetStatus(progress) - returns status enum
    - getSpentAmount(year, month, category) - query expenses
    - getBudgetProgress(budgetId) - complete progress object
    - _Requirements: 2.2, 2.3, 3.4_


  - [x] 4.2 Write property test for progress calculation

    - **Property 5: Progress calculation accuracy**
    - **Validates: Requirements 2.2**


  - [x] 4.3 Write property test for color coding

    - **Property 6: Color coding correctness**
    - **Validates: Requirements 2.3**


  - [x] 4.4 Write property test for remaining calculation

    - **Property 8: Remaining budget calculation**
    - **Validates: Requirements 3.4**

- [x] 5. Backend service layer - budget summary and aggregation




  - [x] 5.1 Implement budget summary methods


    - getBudgetSummary(year, month) - overall summary
    - Calculate total budgeted across all categories
    - Calculate total spent (only budgeted categories)
    - Calculate overall progress percentage
    - Count budgets on track vs total
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.2 Write property test for total budget sum


    - **Property 12: Total budget sum accuracy**
    - **Validates: Requirements 6.1**

  - [x] 5.3 Write property test for overall progress


    - **Property 13: Overall progress calculation**
    - **Validates: Requirements 6.4**

  - [x] 5.4 Write property test for non-budgeted exclusion


    - **Property 14: Non-budgeted category exclusion**
    - **Validates: Requirements 6.5**

- [x] 6. Backend service layer - manual budget copy functionality






  - [x] 6.1 Implement manual budget copy methods

    - copyBudgets(sourceYear, sourceMonth, targetYear, targetMonth, overwrite)
    - Validate source month has budgets
    - Check for conflicts in target month
    - Perform bulk copy operation
    - Return copy statistics (copied, skipped, overwritten)
    - _Requirements: 5A.1, 5A.2, 5A.3, 5A.4, 5A.5_


  - [x] 6.2 Write property test for manual budget copy preservation

    - **Property 10: Budget copy preserves data**
    - **Validates: Requirements 5A.2, 5A.5**


  - [x] 6.3 Write property test for copy count accuracy

    - **Property 11: Copy operation count accuracy**
    - **Validates: Requirements 5A.4**

- [x] 7. Backend service layer - historical analysis




  - [x] 7.1 Implement budget history methods


    - getBudgetHistory(year, month, periodMonths)
    - Aggregate budget vs actual for each category over time
    - Calculate success rate (% months budget met)
    - Calculate average spending per category
    - Support 3, 6, and 12 month periods
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.2 Write unit tests for historical calculations


    - Test success rate calculation
    - Test average spending calculation
    - Test period boundary handling
    - Test missing budget handling
    - _Requirements: 4.3, 4.4_

- [x] 8. Backend integration - expense service hooks





  - [x] 8.1 Add budget recalculation hooks to expense service


    - Hook into expenseService.create() - recalculate affected budget
    - Hook into expenseService.update() - recalculate old and new budgets if category/amount/date changed
    - Hook into expenseService.delete() - recalculate affected budget
    - Ensure hooks are called within same transaction
    - _Requirements: 2.4, 8.1, 8.2, 8.3, 8.4_

  - [x] 8.2 Write property test for expense addition updates


    - **Property 7: Budget progress updates with expenses**
    - **Validates: Requirements 2.4, 8.2**

  - [x] 8.3 Write property test for expense modification

    - **Property 18: Expense modification updates budget**
    - **Validates: Requirements 8.3**

  - [x] 8.4 Write property test for date change

    - **Property 19: Date change updates multiple months**
    - **Validates: Requirements 8.4**

  - [x] 8.5 Write property test for month filtering

    - **Property 17: Month filtering accuracy**
    - **Validates: Requirements 8.1**

- [x] 9. Backend API controllers and routes





  - [x] 9.1 Implement budget controller endpoints
    - GET /api/budgets - get budgets for month
    - POST /api/budgets - create budget
    - PUT /api/budgets/:id - update budget
    - DELETE /api/budgets/:id - delete budget
    - GET /api/budgets/summary - get overall summary
    - GET /api/budgets/history - get historical data
    - POST /api/budgets/copy - copy budgets between months
    - Add request validation and error handling
    - _Requirements: All_


  - [x] 9.2 Write unit tests for controller endpoints


    - Test request validation
    - Test error responses
    - Test success responses
    - Test authentication (if applicable)
    - _Requirements: All_

- [x] 10. Backend backup integration




  - [x] 10.1 Update backup service to include budgets


    - Add budgets table to backup query
    - Ensure budgets are included in backup file
    - Test backup contains budget data
    - _Requirements: 7.2_

  - [x] 10.2 Update restore service to restore budgets


    - Ensure budgets table is restored from backup
    - Test restore recreates budgets correctly
    - _Requirements: 7.3_


  - [x] 10.3 Write property test for backup round-trip

    - **Property 15: Backup round-trip**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 10.4 Write property test for persistence immediacy


    - **Property 16: Budget persistence immediacy**
    - **Validates: Requirements 7.1**

- [x] 11. Checkpoint - Backend complete





  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend API service





  - [x] 12.1 Create budgetApi.js service


    - getBudgets(year, month)
    - createBudget(year, month, category, limit)
    - updateBudget(id, limit)
    - deleteBudget(id)
    - getBudgetSummary(year, month)
    - getBudgetHistory(year, month, periodMonths)
    - copyBudgets(sourceYear, sourceMonth, targetYear, targetMonth, overwrite)
    - _Requirements: All_

- [x] 13. Frontend shared components






  - [x] 13.1 Create BudgetProgressBar component

    - Display progress bar with color coding
    - Show percentage and amounts
    - Display alert indicators at thresholds
    - Handle overflow (>100%) display
    - Responsive design
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3_


  - [x] 13.2 Create BudgetCard component

    - Display category name and icon
    - Show budget limit and spent amount
    - Display remaining/overage
    - Include BudgetProgressBar
    - Show trend indicator (if previous month data available)
    - _Requirements: 2.1, 2.2, 2.3, 3.4, 3.5_


  - [x] 13.3 Write unit tests for BudgetProgressBar

    - Test color coding logic
    - Test percentage calculation display
    - Test alert indicator display
    - Test overflow handling
    - _Requirements: 2.3, 2.5, 3.1, 3.2, 3.3_

- [x] 14. Frontend budget management modal




  - [x] 14.1 Create BudgetManagementModal component


    - Display list of budgetable categories (all 15 non-tax-deductible categories)
    - Show current budget limits
    - Allow editing budget limits inline
    - Add/remove budget buttons
    - Copy from previous month button
    - Save/cancel actions
    - Loading and error states
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 5.2, 5.3_


  - [x] 14.2 Add budget management modal CSS

    - Modal overlay and content styling
    - Budget list layout
    - Input field styling
    - Button styling
    - Alert/error message styling
    - Responsive design
    - _Requirements: 1.1_


  - [x] 14.3 Write unit tests for BudgetManagementModal

    - Test budget creation
    - Test budget update
    - Test budget deletion
    - Test validation errors
    - Test copy functionality
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 5.2_

- [x] 15. Frontend budget summary panel





  - [x] 15.1 Create BudgetSummaryPanel component


    - Display overall budget summary
    - Show total budgeted vs total spent
    - Display overall progress bar
    - Show count of budgets on track
    - List individual category budget cards
    - Button to open budget management modal
    - _Requirements: 2.1, 3.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 15.2 Add budget summary panel CSS


    - Panel layout and styling
    - Summary cards styling
    - Grid layout for category cards
    - Responsive design
    - _Requirements: 2.1, 6.2_

  - [x] 15.3 Write unit tests for BudgetSummaryPanel


    - Test summary calculations display
    - Test category cards rendering
    - Test modal opening
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 16. Frontend budget history view






  - [x] 16.1 Create BudgetHistoryView component

    - Display historical budget performance table
    - Show budget vs actual for each category
    - Display success rate per category
    - Show average spending
    - Period selector (3, 6, 12 months)
    - Export to CSV button (optional)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_


  - [x] 16.2 Add budget history view CSS

    - Table styling
    - Success/failure indicators
    - Period selector styling
    - Responsive table design
    - _Requirements: 4.1_



  - [x] 16.3 Write unit tests for BudgetHistoryView


    - Test data rendering
    - Test period selection
    - Test success rate display
    - _Requirements: 4.2, 4.3_

- [x] 17. Frontend integration with existing components





  - [x] 17.1 Add budget summary to SummaryPanel


    - Add budget section to monthly summary
    - Show quick budget status indicators
    - Link to full budget management
    - _Requirements: 3.5_

  - [x] 17.2 Update MonthSelector with budget access


    - Add "Manage Budgets" button
    - Add "Budget History" button
    - _Requirements: 1.1, 4.1_

  - [x] 17.3 Update App.jsx with budget modals


    - Add state for budget management modal
    - Add state for budget history modal
    - Handle modal open/close
    - Pass year/month props
    - _Requirements: 1.1, 4.1_

- [x] 18. Frontend real-time updates






  - [x] 18.1 Implement budget refresh on expense changes


    - Refresh budget data after expense add
    - Refresh budget data after expense edit
    - Refresh budget data after expense delete
    - Use refresh trigger pattern from existing code
    - _Requirements: 2.4, 8.2, 8.3_

  - [x] 18.2 Write integration tests for real-time updates


    - Test budget updates after expense operations
    - Test multiple rapid expense changes
    - _Requirements: 2.4, 8.2, 8.3_

- [x] 19. Checkpoint - Frontend complete





  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. End-to-end integration testing





  - [x] 20.1 Write integration test for complete budget flow


    - Create budget
    - Add expenses
    - Verify progress updates
    - Modify expense
    - Verify recalculation
    - Delete expense
    - Verify update
    - _Requirements: All core requirements_

  - [x] 20.2 Write integration test for budget copy flow


    - Create budgets in month A
    - Copy to month B
    - Verify budgets in month B
    - Verify month A unchanged
    - _Requirements: 5.2, 5.5_

  - [x] 20.3 Write integration test for historical analysis



    - Create budgets and expenses for multiple months
    - Request historical data
    - Verify calculations
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 21. Documentation and deployment





  - [x] 21.1 Update user documentation
    - Add budget feature to README
    - Create user guide for budget management
    - Document budget copy feature
    - Document historical analysis
    - _Requirements: All_


  - [x] 21.2 Update CHANGELOG.md

    - Add v3.7.0 entry
    - Document all new features
    - List breaking changes (none expected)
    - _Requirements: All_



  - [x] 21.3 Update version numbers
    - Update frontend/package.json to 3.7.0
    - Update backend/package.json to 3.7.0
    - Update App.jsx footer version
    - Update BackupSettings.jsx changelog
    - _Requirements: All_


  - [x] 21.4 Create deployment documentation


    - Document migration steps
    - Document rollback procedure
    - Create deployment checklist
    - _Requirements: All_

- [x] 22. Final checkpoint - All tests passing





  - Ensure all tests pass, ask the user if questions arise.
