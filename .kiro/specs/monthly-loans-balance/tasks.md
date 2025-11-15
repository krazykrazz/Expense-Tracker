# Implementation Plan: Monthly Loans Balance

- [x] 1. Set up database schema and migration





  - Create database migration script for loans and loan_balances tables
  - Add loans table with columns: id, name, initial_balance, start_date, notes, is_paid_off, created_at, updated_at
  - Add loan_balances table with columns: id, loan_id, year, month, remaining_balance, rate, created_at, updated_at
  - Add foreign key constraint from loan_balances.loan_id to loans.id with CASCADE delete
  - Add unique constraint on loan_balances (loan_id, year, month)
  - Create indexes for performance: idx_loans_paid_off, idx_loan_balances_loan_id, idx_loan_balances_year_month
  - Update database initialization in db.js to include new tables
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 2. Implement loan repository layer






  - [x] 2.1 Create loanRepository.js with CRUD operations

    - Implement create(loan) method
    - Implement findAll() method
    - Implement findById(id) method
    - Implement update(id, loan) method
    - Implement delete(id) method
    - Implement markPaidOff(id, isPaidOff) method
    - Implement getCurrentBalance(loanId) method to get most recent balance entry
    - Implement getAllWithCurrentBalances() method
    - Implement getLoansForMonth(year, month) method to filter by start_date
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 5.1, 5.2, 5.6_


  - [x] 2.2 Create loanBalanceRepository.js with balance operations

    - Implement create(balanceEntry) method
    - Implement findByLoan(loanId) method to get all balances for a loan
    - Implement findByLoanAndMonth(loanId, year, month) method
    - Implement update(id, balanceEntry) method
    - Implement delete(id) method
    - Implement upsert(balanceEntry) method for create-or-update logic
    - Implement getBalanceHistory(loanId) method with chronological sorting
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.4, 4.5_

- [x] 3. Implement loan service layer






  - [x] 3.1 Create loanService.js with business logic

    - Implement validateLoan(loan) method for name, initial_balance, start_date validation
    - Implement createLoan(data) method with validation
    - Implement updateLoan(id, data) method with validation
    - Implement deleteLoan(id) method
    - Implement markPaidOff(id, isPaidOff) method
    - Implement getAllLoans() method returning loans with current balances and current rates
    - Implement getLoansForMonth(year, month) method filtering by start_date and excluding paid off
    - Implement calculateTotalOutstandingDebt(loans) helper method
    - Implement getCurrentRate(loanId) helper to get most recent rate from balance entries
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 5.2, 5.3, 5.4_


  - [x] 3.2 Create loanBalanceService.js with balance business logic

    - Implement validateBalanceEntry(entry) method for year, month, remaining_balance, rate validation
    - Implement createOrUpdateBalance(data) method with upsert logic for both balance and rate
    - Implement updateBalance(id, data) method for both balance and rate
    - Implement deleteBalance(id) method
    - Implement getBalanceHistory(loanId) method with balance and rate change calculations
    - Implement calculateBalanceChange(currentBalance, previousBalance) helper method
    - Implement calculateRateChange(currentRate, previousRate) helper method
    - Implement autoMarkPaidOff(loanId, balance) to mark loan paid off when balance reaches zero
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1_

- [x] 4. Implement loan controller layer






  - [x] 4.1 Create loanController.js with HTTP handlers

    - Implement getAllLoans(req, res) for GET /api/loans
    - Implement createLoan(req, res) for POST /api/loans
    - Implement updateLoan(req, res) for PUT /api/loans/:id
    - Implement deleteLoan(req, res) for DELETE /api/loans/:id
    - Implement markPaidOff(req, res) for PUT /api/loans/:id/paid-off
    - Add input validation and error handling for all endpoints
    - Return appropriate HTTP status codes (200, 201, 400, 404, 500)
    - _Requirements: 1.1, 1.2, 1.3, 5.2, 5.6_


  - [x] 4.2 Create loanBalanceController.js with balance HTTP handlers

    - Implement getBalanceHistory(req, res) for GET /api/loan-balances/:loanId
    - Implement getBalanceForMonth(req, res) for GET /api/loan-balances/:loanId/:year/:month
    - Implement createOrUpdateBalance(req, res) for POST /api/loan-balances
    - Implement updateBalance(req, res) for PUT /api/loan-balances/:id
    - Implement deleteBalance(req, res) for DELETE /api/loan-balances/:id
    - Add input validation and error handling for all endpoints
    - Return appropriate HTTP status codes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.4, 4.5_

- [x] 5. Create API routes




  - [x] 5.1 Create loanRoutes.js


    - Define GET /api/loans route
    - Define POST /api/loans route
    - Define PUT /api/loans/:id route
    - Define DELETE /api/loans/:id route
    - Define PUT /api/loans/:id/paid-off route
    - Wire routes to loanController methods
    - _Requirements: 1.1, 1.2, 1.3, 5.2, 5.6_

  - [x] 5.2 Create loanBalanceRoutes.js


    - Define GET /api/loan-balances/:loanId route
    - Define GET /api/loan-balances/:loanId/:year/:month route
    - Define POST /api/loan-balances route
    - Define PUT /api/loan-balances/:id route
    - Define DELETE /api/loan-balances/:id route
    - Wire routes to loanBalanceController methods
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.4, 4.5_

  - [x] 5.3 Register routes in server.js


    - Import loanRoutes and loanBalanceRoutes
    - Register /api/loans routes
    - Register /api/loan-balances routes
    - _Requirements: 1.1, 2.1_

- [x] 6. Enhance summary endpoint to include loan data





  - Modify expenseService.getSummary() to fetch loans for the selected month
  - Call loanService.getLoansForMonth(year, month) to get applicable loans
  - Filter out paid off loans from summary response
  - Calculate totalOutstandingDebt from active loans
  - Add loans array and totalOutstandingDebt to summary response object
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 5.3, 5.4_

- [x] 7. Create frontend API service




  - [x] 7.1 Create loanApi.js service


    - Implement getAllLoans() method
    - Implement createLoan(loanData) method
    - Implement updateLoan(id, loanData) method
    - Implement deleteLoan(id) method
    - Implement markPaidOff(id, isPaidOff) method
    - Add error handling for all API calls
    - _Requirements: 1.1, 1.2, 1.3, 5.2, 5.6_


  - [x] 7.2 Create loanBalanceApi.js service

    - Implement getBalanceHistory(loanId) method
    - Implement getBalanceForMonth(loanId, year, month) method
    - Implement createOrUpdateBalance(balanceData) method
    - Implement deleteBalance(id) method
    - Add error handling for all API calls
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 4.4, 4.5_


  - [x] 7.3 Update config.js with new API endpoints

    - Add LOANS endpoint constant
    - Add LOAN_BALANCES endpoint constant

    - _Requirements: 1.1, 2.1_

- [x] 8. Enhance SummaryPanel component to display loans




  - Add loans state and totalOutstandingDebt state
  - Fetch loan data from enhanced summary API response
  - Create loans section JSX below balance sheet
  - Display list of active loans with name, rate, and current balance
  - Display total outstanding debt prominently
  - Add "View/Edit" button to open loans modal
  - Handle empty state when no active loans exist for selected month
  - Add CSS styling for loans section matching existing summary style
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
- [x] 9. Create LoansModal component




- [ ] 9. Create LoansModal component



  - [ ] 9.1 Create LoansModal.jsx with tabbed interface
    - Create modal overlay structure with close button
    - Implement tabbed interface: "Active Loans" and "Paid Off Loans"
    - Fetch all loans on modal open using loanApi.getAllLoans()
    - Filter loans into active (balance > 0) and paid off (balance = 0) arrays
    - Display loan list for active tab with name, rate, current balance, and "View" button
    - Display loan list for paid off tab with same structure
    - Add "Add New Loan" button at top
    - Implement handleOpenLoanDetail(loanId) to open detail view
    - Implement handleAddNewLoan() to show add loan form
    - _Requirements: 1.1, 1.4, 5.5_


  - [x] 9.2 Add loan form functionality to LoansModal

    - Create add/edit loan form with fields: name, initial_balance, start_date, notes (rate is tracked per month)
    - Implement form validation (required fields, initial_balance >= 0)
    - Implement handleCreateLoan() using loanApi.createLoan()
    - Implement handleUpdateLoan(id) using loanApi.updateLoan()
    - Implement handleDeleteLoan(id) with confirmation dialog using loanApi.deleteLoan()
    - Show success/error messages for operations
    - Refresh loan list after create/update/delete
    - _Requirements: 1.1, 1.2, 1.3_


  - [x] 9.3 Create LoansModal.css

    - Style modal overlay and container
    - Style tabbed interface
    - Style loan list items
    - Style add/edit loan form
    - Style buttons and actions
    - Ensure responsive design for mobile
    - _Requirements: 1.4_

- [x] 10. Create LoanDetailView component




  - [x] 10.1 Create LoanDetailView.jsx structure


    - Create full-screen or large modal overlay
    - Add header with loan name and back button
    - Fetch loan details using loanApi (passed as prop or fetched by ID)
    - Fetch balance history using loanBalanceApi.getBalanceHistory(loanId)
    - Display loan summary card with original amount, current balance, total paid down, current rate, start date
    - Calculate total paid down: initial_balance - currentBalance
    - Calculate paydown percentage: (total paid down / initial_balance) * 100
    - Display current rate from most recent balance entry
    - Display visual progress indicator for paydown percentage
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 10.2 Add balance history timeline to LoanDetailView


    - Display balance history table with columns: Month/Year, Remaining Balance, Interest Rate, Balance Change, Rate Change, Actions
    - Sort balance entries chronologically (most recent first)
    - Calculate balance change and rate change from previous month for each entry
    - Apply color coding: green for balance decreases (negative change), red for increases; visual indicator for rate changes
    - Add edit and delete buttons for each balance entry
    - Implement handleEditBalance(id) to show inline edit form for both balance and rate
    - Implement handleDeleteBalance(id) with confirmation using loanBalanceApi.deleteBalance()
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 10.3 Add balance entry form to LoanDetailView


    - Create add balance entry form with month/year picker, remaining_balance input, and rate input
    - Implement form validation (month 1-12, year valid, balance >= 0, rate >= 0)
    - Implement handleAddBalance() using loanBalanceApi.createOrUpdateBalance() with both balance and rate
    - Show message if balance entry already exists for selected month (will update both balance and rate)
    - Refresh balance history after add/update
    - Auto-scroll to newly added entry
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 10.4 Add loan actions to LoanDetailView

    - Add "Edit Loan Details" button to open edit form
    - Add "Mark as Paid Off" toggle button
    - Implement handleMarkPaidOff() using loanApi.markPaidOff()
    - Show confirmation when marking as paid off
    - Update UI to reflect paid off status
    - Add notes section with edit capability
    - _Requirements: 1.2, 5.1, 5.2, 5.6_

  - [x] 10.5 Create LoanDetailView.css


    - Style modal overlay and container
    - Style loan summary card
    - Style progress indicator
    - Style balance history table
    - Style add/edit balance forms
    - Style action buttons
    - Ensure responsive design for mobile
    - _Requirements: 4.1_
- [x] 11. Wire LoansModal to SummaryPanel




- [ ] 11. Wire LoansModal to SummaryPanel

  - Add showLoansModal state to SummaryPanel
  - Implement handleOpenLoansModal() to set showLoansModal to true
  - Implement handleCloseLoansModal() to set showLoansModal to false and refresh summary
  - Conditionally render LoansModal when showLoansModal is true
  - Pass year and month props to LoansModal for context
  - Refresh summary data when modal closes to reflect any changes
  - _Requirements: 1.4, 3.6_
-

- [x] 12. Add database backup integration




  - Verify loans and loan_balances tables are included in existing backup operations
  - Test backup and restore with loan data
  - Update backup documentation if needed
  - _Requirements: 6.4_


- [x] 13. Update API endpoint configuration



  - Add LOANS and LOAN_BALANCES endpoint constants to frontend config.js
  - Ensure API base URL is correctly configured
  - _Requirements: 1.1, 2.1_


- [x] 14. Integration testing and bug fixes



  - Test complete flow: create loan → add balance entries → view in summary → view detail → mark paid off
  - Test start_date filtering: verify loans only appear in months >= start_date
  - Test paid off behavior: verify loans with balance = 0 are hidden from summary but visible in modal
  - Test cascade delete: verify deleting loan removes all balance entries
  - Test upsert: verify adding duplicate month/year updates existing entry
  - Test edge cases: no loans, no balance entries, invalid dates, negative values
  - Fix any bugs discovered during testing
  - _Requirements: All_
