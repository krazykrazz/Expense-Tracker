'use strict';

/**
 * Unit Tests: Scheduler Date-Driven Behavior
 *
 * Tests the date-driven execution model:
 * - First run (null last_processed_date) processes only current date
 * - Multi-day gap recovery processes each missing date sequentially
 * - Same-day skip when currentBusinessDate <= lastProcessedDate
 * - Concurrent execution lock prevents double-processing
 *
 * _Requirements: 5.4, 5.5, 5.10, 6.1, 6.3_
 */

jest.mock('./activityLogService');
jest.mock('./timeBoundaryService');
jest.mock('./settingsService');
jest.mock('../repositories/billingCycleRepository');

const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const settingsService = require('./settingsService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const schedulerService = require('./billingCycleSchedulerService');

beforeEach(() => {
  jest.clearAllMocks();
  schedulerService.isRunning = false;
  activityLogService.logEvent.mockResolvedValue(undefined);
  timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
  timeBoundaryService.getBusinessDate.mockReturnValue('2024-06-15');
  timeBoundaryService.localDateToUTC.mockImplementation((d) => new Date(d + 'T04:00:00Z'));
  billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);
  settingsService.getLastProcessedDate.mockResolvedValue(null);
  settingsService.updateLastProcessedDate.mockResolvedValue(undefined);
});

afterEach(() => {
  schedulerService.isRunning = false;
});

describe('Scheduler date-driven behavior - unit tests', () => {

  describe('First run (null last_processed_date)', () => {
    test('processes only the current business date', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue(null);
      timeBoundaryService.getBusinessDate.mockReturnValue('2024-06-15');

      await schedulerService.runAutoGeneration(new Date('2024-06-15T12:00:00Z'));

      const updateCalls = settingsService.updateLastProcessedDate.mock.calls.map(c => c[0]);
      expect(updateCalls).toEqual(['2024-06-15']);
    });

    test('calls getCreditCardsNeedingBillingCycleEntry once for the current date', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue(null);
      timeBoundaryService.getBusinessDate.mockReturnValue('2024-06-15');

      await schedulerService.runAutoGeneration(new Date('2024-06-15T12:00:00Z'));

      expect(billingCycleRepository.getCreditCardsNeedingBillingCycleEntry).toHaveBeenCalledTimes(1);
    });

    test('returns generatedCount 0 and empty errors when no cards', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue(null);

      const result = await schedulerService.runAutoGeneration(new Date());

      expect(result).toEqual({ generatedCount: 0, errors: [] });
    });
  });

  describe('Multi-day gap recovery', () => {
    test('processes 3 missing dates in order when 3-day gap exists', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue('2024-06-12');
      timeBoundaryService.getBusinessDate.mockReturnValue('2024-06-15');

      await schedulerService.runAutoGeneration(new Date('2024-06-15T12:00:00Z'));

      const updateCalls = settingsService.updateLastProcessedDate.mock.calls.map(c => c[0]);
      expect(updateCalls).toEqual(['2024-06-13', '2024-06-14', '2024-06-15']);
    });

    test('calls getCreditCardsNeedingBillingCycleEntry once per missing date', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue('2024-06-12');
      timeBoundaryService.getBusinessDate.mockReturnValue('2024-06-15');

      await schedulerService.runAutoGeneration(new Date('2024-06-15T12:00:00Z'));

      expect(billingCycleRepository.getCreditCardsNeedingBillingCycleEntry).toHaveBeenCalledTimes(3);
    });

    test('updates last_processed_date after each date, interleaved with card fetches', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue('2024-06-13');
      timeBoundaryService.getBusinessDate.mockReturnValue('2024-06-15');

      const callOrder = [];
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockImplementation(async () => {
        callOrder.push('getCards');
        return [];
      });
      settingsService.updateLastProcessedDate.mockImplementation(async (d) => {
        callOrder.push('update:' + d);
      });

      await schedulerService.runAutoGeneration(new Date('2024-06-15T12:00:00Z'));

      expect(callOrder).toEqual([
        'getCards', 'update:2024-06-14',
        'getCards', 'update:2024-06-15'
      ]);
    });

    test('handles month boundary correctly (June 30 to July 1)', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue('2024-06-29');
      timeBoundaryService.getBusinessDate.mockReturnValue('2024-07-01');

      await schedulerService.runAutoGeneration(new Date('2024-07-01T12:00:00Z'));

      const updateCalls = settingsService.updateLastProcessedDate.mock.calls.map(c => c[0]);
      expect(updateCalls).toEqual(['2024-06-30', '2024-07-01']);
    });
  });

  describe('Same-day skip', () => {
    test('skips processing when currentBusinessDate equals lastProcessedDate', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue('2024-06-15');
      timeBoundaryService.getBusinessDate.mockReturnValue('2024-06-15');

      const result = await schedulerService.runAutoGeneration(new Date('2024-06-15T18:00:00Z'));

      expect(settingsService.updateLastProcessedDate).not.toHaveBeenCalled();
      expect(billingCycleRepository.getCreditCardsNeedingBillingCycleEntry).not.toHaveBeenCalled();
      expect(result).toEqual({ generatedCount: 0, errors: [] });
    });

    test('skips processing when currentBusinessDate is behind lastProcessedDate', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue('2024-06-20');
      timeBoundaryService.getBusinessDate.mockReturnValue('2024-06-15');

      const result = await schedulerService.runAutoGeneration(new Date());

      expect(settingsService.updateLastProcessedDate).not.toHaveBeenCalled();
      expect(result).toEqual({ generatedCount: 0, errors: [] });
    });
  });

  describe('Concurrent execution lock', () => {
    test('returns skipped result immediately when lock is held', async () => {
      schedulerService.isRunning = true;

      const result = await schedulerService.runAutoGeneration(new Date());

      expect(result).toEqual({ generatedCount: 0, errors: [], skipped: true });
      expect(timeBoundaryService.getBusinessTimezone).not.toHaveBeenCalled();
      expect(settingsService.getLastProcessedDate).not.toHaveBeenCalled();
    });

    test('releases lock after successful run', async () => {
      settingsService.getLastProcessedDate.mockResolvedValue(null);

      await schedulerService.runAutoGeneration(new Date());

      expect(schedulerService.isRunning).toBe(false);
    });

    test('releases lock even when a fatal error is thrown', async () => {
      timeBoundaryService.getBusinessTimezone.mockRejectedValue(new Error('Settings DB unavailable'));

      await expect(schedulerService.runAutoGeneration(new Date())).rejects.toThrow('Settings DB unavailable');

      expect(schedulerService.isRunning).toBe(false);
    });
  });
});
