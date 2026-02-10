const backupService = require('./backupService');
const activityLogService = require('./activityLogService');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../database/db');

// Feature: activity-log, Property 6: System Event Null Entity ID
// Validates: Requirements 6D.1, 6D.2, 6D.3, 6D.4, 6D.5

describe('BackupService - Activity Log Integration', () => {
  let testBackupPath;

  beforeEach(() => {
    // Create a temporary backup directory for tests
    testBackupPath = path.join(__dirname, '..', 'test-backups', `test-${Date.now()}`);
    if (!fs.existsSync(testBackupPath)) {
      fs.mkdirSync(testBackupPath, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test backup directory
    if (fs.existsSync(testBackupPath)) {
      fs.rmSync(testBackupPath, { recursive: true, force: true });
    }
  });

  describe('Property 6: System Event Null Entity ID', () => {
    it('should log backup_created event with null entity_id and system metadata', async () => {
      // Perform backup
      const backupResult = await backupService.performBackup(testBackupPath);

      expect(backupResult.success).toBe(true);
      expect(backupResult.filename).toBeDefined();
      expect(backupResult.size).toBeGreaterThan(0);

      // Retrieve recent activity logs
      const activityLogs = await activityLogService.getRecentEvents(10, 0);

      // Find the backup_created event
      const backupEvent = activityLogs.events.find(
        event => event.event_type === 'backup_created'
      );

      // Verify event exists
      expect(backupEvent).toBeDefined();

      // Verify event properties
      expect(backupEvent.event_type).toBe('backup_created');
      expect(backupEvent.entity_type).toBe('system');
      expect(backupEvent.entity_id).toBeNull(); // Requirement 6D.5
      expect(backupEvent.user_action).toContain('Created backup:');
      expect(backupEvent.user_action).toContain(backupResult.filename);

      // Verify metadata
      expect(backupEvent.metadata).toBeDefined();
      expect(backupEvent.metadata.filename).toBe(backupResult.filename); // Requirement 6D.3
      expect(backupEvent.metadata.size).toBe(backupResult.size); // Requirement 6D.3
    });

    it('should log backup_restored event with null entity_id and system metadata', async () => {
      // First, create a backup
      const backupResult = await backupService.performBackup(testBackupPath);
      const backupFilePath = backupResult.path;

      // Restore from the backup
      const restoreResult = await backupService.restoreBackup(backupFilePath);

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.filesRestored).toBeGreaterThan(0);

      // Retrieve recent activity logs
      const activityLogs = await activityLogService.getRecentEvents(10, 0);

      // Find the backup_restored event
      const restoreEvent = activityLogs.events.find(
        event => event.event_type === 'backup_restored'
      );

      // Verify event exists
      expect(restoreEvent).toBeDefined();

      // Verify event properties
      expect(restoreEvent.event_type).toBe('backup_restored');
      expect(restoreEvent.entity_type).toBe('system');
      expect(restoreEvent.entity_id).toBeNull(); // Requirement 6D.5
      expect(restoreEvent.user_action).toContain('Restored backup:');
      expect(restoreEvent.user_action).toContain(backupResult.filename);

      // Verify metadata
      expect(restoreEvent.metadata).toBeDefined();
      expect(restoreEvent.metadata.filename).toBe(backupResult.filename); // Requirement 6D.4
      expect(restoreEvent.metadata.filesRestored).toBe(restoreResult.filesRestored);
    });

    it('should not fail backup operation if activity logging fails', async () => {
      // Mock activityLogService.logEvent to throw an error
      const originalLogEvent = activityLogService.logEvent;
      activityLogService.logEvent = jest.fn().mockRejectedValue(new Error('Logging failed'));

      try {
        // Perform backup - should succeed despite logging failure
        const backupResult = await backupService.performBackup(testBackupPath);

        expect(backupResult.success).toBe(true);
        expect(backupResult.filename).toBeDefined();
        expect(backupResult.size).toBeGreaterThan(0);

        // Verify that logging was attempted
        expect(activityLogService.logEvent).toHaveBeenCalledWith(
          'backup_created',
          'system',
          null,
          expect.stringContaining('Created backup:'),
          expect.objectContaining({
            filename: expect.any(String),
            size: expect.any(Number)
          })
        );
      } finally {
        // Restore original implementation
        activityLogService.logEvent = originalLogEvent;
      }
    });

    it('should not fail restore operation if activity logging fails', async () => {
      // First, create a backup
      const backupResult = await backupService.performBackup(testBackupPath);
      const backupFilePath = backupResult.path;

      // Mock activityLogService.logEvent to throw an error
      const originalLogEvent = activityLogService.logEvent;
      activityLogService.logEvent = jest.fn().mockRejectedValue(new Error('Logging failed'));

      try {
        // Restore from the backup - should succeed despite logging failure
        const restoreResult = await backupService.restoreBackup(backupFilePath);

        expect(restoreResult.success).toBe(true);
        expect(restoreResult.filesRestored).toBeGreaterThan(0);

        // Verify that logging was attempted
        expect(activityLogService.logEvent).toHaveBeenCalledWith(
          'backup_restored',
          'system',
          null,
          expect.stringContaining('Restored backup:'),
          expect.objectContaining({
            filename: expect.any(String),
            filesRestored: expect.any(Number)
          })
        );
      } finally {
        // Restore original implementation
        activityLogService.logEvent = originalLogEvent;
      }
    });
  });
});
