/**
 * Unit tests: plaidSyncSchedulerService — settings, active hours (business timezone) and tick gating.
 */

jest.mock('../config/plaid', () => ({ isEnabled: jest.fn() }));
jest.mock('./plaidService', () => ({ findStaleItems: jest.fn(), syncItems: jest.fn() }));
jest.mock('../repositories/settingsRepository', () => ({ getMultiple: jest.fn(), setSetting: jest.fn() }));
jest.mock('./activityLogService', () => ({ logEvent: jest.fn() }));
jest.mock('./timeBoundaryService', () => ({ getBusinessTimezone: jest.fn() }));

const plaidConfig = require('../config/plaid');
const plaidService = require('./plaidService');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const scheduler = require('./plaidSyncSchedulerService');

// 2026-11-02 is in EST (UTC-5)
const torontoAt = (hhmm) => new Date(`2026-11-02T${hhmm}:00-05:00`);

beforeEach(() => {
  jest.clearAllMocks();
  plaidConfig.isEnabled.mockReturnValue(true);
  settingsRepository.getMultiple.mockResolvedValue({});
  timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
  plaidService.findStaleItems.mockResolvedValue([{ id: 1 }]);
  plaidService.syncItems.mockResolvedValue({ synced: 1, totals: { added: 0, updated: 0, removed: 0 } });
});

describe('plaidSyncSchedulerService', () => {
  test('defaults to on, every 30 minutes, 06:00-23:00', async () => {
    expect(await scheduler.getSettings()).toEqual({ enabled: true, intervalMinutes: 30, startHour: 6, endHour: 23 });
  });

  test('reads stored settings', async () => {
    settingsRepository.getMultiple.mockResolvedValue({
      plaid_auto_sync_enabled: '0', plaid_auto_sync_interval_minutes: '60', plaid_auto_sync_start_hour: '7', plaid_auto_sync_end_hour: '22'
    });
    expect(await scheduler.getSettings()).toEqual({ enabled: false, intervalMinutes: 60, startHour: 7, endHour: 22 });
  });

  test('active hours are local to the business timezone and include the end hour', () => {
    const hours = { startHour: 6, endHour: 23 };
    const at = (hhmm) => scheduler._isWithinActiveHours(scheduler._localTime(torontoAt(hhmm), 'America/Toronto'), hours);
    expect(at('05:55')).toBe(false);
    expect(at('06:00')).toBe(true);
    expect(at('23:00')).toBe(true);
    expect(at('23:05')).toBe(false);
  });

  test('a tick inside active hours syncs stale banks, allowing 3 minutes of slack', async () => {
    const now = torontoAt('12:30');

    expect(await scheduler.tick(now)).toEqual({ synced: 1 });

    expect(plaidService.findStaleItems).toHaveBeenCalledWith(27, now.getTime());
    expect(plaidService.syncItems).toHaveBeenCalledWith([{ id: 1 }], 'scheduled');
  });

  test.each([
    ['Plaid not configured', () => plaidConfig.isEnabled.mockReturnValue(false), '12:00', 'plaid_disabled'],
    ['auto sync off', () => settingsRepository.getMultiple.mockResolvedValue({ plaid_auto_sync_enabled: '0' }), '12:00', 'off'],
    ['overnight', () => {}, '02:00', 'outside_hours']
  ])('does nothing when %s', async (_label, arrange, hhmm, reason) => {
    arrange();
    expect(await scheduler.tick(torontoAt(hhmm))).toEqual({ skipped: reason });
    expect(plaidService.syncItems).not.toHaveBeenCalled();
  });

  test('does not sync when no bank is due', async () => {
    plaidService.findStaleItems.mockResolvedValue([]);
    expect(await scheduler.tick(torontoAt('12:00'))).toEqual({ synced: 0 });
    expect(plaidService.syncItems).not.toHaveBeenCalled();
  });

  test('saves validated settings and logs the change', async () => {
    const saved = await scheduler.saveSettings({ intervalMinutes: 60, startHour: 7, endHour: 22 }, 'tab-1');

    expect(saved).toEqual({ enabled: true, intervalMinutes: 60, startHour: 7, endHour: 22 });
    expect(settingsRepository.setSetting).toHaveBeenCalledWith('plaid_auto_sync_interval_minutes', '60');
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'settings_updated', 'settings', null, 'Bank auto sync: every 60 minutes, 7:00-22:00', expect.objectContaining({ section: 'plaid_auto_sync', tabId: 'tab-1' })
    );
  });

  test.each([
    [{ intervalMinutes: 15 }],
    [{ startHour: 23, endHour: 6 }],
    [{ startHour: -1 }],
    [{ endHour: 25 }],
    [{ startHour: 6.5 }]
  ])('rejects invalid settings %j', async (input) => {
    await expect(scheduler.saveSettings(input)).rejects.toMatchObject({ statusCode: 400 });
    expect(settingsRepository.setSetting).not.toHaveBeenCalled();
  });
});
