# Medical Expense Invoice Attachments

## Overview

The Medical Expense Invoice Attachments feature enables users to attach PDF invoices to medical expenses for better record keeping, tax preparation, and insurance claims. This feature seamlessly integrates with the existing medical expense people tracking functionality.

**Version Added:** 4.12.0  
**Status:** Active  
**Related Features:** Medical Expense People Tracking, Tax Deductible Reporting

## Key Features

- **PDF Invoice Upload**: Attach PDF invoices to medical expenses during creation or editing
- **Invoice Management**: View, replace, and delete invoice attachments
- **PDF Viewer**: Built-in PDF viewer with zoom, download, and print capabilities
- **Visual Indicators**: Clear indicators showing which expenses have attached invoices
- **Tax Integration**: Invoice status visible in tax deductible reports
- **Secure Storage**: Files stored securely with proper access control
- **Mobile Support**: Touch-friendly interface for mobile devices

## User Guide

### Uploading an Invoice

1. **During Expense Creation:**
   - Create a new medical expense (Tax - Medical category)
   - Scroll to the "Invoice Attachment" section
   - Click "Choose File" or drag and drop a PDF file
   - The invoice will be uploaded when you save the expense

2. **During Expense Editing:**
   - Edit an existing medical expense
   - Scroll to the "Invoice Attachment" section
   - Upload a new invoice or replace an existing one
   - Save the expense to apply changes

3. **File Requirements:**
   - File format: PDF only
   - Maximum size: 10MB
   - Valid PDF structure required

### Viewing an Invoice

1. **From Expense List:**
   - Look for the 📄 icon next to medical expenses
   - Click the icon to open the PDF viewer

2. **From Tax Deductible Report:**
   - Invoice indicators appear next to expenses with attachments
   - Click the indicator to view the invoice

3. **PDF Viewer Controls:**
   - **Zoom In/Out**: Adjust viewing size
   - **Download**: Save PDF to your device
   - **Print**: Open browser print dialog
   - **Close**: Exit the viewer

### Managing Invoices

**Replace an Invoice:**
1. Edit the expense
2. In the "Invoice Attachment" section, click "Replace"
3. Select a new PDF file
4. Save the expense

**Delete an Invoice:**
1. Edit the expense
2. In the "Invoice Attachment" section, click "Delete"
3. Confirm the deletion
4. Save the expense

**Note:** Deleting an expense automatically removes its attached invoice.

### Filtering by Invoice Status

**In Tax Deductible Report:**
- Use the "Invoice Status" filter to show:
  - All expenses
  - Only expenses with invoices
  - Only expenses without invoices

## Technical Details

### File Storage

**Directory Structure:**
```
/config/invoices/
├── 2025/
│   ├── 01/
│   │   ├── 123_1704067200_receipt.pdf
│   │   └── 124_1704153600_medical_bill.pdf
│   ├── 02/
│   └── ...
├── 2024/
└── temp/
```

**File Naming Convention:**
- Pattern: `{expense_id}_{timestamp}_{sanitized_original_name}.pdf`
- Example: `123_1704067200_receipt.pdf`

**Storage Location:**
- Docker: `/config/invoices/` (mounted volume)
- Local: `backend/config/invoices/`

### Database Schema

**expense_invoices Table:**
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
    UNIQUE(expense_id)
);
```

**Key Constraints:**
- One invoice per expense (UNIQUE constraint)
- Automatic cleanup on expense deletion (CASCADE DELETE)
- Indexed on expense_id for performance

### API Endpoints

**Upload Invoice:**
```
POST /api/invoices/upload
Content-Type: multipart/form-data

Body:
- expenseId: number
- invoice: File (PDF)

Response: 200 OK
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

**Get Invoice:**
```
GET /api/invoices/:expenseId

Response: 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="receipt.pdf"
```

**Delete Invoice:**
```
DELETE /api/invoices/:expenseId

Response: 200 OK
{
  "success": true,
  "message": "Invoice deleted successfully"
}
```

**Get Invoice Metadata:**
```
GET /api/invoices/:expenseId/metadata

Response: 200 OK
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

### Storage Management

- **Organized Structure**: Year/month directories for efficient browsing
- **Cleanup Jobs**: Periodic removal of orphaned files
- **Storage Monitoring**: Track usage and provide warnings
- **Compression**: Consider PDF compression for storage efficiency

## Troubleshooting

### Upload Issues

**"File too large" error:**
- Maximum file size is 10MB
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

### For Existing Users

**Upgrading to v4.12.0:**

1. **Automatic Migration:**
   - Database schema updated automatically on startup
   - No manual intervention required
   - Existing expenses unaffected

2. **Storage Setup:**
   - Invoice storage directory created automatically
   - Permissions set automatically
   - No configuration needed

3. **Backward Compatibility:**
   - All existing functionality preserved
   - Medical expenses work without invoices
   - No breaking changes

### For New Installations

**Setup Steps:**

1. **Install Application:**
   - Follow standard installation procedures
   - Invoice feature enabled by default

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
3. **Verify Uploads**: Check that invoice uploaded successfully
4. **Regular Backups**: Backup data regularly including invoices
5. **Organize Files**: Keep original files organized locally

### For Administrators

1. **Monitor Storage**: Track storage usage and plan capacity
2. **Regular Backups**: Ensure backups include invoice files
3. **Security Audits**: Review access logs periodically
4. **Performance Monitoring**: Track upload/download performance
5. **Documentation**: Keep troubleshooting guides updated

## Known Limitations

- **File Format**: Only PDF files supported (no images or other formats)
- **File Size**: 10MB maximum per file
- **One Invoice**: Only one invoice per expense
- **Browser Support**: PDF viewer requires modern browser
- **Mobile Upload**: Limited by device capabilities

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

**Last Updated:** January 15, 2026  
**Version:** 4.12.0  
**Status:** Active
