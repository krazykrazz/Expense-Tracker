/**
 * Integration tests: what backups report to the notification service (a real backup into a temp directory, mocked
 * notification service). The service's own rules are in notificationService tests.
 */
// Backups copy the real database file, so (like the other backup suites) skip the in-memory test database
process.env.SKIP_TEST_DB = 'true';

jest.mock('./notificationService', () => ({
  reportBackupSucceeded: jest.fn(),
  reportBackupFailed: jest.fn(),
  reportBackupRestored: jest.fn(),
  resetState: jest.fn()
}));

const fs = require('fs');
const path = require('path');
const backupService = require('./backupService');
const notificationService = require('./notificationService');
const { initializeDatabase } = require('../database/db');

describe('BackupService - notification reports', () => {
  let testBackupPath;

  beforeAll(async () => {
    await initializeDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    testBackupPath = path.join(__dirname, '..', 'test-backups', `notify-${Date.now()}`);
    fs.mkdirSync(testBackupPath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testBackupPath, { recursive: true, force: true });
  });

  test.each(['manual', 'scheduled'])('a %s backup reports its file name and size', async (trigger) => {
    const result = await backupService.performBackup(testBackupPath, { trigger });

    expect(result.success).toBe(true);
    expect(notificationService.reportBackupSucceeded).toHaveBeenCalledWith({ trigger, filename: result.filename, size: result.size });
    expect(notificationService.reportBackupFailed).not.toHaveBeenCalled();
  });

  test('the temporary archive made for a browser download is not reported', async () => {
    await backupService.performBackup(testBackupPath);

    expect(notificationService.reportBackupSucceeded).not.toHaveBeenCalled();
    expect(notificationService.reportBackupFailed).not.toHaveBeenCalled();
  });

  test('a failed backup reports the error, the trigger and the last good backup, and still throws it', async () => {
    const blocker = path.join(testBackupPath, 'a-file');
    fs.writeFileSync(blocker, 'x');
    const lastBackup = backupService.config.lastBackup;

    await expect(backupService.performBackup(path.join(blocker, 'sub'), { trigger: 'scheduled' }))
      .rejects.toThrow('Cannot create backup directory');

    expect(notificationService.reportBackupFailed).toHaveBeenCalledWith({
      trigger: 'scheduled', error: expect.any(Error), lastBackup
    });
    expect(notificationService.reportBackupSucceeded).not.toHaveBeenCalled();
  });

  test('a failure of the notification service never fails or changes the backup', async () => {
    notificationService.reportBackupSucceeded.mockImplementation(() => { throw new Error('thrown'); });
    await expect(backupService.performBackup(testBackupPath, { trigger: 'manual' })).resolves.toMatchObject({ success: true });

    notificationService.reportBackupSucceeded.mockReset().mockRejectedValue(new Error('rejected'));
    await expect(backupService.performBackup(testBackupPath, { trigger: 'manual' })).resolves.toMatchObject({ success: true });
  });

  test('a restore resets the remembered states and is reported with the file name only', async () => {
    const backup = await backupService.performBackup(testBackupPath);

    const result = await backupService.restoreBackup(backup.path);

    expect(result.success).toBe(true);
    expect(notificationService.resetState).toHaveBeenCalledTimes(1);
    expect(notificationService.reportBackupRestored).toHaveBeenCalledWith({ filename: backup.filename });
  });
});
