'use strict';

/**
 * Unit Tests for TimeBoundaryService
 * Validates: Requirements 4.8, 8.5
 *
 * Tests DST transitions, edge-of-day examples, and specific timezone examples.
 */

// Mock settingsService — not needed for pure function tests
jest.mock('./settingsService');

const timeBoundaryService = require('./timeBoundaryService');

// ---------------------------------------------------------------------------
// DST transition tests for America/Toronto
// ---------------------------------------------------------------------------

describe('DST transitions — America/Toronto', () => {
  const TZ = 'America/Toronto';

  describe('Spring forward 2024 (2024-03-10, clocks skip 2:00→3:00 local)', () => {
    // Just before 2am local (EST, UTC-5): 2024-03-10T06:59:59Z → local 01:59:59 EST
    const beforeSpring = new Date('2024-03-10T06:59:59Z');
    // Just after 2am local (EDT, UTC-4): 2024-03-10T07:00:01Z → local 03:00:01 EDT
    const afterSpring = new Date('2024-03-10T07:00:01Z');

    test('business date is 2024-03-10 just before spring forward', () => {
      expect(timeBoundaryService.getBusinessDate(beforeSpring, TZ)).toBe('2024-03-10');
    });

    test('business date is 2024-03-10 just after spring forward', () => {
      expect(timeBoundaryService.getBusinessDate(afterSpring, TZ)).toBe('2024-03-10');
    });

    test('day bounds contain both timestamps on 2024-03-10', () => {
      const bounds = timeBoundaryService.getBusinessDayBounds(beforeSpring, TZ);
      expect(bounds.startLocal).toBe('2024-03-10');
      expect(bounds.startUTC.getTime()).toBeLessThanOrEqual(beforeSpring.getTime());
      expect(beforeSpring.getTime()).toBeLessThan(bounds.endUTC.getTime());

      const bounds2 = timeBoundaryService.getBusinessDayBounds(afterSpring, TZ);
      expect(bounds2.startLocal).toBe('2024-03-10');
      expect(bounds2.startUTC.getTime()).toBeLessThanOrEqual(afterSpring.getTime());
      expect(afterSpring.getTime()).toBeLessThan(bounds2.endUTC.getTime());
    });

    test('spring-forward day is approximately 23 hours long (startUTC to endUTC)', () => {
      const bounds = timeBoundaryService.getBusinessDayBounds(beforeSpring, TZ);
      const durationMs = bounds.endUTC.getTime() - bounds.startUTC.getTime();
      // Spring forward: 23 hours — allow ±1 second for binary search precision
      expect(durationMs).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000 - 1000);
      expect(durationMs).toBeLessThanOrEqual(23 * 60 * 60 * 1000 + 1000);
    });
  });

  describe('Fall back 2024 (2024-11-03, clocks repeat 2:00→1:00 local)', () => {
    // Just before 2am local (EDT, UTC-4): 2024-11-03T05:59:59Z → local 01:59:59 EDT
    const beforeFall = new Date('2024-11-03T05:59:59Z');
    // Just after 2am local (EST, UTC-5): 2024-11-03T06:00:01Z → local 01:00:01 EST
    const afterFall = new Date('2024-11-03T06:00:01Z');

    test('business date is 2024-11-03 just before fall back', () => {
      expect(timeBoundaryService.getBusinessDate(beforeFall, TZ)).toBe('2024-11-03');
    });

    test('business date is 2024-11-03 just after fall back', () => {
      expect(timeBoundaryService.getBusinessDate(afterFall, TZ)).toBe('2024-11-03');
    });

    test('day bounds contain both timestamps on 2024-11-03', () => {
      const bounds = timeBoundaryService.getBusinessDayBounds(beforeFall, TZ);
      expect(bounds.startLocal).toBe('2024-11-03');
      expect(bounds.startUTC.getTime()).toBeLessThanOrEqual(beforeFall.getTime());
      expect(beforeFall.getTime()).toBeLessThan(bounds.endUTC.getTime());

      const bounds2 = timeBoundaryService.getBusinessDayBounds(afterFall, TZ);
      expect(bounds2.startLocal).toBe('2024-11-03');
      expect(bounds2.startUTC.getTime()).toBeLessThanOrEqual(afterFall.getTime());
      expect(afterFall.getTime()).toBeLessThan(bounds2.endUTC.getTime());
    });

    test('fall-back day is approximately 25 hours long (startUTC to endUTC)', () => {
      const bounds = timeBoundaryService.getBusinessDayBounds(beforeFall, TZ);
      const durationMs = bounds.endUTC.getTime() - bounds.startUTC.getTime();
      // Fall back: 25 hours — allow ±1 second for binary search precision
      expect(durationMs).toBeGreaterThanOrEqual(25 * 60 * 60 * 1000 - 1000);
      expect(durationMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000 + 1000);
    });
  });
});

// ---------------------------------------------------------------------------
// Edge-of-day examples
// ---------------------------------------------------------------------------

describe('Edge-of-day examples', () => {
  const TZ = 'Etc/UTC';

  test('23:59 UTC is still the same UTC date', () => {
    const ts = new Date('2024-06-15T23:59:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, TZ)).toBe('2024-06-15');
  });

  test('00:00 UTC is the start of the UTC date', () => {
    const ts = new Date('2024-06-15T00:00:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, TZ)).toBe('2024-06-15');
  });

  test('23:59 UTC day bounds: startUTC is midnight, endUTC is next midnight', () => {
    const ts = new Date('2024-06-15T23:59:00Z');
    const bounds = timeBoundaryService.getBusinessDayBounds(ts, TZ);
    expect(bounds.startLocal).toBe('2024-06-15');
    expect(bounds.endLocal).toBe('2024-06-16');
    expect(bounds.startUTC.toISOString()).toBe('2024-06-15T00:00:00.000Z');
    expect(bounds.endUTC.toISOString()).toBe('2024-06-16T00:00:00.000Z');
  });

  test('00:00 UTC day bounds: startUTC is midnight of that day', () => {
    const ts = new Date('2024-06-15T00:00:00Z');
    const bounds = timeBoundaryService.getBusinessDayBounds(ts, TZ);
    expect(bounds.startLocal).toBe('2024-06-15');
    expect(bounds.startUTC.toISOString()).toBe('2024-06-15T00:00:00.000Z');
  });

  test('23:59 UTC in America/Toronto is still the previous calendar day', () => {
    // 23:59 UTC = 19:59 EDT (UTC-4) → still June 15 local
    const ts = new Date('2024-06-15T23:59:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, 'America/Toronto')).toBe('2024-06-15');
  });

  test('00:00 UTC in America/Toronto is the previous calendar day', () => {
    // 00:00 UTC = 20:00 EDT previous day (UTC-4) → June 14 local
    const ts = new Date('2024-06-15T00:00:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, 'America/Toronto')).toBe('2024-06-14');
  });
});

// ---------------------------------------------------------------------------
// Specific timezone examples
// ---------------------------------------------------------------------------

describe('Asia/Tokyo timezone examples', () => {
  const TZ = 'Asia/Tokyo'; // UTC+9, no DST

  test('2024-01-01T00:00:00Z is 2024-01-01 09:00 JST → date is 2024-01-01', () => {
    const ts = new Date('2024-01-01T00:00:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, TZ)).toBe('2024-01-01');
  });

  test('2024-01-01T15:00:00Z is 2024-01-02 00:00 JST → date is 2024-01-02', () => {
    const ts = new Date('2024-01-01T15:00:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, TZ)).toBe('2024-01-02');
  });

  test('day bounds for 2024-01-01T15:00:00Z contain the timestamp', () => {
    const ts = new Date('2024-01-01T15:00:00Z');
    const bounds = timeBoundaryService.getBusinessDayBounds(ts, TZ);
    expect(bounds.startLocal).toBe('2024-01-02');
    expect(bounds.startUTC.getTime()).toBeLessThanOrEqual(ts.getTime());
    expect(ts.getTime()).toBeLessThan(bounds.endUTC.getTime());
  });

  test('week bounds startLocal is a Monday', () => {
    // 2024-01-01 is a Monday in JST
    const ts = new Date('2024-01-01T00:00:00Z'); // 2024-01-01 09:00 JST
    const bounds = timeBoundaryService.getBusinessWeekBounds(ts, TZ);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(bounds.startUTC);
    expect(weekday).toBe('Monday');
  });

  test('month bounds for January 2024 are correct', () => {
    const ts = new Date('2024-01-15T00:00:00Z'); // 2024-01-15 09:00 JST
    const bounds = timeBoundaryService.getBusinessMonthBounds(ts, TZ);
    expect(bounds.startLocal).toBe('2024-01-01');
    expect(bounds.endLocal).toBe('2024-02-01');
  });
});

describe('Pacific/Auckland timezone examples', () => {
  const TZ = 'Pacific/Auckland'; // UTC+12/+13 (DST)

  test('2024-01-01T00:00:00Z is 2024-01-01 13:00 NZDT → date is 2024-01-01', () => {
    const ts = new Date('2024-01-01T00:00:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, TZ)).toBe('2024-01-01');
  });

  test('2024-06-15T11:59:00Z is 2024-06-15 23:59 NZST → date is 2024-06-15', () => {
    const ts = new Date('2024-06-15T11:59:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, TZ)).toBe('2024-06-15');
  });

  test('2024-06-15T12:00:00Z is 2024-06-16 00:00 NZST → date is 2024-06-16', () => {
    const ts = new Date('2024-06-15T12:00:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, TZ)).toBe('2024-06-16');
  });

  test('day bounds contain the timestamp', () => {
    const ts = new Date('2024-06-15T11:59:00Z');
    const bounds = timeBoundaryService.getBusinessDayBounds(ts, TZ);
    expect(bounds.startUTC.getTime()).toBeLessThanOrEqual(ts.getTime());
    expect(ts.getTime()).toBeLessThan(bounds.endUTC.getTime());
  });
});

describe('Etc/UTC timezone examples', () => {
  const TZ = 'Etc/UTC';

  test('getBusinessDate returns the UTC date', () => {
    const ts = new Date('2024-07-04T12:30:00Z');
    expect(timeBoundaryService.getBusinessDate(ts, TZ)).toBe('2024-07-04');
  });

  test('day bounds are exactly midnight-to-midnight UTC', () => {
    const ts = new Date('2024-07-04T12:30:00Z');
    const bounds = timeBoundaryService.getBusinessDayBounds(ts, TZ);
    expect(bounds.startUTC.toISOString()).toBe('2024-07-04T00:00:00.000Z');
    expect(bounds.endUTC.toISOString()).toBe('2024-07-05T00:00:00.000Z');
  });

  test('week bounds: Monday to next Monday', () => {
    // 2024-07-01 is a Monday
    const ts = new Date('2024-07-03T12:00:00Z'); // Wednesday
    const bounds = timeBoundaryService.getBusinessWeekBounds(ts, TZ);
    expect(bounds.startLocal).toBe('2024-07-01');
    expect(bounds.endLocal).toBe('2024-07-08');
    // For Etc/UTC (no DST), the span is exactly 7 * 24h in ms
    const spanDays = (bounds.endUTC.getTime() - bounds.startUTC.getTime()) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBe(7);
  });

  test('month bounds for July 2024', () => {
    const ts = new Date('2024-07-15T00:00:00Z');
    const bounds = timeBoundaryService.getBusinessMonthBounds(ts, TZ);
    expect(bounds.startLocal).toBe('2024-07-01');
    expect(bounds.endLocal).toBe('2024-08-01');
  });

  test('month bounds for December 2024 roll over to January 2025', () => {
    const ts = new Date('2024-12-15T00:00:00Z');
    const bounds = timeBoundaryService.getBusinessMonthBounds(ts, TZ);
    expect(bounds.startLocal).toBe('2024-12-01');
    expect(bounds.endLocal).toBe('2025-01-01');
  });
});

// ---------------------------------------------------------------------------
// localDateToUTC
// ---------------------------------------------------------------------------

describe('localDateToUTC', () => {
  // localDateToUTC uses a binary search that converges to within ~1 second.
  // For Etc/UTC (zero offset) it finds exact midnight; for other timezones
  // we allow ±1 second tolerance.
  const withinOneSec = (result, expectedISO) => {
    const expected = new Date(expectedISO).getTime();
    expect(Math.abs(result.getTime() - expected)).toBeLessThanOrEqual(1000);
  };

  test('converts 2024-01-15 in Etc/UTC to midnight UTC', () => {
    const result = timeBoundaryService.localDateToUTC('2024-01-15', 'Etc/UTC');
    expect(result.toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });

  test('converts 2024-01-15 in America/Toronto (EST, UTC-5) to ~05:00 UTC', () => {
    const result = timeBoundaryService.localDateToUTC('2024-01-15', 'America/Toronto');
    withinOneSec(result, '2024-01-15T05:00:00.000Z');
  });

  test('converts 2024-07-15 in America/Toronto (EDT, UTC-4) to ~04:00 UTC', () => {
    const result = timeBoundaryService.localDateToUTC('2024-07-15', 'America/Toronto');
    withinOneSec(result, '2024-07-15T04:00:00.000Z');
  });

  test('converts 2024-01-15 in Asia/Tokyo (UTC+9) to ~previous day 15:00 UTC', () => {
    const result = timeBoundaryService.localDateToUTC('2024-01-15', 'Asia/Tokyo');
    withinOneSec(result, '2024-01-14T15:00:00.000Z');
  });
});
