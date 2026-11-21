import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../services/plaidApi', () => ({ getSplitCandidates: vi.fn() }));

import { getSplitCandidates } from '../../services/plaidApi';
import SplitPicker from './SplitPicker';

const candidate = (expenseId, charged, extra = {}) => ({
  expenseId, date: '2026-11-20', place: 'Brio', notes: null, type: 'Gifts', amount: charged, originalCost: null, charged, ...extra
});
const big = candidate(1, 244.02, { type: 'Recreation Activities', notes: 'Pointe + Accessories' });
const small = candidate(2, 82.47, { notes: 'Suit & Ballet Shoes' });
const other = candidate(3, 50, { place: 'Other' });

const matchData = (extra = {}) => ({
  mode: 'match', row: { id: 7 }, bankAmount: 326.49, partsTotal: 0, remaining: 326.49, minExpenses: 2, parts: [],
  candidates: [big, small, other], suggestion: [1, 2], ...extra
});

const renderPicker = (props = {}) => {
  const onApply = vi.fn();
  render(<SplitPicker transactionId={7} busy={false} onCancel={vi.fn()} onApply={onApply} {...props} />);
  return { onApply };
};

describe('SplitPicker: a charge to review', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pre-selects the combination that adds up, shows the total, and matches them all', async () => {
    getSplitCandidates.mockResolvedValue(matchData());
    const { onApply } = renderPicker();

    const rows = await screen.findAllByTestId('split-candidate');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole('checkbox')).toBeChecked();
    expect(within(rows[1]).getByRole('checkbox')).toBeChecked();
    expect(within(rows[2]).getByRole('checkbox')).not.toBeChecked();
    expect(within(rows[0]).getByText(/Recreation Activities · \$244\.02/)).toBeInTheDocument();
    expect(screen.getByTestId('split-total')).toHaveTextContent('Selected $326.49 of $326.49');
    expect(screen.getByText(/Together they must add up to it/)).toBeInTheDocument();
    expect(getSplitCandidates).toHaveBeenCalledWith(7, expect.objectContaining({ signal: expect.any(AbortSignal) }));

    fireEvent.click(screen.getByRole('button', { name: 'Match expenses' }));
    expect(onApply).toHaveBeenCalledWith([1, 2]);
  });

  it('keeps Match disabled until the selection adds up to the charge to the cent, and says how far off it is', async () => {
    getSplitCandidates.mockResolvedValue(matchData({ suggestion: null }));
    renderPicker();
    const rows = await screen.findAllByTestId('split-candidate');
    const match = screen.getByRole('button', { name: 'Match expenses' });
    expect(match).toBeDisabled();

    fireEvent.click(within(rows[0]).getByRole('checkbox'));
    expect(screen.getByTestId('split-total')).toHaveTextContent('Selected $244.02 of $326.49 · $82.47 left');
    expect(match).toBeDisabled();

    fireEvent.click(within(rows[2]).getByRole('checkbox'));
    expect(screen.getByTestId('split-total')).toHaveTextContent('$32.47 left');
    expect(match).toBeDisabled();

    fireEvent.click(within(rows[2]).getByRole('checkbox'));
    fireEvent.click(within(rows[1]).getByRole('checkbox'));
    expect(match).toBeEnabled();

    fireEvent.click(within(rows[2]).getByRole('checkbox'));
    expect(screen.getByTestId('split-total')).toHaveTextContent('$50.00 too much');
    expect(match).toBeDisabled();
  });

  it('needs at least two expenses', async () => {
    getSplitCandidates.mockResolvedValue(matchData({ candidates: [candidate(9, 326.48), small], suggestion: null }));
    renderPicker();
    const rows = await screen.findAllByTestId('split-candidate');

    fireEvent.click(within(rows[0]).getByRole('checkbox'));
    fireEvent.click(within(rows[1]).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Match expenses' })).toBeDisabled();
  });

  it('says so when nothing fits, shows a load error, and locks while busy', async () => {
    getSplitCandidates.mockResolvedValueOnce(matchData({ candidates: [], suggestion: null }));
    const { unmount } = render(<SplitPicker transactionId={7} busy={false} onCancel={vi.fn()} onApply={vi.fn()} />);
    expect(await screen.findByText(/No other expense on this payment method/)).toBeInTheDocument();
    unmount();

    getSplitCandidates.mockRejectedValueOnce(new Error('Bank transaction was already ignored'));
    const failed = render(<SplitPicker transactionId={7} busy={false} onCancel={vi.fn()} onApply={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('already ignored');
    failed.unmount();

    getSplitCandidates.mockResolvedValueOnce(matchData());
    render(<SplitPicker transactionId={7} busy onCancel={vi.fn()} onApply={vi.fn()} />);
    expect(await screen.findAllByTestId('split-candidate')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Match expenses' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('shows what a reimbursed expense was charged and what it cost', async () => {
    getSplitCandidates.mockResolvedValue(matchData({ candidates: [candidate(4, 60, { amount: 20, originalCost: 60 })], suggestion: null }));
    renderPicker();

    expect(await screen.findByText(/you paid \$20\.00 after reimbursement/)).toBeInTheDocument();
  });
});

describe('SplitPicker: a charge that already has an expense', () => {
  beforeEach(() => vi.clearAllMocks());

  const completeData = (extra = {}) => ({
    mode: 'complete', row: { id: 7 }, bankAmount: 326.49, partsTotal: 244.02, remaining: 82.47, minExpenses: 1,
    parts: [big], candidates: [small, other], suggestion: [2], ...extra
  });

  it('shows what is linked, pre-selects the expense that completes it, and adds it', async () => {
    getSplitCandidates.mockResolvedValue(completeData());
    const { onApply } = renderPicker();

    const rows = await screen.findAllByTestId('split-candidate');
    expect(within(screen.getByTestId('split-linked-parts')).getByText(/Linked: Nov 20, 2026 · Brio · \$244\.02/)).toBeInTheDocument();
    expect(screen.getByText(/\$244\.02 of this \$326\.49 charge is linked to one expense/)).toBeInTheDocument();
    expect(within(rows[0]).getByRole('checkbox')).toBeChecked();
    expect(screen.getByTestId('split-total')).toHaveTextContent('Selected $82.47 of $82.47');

    fireEvent.click(screen.getByRole('button', { name: 'Add to this charge' }));
    expect(onApply).toHaveBeenCalledWith([2]);
  });

  it('allows a partial selection (more can be added later) but never more than what is left', async () => {
    getSplitCandidates.mockResolvedValue(completeData({ remaining: 132.47, partsTotal: 194.02, candidates: [small, other, candidate(5, 100)], suggestion: null }));
    renderPicker();
    const rows = await screen.findAllByTestId('split-candidate');
    const add = screen.getByRole('button', { name: 'Add to this charge' });
    expect(add).toBeDisabled();

    fireEvent.click(within(rows[1]).getByRole('checkbox'));
    expect(screen.getByTestId('split-total')).toHaveTextContent('Selected $50.00 of $132.47 · $82.47 left');
    expect(add).toBeEnabled();

    fireEvent.click(within(rows[2]).getByRole('checkbox'));
    expect(screen.getByTestId('split-total')).toHaveTextContent('$17.53 too much');
    expect(add).toBeDisabled();
  });

  it('waits for the data before enabling anything', async () => {
    let resolve;
    getSplitCandidates.mockReturnValue(new Promise(r => { resolve = r; }));
    renderPicker();

    expect(screen.getByText('Loading expenses…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Match expenses' })).toBeDisabled();
    resolve(completeData());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to this charge' })).toBeEnabled());
  });
});
