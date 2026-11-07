import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/fetchProvider', async () => {
  const actual = await vi.importActual('../../utils/fetchProvider');
  return {
    ...actual,
    getFetchFn: () => (...args) => globalThis.fetch(...args),
    authAwareFetch: (...args) => globalThis.fetch(...args)
  };
});
vi.mock('../../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn()
}));

import { render, screen, waitFor, within } from '@testing-library/react';
import ExpenseList from './ExpenseList';
import PostedTurnoverMarker, { postedDateTitle } from './PostedTurnoverMarker';
import { getPaymentMethods } from '../../services/paymentMethodApi';

global.fetch = vi.fn();

describe('posted date in the expense list', () => {
  const cards = [
    { id: 1, display_name: 'CIBC MC', type: 'credit_card', billing_cycle_day: 15, is_active: 1 },
    { id: 2, display_name: 'Visa No Cycle', type: 'credit_card', billing_cycle_day: null, is_active: 1 }
  ];
  const expense = (overrides) => ({
    id: 1, date: '2026-10-15', place: 'La Vie En Rose', notes: 'M Bra', amount: 35.54, type: 'Clothing',
    method: 'CIBC MC', payment_method_type: 'credit_card', week: 3, ...overrides
  });
  const renderList = (expenses) => render(
    <ExpenseList expenses={expenses} onExpenseDeleted={vi.fn()} onExpenseUpdated={vi.fn()} onAddExpense={vi.fn()} />
  );
  const rowOf = (place) => screen.getByText(place).closest('tr');

  beforeEach(() => {
    fetch.mockReset();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ categories: ['Clothing'] }) });
    getPaymentMethods.mockResolvedValue(cards);
  });

  it('has no green check next to the place any more', async () => {
    renderList([expense({ posted_date: '2026-10-16' })]);

    await waitFor(() => expect(getPaymentMethods).toHaveBeenCalled());
    expect(screen.queryByRole('status', { name: /posted on/i })).not.toBeInTheDocument();
    expect(document.querySelector('.posted-indicator')).toBeNull();
  });

  it('marks an expense that posts on the next statement, next to the card', async () => {
    // Made on the last day of the cycle (the 15th), posted two days later: not on this bill
    renderList([expense({ posted_date: '2026-10-17' })]);

    const marker = await screen.findByTestId('posted-turnover');
    expect(marker).toHaveTextContent('→ Oct 17');
    expect(marker.getAttribute('title')).toBe('Made Oct 15, 2026, posted Oct 17, 2026: on the statement closing Nov 15, 2026, not Oct 15, 2026');
    expect(marker.closest('td')).toContainElement(within(rowOf('La Vie En Rose')).getByText('CIBC MC'));
  });

  it('shows nothing extra when the expense posts on the same statement', async () => {
    renderList([expense({ date: '2026-10-10', posted_date: '2026-10-12' }), expense({ id: 2, place: 'No posted date', posted_date: null })]);

    await waitFor(() => expect(getPaymentMethods).toHaveBeenCalled());
    await screen.findByText('La Vie En Rose');
    expect(screen.queryByTestId('posted-turnover')).not.toBeInTheDocument();
  });

  it('shows no marker for a card without a statement close day', async () => {
    renderList([expense({ method: 'Visa No Cycle', posted_date: '2026-10-17' })]);

    await waitFor(() => expect(getPaymentMethods).toHaveBeenCalled());
    await screen.findByText('La Vie En Rose');
    expect(screen.queryByTestId('posted-turnover')).not.toBeInTheDocument();
  });

  it('puts the posted date in the pill hover, saying when it came from the bank', async () => {
    const bankLink = { status: 'matched', name: 'La Vie En Rose', rawName: 'LA VIE EN ROSE', date: '2026-10-16', amount: 35.54, pending: false };
    renderList([
      expense({ id: 1, date: '2026-10-10', posted_date: '2026-10-12', bankLink }),
      expense({ id: 2, place: 'By hand', date: '2026-10-10', posted_date: '2026-10-12' })
    ]);

    await screen.findByText('By hand');
    const bankPill = within(rowOf('La Vie En Rose')).getByText(/CIBC MC/).closest('.method-pill');
    expect(bankPill.getAttribute('title')).toBe('Confirmed by bank: La Vie En Rose\nOct 16, 2026 · $35.54\nMatched to bank transaction\nPosted Oct 12, 2026 (from the bank)');
    const handPill = within(rowOf('By hand')).getByText(/CIBC MC/).closest('.method-pill');
    expect(handPill.getAttribute('title')).toBe('Posted Oct 12, 2026');
  });
});

describe('PostedTurnoverMarker and postedDateTitle', () => {
  it('renders nothing without a later statement', () => {
    const { container } = render(<PostedTurnoverMarker expense={{ date: '2026-10-10', posted_date: '2026-10-12' }} billingCycleDay={15} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no title without a posted date', () => {
    expect(postedDateTitle({ date: '2026-10-10', posted_date: null })).toBeNull();
    expect(postedDateTitle({ date: '2026-10-10', posted_date: '2026-10-12' }, true)).toBe('Posted Oct 12, 2026 (from the bank)');
  });
});
