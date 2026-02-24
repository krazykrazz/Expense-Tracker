/**
 * Property-Based Test: Button Visual Hierarchy
 * Feature: ux-consistency, Property 9: Button visual hierarchy
 *
 * For any component rendering both primary and cancel buttons, verify primary
 * uses `.btn-primary` and cancel uses `.btn-cancel`.
 *
 * **Validates: Requirements 8.4**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';

// Mock all API services
vi.mock('../services/creditCardApi', () => ({
  recordPayment: vi.fn().mockResolvedValue({}),
  getStatementBalance: vi.fn().mockResolvedValue(0),
  getCurrentCycleStatus: vi.fn().mockResolvedValue(null),
  getCreditCardDetail: vi.fn().mockResolvedValue({ cardDetails: {}, payments: [], billingCycles: [], errors: [] }),
  deletePayment: vi.fn(),
  deleteBillingCycle: vi.fn(),
  getBillingCyclePdfUrl: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn().mockResolvedValue([]),
  getPaymentMethod: vi.fn().mockResolvedValue(null),
  deletePaymentMethod: vi.fn(),
  setPaymentMethodActive: vi.fn()
}));

vi.mock('../services/loanApi', () => ({
  getAllLoans: vi.fn().mockResolvedValue([]),
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  deleteLoan: vi.fn()
}));

vi.mock('../services/fixedExpenseApi', () => ({
  getFixedExpensesByLoan: vi.fn().mockResolvedValue([])
}));

vi.mock('../services/investmentApi', () => ({
  getAllInvestments: vi.fn().mockResolvedValue([]),
  createInvestment: vi.fn(),
  updateInvestment: vi.fn(),
  deleteInvestment: vi.fn()
}));

vi.mock('../services/investmentValueApi', () => ({
  default: { getValues: vi.fn().mockResolvedValue([]) }
}));

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn().mockResolvedValue([]),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn()
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}));

import CreditCardPaymentForm from './CreditCardPaymentForm';
import PersonAllocationModal from './PersonAllocationModal';
import PeopleManagementModal from './PeopleManagementModal';
import FinancialOverviewModal from './FinancialOverviewModal';

/**
 * Components that render both primary and cancel buttons.
 * CreditCardPaymentForm: submit (btn-primary) + cancel (btn-cancel)
 * PersonAllocationModal: save (btn-primary) + cancel (btn-cancel)
 * PeopleManagementModal: save (btn-primary) + cancel (btn-cancel) — when editing
 * FinancialOverviewModal: submit (btn-primary) + cancel (btn-cancel) — in loan/investment forms
 */
const COMPONENT_CONFIGS = [
  {
    name: 'CreditCardPaymentForm',
    Component: CreditCardPaymentForm,
    props: {
      paymentMethodId: 1,
      paymentMethodName: 'Test Card',
      currentBalance: 500,
      onPaymentRecorded: vi.fn(),
      onCancel: vi.fn()
    }
  },
  {
    name: 'PersonAllocationModal',
    Component: PersonAllocationModal,
    props: {
      isOpen: true,
      expense: { id: 1, amount: 100, description: 'Test' },
      selectedPeople: [{ id: 1, name: 'Test Person' }],
      onSave: vi.fn(),
      onCancel: vi.fn()
    }
  }
];

describe('UX Consistency - Button Visual Hierarchy Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * **Feature: ux-consistency, Property 9: Button visual hierarchy**
   *
   * For any component rendering both primary and cancel buttons, verify primary
   * uses `.btn-primary` and cancel uses `.btn-cancel`.
   *
   * **Validates: Requirements 8.4**
   */
  it('Property 9: Button visual hierarchy', async () => {
    const componentIndexArb = fc.integer({ min: 0, max: COMPONENT_CONFIGS.length - 1 });

    await fc.assert(
      fc.asyncProperty(
        componentIndexArb,
        async (index) => {
          const config = COMPONENT_CONFIGS[index];
          const { container, unmount } = render(
            <config.Component {...config.props} />
          );

          // Wait for async effects
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
          });

          // Both btn-primary and btn-cancel should be present
          const primaryButtons = container.querySelectorAll('.btn-primary');
          const cancelButtons = container.querySelectorAll('.btn-cancel');

          expect(
            primaryButtons.length,
            `${config.name} should have at least one .btn-primary button`
          ).toBeGreaterThanOrEqual(1);

          expect(
            cancelButtons.length,
            `${config.name} should have at least one .btn-cancel button`
          ).toBeGreaterThanOrEqual(1);

          // Verify no button has both classes (they should be distinct)
          const allButtons = container.querySelectorAll('button');
          allButtons.forEach(btn => {
            const hasPrimary = btn.classList.contains('btn-primary');
            const hasCancel = btn.classList.contains('btn-cancel');
            expect(
              hasPrimary && hasCancel,
              `No button in ${config.name} should have both btn-primary and btn-cancel`
            ).toBe(false);
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
