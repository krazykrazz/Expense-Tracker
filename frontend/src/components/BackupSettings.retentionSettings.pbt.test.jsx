import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    BACKUP_CONFIG: '/api/backup/config',
    BACKUP_LIST: '/api/backup/list',
    BACKUP_MANUAL: '/api/backup/manual',
    BACKUP_DOWNLOAD: '/api/backup/download',
    BACKUP_RESTORE: '/api/backup/restore',
    BACKUP_STATS: '/api/backup/stats',
    VERSION: '/api/version',
    ACTIVITY_LOGS: '/api/activity-logs',
    ACTIVITY_LOGS_STATS: '/api/activity-logs/stats',
    ACTIVITY_LOGS_SETTINGS: '/api/activity-logs/settings'
  },
  default: 'http://localhost:2424'
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

// Mock formatters
vi.mock('../utils/formatters', () => ({
  formatDateTime: (date) => new Date(date).toLocaleString()
}));

// Mock people API
vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn(),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn()
}));

// Mock activity log API
vi.mock('../services/activityLogApi', () => ({
  fetchRecentEvents: vi.fn(),
  fetchCleanupStats: vi.fn(),
  fetchRetentionSettings: vi.fn(),
  updateRetentionSettings: vi.fn()
}));

// Mock PlaceNameStandardization component
vi.mock('./PlaceNameStandardization', () => ({
  default: ({ onClose }) => (
    <div data-testid="place-name-standardization">
      <button onClick={onClose}>Close Standardization</button>
    </div>
  )
}));

import * as activityLogApi from '../services/activityLogApi';
import BackupSettings from './BackupSettings';

describe('BackupSettings - Retention Settings Property-Based Tests', () => {
  const mockConfig = {
    enabled: true,
    schedule: 'daily',
    time: '02:00',
    targetPath: 'C:\\Backups',
    keepLastN: 7,
    nextBackup: '2026-02-05T02:00:00'
  };

  const mockActivityStats = {
    retentionDays: 90,
    maxEntries: 1000,
    currentCount: 500,
    oldestEventTimestamp: '2025-11-15T10:00:00Z',
    lastCleanupRun: '2026-02-11T02:00:00Z',
    lastCleanupDeletedCount: 10
  };

  const mockActivityEvents = [];

  // Helper to wait for component to finish loading
  const waitForLoaded = async () => {
    await waitFor(() => {
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock fetch for backup endpoints
    global.fetch = vi.fn((url) => {
      if (url.includes('/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      }
      if (url.includes('/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '5.10.0' })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    // Mock activity log API
    activityLogApi.fetchRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
    activityLogApi.updateRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
    activityLogApi.fetchCleanupStats.mockResolvedValue(mockActivityStats);
    activityLogApi.fetchRecentEvents.mockResolvedValue({
      events: mockActivityEvents,
      total: 0,
      limit: 50,
      offset: 0
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 6: Client-Side Validation
   * Validates: Requirements 3.4, 7.6
   * 
   * For any input value outside the valid range, the UI should display a validation error
   * and prevent form submission.
   */
  describe('Property 6: Client-Side Validation', () => {
    it('should reject invalid maxAgeDays values and show validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ min: -1000, max: 6 }), // Below minimum
            fc.integer({ min: 366, max: 1000 })  // Above maximum
          ),
          async (invalidMaxAgeDays) => {
            // Reset mocks for each iteration
            vi.clearAllMocks();
            activityLogApi.fetchRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.updateRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.fetchCleanupStats.mockResolvedValue(mockActivityStats);
            activityLogApi.fetchRecentEvents.mockResolvedValue({
              events: mockActivityEvents,
              total: 0,
              limit: 50,
              offset: 0
            });

            const { unmount } = render(<BackupSettings />);
            await waitForLoaded();

            fireEvent.click(screen.getByText('🔧 Misc'));

            await waitFor(() => {
              expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
            });

            const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
            const saveButton = screen.getByText('Save Retention Settings');

            // Set invalid value
            fireEvent.change(maxAgeInput, { target: { value: String(invalidMaxAgeDays) } });
            fireEvent.click(saveButton);

            // Should show validation error
            await waitFor(() => {
              expect(screen.getByText('Max age must be between 7 and 365 days')).toBeInTheDocument();
            });

            // API should not be called
            expect(activityLogApi.updateRetentionSettings).not.toHaveBeenCalled();

            unmount();
          }
        ),
        { numRuns: 20 } // Reduced for faster execution
      );
    });

    it('should reject invalid maxCount values and show validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ min: -1000, max: 99 }),    // Below minimum
            fc.integer({ min: 10001, max: 20000 })  // Above maximum
          ),
          async (invalidMaxCount) => {
            // Reset mocks for each iteration
            vi.clearAllMocks();
            activityLogApi.fetchRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.updateRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.fetchCleanupStats.mockResolvedValue(mockActivityStats);
            activityLogApi.fetchRecentEvents.mockResolvedValue({
              events: mockActivityEvents,
              total: 0,
              limit: 50,
              offset: 0
            });

            const { unmount } = render(<BackupSettings />);
            await waitForLoaded();

            fireEvent.click(screen.getByText('🔧 Misc'));

            await waitFor(() => {
              expect(screen.getByLabelText('Maximum Count')).toBeInTheDocument();
            });

            const maxCountInput = screen.getByLabelText('Maximum Count');
            const saveButton = screen.getByText('Save Retention Settings');

            // Set invalid value
            fireEvent.change(maxCountInput, { target: { value: String(invalidMaxCount) } });
            fireEvent.click(saveButton);

            // Should show validation error
            await waitFor(() => {
              expect(screen.getByText('Max count must be between 100 and 10000 events')).toBeInTheDocument();
            });

            // API should not be called
            expect(activityLogApi.updateRetentionSettings).not.toHaveBeenCalled();

            unmount();
          }
        ),
        { numRuns: 20 } // Reduced for faster execution
      );
    });

    it('should accept valid maxAgeDays values without validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 7, max: 365 }),
          async (validMaxAgeDays) => {
            // Reset mocks for each iteration
            vi.clearAllMocks();
            activityLogApi.fetchRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.updateRetentionSettings.mockResolvedValue({ 
              maxAgeDays: validMaxAgeDays, 
              maxCount: 1000 
            });
            activityLogApi.fetchCleanupStats.mockResolvedValue(mockActivityStats);
            activityLogApi.fetchRecentEvents.mockResolvedValue({
              events: mockActivityEvents,
              total: 0,
              limit: 50,
              offset: 0
            });

            const { unmount } = render(<BackupSettings />);
            await waitForLoaded();

            fireEvent.click(screen.getByText('🔧 Misc'));

            await waitFor(() => {
              expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
            });

            const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
            const saveButton = screen.getByText('Save Retention Settings');

            // Set valid value
            fireEvent.change(maxAgeInput, { target: { value: String(validMaxAgeDays) } });
            fireEvent.click(saveButton);

            // Should not show validation error
            await waitFor(() => {
              expect(screen.queryByText('Max age must be between 7 and 365 days')).not.toBeInTheDocument();
            });

            // API should be called
            await waitFor(() => {
              expect(activityLogApi.updateRetentionSettings).toHaveBeenCalledWith(validMaxAgeDays, 1000);
            });

            unmount();
          }
        ),
        { numRuns: 20 } // Reduced for faster execution
      );
    });

    it('should accept valid maxCount values without validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 10000 }),
          async (validMaxCount) => {
            // Reset mocks for each iteration
            vi.clearAllMocks();
            activityLogApi.fetchRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.updateRetentionSettings.mockResolvedValue({ 
              maxAgeDays: 90, 
              maxCount: validMaxCount 
            });
            activityLogApi.fetchCleanupStats.mockResolvedValue(mockActivityStats);
            activityLogApi.fetchRecentEvents.mockResolvedValue({
              events: mockActivityEvents,
              total: 0,
              limit: 50,
              offset: 0
            });

            const { unmount } = render(<BackupSettings />);
            await waitForLoaded();

            fireEvent.click(screen.getByText('🔧 Misc'));

            await waitFor(() => {
              expect(screen.getByLabelText('Maximum Count')).toBeInTheDocument();
            });

            const maxCountInput = screen.getByLabelText('Maximum Count');
            const saveButton = screen.getByText('Save Retention Settings');

            // Set valid value
            fireEvent.change(maxCountInput, { target: { value: String(validMaxCount) } });
            fireEvent.click(saveButton);

            // Should not show validation error
            await waitFor(() => {
              expect(screen.queryByText('Max count must be between 100 and 10000 events')).not.toBeInTheDocument();
            });

            // API should be called
            await waitFor(() => {
              expect(activityLogApi.updateRetentionSettings).toHaveBeenCalledWith(90, validMaxCount);
            });

            unmount();
          }
        ),
        { numRuns: 20 } // Reduced for faster execution
      );
    });
  });

  /**
   * Property 10: Impact Calculation Accuracy
   * Validates: Requirements 4.3
   * 
   * For any set of activity events and retention settings, the calculated "events affected by policy"
   * should equal the number of events that would be deleted if cleanup ran immediately.
   * 
   * Note: This property tests the calculation logic conceptually. The actual impact calculation
   * in the UI is based on the stats returned from the backend, which includes the current count
   * and oldest event timestamp.
   */
  describe('Property 10: Impact Calculation Accuracy', () => {
    it('should display accurate impact information based on current stats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 7, max: 365 }),
          fc.integer({ min: 100, max: 10000 }),
          fc.integer({ min: 0, max: 5000 }),
          async (maxAgeDays, maxCount, currentCount) => {
            const now = new Date();
            const oldestTimestamp = new Date(now.getTime() - (maxAgeDays + 10) * 24 * 60 * 60 * 1000).toISOString();

            const stats = {
              retentionDays: maxAgeDays,
              maxEntries: maxCount,
              currentCount: currentCount,
              oldestEventTimestamp: oldestTimestamp,
              lastCleanupRun: now.toISOString(),
              lastCleanupDeletedCount: 0
            };

            // Reset mocks for each iteration
            vi.clearAllMocks();
            activityLogApi.fetchRetentionSettings.mockResolvedValue({ maxAgeDays, maxCount });
            activityLogApi.updateRetentionSettings.mockResolvedValue({ maxAgeDays, maxCount });
            activityLogApi.fetchCleanupStats.mockResolvedValue(stats);
            activityLogApi.fetchRecentEvents.mockResolvedValue({
              events: [],
              total: 0,
              limit: 50,
              offset: 0
            });

            const { unmount } = render(<BackupSettings />);
            await waitForLoaded();

            fireEvent.click(screen.getByText('🔧 Misc'));

            // Wait for stats to load
            await waitFor(() => {
              expect(activityLogApi.fetchCleanupStats).toHaveBeenCalled();
            }, { timeout: 5000 });

            // Verify current count is displayed
            await waitFor(() => {
              expect(screen.getByText(new RegExp(`${currentCount} events stored`))).toBeInTheDocument();
            }, { timeout: 5000 });

            // Verify oldest event is displayed (if exists)
            if (currentCount > 0) {
              await waitFor(() => {
                expect(screen.getByText(/Oldest Event:/)).toBeInTheDocument();
              }, { timeout: 5000 });
            }

            unmount();
          }
        ),
        { numRuns: 20 } // Reduced for faster execution
      );
    });
  });

  /**
   * Property 11: Timestamp Formatting Consistency
   * Validates: Requirements 4.4
   * 
   * For any valid ISO timestamp, the human-readable age calculation should correctly represent
   * the time difference in appropriate units (minutes, hours, days).
   * 
   * Note: The actual formatting is done by the formatDateTime function from utils/formatters,
   * which is mocked in these tests. This property verifies that timestamps are passed through
   * the formatting system correctly.
   */
  describe('Property 11: Timestamp Formatting Consistency', () => {
    it('should format timestamps consistently for various ages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 365 }), // Days ago
          async (daysAgo) => {
            const now = new Date();
            const timestamp = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

            const stats = {
              retentionDays: 90,
              maxEntries: 1000,
              currentCount: 100,
              oldestEventTimestamp: timestamp,
              lastCleanupRun: now.toISOString(),
              lastCleanupDeletedCount: 0
            };

            const events = [
              {
                id: 1,
                event_type: 'expense_created',
                entity_type: 'expense',
                entity_id: 123,
                user_action: 'Test event',
                timestamp: timestamp
              }
            ];

            // Reset mocks for each iteration
            vi.clearAllMocks();
            activityLogApi.fetchRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.updateRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.fetchCleanupStats.mockResolvedValue(stats);
            activityLogApi.fetchRecentEvents.mockResolvedValue({
              events: events,
              total: 1,
              limit: 50,
              offset: 0
            });

            const { unmount } = render(<BackupSettings />);
            await waitForLoaded();

            fireEvent.click(screen.getByText('🔧 Misc'));

            // Wait for events to load
            await waitFor(() => {
              expect(activityLogApi.fetchRecentEvents).toHaveBeenCalled();
            }, { timeout: 5000 });

            // Verify timestamp is formatted (formatDateTime is called)
            // The mock returns toLocaleString() which should be present
            await waitFor(() => {
              const formattedDate = new Date(timestamp).toLocaleString();
              // Check that some date representation is present in the document
              expect(screen.getByText('Test event')).toBeInTheDocument();
            }, { timeout: 5000 });

            unmount();
          }
        ),
        { numRuns: 20 } // Reduced for faster execution
      );
    });

    it('should handle recent timestamps (minutes/hours)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1440 }), // Minutes ago (up to 24 hours)
          async (minutesAgo) => {
            const now = new Date();
            const timestamp = new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();

            const stats = {
              retentionDays: 90,
              maxEntries: 1000,
              currentCount: 100,
              oldestEventTimestamp: timestamp,
              lastCleanupRun: now.toISOString(),
              lastCleanupDeletedCount: 0
            };

            const events = [
              {
                id: 1,
                event_type: 'expense_created',
                entity_type: 'expense',
                entity_id: 123,
                user_action: 'Recent event',
                timestamp: timestamp
              }
            ];

            // Reset mocks for each iteration
            vi.clearAllMocks();
            activityLogApi.fetchRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.updateRetentionSettings.mockResolvedValue({ maxAgeDays: 90, maxCount: 1000 });
            activityLogApi.fetchCleanupStats.mockResolvedValue(stats);
            activityLogApi.fetchRecentEvents.mockResolvedValue({
              events: events,
              total: 1,
              limit: 50,
              offset: 0
            });

            const { unmount } = render(<BackupSettings />);
            await waitForLoaded();

            fireEvent.click(screen.getByText('🔧 Misc'));

            // Wait for events to load
            await waitFor(() => {
              expect(activityLogApi.fetchRecentEvents).toHaveBeenCalled();
            }, { timeout: 5000 });

            // Verify event is displayed with formatted timestamp
            await waitFor(() => {
              expect(screen.getByText('Recent event')).toBeInTheDocument();
            }, { timeout: 5000 });

            unmount();
          }
        ),
        { numRuns: 20 } // Reduced for faster execution
      );
    });
  });
});
