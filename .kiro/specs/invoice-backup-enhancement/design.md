# Design Document: Invoice Backup Enhancement

## Overview

This design enhances the existing `BackupService` to create comprehensive tar.gz archive backups that include the SQLite database, invoice PDF files, and configuration files. The implementation uses Node.js's built-in `zlib` module combined with the `tar` npm package to create and extract archives.

The key changes involve:
1. Replacing the simple file copy with archive creation
2. Adding archive extraction for restore operations
3. Updating backup listing to handle the new format
4. Modifying cleanup to work with `.tar.gz` files

## Architecture

```mermaid
flowchart TB
    subgraph BackupService
        performBackup[performBackup]
        restoreBackup[restoreBackup]
        getBackupList[getBackupList]
        cleanupOldBackups[cleanupOldBackups]
    end
    
    subgraph ArchiveUtils["Archive Utilities (new)"]
        createArchive[createArchive]
        extractArchive[extractArchive]
        listArchiveContents[listArchiveContents]
    end
    
    subgraph Storage
        DB[(expenses.db)]
        Invoices[/invoices/YYYY/MM/]
        Config[/config/]
        Backups[/backups/*.tar.gz]
    end
    
    performBackup --> createArchive
    createArchive --> DB
    createArchive --> Invoices
    createArchive --> Config
    createArchive --> Backups
    
    restoreBackup --> extractArchive
    extractArchive --> Backups
    extractArchive --> DB
    extractArchive --> Invoices
    extractArchive --> Config
    
    getBackupList --> Backups
    cleanupOldBackups --> Backups
```

## Components and Interfaces

### 1. Archive Utilities Module (New)

A new utility module `backend/utils/archiveUtils.js` will handle tar.gz creation and extraction.

```javascript
/**
 * Archive utilities for backup operations
 */
class ArchiveUtils {
  /**
   * Create a tar.gz archive from multiple source paths
   * @param {string} outputPath - Path for the output archive
   * @param {Array<{source: string, archivePath: string}>} entries - Files/dirs to include
   * @returns {Promise<{success: boolean, size: number}>}
   */
  async createArchive(outputPath, entries) {}
  
  /**
   * Extract a tar.gz archive to a destination
   * @param {string} archivePath - Path to the archive
   * @param {string} destPath - Destination directory
   * @returns {Promise<{success: boolean, filesExtracted: number}>}
   */
  async extractArchive(archivePath, destPath) {}
  
  /**
   * List contents of a tar.gz archive
   * @param {string} archivePath - Path to the archive
   * @returns {Promise<Array<{name: string, size: number}>>}
   */
  async listArchiveContents(archivePath) {}
}
```

### 2. Enhanced BackupService

The existing `BackupService` will be modified to use archive operations.

```javascript
class BackupService {
  /**
   * Perform a comprehensive backup
   * Creates tar.gz archive with database, invoices, and config
   * @param {string} targetPath - Optional custom backup path
   * @returns {Promise<{success: boolean, filename: string, path: string, timestamp: string, size: number}>}
   */
  async performBackup(targetPath = null) {}
  
  /**
   * Restore from an archive backup
   * @param {string} backupPath - Path to the backup archive
   * @returns {Promise<{success: boolean, filesRestored: number, message: string}>}
   */
  async restoreBackup(backupPath) {}
  
  /**
   * Get list of existing backups with details
   * @returns {Array<{name: string, size: number, created: string, path: string}>}
   */
  getBackupList() {}
  
  /**
   * Get backup storage statistics
   * @returns {Promise<{totalSize: number, backupCount: number, invoiceSize: number}>}
   */
  async getStorageStats() {}
  
  /**
   * Clean up old backups based on retention policy
   * @param {string} backupPath - Backup directory path
   */
  cleanupOldBackups(backupPath) {}
}
```

### 3. Backup Controller Updates

The existing backup controller will be updated to expose the new restore endpoint.

```javascript
// New endpoint
router.post('/restore', backupController.restoreBackup);

// Updated endpoint to include storage stats
router.get('/stats', backupController.getStorageStats);
```

## Data Models

### Archive Structure

The tar.gz archive will have the following internal structure:

```
expense-tracker-backup-{timestamp}.tar.gz
├── database/
│   └── expenses.db
├── invoices/
│   ├── 2024/
│   │   ├── 01/
│   │   │   └── *.pdf
│   │   └── 02/
│   │       └── *.pdf
│   └── 2025/
│       └── ...
└── config/
    └── backupConfig.json
```

### Backup Metadata

```javascript
{
  filename: "expense-tracker-backup-2025-01-15_14-30-00.tar.gz",
  path: "/config/backups/expense-tracker-backup-2025-01-15_14-30-00.tar.gz",
  size: 15728640,  // bytes
  created: "2025-01-15T14:30:00.000Z",
  type: "archive"
}
```

### Storage Statistics

```javascript
{
  totalBackupSize: 157286400,      // Total size of all backups in bytes
  totalBackupSizeMB: 150.0,        // Total size in MB
  backupCount: 7,                  // Number of backup archives
  invoiceStorageSize: 52428800,    // Total invoice storage in bytes
  invoiceStorageSizeMB: 50.0,      // Invoice storage in MB
  invoiceCount: 125                // Number of invoice files
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Archive Contains All Data

*For any* backup operation with a database file, invoice files, and configuration files present, the created archive SHALL contain all three components.

**Validates: Requirements 1.1**

### Property 2: Filename Format Compliance

*For any* backup operation, the generated filename SHALL match the pattern `expense-tracker-backup-{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}.tar.gz`.

**Validates: Requirements 1.3**

### Property 3: Backup/Restore Round-Trip

*For any* set of database content, invoice files (with their directory structure), and configuration files, creating a backup and then restoring from that backup SHALL produce data equivalent to the original.

**Validates: Requirements 1.2, 4.1, 4.2**

### Property 4: Backup Listing Accuracy

*For any* set of backup archives in the backup directory, the backup listing SHALL report accurate filename, size, and creation timestamp for each backup.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 5: Retention Policy Enforcement

*For any* backup directory with N backups where N > keepLastN, after cleanup the directory SHALL contain exactly keepLastN backups, and those backups SHALL be the N newest by creation time.

**Validates: Requirements 3.1, 3.2**

### Property 6: Restore File Count Accuracy

*For any* restore operation, the reported number of files restored SHALL equal the actual number of files extracted from the archive.

**Validates: Requirements 4.3**

### Property 7: Storage Statistics Accuracy

*For any* backup directory and invoice storage, the reported statistics SHALL accurately reflect the total backup size (sum of all archive sizes), backup count, and invoice storage size.

**Validates: Requirements 5.1, 5.2, 5.3**

## Error Handling

### Archive Creation Errors

| Error Condition | Handling |
|----------------|----------|
| Database file not found | Log error, throw with message "Database file not found" |
| Insufficient disk space | Log error, throw with message "Insufficient disk space for backup" |
| Permission denied | Log error, throw with message "Permission denied: cannot write to backup directory" |
| Archive creation failure | Log error, clean up partial archive, throw with descriptive message |

### Archive Extraction Errors

| Error Condition | Handling |
|----------------|----------|
| Archive file not found | Log error, throw with message "Backup file not found" |
| Corrupted archive | Log error, throw with message "Backup archive is corrupted or invalid" |
| Permission denied | Log error, throw with message "Permission denied: cannot write to destination" |
| Insufficient disk space | Log error, throw with message "Insufficient disk space for restore" |

### Graceful Degradation

- If invoice directory doesn't exist during backup, create archive with database and config only
- If config file doesn't exist during backup, create archive with database and invoices only
- Log warnings for missing optional components but don't fail the backup

## Testing Strategy

### Unit Tests

Unit tests will cover:
- Archive utility functions (create, extract, list)
- Filename generation and parsing
- Path handling for different environments
- Error condition handling

### Property-Based Tests

Property-based tests will use a testing library (e.g., fast-check) to verify:
- Round-trip backup/restore preserves all data
- Retention policy correctly keeps newest backups
- Storage statistics accurately reflect actual storage

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: **Feature: invoice-backup-enhancement, Property {N}: {description}**

### Integration Tests

Integration tests will verify:
- End-to-end backup creation with real files
- End-to-end restore with real archives
- Scheduled backup functionality
- API endpoint responses

### Test Data Generation

For property-based tests, generators will create:
- Random database content (using SQLite in-memory)
- Random invoice files with valid PDF headers
- Random directory structures (year/month combinations)
- Random configuration values
