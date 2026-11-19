/**
 * Split of a bank deposit across expenses, for the Inbox picker's pre-fill and preview. Mirrors the rules of
 * backend/utils/reimbursement.js (the server recomputes and validates on apply). Work in cents.
 */

export const toCents = (amount) => Math.round(Number(amount) * 100);

/**
 * Pre-filled amount per picked expense: the deposit goes to the expenses in order, each taking at most what it
 * cost out of pocket (the one entered by hand before takes its share as it is). Anything left over stays unassigned,
 * so the person sees that the amounts don't add up yet.
 * @param {number} depositCents
 * @param {Array<{expenseId: number, amount: number, alreadyEntered?: boolean}>} picked in the order they were picked
 * @returns {Object<number, number>} expenseId → amount (dollars)
 */
export function allocateDeposit(depositCents, picked) {
  const split = {};
  let left = depositCents;
  for (const candidate of picked) {
    const take = candidate.alreadyEntered ? left : Math.min(left, toCents(candidate.amount));
    split[candidate.expenseId] = take / 100;
    left -= take;
  }
  return split;
}

/**
 * What an expense becomes when a bank row repays `amount` on it.
 * @param {{amount: number}} candidate
 * @param {number} amount dollars
 * @param {boolean} alreadyEntered the reimbursement was entered by hand before: nothing changes
 * @returns {{outOfPocket: number, over: boolean, unchanged: boolean}}
 */
export function afterRepaying(candidate, amount, alreadyEntered = false) {
  if (alreadyEntered) return { outOfPocket: candidate.amount, over: false, unchanged: true };
  const left = toCents(candidate.amount) - toCents(amount);
  return { outOfPocket: Math.max(0, left) / 100, over: left < 0, unchanged: false };
}
