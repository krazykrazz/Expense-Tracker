import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    PAYMENT_METHOD_BY_ID: (id) => `/api/payment-methods/${id}`,
    PAYMENT_METHOD_PAYMENTS: (id) => `/api/payment-methods/${id}/payments`,
    PAYMENT_METHOD_STATEMENTS: (id) => `/api/payment-methods/${id}/statements`,
    PAYMENT_METHOD_BILLING_CYCLES: (id) => `/api/payment-methods/${id}/billing-cycles`,
    PAYMENT_METHOD_STATEMENT_BALANCE: (id) => `/api/payment-methods/${id}/statement-balance`,
    PAYMENT_METHOD_STATEMENT: (id, statementId) => `/api/payment-methods/${id}/statements/${statementId}`,
    PAYMENT_METHOD_BILLING_CYCLE_HISTORY: (id) => `/api/payment-methods/${id}/billing-cycles/history`,
    PAYMENT_METHOD_BILLING_CYCLE_UPDATE: (id, cycleId) => `/api/payment-methods/${id}/billing-cycles/${cycleId}`,
    PAYMENT_METHOD_BILLING_CYCLE_DELETE: (id, cycleId) => `/api/payment-methods/${id}/billing-cycles/${cycleId}`,
    PAYMENT_METHOD_BILLING_CYCLE_CURRENT: (id) => `/api/payment-methods/${id}/billing-cycles/current`,
    PAYMENT_METHOD_CREDIT_CARD_DETAIL: (id) => `/api/payment-methods/${id}/credit-card-detail`
  },
  default: 'http://localhost:2424'
}));

// Mock the API services
vi.mock('../services/creditCardApi', () => ({
  getCreditCardDetail: vi.fn(),
  deletePayment: vi.fn(),
  deleteBillingCycle: vi.fn(),
  getBillingCyclePdfUrl: vi.fn()
}));

import * as creditCardApi from '../services/creditCardApi';
import CreditCardDetailView from './CreditCardDetailView';

describe('CreditCardDetailView - Statement Balance Display', () => {
  const mockCreditCard = {
    id: 1,
    type: 'credit_card',
    display_name: 'Test Card',
    full_name: 'Test Credit Card',
    current_balance: 500,
    statement_balance: 300,
    credit_limit: 5000,
    payment_due_day: 15,
    billing_cycle_day: 25,
    billing_cycle_start: 26,
    billing_cycle_end: 25,
    is_active: 1
  };

  const mockStatementBalanceInfo = {
    statementBalance: 300,
    cycleStartDate: '2026-01-26',
    cycleEndDate: '2026-02-25',
    totalExpenses: 500,
    totalPayments: 200,
    isPaid: false
  };

  const mockStatementBalancePaid = {
    statementBalance: 0,
    cycleStartDate: '2026-01-26',
    cycleEndDate: '2026-02-25',
    totalExpenses: 500,
    totalPayments: 500,
    isPaid: true
  };

  // Helper to build unified response
  const buildUnifiedResponse = (overrides = {}) => ({
    cardDetails: overrides.cardDetails || mockCreditCard,
    payments: overrides.payments || [],
    statementBalanceInfo: overrides.statementBalanceInfo !== undefined ? overrides.statementBalanceInfo : mockStatementBalanceInfo,
    currentCycleStatus: overrides.currentCycleStatus !== undefined ? overrides.currentCycleStatus : {
      hasActualBalance: false,
      cycleStartDate: '2026-01-26',
      cycleEndDate: '2026-02-25',
      actualBalance: null,
      calculatedBalance: 300,
      daysUntilCycleEnd: 10,
      needsEntry: true
    },
    billingCycles: overrides.billingCycles || [],
    errors: overrides.errors || []
  });

  beforeEach(() => {
    vi.clearAllMocks();
    creditCardApi.getCreditCardDetail.mockResolvedValue(buildUnifiedResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test statement balance rendering
   * Requirements: 7.1
   */
  it('should display calculated statement balance alongside current balance', async () => {
    render(
      <CreditCardDetailView
        paymentMethodId={1}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Check that both current balance and statement balance are displayed
    expect(screen.getByText('Current Balance')).toBeInTheDocument();
    expect(screen.getByText('Statement Balance')).toBeInTheDocument();
    
    // Check the values are displayed (formatted as currency)
    expect(screen.getByText('$500.00')).toBeInTheDocument(); // Current balance
    expect(screen.getByText('$300.00')).toBeInTheDocument(); // Statement balance
  });

  /**
   * Test "Statement Paid" indicator display when balance <= 0
   * Requirements: 7.2
   */
  it('should show "Statement Paid" indicator when statement balance is zero', async () => {
    creditCardApi.getCreditCardDetail.mockResolvedValue(buildUnifiedResponse({
      statementBalanceInfo: mockStatementBalancePaid,
      currentCycleStatus: {
        hasActualBalance: false,
        cycleStartDate: '2026-01-26',
        cycleEndDate: '2026-02-25',
        actualBalance: null,
        calculatedBalance: 0,
        daysUntilCycleEnd: 10,
        needsEntry: false
      }
    }));

    render(
      <CreditCardDetailView
        paymentMethodId={1}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Check for paid indicator
    await waitFor(() => {
      expect(screen.getByText('✓ Paid')).toBeInTheDocument();
    });

    // Check for "Statement paid in full" description
    expect(screen.getByText('Statement paid in full')).toBeInTheDocument();
  });

  /**
   * Test amount due display when statement balance > 0
   * Requirements: 7.3
   */
  it('should show remaining amount due with due date when balance > 0', async () => {
    render(
      <CreditCardDetailView
        paymentMethodId={1}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Check that statement balance is displayed
    await waitFor(() => {
      expect(screen.getByText('$300.00')).toBeInTheDocument();
    });

    // Check for due date info
    expect(screen.getByText(/Due by day 15/i)).toBeInTheDocument();
  });

  /**
   * Test billing cycle dates display
   * Requirements: 7.5
   */
  it('should display billing cycle dates for the statement period', async () => {
    render(
      <CreditCardDetailView
        paymentMethodId={1}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Check for statement period dates
    await waitFor(() => {
      expect(screen.getByText(/Statement period:/i)).toBeInTheDocument();
    });
  });

  /**
   * Test statement balance card has correct styling when paid
   * Requirements: 7.2
   */
  it('should apply paid styling to statement balance card when paid', async () => {
    creditCardApi.getCreditCardDetail.mockResolvedValue(buildUnifiedResponse({
      statementBalanceInfo: mockStatementBalancePaid,
      currentCycleStatus: {
        hasActualBalance: false,
        cycleStartDate: '2026-01-26',
        cycleEndDate: '2026-02-25',
        actualBalance: null,
        calculatedBalance: 0,
        daysUntilCycleEnd: 10,
        needsEntry: false
      }
    }));

    const { container } = render(
      <CreditCardDetailView
        paymentMethodId={1}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Wait for statement balance to load
    await waitFor(() => {
      expect(screen.getByText('✓ Paid')).toBeInTheDocument();
    });

    // Check that the statement-paid class is applied
    const statementCard = container.querySelector('.statement-balance-card.statement-paid');
    expect(statementCard).toBeInTheDocument();
  });

  /**
   * Test statement balance not shown when billing_cycle_day not configured
   * Requirements: 7.1
   */
  it('should handle credit card without billing_cycle_day configured', async () => {
    const cardWithoutBillingCycle = {
      ...mockCreditCard,
      billing_cycle_day: null,
      statement_balance: null
    };
    
    creditCardApi.getCreditCardDetail.mockResolvedValue(buildUnifiedResponse({
      cardDetails: cardWithoutBillingCycle,
      statementBalanceInfo: null,
      currentCycleStatus: null,
      billingCycles: []
    }));

    render(
      <CreditCardDetailView
        paymentMethodId={1}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Current balance should still be shown
    expect(screen.getByText('Current Balance')).toBeInTheDocument();
    
    // Statement balance card should not be shown when statement_balance is null
    expect(screen.queryByText('Statement Balance')).not.toBeInTheDocument();
  });

  /**
   * Test statement balance shows $0.00 when paid
   * Requirements: 7.2
   */
  it('should display $0.00 for statement balance when paid', async () => {
    creditCardApi.getCreditCardDetail.mockResolvedValue(buildUnifiedResponse({
      statementBalanceInfo: mockStatementBalancePaid,
      currentCycleStatus: {
        hasActualBalance: false,
        cycleStartDate: '2026-01-26',
        cycleEndDate: '2026-02-25',
        actualBalance: null,
        calculatedBalance: 0,
        daysUntilCycleEnd: 10,
        needsEntry: false
      }
    }));

    render(
      <CreditCardDetailView
        paymentMethodId={1}
        isOpen={true}
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Wait for statement balance to load and show $0.00
    await waitFor(() => {
      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });
  });
});
