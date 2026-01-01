# Implementation Plan: Medical Expense Invoice Attachments

## Overview

This implementation plan creates the ability to attach PDF invoices to medical expenses, providing better record keeping for tax purposes and insurance claims. The feature extends the existing medical expense people tracking functionality by adding document management capabilities.

## Tasks

- [x] 1. Database schema and migration
  - Create `expense_invoices` table with proper constraints
  - Add foreign key relationship to expenses table with CASCADE DELETE
  - Create appropriate indexes for performance
  - Implement migration script in `backend/database/migrations.js`
  - Test migration on existing database without data loss
  - Verify UNIQUE constraint on expense_id (one invoice per expense)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 2. File storage infrastructure
  - Create organized directory structure: `/config/invoices/YYYY/MM/`
  - Implement file path generation utilities
  - Create filename sanitization functions
  - Implement file cleanup utilities
  - Set up temporary upload directory
  - Ensure proper file permissions and security
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 3. Invoice service layer
  - [x] 3.1 Create invoiceService with core operations
    - Implement `uploadInvoice(expenseId, file, userId)` method
    - Implement `getInvoice(expenseId, userId)` method
    - Implement `deleteInvoice(expenseId, userId)` method
    - Implement `getInvoiceMetadata(expenseId)` method
    - Add proper error handling and validation
    - Ensure expense ownership verification
    - Implement atomic operations (file + database)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Create invoiceRepository for data access
    - Database operations for invoice metadata
    - CRUD operations with proper error handling
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. Invoice API endpoints
  - [x] 4.1 Create invoiceController with all endpoints
    - Implement `POST /api/invoices/upload` endpoint
    - Implement `GET /api/invoices/:expenseId` endpoint
    - Implement `DELETE /api/invoices/:expenseId` endpoint
    - Implement `GET /api/invoices/:expenseId/metadata` endpoint
    - Add proper HTTP status codes and error responses
    - Implement request validation middleware
    - Add authentication and authorization checks
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.2 Configure file upload middleware
    - Use multer middleware for file uploads
    - Validate file type and size in middleware
    - Return appropriate HTTP status codes
    - Consistent error response format
    - Security headers for file downloads
    - _Requirements: 1.4, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3_

- [x] 5. File upload validation and security
  - Configure multer for PDF file uploads
  - Implement file type validation (magic number checking)
  - Implement file size validation (10MB limit)
  - Add PDF structure validation
  - Implement upload progress tracking
  - Add security measures (filename sanitization)
  - Handle upload errors gracefully
  - Support concurrent uploads
  - _Requirements: 1.4, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 6. InvoiceUpload React component
  - [x] 6.1 Create reusable upload component
    - Implement drag-and-drop file upload
    - Add file selection via click
    - Show upload progress indicator
    - Display file validation errors
    - Support replace and delete operations
    - Add mobile-friendly touch interface
    - Implement proper accessibility features
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 7. Enhanced ExpenseForm integration
  - Add invoice upload section to ExpenseForm for medical expenses
  - Show/hide invoice upload based on expense type
  - Handle invoice upload during expense creation
  - Handle invoice upload during expense editing
  - Maintain form state consistency
  - Add proper validation integration
  - Ensure backward compatibility with existing functionality
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 8. Invoice management operations
  - Add "View Invoice" functionality
  - Add "Replace Invoice" functionality
  - Add "Delete Invoice" functionality with confirmation
  - Show invoice metadata (filename, size, upload date)
  - Handle operation errors gracefully
  - Update UI state after operations
  - Add loading states for operations
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 9. InvoicePDFViewer modal component
  - [x] 9.1 Create PDF viewer modal
    - Implement PDF rendering using react-pdf or similar
    - Add zoom in/out controls
    - Add download functionality
    - Add print functionality
    - Support multi-page PDFs with navigation
    - Add loading states and error handling
    - Ensure mobile responsiveness
    - Add keyboard navigation support
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10. InvoiceIndicator component
  - Create small indicator component for invoice attachment status
  - Design clear visual indicator (icon + optional text)
  - Support different sizes (small, medium, large)
  - Add click handler to open PDF viewer
  - Add tooltip with invoice information
  - Ensure accessibility compliance
  - Add proper hover and focus states
  - _Requirements: 3.1, 4.1, 4.2, 4.3, 4.4_

- [x] 11. Enhanced ExpenseList integration
  - Add invoice indicators to expense list items
  - Show indicators only for medical expenses
  - Add filter option for expenses with/without invoices
  - Integrate with existing filtering system
  - Handle invoice viewing from expense list
  - Maintain existing functionality and performance
  - Add proper loading states
  - _Requirements: 3.1, 4.1, 4.2, 4.3, 4.4_

- [x] 12. Enhanced TaxDeductible integration
  - Add invoice indicators to tax deductible expense listings
  - Show invoice status in person-grouped views
  - Add filter for expenses with/without invoices
  - Include invoice status in export functionality
  - Maintain existing tax reporting functionality
  - Add summary statistics for invoice coverage
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [-] 13. Comprehensive testing suite
  - [x] 13.1 Write unit tests for service and repository methods
    - Test all invoice service operations
    - Test error handling scenarios
    - Test security and ownership validation
    - Test atomic operations (rollback on failure)
    - _Requirements: All_

  - [x] 13.2 Write integration tests for API endpoints
    - Test all endpoints with valid and invalid inputs
    - Test file upload with various file types and sizes
    - Test authentication and authorization
    - Test error responses and status codes
    - _Requirements: All_

  - [x] 13.3 Write component tests for React components
    - Test drag-and-drop functionality
    - Test file selection and validation
    - Test upload progress and error handling
    - Test mobile touch interface
    - Test accessibility features
    - _Requirements: All_

  - [x] 13.4 Write property-based tests for file operations
    - **Property 1: File upload validation**
    - **Validates: Requirements 1.4, 6.1, 6.2, 6.3**
    - **Status: FAILING** - Tests created but failing due to:
      1. Float constraint issues with fast-check (need Math.fround)
      2. File validation logic issues with empty files and filenames with spaces
      3. Test assumptions about file validation behavior don't match actual implementation
    - **Failing Examples**: Empty files (size 0), filenames with only spaces, validation error expectations

  - [x] 13.5 Write property-based tests for invoice operations
    - **Property 2: Invoice CRUD operations**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5**
    - **Status: FAILING** - Tests created but failing due to:
      1. Float constraint issues with fast-check in expense amount generation
      2. Mock setup complexity causing test failures
      3. Need to adjust test expectations to match actual service behavior

- [ ] 14. Error handling and edge cases
  - Handle file system errors gracefully
  - Implement proper error recovery mechanisms
  - Add user-friendly error messages
  - Handle network failures during upload
  - Implement retry mechanisms where appropriate
  - Add logging for debugging and monitoring
  - Handle edge cases (corrupted files, storage full, etc.)
  - Implement graceful degradation
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 15. Performance optimization
  - Optimize file upload performance
  - Implement efficient PDF rendering
  - Add caching for frequently accessed files
  - Optimize database queries for invoice metadata
  - Implement lazy loading for PDF viewer
  - Add compression for file transfers
  - Optimize memory usage during file operations
  - Add performance monitoring
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 16. Documentation and deployment
  - Update API documentation with new endpoints
  - Create user guide for invoice features
  - Update deployment documentation
  - Create troubleshooting guide
  - Update backup procedures to include invoices
  - Create migration guide for existing users
  - Update system requirements documentation
  - Create monitoring and maintenance guide
  - _Requirements: All_