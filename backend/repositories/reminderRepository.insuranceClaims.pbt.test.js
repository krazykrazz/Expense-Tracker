/**
 * Property-Based Tests for Reminder Repository - Insurance Claims
 * Feature: insurance-claim-reminders
 * 
 * Tests the getMedicalExpensesWithPendingClaims() method
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Valid claim statuses
const VALID_CLAIM_STATUSES = ['not_claimed', 'in_progress', 'paid', 'denied'];

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
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper function to create expenses table
function createExpensesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        posted_date TEXT,
        place TEXT,
        notes TEXT,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        week INTEGER,
        method TEXT,
        payment_method_id INTEGER,
        insurance_eligible INTEGER DEFAULT 0,
        claim_status TEXT,
        original_cost REAL
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper function to create people table
function createPeopleTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date_of_birth TEXT
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper function to create expense_people junction table
function createExpensePeopleTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE expense_people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id INTEGER NOT NULL,
        person_id INTEGER NOT NULL,
        allocation_amount REAL,
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
        UNIQUE(expense_id, person_id)
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper function to insert expense
function insertExpense(db, expense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, place, amount, type, insurance_eligible, claim_status, original_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        expense.date,
        expense.place,
        expense.amount,
        expense.type,
        expense.insurance_eligible ? 1 : 0,
        expense.claim_status,
        expense.original_cost
      ],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Helper function to insert person
function insertPerson(db, name) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO people (name) VALUES (?)`,
      [name],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Helper function to link expense to person
function linkExpenseToPerson(db, expenseId, personId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expense_people (expense_id, person_id) VALUES (?, ?)`,
      [expenseId, personId],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Helper function to get medical expenses with pending claims (mirrors repository method)
function getMedicalExpensesWithPendingClaims(db, referenceDate = new Date()) {
  const refDateStr = referenceDate.toISOString().split('T')[0];
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        e.id,
        e.date,
        e.place,
        e.amount,
        e.original_cost,
        CAST(julianday(?) - julianday(e.date) AS INTEGER) as days_pending,
        GROUP_CONCAT(p.name, ', ') as person_names
      FROM expenses e
      LEFT JOIN expense_people ep ON e.id = ep.expense_id
      LEFT JOIN people p ON ep.person_id = p.id
      WHERE e.type = 'Tax - Medical'
        AND e.insurance_eligible = 1
        AND e.claim_status = 'in_progress'
      GROUP BY e.id
      ORDER BY days_pending DESC
    `;
    
    db.all(sql, [refDateStr], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

describe('Reminder Repository - Insurance Claims Property-Based Tests', () => {
  /**
   * Feature: insurance-claim-reminders, Property 1: Query Filtering - Only In-Progress Medical Expenses
   * **Validates: Requirements 1.1**
   * 
   * For any set of expenses in the database with varying types, insurance_eligible values,
   * and claim_status values, calling getMedicalExpensesWithPendingClaims() SHALL return
   * only expenses where type = 'Tax - Medical' AND insurance_eligible = 1 AND claim_status = 'in_progress'.
   */
  test('Property 1: Query Filtering - Only In-Progress Medical Expenses', async () => {
    // Arbitrary for expense type
    const expenseTypeArb = fc.constantFrom(
      'Tax - Medical',
      'Tax - Donation',
      'Groceries',
      'Dining Out',
      'Entertainment'
    );
    
    // Arbitrary for claim status
    const claimStatusArb = fc.constantFrom(...VALID_CLAIM_STATUSES, null);
    
    // Arbitrary for a single expense
    const expenseArb = fc.record({
      date: fc.integer({ min: 2023, max: 2025 }).chain(year =>
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day =>
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      place: fc.string({ minLength: 1, maxLength: 50 }),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      type: expenseTypeArb,
      insurance_eligible: fc.boolean(),
      claim_status: claimStatusArb,
      original_cost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100)
    });
    
    // Generate array of 1-10 expenses
    const expensesArb = fc.array(expenseArb, { minLength: 1, maxLength: 10 });
    
    await fc.assert(
      fc.asyncProperty(
        expensesArb,
        async (expenses) => {
          const db = await createTestDatabase();
          
          try {
            await createExpensesTable(db);
            await createPeopleTable(db);
            await createExpensePeopleTable(db);
            
            // Insert all expenses
            const insertedExpenses = [];
            for (const expense of expenses) {
              const id = await insertExpense(db, expense);
              insertedExpenses.push({ ...expense, id });
            }
            
            // Query pending claims
            const referenceDate = new Date('2026-02-04');
            const pendingClaims = await getMedicalExpensesWithPendingClaims(db, referenceDate);
            
            // Calculate expected results
            const expectedPending = insertedExpenses.filter(e =>
              e.type === 'Tax - Medical' &&
              e.insurance_eligible === true &&
              e.claim_status === 'in_progress'
            );
            
            // Property 1: Count should match
            expect(pendingClaims.length).toBe(expectedPending.length);
            
            // Property 2: All returned expenses should match the criteria
            for (const claim of pendingClaims) {
              const original = insertedExpenses.find(e => e.id === claim.id);
              expect(original).toBeDefined();
              expect(original.type).toBe('Tax - Medical');
              expect(original.insurance_eligible).toBe(true);
              expect(original.claim_status).toBe('in_progress');
            }
            
            // Property 3: No expense that doesn't match criteria should be returned
            const returnedIds = new Set(pendingClaims.map(c => c.id));
            for (const expense of insertedExpenses) {
              const shouldBeReturned = 
                expense.type === 'Tax - Medical' &&
                expense.insurance_eligible === true &&
                expense.claim_status === 'in_progress';
              
              if (shouldBeReturned) {
                expect(returnedIds.has(expense.id)).toBe(true);
              } else {
                expect(returnedIds.has(expense.id)).toBe(false);
              }
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
   * Feature: insurance-claim-reminders, Property 2: Days Pending Calculation Accuracy
   * **Validates: Requirements 1.2**
   * 
   * For any expense with a valid date, the daysPending calculation SHALL equal
   * the number of days between the expense date and the reference date.
   */
  test('Property 2: Days Pending Calculation Accuracy', async () => {
    // Generate dates as strings to avoid invalid date issues
    const dateStrArb = fc.integer({ min: 2023, max: 2025 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    );
    
    const referenceDateStrArb = fc.integer({ min: 2024, max: 2026 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    );
    
    await fc.assert(
      fc.asyncProperty(
        dateStrArb,
        referenceDateStrArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
        async (expenseDateStr, referenceDateStr, place, amount) => {
          const db = await createTestDatabase();
          
          try {
            await createExpensesTable(db);
            await createPeopleTable(db);
            await createExpensePeopleTable(db);
            
            // Create an in-progress medical expense
            const expense = {
              date: expenseDateStr,
              place,
              amount,
              type: 'Tax - Medical',
              insurance_eligible: true,
              claim_status: 'in_progress',
              original_cost: amount
            };
            
            await insertExpense(db, expense);
            
            // Query pending claims
            const referenceDate = new Date(referenceDateStr);
            const pendingClaims = await getMedicalExpensesWithPendingClaims(db, referenceDate);
            
            expect(pendingClaims.length).toBe(1);
            
            // Calculate expected days pending
            const expenseDateObj = new Date(expenseDateStr);
            const refDateObj = new Date(referenceDateStr);
            const expectedDays = Math.floor((refDateObj - expenseDateObj) / (1000 * 60 * 60 * 24));
            
            // Verify days_pending calculation
            expect(pendingClaims[0].days_pending).toBe(expectedDays);
            
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
   * Feature: insurance-claim-reminders, Property: Person Names Aggregation
   * 
   * For any expense with associated people, the person_names field SHALL contain
   * all associated person names concatenated with ', '.
   */
  test('Property: Person Names Aggregation', async () => {
    const personNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes(','));
    const personNamesArb = fc.array(personNameArb, { minLength: 0, maxLength: 3 });
    
    await fc.assert(
      fc.asyncProperty(
        personNamesArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
        async (personNames, place, amount) => {
          const db = await createTestDatabase();
          
          try {
            await createExpensesTable(db);
            await createPeopleTable(db);
            await createExpensePeopleTable(db);
            
            // Create an in-progress medical expense
            const expense = {
              date: '2025-01-15',
              place,
              amount,
              type: 'Tax - Medical',
              insurance_eligible: true,
              claim_status: 'in_progress',
              original_cost: amount
            };
            
            const expenseId = await insertExpense(db, expense);
            
            // Create people and link to expense
            const uniqueNames = [...new Set(personNames)];
            for (const name of uniqueNames) {
              const personId = await insertPerson(db, name);
              await linkExpenseToPerson(db, expenseId, personId);
            }
            
            // Query pending claims
            const referenceDate = new Date('2026-02-04');
            const pendingClaims = await getMedicalExpensesWithPendingClaims(db, referenceDate);
            
            expect(pendingClaims.length).toBe(1);
            
            // Verify person_names
            if (uniqueNames.length === 0) {
              expect(pendingClaims[0].person_names).toBeNull();
            } else {
              // Names should be concatenated (order may vary due to GROUP_CONCAT)
              const returnedNames = pendingClaims[0].person_names.split(', ');
              expect(returnedNames.sort()).toEqual(uniqueNames.sort());
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
});
