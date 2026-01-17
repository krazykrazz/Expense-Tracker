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
      date: fc.integer({ min: 2020, max: 2025 })
        .chain(year => fc.integer({ min: 1, max: 12 })
          .chain(month => fc.integer({ min: 1, max: 28 }) // Use 28 to avoid invalid dates
            .map(day => `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`))),
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


// Helper function to create expense_invoices table with old schema (with UNIQUE constraint)
function createOldExpenseInvoicesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE expense_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'application/pdf',
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
        UNIQUE(expense_id)
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

// Helper function to create expense_invoices table with new schema (without UNIQUE, with person_id)
function createNewExpenseInvoicesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE expense_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id INTEGER NOT NULL,
        person_id INTEGER,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'application/pdf',
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
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

// Helper function to create people table for FK reference
function createPeopleTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date_of_birth DATE,
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

// Helper function to insert invoice (old schema)
function insertOldInvoice(db, invoice) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expense_invoices (expense_id, filename, original_filename, file_path, file_size, mime_type, upload_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoice.expenseId, invoice.filename, invoice.originalFilename, invoice.filePath, invoice.fileSize, invoice.mimeType, invoice.uploadDate],
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

// Helper function to get all invoices
function getAllInvoices(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM expense_invoices ORDER BY id', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Helper function to count invoices
function countInvoices(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM expense_invoices', (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count);
      }
    });
  });
}

// Helper function to check if column exists in table
function hasColumn(db, tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) {
        reject(err);
      } else {
        resolve(columns.some(col => col.name === columnName));
      }
    });
  });
}

// Helper function to check if UNIQUE constraint exists on expense_id
function hasUniqueConstraintOnExpenseId(db) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='expense_invoices'",
      (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(false);
        } else {
          // Check if UNIQUE(expense_id) is in the table definition
          resolve(row.sql.includes('UNIQUE(expense_id)'));
        }
      }
    );
  });
}

describe('Multi-Invoice Support Migration - Property-Based Tests', () => {
  /**
   * Feature: multi-invoice-support, Property 7: Migration Data Preservation
   * Validates: Requirements 3.3
   * 
   * For any database with existing invoices, running the migration SHALL preserve 
   * all invoice records with identical data (except person_id which becomes NULL).
   */
  test('Property 7: Migration Data Preservation', async () => {
    // Arbitrary for generating valid invoice data
    const invoiceArbitrary = fc.record({
      expenseId: fc.integer({ min: 1, max: 1000 }),
      filename: fc.string({ minLength: 5, maxLength: 50 }).map(s => (s.replace(/[^a-zA-Z0-9]/g, '') || 'file') + '.pdf'),
      originalFilename: fc.string({ minLength: 5, maxLength: 100 }).map(s => (s.replace(/[^a-zA-Z0-9 ]/g, '') || 'Original File') + '.pdf'),
      filePath: fc.string({ minLength: 5, maxLength: 100 }).map(s => '/invoices/' + (s.replace(/[^a-zA-Z0-9]/g, '') || 'file') + '.pdf'),
      fileSize: fc.integer({ min: 1000, max: 10000000 }),
      mimeType: fc.constant('application/pdf'),
      uploadDate: fc.integer({ min: 2020, max: 2025 })
        .chain(year => fc.integer({ min: 1, max: 12 })
          .chain(month => fc.integer({ min: 1, max: 28 })
            .chain(day => fc.integer({ min: 0, max: 23 })
              .map(hour => `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:00:00.000Z`))))
    });

    // Generate array of 1-10 invoices with unique expense_ids (due to old UNIQUE constraint)
    const invoicesArrayArbitrary = fc.array(invoiceArbitrary, { minLength: 1, maxLength: 10 })
      .map(invoices => {
        // Ensure uniqueness by expense_id (old schema has UNIQUE constraint)
        const seen = new Set();
        return invoices.filter(inv => {
          if (seen.has(inv.expenseId)) return false;
          seen.add(inv.expenseId);
          return true;
        });
      })
      .filter(invoices => invoices.length > 0);

    await fc.assert(
      fc.asyncProperty(
        invoicesArrayArbitrary,
        async (invoices) => {
          const db = await createTestDatabase();
          
          try {
            // Create expenses table first (for FK reference)
            await createNewExpensesTable(db);
            
            // Create people table (for FK reference in new schema)
            await createPeopleTable(db);
            
            // Create old schema table (with UNIQUE constraint, without person_id)
            await createOldExpenseInvoicesTable(db);
            
            // Insert all invoices
            for (const invoice of invoices) {
              await insertOldInvoice(db, invoice);
            }
            
            // Get count and data before migration
            const countBefore = await countInvoices(db);
            const invoicesBefore = await getAllInvoices(db);
            
            // Verify old schema has UNIQUE constraint
            const hadUniqueConstraint = await hasUniqueConstraintOnExpenseId(db);
            expect(hadUniqueConstraint).toBe(true);
            
            // Verify old schema does NOT have person_id column
            const hadPersonIdBefore = await hasColumn(db, 'expense_invoices', 'person_id');
            expect(hadPersonIdBefore).toBe(false);
            
            // Simulate migration: recreate table with new schema
            await new Promise((resolve, reject) => {
              db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => {
                  if (err) return reject(err);
                  
                  // Create new table without UNIQUE constraint and with person_id
                  db.run(`
                    CREATE TABLE expense_invoices_new (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      expense_id INTEGER NOT NULL,
                      person_id INTEGER,
                      filename TEXT NOT NULL,
                      original_filename TEXT NOT NULL,
                      file_path TEXT NOT NULL,
                      file_size INTEGER NOT NULL,
                      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
                      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
                    )
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    
                    // Copy existing data with person_id as NULL
                    db.run(`
                      INSERT INTO expense_invoices_new 
                      (id, expense_id, person_id, filename, original_filename, file_path, file_size, mime_type, upload_date)
                      SELECT id, expense_id, NULL as person_id, filename, original_filename, file_path, file_size, mime_type, upload_date
                      FROM expense_invoices
                    `, (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      db.run('DROP TABLE expense_invoices', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }
                        
                        db.run('ALTER TABLE expense_invoices_new RENAME TO expense_invoices', (err) => {
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
            const countAfter = await countInvoices(db);
            const invoicesAfter = await getAllInvoices(db);
            
            // Verify new schema does NOT have UNIQUE constraint on expense_id
            const hasUniqueConstraintAfter = await hasUniqueConstraintOnExpenseId(db);
            expect(hasUniqueConstraintAfter).toBe(false);
            
            // Verify new schema HAS person_id column
            const hasPersonIdAfter = await hasColumn(db, 'expense_invoices', 'person_id');
            expect(hasPersonIdAfter).toBe(true);
            
            // Verify count is preserved
            expect(countAfter).toBe(countBefore);
            expect(countAfter).toBe(invoices.length);
            
            // Verify all data is preserved
            expect(invoicesAfter.length).toBe(invoicesBefore.length);
            
            for (let i = 0; i < invoicesBefore.length; i++) {
              // All original fields must be preserved exactly
              expect(invoicesAfter[i].id).toBe(invoicesBefore[i].id);
              expect(invoicesAfter[i].expense_id).toBe(invoicesBefore[i].expense_id);
              expect(invoicesAfter[i].filename).toBe(invoicesBefore[i].filename);
              expect(invoicesAfter[i].original_filename).toBe(invoicesBefore[i].original_filename);
              expect(invoicesAfter[i].file_path).toBe(invoicesBefore[i].file_path);
              expect(invoicesAfter[i].file_size).toBe(invoicesBefore[i].file_size);
              expect(invoicesAfter[i].mime_type).toBe(invoicesBefore[i].mime_type);
              expect(invoicesAfter[i].upload_date).toBe(invoicesBefore[i].upload_date);
              
              // person_id should be NULL for migrated records
              expect(invoicesAfter[i].person_id).toBeNull();
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

  /**
   * Additional test: Verify multiple invoices can be added to same expense after migration
   */
  test('Property 7 (extension): Multiple invoices per expense allowed after migration', async () => {
    const db = await createTestDatabase();
    
    try {
      // Create expenses table first (for FK reference)
      await createNewExpensesTable(db);
      
      // Create people table (for FK reference)
      await createPeopleTable(db);
      
      // Create new schema table directly (simulating post-migration state)
      await createNewExpenseInvoicesTable(db);
      
      // Insert multiple invoices for the same expense_id
      const expenseId = 1;
      const invoices = [
        { expenseId, filename: 'invoice1.pdf', originalFilename: 'Invoice 1.pdf', filePath: '/invoices/1.pdf', fileSize: 1000, mimeType: 'application/pdf', uploadDate: '2024-01-01T00:00:00.000Z' },
        { expenseId, filename: 'invoice2.pdf', originalFilename: 'Invoice 2.pdf', filePath: '/invoices/2.pdf', fileSize: 2000, mimeType: 'application/pdf', uploadDate: '2024-01-02T00:00:00.000Z' },
        { expenseId, filename: 'invoice3.pdf', originalFilename: 'Invoice 3.pdf', filePath: '/invoices/3.pdf', fileSize: 3000, mimeType: 'application/pdf', uploadDate: '2024-01-03T00:00:00.000Z' }
      ];
      
      // All inserts should succeed (no UNIQUE constraint violation)
      for (const invoice of invoices) {
        const id = await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO expense_invoices (expense_id, person_id, filename, original_filename, file_path, file_size, mime_type, upload_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [invoice.expenseId, null, invoice.filename, invoice.originalFilename, invoice.filePath, invoice.fileSize, invoice.mimeType, invoice.uploadDate],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
        expect(id).toBeGreaterThan(0);
      }
      
      // Verify all 3 invoices were inserted for the same expense
      const count = await countInvoices(db);
      expect(count).toBe(3);
      
      const allInvoices = await getAllInvoices(db);
      expect(allInvoices.every(inv => inv.expense_id === expenseId)).toBe(true);
      
    } finally {
      await closeDatabase(db);
    }
  });
});
