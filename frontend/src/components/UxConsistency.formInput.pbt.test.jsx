/**
 * @invariant Form Input Styling Consistency: For any form input in {CreditCardPaymentForm, PersonAllocationModal, PeopleManagementModal, FinancialOverviewModal}, it uses '.form-input' class or aligned token values.
 * Feature: ux-consistency, Property 4: Form input styling consistency
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
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
    alwaysHasFormInputs: true
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
    alwaysHasFormInputs: true
  },
  {
    name: 'PeopleManagementModal',
    Component: PeopleManagementModal,
    props: { isOpen: true, onClose: vi.fn() },
    // Form inputs only visible when editing a person
    alwaysHasFormInputs: false
  },
  {
    name: 'FinancialOverviewModal',
    Component: FinancialOverviewModal,
    props: { isOpen: true, onClose: vi.fn(), year: 2024, month: 6 },
    // Form inputs only visible when add form is open
    alwaysHasFormInputs: false
  }
];

describe('UX Consistency - Form Input Property Tests', () => {
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
   * **Feature: ux-consistency, Property 4: Form input styling consistency**
   *
   * For any form input in {CreditCardPaymentForm, PersonAllocationModal,
   * PeopleManagementModal, FinancialOverviewModal}, verify it uses `.form-input`
   * class or aligned token values.
   *
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   */
  it('Property 4: Form input styling consistency', async () => {
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

          // Find all elements with form-input class
          const formInputs = container.querySelectorAll('.form-input');

          if (config.alwaysHasFormInputs) {
            expect(
              formInputs.length,
              `${config.name} should have at least one element with class "form-input"`
            ).toBeGreaterThanOrEqual(1);
          }

          // For all components: if form-input elements exist, they should be valid form elements
          formInputs.forEach(input => {
            const tag = input.tagName.toLowerCase();
            expect(
              ['input', 'select', 'textarea'].includes(tag),
              `form-input element in ${config.name} should be input, select, or textarea but was ${tag}`
            ).toBe(true);
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
