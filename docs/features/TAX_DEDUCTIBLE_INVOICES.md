# Tax-Deductible Expense Invoice Attachments

## Overview

The Tax-Deductible Expense Invoice Attachments feature enables users to attach PDF invoices to tax-deductible expenses (both medical expenses and donations) for better record keeping, tax preparation, and insurance claims. This feature seamlessly integrates with the existing medical expense people tracking functionality.

**Version Added:** 4.12.0  
**Multi-Invoice Support Added:** 4.13.0  
**Donation Invoice Support Added:** 4.13.2  
**Status:** Active  
**Related Features:** Medical Expense People Tracking, Tax Deductible Reporting

## Key Features

- **Multiple Invoice Support**: Attach multiple PDF invoices to a single tax-deductible expense (v4.13.0+)
- **Tax-Deductible Types**: Supports both Tax - Medical and Tax - Donation expense types (v4.13.2+)
- **Person-Invoice Linking**: Optionally link invoices to specific family members assigned to the expense (medical expenses only)
- **PDF Invoice Upload**: Attach PDF invoices to tax-deductible expenses during creation or editing
- **Invoice Management**: View, replace, and delete individual invoice attachments
- **PDF Viewer**: Built-in PDF viewer with zoom, download, and print capabilities
- **Visual Indicators**: Clear indicators showing invoice count for each expense
- **Tax Integration**: Invoice status and counts visible in tax deductible reports with filtering
- **Secure Storage**: Files stored securely with proper access control
- **Mobile Support**: Touch-friendly interface for mobile devices

## User Guide

### Uploading an Invoice

1. **During Expense Creation:**
   - Create a new tax-deductible expense (Tax - Medical or Tax - Donation category)
   - Scroll to the "Invoice Attachment" section
   - Click "Choose File" or drag and drop a PDF file
   - For medical expenses: Optionally select a person from the dropdown (if people are assigned)
   - The invoice will be uploaded when you save the expense

2. **During Expense Editing:**
   - Edit an existing tax-deductible expense
   - Scroll to the "Invoice Attachment" section
   - Upload a new invoice or add additional invoices
   - For medical expenses: Optionally link each invoice to a specific person
   - Save the expense to apply changes

3. **Adding Multiple Invoices:**
   - After uploading the first invoice, click "Add Invoice" to upload additional invoices
   - Each invoice can be linked to a different person (medical expenses only)
   - Useful when an expense covers multiple family members with separate receipts

4. **File Requirements:**
   - File format: PDF only
   - Maximum size: 10MB per file
   - Valid PDF structure required
   - Minimum of 10 invoices supported per expense

### Viewing Invoices

1. **From Expense List:**
   - Look for the 📄 icon next to medical expenses
   - If multiple invoices exist, a count badge shows the number (e.g., "📄 3")
   - Click the icon to open the invoice list/viewer

2. **From Tax Deductible Report:**
   - Invoice counts appear next to expenses with attachments
   - Click the indicator to view all invoices for that expense
   - Person-grouped view shows invoice information per family member

3. **Invoice List View:**
   - See all invoices for an expense in a scrollable list
   - Each invoice shows: filename, file size, upload date, and linked person (if any)
   - Click any invoice to open it in the PDF viewer

4. **PDF Viewer Controls:**
   - **Zoom In/Out**: Adjust viewing size
   - **Download**: Save PDF to your device
   - **Print**: Open browser print dialog
   - **Close**: Exit the viewer

### Managing Invoices

**Add Another Invoice:**
1. Edit the expense
2. In the "Invoice Attachment" section, click "Add Invoice"
3. Select a PDF file
4. Optionally select a person to link the invoice to
5. Save the expense

**Delete a Specific Invoice:**
1. Edit the expense
2. In the invoice list, click the delete button (🗑️) next to the invoice
3. Confirm the deletion
4. Other invoices remain unaffected

**Change Person Link:**
1. Edit the expense
2. In the invoice list, use the person dropdown to change the linked person
3. Select a different person or "None" to unlink
4. Save the expense

**Note:** Deleting an expense automatically removes all attached invoices.

### Filtering by Invoice Status

**In Tax Deductible Report:**
- Use the "Invoice Status" filter to show:
  - All expenses
  - Only expenses with invoices
  - Only expenses without invoices

**In Person-Grouped View:**
- See which invoices are linked to each family member
- Identify expenses that need documentation per person

## Technical Details

### File Storage

**Directory Structure:**
```
/config/invoices/
├── 2025/
│   ├── 01/
│   │   ├── 123_1704067200_receipt.pdf
│   │   ├── 123_1704153600_medical_bill.pdf  # Multiple invoices for same expense
│   │   └── 124_1704240000_prescription.pdf
│   ├── 02/
│   └── ...
├── 2024/
└── temp/
```

**File Naming Convention:**
- Pattern: `{expense_id}_{timestamp}_{sanitized_original_name}.pdf`
- Example: `123_1704067200_receipt.pdf`
- Multiple invoices for the same expense have different timestamps

**Storage Location:**
- Docker: `/config/invoices/` (mounted volume)
- Local: `backend/config/invoices/`

### Database Schema

**expense_invoices Table (v4.13.0+):**
```sql
CREATE TABLE expense_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    person_id INTEGER,                    -- Optional link to person
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_expense_invoices_expense_id ON expense_invoices(expense_id);
CREATE INDEX idx_expense_invoices_person_id ON expense_invoices(person_id);
CREATE INDEX idx_expense_invoices_upload_date ON expense_invoices(upload_date);
```

**Key Changes from v4.12.0:**
- Removed UNIQUE constraint on expense_id (allows multiple invoices per expense)
- Added person_id column with foreign key to people table
- ON DELETE SET NULL for person_id (invoice preserved if person removed)
- Added indexes for person_id and upload_date

**Key Constraints:**
- Multiple invoices per expense supported
- Automatic cleanup on expense deletion (CASCADE DELETE)
- Person link set to NULL if person is removed (SET NULL)
- Indexed on expense_id, person_id, and upload_date for performance

### API Endpoints

**Upload Invoice:**
```
POST /api/invoices/upload
Content-Type: multipart/form-data

Body:
- expenseId: number (required)
- invoice: File (PDF, required)
- personId: number (optional) - ID of person to link invoice to

Response: 200 OK
{
  "success": true,
  "invoice": {
    "id": 1,
    "expenseId": 123,
    "personId": 5,
    "personName": "John Doe",
    "filename": "123_1704067200_receipt.pdf",
    "originalFilename": "receipt.pdf",
    "fileSize": 245760,
    "uploadDate": "2025-01-01T12:00:00Z"
  }
}
```

**Get All Invoices for Expense:**
```
GET /api/invoices/:expenseId

Response: 200 OK
{
  "invoices": [
    {
      "id": 1,
      "expenseId": 123,
      "personId": 5,
      "personName": "John Doe",
      "filename": "123_1704067200_receipt.pdf",
      "originalFilename": "receipt.pdf",
      "fileSize": 245760,
      "uploadDate": "2025-01-01T12:00:00Z"
    },
    {
      "id": 2,
      "expenseId": 123,
      "personId": 6,
      "personName": "Jane Doe",
      "filename": "123_1704153600_medical_bill.pdf",
      "originalFilename": "medical_bill.pdf",
      "fileSize": 512000,
      "uploadDate": "2025-01-02T12:00:00Z"
    }
  ],
  "count": 2
}
```

**Get Specific Invoice File:**
```
GET /api/invoices/:expenseId/:invoiceId

Response: 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="receipt.pdf"
```

**Delete Specific Invoice:**
```
DELETE /api/invoices/:invoiceId

Response: 200 OK
{
  "success": true,
  "message": "Invoice deleted successfully"
}
```

**Update Invoice Person Link:**
```
PATCH /api/invoices/:invoiceId
Content-Type: application/json

Body:
{
  "personId": 5  // or null to unlink
}

Response: 200 OK
{
  "success": true,
  "invoice": {
    "id": 1,
    "expenseId": 123,
    "personId": 5,
    "personName": "John Doe",
    ...
  }
}
```

**Get Invoice Metadata (All Invoices):**
```
GET /api/invoices/:expenseId/metadata

Response: 200 OK
{
  "invoices": [...],
  "count": 2
}
```

## Security

### File Validation

- **Magic Number Checking**: Verifies PDF file signature (not just extension)
- **Size Limits**: 10MB maximum per file
- **Structure Validation**: Basic PDF structure validation
- **Filename Sanitization**: Removes dangerous characters and prevents path traversal

### Access Control

- **Expense Ownership**: Users can only access invoices for their own expenses
- **Authentication Required**: All invoice operations require valid session
- **Secure Storage**: Files stored outside web root, not directly accessible
- **Path Traversal Prevention**: All file paths sanitized
- **Person Validation**: Person must be assigned to expense before linking

### Data Protection

- **Backup Integration**: Invoices included in database backups
- **Automatic Cleanup**: Orphaned files removed automatically
- **Audit Logging**: All file operations logged for monitoring
- **GDPR Compliance**: Support for data deletion requests

## Performance

### Optimization Features

- **Streaming Uploads**: Large files uploaded using streams
- **Progress Tracking**: Real-time upload progress for files >1MB
- **Concurrent Uploads**: Multiple simultaneous uploads supported
- **Caching**: Frequently accessed files cached
- **Lazy Loading**: PDF viewer loads on demand
- **Efficient Queries**: Indexed queries for invoice retrieval

### Storage Management

- **Organized Structure**: Year/month directories for efficient browsing
- **Cleanup Jobs**: Periodic removal of orphaned files
- **Storage Monitoring**: Track usage and provide warnings
- **Compression**: Consider PDF compression for storage efficiency

## Troubleshooting

### Upload Issues

**"File too large" error:**
- Maximum file size is 10MB per file
- Compress the PDF or split into multiple files
- Check available storage space

**"Invalid file type" error:**
- Only PDF files are accepted
- Convert other formats (images, documents) to PDF first
- Ensure the file is not corrupted

**"Upload failed" error:**
- Check network connection
- Verify sufficient storage space
- Try uploading again
- Check browser console for detailed errors

**"Person not assigned to expense" error:**
- The selected person must be assigned to the expense first
- Add the person to the expense before linking invoices

### Viewing Issues

**PDF won't display:**
- Try downloading the file instead
- Check if PDF is corrupted
- Ensure browser supports PDF viewing
- Try a different browser

**Slow loading:**
- Large PDFs may take time to load
- Check network connection
- Consider downloading for offline viewing

### Storage Issues

**"Insufficient storage" error:**
- Free up space by deleting old invoices
- Archive old expenses with invoices
- Contact administrator for storage expansion

## Backup and Restore

### Backup Procedures

**Automatic Backups:**
- Invoice files included in automated backups
- Backup location: `/config/backups/`
- Frequency: Configured in backup settings

**Manual Backups:**
1. Navigate to Settings → Backup
2. Click "Create Backup Now"
3. Backup includes database and invoice files
4. Download backup file for safekeeping

### Restore Procedures

**From Backup:**
1. Stop the application
2. Restore database from backup
3. Restore invoice files to `/config/invoices/`
4. Restart the application
5. Verify invoice accessibility

**Docker Restore:**
```bash
# Stop containers
docker-compose down

# Restore database
cp backup.db backend/config/database/expenses.db

# Restore invoices
cp -r backup/invoices/* backend/config/invoices/

# Start containers
docker-compose up -d
```

## Migration Guide

### Upgrading to v4.13.0 (Multi-Invoice Support)

**Automatic Migration:**
The database migration runs automatically on container startup and performs the following:

1. **Schema Changes:**
   - Removes UNIQUE constraint on expense_id (allows multiple invoices)
   - Adds person_id column with foreign key to people table
   - Creates indexes for person_id and upload_date

2. **Data Preservation:**
   - All existing invoice records are preserved
   - Existing invoices will have person_id set to NULL
   - No manual intervention required

3. **Backward Compatibility:**
   - Single invoice upload still works without person selection
   - Existing workflows unchanged
   - API maintains backward compatibility

**Migration Process:**
```
1. Container starts
2. Migration checks if already applied
3. Creates backup of database
4. Creates new table with updated schema
5. Copies all existing data (person_id = NULL)
6. Drops old table and renames new table
7. Creates indexes
8. Marks migration complete
```

**Rollback (if needed):**
- Migration creates automatic backup before changes
- Restore from backup if issues occur
- Contact support for assistance

### For Existing Users (v4.12.0 → v4.13.0)

**What Changes:**
- You can now attach multiple invoices to a single expense
- You can optionally link invoices to specific family members
- Invoice indicator shows count when multiple invoices exist
- Tax report shows invoice counts and supports filtering

**What Stays the Same:**
- Single invoice upload works exactly as before
- Drag-and-drop upload experience unchanged
- PDF viewer functionality unchanged
- Existing invoices preserved and accessible

### For New Installations

**Setup Steps:**

1. **Install Application:**
   - Follow standard installation procedures
   - Multi-invoice feature enabled by default

2. **Verify Storage:**
   - Check `/config/invoices/` directory exists
   - Verify write permissions
   - Test upload functionality

3. **Configure Backups:**
   - Ensure backup includes invoice directory
   - Test backup and restore procedures

## Monitoring and Maintenance

### Health Checks

**Regular Checks:**
- Monitor storage usage
- Check for orphaned files
- Verify backup integrity
- Review error logs

**Storage Monitoring:**
```bash
# Check invoice storage size
du -sh /config/invoices/

# Count invoice files
find /config/invoices/ -type f -name "*.pdf" | wc -l

# Find large files
find /config/invoices/ -type f -size +5M

# Count invoices per expense (database query)
sqlite3 expenses.db "SELECT expense_id, COUNT(*) FROM expense_invoices GROUP BY expense_id HAVING COUNT(*) > 1"
```

### Maintenance Tasks

**Weekly:**
- Review error logs for upload failures
- Check storage usage trends
- Verify backup completion

**Monthly:**
- Run orphaned file cleanup
- Archive old invoices if needed
- Review access logs for security

**Quarterly:**
- Audit storage requirements
- Review and update documentation
- Test disaster recovery procedures

### Cleanup Operations

**Remove Orphaned Files:**
```bash
# Run cleanup script
node backend/scripts/cleanupOrphanedInvoices.js
```

**Archive Old Invoices:**
```bash
# Archive invoices older than 2 years
node backend/scripts/archiveOldInvoices.js --years 2
```

## Best Practices

### For Users

1. **Upload Promptly**: Attach invoices when creating expenses
2. **Use Descriptive Names**: Name PDFs clearly before uploading
3. **Link to People**: Associate invoices with family members for better organization
4. **Verify Uploads**: Check that invoice uploaded successfully
5. **Regular Backups**: Backup data regularly including invoices
6. **Organize Files**: Keep original files organized locally

### For Administrators

1. **Monitor Storage**: Track storage usage and plan capacity
2. **Regular Backups**: Ensure backups include invoice files
3. **Security Audits**: Review access logs periodically
4. **Performance Monitoring**: Track upload/download performance
5. **Documentation**: Keep troubleshooting guides updated

## Known Limitations

- **File Format**: Only PDF files supported (no images or other formats)
- **File Size**: 10MB maximum per file
- **Invoice Limit**: Minimum 10 invoices per expense supported
- **Browser Support**: PDF viewer requires modern browser
- **Mobile Upload**: Limited by device capabilities
- **Person Linking**: Person must be assigned to expense before linking invoice

## Future Enhancements

### Planned Features

- **Multiple File Types**: Support for images (JPG, PNG)
- **OCR Integration**: Extract text from invoices automatically
- **Bulk Upload**: Upload multiple invoices at once
- **Cloud Storage**: Integration with cloud storage providers
- **Invoice Templates**: Generate standardized invoice formats

### Under Consideration

- **Email Integration**: Import invoices from email
- **Scanner Integration**: Direct scanning to application
- **Tax Software Export**: Export to tax preparation software
- **Invoice Sharing**: Share with family members or accountants
- **Advanced Search**: Search invoice content with OCR

## Support

### Getting Help

**Documentation:**
- User Guide (this document)
- API Documentation
- Troubleshooting Guide

**Community:**
- GitHub Issues
- Discussion Forums
- Feature Requests

**Contact:**
- Report bugs via GitHub Issues
- Request features via GitHub Discussions
- Security issues: Report privately

---

**Last Updated:** January 17, 2026  
**Version:** 4.13.0  
**Status:** Active
