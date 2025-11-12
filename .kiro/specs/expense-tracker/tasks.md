# Implementation Plan

- [x] 1. Set up project structure and initialize backend






  - Create backend directory with Node.js/Express project structure
  - Initialize package.json with required dependencies (express, sqlite3, cors, body-parser)
  - Create folder structure: routes, controllers, services, repositories
  - Set up basic Express server with CORS and body-parser middleware
  - _Requirements: 1.1, 2.1_

- [x] 2. Implement database layer and expense repository





  - [x] 2.1 Create database initialization script


    - Write SQL schema for expenses table with all constraints
    - Create indexes on date, type, and method columns
    - Implement database connection and initialization logic
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [x] 2.2 Implement ExpenseRepository class


    - Write create() method to insert new expenses
    - Write findAll() method with optional year/month filtering
    - Write findById() method to retrieve single expense
    - Write delete() method to remove expenses
    - Write getSummary() method to calculate aggregated totals
    - _Requirements: 1.1, 2.1, 4.1, 7.1, 8.1, 9.1_

- [x] 3. Implement business logic and week calculation




  - [x] 3.1 Create utility function for week calculation


    - Write calculateWeek() function that takes a date and returns week number (1-5)
    - Implement logic: Math.ceil(dayOfMonth / 7)
    - _Requirements: 1.5_
  
  - [x] 3.2 Create expense service layer


    - Write service methods that wrap repository calls
    - Add week calculation to expense creation logic
    - Implement validation for required fields and data types
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 4. Implement REST API endpoints




  - [x] 4.1 Create POST /api/expenses endpoint


    - Write controller to handle expense creation
    - Validate request body (date, amount, type, method required)
    - Return created expense with 201 status
    - _Requirements: 1.1, 1.2_
  
  - [x] 4.2 Create GET /api/expenses endpoint

    - Write controller to retrieve expenses with optional year/month query params
    - Sort results by date descending
    - Return empty array when no expenses found
    - _Requirements: 2.1, 2.3, 2.4, 6.2_
  
  - [x] 4.3 Create DELETE /api/expenses/:id endpoint

    - Write controller to delete expense by ID
    - Return 404 if expense not found
    - Return success status on deletion
    - _Requirements: 4.1, 4.3_
  

  - [x] 4.4 Create GET /api/expenses/summary endpoint

    - Write controller to calculate weekly totals (weeks 1-5)
    - Calculate payment method totals for all 6 methods
    - Calculate Gas and Food type totals
    - Calculate overall total
    - Require year and month query parameters
    - _Requirements: 5.1, 5.2, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_

- [x] 5. Set up React frontend project





  - Create frontend directory with React application
  - Initialize package.json and install React dependencies
  - Set up basic App component structure
  - Configure API base URL for backend communication
  - _Requirements: 2.1_

- [x] 6. Implement expense form component




  - [x] 6.1 Create ExpenseForm component


    - Build form with inputs: date, place, notes, amount, type dropdown, method dropdown
    - Implement controlled inputs with React state
    - Add form validation for required fields
    - Handle form submission and call POST /api/expenses
    - Display success/error messages
    - Clear form after successful submission
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 3.1, 3.2_

- [x] 7. Implement month selector component




  - [x] 7.1 Create MonthSelector component


    - Build year dropdown with reasonable range (e.g., 2020-2030)
    - Build month dropdown (1-12 with month names)
    - Set default to current month and year
    - Emit selected values to parent component
    - _Requirements: 6.1, 6.3, 6.4_

- [x] 8. Implement expense list component




  - [x] 8.1 Create ExpenseList component


    - Build table with columns: Date, Place, Notes, Amount, Type, Week, Method
    - Display all expense fields from API response
    - Add delete button for each row with confirmation dialog
    - Handle delete action by calling DELETE /api/expenses/:id
    - Show "no expenses" message when list is empty
    - Format amount to 2 decimal places
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2_

- [x] 9. Implement search functionality






  - [x] 9.1 Create SearchBar component

    - Build text input for search query
    - Implement controlled input with React state
    - Emit search text to parent component
    - _Requirements: 10.1, 10.2_
  
  - [x] 9.2 Add search filtering logic


    - Filter expense list based on search text
    - Match against place and notes fields (case-insensitive)
    - Display "no results" message when search returns empty
    - Clear filter when search is empty
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

- [x] 10. Implement summary panel component




  - [x] 10.1 Create SummaryPanel component


    - Fetch summary data from GET /api/expenses/summary
    - Display weekly totals section (weeks 1-5)
    - Display payment method totals section (all 6 methods)
    - Display type totals section (Gas and Food)
    - Display overall total for the month
    - Format all amounts to 2 decimal places
    - Show zero for weeks/methods/types with no expenses
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_

- [x] 11. Integrate components in main App


  - [x] 11.1 Wire up App component


    - Manage selected month/year state
    - Fetch expenses when month changes
    - Pass data and callbacks to child components
    - Coordinate between ExpenseForm, MonthSelector, ExpenseList, SearchBar, and SummaryPanel
    - Handle loading and error states
    - Refresh expense list after add/delete operations
    - _Requirements: 2.1, 6.2_

- [x] 12. Add styling and polish





  - [x] 12.1 Create CSS styles


    - Style form inputs and buttons
    - Style expense table with proper spacing
    - Style summary panel with clear sections
    - Add responsive layout for different screen sizes
    - Ensure consistent color scheme and typography
    - _Requirements: 2.2_

- [x] 13. Implement edit expense functionality

  - [x] 13.1 Add PUT /api/expenses/:id endpoint
    - Write controller to handle expense updates
    - Validate request body with same rules as create
    - Recalculate week value when date is updated
    - Return updated expense object
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 13.2 Add update method to ExpenseRepository
    - Write update() method to modify existing expense in database
    - Use parameterized queries to prevent SQL injection
    - Return updated expense data
    - _Requirements: 12.1, 12.2_

  - [x] 13.3 Add edit functionality to ExpenseList component
    - Add edit button for each expense row
    - Display inline edit form when edit is clicked
    - Pre-populate form with current expense data
    - Handle event propagation to prevent conflicts
    - Call PUT /api/expenses/:id on form submission
    - Refresh expense list after successful update
    - _Requirements: 12.1, 12.2, 12.5, 12.6_

- [x] 14. Implement global search functionality

  - [x] 14.1 Update search to query all expenses
    - Modify search logic to remove month/year constraints
    - Search across entire expense database
    - Maintain case-insensitive matching
    - _Requirements: 10.4_

  - [x] 14.2 Update SearchBar component behavior
    - Ensure search works independently of month selector
    - Display results from all time periods
    - Show month/year for each result for context
    - _Requirements: 10.4, 10.6_

- [x] 15. Implement automated backup system

  - [x] 15.1 Create BackupService and BackupRepository
    - Write createBackup() method to copy database file with timestamp
    - Write getBackupList() method to list available backups
    - Write getLastBackupTime() method to track backup status
    - Implement file system operations for backup management
    - _Requirements: 13.1, 13.4, 13.6_

  - [x] 15.2 Add backup scheduling functionality
    - Install and configure node-cron for scheduled tasks
    - Write scheduling logic for daily/weekly/monthly backups
    - Store backup configuration in settings
    - Implement background service to run scheduled backups
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 15.3 Create backup API endpoints
    - Write POST /api/backup/create for manual backups
    - Write GET /api/backup/status to retrieve backup info
    - Write POST /api/backup/schedule to configure automation
    - Return appropriate status codes and messages
    - _Requirements: 13.5, 13.6_

- [x] 16. Implement import and restore functionality

  - [x] 16.1 Add restore method to BackupRepository
    - Write restoreBackup() method to replace current database
    - Write importBackup() method to merge data from backup file
    - Validate backup file integrity before operations
    - Handle file upload and processing
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 16.2 Create import/restore API endpoints
    - Write POST /api/backup/import for file uploads
    - Write POST /api/backup/restore for database restoration
    - Support multipart/form-data for file uploads
    - Return import/restore status and record counts
    - _Requirements: 14.1, 14.5_

  - [x] 16.3 Create BackupSettings component
    - Build settings interface for backup configuration
    - Add manual backup trigger button
    - Add file upload input for import functionality
    - Add restore functionality with confirmation dialog
    - Display last backup timestamp
    - Show backup/restore status messages
    - _Requirements: 14.1, 14.2, 14.4, 14.6_

- [x] 17. Implement annual summary view

  - [x] 17.1 Add getAnnualSummary method to ExpenseRepository
    - Write query to aggregate expenses by month for a year
    - Calculate category totals across the year
    - Calculate overall annual total
    - Return structured annual summary data
    - _Requirements: 15.2, 15.3, 15.4, 15.7_

  - [x] 17.2 Create GET /api/expenses/annual-summary endpoint
    - Write controller to handle annual summary requests
    - Require year query parameter
    - Return monthly breakdowns and category analysis
    - Format all amounts to 2 decimal places
    - _Requirements: 15.2, 15.6_

  - [x] 17.3 Create AnnualSummary component
    - Build year selector interface
    - Fetch annual summary data from API
    - Display monthly breakdown with totals
    - Display category analysis with type totals
    - Add visual charts/graphs for spending patterns
    - Display overall annual total
    - Format all amounts to 2 decimal places
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

- [x] 18. Implement high amount highlighting

  - [x] 18.1 Add high amount detection to ExpenseList
    - Check if expense amount >= 350
    - Apply conditional CSS class for high-value expenses
    - Ensure highlighting works alongside tax deductible styling
    - _Requirements: 16.1, 16.2, 16.4_

  - [x] 18.2 Create CSS styles for high amount highlighting
    - Add visual styling for high-value expenses
    - Use distinct visual indicator (border, font weight)
    - Ensure styling doesn't conflict with other row styles
    - _Requirements: 16.2, 16.3_

- [x] 19. Implement tax deductible type feature







  - [x] 19.1 Update database schema to support Tax Deductible type

    - Modify expenses table CHECK constraint to include 'Tax Deductible' as valid type option
    - Create database migration or update script to alter existing table
    - _Requirements: 11.1, 11.2_

  - [x] 19.2 Update backend to handle Tax Deductible type


    - Update expense validation logic to accept 'Tax Deductible' as valid type
    - Modify getSummary() method to calculate Tax Deductible total
    - Update API response to include Tax Deductible in typeTotals
    - _Requirements: 11.1, 11.2, 11.5, 11.6_


  - [x] 19.3 Update ExpenseForm component with Tax Deductible option

    - Add 'Tax Deductible' to type dropdown options
    - Ensure form validation accepts the new type
    - Test form submission with Tax Deductible type
    - _Requirements: 11.1, 11.2_


  - [x] 19.4 Add dark blue row highlighting for Tax Deductible expenses

    - Add conditional CSS class to expense rows based on type
    - Create CSS rule for dark blue background (#1e3a5f) with white text
    - Ensure text remains readable with proper contrast
    - _Requirements: 11.3_


  - [x] 19.5 Update SummaryPanel to display Tax Deductible total

    - Add Tax Deductible total display in type-specific totals section
    - Format Tax Deductible total to 2 decimal places
    - Position alongside Gas and Food totals
    - _Requirements: 11.5, 11.6_



  - [ ] 19.6 Update filtering to support Tax Deductible type
    - Ensure type filter dropdown includes Tax Deductible option
    - Verify filtering works correctly for Tax Deductible expenses
    - _Requirements: 11.4_
