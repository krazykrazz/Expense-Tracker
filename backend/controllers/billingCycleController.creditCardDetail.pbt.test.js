/**
 * Property-Based Tests for Credit Card Detail Unified Endpoint
 *
 * @invariant Response Completeness & Resilience: For any credit card with billing_cycle_day configured, the unified endpoint returns all response sections with an empty errors array; the response respects billingCycleLimit bounds; cards without billing_cycle_day receive null billing sections; and any combination of partial service failures yields a 200 with populated errors array and null for failed sections.
 */

// Mock dependencies
jest.mock('../services/billingCycleHistoryService');
jest.mock('../services/paymentMethodService', () => ({
  getCreditCardWithComputedFields: jest.fn()
}));
jest.mock('../repositories/paymentMethodRepository', () => ({
  findById: jest.fn()
}));
jest.mock('../repositories/creditCardPaymentRepository', () => ({
  findByPaymentMethodId: jest.fn()
}));
jest.mock('../services/statementBalanceService', () => ({
  calculateStatementBalance: jest.fn()
}));
jest.mock('../services/activityLogService', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('../config/paths', () => ({
  getStatementsPath: jest.fn().mockReturnValue('/mock/statements')
}));
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  createReadStream: jest.fn()
}));
jest.mock('../repositories/billingCycleRepository', () => ({
  findById: jest.fn()
}));
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const billingCycleController = require('./billingCycleController');
const paymentMethodService = require('../services/paymentMethodService');
const creditCardPaymentRepository = require('../repositories/creditCardPaymentRepository');
const statementBalanceService = require('../services/statementBalanceService');
const billingCycleHistoryService = require('../services/billingCycleHistoryService');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');

// --- Shared arbitraries ---

const arbBillingCycleDay = fc.integer({ min: 1, max: 28 });

const arbCardDetails = (billingCycleDay) => ({
  id: 1,
  display_name: 'Test Card',
  full_name: 'Test Card Full',
  type: 'credit_card',
  current_balance: 500,
  credit_limit: 5000,
  billing_cycle_day: billingCycleDay,
  payment_due_day: 5,
  is_active: true,
  utilization_percentage: 10,
  days_until_due: 12,
  statement_balance: 450,
  expense_count: 3,
  current_cycle: null,
  has_pending_expenses: false,
  projected_balance: 600
});

const arbPayment = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  payment_method_id: fc.constant(1),
  amount: fc.double({ min: 0.01, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
  payment_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => {
    try { return d.toISOString().split('T')[0]; } catch { return '2024-01-01'; }
  }),
  notes: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
  created_at: fc.constant('2025-01-01T00:00:00Z')
});

const arbStatementBalance = fc.record({
  statementBalance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
  cycleStartDate: fc.constant('2025-12-16'),
  cycleEndDate: fc.constant('2026-01-15'),
  totalExpenses: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
  totalPayments: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
  isPaid: fc.boolean()
});

const arbCycleStatus = fc.record({
  cycleStartDate: fc.constant('2026-01-16'),
  cycleEndDate: fc.constant('2026-02-15'),
  calculatedBalance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
  hasActualBalance: fc.boolean(),
  actualBalance: fc.option(fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100), { nil: null })
});

const arbBillingCycle = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  payment_method_id: fc.constant(1),
  cycle_start_date: fc.constant('2026-01-16'),
  cycle_end_date: fc.constant('2026-02-15'),
  effective_balance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }).map(v => Math.round(v * 100) / 100),
  balance_type: fc.constantFrom('actual', 'calculated'),
  transaction_count: fc.integer({ min: 0, max: 100 })
});

/** Helper: invoke getCreditCardDetail with mocked req/res */
async function callEndpoint(query = {}) {
  const req = { params: { id: '1' }, query };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await billingCycleController.getCreditCardDetail(req, res);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('Unified Credit Card Detail Endpoint - Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Feature: billing-cycle-api-optimization, Property 4: Unified endpoint response completeness
  test('Property 4: response contains all non-null sections when card has billing_cycle_day', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBillingCycleDay,
        fc.array(arbPayment, { minLength: 0, maxLength: 5 }),
        arbStatementBalance,
        arbCycleStatus,
        fc.array(arbBillingCycle, { minLength: 0, maxLength: 5 }),
        async (billingDay, payments, stmtBalance, cycleStatus, cycles) => {
          paymentMethodService.getCreditCardWithComputedFields.mockResolvedValue(arbCardDetails(billingDay));
          creditCardPaymentRepository.findByPaymentMethodId.mockResolvedValue(payments);
          statementBalanceService.calculateStatementBalance.mockResolvedValue(stmtBalance);
          billingCycleHistoryService.getCurrentCycleStatus.mockResolvedValue(cycleStatus);
          billingCycleHistoryService.getUnifiedBillingCycles.mockResolvedValue({
            billingCycles: cycles, autoGeneratedCount: 0, totalCount: cycles.length
          });

          const { status, body } = await callEndpoint();

          expect(status).toBe(200);
          expect(body.cardDetails).toBeDefined();
          expect(body.cardDetails.billing_cycle_day).toBe(billingDay);
          expect(body.payments).toEqual(payments);
          expect(body.statementBalanceInfo).toEqual(stmtBalance);
          expect(body.currentCycleStatus).toEqual(cycleStatus);
          expect(body.billingCycles).toEqual(cycles);
          expect(body.errors).toEqual([]);
        }
      ),
      pbtOptions()
    );
  });

  // Feature: billing-cycle-api-optimization, Property 5: Unified endpoint billing cycle limit
  test('Property 5: billingCycles array length never exceeds billingCycleLimit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 60 }),
        async (limit, totalCycleCount) => {
          const card = arbCardDetails(15);
          paymentMethodService.getCreditCardWithComputedFields.mockResolvedValue(card);
          creditCardPaymentRepository.findByPaymentMethodId.mockResolvedValue([]);
          statementBalanceService.calculateStatementBalance.mockResolvedValue(null);
          billingCycleHistoryService.getCurrentCycleStatus.mockResolvedValue(null);

          // Service returns at most `limit` cycles (simulating the service respecting the limit)
          const returnedCount = Math.min(totalCycleCount, limit);
          const cycles = Array.from({ length: returnedCount }, (_, i) => ({
            id: i + 1, payment_method_id: 1,
            cycle_start_date: '2026-01-16', cycle_end_date: '2026-02-15',
            effective_balance: 100, balance_type: 'calculated', transaction_count: 1
          }));
          billingCycleHistoryService.getUnifiedBillingCycles.mockResolvedValue({
            billingCycles: cycles, autoGeneratedCount: 0, totalCount: returnedCount
          });

          const { status, body } = await callEndpoint({ billingCycleLimit: String(limit) });

          expect(status).toBe(200);
          expect(body.billingCycles.length).toBeLessThanOrEqual(limit);
          // Verify the limit was passed through to the service
          expect(billingCycleHistoryService.getUnifiedBillingCycles).toHaveBeenCalledWith(1, { limit });
        }
      ),
      pbtOptions()
    );
  });

  // Feature: billing-cycle-api-optimization, Property 6: Unified endpoint handles missing billing_cycle_day
  test('Property 6: null/empty billing sections when billing_cycle_day is not configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbPayment, { minLength: 0, maxLength: 5 }),
        async (payments) => {
          const card = arbCardDetails(null); // no billing_cycle_day
          paymentMethodService.getCreditCardWithComputedFields.mockResolvedValue(card);
          creditCardPaymentRepository.findByPaymentMethodId.mockResolvedValue(payments);

          const { status, body } = await callEndpoint();

          expect(status).toBe(200);
          expect(body.cardDetails.billing_cycle_day).toBeNull();
          expect(body.payments).toEqual(payments);
          expect(body.statementBalanceInfo).toBeNull();
          expect(body.currentCycleStatus).toBeNull();
          expect(body.billingCycles).toEqual([]);
          expect(body.errors).toEqual([]);
          // Billing-cycle services should NOT have been called
          expect(statementBalanceService.calculateStatementBalance).not.toHaveBeenCalled();
          expect(billingCycleHistoryService.getCurrentCycleStatus).not.toHaveBeenCalled();
          expect(billingCycleHistoryService.getUnifiedBillingCycles).not.toHaveBeenCalled();
        }
      ),
      pbtOptions()
    );
  });

  // Feature: billing-cycle-api-optimization, Property 7: Unified endpoint partial failure resilience
  test('Property 7: partial failures produce 200 with errors array matching failed sections', async () => {
    const arbFailureCombination = fc.record({
      paymentsFail: fc.boolean(),
      statementBalanceFail: fc.boolean(),
      currentCycleStatusFail: fc.boolean(),
      billingCyclesFail: fc.boolean()
    });

    await fc.assert(
      fc.asyncProperty(
        arbFailureCombination,
        async (failures) => {
          const card = arbCardDetails(15);
          paymentMethodService.getCreditCardWithComputedFields.mockResolvedValue(card);

          // Configure each service to succeed or fail based on the combination
          if (failures.paymentsFail) {
            creditCardPaymentRepository.findByPaymentMethodId.mockRejectedValue(new Error('payments error'));
          } else {
            creditCardPaymentRepository.findByPaymentMethodId.mockResolvedValue([{ id: 1, amount: 50 }]);
          }

          if (failures.statementBalanceFail) {
            statementBalanceService.calculateStatementBalance.mockRejectedValue(new Error('balance error'));
          } else {
            statementBalanceService.calculateStatementBalance.mockResolvedValue({ statementBalance: 100 });
          }

          if (failures.currentCycleStatusFail) {
            billingCycleHistoryService.getCurrentCycleStatus.mockRejectedValue(new Error('status error'));
          } else {
            billingCycleHistoryService.getCurrentCycleStatus.mockResolvedValue({ calculatedBalance: 200 });
          }

          if (failures.billingCyclesFail) {
            billingCycleHistoryService.getUnifiedBillingCycles.mockRejectedValue(new Error('cycles error'));
          } else {
            billingCycleHistoryService.getUnifiedBillingCycles.mockResolvedValue({
              billingCycles: [{ id: 1 }], autoGeneratedCount: 0, totalCount: 1
            });
          }

          const { status, body } = await callEndpoint();

          // Always 200 — partial failure is not a server error
          expect(status).toBe(200);
          expect(body.cardDetails).toBeDefined();

          // Count expected failures
          const failedSections = [];
          if (failures.paymentsFail) failedSections.push('payments');
          if (failures.statementBalanceFail) failedSections.push('statementBalance');
          if (failures.currentCycleStatusFail) failedSections.push('currentCycleStatus');
          if (failures.billingCyclesFail) failedSections.push('billingCycles');

          expect(body.errors).toHaveLength(failedSections.length);
          const errorSections = body.errors.map(e => e.section);
          for (const section of failedSections) {
            expect(errorSections).toContain(section);
          }

          // Failed sections should be null/empty, successful ones should have data
          if (failures.paymentsFail) {
            expect(body.payments).toEqual([]);
          } else {
            expect(body.payments).toHaveLength(1);
          }

          if (failures.statementBalanceFail) {
            expect(body.statementBalanceInfo).toBeNull();
          } else {
            expect(body.statementBalanceInfo).toBeDefined();
          }

          if (failures.currentCycleStatusFail) {
            expect(body.currentCycleStatus).toBeNull();
          } else {
            expect(body.currentCycleStatus).toBeDefined();
          }

          if (failures.billingCyclesFail) {
            expect(body.billingCycles).toEqual([]);
          } else {
            expect(body.billingCycles).toHaveLength(1);
          }
        }
      ),
      pbtOptions()
    );
  });
});
