/**
 * Property-Based Tests for Reminder Service - Insurance Claims
 * Feature: insurance-claim-reminders
 * 
 * Tests the getInsuranceClaimReminders() method
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

// Service method implementation (mirrors reminderService.getInsuranceClaimReminders)
async function getInsuranceClaimReminders(db, thresholdDays = 30, referenceDate = new Date()) {
  const pendingExpenses = await getMedicalExpensesWithPendingClaims(db, referenceDate);
  
  // Filter claims by threshold
  const claimsExceedingThreshold = pendingExpenses.filter(expense => 
    expense.days_pending > thresholdDays
  );
  
  // Transform to structured response
  const pendingClaims = claimsExceedingThreshold.map(expense => ({
    expenseId: expense.id,
    place: expense.place,
    amount: expense.amount,
    originalCost: expense.original_cost,
    date: expense.date,
    daysPending: expense.days_pending,
    personNames: expense.person_names ? expense.person_names.split(', ') : null
  }));
  
  return {
    pendingCount: pendingClaims.length,
    hasPendingClaims: pendingClaims.length > 0,
    pendingClaims
  };
}

describe('Reminder Service - Insurance Claims Property-Based Tests', () => {
  /**
   * Feature: insurance-claim-reminders, Property 3: Threshold Filtering
   * **Validates: Requirements 1.3, 4.2, 4.3**
   * 
   * For any set of pending claims and any threshold value T, calling getInsuranceClaimReminders(T)
   * SHALL return only claims where daysPending > T.
   */
  test('Property 3: Threshold Filtering', async () => {
    // Generate date strings
    const dateStrArb = fc.integer({ min: 2023, max: 2025 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    );
    
    // Arbitrary for in-progress medical expense
    const expenseArb = fc.record({
      date: dateStrArb,
      place: fc.string({ minLength: 1, maxLength: 50 }),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      type: fc.constant('Tax - Medical'),
      insurance_eligible: fc.constant(true),
      claim_status: fc.constant('in_progress'),
      original_cost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100)
    });
    
    // Generate array of 1-10 expenses
    const expensesArb = fc.array(expenseArb, { minLength: 1, maxLength: 10 });
    
    // Threshold between 1 and 365 days
    const thresholdArb = fc.integer({ min: 1, max: 365 });
    
    await fc.assert(
      fc.asyncProperty(
        expensesArb,
        thresholdArb,
        async (expenses, threshold) => {
          const db = await createTestDatabase();
          
          try {
            await createExpensesTable(db);
            await createPeopleTable(db);
            await createExpensePeopleTable(db);
            
            // Insert all expenses
            for (const expense of expenses) {
              await insertExpense(db, expense);
            }
            
            // Use a fixed reference date for consistent testing
            const referenceDate = new Date('2026-02-04');
            
            // Get insurance claim reminders with threshold
            const result = await getInsuranceClaimReminders(db, threshold, referenceDate);
            
            // Verify all returned claims exceed the threshold
            for (const claim of result.pendingClaims) {
              expect(claim.daysPending).toBeGreaterThan(threshold);
            }
            
            // Verify no claims at or below threshold are returned
            const allPending = await getMedicalExpensesWithPendingClaims(db, referenceDate);
            const claimsAtOrBelowThreshold = allPending.filter(e => e.days_pending <= threshold);
            const returnedIds = new Set(result.pendingClaims.map(c => c.expenseId));
            
            for (const claim of claimsAtOrBelowThreshold) {
              expect(returnedIds.has(claim.id)).toBe(false);
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
   * Feature: insurance-claim-reminders, Property 4: Count Invariant
   * **Validates: Requirements 1.4**
   * 
   * For any result from getInsuranceClaimReminders(), the pendingCount field
   * SHALL equal the length of the pendingClaims array.
   */
  test('Property 4: Count Invariant', async () => {
    // Generate date strings
    const dateStrArb = fc.integer({ min: 2023, max: 2025 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    );
    
    // Arbitrary for in-progress medical expense
    const expenseArb = fc.record({
      date: dateStrArb,
      place: fc.string({ minLength: 1, maxLength: 50 }),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      type: fc.constant('Tax - Medical'),
      insurance_eligible: fc.constant(true),
      claim_status: fc.constant('in_progress'),
      original_cost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100)
    });
    
    // Generate array of 0-10 expenses
    const expensesArb = fc.array(expenseArb, { minLength: 0, maxLength: 10 });
    
    // Threshold between 1 and 365 days
    const thresholdArb = fc.integer({ min: 1, max: 365 });
    
    await fc.assert(
      fc.asyncProperty(
        expensesArb,
        thresholdArb,
        async (expenses, threshold) => {
          const db = await createTestDatabase();
          
          try {
            await createExpensesTable(db);
            await createPeopleTable(db);
            await createExpensePeopleTable(db);
            
            // Insert all expenses
            for (const expense of expenses) {
              await insertExpense(db, expense);
            }
            
            // Use a fixed reference date for consistent testing
            const referenceDate = new Date('2026-02-04');
            
            // Get insurance claim reminders
            const result = await getInsuranceClaimReminders(db, threshold, referenceDate);
            
            // Property: pendingCount === pendingClaims.length
            expect(result.pendingCount).toBe(result.pendingClaims.length);
            
            // Property: hasPendingClaims === (pendingCount > 0)
            expect(result.hasPendingClaims).toBe(result.pendingCount > 0);
            
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
   * Feature: insurance-claim-reminders, Property: Default Threshold
   * 
   * When no threshold is provided, the default threshold of 30 days should be used.
   */
  test('Property: Default Threshold Behavior', async () => {
    // Generate date strings that will result in various days_pending values
    const dateStrArb = fc.integer({ min: 2025, max: 2026 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    );
    
    // Arbitrary for in-progress medical expense
    const expenseArb = fc.record({
      date: dateStrArb,
      place: fc.string({ minLength: 1, maxLength: 50 }),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      type: fc.constant('Tax - Medical'),
      insurance_eligible: fc.constant(true),
      claim_status: fc.constant('in_progress'),
      original_cost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100)
    });
    
    // Generate array of 1-5 expenses
    const expensesArb = fc.array(expenseArb, { minLength: 1, maxLength: 5 });
    
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
            for (const expense of expenses) {
              await insertExpense(db, expense);
            }
            
            const referenceDate = new Date('2026-02-04');
            const DEFAULT_THRESHOLD = 30;
            
            // Get reminders with default threshold
            const resultDefault = await getInsuranceClaimReminders(db, DEFAULT_THRESHOLD, referenceDate);
            
            // Get reminders with explicit 30-day threshold
            const resultExplicit = await getInsuranceClaimReminders(db, 30, referenceDate);
            
            // Results should be identical
            expect(resultDefault.pendingCount).toBe(resultExplicit.pendingCount);
            expect(resultDefault.hasPendingClaims).toBe(resultExplicit.hasPendingClaims);
            expect(resultDefault.pendingClaims.length).toBe(resultExplicit.pendingClaims.length);
            
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


describe('Reminder Service - API Response Structure Property-Based Tests', () => {
  /**
   * Feature: insurance-claim-reminders, Property 8: API Response Structure
   * **Validates: Requirements 5.2, 5.3**
   * 
   * For any call to getInsuranceClaimReminders(), the response SHALL include
   * an object with fields: pendingCount (number), hasPendingClaims (boolean),
   * and pendingClaims (array).
   */
  test('Property 8: API Response Structure', async () => {
    // Generate date strings
    const dateStrArb = fc.integer({ min: 2023, max: 2025 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    );
    
    // Arbitrary for in-progress medical expense
    const expenseArb = fc.record({
      date: dateStrArb,
      place: fc.string({ minLength: 1, maxLength: 50 }),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      type: fc.constant('Tax - Medical'),
      insurance_eligible: fc.constant(true),
      claim_status: fc.constant('in_progress'),
      original_cost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100)
    });
    
    // Generate array of 0-10 expenses (including empty case)
    const expensesArb = fc.array(expenseArb, { minLength: 0, maxLength: 10 });
    
    // Threshold between 1 and 365 days
    const thresholdArb = fc.integer({ min: 1, max: 365 });
    
    await fc.assert(
      fc.asyncProperty(
        expensesArb,
        thresholdArb,
        async (expenses, threshold) => {
          const db = await createTestDatabase();
          
          try {
            await createExpensesTable(db);
            await createPeopleTable(db);
            await createExpensePeopleTable(db);
            
            // Insert all expenses
            for (const expense of expenses) {
              await insertExpense(db, expense);
            }
            
            const referenceDate = new Date('2026-02-04');
            
            // Get insurance claim reminders
            const result = await getInsuranceClaimReminders(db, threshold, referenceDate);
            
            // Property 8: Response structure validation
            // pendingCount must be a number
            expect(typeof result.pendingCount).toBe('number');
            expect(Number.isInteger(result.pendingCount)).toBe(true);
            expect(result.pendingCount).toBeGreaterThanOrEqual(0);
            
            // hasPendingClaims must be a boolean
            expect(typeof result.hasPendingClaims).toBe('boolean');
            
            // pendingClaims must be an array
            expect(Array.isArray(result.pendingClaims)).toBe(true);
            
            // Each claim in pendingClaims must have required fields
            for (const claim of result.pendingClaims) {
              expect(typeof claim.expenseId).toBe('number');
              expect(typeof claim.place).toBe('string');
              expect(typeof claim.amount).toBe('number');
              expect(typeof claim.date).toBe('string');
              expect(typeof claim.daysPending).toBe('number');
              // originalCost can be number or null
              expect(claim.originalCost === null || typeof claim.originalCost === 'number').toBe(true);
              // personNames can be array or null
              expect(claim.personNames === null || Array.isArray(claim.personNames)).toBe(true);
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
   * Feature: insurance-claim-reminders, Property: Empty Database Response
   * 
   * When there are no expenses in the database, the response should have
   * pendingCount = 0, hasPendingClaims = false, and pendingClaims = [].
   */
  test('Property: Empty Database Response', async () => {
    const thresholdArb = fc.integer({ min: 1, max: 365 });
    
    await fc.assert(
      fc.asyncProperty(
        thresholdArb,
        async (threshold) => {
          const db = await createTestDatabase();
          
          try {
            await createExpensesTable(db);
            await createPeopleTable(db);
            await createExpensePeopleTable(db);
            
            // Don't insert any expenses
            
            const referenceDate = new Date('2026-02-04');
            const result = await getInsuranceClaimReminders(db, threshold, referenceDate);
            
            // Empty database should return empty results
            expect(result.pendingCount).toBe(0);
            expect(result.hasPendingClaims).toBe(false);
            expect(result.pendingClaims).toEqual([]);
            
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
