/**
 * Schema Consistency Test
 * 
 * Validates that the "fresh install" schema (createTestDatabase) matches
 * the expected post-migration schema. This catches drift between:
 * - The table definitions in db.js createTestDatabase()
 * - The migrations in migrations.js
 * 
 * If a migration changes a table structure (e.g., removes a CHECK constraint),
 * the createTestDatabase schema must be updated to match.
 */
const { createTestDatabase, closeTestDatabase } = require('./db');

describe('Schema Consistency', () => {
  let db;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  /**
   * Helper: get the CREATE TABLE SQL from sqlite_master for a given table
   */
  function getTableSQL(tableName) {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        [tableName],
        (err, row) => {
          if (err) return reject(err);
          resolve(row ? row.sql : null);
        }
      );
    });
  }

  describe('expenses table', () => {
    test('should NOT have a CHECK constraint on the type column', async () => {
      const sql = await getTableSQL('expenses');
      expect(sql).toBeTruthy();
      // type column should be TEXT NOT NULL without CHECK(type IN (...))
      expect(sql).toContain('type TEXT NOT NULL');
      expect(sql).not.toMatch(/CHECK\s*\(\s*type\s+IN\s*\(/i);
    });

    test('should NOT have a CHECK constraint on the method column', async () => {
      const sql = await getTableSQL('expenses');
      // method column should be TEXT NOT NULL without CHECK(method IN (...))
      expect(sql).toContain('method TEXT NOT NULL');
      expect(sql).not.toMatch(/CHECK\s*\(\s*method\s+IN\s*\(/i);
    });

    test('should have expected columns', async () => {
      const sql = await getTableSQL('expenses');
      const expectedColumns = [
        'id INTEGER PRIMARY KEY',
        'date TEXT NOT NULL',
        'posted_date TEXT',
        'place TEXT',
        'notes TEXT',
        'amount REAL NOT NULL',
        'type TEXT NOT NULL',
        'week INTEGER NOT NULL',
        'method TEXT NOT NULL',
        'payment_method_id INTEGER',
        'insurance_eligible INTEGER',
        'claim_status TEXT',
        'original_cost REAL',
        'created_at TEXT'
      ];
      for (const col of expectedColumns) {
        expect(sql).toContain(col);
      }
    });
  });

  describe('budgets table', () => {
    test('should NOT have a CHECK constraint on the category column', async () => {
      const sql = await getTableSQL('budgets');
      expect(sql).toBeTruthy();
      // category column should be TEXT NOT NULL without CHECK(category IN (...))
      expect(sql).toContain('category TEXT NOT NULL');
      expect(sql).not.toMatch(/CHECK\s*\(\s*category\s+IN\s*\(/i);
    });

    test('should have expected columns and constraints', async () => {
      const sql = await getTableSQL('budgets');
      expect(sql).toContain('year INTEGER NOT NULL');
      expect(sql).toContain('month INTEGER NOT NULL');
      expect(sql).toContain('"limit" REAL NOT NULL');
      expect(sql).toContain('UNIQUE(year, month, category)');
    });
  });

  describe('payment_methods table', () => {
    test('should exist with expected structure', async () => {
      const sql = await getTableSQL('payment_methods');
      expect(sql).toBeTruthy();
      expect(sql).toContain('type TEXT NOT NULL');
      expect(sql).toContain('display_name TEXT NOT NULL');
      expect(sql).toContain('is_active INTEGER');
    });
  });

  describe('no stale category references', () => {
    test('no table should reference Vehicle Maintenance in CHECK constraints', async () => {
      const tables = await new Promise((resolve, reject) => {
        db.all(
          "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL",
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          }
        );
      });

      for (const table of tables) {
        expect(table.sql).not.toContain('Vehicle Maintenance');
      }
    });
  });
});
