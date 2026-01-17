# Implementation Plan: Multi-Invoice Support

## Overview

This implementation plan converts the single-invoice system to support multiple invoices per expense with optional person linking. The work is organized to build incrementally, with database changes first, then backend API updates, and finally frontend UI changes.

## Tasks

- [x] 1. Database Schema Migration
  - [x] 1.1 Create migration function `migrateMultiInvoiceSupport` in `backend/database/migrations.js`
    - Remove UNIQUE constraint on expense_id
    - Add person_id column with FK to people table (ON DELETE SET NULL)
    - Preserve all existing invoice data
    - Create indexes for person_id
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 1.2 Write property test for migration data preservation
    - **Property 7: Migration Data Preservation**
    - **Validates: Requirements 3.3**
  
  - [x] 1.3 Add migration to `runMigrations` function
    - Ensure migration runs on container startup
    - _Requirements: 3.1, 3.2_

- [x] 2. Backend Repository Layer Updates
  - [x] 2.1 Modify `invoiceRepository.js` to support multiple invoices
    - Update `create()` to accept optional personId parameter
    - Add `findAllByExpenseId()` method returning array with person info
    - Add `updatePersonId()` method for changing person association
    - Add `getCountByExpenseId()` method
    - Add `clearPersonIdForExpense()` method
    - Modify `deleteByExpenseId()` to delete all invoices for expense
    - _Requirements: 1.1, 1.2, 1.5, 2.2, 2.3, 2.5, 8.1_
  
  - [x] 2.2 Write property tests for repository layer
    - **Property 2: Invoice Uniqueness Within Expense**
    - **Property 4: Invoice Retrieval Ordering**
    - **Property 5: Person ID Storage Consistency**
    - **Validates: Requirements 1.2, 1.5, 2.2, 2.3**

- [x] 3. Backend Service Layer Updates
  - [x] 3.1 Modify `invoiceService.js` to support multiple invoices
    - Update `uploadInvoice()` to accept optional personId, validate person belongs to expense
    - Add `getInvoicesForExpense()` returning array of invoices with person names
    - Add `deleteInvoiceById()` for deleting specific invoice
    - Add `updateInvoicePersonLink()` for changing person association
    - Remove single-invoice restriction (no longer check for existing invoice)
    - _Requirements: 1.1, 2.2, 2.3, 8.2, 8.3, 8.4_
  
  - [x] 3.2 Write property tests for service layer
    - **Property 1: Multiple Invoice Addition Preserves Collection**
    - **Property 3: Cascade Delete Removes All Invoices**
    - **Property 6: Person Removal Sets Invoice Link to NULL**
    - **Property 10: Upload Failure Isolation**
    - **Validates: Requirements 1.1, 1.3, 2.5, 5.4**

- [x] 4. Checkpoint - Backend Core Complete
  - Ensure all backend tests pass
  - Verify migration works on test database
  - Ask the user if questions arise

- [x] 5. Backend Controller and Routes Updates
  - [x] 5.1 Modify `invoiceController.js` for multi-invoice operations
    - Update `uploadInvoice` to accept personId from request body
    - Modify `getInvoice` to return array of invoices (or add new endpoint)
    - Add `getInvoiceFile` for retrieving specific invoice by ID
    - Add `deleteInvoiceById` for deleting specific invoice
    - Add `updateInvoicePersonLink` for PATCH endpoint
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 5.2 Update `invoiceRoutes.js` with new endpoints
    - GET /api/invoices/:expenseId - returns all invoices (array)
    - GET /api/invoices/:expenseId/:invoiceId - returns specific invoice file
    - DELETE /api/invoices/:invoiceId - deletes specific invoice
    - PATCH /api/invoices/:invoiceId - updates person association
    - Maintain backward compatibility for existing endpoints
    - _Requirements: 8.1, 8.3, 8.4, 9.1_
  
  - [x] 5.3 Write property tests for API layer
    - **Property 14: GET Endpoint Returns All Invoices**
    - **Property 9: File Validation Consistency**
    - **Property 15: DELETE by ID Removes Specific Invoice**
    - **Property 16: PATCH Updates Person Association**
    - **Validates: Requirements 8.1, 5.3, 8.3, 8.4**

- [ ] 6. Frontend API Service Updates
  - [ ] 6.1 Update `frontend/src/services/invoiceApi.js`
    - Modify `uploadInvoice` to accept optional personId
    - Add `getInvoicesForExpense` returning array
    - Add `deleteInvoiceById` for specific invoice deletion
    - Add `updateInvoicePersonLink` for PATCH calls
    - Update API endpoint constants in config.js
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 7. Frontend InvoiceList Component (New)
  - [ ] 7.1 Create `InvoiceList.jsx` component
    - Display scrollable list of invoices
    - Show filename, size, date, person name for each
    - Individual view and delete buttons
    - Click to open PDF viewer
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [ ] 7.2 Create `InvoiceList.css` styles
    - Scrollable container with max-height
    - Invoice item styling with hover states
    - Action button styling
    - _Requirements: 4.1_
  
  - [ ] 7.3 Write tests for InvoiceList component
    - **Property 8: Invoice Display Contains Required Fields**
    - **Validates: Requirements 4.2**

- [ ] 8. Frontend InvoiceUpload Component Updates
  - [ ] 8.1 Modify `InvoiceUpload.jsx` for multi-invoice support
    - Accept `existingInvoices` array prop (rename from existingInvoice)
    - Accept `people` prop for person dropdown
    - Show InvoiceList when invoices exist
    - Add "Add Invoice" button when invoices exist
    - Add person selection dropdown in upload form
    - _Requirements: 5.1, 5.2, 2.1_
  
  - [ ] 8.2 Update `InvoiceUpload.css` for new layout
    - Styling for Add Invoice button
    - Person dropdown styling
    - Layout adjustments for invoice list + upload area
    - _Requirements: 5.1, 5.2_
  
  - [ ] 8.3 Write tests for updated InvoiceUpload
    - Test person dropdown visibility
    - Test Add Invoice button appearance
    - Test upload with person selection
    - _Requirements: 2.1, 5.1, 5.2_

- [ ] 9. Checkpoint - Core Multi-Invoice UI Complete
  - Ensure frontend components render correctly
  - Test upload flow with person selection
  - Ask the user if questions arise

- [ ] 10. Frontend InvoiceIndicator Updates
  - [ ] 10.1 Modify `InvoiceIndicator.jsx` for count display
    - Accept `invoiceCount` prop
    - Accept `invoices` array for tooltip
    - Show count badge when count > 1
    - Update tooltip to list all filenames
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [ ] 10.2 Update `InvoiceIndicator.css` for count badge
    - Badge styling for count display
    - Tooltip styling for multiple filenames
    - _Requirements: 6.1_
  
  - [ ] 10.3 Write property test for count display
    - **Property 11: Invoice Count Display Accuracy**
    - **Validates: Requirements 6.1**

- [ ] 11. Integration with Expense Components
  - [ ] 11.1 Update `ExpenseForm.jsx` to pass people and invoices
    - Fetch people assigned to expense
    - Fetch all invoices for expense
    - Pass to InvoiceUpload component
    - Handle invoice uploaded/deleted callbacks
    - _Requirements: 2.1, 4.5, 5.1_
  
  - [ ] 11.2 Update `ExpenseList.jsx` for invoice counts
    - Fetch invoice counts for displayed expenses
    - Pass count to InvoiceIndicator
    - _Requirements: 6.1, 6.4_

- [ ] 12. Tax Report Integration
  - [ ] 12.1 Update `TaxDeductible.jsx` for multi-invoice display
    - Show invoice count for each expense
    - Add invoice status filter (with/without/all)
    - Display person-linked invoice info in grouped view
    - Add view invoices action from report
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [ ] 12.2 Write property tests for tax report
    - **Property 12: Tax Report Invoice Count Accuracy**
    - **Property 13: Invoice Filter Correctness**
    - **Validates: Requirements 7.1, 7.2**

- [ ] 13. Backward Compatibility Verification
  - [ ] 13.1 Verify single invoice workflow unchanged
    - Test upload without person selection
    - Test single invoice display (no count badge)
    - Test existing drag-and-drop behavior
    - _Requirements: 9.1, 9.2, 9.4, 9.5_
  
  - [ ] 13.2 Write property test for backward compatibility
    - **Property 17: Backward Compatible Single Upload**
    - **Validates: Requirements 9.1**

- [ ] 14. Documentation Updates
  - [ ] 14.1 Update `docs/features/MEDICAL_EXPENSE_INVOICES.md`
    - Document multi-invoice support
    - Update API documentation
    - Update database schema section
    - Add migration notes
    - _Requirements: All_

- [ ] 15. Final Checkpoint
  - Ensure all tests pass
  - Verify migration on fresh database
  - Test full workflow: upload multiple invoices, link to people, view in tax report
  - Ask the user if questions arise

## Notes

- All tasks including property-based tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- This feature requires a database migration - develop on feature branch
