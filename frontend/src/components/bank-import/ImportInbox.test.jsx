import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ImportInbox from './ImportInbox';
import * as plaidApi from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  getInbox: vi.fn(),
  addInboxTransaction: vi.fn(),
  matchInboxTransaction: vi.fn(),
  matchInboxTransactionToFixed: vi.fn(),
  matchInboxTransactionToIncome: vi.fn(),
  addInboxTransactionAsIncome: vi.fn(),
  resolveCancelledPending: vi.fn(),
  ignoreInboxTransaction: vi.fn(),
  unignoreInboxTransaction: vi.fn(),
}));

const txn = (overrides = {}) => ({
  id: 1, transactionId: 't1', date: '2026-10-10', postedDate: '2026-10-12', place: 'Coffee Shop', rawName: 'SQ *COFFEE SHOP',
  amount: 25.5, isoCurrencyCode: 'CAD', accountMask: '1234', paymentMethodId: 2, paymentMethodName: 'Debit',
  status: 'new', canAdd: true, suggestedCategory: 'Dining Out', matchCandidates: [], fixedCandidates: [], ...overrides
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
    const candidate = { id: 42, date: '2026-10-10', place: 'Coffee', amount: 25.5, originalCost: null, chargedAmount: 25.5, type: 'Dining Out', notes: null };
    plaidApi.getInbox
      .mockResolvedValueOnce({ transactions: [txn({ matchCandidates: [candidate] })], hiddenUnmapped: 0 })
      .mockResolvedValue({ transactions: [], hiddenUnmapped: 0 });
    plaidApi.matchInboxTransaction.mockResolvedValue({ transaction: {} });

    renderInbox();
    expect(await screen.findByText('Possible match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Match' }));
    const picker = document.querySelector('.inbox-match-picker');
    fireEvent.click(within(picker).getByRole('button', { name: 'Match' }));

    await waitFor(() => expect(plaidApi.matchInboxTransaction).toHaveBeenCalledWith(1, 42));
  });

  it('shows the charged amount and the out-of-pocket share for reimbursed candidates', async () => {
    const candidate = { id: 7, date: '2026-10-10', place: 'Clinic', amount: 5.5, originalCost: 25.5, chargedAmount: 25.5, type: 'Tax - Medical', notes: null };
    plaidApi.getInbox.mockResolvedValue({ transactions: [txn({ matchCandidates: [candidate] })], hiddenUnmapped: 0 });

    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Match' }));

    const row = document.querySelector('.inbox-match-picker');
    expect(within(row).getByText(/Clinic · Tax - Medical · \$25\.50/)).toBeInTheDocument();
    expect(within(row).getByText(/you paid \$5\.50 after reimbursement/)).toBeInTheDocument();
  });

  describe('fixed expenses', () => {
    const fixed = (overrides = {}) => ({
      id: 9, year: 2026, month: 10, name: 'Mortgage', category: 'Housing', amount: 1500, dueDay: 1,
      expectedDate: '2026-10-01', amountDiffers: false, linkedLoanId: null, ...overrides
    });

    it('flags a matching fixed expense and confirms it from the picker', async () => {
      plaidApi.getInbox
        .mockResolvedValueOnce({ transactions: [txn({ place: 'MORTGAGE PMT', amount: 1500, fixedCandidates: [fixed()] })], hiddenUnmapped: 0 })
        .mockResolvedValue({ transactions: [], hiddenUnmapped: 0 });
      plaidApi.matchInboxTransactionToFixed.mockResolvedValue({ transaction: {}, fixedExpense: { id: 9 } });
      const onExpensesChanged = vi.fn();

      renderInbox({ onExpensesChanged });
      expect(await screen.findByText('Fixed: Mortgage')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Match' }));
      const candidate = screen.getByTestId('fixed-candidate');
      expect(candidate).toHaveTextContent('Mortgage · due Oct 1, 2026 · $1,500.00');
      fireEvent.click(within(candidate).getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(plaidApi.matchInboxTransactionToFixed).toHaveBeenCalledWith(1, 9));
      await waitFor(() => expect(onExpensesChanged).toHaveBeenCalled());
    });

    it('explains that a different amount will update the plan, and only badges close amounts', async () => {
      plaidApi.getInbox.mockResolvedValue({
        transactions: [txn({ amount: 17.78, fixedCandidates: [fixed({ name: 'HELOC Interest', amount: 6.91, amountDiffers: true })] })],
        hiddenUnmapped: 0
      });

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Match' }));

      expect(screen.getByTestId('fixed-candidate')).toHaveTextContent('planned amount will be updated to $17.78');
      expect(screen.queryByText(/^Fixed:/)).not.toBeInTheDocument();
    });
  });

  describe('income', () => {
    const deposit = (overrides = {}) => txn({
      place: 'JAT - Direct deposit', rawName: 'JAT - Direct deposit', date: '2026-10-29', postedDate: '2026-10-29',
      amount: -10848.23, canAdd: false, isDeposit: true, incomeSuggestion: { name: 'JAT - Direct deposit', category: 'Other' }, ...overrides
    });
    const income = (overrides = {}) => ({
      id: 5, year: 2026, month: 11, name: 'JAT', category: 'Salary', amount: 10848.23, amountDiffers: false, nameMatch: true, ...overrides
    });

    it('labels deposits, flags expected income and confirms it from the picker', async () => {
      plaidApi.getInbox
        .mockResolvedValueOnce({ transactions: [deposit({ incomeCandidates: [income()] })], hiddenUnmapped: 0 })
        .mockResolvedValue({ transactions: [], hiddenUnmapped: 0 });
      plaidApi.matchInboxTransactionToIncome.mockResolvedValue({ transaction: {}, incomeSource: { id: 5 } });
      const onExpensesChanged = vi.fn();

      renderInbox({ onExpensesChanged });
      expect(await screen.findByText('Deposit')).toBeInTheDocument();
      expect(screen.queryByText('Refund / credit')).not.toBeInTheDocument();
      expect(screen.getByText('Income: JAT')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Match' }));
      const candidate = screen.getByTestId('income-candidate');
      expect(candidate).toHaveTextContent('JAT · Nov 2026 · $10,848.23');
      expect(within(candidate).queryByRole('checkbox')).not.toBeInTheDocument();
      fireEvent.click(within(candidate).getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(plaidApi.matchInboxTransactionToIncome).toHaveBeenCalledWith(1, { incomeSourceId: 5, updateAmount: true }));
      await waitFor(() => expect(onExpensesChanged).toHaveBeenCalled());
    });

    it('offers to update a different amount, pre-checked, and sends the choice', async () => {
      plaidApi.getInbox.mockResolvedValue({
        transactions: [deposit({ incomeCandidates: [income({ amount: 10500, amountDiffers: true })] })], hiddenUnmapped: 0
      });
      plaidApi.matchInboxTransactionToIncome.mockResolvedValue({ transaction: {}, incomeSource: { id: 5 } });

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Match' }));
      const checkbox = within(screen.getByTestId('income-candidate')).getByRole('checkbox', { name: /Update to \$10,848\.23/ });
      expect(checkbox).toBeChecked();
      fireEvent.click(checkbox);
      fireEvent.click(within(screen.getByTestId('income-candidate')).getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(plaidApi.matchInboxTransactionToIncome).toHaveBeenCalledWith(1, { incomeSourceId: 5, updateAmount: false }));
    });

    it('adds an unplanned deposit as income with the suggested name and chosen category', async () => {
      plaidApi.getInbox
        .mockResolvedValueOnce({ transactions: [deposit({ incomeCandidates: [] })], hiddenUnmapped: 0 })
        .mockResolvedValue({ transactions: [], hiddenUnmapped: 0 });
      plaidApi.addInboxTransactionAsIncome.mockResolvedValue({ transaction: {}, incomeSource: { id: 6 } });

      renderInbox();
      expect(await screen.findByText('Deposit')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Match' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
      expect(screen.getByText('Adds $10,848.23 to Oct 2026 income')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Salary' } });
      fireEvent.click(within(document.querySelector('.inbox-add-form')).getByRole('button', { name: 'Add income' }));

      await waitFor(() => expect(plaidApi.addInboxTransactionAsIncome).toHaveBeenCalledWith(1, { name: 'JAT - Direct deposit', category: 'Salary' }));
    });
  });

  describe('pending transactions', () => {
    it('marks pending rows and still lets you add them', async () => {
      plaidApi.getInbox.mockResolvedValue({ transactions: [txn({ pending: true })], hiddenUnmapped: 0, cancelled: [] });

      renderInbox();

      expect(await screen.findByText('Pending')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
    });

    it('reviews a dropped pending charge: link to the settled transaction, keep, or delete', async () => {
      const cancelledRow = {
        id: 7, date: '2026-10-10', place: 'Gas Station', amount: 100, accountMask: '1234', paymentMethodName: 'Visa',
        expense: { id: 55, place: 'Gas Station', amount: 100, date: '2026-10-10' },
        settledCandidates: [{ id: 8, date: '2026-10-12', place: 'GAS STATION', amount: 62.4 }]
      };
      plaidApi.getInbox.mockResolvedValue({ transactions: [], hiddenUnmapped: 0, cancelled: [cancelledRow] });
      plaidApi.resolveCancelledPending.mockResolvedValue({ action: 'link' });
      const onExpensesChanged = vi.fn();

      renderInbox({ onExpensesChanged });
      const row = await screen.findByTestId('cancelled-row');
      expect(within(row).getByText('Cancelled at bank')).toBeInTheDocument();
      expect(within(row).getByText(/GAS STATION · \$62\.40/)).toBeInTheDocument();
      expect(screen.queryByText(/Nothing to review/)).not.toBeInTheDocument();

      fireEvent.click(within(row).getByRole('button', { name: 'Link' }));
      await waitFor(() => expect(plaidApi.resolveCancelledPending).toHaveBeenCalledWith(7, { action: 'link', postedId: 8 }));
      await waitFor(() => expect(onExpensesChanged).toHaveBeenCalled());

      fireEvent.click(within(row).getByRole('button', { name: 'Delete expense' }));
      await waitFor(() => expect(plaidApi.resolveCancelledPending).toHaveBeenCalledWith(7, { action: 'delete_expense' }));
    });
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
