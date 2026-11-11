/**
 * Shared by plaidService (connections) and plaidSyncService (transaction sync): the Plaid client, error codes
 * and how they map to a connection's status and to service errors.
 */
const plaidConfig = require('../config/plaid');
const { isBankDataStale } = require('../utils/plaidFreshness');
const { fail } = require('../utils/httpError');

const GONE_ITEM_CODES = new Set(['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN']);
/** Errors the user fixes by logging in to the bank again (Reconnect, Plaid update mode). */
const LOGIN_CODES = new Set(['ITEM_LOGIN_REQUIRED', 'INVALID_CREDENTIALS', 'INVALID_MFA', 'USER_SETUP_REQUIRED', 'PENDING_DISCONNECT']);
/** Errors only the user can fix (log in again, or the connection is gone): automatic sync skips these banks. */
const NEEDS_USER_CODES = new Set([...LOGIN_CODES, ...GONE_ITEM_CODES]);

/**
 * A bank connection's health, from its last sync error and when Plaid last fetched from the bank:
 * 'ok', 'needs_login' (Reconnect fixes it without a new Trial connection), 'gone' (removed at the bank or
 * token rejected: disconnect), 'error' (anything else; usually temporary, retried automatically), or 'stale'
 * (our syncs work, but Plaid has had no new data from the bank for STALE_AFTER_HOURS; nothing to do but wait).
 * @param {{lastError: (string|null), bankUpdatedAt?: (string|null)}} item
 * @param {number} [now]
 */
function connectionStatus(item, now = Date.now()) {
  if (item.lastError) {
    if (LOGIN_CODES.has(item.lastError)) return 'needs_login';
    if (GONE_ITEM_CODES.has(item.lastError)) return 'gone';
    return 'error';
  }
  return isBankDataStale(item.bankUpdatedAt, now) ? 'stale' : 'ok';
}

/** Plaid API errors arrive as axios errors; never log the raw error (its config carries the secret). */
function plaidErrorOf(err) {
  const data = err && err.response && err.response.data;
  return data && data.error_code ? data : null;
}

function toServiceError(err, action) {
  const plaidError = plaidErrorOf(err);
  if (!plaidError) return err;
  let message = `Plaid ${action} failed: ${plaidError.error_message || plaidError.error_code}`;
  if (LOGIN_CODES.has(plaidError.error_code)) {
    // Never suggest disconnecting: reconnecting from scratch uses a new Trial connection and duplicates history
    message = 'The bank needs you to log in again. Use Reconnect on the Connections tab (no new Trial connection is used).';
  }
  return fail(message, 502, { plaidErrorCode: plaidError.error_code });
}

const plaidClient = () => plaidConfig.getPlaidClient();

module.exports = {
  GONE_ITEM_CODES, LOGIN_CODES, NEEDS_USER_CODES, connectionStatus, plaidErrorOf, toServiceError, plaidClient
};
