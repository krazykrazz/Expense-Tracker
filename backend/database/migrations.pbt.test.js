/**
 * Property-Based Tests for Database Migrations
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');

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

// Helper function to create expenses table with old schema (without Personal Care)
function createOldExpensesTable(db) {
  return new Promise((resolve, reject) => {
    const oldCategories = CATEGORIES.filter(c => c !== 'Personal Care');
    const categoryList = oldCategories.map(c => `'${c}'`).join(', ');
    
    db.run(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        place TEXT,
        notes TEXT,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN (${categoryList})),
        week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
        method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

// Helper function to create budgets table with old schema (without Personal Care)
function createOldBudgetsTable(db) {
  return new Promise((resolve, reject) => {
    const oldCategories = BUDGETABLE_CATEGORIES.filter(c => c !== 'Personal Care');
    const categoryList = oldCategories.map(c => `'${c}'`).join(', ');
    
    db.run(`
      CREATE TABLE budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
        category TEXT NOT NULL CHECK(category IN (${categoryList})),
        "limit" REAL NOT NULL CHECK("limit" > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, month, category)
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

// Helper function to create expenses table with new schema (with Personal Care)
function createNewExpensesTable(db) {
  return new Promise((resolve, reject) => {
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    
    db.run(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        place TEXT,
        notes TEXT,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN (${categoryList})),
        week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
        method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

// Helper function to create budgets table with new schema (with Personal Care)
function createNewBudgetsTable(db) {
  return new Promise((resolve, reject) => {
    const categoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
    
    db.run(`
      CREATE TABLE budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
        category TEXT NOT NULL CHECK(category IN (${categoryList})),
        "limit" REAL NOT NULL CHECK("limit" > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, month, category)
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

// Helper function to insert expense
function insertExpense(db, expense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method],
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

// Helper function to insert budget
function insertBudget(db, budget) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)`,
      [budget.year, budget.month, budget.category, budget.limit],
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

// Helper function to count expenses
function countExpenses(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count);
      }
    });
  });
}

// Helper function to count budgets
function countBudgets(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM budgets', (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count);
      }
    });
  });
}

// Helper function to get all expenses
function getAllExpenses(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM expenses ORDER BY id', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Helper function to get all budgets
function getAllBudgets(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM budgets ORDER BY id', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Helper function to create fixed_expenses table without category and payment_type
function createOldFixedExpensesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
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

// Helper function to insert fixed expense (old schema)
function insertOldFixedExpense(db, fixedExpense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)`,
      [fixedExpense.year, fixedExpense.month, fixedExpense.name, fixedExpense.amount],
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

// Helper function to get all fixed expenses
function getAllFixedExpenses(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM fixed_expenses ORDER BY id', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Helper function to count fixed expenses
function countFixedExpenses(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM fixed_expenses', (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count);
      }
    });
  });
}

describe('Database Migrations - Property-Based Tests', () => {
  /**
   * Feature: personal-care-category, Property 4: Database constraint accepts Personal Care
   * Validates: Requirements 1.2, 2.3
   * 
   * For any expense record with category "Personal Care", inserting it into the expenses table 
   * should succeed without constraint violations
   */
  test('Property 4: Database constraint accepts Personal Care', async () => {
    // Arbitrary for generating valid expense data with Personal Care category
    const personalCareExpenseArbitrary = fc.record({
      date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      place: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 100 })),
      notes: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 200 })),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      type: fc.constant('Personal Care'),
      week: fc.integer({ min: 1, max: 5 }),
      method: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')
    });

    await fc.assert(
      fc.asyncProperty(
        personalCareExpenseArbitrary,
        async (expense) => {
          const db = await createTestDatabase();
          
          try {
            // Create table with new schema that includes Personal Care
            await createNewExpensesTable(db);
            
            // Insert expense with Personal Care category
            const id = await insertExpense(db, expense);
            
            // Verify insertion succeeded
            expect(id).toBeGreaterThan(0);
            
            // Verify the expense was actually inserted
            const count = await countExpenses(db);
            expect(count).toBe(1);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that Personal Care can be used in budgets table
   */
  test('Property 4 (budgets): Database constraint accepts Personal Care in budgets', async () => {
    // Arbitrary for generating valid budget data with Personal Care category
    const personalCareBudgetArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constant('Personal Care'),
      limit: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(
        personalCareBudgetArbitrary,
        async (budget) => {
          const db = await createTestDatabase();
          
          try {
            // Create table with new schema that includes Personal Care
            await createNewBudgetsTable(db);
            
            // Insert budget with Personal Care category
            const id = await insertBudget(db, budget);
            
            // Verify insertion succeeded
            expect(id).toBeGreaterThan(0);
            
            // Verify the budget was actually inserted
            const count = await countBudgets(db);
            expect(count).toBe(1);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: personal-care-category, Property 5: Migration preserves existing data
   * Validates: Requirements 2.1, 2.2
   * 
   * For any database state before migration, after running the Personal Care migration, 
   * all existing expense records should remain unchanged in count and content
   */
  test('Property 5: Migration preserves existing data', async () => {
    // Arbitrary for generating valid expenses with old categories (excluding Personal Care)
    const oldCategories = CATEGORIES.filter(c => c !== 'Personal Care');
    const oldExpenseArbitrary = fc.record({
      date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      place: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 100 })),
      notes: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 200 })),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      type: fc.constantFrom(...oldCategories),
      week: fc.integer({ min: 1, max: 5 }),
      method: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')
    });

    // Generate array of 1-10 expenses
    const expensesArrayArbitrary = fc.array(oldExpenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(
        expensesArrayArbitrary,
        async (expenses) => {
          const db = await createTestDatabase();
          
          try {
            // Create old schema table (without Personal Care)
            await createOldExpensesTable(db);
            
            // Insert all expenses
            for (const expense of expenses) {
              await insertExpense(db, expense);
            }
            
            // Get count and data before migration
            const countBefore = await countExpenses(db);
            const expensesBefore = await getAllExpenses(db);
            
            // Simulate migration: recreate table with new schema
            await new Promise((resolve, reject) => {
              const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
              
              db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => {
                  if (err) return reject(err);
                  
                  db.run(`
                    CREATE TABLE expenses_new (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      date TEXT NOT NULL,
                      place TEXT,
                      notes TEXT,
                      amount REAL NOT NULL,
                      type TEXT NOT NULL CHECK(type IN (${categoryList})),
                      week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
                      method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                      created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    
                    db.run('INSERT INTO expenses_new SELECT * FROM expenses', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      db.run('DROP TABLE expenses', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }
                        
                        db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
                          if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                          }
                          
                          db.run('COMMIT', (err) => {
                            if (err) {
                              db.run('ROLLBACK');
                              return reject(err);
                            }
                            resolve();
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
            
            // Get count and data after migration
            const countAfter = await countExpenses(db);
            const expensesAfter = await getAllExpenses(db);
            
            // Verify count is preserved
            expect(countAfter).toBe(countBefore);
            expect(countAfter).toBe(expenses.length);
            
            // Verify all data is preserved
            expect(expensesAfter.length).toBe(expensesBefore.length);
            
            for (let i = 0; i < expensesBefore.length; i++) {
              expect(expensesAfter[i].id).toBe(expensesBefore[i].id);
              expect(expensesAfter[i].date).toBe(expensesBefore[i].date);
              expect(expensesAfter[i].place).toBe(expensesBefore[i].place);
              expect(expensesAfter[i].notes).toBe(expensesBefore[i].notes);
              expect(expensesAfter[i].amount).toBe(expensesBefore[i].amount);
              expect(expensesAfter[i].type).toBe(expensesBefore[i].type);
              expect(expensesAfter[i].week).toBe(expensesBefore[i].week);
              expect(expensesAfter[i].method).toBe(expensesBefore[i].method);
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      { numRuns: 50 } // Reduced runs since this is more complex
    );
  });

  /**
   * Test that migration preserves budget data
   */
  test('Property 5 (budgets): Migration preserves existing budget data', async () => {
    // Arbitrary for generating valid budgets with old categories (excluding Personal Care)
    const oldBudgetableCategories = BUDGETABLE_CATEGORIES.filter(c => c !== 'Personal Care');
    const oldBudgetArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constantFrom(...oldBudgetableCategories),
      limit: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    // Generate array of 1-5 unique budgets (unique by year/month/category combination)
    const budgetsArrayArbitrary = fc.array(oldBudgetArbitrary, { minLength: 1, maxLength: 5 })
      .map(budgets => {
        // Ensure uniqueness by year/month/category
        const seen = new Set();
        return budgets.filter(b => {
          const key = `${b.year}-${b.month}-${b.category}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      })
      .filter(budgets => budgets.length > 0);

    await fc.assert(
      fc.asyncProperty(
        budgetsArrayArbitrary,
        async (budgets) => {
          const db = await createTestDatabase();
          
          try {
            // Create old schema table (without Personal Care)
            await createOldBudgetsTable(db);
            
            // Insert all budgets
            for (const budget of budgets) {
              await insertBudget(db, budget);
            }
            
            // Get count and data before migration
            const countBefore = await countBudgets(db);
            const budgetsBefore = await getAllBudgets(db);
            
            // Simulate migration: recreate table with new schema
            await new Promise((resolve, reject) => {
              const categoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
              
              db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => {
                  if (err) return reject(err);
                  
                  db.run(`
                    CREATE TABLE budgets_new (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      year INTEGER NOT NULL,
                      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
                      category TEXT NOT NULL CHECK(category IN (${categoryList})),
                      "limit" REAL NOT NULL CHECK("limit" > 0),
                      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      UNIQUE(year, month, category)
                    )
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    
                    db.run('INSERT INTO budgets_new SELECT * FROM budgets', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      db.run('DROP TABLE budgets', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }
                        
                        db.run('ALTER TABLE budgets_new RENAME TO budgets', (err) => {
                          if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                          }
                          
                          db.run('COMMIT', (err) => {
                            if (err) {
                              db.run('ROLLBACK');
                              return reject(err);
                            }
                            resolve();
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
            
            // Get count and data after migration
            const countAfter = await countBudgets(db);
            const budgetsAfter = await getAllBudgets(db);
            
            // Verify count is preserved
            expect(countAfter).toBe(countBefore);
            expect(countAfter).toBe(budgets.length);
            
            // Verify all data is preserved
            expect(budgetsAfter.length).toBe(budgetsBefore.length);
            
            for (let i = 0; i < budgetsBefore.length; i++) {
              expect(budgetsAfter[i].id).toBe(budgetsBefore[i].id);
              expect(budgetsAfter[i].year).toBe(budgetsBefore[i].year);
              expect(budgetsAfter[i].month).toBe(budgetsBefore[i].month);
              expect(budgetsAfter[i].category).toBe(budgetsBefore[i].category);
              expect(budgetsAfter[i].limit).toBe(budgetsBefore[i].limit);
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      { numRuns: 50 } // Reduced runs since this is more complex
    );
  });

  /**
   * Feature: enhanced-fixed-expenses, Property 5: Migration preserves existing data
   * Validates: Requirements 3.4
   * 
   * For any set of existing fixed expenses, running the migration should preserve 
   * all original name, amount, year, and month values
   */
  test('Property 5 (fixed expenses): Migration preserves existing fixed expense data', async () => {
    // Arbitrary for generating valid fixed expenses without category and payment_type
    const oldFixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    // Generate array of 1-10 fixed expenses
    const fixedExpensesArrayArbitrary = fc.array(oldFixedExpenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(
        fixedExpensesArrayArbitrary,
        async (fixedExpenses) => {
          const db = await createTestDatabase();
          
          try {
            // Create old schema table (without category and payment_type)
            await createOldFixedExpensesTable(db);
            
            // Insert all fixed expenses
            for (const fixedExpense of fixedExpenses) {
              await insertOldFixedExpense(db, fixedExpense);
            }
            
            // Get count and data before migration
            const countBefore = await countFixedExpenses(db);
            const fixedExpensesBefore = await getAllFixedExpenses(db);
            
            // Simulate migration: add category and payment_type columns
            await new Promise((resolve, reject) => {
              db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => {
                  if (err) return reject(err);
                  
                  // Add category column with default value 'Other'
                  db.run(`
                    ALTER TABLE fixed_expenses 
                    ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    
                    // Add payment_type column with default value 'Debit'
                    db.run(`
                      ALTER TABLE fixed_expenses 
                      ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'Debit'
                    `, (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      db.run('COMMIT', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }
                        resolve();
                      });
                    });
                  });
                });
              });
            });
            
            // Get count and data after migration
            const countAfter = await countFixedExpenses(db);
            const fixedExpensesAfter = await getAllFixedExpenses(db);
            
            // Verify count is preserved
            expect(countAfter).toBe(countBefore);
            expect(countAfter).toBe(fixedExpenses.length);
            
            // Verify all original data is preserved
            expect(fixedExpensesAfter.length).toBe(fixedExpensesBefore.length);
            
            for (let i = 0; i < fixedExpensesBefore.length; i++) {
              // Original fields must be preserved
              expect(fixedExpensesAfter[i].id).toBe(fixedExpensesBefore[i].id);
              expect(fixedExpensesAfter[i].year).toBe(fixedExpensesBefore[i].year);
              expect(fixedExpensesAfter[i].month).toBe(fixedExpensesBefore[i].month);
              expect(fixedExpensesAfter[i].name).toBe(fixedExpensesBefore[i].name);
              expect(fixedExpensesAfter[i].amount).toBe(fixedExpensesBefore[i].amount);
              
              // New fields should have default values
              expect(fixedExpensesAfter[i].category).toBe('Other');
              expect(fixedExpensesAfter[i].payment_type).toBe('Debit');
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
