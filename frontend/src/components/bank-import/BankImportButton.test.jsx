import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import BankImportButton from './BankImportButton';
import { getPlaidStatus, syncBanksIfStale } from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  getPlaidStatus: vi.fn(),
  syncBanksIfStale: vi.fn(),
  PLAID_SETTINGS_CHANGED_EVENT: 'plaid-settings-changed',
  OPEN_BANK_IMPORT_EVENT: 'open-bank-import',
}));

vi.mock('./BankImportModal', () => ({
  default: ({ initialTab, onInboxChanged, onClose }) => (
    <div data-testid="bank-import-modal">
      {initialTab}
      <button data-testid="inbox-changed" onClick={onInboxChanged}>changed</button>
      <button data-testid="close-modal" onClick={onClose}>close</button>
    </div>
  ),
}));

let expenseContext = { refreshExpenses: vi.fn(), refreshTrigger: 0, currentMonthExpenseCount: 0 };
vi.mock('../../contexts/ExpenseContext', () => ({
  useExpenseContext: () => expenseContext,
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

describe('BankImportButton inbox count badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncBanksIfStale.mockResolvedValue({ started: false, banks: 0 });
  });
  const status = (extra) => ({ enabled: true, environment: 'production', trial: null, needsAttention: [], ...extra });

  it('shows the number waiting in the Inbox, and says it to screen readers', async () => {
    getPlaidStatus.mockResolvedValue(status({ toReview: 12 }));

    render(<BankImportButton />);

    expect(await screen.findByTestId('bank-review-count')).toHaveTextContent('12');
    expect(screen.getByRole('button', { name: 'Bank import: 12 to review' })).toBeInTheDocument();
  });

  it('shows nothing when the Inbox is empty or the server sent no count', async () => {
    getPlaidStatus.mockResolvedValue(status({ toReview: 0 }));
    const { unmount } = render(<BankImportButton />);
    await screen.findByRole('button', { name: 'Bank import' });
    expect(screen.queryByTestId('bank-review-count')).not.toBeInTheDocument();
    unmount();

    getPlaidStatus.mockResolvedValue(status());
    render(<BankImportButton />);
    await screen.findByRole('button', { name: 'Bank import' });
    expect(screen.queryByTestId('bank-review-count')).not.toBeInTheDocument();
  });

  it('caps the badge at 99+', async () => {
    getPlaidStatus.mockResolvedValue(status({ toReview: 250 }));

    render(<BankImportButton />);

    expect(await screen.findByTestId('bank-review-count')).toHaveTextContent('99+');
    expect(screen.getByRole('button', { name: 'Bank import: 250 to review' })).toBeInTheDocument();
  });

  it('keeps the warning dot and names both in the label', async () => {
    getPlaidStatus.mockResolvedValue(status({ toReview: 3, needsAttention: [{ id: 3, institutionName: 'CIBC', status: 'needs_login' }] }));

    render(<BankImportButton />);

    expect(await screen.findByTestId('bank-review-count')).toHaveTextContent('3');
    expect(screen.getByTestId('bank-attention-dot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3 to review; CIBC needs your attention/ })).toBeInTheDocument();
  });

  it('follows a sync from another tab', async () => {
    getPlaidStatus.mockResolvedValue(status({ toReview: 1 }));
    render(<BankImportButton />);
    expect(await screen.findByTestId('bank-review-count')).toHaveTextContent('1');
    await waitFor(() => expect(syncBanksIfStale).toHaveBeenCalled());

    getPlaidStatus.mockResolvedValue(status({ toReview: 4 }));
    act(() => { window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'plaid' } })); });

    await waitFor(() => expect(screen.getByTestId('bank-review-count')).toHaveTextContent('4'));
  });

  it('reloads after the sync this tab started (the server sends a tab no event for its own sync)', async () => {
    getPlaidStatus.mockResolvedValueOnce(status({ toReview: 0 }));
    syncBanksIfStale.mockResolvedValue({ started: true, banks: 1 });
    getPlaidStatus.mockResolvedValueOnce(status({ toReview: 7 }));

    render(<BankImportButton />);

    await waitFor(() => expect(screen.getByTestId('bank-review-count')).toHaveTextContent('7'));
  });

  it('reloads when expenses change in this tab (deleting a linked expense returns its bank row to the Inbox)', async () => {
    getPlaidStatus.mockResolvedValueOnce(status({ toReview: 0 }));
    const { rerender } = render(<BankImportButton />);
    await screen.findByRole('button', { name: 'Bank import' });
    const before = getPlaidStatus.mock.calls.length;

    getPlaidStatus.mockResolvedValueOnce(status({ toReview: 1 }));
    expenseContext = { ...expenseContext, currentMonthExpenseCount: 5 };
    rerender(<BankImportButton />);

    await waitFor(() => expect(screen.getByTestId('bank-review-count')).toHaveTextContent('1'));
    expect(getPlaidStatus.mock.calls.length).toBe(before + 1);

    // An unrelated re-render does not ask again
    rerender(<BankImportButton />);
    expect(getPlaidStatus.mock.calls.length).toBe(before + 1);
    expenseContext = { refreshExpenses: vi.fn(), refreshTrigger: 0, currentMonthExpenseCount: 0 };
  });

  it('reloads when the Inbox changes and when the modal closes', async () => {
    getPlaidStatus.mockResolvedValue(status({ toReview: 2 }));
    render(<BankImportButton />);
    fireEvent.click(await screen.findByRole('button', { name: /Bank import/ }));
    await screen.findByTestId('bank-import-modal');
    await waitFor(() => expect(getPlaidStatus.mock.calls.length).toBeGreaterThanOrEqual(2));
    const before = getPlaidStatus.mock.calls.length;

    getPlaidStatus.mockResolvedValue(status({ toReview: 1 }));
    fireEvent.click(screen.getByTestId('inbox-changed'));
    await waitFor(() => expect(screen.getByTestId('bank-review-count')).toHaveTextContent('1'));
    expect(getPlaidStatus.mock.calls.length).toBeGreaterThan(before);

    getPlaidStatus.mockResolvedValue(status({ toReview: 0 }));
    fireEvent.click(screen.getByTestId('close-modal'));
    await waitFor(() => expect(screen.queryByTestId('bank-review-count')).not.toBeInTheDocument());
  });
});

describe('BankImportButton when a bank needs attention', () => {
  const expired = { enabled: true, environment: 'production', trial: null, needsAttention: [{ id: 3, institutionName: 'CIBC', status: 'needs_login' }] };

  beforeEach(() => {
    vi.clearAllMocks();
    syncBanksIfStale.mockResolvedValue({ started: false, banks: 0 });
  });

  it('opens on the Inbox and shows no dot when every bank is fine', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true, environment: 'production', trial: null, needsAttention: [] });

    render(<BankImportButton />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bank import' }));

    expect(screen.queryByTestId('bank-attention-dot')).not.toBeInTheDocument();
    expect(await screen.findByTestId('bank-import-modal')).toHaveTextContent('inbox');
  });

  it('shows a warning dot naming the bank and opens on Connections', async () => {
    getPlaidStatus.mockResolvedValue(expired);

    render(<BankImportButton />);
    const button = await screen.findByRole('button', { name: /CIBC needs your attention/ });
    expect(screen.getByTestId('bank-attention-dot')).toBeInTheDocument();

    fireEvent.click(button);
    expect(await screen.findByTestId('bank-import-modal')).toHaveTextContent('connections');
  });

  it('flags the bank as soon as a background sync reports the failure', async () => {
    getPlaidStatus.mockResolvedValueOnce({ enabled: true, environment: 'production', trial: null, needsAttention: [] });
    render(<BankImportButton />);
    await screen.findByRole('button', { name: 'Bank import' });

    getPlaidStatus.mockResolvedValueOnce(expired);
    act(() => { window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'plaid' } })); });

    expect(await screen.findByTestId('bank-attention-dot')).toBeInTheDocument();
  });

  it('opens on the requested tab from openBankImport', async () => {
    getPlaidStatus.mockResolvedValue(expired);
    render(<BankImportButton />);
    await screen.findByTestId('bank-attention-dot');

    act(() => { window.dispatchEvent(new CustomEvent('open-bank-import', { detail: { tab: 'connections' } })); });

    expect(await screen.findByTestId('bank-import-modal')).toHaveTextContent('connections');
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

describe('BankImportButton when a bank is not updating at Plaid', () => {
  const staleWs = { id: 1, institutionName: 'Wealthsimple', bankUpdatedAt: '2026-11-03T21:11:14Z', institutionStatus: 'DOWN' };

  beforeEach(() => {
    vi.clearAllMocks();
    syncBanksIfStale.mockResolvedValue({ started: false, banks: 0 });
  });

  it('shows an amber dot naming the bank, and still opens on the Inbox', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true, environment: 'production', trial: null, needsAttention: [], staleData: [staleWs] });

    render(<BankImportButton />);
    const button = await screen.findByRole('button', { name: /Wealthsimple: no new data from Plaid/ });
    expect(screen.getByTestId('bank-stale-dot')).toHaveClass('stale');
    expect(screen.queryByTestId('bank-attention-dot')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(await screen.findByTestId('bank-import-modal')).toHaveTextContent('inbox');
  });

  it('shows only the red dot when another bank needs the user', async () => {
    getPlaidStatus.mockResolvedValue({
      enabled: true, environment: 'production', trial: null,
      needsAttention: [{ id: 3, institutionName: 'CIBC', status: 'needs_login' }], staleData: [staleWs]
    });

    render(<BankImportButton />);

    expect(await screen.findByTestId('bank-attention-dot')).toBeInTheDocument();
    expect(screen.queryByTestId('bank-stale-dot')).not.toBeInTheDocument();
  });
});