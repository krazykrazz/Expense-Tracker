import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BankConnections from './BankConnections';
import * as plaidApi from '../../services/plaidApi';
import { getPaymentMethods } from '../../services/paymentMethodApi';

const plaidLink = { open: vi.fn(), ready: false };

vi.mock('react-plaid-link', () => ({
  usePlaidLink: vi.fn(() => plaidLink),
}));

vi.mock('../../services/plaidApi', () => ({
  createLinkToken: vi.fn(),
  connectBank: vi.fn(),
  reconnectBank: vi.fn(),
  getBankConnections: vi.fn(),
  disconnectBank: vi.fn(),
  mapBankAccount: vi.fn(),
  importBankFile: vi.fn(),
  syncBanks: vi.fn(),
  getPlaidStatus: vi.fn(),
  getAutoSyncSettings: vi.fn(),
  saveAutoSyncSettings: vi.fn(),
}));

vi.mock('../../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn(),
}));

const item = {
  id: 1, institutionName: 'Test Bank', environment: 'production', lastSyncedAt: null, lastError: null,
  accounts: [{ id: 7, name: 'Chequing', mask: '1234', type: 'depository', subtype: 'checking', paymentMethodId: null }]
};

const sandbox = { enabled: true, environment: 'sandbox', trial: null };
const production = { enabled: true, environment: 'production', trial: { limit: 10, used: 3 } };

describe('BankConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plaidApi.getBankConnections.mockResolvedValue({ items: [item] });
    plaidApi.getAutoSyncSettings.mockResolvedValue({ enabled: true, intervalMinutes: 30, startHour: 6, endHour: 23 });
    getPaymentMethods.mockResolvedValue([
      { id: 1, display_name: 'Cash', type: 'cash' },
      { id: 2, display_name: 'Debit', type: 'debit' },
      { id: 4, display_name: 'Visa', type: 'credit_card' },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the automatic sync schedule and saves changes', async () => {
    plaidApi.saveAutoSyncSettings.mockImplementation(async (next) => next);

    render(<BankConnections status={sandbox} onStatusChange={vi.fn()} />);
    const interval = await screen.findByLabelText('Sync interval');

    expect(screen.getByLabelText('Automatic sync')).toBeChecked();
    expect(interval.value).toBe('30');
    expect(screen.getByLabelText('Sync from').value).toBe('6');
    expect(screen.getByLabelText('Sync until').value).toBe('23');

    fireEvent.change(interval, { target: { value: '60' } });
    await waitFor(() => expect(plaidApi.saveAutoSyncSettings).toHaveBeenCalledWith({ enabled: true, intervalMinutes: 60, startHour: 6, endHour: 23 }));

    fireEvent.click(screen.getByLabelText('Automatic sync'));
    expect(await screen.findByText(/banks sync when the app is opened/)).toBeInTheDocument();
  });

  it('refuses a start hour after the end hour without saving', async () => {
    render(<BankConnections status={sandbox} onStatusChange={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Sync from'), { target: { value: '23' } });

    expect(await screen.findByText('Start must be before end.')).toBeInTheDocument();
    expect(plaidApi.saveAutoSyncSettings).not.toHaveBeenCalled();
  });

  it('reloads when a sync finishes in the background', async () => {
    render(<BankConnections status={sandbox} onStatusChange={vi.fn()} />);
    await screen.findByText('Never synced');
    plaidApi.getBankConnections.mockResolvedValue({ items: [{ ...item, lastSyncedAt: '2026-11-02 17:30:00' }] });

    window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'plaid' } }));

    expect(await screen.findByText(/^Last synced /)).toBeInTheDocument();
  });

  it('maps an account to a bank-backed payment method', async () => {
    plaidApi.mapBankAccount.mockResolvedValue({ ...item.accounts[0], paymentMethodId: 2 });

    render(<BankConnections status={sandbox} onStatusChange={vi.fn()} />);
    const select = await screen.findByLabelText('Payment method for Chequing');

    expect([...select.options].map(o => o.textContent)).toEqual(["Don't import", 'Debit', 'Visa']);
    fireEvent.change(select, { target: { value: '2' } });

    await waitFor(() => expect(plaidApi.mapBankAccount).toHaveBeenCalledWith(7, 2));
    await waitFor(() => expect(select.value).toBe('2'));
  });

  it('confirms Trial usage before starting Plaid Link in production', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<BankConnections status={production} onStatusChange={vi.fn()} />);
    expect(await screen.findByTestId('trial-usage')).toHaveTextContent('3 / 10');
    fireEvent.click(screen.getByRole('button', { name: 'Connect a bank' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 of 10'));
    expect(plaidApi.createLinkToken).not.toHaveBeenCalled();
  });

  it('requests a link token without a prompt in sandbox', async () => {
    plaidApi.createLinkToken.mockResolvedValue({ linkToken: 'link-sandbox-1' });
    const confirm = vi.spyOn(window, 'confirm');

    render(<BankConnections status={sandbox} onStatusChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a bank' }));

    await waitFor(() => expect(plaidApi.createLinkToken).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });

  it('reports sync totals and per-bank errors', async () => {
    plaidApi.syncBanks.mockResolvedValue({
      totals: { added: 4, updated: 1, removed: 0 },
      results: [{ id: 1, institutionName: 'Test Bank', error: 'Plaid sync failed: INSTITUTION_DOWN' }]
    });

    render(<BankConnections status={sandbox} onStatusChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));

    expect(await screen.findByRole('status')).toHaveTextContent('4 new, 1 updated, 0 removed');
    expect(screen.getByRole('status')).toHaveTextContent('INSTITUTION_DOWN');
  });

  it('warns that the Trial slot is not returned when disconnecting a production bank', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    plaidApi.disconnectBank.mockResolvedValue();

    render(<BankConnections status={production} onStatusChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('not given back'));
    await waitFor(() => expect(plaidApi.disconnectBank).toHaveBeenCalledWith(1));
  });

  it('refreshes the status after a manual sync so a failing bank is flagged', async () => {
    plaidApi.syncBanks.mockResolvedValue({ totals: { added: 0, updated: 0, removed: 0 }, results: [] });
    const fresh = { ...production, needsAttention: [{ id: 1, institutionName: 'Test Bank', status: 'needs_login' }] };
    plaidApi.getPlaidStatus.mockResolvedValue(fresh);
    const onStatusChange = vi.fn();

    render(<BankConnections status={production} onStatusChange={onStatusChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(fresh));
  });

  it('shows when Plaid last updated the bank, and explains a bank that is not updating', async () => {
    plaidApi.getBankConnections.mockResolvedValue({ items: [{
      ...item, status: 'stale', bankUpdatedAt: '2026-11-03T21:11:14Z',
      institutionStatus: 'DOWN', institutionStatusSince: '2026-11-04T03:05:18Z'
    }] });
    const confirm = vi.spyOn(window, 'confirm');

    render(<BankConnections status={production} onStatusChange={vi.fn()} />);

    expect(await screen.findByTestId('bank-connection-status')).toHaveTextContent('Not updating');
    const freshness = screen.getByTestId('bank-freshness');
    expect(freshness).toHaveTextContent('Bank data updated by Plaid:');
    expect(freshness).toHaveTextContent('Plaid reports Test Bank updates down since');
    expect(screen.getByText(/catches up on its own and nothing is lost/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('offers Import file only for accounts that import into a payment method, and opens the import panel', async () => {
    plaidApi.getBankConnections.mockResolvedValue({ items: [{
      ...item,
      accounts: [
        { id: 7, name: 'Chequing', mask: '1234', type: 'depository', subtype: 'checking', paymentMethodId: 2 },
        { id: 8, name: 'Savings', mask: '9999', type: 'depository', subtype: 'savings', paymentMethodId: null }
      ]
    }] });

    render(<BankConnections status={sandbox} onStatusChange={vi.fn()} />);

    const buttons = await screen.findAllByRole('button', { name: 'Import file' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(screen.getByTestId('bank-file-import')).toHaveTextContent('Import a file into Chequing ••1234');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('bank-file-import')).not.toBeInTheDocument();
  });

  it('shows the update time without a status line when Plaid reports the bank healthy', async () => {
    plaidApi.getBankConnections.mockResolvedValue({ items: [{ ...item, status: 'ok', bankUpdatedAt: '2026-11-04T09:00:00Z', institutionStatus: 'HEALTHY' }] });

    render(<BankConnections status={production} onStatusChange={vi.fn()} />);

    const freshness = await screen.findByTestId('bank-freshness');
    expect(freshness).toHaveTextContent('Bank data updated by Plaid:');
    expect(freshness).not.toHaveTextContent('Plaid reports');
    expect(screen.queryByTestId('bank-connection-status')).not.toBeInTheDocument();
  });

  describe('a bank that needs a new login', () => {
    const expired = { ...item, status: 'needs_login', lastError: 'The bank needs you to log in again.' };

    beforeEach(() => {
      plaidApi.getBankConnections.mockResolvedValue({ items: [expired] });
    });

    it('shows the status and reconnects through update mode without using a Trial slot', async () => {
      const { usePlaidLink } = await import('react-plaid-link');
      const confirm = vi.spyOn(window, 'confirm');
      plaidApi.createLinkToken.mockResolvedValue({ linkToken: 'link-update-1' });
      plaidApi.reconnectBank.mockResolvedValue({ item: { ...expired, status: 'ok' }, sync: { added: 2 } });
      plaidApi.getPlaidStatus.mockResolvedValue(production);

      render(<BankConnections status={production} onStatusChange={vi.fn()} />);
      expect(await screen.findByTestId('bank-connection-status')).toHaveTextContent('Needs login');
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

      await waitFor(() => expect(plaidApi.createLinkToken).toHaveBeenCalledWith(1));
      expect(confirm).not.toHaveBeenCalled();

      // Plaid Link finishes: the stored connection is repaired, no new bank is exchanged
      const { onSuccess } = usePlaidLink.mock.calls.at(-1)[0];
      await act(() => onSuccess('public-ignored', { institution: { name: 'Test Bank' } }));

      expect(plaidApi.reconnectBank).toHaveBeenCalledWith(1);
      expect(plaidApi.connectBank).not.toHaveBeenCalled();
      expect(await screen.findByRole('status')).toHaveTextContent('Reconnected Test Bank');
    });

    it('reports a first sync that still fails after reconnecting', async () => {
      const { usePlaidLink } = await import('react-plaid-link');
      plaidApi.createLinkToken.mockResolvedValue({ linkToken: 'link-update-2' });
      plaidApi.reconnectBank.mockResolvedValue({ item: expired, sync: { error: 'INSTITUTION_DOWN' } });
      plaidApi.getPlaidStatus.mockResolvedValue(production);

      render(<BankConnections status={production} onStatusChange={vi.fn()} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Reconnect' }));
      await waitFor(() => expect(plaidApi.createLinkToken).toHaveBeenCalledWith(1));

      await act(() => usePlaidLink.mock.calls.at(-1)[0].onSuccess('public-ignored', {}));

      expect(await screen.findByRole('status')).toHaveTextContent('first sync failed: INSTITUTION_DOWN');
    });

    it('steers the user to Reconnect when they try to disconnect', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<BankConnections status={production} onStatusChange={vi.fn()} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));

      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('use Reconnect instead'));
      expect(plaidApi.disconnectBank).not.toHaveBeenCalled();
    });
  });
});
