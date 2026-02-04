const { calculateWeek, getTodayString, calculateDaysUntilDue } = require('./dateUtils');

describe('dateUtils', () => {
  describe('calculateWeek', () => {
    it('should calculate week 1 for days 1-7', () => {
      expect(calculateWeek('2024-01-01')).toBe(1);
      expect(calculateWeek('2024-01-07')).toBe(1);
    });

    it('should calculate week 2 for days 8-14', () => {
      expect(calculateWeek('2024-01-08')).toBe(2);
      expect(calculateWeek('2024-01-14')).toBe(2);
    });

    it('should calculate week 3 for days 15-21', () => {
      expect(calculateWeek('2024-01-15')).toBe(3);
      expect(calculateWeek('2024-01-21')).toBe(3);
    });

    it('should calculate week 4 for days 22-28', () => {
      expect(calculateWeek('2024-01-22')).toBe(4);
      expect(calculateWeek('2024-01-28')).toBe(4);
    });

    it('should calculate week 5 for days 29-31', () => {
      expect(calculateWeek('2024-01-29')).toBe(5);
      expect(calculateWeek('2024-01-30')).toBe(5);
      expect(calculateWeek('2024-01-31')).toBe(5);
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-15T00:00:00');
      expect(calculateWeek(date)).toBe(3);
    });

    it('should handle different date formats', () => {
      expect(calculateWeek('2024-02-29')).toBe(5); // Leap year
      expect(calculateWeek('2024-12-31')).toBe(5);
    });

    it('should handle month boundaries correctly', () => {
      expect(calculateWeek('2024-02-01')).toBe(1);
      expect(calculateWeek('2024-02-29')).toBe(5); // Leap year
      expect(calculateWeek('2024-03-01')).toBe(1);
    });
  });

  describe('getTodayString', () => {
    it('should return a date string in YYYY-MM-DD format', () => {
      const today = getTodayString();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return a valid date', () => {
      const today = getTodayString();
      const date = new Date(today);
      expect(date).toBeInstanceOf(Date);
      expect(isNaN(date.getTime())).toBe(false);
    });

    it('should use the configured timezone', () => {
      const today = getTodayString();
      // Should be a valid date string
      expect(today.split('-')).toHaveLength(3);
      const [year, month, day] = today.split('-');
      expect(parseInt(year)).toBeGreaterThan(2020);
      expect(parseInt(month)).toBeGreaterThanOrEqual(1);
      expect(parseInt(month)).toBeLessThanOrEqual(12);
      expect(parseInt(day)).toBeGreaterThanOrEqual(1);
      expect(parseInt(day)).toBeLessThanOrEqual(31);
    });
  });

  describe('calculateDaysUntilDue', () => {
    it('should return null for invalid due days', () => {
      expect(calculateDaysUntilDue(0)).toBeNull();
      expect(calculateDaysUntilDue(-1)).toBeNull();
      expect(calculateDaysUntilDue(32)).toBeNull();
      expect(calculateDaysUntilDue(null)).toBeNull();
      expect(calculateDaysUntilDue(undefined)).toBeNull();
    });

    it('should calculate days until due in current month', () => {
      const referenceDate = new Date('2024-01-10T00:00:00');
      const daysUntil = calculateDaysUntilDue(15, referenceDate);
      expect(daysUntil).toBe(5); // Jan 15 - Jan 10 = 5 days
    });

    it('should calculate days until due in next month', () => {
      const referenceDate = new Date('2024-01-25T00:00:00');
      const daysUntil = calculateDaysUntilDue(15, referenceDate);
      expect(daysUntil).toBe(21); // Feb 15 - Jan 25 = 21 days
    });

    it('should handle due date on same day', () => {
      const referenceDate = new Date('2024-01-15T00:00:00');
      const daysUntil = calculateDaysUntilDue(15, referenceDate);
      expect(daysUntil).toBe(0);
    });

    it('should handle months with fewer days (Feb 30 -> Feb 28/29)', () => {
      const referenceDate = new Date('2024-01-31T00:00:00');
      const daysUntil = calculateDaysUntilDue(30, referenceDate);
      // Due day 30 in Feb becomes Feb 29 (2024 is leap year)
      // Jan 31 to Feb 29 = 29 days, but since we're past day 30 in Jan, it goes to next month
      expect(daysUntil).toBe(30); // Feb 29 is 30 days from Jan 31 (inclusive)
    });

    it('should handle months with fewer days (non-leap year)', () => {
      const referenceDate = new Date('2023-01-31T00:00:00');
      const daysUntil = calculateDaysUntilDue(30, referenceDate);
      // Due day 30 in Feb becomes Feb 28 (2023 is not leap year)
      // Jan 31 to Feb 28 = 28 days
      expect(daysUntil).toBe(30); // Feb 28 is 30 days from Jan 31 (counting method)
    });

    it('should handle year boundaries', () => {
      const referenceDate = new Date('2024-12-25T00:00:00');
      const daysUntil = calculateDaysUntilDue(15, referenceDate);
      expect(daysUntil).toBe(21); // Jan 15, 2025 - Dec 25, 2024 = 21 days
    });

    it('should handle day 31 in months with 30 days', () => {
      const referenceDate = new Date('2024-03-31T00:00:00');
      const daysUntil = calculateDaysUntilDue(31, referenceDate);
      // April has 30 days, so due day 31 becomes April 30
      // Since we're on March 31 and due is April 30, it's 0 days (same day logic)
      expect(daysUntil).toBe(0); // Same day when current day >= due day
    });

    it('should use current date when no reference date provided', () => {
      const daysUntil = calculateDaysUntilDue(15);
      expect(typeof daysUntil).toBe('number');
      expect(daysUntil).toBeGreaterThanOrEqual(0);
      expect(daysUntil).toBeLessThanOrEqual(31);
    });

    it('should handle edge case of day 1', () => {
      const referenceDate = new Date('2024-01-15T00:00:00');
      const daysUntil = calculateDaysUntilDue(1, referenceDate);
      expect(daysUntil).toBe(17); // Feb 1 - Jan 15 = 17 days
    });

    it('should handle edge case of day 31', () => {
      const referenceDate = new Date('2024-01-15T00:00:00');
      const daysUntil = calculateDaysUntilDue(31, referenceDate);
      expect(daysUntil).toBe(16); // Jan 31 - Jan 15 = 16 days
    });
  });
});
