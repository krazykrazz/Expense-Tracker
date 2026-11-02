import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import BankImportButton from './BankImportButton';
import { getPlaidStatus } from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  getPlaidStatus: vi.fn(),
  PLAID_SETTINGS_CHANGED_EVENT: 'plaid-settings-changed',
}));

vi.mock('../../contexts/ExpenseContext', () => ({
  useExpenseContext: () => ({ refreshExpenses: vi.fn() }),
}));

describe('BankImportButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stays hidden when Plaid is not configured', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: false });

    render(<BankImportButton />);

    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Bank import' })).not.toBeInTheDocument();
  });

  it('stays hidden when the status request fails', async () => {
    getPlaidStatus.mockRejectedValue(new Error('offline'));

    render(<BankImportButton />);

    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Bank import' })).not.toBeInTheDocument();
  });

  it('shows the header button when enabled', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true, environment: 'sandbox', trial: null });

    render(<BankImportButton />);

    expect(await screen.findByRole('button', { name: 'Bank import' })).toBeInTheDocument();
  });

  it('appears as soon as Plaid keys are saved in Settings', async () => {
    getPlaidStatus.mockResolvedValueOnce({ enabled: false, source: 'none' });
    render(<BankImportButton />);
    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Bank import' })).not.toBeInTheDocument();

    getPlaidStatus.mockResolvedValueOnce({ enabled: true, source: 'settings', environment: 'sandbox', trial: null });
    act(() => { window.dispatchEvent(new CustomEvent('plaid-settings-changed')); });

    expect(await screen.findByRole('button', { name: 'Bank import' })).toBeInTheDocument();
  });
});
