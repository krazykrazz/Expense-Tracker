import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/fetchProvider', async () => {
  const actual = await vi.importActual('../../utils/fetchProvider');
  return {
    ...actual,
    getFetchFn: () => (...args) => globalThis.fetch(...args),
    authAwareFetch: (...args) => globalThis.fetch(...args),
  };
});

import { render, screen, fireEvent, within } from '@testing-library/react';
import ExpenseList, { getReviewReasons } from './ExpenseList';

global.fetch = vi.fn();

const expenses = [
  { id: 1, date: '2025-01-10', place: 'Grocer', amount: 100, type: 'Groceries', method: 'Cash', week: 2 },
  { id: 2, date: '2025-01-11', place: 'Netflix', amount: 20.5, type: 'Subscriptions', method: 'Cash', week: 2, is_generated: 1 },
  // Medical, no invoice, no people -> needs review
  { id: 3, date: '2025-01-12', place: 'Clinic', amount: 80, type: 'Tax - Medical', method: 'Cash', week: 2, people: [] },
  // Donation with invoice -> tax but not review
  { id: 4, date: '2025-01-13', place: 'Charity', amount: 50, type: 'Tax - Donation', method: 'Cash', week: 2, hasInvoice: true },
];

describe('getReviewReasons', () => {
  it('ignores non tax-deductible expenses', () => {
    expect(getReviewReasons({ type: 'Groceries' }, false)).toEqual([]);
  });

  it('flags medical expenses missing invoice, people, or with a pending claim', () => {
    const expense = { type: 'Tax - Medical', people: [], insurance_eligible: 1, claim_status: 'in_progress' };
    expect(getReviewReasons(expense, false)).toEqual(['No invoice', 'Unassigned', 'Claim pending']);
  });

  it('clears a medical expense that is fully documented and settled', () => {
    const expense = { type: 'Tax - Medical', people: [{ id: 1, name: 'A' }], insurance_eligible: 1, claim_status: 'paid' };
    expect(getReviewReasons(expense, true)).toEqual([]);
  });

  it('flags donations only for a missing invoice', () => {
    expect(getReviewReasons({ type: 'Tax - Donation' }, false)).toEqual(['No invoice']);
    expect(getReviewReasons({ type: 'Tax - Donation' }, true)).toEqual([]);
  });
});

describe('ExpenseList - quick views and summary line', () => {
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockImplementation((url) => {
      if (url.includes('/api/categories')) {
        return Promise.resolve({ ok: true, json: async () => ({ categories: ['Groceries'] }) });
      }
      if (url.includes('/api/payment-methods')) {
        return Promise.resolve({ ok: true, json: async () => ({ paymentMethods: [] }) });
      }
      if (url.includes('/api/invoices')) {
        return Promise.resolve({ ok: true, json: async () => ([]) });
      }
      return Promise.resolve({ ok: true, json: async () => ([]) });
    });
  });

  const renderList = () =>
    render(
      <ExpenseList
        expenses={expenses}
        people={[]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

  it('shows count, total and review count for the full list', () => {
    renderList();
    const summary = screen.getByTestId('list-summary-line');
    expect(summary).toHaveTextContent('4 expenses');
    expect(summary).toHaveTextContent('$250.50');
    expect(within(summary).getByRole('button', { name: '1 need review' })).toBeInTheDocument();
  });

  it('filters to items needing review', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /Needs review/ }));

    expect(screen.getByText('Clinic')).toBeInTheDocument();
    expect(screen.queryByText('Grocer')).not.toBeInTheDocument();
    expect(screen.queryByText('Charity')).not.toBeInTheDocument();
    expect(screen.getByTestId('list-summary-line')).toHaveTextContent('1 expense');
  });

  it('filters to tax-deductible and recurring expenses', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /Tax-deductible/ }));
    expect(screen.getByText('Clinic')).toBeInTheDocument();
    expect(screen.getByText('Charity')).toBeInTheDocument();
    expect(screen.queryByText('Grocer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Recurring/ }));
    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.queryByText('Clinic')).not.toBeInTheDocument();
  });

  it('jumps to the review view from the summary line', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: '1 need review' }));
    expect(screen.getByRole('button', { name: /Needs review/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an all-clear message when nothing needs review', () => {
    render(
      <ExpenseList
        expenses={expenses.filter(e => e.id !== 3)}
        people={[]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs review/ }));
    expect(screen.getByText(/Nothing needs review/)).toBeInTheDocument();
  });
});
