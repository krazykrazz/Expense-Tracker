# Implementation Plan: Medical Expense People Tracking

- [x] 1. Database setup and migrations





  - Create `people` table with id, name, date_of_birth, timestamps
  - Create `expense_people` junction table with expense_id, person_id, amount
  - Add foreign key constraints with CASCADE DELETE
  - Add unique constraint on (expense_id, person_id)
  - Create database migration script
  - _Requirements: 1.1, 1.4, 2.5_

- [x] 2. Backend repository layer





  - [x] 2.1 Implement peopleRepository with CRUD operations


    - Create person with name and optional date of birth
    - Get person by ID
    - Get all people
    - Update person details
    - Delete person (with cascade to expense associations)
    - _Requirements: 1.2, 1.3, 1.4, 1.5_


  - [x] 2.2 Write property test for person storage round-trip

    - **Property 1: Person data round-trip**
    - **Validates: Requirements 1.3**

  - [x] 2.3 Write property test for person deletion cascade

    - **Property 2: Person deletion cascades to expense associations**
    - **Validates: Requirements 1.4**

  - [x] 2.4 Implement expensePeopleRepository for junction table operations


    - Create expense-person associations with amounts
    - Get people for expense
    - Update person allocations for expense
    - Delete associations by expense or person
    - _Requirements: 2.5, 4.5_

  - [x] 2.5 Write property test for person-amount relationship storage


    - **Property 5: Person-amount relationship storage**
    - **Validates: Requirements 2.5, 4.5**

- [x] 3. Backend service layer - people management





  - [x] 3.1 Implement peopleService core methods

    - createPerson(name, dateOfBirth)
    - updatePerson(id, name, dateOfBirth)
    - deletePerson(id) - with cascade warning
    - getAllPeople()
    - getPersonById(id)
    - Validate person name is not empty
    - _Requirements: 1.2, 1.3, 1.4, 1.5_


  - [x] 3.2 Write property test for person updates propagation


    - **Property 3: Person updates propagate to associated expenses**
    - **Validates: Requirements 1.5**


  - [x] 3.3 Write unit tests for people service validation

    - Test name validation (reject empty names)
    - Test date of birth validation
    - Test duplicate name handling
    - Test person deletion with associated expenses
    - _Requirements: 1.2, 1.3, 1.4_

- [x] 4. Backend service layer - expense-people integration





  - [x] 4.1 Enhance expenseService with people support


    - createExpenseWithPeople(expenseData, personAllocations)
    - updateExpenseWithPeople(id, expenseData, personAllocations)
    - getExpenseWithPeople(id)
    - validatePersonAllocations(totalAmount, allocations)
    - _Requirements: 2.2, 2.4, 2.5_


  - [x] 4.2 Write property test for amount allocation validation

    - **Property 4: Amount allocation validation**
    - **Validates: Requirements 2.4, 4.4**

  - [x] 4.3 Write property test for single person assignment


    - **Property 6: Single person assignment**
    - **Validates: Requirements 4.1**

  - [x] 4.4 Write unit tests for expense-people integration


    - Test single person expense creation
    - Test multi-person expense creation
    - Test allocation validation errors
    - Test expense update with people changes
    - _Requirements: 2.2, 2.4, 4.1_

- [x] 5. Backend service layer - tax reporting enhancements






  - [x] 5.1 Enhance tax deductible reporting with people grouping

    - getTaxDeductibleWithPeople(year)
    - groupExpensesByPerson(expenses)
    - calculatePersonTotals(expenses)
    - handleUnassignedExpenses(expenses)
    - _Requirements: 3.1, 3.2, 3.3, 5.2, 5.5_


  - [x] 5.2 Write property test for person-grouped aggregation

    - **Property 7: Person-grouped expense aggregation**
    - **Validates: Requirements 3.2**


  - [x] 5.3 Write property test for tax summary calculation

    - **Property 8: Tax summary calculation accuracy**
    - **Validates: Requirements 3.5**


  - [x] 5.4 Write property test for mixed data handling

    - **Property 10: Mixed data handling**
    - **Validates: Requirements 5.4, 5.5**

- [x] 6. Backend API controllers and routes





  - [x] 6.1 Implement peopleController endpoints


    - GET /api/people - get all people
    - POST /api/people - create person
    - PUT /api/people/:id - update person
    - DELETE /api/people/:id - delete person
    - Add request validation and error handling
    - _Requirements: 1.2, 1.3, 1.4, 1.5_


  - [x] 6.2 Enhance expenseController with people support

    - Modify POST /api/expenses to accept people allocations
    - Modify PUT /api/expenses/:id to handle people updates
    - Modify GET /api/expenses/:id to include people data
    - Enhance GET /api/expenses/tax-deductible to support person grouping
    - _Requirements: 2.2, 2.4, 2.5, 3.1, 3.2_

  - [x] 6.3 Write unit tests for people controller endpoints


    - Test CRUD operations
    - Test validation errors
    - Test cascade delete warnings
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [x] 7. Backend backward compatibility






  - [x] 7.1 Ensure existing medical expenses remain functional

    - Update expense queries to handle optional people associations
    - Modify tax deductible queries to include unassigned expenses
    - Add "Unassigned" grouping for expenses without people
    - _Requirements: 5.1, 5.2, 5.3_


  - [x] 7.2 Write property test for backward compatibility

    - **Property 9: Backward compatibility preservation**
    - **Validates: Requirements 5.1, 5.3**


  - [x] 7.3 Write property test for unassigned expense identification

    - **Property 11: Unassigned expense identification**
    - **Validates: Requirements 6.1, 6.5**

- [x] 8. Checkpoint - Backend complete







  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend API service





  - [x] 9.1 Create peopleApi.js service


    - getPeople()
    - createPerson(name, dateOfBirth)
    - updatePerson(id, name, dateOfBirth)
    - deletePerson(id)
    - _Requirements: 1.2, 1.3, 1.4, 1.5_


  - [x] 9.2 Enhance existing API services for people support

    - Update expenseApi.js to handle people allocations
    - Update createExpense and updateExpense methods
    - Add getExpenseWithPeople method
    - _Requirements: 2.2, 2.4, 2.5_

- [x] 10. Frontend people management components






  - [x] 10.1 Create PeopleManagementModal component

    - Display list of family members
    - Add new person form with name and date of birth
    - Edit existing person inline
    - Delete person with cascade confirmation
    - Loading and error states
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_



  - [x] 10.2 Add people management modal CSS

    - Modal overlay and content styling
    - Person list layout
    - Form input styling
    - Delete confirmation styling
    - Responsive design
    - _Requirements: 1.1_

  - [x] 10.3 Write unit tests for PeopleManagementModal


    - Test person creation
    - Test person editing
    - Test person deletion with confirmation
    - Test validation errors
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [x] 11. Frontend expense form enhancements





  - [x] 11.1 Enhance ExpenseForm with people selection


    - Add people dropdown for medical expenses (Tax - Medical category)
    - Show people selection only for medical expenses
    - Handle single person selection (auto-assign full amount)
    - Handle multiple people selection (trigger allocation modal)
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2_


  - [x] 11.2 Create PersonAllocationModal component

    - Display selected people with amount input fields
    - Show total allocated vs expense amount
    - Add "Split Equally" button for convenience
    - Validate allocations sum to total
    - Save and cancel actions
    - _Requirements: 2.3, 2.4, 4.3, 4.4, 4.5_


  - [x] 11.3 Add person allocation modal CSS

    - Modal styling
    - Allocation form layout
    - Validation error styling
    - Split equally button styling
    - _Requirements: 2.3, 4.3_

  - [x] 11.4 Write unit tests for enhanced ExpenseForm


    - Test people dropdown visibility for medical expenses
    - Test single person selection
    - Test multiple people selection
    - Test allocation modal triggering
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2_

- [ ] 12. Frontend tax deductible enhancements
  - [ ] 12.1 Enhance TaxDeductible component with person grouping
    - Add toggle for person-grouped view
    - Display medical expenses grouped by person
    - Show subtotals per provider for each person
    - Display "Unassigned" section for expenses without people
    - Add quick assign functionality for unassigned expenses
    - _Requirements: 3.1, 3.2, 3.3, 5.2, 6.1, 6.2_

  - [ ] 12.2 Add person grouping CSS
    - Person group styling
    - Provider subtotal styling
    - Unassigned section styling
    - Quick assign button styling
    - _Requirements: 3.1, 6.1_

  - [ ] 12.3 Write unit tests for enhanced TaxDeductible
    - Test person grouping toggle
    - Test person-grouped display
    - Test unassigned expense handling
    - Test quick assign functionality
    - _Requirements: 3.1, 3.2, 6.1, 6.2_

- [ ] 13. Frontend settings integration
  - [ ] 13.1 Add People Management to BackupSettings
    - Add "People" tab to settings modal
    - Include PeopleManagementModal in settings
    - Add navigation between settings tabs
    - _Requirements: 1.1_

  - [ ] 13.2 Update settings modal CSS
    - Add tab styling for People section
    - Ensure consistent styling with other tabs
    - _Requirements: 1.1_

- [ ] 14. Frontend visual indicators and UX
  - [ ] 14.1 Add visual indicators for medical expenses
    - Add person icon/badge for medical expenses with people
    - Add "unassigned" indicator for medical expenses without people
    - Show person count in expense list
    - _Requirements: 6.5_

  - [ ] 14.2 Enhance expense list with people information
    - Display assigned people names in expense list
    - Show allocation amounts for multi-person expenses
    - Add tooltip with full person details
    - _Requirements: 3.4, 6.5_

  - [ ] 14.3 Write unit tests for visual indicators
    - Test person indicators display
    - Test unassigned indicators
    - Test person information in expense list
    - _Requirements: 6.5_

- [ ] 15. Frontend assignment workflow
  - [ ] 15.1 Implement quick assign functionality
    - Add assign person button to unassigned medical expenses
    - Create quick assign dropdown
    - Handle assignment and refresh views
    - _Requirements: 6.2, 6.3_

  - [ ] 15.2 Write property test for assignment workflow
    - **Property 12: Assignment workflow correctness**
    - **Validates: Requirements 6.3**

  - [ ] 15.3 Write property test for report filtering
    - **Property 13: Report filtering accuracy**
    - **Validates: Requirements 6.4**

- [ ] 16. Frontend integration and real-time updates
  - [ ] 16.1 Integrate people management with existing components
    - Update App.jsx to include people management modal
    - Add people state management
    - Handle people updates across components
    - _Requirements: 1.1_

  - [ ] 16.2 Implement real-time updates
    - Refresh people data after CRUD operations
    - Update expense displays after people changes
    - Refresh tax summaries after assignments
    - _Requirements: 1.5, 6.3_

- [ ] 17. Checkpoint - Frontend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. End-to-end integration testing
  - [ ] 18.1 Write integration test for complete people management flow
    - Create person
    - Create medical expense with person
    - View in tax deductible summary
    - Edit person details
    - Verify updates in expense displays
    - _Requirements: All people management requirements_

  - [ ] 18.2 Write integration test for expense allocation flow
    - Create multi-person medical expense
    - Allocate amounts across people
    - Verify storage and retrieval
    - View in person-grouped tax summary
    - _Requirements: All allocation requirements_

  - [ ] 18.3 Write integration test for backward compatibility
    - Test existing medical expenses without people
    - Verify they display as "Unassigned"
    - Add people to existing expense
    - Verify updated display
    - _Requirements: All backward compatibility requirements_

- [ ] 19. Documentation and deployment
  - [ ] 19.1 Update user documentation
    - Add people management feature to README
    - Create user guide for medical expense people tracking
    - Document person allocation workflow
    - Document tax reporting enhancements
    - _Requirements: All_

  - [ ] 19.2 Update CHANGELOG.md
    - Add new version entry
    - Document all new features
    - List database migration requirements
    - _Requirements: All_

  - [ ] 19.3 Update version numbers
    - Update frontend/package.json
    - Update backend/package.json
    - Update App.jsx footer version
    - Update BackupSettings.jsx changelog
    - _Requirements: All_

  - [ ] 19.4 Create deployment documentation
    - Document database migration steps
    - Document rollback procedure
    - Create deployment checklist
    - _Requirements: All_

- [ ] 20. Final checkpoint - All tests passing
  - Ensure all tests pass, ask the user if questions arise.