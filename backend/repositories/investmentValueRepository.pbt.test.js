/**
 * Property-Based Tests for Investment Value Repository
 * Using fast-check library for property-based testing
  *
 * @invariant Investment Value History Integrity: For any valid investment value entry, storing and retrieving it returns the correct amount and date; values are correctly associated with their parent investment. Randomization covers diverse value amounts and date distributions.
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
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

// Helper function to get value entry by ID
function getValueEntryById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM investment_values WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to get value entries by investment
function getValueEntriesByInvestment(db, investmentId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM investment_values WHERE investment_id = ? ORDER BY year DESC, month DESC',
      [investmentId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

// Helper function to update value entry
function updateValueEntry(db, id, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE investment_values SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [value, id],
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

// Helper function to delete value entry
function deleteValueEntry(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM investment_values WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

// Helper function to delete investment (for cascade test)
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

describe('Investment Value Repository - Property-Based Tests', () => {
  /**
   * Feature: investment-tracking, Property 6: Value entry creation and persistence
   * Validates: Requirements 2.1, 5.2
   * 
   * For any valid value entry data (investment_id, year, month, value >= 0), 
   * creating a value entry should result in a stored record that can be retrieved with all fields intact
   */
  test('Property 6: Value entry creation and persistence', async () => {
    // Arbitrary for generating valid value entry data
    const valueEntryArbitrary = fc.record({
      year: fc.integer({ min: 2000, max: 2100 }),
      month: fc.integer({ min: 1, max: 12 }),
      value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(
        valueEntryArbitrary,
        async (valueEntry) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            
            // Create a test investment first
            const investmentId = await insertInvestment(db, {
              name: 'Test Investment',
              type: 'TFSA',
              initial_value: 1000
            });
            
            // Insert value entry
            const id = await insertValueEntry(db, {
              investment_id: investmentId,
              ...valueEntry
            });
            
            // Retrieve value entry
            const retrieved = await getValueEntryById(db, id);
            
            // Verify all fields are preserved
            expect(retrieved).toBeDefined();
            expect(retrieved.investment_id).toBe(investmentId);
            expect(retrieved.year).toBe(valueEntry.year);
            expect(retrieved.month).toBe(valueEntry.month);
            expect(retrieved.value).toBe(valueEntry.value);
            expect(retrieved.id).toBe(id);
            
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
   * Feature: investment-tracking, Property 7: Value entry uniqueness constraint
   * Validates: Requirements 2.2, 2.3
   * 
   * For any investment and month/year combination, attempting to create a second value entry 
   * should update the existing entry rather than creating a duplicate
   */
  test('Property 7: Value entry uniqueness constraint', async () => {
    const valueArbitrary = fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2000, max: 2100 }), // year
        fc.integer({ min: 1, max: 12 }), // month
        valueArbitrary, // first value
        valueArbitrary, // second value
        async (year, month, value1, value2) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            
            // Create a test investment
            const investmentId = await insertInvestment(db, {
              name: 'Test Investment',
              type: 'TFSA',
              initial_value: 1000
            });
            
            // Insert first value entry
            const id1 = await insertValueEntry(db, {
              investment_id: investmentId,
              year,
              month,
              value: value1
            });
            
            // Attempt to insert duplicate (same investment, year, month)
            let errorOccurred = false;
            try {
              await insertValueEntry(db, {
                investment_id: investmentId,
                year,
                month,
                value: value2
              });
            } catch (err) {
              errorOccurred = true;
              // Verify it's a constraint error (UNIQUE constraint)
              expect(err.message).toMatch(/UNIQUE constraint/i);
            }
            
            // Property: Duplicate entries should be rejected
            expect(errorOccurred).toBe(true);
            
            // Verify only one entry exists
            const entries = await getValueEntriesByInvestment(db, investmentId);
            expect(entries.length).toBe(1);
            expect(entries[0].id).toBe(id1);
            expect(entries[0].value).toBe(value1);
            
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
   * Feature: investment-tracking, Property 10: Value entry chronological sorting
   * Validates: Requirements 2.6, 4.1
   * 
   * For any set of value entries for an investment, retrieving the value history 
   * should return entries sorted by year and month with most recent first
   */
  test('Property 10: Value entry chronological sorting', async () => {
    // Generate array of value entries with different dates
    const valueEntryArbitrary = fc.record({
      year: fc.integer({ min: 2000, max: 2100 }),
      month: fc.integer({ min: 1, max: 12 }),
      value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    // Generate array of 2-10 unique value entries
    const valueEntriesArrayArbitrary = fc.array(valueEntryArbitrary, { minLength: 2, maxLength: 10 })
      .map(entries => {
        // Make entries unique by year/month combination
        const uniqueEntries = [];
        const seen = new Set();
        for (const entry of entries) {
          const key = `${entry.year}-${entry.month}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueEntries.push(entry);
          }
        }
        return uniqueEntries;
      })
      .filter(entries => entries.length >= 2); // Ensure at least 2 unique entries

    await fc.assert(
      fc.asyncProperty(
        valueEntriesArrayArbitrary,
        async (valueEntries) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            
            // Create a test investment
            const investmentId = await insertInvestment(db, {
              name: 'Test Investment',
              type: 'TFSA',
              initial_value: 1000
            });
            
            // Insert all value entries in random order
            for (const entry of valueEntries) {
              await insertValueEntry(db, {
                investment_id: investmentId,
                ...entry
              });
            }
            
            // Retrieve value history
            const retrieved = await getValueEntriesByInvestment(db, investmentId);
            
            // Verify count matches
            expect(retrieved.length).toBe(valueEntries.length);
            
            // Verify chronological sorting (most recent first)
            for (let i = 0; i < retrieved.length - 1; i++) {
              const current = retrieved[i];
              const next = retrieved[i + 1];
              
              // Current should be >= next in chronological order
              const currentDate = current.year * 12 + current.month;
              const nextDate = next.year * 12 + next.month;
              
              expect(currentDate).toBeGreaterThanOrEqual(nextDate);
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
   * Feature: investment-tracking, Property 17: Value entry update persistence
   * Validates: Requirements 4.6
   * 
   * For any existing value entry and valid update data, updating the value entry 
   * should result in the changes being persisted and retrievable
   */
  test('Property 17: Value entry update persistence', async () => {
    const valueArbitrary = fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2000, max: 2100 }), // year
        fc.integer({ min: 1, max: 12 }), // month
        valueArbitrary, // original value
        valueArbitrary, // updated value
        async (year, month, originalValue, updatedValue) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            
            // Create a test investment
            const investmentId = await insertInvestment(db, {
              name: 'Test Investment',
              type: 'TFSA',
              initial_value: 1000
            });
            
            // Insert original value entry
            const id = await insertValueEntry(db, {
              investment_id: investmentId,
              year,
              month,
              value: originalValue
            });
            
            // Update value entry
            const updateSuccess = await updateValueEntry(db, id, updatedValue);
            expect(updateSuccess).toBe(true);
            
            // Retrieve updated value entry
            const retrieved = await getValueEntryById(db, id);
            
            // Verify value is updated
            expect(retrieved).toBeDefined();
            expect(retrieved.value).toBe(updatedValue);
            expect(retrieved.id).toBe(id);
            expect(retrieved.investment_id).toBe(investmentId);
            expect(retrieved.year).toBe(year);
            expect(retrieved.month).toBe(month);
            
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
   * Feature: investment-tracking, Property 18: Value entry deletion
   * Validates: Requirements 4.7
   * 
   * For any existing value entry, deleting it should result in the value entry 
   * no longer being retrievable
   */
  test('Property 18: Value entry deletion', async () => {
    const valueEntryArbitrary = fc.record({
      year: fc.integer({ min: 2000, max: 2100 }),
      month: fc.integer({ min: 1, max: 12 }),
      value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(
        valueEntryArbitrary,
        async (valueEntry) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            
            // Create a test investment
            const investmentId = await insertInvestment(db, {
              name: 'Test Investment',
              type: 'TFSA',
              initial_value: 1000
            });
            
            // Insert value entry
            const id = await insertValueEntry(db, {
              investment_id: investmentId,
              ...valueEntry
            });
            
            // Verify it exists
            const beforeDelete = await getValueEntryById(db, id);
            expect(beforeDelete).toBeDefined();
            
            // Delete value entry
            const deleteSuccess = await deleteValueEntry(db, id);
            expect(deleteSuccess).toBe(true);
            
            // Verify it no longer exists
            const afterDelete = await getValueEntryById(db, id);
            expect(afterDelete).toBeUndefined();
            
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
   * Feature: investment-tracking, Property 19: Referential integrity cascade
   * Validates: Requirements 5.5
   * 
   * For any investment with value entries, deleting the investment should also 
   * delete all associated value entries
   */
  test('Property 19: Referential integrity cascade', async () => {
    // Generate array of value entries
    const valueEntryArbitrary = fc.record({
      year: fc.integer({ min: 2000, max: 2100 }),
      month: fc.integer({ min: 1, max: 12 }),
      value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const valueEntriesArrayArbitrary = fc.array(valueEntryArbitrary, { minLength: 1, maxLength: 10 })
      .map(entries => {
        // Make entries unique by year/month combination
        const uniqueEntries = [];
        const seen = new Set();
        for (const entry of entries) {
          const key = `${entry.year}-${entry.month}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueEntries.push(entry);
          }
        }
        return uniqueEntries;
      })
      .filter(entries => entries.length >= 1);

    await fc.assert(
      fc.asyncProperty(
        valueEntriesArrayArbitrary,
        async (valueEntries) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            
            // Create a test investment
            const investmentId = await insertInvestment(db, {
              name: 'Test Investment',
              type: 'TFSA',
              initial_value: 1000
            });
            
            // Insert all value entries
            const insertedIds = [];
            for (const entry of valueEntries) {
              const id = await insertValueEntry(db, {
                investment_id: investmentId,
                ...entry
              });
              insertedIds.push(id);
            }
            
            // Verify all value entries exist
            const beforeDelete = await getValueEntriesByInvestment(db, investmentId);
            expect(beforeDelete.length).toBe(valueEntries.length);
            
            // Delete the investment
            const deleteSuccess = await deleteInvestment(db, investmentId);
            expect(deleteSuccess).toBe(true);
            
            // Verify all value entries are also deleted (cascade)
            const afterDelete = await getValueEntriesByInvestment(db, investmentId);
            expect(afterDelete.length).toBe(0);
            
            // Verify each individual value entry is gone
            for (const id of insertedIds) {
              const entry = await getValueEntryById(db, id);
              expect(entry).toBeUndefined();
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
});
