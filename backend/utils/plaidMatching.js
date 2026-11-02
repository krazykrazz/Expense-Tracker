/**
 * Pure helpers for matching staged bank transactions to existing expenses.
 * A candidate has the same payment method, the same *charged* amount to the cent, and a date within
 * ±MATCH_WINDOW_DAYS. The charged amount is `chargedAmount` when given (original cost of a reimbursed or
 * insurance-tracked expense), else `amount`.
 */

const MATCH_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const toCents = (amount) => Math.round(Number(amount) * 100);

/** @param {string} date YYYY-MM-DD */
const toUtcDay = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

const dayDiff = (a, b) => Math.abs(toUtcDay(a) - toUtcDay(b));

/** @returns {string} YYYY-MM-DD shifted by `days` */
const shiftDate = (date, days) => new Date((toUtcDay(date) + days) * DAY_MS).toISOString().slice(0, 10);

/** The purchase date: Plaid's authorized date when present, else the posted date. */
const transactionDate = (txn) => txn.authorizedDate || txn.date;

/** What the bank actually charged for an expense. */
const chargedAmount = (expense) => expense.chargedAmount ?? expense.amount;

/**
 * @param {{paymentMethodId: number, amount: number, date: string, authorizedDate?: string}} txn
 * @param {{paymentMethodId: number, amount: number, chargedAmount?: number, date: string}} expense
 */
function isMatchCandidate(txn, expense) {
  return expense.paymentMethodId === txn.paymentMethodId
    && toCents(chargedAmount(expense)) === toCents(txn.amount)
    && dayDiff(transactionDate(txn), expense.date) <= MATCH_WINDOW_DAYS;
}

/**
 * Candidates for one transaction, closest date first.
 */
function findMatchCandidates(txn, expenses) {
  const date = transactionDate(txn);
  return expenses
    .filter(expense => isMatchCandidate(txn, expense))
    .sort((a, b) => dayDiff(date, a.date) - dayDiff(date, b.date) || a.id - b.id);
}

// ─── Fixed expenses ───

/** A fixed expense may land from 3 days before to 10 days after its due day (holidays, processing time). */
const FIXED_EARLY_DAYS = 3;
const FIXED_LATE_DAYS = 10;

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The date a fixed expense is due in its month, clamped to the month length (day 31 in February → 28/29).
 * @returns {string|null} YYYY-MM-DD, or null when the fixed expense has no due day
 */
function fixedExpectedDate({ year, month, dueDay }) {
  if (!dueDay) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(Math.min(dueDay, lastDay))}`;
}

/** Signed days from `from` to `to` (positive when `to` is later). */
const signedDayDiff = (from, to) => toUtcDay(to) - toUtcDay(from);

/**
 * A bank transaction can confirm a fixed expense when it was charged to the same payment method and landed
 * (posted date) within [due − 3, due + 10] days; without a due day, anywhere in the fixed expense's month.
 * The amount may differ (bills vary, and copied-forward amounts go stale).
 * @param {{paymentMethodId: number, amount: number, date: string}} txn
 * @param {{paymentMethodId: number, year: number, month: number, dueDay: (number|null)}} fixed
 */
function isFixedCandidate(txn, fixed) {
  if (fixed.paymentMethodId !== txn.paymentMethodId || !(txn.amount > 0)) return false;
  const expected = fixedExpectedDate(fixed);
  if (!expected) {
    return txn.date.slice(0, 7) === `${fixed.year}-${pad2(fixed.month)}`;
  }
  const offset = signedDayDiff(expected, txn.date);
  return offset >= -FIXED_EARLY_DAYS && offset <= FIXED_LATE_DAYS;
}

/**
 * Fixed-expense candidates for one transaction: exact amounts first, then the smallest amount difference,
 * then the closest to the due date.
 */
function findFixedCandidates(txn, fixedExpenses) {
  const txnCents = toCents(txn.amount);
  const closeness = (fixed) => {
    const expected = fixedExpectedDate(fixed);
    return expected ? Math.abs(signedDayDiff(expected, txn.date)) : 0;
  };
  return fixedExpenses
    .filter(fixed => isFixedCandidate(txn, fixed))
    .sort((a, b) => Math.abs(toCents(a.amount) - txnCents) - Math.abs(toCents(b.amount) - txnCents)
      || closeness(a) - closeness(b)
      || a.id - b.id);
}

module.exports = {
  MATCH_WINDOW_DAYS,
  FIXED_EARLY_DAYS,
  FIXED_LATE_DAYS,
  toCents,
  dayDiff,
  signedDayDiff,
  shiftDate,
  transactionDate,
  chargedAmount,
  isMatchCandidate,
  findMatchCandidates,
  fixedExpectedDate,
  isFixedCandidate,
  findFixedCandidates
};
