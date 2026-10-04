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
import ExpenseList, { needsReview } from './ExpenseList';

global.fetch = vi.fn();

const expenses = [
  { id: 1, date: '2025-01-10', place: 'Grocer', amount: 100, type: 'Groceries', method: 'Cash', week: 2 },
  { id: 2, date: '2025-01-11', place: 'Netflix', amount: 20.5, type: 'Subscriptions', method: 'Cash', week: 2, is_generated: 1 },
  // Medical, no invoice, no people -> needs review
  { id: 3, date: '2025-01-12', place: 'Clinic', amount: 80, type: 'Tax - Medical', method: 'Cash', week: 2, people: [] },
  // Donation with invoice -> tax but not review
  { id: 4, date: '2025-01-13', place: 'Charity', amount: 50, type: 'Tax - Donation', method: 'Cash', week: 2, hasInvoice: true },
];

describe('needsReview', () => {
  const documented = { type: 'Tax - Medical', people: [{ id: 1, name: 'A' }], insurance_eligible: 1, claim_status: 'paid' };

  it('ignores non tax-deductible expenses', () => {
    expect(needsReview({ type: 'Groceries' }, false)).toBe(false);
  });

  it('flags medical expenses missing an invoice, a person, or with an open claim', () => {
    expect(needsReview(documented, false)).toBe(true);
    expect(needsReview({ ...documented, people: [] }, true)).toBe(true);
    expect(needsReview({ ...documented, claim_status: 'not_claimed' }, true)).toBe(true);
    expect(needsReview({ ...documented, claim_status: 'in_progress' }, true)).toBe(true);
  });

  it('clears a medical expense that is fully documented and settled', () => {
    expect(needsReview(documented, true)).toBe(false);
    expect(needsReview({ ...documented, insurance_eligible: 0, claim_status: null }, true)).toBe(false);
  });

  it('flags donations only for a missing invoice', () => {
    expect(needsReview({ type: 'Tax - Donation' }, false)).toBe(true);
    expect(needsReview({ type: 'Tax - Donation' }, true)).toBe(false);
  });
});

describe('ExpenseList - quick views and summary line', () => {
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockImplementation((url) => {
      if (url.includes('/api/categories')) {
        return Promise.resolve({ ok: true, json: async () => ({ categories: ['Groceries', 'Subscriptions'] }) });
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
    expect(within(summary).getByRole('button', { name: '1 needs review' })).toBeInTheDocument();
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

  it('includes the active quick view in the filter status message', async () => {
    renderList();
    const typeFilter = screen.getByTitle('Filter by type (current month only)');
    await within(typeFilter).findByRole('option', { name: 'Subscriptions' });
    fireEvent.change(typeFilter, { target: { value: 'Subscriptions' } });
    fireEvent.click(screen.getByRole('button', { name: /Recurring/ }));
    expect(screen.getByText('Showing 1 expense matching: Subscriptions, recurring')).toBeInTheDocument();
  });

  it('jumps to the review view from the summary line', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: '1 needs review' }));
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

  it('shows days and daily average in the summary line for a bounded date range', () => {
    render(
      <ExpenseList
        expenses={expenses}
        people={[]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
        dateRange={{ start: '2025-01-01', end: '2025-01-10' }}
      />
    );
    expect(screen.getByTestId('list-summary-range')).toHaveTextContent('10 days · $25.05/day');
  });

  it('falls back to the last page when the list shrinks (e.g. a shorter month)', () => {
    // jsdom has no scrollIntoView; page changes call it
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    try {
      const many = Array.from({ length: 30 }, (_, i) => ({
        id: 100 + i, date: '2025-03-01', place: `Shop ${i}`, amount: 1, type: 'Groceries', method: 'Cash', week: 1,
      }));
      const props = { people: [], onExpenseDeleted: vi.fn(), onExpenseUpdated: vi.fn(), onAddExpense: vi.fn() };
      const { rerender } = render(<ExpenseList expenses={many} {...props} />);
      fireEvent.change(screen.getByLabelText('Per page:'), { target: { value: '25' } });
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
      expect(screen.getByText('Shop 29')).toBeInTheDocument();

      rerender(<ExpenseList expenses={many.slice(0, 5)} {...props} />);
      expect(screen.getByText('Shop 0')).toBeInTheDocument();
      expect(screen.getByText(/Showing 1-5 of 5 expenses/)).toBeInTheDocument();
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });

  it('groups rows under one header per date with the day total and no Date column', () => {
    const sameDay = [
      { id: 10, date: '2025-02-03', place: 'Cafe', amount: 4.25, type: 'Dining Out', method: 'Cash', week: 1 },
      { id: 11, date: '2025-02-03', place: 'Bakery', amount: 10, type: 'Groceries', method: 'Cash', week: 1 },
      { id: 12, date: '2025-02-01', place: 'Hardware', amount: 30, type: 'Other', method: 'Cash', week: 1 },
    ];
    render(
      <ExpenseList
        expenses={sameDay}
        people={[]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    expect(screen.queryByRole('columnheader', { name: 'Date' })).not.toBeInTheDocument();

    const headers = screen.getAllByRole('rowheader');
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent('Feb 3, 2025');
    expect(headers[0]).toHaveTextContent('$14.25');
    expect(headers[1]).toHaveTextContent('Feb 1, 2025');
    expect(headers[1]).toHaveTextContent('$30.00');

    const firstGroup = headers[0].closest('tbody');
    expect(within(firstGroup).getByText('Cafe')).toBeInTheDocument();
    expect(within(firstGroup).getByText('Bakery')).toBeInTheDocument();
    expect(within(firstGroup).queryByText('Hardware')).not.toBeInTheDocument();
  });
});
