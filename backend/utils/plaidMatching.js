/**
 * Pure helpers for matching staged bank transactions to existing expenses.
 * A candidate has the same payment method, the same *charged* amount to the cent, and a date within
 * ±MATCH_WINDOW_DAYS. The charged amount is `chargedAmount` when given (original cost of a reimbursed or
 * insurance-tracked expense), else `amount`.
 */

const MATCH_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A pending charge can settle for a different amount (tip, gas hold): within this share of the pending amount. */
const PENDING_AMOUNT_TOLERANCE = 0.25;

const { toCents } = require('./money');

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
 * The amount may differ (bills vary, and copied-forward amounts go stale). Pending transactions never confirm:
 * the point is the date the payment actually landed.
 * @param {{paymentMethodId: number, amount: number, date: string, pending?: (boolean|number)}} txn
 * @param {{paymentMethodId: number, year: number, month: number, dueDay: (number|null)}} fixed
 */
function isFixedCandidate(txn, fixed) {
  if (txn.pending || fixed.paymentMethodId !== txn.paymentMethodId || !(txn.amount > 0)) return false;
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

// ─── Ranking helpers shared by income (and, in Phase 3, contributions and loan payments) ───

/** Month index (year * 12 + month - 1): consecutive months differ by 1, across year ends too. */
const monthIndex = (year, month) => year * 12 + month - 1;

/** Month index of a YYYY-MM-DD date. */
const monthIndexOfDate = (date) => monthIndex(Number(date.slice(0, 4)), Number(date.slice(5, 7)));

/**
 * Inclusive month-index range covering every date, widened by `margin` months on each side: the months to load
 * candidates for when a match may land in the neighbouring month.
 * @param {string[]} dates YYYY-MM-DD, at least one
 * @returns {[number, number]} [from, to]
 */
const monthWindow = (dates, margin = 0) => {
  const indexes = dates.map(monthIndexOfDate);
  return [Math.min(...indexes) - margin, Math.max(...indexes) + margin];
};

/** Lower-case words of a bank description or income source name ("JAT - Direct deposit" → jat, direct, deposit). */
const nameTokens = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * The key decisions are learned by: the bank description (merchant name, else the raw name), trimmed and
 * lower-case. A later row with the same key gets the same suggestion (e.g. the income it confirmed before).
 * @param {{merchantName?: string|null, name?: string|null}} txn
 */
const descriptionKey = (txn) => (txn.merchantName || txn.name || '').trim().toLowerCase();

// ─── Income ───

/** Pay due on the 1st often lands a few days early (weekends, holidays), and vice versa at month start. */
const INCOME_BOUNDARY_DAYS = 3;

/** A settled bank deposit (money in) on a non-credit-card account. Plaid amounts are negative for money in. */
const isDeposit = (txn) => txn.amount < 0 && !txn.pending && txn.paymentMethodType !== 'credit_card';

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

// ─── Card payments ───

/** A payment leaves chequing and reaches the card a few days apart (cut-off times, weekends). */
const PAYMENT_WINDOW_DAYS = 5;

/** A row on an account mapped to a credit card; every other mapped account is a funding account. */
const isCardRow = (txn) => txn.paymentMethodType === 'credit_card';
/** Money in on a card: a payment or a refund. */
const isCardCredit = (txn) => isCardRow(txn) && txn.amount < 0;
/** Money out of a non-card account: what a card payment looks like on the funding side. */
const isFundingDebit = (txn) => !isCardRow(txn) && txn.amount > 0;

/** A bank row can be one side of a card payment: a settled card credit or funding debit. */
const isCardPaymentSide = (txn) => !txn.pending && (isCardCredit(txn) || isFundingDebit(txn));

const sameCentsWithinWindow = (a, b) => Math.abs(toCents(a.amount)) === Math.abs(toCents(b.amount))
  && dayDiff(a.date, b.date) <= PAYMENT_WINDOW_DAYS;

/** A card credit and a funding debit (either order), settled, of the same cents within the window. */
const isPaymentPair = (a, b) => isCardPaymentSide(a) && isCardPaymentSide(b)
  && isCardCredit(a) !== isCardCredit(b) && sameCentsWithinWindow(a, b);

/**
 * The other side of each card payment among the given bank rows: for a card credit, the funding debits of the
 * same cents within ±5 days (posted dates), and the reverse. Never picks: several candidates are all listed,
 * closest date first. Symmetric by construction.
 * @param {Array<{id: number, amount: number, date: string, pending?: boolean, paymentMethodType?: string}>} rows
 * @returns {Map<number, Array>} row id → opposite-side rows
 */
function pairCardPayments(rows) {
  const sides = rows.filter(isCardPaymentSide);
  const credits = sides.filter(isCardCredit);
  const debits = sides.filter(isFundingDebit);
  const pairs = new Map(sides.map(row => [row.id, []]));
  const byCloseness = (row) => (a, b) => dayDiff(row.date, a.date) - dayDiff(row.date, b.date) || a.id - b.id;

  for (const credit of credits) {
    for (const debit of debits) {
      if (!sameCentsWithinWindow(credit, debit)) continue;
      pairs.get(credit.id).push(debit);
      pairs.get(debit.id).push(credit);
    }
  }
  for (const row of sides) pairs.get(row.id).sort(byCloseness(row));
  return pairs;
}

/**
 * Recorded card payments a bank row could be (one side of): the same cents within ±5 days of the payment date.
 * A card row only takes payments on its own card that no card row is linked to; a funding row takes any
 * card's payment that no funding row is linked to.
 * @param {{amount: number, date: string, paymentMethodId?: number, paymentMethodType?: string}} txn
 * @param {Array<{id: number, paymentMethodId: number, amount: number, date: string, cardLinked: boolean, fundingLinked: boolean}>} payments
 */
function findPaymentCandidates(txn, payments) {
  if (!isCardPaymentSide(txn)) return [];
  const card = isCardCredit(txn);
  return payments
    .filter(payment => (card ? payment.paymentMethodId === txn.paymentMethodId && !payment.cardLinked : !payment.fundingLinked)
      && sameCentsWithinWindow(txn, payment))
    .sort((a, b) => dayDiff(txn.date, a.date) - dayDiff(txn.date, b.date) || a.id - b.id);
}

module.exports = {
  MATCH_WINDOW_DAYS,
  PENDING_AMOUNT_TOLERANCE,
  PAYMENT_WINDOW_DAYS,
  isCardRow,
  isCardCredit,
  isFundingDebit,
  isCardPaymentSide,
  isPaymentPair,
  pairCardPayments,
  findPaymentCandidates,
  FIXED_EARLY_DAYS,
  FIXED_LATE_DAYS,
  INCOME_BOUNDARY_DAYS,
  monthIndex,
  monthIndexOfDate,
  monthWindow,
  nameTokens,
  descriptionKey,
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
