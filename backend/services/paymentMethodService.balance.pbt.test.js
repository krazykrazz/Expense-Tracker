/**
 * @invariant Balance Calculation Invariants
 * 
 * This file tests critical balance calculation properties for credit card payment methods:
 * 1. COALESCE behavior: Balance uses COALESCE(posted_date, date) as effective posting date
 * 2. Balance ordering: statement ≤ current ≤ projected
 * 3. Non-negative: All balance types must be >= 0
 * 4. Expense count consistency: Count and balance use same effective date
 * 5. Effective date consistency: COALESCE(posted_date, date) used consistently
 * 
 * Randomness adds value by:
 * - Testing various date combinations (transaction vs posted dates)
 * - Validating balance calculations across random expense/payment amounts
 * - Ensuring SQL COALESCE logic works correctly with NULL and non-NULL posted_dates
 * - Verifying date boundary handling across different time periods
 * 
 * Consolidated from: balanceCoalesce, balanceTypes, expenseCountBalance, effectiveDate
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const {
  createTestDatabase,
  closeDatabase,
  createTables,
  insertCreditCard,
  insertExpense,
  insertPayment,
  addDays,
  formatDate,
  calculateDynamicBalance,
  calculateStatementBalance,
  calculateCurrentBalance,
  calculateProjectedBalance,
  countExpensesInRange,
  sumExpensesInRange,
  countExpensesUpToDate,
  sumExpensesUpToDate,
  countExpensesInCycle,
  getEffectiveDate,
  resetDisplayNameCounter,
  uniqueDisplayName,
  validDate,
  expenseType
} = require('../test/paymentMethodPbtHelpers');

describe('PaymentMethodService - Balance COALESCE Property-Based Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-posted-date
   * Property 2: Balance Calculation Uses Effective Posting Date
   * **Validates: Requirements 1.2, 1.3, 2.1, 5.1, 5.3**
   */
  test('Property 2: Balance uses COALESCE(posted_date, date) - NULL posted_date uses transaction date', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate,
        fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        expenseType,
        async (displayName, transactionDate, amount, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            await insertExpense(db, transactionDate, null, 'Test Place', amount, type, 1, displayName, cardId);
            
            const balanceOnTxDate = await calculateDynamicBalance(db, cardId, transactionDate);
            expect(balanceOnTxDate).toBeCloseTo(amount, 2);
            
            const dayBefore = addDays(transactionDate, -1);
            const balanceBeforeTxDate = await calculateDynamicBalance(db, cardId, dayBefore);
            expect(balanceBeforeTxDate).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  }, 120000);

  test('Property 2: Balance uses posted_date when provided (not transaction date)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate,
        fc.integer({ min: 1, max: 10 }),
        fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        expenseType,
        async (displayName, transactionDate, daysUntilPosting, amount, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            const postedDate = addDays(transactionDate, daysUntilPosting);
            await insertExpense(db, transactionDate, postedDate, 'Test Place', amount, type, 1, displayName, cardId);
            
            const balanceOnTxDate = await calculateDynamicBalance(db, cardId, transactionDate);
            expect(balanceOnTxDate).toBe(0);
            
            const balanceOnPostedDate = await calculateDynamicBalance(db, cardId, postedDate);
            expect(balanceOnPostedDate).toBeCloseTo(amount, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });

  test('Property 2: NULL posted_date maintains backward compatibility', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            date: validDate,
            amount: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        validDate,
        async (displayName, expenses, referenceDate) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            for (const exp of expenses) {
              await insertExpense(db, exp.date, null, 'Test Place', exp.amount, 'Other', 1, displayName, cardId);
            }
            
            const actualBalance = await calculateDynamicBalance(db, cardId, referenceDate);
            const expectedBalance = expenses
              .filter(exp => exp.date <= referenceDate)
              .reduce((sum, exp) => sum + exp.amount, 0);
            
            expect(actualBalance).toBeCloseTo(Math.round(expectedBalance * 100) / 100, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 30 })
    );
  });, 120000
});

describe('PaymentMethodService - Balance Ordering Property-Based Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-balance-types
   * Property 1: Balance Ordering Invariant
   * **Validates: Requirements 1.1, 2.1, 3.1**
   */
  test('Property 1: Balance Ordering Invariant - statement ≤ current ≤ projected', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            category: fc.constantFrom('past', 'current', 'future'),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(5), max: Math.fround(50), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 0, maxLength: 2 }
        ),
        async (displayName, expenseConfigs, paymentConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const today = new Date();
            today.setDate(15);
            const todayStr = formatDate(today);
            
            const cycleStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
            const cycleStartStr = formatDate(cycleStartDate);
            
            for (const config of expenseConfigs) {
              let transactionDate;
              if (config.category === 'past') {
                transactionDate = addDays(cycleStartStr, -10);
              } else if (config.category === 'current') {
                transactionDate = addDays(todayStr, -5);
              } else {
                transactionDate = addDays(todayStr, 10);
              }
              
              await insertExpense(db, transactionDate, null, 'Test Place', config.amount, 'Other', 1, displayName, cardId);
            }
            
            for (const config of paymentConfigs) {
              const paymentDate = addDays(cycleStartStr, -15);
              await insertPayment(db, cardId, config.amount, paymentDate);
            }
            
            const statementBalance = await calculateStatementBalance(db, cardId, cycleStartStr);
            const currentBalance = await calculateCurrentBalance(db, cardId, todayStr);
            const projectedBalance = await calculateProjectedBalance(db, cardId);
            
            expect(statementBalance).toBeLessThanOrEqual(currentBalance);
            expect(currentBalance).toBeLessThanOrEqual(projectedBalance);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });, 120000
});

describe('PaymentMethodService - Non-Negative Balance Property-Based Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-balance-types
   * Property 3: Non-Negative Balance Invariant
   * **Validates: Requirements 1.5, 2.4, 3.3**
   */
  test('Property 3: Non-Negative Balance Invariant - all balances >= 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            category: fc.constantFrom('past', 'current', 'future'),
            amount: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 0, maxLength: 3 }
        ),
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (displayName, expenseConfigs, paymentConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const today = new Date();
            today.setDate(15);
            const todayStr = formatDate(today);
            
            const cycleStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
            const cycleStartStr = formatDate(cycleStartDate);
            
            for (const config of expenseConfigs) {
              let transactionDate;
              if (config.category === 'past') {
                transactionDate = addDays(cycleStartStr, -10);
              } else if (config.category === 'current') {
                transactionDate = addDays(todayStr, -5);
              } else {
                transactionDate = addDays(todayStr, 10);
              }
              
              await insertExpense(db, transactionDate, null, 'Test Place', config.amount, 'Other', 1, displayName, cardId);
            }
            
            for (const config of paymentConfigs) {
              const paymentDate = addDays(cycleStartStr, -15);
              await insertPayment(db, cardId, config.amount, paymentDate);
            }
            
            const statementBalance = await calculateStatementBalance(db, cardId, cycleStartStr);
            const currentBalance = await calculateCurrentBalance(db, cardId, todayStr);
            const projectedBalance = await calculateProjectedBalance(db, cardId);
            
            expect(statementBalance).toBeGreaterThanOrEqual(0);
            expect(currentBalance).toBeGreaterThanOrEqual(0);
            expect(projectedBalance).toBeGreaterThanOrEqual(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });

  test('Property 3: Non-Negative Balance with zero expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, paymentConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const today = new Date();
            today.setDate(15);
            const todayStr = formatDate(today);
            
            const cycleStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
            const cycleStartStr = formatDate(cycleStartDate);
            
            for (const config of paymentConfigs) {
              const paymentDate = addDays(cycleStartStr, -15);
              await insertPayment(db, cardId, config.amount, paymentDate);
            }
            
            const statementBalance = await calculateStatementBalance(db, cardId, cycleStartStr);
            const currentBalance = await calculateCurrentBalance(db, cardId, todayStr);
            const projectedBalance = await calculateProjectedBalance(db, cardId);
            
            expect(statementBalance).toBe(0);
            expect(currentBalance).toBe(0);
            expect(projectedBalance).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 30 })
    );
  });, 120000
});

describe('PaymentMethodService - Expense Count and Balance Consistency Property-Based Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-balance-types
   * Property 5: Expense Count and Balance Consistency
   * **Validates: Requirements 5.2, 5.3, 5.4**
   */
  test('Property 5: Posted_date change affects both expense count and balance consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.record({
          transactionDaysIntoCycle: fc.integer({ min: 5, max: 10 }),
          initialPostedDaysIntoCycle: fc.integer({ min: 1, max: 10 }),
          newPostedDaysBeforeCycle: fc.integer({ min: 1, max: 15 }),
          amount: fc.float({ min: Math.fround(50), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100)
        }),
        async (displayName, config) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            const todayStr = '2025-01-15';
            
            const transactionDate = addDays(cycleStartDate, config.transactionDaysIntoCycle);
            const initialPostedDate = addDays(cycleStartDate, config.initialPostedDaysIntoCycle);
            const newPostedDate = addDays(cycleStartDate, -config.newPostedDaysBeforeCycle);
            
            const expenseId = await insertExpense(db, transactionDate, initialPostedDate, 'Test Place', config.amount, 'Other', 1, displayName, cardId);
            
            const initialCount = await countExpensesInCycle(db, cardId, cycleStartDate, cycleEndDate);
            const initialBalance = await calculateCurrentBalance(db, cardId, todayStr);
            
            expect(initialCount).toBe(1);
            expect(initialBalance).toBeCloseTo(config.amount, 2);
            
            // Update posted_date
            await new Promise((resolve, reject) => {
              db.run('UPDATE expenses SET posted_date = ? WHERE id = ?', [newPostedDate, expenseId], (err) => {
                if (err) reject(err);
                else resolve();
              });, 120000
            });
            
            const updatedCount = await countExpensesInCycle(db, cardId, cycleStartDate, cycleEndDate);
            const updatedBalance = await calculateCurrentBalance(db, cardId, todayStr);
            
            expect(updatedCount).toBe(0);
            expect(updatedBalance).toBeCloseTo(config.amount, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });
});

describe('PaymentMethodService - Effective Date Consistency Property-Based Tests', () => {
  beforeEach(() => {
    resetDisplayNameCounter();
  });

  /**
   * Feature: credit-card-balance-types
   * Property 2: Effective Date Consistency
   * **Validates: Requirements 1.4, 2.3, 5.1**
   */
  test('Property 2: Effective date equals COALESCE(posted_date, date)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            transactionDaysOffset: fc.integer({ min: -30, max: 30 }),
            usePostedDate: fc.boolean(),
            postedDateOffset: fc.integer({ min: -10, max: 10 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (displayName, expenseConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const referenceDate = '2025-01-15';
            const expenses = [];
            
            for (const config of expenseConfigs) {
              const transactionDate = addDays(referenceDate, config.transactionDaysOffset);
              let postedDate = null;
              if (config.usePostedDate) {
                postedDate = addDays(transactionDate, config.postedDateOffset);
              }
              
              const effectiveDate = getEffectiveDate(transactionDate, postedDate);
              
              await insertExpense(db, transactionDate, postedDate, 'Test Place', config.amount, 'Other', 1, displayName, cardId);
              
              expenses.push({ transactionDate, postedDate, effectiveDate, amount: config.amount });
            }
            
            const testStartDate = addDays(referenceDate, -15);
            const testEndDate = addDays(referenceDate, 15);
            
            let expectedCount = 0;
            let expectedSum = 0;
            
            for (const expense of expenses) {
              if (expense.effectiveDate >= testStartDate && expense.effectiveDate <= testEndDate) {
                expectedCount++;
                expectedSum += expense.amount;
              }
            }
            expectedSum = Math.round(expectedSum * 100) / 100;
            
            const actualCount = await countExpensesInRange(db, cardId, testStartDate, testEndDate);
            const actualSum = await sumExpensesInRange(db, cardId, testStartDate, testEndDate);
            
            expect(actualCount).toBe(expectedCount);
            expect(actualSum).toBeCloseTo(expectedSum, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });
});
