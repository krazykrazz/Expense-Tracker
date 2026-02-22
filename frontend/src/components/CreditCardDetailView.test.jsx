/**
 * Unit tests for CreditCardDetailView deep-link behavior.
 *
 * Tests:
 * - Form submission refreshes data and stays on billing-cycles tab (Req 2.3)
 * - Form cancellation returns to billing-cycles tab (Req 2.4)
 * - Deep-link params consumed once on open
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    PAYMENT_METHOD_BY_ID: (id) => `/api/payment-methods/${id}`,
    PAYMENT_METHOD_PAYMENTS: (id) => `/api/payment-methods/${id}/payments`,
    PAYMENT_METHOD_STATEMENTS: (id) => `/api/payment-methods/${id}/statements`,
    PAYMENT_METHOD_BILLING_CYCLES: (id) => `/api/payment-methods/${id}/billing-cycles`,
    PAYMENT_METHOD_STATEMENT_BALANCE: (id) => `/api/payment-methods/${id}/statement-balance`,
    PAYMENT_METHOD_STATEMENT: (id, sid) => `/api/payment-methods/${id}/statements/${sid}`,
    PAYMENT_METHOD_BILLING_CYCLE_HISTORY: (id) => `/api/payment-methods/${id}/billing-cycles/history`,
    PAYMENT_METHOD_BILLING_CYCLE_UPDATE: (id, cid) => `/api/payment-methods/${id}/billing-cycles/${cid}`,
    PAYMENT_METHOD_BILLING_CYCLE_DELETE: (id, cid) => `/api/payment-methods/${id}/billing-cycles/${cid}`,
    PAYMENT_METHOD_BILLING_CYCLE_CURRENT: (id) => `/api/payment-methods/${id}/billing-cycles/current`,
    PAYMENT_METHOD_BILLING_CYCLES_UNIFIED: (id) => `/api/payment-methods/${id}/billing-cycles/unified`,
    PAYMENT_METHOD_BILLING_CYCLE_PDF: (id, cid) => `/api/payment-methods/${id}/billing-cycles/${cid}/pdf`,
    PAYMENT_METHOD_CREDIT_CARD_DETAIL: (id) => `/api/payment-methods/${id}/credit-card-detail`
  },
  default: 'http://localhost:2424'
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('../services/creditCardApi', () => ({
  getCreditCardDetail: vi.fn(),
  deletePayment: vi.fn(),
  deleteBillingCycle: vi.fn(),
  getBillingCyclePdfUrl: vi.fn(() => '/mock-pdf-url'),
  getCurrentCycleStatus: vi.fn()
}));

// Mock child components to capture their props and callbacks
let capturedBillingCycleFormProps = {};
let capturedPaymentFormProps = {};

vi.mock('./BillingCycleHistoryForm', () => ({
  default: (props) => {
    capturedBillingCycleFormProps = props;
    return (
      <div data-testid="billing-cycle-form">
        <div>Enter Statement Balance</div>
        <div data-testid="form-cycle-start">{props.cycleStartDate}</div>
        <div data-testid="form-cycle-end">{props.cycleEndDate}</div>
        <div data-testid="form-calculated-balance">{props.calculatedBalance}</div>
        <button data-testid="form-submit" onClick={() => props.onSubmit && props.onSubmit({})}>Submit</button>
        <button data-testid="form-cancel" onClick={() => props.onCancel && props.onCancel()}>Cancel</button>
      </div>
    );
  }
}));

vi.mock('./CreditCardPaymentForm', () => ({
  default: (props) => {
    capturedPaymentFormProps = props;
    return (
      <div data-testid="payment-form">
        <div>Log Payment</div>
        <button data-testid="payment-submit" onClick={() => props.onPaymentRecorded && props.onPaymentRecorded({})}>Record</button>
        <button data-testid="payment-cancel" onClick={() => props.onCancel && props.onCancel()}>Cancel</button>
      </div>
    );
  }
}));

vi.mock('./UnifiedBillingCycleList', () => ({
  default: () => <div data-testid="unified-billing-cycle-list">Billing Cycles List</div>
}));

import * as creditCardApi from '../services/creditCardApi';
import CreditCardDetailView from './CreditCardDetailView';

// ── Helpers ──

const makeApiResponse = (overrides = {}) => ({
  cardDetails: {
    id: 1,
    display_name: 'Test Card',
    full_name: 'Test Credit Card',
    type: 'credit_card',
    current_balance: 500,
    credit_limit: 5000,
    utilization_percentage: 10,
    billing_cycle_day: 15,
    billing_cycle_start: 15,
    billing_cycle_end: 14,
    payment_due_day: 5,
    days_until_due: 10,
    statement_balance: 400,
    is_active: 1,
    expense_count: 5,
    current_cycle: {
      start_date: '2026-01-15',
      end_date: '2026-02-14',
      transaction_count: 3,
      total_amount: 250,
      payment_count: 0,
      payment_total: 0
    },
    has_pending_expenses: false,
    projected_balance: null,
    ...overrides
  },
  payments: [],
  statementBalanceInfo: {
    statementBalance: 400,
    cycleStartDate: '2026-01-15',
    cycleEndDate: '2026-02-14',
    totalExpenses: 400,
    totalPayments: 0,
    isPaid: false
  },
  currentCycleStatus: {
    hasActualBalance: false,
    cycleStartDate: '2026-01-15',
    cycleEndDate: '2026-02-14',
    actualBalance: null,
    calculatedBalance: 400,
    daysUntilCycleEnd: 10,
    needsEntry: true
  },
  billingCycles: [],
  errors: []
});

const defaultProps = {
  paymentMethodId: 1,
  isOpen: true,
  onClose: vi.fn(),
  onUpdate: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  capturedBillingCycleFormProps = {};
  capturedPaymentFormProps = {};
  creditCardApi.getCreditCardDetail.mockResolvedValue(makeApiResponse());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CreditCardDetailView', () => {
  describe('Deep-link BillingCycleHistoryForm submission (Req 2.3)', () => {
    it('should refresh data and stay on billing-cycles tab after form submission', async () => {
      render(
        <CreditCardDetailView
          {...defaultProps}
          initialTab="billing-cycles"
          initialAction="enter-statement"
          reminderData={{ cycleStartDate: '2026-01-15', cycleEndDate: '2026-02-14', calculatedBalance: 400 }}
        />
      );

      // Wait for the billing cycle form to appear
      await waitFor(() => {
        expect(screen.getByTestId('billing-cycle-form')).toBeInTheDocument();
      });

      // Submit the form
      const callCountBefore = creditCardApi.getCreditCardDetail.mock.calls.length;
      fireEvent.click(screen.getByTestId('form-submit'));

      // Data should be refreshed (fetchData called again)
      await waitFor(() => {
        expect(creditCardApi.getCreditCardDetail.mock.calls.length).toBeGreaterThan(callCountBefore);
      });

      // After submission, form closes and we should be on billing-cycles tab
      await waitFor(() => {
        const activeTab = document.querySelector('.cc-tab.active');
        expect(activeTab).not.toBeNull();
        expect(activeTab.textContent).toMatch(/Billing Cycles/);
      });
    });
  });

  describe('Deep-link BillingCycleHistoryForm cancellation (Req 2.4)', () => {
    it('should return to billing-cycles tab without form after cancellation', async () => {
      render(
        <CreditCardDetailView
          {...defaultProps}
          initialTab="billing-cycles"
          initialAction="enter-statement"
          reminderData={{ cycleStartDate: '2026-01-15', cycleEndDate: '2026-02-14', calculatedBalance: 400 }}
        />
      );

      // Wait for the billing cycle form to appear
      await waitFor(() => {
        expect(screen.getByTestId('billing-cycle-form')).toBeInTheDocument();
      });

      // Cancel the form
      fireEvent.click(screen.getByTestId('form-cancel'));

      // Form should close, billing-cycles tab should be active
      await waitFor(() => {
        expect(screen.queryByTestId('billing-cycle-form')).not.toBeInTheDocument();
      });

      const activeTab = document.querySelector('.cc-tab.active');
      expect(activeTab).not.toBeNull();
      expect(activeTab.textContent).toMatch(/Billing Cycles/);
    });
  });

  describe('Deep-link params consumed once on open', () => {
    it('should not re-open form after closing it when deep-link was used', async () => {
      render(
        <CreditCardDetailView
          {...defaultProps}
          initialTab="billing-cycles"
          initialAction="enter-statement"
          reminderData={{ cycleStartDate: '2026-01-15', cycleEndDate: '2026-02-14', calculatedBalance: 400 }}
        />
      );

      // Wait for the billing cycle form to appear via deep-link
      await waitFor(() => {
        expect(screen.getByTestId('billing-cycle-form')).toBeInTheDocument();
      });

      // Cancel the form
      fireEvent.click(screen.getByTestId('form-cancel'));

      // Form should be closed
      await waitFor(() => {
        expect(screen.queryByTestId('billing-cycle-form')).not.toBeInTheDocument();
      });

      // The form should NOT re-open — deep-link params were consumed once
      // Wait a tick to ensure no re-render triggers the form again
      await new Promise(r => setTimeout(r, 100));
      expect(screen.queryByTestId('billing-cycle-form')).not.toBeInTheDocument();
    });

    it('should not re-open payment form after closing it when deep-link was used', async () => {
      render(
        <CreditCardDetailView
          {...defaultProps}
          initialTab="payments"
          initialAction="log-payment"
        />
      );

      // Wait for the payment form to appear via deep-link
      await waitFor(() => {
        expect(screen.getByTestId('payment-form')).toBeInTheDocument();
      });

      // Cancel the form
      fireEvent.click(screen.getByTestId('payment-cancel'));

      // Form should be closed
      await waitFor(() => {
        expect(screen.queryByTestId('payment-form')).not.toBeInTheDocument();
      });

      // Should NOT re-open
      await new Promise(r => setTimeout(r, 100));
      expect(screen.queryByTestId('payment-form')).not.toBeInTheDocument();
    });
  });

  describe('Form pre-population from reminderData (Req 2.2)', () => {
    it('should pass reminderData values to BillingCycleHistoryForm', async () => {
      const reminderData = {
        cycleStartDate: '2026-02-15',
        cycleEndDate: '2026-03-14',
        calculatedBalance: 1234.56
      };

      render(
        <CreditCardDetailView
          {...defaultProps}
          initialTab="billing-cycles"
          initialAction="enter-statement"
          reminderData={reminderData}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('billing-cycle-form')).toBeInTheDocument();
      });

      // Verify the form received the reminder data
      expect(screen.getByTestId('form-cycle-start')).toHaveTextContent('2026-02-15');
      expect(screen.getByTestId('form-cycle-end')).toHaveTextContent('2026-03-14');
      expect(screen.getByTestId('form-calculated-balance')).toHaveTextContent('1234.56');
    });
  });
});
