import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import fc from 'fast-check';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    PAYMENT_METHOD_BY_ID: (id) => `/api/payment-methods/${id}`,
    PAYMENT_METHOD_PAYMENTS: (id) => `/api/payment-methods/${id}/payments`,
    PAYMENT_METHOD_STATEMENTS: (id) => `/api/payment-methods/${id}/statements`,
    PAYMENT_METHOD_BILLING_CYCLES: (id) => `/api/payment-methods/${id}/billing-cycles`,
    PAYMENT_METHOD_STATEMENT_BALANCE: (id) => `/api/payment-methods/${id}/statement-balance`,
    PAYMENT_METHOD_STATEMENT: (id, statementId) => `/api/payment-methods/${id}/statements/${statementId}`,
    PAYMENT_METHOD_BILLING_CYCLE_CREATE: (id) => `/api/payment-methods/${id}/billing-cycles`,
    PAYMENT_METHOD_BILLING_CYCLE_HISTORY: (id) => `/api/payment-methods/${id}/billing-cycles/history`,
    PAYMENT_METHOD_BILLING_CYCLE_UPDATE: (id, cycleId) => `/api/payment-methods/${id}/billing-cycles/${cycleId}`,
    PAYMENT_METHOD_BILLING_CYCLE_DELETE: (id, cycleId) => `/api/payment-methods/${id}/billing-cycles/${cycleId}`,
    PAYMENT_METHOD_BILLING_CYCLE_CURRENT: (id) => `/api/payment-methods/${id}/billing-cycles/current`
  },
  default: 'http://localhost:2424'
}));

// Mock the API services
vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethod: vi.fn()
}));

vi.mock('../services/creditCardApi', () => ({
  getPayments: vi.fn(),
  getStatements: vi.fn(),
  getBillingCycles: vi.fn(),
  getStatementBalance: vi.fn(),
  getBillingCycleHistory: vi.fn(),
  getCurrentCycleStatus: vi.fn(),
  deleteBillingCycle: vi.fn(),
  deletePayment: vi.fn(),
  deleteStatement: vi.fn(),
  getStatementUrl: vi.fn()
}));

import * as paymentMethodApi from '../services/paymentMethodApi';
import * as creditCardApi from '../services/creditCardApi';
import CreditCardDetailView from './CreditCardDetailView';

describe('CreditCardDetailView - Billing Cycle Integration', () => {
  // Base mock credit card with billing_cycle_day configured
  const mockCreditCardWithBillingCycle = {
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

  // Credit card without billing_cycle_day
  const mockCreditCardWithoutBillingCycle = {
    ...mockCreditCardWithBillingCycle,
    billing_cycle_day: null,
    statement_balance: null
  };

  // Mock statement balance info (calculated)
  const mockStatementBalanceCalculated = {
    statementBalance: 300,
    cycleStartDate: '2026-01-26',
    cycleEndDate: '2026-02-25',
    totalExpenses: 500,
    totalPayments: 200,
    isPaid: false
  };

  // Mock current cycle status without actual balance
  const mockCycleStatusNoActual = {
    hasActualBalance: false,
    cycleStartDate: '2026-01-26',
    cycleEndDate: '2026-02-25',
    actualBalance: null,
    calculatedBalance: 300,
    daysUntilCycleEnd: 10,
    needsEntry: true
  };

  // Mock current cycle status with actual balance
  const mockCycleStatusWithActual = {
    hasActualBalance: true,
    cycleStartDate: '2026-01-26',
    cycleEndDate: '2026-02-25',
    actualBalance: 350,
    calculatedBalance: 300,
    daysUntilCycleEnd: 10,
    needsEntry: false
  };

  // Mock billing cycle history
  const mockBillingCycleHistory = {
    billingCycles: [
      {
        id: 1,
        cycle_start_date: '2026-01-26',
        cycle_end_date: '2026-02-25',
        actual_statement_balance: 350,
        calculated_statement_balance: 300,
        minimum_payment: 25,
        due_date: '2026-03-15',
        notes: 'Test note',
        discrepancy: {
          amount: 50,
          type: 'higher',
          description: 'Actual is $50.00 higher than tracked'
        }
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    paymentMethodApi.getPaymentMethod.mockResolvedValue(mockCreditCardWithBillingCycle);
    creditCardApi.getPayments.mockResolvedValue([]);
    creditCardApi.getStatements.mockResolvedValue([]);
    creditCardApi.getBillingCycles.mockResolvedValue([]);
    creditCardApi.getStatementBalance.mockResolvedValue(mockStatementBalanceCalculated);
    creditCardApi.getBillingCycleHistory.mockResolvedValue({ billingCycles: [] });
    creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusNoActual);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Test: Section visibility based on billing_cycle_day
   * **Validates: Requirements 5.1**
   */
  describe('Section Visibility Based on billing_cycle_day', () => {
    it('should show billing cycle history section when billing_cycle_day is configured', async () => {
      creditCardApi.getBillingCycleHistory.mockResolvedValue(mockBillingCycleHistory);
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusWithActual);

      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Should show the Billing tab
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Billing/i })).toBeInTheDocument();
      });
    });

    it('should NOT show billing cycle history section when billing_cycle_day is NOT configured', async () => {
      paymentMethodApi.getPaymentMethod.mockResolvedValue(mockCreditCardWithoutBillingCycle);
      creditCardApi.getStatementBalance.mockResolvedValue(null);
      creditCardApi.getBillingCycleHistory.mockResolvedValue({ billingCycles: [] });
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(null);

      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Should NOT show the Billing tab
      expect(screen.queryByRole('button', { name: /Billing/i })).not.toBeInTheDocument();
    });

    it('should show "Enter Statement" button when billing_cycle_day is configured', async () => {
      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Should show the Enter Statement button
      expect(screen.getByRole('button', { name: /Enter Statement/i })).toBeInTheDocument();
    });

    it('should NOT show "Enter Statement" button when billing_cycle_day is NOT configured', async () => {
      paymentMethodApi.getPaymentMethod.mockResolvedValue(mockCreditCardWithoutBillingCycle);
      creditCardApi.getStatementBalance.mockResolvedValue(null);

      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Should NOT show the Enter Statement button
      expect(screen.queryByRole('button', { name: /Enter Statement/i })).not.toBeInTheDocument();
    });
  });

  /**
   * Property 9: Statement Balance Display Priority
   * *For any* credit card with billing_cycle_day configured:
   * - If a billing cycle record exists for the current period, the displayed statement balance SHALL be the actual_statement_balance
   * - If no billing cycle record exists, the displayed statement balance SHALL be the calculated statement balance
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  describe('Property 9: Statement Balance Display Priority', () => {
    it('should display actual_statement_balance when billing cycle record exists', async () => {
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusWithActual);
      creditCardApi.getBillingCycleHistory.mockResolvedValue(mockBillingCycleHistory);

      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Should display the actual balance ($350) instead of calculated ($300)
      await waitFor(() => {
        expect(screen.getByText('$350.00')).toBeInTheDocument();
      });

      // Should show "Actual" badge
      expect(screen.getByText('Actual')).toBeInTheDocument();
    });

    it('should display calculated statement balance when no billing cycle record exists', async () => {
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusNoActual);
      creditCardApi.getBillingCycleHistory.mockResolvedValue({ billingCycles: [] });

      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Should display the calculated balance ($300)
      await waitFor(() => {
        expect(screen.getByText('$300.00')).toBeInTheDocument();
      });

      // Should show "Calculated" badge
      expect(screen.getByText('Calculated')).toBeInTheDocument();
    });

    it('should show "From your statement" description when actual balance is displayed', async () => {
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusWithActual);
      creditCardApi.getBillingCycleHistory.mockResolvedValue(mockBillingCycleHistory);

      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Should show "From your statement" description
      await waitFor(() => {
        expect(screen.getByText('From your statement')).toBeInTheDocument();
      });
    });

    /**
     * Property-based test: Statement balance display priority
     * For any valid actual and calculated balance combination,
     * the display should prioritize actual when available
     */
    it('PBT: should always prioritize actual balance over calculated when available', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: 0, max: 10000, noNaN: true }),
          fc.float({ min: 0, max: 10000, noNaN: true }),
          async (actualBalance, calculatedBalance) => {
            // Round to 2 decimal places
            const roundedActual = Math.round(actualBalance * 100) / 100;
            const roundedCalculated = Math.round(calculatedBalance * 100) / 100;

            const cycleStatusWithActual = {
              hasActualBalance: true,
              cycleStartDate: '2026-01-26',
              cycleEndDate: '2026-02-25',
              actualBalance: roundedActual,
              calculatedBalance: roundedCalculated,
              daysUntilCycleEnd: 10,
              needsEntry: false
            };

            vi.clearAllMocks();
            paymentMethodApi.getPaymentMethod.mockResolvedValue(mockCreditCardWithBillingCycle);
            creditCardApi.getPayments.mockResolvedValue([]);
            creditCardApi.getStatements.mockResolvedValue([]);
            creditCardApi.getBillingCycles.mockResolvedValue([]);
            creditCardApi.getStatementBalance.mockResolvedValue({
              ...mockStatementBalanceCalculated,
              statementBalance: roundedCalculated
            });
            creditCardApi.getBillingCycleHistory.mockResolvedValue({ billingCycles: [] });
            creditCardApi.getCurrentCycleStatus.mockResolvedValue(cycleStatusWithActual);

            cleanup();
            const { container } = render(
              <CreditCardDetailView
                paymentMethodId={1}
                isOpen={true}
                onClose={() => {}}
                onUpdate={() => {}}
              />
            );

            await waitFor(() => {
              expect(screen.getByText('Test Card')).toBeInTheDocument();
            });

            // When actual balance is available, it should be displayed
            await waitFor(() => {
              const formattedActual = new Intl.NumberFormat('en-CA', {
                style: 'currency',
                currency: 'CAD'
              }).format(roundedActual);
              
              // The actual balance should be displayed in the statement balance card
              const statementCard = container.querySelector('.statement-balance-card');
              if (statementCard) {
                expect(statementCard.textContent).toContain(formattedActual);
              }
            });

            cleanup();
          }
        ),
        { numRuns: 20 } // Reduced runs for faster test execution
      );
    });
  });

  /**
   * Test: Indicator for user-provided vs calculated balance
   * **Validates: Requirements 7.3**
   */
  describe('Balance Source Indicator', () => {
    it('should show "Actual" badge when actual balance is provided', async () => {
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusWithActual);

      const { container } = render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      await waitFor(() => {
        const actualBadge = container.querySelector('.actual-badge');
        expect(actualBadge).toBeTruthy();
        expect(actualBadge.textContent).toBe('Actual');
      });
    });

    it('should show "Calculated" badge when no actual balance exists', async () => {
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusNoActual);

      const { container } = render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      await waitFor(() => {
        const calculatedBadge = container.querySelector('.calculated-badge');
        expect(calculatedBadge).toBeTruthy();
        expect(calculatedBadge.textContent).toBe('Calculated');
      });
    });

    it('should apply has-actual-balance class to statement card when actual balance exists', async () => {
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusWithActual);

      const { container } = render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      await waitFor(() => {
        const statementCard = container.querySelector('.statement-balance-card.has-actual-balance');
        expect(statementCard).toBeTruthy();
      });
    });
  });

  /**
   * Test: Billing Cycle History Tab
   */
  describe('Billing Cycle History Tab', () => {
    it('should display billing cycle history in the Billing tab', async () => {
      creditCardApi.getBillingCycleHistory.mockResolvedValue(mockBillingCycleHistory);
      creditCardApi.getCurrentCycleStatus.mockResolvedValue(mockCycleStatusWithActual);

      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Click on Billing tab
      const billingTab = screen.getByRole('button', { name: /Billing/i });
      await act(async () => {
        fireEvent.click(billingTab);
      });

      // Should show billing cycle history content
      await waitFor(() => {
        expect(screen.getByText('Statement Balance History')).toBeInTheDocument();
      });
    });

    it('should show "Add Entry" button in billing history tab', async () => {
      creditCardApi.getBillingCycleHistory.mockResolvedValue({ billingCycles: [] });

      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Click on Billing tab
      const billingTab = screen.getByRole('button', { name: /Billing/i });
      await act(async () => {
        fireEvent.click(billingTab);
      });

      // Should show Add Entry button
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Entry/i })).toBeInTheDocument();
      });
    });
  });

  /**
   * Test: Billing Cycle Form Integration
   */
  describe('Billing Cycle Form Integration', () => {
    it('should open billing cycle form when "Enter Statement" button is clicked', async () => {
      render(
        <CreditCardDetailView
          paymentMethodId={1}
          isOpen={true}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Card')).toBeInTheDocument();
      });

      // Click Enter Statement button
      const enterStatementBtn = screen.getByRole('button', { name: /Enter Statement/i });
      await act(async () => {
        fireEvent.click(enterStatementBtn);
      });

      // Should show the billing cycle form
      await waitFor(() => {
        expect(screen.getByText('Enter Statement Balance')).toBeInTheDocument();
      });
    });
  });
});
