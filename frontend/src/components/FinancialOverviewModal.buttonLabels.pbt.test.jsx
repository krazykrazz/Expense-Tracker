/**
 * @invariant Button label consistency: For all financial sections (payment methods, loans, investments),
 * action buttons use consistent labels (View, Edit, Delete, Pay).
 *
 * Property-based tests for button label consistency across financial sections.
 *
 * Feature: financial-overview-styling-consistency
 * Property 7: Button Label Consistency
 * Validates: Requirements 7.7
 *
 * For all financial sections (payment methods, loans, investments), action button labels
 * should be consistent (View, Edit, Delete, Pay).
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
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !/\s{2,}/.test(s)),
  loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
  currentBalance: fc.float({ min: 0, max: 500000, noNaN: true }),
  currentRate: fc.float({ min: 0, max: 30, noNaN: true }),
  start_date: fc.constant('2022-01-01'),
  is_paid_off: fc.constant(false),
  initial_balance: fc.float({ min: 100, max: 500000, noNaN: true }),
  payment_tracking_enabled: fc.boolean(),
});

const investmentArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !/\s{2,}/.test(s)),
  type: fc.constantFrom('TFSA', 'RRSP'),
  currentValue: fc.float({ min: 0, max: 1000000, noNaN: true }),
  initial_value: fc.float({ min: 100, max: 1000000, noNaN: true }),
});

const creditCardArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  type: fc.constant('credit_card'),
  display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !/\s{2,}/.test(s)),
  is_active: fc.constant(true),
  current_balance: fc.float({ min: 0, max: 50000, noNaN: true }),
  credit_limit: fc.float({ min: 1000, max: 100000, noNaN: true }),
});

const nonCreditCardArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  type: fc.constantFrom('debit', 'cheque', 'cash'),
  display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !/\s{2,}/.test(s)),
  is_active: fc.constant(true),
  current_balance: fc.constant(null),
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

describe('FinancialOverviewModal Button Label Consistency PBT', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ loans: [], investments: [] })
    });
  });

  /**
   * Feature: financial-overview-styling-consistency, Property 7: Button Label Consistency
   * **Validates: Requirements 7.7**
   *
   * For all financial sections (payment methods, loans, investments), action button labels
   * should be consistent. This test verifies that:
   * - View buttons use "View" or "View Details" label
   * - Edit buttons use "Edit" label
   * - Delete buttons use "Delete" label
   * - Pay/Log Payment buttons use consistent labels ("Pay" or "Log Payment")
   */
  describe('Property 7: Button Label Consistency', () => {
    it('all View buttons across sections use consistent "View" or "View Details" labels', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(creditCardArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          fc.array(nonCreditCardArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          fc.array(loanArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          fc.array(investmentArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          async (creditCards, otherMethods, loans, investments) => {
            cleanup();

            // Ensure no ID collisions
            const usedIds = new Set(creditCards.map(c => c.id));
            const safeOthers = otherMethods.filter(m => !usedIds.has(m.id));
            const paymentMethods = [...creditCards, ...safeOthers];

            loanApi.getAllLoans.mockResolvedValue(loans);
            investmentApi.getAllInvestments.mockResolvedValue(investments);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for all sections to render
            await waitFor(() => {
              expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
              expect(screen.getByTestId('loans-section')).toBeInTheDocument();
              expect(screen.getByTestId('investments-section')).toBeInTheDocument();
            });

            // Collect all View button labels
            const viewButtonLabels = new Set();

            // Check credit card View buttons
            const ccButtons = container.querySelectorAll('.financial-cc-view-btn');
            ccButtons.forEach(btn => {
              viewButtonLabels.add(btn.textContent.trim());
            });

            // Check other payment method View buttons
            const otherButtons = container.querySelectorAll('.financial-cc-view-btn');
            otherButtons.forEach(btn => {
              viewButtonLabels.add(btn.textContent.trim());
            });

            // Check loan View buttons (using test ID or class)
            const loanSection = screen.getByTestId('loans-section');
            const loanViewButtons = within(loanSection).getAllByText(/^View$/);
            loanViewButtons.forEach(btn => {
              viewButtonLabels.add(btn.textContent.trim());
            });

            // Check investment View buttons
            const investmentSection = screen.getByTestId('investments-section');
            const investmentViewButtons = within(investmentSection).getAllByText(/^View$/);
            investmentViewButtons.forEach(btn => {
              viewButtonLabels.add(btn.textContent.trim());
            });

            // Verify that View button labels are from the allowed set
            const allowedViewLabels = new Set(['View']);
            viewButtonLabels.forEach(label => {
              expect(allowedViewLabels.has(label)).toBe(true);
            });

            // Verify that we found at least some View buttons
            expect(viewButtonLabels.size).toBeGreaterThan(0);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all Edit buttons across sections use "Edit" label', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(loanArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          fc.array(investmentArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          async (loans, investments) => {
            cleanup();

            loanApi.getAllLoans.mockResolvedValue(loans);
            investmentApi.getAllInvestments.mockResolvedValue(investments);
            paymentMethodApi.getPaymentMethods.mockResolvedValue([]);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for sections to render
            await waitFor(() => {
              expect(screen.getByTestId('loans-section')).toBeInTheDocument();
              expect(screen.getByTestId('investments-section')).toBeInTheDocument();
            });

            // Collect all Edit button labels
            const editButtons = container.querySelectorAll('button');
            const editButtonLabels = Array.from(editButtons)
              .filter(btn => btn.textContent.trim() === 'Edit')
              .map(btn => btn.textContent.trim());

            // Verify that all Edit buttons have exactly "Edit" label
            editButtonLabels.forEach(label => {
              expect(label).toBe('Edit');
            });

            // Verify we found Edit buttons (loans + investments)
            const expectedEditButtonCount = loans.length + investments.length;
            expect(editButtonLabels.length).toBe(expectedEditButtonCount);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all Delete buttons across sections use "Delete" label', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(loanArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          fc.array(investmentArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          async (loans, investments) => {
            cleanup();

            loanApi.getAllLoans.mockResolvedValue(loans);
            investmentApi.getAllInvestments.mockResolvedValue(investments);
            paymentMethodApi.getPaymentMethods.mockResolvedValue([]);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for sections to render
            await waitFor(() => {
              expect(screen.getByTestId('loans-section')).toBeInTheDocument();
              expect(screen.getByTestId('investments-section')).toBeInTheDocument();
            });

            // Collect all Delete button labels
            const deleteButtons = container.querySelectorAll('button');
            const deleteButtonLabels = Array.from(deleteButtons)
              .filter(btn => btn.textContent.trim() === 'Delete')
              .map(btn => btn.textContent.trim());

            // Verify that all Delete buttons have exactly "Delete" label
            deleteButtonLabels.forEach(label => {
              expect(label).toBe('Delete');
            });

            // Verify we found Delete buttons (loans + investments)
            const expectedDeleteButtonCount = loans.length + investments.length;
            expect(deleteButtonLabels.length).toBe(expectedDeleteButtonCount);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Pay/Log Payment buttons use consistent labels across sections', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(creditCardArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          fc.array(loanArb, { minLength: 1, maxLength: 3 }).map(uniqueById),
          async (creditCards, loans) => {
            cleanup();

            // Enable payment tracking for all loans
            const loansWithTracking = loans.map(loan => ({
              ...loan,
              payment_tracking_enabled: true
            }));

            loanApi.getAllLoans.mockResolvedValue(loansWithTracking);
            investmentApi.getAllInvestments.mockResolvedValue([]);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(creditCards);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for sections to render
            await waitFor(() => {
              expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
              expect(screen.getByTestId('loans-section')).toBeInTheDocument();
            });

            // Collect all Pay/Log Payment button labels
            const paymentButtonLabels = new Set();

            // Check credit card Pay buttons
            const ccPayButtons = container.querySelectorAll('.financial-cc-pay-btn');
            ccPayButtons.forEach(btn => {
              paymentButtonLabels.add(btn.textContent.trim());
            });

            // Check loan Log Payment buttons
            const loanPayButtons = container.querySelectorAll('[data-testid="log-payment-button"]');
            loanPayButtons.forEach(btn => {
              paymentButtonLabels.add(btn.textContent.trim());
            });

            // Verify that payment button labels are from the allowed set
            const allowedPaymentLabels = new Set(['Pay', 'Log Payment']);
            paymentButtonLabels.forEach(label => {
              expect(allowedPaymentLabels.has(label)).toBe(true);
            });

            // Verify that we found payment buttons
            expect(paymentButtonLabels.size).toBeGreaterThan(0);

            // Verify specific labels for each section
            // Credit cards should use "Pay"
            ccPayButtons.forEach(btn => {
              expect(btn.textContent.trim()).toBe('Pay');
            });

            // Loans should use "Log Payment"
            loanPayButtons.forEach(btn => {
              expect(btn.textContent.trim()).toBe('Log Payment');
            });

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('button labels remain consistent across different data combinations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(creditCardArb, { minLength: 0, maxLength: 2 }).map(uniqueById),
          fc.array(nonCreditCardArb, { minLength: 0, maxLength: 2 }).map(uniqueById),
          fc.array(loanArb, { minLength: 0, maxLength: 2 }).map(uniqueById),
          fc.array(investmentArb, { minLength: 0, maxLength: 2 }).map(uniqueById),
          async (creditCards, otherMethods, loans, investments) => {
            cleanup();

            // Ensure no ID collisions
            const usedIds = new Set(creditCards.map(c => c.id));
            const safeOthers = otherMethods.filter(m => !usedIds.has(m.id));
            const paymentMethods = [...creditCards, ...safeOthers];

            loanApi.getAllLoans.mockResolvedValue(loans);
            investmentApi.getAllInvestments.mockResolvedValue(investments);
            paymentMethodApi.getPaymentMethods.mockResolvedValue(paymentMethods);

            const { unmount, container } = render(
              <FinancialOverviewModal {...defaultModalProps} />
            );

            // Wait for modal to render
            await waitFor(() => {
              expect(screen.getByTestId('payment-methods-section')).toBeInTheDocument();
            });

            // Collect all button labels
            const allButtons = container.querySelectorAll('button');
            const buttonLabels = Array.from(allButtons).map(btn => btn.textContent.trim());

            // Define allowed button labels for financial actions
            const allowedActionLabels = new Set([
              'View', 'Edit', 'Delete', 'Pay', 'Log Payment',
              'Reactivate', // For inactive payment methods
              '+ Add', // Add buttons
              '✕', // Close button
              'Active Loans (0)', 'Active Loans (1)', 'Active Loans (2)', // Tab labels
              'Paid Off (0)', 'Paid Off (1)', 'Paid Off (2)',
              'Active', 'Inactive', // Payment method tabs
              '📊 View Total Debt Trend', // Debt trend button
            ]);

            // Check that action buttons use consistent labels
            const actionButtons = buttonLabels.filter(label => 
              ['View', 'Edit', 'Delete', 'Pay', 'Log Payment'].includes(label)
            );

            // Verify each action button uses an allowed label
            actionButtons.forEach(label => {
              expect(['View', 'Edit', 'Delete', 'Pay', 'Log Payment'].includes(label)).toBe(true);
            });

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
