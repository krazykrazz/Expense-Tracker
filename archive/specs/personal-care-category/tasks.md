# Implementation Plan

- [x] 1. Update backend category definitions





  - Add "Personal Care" to CATEGORIES array in `backend/utils/categories.js`
  - Add "Personal Care" to BUDGETABLE_CATEGORIES array in `backend/utils/categories.js`
  - Ensure alphabetical ordering is maintained (between "Insurance" and "Pet Care")
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3_

- [x] 1.1 Write property test for category validation


  - **Property 1: Category validation accepts Personal Care**
  - **Validates: Requirements 1.2, 3.3**

- [x] 1.2 Write property test for budgetable categories

  - **Property 2: Personal Care is budgetable**
  - **Validates: Requirements 1.5, 3.2**

- [x] 1.3 Write property test for tax-deductible check

  - **Property 3: Personal Care is not tax-deductible**
  - **Validates: Requirements 3.3**

- [x] 2. Create database migration for Personal Care category





  - Create new migration function `migrateAddPersonalCareCategory()` in `backend/database/migrations.js`
  - Follow the pattern from `migrateAddClothingCategory()` and `migrateFixCategoryConstraints()`
  - Include migration name: `add_personal_care_category_v1`
  - Create automatic backup before migration
  - Update expenses table CHECK constraint to include "Personal Care"
  - Update budgets table CHECK constraint to include "Personal Care"
  - Recreate indexes after table updates
  - Mark migration as applied in schema_migrations table
  - Add migration to `runMigrations()` function
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2.1 Write property test for database constraints


  - **Property 4: Database constraint accepts Personal Care**
  - **Validates: Requirements 1.2, 2.3**

- [x] 2.2 Write property test for migration data preservation


  - **Property 5: Migration preserves existing data**
  - **Validates: Requirements 2.1, 2.2**

- [x] 3. Update CSV validation scripts





  - Add "Personal Care" to valid categories in `validate_csv.py`
  - Add "Personal Care" to valid categories in `xls_to_csv.py`
  - Ensure alphabetical ordering matches backend
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 3.1 Write property test for CSV import


  - **Property 6: CSV import accepts Personal Care**
  - **Validates: Requirements 4.1, 4.2**

- [x] 4. Verify frontend category handling





  - Check if `frontend/src/components/ExpenseForm.jsx` has hardcoded categories
  - Check if `frontend/src/components/BudgetManagementModal.jsx` has hardcoded categories
  - Check if `frontend/src/utils/constants.js` defines categories
  - If categories are hardcoded, add "Personal Care" in alphabetical order
  - If categories are fetched from backend, verify API integration works
  - _Requirements: 1.1, 1.5, 5.1, 5.2, 5.3, 5.4_

- [x] 4.1 Write property test for category list ordering


  - **Property 7: Category list ordering is maintained**
  - **Validates: Requirements 1.1, 3.1**

- [x] 5. Update documentation





  - Update `.kiro/steering/product.md` to include "Personal Care" in category list
  - Update `README.md` if it lists categories
  - Update any other documentation that references the category list
  - _Requirements: 3.1_

- [x] 6. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integration testing





  - Test creating expense with "Personal Care" category via API
  - Test creating budget for "Personal Care" category
  - Test CSV import with "Personal Care" expenses
  - Test monthly and annual summaries include "Personal Care"
  - Test budget tracking and alerts for "Personal Care"
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
