/**
 * Property-Based Tests for Investment Value Service
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const investmentValueService = require('./investmentValueService');

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

// Mock the database module for testing
jest.mock('../database/db', () => {
  let mockDb = null;
  
  return {
    getDatabase: jest.fn(() => {
      if (!mockDb) {
        throw new Error('Mock database not initialized');
      }
      return Promise.resolve(mockDb);
    }),
    setMockDatabase: (db) => {
      mockDb = db;
    }
  };
});

const { setMockDatabase } = require('../database/db');

describe('Investment Value Service - Property-Based Tests', () => {
  /**
   * Feature: investment-tracking, Property 8: Value change calculation
   * Validates: Requirements 2.4
   * 
   * For any sequence of value entries for an investment, the calculated value change 
   * for each entry should equal the difference between its value and the previous month's value
   */
  test('Property 8: Value change calculation', async () => {
    const valueArbitrary = fc.float({ min: 0, max: 1000000, noNaN: true })
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        valueArbitrary,
        valueArbitrary,
        async (currentValue, previousValue) => {
          // Calculate value change using service method
          const valueChange = investmentValueService.calculateValueChange(currentValue, previousValue);
          
          // Expected value change is simply current - previous
          const expectedChange = currentValue - previousValue;
          
          // Verify the calculation is correct (allow small floating point error)
          expect(Math.abs(valueChange - expectedChange)).toBeLessThan(0.01);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: investment-tracking, Property 9: Percentage change calculation
   * Validates: Requirements 2.5
   * 
   * For any sequence of value entries for an investment, the calculated percentage change 
   * should equal ((current value - previous value) / previous value) * 100
   */
  test('Property 9: Percentage change calculation', async () => {
    const valueArbitrary = fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true })
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        valueArbitrary,
        valueArbitrary,
        async (currentValue, previousValue) => {
          // Calculate percentage change using service method
          const percentageChange = investmentValueService.calculatePercentageChange(currentValue, previousValue);
          
          // Expected percentage change
          let expectedChange;
          if (previousValue === 0) {
            expectedChange = currentValue === 0 ? 0 : 100;
          } else {
            expectedChange = ((currentValue - previousValue) / previousValue) * 100;
          }
          
          // Verify the calculation is correct (allow small floating point error)
          expect(Math.abs(percentageChange - expectedChange)).toBeLessThan(0.01);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test edge case: percentage change when previous value is zero
   */
  test('Property 9: Percentage change with zero previous value', async () => {
    const currentValueArbitrary = fc.float({ min: 0, max: 1000000, noNaN: true })
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        currentValueArbitrary,
        async (currentValue) => {
          const previousValue = 0;
          
          // Calculate percentage change using service method
          const percentageChange = investmentValueService.calculatePercentageChange(currentValue, previousValue);
          
          // When previous is 0, result should be 0 if current is 0, otherwise 100
          const expectedChange = currentValue === 0 ? 0 : 100;
          
          expect(percentageChange).toBe(expectedChange);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: investment-tracking, Property 14: Value history structure
   * Validates: Requirements 4.2
   * 
   * For any value entry in a history response, it should contain month, year, value, 
   * valueChange, and percentageChange fields
   */
  test('Property 14: Value history structure', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    // Generate 1-10 value entries for the investment
    const valueEntriesArbitrary = fc.array(
      fc.record({
        year: fc.integer({ min: 2020, max: 2030 }),
        month: fc.integer({ min: 1, max: 12 }),
        value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
      }),
      { minLength: 1, maxLength: 10 }
    );

    await fc.assert(
      fc.asyncProperty(
        investmentArbitrary,
        valueEntriesArbitrary,
        async (investment, valueEntries) => {
          const db = await createTestDatabase();
          setMockDatabase(db);
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            
            // Insert investment
            const investmentId = await insertInvestment(db, investment);
            
            // Insert value entries
            const insertedEntries = [];
            for (const entry of valueEntries) {
              try {
                await insertValueEntry(db, {
                  investment_id: investmentId,
                  year: entry.year,
                  month: entry.month,
                  value: entry.value
                });
                insertedEntries.push(entry);
              } catch (err) {
                // Skip duplicate entries (same year/month)
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Get value history using service
            const history = await investmentValueService.getValueHistory(investmentId);
            
            // Verify each entry has the required fields
            for (const entry of history) {
              expect(entry).toHaveProperty('id');
              expect(entry).toHaveProperty('investment_id');
              expect(entry).toHaveProperty('year');
              expect(entry).toHaveProperty('month');
              expect(entry).toHaveProperty('value');
              expect(entry).toHaveProperty('valueChange');
              expect(entry).toHaveProperty('percentageChange');
              expect(entry).toHaveProperty('created_at');
              expect(entry).toHaveProperty('updated_at');
              
              // Verify types
              expect(typeof entry.id).toBe('number');
              expect(typeof entry.investment_id).toBe('number');
              expect(typeof entry.year).toBe('number');
              expect(typeof entry.month).toBe('number');
              expect(typeof entry.value).toBe('number');
              expect(typeof entry.valueChange).toBe('number');
              expect(typeof entry.percentageChange).toBe('number');
              
              // Verify month is in valid range
              expect(entry.month).toBeGreaterThanOrEqual(1);
              expect(entry.month).toBeLessThanOrEqual(12);
              
              // Verify value is non-negative
              expect(entry.value).toBeGreaterThanOrEqual(0);
            }
            
            return true;
          } finally {
            setMockDatabase(null);
            await closeDatabase(db);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
