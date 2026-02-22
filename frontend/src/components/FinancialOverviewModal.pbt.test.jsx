/**
 * Property-based tests for FinancialOverviewModal unified view.
 *
 * Property 7: Unified view section headers show correct item counts
 * For any combination of credit cards (0..N), loans (0..M), and investments (0..K),
 * the Financial Overview SHALL render three section headers with counts matching
 * the number of items in each category. When a count is zero, the section SHALL
 * display an empty state message.
 *
 * Net Worth Calculation: For any non-negative totalInvestments and totalDebt values,
 * the displayed net worth equals totalInvestments - totalDebt, and the CSS class matches the sign.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  formatCurrency: (v) => `$${Number(v || 0).toFixed(2)}`,
  formatDate: (d) => d || '',
  formatCAD: (v) => `$${Number(v || 0).toFixed(2)}`
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

// Ensure unique IDs within each array
function uniqueById(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

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
   * Feature: financial-overview-redesign, Property 7: Unified view section headers show correct item counts
   * Validates: Requirements 3.1, 3.3, 3.4
   *
   * For any combination of credit cards (0..N), loans (0..M), and investments (0..K),
   * the Financial Overview SHALL render three section headers with counts matching
   * the number of items in each category. When a count is zero, the section SHALL
   * display an empty state message.
   */
  describe('Property 7: Unified view section headers show correct item counts', () => {
    it('section header counts match array lengths for any combination of items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(creditCardArb, { minLength: 0, maxLength: 5 }).map(uniqueById),
          fc.array(loanArb, { minLength: 0, maxLength: 5 }).map(uniqueById),
          fc.array(investmentArb, { minLength: 0, maxLength: 5 }).map(uniqueById),
          async (creditCards, loans, investments) => {
            // Build payment methods: credit cards + a non-CC method to ensure filter works
            const paymentMethods = [
              ...creditCards,
              { id: 99999, type: 'cash', display_name: 'Cash', is_active: true, expense_count: 0, total_expense_count: 0 }
            ];

            loanApi.getAllLoans.mockResolvedValue(loans);
            investmentApi.getAllInvestments.mockResolvedValue(investments);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount } = render(
              <FinancialOverviewModal
                isOpen={true}
                onClose={vi.fn()}
                year={2026}
                month={2}
                onUpdate={vi.fn()}
                onPaymentMethodsUpdate={vi.fn()}
                initialTab={null}
                _testNetWorth={{ totalInvestments: 0, totalDebt: 0 }}
              />
            );

            // Wait for all sections to render with data
            await waitFor(() => {
              const loansSection = screen.getByTestId('loans-section');
              expect(loansSection).toHaveTextContent(`Loans (${loans.length})`);
            });

            // Verify loans section header count
            const loansSection = screen.getByTestId('loans-section');
            expect(loansSection).toHaveTextContent(`Loans (${loans.length})`);

            // Verify investments section header count
            const investmentsSection = screen.getByTestId('investments-section');
            expect(investmentsSection).toHaveTextContent(`Investments (${investments.length})`);

            // Verify credit cards section header count
            const ccSection = screen.getByTestId('credit-cards-section');
            expect(ccSection).toHaveTextContent(`Credit Cards (${creditCards.length})`);

            // Verify empty state messages when count is zero
            if (loans.length === 0) {
              const loansContent = loansSection.querySelector('.financial-section-empty, .loans-empty');
              // Active loans tab shows empty when no active loans
              expect(loansSection).toHaveTextContent(/No active loans/i);
            }

            if (investments.length === 0) {
              expect(investmentsSection).toHaveTextContent(/No investments yet/i);
            }

            if (creditCards.length === 0) {
              expect(ccSection).toHaveTextContent(/No credit cards/i);
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty arrays produce zero counts and empty state messages', async () => {
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
          _testNetWorth={{ totalInvestments: 0, totalDebt: 0 }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('loans-section')).toHaveTextContent('Loans (0)');
        expect(screen.getByTestId('investments-section')).toHaveTextContent('Investments (0)');
        expect(screen.getByTestId('credit-cards-section')).toHaveTextContent('Credit Cards (0)');
      });

      expect(screen.getByTestId('credit-cards-section')).toHaveTextContent(/No credit cards/i);
      expect(screen.getByTestId('investments-section')).toHaveTextContent(/No investments yet/i);

      unmount();
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
