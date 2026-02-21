/**
 * BillingCycleHistoryService — Facade
 *
 * Thin re-export module that preserves the original public API by delegating
 * to the three focused services extracted during the billing-cycle-simplification
 * refactoring (Phase 2).  All existing consumers (controllers, scheduler, tests)
 * continue to `require('./billingCycleHistoryService')` and call the same methods
 * with identical signatures and return types.
 *
 * _Requirements: 4.5, 4.6, 4.7_
 */

const cycleCrudService = require('./cycleCrudService');
const cycleAnalyticsService = require('./cycleAnalyticsService');
const cycleGenerationService = require('./cycleGenerationService');
const { calculateEffectiveBalance } = require('../utils/effectiveBalanceUtil');

const facade = module.exports = {
  // CRUD
  validatePaymentMethod: (...args) => cycleCrudService.validatePaymentMethod(...args),
  createBillingCycle: (...args) => cycleCrudService.createBillingCycle(...args),
  getBillingCycleHistory: (...args) => cycleCrudService.getBillingCycleHistory(...args),
  updateBillingCycle: (...args) => cycleCrudService.updateBillingCycle(...args),
  deleteBillingCycle: (...args) => cycleCrudService.deleteBillingCycle(...args),

  // Analytics
  calculateDiscrepancy: (...args) => cycleAnalyticsService.calculateDiscrepancy(...args),
  calculateEffectiveBalance: (cycle) => calculateEffectiveBalance(cycle),
  calculateTrendIndicator: (...args) => cycleAnalyticsService.calculateTrendIndicator(...args),
  getTransactionCount: (...args) => cycleAnalyticsService.getTransactionCount(...args),
  getUnifiedBillingCycles: (...args) => cycleAnalyticsService.getUnifiedBillingCycles(...args),

  // Generation — delegate to extracted service, but route autoGenerateBillingCycles
  // through the facade so that tests can mock getMissingCyclePeriods / calculateCycleBalance
  // on this module and have the mocks take effect inside autoGenerateBillingCycles.
  calculateCycleBalance: (...args) => cycleGenerationService.calculateCycleBalance(...args),
  recalculateBalance: (...args) => cycleGenerationService.recalculateBalance(...args),
  getMissingCyclePeriods: (...args) => cycleGenerationService.getMissingCyclePeriods(...args),
  autoGenerateBillingCycles: (paymentMethodId, billingCycleDay, referenceDate) =>
    cycleGenerationService.autoGenerateBillingCycles(paymentMethodId, billingCycleDay, referenceDate, {
      getMissingCyclePeriods: (...a) => facade.getMissingCyclePeriods(...a),
      calculateCycleBalance: (...a) => facade.calculateCycleBalance(...a),
    }),
  getCurrentCycleStatus: (...args) => cycleGenerationService.getCurrentCycleStatus(...args),
};
