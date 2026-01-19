# Requirements Document

## Introduction

This feature extends the existing tax-deductible expense invoice attachment system to support multiple invoices per expense. Currently, the system enforces a 1:1 relationship between expenses and invoices (via a UNIQUE constraint on expense_id). The new feature will allow multiple invoices to be attached to a single tax-deductible expense (Tax - Medical or Tax - Donation), with optional linking of invoices to specific people assigned to the expense (medical expenses only). This is particularly useful when an expense is split between multiple family members, each with their own receipt or invoice.

## Glossary

- **Invoice_System**: The backend service and repository layer responsible for managing invoice file uploads, storage, and metadata
- **Invoice_UI**: The frontend components for uploading, viewing, and managing invoice attachments
- **Expense**: A financial transaction record in the expense tracker, specifically tax-deductible expenses (Tax - Medical or Tax - Donation types)
- **Person**: A family member tracked in the people table who can be associated with medical expenses
- **Invoice_Metadata**: Database record containing invoice file information (filename, path, size, upload date)
- **Person_Allocation**: The association between an expense and a person with an allocated amount (expense_people junction table)

## Requirements

### Requirement 1: Multiple Invoice Storage

**User Story:** As a user, I want to attach multiple PDF invoices to a single tax-deductible expense, so that I can keep all related receipts together when an expense involves multiple documents.

#### Acceptance Criteria

1. WHEN a user uploads an invoice to an expense that already has invoices attached, THE Invoice_System SHALL accept the new invoice and add it to the expense's invoice collection
2. THE Invoice_System SHALL store each invoice with a unique identifier while maintaining the association to the parent expense
3. WHEN an expense is deleted, THE Invoice_System SHALL delete all associated invoices and their files
4. THE Invoice_System SHALL support a minimum of 10 invoices per expense
5. WHEN retrieving invoices for an expense, THE Invoice_System SHALL return all associated invoices ordered by upload date

### Requirement 2: Person-Invoice Linking

**User Story:** As a user, I want to optionally link an invoice to a specific person assigned to the expense (medical expenses only), so that I can track which receipt belongs to which family member for tax purposes.

#### Acceptance Criteria

1. WHEN uploading an invoice, THE Invoice_UI SHALL display a dropdown to optionally select a person from those assigned to the expense
2. WHEN a person is selected during upload, THE Invoice_System SHALL store the person_id association with the invoice
3. WHEN no person is selected during upload, THE Invoice_System SHALL store the invoice without a person association (person_id NULL)
4. WHEN viewing invoices, THE Invoice_UI SHALL display the associated person's name next to each invoice if one is linked
5. WHEN a person is removed from an expense, THE Invoice_System SHALL set the person_id to NULL for any invoices linked to that person (not delete the invoice)

### Requirement 3: Database Schema Migration

**User Story:** As a system administrator, I want existing single-invoice data to be automatically migrated to the new multi-invoice structure, so that no data is lost during the upgrade.

#### Acceptance Criteria

1. WHEN the migration runs, THE Invoice_System SHALL remove the UNIQUE constraint on expense_id from the expense_invoices table
2. WHEN the migration runs, THE Invoice_System SHALL add a person_id column to the expense_invoices table with a foreign key to the people table
3. THE Invoice_System SHALL preserve all existing invoice records during migration
4. IF the migration fails, THEN THE Invoice_System SHALL rollback all changes and preserve the original schema
5. THE Invoice_System SHALL create a backup before running the migration

### Requirement 4: Multi-Invoice UI Display

**User Story:** As a user, I want to see all invoices attached to an expense in a clear list format, so that I can easily manage multiple documents.

#### Acceptance Criteria

1. WHEN an expense has multiple invoices, THE Invoice_UI SHALL display them in a scrollable list within the invoice section
2. THE Invoice_UI SHALL show each invoice's filename, file size, upload date, and associated person (if any)
3. WHEN clicking on an invoice in the list, THE Invoice_UI SHALL open the PDF viewer for that specific invoice
4. THE Invoice_UI SHALL provide individual delete buttons for each invoice in the list
5. WHEN an expense has no invoices, THE Invoice_UI SHALL display the upload dropzone as before

### Requirement 5: Multi-Invoice Upload Interface

**User Story:** As a user, I want to upload additional invoices to an expense that already has invoices, so that I can add documents as I receive them.

#### Acceptance Criteria

1. WHEN an expense already has invoices attached, THE Invoice_UI SHALL display an "Add Invoice" button alongside the existing invoice list
2. WHEN the "Add Invoice" button is clicked, THE Invoice_UI SHALL show the upload interface with optional person selection
3. THE Invoice_UI SHALL validate each uploaded file independently (PDF format, 10MB limit)
4. WHEN an upload fails, THE Invoice_UI SHALL display an error message without affecting existing invoices
5. THE Invoice_UI SHALL show upload progress for each file being uploaded

### Requirement 6: Invoice Indicator Updates

**User Story:** As a user, I want the invoice indicator to show the count of attached invoices, so that I can quickly see how many documents are attached to each expense.

#### Acceptance Criteria

1. WHEN an expense has multiple invoices, THE Invoice_UI SHALL display the count (e.g., "📄 3") instead of just the icon
2. WHEN hovering over the indicator, THE Invoice_UI SHALL show a tooltip listing all invoice filenames
3. WHEN clicking the indicator, THE Invoice_UI SHALL open a modal showing all invoices with view/delete options
4. WHEN an expense has exactly one invoice, THE Invoice_UI SHALL display the indicator as before (icon only, click to view)

### Requirement 7: Tax Report Integration

**User Story:** As a user, I want the tax deductible report to show invoice counts and allow filtering by invoice status, so that I can identify expenses that need documentation.

#### Acceptance Criteria

1. WHEN displaying tax-deductible expenses in the tax report, THE Invoice_UI SHALL show the invoice count for each expense
2. THE Invoice_UI SHALL allow filtering to show only expenses with invoices, without invoices, or all
3. WHEN an expense has invoices linked to specific people, THE Invoice_UI SHALL display this information in the person-grouped view
4. THE Invoice_UI SHALL provide a way to view all invoices for an expense directly from the tax report

### Requirement 8: API Endpoint Updates

**User Story:** As a developer, I want the API to support multiple invoice operations, so that the frontend can manage invoice collections.

#### Acceptance Criteria

1. THE Invoice_System SHALL provide a GET endpoint that returns all invoices for an expense
2. THE Invoice_System SHALL modify the upload endpoint to accept an optional person_id parameter
3. THE Invoice_System SHALL provide a DELETE endpoint that deletes a specific invoice by invoice ID
4. THE Invoice_System SHALL provide a PATCH endpoint to update an invoice's person association
5. WHEN deleting the last invoice for an expense, THE Invoice_System SHALL behave the same as deleting any other invoice (no special handling)

### Requirement 9: Backward Compatibility

**User Story:** As a user, I want existing functionality to continue working after the upgrade, so that my workflow is not disrupted.

#### Acceptance Criteria

1. THE Invoice_System SHALL continue to support single invoice upload without requiring person selection
2. THE Invoice_UI SHALL maintain the same drag-and-drop upload experience
3. THE Invoice_System SHALL continue to validate files using the same rules (PDF only, 10MB max)
4. THE Invoice_UI SHALL continue to support viewing, downloading, and printing invoices
5. WHEN an expense has exactly one invoice with no person link, THE Invoice_UI SHALL display it identically to the current single-invoice view
