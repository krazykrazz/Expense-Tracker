import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardBankBalanceLine, CardBankBalanceCauses, CardBankLimitAction } from './CardBankBalance';
import { applyBankCreditLimit, openBankImport } from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  applyBankCreditLimit: vi.fn(),
  openBankImport: vi.fn(),
}));

const matching = {
  paymentMethodId: 4,
  status: 'match',
  bank: { owed: 2160.4, includesPending: true, asOf: '2026-11-03T21:48:14.000Z', currency: 'CAD' },
  tracker: 2160.4,
  difference: 0,
  futureDated: { amount: 1495.35, count: 5 },
  causes: [],
  unexplained: 0,
  awaitingMatch: 1,
  splitCharges: 0,
  limit: { bank: 12000, tracker: 12000, utilization: 18 },
  bankError: null
};

const differing = {
  ...matching,
  status: 'differs',
  bank: { ...matching.bank, owed: 2144.9, includesPending: false },
  difference: -15.5,
  unexplained: 4,
  causes: [
    { type: 'bank_only', transactionId: 1, date: '2026-11-01', name: 'AMAZON', amount: -15.5, inboxStatus: 'ignored', effect: -15.5 },
    { type: 'tracker_only', kind: 'payment', id: 2, date: '2026-11-02', name: 'Payment', amount: 4, effect: 4 }
  ]
};

describe('CardBankBalanceLine', () => {
  it('shows the bank balance in green when it matches, with the details in the hover text', () => {
    render(<CardBankBalanceLine check={matching} />);

    const line = screen.getByTestId('card-bank-line');
    expect(line).toHaveTextContent('Bank $2,160.40 · matches');
    expect(line).toHaveClass('bank-pill-confirmed');
    expect(line.getAttribute('title')).toContain('Not counted: $1,495.35 dated after today (5)');
    expect(line.getAttribute('title')).toContain('1 Inbox transaction matches an entry already in the tracker');
  });

  it('is red-orange when it differs, and says when the bank leaves pending charges out', () => {
    render(<CardBankBalanceLine check={differing} />);

    const line = screen.getByTestId('card-bank-line');
    expect(line).toHaveTextContent('Bank $2,144.90 excl. pending · differs by $15.50');
    expect(line).toHaveClass('bank-pill-differs');
  });

  it('flags a bank that is not syncing, and waits for a first balance', () => {
    render(<CardBankBalanceLine check={{ ...matching, status: 'unknown', bank: null, difference: null, bankError: 'This bank is not syncing.' }} />);

    const line = screen.getByTestId('card-bank-line');
    expect(line).toHaveTextContent('Bank balance arrives with the next sync · bank not syncing');
    expect(line).toHaveClass('bank-pill-stale');
  });

  it('renders nothing for a card without a bank', () => {
    const { container } = render(<CardBankBalanceLine check={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CardBankBalanceCauses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the likely causes and what is left unexplained, and links to the Inbox', () => {
    render(<CardBankBalanceCauses check={differing} />);

    expect(screen.getByText(/Credit at the bank, ignored in the Inbox: AMAZON \$15.50 \(2026-11-01\)/)).toBeInTheDocument();
    expect(screen.getByText(/Payment in the tracker, not at the bank: \$4.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$4.00 isn't explained/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Inbox' }));
    expect(openBankImport).toHaveBeenCalledWith('inbox', { inboxView: 'ignored' });
  });

  it('takes no space when the balances match', () => {
    const { container } = render(<CardBankBalanceCauses check={matching} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('describes a cancelled pending charge, a fixed-expense charge and a credit balance', () => {
    render(<CardBankBalanceCauses check={{
      ...differing,
      unexplained: 0,
      causes: [
        { type: 'cancelled', transactionId: 3, expenseId: 9, date: '2026-11-01', name: 'HOLD', amount: 40, effect: -40 },
        { type: 'fixed_expense', transactionId: 4, date: '2026-11-02', name: 'STREAMING', amount: 18.99, effect: 18.99 },
        { type: 'credit_balance', date: '2026-11-03', name: 'Credit balance', amount: -25, effect: -25 }
      ]
    }} />);

    expect(screen.getByText(/Pending charge the bank cancelled, still an expense in the tracker: HOLD \$40.00/)).toBeInTheDocument();
    expect(screen.getByText(/Confirmed as a fixed expense, which the card balance doesn't include: STREAMING \$18.99/)).toBeInTheDocument();
    expect(screen.getByText("The card is $25.00 in credit at the bank; the tracker's balance stops at $0.00")).toBeInTheDocument();
    // A cancelled charge is reviewed in the Inbox
    expect(screen.getByRole('button', { name: 'Open Inbox' })).toBeInTheDocument();
  });
});

describe('CardBankLimitAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is hidden when the card already has the bank limit', () => {
    const { container } = render(<CardBankLimitAction check={matching} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applies a different bank limit, then refreshes', async () => {
    applyBankCreditLimit.mockResolvedValue({ id: 4, credit_limit: 15000 });
    const onLimitChanged = vi.fn();
    render(<CardBankLimitAction check={{ ...matching, limit: { bank: 15000, tracker: 12000 } }} onLimitChanged={onLimitChanged} />);

    expect(screen.getByText('Bank limit $15,000.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use bank limit' }));

    await waitFor(() => expect(onLimitChanged).toHaveBeenCalled());
    expect(applyBankCreditLimit).toHaveBeenCalledWith(4);
  });

  it('shows a failure', async () => {
    applyBankCreditLimit.mockRejectedValue(new Error('Could not save'));
    render(<CardBankLimitAction check={{ ...matching, limit: { bank: 15000, tracker: null } }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Use bank limit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  });
});
