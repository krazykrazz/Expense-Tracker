import { describe, it, expect } from 'vitest';
import {
  isWeekend,
  isHoliday,
  isBusinessDay,
  nextBusinessDay,
  getHolidaysForYear,
} from './businessDays';

describe('businessDays', () => {
  describe('isWeekend', () => {
    it('returns true for Saturday and Sunday', () => {
      expect(isWeekend('2026-06-13')).toBe(true); // Saturday
      expect(isWeekend('2026-06-14')).toBe(true); // Sunday
    });

    it('returns false for weekdays', () => {
      expect(isWeekend('2026-06-15')).toBe(false); // Monday
      expect(isWeekend('2026-06-12')).toBe(false); // Friday
    });
  });

  describe('getHolidaysForYear (2026, Ontario)', () => {
    const holidays = getHolidaysForYear(2026);

    it('includes the expected statutory bank holidays', () => {
      expect(holidays.has('2026-01-01')).toBe(true); // New Year's Day (Thu)
      expect(holidays.has('2026-02-16')).toBe(true); // Family Day — 3rd Mon Feb
      expect(holidays.has('2026-04-03')).toBe(true); // Good Friday
      expect(holidays.has('2026-05-18')).toBe(true); // Victoria Day
      expect(holidays.has('2026-07-01')).toBe(true); // Canada Day (Wed)
      expect(holidays.has('2026-08-03')).toBe(true); // Civic Holiday — 1st Mon Aug
      expect(holidays.has('2026-09-07')).toBe(true); // Labour Day — 1st Mon Sep
      expect(holidays.has('2026-10-12')).toBe(true); // Thanksgiving — 2nd Mon Oct
      expect(holidays.has('2026-12-25')).toBe(true); // Christmas (Fri)
    });

    it('observes Boxing Day on the next business day when it falls on a weekend', () => {
      // Dec 26 2026 is a Saturday -> observed Monday Dec 28
      expect(holidays.has('2026-12-28')).toBe(true);
    });
  });

  describe('observed in-lieu days for fixed holidays on weekends', () => {
    it('observes Christmas + Boxing Day cascade when both fall on a weekend', () => {
      // 2027: Dec 25 = Saturday, Dec 26 = Sunday -> observed Mon Dec 27 and Tue Dec 28
      const holidays = getHolidaysForYear(2027);
      expect(holidays.has('2027-12-27')).toBe(true);
      expect(holidays.has('2027-12-28')).toBe(true);
    });

    it('observes New Year\'s Day on Monday when Jan 1 is a Saturday', () => {
      // Jan 1 2028 is a Saturday -> observed Monday Jan 3
      const holidays = getHolidaysForYear(2028);
      expect(holidays.has('2028-01-03')).toBe(true);
    });
  });

  describe('isHoliday', () => {
    it('recognizes a known holiday', () => {
      expect(isHoliday('2026-12-25')).toBe(true);
    });

    it('returns false for an ordinary weekday', () => {
      expect(isHoliday('2026-06-15')).toBe(false);
    });
  });

  describe('isBusinessDay', () => {
    it('is false on weekends and holidays', () => {
      expect(isBusinessDay('2026-06-13')).toBe(false); // Saturday
      expect(isBusinessDay('2026-12-25')).toBe(false); // Christmas
    });

    it('is true on ordinary weekdays', () => {
      expect(isBusinessDay('2026-06-15')).toBe(true); // Monday
    });
  });

  describe('nextBusinessDay', () => {
    it('rolls a Saturday charge to the following Monday', () => {
      expect(nextBusinessDay('2026-06-13')).toBe('2026-06-15'); // Sat -> Mon
    });

    it('rolls a Sunday charge to the following Monday', () => {
      expect(nextBusinessDay('2026-06-14')).toBe('2026-06-15'); // Sun -> Mon
    });

    it('skips a holiday that follows the weekend', () => {
      // Good Friday Apr 3 2026 -> Sat Apr 4, Sun Apr 5, Mon Apr 6
      expect(nextBusinessDay('2026-04-03')).toBe('2026-04-06');
    });

    it('crosses a year boundary correctly', () => {
      // Thu Dec 31 2026 -> Fri Jan 1 2027 (New Year's, holiday), Sat, Sun -> Mon Jan 4
      expect(nextBusinessDay('2026-12-31')).toBe('2027-01-04');
    });
  });
});
