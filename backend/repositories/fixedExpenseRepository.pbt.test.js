/**
 * Property-Based Tests for Fixed Expense Repository
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();
const { CATEGORIES } = require('../utils/categories');

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(db);
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

// Helper function to create fixed_expenses table with category and payment_type
function createFixedExpensesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        category TEXT NOT NULL DEFAULT 'Other',
        payment_type TEXT NOT NULL DEFAULT 'Debit',
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

// Helper function to insert fixed expense
function insertFixedExpense(db, fixedExpense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)`,
      [fixedExpense.year, fixedExpense.month, fixedExpense.name, fixedExpense.amount, fixedExpense.category, fixedExpense.payment_type],
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

// Helper function to get fixed expense by ID
function getFixedExpenseById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM fixed_expenses WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

describe('Fixed Expense Repository - Property-Based Tests', () => {
  /**
   * Feature: enhanced-fixed-expenses, Property 2: Fixed expense storage round trip preserves category
   * Validates: Requirements 1.3
   * 
   * For any valid fixed expense with a category, creating it and then retrieving it 
   * should return the same category value
   */
  test('Property 2: Fixed expense storage round trip preserves category', async () => {
    // Arbitrary for generating valid fixed expense data
    const fixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      category: fc.constantFrom(...CATEGORIES),
      payment_type: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')
    });

    await fc.assert(
      fc.asyncProperty(
        fixedExpenseArbitrary,
        async (fixedExpense) => {
          const db = await createTestDatabase();
          
          try {
            // Create table
            await createFixedExpensesTable(db);
            
            // Insert fixed expense
            const id = await insertFixedExpense(db, fixedExpense);
            
            // Retrieve fixed expense
            const retrieved = await getFixedExpenseById(db, id);
            
            // Verify category is preserved
            expect(retrieved).toBeDefined();
            expect(retrieved.category).toBe(fixedExpense.category);
            
            // Also verify other fields for completeness
            expect(retrieved.year).toBe(fixedExpense.year);
            expect(retrieved.month).toBe(fixedExpense.month);
            expect(retrieved.name).toBe(fixedExpense.name);
            expect(retrieved.amount).toBe(fixedExpense.amount);
            
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
   * Feature: enhanced-fixed-expenses, Property 4: Fixed expense storage round trip preserves payment type
   * Validates: Requirements 2.3
   * 
   * For any valid fixed expense with a payment type, creating it and then retrieving it 
   * should return the same payment type value
   */
  test('Property 4: Fixed expense storage round trip preserves payment type', async () => {
    // Arbitrary for generating valid fixed expense data
    const fixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      category: fc.constantFrom(...CATEGORIES),
      payment_type: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')
    });

    await fc.assert(
      fc.asyncProperty(
        fixedExpenseArbitrary,
        async (fixedExpense) => {
          const db = await createTestDatabase();
          
          try {
            // Create table
            await createFixedExpensesTable(db);
            
            // Insert fixed expense
            const id = await insertFixedExpense(db, fixedExpense);
            
            // Retrieve fixed expense
            const retrieved = await getFixedExpenseById(db, id);
            
            // Verify payment_type is preserved
            expect(retrieved).toBeDefined();
            expect(retrieved.payment_type).toBe(fixedExpense.payment_type);
            
            // Also verify other fields for completeness
            expect(retrieved.year).toBe(fixedExpense.year);
            expect(retrieved.month).toBe(fixedExpense.month);
            expect(retrieved.name).toBe(fixedExpense.name);
            expect(retrieved.amount).toBe(fixedExpense.amount);
            
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
