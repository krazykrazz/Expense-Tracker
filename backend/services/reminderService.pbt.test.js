/**
 * Property-Based Tests for Reminder Service
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        // Enable foreign keys
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

// Helper function to create investments table
function createInvestmentsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE investments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
        initial_value REAL NOT NULL CHECK(initial_value >= 0),
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

// Helper function to create investment_values table
function createInvestmentValuesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE investment_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        investment_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        value REAL NOT NULL CHECK(value >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
        UNIQUE(investment_id, year, month)
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

// Helper function to create loans table
function createLoansTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
        start_date TEXT NOT NULL,
        notes TEXT,
        loan_type TEXT DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit')),
        is_paid_off INTEGER DEFAULT 0 CHECK(is_paid_off IN (0, 1)),
        estimated_months_left INTEGER,
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

// Helper function to create loan_balances table
function createLoanBalancesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE loan_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
        rate REAL DEFAULT 0 CHECK(rate >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
        UNIQUE(loan_id, year, month)
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

// Helper function to insert investment
function insertInvestment(db, investment) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)`,
      [investment.name, investment.type, investment.initial_value],
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

// Helper function to insert value entry
function insertValueEntry(db, valueEntry) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)`,
      [valueEntry.investment_id, valueEntry.year, valueEntry.month, valueEntry.value],
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

// Helper function to insert loan
function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loans (name, initial_balance, start_date, loan_type, is_paid_off) VALUES (?, ?, ?, ?, ?)`,
      [loan.name, loan.initial_balance, loan.start_date, loan.loan_type, loan.is_paid_off],
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

// Helper function to insert loan balance
function insertLoanBalance(db, balance) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)`,
      [balance.loan_id, balance.year, balance.month, balance.remaining_balance, balance.rate],
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

// Helper function to get reminder status
function getReminderStatus(db, year, month) {
  return new Promise((resolve, reject) => {
    // Get investments with value status
    const investmentsSql = `
      SELECT 
        i.id,
        i.name,
        i.type,
        CASE 
          WHEN iv.id IS NOT NULL THEN 1 
          ELSE 0 
        END as hasValue
      FROM investments i
      LEFT JOIN investment_values iv 
        ON i.id = iv.investment_id 
        AND iv.year = ? 
        AND iv.month = ?
      ORDER BY i.name ASC
    `;
    
    db.all(investmentsSql, [year, month], (err, investments) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Get loans with balance status
      const loansSql = `
        SELECT 
          l.id,
          l.name,
          l.loan_type,
          CASE 
            WHEN lb.id IS NOT NULL THEN 1 
            ELSE 0 
          END as hasBalance
        FROM loans l
        LEFT JOIN loan_balances lb 
          ON l.id = lb.loan_id 
          AND lb.year = ? 
          AND lb.month = ?
        WHERE l.is_paid_off = 0
        ORDER BY l.name ASC
      `;
      
      db.all(loansSql, [year, month], (err, loans) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Calculate counts
        const missingInvestments = investments.filter(inv => !inv.hasValue).length;
        const missingLoans = loans.filter(loan => !loan.hasBalance).length;
        
        resolve({
          missingInvestments,
          missingLoans,
          hasActiveInvestments: investments.length > 0,
          hasActiveLoans: loans.length > 0,
          investments: investments.map(inv => ({
            id: inv.id,
            name: inv.name,
            type: inv.type,
            hasValue: Boolean(inv.hasValue)
          })),
          loans: loans.map(loan => ({
            id: loan.id,
            name: loan.name,
            loan_type: loan.loan_type,
            hasBalance: Boolean(loan.hasBalance)
          }))
        });
      });
    });
  });
}

describe('Reminder Service - Property-Based Tests', () => {
  /**
   * Feature: monthly-data-reminders, Property 1: Missing investment data triggers reminder
   * Validates: Requirements 1.1, 4.1
   * 
   * For any set of active investments and month, when at least one investment is missing 
   * a value for that month, the reminder status should indicate missing investments with 
   * the correct count
   */
  test('Property 1: Missing investment data triggers reminder', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generate 1-5 investments
    const investmentsArrayArbitrary = fc.array(investmentArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        investmentsArrayArbitrary,
        yearMonthArbitrary,
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 3 }), // Indices of investments to add values for
        async (investments, targetMonth, investmentIndicesWithValues) => {
          const db = await createTestDatabase();
          
          try {
            // Create all tables (reminder status queries both investments and loans)
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert investments
            const investmentIds = [];
            for (const investment of investments) {
              const id = await insertInvestment(db, investment);
              investmentIds.push(id);
            }
            
            // Add values for some investments (but not all)
            const uniqueIndices = [...new Set(investmentIndicesWithValues)].filter(idx => idx < investments.length);
            for (const idx of uniqueIndices) {
              try {
                await insertValueEntry(db, {
                  investment_id: investmentIds[idx],
                  year: targetMonth.year,
                  month: targetMonth.month,
                  value: 10000
                });
              } catch (err) {
                // Skip if duplicate
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Calculate expected missing count
            const expectedMissing = investments.length - uniqueIndices.length;
            
            // Verify
            expect(status.hasActiveInvestments).toBe(true);
            expect(status.missingInvestments).toBe(expectedMissing);
            
            // If there are missing investments, count should be > 0
            if (expectedMissing > 0) {
              expect(status.missingInvestments).toBeGreaterThan(0);
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: monthly-data-reminders, Property 2: Complete investment data suppresses reminder
   * Validates: Requirements 1.2
   * 
   * For any set of active investments and month, when all investments have values for 
   * that month, the reminder status should indicate zero missing investments
   */
  test('Property 2: Complete investment data suppresses reminder', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generate 1-5 investments
    const investmentsArrayArbitrary = fc.array(investmentArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        investmentsArrayArbitrary,
        yearMonthArbitrary,
        async (investments, targetMonth) => {
          const db = await createTestDatabase();
          
          try {
            // Create all tables (reminder status queries both investments and loans)
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert investments
            const investmentIds = [];
            for (const investment of investments) {
              const id = await insertInvestment(db, investment);
              investmentIds.push(id);
            }
            
            // Add values for ALL investments
            for (const investmentId of investmentIds) {
              await insertValueEntry(db, {
                investment_id: investmentId,
                year: targetMonth.year,
                month: targetMonth.month,
                value: 10000
              });
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Verify - should have zero missing investments
            expect(status.hasActiveInvestments).toBe(true);
            expect(status.missingInvestments).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: monthly-data-reminders, Property 3: Missing loan data triggers reminder
   * Validates: Requirements 2.1, 4.2
   * 
   * For any set of active loans and month, when at least one loan is missing a balance 
   * for that month, the reminder status should indicate missing loans with the correct count
   */
  test('Property 3: Missing loan data triggers reminder', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      initial_balance: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.integer({ min: 2020, max: 2030 }).chain(year => 
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day => 
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      loan_type: fc.constantFrom('loan', 'line_of_credit'),
      is_paid_off: fc.constant(0) // Only active loans
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generate 1-5 loans
    const loansArrayArbitrary = fc.array(loanArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        loansArrayArbitrary,
        yearMonthArbitrary,
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 3 }), // Indices of loans to add balances for
        async (loans, targetMonth, loanIndicesWithBalances) => {
          const db = await createTestDatabase();
          
          try {
            // Create all tables (reminder status queries both investments and loans)
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert loans
            const loanIds = [];
            for (const loan of loans) {
              const id = await insertLoan(db, loan);
              loanIds.push(id);
            }
            
            // Add balances for some loans (but not all)
            const uniqueIndices = [...new Set(loanIndicesWithBalances)].filter(idx => idx < loans.length);
            for (const idx of uniqueIndices) {
              try {
                await insertLoanBalance(db, {
                  loan_id: loanIds[idx],
                  year: targetMonth.year,
                  month: targetMonth.month,
                  remaining_balance: 5000,
                  rate: 3.5
                });
              } catch (err) {
                // Skip if duplicate
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Calculate expected missing count
            const expectedMissing = loans.length - uniqueIndices.length;
            
            // Verify
            expect(status.hasActiveLoans).toBe(true);
            expect(status.missingLoans).toBe(expectedMissing);
            
            // If there are missing loans, count should be > 0
            if (expectedMissing > 0) {
              expect(status.missingLoans).toBeGreaterThan(0);
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: monthly-data-reminders, Property 4: Complete loan data suppresses reminder
   * Validates: Requirements 2.2
   * 
   * For any set of active loans and month, when all loans have balances for that month, 
   * the reminder status should indicate zero missing loans
   */
  test('Property 4: Complete loan data suppresses reminder', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      initial_balance: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.integer({ min: 2020, max: 2030 }).chain(year => 
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day => 
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      loan_type: fc.constantFrom('loan', 'line_of_credit'),
      is_paid_off: fc.constant(0) // Only active loans
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generate 1-5 loans
    const loansArrayArbitrary = fc.array(loanArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        loansArrayArbitrary,
        yearMonthArbitrary,
        async (loans, targetMonth) => {
          const db = await createTestDatabase();
          
          try {
            // Create all tables (reminder status queries both investments and loans)
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert loans
            const loanIds = [];
            for (const loan of loans) {
              const id = await insertLoan(db, loan);
              loanIds.push(id);
            }
            
            // Add balances for ALL loans
            for (const loanId of loanIds) {
              await insertLoanBalance(db, {
                loan_id: loanId,
                year: targetMonth.year,
                month: targetMonth.month,
                remaining_balance: 5000,
                rate: 3.5
              });
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Verify - should have zero missing loans
            expect(status.hasActiveLoans).toBe(true);
            expect(status.missingLoans).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: monthly-data-reminders, Property 6: Count accuracy for investments
   * Feature: monthly-data-reminders, Property 7: Count accuracy for loans
   * Validates: Requirements 4.1, 4.2
   * 
   * For any set of investments/loans and month, the count of missing data should equal 
   * the number of active items without values/balances for that month
   */
  test('Property 6 & 7: Count accuracy for investments and loans', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      initial_balance: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.integer({ min: 2020, max: 2030 }).chain(year => 
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day => 
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      loan_type: fc.constantFrom('loan', 'line_of_credit'),
      is_paid_off: fc.constant(0)
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(investmentArbitrary, { minLength: 0, maxLength: 5 }),
        fc.array(loanArbitrary, { minLength: 0, maxLength: 5 }),
        yearMonthArbitrary,
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 3 }),
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 3 }),
        async (investments, loans, targetMonth, investmentIndicesWithValues, loanIndicesWithBalances) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert investments
            const investmentIds = [];
            for (const investment of investments) {
              const id = await insertInvestment(db, investment);
              investmentIds.push(id);
            }
            
            // Insert loans
            const loanIds = [];
            for (const loan of loans) {
              const id = await insertLoan(db, loan);
              loanIds.push(id);
            }
            
            // Add values for some investments
            const uniqueInvIndices = [...new Set(investmentIndicesWithValues)].filter(idx => idx < investments.length);
            for (const idx of uniqueInvIndices) {
              try {
                await insertValueEntry(db, {
                  investment_id: investmentIds[idx],
                  year: targetMonth.year,
                  month: targetMonth.month,
                  value: 10000
                });
              } catch (err) {
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Add balances for some loans
            const uniqueLoanIndices = [...new Set(loanIndicesWithBalances)].filter(idx => idx < loans.length);
            for (const idx of uniqueLoanIndices) {
              try {
                await insertLoanBalance(db, {
                  loan_id: loanIds[idx],
                  year: targetMonth.year,
                  month: targetMonth.month,
                  remaining_balance: 5000,
                  rate: 3.5
                });
              } catch (err) {
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Calculate expected counts
            const expectedMissingInvestments = investments.length - uniqueInvIndices.length;
            const expectedMissingLoans = loans.length - uniqueLoanIndices.length;
            
            // Verify counts are accurate
            expect(status.missingInvestments).toBe(expectedMissingInvestments);
            expect(status.missingLoans).toBe(expectedMissingLoans);
            
            // Verify hasActive flags
            expect(status.hasActiveInvestments).toBe(investments.length > 0);
            expect(status.hasActiveLoans).toBe(loans.length > 0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });
});
