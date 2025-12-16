# Implementation Plan: Investment Tracking

- [x] 1. Set up database schema and migration




  - Create database migration script for investments and investment_values tables
  - Add investments table with columns: id, name, type, initial_value, created_at, updated_at
  - Add investment_values table with columns: id, investment_id, year, month, value, created_at, updated_at
  - Add foreign key constraint from investment_values.investment_id to investments.id with CASCADE delete
  - Add unique constraint on investment_values (investment_id, year, month)
  - Add CHECK constraint on type to enforce 'TFSA' or 'RRSP' only
  - Create indexes for performance: idx_investments_type, idx_investment_values_investment_id, idx_investment_values_year_month
  - Update database initialization in db.js to include new tables
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 2. Implement investment repository layer




  - [x] 2.1 Create investmentRepository.js with CRUD operations


    - Implement create(investment) method
    - Implement findAll() method
    - Implement findById(id) method
    - Implement update(id, investment) method
    - Implement delete(id) method
    - Implement getCurrentValue(investmentId) method to get most recent value entry
    - Implement getAllWithCurrentValues() method
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 3.3, 3.5_

  - [x] 2.2 Write property test for investment repository


    - **Property 1: Investment creation and persistence**
    - **Validates: Requirements 1.1, 5.1**

  - [x] 2.3 Write property test for investment type validation

    - **Property 2: Investment type validation**
    - **Validates: Requirements 1.2**

  - [x] 2.4 Write property test for investment update

    - **Property 3: Investment update persistence**
    - **Validates: Requirements 1.3**

  - [x] 2.5 Write property test for investment deletion

    - **Property 4: Investment deletion**
    - **Validates: Requirements 1.4**

  - [x] 2.6 Write property test for investment list retrieval

    - **Property 5: Investment list retrieval**
    - **Validates: Requirements 1.5**

- [x] 3. Implement investment value repository layer






  - [x] 3.1 Create investmentValueRepository.js with value operations

    - Implement create(valueEntry) method
    - Implement findByInvestment(investmentId) method to get all values for an investment
    - Implement findByInvestmentAndMonth(investmentId, year, month) method
    - Implement update(id, valueEntry) method
    - Implement delete(id) method
    - Implement upsert(valueEntry) method for create-or-update logic
    - Implement getValueHistory(investmentId) method with chronological sorting
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 4.1, 4.6, 4.7_


  - [x] 3.2 Write property test for value entry creation

    - **Property 6: Value entry creation and persistence**
    - **Validates: Requirements 2.1, 5.2**


  - [x] 3.3 Write property test for value entry uniqueness (PASSED)
    - **Property 7: Value entry uniqueness constraint**
    - **Validates: Requirements 2.2, 2.3**


  - [x] 3.4 Write property test for value entry sorting (PASSED)
    - **Property 10: Value entry chronological sorting**

    - **Validates: Requirements 2.6, 4.1**

  - [x] 3.5 Write property test for value entry update

    - **Property 17: Value entry update persistence**
    - **Validates: Requirements 4.6**


  - [x] 3.6 Write property test for value entry deletion (PASSED)
    - **Property 18: Value entry deletion**
    - **Validates: Requirements 4.7**

  - [x] 3.7 Write property test for referential integrity (PASSED)
    - **Property 19: Referential integrity cascade**
    - **Validates: Requirements 5.5**

- [x] 4. Implement investment service layer




  - [x] 4.1 Create investmentService.js with business logic


    - Implement validateInvestment(investment) method for name, type, initial_value validation
    - Implement createInvestment(data) method with validation
    - Implement updateInvestment(id, data) method with validation
    - Implement deleteInvestment(id) method
    - Implement getAllInvestments() method returning investments with current values
    - Implement calculateTotalInvestmentValue(investments) helper method
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.3, 3.4, 3.5, 6.1_

  - [x] 4.2 Write property test for current value retrieval


    - **Property 11: Current value retrieval**
    - **Validates: Requirements 3.3, 3.5**

  - [x] 4.3 Write property test for total portfolio value

    - **Property 12: Total portfolio value calculation**
    - **Validates: Requirements 3.4, 6.1**

- [x] 5. Implement investment value service layer






  - [x] 5.1 Create investmentValueService.js with value business logic

    - Implement validateValueEntry(entry) method for year, month, value validation
    - Implement createOrUpdateValue(data) method with upsert logic
    - Implement updateValue(id, data) method
    - Implement deleteValue(id) method
    - Implement getValueHistory(investmentId) method with change calculations
    - Implement calculateValueChange(currentValue, previousValue) helper method
    - Implement calculatePercentageChange(currentValue, previousValue) helper method
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.6, 4.7_


  - [x] 5.2 Write property test for value change calculation

    - **Property 8: Value change calculation**
    - **Validates: Requirements 2.4**


  - [x] 5.3 Write property test for percentage change calculation

    - **Property 9: Percentage change calculation**
    - **Validates: Requirements 2.5**

  - [x] 5.4 Write property test for value history structure


    - **Property 14: Value history structure**
    - **Validates: Requirements 4.2**

- [x] 6. Implement investment controller layer







  - [x] 6.1 Create investmentController.js with HTTP handlers

    - Implement getAllInvestments(req, res) for GET /api/investments
    - Implement createInvestment(req, res) for POST /api/investments
    - Implement updateInvestment(req, res) for PUT /api/investments/:id
    - Implement deleteInvestment(req, res) for DELETE /api/investments/:id
    - Add input validation and error handling for all endpoints
    - Return appropriate HTTP status codes (200, 201, 400, 404, 500)
    - _Requirements: 1.1, 1.3, 1.4, 1.5_


  - [x] 6.2 Create investmentValueController.js with value HTTP handlers

    - Implement getValueHistory(req, res) for GET /api/investment-values/:investmentId
    - Implement getValueForMonth(req, res) for GET /api/investment-values/:investmentId/:year/:month
    - Implement createOrUpdateValue(req, res) for POST /api/investment-values
    - Implement updateValue(req, res) for PUT /api/investment-values/:id
    - Implement deleteValue(req, res) for DELETE /api/investment-values/:id
    - Add input validation and error handling for all endpoints
    - Return appropriate HTTP status codes
    - _Requirements: 2.1, 2.2, 2.3, 4.6, 4.7_

- [x] 7. Create API routes





  - [x] 7.1 Create investmentRoutes.js


    - Define GET /api/investments route
    - Define POST /api/investments route
    - Define PUT /api/investments/:id route
    - Define DELETE /api/investments/:id route
    - Wire routes to investmentController methods
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 7.2 Create investmentValueRoutes.js


    - Define GET /api/investment-values/:investmentId route
    - Define GET /api/investment-values/:investmentId/:year/:month route
    - Define POST /api/investment-values route
    - Define PUT /api/investment-values/:id route
    - Define DELETE /api/investment-values/:id route
    - Wire routes to investmentValueController methods
    - _Requirements: 2.1, 2.2, 2.3, 4.6, 4.7_

  - [x] 7.3 Register routes in server.js


    - Import investmentRoutes and investmentValueRoutes
    - Register /api/investments routes
    - Register /api/investment-values routes
    - _Requirements: 1.1, 2.1_

- [x] 8. Enhance summary endpoint to include investment data




  - Modify expenseService.getSummary() to fetch investments
  - Call investmentService.getAllInvestments() to get all investments with current values
  - Calculate totalInvestmentValue from all investments
  - Add investments array and totalInvestmentValue to summary response object
  - _Requirements: 3.3, 3.4, 3.5, 6.1, 6.2_

- [x] 9. Create frontend API service






  - [x] 9.1 Create investmentApi.js service

    - Implement getAllInvestments() method
    - Implement createInvestment(investmentData) method
    - Implement updateInvestment(id, investmentData) method
    - Implement deleteInvestment(id) method
    - Add error handling for all API calls
    - _Requirements: 1.1, 1.3, 1.4, 1.5_



  - [x] 9.2 Create investmentValueApi.js service

    - Implement getValueHistory(investmentId) method
    - Implement getValueForMonth(investmentId, year, month) method
    - Implement createOrUpdateValue(valueData) method
    - Implement deleteValue(id) method
    - Add error handling for all API calls
    - _Requirements: 2.1, 2.2, 2.3, 4.6, 4.7_


  - [x] 9.3 Update config.js with new API endpoints

    - Add INVESTMENTS endpoint constant
    - Add INVESTMENT_VALUES endpoint constant
    - _Requirements: 1.1, 2.1_

- [x] 10. Enhance SummaryPanel component to display investments





  - Add investments state and totalInvestmentValue state
  - Fetch investment data from enhanced summary API response
  - Create investments section JSX below loans section
  - Display list of investments with name, type, and current value
  - Display total investment value prominently
  - Add "View/Edit" button to open investments modal
  - Handle empty state when no investments exist
  - Add CSS styling for investments section matching existing summary style
  - _Requirements: 3.3, 3.4, 3.5, 3.6, 6.2_

  - [x] 10.1 Write property test for currency formatting


    - **Property 13: Currency formatting**
    - **Validates: Requirements 3.6**

- [x] 11. Create InvestmentsModal component




  - [x] 11.1 Create InvestmentsModal.jsx with list interface


    - Create modal overlay structure with close button
    - Fetch all investments on modal open using investmentApi.getAllInvestments()
    - Display investment list with name, type, current value, and "View" button
    - Add "Add New Investment" button at top
    - Implement handleOpenInvestmentDetail(investmentId) to open detail view
    - Implement handleAddNewInvestment() to show add investment form
    - _Requirements: 1.5_

  - [x] 11.2 Add investment form functionality to InvestmentsModal

    - Create add/edit investment form with fields: name, type (TFSA/RRSP dropdown), initial_value
    - Implement form validation (required fields, initial_value >= 0, type in ['TFSA', 'RRSP'])
    - Implement handleCreateInvestment() using investmentApi.createInvestment()
    - Implement handleUpdateInvestment(id) using investmentApi.updateInvestment()
    - Implement handleDeleteInvestment(id) with confirmation dialog using investmentApi.deleteInvestment()
    - Show success/error messages for operations
    - Refresh investment list after create/update/delete
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 11.3 Create InvestmentsModal.css


    - Style modal overlay and container
    - Style investment list items
    - Style add/edit investment form
    - Style buttons and actions
    - Ensure responsive design for mobile
    - _Requirements: 1.5_

- [x] 12. Create InvestmentDetailView component







  - [x] 12.1 Create InvestmentDetailView.jsx structure






    - Create full-screen or large modal overlay
    - Add header with investment name and type with back button
    - Fetch investment details (passed as prop or fetched by ID)
    - Fetch value history using investmentValueApi.getValueHistory(investmentId)
    - Display investment summary card with initial value, current value, total change, percentage change
    - Calculate total change: currentValue - initial_value
    - Calculate percentage change: ((currentValue - initial_value) / initial_value) * 100
    - _Requirements: 4.1, 4.2_

  - [x] 12.2 Add line graph visualization to InvestmentDetailView


    - Install and configure charting library (Chart.js or similar)
    - Create line graph component showing value over time
    - X-axis: Month/Year
    - Y-axis: Value
    - Style graph to match existing chart styles
    - Make graph responsive to screen size
    - _Requirements: 4.5_

  - [x] 12.3 Add value history timeline to InvestmentDetailView


    - Display value history table with columns: Month/Year, Value, Change, % Change, Actions
    - Sort value entries chronologically (most recent first)
    - Calculate value change and percentage change from previous month for each entry
    - Apply arrow indicators: ▲ for increases, ▼ for decreases, — for no change
    - Apply color coding: green for increases, red for decreases, neutral for no change
    - Add edit and delete buttons for each value entry
    - Implement handleEditValue(id) to show inline edit form
    - Implement handleDeleteValue(id) with confirmation using investmentValueApi.deleteValue()
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

  - [x] 12.4 Write property test for change indicator logic


    - **Property 15: Change indicator logic**
    - **Validates: Requirements 4.3**

  - [x] 12.5 Write property test for color coding logic


    - **Property 16: Color coding logic**
    - **Validates: Requirements 4.4**

  - [x] 12.6 Add value entry form to InvestmentDetailView


    - Create add value entry form with month/year picker and value input
    - Implement form validation (month 1-12, year valid, value >= 0)
    - Implement handleAddValue() using investmentValueApi.createOrUpdateValue()
    - Show message if value entry already exists for selected month (will update)
    - Refresh value history after add/update
    - Auto-scroll to newly added entry
    - _Requirements: 2.1, 2.2, 2.3_


  - [x] 12.7 Add investment actions to InvestmentDetailView

    - Add "Edit Investment Details" button to open edit form
    - Update UI to reflect changes
    - _Requirements: 1.3_

  - [x] 12.8 Create InvestmentDetailView.css


    - Style modal overlay and container
    - Style investment summary card
    - Style line graph container
    - Style value history table
    - Style add/edit value forms
    - Style action buttons
    - Style arrow indicators and color coding
    - Ensure responsive design for mobile
    - _Requirements: 4.1, 4.3, 4.4_

- [x] 13. Wire InvestmentsModal to SummaryPanel





  - Add showInvestmentsModal state to SummaryPanel
  - Implement handleOpenInvestmentsModal() to set showInvestmentsModal to true
  - Implement handleCloseInvestmentsModal() to set showInvestmentsModal to false and refresh summary
  - Conditionally render InvestmentsModal when showInvestmentsModal is true
  - Pass year and month props to InvestmentsModal for context
  - Refresh summary data when modal closes to reflect any changes
  - _Requirements: 1.5, 6.2_

- [x] 14. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Add database backup integration




  - Verify investments and investment_values tables are included in existing backup operations
  - Test backup and restore with investment data
  - Update backup documentation if needed
  - _Requirements: 5.4_

- [x] 16. Integration testing and bug fixes





  - Test complete flow: create investment → add value entries → view in summary → view detail
  - Test type validation: verify only TFSA and RRSP are accepted
  - Test cascade delete: verify deleting investment removes all value entries
  - Test upsert: verify adding duplicate month/year updates existing entry
  - Test edge cases: no investments, no value entries, invalid types, negative values
  - Test line graph displays correctly with various data sets
  - Test arrow indicators and color coding work correctly
  - Fix any bugs discovered during testing
  - _Requirements: All_
