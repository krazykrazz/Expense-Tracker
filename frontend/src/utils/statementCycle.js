const pad = (n) => String(n).padStart(2, '0');
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The date the statement closes that `dateStr` falls in, for a card whose statement closes on `billingCycleDay`
 * (clamped to short months). Same rule as the backend's billing cycles: a cycle runs from the day after the close
 * day of one month to the close day of the next, so a date after the close day belongs to next month's statement.
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} billingCycleDay 1-31
 * @returns {string|null} YYYY-MM-DD, or null without a usable date or close day
 */
export function statementCloseDate(dateStr, billingCycleDay) {
  const closeOn = Number(billingCycleDay);
  if (!dateStr || !Number.isInteger(closeOn) || closeOn < 1 || closeOn > 31) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;

  const closeDay = (y, m) => Math.min(closeOn, daysInMonth(y, m));
  let closeYear = year;
  let closeMonth = month;
  if (day > closeDay(year, month)) {
    closeMonth += 1;
    if (closeMonth > 12) {
      closeMonth = 1;
      closeYear += 1;
    }
  }
  return `${closeYear}-${pad(closeMonth)}-${pad(closeDay(closeYear, closeMonth))}`;
}

/**
 * When an expense posts on a later statement than the one it was made in (made on the last day of the cycle,
 * posted two days later: not on this month's bill).
 * @param {{date: string, posted_date?: string|null}} expense
 * @param {number|null} billingCycleDay
 * @returns {{madeStatement: string, postedStatement: string}|null} the statement close dates, or null when both fall in the same one
 */
export function laterStatement(expense, billingCycleDay) {
  if (!expense || !expense.posted_date || expense.posted_date <= expense.date) return null;
  const madeStatement = statementCloseDate(expense.date, billingCycleDay);
  const postedStatement = statementCloseDate(expense.posted_date, billingCycleDay);
  if (!madeStatement || !postedStatement || madeStatement === postedStatement) return null;
  return { madeStatement, postedStatement };
}
