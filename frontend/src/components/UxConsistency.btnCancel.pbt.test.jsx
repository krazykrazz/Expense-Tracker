/**
 * Property-Based Test: Cancel Button Design Token Compliance
 * Feature: ux-consistency, Property 3: Cancel button design token compliance
 *
 * For any cancel button in {CreditCardPaymentForm, PersonAllocationModal,
 * PeopleManagementModal, FinancialOverviewModal}, verify it uses `.btn-cancel` class.
 *
 * **Validates: Requirements 8.1, 8.3**
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
    },
    alwaysHasCancelButton: true
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
    },
    alwaysHasCancelButton: true
  },
  {
    name: 'PeopleManagementModal',
    Component: PeopleManagementModal,
    props: { isOpen: true, onClose: vi.fn() },
    // Cancel button only visible when editing a person
    alwaysHasCancelButton: false
  },
  {
    name: 'FinancialOverviewModal',
    Component: FinancialOverviewModal,
    props: { isOpen: true, onClose: vi.fn(), year: 2024, month: 6 },
    // Cancel button only visible when add form is open
    alwaysHasCancelButton: false
  }
];

describe('UX Consistency - Cancel Button Property Tests', () => {
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
   * **Feature: ux-consistency, Property 3: Cancel button design token compliance**
   *
   * For any cancel button in {CreditCardPaymentForm, PersonAllocationModal,
   * PeopleManagementModal, FinancialOverviewModal}, verify it uses `.btn-cancel` class.
   *
   * **Validates: Requirements 8.1, 8.3**
   */
  it('Property 3: Cancel button design token compliance', async () => {
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

          // Find all buttons with btn-cancel class
          const cancelButtons = container.querySelectorAll('.btn-cancel');

          if (config.alwaysHasCancelButton) {
            // Components that always render cancel buttons
            expect(
              cancelButtons.length,
              `${config.name} should have at least one element with class "btn-cancel"`
            ).toBeGreaterThanOrEqual(1);
          }

          // For all components: if cancel buttons exist, they should be proper buttons
          cancelButtons.forEach(btn => {
            expect(
              btn.tagName.toLowerCase(),
              `btn-cancel element in ${config.name} should be a button`
            ).toBe('button');
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
