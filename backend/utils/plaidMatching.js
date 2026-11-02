/**
 * Pure helpers for matching staged bank transactions to existing expenses.
 * A candidate has the same payment method, the same amount to the cent, and a date within ±MATCH_WINDOW_DAYS.
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

/**
 * @param {{paymentMethodId: number, amount: number, date: string, authorizedDate?: string}} txn
 * @param {{paymentMethodId: number, amount: number, date: string}} expense
 */
function isMatchCandidate(txn, expense) {
  return expense.paymentMethodId === txn.paymentMethodId
    && toCents(expense.amount) === toCents(txn.amount)
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

module.exports = {
  MATCH_WINDOW_DAYS,
  toCents,
  dayDiff,
  shiftDate,
  transactionDate,
  isMatchCandidate,
  findMatchCandidates
};
