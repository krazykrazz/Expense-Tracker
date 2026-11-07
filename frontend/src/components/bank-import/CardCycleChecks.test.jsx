import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import CardCycleChecks from './CardCycleChecks';
import { describeCycleCause, describeCycleTotals } from './cardCycleCheck';
import { getCardCycleChecks, openBankImport } from '../../services/plaidApi';
import { useSyncEvent } from '../../hooks/useSyncEvent';

vi.mock('../../services/plaidApi', () => ({
  getCardCycleChecks: vi.fn(),
  openBankImport: vi.fn()
}));
vi.mock('../../hooks/useSyncEvent', () => ({ useSyncEvent: vi.fn() }));

const cycle = (overrides = {}) => ({
  startDate: '2026-09-16', endDate: '2026-10-15', bank: { total: 100, count: 3 }, tracker: { total: 100, count: 3 },
  difference: 0, status: 'match', matchedCount: 3, awaitingMatch: 0, causes: [], ...overrides
});

describe('CardCycleChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows each statement with the bank and tracker totals, opening only the ones that differ', async () => {
    getCardCycleChecks.mockResolvedValue({
      cycles: [
        cycle({
          startDate: '2026-09-16', endDate: '2026-10-15', bank: { total: 130, count: 4 }, difference: 30, status: 'differs',
          causes: [{ type: 'other_statement', effect: 30, name: 'SHOP', date: '2026-10-14', trackerDate: '2026-10-18', transactionId: 1 }]
        }),
        cycle({ startDate: '2026-08-16', endDate: '2026-09-15' })
      ]
    });

    render(<CardCycleChecks paymentMethodId={4} />);

    const sections = await screen.findAllByRole('group');
    expect(sections).toHaveLength(2);
    expect(sections[0]).toHaveAttribute('open');
    expect(sections[1]).not.toHaveAttribute('open');
    expect(within(sections[0]).getByText('Bank $130.00 · Tracker $100.00 · differs by $30.00')).toBeInTheDocument();
    expect(within(sections[0]).getByText(/Posted at the bank in this statement, but on another statement in the tracker \(2026-10-18\)/)).toBeInTheDocument();
    expect(within(sections[1]).getByText('Bank $100.00 · Tracker $100.00 · matches')).toBeInTheDocument();
    expect(getCardCycleChecks).toHaveBeenCalledWith(4, expect.any(Object));
  });

  it('offers the Inbox only when a cause is waiting there, and mentions entries awaiting a match', async () => {
    getCardCycleChecks.mockResolvedValue({
      cycles: [cycle({
        bank: { total: 103.5, count: 4 }, difference: 3.5, status: 'differs', awaitingMatch: 2,
        causes: [{ type: 'bank_only', effect: 3.5, name: 'ANNUAL FEE', date: '2026-10-01', status: 'new', transactionId: 7 }]
      })]
    });

    render(<CardCycleChecks paymentMethodId={4} />);

    expect(await screen.findByText(/Charge at the bank, not in the tracker yet: ANNUAL FEE \$3.50/)).toBeInTheDocument();
    expect(screen.getByText(/2 Inbox transactions match entries already in the tracker/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Inbox' }));
    expect(openBankImport).toHaveBeenCalledWith('inbox');
  });

  it('a slow earlier response never replaces a newer one', async () => {
    let resolveFirst;
    getCardCycleChecks
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ cycles: [cycle({ endDate: '2026-10-15' })] });

    render(<CardCycleChecks paymentMethodId={4} />);
    // A bank sync elsewhere reloads while the first load is still in flight
    const onSync = useSyncEvent.mock.calls.at(-1)[1];
    await act(async () => { onSync(); });
    expect(await screen.findByText('Bank $100.00 · Tracker $100.00 · matches')).toBeInTheDocument();

    await act(async () => { resolveFirst({ cycles: [] }); });
    expect(screen.getByTestId('card-cycle-checks')).toBeInTheDocument();
  });

  it('renders nothing without cycles or when the request fails', async () => {
    getCardCycleChecks.mockResolvedValueOnce({ cycles: [] });
    const { container, rerender } = render(<CardCycleChecks paymentMethodId={4} />);
    await waitFor(() => expect(getCardCycleChecks).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();

    getCardCycleChecks.mockRejectedValueOnce(new Error('boom'));
    rerender(<CardCycleChecks paymentMethodId={4} refreshKey={2} />);
    await waitFor(() => expect(getCardCycleChecks).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('describeCycleCause', () => {
  const text = (cause) => describeCycleCause({ name: 'Shop', date: '2026-10-01', ...cause });

  it.each([
    [{ type: 'bank_only', effect: 5, status: 'ignored' }, 'Charge at the bank, ignored in the Inbox: Shop $5.00 (2026-10-01)'],
    [{ type: 'bank_only', effect: -5, status: 'new' }, 'Credit at the bank, not recorded yet: Shop $5.00 (2026-10-01). Review it in the Inbox'],
    [{ type: 'tracker_only', effect: -5, kind: 'payment' }, 'Payment in the tracker, not at the bank: Shop $5.00 (2026-10-01)'],
    [{ type: 'other_statement', effect: -5, bankDate: '2026-10-16' }, 'In this statement in the tracker, but the bank posted it on 2026-10-16: Shop $5.00 (2026-10-01)'],
    [{ type: 'amount_differs', effect: 3, bankAmount: 8, trackerAmount: 5 }, 'Amount differs: Shop is $8.00 at the bank and $5.00 in the tracker (2026-10-01)'],
    [{ type: 'pending', effect: -5 }, 'Still pending at the bank, but in this statement in the tracker: Shop $5.00 (2026-10-01)'],
    [{ type: 'cancelled', effect: -5 }, 'Pending charge the bank cancelled, still an expense in the tracker: Shop $5.00 (2026-10-01). Review it in the Inbox'],
    [{ type: 'fixed_expense', effect: 5 }, "Confirmed as a fixed expense, which the card balance doesn't include: Shop $5.00 (2026-10-01)"]
  ])('describes %j', (cause, expected) => {
    expect(text(cause)).toBe(expected);
  });

  it('totals', () => {
    expect(describeCycleTotals(cycle({ difference: -22.4, status: 'differs', bank: { total: 790 }, tracker: { total: 812.4 } })))
      .toBe('Bank $790.00 · Tracker $812.40 · differs by $22.40');
  });
});
