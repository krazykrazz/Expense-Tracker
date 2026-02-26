import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock ModalContext
const mockCloseSystemModal = vi.fn();
vi.mock('../contexts/ModalContext', () => ({
  ModalProvider: ({ children }) => children,
  useModalContext: () => ({
    closeSystemModal: mockCloseSystemModal
  })
}));

// Mock useTabState - returns backup-info as default
let mockActiveTab = 'backup-info';
const mockSetActiveTab = vi.fn((tab) => { mockActiveTab = tab; });
vi.mock('../hooks/useTabState', () => ({
  default: () => [mockActiveTab, mockSetActiveTab]
}));

// Mock useActivityLog
const mockActivityLog = {
  events: [],
  loading: false,
  error: null,
  displayLimit: 50,
  hasMore: false,
  stats: { currentCount: 10, retentionDays: 90, maxEntries: 10000 },
  setDisplayLimit: vi.fn(),
  loadMore: vi.fn()
};
vi.mock('../hooks/useActivityLog', () => ({
  default: () => mockActivityLog
}));

// Mock ActivityLogTable as a simple div
vi.mock('./ActivityLogTable', () => ({
  default: (props) => <div data-testid="activity-log-table">ActivityLogTable</div>
}));

// Mock PlaceNameStandardization as a simple div
vi.mock('./PlaceNameStandardization', () => ({
  default: (props) => <div data-testid="place-name-standardization">PlaceNameStandardization</div>
}));

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    VERSION: '/api/version',
    VERSION_CHECK_UPDATE: '/api/version/check-update',
    BACKUP_LIST: '/api/backup/list',
    BACKUP_STATS: '/api/backup/stats',
    BACKUP_MANUAL: '/api/backup/manual',
    BACKUP_DOWNLOAD: '/api/backup',
    BACKUP_RESTORE: '/api/backup/restore',
    BACKUP_CONFIG: '/api/backup/config',
    HEALTH: '/api/health'
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
  formatDateTime: (date) => `formatted-${date}`
}));

import SystemModal from './SystemModal';

describe('SystemModal', () => {
  const mockVersionInfo = { version: '1.0.0', environment: 'production' };
  const mockBackups = [
    { name: 'backup-2026-02-10.db', size: 1024000, created: '2026-02-10T10:00:00Z' }
  ];
  const mockDbStats = {
    expenseCount: 150,
    invoiceCount: 10,
    paymentMethodCount: 5,
    statementCount: 3,
    creditCardPaymentCount: 12,
    databaseSizeMB: 2.5,
    invoiceStorageSizeMB: 1.2,
    totalBackupSizeMB: 5.0,
    backupCount: 3
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'backup-info';

    global.fetch = vi.fn((url) => {
      if (url.includes('/version')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVersionInfo) });
      }
      if (url.includes('/backup/list')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBackups) });
      }
      if (url.includes('/backup/stats')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDbStats) });
      }
      if (url.includes('/api/health')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sseConnections: 0 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tab structure', () => {
    it('should render exactly 5 tabs in correct order', async () => {
      render(<SystemModal />);

      const tabButtons = screen.getAllByRole('button').filter(btn =>
        btn.classList.contains('tab-button')
      );
      expect(tabButtons).toHaveLength(5);
      expect(tabButtons[0]).toHaveTextContent('Backup Information');
      expect(tabButtons[1]).toHaveTextContent('Activity Log');
      expect(tabButtons[2]).toHaveTextContent('Misc');
      expect(tabButtons[3]).toHaveTextContent('About');
      expect(tabButtons[4]).toHaveTextContent('Updates');
    });

    it('should default to Backup Information tab', async () => {
      render(<SystemModal />);

      await waitFor(() => {
        expect(screen.getByText('Manual Backup')).toBeInTheDocument();
      });
    });
  });

  describe('Backup Information tab', () => {
    it('should render manual backup, download, restore, and backups list', async () => {
      render(<SystemModal />);

      await waitFor(() => {
        expect(screen.getByText('Manual Backup')).toBeInTheDocument();
      });

      // Manual backup button
      expect(screen.getByText('💾 Create Backup Now')).toBeInTheDocument();
      // Download button
      expect(screen.getByText('📥 Download Backup')).toBeInTheDocument();
      // Restore section
      expect(screen.getByText('Restore from Backup')).toBeInTheDocument();
      // Recent backups list
      expect(screen.getByText('Recent Backups')).toBeInTheDocument();
      expect(screen.getByText('backup-2026-02-10.db')).toBeInTheDocument();
    });
  });

  describe('Activity Log tab', () => {
    it('should render ActivityLogTable in Activity Log tab, not in Misc', async () => {
      mockActiveTab = 'activity-log';
      render(<SystemModal />);

      expect(screen.getByTestId('activity-log-table')).toBeInTheDocument();
    });
  });

  describe('Misc tab', () => {
    it('should render Place Name Standardization only, no activity log', async () => {
      mockActiveTab = 'misc';
      render(<SystemModal />);

      expect(screen.getByText('Standardize Place Names', { exact: false })).toBeInTheDocument();
      expect(screen.queryByTestId('activity-log-table')).not.toBeInTheDocument();
    });
  });

  describe('About tab', () => {
    it('should render version info and db stats, no changelog', async () => {
      mockActiveTab = 'about';
      render(<SystemModal />);

      await waitFor(() => {
        expect(screen.getByText('Version Information')).toBeInTheDocument();
      });

      expect(screen.getByText('1.0.0')).toBeInTheDocument();
      expect(screen.getByText('production')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Database Statistics')).toBeInTheDocument();
      });

      // No changelog in About tab
      expect(screen.queryByText('Recent Updates')).not.toBeInTheDocument();
    });

    it('should render "3 active" when health response includes sseConnections: 3', async () => {
      mockActiveTab = 'about';
      global.fetch = vi.fn((url) => {
        if (url.includes('/version')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVersionInfo) });
        }
        if (url.includes('/backup/list')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBackups) });
        }
        if (url.includes('/backup/stats')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDbStats) });
        }
        if (url.includes('/api/health')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ sseConnections: 3 }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<SystemModal />);

      await waitFor(() => {
        expect(screen.getByText('Real-Time Sync')).toBeInTheDocument();
      });
      expect(screen.getByText('3 active')).toBeInTheDocument();
    });

    it('should render "0 active" when health response includes sseConnections: 0', async () => {
      mockActiveTab = 'about';
      global.fetch = vi.fn((url) => {
        if (url.includes('/version')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVersionInfo) });
        }
        if (url.includes('/backup/list')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBackups) });
        }
        if (url.includes('/backup/stats')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDbStats) });
        }
        if (url.includes('/api/health')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ sseConnections: 0 }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<SystemModal />);

      await waitFor(() => {
        expect(screen.getByText('Real-Time Sync')).toBeInTheDocument();
      });
      expect(screen.getByText('0 active')).toBeInTheDocument();
    });
  });

  describe('Updates tab', () => {
    it('should render changelog entries', async () => {
      mockActiveTab = 'updates';
      render(<SystemModal />);

      expect(screen.getByText('Recent Updates')).toBeInTheDocument();
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });

    it('should show current version badge on matching entry', async () => {
      mockActiveTab = 'updates';
      render(<SystemModal />);

      await waitFor(() => {
        const badges = screen.getAllByText('Current Version');
        expect(badges).toHaveLength(1);
      });

      const badge = screen.getByText('Current Version');
      expect(badge).toHaveClass('current-version-badge');
      // Badge should be inside the v1.0.0 entry (matches versionInfo.version)
      expect(badge.closest('.changelog-version')).toHaveTextContent('v1.0.0');
    });
  });

  describe('Update banner', () => {
    it('should display update banner when update is available', async () => {
      mockActiveTab = 'updates';
      global.fetch = vi.fn((url) => {
        if (url.includes('/version/check-update')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              updateAvailable: true,
              currentVersion: '1.0.0',
              latestVersion: '1.1.0',
              checkedAt: '2026-02-15T10:00:00Z'
            })
          });
        }
        if (url.includes('/version')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVersionInfo) });
        }
        if (url.includes('/backup/list')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBackups) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<SystemModal />);

      await waitFor(() => {
        expect(screen.getByTestId('update-available-banner')).toBeInTheDocument();
      });
      expect(screen.getByText('A new version is available!')).toBeInTheDocument();
      const banner = screen.getByTestId('update-available-banner');
      expect(banner).toHaveTextContent('v1.1.0');
    });

    it('should hide update banner when no update is available', async () => {
      mockActiveTab = 'updates';
      global.fetch = vi.fn((url) => {
        if (url.includes('/version/check-update')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              updateAvailable: false,
              currentVersion: '1.0.0',
              latestVersion: '1.0.0',
              checkedAt: '2026-02-15T10:00:00Z'
            })
          });
        }
        if (url.includes('/version')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVersionInfo) });
        }
        if (url.includes('/backup/list')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBackups) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<SystemModal />);

      // Wait for fetch to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/version/check-update');
      });

      expect(screen.queryByTestId('update-available-banner')).not.toBeInTheDocument();
    });

    it('should hide update banner when API returns error indicator', async () => {
      mockActiveTab = 'updates';
      global.fetch = vi.fn((url) => {
        if (url.includes('/version/check-update')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              updateAvailable: false,
              currentVersion: '1.0.0',
              latestVersion: null,
              checkedAt: '2026-02-15T10:00:00Z',
              error: 'GitHub API unreachable'
            })
          });
        }
        if (url.includes('/version')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVersionInfo) });
        }
        if (url.includes('/backup/list')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBackups) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<SystemModal />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/version/check-update');
      });

      expect(screen.queryByTestId('update-available-banner')).not.toBeInTheDocument();
    });

    it('should hide update banner on network failure', async () => {
      mockActiveTab = 'updates';
      global.fetch = vi.fn((url) => {
        if (url.includes('/version/check-update')) {
          return Promise.reject(new Error('Network error'));
        }
        if (url.includes('/version')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVersionInfo) });
        }
        if (url.includes('/backup/list')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBackups) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<SystemModal />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/version/check-update');
      });

      expect(screen.queryByTestId('update-available-banner')).not.toBeInTheDocument();
    });
  });
});
