/**
 * Pure rules for a bank charge split across several expenses (spec 3.9): which unlinked expenses could be parts of
 * a charge, and which combination adds up to what is left. All money is compared in whole cents.
 */

const { toCents } = require('./money');

/** Most candidates searched for a combination (the closest ones by date), and the largest combination tried. */
const MAX_SEARCH_CANDIDATES = 20;
const MAX_PARTS = 4;

/** What was charged for an expense: its original cost when it has one, else its amount. */
const chargedCents = (expense) => toCents(expense.chargedAmount ?? expense.originalCost ?? expense.amount);

/**
 * Combinations of `minSize` to MAX_PARTS candidates whose charged amounts add up to `targetCents`.
 * @param {Array<{id: number, chargedAmount: number}>} candidates
 * @returns {Array<Array<number>>} expense ids of each combination (in candidate order)
 */
function combinationsAdding(candidates, targetCents, minSize = 1) {
  const items = candidates.slice(0, MAX_SEARCH_CANDIDATES).map(candidate => ({ id: candidate.id, cents: chargedCents(candidate) }));
  const found = [];
  const walk = (start, picked, sum) => {
    if (sum === targetCents && picked.length >= minSize) {
      found.push(picked.map(item => item.id));
      return;
    }
    if (picked.length === MAX_PARTS) return;
    for (let i = start; i < items.length; i++) {
      if (sum + items[i].cents > targetCents) continue;
      walk(i + 1, [...picked, items[i]], sum + items[i].cents);
    }
  };
  walk(0, [], 0);
  return found;
}

/**
 * The expenses to pre-select: the one combination that adds up exactly, or null when none does or several do
 * (the user decides).
 */
function suggestParts(candidates, targetCents, minSize = 1) {
  const found = combinationsAdding(candidates, targetCents, minSize);
  return found.length === 1 ? found[0] : null;
}

module.exports = { MAX_SEARCH_CANDIDATES, MAX_PARTS, chargedCents, combinationsAdding, suggestParts };
