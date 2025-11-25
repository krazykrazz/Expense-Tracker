# Implementation Plan

> **SUPERSEDED NOTICE**
> 
> This specification was superseded by the **Enhanced Fixed Expenses** feature in version 4.2.0 (November 2025).
> The enhanced version adds category and payment_type fields to fixed expenses, enabling better tracking and reporting.
> This spec is retained for historical reference only.
> 
> **Current Spec**: See `.kiro/specs/enhanced-fixed-expenses/` for the current implementation
> **Migration**: Database migration `add_category_payment_type_fixed_expenses_v1` automatically adds new fields with default values

- [x] 1. Set up database schema and repository layer





  - Create `fixed_expenses` table with year, month, name, amount fields
  - Add index on (year, month) for query performance
  - Implement FixedExpenseRepository with CRUD methods and carry-forward functionality
  - _Requirements: 1.4, 1.5, 2.5, 3.5, 4.3, 7.2, 7.4_

- [x] 2. Implement service layer with business logic





  - Create FixedExpenseService with validation methods
  - Implement getMonthlyFixedExpenses to return items and total
  - Implement createFixedExpense with validation (name required, amount non-negative)
  - Implement updateFixedExpense with validation
  - Implement deleteFixedExpense
  - Implement carryForwardFixedExpenses with previous month calculation logic
  - _Requirements: 1.2, 1.3, 2.3, 3.3, 3.4, 7.1_

- [x] 3. Create API endpoints and controller





  - Implement FixedExpenseController with request/response handling
  - Create GET /api/fixed-expenses/:year/:month endpoint
  - Create POST /api/fixed-expenses endpoint
  - Create PUT /api/fixed-expenses/:id endpoint
  - Create DELETE /api/fixed-expenses/:id endpoint
  - Create POST /api/fixed-expenses/carry-forward endpoint
  - Register routes in server.js
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.2, 7.2_

- [x] 4. Update expense service to include fixed expenses in summary





  - Modify ExpenseService.getMonthlySummary to fetch total fixed expenses
  - Include totalFixedExpenses in summary response
  - Update totalExpenses calculation to include fixed expenses
  - Update netBalance calculation to subtract fixed expenses
  - _Requirements: 6.1, 6.3, 6.4_
- [x] 5. Create FixedExpensesModal component




- [ ] 5. Create FixedExpensesModal component

  - [x] 5.1 Build modal structure and state management


    - Create FixedExpensesModal.jsx with props (isOpen, onClose, year, month, onUpdate)
    - Set up state for fixedExpenses list, totals, add/edit forms
    - Implement fetchFixedExpenses on mount and when year/month changes
    - _Requirements: 2.1, 2.2, 2.5, 5.3_
  
  - [x] 5.2 Implement add functionality


    - Create add form with name and amount inputs
    - Implement handleAddExpense with client-side validation
    - Call API to create fixed expense and refresh list
    - Update total display after adding
    - _Requirements: 1.1, 1.2, 1.3, 2.5_
  
  - [x] 5.3 Implement edit functionality


    - Add edit button for each fixed expense item
    - Implement inline edit mode with name and amount inputs
    - Implement handleEditExpense and handleSaveEdit
    - Call API to update fixed expense and refresh list
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 5.4 Implement delete functionality


    - Add delete button for each fixed expense item
    - Implement handleDeleteExpense with confirmation prompt
    - Call API to delete fixed expense and refresh list
    - Update total display after deletion
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 5.5 Implement carry forward functionality


    - Add carry forward button in modal header
    - Implement handleCarryForward with loading state
    - Show confirmation if current month already has items
    - Call API to carry forward and refresh list
    - Display message if previous month has no items
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 5.6 Implement total calculation and display


    - Calculate total from fixed expense items
    - Display total at bottom of modal
    - Update total when items are added, edited, or deleted
    - Show $0.00 or empty state message when no items exist
    - _Requirements: 2.3, 2.4_

- [x] 6. Style FixedExpensesModal component




  - Create FixedExpensesModal.css with modal overlay and container styles
  - Style list items with hover effects and inline edit mode
  - Style add form and carry forward button
  - Style total display section
  - Implement responsive design for mobile devices
  - _Requirements: 5.3_


- [x] 7. Integrate with SummaryPanel




  - Add state for showFixedExpensesModal
  - Add "Total Fixed Expenses" display row with amount
  - Add View/Edit button next to fixed expenses total
  - Implement handleOpenFixedExpensesModal and handleCloseFixedExpensesModal
  - Render FixedExpensesModal when showFixedExpensesModal is true
  - Refresh summary when modal closes to reflect changes
  - Update Total Expenses calculation to include fixed expenses
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 8. Add API service functions to frontend





  - Implement getMonthlyFixedExpenses API call
  - Implement createFixedExpense API call
  - Implement updateFixedExpense API call
  - Implement deleteFixedExpense API call
  - Implement carryForwardFixedExpenses API call
  - Add error handling for all API calls
  - _Requirements: 1.4, 2.1, 3.5, 4.3, 7.2_
