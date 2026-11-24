/**
 * Pure rules for reimbursements from the bank (spec 3.6 refunds on a card, 3.8 deposits from people and
 * businesses): which expenses a bank row could have repaid, how well each fits, and what an expense becomes.
 * All money is compared in whole cents. An expense's `amount` is what it cost out of pocket; `originalCost`, when
 * set, is what was charged (the difference is already reimbursed, by hand or by an earlier bank row).
 */

const { toCents } = require('./money');
const { nameTokens } = require('./plaidMatching');
const { placeKey } = require('./placeSuggestion');
const { similarNames } = require('./bankFileImport');

/** Expenses from this many days before the bank row (up to its date) are candidates. */
const WINDOW_DAYS = 90;

/** Words of a bank description that say how the money arrived, not who sent it or what it was for. */
const GENERIC_WORDS = new Set([
  'interac', 'etransfer', 'transfer', 'from', 'deposit', 'direct', 'payment', 'pmt', 'received', 'the', 'and',
  'mobile', 'online', 'bill', 'refund', 'purchase', 'credit', 'for', 'ltd', 'inc'
]);

/** What was charged for an expense: its original cost when it has one, else its amount. */
const chargedOf = (expense) => expense.originalCost ?? expense.amount;

/**
 * What the user entered by hand as reimbursed and no bank row accounts for yet, in cents: original cost −
 * out-of-pocket, less every bank row's amount (one that lowered the out-of-pocket is part of that difference; one
 * applied as "entered by hand" used that much of it up, so a second row can't claim it again).
 */
function enteredPoolCents(expense) {
  if (expense.originalCost == null) return 0;
  return Math.max(0, toCents(expense.originalCost) - toCents(expense.amount) - toCents(expense.repaidByBank || 0));
}

/** Whether a reimbursement entered by hand is large enough to account for a bank row of `bankCents` (a part payment too). */
const coversBankRow = (expense, bankCents) => {
  const pool = enteredPoolCents(expense);
  return pool > 0 && pool >= bankCents;
};

/**
 * What applying `amountCents` from a bank row does to an expense.
 * @param {{amount: number, originalCost: (number|null), repaidByBank?: number}} expense
 * @param {number} amountCents what the bank row repaid on this expense
 * @param {boolean} [alreadyEntered] the reimbursement was entered by hand before: the expense is left as it is
 * @returns {{error: 'amount'|'notEntered'|'over', leftCents?: number}
 *   | {appliedCents: number, amount: number, originalCost: (number|null)}}
 */
function planApply(expense, amountCents, alreadyEntered = false) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: 'amount' };
  if (alreadyEntered) {
    if (enteredPoolCents(expense) < amountCents) return { error: 'notEntered', leftCents: enteredPoolCents(expense) };
    return { appliedCents: 0, amount: expense.amount, originalCost: expense.originalCost ?? null };
  }
  const remaining = toCents(expense.amount);
  if (amountCents > remaining) return { error: 'over', leftCents: remaining };
  return {
    appliedCents: amountCents,
    amount: (remaining - amountCents) / 100,
    originalCost: expense.originalCost ?? expense.amount
  };
}

/** Words of a text that could name a sender or a purpose. */
const meaningfulWords = (text) => nameTokens(text).filter(word => word.length >= 3 && !GENERIC_WORDS.has(word) && !/^\d+$/.test(word));

/**
 * Whether a bank description shares a word with the expense's place or notes ("Interac e-Transfer from Jordan" and
 * "Dinner with Jordan"). Generic transfer wording never counts.
 */
function sharesName(expense, txn) {
  const bank = new Set(meaningfulWords(`${txn.name || ''} ${txn.merchantName || ''}`));
  if (bank.size === 0) return false;
  return meaningfulWords(`${expense.place || ''} ${expense.notes || ''}`).some(word => bank.has(word));
}

/**
 * Same merchant as a refund: the bank's merchant id equals the id of the bank row the expense is linked to, the
 * place is the one the description maps to, or the place and the description start with the same word.
 * @param {string} txnPlace the place the Inbox suggests for the refund's description
 */
function sameMerchant(expense, txn, txnPlace) {
  if (txn.merchantEntityId && expense.merchantEntityId && txn.merchantEntityId === expense.merchantEntityId) return true;
  // Spaces don't matter: "Home Sense" and "HomeSense" are one place
  const compact = (text) => placeKey(text).replace(/ /g, '');
  if (expense.place && txnPlace && compact(expense.place) === compact(txnPlace)) return true;
  return Boolean(expense.place) && similarNames({ name: expense.place }, { name: txn.name, merchantName: txn.merchantName });
}

/** Why an expense fits a deposit, best reason first. */
function depositTags(expense, depositCents, txn, learnedPlaces) {
  const tags = [];
  if (expense.place && learnedPlaces.has(String(expense.place).trim().toLowerCase())) tags.push('learned');
  if (coversBankRow(expense, depositCents)) tags.push('entered');
  const outOfPocket = toCents(expense.amount);
  if (outOfPocket === depositCents) tags.push('exact');
  else if (outOfPocket === depositCents * 2) tags.push('half');
  if (sharesName(expense, txn)) tags.push('name');
  return tags;
}

const TAG_WEIGHT = { learned: 16, entered: 8, exact: 4, half: 2, name: 1 };
const scoreOf = (tags) => tags.reduce((sum, tag) => sum + TAG_WEIGHT[tag], 0);

/**
 * Expenses a deposit could have repaid, best first: learned sender, a reimbursement entered by hand that the deposit
 * is all or part of, exact amount (or half of it, a split bill), name overlap, then the most recent. Only expenses
 * with something left to reimburse.
 * @param {{name?: string, merchantName?: string}} txn the bank row (description)
 * @param {Set<string>} learnedPlaces lower-cased places earlier deposits with the same description were applied to
 * @returns {Array<object>} candidates with `tags`
 */
function rankDeposit(expenses, depositCents, txn, learnedPlaces = new Set()) {
  return expenses
    .filter(expense => toCents(expense.amount) > 0)
    .map(expense => ({ expense, tags: depositTags(expense, depositCents, txn, learnedPlaces) }))
    .sort((a, b) => scoreOf(b.tags) - scoreOf(a.tags)
      || (a.expense.date < b.expense.date ? 1 : a.expense.date > b.expense.date ? -1 : 0)
      || b.expense.id - a.expense.id)
    .map(({ expense, tags }) => ({ ...expense, tags }));
}

/**
 * Purchases a refund could be for, best first: one the user already entered a reimbursement of at least the refund for,
 * then the same merchant, then the closest date before the refund. Only purchases charged at least the refund.
 * @param {string} txnPlace the place the Inbox suggests for the refund's description
 * @param {{all?: boolean}} options `all`: also purchases at other merchants
 */
function rankRefund(expenses, refundCents, txn, txnPlace, { all = false } = {}) {
  return expenses
    .filter(expense => toCents(chargedOf(expense)) >= refundCents)
    .map(expense => {
      const entered = coversBankRow(expense, refundCents);
      const merchant = sameMerchant(expense, txn, txnPlace);
      return { expense, merchant, tags: [entered && 'entered', merchant && 'merchant'].filter(Boolean) };
    })
    .filter(({ merchant, tags }) => all || merchant || tags.includes('entered'))
    .sort((a, b) => Number(b.tags.includes('entered')) - Number(a.tags.includes('entered'))
      || Number(b.merchant) - Number(a.merchant)
      || (a.expense.date < b.expense.date ? 1 : a.expense.date > b.expense.date ? -1 : 0)
      || b.expense.id - a.expense.id)
    .map(({ expense, tags }) => ({ ...expense, tags }));
}

/**
 * The amount to pre-fill for a deposit on one expense: the deposit, or what is left to reimburse when that is less
 * (an expense the user already entered by hand is left unchanged, so its amount is the deposit itself).
 * @returns {number} dollars
 */
function suggestedAmount(expense, depositCents) {
  if (enteredPoolCents(expense) >= depositCents && expense.tags?.includes('entered')) return depositCents / 100;
  return Math.min(depositCents, toCents(expense.amount)) / 100;
}

module.exports = {
  WINDOW_DAYS, chargedOf, enteredPoolCents, planApply, sharesName, sameMerchant, rankDeposit, rankRefund, suggestedAmount
};
