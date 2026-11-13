import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import ImportInbox from './ImportInbox';
import * as plaidApi from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  getInbox: vi.fn(),
  addInboxTransaction: vi.fn(),
  matchInboxTransaction: vi.fn(),
  matchInboxTransactionToFixed: vi.fn(),
  matchInboxTransactionToIncome: vi.fn(),
  addInboxTransactionAsIncome: vi.fn(),
  cardPaymentInboxTransaction: vi.fn(),
  getInsuranceCandidates: vi.fn(),
  applyInsuranceToInboxTransaction: vi.fn(),
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

  it('says that matching a settled card transaction sets the posted date, and not for a debit or a pending charge', async () => {
    const candidate = { id: 42, date: '2026-10-31', place: 'La Vie En Rose', amount: 35.54, originalCost: null, chargedAmount: 35.54, type: 'Clothing', notes: null };
    const card = (overrides) => txn({ paymentMethodType: 'credit_card', paymentMethodName: 'CIBC MC', postedDate: '2026-11-02', matchCandidates: [candidate], ...overrides });
    plaidApi.getInbox.mockResolvedValue({
      transactions: [card({ id: 1 }), card({ id: 2, pending: true }), txn({ id: 3, paymentMethodType: 'debit', matchCandidates: [candidate] })],
      hiddenUnmapped: 0
    });

    renderInbox();
    const rows = await screen.findAllByTestId('inbox-row');
    const notes = [];
    for (const row of rows) {
      fireEvent.click(within(row).getByRole('button', { name: 'Match' }));
      notes.push(row.querySelector('.inbox-match-picker')?.textContent ?? '');
    }

    expect(notes[0]).toContain("Matching sets the expense's posted date to the bank's (Nov 2, 2026); its purchase date stays.");
    expect(notes[1]).not.toContain('posted date');
    expect(notes[2]).not.toContain('posted date');
  });

  it('flags a pending card charge made just before the statement closes', async () => {
    const card = (overrides) => txn({ paymentMethodType: 'credit_card', paymentMethodName: 'CIBC MC', billingCycleDay: 15, ...overrides });
    plaidApi.getInbox.mockResolvedValue({
      transactions: [
        card({ id: 1, date: '2026-10-14', pending: true }),
        card({ id: 2, date: '2026-10-14', pending: false }),
        card({ id: 3, date: '2026-10-05', pending: true }),
        txn({ id: 4, date: '2026-10-14', pending: true, paymentMethodType: 'debit', billingCycleDay: null })
      ],
      hiddenUnmapped: 0
    });

    renderInbox();
    const rows = await screen.findAllByTestId('inbox-row');

    expect(within(rows[0]).getByTestId('pending-turnover')).toHaveTextContent('→ next?');
    expect(within(rows[1]).queryByTestId('pending-turnover')).not.toBeInTheDocument();
    expect(within(rows[2]).queryByTestId('pending-turnover')).not.toBeInTheDocument();
    expect(within(rows[3]).queryByTestId('pending-turnover')).not.toBeInTheDocument();
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

  describe('insurance reimbursements', () => {
    // The DSF deposit of 2026-11-12 and the claim it pays
    const dsf = (overrides = {}) => txn({
      place: 'DSF - Direct deposit', rawName: 'DSF - Direct deposit', date: '2026-11-12', postedDate: '2026-11-12',
      amount: -105.3, canAdd: false, isDeposit: true, incomeCandidates: [], insurance: { suggested: true }, ...overrides
    });
    const claim = (overrides = {}) => ({
      expenseId: 25378, date: '2026-11-10', place: 'Carp Chiro', claimStatus: 'in_progress', originalCost: 117, outOfPocket: 11.7,
      reimbursed: 0, expectedPayout: 105.3, rank: 'exact',
      people: [{ personId: 1, name: 'Amara', originalAmount: 61, amount: 6.1 }, { personId: 2, name: 'Joliet', originalAmount: 56, amount: 5.6 }],
      ...overrides
    });
    const other = claim({ expenseId: 4877, date: '2026-10-02', place: 'The Wren Centre', claimStatus: 'not_claimed', originalCost: 180, outOfPocket: 18, expectedPayout: 162, rank: null, people: [] });

    it('suggests the insurance action, pre-selects the exact claim with its preview, and applies it', async () => {
      plaidApi.getInbox
        .mockResolvedValueOnce({ transactions: [dsf()], hiddenUnmapped: 0 })
        .mockResolvedValue({ transactions: [], hiddenUnmapped: 0 });
      plaidApi.getInsuranceCandidates.mockResolvedValue({
        deposit: { id: 1, amount: 105.3, date: '2026-11-12' }, candidates: [claim(), other],
        suggestion: [{ expenseId: 25378, amount: 105.3 }], paidAvailable: 0
      });
      plaidApi.applyInsuranceToInboxTransaction.mockResolvedValue({});
      const onExpensesChanged = vi.fn();

      renderInbox({ onExpensesChanged });
      expect(await screen.findByText('Insurance')).toBeInTheDocument();
      const button = screen.getByRole('button', { name: 'Apply to insurance' });
      expect(button).toHaveClass('bank-import-primary');
      fireEvent.click(button);

      const picker = await screen.findByTestId('insurance-picker');
      await waitFor(() => expect(within(picker).getByTestId('insurance-preview')).toHaveTextContent('Out-of-pocket after: $11.70 (Amara $6.10, Joliet $5.60)'));
      expect(within(picker).getByTestId('insurance-total')).toHaveTextContent('Applied $105.30 of $105.30');
      fireEvent.click(within(picker).getByRole('button', { name: 'Apply to claims' }));

      await waitFor(() => expect(plaidApi.applyInsuranceToInboxTransaction).toHaveBeenCalledWith(1, [{ expenseId: 25378, amount: 105.3 }]));
      await waitFor(() => expect(onExpensesChanged).toHaveBeenCalled());
    });

    it('splits across picked claims and only applies once the amounts add up to the deposit', async () => {
      plaidApi.getInbox.mockResolvedValue({ transactions: [dsf({ amount: -267.3, insurance: { suggested: false } })], hiddenUnmapped: 0 });
      plaidApi.getInsuranceCandidates.mockResolvedValue({
        deposit: { id: 1, amount: 267.3 }, candidates: [claim({ rank: 'combination' }), other], suggestion: null, paidAvailable: 0
      });

      renderInbox();
      const button = await screen.findByRole('button', { name: 'Apply to insurance' });
      expect(button).toHaveClass('bank-import-secondary');
      fireEvent.click(button);
      const picker = await screen.findByTestId('insurance-picker');
      await waitFor(() => expect(within(picker).getAllByTestId('insurance-candidate')).toHaveLength(2));
      const [first, second] = within(picker).getAllByRole('checkbox');
      fireEvent.click(first);
      fireEvent.click(second);

      // Expected payouts 105.30 + 162.00 add up to the deposit
      const inputs = within(picker).getAllByRole('spinbutton');
      expect(inputs.map(input => input.value)).toEqual(['105.30', '162.00']);
      expect(within(picker).getByRole('button', { name: 'Apply to claims' })).toBeEnabled();

      fireEvent.change(inputs[1], { target: { value: '150.00' } });
      expect(within(picker).getByTestId('insurance-total')).toHaveTextContent('$12.00 left to apply');
      expect(within(picker).getByRole('button', { name: 'Apply to claims' })).toBeDisabled();
    });

    it('shows paid claims only on request, and an error keeps the row', async () => {
      plaidApi.getInbox.mockResolvedValue({ transactions: [dsf()], hiddenUnmapped: 0 });
      plaidApi.getInsuranceCandidates
        .mockResolvedValueOnce({ deposit: {}, candidates: [claim()], suggestion: [{ expenseId: 25378, amount: 105.3 }], paidAvailable: 46 })
        .mockResolvedValueOnce({ deposit: {}, candidates: [claim(), claim({ expenseId: 9, place: 'Paid one', claimStatus: 'paid', rank: null })], suggestion: [{ expenseId: 25378, amount: 105.3 }], paidAvailable: 0 });
      plaidApi.applyInsuranceToInboxTransaction.mockRejectedValue(new Error('This bank transaction changed while it was being added.'));

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Apply to insurance' }));
      fireEvent.click(await screen.findByRole('button', { name: /Show paid claims \(46\)/ }));

      await waitFor(() => expect(plaidApi.getInsuranceCandidates).toHaveBeenLastCalledWith(1, expect.objectContaining({ includePaid: true })));
      expect(await screen.findByText(/Paid one/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Apply to claims' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('changed while it was being added');
      expect(screen.getByText('DSF - Direct deposit')).toBeInTheDocument();
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

  it('tells the header badge when an Inbox decision changed what is waiting', async () => {
    const onInboxChanged = vi.fn();
    plaidApi.getInbox.mockResolvedValue({ transactions: [txn({ amount: -10, canAdd: false })], hiddenUnmapped: 0 });
    plaidApi.ignoreInboxTransaction.mockResolvedValue({ transaction: {} });

    renderInbox({ onInboxChanged });
    fireEvent.click(await screen.findByRole('button', { name: 'Ignore' }));

    await waitFor(() => expect(onInboxChanged).toHaveBeenCalledTimes(1));
  });

  it('does not tell the badge about a decision that failed', async () => {
    const onInboxChanged = vi.fn();
    plaidApi.getInbox.mockResolvedValue({ transactions: [txn()], hiddenUnmapped: 0 });
    plaidApi.ignoreInboxTransaction.mockRejectedValue(new Error('Bank transaction was already added'));

    renderInbox({ onInboxChanged });
    fireEvent.click(await screen.findByRole('button', { name: 'Ignore' }));

    await screen.findByRole('alert');
    expect(onInboxChanged).not.toHaveBeenCalled();
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

  describe('credit card payments', () => {
    const cp = (overrides = {}) => ({
      side: 'card', kind: 'card_payment', looksLikeCardPayment: true, pairCandidates: [], paymentCandidates: [], ...overrides
    });
    const debitPair = (overrides = {}) => ({
      id: 11, date: '2026-10-30', amount: 3471.31, accountName: 'Chequing', accountMask: '5070', paymentMethodName: 'Debit', ...overrides
    });
    const visaCredit = (overrides = {}) => txn({
      id: 10, transactionId: 'visa-credit', place: 'Credit Card Payment - From: Cash', rawName: 'Credit Card Payment - From: Cash',
      amount: -3471.31, date: '2026-10-30', postedDate: '2026-10-30', accountMask: 'KL54', paymentMethodId: 4, paymentMethodName: 'WS VISA',
      canAdd: false, cardPayment: cp({ pairCandidates: [debitPair()] }), ...overrides
    });
    const chequingDebit = (overrides = {}) => txn({
      id: 11, transactionId: 'visa-debit', place: 'Credit Card Payment', rawName: 'Credit Card Payment', amount: 3471.31,
      date: '2026-10-30', postedDate: '2026-10-30', accountMask: '5070', paymentMethodName: 'Debit', suggestedCategory: null,
      cardPayment: cp({ side: 'funding', kind: null, pairCandidates: [{ id: 10, date: '2026-10-30', amount: -3471.31, accountMask: 'KL54', paymentMethodName: 'WS VISA' }] }),
      ...overrides
    });
    const respond = (transactions, extra = {}) => plaidApi.getInbox
      .mockResolvedValueOnce({ transactions, hiddenUnmapped: 0, unconnectedCards: [], ...extra })
      .mockResolvedValue({ transactions: [], hiddenUnmapped: 0, unconnectedCards: [] });

    it('labels a credit on a card as a card payment instead of a refund, and offers Record payment', async () => {
      respond([visaCredit(), visaCredit({ id: 12, transactionId: 'refund', place: 'AMAZON REFUND', amount: -25, cardPayment: cp({ kind: null, looksLikeCardPayment: false }) })]);

      renderInbox();

      expect(await screen.findByText('Card payment')).toBeInTheDocument();
      // A credit nothing says is a payment keeps its label, and can still be recorded
      expect(screen.getAllByText('Refund / credit')).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Record payment' })).toHaveLength(2);
    });

    it('records the payment and takes the paying debit along when exactly one could have paid it', async () => {
      const onExpensesChanged = vi.fn();
      respond([visaCredit(), chequingDebit()]);
      plaidApi.cardPaymentInboxTransaction.mockResolvedValue({ created: true, payment: { id: 5 }, linkedTransactionIds: [10, 11] });

      renderInbox({ onExpensesChanged });
      const rows = await screen.findAllByTestId('inbox-row');
      fireEvent.click(within(rows[0]).getByRole('button', { name: 'Record payment' }));

      const panel = await screen.findByTestId('card-payment-panel');
      expect(panel).toHaveTextContent('Records a $3,471.31 payment to WS VISA dated Oct 30, 2026');
      expect(within(panel).getByLabelText(/Also mark the Debit ••5070 debit on Oct 30, 2026 as this payment/)).toBeChecked();
      fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }));

      await waitFor(() => expect(plaidApi.cardPaymentInboxTransaction).toHaveBeenCalledWith(10, { alsoLinkId: 11 }));
      await waitFor(() => expect(screen.queryByText('Credit Card Payment')).not.toBeInTheDocument());
      expect(onExpensesChanged).toHaveBeenCalled();
    });

    it('records the credit alone when the paying debit is unchecked', async () => {
      respond([visaCredit()]);
      plaidApi.cardPaymentInboxTransaction.mockResolvedValue({ created: true, payment: { id: 5 }, linkedTransactionIds: [10] });

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
      const panel = await screen.findByTestId('card-payment-panel');
      fireEvent.click(within(panel).getByLabelText(/Also mark/));
      fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }));

      await waitFor(() => expect(plaidApi.cardPaymentInboxTransaction).toHaveBeenCalledWith(10, {}));
    });

    it('makes the user choose when several debits could have paid it', async () => {
      respond([visaCredit({ cardPayment: cp({ pairCandidates: [debitPair(), debitPair({ id: 13, accountMask: '9999' })] }) })]);
      plaidApi.cardPaymentInboxTransaction.mockResolvedValue({ created: true, payment: { id: 5 }, linkedTransactionIds: [10, 13] });

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
      const panel = await screen.findByTestId('card-payment-panel');
      expect(within(panel).getByLabelText(/Don't link a debit/)).toBeChecked();
      fireEvent.click(within(panel).getByLabelText(/••9999/));
      fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }));

      await waitFor(() => expect(plaidApi.cardPaymentInboxTransaction).toHaveBeenCalledWith(10, { alsoLinkId: 13 }));
    });

    it('offers to match a payment already entered by hand instead of recording it twice', async () => {
      const byHand = { id: 7, paymentMethodId: 4, paymentMethodName: 'WS VISA', date: '2026-10-29', amount: 3471.31, notes: 'by hand' };
      respond([visaCredit({ cardPayment: cp({ paymentCandidates: [byHand] }) })]);
      plaidApi.cardPaymentInboxTransaction.mockResolvedValue({ created: false, payment: byHand, linkedTransactionIds: [10] });

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
      const panel = await screen.findByTestId('card-payment-panel');
      expect(panel).toHaveTextContent(/Already recorded for WS VISA/);
      fireEvent.click(within(within(panel).getByTestId('payment-candidate')).getByRole('button', { name: 'Match' }));

      await waitFor(() => expect(plaidApi.cardPaymentInboxTransaction).toHaveBeenCalledWith(10, { creditCardPaymentId: 7 }));
    });

    it('cannot record a pending credit', async () => {
      respond([visaCredit({ pending: true })]);

      renderInbox();

      expect(await screen.findByRole('button', { name: 'Record payment' })).toBeDisabled();
    });

    it('tells the debit where to record it, and keeps Add with a double-count warning', async () => {
      respond([chequingDebit()]);

      renderInbox();

      expect(await screen.findByText('Card payment')).toBeInTheDocument();
      expect(screen.getByText(/record it from that credit \(Oct 30, 2026\)/)).toHaveTextContent('Paid WS VISA ••KL54');
      expect(screen.queryByRole('button', { name: /Link to card payment|Record payment/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.getByRole('note')).toHaveTextContent(/counts the spending twice/);
    });

    it('does not warn when adding an ordinary purchase', async () => {
      respond([txn()]);

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Add' }));

      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    it('links a debit to a payment that is already recorded', async () => {
      const recorded = { id: 5, paymentMethodId: 4, paymentMethodName: 'WS VISA', date: '2026-10-30', amount: 3471.31, notes: 'Bank: Credit Card Payment' };
      respond([chequingDebit({ cardPayment: cp({ side: 'funding', kind: null, paymentCandidates: [recorded] }) })]);
      plaidApi.cardPaymentInboxTransaction.mockResolvedValue({ created: false, payment: recorded, linkedTransactionIds: [11] });

      renderInbox();
      expect(await screen.findByText('Card payment → WS VISA')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Link to card payment' }));
      const panel = await screen.findByTestId('card-payment-panel');
      fireEvent.click(within(panel).getByRole('button', { name: 'Link' }));

      await waitFor(() => expect(plaidApi.cardPaymentInboxTransaction).toHaveBeenCalledWith(11, { creditCardPaymentId: 5 }));
    });

    it('records a debit to a card that is not connected to a bank', async () => {
      respond(
        [chequingDebit({ cardPayment: cp({ side: 'funding', kind: null, pairCandidates: [] }) })],
        { unconnectedCards: [{ id: 9, name: 'Amex' }, { id: 12, name: 'Store Card' }] }
      );
      plaidApi.cardPaymentInboxTransaction.mockResolvedValue({ created: true, payment: { id: 6 }, linkedTransactionIds: [11] });

      renderInbox();
      expect(await screen.findByText(/Looks like a credit card payment/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Record payment to…' }));
      const panel = await screen.findByTestId('card-payment-panel');
      const submit = within(panel).getByRole('button', { name: 'Record payment' });
      expect(submit).toBeDisabled();
      fireEvent.change(within(panel).getByLabelText('Card'), { target: { value: '12' } });
      fireEvent.click(submit);

      await waitFor(() => expect(plaidApi.cardPaymentInboxTransaction).toHaveBeenCalledWith(11, { paymentMethodId: 12 }));
    });

    it('offers nothing for a debit that is not a card payment, or to record to a card when every card is connected', async () => {
      respond([
        txn({ id: 20, transactionId: 'hydro', place: 'HYDRO ONE - Bill payment', cardPayment: null }),
        chequingDebit({ cardPayment: cp({ side: 'funding', kind: null, pairCandidates: [] }) })
      ]);

      renderInbox();

      await screen.findByText('HYDRO ONE - Bill payment');
      const [hydro, debit] = screen.getAllByTestId('inbox-row');
      expect(within(hydro).queryByText(/card payment/i)).not.toBeInTheDocument();
      expect(within(debit).getByText(/Looks like a credit card payment/)).toBeInTheDocument();
      // Every card is connected, so there is nowhere to record a payment from the debit
      expect(screen.queryByRole('button', { name: /Record payment/ })).not.toBeInTheDocument();
    });

    it('reloads when a card payment changes elsewhere, and the pre-checked debit follows the new candidates', async () => {
      plaidApi.getInbox
        .mockResolvedValueOnce({ transactions: [visaCredit()], hiddenUnmapped: 0, unconnectedCards: [] })
        .mockResolvedValue({
          transactions: [visaCredit({ cardPayment: cp({ pairCandidates: [debitPair({ id: 13, accountMask: '9999' })] }) })],
          hiddenUnmapped: 0,
          unconnectedCards: []
        });
      plaidApi.cardPaymentInboxTransaction.mockResolvedValue({ created: true, payment: { id: 5 }, linkedTransactionIds: [10, 13] });

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
      const before = await screen.findByTestId('card-payment-panel');
      expect(within(before).getByLabelText(/Also mark the Debit ••5070/)).toBeChecked();

      // Deleting a card payment in another tab (or a sync) changes what could have paid this credit
      act(() => { window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'credit_card' } })); });

      const panel = await screen.findByTestId('card-payment-panel');
      await waitFor(() => expect(within(panel).getByLabelText(/Also mark the Debit ••9999/)).toBeChecked());
      fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }));

      await waitFor(() => expect(plaidApi.cardPaymentInboxTransaction).toHaveBeenCalledWith(10, { alsoLinkId: 13 }));
      expect(plaidApi.getInbox.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('shows the failure and keeps the row when the server refuses', async () => {
      respond([visaCredit({ cardPayment: cp() })]);
      plaidApi.cardPaymentInboxTransaction.mockRejectedValue(new Error('Bank transaction was already reviewed'));

      renderInbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
      fireEvent.click(within(await screen.findByTestId('card-payment-panel')).getByRole('button', { name: 'Record payment' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('already reviewed');
      expect(screen.getByText('Credit Card Payment - From: Cash')).toBeInTheDocument();
    });
  });
});
