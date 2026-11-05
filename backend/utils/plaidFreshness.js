/**
 * Bank data freshness at Plaid. Plaid normally fetches from a bank 1-4 times a day; when it hasn't had new
 * data from a bank for longer, its connection to that bank is stuck (our syncs still succeed, with nothing new).
 */
const STALE_AFTER_HOURS = 12;

/**
 * @param {string|null|undefined} bankUpdatedAt when Plaid last fetched from the bank (ISO 8601)
 * @param {number} [now]
 * @returns {boolean} false when unknown
 */
function isBankDataStale(bankUpdatedAt, now = Date.now()) {
  const updated = bankUpdatedAt ? Date.parse(bankUpdatedAt) : NaN;
  return !Number.isNaN(updated) && now - updated > STALE_AFTER_HOURS * 60 * 60 * 1000;
}

module.exports = { STALE_AFTER_HOURS, isBankDataStale };
