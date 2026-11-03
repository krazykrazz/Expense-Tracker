import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CardBankBalancePanel, { CardBankBalanceDetails } from './CardBankBalancePanel';
import { applyBankCreditLimit, getPlaidStatus, getCardBalanceChecks } from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  applyBankCreditLimit: vi.fn(),
  getPlaidStatus: vi.fn(),
  getCardBalanceChecks: vi.fn(),
  openBankImport: vi.fn(),
  PLAID_SETTINGS_CHANGED_EVENT: 'plaid-settings-changed',
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

describe('CardBankBalanceDetails', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows both balances, entries dated later, the limit and inbox rows waiting for Match', () => {
    render(<CardBankBalanceDetails check={matching} />);

    const panel = screen.getByTestId('card-bank-panel');
    expect(panel).toHaveTextContent('Matches the bank');
    expect(panel).toHaveTextContent('$2,160.40 includes pending charges');
    expect(panel).toHaveTextContent('Not counted$1,495.35 dated after today (5)');
    expect(panel).toHaveTextContent('Bank credit limit $12,000.00');
    expect(panel).toHaveTextContent('1 Inbox transaction matches an entry already in the tracker');
    expect(screen.queryByText('Likely causes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use bank limit/ })).not.toBeInTheDocument();
  });

  it('lists the likely causes of a difference and links to the Inbox', async () => {
    const { openBankImport } = await import('../../services/plaidApi');
    render(<CardBankBalanceDetails check={{
      ...matching,
      status: 'differs',
      bank: { ...matching.bank, owed: 2144.9, includesPending: false },
      difference: -15.5,
      unexplained: 4,
      causes: [
        { type: 'bank_only', transactionId: 1, date: '2026-11-01', name: 'AMAZON', amount: -15.5, inboxStatus: 'ignored', effect: -15.5 },
        { type: 'tracker_only', kind: 'payment', id: 2, date: '2026-11-02', name: 'Payment', amount: 4, effect: 4 }
      ]
    }} />);

    expect(screen.getByText('Tracker is $15.50 higher than the bank')).toBeInTheDocument();
    expect(screen.getByText(/may not include charges still pending/)).toBeInTheDocument();
    expect(screen.getByText(/Credit at the bank, ignored in the Inbox: AMAZON \$15.50 \(2026-11-01\)/)).toBeInTheDocument();
    expect(screen.getByText(/Payment in the tracker, not at the bank: \$4.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$4.00 isn't explained/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Inbox' }));
    expect(openBankImport).toHaveBeenCalledWith('inbox');
  });

  it('offers the bank limit when the card has none, then refreshes', async () => {
    applyBankCreditLimit.mockResolvedValue({ id: 4, credit_limit: 12000 });
    const onLimitChanged = vi.fn();
    render(<CardBankBalanceDetails check={{ ...matching, limit: { bank: 12000, tracker: null, utilization: 18 } }} onLimitChanged={onLimitChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Use bank limit' }));

    await waitFor(() => expect(onLimitChanged).toHaveBeenCalled());
    expect(applyBankCreditLimit).toHaveBeenCalledWith(4);
  });

  it('warns when the bank is not syncing and before a balance arrives', () => {
    render(<CardBankBalanceDetails check={{ ...matching, status: 'unknown', bank: null, difference: null, bankError: 'This bank is not syncing; its balance may be out of date.' }} />);

    expect(screen.getByText(/not syncing/)).toBeInTheDocument();
    expect(screen.getByText(/not received yet/)).toBeInTheDocument();
  });

  it('renders nothing for a card without a bank', () => {
    const { container } = render(<CardBankBalanceDetails check={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CardBankBalancePanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the check for its card', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true });
    getCardBalanceChecks.mockResolvedValue({ cards: [matching] });

    render(<CardBankBalancePanel paymentMethodId={4} />);

    expect(await screen.findByTestId('card-bank-panel')).toHaveTextContent('Matches the bank');
  });

  it('never asks for balances without Plaid', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: false });

    const { container } = render(<CardBankBalancePanel paymentMethodId={4} />);

    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalled());
    expect(getCardBalanceChecks).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
