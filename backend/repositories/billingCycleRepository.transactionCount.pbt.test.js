/**
 * Property-Based Tests for Transaction Count in Billing Cycles
 * Feature: unified-billing-cycles
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 3.2**
 */

const fc = require('fast-check');
const { dbPbtOptions, safeDate } = require('../test/pbtArbitraries');
const { getDatabase, createTestDatabase, closeTestDatabase } = require('../database/db');

// Import the service to test
const billingCycleHistoryService = require('../services/billingCycleHistoryService');

describe('BillingCycleRepository - Transaction Count Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    // Clean up test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE payment_method_id = 9999', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Feature: unified-billing-cycles, Property 5: Transaction Count Accuracy
   * **Validates: Requirements 3.2**
   * 
   * For any billing cycle period, the transaction_count SHALL equal the count of 
   * expenses where COALESCE(posted_date, date) falls within [cycle_start_date, cycle_end_date] inclusive.
   */
  test('Property 5: Transaction Count Accuracy - Basic Count', async () => {
    const paymentMethodId = 9999;
    const cycleStartDate = '2024-06-16';
    const cycleEndDate = '2024-07-15';

    // Create test payment method
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO payment_methods (id, type, display_name, is_active, billing_cycle_day) 
         VALUES (?, 'credit_card', 'Test Card', 1, 15)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    await fc.assert(
      fc.asyncProperty(
        // Generate number of expenses inside the cycle (0-10)
        fc.integer({ min: 0, max: 10 }),
        // Generate number of expenses outside the cycle (0-5)
        fc.integer({ min: 0, max: 5 }),
        async (insideCount, outsideCount) => {
          // Clean up previous test data
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Create expenses inside the cycle
          for (let i = 0; i < insideCount; i++) {
            const day = 16 + (i % 30); // Days 16-30 of June or 1-15 of July
            const month = day > 30 ? '07' : '06';
            const actualDay = day > 30 ? day - 30 : day;
            const date = `2024-${month}-${String(actualDay).padStart(2, '0')}`;
            
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
                 VALUES (?, 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
                [date, paymentMethodId],
                (err) => err ? reject(err) : resolve()
              );
            });
          }

          // Create expenses outside the cycle (before start date)
          for (let i = 0; i < outsideCount; i++) {
            const date = `2024-06-${String(1 + i).padStart(2, '0')}`; // June 1-5
            
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
                 VALUES (?, 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
                [date, paymentMethodId],
                (err) => err ? reject(err) : resolve()
              );
            });
          }

          // Get transaction count
          const count = await billingCycleHistoryService.getTransactionCount(
            paymentMethodId,
            cycleStartDate,
            cycleEndDate
          );

          // Count should equal only the expenses inside the cycle
          expect(count).toBe(insideCount);

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 5: Transaction Count Accuracy - Posted Date Priority', async () => {
    const paymentMethodId = 9999;
    const cycleStartDate = '2024-06-16';
    const cycleEndDate = '2024-07-15';

    // Create test payment method
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO payment_methods (id, type, display_name, is_active, billing_cycle_day) 
         VALUES (?, 'credit_card', 'Test Card', 1, 15)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Clean up
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create expense with date outside cycle but posted_date inside cycle
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-06-10', '2024-06-20', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Create expense with date inside cycle but posted_date outside cycle
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-06-20', '2024-06-10', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Create expense with date inside cycle and no posted_date
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-06-25', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    const count = await billingCycleHistoryService.getTransactionCount(
      paymentMethodId,
      cycleStartDate,
      cycleEndDate
    );

    // Should count:
    // 1. First expense (posted_date 2024-06-20 is inside cycle)
    // 2. Third expense (date 2024-06-25 is inside cycle, no posted_date)
    // Should NOT count:
    // - Second expense (posted_date 2024-06-10 is outside cycle)
    expect(count).toBe(2);
  });

  test('Property 5: Transaction Count Accuracy - Empty Cycle', async () => {
    const paymentMethodId = 9999;
    const cycleStartDate = '2024-06-16';
    const cycleEndDate = '2024-07-15';

    // Create test payment method
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO payment_methods (id, type, display_name, is_active, billing_cycle_day) 
         VALUES (?, 'credit_card', 'Test Card', 1, 15)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Clean up - ensure no expenses
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const count = await billingCycleHistoryService.getTransactionCount(
      paymentMethodId,
      cycleStartDate,
      cycleEndDate
    );

    expect(count).toBe(0);
  });

  test('Property 5: Transaction Count Accuracy - Boundary Dates', async () => {
    const paymentMethodId = 9999;
    const cycleStartDate = '2024-06-16';
    const cycleEndDate = '2024-07-15';

    // Create test payment method
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO payment_methods (id, type, display_name, is_active, billing_cycle_day) 
         VALUES (?, 'credit_card', 'Test Card', 1, 15)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Clean up
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create expense on exact start date
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-06-16', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Create expense on exact end date
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-07-15', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Create expense one day before start (should not count)
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-06-15', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Create expense one day after end (should not count)
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-07-16', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId],
        (err) => err ? reject(err) : resolve()
      );
    });

    const count = await billingCycleHistoryService.getTransactionCount(
      paymentMethodId,
      cycleStartDate,
      cycleEndDate
    );

    // Should count only the two expenses on boundary dates
    expect(count).toBe(2);
  });
});
