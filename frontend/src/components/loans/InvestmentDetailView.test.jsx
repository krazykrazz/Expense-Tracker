import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../services/investmentValueApi', () => ({
  getValueHistory: vi.fn(),
  createOrUpdateValue: vi.fn(),
  deleteValue: vi.fn()
}));
vi.mock('../../services/investmentApi', () => ({ updateInvestment: vi.fn() }));

import { getValueHistory } from '../../services/investmentValueApi';
import InvestmentDetailView from './InvestmentDetailView';
import InvestmentRow from './InvestmentRow';

const investment = { id: 1, name: 'Kevin Managed RRSP', type: 'RRSP', initial_value: 210277.16, currentValue: 192304.85 };
const link = (extra = {}) => ({
  institutionName: 'Wealthsimple', accountName: 'RRSP', mask: '3B49', accountType: 'investment', currentBalance: 186331.54567054,
  availableBalance: null, balanceCurrency: 'CAD', balanceAsOf: new Date().toISOString(), bankStatus: 'ok', bankUpdatedAt: null, ...extra
});

beforeEach(() => {
  vi.clearAllMocks();
  getValueHistory.mockResolvedValue([]);
});

describe('InvestmentDetailView bank balance (spec 4.1a)', () => {
  it('shows the bank balance and the linked icon above the entered figures, which stay as entered', async () => {
    render(<InvestmentDetailView investment={investment} isOpen onClose={() => {}} bankAccounts={[link()]} />);

    const line = await screen.findByTestId('investment-bank-balance');
    expect(line).toHaveTextContent('Bank $186,331.55');
    expect(line.querySelector('[data-testid="bank-linked-badge"]')).not.toBeNull();
    expect(screen.getByText('$192,304.85')).toBeInTheDocument();
  });

  it('shows nothing for an investment without a linked account, or whose account has no balance yet', async () => {
    const { rerender } = render(<InvestmentDetailView investment={investment} isOpen onClose={() => {}} />);
    await screen.findByText('Investment Summary');
    expect(screen.queryByTestId('investment-bank-balance')).not.toBeInTheDocument();

    rerender(<InvestmentDetailView investment={investment} isOpen onClose={() => {}} bankAccounts={[link({ currentBalance: null })]} />);
    expect(screen.queryByTestId('bank-balance')).not.toBeInTheDocument();
  });

  it('flags a balance that may be out of date', async () => {
    render(<InvestmentDetailView
      investment={investment}
      isOpen
      onClose={() => {}}
      bankAccounts={[link({ bankStatus: 'needs_login' })]}
    />);

    expect(await screen.findByTestId('bank-balance')).toHaveTextContent('(may be out of date)');
  });

  it('sums several linked accounts into one balance', async () => {
    render(<InvestmentDetailView
      investment={investment}
      isOpen
      onClose={() => {}}
      bankAccounts={[link({ currentBalance: 1000.1 }), link({ accountName: 'RRSP 2', mask: 'C649', currentBalance: 250.2 })]}
    />);

    expect(await screen.findByTestId('bank-balance')).toHaveTextContent('Bank $1,250.30');
  });
});

describe('InvestmentRow bank balance (spec 4.1a)', () => {
  it('shows the balance only when linked, keeping Current Value', () => {
    const { rerender } = render(<InvestmentRow investment={investment} bankAccounts={[link()]} />);
    expect(screen.getByTestId('bank-balance')).toHaveTextContent('Bank $186,331.55');
    expect(screen.getByText(/Current Value: \$192,304\.85/)).toBeInTheDocument();

    rerender(<InvestmentRow investment={investment} />);
    expect(screen.queryByTestId('bank-balance')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bank-linked-badge')).not.toBeInTheDocument();
  });

  it('says in the badge that only the balance comes from the bank', () => {
    render(<InvestmentRow investment={investment} bankAccounts={[link()]} />);

    const badge = screen.getByTestId('bank-linked-badge');
    expect(badge.getAttribute('title')).toContain('Wealthsimple · RRSP ••3B49');
    expect(badge.getAttribute('title')).not.toContain('Transactions are imported');
  });
});
