# Implementation Plan

> **⚠️ DEPRECATED - Feature Removed in v4.0.0**
> 
> This feature was removed from the Expense Tracker application in version 4.0.0 (November 2025).
> The recurring expenses functionality has been replaced by the **Fixed Expenses** feature for 
> predictable monthly costs. This spec is retained for historical reference only.
> 
> **Migration Information:**
> - See: `RECURRING_EXPENSES_REMOVAL.md` for removal details
> - See: `RECURRING_EXPENSES_REMOVAL_COMPLETE.md` for completion report
> - Database migration automatically converts generated expenses to regular expenses
> - Use Fixed Expenses feature for tracking predictable monthly obligations

- [x] 1. Set up database schema for recurring expenses


  - Add recurring_expenses table with all fields (place, amount, notes, type, method, day_of_month, start_month, end_month, paused)
  - Add recurring_id column to expenses table
  - Add is_generated column to expenses table
  - Create index on start_month and end_month
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Implement recurring expense repository




  - [x] 2.1 Create RecurringExpenseRepository class


    - Write create() method to insert new recurring templates
    - Write findAll() method to get all templates
    - Write findById() method to get specific template
    - Write findActive(year, month) method to get templates active for a month
    - Write update() method to update templates
    - Write delete() method to remove templates
    - Write togglePause() method to pause/resume templates
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 5.1, 5.3_

- [x] 3. Implement recurring expense service layer






  - [x] 3.1 Create RecurringExpenseService class

    - Write validation for recurring expense data
    - Implement createRecurring() method with validation
    - Implement getRecurringExpenses() method
    - Implement updateRecurring() method
    - Implement deleteRecurring() method
    - Implement pauseRecurring() method
    - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 5.1, 5.3_

  - [x] 3.2 Implement expense generation logic


    - Write getActiveTemplates() helper to filter templates by date range
    - Write generateExpensesForMonth() method
    - Handle day-of-month edge cases (31st in shorter months)
    - Check for existing generated expenses to avoid duplicates
    - Link generated expenses to recurring template via recurring_id
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Create recurring expense API endpoints





  - [x] 4.1 Create RecurringExpenseController


    - Implement POST /api/recurring endpoint to create templates
    - Implement GET /api/recurring endpoint to list all templates
    - Implement PUT /api/recurring/:id endpoint to update templates
    - Implement DELETE /api/recurring/:id endpoint to delete templates
    - Implement PATCH /api/recurring/:id/pause endpoint to pause/resume
    - Implement POST /api/recurring/generate endpoint to trigger generation
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 5.1, 5.3_

  - [x] 4.2 Integrate generation with expense fetching


    - Modify GET /api/expenses endpoint to trigger generation for requested month
    - Ensure generation happens before returning expense list
    - _Requirements: 2.1, 2.2_

- [x] 5. Create RecurringExpensesManager component





  - [x] 5.1 Build recurring expenses list UI


    - Create component to display all recurring templates
    - Show place, amount, type, method, day, date range, status
    - Add "Add New" button
    - Add edit, delete, pause/resume buttons for each template
    - Style with compact card layout
    - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.3_

  - [x] 5.2 Implement template management actions


    - Handle create template action
    - Handle edit template action
    - Handle delete template action with confirmation
    - Handle pause/resume toggle
    - Refresh list after actions
    - _Requirements: 3.2, 3.3, 5.1, 5.3_
-

- [x] 6. Create RecurringExpenseForm component



  - [x] 6.1 Build form UI


    - Create form with all fields (place, amount, type, method, day, start month, end month, notes)
    - Add month picker inputs for start/end dates
    - Add "Ongoing" checkbox to disable end month
    - Add day of month number input (1-31)
    - Style as modal dialog
    - _Requirements: 1.1, 1.2, 1.3, 1.4_


  - [x] 6.2 Implement form validation and submission









    - Validate all required fields
    - Validate day of month (1-31)
    - Validate end month >= start month
    - Handle form submission to create/update template
    - Show success/error messages
    - _Requirements: 1.1, 1.2, 1.3_
-

- [x] 7. Add visual indicators for generated expenses



  - [x] 7.1 Update ExpenseList component

    - Add recurring icon (🔄) for generated expenses
    - Check is_generated flag to show indicator
    - Add tooltip showing "Generated from recurring template"
    - _Requirements: 4.1, 4.2_

- [x] 8. Add recurring expenses button to UI




  - [x] 8.1 Add navigation to recurring expenses

    - Add "🔄 Recurring" button to header
    - Open RecurringExpensesManager in modal
    - Wire up all actions
    - _Requirements: 3.1_
-

- [x] 9. Handle edge cases and cleanup



  - [x] 9.1 Implement edge case handling


    - Handle day 31 in months with fewer days
    - Handle February 29-31 edge cases
    - Show "template deleted" for orphaned generated expenses
    - Ensure paused templates don't generate
    - _Requirements: 2.4, 5.2_

  - [x] 9.2 Update expense edit/delete to handle generated expenses







    - Allow editing generated expenses independently
    - Allow deleting individual generated expenses
    - Maintain recurring_id link after edits
    - _Requirements: 4.2, 4.3, 4.4, 5.4_

- [x] 10. Add recurring expenses to backup/import


  - [x] 10.1 Update backup to include recurring templates


    - Include recurring_expenses table in database backup
    - _Requirements: 3.1_

  - [x] 10.2 Update import to handle recurring fields


    - Skip recurring_id and is_generated during CSV import
    - _Requirements: 2.1_
