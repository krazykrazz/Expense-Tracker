import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import BankImportButton from './BankImportButton';
import { getPlaidStatus, syncBanksIfStale } from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  getPlaidStatus: vi.fn(),
  syncBanksIfStale: vi.fn(),
  PLAID_SETTINGS_CHANGED_EVENT: 'plaid-settings-changed',
}));

vi.mock('./BankImportModal', () => ({ default: () => <div data-testid="bank-import-modal" /> }));

vi.mock('../../contexts/ExpenseContext', () => ({
  useExpenseContext: () => ({ refreshExpenses: vi.fn() }),
}));

describe('BankImportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncBanksIfStale.mockResolvedValue({ started: false, banks: 0 });
  });

  it('stays hidden when Plaid is not configured, and never syncs', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: false });

    render(<BankImportButton />);

    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Bank import' })).not.toBeInTheDocument();
    expect(syncBanksIfStale).not.toHaveBeenCalled();
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

describe('BankImportButton sync on open', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncBanksIfStale.mockResolvedValue({ started: false, banks: 0 });
  });

  it('syncs stale banks when the app opens and when the modal opens, throttling tab switches', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true, environment: 'production', trial: null });

    render(<BankImportButton />);
    const button = await screen.findByRole('button', { name: 'Bank import' });
    await waitFor(() => expect(syncBanksIfStale).toHaveBeenCalledWith(30));
    expect(syncBanksIfStale).toHaveBeenCalledTimes(1);

    // Coming back to the tab right away doesn't ask again
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(syncBanksIfStale).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    expect(syncBanksIfStale).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('bank-import-modal')).toBeInTheDocument();
  });

  it('syncs again when the tab becomes visible after the throttle window', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    getPlaidStatus.mockResolvedValue({ enabled: true, environment: 'production', trial: null });

    render(<BankImportButton />);
    await waitFor(() => expect(syncBanksIfStale).toHaveBeenCalledTimes(1));

    now.mockReturnValue(1_000_000 + 6 * 60 * 1000);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(syncBanksIfStale).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});
