const settingsRepository = require('./settingsRepository');
const { getDatabase } = require('../database/db');

describe('settingsRepository', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM settings', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('getSetting', () => {
    test('returns correct value for existing key', async () => {
      // Insert a test setting
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO settings (key, value) VALUES (?, ?)',
          ['test_key', 'test_value'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const value = await settingsRepository.getSetting('test_key');
      expect(value).toBe('test_value');
    });

    test('returns null for non-existent key', async () => {
      const value = await settingsRepository.getSetting('non_existent_key');
      expect(value).toBeNull();
    });
  });

  describe('setSetting', () => {
    test('creates new setting', async () => {
      await settingsRepository.setSetting('new_key', 'new_value');

      // Verify the setting was created
      const value = await new Promise((resolve, reject) => {
        db.get(
          'SELECT value FROM settings WHERE key = ?',
          ['new_key'],
          (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.value : null);
          }
        );
      });

      expect(value).toBe('new_value');
    });

    test('updates existing setting with new timestamp', async () => {
      // Insert initial setting
      await settingsRepository.setSetting('update_key', 'initial_value');

      // Get initial timestamp
      const initialTimestamp = await new Promise((resolve, reject) => {
        db.get(
          'SELECT updated_at FROM settings WHERE key = ?',
          ['update_key'],
          (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.updated_at : null);
          }
        );
      });

      // Wait a bit to ensure timestamp changes (SQLite CURRENT_TIMESTAMP has second precision)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Update the setting
      await settingsRepository.setSetting('update_key', 'updated_value');

      // Verify value and timestamp were updated
      const result = await new Promise((resolve, reject) => {
        db.get(
          'SELECT value, updated_at FROM settings WHERE key = ?',
          ['update_key'],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      expect(result.value).toBe('updated_value');
      expect(result.updated_at).not.toBe(initialTimestamp);
    });
  });

  describe('getMultiple', () => {
    beforeEach(async () => {
      // Insert multiple test settings
      await settingsRepository.setSetting('key1', 'value1');
      await settingsRepository.setSetting('key2', 'value2');
      await settingsRepository.setSetting('key3', 'value3');
    });

    test('returns all requested keys', async () => {
      const result = await settingsRepository.getMultiple(['key1', 'key2', 'key3']);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3'
      });
    });

    test('returns only existing keys', async () => {
      const result = await settingsRepository.getMultiple(['key1', 'non_existent', 'key2']);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2'
      });
    });

    test('returns empty object for empty keys array', async () => {
      const result = await settingsRepository.getMultiple([]);
      expect(result).toEqual({});
    });

    test('returns empty object for null keys', async () => {
      const result = await settingsRepository.getMultiple(null);
      expect(result).toEqual({});
    });
  });

  describe('database errors', () => {
    test('getSetting handles database errors gracefully', async () => {
      // Mock a database error by using an invalid key type
      // This test verifies error handling exists
      await expect(async () => {
        // Force an error by closing the database connection temporarily
        const originalGet = db.get;
        db.get = (sql, params, callback) => {
          callback(new Error('Database error'));
        };
        
        try {
          await settingsRepository.getSetting('test_key');
        } finally {
          db.get = originalGet;
        }
      }).rejects.toThrow();
    });

    test('setSetting handles database errors gracefully', async () => {
      await expect(async () => {
        const originalRun = db.run;
        db.run = (sql, params, callback) => {
          callback(new Error('Database error'));
        };
        
        try {
          await settingsRepository.setSetting('test_key', 'test_value');
        } finally {
          db.run = originalRun;
        }
      }).rejects.toThrow();
    });

    test('getMultiple handles database errors gracefully', async () => {
      await expect(async () => {
        const originalAll = db.all;
        db.all = (sql, params, callback) => {
          callback(new Error('Database error'));
        };
        
        try {
          await settingsRepository.getMultiple(['key1', 'key2']);
        } finally {
          db.all = originalAll;
        }
      }).rejects.toThrow();
    });
  });
});
