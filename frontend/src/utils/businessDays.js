/**
 * Business-day utilities for Canadian (Ontario) bank holidays.
 *
 * Credit-card transactions made on a non-business day (weekend or statutory
 * bank holiday) typically do not post until the next business day. The expense
 * form uses these helpers to suggest a default Posted Date, which the user can
 * always override or clear.
 *
 * Dates are handled as YYYY-MM-DD strings using UTC math to avoid local
 * timezone day-shifts. The holiday set reflects statutory holidays observed by
 * banks in Ontario (the app's America/Toronto business timezone). Fixed-date
 * holidays that fall on a weekend are observed on the following business day.
 */

/** Parse a YYYY-MM-DD string into a UTC-midnight Date. */
function parseUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a UTC Date back to a YYYY-MM-DD string. */
function formatUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add (or subtract) days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
function addDays(dateStr, days) {
  const date = parseUTC(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUTC(date);
}

/** True if the date falls on a Saturday or Sunday. */
export function isWeekend(dateStr) {
  const dow = parseUTC(dateStr).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Nth occurrence of a weekday within a month.
 * @param {number} year
 * @param {number} month - 1-12
 * @param {number} weekday - 0=Sun .. 6=Sat
 * @param {number} n - 1-based occurrence (e.g. 3 = third Monday)
 * @returns {string} YYYY-MM-DD
 */
function nthWeekdayOfMonth(year, month, weekday, n) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  return formatUTC(new Date(Date.UTC(year, month - 1, day)));
}

/** Victoria Day: the Monday preceding May 25. */
function victoriaDay(year) {
  const refDow = new Date(Date.UTC(year, 4, 25)).getUTCDay(); // May 25
  let back = (refDow - 1 + 7) % 7; // days back to the most recent Monday
  if (back === 0) back = 7; // strictly preceding when May 25 is itself a Monday
  return formatUTC(new Date(Date.UTC(year, 4, 25 - back)));
}

/** Easter Sunday via the Anonymous Gregorian (Meeus/Jones/Butcher) algorithm. */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return formatUTC(new Date(Date.UTC(year, month - 1, day)));
}

/** Good Friday: the Friday before Easter Sunday. */
function goodFriday(year) {
  return addDays(easterSunday(year), -2);
}

/**
 * Add a fixed-date holiday to the set, applying in-lieu observance: if it falls
 * on a weekend, it is observed on the next non-holiday weekday instead.
 */
function addObserved(set, dateStr) {
  if (!isWeekend(dateStr)) {
    set.add(dateStr);
    return;
  }
  let d = dateStr;
  do {
    d = addDays(d, 1);
  } while (isWeekend(d) || set.has(d));
  set.add(d);
}

const holidayCache = new Map();

/**
 * Set of YYYY-MM-DD statutory bank-holiday dates for a given year (Ontario).
 * @param {number} year
 * @returns {Set<string>}
 */
export function getHolidaysForYear(year) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year);
  }

  const set = new Set();

  // Fixed-date holidays — observed on the next business day when on a weekend.
  addObserved(set, `${year}-01-01`); // New Year's Day
  addObserved(set, `${year}-07-01`); // Canada Day
  addObserved(set, `${year}-12-25`); // Christmas Day
  addObserved(set, `${year}-12-26`); // Boxing Day

  // Floating Monday holidays — always land on a weekday.
  set.add(nthWeekdayOfMonth(year, 2, 1, 3)); // Family Day — 3rd Monday of February
  set.add(victoriaDay(year)); // Victoria Day — Monday preceding May 25
  set.add(nthWeekdayOfMonth(year, 8, 1, 1)); // Civic Holiday — 1st Monday of August
  set.add(nthWeekdayOfMonth(year, 9, 1, 1)); // Labour Day — 1st Monday of September
  set.add(nthWeekdayOfMonth(year, 10, 1, 2)); // Thanksgiving — 2nd Monday of October

  // Good Friday — Friday before Easter Sunday.
  set.add(goodFriday(year));

  holidayCache.set(year, set);
  return set;
}

/** True if the date is a statutory bank holiday in Ontario. */
export function isHoliday(dateStr) {
  const year = parseUTC(dateStr).getUTCFullYear();
  return getHolidaysForYear(year).has(dateStr);
}

/** True if the date is a business day (not a weekend and not a bank holiday). */
export function isBusinessDay(dateStr) {
  return !isWeekend(dateStr) && !isHoliday(dateStr);
}

/**
 * The next business day strictly after the given date.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} YYYY-MM-DD of the next business day
 */
export function nextBusinessDay(dateStr) {
  let d = addDays(dateStr, 1);
  while (!isBusinessDay(d)) {
    d = addDays(d, 1);
  }
  return d;
}
