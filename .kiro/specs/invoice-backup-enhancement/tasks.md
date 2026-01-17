# Implementation Plan: Invoice Backup Enhancement

## Overview

This implementation plan converts the database-only backup system to a comprehensive archive backup system that includes the database, invoice files, and configuration. The implementation uses the `tar` npm package for archive operations.

## Tasks

- [x] 1. Create Archive Utilities Module
  - [x] 1.1 Install tar package and create archiveUtils.js
    - Add `tar` package to backend dependencies
    - Create `backend/utils/archiveUtils.js` with ArchiveUtils class
    - Implement `createArchive()` method using tar.create()
    - Implement `extractArchive()` method using tar.extract()
    - Implement `listArchiveContents()` method using tar.list()
    - _Requirements: 1.1, 4.1_
  
  - [x] 1.2 Write unit tests for archiveUtils
    - Test archive creation with multiple files
    - Test archive extraction
    - Test listing archive contents
    - Test error handling for invalid paths
    - _Requirements: 1.1, 1.5, 4.1, 4.4_

- [x] 2. Update BackupService for Archive Backups
  - [x] 2.1 Modify performBackup() to create tar.gz archives
    - Update to collect database, invoices, and config paths
    - Use archiveUtils.createArchive() instead of fs.copyFileSync()
    - Update filename format to use .tar.gz extension
    - Handle empty invoice directory gracefully
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 2.2 Write property test for archive contents
    - **Property 1: Archive Contains All Data**
    - **Validates: Requirements 1.1**
  
  - [x] 2.3 Write property test for filename format
    - **Property 2: Filename Format Compliance**
    - **Validates: Requirements 1.3**

- [x] 3. Implement Restore Functionality
  - [x] 3.1 Add restoreBackup() method to BackupService
    - Accept backup file path as parameter
    - Use archiveUtils.extractArchive() to restore files
    - Restore to appropriate directories (database, invoices, config)
    - Return count of files restored
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 3.2 Write property test for backup/restore round-trip
    - **Property 3: Backup/Restore Round-Trip**
    - **Validates: Requirements 1.2, 4.1, 4.2**
  
  - [x] 3.3 Write property test for restore file count
    - **Property 6: Restore File Count Accuracy**
    - **Validates: Requirements 4.3**

- [x] 4. Checkpoint - Verify core backup/restore functionality
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Update Backup Listing and Cleanup
  - [ ] 5.1 Update getBackupList() for tar.gz files
    - Change file filter from .db to .tar.gz extension
    - Include file size and creation timestamp
    - _Requirements: 2.1, 2.2_
  
  - [ ] 5.2 Update cleanupOldBackups() for tar.gz files
    - Change file filter from .db to .tar.gz extension
    - Maintain keepLastN retention policy
    - Delete oldest archives first
    - _Requirements: 3.1, 3.2_
  
  - [ ] 5.3 Write property test for backup listing accuracy
    - **Property 4: Backup Listing Accuracy**
    - **Validates: Requirements 2.1, 2.2, 2.3**
  
  - [ ] 5.4 Write property test for retention policy
    - **Property 5: Retention Policy Enforcement**
    - **Validates: Requirements 3.1, 3.2**

- [ ] 6. Add Storage Statistics
  - [ ] 6.1 Implement getStorageStats() method
    - Calculate total backup storage size
    - Count backup archives
    - Get invoice storage size from fileStorage utility
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [ ] 6.2 Write property test for storage statistics
    - **Property 7: Storage Statistics Accuracy**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [ ] 7. Update API Endpoints
  - [ ] 7.1 Add restore endpoint to backup routes
    - Add POST /api/backup/restore endpoint
    - Accept backup filename in request body
    - Return restore result with file count
    - _Requirements: 4.1, 4.3_
  
  - [ ] 7.2 Add storage stats endpoint
    - Add GET /api/backup/stats endpoint
    - Return storage statistics object
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [ ] 7.3 Write integration tests for new endpoints
    - Test restore endpoint with valid backup
    - Test restore endpoint with invalid backup
    - Test stats endpoint
    - _Requirements: 4.1, 4.4, 5.1, 5.2, 5.3_

- [ ] 8. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required for comprehensive implementation
- Each task references specific requirements for traceability
- The `tar` npm package is used for cross-platform archive support
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
