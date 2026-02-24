/**
 * Property-Based Test: Modal Overlay Consistency
 * Feature: ux-consistency, Property 1: Modal overlay consistency
 *
 * For any modal in {AnalyticsHubModal, FinancialOverviewModal, BudgetsModal,
 * MerchantAnalyticsModal, PeopleManagementModal, CreditCardDetailView,
 * PersonAllocationModal}, verify the overlay element has class `modal-overlay`.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';

// Mock all API services to prevent real network calls
vi.mock('../services/analyticsApi', () => ({
  checkDataSufficiency: vi.fn().mockResolvedValue({
    availableFeatures: {},
    dataQualityScore: 50,
    monthsOfData: 6
  })
}));

vi.mock('../services/merchantAnalyticsApi', () => ({
  getTopMerchants: vi.fn().mockResolvedValue([]),
  getPeriodDisplayName: vi.fn().mockReturnValue('This Year'),
  getSortByDisplayName: vi.fn().mockReturnValue('Total Spend')
}));

vi.mock('../services/budgetApi', () => ({
  getBudgets: vi.fn().mockResolvedValue({ budgets: [] }),
  getBudgetSummary: vi.fn().mockResolvedValue({}),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  copyBudgets: vi.fn(),
  getBudgetSuggestion: vi.fn().mockResolvedValue({ suggestedAmount: 0 }),
  getBudgetHistory: vi.fn().mockResolvedValue({ categories: {} })
}));

vi.mock('../services/categoriesApi', () => ({
  getCategories: vi.fn().mockResolvedValue([])
}));

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn().mockResolvedValue([]),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn()
}));

vi.mock('../services/creditCardApi', () => ({
  getCreditCardDetail: vi.fn().mockResolvedValue({
    cardDetails: {
      id: 1,
      display_name: 'Test Card',
      full_name: 'Test Card',
      current_balance: 500,
      credit_limit: 5000,
      is_active: true,
      billing_cycle_day: 15,
      payment_due_day: 1,
      utilization_percentage: 10,
      days_until_due: 15,
      statement_balance: null,
      current_cycle: null
    },
    payments: [],
    billingCycles: [],
    statementBalanceInfo: null,
    currentCycleStatus: null,
    errors: []
  }),
  getStatementBalance: vi.fn().mockResolvedValue(0),
  getCurrentCycleStatus: vi.fn().mockResolvedValue(null),
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

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}));

// Import components after mocks
import AnalyticsHubModal from './AnalyticsHubModal';
import FinancialOverviewModal from './FinancialOverviewModal';
import BudgetsModal from './BudgetsModal';
import MerchantAnalyticsModal from './MerchantAnalyticsModal';
import PeopleManagementModal from './PeopleManagementModal';
import CreditCardDetailView from './CreditCardDetailView';
import PersonAllocationModal from './PersonAllocationModal';


// Modal component configurations with minimal required props
const MODAL_CONFIGS = [
  {
    name: 'AnalyticsHubModal',
    Component: AnalyticsHubModal,
    props: { isOpen: true, onClose: vi.fn(), currentYear: 2024, currentMonth: 6 }
  },
  {
    name: 'FinancialOverviewModal',
    Component: FinancialOverviewModal,
    props: { isOpen: true, onClose: vi.fn(), year: 2024, month: 6 }
  },
  {
    name: 'BudgetsModal',
    Component: BudgetsModal,
    props: { isOpen: true, onClose: vi.fn(), year: 2024, month: 6 }
  },
  {
    name: 'MerchantAnalyticsModal',
    Component: MerchantAnalyticsModal,
    props: { isOpen: true, onClose: vi.fn() }
  },
  {
    name: 'PeopleManagementModal',
    Component: PeopleManagementModal,
    props: { isOpen: true, onClose: vi.fn() }
  },
  {
    name: 'CreditCardDetailView',
    Component: CreditCardDetailView,
    props: { paymentMethodId: 1, isOpen: true, onClose: vi.fn() }
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

describe('UX Consistency - Modal Overlay Property Tests', () => {
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
   * **Feature: ux-consistency, Property 1: Modal overlay consistency**
   *
   * For any modal component in the set {AnalyticsHubModal, FinancialOverviewModal,
   * BudgetsModal, MerchantAnalyticsModal, PeopleManagementModal, CreditCardDetailView,
   * PersonAllocationModal}, when rendered, the overlay element should have the class
   * `modal-overlay`.
   *
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  it('Property 1: Modal overlay consistency', async () => {
    const modalIndexArb = fc.integer({ min: 0, max: MODAL_CONFIGS.length - 1 });

    await fc.assert(
      fc.asyncProperty(
        modalIndexArb,
        async (index) => {
          const config = MODAL_CONFIGS[index];
          const { container, unmount } = render(
            <config.Component {...config.props} />
          );

          // Wait for async effects
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
          });

          // The first child of the container should be the overlay with modal-overlay class
          const overlay = container.querySelector('.modal-overlay');
          expect(
            overlay,
            `${config.name} should have an element with class "modal-overlay"`
          ).toBeTruthy();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
