import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock ModalContext
const mockCloseSettingsModal = vi.fn();
vi.mock('../contexts/ModalContext', () => ({
  useModalContext: () => ({
    closeSettingsModal: mockCloseSettingsModal
  })
}));

// Mock useTabState - returns backup-config as default
let mockActiveTab = 'backup-config';
const mockSetActiveTab = vi.fn((tab) => { mockActiveTab = tab; });
vi.mock('../hooks/useTabState', () => ({
  default: () => [mockActiveTab, mockSetActiveTab]
}));

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    BACKUP_CONFIG: '/api/backup/config'
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

// Mock people API
vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn(),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn()
}));

import SettingsModal from './SettingsModal';

describe('SettingsModal', () => {
  const mockConfig = {
    enabled: true,
    schedule: 'daily',
    time: '02:00',
    targetPath: 'C:\\Backups',
    keepLastN: 7,
    nextBackup: '2026-02-05T02:00:00'
  };

  const waitForLoaded = async () => {
    await waitFor(() => {
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'backup-config';

    global.fetch = vi.fn((url) => {
      if (url.includes('/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tab structure', () => {
    it('should render exactly 2 tabs: Backup Configuration and People', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      const tabButtons = screen.getAllByRole('button').filter(btn =>
        btn.classList.contains('tab-button')
      );
      expect(tabButtons).toHaveLength(2);
      expect(screen.getByText('💾 Backup Configuration')).toBeInTheDocument();
      expect(screen.getByText('👥 People')).toBeInTheDocument();
    });

    it('should default to Backup Configuration tab', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.getByText('Automatic Backups')).toBeInTheDocument();
    });

    it('should NOT have a Restore tab', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.queryByText('🔄 Restore')).not.toBeInTheDocument();
      expect(screen.queryByText('Restore')).not.toBeInTheDocument();
    });

    it('should NOT have manual backup button', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.queryByText('💾 Create Backup Now')).not.toBeInTheDocument();
      expect(screen.queryByText('Create Backup Now')).not.toBeInTheDocument();
    });

    it('should NOT have download backup button', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.queryByText('📥 Download Backup')).not.toBeInTheDocument();
      expect(screen.queryByText('Download Backup')).not.toBeInTheDocument();
    });

    it('should NOT have recent backups list', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.queryByText('Recent Backups')).not.toBeInTheDocument();
    });
  });

  describe('Backup Configuration tab', () => {
    it('should display auto backup toggle', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByText('Enable automatic backups')).toBeInTheDocument();
    });

    it('should show backup time and location when enabled', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.getByLabelText('Backup Time')).toBeInTheDocument();
      expect(screen.getByLabelText('Backup Location')).toBeInTheDocument();
      expect(screen.getByLabelText('Keep Last N Backups')).toBeInTheDocument();
    });

    it('should show next scheduled backup when enabled', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.getByText(/Next scheduled backup/)).toBeInTheDocument();
    });

    it('should have a Save Settings button', async () => {
      render(<SettingsModal />);
      await waitForLoaded();

      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
  });

  describe('People tab', () => {
    it('should switch to People tab and show family members section', async () => {
      const { rerender } = render(<SettingsModal />);
      await waitForLoaded();

      // Simulate tab switch
      mockActiveTab = 'people';
      const { getPeople } = await import('../services/peopleApi');
      getPeople.mockResolvedValue([
        { id: 1, name: 'John Doe', dateOfBirth: '1990-01-15' }
      ]);

      rerender(<SettingsModal />);

      await waitFor(() => {
        expect(screen.getByText('Family Members')).toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('should show loading message initially', () => {
      global.fetch = vi.fn(() => new Promise(() => {}));
      render(<SettingsModal />);
      expect(screen.getByText('Loading settings...')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('should show error when config fetch fails', async () => {
      global.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to fetch' })
      }));

      render(<SettingsModal />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load backup settings')).toBeInTheDocument();
      });
    });
  });
});
