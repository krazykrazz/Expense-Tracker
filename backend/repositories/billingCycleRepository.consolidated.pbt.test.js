/**
 * Consolidated Property-Based Tests for Billing Cycle Repository
 * Merged from: billingCycleRepository.pbt.test.js, billingCycleRepository.transactionCount.pbt.test.js
 * 
 * Features: credit-card-billing-cycle-history, unified-billing-cycles
 * 
 * NOTE: The two source files use different database approaches:
 * - CRUD/constraint tests use in-memory SQLite directly
 * - Transaction count tests use createTestDatabase/closeTestDatabase from db.js
  *
 * @invariant Billing Cycle CRUD Integrity: For any valid billing cycle data, create-read operations return equivalent records; unique constraints prevent duplicate cycles for the same card and period; transaction counts accurately reflect linked expenses. Randomization covers diverse date ranges, amounts, and card configurations.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeDate, safeAmount, safeString } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// ============================================================================
// In-Memory DB Helpers (for CRUD/constraint tests)
// ============================================================================

function createInMemoryDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) reject(err);
      else {
        db.run('PRAGMA foreign_keys = ON', (fkErr) => {
          if (fkErr) reject(fkErr);
          else resolve(db);
        });
      }
    });
  });
}

function closeInMemoryDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => err ? reject(err) : resolve());
  });
}

function createPaymentMethodsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('cash', 'cheque', 'debit', 'credit_card')),
        display_name TEXT NOT NULL UNIQUE,
        full_name TEXT,
        account_details TEXT,
        credit_limit REAL CHECK(credit_limit IS NULL OR credit_limit > 0),
        current_balance REAL DEFAULT 0 CHECK(current_balance >= 0),
        payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
        billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31)),
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => err ? reject(err) : resolve());
  });
}

function createBillingCyclesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS credit_card_billing_cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_method_id INTEGER NOT NULL,
        cycle_start_date TEXT NOT NULL,
        cycle_end_date TEXT NOT NULL,
        actual_statement_balance REAL NOT NULL CHECK(actual_statement_balance >= 0),
        calculated_statement_balance REAL NOT NULL CHECK(calculated_statement_balance >= 0),
        minimum_payment REAL CHECK(minimum_payment IS NULL OR minimum_payment >= 0),
        notes TEXT,
        statement_pdf_path TEXT,
        is_user_entered INTEGER DEFAULT 0,
        reviewed_at TEXT DEFAULT NULL,
        effective_balance REAL DEFAULT NULL,
        balance_type TEXT DEFAULT 'calculated' CHECK(balance_type IS NULL OR balance_type IN ('actual', 'calculated')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE,
        UNIQUE(payment_method_id, cycle_end_date)
      )
    `, (err) => err ? reject(err) : resolve());
  });
}


function insertCreditCardPaymentMethod(db, displayName, billingCycleDay = null) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, billing_cycle_day, is_active)
       VALUES ('credit_card', ?, ?, ?, 1)`,
      [displayName, displayName, billingCycleDay],
      function(err) { err ? reject(err) : resolve(this.lastID); }
    );
  });
}

function insertBillingCycle(db, data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO credit_card_billing_cycles 
       (payment_method_id, cycle_start_date, cycle_end_date, actual_statement_balance, 
        calculated_statement_balance, minimum_payment, notes,
        effective_balance, balance_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.payment_method_id, data.cycle_start_date, data.cycle_end_date,
        data.actual_statement_balance, data.calculated_statement_balance,
        data.minimum_payment !== undefined && data.minimum_payment !== null ? data.minimum_payment : null,
        data.notes || null,
        data.effective_balance !== undefined ? data.effective_balance : null,
        data.balance_type || null
      ],
      function(err) { err ? reject(err) : resolve(this.lastID); }
    );
  });
}

function getBillingCycleById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM credit_card_billing_cycles WHERE id = ?', [id],
      (err, row) => err ? reject(err) : resolve(row || null));
  });
}

function getBillingCyclesByPaymentMethod(db, paymentMethodId, options = {}) {
  return new Promise((resolve, reject) => {
    let sql = `SELECT * FROM credit_card_billing_cycles WHERE payment_method_id = ?`;
    const params = [paymentMethodId];
    if (options.startDate) { sql += ' AND cycle_end_date >= ?'; params.push(options.startDate); }
    if (options.endDate) { sql += ' AND cycle_end_date <= ?'; params.push(options.endDate); }
    sql += ' ORDER BY cycle_end_date DESC';
    if (options.limit) { sql += ' LIMIT ?'; params.push(options.limit); }
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function updateBillingCycle(db, id, data) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE credit_card_billing_cycles 
      SET effective_balance = ?,
          balance_type = ?,
          actual_statement_balance = COALESCE(?, actual_statement_balance),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    db.run(sql, [
      data.effective_balance !== undefined ? data.effective_balance : null,
      data.balance_type || 'calculated',
      data.actual_statement_balance !== undefined ? data.actual_statement_balance : null,
      id
    ], function(err) { err ? reject(err) : resolve(this.changes > 0); });
  });
}

function deletePaymentMethod(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM payment_methods WHERE id = ?', [id], function(err) {
      err ? reject(err) : resolve(this.changes > 0);
    });
  });
}

// Arbitraries
const billingCycleArbitrary = fc.record({
  cycle_start_date: safeDate({ min: new Date('2024-01-01'), max: new Date('2024-06-30') }),
  cycle_end_date: safeDate({ min: new Date('2024-07-01'), max: new Date('2024-12-31') }),
  actual_statement_balance: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
    .map(n => Math.round(n * 100) / 100),
  calculated_statement_balance: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
    .map(n => Math.round(n * 100) / 100),
  minimum_payment: fc.option(
    fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
    { nil: null }
  ),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  effective_balance: fc.option(
    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
    { nil: null }
  ),
  balance_type: fc.option(fc.constantFrom('actual', 'calculated'), { nil: null })
});

const billingCyclesWithDistinctDatesArbitrary = fc.array(
  billingCycleArbitrary, { minLength: 2, maxLength: 10 }
).chain(cycles => {
  const distinctCycles = cycles.map((c, index) => ({
    ...c,
    cycle_start_date: `2024-${String(index + 1).padStart(2, '0')}-01`,
    cycle_end_date: `2024-${String(index + 1).padStart(2, '0')}-28`
  }));
  return fc.constant(distinctCycles);
});

// ============================================================================
// CRUD / Constraint Tests (from billingCycleRepository.pbt.test.js)
// ============================================================================

describe('BillingCycleRepository - Property-Based Tests', () => {
  /**
   * Property 1: Billing Cycle CRUD Round-Trip
   * **Validates: Requirements 1.1, 2.1, 2.4**
   */
  test('Property 1: Billing Cycle CRUD Round-Trip', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(billingCycleArbitrary, async (cycleData) => {
        const db = await createInMemoryDb();
        testCounter++;
        try {
          await createPaymentMethodsTable(db);
          await createBillingCyclesTable(db);
          const paymentMethodId = await insertCreditCardPaymentMethod(db, `TestCard_${testCounter}_${Date.now()}`, 15);
          const cycleId = await insertBillingCycle(db, { payment_method_id: paymentMethodId, ...cycleData });
          const retrieved = await getBillingCycleById(db, cycleId);
          
          expect(retrieved).not.toBeNull();
          expect(retrieved.id).toBe(cycleId);
          expect(retrieved.payment_method_id).toBe(paymentMethodId);
          expect(retrieved.cycle_start_date).toBe(cycleData.cycle_start_date);
          expect(retrieved.cycle_end_date).toBe(cycleData.cycle_end_date);
          expect(retrieved.actual_statement_balance).toBe(cycleData.actual_statement_balance);
          expect(retrieved.calculated_statement_balance).toBe(cycleData.calculated_statement_balance);
          expect(retrieved.minimum_payment).toBe(cycleData.minimum_payment);
          expect(retrieved.notes).toBe(cycleData.notes);
          expect(retrieved.effective_balance).toBe(cycleData.effective_balance);
          expect(retrieved.balance_type).toBe(cycleData.balance_type);
          return true;
        } finally { await closeInMemoryDb(db); }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Property 2: Uniqueness Constraint Enforcement
   * **Validates: Requirements 1.3, 2.5**
   */
  test('Property 2: Uniqueness Constraint Enforcement', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(billingCycleArbitrary, async (cycleData) => {
        const db = await createInMemoryDb();
        testCounter++;
        try {
          await createPaymentMethodsTable(db);
          await createBillingCyclesTable(db);
          const paymentMethodId = await insertCreditCardPaymentMethod(db, `UniqueTestCard_${testCounter}_${Date.now()}`, 15);
          await insertBillingCycle(db, { payment_method_id: paymentMethodId, ...cycleData });
          
          let duplicateError = null;
          try {
            await insertBillingCycle(db, {
              payment_method_id: paymentMethodId, ...cycleData,
              actual_statement_balance: cycleData.actual_statement_balance + 100
            });
          } catch (err) { duplicateError = err; }
          
          expect(duplicateError).not.toBeNull();
          expect(duplicateError.message).toMatch(/UNIQUE constraint failed/i);
          return true;
        } finally { await closeInMemoryDb(db); }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Property 3: Foreign Key Constraint Enforcement
   * **Validates: Requirements 1.2**
   */
  test('Property 3: Foreign Key Constraint Enforcement', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(
        billingCycleArbitrary,
        fc.integer({ min: 99999, max: 999999 }),
        async (cycleData, nonExistentId) => {
          const db = await createInMemoryDb();
          testCounter++;
          try {
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            let fkError = null;
            try {
              await insertBillingCycle(db, { payment_method_id: nonExistentId, ...cycleData });
            } catch (err) { fkError = err; }
            expect(fkError).not.toBeNull();
            expect(fkError.message).toMatch(/FOREIGN KEY constraint failed/i);
            return true;
          } finally { await closeInMemoryDb(db); }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 4: Cascade Delete Behavior
   * **Validates: Requirements 1.4**
   */
  test('Property 4: Cascade Delete Behavior', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(billingCyclesWithDistinctDatesArbitrary, async (cycles) => {
        const db = await createInMemoryDb();
        testCounter++;
        try {
          await createPaymentMethodsTable(db);
          await createBillingCyclesTable(db);
          const paymentMethodId = await insertCreditCardPaymentMethod(db, `CascadeTestCard_${testCounter}_${Date.now()}`, 15);
          const cycleIds = [];
          for (const cycle of cycles) {
            const cycleId = await insertBillingCycle(db, { payment_method_id: paymentMethodId, ...cycle });
            cycleIds.push(cycleId);
          }
          const beforeDelete = await getBillingCyclesByPaymentMethod(db, paymentMethodId);
          expect(beforeDelete.length).toBe(cycles.length);
          await deletePaymentMethod(db, paymentMethodId);
          const afterDelete = await getBillingCyclesByPaymentMethod(db, paymentMethodId);
          expect(afterDelete.length).toBe(0);
          for (const cycleId of cycleIds) {
            const cycle = await getBillingCycleById(db, cycleId);
            expect(cycle).toBeNull();
          }
          return true;
        } finally { await closeInMemoryDb(db); }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Property 5: History Sorting Order
   * **Validates: Requirements 2.2**
   */
  test('Property 5: History Sorting Order', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(billingCyclesWithDistinctDatesArbitrary, async (cycles) => {
        const db = await createInMemoryDb();
        testCounter++;
        try {
          await createPaymentMethodsTable(db);
          await createBillingCyclesTable(db);
          const paymentMethodId = await insertCreditCardPaymentMethod(db, `SortTestCard_${testCounter}_${Date.now()}`, 15);
          const shuffledCycles = [...cycles].sort(() => Math.random() - 0.5);
          for (const cycle of shuffledCycles) {
            await insertBillingCycle(db, { payment_method_id: paymentMethodId, ...cycle });
          }
          const history = await getBillingCyclesByPaymentMethod(db, paymentMethodId);
          expect(history.length).toBe(cycles.length);
          for (let i = 0; i < history.length - 1; i++) {
            expect(history[i].cycle_end_date >= history[i + 1].cycle_end_date).toBe(true);
          }
          return true;
        } finally { await closeInMemoryDb(db); }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Property 13: Date Range Filtering
   * **Validates: Requirements 1.5**
   */
  test('Property 13: Date Range Filtering', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(
        billingCyclesWithDistinctDatesArbitrary,
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 7, max: 12 }),
        async (cycles, startMonth, endMonth) => {
          const db = await createInMemoryDb();
          testCounter++;
          try {
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            const paymentMethodId = await insertCreditCardPaymentMethod(db, `FilterTestCard_${testCounter}_${Date.now()}`, 15);
            for (const cycle of cycles) {
              await insertBillingCycle(db, { payment_method_id: paymentMethodId, ...cycle });
            }
            const startDate = `2024-${String(startMonth).padStart(2, '0')}-01`;
            const endDate = `2024-${String(endMonth).padStart(2, '0')}-28`;
            const filtered = await getBillingCyclesByPaymentMethod(db, paymentMethodId, { startDate, endDate });
            for (const record of filtered) {
              expect(record.cycle_end_date >= startDate).toBe(true);
              expect(record.cycle_end_date <= endDate).toBe(true);
            }
            const expectedCount = cycles.filter(c => c.cycle_end_date >= startDate && c.cycle_end_date <= endDate).length;
            expect(filtered.length).toBe(expectedCount);
            return true;
          } finally { await closeInMemoryDb(db); }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Feature: migration-consolidation, Property 5: Billing cycle CRUD round-trip
   * For any valid billing cycle data with effective_balance and balance_type,
   * verify create-read round-trip and update-read round-trip return correct values.
   * **Validates: Requirements 5.3, 8.1, 8.2, 8.3**
   */
  test('Property 5 (migration-consolidation): Billing cycle CRUD round-trip with effective_balance/balance_type', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(
        billingCycleArbitrary,
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.constantFrom('actual', 'calculated'),
        async (cycleData, updatedEffectiveBalance, updatedBalanceType) => {
          const db = await createInMemoryDb();
          testCounter++;
          try {
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            const paymentMethodId = await insertCreditCardPaymentMethod(
              db, `EffBalTestCard_${testCounter}_${Date.now()}`, 15
            );

            // Create with effective_balance and balance_type
            const cycleId = await insertBillingCycle(db, {
              payment_method_id: paymentMethodId,
              ...cycleData
            });

            // Read back and verify create round-trip
            const created = await getBillingCycleById(db, cycleId);
            expect(created).not.toBeNull();
            expect(created.effective_balance).toBe(cycleData.effective_balance);
            expect(created.balance_type).toBe(cycleData.balance_type);
            expect(created.actual_statement_balance).toBe(cycleData.actual_statement_balance);
            expect(created.calculated_statement_balance).toBe(cycleData.calculated_statement_balance);

            // Update effective_balance and balance_type
            const updated = await updateBillingCycle(db, cycleId, {
              effective_balance: updatedEffectiveBalance,
              balance_type: updatedBalanceType
            });
            expect(updated).toBe(true);

            // Read back and verify update round-trip
            const afterUpdate = await getBillingCycleById(db, cycleId);
            expect(afterUpdate).not.toBeNull();
            expect(afterUpdate.effective_balance).toBe(updatedEffectiveBalance);
            expect(afterUpdate.balance_type).toBe(updatedBalanceType);
            // Other fields should be unchanged
            expect(afterUpdate.actual_statement_balance).toBe(cycleData.actual_statement_balance);
            expect(afterUpdate.calculated_statement_balance).toBe(cycleData.calculated_statement_balance);

            return true;
          } finally {
            await closeInMemoryDb(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });
});

// ============================================================================
// Transaction Count Tests (from billingCycleRepository.transactionCount.pbt.test.js)
// Uses createTestDatabase/closeTestDatabase from db.js (real test DB)
// ============================================================================

const { createTestDatabase, closeTestDatabase } = require('../database/db');
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
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE payment_method_id = 9999', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Property 5: Transaction Count Accuracy
   * **Validates: Requirements 3.2**
   */
  test('Property 5: Transaction Count Accuracy - Basic Count', async () => {
    const paymentMethodId = 9999;
    const cycleStartDate = '2024-06-16';
    const cycleEndDate = '2024-07-15';

    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO payment_methods (id, type, display_name, is_active, billing_cycle_day) 
         VALUES (?, 'credit_card', 'Test Card', 1, 15)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve()
      );
    });

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 5 }),
        async (insideCount, outsideCount) => {
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId], (err) => {
              if (err) reject(err); else resolve();
            });
          });

          for (let i = 0; i < insideCount; i++) {
            const day = 16 + (i % 30);
            const month = day > 30 ? '07' : '06';
            const actualDay = day > 30 ? day - 30 : day;
            const date = `2024-${month}-${String(actualDay).padStart(2, '0')}`;
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
                 VALUES (?, 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
                [date, paymentMethodId], (err) => err ? reject(err) : resolve()
              );
            });
          }

          for (let i = 0; i < outsideCount; i++) {
            const date = `2024-06-${String(1 + i).padStart(2, '0')}`;
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
                 VALUES (?, 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
                [date, paymentMethodId], (err) => err ? reject(err) : resolve()
              );
            });
          }

          const count = await billingCycleHistoryService.getTransactionCount(paymentMethodId, cycleStartDate, cycleEndDate);
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

    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO payment_methods (id, type, display_name, is_active, billing_cycle_day) 
         VALUES (?, 'credit_card', 'Test Card', 1, 15)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve()
      );
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    // date outside cycle but posted_date inside cycle
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-06-10', '2024-06-20', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve()
      );
    });

    // date inside cycle but posted_date outside cycle
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-06-20', '2024-06-10', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve()
      );
    });

    // date inside cycle and no posted_date
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) 
         VALUES ('2024-06-25', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve()
      );
    });

    const count = await billingCycleHistoryService.getTransactionCount(paymentMethodId, cycleStartDate, cycleEndDate);
    expect(count).toBe(2);
  });

  test('Property 5: Transaction Count Accuracy - Empty Cycle', async () => {
    const paymentMethodId = 9999;
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO payment_methods (id, type, display_name, is_active, billing_cycle_day) 
         VALUES (?, 'credit_card', 'Test Card', 1, 15)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId], (err) => {
        if (err) reject(err); else resolve();
      });
    });
    const count = await billingCycleHistoryService.getTransactionCount(paymentMethodId, '2024-06-16', '2024-07-15');
    expect(count).toBe(0);
  });

  test('Property 5: Transaction Count Accuracy - Boundary Dates', async () => {
    const paymentMethodId = 9999;
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO payment_methods (id, type, display_name, is_active, billing_cycle_day) 
         VALUES (?, 'credit_card', 'Test Card', 1, 15)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    // On exact start date
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) VALUES ('2024-06-16', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve());
    });
    // On exact end date
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) VALUES ('2024-07-15', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve());
    });
    // One day before start
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) VALUES ('2024-06-15', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve());
    });
    // One day after end
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) VALUES ('2024-07-16', 'Test Place', 10.00, 'Other', 1, 'Credit Card', ?)`,
        [paymentMethodId], (err) => err ? reject(err) : resolve());
    });

    const count = await billingCycleHistoryService.getTransactionCount(paymentMethodId, '2024-06-16', '2024-07-15');
    expect(count).toBe(2);
  });
});
