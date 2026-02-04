/**
 * MigrationUtility Component Tests
 * 
 * Tests for the migration utility that converts balance entries to payment entries.
 * Requirements: 4.1, 4.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    LOAN_MIGRATE_BALANCES_PREVIEW: (loanId) => `/api/loans/${loanId}/migrate-balances/preview`,
    LOAN_MIGRATE_BALANCES: (loanId) => `/api/loans/${loanId}/migrate-balances`
  },
  default: 'http://localhost:2424'
}));

// Mock the loanPaymentApi
vi.mock('../services/loanPaymentApi', () => ({
  previewMigration: vi.fn(),
  migrateBalances: vi.fn()
}));

import * as loanPaymentApi from '../services/loanPaymentApi';
import MigrationUtility from './MigrationUtility';

describe('MigrationUtility', () => {
  const defaultProps = {
    loanId: 1,
    loanName: 'Test Loan',
    onMigrationComplete: vi.fn(),
    onClose: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test loading state while fetching preview
   * Requirements: 4.1
   */
  it('should show loading state while fetching preview', async () => {
    // Make the preview take some time
    loanPaymentApi.previewMigration.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        canMigrate: true,
        converted: [],
        skipped: [],
        summary: { totalConverted: 0, totalSkipped: 0, totalPaymentAmount: 0 }
      }), 100))
    );

    render(<MigrationUtility {...defaultProps} />);

    expect(screen.getByText(/loading migration preview/i)).toBeInTheDocument();
  });

  /**
   * Test preview display when migration is possible
   * Requirements: 4.1
   */
  it('should display preview when migration is possible', async () => {
    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert 3 balance difference(s) to payment(s)',
      converted: [
        { balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 },
        { balanceEntryId: 2, paymentAmount: 500, paymentDate: '2026-02-01', previousBalance: 9500, currentBalance: 9000 }
      ],
      skipped: [],
      summary: {
        totalConverted: 2,
        totalSkipped: 0,
        totalPaymentAmount: 1000
      }
    });

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/preview/i)).toBeInTheDocument();
    });

    // Check summary stats
    expect(screen.getByText('2')).toBeInTheDocument(); // totalConverted
    expect(screen.getByText(/payments to create/i)).toBeInTheDocument();
    expect(screen.getByText(/\$1,000\.00/)).toBeInTheDocument(); // totalPaymentAmount
  });

  /**
   * Test preview display when no migration is possible
   * Requirements: 4.1
   */
  it('should display message when no migration is possible', async () => {
    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: false,
      message: 'No balance entries to migrate',
      converted: [],
      skipped: [],
      summary: {
        totalConverted: 0,
        totalSkipped: 0,
        totalPaymentAmount: 0
      }
    });

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/no balance entries to migrate/i)).toBeInTheDocument();
    });

    // Start Migration button should be disabled
    expect(screen.getByRole('button', { name: /start migration/i })).toBeDisabled();
  });

  /**
   * Test skipped entries display
   * Requirements: 4.4, 4.5
   */
  it('should display skipped entries in preview', async () => {
    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert 1 balance difference(s) to payment(s)',
      converted: [
        { balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 }
      ],
      skipped: [
        { balanceEntryId: 2, reason: 'Balance increased (additional borrowing)', previousBalance: 9500, currentBalance: 10000, increase: 500 }
      ],
      summary: {
        totalConverted: 1,
        totalSkipped: 1,
        totalPaymentAmount: 500
      }
    });

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/entries to be skipped/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/balance increased/i)).toBeInTheDocument();
    expect(screen.getByText(/will be skipped/i)).toBeInTheDocument();
  });

  /**
   * Test confirmation dialog appears when starting migration
   * Requirements: 4.1
   */
  it('should show confirmation dialog when starting migration', async () => {
    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert 2 balance difference(s) to payment(s)',
      converted: [
        { balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 }
      ],
      skipped: [],
      summary: {
        totalConverted: 1,
        totalSkipped: 0,
        totalPaymentAmount: 500
      }
    });

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start migration/i })).toBeEnabled();
    });

    // Click start migration
    fireEvent.click(screen.getByRole('button', { name: /start migration/i }));

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /yes, migrate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  /**
   * Test migration execution and summary display
   * Requirements: 4.5
   */
  it('should display summary after successful migration', async () => {
    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert 2 balance difference(s) to payment(s)',
      converted: [
        { balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 }
      ],
      skipped: [],
      summary: {
        totalConverted: 1,
        totalSkipped: 0,
        totalPaymentAmount: 500
      }
    });

    loanPaymentApi.migrateBalances.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      converted: [
        { balanceEntryId: 1, paymentId: 1, paymentAmount: 500, paymentDate: '2026-01-01' },
        { balanceEntryId: 2, paymentId: 2, paymentAmount: 500, paymentDate: '2026-02-01' }
      ],
      skipped: [],
      errors: [],
      summary: {
        totalConverted: 2,
        totalSkipped: 0,
        totalPaymentAmount: 1000,
        totalErrors: 0
      },
      message: 'Migration complete: 2 payment(s) created, 0 skipped'
    });

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start migration/i })).toBeEnabled();
    });

    // Start migration
    fireEvent.click(screen.getByRole('button', { name: /start migration/i }));

    // Confirm migration
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /yes, migrate/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /yes, migrate/i }));

    // Wait for migration to complete and summary to display
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /migration complete/i })).toBeInTheDocument();
    });

    // Check summary is displayed
    expect(screen.getByText(/payments created/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // totalConverted
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  /**
   * Test onMigrationComplete callback is called
   * Requirements: 4.5
   */
  it('should call onMigrationComplete after successful migration', async () => {
    const mockOnMigrationComplete = vi.fn();

    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert',
      converted: [{ balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 }],
      skipped: [],
      summary: { totalConverted: 1, totalSkipped: 0, totalPaymentAmount: 500 }
    });

    const migrationResult = {
      loanId: 1,
      converted: [{ balanceEntryId: 1, paymentId: 1, paymentAmount: 500, paymentDate: '2026-01-01' }],
      skipped: [],
      errors: [],
      summary: { totalConverted: 1, totalSkipped: 0, totalPaymentAmount: 500, totalErrors: 0 },
      message: 'Migration complete'
    };

    loanPaymentApi.migrateBalances.mockResolvedValue(migrationResult);

    render(
      <MigrationUtility 
        {...defaultProps} 
        onMigrationComplete={mockOnMigrationComplete} 
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start migration/i })).toBeEnabled();
    });

    // Start and confirm migration
    fireEvent.click(screen.getByRole('button', { name: /start migration/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /yes, migrate/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /yes, migrate/i }));

    await waitFor(() => {
      expect(mockOnMigrationComplete).toHaveBeenCalledWith(migrationResult);
    });
  });

  /**
   * Test cancel button calls onClose
   * Requirements: 4.1
   */
  it('should call onClose when cancel button is clicked', async () => {
    const mockOnClose = vi.fn();

    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert',
      converted: [],
      skipped: [],
      summary: { totalConverted: 0, totalSkipped: 0, totalPaymentAmount: 0 }
    });

    render(<MigrationUtility {...defaultProps} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnClose).toHaveBeenCalled();
  });

  /**
   * Test close button calls onClose
   * Requirements: 4.1
   */
  it('should call onClose when close button is clicked', async () => {
    const mockOnClose = vi.fn();

    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: false,
      message: 'No entries',
      converted: [],
      skipped: [],
      summary: { totalConverted: 0, totalSkipped: 0, totalPaymentAmount: 0 }
    });

    render(<MigrationUtility {...defaultProps} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/close migration utility/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/close migration utility/i));

    expect(mockOnClose).toHaveBeenCalled();
  });

  /**
   * Test error display when preview fails
   * Requirements: 4.1
   */
  it('should display error when preview fails', async () => {
    loanPaymentApi.previewMigration.mockRejectedValue(new Error('Network error'));

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  /**
   * Test error display when migration fails
   * Requirements: 4.5
   */
  it('should display error when migration fails', async () => {
    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert',
      converted: [{ balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 }],
      skipped: [],
      summary: { totalConverted: 1, totalSkipped: 0, totalPaymentAmount: 500 }
    });

    loanPaymentApi.migrateBalances.mockRejectedValue(new Error('Migration failed'));

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start migration/i })).toBeEnabled();
    });

    // Start and confirm migration
    fireEvent.click(screen.getByRole('button', { name: /start migration/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /yes, migrate/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /yes, migrate/i }));

    await waitFor(() => {
      expect(screen.getByText(/migration failed/i)).toBeInTheDocument();
    });
  });

  /**
   * Test error can be cleared
   * Requirements: 4.1
   */
  it('should allow clearing error message', async () => {
    loanPaymentApi.previewMigration.mockRejectedValue(new Error('Network error'));

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    // Find and click the error close button
    const errorCloseBtn = screen.getByRole('button', { name: /✕/i });
    fireEvent.click(errorCloseBtn);

    await waitFor(() => {
      expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    });
  });

  /**
   * Test confirmation can be cancelled
   * Requirements: 4.1
   */
  it('should allow cancelling confirmation dialog', async () => {
    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert',
      converted: [{ balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 }],
      skipped: [],
      summary: { totalConverted: 1, totalSkipped: 0, totalPaymentAmount: 500 }
    });

    render(<MigrationUtility {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start migration/i })).toBeEnabled();
    });

    // Start migration
    fireEvent.click(screen.getByRole('button', { name: /start migration/i }));

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    // Cancel confirmation - find the cancel button in the confirmation dialog
    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]); // Click the last cancel button (in confirmation)

    // Confirmation should be hidden, preview should still be visible
    await waitFor(() => {
      expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /start migration/i })).toBeInTheDocument();
  });

  /**
   * Test done button calls onClose after migration
   * Requirements: 4.5
   */
  it('should call onClose when done button is clicked after migration', async () => {
    const mockOnClose = vi.fn();

    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert',
      converted: [{ balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 }],
      skipped: [],
      summary: { totalConverted: 1, totalSkipped: 0, totalPaymentAmount: 500 }
    });

    loanPaymentApi.migrateBalances.mockResolvedValue({
      loanId: 1,
      converted: [{ balanceEntryId: 1, paymentId: 1, paymentAmount: 500, paymentDate: '2026-01-01' }],
      skipped: [],
      errors: [],
      summary: { totalConverted: 1, totalSkipped: 0, totalPaymentAmount: 500, totalErrors: 0 },
      message: 'Migration complete'
    });

    render(<MigrationUtility {...defaultProps} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start migration/i })).toBeEnabled();
    });

    // Start and confirm migration
    fireEvent.click(screen.getByRole('button', { name: /start migration/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /yes, migrate/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /yes, migrate/i }));

    // Wait for migration to complete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    });

    // Click done
    fireEvent.click(screen.getByRole('button', { name: /done/i }));

    expect(mockOnClose).toHaveBeenCalled();
  });

  /**
   * Test disabled state
   * Requirements: 4.1
   */
  it('should disable start button when disabled prop is true', async () => {
    loanPaymentApi.previewMigration.mockResolvedValue({
      loanId: 1,
      loanName: 'Test Loan',
      canMigrate: true,
      message: 'Ready to convert',
      converted: [{ balanceEntryId: 1, paymentAmount: 500, paymentDate: '2026-01-01', previousBalance: 10000, currentBalance: 9500 }],
      skipped: [],
      summary: { totalConverted: 1, totalSkipped: 0, totalPaymentAmount: 500 }
    });

    render(<MigrationUtility {...defaultProps} disabled={true} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start migration/i })).toBeDisabled();
    });
  });
});
