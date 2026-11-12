/**
 * Split of an insurance deposit across claims, for the Inbox picker's pre-fill and preview. Mirrors
 * backend/utils/insuranceReimbursement.js (the server recomputes and validates on apply). Work in cents.
 */

export const toCents = (amount) => Math.round(Number(amount) * 100);
export const fromCents = (cents) => cents / 100;

/**
 * Share `totalCents` in proportion to `weights` (cents to the largest remainders), so the parts add up exactly.
 * @param {number} totalCents
 * @param {number[]} weights non-negative
 * @returns {number[]} cents per weight
 */
export function proportionalCents(totalCents, weights) {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  // All-zero weights split evenly
  const effective = weightSum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = weightSum > 0 ? weightSum : weights.length;
  const parts = effective.map(w => Math.floor((totalCents * w) / effectiveSum));
  let left = totalCents - parts.reduce((sum, p) => sum + p, 0);
  // Integer remainders, so ties are exact (larger weight, then earlier, first), as on the server
  const order = effective
    .map((w, i) => ({ i, w, remainder: (totalCents * w) % effectiveSum }))
    .sort((a, b) => b.remainder - a.remainder || b.w - a.w || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i] += 1;
  return parts;
}

/**
 * Pre-filled reimbursement per picked claim: the deposit for one claim; each claim's expected payout when those add
 * up to the deposit; else the deposit split in proportion to the original costs.
 * @param {number} depositCents
 * @param {Array<{expenseId: number, expectedPayout: number, originalCost: number}>} picked
 * @returns {Object<number, number>} expenseId → amount (dollars)
 */
export function prefillSplit(depositCents, picked) {
  if (picked.length === 0) return {};
  if (picked.length === 1) return { [picked[0].expenseId]: fromCents(depositCents) };
  const payouts = picked.map(claim => toCents(claim.expectedPayout));
  const parts = payouts.every(cents => cents > 0) && payouts.reduce((sum, c) => sum + c, 0) === depositCents
    ? payouts
    : proportionalCents(depositCents, picked.map(claim => toCents(claim.originalCost)));
  return Object.fromEntries(picked.map((claim, i) => [claim.expenseId, fromCents(parts[i])]));
}

/**
 * What a claim looks like after `amount` more is reimbursed: out-of-pocket = original cost − everything reimbursed
 * (`unreimbursed` from the server is what is still open: it already leaves out what earlier deposits paid, and for
 * a claim marked Paid by hand, what was reimbursed outside the bank); each person's out-of-pocket = their original
 * amount − their share of that total, as backend/utils/insuranceReimbursement.peopleAfter computes it.
 * @param {{originalCost: number, unreimbursed?: number, reimbursed?: number,
 *   people?: Array<{personId: number, name: string, originalAmount: (number|null), amount: number}>}} claim
 * @param {number} amount this deposit's reimbursement (dollars)
 * @returns {{outOfPocket: number, people: Array<{personId: number, name: string, amount: number}>, over: boolean}}
 */
export function claimAfter(claim, amount) {
  const originalCents = toCents(claim.originalCost);
  const openCents = claim.unreimbursed != null
    ? toCents(claim.unreimbursed)
    : originalCents - toCents(claim.reimbursed || 0);
  const amountCents = toCents(amount || 0);
  const totalCents = originalCents - openCents + amountCents;

  const people = claim.people || [];
  const bases = people.map(person => Math.max(0, toCents(person.originalAmount ?? person.amount)));
  const baseSum = bases.reduce((sum, b) => sum + b, 0);
  // People whose original amounts don't add up to the claim's get the part of the reimbursement they cover
  let distributed = originalCents > 0 && originalCents !== baseSum ? Math.round((totalCents * baseSum) / originalCents) : totalCents;
  distributed = Math.min(Math.max(0, distributed), baseSum);
  const shares = people.length > 0 ? proportionalCents(distributed, bases) : [];
  return {
    outOfPocket: fromCents(Math.max(0, originalCents - totalCents)),
    over: amountCents > openCents,
    people: people.map((person, i) => ({ personId: person.personId, name: person.name, amount: fromCents(bases[i] - shares[i]) }))
  };
}
