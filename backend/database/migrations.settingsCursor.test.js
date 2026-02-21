const { getTestDatabase, resetTestDatabase } = require('./db');
const { migrateAddSettingsTable, migrateRemoveBillingLastProcessedDate, checkMigrationApplied } = require('./migrations');

describe('Migration: Remove billing_last_processed_date', () => {
  let db;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    // Ensure settings table exists
    await migrateAddSettingsTable(db);
  });

  it('should remove billing_last_processed_date from settings table', async () => {
    // Insert the setting
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)`,
        ['billing_last_processed_date', '2026-02-15'],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Verify it exists
    const before = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM settings WHERE key = 'billing_last_processed_date'`, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    expect(before).toBeDefined();
    expect(before.value).toBe('2026-02-15');

    // Run migration
    await migrateRemoveBillingLastProcessedDate(db);

    // Verify it's gone
    const after = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM settings WHERE key = 'billing_last_processed_date'`, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    expect(after).toBeUndefined();
  });

  it('should handle case where setting does not exist (no error)', async () => {
    // Don't insert the setting — it doesn't exist
    // Migration should complete without error
    await expect(migrateRemoveBillingLastProcessedDate(db)).resolves.not.toThrow();

    // Verify migration was recorded
    const applied = await checkMigrationApplied(db, 'remove_billing_last_processed_date_v1');
    expect(applied).toBe(true);
  });

  it('should be idempotent (skip if already applied)', async () => {
    // Run migration twice
    await migrateRemoveBillingLastProcessedDate(db);
    await expect(migrateRemoveBillingLastProcessedDate(db)).resolves.not.toThrow();
  });

  it('should not affect other settings', async () => {
    // Insert multiple settings
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)`,
        ['billing_last_processed_date', '2026-02-15'],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)`,
        ['activity_log_max_age_days', '90'],
        (err) => err ? reject(err) : resolve()
      );
    });

    await migrateRemoveBillingLastProcessedDate(db);

    // Other setting should still exist
    const other = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM settings WHERE key = 'activity_log_max_age_days'`, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    expect(other).toBeDefined();
    expect(other.value).toBe('90');
  });

  it('should record migration in schema_migrations', async () => {
    await migrateRemoveBillingLastProcessedDate(db);

    const applied = await checkMigrationApplied(db, 'remove_billing_last_processed_date_v1');
    expect(applied).toBe(true);
  });
});

describe('SettingsService - removed cursor methods', () => {
  it('should not export getLastProcessedDate', () => {
    const settingsService = require('../services/settingsService');
    expect(settingsService.getLastProcessedDate).toBeUndefined();
  });

  it('should not export updateLastProcessedDate', () => {
    const settingsService = require('../services/settingsService');
    expect(settingsService.updateLastProcessedDate).toBeUndefined();
  });

  it('should not have BILLING_LAST_PROCESSED_DATE in SETTING_KEYS', () => {
    const settingsService = require('../services/settingsService');
    expect(settingsService.SETTING_KEYS.BILLING_LAST_PROCESSED_DATE).toBeUndefined();
  });

  it('should still export existing methods', () => {
    const settingsService = require('../services/settingsService');
    expect(typeof settingsService.getRetentionSettings).toBe('function');
    expect(typeof settingsService.updateRetentionSettings).toBe('function');
    expect(typeof settingsService.getBusinessTimezone).toBe('function');
    expect(typeof settingsService.updateBusinessTimezone).toBe('function');
  });
});
