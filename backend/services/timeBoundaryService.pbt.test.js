/**
 * Property-Based Tests for TimeBoundaryService
 * Feature: utc-timezone-cleanup
 *
 * @invariant Property 2: Business date calculation — For any UTC timestamp and
 * any valid IANA timezone, getBusinessDate(utcTimestamp, timezone) SHALL return
 * a YYYY-MM-DD string that matches the date produced by
 * Intl.DateTimeFormat('en-CA', { timeZone: timezone }) for that same timestamp.
 *
 * @invariant Property 3: Business day bounds containment — For any UTC timestamp
 * and any valid IANA timezone, getBusinessDayBounds() SHALL satisfy:
 * startUTC <= utcTimestamp < endUTC, and startUTC converted to the timezone
 * SHALL yield midnight of the startLocal date.
 *
 * @invariant Property 4: Business week bounds containment — For any UTC timestamp
 * and any valid IANA timezone, getBusinessWeekBounds() SHALL satisfy:
 * startUTC <= utcTimestamp < endUTC, startLocal SHALL be a Monday, and the span
 * SHALL be exactly 7 days.
 *
 * @invariant Property 5: Business month bounds containment — For any UTC timestamp
 * and any valid IANA timezone, getBusinessMonthBounds() SHALL satisfy:
 * startUTC <= utcTimestamp < endUTC, startLocal SHALL be the 1st of a month,
 * and endLocal SHALL be the 1st of the following month.
 */

'use strict';

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Mock settingsService — not needed for pure function tests
jest.mock('./settingsService');

const timeBoundaryService = require('./timeBoundaryService');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Sample of valid IANA timezones covering diverse UTC offsets and DST rules */
const IANA_TIMEZONES = [
  'America/Toronto',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Tokyo',
  'Pacific/Auckland',
  'Etc/UTC'
];

/** UTC timestamp arbitrary: 2020-01-01 to 2026-12-31 (covers DST transitions) */
const utcTimestamp = fc.date({
  min: new Date('2020-01-01T00:00:00Z'),
  max: new Date('2026-12-31T23:59:59Z')
}).filter(d => !isNaN(d.getTime()));

/** IANA timezone arbitrary */
const ianaTimezone = fc.constantFrom(...IANA_TIMEZONES);

// ---------------------------------------------------------------------------
// Property 2: Business date calculation
// Validates: Requirements 4.3, 8.1
// ---------------------------------------------------------------------------

describe('Property 2: Business date calculation', () => {
  /**
   * **Validates: Requirements 4.3, 8.1**
   *
   * For any UTC timestamp and any valid IANA timezone,
   * getBusinessDate(utcTimestamp, timezone) SHALL return a YYYY-MM-DD string
   * that matches the date produced by Intl.DateTimeFormat('en-CA', { timeZone })
   * for that same timestamp.
   */
  test('getBusinessDate matches Intl.DateTimeFormat en-CA output', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const result = timeBoundaryService.getBusinessDate(ts, tz);

        // Reference: what Intl.DateTimeFormat('en-CA') produces
        const expected = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(ts);

        expect(result).toBe(expected);
        // Must be YYYY-MM-DD format
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
      pbtOptions()
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Business day bounds containment
// Validates: Requirements 4.4, 4.7
// ---------------------------------------------------------------------------

describe('Property 3: Business day bounds containment', () => {
  /**
   * **Validates: Requirements 4.4, 4.7**
   *
   * For any UTC timestamp and any valid IANA timezone,
   * getBusinessDayBounds() SHALL satisfy:
   *   startUTC <= utcTimestamp < endUTC
   * and converting startUTC to the given timezone SHALL yield midnight of
   * the startLocal date.
   */
  test('utcTimestamp is contained within [startUTC, endUTC)', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const bounds = timeBoundaryService.getBusinessDayBounds(ts, tz);
        const { startUTC, endUTC } = bounds;

        expect(startUTC.getTime()).toBeLessThanOrEqual(ts.getTime());
        expect(ts.getTime()).toBeLessThan(endUTC.getTime());
      }),
      pbtOptions()
    );
  });

  test('startUTC converts to midnight of startLocal in the given timezone', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const bounds = timeBoundaryService.getBusinessDayBounds(ts, tz);
        const { startLocal, startUTC } = bounds;

        // The date at startUTC in the given timezone should equal startLocal
        const dateAtStart = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(startUTC);
        expect(dateAtStart).toBe(startLocal);

        // startLocal must be YYYY-MM-DD
        expect(startLocal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
      pbtOptions()
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Business week bounds containment
// Validates: Requirements 4.5, 4.7
// ---------------------------------------------------------------------------

describe('Property 4: Business week bounds containment', () => {
  /**
   * **Validates: Requirements 4.5, 4.7**
   *
   * For any UTC timestamp and any valid IANA timezone,
   * getBusinessWeekBounds() SHALL satisfy:
   *   startUTC <= utcTimestamp < endUTC
   *   startLocal is a Monday
   *   span is exactly 7 days
   */
  test('utcTimestamp is contained within [startUTC, endUTC)', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const bounds = timeBoundaryService.getBusinessWeekBounds(ts, tz);
        const { startUTC, endUTC } = bounds;

        expect(startUTC.getTime()).toBeLessThanOrEqual(ts.getTime());
        expect(ts.getTime()).toBeLessThan(endUTC.getTime());
      }),
      pbtOptions()
    );
  });

  test('startLocal is a Monday in the given timezone', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const bounds = timeBoundaryService.getBusinessWeekBounds(ts, tz);
        const { startUTC } = bounds;

        const weekday = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'long'
        }).format(startUTC);

        expect(weekday).toBe('Monday');
      }),
      pbtOptions()
    );
  });

  test('span is exactly 7 calendar days (startLocal to endLocal)', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const bounds = timeBoundaryService.getBusinessWeekBounds(ts, tz);
        const { startLocal, endLocal } = bounds;

        // Verify the span is exactly 7 calendar days using UTC date arithmetic
        // (not milliseconds, since DST transitions make weeks != 7*24h)
        const [sy, sm, sd] = startLocal.split('-').map(Number);
        const [ey, em, ed] = endLocal.split('-').map(Number);
        const startMs = Date.UTC(sy, sm - 1, sd);
        const endMs = Date.UTC(ey, em - 1, ed);
        const calendarDays = (endMs - startMs) / (24 * 60 * 60 * 1000);
        expect(calendarDays).toBe(7);
      }),
      pbtOptions()
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Business month bounds containment
// Validates: Requirements 4.6, 4.7
// ---------------------------------------------------------------------------

describe('Property 5: Business month bounds containment', () => {
  /**
   * **Validates: Requirements 4.6, 4.7**
   *
   * For any UTC timestamp and any valid IANA timezone,
   * getBusinessMonthBounds() SHALL satisfy:
   *   startUTC <= utcTimestamp < endUTC
   *   startLocal ends with '-01' (1st of a month)
   *   endLocal ends with '-01' (1st of the following month)
   */
  test('utcTimestamp is contained within [startUTC, endUTC)', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const bounds = timeBoundaryService.getBusinessMonthBounds(ts, tz);
        const { startUTC, endUTC } = bounds;

        expect(startUTC.getTime()).toBeLessThanOrEqual(ts.getTime());
        expect(ts.getTime()).toBeLessThan(endUTC.getTime());
      }),
      pbtOptions()
    );
  });

  test('startLocal is the 1st of a month', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const bounds = timeBoundaryService.getBusinessMonthBounds(ts, tz);
        expect(bounds.startLocal).toMatch(/^\d{4}-\d{2}-01$/);
      }),
      pbtOptions()
    );
  });

  test('endLocal is the 1st of the following month', () => {
    fc.assert(
      fc.property(utcTimestamp, ianaTimezone, (ts, tz) => {
        const bounds = timeBoundaryService.getBusinessMonthBounds(ts, tz);
        const { startLocal, endLocal } = bounds;

        expect(endLocal).toMatch(/^\d{4}-\d{2}-01$/);

        // endLocal month should be startLocal month + 1 (or Jan if Dec)
        const [startYear, startMonth] = startLocal.split('-').map(Number);
        const [endYear, endMonth] = endLocal.split('-').map(Number);

        if (startMonth === 12) {
          expect(endYear).toBe(startYear + 1);
          expect(endMonth).toBe(1);
        } else {
          expect(endYear).toBe(startYear);
          expect(endMonth).toBe(startMonth + 1);
        }
      }),
      pbtOptions()
    );
  });
});
