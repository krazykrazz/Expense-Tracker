const { getTestDatabase, resetTestDatabase } = require('./db');
const { migrateAddSettingsTable } = require('./migrations');

describe('Settings Table Migration', () => {
  let db;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('should create settings table with correct schema', async () => {
    // Run the migration
    await migrateAddSettingsTable(db);

    // Verify table exists
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(settings)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(tableInfo).toBeDefined();
    expect(tableInfo.length).toBeGreaterThan(0);

    // Verify required columns exist
    const columnNames = tableInfo.map(col => col.name);
    expect(columnNames).toContain('key');
    expect(columnNames).toContain('value');
    expect(columnNames).toContain('updated_at');

    // Verify key is PRIMARY KEY
    const keyColumn = tableInfo.find(col => col.name === 'key');
    expect(keyColumn.pk).toBe(1);

    // Verify value is NOT NULL
    const valueColumn = tableInfo.find(col => col.name === 'value');
    expect(valueColumn.notnull).toBe(1);
  });

  it('should allow inserting settings', async () => {
    // Run the migration
    await migrateAddSettingsTable(db);

    // Insert a test setting
    const insertResult = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)`,
        ['activity_log_max_age_days', '90'],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });

    expect(insertResult).toBe(1);

    // Verify the setting was inserted
    const setting = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM settings WHERE key = ?', ['activity_log_max_age_days'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(setting).toBeDefined();
    expect(setting.key).toBe('activity_log_max_age_days');
    expect(setting.value).toBe('90');
    expect(setting.updated_at).toBeDefined();
  });

  it('should enforce PRIMARY KEY constraint on key column', async () => {
    // Run the migration
    await migrateAddSettingsTable(db);

    // Insert a setting
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)`,
        ['test_key', 'value1'],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Try to insert duplicate key (should fail)
    await expect(
      new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO settings (key, value) VALUES (?, ?)`,
          ['test_key', 'value2'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      })
    ).rejects.toThrow();
  });

  it('should allow updating existing settings', async () => {
    // Run the migration
    await migrateAddSettingsTable(db);

    // Insert a setting
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)`,
        ['activity_log_max_count', '1000'],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Update the setting
    const updateResult = await new Promise((resolve, reject) => {
      db.run(
        `UPDATE settings SET value = ? WHERE key = ?`,
        ['500', 'activity_log_max_count'],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });

    expect(updateResult).toBe(1);

    // Verify the setting was updated
    const setting = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM settings WHERE key = ?', ['activity_log_max_count'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(setting.value).toBe('500');
  });

  it('should allow inserting multiple settings', async () => {
    // Run the migration
    await migrateAddSettingsTable(db);

    // Insert multiple settings
    const settings = [
      ['activity_log_max_age_days', '90'],
      ['activity_log_max_count', '1000'],
      ['some_other_setting', 'test_value']
    ];

    for (const [key, value] of settings) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO settings (key, value) VALUES (?, ?)`,
          [key, value],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Verify all settings were inserted
    const count = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM settings', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    expect(count).toBe(3);
  });

  it('should not run migration twice', async () => {
    // Run the migration first time
    await migrateAddSettingsTable(db);

    // Run the migration second time (should skip)
    await expect(migrateAddSettingsTable(db)).resolves.not.toThrow();

    // Verify table still exists and works
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(settings)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(tableInfo.length).toBeGreaterThan(0);
  });
});
