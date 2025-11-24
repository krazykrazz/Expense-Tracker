# Implementation Plan

- [x] 1. Create category definition module and API





  - Create `backend/utils/categories.js` with complete category list and utility functions
  - Create `backend/controllers/categoryController.js` with GET endpoint
  - Create `backend/routes/categoryRoutes.js` and register in server.js
  - _Requirements: 1.1, 8.1, 8.3_

- [x] 1.1 Write property test for category validation


  - **Property 4: Category validation enforcement**
  - **Validates: Requirements 2.2, 2.3, 2.4, 2.5**

- [x] 2. Create and test database migration script








  - Create `backend/scripts/expandCategories.js` migration script
  - Implement backup creation before migration
  - Implement transaction-based migration with rollback capability
  - Update CHECK constraints on expenses, recurring_expenses, and budgets tables
  - Migrate all "Food" records to "Dining Out" in all three tables
  - Add verification and logging
  - _Requirements: 2.1, 2.2, 10.1, 10.2, 10.3, 10.5_

- [x] 2.1 Write unit tests for migration script


  - Test backup creation
  - Test "Food" to "Dining Out" migration
  - Test constraint updates
  - Test rollback on error
  - _Requirements: 9.1, 9.4, 10.1, 10.2, 10.3_

- [x] 3. Update backend service layer validation




  - Update `backend/services/expenseService.js` to import and use categories module
  - Update `backend/services/recurringExpenseService.js` to import and use categories module
  - Update validation error messages to reference new category list
  - _Requirements: 1.2, 1.3, 2.3_

- [x] 3.1 Write property test for expense category persistence


  - **Property 2: Category persistence round-trip**
  - **Validates: Requirements 1.2, 1.3**

- [x] 3.2 Write property test for recurring template category persistence


  - **Property 7: Recurring template category persistence**
  - **Validates: Requirements 4.1, 4.3, 4.4**

- [x] 3.3 Write property test for recurring generation consistency



  - **Property 8: Recurring template generation consistency**
  - **Validates: Requirements 4.2**

- [x] 4. Update budget service with expanded categories and suggestion feature





  - Update `backend/services/budgetService.js` to import and use categories module
  - Update budget validation to use BUDGETABLE_CATEGORIES
  - Implement `suggestBudgetAmount(year, month, category)` method
  - Calculate average spending over past 3-6 months
  - Round to nearest $50
  - Return 0 if no historical data
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4.1 Write property test for budget calculation accuracy


  - **Property 5: Budget calculation accuracy**
  - **Validates: Requirements 3.2, 3.3, 3.5**

- [x] 4.2 Write property test for budget status indication

  - **Property 6: Budget status indication**
  - **Validates: Requirements 3.4**

- [x] 5. Create budget suggestion API endpoint





  - Add `GET /api/budgets/suggest` endpoint to budgetController
  - Accept year, month, and category query parameters
  - Return suggested amount, average spending, and months analyzed
  - Add route to budgetRoutes.js
  - _Requirements: 3.1_

- [x] 5.1 Write unit tests for budget suggestion endpoint


  - Test with historical data (should return rounded average)
  - Test with no historical data (should return 0)
  - Test with insufficient data (should use available months)
  - _Requirements: 3.1_

- [x] 6. Update frontend expense form





  - Update `frontend/src/components/ExpenseForm.jsx` to fetch categories from API
  - Replace hardcoded typeOptions with API response
  - Update dropdown rendering to display all 14 categories
  - Maintain current UI/UX patterns
  - _Requirements: 1.1, 1.2_

- [x] 6.1 Write property test for category dropdown completeness


  - **Property 1: Category dropdown completeness**
  - **Validates: Requirements 1.1**

- [x] 7. Update frontend budget management modal





  - Update `frontend/src/components/BudgetManagementModal.jsx` category dropdown
  - Implement budget suggestion feature
  - Fetch suggestion when category is selected
  - Display suggested amount with explanation
  - Allow user to accept or modify suggestion
  - Show "No historical data" message when suggestion is $0
  - _Requirements: 3.1_

- [x] 8. Update frontend summary and list components




  - Update `frontend/src/components/SummaryPanel.jsx` to dynamically render all categories
  - Update layout to accommodate more categories (grid or scrolling)
  - Update `frontend/src/components/ExpenseList.jsx` filter dropdown
  - Ensure trend indicators work with new categories
  - _Requirements: 1.5, 6.1, 6.3_

- [x] 8.1 Write property test for category filtering accuracy


  - **Property 3: Category filtering accuracy**
  - **Validates: Requirements 1.5**

- [x] 8.2 Write property test for category aggregation correctness



  - **Property 10: Category aggregation correctness**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 9. Update CSV import validation





  - Update `validate_csv.py` with new category list
  - Update validation error messages
  - Update documentation/comments
  - Update `backend/controllers/expenseController.js` CSV import handler
  - Ensure validation uses categories module
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 9.1 Write property test for CSV import validation


  - **Property 9: CSV import category validation**
  - **Validates: Requirements 5.1, 5.3, 5.4**

- [x] 10. Update tax-deductible functionality





  - Verify `backend/services/expenseService.js` getTaxDeductibleSummary works with new categories
  - Verify `frontend/src/components/TaxDeductible.jsx` displays all tax-deductible categories
  - Ensure tax reports include both "Tax - Medical" and "Tax - Donation"
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 10.1 Write property test for tax-deductible identification


  - **Property 11: Tax-deductible category identification**
  - **Validates: Requirements 7.2, 7.3, 7.5**

- [x] 11. Run database migration





  - Create backup of production database
  - Run `backend/scripts/expandCategories.js` migration script
  - Verify migration success
  - Verify no "Food" records remain
  - Verify "Dining Out" records exist
  - Test expense creation with new categories
  - _Requirements: 9.1, 9.2, 9.4, 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 12. Integration testing and verification





  - Test end-to-end expense creation with all new categories
  - Test budget creation with new categories and suggestion feature
  - Test recurring expense creation and generation with new categories
  - Test CSV import with new categories
  - Test summary and report generation with new categories
  - Test filtering and searching with new categories
  - Verify historical data displays correctly with updated categories
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 4.1, 5.1, 6.1, 9.5_

- [x] 13. Final checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
