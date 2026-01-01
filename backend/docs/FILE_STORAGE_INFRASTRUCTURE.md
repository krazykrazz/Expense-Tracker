# File Storage Infrastructure

## Overview

The file storage infrastructure provides secure, organized storage for invoice PDF attachments in the medical expense tracking system. It includes utilities for directory management, file validation, security, and cleanup operations.

## Directory Structure

```
/config/
├── invoices/
│   ├── temp/                    # Temporary uploads
│   ├── 2025/
│   │   ├── 01/                  # January 2025
│   │   │   ├── 123_1704067200_receipt.pdf
│   │   │   └── 124_1704153600_medical_bill.pdf
│   │   ├── 02/                  # February 2025
│   │   └── ...
│   ├── 2024/
│   └── ...
└── database/
    └── expenses.db
```

## Components

### 1. FileStorageUtils (`backend/utils/fileStorage.js`)

Core file storage operations and directory management.

#### Key Methods

- `initializeDirectories()` - Create base directory structure
- `generateDirectoryPath(date)` - Generate organized directory paths (YYYY/MM)
- `generateFilename(expenseId, originalFilename)` - Create unique filenames
- `sanitizeFilename(filename)` - Remove dangerous characters
- `generateFilePath(expenseId, originalFilename, date)` - Complete file path generation
- `moveFromTemp(tempPath, finalPath)` - Move files from temp to final location
- `deleteFile(filePath)` - Safe file deletion
- `cleanupTempFiles(maxAgeHours)` - Remove old temporary files
- `cleanupOrphanedFiles(getValidExpenseIds)` - Remove files without database records
- `getStorageStats()` - Get storage usage statistics

#### File Naming Convention

Format: `{expense_id}_{timestamp}_{sanitized_original_name}.pdf`

Example: `123_1704067200_medical_receipt.pdf`

### 2. FileValidationUtils (`backend/utils/fileValidation.js`)

Comprehensive file validation for security and integrity.

#### Validation Types

- **File Size**: 100 bytes minimum, 10MB maximum
- **File Type**: PDF only (magic number checking)
- **MIME Type**: `application/pdf` only
- **Security**: Path traversal prevention, dangerous character filtering
- **PDF Structure**: Basic PDF format validation

#### Key Methods

- `validateFile(file, filePath)` - Comprehensive file validation
- `validateFileSize(size)` - Size limit checking
- `validateFileExtension(filename)` - Extension validation
- `validateMimeType(mimeType)` - MIME type validation
- `validateFileContent(filePath)` - Content and structure validation
- `validateFileSecurity(filename)` - Security validation

### 3. FilePermissionsUtils (`backend/utils/filePermissions.js`)

File and directory permission management with cross-platform support.

#### Key Methods

- `setDirectoryPermissions(dirPath, restrictive)` - Set secure directory permissions
- `setFilePermissions(filePath, restrictive)` - Set secure file permissions
- `verifyFilePermissions(filePath)` - Check file security
- `verifyDirectoryPermissions(dirPath)` - Check directory security
- `hasPermission(filePath, operation)` - Check access permissions
- `initializeSecureStructure(basePath, subdirs)` - Create secure directory structure

#### Platform Support

- **Windows**: Uses basic access checking (read/write permissions)
- **Unix/Linux**: Full permission mode checking (owner/group/other)

### 4. InvoiceCleanupUtils (`backend/utils/invoiceCleanup.js`)

Automated cleanup and maintenance operations.

#### Features

- **Scheduled Cleanup**: Cron-based automatic cleanup (daily at 2 AM)
- **Temporary File Cleanup**: Remove old temp files (24+ hours old)
- **Orphaned File Cleanup**: Remove files without database records
- **Manual Cleanup**: On-demand cleanup operations
- **Storage Statistics**: Monitor storage usage

#### Key Methods

- `startScheduledCleanup(options)` - Start automated cleanup
- `stopScheduledCleanup()` - Stop automated cleanup
- `cleanupOrphanedFiles()` - Remove orphaned files
- `performManualCleanup(options)` - Manual cleanup operation
- `getCleanupStats()` - Get cleanup statistics

## Initialization

### Automatic Initialization

The file storage infrastructure is automatically initialized when the database starts:

```javascript
// In backend/database/db.js
const { initializeInvoiceStorage } = require('../scripts/initializeInvoiceStorage');

// Called during database initialization
await initializeInvoiceStorage();
```

### Manual Initialization

You can also initialize manually:

```bash
node backend/scripts/initializeInvoiceStorage.js
```

## Security Features

### File Validation

- **Magic Number Checking**: Verifies PDF file signature (`%PDF`)
- **Size Limits**: Prevents oversized uploads (10MB max)
- **Extension Filtering**: Only `.pdf` files allowed
- **MIME Type Validation**: Only `application/pdf` accepted

### Filename Security

- **Path Traversal Prevention**: Blocks `../` and similar patterns
- **Character Sanitization**: Removes dangerous characters (`<>:"/\|?*`)
- **Length Limits**: Maximum 255 characters
- **Reserved Name Checking**: Prevents Windows reserved names (CON, PRN, etc.)

### Directory Security

- **Proper Permissions**: Secure directory permissions (755/750)
- **Access Control**: Verify expense ownership before file operations
- **Isolation**: Files stored outside web root
- **Cleanup**: Automatic removal of orphaned files

## Usage Examples

### Basic File Operations

```javascript
const fileStorage = require('../utils/fileStorage');

// Initialize directories
await fileStorage.initializeDirectories();

// Generate file path
const expenseId = 123;
const originalName = 'medical_receipt.pdf';
const filePath = fileStorage.generateFilePath(expenseId, originalName);

// Move from temp to final location
await fileStorage.moveFromTemp(tempPath, filePath.fullPath);

// Delete file
await fileStorage.deleteFile(filePath.fullPath);
```

### File Validation

```javascript
const fileValidation = require('../utils/fileValidation');

// Validate uploaded file
const file = req.file; // Multer file object
const validation = await fileValidation.validateFile(file, file.path);

if (!validation.isValid) {
  throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
}
```

### Cleanup Operations

```javascript
const invoiceCleanup = require('../utils/invoiceCleanup');

// Start scheduled cleanup
invoiceCleanup.startScheduledCleanup({
  tempFileCleanupHours: 24,
  cronSchedule: '0 2 * * *' // Daily at 2 AM
});

// Manual cleanup
const results = await invoiceCleanup.performManualCleanup();
console.log(`Cleaned up ${results.tempFilesCleaned} temp files`);
```

## Configuration

### Environment Variables

- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `NODE_ENV` - Environment (development, production)

### File Limits

- **Maximum File Size**: 10MB
- **Minimum File Size**: 100 bytes
- **Allowed Extensions**: `.pdf`
- **Allowed MIME Types**: `application/pdf`

### Cleanup Schedule

- **Default Schedule**: Daily at 2 AM (`0 2 * * *`)
- **Temp File Age**: 24 hours
- **Orphaned File Check**: Weekly

## Error Handling

### Common Errors

- **File Too Large**: Returns 413 status with size limit message
- **Invalid File Type**: Returns 400 status with type requirement
- **File Not Found**: Returns 404 status
- **Permission Denied**: Returns 403 status
- **Storage Full**: Returns 507 status

### Error Recovery

- **Atomic Operations**: File and database operations are atomic
- **Rollback Support**: Failed operations clean up partial changes
- **Graceful Degradation**: System continues if cleanup fails
- **Retry Logic**: Automatic retry for transient failures

## Monitoring

### Storage Statistics

```javascript
const stats = await fileStorage.getStorageStats();
console.log(`Total files: ${stats.totalFiles}`);
console.log(`Total size: ${stats.totalSizeMB}MB`);
```

### Cleanup Statistics

```javascript
const cleanupStats = await invoiceCleanup.getCleanupStats();
console.log(`Temp files: ${cleanupStats.tempFiles.totalFiles}`);
console.log(`Last cleanup: ${cleanupStats.lastCleanup}`);
```

## Testing

Comprehensive test suite covers:

- Directory creation and management
- Filename sanitization and generation
- File validation (size, type, content, security)
- Permission checking and security
- Cleanup operations
- Error handling

Run tests:

```bash
npm test -- --testPathPatterns=fileStorage.test.js
```

## Maintenance

### Regular Tasks

1. **Monitor Storage Usage**: Check storage statistics regularly
2. **Review Cleanup Logs**: Ensure cleanup operations are working
3. **Validate Permissions**: Verify directory permissions are secure
4. **Check Orphaned Files**: Run orphaned file cleanup periodically

### Troubleshooting

1. **Permission Issues**: Run initialization script to fix permissions
2. **Storage Full**: Clean up old files or increase storage
3. **Cleanup Failures**: Check logs and run manual cleanup
4. **File Corruption**: Validate file integrity and restore from backup

## Future Enhancements

- **Cloud Storage Integration**: AWS S3, Google Cloud Storage
- **File Compression**: Automatic PDF compression
- **Virus Scanning**: Integration with antivirus services
- **Encryption**: File encryption at rest
- **CDN Integration**: Content delivery network for file serving
- **Backup Integration**: Automatic backup of invoice files