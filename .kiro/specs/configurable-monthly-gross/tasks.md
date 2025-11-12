# Implementation Plan

- [x] 1. Create database schema and migration





  - Create `income_sources` table with year, month, name, amount columns
  - Add index on year and month for query performance
  - Write migration script to convert existing `monthly_gross` records to `income_sources` entries
  - _Requirements: 1.4, 2.4_
-

- [x] 2. Implement Income Repository layer



  - [x] 2.1 Create `backend/repositories/incomeRepository.js` with CRUD methods


    - Implement `getIncomeSources(year, month)` to fetch all income sources for a month
    - Implement `getTotalMonthlyGross(year, month)` to calculate sum of income sources
    - Implement `createIncomeSource(incomeSource)` to add new income source
    - Implement `updateIncomeSource(id, updates)` to modify existing income source
    - Implement `deleteIncomeSource(id)` to remove income source
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.2, 2.5, 3.1, 3.5, 4.1, 4.3, 4.4_

- [x] 3. Implement Income Service layer






  - [x] 3.1 Create `backend/services/incomeService.js` with business logic

    - Implement `validateIncomeSource(incomeSource)` with validation rules for name and amount
    - Implement `getMonthlyIncome(year, month)` to return sources array and total
    - Implement `createIncomeSource(data)` with validation before repository call
    - Implement `updateIncomeSource(id, data)` with validation before repository call
    - Implement `deleteIncomeSource(id)` to delete income source
    - _Requirements: 1.2, 1.3, 2.3, 3.2, 3.3, 3.4, 4.2_

- [x] 4. Implement Income Controller and routes





  - [x] 4.1 Create `backend/controllers/incomeController.js` with HTTP handlers


    - Implement GET `/api/income/:year/:month` endpoint to fetch monthly income
    - Implement POST `/api/income` endpoint to create income source
    - Implement PUT `/api/income/:id` endpoint to update income source
    - Implement DELETE `/api/income/:id` endpoint to delete income source
    - Add error handling and appropriate HTTP status codes
    - _Requirements: 1.1, 1.4, 2.1, 3.1, 3.5, 4.1, 4.3_

  - [x] 4.2 Create `backend/routes/incomeRoutes.js` and register in server.js


    - Define routes for income endpoints
    - Register income routes in `server.js` under `/api/income`
    - _Requirements: 5.1, 5.2_

- [x] 5. Update existing expense repository for backward compatibility




  - [x] 5.1 Modify `ExpenseRepository.getMonthlyGross()` to query income_sources


    - Update method to sum amounts from `income_sources` table instead of `monthly_gross`
    - Ensure existing summary endpoint continues to work
    - _Requirements: 2.5, 5.5_

- [-] 6. Create Income Management Modal component



  - [x] 6.1 Create `frontend/src/components/IncomeManagementModal.jsx`


    - Implement modal structure with overlay and container
    - Add state management for income sources, editing, and adding
    - Implement `fetchIncomeSources()` to load data on mount and when year/month changes
    - Implement `handleAddSource()` to create new income source via API
    - Implement `handleEditSource()` and `handleSaveEdit()` for inline editing
    - Implement `handleDeleteSource()` with confirmation dialog
    - Implement `calculateTotal()` to sum all income source amounts
    - Display list of income sources with edit and delete buttons
    - Display add new source form with name and amount inputs
    - Display total monthly gross at bottom
    - Add close button to dismiss modal
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.5, 4.1, 4.3, 4.4, 5.2, 5.4_


  - [x] 6.2 Create `frontend/src/components/IncomeManagementModal.css`

    - Style modal overlay with semi-transparent background
    - Style modal container with centered positioning and max-width
    - Style income source list items with hover effects
    - Style inline edit mode inputs and buttons
    - Style add form inputs and button
    - Style total display section
    - Add responsive styles for mobile devices
    - _Requirements: 5.2_

- [x] 7. Update SummaryPanel to integrate modal





  - [x] 7.1 Modify `frontend/src/components/SummaryPanel.jsx`


    - Remove inline edit state and handlers (isEditingGross, grossInput, etc.)
    - Add state for modal visibility (showIncomeModal)
    - Replace edit button with "View/Edit" button that opens modal
    - Add IncomeManagementModal component with props (isOpen, onClose, year, month, onUpdate)
    - Implement `handleOpenIncomeModal()` to show modal
    - Implement `handleCloseIncomeModal()` to hide modal and refresh summary
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_


  - [x] 7.2 Update `frontend/src/components/SummaryPanel.css`

    - Update styles for new "View/Edit" button
    - Remove styles for inline edit inputs if no longer needed
    - _Requirements: 5.1_

- [x] 8. Add client-side validation and error handling






  - [x] 8.1 Add input validation in IncomeManagementModal

    - Validate name is not empty before submission
    - Validate amount is non-negative number with max 2 decimals
    - Display validation error messages inline
    - Disable submit buttons during API calls
    - _Requirements: 1.2, 1.3, 3.2, 3.3, 3.4_


  - [x] 8.2 Add error handling for API calls





    - Handle network errors with user-friendly messages
    - Handle validation errors from backend
    - Show loading states during operations
    - _Requirements: 2.4, 3.5, 4.4_
