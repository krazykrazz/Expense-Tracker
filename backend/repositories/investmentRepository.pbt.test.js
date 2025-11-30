/**
 * Property-Based Tests for Investment Repository
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
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

// Helper function to get investment by ID
function getInvestmentById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM investments WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to update investment
function updateInvestment(db, id, investment) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE investments SET name = ?, type = ?, initial_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [investment.name, investment.type, investment.initial_value, id],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}

// Helper function to delete investment
function deleteInvestment(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM investments WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

// Helper function to get all investments
function getAllInvestments(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM investments ORDER BY name ASC', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

describe('Investment Repository - Property-Based Tests', () => {
  /**
   * Feature: investment-tracking, Property 1: Investment creation and persistence
   * Validates: Requirements 1.1, 5.1
   * 
   * For any valid investment data (name, type in ['TFSA', 'RRSP'], initial_value >= 0), 
   * creating an investment should result in a stored record that can be retrieved with all fields intact
   */
  test('Property 1: Investment creation and persistence', async () => {
    // Arbitrary for generating valid investment data
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(
        investmentArbitrary,
        async (investment) => {
          const db = await createTestDatabase();
          
          try {
            // Create table
            await createInvestmentsTable(db);
            
            // Insert investment
            const id = await insertInvestment(db, investment);
            
            // Retrieve investment
            const retrieved = await getInvestmentById(db, id);
            
            // Verify all fields are preserved
            expect(retrieved).toBeDefined();
            expect(retrieved.name).toBe(investment.name);
            expect(retrieved.type).toBe(investment.type);
            expect(retrieved.initial_value).toBe(investment.initial_value);
            expect(retrieved.id).toBe(id);
            
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
   * Feature: investment-tracking, Property 2: Investment type validation
   * Validates: Requirements 1.2
   * 
   * For any investment type string, the system should accept only 'TFSA' and 'RRSP' 
   * and reject all other values
   */
  test('Property 2: Investment type validation', async () => {
    // Generate strings that are NOT 'TFSA' or 'RRSP'
    const invalidTypeArbitrary = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s !== 'TFSA' && s !== 'RRSP');

    await fc.assert(
      fc.asyncProperty(
        invalidTypeArbitrary,
        fc.string({ minLength: 1, maxLength: 100 }), // name
        fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100), // initial_value
        async (invalidType, name, initialValue) => {
          const db = await createTestDatabase();
          
          try {
            // Create table
            await createInvestmentsTable(db);
            
            // Attempt to insert investment with invalid type
            let errorOccurred = false;
            try {
              await insertInvestment(db, {
                name: name,
                type: invalidType,
                initial_value: initialValue
              });
            } catch (err) {
              errorOccurred = true;
              // Verify it's a constraint error
              expect(err.message).toMatch(/constraint/i);
            }
            
            // Property: Invalid types should be rejected
            expect(errorOccurred).toBe(true);
            
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
   * Feature: investment-tracking, Property 3: Investment update persistence
   * Validates: Requirements 1.3
   * 
   * For any existing investment and valid update data, updating the investment 
   * should result in the changes being persisted and retrievable
   */
  test('Property 3: Investment update persistence', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(
        investmentArbitrary, // Original investment
        investmentArbitrary, // Updated investment
        async (original, updated) => {
          const db = await createTestDatabase();
          
          try {
            // Create table
            await createInvestmentsTable(db);
            
            // Insert original investment
            const id = await insertInvestment(db, original);
            
            // Update investment
            const updateSuccess = await updateInvestment(db, id, updated);
            expect(updateSuccess).toBe(true);
            
            // Retrieve updated investment
            const retrieved = await getInvestmentById(db, id);
            
            // Verify all fields are updated
            expect(retrieved).toBeDefined();
            expect(retrieved.name).toBe(updated.name);
            expect(retrieved.type).toBe(updated.type);
            expect(retrieved.initial_value).toBe(updated.initial_value);
            expect(retrieved.id).toBe(id);
            
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
   * Feature: investment-tracking, Property 4: Investment deletion
   * Validates: Requirements 1.4
   * 
   * For any existing investment, deleting it should result in the investment 
   * no longer being retrievable
   */
  test('Property 4: Investment deletion', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(
        investmentArbitrary,
        async (investment) => {
          const db = await createTestDatabase();
          
          try {
            // Create table
            await createInvestmentsTable(db);
            
            // Insert investment
            const id = await insertInvestment(db, investment);
            
            // Verify it exists
            const beforeDelete = await getInvestmentById(db, id);
            expect(beforeDelete).toBeDefined();
            
            // Delete investment
            const deleteSuccess = await deleteInvestment(db, id);
            expect(deleteSuccess).toBe(true);
            
            // Verify it no longer exists
            const afterDelete = await getInvestmentById(db, id);
            expect(afterDelete).toBeUndefined();
            
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
   * Feature: investment-tracking, Property 5: Investment list retrieval
   * Validates: Requirements 1.5
   * 
   * For any set of created investments, querying all investments should return 
   * all created investments with their current values
   */
  test('Property 5: Investment list retrieval', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    // Generate array of 1-10 investments
    const investmentsArrayArbitrary = fc.array(investmentArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(
        investmentsArrayArbitrary,
        async (investments) => {
          const db = await createTestDatabase();
          
          try {
            // Create table
            await createInvestmentsTable(db);
            
            // Insert all investments
            const insertedIds = [];
            for (const investment of investments) {
              const id = await insertInvestment(db, investment);
              insertedIds.push(id);
            }
            
            // Retrieve all investments
            const retrieved = await getAllInvestments(db);
            
            // Verify count matches
            expect(retrieved.length).toBe(investments.length);
            
            // Verify all investments are present
            for (let i = 0; i < investments.length; i++) {
              const found = retrieved.find(r => r.id === insertedIds[i]);
              expect(found).toBeDefined();
              expect(found.name).toBe(investments[i].name);
              expect(found.type).toBe(investments[i].type);
              expect(found.initial_value).toBe(investments[i].initial_value);
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
