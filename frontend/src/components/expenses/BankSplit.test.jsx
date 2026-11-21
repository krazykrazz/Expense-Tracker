import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../services/plaidApi', () => ({
  splitBankTransaction: vi.fn(),
  removeSplitExpense: vi.fn(),
  getSplitCandidates: vi.fn()
}));

import { splitBankTransaction, removeSplitExpense, getSplitCandidates } from '../../services/plaidApi';
import BankSplit from './BankSplit';

const link = (extra = {}) => ({
  bankTransactionId: 7, status: 'added', name: 'Brio', rawName: 'Brio Bodywear Inc-Ottawa - Purchase', date: '2026-11-20', amount: 326.49,
  pending: false, removed: false, disconnected: false, ...extra
});
const expense = (extra = {}) => ({ id: 1, amount: 244.02, original_cost: null, bankLink: link(), ...extra });

beforeEach(() => vi.clearAllMocks());

describe('BankSplit (Edit Expense)', () => {
  it('shows nothing for an expense without a settled bank link, or one that is the whole charge', () => {
    const none = [
      { id: 1, amount: 10, bankLink: null },
      expense({ bankLink: link({ pending: true }) }),
      expense({ bankLink: link({ removed: true }) }),
      expense({ bankLink: link({ disconnected: true }) }),
      expense({ bankLink: link({ status: 'new' }) }),
      expense({ bankLink: link({ amount: -5 }) }),
      expense({ amount: 326.49 }),
      expense({ amount: 400 })
    ];
    for (const e of none) {
      const { container, unmount } = render(<BankSplit expense={e} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    const { container } = render(<BankSplit />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says how much of the charge this expense covers and what is left, and offers to add another', () => {
    render(<BankSplit expense={expense()} />);

    expect(screen.getByTestId('bank-split-summary')).toHaveTextContent('Brio · Nov 20, 2026 · $326.49 · this expense covers $244.02; $82.47 is left');
    expect(screen.getByRole('button', { name: 'Add another expense to this charge' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from this charge' })).not.toBeInTheDocument();
  });

  it('adds the expense that completes the charge and then reports the change', async () => {
    getSplitCandidates.mockResolvedValue({
      mode: 'complete', row: { id: 7 }, bankAmount: 326.49, partsTotal: 244.02, remaining: 82.47, minExpenses: 1, parts: [],
      candidates: [{ expenseId: 2, date: '2026-11-20', place: 'Brio', notes: null, type: 'Gifts', amount: 82.47, originalCost: null, charged: 82.47 }],
      suggestion: [2]
    });
    splitBankTransaction.mockResolvedValue({ complete: true });
    const onChanged = vi.fn();
    const updated = vi.fn();
    window.addEventListener('expensesUpdated', updated);
    render(<BankSplit expense={expense()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add another expense to this charge' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add to this charge' }));

    await waitFor(() => expect(splitBankTransaction).toHaveBeenCalledWith(7, [2]));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(updated).toHaveBeenCalled();
    window.removeEventListener('expensesUpdated', updated);
  });

  it('cancelling the picker leaves everything as it was', async () => {
    getSplitCandidates.mockResolvedValue({
      mode: 'complete', row: { id: 7 }, bankAmount: 326.49, partsTotal: 244.02, remaining: 82.47, minExpenses: 1, parts: [], candidates: [], suggestion: null
    });
    render(<BankSplit expense={expense()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add another expense to this charge' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('split-picker')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add another expense to this charge' })).toBeInTheDocument();
  });

  it('a complete split says so and offers only to remove this expense from it', async () => {
    removeSplitExpense.mockResolvedValue({});
    const onChanged = vi.fn();
    render(<BankSplit expense={expense({ bankLink: link({ split: { parts: 2, total: 326.49 } }) })} onChanged={onChanged} />);

    expect(screen.getByTestId('bank-split-summary')).toHaveTextContent('split across 2 expenses ($326.49)');
    expect(screen.queryByRole('button', { name: 'Add another expense to this charge' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from this charge' }));

    await waitFor(() => expect(removeSplitExpense).toHaveBeenCalledWith(7, 1));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('an incomplete split shows what is left and both actions', () => {
    render(<BankSplit expense={expense({ bankLink: link({ split: { parts: 2, total: 294.02 } }) })} />);

    expect(screen.getByTestId('bank-split-summary')).toHaveTextContent('split across 2 expenses ($294.02, $32.47 left)');
    expect(screen.getByRole('button', { name: 'Add another expense to this charge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove from this charge' })).toBeInTheDocument();
  });

  it('shows the error and keeps the form when removing fails', async () => {
    removeSplitExpense.mockRejectedValue(new Error('That expense is not part of this bank charge'));
    const onChanged = vi.fn();
    render(<BankSplit expense={expense({ bankLink: link({ split: { parts: 2, total: 326.49 } }) })} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove from this charge' }));

    expect(await within(screen.getByTestId('bank-split')).findByRole('alert')).toHaveTextContent('not part of this bank charge');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('disables the actions while the form is saving', () => {
    render(<BankSplit expense={expense({ bankLink: link({ split: { parts: 2, total: 294.02 } }) })} disabled />);

    expect(screen.getByRole('button', { name: 'Add another expense to this charge' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove from this charge' })).toBeDisabled();
  });
});
