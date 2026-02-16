/**
 * Property-Based Tests for Billing Cycle Repository
 * Feature: credit-card-billing-cycle-history
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.4**
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions, safeDate, safeAmount, safeString } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        db.run('PRAGMA foreign_keys = ON', (fkErr) => {
          if (fkErr) {
            reject(fkErr);
          } else {
            resolve(db);
          }
        });
      }
    });
  });
}

// Helper function to close database
function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to create payment_methods table
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
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to create credit_card_billing_cycles table
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
        due_date TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE,
        UNIQUE(payment_method_id, cycle_end_date)
      )
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to insert a credit card payment method
function insertCreditCardPaymentMethod(db, displayName, billingCycleDay = null) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, billing_cycle_day, is_active)
       VALUES ('credit_card', ?, ?, ?, 1)`,
      [displayName, displayName, billingCycleDay],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// Helper function to insert billing cycle
function insertBillingCycle(db, data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO credit_card_billing_cycles 
       (payment_method_id, cycle_start_date, cycle_end_date, actual_statement_balance, 
        calculated_statement_balance, minimum_payment, due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.payment_method_id,
        data.cycle_start_date,
        data.cycle_end_date,
        data.actual_statement_balance,
        data.calculated_statement_balance,
        data.minimum_payment !== undefined && data.minimum_payment !== null ? data.minimum_payment : null,
        data.due_date || null,
        data.notes || null
      ],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// Helper function to get billing cycle by ID
function getBillingCycleById(db, id) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM credit_card_billing_cycles WHERE id = ?',
      [id],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

// Helper function to get billing cycles by payment method (sorted by cycle_end_date DESC)
function getBillingCyclesByPaymentMethod(db, paymentMethodId, options = {}) {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT * FROM credit_card_billing_cycles 
      WHERE payment_method_id = ?
    `;
    const params = [paymentMethodId];
    
    if (options.startDate) {
      sql += ' AND cycle_end_date >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      sql += ' AND cycle_end_date <= ?';
      params.push(options.endDate);
    }
    
    sql += ' ORDER BY cycle_end_date DESC';
    
    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

// Helper function to delete payment method
function deletePaymentMethod(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM payment_methods WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

// Arbitrary for generating billing cycle data
const billingCycleArbitrary = fc.record({
  cycle_start_date: safeDate({ min: new Date('2024-01-01'), max: new Date('2024-06-30') }),
  cycle_end_date: safeDate({ min: new Date('2024-07-01'), max: new Date('2024-12-31') }),
  actual_statement_balance: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
    .map(n => Math.round(n * 100) / 100),
  calculated_statement_balance: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
    .map(n => Math.round(n * 100) / 100),
  minimum_payment: fc.option(
    fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true })
      .map(n => Math.round(n * 100) / 100),
    { nil: null }
  ),
  due_date: fc.option(safeDate(), { nil: null }),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null })
});

// Arbitrary for generating multiple billing cycles with distinct cycle_end_dates
const billingCyclesWithDistinctDatesArbitrary = fc.array(
  billingCycleArbitrary,
  { minLength: 2, maxLength: 10 }
).chain(cycles => {
  // Ensure distinct cycle_end_dates by modifying each cycle
  const distinctCycles = cycles.map((c, index) => ({
    ...c,
    cycle_start_date: `2024-${String(index + 1).padStart(2, '0')}-01`,
    cycle_end_date: `2024-${String(index + 1).padStart(2, '0')}-28`
  }));
  return fc.constant(distinctCycles);
});

describe('BillingCycleRepository - Property-Based Tests', () => {
  /**
   * Feature: credit-card-billing-cycle-history, Property 1: Billing Cycle CRUD Round-Trip
   * **Validates: Requirements 1.1, 2.1, 2.4**
   * 
   * For any valid billing cycle data, creating a record and then retrieving it by ID 
   * SHALL return an equivalent record with all fields preserved.
   */
  test('Property 1: Billing Cycle CRUD Round-Trip', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        billingCycleArbitrary,
        async (cycleData) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            
            // Create a credit card payment method
            const paymentMethodId = await insertCreditCardPaymentMethod(
              db, 
              `TestCard_${testCounter}_${Date.now()}`,
              15
            );
            
            // Insert billing cycle
            const cycleId = await insertBillingCycle(db, {
              payment_method_id: paymentMethodId,
              ...cycleData
            });
            
            // Retrieve billing cycle
            const retrieved = await getBillingCycleById(db, cycleId);
            
            // Verify all fields are preserved
            expect(retrieved).not.toBeNull();
            expect(retrieved.id).toBe(cycleId);
            expect(retrieved.payment_method_id).toBe(paymentMethodId);
            expect(retrieved.cycle_start_date).toBe(cycleData.cycle_start_date);
            expect(retrieved.cycle_end_date).toBe(cycleData.cycle_end_date);
            expect(retrieved.actual_statement_balance).toBe(cycleData.actual_statement_balance);
            expect(retrieved.calculated_statement_balance).toBe(cycleData.calculated_statement_balance);
            expect(retrieved.minimum_payment).toBe(cycleData.minimum_payment);
            expect(retrieved.due_date).toBe(cycleData.due_date);
            expect(retrieved.notes).toBe(cycleData.notes);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-cycle-history, Property 2: Uniqueness Constraint Enforcement
   * **Validates: Requirements 1.3, 2.5**
   * 
   * For any payment_method_id and cycle_end_date combination, attempting to create 
   * a second billing cycle record with the same combination SHALL fail with a duplicate error.
   */
  test('Property 2: Uniqueness Constraint Enforcement', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        billingCycleArbitrary,
        async (cycleData) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            
            // Create a credit card payment method
            const paymentMethodId = await insertCreditCardPaymentMethod(
              db, 
              `UniqueTestCard_${testCounter}_${Date.now()}`,
              15
            );
            
            // Insert first billing cycle
            await insertBillingCycle(db, {
              payment_method_id: paymentMethodId,
              ...cycleData
            });
            
            // Attempt to insert duplicate (same payment_method_id and cycle_end_date)
            let duplicateError = null;
            try {
              await insertBillingCycle(db, {
                payment_method_id: paymentMethodId,
                ...cycleData,
                actual_statement_balance: cycleData.actual_statement_balance + 100 // Different balance
              });
            } catch (err) {
              duplicateError = err;
            }
            
            // Verify duplicate was rejected
            expect(duplicateError).not.toBeNull();
            expect(duplicateError.message).toMatch(/UNIQUE constraint failed/i);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-cycle-history, Property 3: Foreign Key Constraint Enforcement
   * **Validates: Requirements 1.2**
   * 
   * For any billing cycle creation attempt with a non-existent payment_method_id, 
   * the operation SHALL fail with a foreign key constraint error.
   */
  test('Property 3: Foreign Key Constraint Enforcement', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        billingCycleArbitrary,
        fc.integer({ min: 99999, max: 999999 }), // Non-existent payment method ID
        async (cycleData, nonExistentId) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            
            // Attempt to insert billing cycle with non-existent payment_method_id
            let fkError = null;
            try {
              await insertBillingCycle(db, {
                payment_method_id: nonExistentId,
                ...cycleData
              });
            } catch (err) {
              fkError = err;
            }
            
            // Verify foreign key constraint was enforced
            expect(fkError).not.toBeNull();
            expect(fkError.message).toMatch(/FOREIGN KEY constraint failed/i);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-cycle-history, Property 4: Cascade Delete Behavior
   * **Validates: Requirements 1.4**
   * 
   * For any payment method with associated billing cycle records, deleting the payment 
   * method SHALL also delete all associated billing cycle records.
   */
  test('Property 4: Cascade Delete Behavior', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        billingCyclesWithDistinctDatesArbitrary,
        async (cycles) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            
            // Create a credit card payment method
            const paymentMethodId = await insertCreditCardPaymentMethod(
              db, 
              `CascadeTestCard_${testCounter}_${Date.now()}`,
              15
            );
            
            // Insert multiple billing cycles
            const cycleIds = [];
            for (const cycle of cycles) {
              const cycleId = await insertBillingCycle(db, {
                payment_method_id: paymentMethodId,
                ...cycle
              });
              cycleIds.push(cycleId);
            }
            
            // Verify cycles were created
            const beforeDelete = await getBillingCyclesByPaymentMethod(db, paymentMethodId);
            expect(beforeDelete.length).toBe(cycles.length);
            
            // Delete the payment method
            await deletePaymentMethod(db, paymentMethodId);
            
            // Verify all billing cycles were cascade deleted
            const afterDelete = await getBillingCyclesByPaymentMethod(db, paymentMethodId);
            expect(afterDelete.length).toBe(0);
            
            // Also verify by ID
            for (const cycleId of cycleIds) {
              const cycle = await getBillingCycleById(db, cycleId);
              expect(cycle).toBeNull();
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-cycle-history, Property 5: History Sorting Order
   * **Validates: Requirements 2.2**
   * 
   * For any set of billing cycle records for a payment method, retrieving the history 
   * SHALL return records sorted by cycle_end_date in descending order (most recent first).
   */
  test('Property 5: History Sorting Order', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        billingCyclesWithDistinctDatesArbitrary,
        async (cycles) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            
            // Create a credit card payment method
            const paymentMethodId = await insertCreditCardPaymentMethod(
              db, 
              `SortTestCard_${testCounter}_${Date.now()}`,
              15
            );
            
            // Insert cycles in random order (shuffle)
            const shuffledCycles = [...cycles].sort(() => Math.random() - 0.5);
            
            for (const cycle of shuffledCycles) {
              await insertBillingCycle(db, {
                payment_method_id: paymentMethodId,
                ...cycle
              });
            }
            
            // Retrieve history
            const history = await getBillingCyclesByPaymentMethod(db, paymentMethodId);
            
            // Verify count matches
            expect(history.length).toBe(cycles.length);
            
            // Verify descending order by cycle_end_date
            for (let i = 0; i < history.length - 1; i++) {
              const currentDate = history[i].cycle_end_date;
              const nextDate = history[i + 1].cycle_end_date;
              
              // Current date should be >= next date (descending order)
              expect(currentDate >= nextDate).toBe(true);
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-cycle-history, Property 13: Date Range Filtering
   * **Validates: Requirements 1.5**
   * 
   * For any billing cycle history query with startDate and endDate filters, all returned 
   * records SHALL have cycle_end_date within the specified range (inclusive).
   */
  test('Property 13: Date Range Filtering', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        billingCyclesWithDistinctDatesArbitrary,
        fc.integer({ min: 1, max: 6 }), // Start month
        fc.integer({ min: 7, max: 12 }), // End month
        async (cycles, startMonth, endMonth) => {
          const db = await createTestDatabase();
          testCounter++;
          
          try {
            // Create tables
            await createPaymentMethodsTable(db);
            await createBillingCyclesTable(db);
            
            // Create a credit card payment method
            const paymentMethodId = await insertCreditCardPaymentMethod(
              db, 
              `FilterTestCard_${testCounter}_${Date.now()}`,
              15
            );
            
            // Insert all cycles
            for (const cycle of cycles) {
              await insertBillingCycle(db, {
                payment_method_id: paymentMethodId,
                ...cycle
              });
            }
            
            // Define date range
            const startDate = `2024-${String(startMonth).padStart(2, '0')}-01`;
            const endDate = `2024-${String(endMonth).padStart(2, '0')}-28`;
            
            // Query with date range filter
            const filtered = await getBillingCyclesByPaymentMethod(db, paymentMethodId, {
              startDate,
              endDate
            });
            
            // Verify all returned records are within the date range
            for (const record of filtered) {
              expect(record.cycle_end_date >= startDate).toBe(true);
              expect(record.cycle_end_date <= endDate).toBe(true);
            }
            
            // Verify we got the expected records
            const expectedCount = cycles.filter(c => 
              c.cycle_end_date >= startDate && c.cycle_end_date <= endDate
            ).length;
            expect(filtered.length).toBe(expectedCount);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });
});
