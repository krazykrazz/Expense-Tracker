const { getHolidaysForYear, isBusinessDay, nextBusinessDay } = require('./businessDays');

describe('businessDays', () => {
  test('Ontario bank holidays for 2026', () => {
    expect([...getHolidaysForYear(2026)].sort()).toEqual([
      '2026-01-01', '2026-02-16', '2026-04-03', '2026-05-18', '2026-07-01',
      '2026-08-03', '2026-09-07', '2026-10-12', '2026-12-25', '2026-12-28'
    ]);
  });

  test('weekend holidays move to the next free weekday, Boxing Day included when Christmas is a Sunday', () => {
    expect(['2027-12-27', '2027-12-28'].every(d => getHolidaysForYear(2027).has(d))).toBe(true);
    for (const year of [2022, 2033]) {
      expect(getHolidaysForYear(year).has(`${year}-12-26`)).toBe(true);
      expect(getHolidaysForYear(year).has(`${year}-12-27`)).toBe(true);
    }
  });

  test('nextBusinessDay skips weekends and holidays', () => {
    expect(nextBusinessDay('2026-11-12')).toBe('2026-11-13');
    expect(nextBusinessDay('2026-11-13')).toBe('2026-11-16');
    expect(nextBusinessDay('2026-12-24')).toBe('2026-12-29');
    expect(nextBusinessDay('2026-12-31')).toBe('2027-01-04');
    expect(isBusinessDay('2026-10-12')).toBe(false);
  });
});
