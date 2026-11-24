/**
 * Split of a bank deposit across expenses, for the Inbox picker's pre-fill and preview. Mirrors the rules of
 * backend/utils/reimbursement.js (the server recomputes and validates on apply). Work in cents.
 */

export const toCents = (amount) => Math.round(Number(amount) * 100);

/**
 * Pre-filled amount per picked expense: the deposit goes to the expenses in order, each taking at most what it
 * cost out of pocket (one counted against a reimbursement entered by hand, at most what is left of that). Anything
 * left over stays unassigned, so the person sees that the amounts don't add up yet.
 * @param {number} depositCents
 * @param {Array<{expenseId: number, amount: number, alreadyEntered?: boolean, enteredPool?: number}>} picked in the order they were picked
 * @returns {Object<number, number>} expenseId → amount (dollars)
 */
export function allocateDeposit(depositCents, picked) {
  const split = {};
  let left = depositCents;
  for (const candidate of picked) {
    const cap = candidate.alreadyEntered
      ? (candidate.enteredPool == null ? left : toCents(candidate.enteredPool))
      : toCents(candidate.amount);
    const take = Math.min(left, cap);
    split[candidate.expenseId] = take / 100;
    left -= take;
  }
  return split;
}

/**
 * What an expense becomes when a bank row repays `amount` on it.
 * @param {{amount: number, enteredPool?: number}} candidate
 * @param {number} amount dollars
 * @param {boolean} alreadyEntered counted against a reimbursement entered by hand: nothing changes, up to what is left of it
 * @returns {{outOfPocket: number, over: boolean, unchanged: boolean}}
 */
export function afterRepaying(candidate, amount, alreadyEntered = false) {
  if (alreadyEntered) {
    const over = candidate.enteredPool != null && toCents(amount) > toCents(candidate.enteredPool);
    return { outOfPocket: candidate.amount, over, unchanged: true };
  }
  const left = toCents(candidate.amount) - toCents(amount);
  return { outOfPocket: Math.max(0, left) / 100, over: left < 0, unchanged: false };
}
