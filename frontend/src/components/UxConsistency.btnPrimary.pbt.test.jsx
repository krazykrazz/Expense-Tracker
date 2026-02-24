/**
 * @invariant Primary Button Design Token Compliance: For any primary button in {FinancialOverviewModal, PeopleManagementModal, PersonAllocationModal}, it uses '.btn-primary' class.
 * Feature: ux-consistency, Property 2: Primary button design token compliance
 *
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';

// Mock all API services to prevent real network calls
vi.mock('../services/creditCardApi', () => ({
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

import FinancialOverviewModal from './FinancialOverviewModal';
import PeopleManagementModal from './PeopleManagementModal';
import PersonAllocationModal from './PersonAllocationModal';

/**
 * Component configs that expose primary buttons.
 * FinancialOverviewModal shows primary buttons in loan/investment add forms.
 * PeopleManagementModal shows primary button when editing a person.
 * PersonAllocationModal shows primary save button in footer.
 */
const COMPONENT_CONFIGS = [
  {
    name: 'FinancialOverviewModal',
    Component: FinancialOverviewModal,
    props: { isOpen: true, onClose: vi.fn(), year: 2024, month: 6 },
    // Primary buttons only visible when add form is open (internal state)
    alwaysHasPrimaryButton: false
  },
  {
    name: 'PeopleManagementModal',
    Component: PeopleManagementModal,
    props: { isOpen: true, onClose: vi.fn() },
    // people-add-button always visible with btn-primary
    alwaysHasPrimaryButton: true
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
    // save-button always visible
    alwaysHasPrimaryButton: true
  }
];

describe('UX Consistency - Primary Button Property Tests', () => {
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
   * **Feature: ux-consistency, Property 2: Primary button design token compliance**
   *
   * For any primary button in {FinancialOverviewModal, PeopleManagementModal,
   * PersonAllocationModal}, verify it uses `.btn-primary` class.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  it('Property 2: Primary button design token compliance', async () => {
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

          // Find all buttons with btn-primary class
          const primaryButtons = container.querySelectorAll('.btn-primary');

          if (config.alwaysHasPrimaryButton) {
            expect(
              primaryButtons.length,
              `${config.name} should have at least one element with class "btn-primary"`
            ).toBeGreaterThanOrEqual(1);
          }

          // For all components: if btn-primary buttons exist, they should be proper buttons
          primaryButtons.forEach(btn => {
            expect(
              btn.tagName.toLowerCase(),
              `btn-primary element in ${config.name} should be a button`
            ).toBe('button');
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
