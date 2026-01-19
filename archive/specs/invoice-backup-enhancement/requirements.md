# Requirements Document

## Introduction

This feature enhances the existing backup service to create comprehensive backups that include all user data. Currently, the backup system only backs up the SQLite database file (`expenses.db`), leaving invoice files and configuration unprotected. This creates a data integrity risk where restored backups may have incomplete data.

The enhancement will replace the database-only backup with a comprehensive archive backup (tar.gz format) that includes the database, invoice files, and configuration files, ensuring complete data recovery capability.

## Glossary

- **Backup_Service**: The existing service (`backupService.js`) responsible for creating and managing backups
- **Invoice_Storage**: The file storage system that organizes invoice PDFs in year/month subdirectories
- **Archive_Backup**: A compressed tar.gz file containing the database, invoices, and configuration
- **Backup_Config**: The JSON configuration file that stores backup settings including schedule and retention

## Requirements

### Requirement 1: Comprehensive Archive Backup Creation

**User Story:** As a user, I want my backups to include all my data (database, invoices, and configuration), so that I can fully restore my expense tracker.

#### Acceptance Criteria

1. WHEN a backup is triggered (manual or scheduled), THE Backup_Service SHALL create a tar.gz archive containing the database file, all invoice files, and configuration files
2. WHEN creating an archive backup, THE Backup_Service SHALL preserve the invoice directory structure (YYYY/MM subdirectories)
3. WHEN creating an archive backup, THE Backup_Service SHALL generate a filename with format `expense-tracker-backup-{timestamp}.tar.gz`
4. WHEN the invoice directory is empty, THE Backup_Service SHALL create an archive containing the database and configuration files
5. IF an error occurs during archive creation, THEN THE Backup_Service SHALL log the error and return a descriptive error message

### Requirement 2: Backup Listing and Information

**User Story:** As a user, I want to see information about my backups, so that I can understand what data is protected.

#### Acceptance Criteria

1. WHEN listing backups, THE Backup_Service SHALL display the backup filename and creation timestamp
2. WHEN listing backups, THE Backup_Service SHALL display the file size for each backup
3. WHEN getting backup details, THE Backup_Service SHALL report the archive contents summary

### Requirement 3: Backup Cleanup and Retention

**User Story:** As a user, I want old backups to be automatically cleaned up according to my retention settings, so that backup storage doesn't grow unbounded.

#### Acceptance Criteria

1. WHEN cleaning up old backups, THE Backup_Service SHALL apply the `keepLastN` retention policy to archive backups
2. WHEN cleaning up old backups, THE Backup_Service SHALL delete the oldest archives first when the count exceeds `keepLastN`

### Requirement 4: Restore from Archive

**User Story:** As a user, I want to restore from archive backups, so that I can recover my complete expense data.

#### Acceptance Criteria

1. WHEN restoring from an archive backup, THE Backup_Service SHALL extract and restore the database, invoice files, and configuration
2. WHEN restoring invoice files, THE Backup_Service SHALL recreate the year/month directory structure
3. WHEN a restore operation completes, THE Backup_Service SHALL report the number of files restored
4. IF an error occurs during restore, THEN THE Backup_Service SHALL log the error and return a descriptive error message

### Requirement 5: Storage Statistics

**User Story:** As a user, I want to see storage statistics for my backups, so that I can monitor disk usage.

#### Acceptance Criteria

1. WHEN getting backup statistics, THE Backup_Service SHALL report total backup storage size
2. WHEN getting backup statistics, THE Backup_Service SHALL report the count of archive backups
3. WHEN getting backup statistics, THE Backup_Service SHALL report the total invoice storage size
