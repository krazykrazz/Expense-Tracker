/**
 * Pure arithmetic of the credit card balance check (plaidCardBalanceService): what the bank says is owed,
 * pairing bank rows with tracker entries, and which pending charges a balance shows have posted. No database access.
 */
const { round2, toCents: cents } = require('./money');

/** Bank and tracker items on either side within this many days, same amount, are the same transaction. */
const PAIR_DAYS = 5;

const dayNumber = (dateStr) => Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10)) / 86400000;

/**
 * What the bank says is owed on one card account.
 * - `limit − available` when the bank sends both: includes pending charges (CIBC).
 * - otherwise `current`, which may leave out pending charges (Wealthsimple).
 */
function bankOwed(account) {
  if (account.currentBalance == null && account.availableBalance == null) return null;
  if (account.creditLimit != null && account.availableBalance != null) {
    return { owed: round2(account.creditLimit - account.availableBalance), includesPending: true };
  }
  if (account.currentBalance == null) return null;
  return { owed: round2(account.currentBalance), includesPending: false };
}

/**
 * Pair bank rows with tracker entries for the same money (signed effect on the balance equal to the cent,
 * dates within PAIR_DAYS), then one tracker entry with two bank rows that add up to it. Paired items cancel
 * out; what's left explains the difference.
 * @returns {{bankOnly: Array, trackerOnly: Array, pairs: Array<{bank: object, tracker: object}>,
 *   splits: Array<{bank: object[], tracker: object}>}}
 */
function pairUp(bankItems, trackerItems) {
  const unusedTracker = [...trackerItems];
  const bankOnly = [];
  const pairs = [];
  for (const bank of bankItems) {
    let best = -1;
    let bestGap = Infinity;
    unusedTracker.forEach((tracker, index) => {
      if (cents(tracker.effect) !== cents(bank.effect)) return;
      const gap = Math.abs(dayNumber(tracker.date) - dayNumber(bank.date));
      if (gap <= PAIR_DAYS && gap < bestGap) {
        best = index;
        bestGap = gap;
      }
    });
    if (best === -1) {
      bankOnly.push(bank);
    } else {
      pairs.push({ bank, tracker: unusedTracker[best] });
      unusedTracker.splice(best, 1);
    }
  }

  // One order charged in two parts (Amazon ships separately): two bank rows adding up to one tracker entry
  const splits = [];
  for (let t = unusedTracker.length - 1; t >= 0; t--) {
    const tracker = unusedTracker[t];
    const near = bankOnly.filter(bank => Math.abs(dayNumber(bank.date) - dayNumber(tracker.date)) <= PAIR_DAYS);
    let found = null;
    for (let i = 0; i < near.length && !found; i++) {
      for (let j = i + 1; j < near.length && !found; j++) {
        if (cents(near[i].effect) + cents(near[j].effect) === cents(tracker.effect)) found = [near[i], near[j]];
      }
    }
    if (found) {
      splits.push({ bank: found, tracker });
      unusedTracker.splice(t, 1);
      for (const bank of found) bankOnly.splice(bankOnly.indexOf(bank), 1);
    }
  }
  return { bankOnly, trackerOnly: unusedTracker, pairs, splits };
}

/** Most pending charges considered at once (subsets are enumerated). */
const MAX_SETTLING_ROWS = 12;
/** How far back a charge Plaid sent as posted may still be pending at a bank that doesn't say (Wealthsimple). */
const LIKELY_PENDING_DAYS = 7;

/**
 * The one choice of items whose effects add up to `target` cents, as a bit mask; null when none or several fit.
 */
function uniqueSubset(items, target) {
  let match = null;
  for (let mask = 0; mask < (1 << items.length); mask++) {
    let sum = 0;
    for (let i = 0; i < items.length; i++) {
      if (mask & (1 << i)) sum += cents(items[i].effect);
    }
    if (sum !== target) continue;
    if (match !== null) return null;
    match = mask;
  }
  return match;
}

/**
 * Which charges kept pending ("settling") the bank's balance shows have posted, for a bank whose balance
 * leaves pending charges out and that doesn't tell Plaid which charges are pending (Wealthsimple). The
 * difference must be explained to the cent by exactly one choice of charges still pending; everything else
 * is then in the bank's balance, i.e. posted. Anything less certain (several choices fit, or none: a tip or
 * fee changed the total) settles nothing. `likely_pending` causes are guesses made from the same difference,
 * so they don't count here.
 * @param {{difference: number, causes: Array<{type: string, effect: number}>}} card
 * @returns {Array<object>} the settling causes that posted (empty when unsure)
 */
function postedFromBalance(card) {
  const settling = card.causes.filter(cause => cause.type === 'settling');
  if (settling.length === 0 || settling.length > MAX_SETTLING_ROWS) return [];
  const otherEffects = card.causes.filter(cause => cause.type !== 'settling' && cause.type !== 'likely_pending')
    .reduce((sum, cause) => sum + cents(cause.effect), 0);
  const match = uniqueSubset(settling, cents(card.difference) - otherEffects);
  if (match === null) return [];
  return settling.filter((_, i) => !(match & (1 << i)));
}

module.exports = {
  PAIR_DAYS, dayNumber, bankOwed, pairUp, MAX_SETTLING_ROWS, LIKELY_PENDING_DAYS, uniqueSubset, postedFromBalance
};
