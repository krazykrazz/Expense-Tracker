const logger = require('../config/logger');
const migrations = require('./migrations');
const { applyPendingMigrations } = require('./db');

describe('database initialization migrations', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves after all pending migrations complete', async () => {
    const db = { close: jest.fn() };
    jest.spyOn(migrations, 'runMigrations').mockResolvedValue();

    await expect(applyPendingMigrations(db)).resolves.toBeUndefined();

    expect(migrations.runMigrations).toHaveBeenCalledWith(db);
    expect(db.close).not.toHaveBeenCalled();
  });

  test('closes the connection and rejects when a migration fails', async () => {
    const migrationError = new Error('migration failed');
    const db = {
      close: jest.fn((callback) => callback())
    };
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(migrations, 'runMigrations').mockRejectedValue(migrationError);

    await expect(applyPendingMigrations(db)).rejects.toBe(migrationError);

    expect(db.close).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('Migration error:', migrationError);
  });
});
