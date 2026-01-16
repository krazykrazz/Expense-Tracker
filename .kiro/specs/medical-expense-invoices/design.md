# Design Document

## Overview

The Medical Expense Invoice Attachments feature extends the existing expense tracking system to support PDF invoice uploads for medical expenses. This feature builds upon the existing medical expense people tracking functionality to provide comprehensive document management for tax preparation and insurance claims.

The system supports secure file storage, PDF viewing, and seamless integration with the existing tax deductible reporting features. Files are stored in the Docker config volume for persistence and backup integration.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
├─────────────────────────────────────────────────────────────┤
│  ExpenseForm (Enhanced)  │  InvoiceUpload Component         │
│  ExpenseList (Enhanced)  │  InvoicePDFViewer Modal          │
│  TaxDeductible (Enhanced)│  InvoiceIndicator Component      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ API Calls (multipart/form-data for uploads)
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                      Backend API                             │
├─────────────────────────────────────────────────────────────┤
│  invoiceController  →  invoiceService  →  invoiceRepository │
│  expenseController (Enhanced) → expenseService (Enhanced)   │
│  multer middleware for file uploads                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ File System Operations
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                    File Storage                              │
├─────────────────────────────────────────────────────────────┤
│  /config/invoices/YYYY/MM/                                  │
│  └── {expense_id}_{timestamp}_{original_name}.pdf           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Database References
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                       Database                               │
├─────────────────────────────────────────────────────────────┤
│  expense_invoices table (new)                               │
│  expenses table (existing)                                   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Invoice Upload**: User → ExpenseForm → InvoiceUpload → multer → invoiceController → invoiceService → File Storage + Database

2. **Invoice Viewing**: User → ExpenseList/TaxDeductible → InvoiceIndicator → InvoicePDFViewer → invoiceController.getInvoice() → File System

3. **Invoice Management**: User → ExpenseForm (edit) → InvoiceUpload (replace/delete) → invoiceController → invoiceService → File System + Database

4. **Tax Reporting**: User → TaxDeductible → expenseController.getTaxDeductible() → expenseService (includes invoice indicators) → Frontend display

## Components and Interfaces

### Database Schema

#### expense_invoices Table
```sql
CREATE TABLE expense_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    UNIQUE(expense_id)  -- One invoice per expense
);
```

### Frontend Components

#### InvoiceUpload Component
File upload component for PDF invoices.

**Props**:
- `expenseId`: number | null - Expense ID (null for new expenses)
- `existingInvoice`: InvoiceInfo | null - Current invoice if exists
- `onInvoiceUploaded`: (invoice: InvoiceInfo) => void - Upload success callback
- `onInvoiceDeleted`: () => void - Delete success callback
- `disabled`: boolean - Disable upload during form submission

**State**:
- `uploading`: boolean - Upload in progress
- `uploadProgress`: number - Upload progress percentage
- `error`: string | null - Upload error message
- `dragOver`: boolean - Drag and drop state

**Key Methods**:
- `handleFileSelect(file)` - Validate and upload file
- `handleDragDrop(event)` - Handle drag and drop upload
- `handleDeleteInvoice()` - Delete existing invoice
- `validateFile(file)` - Check file type and size

#### InvoicePDFViewer Modal
Modal component for viewing PDF invoices.

**Props**:
- `isOpen`: boolean - Modal visibility
- `invoiceUrl`: string - PDF file URL
- `invoiceName`: string - Display name
- `onClose`: () => void - Close modal callback

**State**:
- `loading`: boolean - PDF loading state
- `error`: string | null - PDF load error
- `zoom`: number - Current zoom level
- `pageNumber`: number - Current page (for multi-page PDFs)

**Key Methods**:
- `handleZoomIn()` - Increase zoom level
- `handleZoomOut()` - Decrease zoom level
- `handleDownload()` - Download PDF file
- `handlePrint()` - Print PDF (browser print dialog)

#### InvoiceIndicator Component
Small indicator component showing invoice attachment status.

**Props**:
- `hasInvoice`: boolean - Whether expense has invoice
- `invoiceInfo`: InvoiceInfo | null - Invoice metadata
- `onClick`: () => void - Click handler to view invoice
- `size`: 'small' | 'medium' | 'large' - Icon size variant

**Variants**:
- Icon-only (for expense lists)
- Icon with text (for detailed views)
- Status badge (for tax reports)

#### Enhanced ExpenseForm
Extended expense form with invoice upload for medical expenses.

**Additional State**:
- `invoiceFile`: File | null - Selected invoice file
- `invoiceInfo`: InvoiceInfo | null - Current invoice metadata
- `showInvoiceViewer`: boolean - PDF viewer modal state

**Key Methods**:
- `handleInvoiceUpload(file)` - Process invoice upload
- `handleInvoiceDelete()` - Remove invoice attachment
- `handleViewInvoice()` - Open PDF viewer modal

#### Enhanced ExpenseList
Extended expense list with invoice indicators.

**Additional Features**:
- Invoice indicator icons for medical expenses
- Click to view invoice functionality
- Filter by invoice attachment status

#### Enhanced TaxDeductible
Extended tax deductible view with invoice status.

**Additional Features**:
- Invoice indicators in expense listings
- Invoice attachment status in person-grouped views
- Filter option for expenses with/without invoices
- Export includes invoice attachment status

### Backend Services

#### invoiceService
Service for managing invoice file operations.

**Key Methods**:
- `uploadInvoice(expenseId, file, userId)` - Store invoice file and create database record
- `getInvoice(expenseId, userId)` - Retrieve invoice file path and metadata
- `deleteInvoice(expenseId, userId)` - Remove invoice file and database record
- `getInvoiceMetadata(expenseId)` - Get invoice info without file content
- `cleanupOrphanedFiles()` - Remove files without database references

**File Naming Convention**:
```
/config/invoices/YYYY/MM/{expense_id}_{timestamp}_{sanitized_original_name}.pdf
```

**Security Measures**:
- Validate file type (PDF only)
- Sanitize filenames (remove special characters)
- Check file size limits (10MB max)
- Verify expense ownership before file operations
- Generate unique filenames to prevent conflicts

#### Enhanced expenseService
Extended expense service with invoice integration.

**Additional Methods**:
- `createExpenseWithInvoice(expenseData, peopleAllocations, invoiceFile)` - Create expense and upload invoice atomically
- `updateExpenseWithInvoice(id, expenseData, peopleAllocations, invoiceFile)` - Update expense and manage invoice
- `getExpenseWithInvoice(id)` - Get expense with invoice metadata
- `getTaxDeductibleWithInvoices(year)` - Get tax deductible expenses with invoice indicators

### Data Models

#### InvoiceInfo
```typescript
interface InvoiceInfo {
  id: number;
  expenseId: number;
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadDate: string;
}
```

#### Enhanced Expense
```typescript
interface ExpenseWithInvoice extends ExpenseWithPeople {
  invoice?: InvoiceInfo;
  hasInvoice: boolean;
}
```

## File Storage Architecture

### Directory Structure
```
/config/
├── invoices/
│   ├── 2025/
│   │   ├── 01/
│   │   │   ├── 123_1704067200_receipt.pdf
│   │   │   └── 124_1704153600_medical_bill.pdf
│   │   ├── 02/
│   │   └── ...
│   ├── 2024/
│   └── temp/  # Temporary uploads before expense creation
└── database/
    └── expenses.db
```

### File Management

#### Upload Process
1. **Validation**: Check file type (PDF), size (≤10MB), and format
2. **Temporary Storage**: Store in `/config/invoices/temp/` during expense creation
3. **Final Storage**: Move to organized directory structure after expense creation
4. **Database Record**: Create expense_invoices record with file metadata
5. **Cleanup**: Remove temporary files after successful processing

#### File Naming
- **Pattern**: `{expense_id}_{timestamp}_{sanitized_original_name}.pdf`
- **Sanitization**: Remove special characters, limit length, ensure uniqueness
- **Collision Handling**: Append counter if filename exists

#### Security Considerations
- **File Type Validation**: Magic number checking, not just extension
- **Size Limits**: 10MB maximum per file
- **Path Traversal Prevention**: Sanitize all file paths
- **Access Control**: Verify expense ownership before file operations
- **Virus Scanning**: Consider integration with antivirus scanning (future enhancement)

## API Endpoints

### Invoice Management

#### POST /api/invoices/upload
Upload invoice for an expense.

**Request**: `multipart/form-data`
- `expenseId`: number - Target expense ID
- `invoice`: File - PDF file to upload

**Response**: `200 OK`
```json
{
  "success": true,
  "invoice": {
    "id": 1,
    "expenseId": 123,
    "filename": "123_1704067200_receipt.pdf",
    "originalFilename": "receipt.pdf",
    "fileSize": 245760,
    "uploadDate": "2025-01-01T12:00:00Z"
  }
}
```

#### GET /api/invoices/:expenseId
Get invoice file for an expense.

**Response**: `200 OK` (PDF file stream)
- Content-Type: application/pdf
- Content-Disposition: inline; filename="receipt.pdf"

#### DELETE /api/invoices/:expenseId
Delete invoice for an expense.

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Invoice deleted successfully"
}
```

#### GET /api/invoices/:expenseId/metadata
Get invoice metadata without file content.

**Response**: `200 OK`
```json
{
  "invoice": {
    "id": 1,
    "expenseId": 123,
    "filename": "123_1704067200_receipt.pdf",
    "originalFilename": "receipt.pdf",
    "fileSize": 245760,
    "uploadDate": "2025-01-01T12:00:00Z"
  }
}
```

### Enhanced Expense Endpoints

#### GET /api/expenses/:id
Enhanced to include invoice metadata.

**Response**: `200 OK`
```json
{
  "expense": {
    "id": 123,
    "date": "2025-01-01",
    "place": "Medical Clinic",
    "amount": 150.00,
    "type": "Tax - Medical",
    "people": [...],
    "invoice": {
      "id": 1,
      "filename": "123_1704067200_receipt.pdf",
      "originalFilename": "receipt.pdf",
      "fileSize": 245760,
      "uploadDate": "2025-01-01T12:00:00Z"
    },
    "hasInvoice": true
  }
}
```

#### GET /api/expenses/tax-deductible
Enhanced to include invoice indicators.

**Response**: `200 OK`
```json
{
  "expenses": [
    {
      "id": 123,
      "date": "2025-01-01",
      "place": "Medical Clinic",
      "amount": 150.00,
      "type": "Tax - Medical",
      "people": [...],
      "hasInvoice": true
    }
  ]
}
```

## Error Handling

### File Upload Errors
- **File Too Large**: 413 Payload Too Large
- **Invalid File Type**: 400 Bad Request - "Only PDF files are allowed"
- **Corrupted File**: 400 Bad Request - "Invalid or corrupted PDF file"
- **Storage Full**: 507 Insufficient Storage
- **Permission Denied**: 403 Forbidden

### File Access Errors
- **File Not Found**: 404 Not Found
- **Access Denied**: 403 Forbidden - "You don't have permission to access this invoice"
- **File Corrupted**: 500 Internal Server Error - "Invoice file is corrupted or inaccessible"

### Validation Errors
- **Missing Expense**: 400 Bad Request - "Expense not found"
- **Non-Medical Expense**: 400 Bad Request - "Invoices can only be attached to medical expenses"
- **Duplicate Invoice**: 409 Conflict - "This expense already has an invoice attached"

## Performance Considerations

### File Upload Optimization
- **Streaming Uploads**: Use multer with streaming for large files
- **Progress Tracking**: Provide upload progress feedback
- **Concurrent Uploads**: Handle multiple simultaneous uploads
- **Timeout Handling**: Set appropriate timeouts for large files

### File Serving Optimization
- **Caching Headers**: Set appropriate cache headers for PDF files
- **Range Requests**: Support partial content requests for large PDFs
- **Compression**: Consider gzip compression for PDF metadata responses
- **CDN Integration**: Future enhancement for file serving

### Storage Management
- **Directory Organization**: Year/month structure for efficient browsing
- **Cleanup Jobs**: Periodic cleanup of orphaned files
- **Storage Monitoring**: Track storage usage and provide warnings
- **Backup Integration**: Ensure invoices are included in database backups

## Security Measures

### File Validation
- **Magic Number Checking**: Verify PDF file signature
- **Content Scanning**: Basic PDF structure validation
- **Size Limits**: Enforce 10MB maximum file size
- **Filename Sanitization**: Remove dangerous characters and paths

### Access Control
- **Expense Ownership**: Verify user owns the expense before file operations
- **Authentication**: Require valid session for all invoice operations
- **Path Traversal Prevention**: Sanitize all file paths and names
- **Direct Access Prevention**: Files not accessible via direct URL

### Data Protection
- **Secure Storage**: Files stored outside web root
- **Backup Encryption**: Consider encryption for backup files
- **Audit Logging**: Log all file operations for security monitoring
- **GDPR Compliance**: Support for data deletion requests

## Testing Strategy

### Unit Testing
- Test invoice upload validation and processing
- Test file storage and retrieval operations
- Test invoice deletion and cleanup
- Test PDF file validation
- Test filename sanitization and collision handling

### Integration Testing
- Test complete invoice upload workflow
- Test expense creation with invoice attachment
- Test tax deductible view with invoice indicators
- Test invoice viewing and download functionality
- Test error handling for various failure scenarios

### Property-Based Testing
- Test file upload with various PDF files and sizes
- Test filename sanitization with random input
- Test concurrent upload scenarios
- Test storage cleanup operations
- Test backup and restore with invoice files

### Manual Testing Scenarios
- Upload various PDF files (different sizes, structures)
- Test drag and drop upload functionality
- Test PDF viewer with different PDF types
- Test mobile upload and viewing experience
- Test storage limit scenarios
- Test file corruption and recovery

## Migration Strategy

### Database Migration
```sql
-- Add expense_invoices table
CREATE TABLE expense_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    UNIQUE(expense_id)
);

-- Create indexes for performance
CREATE INDEX idx_expense_invoices_expense_id ON expense_invoices(expense_id);
CREATE INDEX idx_expense_invoices_upload_date ON expense_invoices(upload_date);
```

### File System Setup
```bash
# Create invoice storage directories
mkdir -p /config/invoices/temp
chmod 755 /config/invoices
chmod 755 /config/invoices/temp

# Set up log rotation for invoice operations
# Configure backup to include /config/invoices directory
```

### Deployment Considerations
- **Zero Downtime**: Feature can be deployed without affecting existing functionality
- **Backward Compatibility**: Existing medical expenses continue to work without invoices
- **Storage Requirements**: Plan for additional storage needs
- **Backup Updates**: Update backup scripts to include invoice files

## Future Enhancements

### Advanced Features
- **Multiple File Types**: Support for images (JPG, PNG) in addition to PDF
- **OCR Integration**: Extract text from invoices for automatic categorization
- **Invoice Templates**: Generate standardized invoice formats
- **Bulk Upload**: Upload multiple invoices at once
- **Invoice Sharing**: Share invoices with family members or accountants

### Performance Improvements
- **CDN Integration**: Serve files from content delivery network
- **Image Thumbnails**: Generate preview thumbnails for quick identification
- **Compression**: Automatic PDF compression to save storage space
- **Caching**: Advanced caching strategies for frequently accessed files

### Integration Enhancements
- **Cloud Storage**: Integration with AWS S3, Google Drive, or Dropbox
- **Email Integration**: Import invoices from email attachments
- **Scanner Integration**: Direct integration with document scanners
- **Tax Software Export**: Export invoices to popular tax preparation software