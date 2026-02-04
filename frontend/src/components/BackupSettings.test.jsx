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
    VERSION: '/api/version'
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

// Mock PlaceNameStandardization component
vi.mock('./PlaceNameStandardization', () => ({
  default: ({ onClose }) => (
    <div data-testid="place-name-standardization">
      <button onClick={onClose}>Close Standardization</button>
    </div>
  )
}));

import * as peopleApi from '../services/peopleApi';
import BackupSettings from './BackupSettings';

describe('BackupSettings', () => {
  const mockConfig = {
    enabled: true,
    schedule: 'daily',
    time: '02:00',
    targetPath: 'C:\\Backups',
    keepLastN: 7,
    nextBackup: '2026-02-05T02:00:00'
  };

  const mockBackups = [
    { name: 'backup-2026-02-04.db', size: 1024000, created: '2026-02-04T02:00:00' },
    { name: 'backup-2026-02-03.db', size: 1020000, created: '2026-02-03T02:00:00' }
  ];

  const mockVersionInfo = {
    version: '5.4.2',
    environment: 'production',
    docker: {
      tag: 'latest',
      buildDate: '2026-02-04T10:00:00',
      commit: 'abc123'
    }
  };

  const mockDbStats = {
    expenseCount: 1500,
    invoiceCount: 50,
    paymentMethodCount: 5,
    statementCount: 10,
    creditCardPaymentCount: 25,
    databaseSizeMB: 15.5,
    invoiceStorageSizeMB: 25.0,
    totalBackupSizeMB: 100.0,
    backupCount: 7
  };

  const mockPeople = [
    { id: 1, name: 'John Doe', dateOfBirth: '1990-01-15' },
    { id: 2, name: 'Jane Doe', dateOfBirth: '1992-05-20' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock fetch for various endpoints
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
          json: () => Promise.resolve(mockBackups)
        });
      }
      if (url.includes('/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockVersionInfo)
        });
      }
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDbStats)
        });
      }
      if (url.includes('/manual')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ filename: 'backup-2026-02-04-manual.db' })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    peopleApi.getPeople.mockResolvedValue(mockPeople);
    peopleApi.createPerson.mockResolvedValue({ id: 3, name: 'New Person' });
    peopleApi.updatePerson.mockResolvedValue({ id: 1, name: 'Updated Name' });
    peopleApi.deletePerson.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tab navigation', () => {
    it('should render all tabs', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('💾 Backups')).toBeInTheDocument();
        expect(screen.getByText('🔄 Restore')).toBeInTheDocument();
        expect(screen.getByText('👥 People')).toBeInTheDocument();
        expect(screen.getByText('🔧 Misc')).toBeInTheDocument();
        expect(screen.getByText('ℹ️ About')).toBeInTheDocument();
      });
    });

    it('should show Backups tab by default', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('Automatic Backups')).toBeInTheDocument();
      });
    });

    it('should switch to Restore tab when clicked', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('💾 Backups')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('🔄 Restore'));

      await waitFor(() => {
        expect(screen.getByText('Restore from Backup')).toBeInTheDocument();
      });
    });

    it('should switch to People tab when clicked', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('💾 Backups')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('Family Members')).toBeInTheDocument();
      });
    });

    it('should switch to Misc tab when clicked', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('💾 Backups')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('Data Management Tools')).toBeInTheDocument();
      });
    });

    it('should switch to About tab when clicked', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('💾 Backups')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('ℹ️ About'));

      await waitFor(() => {
        expect(screen.getByText('Version Information')).toBeInTheDocument();
      });
    });
  });

  describe('Backups tab', () => {
    it('should load and display backup config', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeChecked();
      });
    });

    it('should show backup time when enabled', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Backup Time')).toBeInTheDocument();
      });
    });

    it('should show recent backups list', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('Recent Backups')).toBeInTheDocument();
        expect(screen.getByText('backup-2026-02-04.db')).toBeInTheDocument();
        expect(screen.getByText('backup-2026-02-03.db')).toBeInTheDocument();
      });
    });

    it('should have manual backup button', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('💾 Create Backup Now')).toBeInTheDocument();
      });
    });

    it('should have download backup button', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('📥 Download Backup')).toBeInTheDocument();
      });
    });

    it('should create manual backup when button clicked', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('💾 Create Backup Now')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('💾 Create Backup Now'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/manual'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    it('should save settings when save button clicked', async () => {
      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('Save Settings')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Save Settings'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/config'),
          expect.objectContaining({ method: 'PUT' })
        );
      });
    });
  });

  describe('Restore tab', () => {
    it('should show warning message', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('🔄 Restore'));

      await waitFor(() => {
        expect(screen.getByText(/WARNING: This will replace ALL current data/)).toBeInTheDocument();
      });
    });

    it('should have file upload button', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('🔄 Restore'));

      await waitFor(() => {
        expect(screen.getByText('🔄 Choose Backup File')).toBeInTheDocument();
      });
    });
  });

  describe('People tab', () => {
    it('should load and display people', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(peopleApi.getPeople).toHaveBeenCalled();
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });

    it('should show add family member button', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('➕ Add Family Member')).toBeInTheDocument();
      });
    });

    it('should show add form when add button clicked', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('➕ Add Family Member')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('➕ Add Family Member'));

      await waitFor(() => {
        expect(screen.getByText('Add New Person')).toBeInTheDocument();
        expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
      });
    });

    it('should validate name is required', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('➕ Add Family Member')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('➕ Add Family Member'));

      await waitFor(() => {
        expect(screen.getByText('Add Person')).toBeInTheDocument();
      });

      // Try to save without name
      fireEvent.click(screen.getByText('Add Person'));

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
    });

    it('should create person when form is valid', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('➕ Add Family Member')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('➕ Add Family Member'));

      await waitFor(() => {
        expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Person' } });
      fireEvent.click(screen.getByText('Add Person'));

      await waitFor(() => {
        expect(peopleApi.createPerson).toHaveBeenCalledWith('New Person', null);
      });
    });

    it('should show edit form when edit button clicked', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit person');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Edit Person')).toBeInTheDocument();
        expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
      });
    });

    it('should show delete confirmation when delete clicked', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Delete person');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
      });
    });

    it('should delete person when confirmed', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Delete person');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Yes, Delete'));

      await waitFor(() => {
        expect(peopleApi.deletePerson).toHaveBeenCalledWith(1);
      });
    });

    it('should cancel delete when cancel clicked', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Delete person');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
      });

      // Find the Cancel button in the delete modal
      const cancelButtons = screen.getAllByText('Cancel');
      const modalCancelButton = cancelButtons.find(btn => 
        btn.closest('.people-delete-modal')
      );
      fireEvent.click(modalCancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Confirm Deletion')).not.toBeInTheDocument();
      });
    });

    it('should show empty state when no people', async () => {
      peopleApi.getPeople.mockResolvedValue([]);

      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('No family members added yet.')).toBeInTheDocument();
      });
    });
  });

  describe('Misc tab', () => {
    it('should show place name standardization tool', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('🏷️ Standardize Place Names')).toBeInTheDocument();
      });
    });

    it('should open place name standardization when button clicked', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('🔧 Misc'));

      await waitFor(() => {
        expect(screen.getByText('Open Tool')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Open Tool'));

      await waitFor(() => {
        expect(screen.getByTestId('place-name-standardization')).toBeInTheDocument();
      });
    });
  });

  describe('About tab', () => {
    it('should display version information', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('ℹ️ About'));

      await waitFor(() => {
        expect(screen.getByText('Version Information')).toBeInTheDocument();
        expect(screen.getByText('5.4.2')).toBeInTheDocument();
      });
    });

    it('should display database statistics', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('ℹ️ About'));

      await waitFor(() => {
        expect(screen.getByText('Database Statistics')).toBeInTheDocument();
        expect(screen.getByText('1,500')).toBeInTheDocument(); // expense count
      });
    });

    it('should display changelog', async () => {
      render(<BackupSettings />);

      fireEvent.click(screen.getByText('ℹ️ About'));

      await waitFor(() => {
        expect(screen.getByText('Recent Updates')).toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('should show loading message initially', async () => {
      // Make fetch hang to show loading state
      global.fetch = vi.fn(() => new Promise(() => {}));

      render(<BackupSettings />);

      expect(screen.getByText('Loading settings...')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('should show error message when config fetch fails', async () => {
      global.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to fetch' })
      }));

      render(<BackupSettings />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load backup settings')).toBeInTheDocument();
      });
    });

    it('should show error when people fetch fails', async () => {
      peopleApi.getPeople.mockRejectedValue(new Error('Network error'));

      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show retry button when people fetch fails with no data', async () => {
      peopleApi.getPeople.mockRejectedValue(new Error('Network error'));

      render(<BackupSettings />);

      fireEvent.click(screen.getByText('👥 People'));

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });
  });
});
