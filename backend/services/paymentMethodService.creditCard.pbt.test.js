/**
 * @invariant Credit Card Feature Invariants
 * 
 * This file tests credit card-specific properties:
 * 1. Utilization calculation: (balance / limit) * 100
 * 2. Billing cycle transaction counting and totals
 * 3. Payment impact on balance reduction
 * 
 * Randomness adds value by:
 * - Testing utilization across various balance/limit combinations
 * - Validating billing cycle calculations with random expense dates
 * - Ensuring payment reductions work correctly across random amounts
 * - Verifying edge cases (over-limit, zero balance, empty cycles)
 * 
 * Consolidated from: utilization, billingCycle, paymentImpact
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const paymentMethodService = require('./paymentMethodService');
const {
  getTestDatabase,
  resetTestDatabase,
  createTestDatabase,
  closeDatabase,
  createTables,
  insertCreditCard,
  insertExpense,
  insertPayment,
  addDays,
  formatDate,
  calculateProjectedBalance,
  calculateCurrentBalance,
  getBillingCycleDetailsFromDb,
  resetDisplayNameCounter,
  uniqueDisplayName,
  expenseType
} = require('../test/paymentMethodPbtHelpers');

describe('PaymentMethodService - Billing Cycle Transaction Count Property-Based Tests', () => {
  let sharedDb = null;

  beforeAll(async () => {
    // Create database once for all tests
    sharedDb = await getTestDatabase();
    await createTables(sharedDb);
  });

  afterAll(async () => {
    // Close database after all tests
    if (sharedDb) {
      await closeDatabase(sharedDb);
    }
  });

  beforeEach(async () => {
    // Reset database between test iterations
    if (sharedDb) {
      await resetTestDatabase(sharedDb);
    }
  });

  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-balance-types
   * Property 8: Billing Cycle Transaction Count Accuracy
   * **Validates: Requirements 8.2, 8.3**
   */
  test('Property 8: Billing Cycle Transaction Count Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            daysOffset: fc.integer({ min: -10, max: 40 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100),
            usePostedDate: fc.boolean(),
            postedDateOffset: fc.integer({ min: -5, max: 5 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (displayName, expenseConfigs) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            let expectedCount = 0;
            
            for (const config of expenseConfigs) {
              const transactionDate = addDays(cycleStartDate, config.daysOffset);
              
              let postedDate = null;
              let effectiveDate = transactionDate;
              
              if (config.usePostedDate) {
                postedDate = addDays(transactionDate, config.postedDateOffset);
                effectiveDate = postedDate;
              }
              
              await insertExpense(db, transactionDate, postedDate, 'Test Place', config.amount, 'Other', 1, displayName, cardId);
              
              if (effectiveDate >= cycleStartDate && effectiveDate <= cycleEndDate) {
                expectedCount++;
              }
            }
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            expect(cycleDetails.transaction_count).toBe(expectedCount);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });

  test('Property 8: Transaction count uses effective_date correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            transactionDaysBeforeCycle: fc.integer({ min: 1, max: 10 }),
            postedDaysIntoCycle: fc.integer({ min: 1, max: 20 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, expenseConfigs) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            for (const config of expenseConfigs) {
              const transactionDate = addDays(cycleStartDate, -config.transactionDaysBeforeCycle);
              const postedDate = addDays(cycleStartDate, config.postedDaysIntoCycle);
              
              await insertExpense(db, transactionDate, postedDate, 'Test Place', config.amount, 'Other', 1, displayName, cardId);
            }
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            expect(cycleDetails.transaction_count).toBe(expenseConfigs.length);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 30 })
    );
  });, 120000
});

describe('PaymentMethodService - Billing Cycle Total Accuracy Property-Based Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-balance-types
   * Property 9: Billing Cycle Total Accuracy
   * **Validates: Requirements 8.3, 9.3**
   */
  test('Property 9: Billing Cycle Total Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            daysOffset: fc.integer({ min: -10, max: 40 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100),
            usePostedDate: fc.boolean(),
            postedDateOffset: fc.integer({ min: -5, max: 5 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (displayName, expenseConfigs) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            let expectedTotal = 0;
            
            for (const config of expenseConfigs) {
              const transactionDate = addDays(cycleStartDate, config.daysOffset);
              
              let postedDate = null;
              let effectiveDate = transactionDate;
              
              if (config.usePostedDate) {
                postedDate = addDays(transactionDate, config.postedDateOffset);
                effectiveDate = postedDate;
              }
              
              await insertExpense(db, transactionDate, postedDate, 'Test Place', config.amount, 'Other', 1, displayName, cardId);
              
              if (effectiveDate >= cycleStartDate && effectiveDate <= cycleEndDate) {
                expectedTotal += config.amount;
              }
            }
            
            expectedTotal = Math.round(expectedTotal * 100) / 100;
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            expect(cycleDetails.total_amount).toBeCloseTo(expectedTotal, 2);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });

  test('Property 9: Billing Cycle Payment Total Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            daysOffset: fc.integer({ min: -10, max: 40 }),
            amount: fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, paymentConfigs) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            let expectedPaymentCount = 0;
            let expectedPaymentTotal = 0;
            
            for (const config of paymentConfigs) {
              const paymentDate = addDays(cycleStartDate, config.daysOffset);
              
              await insertPayment(db, cardId, config.amount, paymentDate);
              
              if (paymentDate >= cycleStartDate && paymentDate <= cycleEndDate) {
                expectedPaymentCount++;
                expectedPaymentTotal += config.amount;
              }
            }
            
            expectedPaymentTotal = Math.round(expectedPaymentTotal * 100) / 100;
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            expect(cycleDetails.payment_count).toBe(expectedPaymentCount);
            expect(cycleDetails.payment_total).toBeCloseTo(expectedPaymentTotal, 2);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 30 })
    );
  });

  test('Property 9: Empty billing cycle returns zero totals', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        async (displayName) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            expect(cycleDetails.transaction_count).toBe(0);
            expect(cycleDetails.total_amount).toBe(0);
            expect(cycleDetails.payment_count).toBe(0);
            expect(cycleDetails.payment_total).toBe(0);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 20 })
    );
  });, 120000
});

describe('PaymentMethodService - Payment Reduction Property-Based Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-balance-types
   * Property 4: Payment Reduction Property
   * **Validates: Requirements 3.2, 6.3**
   */
  test('Property 4: Payment Reduction Property - payment reduces projected balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true })
            .map(n => Math.round(n * 100) / 100),
          { minLength: 1, maxLength: 5 }
        ),
        fc.float({ min: Math.fround(5), max: Math.fround(100), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (displayName, expenseAmounts, paymentAmount) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            const today = new Date();
            const todayStr = formatDate(today);
            
            for (const amount of expenseAmounts) {
              await insertExpense(db, todayStr, null, 'Test Place', amount, 'Other', 1, displayName, cardId);
            }
            
            const balanceBefore = await calculateProjectedBalance(db, cardId);
            
            await insertPayment(db, cardId, paymentAmount, todayStr);
            
            const balanceAfter = await calculateProjectedBalance(db, cardId);
            
            const expectedBalance = Math.max(0, Math.round((balanceBefore - paymentAmount) * 100) / 100);
            
            expect(balanceAfter).toBe(expectedBalance);
            expect(balanceAfter).toBeLessThanOrEqual(balanceBefore);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });

  test('Property 4: Multiple payments reduce balance cumulatively', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(500), max: Math.fround(1000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        fc.array(
          fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true })
            .map(n => Math.round(n * 100) / 100),
          { minLength: 2, maxLength: 5 }
        ),
        async (displayName, expenseAmount, paymentAmounts) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            const today = new Date();
            const todayStr = formatDate(today);
            
            await insertExpense(db, todayStr, null, 'Test Place', expenseAmount, 'Other', 1, displayName, cardId);
            
            const initialBalance = await calculateProjectedBalance(db, cardId);
            expect(initialBalance).toBe(expenseAmount);
            
            let totalPayments = 0;
            for (const paymentAmount of paymentAmounts) {
              await insertPayment(db, cardId, paymentAmount, todayStr);
              totalPayments += paymentAmount;
              
              const currentBalance = await calculateProjectedBalance(db, cardId);
              const expectedBalance = Math.max(0, Math.round((expenseAmount - totalPayments) * 100) / 100);
              
              expect(currentBalance).toBe(expectedBalance);
            }
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 30 })
    );
  });, 120000
});

describe('PaymentMethodService - Projected Equals Current Property-Based Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-balance-types
   * Property 7: Projected Equals Current When No Future Expenses
   * **Validates: Requirements 4.4**
   */
  test('Property 7: Projected Equals Current When No Future Expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true })
              .map(n => Math.round(n * 100) / 100),
            daysAgo: fc.integer({ min: 0, max: 30 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(5), max: Math.fround(50), noNaN: true })
              .map(n => Math.round(n * 100) / 100),
            daysAgo: fc.integer({ min: 0, max: 30 })
          }),
          { minLength: 0, maxLength: 3 }
        ),
        async (displayName, expenseConfigs, paymentConfigs) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            const today = new Date();
            const todayStr = formatDate(today);
            
            for (const config of expenseConfigs) {
              const expenseDate = addDays(todayStr, -config.daysAgo);
              await insertExpense(db, expenseDate, null, 'Test Place', config.amount, 'Other', 1, displayName, cardId);
            }
            
            for (const config of paymentConfigs) {
              const paymentDate = addDays(todayStr, -config.daysAgo);
              await insertPayment(db, cardId, config.amount, paymentDate);
            }
            
            const currentBalance = await calculateCurrentBalance(db, cardId, todayStr);
            const projectedBalance = await calculateProjectedBalance(db, cardId);
            
            expect(projectedBalance).toBe(currentBalance);
            
            const hasPendingExpenses = projectedBalance !== currentBalance;
            expect(hasPendingExpenses).toBe(false);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });

  test('Property 7: Projected NOT equal to Current when there ARE future expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        fc.integer({ min: 1, max: 30 }),
        fc.array(
          fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true })
            .map(n => Math.round(n * 100) / 100),
          { minLength: 0, maxLength: 3 }
        ),
        async (displayName, futureExpenseAmount, daysInFuture, pastExpenseAmounts) => {
          const db = sharedDb;
          
          try {
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            const today = new Date();
            const todayStr = formatDate(today);
            
            for (const amount of pastExpenseAmounts) {
              await insertExpense(db, todayStr, null, 'Test Place', amount, 'Other', 1, displayName, cardId);
            }
            
            const futureDate = addDays(todayStr, daysInFuture);
            await insertExpense(db, futureDate, null, 'Future Place', futureExpenseAmount, 'Other', 1, displayName, cardId);
            
            const currentBalance = await calculateCurrentBalance(db, cardId, todayStr);
            const projectedBalance = await calculateProjectedBalance(db, cardId);
            
            expect(projectedBalance).toBeGreaterThan(currentBalance);
            
            const difference = Math.round((projectedBalance - currentBalance) * 100) / 100;
            expect(difference).toBe(futureExpenseAmount);
            
            const hasPendingExpenses = projectedBalance !== currentBalance;
            expect(hasPendingExpenses).toBe(true);
            
            return true;
          } finally {
            // Database reset in beforeEach
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });, 120000
});


describe('PaymentMethodService - Credit Utilization Property Tests', () => {
  /**
   * Feature: configurable-payment-methods, Property 19: Credit Utilization Calculation
   * **Validates: Requirements 3.7, 3.8**
   */
  test('Property 19: Credit Utilization Calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        async (balance, creditLimit) => {
          const utilization = paymentMethodService.calculateUtilizationPercentage(balance, creditLimit);
          
          const expectedUtilization = Math.round((balance / creditLimit) * 100 * 100) / 100;
          
          expect(utilization).toBe(expectedUtilization);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property: Utilization should be null when credit limit is zero or null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
        fc.oneof(fc.constant(0), fc.constant(null), fc.constant(undefined)),
        async (balance, creditLimit) => {
          const utilization = paymentMethodService.calculateUtilizationPercentage(balance, creditLimit);
          
          expect(utilization).toBeNull();
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property: Utilization can exceed 100% when balance exceeds limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(1000), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(100), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        async (balance, creditLimit) => {
          const utilization = paymentMethodService.calculateUtilizationPercentage(balance, creditLimit);
          
          expect(utilization).toBeGreaterThan(100);
          
          const expectedUtilization = Math.round((balance / creditLimit) * 100 * 100) / 100;
          expect(utilization).toBe(expectedUtilization);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property: Utilization status should be danger when >= 70%', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(70), max: Math.fround(200), noNaN: true }),
        async (utilizationPercentage) => {
          const status = paymentMethodService.getUtilizationStatus(utilizationPercentage);
          
          expect(status).toBe('danger');
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property: Utilization status should be warning when >= 30% and < 70%', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(30), max: Math.fround(69.99), noNaN: true }),
        async (utilizationPercentage) => {
          const status = paymentMethodService.getUtilizationStatus(utilizationPercentage);
          
          expect(status).toBe('warning');
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property: Utilization status should be good when < 30%', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0), max: Math.fround(29.99), noNaN: true }),
        async (utilizationPercentage) => {
          const status = paymentMethodService.getUtilizationStatus(utilizationPercentage);
          
          expect(status).toBe('good');
          
          return true;
        }
      ),
      pbtOptions()
    );
  });, 120000
});
