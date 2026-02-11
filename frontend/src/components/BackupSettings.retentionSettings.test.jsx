import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

describe('BackupSettings - Retention Settings UI', () => {
  const mockConfig = {
    enabled: true,
    schedule: 'daily',
    time: '02:00',
    targetPath: 'C:\\Backups',
    keepLastN: 7,
    nextBackup: '2026-02-05T02:00:00'
  };

  const mockRetentionSettings = {
    maxAgeDays: 90,
    maxCount: 1000
  };

  const mockActivityStats = {
    retentionDays: 90,
    maxEntries: 1000,
    currentCount: 500,
    oldestEventTimestamp: '2025-11-15T10:00:00Z',
    lastCleanupRun: '2026-02-11T02:00:00Z',
    lastCleanupDeletedCount: 10
  };

  const mockActivityEvents = [
    {
      id: 1,
      event_type: 'expense_created',
      entity_type: 'expense',
      entity_id: 123,
      user_action: 'Created expense: Groceries - $50.00',
      timestamp: '2026-02-11T10:00:00Z'
    },
    {
      id: 2,
      event_type: 'budget_updated',
      entity_type: 'budget',
      entity_id: 5,
      user_action: 'Updated budget for Groceries',
      timestamp: '2026-02-11T09:30:00Z'
    }
  ];

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
    activityLogApi.fetchRetentionSettings.mockResolvedValue(mockRetentionSettings);
    activityLogApi.updateRetentionSettings.mockResolvedValue(mockRetentionSettings);
    activityLogApi.fetchCleanupStats.mockResolvedValue(mockActivityStats);
    activityLogApi.fetchRecentEvents.mockResolvedValue({
      events: mockActivityEvents,
      total: 2,
      limit: 50,
      offset: 0
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Retention settings form rendering', () => {
    it('should render retention settings form with current values', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      // Switch to Misc tab
      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('📋 Activity Log Retention Policy')).toBeInTheDocument();
      });

      // Check that settings were fetched
      expect(activityLogApi.fetchRetentionSettings).toHaveBeenCalled();

      // Check form fields are rendered with correct values
      const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
      const maxCountInput = screen.getByLabelText('Maximum Count');

      expect(maxAgeInput).toBeInTheDocument();
      expect(maxAgeInput).toHaveValue(90);
      expect(maxCountInput).toBeInTheDocument();
      expect(maxCountInput).toHaveValue(1000);
    });

    it('should display field hints for both inputs', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('Keep events for this many days (7-365)')).toBeInTheDocument();
        expect(screen.getByText('Keep this many events regardless of age (100-10000)')).toBeInTheDocument();
      });
    });

    it('should have save button', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('Save Retention Settings')).toBeInTheDocument();
      });
    });
  });

  describe('Input field binding', () => {
    it('should update maxAgeDays when input changes', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
      
      fireEvent.change(maxAgeInput, { target: { value: '60' } });

      expect(maxAgeInput).toHaveValue(60);
    });

    it('should update maxCount when input changes', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Count')).toBeInTheDocument();
      });

      const maxCountInput = screen.getByLabelText('Maximum Count');
      
      fireEvent.change(maxCountInput, { target: { value: '500' } });

      expect(maxCountInput).toHaveValue(500);
    });
  });

  describe('Validation errors', () => {
    it('should display validation error for maxAgeDays below minimum', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
      const saveButton = screen.getByText('Save Retention Settings');

      // Set invalid value
      fireEvent.change(maxAgeInput, { target: { value: '5' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Max age must be between 7 and 365 days')).toBeInTheDocument();
      });

      // API should not be called
      expect(activityLogApi.updateRetentionSettings).not.toHaveBeenCalled();
    });

    it('should display validation error for maxAgeDays above maximum', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
      const saveButton = screen.getByText('Save Retention Settings');

      // Set invalid value
      fireEvent.change(maxAgeInput, { target: { value: '400' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Max age must be between 7 and 365 days')).toBeInTheDocument();
      });

      expect(activityLogApi.updateRetentionSettings).not.toHaveBeenCalled();
    });

    it('should display validation error for maxCount below minimum', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Count')).toBeInTheDocument();
      });

      const maxCountInput = screen.getByLabelText('Maximum Count');
      const saveButton = screen.getByText('Save Retention Settings');

      // Set invalid value
      fireEvent.change(maxCountInput, { target: { value: '50' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Max count must be between 100 and 10000 events')).toBeInTheDocument();
      });

      expect(activityLogApi.updateRetentionSettings).not.toHaveBeenCalled();
    });

    it('should display validation error for maxCount above maximum', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Count')).toBeInTheDocument();
      });

      const maxCountInput = screen.getByLabelText('Maximum Count');
      const saveButton = screen.getByText('Save Retention Settings');

      // Set invalid value
      fireEvent.change(maxCountInput, { target: { value: '15000' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Max count must be between 100 and 10000 events')).toBeInTheDocument();
      });

      expect(activityLogApi.updateRetentionSettings).not.toHaveBeenCalled();
    });

    it('should clear validation error when user corrects input', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
      const saveButton = screen.getByText('Save Retention Settings');

      // Set invalid value
      fireEvent.change(maxAgeInput, { target: { value: '5' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Max age must be between 7 and 365 days')).toBeInTheDocument();
      });

      // Correct the value
      fireEvent.change(maxAgeInput, { target: { value: '30' } });

      await waitFor(() => {
        expect(screen.queryByText('Max age must be between 7 and 365 days')).not.toBeInTheDocument();
      });
    });
  });

  describe('Save button behavior', () => {
    it('should disable save button during save operation', async () => {
      // Make the API call take some time
      activityLogApi.updateRetentionSettings.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockRetentionSettings), 100))
      );

      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('Save Retention Settings')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Retention Settings');
      
      fireEvent.click(saveButton);

      // Button should show "Saving..." and be disabled
      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      // Wait for save to complete
      await waitFor(() => {
        expect(screen.getByText('Save Retention Settings')).toBeInTheDocument();
      });
    });

    it('should not allow save with invalid input', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
      const saveButton = screen.getByText('Save Retention Settings');

      // Set invalid value
      fireEvent.change(maxAgeInput, { target: { value: '5' } });
      fireEvent.click(saveButton);

      // Validation should prevent API call
      expect(activityLogApi.updateRetentionSettings).not.toHaveBeenCalled();
    });
  });

  describe('Success message', () => {
    it('should display success message after successful save', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      const maxAgeInput = screen.getByLabelText('Maximum Age (days)');
      const saveButton = screen.getByText('Save Retention Settings');

      // Change value and save
      fireEvent.change(maxAgeInput, { target: { value: '60' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(activityLogApi.updateRetentionSettings).toHaveBeenCalledWith(60, 1000);
        expect(screen.getByText('Retention settings saved successfully!')).toBeInTheDocument();
      });
    });

    it('should clear success message after 3 seconds', async () => {
      vi.useFakeTimers();

      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Retention Settings');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Retention settings saved successfully!')).toBeInTheDocument();
      });

      // Fast-forward 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      await waitFor(() => {
        expect(screen.queryByText('Retention settings saved successfully!')).not.toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });

  describe('Error message', () => {
    it('should display error message after failed save', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      // Mock rejection after component is rendered
      activityLogApi.updateRetentionSettings.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const saveButton = screen.getByText('Save Retention Settings');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Database connection failed')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should display generic error message when error has no message', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByLabelText('Maximum Age (days)')).toBeInTheDocument();
      });

      // Mock rejection after component is rendered
      activityLogApi.updateRetentionSettings.mockRejectedValueOnce(new Error());

      const saveButton = screen.getByText('Save Retention Settings');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to save retention settings')).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('Impact visualization', () => {
    it('should display current stats when available', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(activityLogApi.fetchCleanupStats).toHaveBeenCalled();
      }, { timeout: 5000 });

      await waitFor(() => {
        expect(screen.getByText(/Current Status:/)).toBeInTheDocument();
        expect(screen.getByText(/500 events stored/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should display oldest event timestamp when available', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText(/Oldest Event:/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should not display oldest event when not available', async () => {
      activityLogApi.fetchCleanupStats.mockResolvedValueOnce({
        ...mockActivityStats,
        oldestEventTimestamp: null
      });

      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText(/Current Status:/)).toBeInTheDocument();
      }, { timeout: 5000 });

      expect(screen.queryByText(/Oldest Event:/)).not.toBeInTheDocument();
    });
  });

  describe('Settings fetch on tab activation', () => {
    it('should fetch retention settings when Misc tab becomes active', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      // Initially on Backups tab - settings should not be fetched yet
      expect(activityLogApi.fetchRetentionSettings).not.toHaveBeenCalled();

      // Switch to Misc tab
      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(activityLogApi.fetchRetentionSettings).toHaveBeenCalled();
      }, { timeout: 5000 });
    });

    it('should fetch activity stats when Misc tab becomes active', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      expect(activityLogApi.fetchCleanupStats).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(activityLogApi.fetchCleanupStats).toHaveBeenCalled();
      }, { timeout: 5000 });
    });

    it('should refresh stats after successful save', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(activityLogApi.fetchCleanupStats).toHaveBeenCalledTimes(1);
      }, { timeout: 5000 });

      const saveButton = screen.getByText('Save Retention Settings');
      fireEvent.click(saveButton);

      await waitFor(() => {
        // Stats should be fetched again after save
        expect(activityLogApi.fetchCleanupStats).toHaveBeenCalledTimes(2);
      }, { timeout: 5000 });
    });
  });

  describe('Activity log table', () => {
    it('should render activity log table with correct columns', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('Time')).toBeInTheDocument();
        expect(screen.getByText('Event Type')).toBeInTheDocument();
        expect(screen.getByText('Details')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should display activity events in table rows', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('Created expense: Groceries - $50.00')).toBeInTheDocument();
        expect(screen.getByText('Updated budget for Groceries')).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('Event type badges', () => {
    it('should display event type badges correctly', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        // Check that event types are formatted (snake_case to Title Case)
        expect(screen.getByText('Expense Created')).toBeInTheDocument();
        expect(screen.getByText('Budget Updated')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should apply entity-specific CSS classes to badges', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        const expenseBadge = screen.getByText('Expense Created');
        const budgetBadge = screen.getByText('Budget Updated');

        expect(expenseBadge.className).toContain('event-type-expense');
        expect(budgetBadge.className).toContain('event-type-budget');
      }, { timeout: 5000 });
    });
  });

  describe('formatEventType helper function', () => {
    it('should convert snake_case to Title Case', async () => {
      render(<BackupSettings />);
      await waitForLoaded();

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        // expense_created -> Expense Created
        expect(screen.getByText('Expense Created')).toBeInTheDocument();
        // budget_updated -> Budget Updated
        expect(screen.getByText('Budget Updated')).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });
});
