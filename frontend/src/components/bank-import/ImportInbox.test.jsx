import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ImportInbox from './ImportInbox';
import * as plaidApi from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  getInbox: vi.fn(),
  addInboxTransaction: vi.fn(),
  matchInboxTransaction: vi.fn(),
  ignoreInboxTransaction: vi.fn(),
  unignoreInboxTransaction: vi.fn(),
}));

const txn = (overrides = {}) => ({
  id: 1, transactionId: 't1', date: '2026-10-10', postedDate: '2026-10-12', place: 'Coffee Shop', rawName: 'SQ *COFFEE SHOP',
  amount: 25.5, isoCurrencyCode: 'CAD', accountMask: '1234', paymentMethodId: 2, paymentMethodName: 'Debit',
  status: 'new', canAdd: true, suggestedCategory: 'Dining Out', matchCandidates: [], ...overrides
});

const renderInbox = (props = {}) => render(<ImportInbox onExpensesChanged={vi.fn()} onOpenConnections={vi.fn()} {...props} />);

describe('ImportInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists transactions and points to account mapping when rows are hidden', async () => {
    const onOpenConnections = vi.fn();
    plaidApi.getInbox.mockResolvedValue({ transactions: [txn()], hiddenUnmapped: 2 });

    renderInbox({ onOpenConnections });

    expect(await screen.findByText('Coffee Shop')).toBeInTheDocument();
    expect(screen.getByText('SQ *COFFEE SHOP')).toBeInTheDocument();
    expect(screen.getByText(/2 new transactions are hidden/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Map accounts' }));
    expect(onOpenConnections).toHaveBeenCalled();
    expect(plaidApi.getInbox).toHaveBeenCalledWith('new', expect.any(Object));
  });

  it('adds a transaction as an expense with the edited fields and refreshes expenses', async () => {
    const onExpensesChanged = vi.fn();
    plaidApi.getInbox
      .mockResolvedValueOnce({ transactions: [txn()], hiddenUnmapped: 0 })
      .mockResolvedValue({ transactions: [], hiddenUnmapped: 0 });
    plaidApi.addInboxTransaction.mockResolvedValue({ transaction: {}, expense: { id: 9 } });

    renderInbox({ onExpensesChanged });
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'latte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(plaidApi.addInboxTransaction).toHaveBeenCalledWith(1, {
      place: 'Coffee Shop', type: 'Dining Out', date: '2026-10-10', notes: 'latte'
    }));
    await waitFor(() => expect(screen.queryByText('Coffee Shop')).not.toBeInTheDocument());
    expect(onExpensesChanged).toHaveBeenCalled();
  });

  it('requires a category when there is no suggestion', async () => {
    plaidApi.getInbox.mockResolvedValue({ transactions: [txn({ suggestedCategory: null })], hiddenUnmapped: 0 });

    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));

    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
  });

  it('matches to a candidate expense', async () => {
    const candidate = { id: 42, date: '2026-10-10', place: 'Coffee', amount: 25.5, type: 'Dining Out', notes: null };
    plaidApi.getInbox
      .mockResolvedValueOnce({ transactions: [txn({ matchCandidates: [candidate] })], hiddenUnmapped: 0 })
      .mockResolvedValue({ transactions: [], hiddenUnmapped: 0 });
    plaidApi.matchInboxTransaction.mockResolvedValue({ transaction: {} });

    renderInbox();
    expect(await screen.findByText('Possible match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Match' }));
    const picker = screen.getByText(/Same payment method and amount/).parentElement;
    fireEvent.click(within(picker).getByRole('button', { name: 'Match' }));

    await waitFor(() => expect(plaidApi.matchInboxTransaction).toHaveBeenCalledWith(1, 42));
  });

  it('refunds can only be ignored', async () => {
    plaidApi.getInbox.mockResolvedValue({ transactions: [txn({ amount: -10, canAdd: false })], hiddenUnmapped: 0 });
    plaidApi.ignoreInboxTransaction.mockResolvedValue({ transaction: {} });

    renderInbox();
    expect(await screen.findByText('Refund / credit')).toBeInTheDocument();
    expect(screen.getByText('-$10.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));

    await waitFor(() => expect(plaidApi.ignoreInboxTransaction).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText('Coffee Shop')).not.toBeInTheDocument());
  });

  it('shows the server error on the row and keeps it', async () => {
    plaidApi.getInbox.mockResolvedValue({ transactions: [txn()], hiddenUnmapped: 0 });
    plaidApi.ignoreInboxTransaction.mockRejectedValue(new Error('Bank transaction was already added'));

    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Ignore' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already added');
    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
  });

  it('restores ignored transactions from the Ignored filter', async () => {
    plaidApi.getInbox.mockImplementation(async (status) => (
      status === 'ignored'
        ? { transactions: [txn({ status: 'ignored' })], hiddenUnmapped: 0 }
        : { transactions: [], hiddenUnmapped: 0 }
    ));
    plaidApi.unignoreInboxTransaction.mockResolvedValue({ transaction: {} });

    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Ignored' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo ignore' }));

    await waitFor(() => expect(plaidApi.unignoreInboxTransaction).toHaveBeenCalledWith(1));
  });
});
