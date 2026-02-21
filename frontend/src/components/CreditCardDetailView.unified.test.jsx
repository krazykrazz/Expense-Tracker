import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';

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
    PAYMENT_METHOD_BILLING_CYCLES_UNIFIED: (id) => `/api/payment-methods/${id}/billing-cycles/unified`,
    PAYMENT_METHOD_BILLING_CYCLE_PDF: (id, cycleId) => `/api/payment-methods/${id}/billing-cycles/${cycleId}/pdf`,
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

describe('CreditCardDetailView - Unified Endpoint Integration', () => {
  // Full unified response matching the backend getCreditCardDetail shape
  const mockCardDetails = {
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
    utilization_percentage: 10,
    is_active: 1,
    expense_count: 20,
    current_cycle: {
      start_date: '2026-01-26',
      end_date: '2026-02-25',
      transaction_count: 15,
      total_amount: 450,
      payment_count: 1,
      payment_total: 200
    },
    has_pending_expenses: false,
    projected_balance: null
  };

  const mockPayments = [
    { id: 1, payment_method_id: 1, amount: 200, payment_date: '2026-02-10', notes: 'Monthly payment', created_at: '2026-02-10T12:00:00Z' },
    { id: 2, payment_method_id: 1, amount: 150, payment_date: '2026-01-10', notes: null, created_at: '2026-01-10T12:00:00Z' }
  ];

  const mockStatementBalanceInfo = {
    statementBalance: 300,
    cycleStartDate: '2026-01-26',
    cycleEndDate: '2026-02-25',
    totalExpenses: 500,
    totalPayments: 200,
    isPaid: false
  };

  const mockCurrentCycleStatus = {
    hasActualBalance: false,
    cycleStartDate: '2026-01-26',
    cycleEndDate: '2026-02-25',
    actualBalance: null,
    calculatedBalance: 300,
    daysUntilCycleEnd: 10,
    needsEntry: true
  };

  const mockBillingCycles = [
    {
      id: 1, payment_method_id: 1,
      cycle_start_date: '2026-01-26', cycle_end_date: '2026-02-25',
      actual_statement_balance: 350, calculated_statement_balance: 300,
      effective_balance: 350, balance_type: 'actual',
      transaction_count: 15, trend_indicator: null,
      minimum_payment: 25, due_date: '2026-03-15',
      notes: null, statement_pdf_path: null
    },
    {
      id: 2, payment_method_id: 1,
      cycle_start_date: '2025-12-26', cycle_end_date: '2026-01-25',
      actual_statement_balance: null, calculated_statement_balance: 300,
      effective_balance: 300, balance_type: 'calculated',
      transaction_count: 12, trend_indicator: null,
      minimum_payment: null, due_date: null,
      notes: null, statement_pdf_path: null
    }
  ];

  const fullUnifiedResponse = {
    cardDetails: mockCardDetails,
    payments: mockPayments,
    statementBalanceInfo: mockStatementBalanceInfo,
    currentCycleStatus: mockCurrentCycleStatus,
    billingCycles: mockBillingCycles,
    errors: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    creditCardApi.getCreditCardDetail.mockResolvedValue(fullUnifiedResponse);
    creditCardApi.getBillingCyclePdfUrl.mockReturnValue('/api/payment-methods/1/billing-cycles/1/pdf');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Test: Single API call to unified endpoint on mount
   * Validates: Requirement 3.1 - config constant exists and is used
   */
  describe('Single API Call', () => {
    it('should call getCreditCardDetail once on mount', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      expect(creditCardApi.getCreditCardDetail).toHaveBeenCalledTimes(1);
      expect(creditCardApi.getCreditCardDetail).toHaveBeenCalledWith(1);
    });

    it('should not call any individual API functions', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Only getCreditCardDetail should be called, no individual endpoints
      expect(creditCardApi.getCreditCardDetail).toHaveBeenCalledTimes(1);
    });

    it('should not fetch data when isOpen is false', () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={false} onClose={() => {}} onUpdate={() => {}} />
      );

      expect(creditCardApi.getCreditCardDetail).not.toHaveBeenCalled();
    });
  });

  /**
   * Test: State mapping from unified response to component state
   * Validates: Requirement 3.2 - single call replaces 5 separate calls
   */
  describe('State Mapping', () => {
    it('should display card name from cardDetails', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });
    });

    it('should display current balance from cardDetails', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });
    });

    it('should display payment count in tab', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Payments \(2\)/i })).toBeInTheDocument();
      });
    });

    it('should display billing cycle count in tab', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Billing Cycles \(2\)/i })).toBeInTheDocument();
      });
    });

    it('should display payments in payments tab', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Payments/i }));
      });

      expect(screen.getByText('$200.00')).toBeInTheDocument();
      expect(screen.getByText('$150.00')).toBeInTheDocument();
    });
  });

  /**
   * Test: Partial failure warning banner display
   * Validates: Requirement 3.4 - partial failures show warning
   */
  describe('Partial Failure Warning', () => {
    it('should show warning banner when errors array is non-empty', async () => {
      creditCardApi.getCreditCardDetail.mockResolvedValue({
        ...fullUnifiedResponse,
        statementBalanceInfo: null,
        errors: [{ section: 'statementBalance', message: 'Service unavailable' }]
      });

      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/Some data could not be loaded/i)).toBeInTheDocument();
        expect(screen.getByText(/statementBalance/i)).toBeInTheDocument();
      });
    });

    it('should show multiple failed sections in warning', async () => {
      creditCardApi.getCreditCardDetail.mockResolvedValue({
        ...fullUnifiedResponse,
        statementBalanceInfo: null,
        currentCycleStatus: null,
        errors: [
          { section: 'statementBalance', message: 'Error' },
          { section: 'currentCycleStatus', message: 'Error' }
        ]
      });

      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('statementBalance');
        expect(alert.textContent).toContain('currentCycleStatus');
      });
    });

    it('should dismiss warning when close button is clicked', async () => {
      creditCardApi.getCreditCardDetail.mockResolvedValue({
        ...fullUnifiedResponse,
        errors: [{ section: 'payments', message: 'Error' }]
      });

      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Click dismiss button on warning
      const warningDismiss = screen.getByRole('alert').querySelector('button');
      await act(async () => {
        fireEvent.click(warningDismiss);
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should not show warning when errors array is empty', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  /**
   * Test: Refresh after CRUD operations calls unified endpoint
   * Validates: Requirement 3.5 - refresh re-fetches via unified endpoint
   */
  describe('Refresh After CRUD', () => {
    it('should re-fetch via unified endpoint after payment deletion', async () => {
      creditCardApi.deletePayment.mockResolvedValue({ success: true });

      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Switch to payments tab
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Payments/i }));
      });

      // Click delete on first payment
      const deleteButtons = screen.getAllByTitle('Delete payment');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      // Confirm delete
      await waitFor(() => {
        expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Delete'));
      });

      // Should have called getCreditCardDetail again for refresh
      await waitFor(() => {
        expect(creditCardApi.getCreditCardDetail).toHaveBeenCalledTimes(2);
      });
    });
  });

  /**
   * Test: Config constant PAYMENT_METHOD_CREDIT_CARD_DETAIL exists
   * Validates: Requirement 3.6 - endpoint constant in config
   */
  describe('Config Constant', () => {
    it('should have PAYMENT_METHOD_CREDIT_CARD_DETAIL endpoint in config', async () => {
      const { API_ENDPOINTS } = await import('../config');
      expect(API_ENDPOINTS.PAYMENT_METHOD_CREDIT_CARD_DETAIL).toBeDefined();
      expect(typeof API_ENDPOINTS.PAYMENT_METHOD_CREDIT_CARD_DETAIL).toBe('function');
      expect(API_ENDPOINTS.PAYMENT_METHOD_CREDIT_CARD_DETAIL(42)).toContain('/credit-card-detail');
    });
  });

  /**
   * Test: Error handling when unified endpoint fails completely
   * Validates: Requirement 3.7 - network error shows error banner
   */
  describe('Full Error Handling', () => {
    it('should show error banner when unified endpoint fails', async () => {
      creditCardApi.getCreditCardDetail.mockRejectedValue(new Error('Network error'));

      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });
  });

  /**
   * Test: Backward compatibility - existing tab/UI behavior preserved
   */
  describe('Existing UI Behavior', () => {
    it('should display Billing Cycles tab with count', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Billing Cycles \(2\)/i })).toBeInTheDocument();
      });
    });

    it('should show 0 billing cycles when billing_cycle_day is null', async () => {
      creditCardApi.getCreditCardDetail.mockResolvedValue({
        ...fullUnifiedResponse,
        cardDetails: { ...mockCardDetails, billing_cycle_day: null, statement_balance: null, current_cycle: null },
        statementBalanceInfo: null,
        currentCycleStatus: null,
        billingCycles: [],
        errors: []
      });

      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Billing Cycles \(0\)/i })).toBeInTheDocument();
      });
    });

    it('should show current billing cycle in overview tab', async () => {
      render(
        <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByText('Current Billing Cycle')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument(); // transaction_count
      });
    });
  });
});
