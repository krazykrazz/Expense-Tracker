import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ReimbursementPicker from './ReimbursementPicker';
import { allocateDeposit, afterRepaying } from './reimbursementSplit';
import * as plaidApi from '../../../services/plaidApi';

vi.mock('../../../services/plaidApi', () => ({ getReimbursementCandidates: vi.fn() }));

const refundTxn = { id: 5, amount: -13.74, paymentMethodName: 'CIBC MC', reimbursement: { kind: 'refund', suggested: true } };
const depositTxn = { id: 6, amount: -60, paymentMethodName: 'Chequing', reimbursement: { kind: 'deposit', suggested: false } };

const candidate = (id, extra = {}) => ({
  expenseId: id, date: '2026-11-12', place: 'HomeSense', notes: null, type: 'Household', method: 'CIBC MC', paymentMethodId: 4,
  amount: 50, originalCost: null, charged: 50, reimbursed: 0, tags: ['merchant'], alreadyEntered: false, ...extra
});

const renderPicker = (txn, props = {}) => render(<ReimbursementPicker txn={txn} busy={false} onCancel={vi.fn()} onApply={vi.fn()} {...props} />);

describe('allocateDeposit / afterRepaying', () => {
  it('shares a deposit in order, each expense taking at most what it cost, and leaves the rest unassigned', () => {
    expect(allocateDeposit(6000, [{ expenseId: 1, amount: 40 }, { expenseId: 2, amount: 40 }])).toEqual({ 1: 40, 2: 20 });
    expect(allocateDeposit(3000, [{ expenseId: 1, amount: 40 }])).toEqual({ 1: 30 });
    expect(allocateDeposit(9000, [{ expenseId: 1, amount: 40 }, { expenseId: 2, amount: 20 }])).toEqual({ 1: 40, 2: 20 });
    expect(allocateDeposit(2500, [{ expenseId: 1, amount: 75, alreadyEntered: true }])).toEqual({ 1: 25 });
    expect(allocateDeposit(7500, [{ expenseId: 1, amount: 125, alreadyEntered: true, enteredPool: 50 }])).toEqual({ 1: 50 });
  });

  it('what an expense becomes, and when more than is left is asked', () => {
    expect(afterRepaying({ amount: 50 }, 13.74)).toEqual({ outOfPocket: 36.26, over: false, unchanged: false });
    expect(afterRepaying({ amount: 10 }, 10.01)).toEqual({ outOfPocket: 0, over: true, unchanged: false });
    expect(afterRepaying({ amount: 36.26 }, 13.74, true)).toEqual({ outOfPocket: 36.26, over: false, unchanged: true });
    expect(afterRepaying({ amount: 125, enteredPool: 50 }, 75, true)).toEqual({ outOfPocket: 125, over: true, unchanged: true });
  });
});

describe('ReimbursementPicker: a refund on a card', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pre-selects the purchase the refund is most likely for, shows what it costs afterwards, and applies the whole credit', async () => {
    plaidApi.getReimbursementCandidates.mockResolvedValue({
      kind: 'refund', row: { id: 5, amount: 13.74 }, candidates: [candidate(41), candidate(42, { date: '2026-11-01', tags: [] })],
      suggestion: [{ expenseId: 41, amount: 13.74, alreadyEntered: false }], moreAvailable: false
    });
    const onApply = vi.fn();
    renderPicker(refundTxn, { onApply });

    const items = await screen.findAllByTestId('reimbursement-candidate');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('radio')).toBeChecked();
    expect(within(items[0]).getByTestId('reimbursement-preview')).toHaveTextContent('Out of pocket after: $36.26');
    expect(within(items[0]).getByText('Same merchant')).toBeInTheDocument();
    expect(screen.getByTestId('reimbursement-picker')).toHaveTextContent('$13.74 is recorded as a payment on the card');
    // The credit is the whole refund: no amount to type
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply refund' }));
    expect(onApply).toHaveBeenCalledWith([{ expenseId: 41, amount: 13.74 }]);
  });

  it('a reimbursement already entered by hand is applied as such, leaving the expense as it is', async () => {
    plaidApi.getReimbursementCandidates.mockResolvedValue({
      kind: 'refund', row: { id: 5, amount: 13.74 },
      candidates: [candidate(41, { amount: 36.26, originalCost: 50, reimbursed: 13.74, tags: ['entered', 'merchant'], alreadyEntered: true })],
      suggestion: [{ expenseId: 41, amount: 13.74, alreadyEntered: true }], moreAvailable: false
    });
    const onApply = vi.fn();
    renderPicker(refundTxn, { onApply });

    expect(await screen.findByTestId('reimbursement-preview')).toHaveTextContent('Counted against the reimbursement you entered: the expense stays as it is');
    expect(screen.getByText('Entered by hand')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply refund' }));

    expect(onApply).toHaveBeenCalledWith([{ expenseId: 41, amount: 13.74, alreadyEntered: true }]);
  });

  it('offers other merchants on request, and picking another purchase replaces the choice', async () => {
    plaidApi.getReimbursementCandidates
      .mockResolvedValueOnce({ kind: 'refund', row: { id: 5, amount: 13.74 }, candidates: [candidate(41)], suggestion: [{ expenseId: 41, amount: 13.74, alreadyEntered: false }], moreAvailable: true })
      .mockResolvedValueOnce({ kind: 'refund', row: { id: 5, amount: 13.74 }, candidates: [candidate(41), candidate(43, { place: 'Sobeys', tags: [] })], suggestion: [{ expenseId: 41, amount: 13.74, alreadyEntered: false }], moreAvailable: false });
    const onApply = vi.fn();
    renderPicker(refundTxn, { onApply });

    fireEvent.click(await screen.findByRole('button', { name: 'Show purchases at other merchants' }));
    await waitFor(() => expect(screen.getAllByTestId('reimbursement-candidate')).toHaveLength(2));
    const items = screen.getAllByTestId('reimbursement-candidate');
    expect(plaidApi.getReimbursementCandidates).toHaveBeenLastCalledWith(5, expect.objectContaining({ all: true }));
    fireEvent.click(within(items[1]).getByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply refund' }));

    expect(onApply).toHaveBeenCalledWith([{ expenseId: 43, amount: 13.74 }]);
  });

  it('says when there is no purchase, keeps Apply off, and shows a failed load', async () => {
    plaidApi.getReimbursementCandidates.mockResolvedValueOnce({ kind: 'refund', row: { id: 5, amount: 13.74 }, candidates: [], suggestion: null, moreAvailable: false });
    const { unmount } = renderPicker(refundTxn);

    expect(await screen.findByText(/No purchase at this merchant on this card/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply refund' })).toBeDisabled();
    unmount();

    plaidApi.getReimbursementCandidates.mockRejectedValueOnce(new Error('Bank transaction was already matched'));
    renderPicker(refundTxn);
    expect(await screen.findByRole('alert')).toHaveTextContent('already matched');
  });
});

describe('ReimbursementPicker: a deposit', () => {
  beforeEach(() => vi.clearAllMocks());

  const two = () => ({
    kind: 'deposit', row: { id: 6, amount: 60 },
    candidates: [
      candidate(51, { place: 'Dinner with Jordan', amount: 80, charged: 80, tags: ['name'] }),
      candidate(52, { place: 'Movie night', method: 'Chequing', amount: 40, charged: 40, tags: [] })
    ],
    suggestion: null, moreAvailable: false
  });

  it('shares the deposit over the picked expenses, and Apply waits until the amounts add up to the cent', async () => {
    plaidApi.getReimbursementCandidates.mockResolvedValue(two());
    const onApply = vi.fn();
    renderPicker(depositTxn, { onApply });

    const items = await screen.findAllByTestId('reimbursement-candidate');
    expect(screen.getByRole('button', { name: 'Apply to expenses' })).toBeDisabled();
    fireEvent.click(within(items[0]).getByRole('checkbox'));
    expect(screen.getByTestId('reimbursement-total')).toHaveTextContent('Applied $60.00 of $60.00');
    expect(screen.getByRole('button', { name: 'Apply to expenses' })).toBeEnabled();

    // Two expenses: the second takes what the first left (here the first caps at what it cost out of pocket)
    fireEvent.click(within(items[1]).getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Repaid on Dinner with Jordan 2026-11-12'), { target: { value: '45' } });
    expect(screen.getByTestId('reimbursement-total')).toHaveTextContent('$15.00 left to apply');
    expect(screen.getByRole('button', { name: 'Apply to expenses' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Repaid on Movie night 2026-11-12'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to expenses' }));

    expect(onApply).toHaveBeenCalledWith([{ expenseId: 51, amount: 45 }, { expenseId: 52, amount: 15 }]);
  });

  it('refuses more than an expense has left and an amount over the deposit', async () => {
    plaidApi.getReimbursementCandidates.mockResolvedValue(two());
    renderPicker(depositTxn);
    const items = await screen.findAllByTestId('reimbursement-candidate');

    fireEvent.click(within(items[1]).getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Repaid on Movie night 2026-11-12'), { target: { value: '60' } });

    expect(within(items[1]).getByText('More than is left to repay on this expense')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply to expenses' })).toBeDisabled();
  });

  it('a part payment is counted against the reimbursement entered by hand, unless you choose to lower the cost instead', async () => {
    plaidApi.getReimbursementCandidates.mockResolvedValue({
      kind: 'deposit', row: { id: 7, amount: 75 },
      candidates: [candidate(61, { place: 'Group dinner', amount: 125, originalCost: 500, charged: 500, reimbursed: 375, enteredPool: 375, tags: ['entered'], alreadyEntered: true })],
      suggestion: [{ expenseId: 61, amount: 75, alreadyEntered: true }], moreAvailable: false
    });
    const onApply = vi.fn();
    renderPicker({ ...depositTxn, id: 7, amount: -75 }, { onApply });

    const item = await screen.findByTestId('reimbursement-candidate');
    const counted = within(item).getByLabelText('Count against the $375.00 reimbursement I entered');
    expect(counted).toBeChecked();
    expect(within(item).getByTestId('reimbursement-preview')).toHaveTextContent('the expense stays as it is');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to expenses' }));
    expect(onApply).toHaveBeenLastCalledWith([{ expenseId: 61, amount: 75, alreadyEntered: true }]);

    fireEvent.click(counted);
    expect(within(item).getByTestId('reimbursement-preview')).toHaveTextContent('Out of pocket after: $50.00');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to expenses' }));
    expect(onApply).toHaveBeenLastCalledWith([{ expenseId: 61, amount: 75 }]);
  });

  it('refuses more than is left of the reimbursement entered by hand', async () => {
    plaidApi.getReimbursementCandidates.mockResolvedValue({
      kind: 'deposit', row: { id: 7, amount: 75 },
      candidates: [candidate(61, { place: 'Group dinner', amount: 125, originalCost: 500, charged: 500, reimbursed: 375, enteredPool: 50, tags: [], alreadyEntered: false })],
      suggestion: null, moreAvailable: false
    });
    renderPicker({ ...depositTxn, id: 7, amount: -75 });

    const item = await screen.findByTestId('reimbursement-candidate');
    fireEvent.click(within(item).getByRole('checkbox'));
    fireEvent.click(within(item).getByLabelText('Count against the $50.00 reimbursement I entered'));
    fireEvent.change(within(item).getByLabelText('Repaid on Group dinner 2026-11-12'), { target: { value: '75' } });
    expect(within(item).getByText('More than the $50.00 entered as reimbursed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply to expenses' })).toBeDisabled();
  });

  it('starts from the suggestion, and Show more asks for the whole window', async () => {
    plaidApi.getReimbursementCandidates
      .mockResolvedValueOnce({ ...two(), suggestion: [{ expenseId: 51, amount: 60, alreadyEntered: false }], moreAvailable: true })
      .mockResolvedValueOnce({ ...two(), suggestion: [{ expenseId: 51, amount: 60, alreadyEntered: false }], moreAvailable: false });
    renderPicker(depositTxn);

    const items = await screen.findAllByTestId('reimbursement-candidate');
    expect(within(items[0]).getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Apply to expenses' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Show more expenses' }));
    await waitFor(() => expect(plaidApi.getReimbursementCandidates).toHaveBeenLastCalledWith(6, expect.objectContaining({ all: true })));
  });
});
