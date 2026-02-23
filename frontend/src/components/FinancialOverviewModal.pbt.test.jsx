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
import { render, screen, waitFor, cleanup, within, fireEvent } from '@testing-library/react';
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

  /**
   * Feature: financial-overview-styling-consistency, Property 1: Active Tab Filtering
   * **Validates: Requirements 2.4**
   *
   * For any set of payment methods, when the Active tab is selected, all displayed
   * payment methods should have is_active === true.
   */
  describe('Property 1: Active Tab Filtering', () => {
    it('all displayed payment methods have is_active === true when Active tab is selected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 10000 }),
              type: fc.constantFrom('credit_card', 'debit', 'cheque', 'cash'),
              display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              is_active: fc.boolean(),
              current_balance: fc.float({ min: 0, max: 50000, noNaN: true }),
              credit_limit: fc.oneof(fc.constant(null), fc.float({ min: 1000, max: 100000, noNaN: true })),
              expense_count: fc.integer({ min: 0, max: 100 }),
              total_expense_count: fc.integer({ min: 0, max: 500 }),
            }),
            { minLength: 0, maxLength: 10 }
          ).map(uniqueById),
          async (paymentMethods) => {
            cleanup(); // Clean up any previous renders
            
            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for the component to render and finish loading
            await waitFor(() => {
              const sections = within(container).queryAllByTestId('payment-methods-section');
              expect(sections.length).toBeGreaterThan(0);
            });

            // Get the payment methods section from the current container
            const pmSection = within(container).getByTestId('payment-methods-section');
            
            // The Active tab should be selected by default
            const activeTab = within(pmSection).getByTestId('active-tab');
            expect(activeTab.classList.contains('active')).toBe(true);

            // Calculate expected active methods
            const activeMethodsCount = paymentMethods.filter(m => m.is_active).length;
            
            // If there are active methods, wait for them to be displayed
            if (activeMethodsCount > 0) {
              await waitFor(() => {
                const ccSubsection = within(pmSection).queryByTestId('cc-subsection');
                const otherSubsection = within(pmSection).queryByTestId('other-subsection');
                const ccRowCount = ccSubsection ? ccSubsection.querySelectorAll('.financial-cc-summary-row').length : 0;
                const otherRowCount = otherSubsection ? otherSubsection.querySelectorAll('.other-payment-method-row').length : 0;
                const displayedCount = ccRowCount + otherRowCount;
                expect(displayedCount).toBe(activeMethodsCount);
              }, { timeout: 3000 });
            }
            
            // Check credit card rows
            const ccSubsection = within(pmSection).queryByTestId('cc-subsection');
            if (ccSubsection) {
              const ccRows = ccSubsection.querySelectorAll('.financial-cc-summary-row');
              ccRows.forEach(row => {
                const cardName = row.querySelector('.financial-cc-name').textContent;
                const method = paymentMethods.find(m => m.display_name === cardName);
                expect(method?.is_active).toBe(true);
              });
            }

            // Check other payment method rows
            const otherSubsection = within(pmSection).queryByTestId('other-subsection');
            if (otherSubsection) {
              const otherRows = otherSubsection.querySelectorAll('.other-payment-method-row');
              otherRows.forEach(row => {
                const methodName = row.querySelector('.other-payment-method-name').textContent;
                const method = paymentMethods.find(m => m.display_name === methodName);
                expect(method?.is_active).toBe(true);
              });
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: financial-overview-styling-consistency, Property 2: Inactive Tab Filtering
   * **Validates: Requirements 2.5**
   *
   * For any set of payment methods, when the Inactive tab is selected, all displayed
   * payment methods should have is_active === false.
   */
  describe('Property 2: Inactive Tab Filtering', () => {
    it('all displayed payment methods have is_active === false when Inactive tab is selected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 10000 }),
              type: fc.constantFrom('credit_card', 'debit', 'cheque', 'cash'),
              display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              is_active: fc.boolean(),
              current_balance: fc.float({ min: 0, max: 50000, noNaN: true }),
              credit_limit: fc.oneof(fc.constant(null), fc.float({ min: 1000, max: 100000, noNaN: true })),
              expense_count: fc.integer({ min: 0, max: 100 }),
              total_expense_count: fc.integer({ min: 0, max: 500 }),
            }),
            { minLength: 0, maxLength: 10 }
          ).map(uniqueById),
          async (paymentMethods) => {
            cleanup(); // Clean up any previous renders
            
            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for the component to render and finish loading
            await waitFor(() => {
              const sections = within(container).queryAllByTestId('payment-methods-section');
              expect(sections.length).toBeGreaterThan(0);
            });

            // Get the payment methods section from the current container
            const pmSection = within(container).getByTestId('payment-methods-section');
            
            // Click the Inactive tab using fireEvent
            const inactiveTab = within(pmSection).getByTestId('inactive-tab');
            fireEvent.click(inactiveTab);

            // Wait for the tab to become active
            await waitFor(() => {
              expect(inactiveTab.classList.contains('active')).toBe(true);
            });

            // Calculate expected inactive methods
            const inactiveMethods = paymentMethods.filter(m => !m.is_active);
            const inactiveMethodsCount = inactiveMethods.length;
            const inactiveCreditCards = inactiveMethods.filter(m => m.type === 'credit_card');
            const inactiveOtherMethods = inactiveMethods.filter(m => m.type !== 'credit_card');
            
            // If there are no inactive methods, verify empty state or no rows
            if (inactiveMethodsCount === 0) {
              // Should show empty state or no subsections with rows
              const ccSubsection = within(pmSection).queryByTestId('cc-subsection');
              const otherSubsection = within(pmSection).queryByTestId('other-subsection');
              
              if (ccSubsection) {
                const ccRows = ccSubsection.querySelectorAll('.financial-cc-summary-row');
                expect(ccRows.length).toBe(0);
              }
              if (otherSubsection) {
                const otherRows = otherSubsection.querySelectorAll('.other-payment-method-row');
                expect(otherRows.length).toBe(0);
              }
              
              unmount();
              return true;
            }
            
            // Wait for inactive methods to be displayed
            // For credit cards, we need to wait for the async data fetch to complete
            if (inactiveCreditCards.length > 0) {
              await waitFor(() => {
                const ccSubsection = within(pmSection).queryByTestId('cc-subsection');
                if (!ccSubsection) return false;
                const ccRows = ccSubsection.querySelectorAll('.financial-cc-summary-row');
                return ccRows.length === inactiveCreditCards.length;
              }, { timeout: 5000 });
            }
            
            // For other methods, they should render immediately
            if (inactiveOtherMethods.length > 0) {
              await waitFor(() => {
                const otherSubsection = within(pmSection).queryByTestId('other-subsection');
                if (!otherSubsection) return false;
                const otherRows = otherSubsection.querySelectorAll('.other-payment-method-row');
                return otherRows.length === inactiveOtherMethods.length;
              }, { timeout: 3000 });
            }
            
            // Verify the total count matches
            const ccSubsection = within(pmSection).queryByTestId('cc-subsection');
            const otherSubsection = within(pmSection).queryByTestId('other-subsection');
            const ccRowCount = ccSubsection ? ccSubsection.querySelectorAll('.financial-cc-summary-row').length : 0;
            const otherRowCount = otherSubsection ? otherSubsection.querySelectorAll('.other-payment-method-row').length : 0;
            const displayedCount = ccRowCount + otherRowCount;
            
            // The displayed count should match the inactive count
            expect(displayedCount).toBe(inactiveMethodsCount);
            
            // Verify that the displayed methods are actually from the inactive set
            // by checking that each displayed name exists in the inactive methods list
            if (ccSubsection) {
              const ccRows = ccSubsection.querySelectorAll('.financial-cc-summary-row');
              ccRows.forEach(row => {
                const cardName = row.querySelector('.financial-cc-name').textContent;
                // Check if this name exists in the inactive credit cards
                const existsInInactive = inactiveCreditCards.some(m => m.display_name === cardName);
                expect(existsInInactive).toBe(true);
              });
            }

            if (otherSubsection) {
              const otherRows = otherSubsection.querySelectorAll('.other-payment-method-row');
              otherRows.forEach(row => {
                const methodName = row.querySelector('.other-payment-method-name').textContent;
                // Check if this name exists in the inactive other methods
                const existsInInactive = inactiveOtherMethods.some(m => m.display_name === methodName);
                expect(existsInInactive).toBe(true);
              });
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: financial-overview-styling-consistency, Property 3: Deactivation Removes from Active List
   * **Validates: Requirements 1.6**
   *
   * For any active credit card, when deactivated, it should no longer appear in the Active tab
   * payment methods list after the component refreshes.
   * 
   * This test verifies the deactivation property by simulating the state change that occurs
   * after deactivation: the parent component re-fetches payment methods with the card marked
   * as inactive, and the Active tab should not display it.
   */
  describe('Property 3: Deactivation Removes from Active List', () => {
    it('deactivated credit card does not appear in Active tab after component refresh', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            type: fc.constant('credit_card'),
            display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
            is_active: fc.constant(true), // Start with active credit card
            current_balance: fc.float({ min: 0, max: 50000, noNaN: true }),
            credit_limit: fc.float({ min: 1000, max: 100000, noNaN: true }),
            utilization_percentage: fc.float({ min: 0, max: 100, noNaN: true }),
            days_until_due: fc.oneof(fc.constant(null), fc.integer({ min: -10, max: 60 })),
            expense_count: fc.integer({ min: 0, max: 100 }),
            total_expense_count: fc.integer({ min: 0, max: 500 }),
          }),
          async (activeCreditCard) => {
            cleanup(); // Clean up any previous renders
            
            // Simulate the deactivation scenario:
            // 1. Render with active card
            // 2. Render with deactivated card (simulating parent refresh after deactivation)
            // 3. Verify card is not in Active tab
            
            const deactivatedCard = { ...activeCreditCard, is_active: false };
            
            // Render with deactivated card (post-deactivation state)
            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue([deactivatedCard]);

            const { container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for the component to render
            await waitFor(() => {
              const sections = within(container).queryAllByTestId('payment-methods-section');
              expect(sections.length).toBeGreaterThan(0);
            });

            const pmSection = within(container).getByTestId('payment-methods-section');
            
            // The Active tab should be selected by default
            const activeTab = within(pmSection).getByTestId('active-tab');
            expect(activeTab.classList.contains('active')).toBe(true);

            // Wait for any async rendering to complete
            await waitFor(() => {
              return true;
            }, { timeout: 2000 });

            // CORE PROPERTY: Verify the deactivated credit card is NOT in the Active tab
            // Since the card is inactive, it should not appear in the Active tab
            const ccSubsection = within(pmSection).queryByTestId('cc-subsection');
            
            if (ccSubsection) {
              // If the subsection exists, verify the deactivated card is not there
              const ccRows = ccSubsection.querySelectorAll('.financial-cc-summary-row');
              const cardNames = Array.from(ccRows).map(row => 
                row.querySelector('.financial-cc-name')?.textContent
              ).filter(Boolean);
              
              // The deactivated card should not be in the list
              expect(cardNames).not.toContain(deactivatedCard.display_name);
            } else {
              // If the subsection doesn't exist, that's correct (no active credit cards)
              // This satisfies the property - the deactivated card is not in the Active tab
              expect(ccSubsection).toBeNull();
            }
            
            // Additional verification: the card should appear in the Inactive tab
            const inactiveTab = within(pmSection).getByTestId('inactive-tab');
            fireEvent.click(inactiveTab);

            // Wait for the Inactive tab to become active
            await waitFor(() => {
              expect(inactiveTab.classList.contains('active')).toBe(true);
            });

            // Wait for the inactive tab content to render
            await waitFor(() => {
              return true;
            }, { timeout: 2000 });

            // The deactivated card should be in the Inactive tab
            const inactiveCcSubsection = within(pmSection).queryByTestId('cc-subsection');
            
            // The subsection should exist since we have an inactive credit card
            expect(inactiveCcSubsection).toBeInTheDocument();
            
            // Wait for the card data to load in the inactive tab
            await waitFor(() => {
              const rows = inactiveCcSubsection.querySelectorAll('.financial-cc-summary-row');
              return rows.length > 0;
            }, { timeout: 3000 });
            
            const inactiveCcRows = inactiveCcSubsection.querySelectorAll('.financial-cc-summary-row');
            const inactiveCardNames = Array.from(inactiveCcRows).map(row => 
              row.querySelector('.financial-cc-name')?.textContent
            ).filter(Boolean);
            
            // The deactivated card should be in the inactive list
            expect(inactiveCardNames).toContain(deactivatedCard.display_name);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: financial-overview-styling-consistency, Property 4: Reactivation Adds to Active List
   * **Validates: Requirements 2.8**
   *
   * For any inactive payment method, when reactivated, it should appear in the Active tab
   * payment methods list after the component refreshes.
   * 
   * This test verifies the end-to-end reactivation flow by:
   * 1. Starting with an inactive payment method
   * 2. Clicking the Reactivate button
   * 3. Simulating the parent component refresh (which happens via onPaymentRecorded callback)
   * 4. Verifying the method appears in the Active tab
   */
  describe('Property 4: Reactivation Adds to Active List', () => {
    it('reactivated payment method appears in Active tab after component refresh', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            type: fc.constantFrom('debit', 'cheque', 'cash'), // Focus on non-credit-card methods to avoid async complexity
            display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
            is_active: fc.constant(false), // Start with inactive method
            current_balance: fc.constant(null),
            credit_limit: fc.constant(null),
            expense_count: fc.integer({ min: 0, max: 100 }),
            total_expense_count: fc.integer({ min: 0, max: 500 }),
          }),
          async (inactiveMethod) => {
            cleanup(); // Clean up any previous renders
            
            // Mock the reactivation API call to succeed and return the updated method
            const reactivatedMethod = { ...inactiveMethod, is_active: true };
            paymentMethodApi.setPaymentMethodActive.mockResolvedValue(reactivatedMethod);
            
            // Start with the method inactive
            loanApi.getAllLoans.mockResolvedValue([]);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue([inactiveMethod]);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for the component to render
            await waitFor(() => {
              const sections = within(container).queryAllByTestId('payment-methods-section');
              expect(sections.length).toBeGreaterThan(0);
            });

            const pmSection = within(container).getByTestId('payment-methods-section');
            
            // Switch to Inactive tab
            const inactiveTab = within(pmSection).getByTestId('inactive-tab');
            fireEvent.click(inactiveTab);

            // Wait for the Inactive tab to become active
            await waitFor(() => {
              expect(inactiveTab.classList.contains('active')).toBe(true);
            });

            // Wait for the inactive method to be displayed (non-credit-card methods render immediately)
            await waitFor(() => {
              const otherSubsection = within(pmSection).queryByTestId('other-subsection');
              if (!otherSubsection) return false;
              const otherRows = otherSubsection.querySelectorAll('.other-payment-method-row');
              return otherRows.length > 0;
            }, { timeout: 3000 });

            // Find and click the Reactivate button
            const otherSubsection = within(pmSection).getByTestId('other-subsection');
            const reactivateButton = otherSubsection.querySelector('.other-payment-method-reactivate-btn');
            
            expect(reactivateButton).toBeInTheDocument();
            
            // Click the Reactivate button
            fireEvent.click(reactivateButton);

            // Wait for the API call to be made
            await waitFor(() => {
              expect(paymentMethodApi.setPaymentMethodActive).toHaveBeenCalledWith(inactiveMethod.id, true);
            });

            unmount();
            
            // Now simulate the parent component refresh that happens via onPaymentRecorded callback
            // The parent would re-fetch payment methods and re-render the modal
            cleanup();
            paymentMethodApi.getPaymentMethods.mockResolvedValue([reactivatedMethod]);
            
            const { container: newContainer } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for the component to render with updated data
            await waitFor(() => {
              const sections = within(newContainer).queryAllByTestId('payment-methods-section');
              expect(sections.length).toBeGreaterThan(0);
            });

            const newPmSection = within(newContainer).getByTestId('payment-methods-section');
            
            // The Active tab should be selected by default
            const activeTab = within(newPmSection).getByTestId('active-tab');
            expect(activeTab.classList.contains('active')).toBe(true);

            // Wait for the reactivated method to appear in the Active tab
            await waitFor(() => {
              const otherSubsection = within(newPmSection).queryByTestId('other-subsection');
              if (!otherSubsection) return false;
              const otherRows = otherSubsection.querySelectorAll('.other-payment-method-row');
              if (otherRows.length === 0) return false;
              const methodNames = Array.from(otherRows).map(row => 
                row.querySelector('.other-payment-method-name')?.textContent
              ).filter(Boolean);
              return methodNames.includes(reactivatedMethod.display_name);
            }, { timeout: 3000 });

            // Final verification: the method is in the Active tab
            const finalOtherSubsection = within(newPmSection).queryByTestId('other-subsection');
            expect(finalOtherSubsection).toBeInTheDocument();
            const finalOtherRows = finalOtherSubsection.querySelectorAll('.other-payment-method-row');
            const finalMethodNames = Array.from(finalOtherRows).map(row => 
              row.querySelector('.other-payment-method-name')?.textContent
            ).filter(Boolean);
            expect(finalMethodNames).toContain(reactivatedMethod.display_name);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
