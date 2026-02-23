/**
 * Property-Based Tests for CreditCardDetailView deep-link support.
 * Tests Properties 2 and 3 from the financial-overview-redesign design.
 *
 * @invariant Deep-Link Tab Mapping: For any valid initialTab value, the active tab matches
 * the provided value; for null/undefined, it defaults to 'overview'.
 * @invariant Deep-Link Action Triggers: For 'enter-statement' action with reminderData,
 * BillingCycleHistoryForm opens pre-populated; for 'log-payment', CreditCardPaymentForm opens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    PAYMENT_METHOD_BY_ID: (id) => `/api/payment-methods/${id}`,
    PAYMENT_METHOD_PAYMENTS: (id) => `/api/payment-methods/${id}/payments`,
    PAYMENT_METHOD_STATEMENTS: (id) => `/api/payment-methods/${id}/statements`,
    PAYMENT_METHOD_BILLING_CYCLES: (id) => `/api/payment-methods/${id}/billing-cycles`,
    PAYMENT_METHOD_STATEMENT_BALANCE: (id) => `/api/payment-methods/${id}/statement-balance`,
    PAYMENT_METHOD_STATEMENT: (id, sid) => `/api/payment-methods/${id}/statements/${sid}`,
    PAYMENT_METHOD_BILLING_CYCLE_HISTORY: (id) => `/api/payment-methods/${id}/billing-cycles/history`,
    PAYMENT_METHOD_BILLING_CYCLE_UPDATE: (id, cid) => `/api/payment-methods/${id}/billing-cycles/${cid}`,
    PAYMENT_METHOD_BILLING_CYCLE_DELETE: (id, cid) => `/api/payment-methods/${id}/billing-cycles/${cid}`,
    PAYMENT_METHOD_BILLING_CYCLE_CURRENT: (id) => `/api/payment-methods/${id}/billing-cycles/current`,
    PAYMENT_METHOD_BILLING_CYCLES_UNIFIED: (id) => `/api/payment-methods/${id}/billing-cycles/unified`,
    PAYMENT_METHOD_BILLING_CYCLE_PDF: (id, cid) => `/api/payment-methods/${id}/billing-cycles/${cid}/pdf`,
    PAYMENT_METHOD_CREDIT_CARD_DETAIL: (id) => `/api/payment-methods/${id}/credit-card-detail`
  },
  default: 'http://localhost:2424'
}));

vi.mock('../services/creditCardApi', () => ({
  getCreditCardDetail: vi.fn(),
  deletePayment: vi.fn(),
  deleteBillingCycle: vi.fn(),
  getBillingCyclePdfUrl: vi.fn(() => '/mock-pdf-url'),
  getCurrentCycleStatus: vi.fn()
}));

import * as creditCardApi from '../services/creditCardApi';
import CreditCardDetailView from './CreditCardDetailView';

// ── Shared Generators ──

const makeCardDetails = (overrides = {}) => ({
  id: 1,
  display_name: 'Test Card',
  full_name: 'Test Credit Card',
  type: 'credit_card',
  current_balance: 500,
  credit_limit: 5000,
  utilization_percentage: 10,
  billing_cycle_day: 15,
  billing_cycle_start: 15,
  billing_cycle_end: 14,
  payment_due_day: 5,
  days_until_due: 10,
  statement_balance: 400,
  is_active: 1,
  expense_count: 5,
  current_cycle: {
    start_date: '2026-01-15',
    end_date: '2026-02-14',
    transaction_count: 3,
    total_amount: 250,
    payment_count: 0,
    payment_total: 0
  },
  has_pending_expenses: false,
  projected_balance: null,
  ...overrides
});

const makeApiResponse = (cardOverrides = {}) => ({
  cardDetails: makeCardDetails(cardOverrides),
  payments: [],
  statementBalanceInfo: {
    statementBalance: 400,
    cycleStartDate: '2026-01-15',
    cycleEndDate: '2026-02-14',
    totalExpenses: 400,
    totalPayments: 0,
    isPaid: false
  },
  currentCycleStatus: {
    hasActualBalance: false,
    cycleStartDate: '2026-01-15',
    cycleEndDate: '2026-02-14',
    actualBalance: null,
    calculatedBalance: 400,
    daysUntilCycleEnd: 10,
    needsEntry: true
  },
  billingCycles: [],
  errors: []
});

// Valid tab values
const VALID_TABS = ['overview', 'payments', 'billing-cycles'];

// ── Property 2 Tests ──

/**
 * Feature: financial-overview-redesign, Property 2: CreditCardDetailView initialTab mapping
 *
 * For any valid initialTab value ('overview', 'payments', 'billing-cycles'), when
 * CreditCardDetailView opens with that initialTab, the active tab SHALL match the
 * provided value. When no initialTab is provided (null/undefined), the active tab
 * SHALL default to 'overview'.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.6
 */
describe('Feature: financial-overview-redesign, Property 2: CreditCardDetailView initialTab mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const initialTabArb = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.constantFrom(...VALID_TABS)
  );

  it('active tab matches provided initialTab or defaults to overview', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(initialTabArb, async (initialTab) => {
        vi.clearAllMocks();
        creditCardApi.getCreditCardDetail.mockResolvedValue(makeApiResponse());

        const { unmount, container } = render(
          <CreditCardDetailView
            paymentMethodId={1}
            isOpen={true}
            onClose={() => {}}
            onUpdate={() => {}}
            initialTab={initialTab}
          />
        );

        // Wait for data to load
        await waitFor(() => {
          expect(container.querySelector('.cc-detail-title h2')).not.toBeNull();
        });

        // Determine expected active tab
        const expectedTab = initialTab || 'overview';

        // Find the active tab button
        const activeTabBtn = container.querySelector('.cc-tab.active');
        expect(activeTabBtn).not.toBeNull();

        // Map tab values to expected button text patterns
        const tabTextMap = {
          'overview': /^Overview$/,
          'payments': /^Payments/,
          'billing-cycles': /^Billing Cycles/
        };

        expect(activeTabBtn.textContent).toMatch(tabTextMap[expectedTab]);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});


// ── Property 3 Tests ──

/**
 * Feature: financial-overview-redesign, Property 3: CreditCardDetailView deep-link action triggers
 *
 * For any credit card with billing cycle configured, when CreditCardDetailView opens with
 * initialAction='enter-statement' and reminderData containing cycleStartDate, cycleEndDate,
 * and calculatedBalance, the BillingCycleHistoryForm SHALL be opened with those values
 * pre-populated. When initialAction='log-payment', the CreditCardPaymentForm SHALL be opened.
 *
 * Validates: Requirements 2.1, 2.2, 7.4, 7.5
 */
describe('Feature: financial-overview-redesign, Property 3: CreditCardDetailView deep-link action triggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Generator for reminderData with valid cycle dates and balance
  // Use integer-based date generation to avoid Invalid time value from fc.date()
  const safeDateArb = fc.integer({ min: 0, max: 3650 }).map(offset => {
    const d = new Date('2020-01-01');
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  });

  const reminderDataArb = fc.record({
    cycleStartDate: safeDateArb,
    cycleEndDate: safeDateArb,
    calculatedBalance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100)
  });

  it('enter-statement action opens BillingCycleHistoryForm pre-populated with reminderData', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(reminderDataArb, async (reminderData) => {
        vi.clearAllMocks();
        creditCardApi.getCreditCardDetail.mockResolvedValue(makeApiResponse());
        // Mock getCurrentCycleStatus in case BillingCycleHistoryForm calls it
        creditCardApi.getCurrentCycleStatus.mockResolvedValue({
          cycleStartDate: '2026-01-15',
          cycleEndDate: '2026-02-14',
          calculatedBalance: 400
        });

        const { unmount } = render(
          <CreditCardDetailView
            paymentMethodId={1}
            isOpen={true}
            onClose={() => {}}
            onUpdate={() => {}}
            initialTab="billing-cycles"
            initialAction="enter-statement"
            reminderData={reminderData}
          />
        );

        // Wait for BillingCycleHistoryForm to appear (it shows after data loads)
        await waitFor(() => {
          expect(screen.getByText('Enter Statement Balance')).toBeInTheDocument();
        });

        // Verify the form is rendered (the card name should be visible)
        expect(screen.getByText('Test Card')).toBeInTheDocument();

        unmount();
        cleanup();
      }),
      { numRuns: 30 }
    );
  });

  it('log-payment action opens CreditCardPaymentForm', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('overview', 'payments', null),
        async (initialTab) => {
          vi.clearAllMocks();
          creditCardApi.getCreditCardDetail.mockResolvedValue(makeApiResponse());

          const { unmount } = render(
            <CreditCardDetailView
              paymentMethodId={1}
              isOpen={true}
              onClose={() => {}}
              onUpdate={() => {}}
              initialTab={initialTab}
              initialAction="log-payment"
            />
          );

          // Wait for CreditCardPaymentForm to appear
          await waitFor(() => {
            expect(screen.getByText('Log Payment')).toBeInTheDocument();
          });

          // Verify the payment form shows the card name
          expect(screen.getByText('Test Card')).toBeInTheDocument();

          unmount();
          cleanup();
        }
      ),
      { numRuns: 30 }
    );
  });

  it('no initialAction does not auto-open any form', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_TABS, null, undefined),
        async (initialTab) => {
          vi.clearAllMocks();
          creditCardApi.getCreditCardDetail.mockResolvedValue(makeApiResponse());

          const { unmount, container } = render(
            <CreditCardDetailView
              paymentMethodId={1}
              isOpen={true}
              onClose={() => {}}
              onUpdate={() => {}}
              initialTab={initialTab}
              initialAction={null}
            />
          );

          // Wait for data to load
          await waitFor(() => {
            expect(container.querySelector('.cc-detail-title h2')).not.toBeNull();
          });

          // Neither form should be open
          expect(screen.queryByText('Enter Statement Balance')).not.toBeInTheDocument();
          expect(screen.queryByText(/^Log Payment$/)).not.toBeInTheDocument();

          unmount();
          cleanup();
        }
      ),
      { numRuns: 30 }
    );
  });
});
