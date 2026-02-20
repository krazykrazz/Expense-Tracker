'use strict';

/**
 * Property-Based Tests: Scheduler Date Processing Completeness & Idempotence
 *
 * @invariant
 * Property 6: Scheduler date processing completeness
 * For any (lastProcessedDate, currentBusinessDate) pair where current > last,
 * the scheduler processes exactly the dates in [last+1 .. current] in order,
 * and updates last_processed_date after each date.
 *
 * Property 7: Scheduler idempotence
 * Running the scheduler multiple times for the same business date produces
 * exactly one record per card per cycle (UNIQUE constraint handling).
 *
 * Validates: Requirements 5.4, 5.5, 5.6, 5.8, 5.10, 6.2
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

jest.mock('./activityLogService');
jest.mock('./timeBoundaryService');
jest.mock('./settingsService');
jest.mock('../repositories/billingCycleRepository');

const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const settingsService = require('./settingsService');
const billingCycleRepository = require('../repositories/billingCycleRepository');

const schedulerService = require('./billingCycleSchedulerService');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Add n days to a YYYY-MM-DD string */
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Generate a YYYY-MM-DD string from a year/month/day triple */
function toDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  schedulerService.isRunning = false;

  activityLogService.logEvent.mockResolvedValue(undefined);
  timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
  timeBoundaryService.getBusinessDate.mockReturnValue('2024-02-20');
  timeBoundaryService.localDateToUTC.mockImplementation((dateStr) => new Date(dateStr + 'T05:00:00Z'));

  billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);
  settingsService.getLastProcessedDate.mockResolvedValue(null);
  settingsService.updateLastProcessedDate.mockResolvedValue(undefined);
});

afterEach(() => {
  schedulerService.isRunning = false;
});

// ── Property 6: Date processing completeness ─────────────────────────────────

describe('Property 6: Scheduler date processing completeness', () => {

  it('processes exactly the dates in [last+1 .. current] when gap exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gap size: 1 to 7 days
        fc.integer({ min: 1, max: 7 }),
        async (gapDays) => {
          schedulerService.isRunning = false;
          jest.clearAllMocks();
          activityLogService.logEvent.mockResolvedValue(undefined);

          const lastProcessed = '2024-02-10';
          const currentDate = addDays(lastProcessed, gapDays);

          timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
          timeBoundaryService.getBusinessDate.mockReturnValue(currentDate);
          timeBoundaryService.localDateToUTC.mockImplementation((d) => new Date(d + 'T05:00:00Z'));
          settingsService.getLastProcessedDate.mockResolvedValue(lastProcessed);
          settingsService.updateLastProcessedDate.mockResolvedValue(undefined);
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);

          await schedulerService.runAutoGeneration(new Date('2024-02-20T12:00:00Z'));

          // updateLastProcessedDate should be called once per date in the gap
          const updateCalls = settingsService.updateLastProcessedDate.mock.calls.map(c => c[0]);
          expect(updateCalls).toHaveLength(gapDays);

          // Dates should be in ascending order
          const expectedDates = schedulerService.getDateRange(
            addDays(lastProcessed, 1),
            currentDate
          );
          expect(updateCalls).toEqual(expectedDates);
        }
      ),
      pbtOptions()
    );
  });

  it('processes only current date when lastProcessedDate is null (first run)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2024, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        async (year, month, day) => {
          schedulerService.isRunning = false;
          jest.clearAllMocks();
          activityLogService.logEvent.mockResolvedValue(undefined);

          const currentDate = toDateStr(year, month, day);
          timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
          timeBoundaryService.getBusinessDate.mockReturnValue(currentDate);
          timeBoundaryService.localDateToUTC.mockImplementation((d) => new Date(d + 'T05:00:00Z'));
          settingsService.getLastProcessedDate.mockResolvedValue(null);
          settingsService.updateLastProcessedDate.mockResolvedValue(undefined);
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);

          await schedulerService.runAutoGeneration(new Date());

          const updateCalls = settingsService.updateLastProcessedDate.mock.calls.map(c => c[0]);
          expect(updateCalls).toHaveLength(1);
          expect(updateCalls[0]).toBe(currentDate);
        }
      ),
      pbtOptions()
    );
  });

  it('skips processing when currentBusinessDate <= lastProcessedDate', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Offset: 0 = same day, negative = current is behind last
        fc.integer({ min: -5, max: 0 }),
        async (offset) => {
          schedulerService.isRunning = false;
          jest.clearAllMocks();
          activityLogService.logEvent.mockResolvedValue(undefined);

          const lastProcessed = '2024-02-15';
          const currentDate = addDays(lastProcessed, offset);

          timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
          timeBoundaryService.getBusinessDate.mockReturnValue(currentDate);
          timeBoundaryService.localDateToUTC.mockImplementation((d) => new Date(d + 'T05:00:00Z'));
          settingsService.getLastProcessedDate.mockResolvedValue(lastProcessed);
          settingsService.updateLastProcessedDate.mockResolvedValue(undefined);
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);

          const result = await schedulerService.runAutoGeneration(new Date());

          // No dates processed, no updates
          expect(settingsService.updateLastProcessedDate).not.toHaveBeenCalled();
          expect(result.generatedCount).toBe(0);
          expect(result.errors).toHaveLength(0);
        }
      ),
      pbtOptions()
    );
  });

  it('last_processed_date advances monotonically through the gap', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (gapDays) => {
          schedulerService.isRunning = false;
          jest.clearAllMocks();
          activityLogService.logEvent.mockResolvedValue(undefined);

          const lastProcessed = '2024-03-01';
          const currentDate = addDays(lastProcessed, gapDays);

          timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
          timeBoundaryService.getBusinessDate.mockReturnValue(currentDate);
          timeBoundaryService.localDateToUTC.mockImplementation((d) => new Date(d + 'T05:00:00Z'));
          settingsService.getLastProcessedDate.mockResolvedValue(lastProcessed);
          settingsService.updateLastProcessedDate.mockResolvedValue(undefined);
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);

          await schedulerService.runAutoGeneration(new Date());

          const updateCalls = settingsService.updateLastProcessedDate.mock.calls.map(c => c[0]);

          // Each call must be strictly greater than the previous
          for (let i = 1; i < updateCalls.length; i++) {
            expect(updateCalls[i] > updateCalls[i - 1]).toBe(true);
          }
          // Final call must equal currentDate
          expect(updateCalls[updateCalls.length - 1]).toBe(currentDate);
        }
      ),
      pbtOptions()
    );
  });
});

// ── Property 7: Scheduler idempotence ────────────────────────────────────────

describe('Property 7: Scheduler idempotence', () => {

  it('getDateRange returns empty array when fromDate > toDate', async () => {
    await fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        (offset) => {
          const base = '2024-06-15';
          const from = addDays(base, offset);
          const to = base; // to < from
          const result = schedulerService.getDateRange(from, to);
          expect(result).toEqual([]);
        }
      ),
      pbtOptions()
    );
  });

  it('getDateRange length equals (toDate - fromDate) + 1 days', async () => {
    await fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        (spanDays) => {
          const from = '2024-01-01';
          const to = addDays(from, spanDays);
          const result = schedulerService.getDateRange(from, to);
          expect(result).toHaveLength(spanDays + 1);
          expect(result[0]).toBe(from);
          expect(result[result.length - 1]).toBe(to);
        }
      ),
      pbtOptions()
    );
  });

  it('getDateRange dates are strictly ascending', async () => {
    await fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (spanDays) => {
          const from = '2024-05-10';
          const to = addDays(from, spanDays);
          const result = schedulerService.getDateRange(from, to);
          for (let i = 1; i < result.length; i++) {
            expect(result[i] > result[i - 1]).toBe(true);
          }
        }
      ),
      pbtOptions()
    );
  });

  it('running scheduler twice for same date does not double-update last_processed_date', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (gapDays) => {
          schedulerService.isRunning = false;
          jest.clearAllMocks();
          activityLogService.logEvent.mockResolvedValue(undefined);

          const lastProcessed = '2024-04-01';
          const currentDate = addDays(lastProcessed, gapDays);

          timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
          timeBoundaryService.getBusinessDate.mockReturnValue(currentDate);
          timeBoundaryService.localDateToUTC.mockImplementation((d) => new Date(d + 'T05:00:00Z'));
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);

          // First run: processes the gap
          settingsService.getLastProcessedDate.mockResolvedValue(lastProcessed);
          settingsService.updateLastProcessedDate.mockResolvedValue(undefined);
          await schedulerService.runAutoGeneration(new Date());
          const firstRunUpdates = settingsService.updateLastProcessedDate.mock.calls.length;

          // Second run: currentDate === lastProcessed (already up to date)
          jest.clearAllMocks();
          activityLogService.logEvent.mockResolvedValue(undefined);
          settingsService.getLastProcessedDate.mockResolvedValue(currentDate);
          settingsService.updateLastProcessedDate.mockResolvedValue(undefined);
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);
          await schedulerService.runAutoGeneration(new Date());
          const secondRunUpdates = settingsService.updateLastProcessedDate.mock.calls.length;

          // First run processed gapDays dates; second run processed 0
          expect(firstRunUpdates).toBe(gapDays);
          expect(secondRunUpdates).toBe(0);
        }
      ),
      pbtOptions()
    );
  });
});
