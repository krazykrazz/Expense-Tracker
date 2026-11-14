/**
 * Business days for Ontario bank holidays, on YYYY-MM-DD strings (UTC math, no timezone shifts).
 * Mirrors frontend/src/utils/businessDays.js, which the expense form uses to estimate a card charge's
 * posted date (the next business day after the purchase).
 */

const parseUTC = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const formatUTC = (date) => date.toISOString().slice(0, 10);

const addDays = (dateStr, days) => {
  const date = parseUTC(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUTC(date);
};

const isWeekend = (dateStr) => {
  const dow = parseUTC(dateStr).getUTCDay();
  return dow === 0 || dow === 6;
};

/** month 1-12, weekday 0=Sun..6=Sat, n 1-based */
const nthWeekdayOfMonth = (year, month, weekday, n) => {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return formatUTC(new Date(Date.UTC(year, month - 1, 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7)));
};

/** Victoria Day: the Monday strictly preceding May 25. */
const victoriaDay = (year) => {
  let back = (new Date(Date.UTC(year, 4, 25)).getUTCDay() - 1 + 7) % 7;
  if (back === 0) back = 7;
  return formatUTC(new Date(Date.UTC(year, 4, 25 - back)));
};

/** Easter Sunday (Anonymous Gregorian algorithm). */
const easterSunday = (year) => {
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
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return formatUTC(new Date(Date.UTC(year, month - 1, day)));
};

/** A fixed-date holiday on a weekend (or on a day another holiday already took) moves to the next free weekday. */
const addObserved = (set, dateStr) => {
  let d = dateStr;
  while (isWeekend(d) || set.has(d)) d = addDays(d, 1);
  set.add(d);
};

const holidayCache = new Map();

function getHolidaysForYear(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const set = new Set();
  addObserved(set, `${year}-01-01`);
  addObserved(set, `${year}-07-01`);
  addObserved(set, `${year}-12-25`);
  addObserved(set, `${year}-12-26`);
  set.add(nthWeekdayOfMonth(year, 2, 1, 3)); // Family Day
  set.add(victoriaDay(year));
  set.add(nthWeekdayOfMonth(year, 8, 1, 1)); // Civic Holiday
  set.add(nthWeekdayOfMonth(year, 9, 1, 1)); // Labour Day
  set.add(nthWeekdayOfMonth(year, 10, 1, 2)); // Thanksgiving
  set.add(addDays(easterSunday(year), -2)); // Good Friday
  holidayCache.set(year, set);
  return set;
}

const isBusinessDay = (dateStr) => !isWeekend(dateStr) && !getHolidaysForYear(parseUTC(dateStr).getUTCFullYear()).has(dateStr);

/** The next business day strictly after the date. */
function nextBusinessDay(dateStr) {
  let d = addDays(dateStr, 1);
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

module.exports = { getHolidaysForYear, isBusinessDay, nextBusinessDay };
