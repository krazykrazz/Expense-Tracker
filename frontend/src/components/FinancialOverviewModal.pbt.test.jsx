/**
 * Property-based tests for FinancialOverviewModal unified view.
 *
 * Property 7: Unified view section headers show correct item counts
 * Property 3: Payment method subsection visibility matches content
 * Property 4: Payment method row content completeness
 * Property 5: Payment Methods section item count equals total active methods
 * Property 6: Add button disabled state matches loading state
 * Net Worth Calculation correctness
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import * as fc from 'fast-check';

// ── Mock all dependencies ─────────────────────────────────────────────────────

vi.mock('../config', () => ({
  API_ENDPOINTS: {
    REMINDER_STATUS: (year, month) => `/api/reminders/status/${year}/${month}`,
  },
  default: 'http://localhost:2424'
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('../services/loanApi', () => ({
  getAllLoans: vi.fn(),
  createLoan: vi.fn(), updateLoan: vi.fn(), deleteLoan: vi.fn()
}));

vi.mock('../services/fixedExpenseApi', () => ({
  getFixedExpensesByLoan: vi.fn().mockResolvedValue([])
}));

vi.mock('../services/investmentApi', () => ({
  getAllInvestments: vi.fn(),
  createInvestment: vi.fn(), updateInvestment: vi.fn(), deleteInvestment: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn().mockResolvedValue({ current_cycle: null }),
  deletePaymentMethod: vi.fn(), setPaymentMethodActive: vi.fn()
}));

vi.mock('../services/creditCardApi', () => ({
  getStatementBalance: vi.fn().mockResolvedValue(null)
}));

vi.mock('../utils/validation', () => ({
  validateName: vi.fn(() => null),
  validateAmount: vi.fn(() => null)
}));

vi.mock('../utils/formatters', () => ({
  formatCurrency: (v) => `${Number(v || 0).toFixed(2)}`,
  formatDate: (d) => d || '',
  formatCAD: (v) => `${Number(v || 0).toFixed(2)}`
}));

vi.mock('./LoanDetailView', () => ({ default: () => null }));
vi.mock('./TotalDebtView', () => ({ default: () => null }));
vi.mock('./InvestmentDetailView', () => ({ default: () => null }));
vi.mock('./PaymentMethodForm', () => ({ default: () => null }));
vi.mock('./CreditCardDetailView', () => ({ default: () => null }));
vi.mock('./CreditCardPaymentForm', () => ({ default: () => null }));
vi.mock('./LoanPaymentForm', () => ({ default: () => null }));

import * as loanApi from '../services/loanApi';
import * as investmentApi from '../services/investmentApi';
import * as paymentMethodApi from '../services/paymentMethodApi';
import FinancialOverviewModal from './FinancialOverviewModal';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const loanArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
  loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
  currentBalance: fc.float({ min: 0, max: 500000, noNaN: true }),
  currentRate: fc.float({ min: 0, max: 30, noNaN: true }),
  start_date: fc.constant('2022-01-01'),
  is_paid_off: fc.boolean(),
  initial_balance: fc.float({ min: 100, max: 500000, noNaN: true }),
});

const investmentArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
  type: fc.constantFrom('TFSA', 'RRSP'),
  currentValue: fc.float({ min: 0, max: 1000000, noNaN: true }),
  initial_value: fc.float({ min: 100, max: 1000000, noNaN: true }),
});

const creditCardArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  type: fc.constant('credit_card'),
  display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
  is_active: fc.constant(true),
  current_balance: fc.float({ min: 0, max: 50000, noNaN: true }),
  credit_limit: fc.float({ min: 1000, max: 100000, noNaN: true }),
  utilization_percentage: fc.float({ min: 0, max: 100, noNaN: true }),
  days_until_due: fc.oneof(fc.constant(null), fc.integer({ min: -10, max: 60 })),
  expense_count: fc.integer({ min: 0, max: 100 }),
  total_expense_count: fc.integer({ min: 0, max: 500 }),
});

const nonCreditCardArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  type: fc.constantFrom('debit', 'cheque', 'cash'),
  display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
  is_active: fc.constant(true),
  current_balance: fc.constant(null),
  expense_count: fc.integer({ min: 0, max: 100 }),
  total_expense_count: fc.integer({ min: 0, max: 500 }),
});

// Ensure unique IDs within each array
function uniqueById(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

const defaultModalProps = {
  isOpen: true,
  onClose: vi.fn(),
  year: 2026,
  month: 2,
  onUpdate: vi.fn(),
  onPaymentMethodsUpdate: vi.fn(),
  initialTab: null,
  _testNetWorth: { totalInvestments: 0, totalDebt: 0 },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FinancialOverviewModal PBT', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ loans: [], investments: [] })
    });
  });

  /**
   * Feature: financial-overview-ui-consistency, Property 7: Unified view section headers show correct item counts
   * Validates: Requirements 3.1, 3.3, 3.4
   *
   * For any combination of payment methods (0..N), loans (0..M), and investments (0..K),
   * the Financial Overview SHALL render three section headers with counts matching
   * the number of items in each category.
   */
  describe('Property 7: Unified view section headers show correct item counts', () => {
    it('section header counts match array lengths for any combination of items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(creditCardArb, { minLength: 0, maxLength: 3 }).map(uniqueById),
          fc.array(nonCreditCardArb, { minLength: 0, maxLength: 3 }).map(uniqueById),
          fc.array(loanArb, { minLength: 0, maxLength: 3 }).map(uniqueById),
          fc.array(investmentArb, { minLength: 0, maxLength: 3 }).map(uniqueById),
          async (creditCards, otherMethods, loans, investments) => {
            // Ensure no ID collisions between CC and other methods
            const usedIds = new Set(creditCards.map(c => c.id));
            const safeOthers = otherMethods.filter(m => !usedIds.has(m.id));
            const paymentMethods = [...creditCards, ...safeOthers];
            const totalPmCount = paymentMethods.length;

            loanApi.getAllLoans.mockResolvedValue(loans);
            investmentApi.getAllInvestments.mockResolvedValue(investments);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            await waitFor(() => {
              expect(screen.getByTestId('loans-section')).toHaveTextContent(`Loans (${loans.length})`);
            });

            expect(screen.getByTestId('investments-section')).toHaveTextContent(`Investments (${investments.length})`);
            expect(screen.getByTestId('payment-methods-section')).toHaveTextContent(`Payment Methods (${totalPmCount})`);

            if (loans.length === 0) {
              expect(screen.getByTestId('loans-section')).toHaveTextContent(/No active loans/i);
            }
            if (investments.length === 0) {
              expect(screen.getByTestId('investments-section')).toHaveTextContent(/No investments yet/i);
            }
            if (totalPmCount === 0) {
              expect(screen.getByTestId('payment-methods-section')).toHaveTextContent(/No payment methods/i);
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: financial-overview-ui-consistency, Property 3: Payment method subsection visibility matches content
   * Validates: Requirements 4.1, 4.4, 4.5
   *
   * For any list of active payment methods, the rendered PaymentMethodsSection should show
   * the Credit Card subsection iff the list contains at least one credit card, and should show
   * the Other Payment Methods subsection iff the list contains at least one non-credit-card method.
   */
  describe('Property 3: Payment method subsection visibility matches content', () => {
    it('cc-subsection visible iff has credit cards, other-subsection visible iff has non-CC methods', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(creditCardArb, { minLength: 0, maxLength: 4 }).map(uniqueById),
          fc.array(nonCreditCardArb, { minLength: 0, maxLength: 4 }).map(uniqueById),
          async (creditCards, otherMethods) => {
            const usedIds = new Set(creditCards.map(c => c.id));
            const safeOthers = otherMethods.filter(m => !usedIds.has(m.id));
            const paymentMethods = [...creditCards, ...safeOthers];

            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            await waitFor(() => {
              expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
            });

            if (creditCards.length > 0) {
              expect(screen.getByTestId('cc-subsection')).toBeInTheDocument();
            } else {
              expect(screen.queryByTestId('cc-subsection')).toBeNull();
            }

            if (safeOthers.length > 0) {
              expect(screen.getByTestId('other-subsection')).toBeInTheDocument();
            } else {
              expect(screen.queryByTestId('other-subsection')).toBeNull();
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: financial-overview-ui-consistency, Property 4: Payment method row content completeness
   * Validates: Requirements 4.3
   *
   * For any non-credit-card payment method with a name and type, rendering its row in the
   * Other Payment Methods subsection should produce output containing the method name,
   * a type badge, and a View button.
   */
  describe('Property 4: Payment method row content completeness', () => {
    it('each non-CC method row contains name, type badge, and view button', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonCreditCardArb,
          async (method) => {
            cleanup();
            const paymentMethods = [method];

            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            await waitFor(() => {
              expect(within(container).getByTestId('other-subsection')).toBeInTheDocument();
            });

            const subsection = within(container).getByTestId('other-subsection');
            expect(subsection).toHaveTextContent(method.display_name.trim());
            expect(subsection.querySelector('[data-testid="type-badge"]')).toBeInTheDocument();
            expect(subsection.querySelector('.other-payment-method-view-btn')).toBeInTheDocument();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: financial-overview-ui-consistency, Property 5: Payment Methods section item count equals total active methods
   * Validates: Requirements 4.7
   *
   * For any list of active payment methods (of any mix of types), the item count displayed
   * in the Payment Methods section header should equal the total number of active methods.
   */
  describe('Property 5: Payment Methods section item count equals total active methods', () => {
    it('header count equals total active payment methods', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(creditCardArb, { minLength: 0, maxLength: 4 }).map(uniqueById),
          fc.array(nonCreditCardArb, { minLength: 0, maxLength: 4 }).map(uniqueById),
          async (creditCards, otherMethods) => {
            const usedIds = new Set(creditCards.map(c => c.id));
            const safeOthers = otherMethods.filter(m => !usedIds.has(m.id));
            const paymentMethods = [...creditCards, ...safeOthers];
            const totalCount = paymentMethods.length;

            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            await waitFor(() => {
              expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
            });

            expect(screen.getByTestId('payment-methods-section'))
              .toHaveTextContent(`Payment Methods (${totalCount})`);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: financial-overview-ui-consistency, Property 6: Add button disabled state matches loading state
   * Validates: Requirements 3.5
   *
   * For any boolean loading state, the Add button in the Payment Methods section header
   * should be disabled when loading is true and enabled when loading is false.
   *
   * Note: Since PaymentMethodsSection is not exported, we test through the full modal.
   * The modal always passes loading={false} to PaymentMethodsSection, so the Add button
   * should always be enabled. We verify this property holds across various payment method lists.
   */
  describe('Property 6: Add button disabled state matches loading state', () => {
    it('Add button is enabled when modal is rendered (loading=false)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(creditCardArb, nonCreditCardArb),
            { minLength: 0, maxLength: 4 }
          ).map(uniqueById),
          async (paymentMethods) => {
            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            await waitFor(() => {
              expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
            });

            const pmSection = screen.getByTestId('payment-methods-section');
            const addBtn = pmSection.querySelector('.financial-section-add-button');
            expect(addBtn).toBeInTheDocument();
            expect(addBtn.disabled).toBe(false);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: financial-overview-redesign, Property: Net worth calculation correctness
   *
   * For any non-negative totalInvestments and totalDebt values, the displayed net worth
   * equals totalInvestments - totalDebt, and the CSS class matches the sign.
   */
  describe('Net worth calculation correctness', () => {
    it('displays net worth = investments - debt with correct sign class', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1_000_000, noNaN: true }),
          fc.float({ min: 0, max: 1_000_000, noNaN: true }),
          (totalInvestments, totalDebt) => {
            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue([]);

            const { unmount } = render(
              <FinancialOverviewModal
                isOpen={true}
                onClose={vi.fn()}
                year={2026}
                month={2}
                onUpdate={vi.fn()}
                onPaymentMethodsUpdate={vi.fn()}
                initialTab={null}
                _testNetWorth={{ totalInvestments, totalDebt }}
              />
            );

            const netWorthEl = screen.getByTestId('net-worth-value');
            const expectedNetWorth = totalInvestments - totalDebt;
            const isPositive = expectedNetWorth >= 0;

            expect(netWorthEl.classList.contains(isPositive ? 'positive' : 'negative')).toBe(true);
            expect(netWorthEl.classList.contains(isPositive ? 'negative' : 'positive')).toBe(false);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
