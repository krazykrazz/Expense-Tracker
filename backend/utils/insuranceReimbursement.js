/**
 * Pure helpers for applying an insurer's bank deposit to insurance claims (Import Inbox, spec 3.7). Money is
 * handled in whole cents and returned in dollars rounded to the cent.
 *
 * A claim here: { expenseId, date, claimStatus, originalCost, outOfPocket, reimbursed } where `reimbursed` is
 * what bank deposits already paid it.
 */

const { toCents } = require('./money');

/** At most this many claims are tried for a combination adding up to the deposit (2^12 subsets). */
const MAX_COMBINATION_CLAIMS = 12;

const OPEN_STATUSES = ['in_progress', 'not_claimed'];
const STATUS_ORDER = { in_progress: 0, not_claimed: 1, paid: 2 };

const fromCents = (cents) => cents / 100;

/** The original cost of a claim, falling back to its amount when none was recorded. */
const originalOf = (claim) => claim.originalCost ?? claim.outOfPocket;

/**
 * What the insurer is expected to pay: original cost − out-of-pocket − already reimbursed for an open claim (the
 * owner's estimate entered with the claim), and for a claim marked Paid by hand before any bank deposit (marked
 * ahead of the payout: its main payout is still to come); the out-of-pocket amount for a Paid claim a deposit
 * already paid (a second plan paying the co-pay). Never below $0.
 * @returns {number} dollars
 */
function expectedPayout(claim) {
  const secondPlan = claim.claimStatus === 'paid' && (claim.linkCount || 0) > 0;
  const cents = secondPlan
    ? toCents(claim.outOfPocket)
    : toCents(originalOf(claim)) - toCents(claim.outOfPocket) - toCents(claim.reimbursed || 0);
  return fromCents(Math.max(0, cents));
}

/** A claim marked Paid by hand with no bank deposit yet: its first deposit is either the payout or a second plan. */
const paidWithoutBank = (claim) => claim.claimStatus === 'paid' && !((claim.linkCount || 0) > 0);

/**
 * What a claim marked Paid by hand had been reimbursed outside the bank, decided by its first deposit: a deposit
 * up to its co-pay (and not exactly the expected payout) is a second plan paying the co-pay, so the payout came
 * outside the bank (original − co-pay); any other deposit is the payout itself (nothing outside the bank).
 * @param {{originalCost: (number|null), outOfPocket: number}} claim
 * @param {number} amount the first deposit's reimbursement (dollars)
 * @returns {number} dollars
 */
function outsideBankForFirstDeposit(claim, amount) {
  const original = toCents(originalOf(claim));
  const coPay = toCents(claim.outOfPocket);
  const cents = toCents(amount);
  const secondPlan = cents <= coPay && cents !== original - coPay;
  return fromCents(secondPlan ? Math.max(0, original - coPay) : 0);
}

/** In progress before Not claimed before Paid, oldest first. */
const baseOrder = (a, b) =>
  (STATUS_ORDER[a.claimStatus] ?? 3) - (STATUS_ORDER[b.claimStatus] ?? 3)
  || String(a.date).localeCompare(String(b.date))
  || a.expenseId - b.expenseId;

/** The single subset of `items` (by index) whose cents add up to `target`, or null when none or several do. */
function uniqueCombination(cents, target) {
  let match = null;
  for (let mask = 1; mask < (1 << cents.length); mask++) {
    let sum = 0;
    for (let i = 0; i < cents.length; i++) {
      if (mask & (1 << i)) sum += cents[i];
    }
    if (sum !== target) continue;
    if (match !== null) return null;
    match = mask;
  }
  return match;
}

/**
 * Claims ordered for the picker, each with `expectedPayout` and `rank`:
 * - 'exact': its expected payout equals the deposit;
 * - 'combination': part of the only combination of open claims (at most 12 with a payout) whose expected
 *   payouts add up to the deposit, when no single claim matches;
 * - null: the rest, In progress before Not claimed (Paid last), oldest first.
 * @param {number} deposit the deposit amount (positive dollars)
 * @param {Array<object>} claims
 * @returns {Array<object>} new objects; the input is not changed
 */
function rankClaims(deposit, claims) {
  const target = toCents(Math.abs(deposit));
  const ranked = claims.map(claim => ({ ...claim, expectedPayout: expectedPayout(claim), rank: null })).sort(baseOrder);

  for (const claim of ranked) {
    // A claim marked Paid by hand also fits a second plan paying its co-pay
    const coPayFits = paidWithoutBank(claim) && toCents(claim.outOfPocket) === target;
    if (target > 0 && (toCents(claim.expectedPayout) === target || coPayFits)) claim.rank = 'exact';
  }
  if (!ranked.some(claim => claim.rank === 'exact')) {
    const pool = ranked.filter(claim => OPEN_STATUSES.includes(claim.claimStatus) && toCents(claim.expectedPayout) > 0);
    if (pool.length >= 2 && pool.length <= MAX_COMBINATION_CLAIMS) {
      const mask = uniqueCombination(pool.map(claim => toCents(claim.expectedPayout)), target);
      if (mask !== null) {
        pool.forEach((claim, i) => {
          if (mask & (1 << i)) claim.rank = 'combination';
        });
      }
    }
  }

  const rankOrder = (claim) => (claim.rank === 'exact' ? 0 : claim.rank === 'combination' ? 1 : 2);
  return ranked
    .map((claim, index) => ({ claim, index }))
    .sort((a, b) => rankOrder(a.claim) - rankOrder(b.claim) || a.index - b.index)
    .map(({ claim }) => claim);
}

/**
 * Distribute `totalCents` over `weights` (cents) in proportion, largest remainder first (ties: larger weight,
 * then earlier), so the parts add up to `totalCents` exactly. All-zero weights split evenly.
 * @returns {number[]} cents
 */
function proportionalCents(totalCents, weights) {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const effective = weightSum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = weightSum > 0 ? weightSum : weights.length;
  const parts = effective.map(w => Math.floor((totalCents * w) / effectiveSum));
  let left = totalCents - parts.reduce((sum, p) => sum + p, 0);
  const order = effective
    .map((w, i) => ({ i, w, remainder: (totalCents * w) % effectiveSum }))
    .sort((a, b) => b.remainder - a.remainder || b.w - a.w || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) {
    parts[order[k].i] += 1;
  }
  return parts;
}

/**
 * Amounts pre-filled for the picked claims: the whole deposit for one claim; each claim's expected payout when
 * they add up to the deposit; otherwise the deposit split in proportion to the original costs (leftover cents
 * to the largest). Always adds up to the deposit to the cent.
 * @param {number} deposit positive dollars
 * @param {Array<object>} picked claims
 * @returns {Array<{expenseId: number, amount: number}>}
 */
function prefillSplit(deposit, picked) {
  const target = toCents(Math.abs(deposit));
  if (picked.length === 0) return [];
  if (picked.length === 1) return [{ expenseId: picked[0].expenseId, amount: fromCents(target) }];

  const payouts = picked.map(claim => toCents(claim.expectedPayout ?? expectedPayout(claim)));
  if (payouts.reduce((sum, p) => sum + p, 0) === target) {
    return picked.map((claim, i) => ({ expenseId: claim.expenseId, amount: fromCents(payouts[i]) }));
  }
  const parts = proportionalCents(target, picked.map(claim => Math.max(0, toCents(originalOf(claim)))));
  return picked.map((claim, i) => ({ expenseId: claim.expenseId, amount: fromCents(parts[i]) }));
}

/** A claim's out-of-pocket once `totalReimbursed` came back from the bank (never below $0). */
function outOfPocketAfter(originalCost, totalReimbursed) {
  return fromCents(Math.max(0, toCents(originalCost) - toCents(totalReimbursed)));
}

/**
 * Where a claim stood before any bank deposit: from its earliest link's snapshot when it has links, else its
 * current state. `outsideBank` is what was reimbursed outside the bank: decided by the first deposit and stored
 * on its link (see outsideBankForFirstDeposit); older links without it derive it (a claim already Paid then:
 * original − out-of-pocket). Before any deposit nothing counts as reimbursed, so a claim marked Paid by hand may
 * still take up to its whole original cost (its first deposit decides which case it is).
 * @param {{originalCost: (number|null), outOfPocket: number, claimStatus: (string|null), reimbursed: number,
 *   linkCount?: number, firstPreviousAmount?: number, firstPreviousStatus?: (string|null), firstOutsideBank?: (number|null)}} claim
 * @returns {{beforeAmount: number, beforeStatus: (string|null), original: number, outsideBank: number, unreimbursed: number}}
 *   dollars; `unreimbursed` is what the bank may still pay (original − outside the bank − bank so far)
 */
function claimBaseline(claim) {
  const linked = (claim.linkCount || 0) > 0;
  const beforeAmount = linked ? claim.firstPreviousAmount : claim.outOfPocket;
  const beforeStatus = linked ? claim.firstPreviousStatus : claim.claimStatus;
  const original = claim.originalCost ?? beforeAmount;
  let outsideBank = 0;
  if (linked) {
    outsideBank = claim.firstOutsideBank != null
      ? toCents(claim.firstOutsideBank)
      : (beforeStatus === 'paid' ? Math.max(0, toCents(original) - toCents(beforeAmount)) : 0);
  }
  return {
    beforeAmount,
    beforeStatus,
    original,
    outsideBank: fromCents(outsideBank),
    unreimbursed: fromCents(toCents(original) - outsideBank - toCents(claim.reimbursed || 0))
  };
}

/**
 * Each person's out-of-pocket once the claim got `totalReimbursed` back: their original amount minus their share
 * of it, shares in proportion to the original amounts (largest remainder, so they add up exactly). People with
 * no original amount use their amount. When the people's original amounts don't add up to the claim's original
 * cost, they get the part of the reimbursement their total covers. A share never exceeds the person's original.
 * @param {Array<{personId: number, originalAmount: (number|null), amount: number}>} people
 * @param {number} originalCost the claim's original cost
 * @param {number} totalReimbursed everything the bank reimbursed the claim
 * @returns {Array<{personId: number, amount: number, reimbursed: number}>} in the input order
 */
function peopleAfter(people, originalCost, totalReimbursed) {
  const bases = people.map(person => Math.max(0, toCents(person.originalAmount ?? person.amount)));
  const baseSum = bases.reduce((sum, b) => sum + b, 0);
  const originalCents = toCents(originalCost);
  let distributed = toCents(totalReimbursed);
  if (originalCents > 0 && originalCents !== baseSum) {
    distributed = Math.round((distributed * baseSum) / originalCents);
  }
  distributed = Math.min(Math.max(0, distributed), baseSum);
  const shares = proportionalCents(distributed, bases);
  return people.map((person, i) => ({
    personId: person.personId,
    amount: fromCents(bases[i] - shares[i]),
    reimbursed: fromCents(shares[i])
  }));
}

module.exports = {
  MAX_COMBINATION_CLAIMS,
  OPEN_STATUSES,
  expectedPayout,
  paidWithoutBank,
  outsideBankForFirstDeposit,
  rankClaims,
  prefillSplit,
  outOfPocketAfter,
  claimBaseline,
  peopleAfter,
  proportionalCents
};
