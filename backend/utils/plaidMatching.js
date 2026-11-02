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

// ─── Income ───

/** Pay due on the 1st often lands a few days early (weekends, holidays), and vice versa at month start. */
const INCOME_BOUNDARY_DAYS = 3;

const monthIndex = (year, month) => year * 12 + month - 1;

/** Lower-case words of a bank description or income source name ("JAT - Direct deposit" → jat, direct, deposit). */
const nameTokens = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** A bank deposit (money in) on a non-credit-card account. Plaid amounts are negative for money in. */
const isDeposit = (txn) => txn.amount < 0 && txn.paymentMethodType !== 'credit_card';

/**
 * Months (signed offset from the deposit's month) whose income a deposit can confirm: its own month, plus the
 * next month when it lands in the last 3 days, or the previous month when it lands in the first 3 days.
 */
function incomeMonthOffset(txn, source) {
  const [year, month, day] = txn.date.split('-').map(Number);
  const offset = monthIndex(source.year, source.month) - monthIndex(year, month);
  if (offset === 0) return 0;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (offset === 1 && lastDay - day < INCOME_BOUNDARY_DAYS) return 1;
  if (offset === -1 && day <= INCOME_BOUNDARY_DAYS) return -1;
  return null;
}

/**
 * A bank deposit can confirm an expected income source in its month (or the neighbouring month near a month
 * boundary). Income sources have no account or day, so the amount may differ and ranking does the rest.
 * @param {{amount: number, date: string, paymentMethodType?: string}} txn
 * @param {{year: number, month: number}} source
 */
function isIncomeCandidate(txn, source) {
  return isDeposit(txn) && incomeMonthOffset(txn, source) !== null;
}

/**
 * How well an income source's name fits a deposit: 2 when this bank description confirmed a source of the same
 * name before (`learnedNames`, lower-case), 1 when every word of the source name appears in the description.
 */
function incomeNameScore(txn, source, learnedNames = new Set()) {
  const sourceName = String(source.name || '').trim().toLowerCase();
  if (learnedNames.has(sourceName)) return 2;
  const sourceTokens = nameTokens(source.name);
  if (sourceTokens.length === 0) return 0;
  const bankTokens = new Set([...nameTokens(txn.merchantName), ...nameTokens(txn.name)]);
  return sourceTokens.every(token => bankTokens.has(token)) ? 1 : 0;
}

/**
 * Income candidates for one deposit: best name fit first, then the deposit's own month, then the closest amount.
 * @param {Set<string>} [learnedNames] lower-case income source names previously confirmed by this description
 */
function findIncomeCandidates(txn, sources, learnedNames = new Set()) {
  const depositCents = Math.abs(toCents(txn.amount));
  return sources
    .filter(source => isIncomeCandidate(txn, source))
    .map(source => ({ source, nameScore: incomeNameScore(txn, source, learnedNames) }))
    .sort((a, b) => b.nameScore - a.nameScore
      || Math.abs(incomeMonthOffset(txn, a.source)) - Math.abs(incomeMonthOffset(txn, b.source))
      || Math.abs(toCents(a.source.amount) - depositCents) - Math.abs(toCents(b.source.amount) - depositCents)
      || a.source.id - b.source.id)
    .map(({ source, nameScore }) => ({ ...source, nameScore }));
}

module.exports = {
  MATCH_WINDOW_DAYS,
  FIXED_EARLY_DAYS,
  FIXED_LATE_DAYS,
  INCOME_BOUNDARY_DAYS,
  nameTokens,
  isDeposit,
  incomeMonthOffset,
  isIncomeCandidate,
  incomeNameScore,
  findIncomeCandidates,
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
