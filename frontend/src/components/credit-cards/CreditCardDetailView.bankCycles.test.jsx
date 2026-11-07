/**
 * The statement bank check on a card's Billing Cycles tab appears only for cards linked to a bank account.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));
vi.mock('../../services/creditCardApi', () => ({
  getCreditCardDetail: vi.fn(),
  deletePayment: vi.fn(),
  deleteBillingCycle: vi.fn(),
  getBillingCyclePdfUrl: vi.fn()
}));
vi.mock('../../services/paymentMethodApi', () => ({ setPaymentMethodActive: vi.fn() }));
vi.mock('./UnifiedBillingCycleList', () => ({ default: () => <div data-testid="unified-billing-cycle-list" /> }));
vi.mock('../bank-import/CardCycleChecks', () => ({
  default: ({ paymentMethodId }) => <div data-testid="card-cycle-checks">cycles for {paymentMethodId}</div>
}));
vi.mock('../../hooks/useCardBalanceChecks', () => ({ useCardBalanceChecks: vi.fn() }));

import * as creditCardApi from '../../services/creditCardApi';
import { useCardBalanceChecks } from '../../hooks/useCardBalanceChecks';
import CreditCardDetailView from './CreditCardDetailView';

const detail = (billingCycleDay) => ({
  cardDetails: {
    id: 1, display_name: 'Test Card', full_name: 'Test Credit Card', type: 'credit_card', current_balance: 500, credit_limit: 5000,
    utilization_percentage: 10, billing_cycle_day: billingCycleDay, payment_due_day: 5, is_active: 1, expense_count: 1
  },
  payments: [], statementBalanceInfo: null, currentCycleStatus: null, billingCycles: [], errors: []
});

const renderView = () => render(
  <CreditCardDetailView paymentMethodId={1} isOpen onClose={vi.fn()} onUpdate={vi.fn()} initialTab="billing-cycles" />
);

describe('CreditCardDetailView statement bank check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    creditCardApi.getCreditCardDetail.mockResolvedValue(detail(15));
  });

  it('shows the check under the billing cycles for a card linked to a bank', async () => {
    useCardBalanceChecks.mockReturnValue(new Map([[1, { paymentMethodId: 1, status: 'match' }]]));

    renderView();

    expect(await screen.findByTestId('card-cycle-checks')).toHaveTextContent('cycles for 1');
  });

  it('shows nothing for a card without a bank link', async () => {
    useCardBalanceChecks.mockReturnValue(new Map());

    renderView();

    await screen.findByTestId('unified-billing-cycle-list');
    await waitFor(() => expect(creditCardApi.getCreditCardDetail).toHaveBeenCalled());
    expect(screen.queryByTestId('card-cycle-checks')).not.toBeInTheDocument();
  });
});
