/**
 * Property-Based Tests for CreditCardDetailView unified endpoint integration.
 * Tests Properties 8 and 9 from the billing-cycle-api-optimization design.
 *
 * @invariant Unified Response Rendering: For any valid unified API response, the frontend renders all sections (card name, balance, payments, billing cycles) without errors; for any response with null sections and non-empty errors array, the component renders gracefully without crashing and displays a warning banner.
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
  getBillingCyclePdfUrl: vi.fn(() => '/mock-pdf-url')
}));

import * as creditCardApi from '../services/creditCardApi';
import CreditCardDetailView from './CreditCardDetailView';

// ── Generators ──

const arbCardDetails = fc.record({
  id: fc.integer({ min: 1, max: 1000 }),
  display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
  full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  type: fc.constant('credit_card'),
  current_balance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  credit_limit: fc.double({ min: 100, max: 100000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  utilization_percentage: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 10) / 10),
  billing_cycle_day: fc.integer({ min: 1, max: 28 }),
  billing_cycle_start: fc.integer({ min: 1, max: 28 }),
  billing_cycle_end: fc.integer({ min: 1, max: 28 }),
  payment_due_day: fc.integer({ min: 1, max: 28 }),
  days_until_due: fc.integer({ min: 0, max: 30 }),
  statement_balance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  is_active: fc.constantFrom(0, 1),
  expense_count: fc.integer({ min: 0, max: 500 }),
  current_cycle: fc.record({
    start_date: fc.constant('2026-01-01'),
    end_date: fc.constant('2026-01-31'),
    transaction_count: fc.integer({ min: 0, max: 100 }),
    total_amount: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    payment_count: fc.integer({ min: 0, max: 20 }),
    payment_total: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100)
  }),
  has_pending_expenses: fc.boolean(),
  projected_balance: fc.oneof(
    fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
    fc.constant(null)
  )
});

const arbPayment = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  payment_method_id: fc.constant(1),
  amount: fc.double({ min: 0.01, max: 50000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  payment_date: fc.constant('2026-01-15'),
  notes: fc.oneof(fc.constant(null), fc.string({ maxLength: 50 })),
  created_at: fc.constant('2026-01-15T12:00:00Z')
});

const arbBillingCycle = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  payment_method_id: fc.constant(1),
  cycle_start_date: fc.constant('2025-12-01'),
  cycle_end_date: fc.constant('2025-12-31'),
  actual_statement_balance: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  calculated_statement_balance: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  effective_balance: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  balance_type: fc.constantFrom('actual', 'calculated'),
  transaction_count: fc.integer({ min: 0, max: 100 }),
  trend_indicator: fc.constant(null),
  minimum_payment: fc.oneof(fc.constant(null), fc.double({ min: 10, max: 500, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100)),
  due_date: fc.constant(null),
  notes: fc.constant(null),
  statement_pdf_path: fc.constant(null)
});

const arbCompleteResponse = fc.record({
  cardDetails: arbCardDetails,
  payments: fc.array(arbPayment, { minLength: 0, maxLength: 5 }),
  statementBalanceInfo: fc.record({
    statementBalance: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
    cycleStartDate: fc.constant('2026-01-01'),
    cycleEndDate: fc.constant('2026-01-31'),
    totalExpenses: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
    totalPayments: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
    isPaid: fc.boolean()
  }),
  currentCycleStatus: fc.record({
    hasActualBalance: fc.boolean(),
    cycleStartDate: fc.constant('2026-01-01'),
    cycleEndDate: fc.constant('2026-01-31'),
    actualBalance: fc.oneof(fc.constant(null), fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100)),
    calculatedBalance: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
    daysUntilCycleEnd: fc.integer({ min: 0, max: 30 }),
    needsEntry: fc.boolean()
  }),
  billingCycles: fc.array(arbBillingCycle, { minLength: 0, maxLength: 5 }),
  errors: fc.constant([])
});

const SECTIONS = ['payments', 'statementBalance', 'currentCycleStatus', 'billingCycles'];

const arbFailureCombination = fc.subarray(SECTIONS, { minLength: 1, maxLength: 4 });

describe('CreditCardDetailView - Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Feature: billing-cycle-api-optimization, Property 8: Frontend renders all unified response sections
  it('Property 8: Frontend renders all unified response sections without errors', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(arbCompleteResponse, async (response) => {
        vi.clearAllMocks();
        creditCardApi.getCreditCardDetail.mockResolvedValue(response);

        const { unmount, container } = render(
          <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
        );

        // Component should render card name in heading
        await waitFor(() => {
          const heading = container.querySelector('.cc-detail-title h2');
          expect(heading).not.toBeNull();
          expect(heading.textContent.trim()).toBe(response.cardDetails.display_name.trim());
        });

        // Payment count should appear in tab
        const paymentTabText = `Payments (${response.payments.length})`;
        expect(screen.getByRole('button', { name: new RegExp(paymentTabText.replace('(', '\\(').replace(')', '\\)')) })).toBeInTheDocument();

        // Billing cycle count should appear in tab
        const cycleCount = response.cardDetails.billing_cycle_day ? response.billingCycles.length : 0;
        const cycleTabText = `Billing Cycles (${cycleCount})`;
        expect(screen.getByRole('button', { name: new RegExp(cycleTabText.replace('(', '\\(').replace(')', '\\)')) })).toBeInTheDocument();

        // No error alert should be shown (errors array is empty)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        unmount();
        cleanup();
      }),
      { numRuns: 30 }
    );
  });

  // Feature: billing-cycle-api-optimization, Property 9: Frontend handles partial data gracefully
  it('Property 9: Frontend handles partial data gracefully without crashing', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(arbCardDetails, arbFailureCombination, async (cardDetails, failedSections) => {
        vi.clearAllMocks();

        const errors = failedSections.map(section => ({
          section,
          message: `Failed to load ${section}`
        }));

        const partialResponse = {
          cardDetails,
          payments: failedSections.includes('payments') ? [] : [{ id: 1, payment_method_id: 1, amount: 100, payment_date: '2026-01-15', notes: null, created_at: '2026-01-15T12:00:00Z' }],
          statementBalanceInfo: failedSections.includes('statementBalance') ? null : { statementBalance: 300, cycleStartDate: '2026-01-01', cycleEndDate: '2026-01-31', totalExpenses: 500, totalPayments: 200, isPaid: false },
          currentCycleStatus: failedSections.includes('currentCycleStatus') ? null : { hasActualBalance: false, cycleStartDate: '2026-01-01', cycleEndDate: '2026-01-31', actualBalance: null, calculatedBalance: 300, daysUntilCycleEnd: 10, needsEntry: true },
          billingCycles: failedSections.includes('billingCycles') ? [] : [],
          errors
        };

        creditCardApi.getCreditCardDetail.mockResolvedValue(partialResponse);

        const { unmount, container } = render(
          <CreditCardDetailView paymentMethodId={1} isOpen={true} onClose={() => {}} onUpdate={() => {}} />
        );

        // Component should render without crashing - card name visible in heading
        await waitFor(() => {
          const heading = container.querySelector('.cc-detail-title h2');
          expect(heading).not.toBeNull();
          expect(heading.textContent.trim()).toBe(cardDetails.display_name.trim());
        });

        // Warning alert should be shown for partial failures
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert.textContent).toContain('Some data could not be loaded');

        // Each failed section should be mentioned in the warning
        for (const section of failedSections) {
          expect(alert.textContent).toContain(section);
        }

        unmount();
        cleanup();
      }),
      { numRuns: 20 }
    );
  });
});
