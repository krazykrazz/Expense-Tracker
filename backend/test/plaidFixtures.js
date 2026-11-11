/**
 * Shared fixtures for the Plaid (bank import) tests: promise wrappers for SQL against an isolated test
 * database, a connected-bank seed row, and Plaid API response builders for a mocked client.
 *
 * Each test file keeps its own `stage()` (insert a bank transaction): the files stage different columns
 * with different defaults, and a local helper keeps each test's data readable.
 */

/**
 * Promise wrappers around a sqlite3 connection. `getDb` is called per statement, since test files assign
 * their database in beforeAll.
 * @param {() => import('sqlite3').Database} getDb
 * @returns {{ run: (sql: string, params?: any[]) => Promise<number>, get: Function, all: Function }}
 *   `run` resolves to the inserted row id
 */
function sqlHelpers(getDb) {
  return {
    run: (sql, params = []) => new Promise((resolve, reject) => {
      getDb().run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
    }),
    get: (sql, params = []) => new Promise((resolve, reject) => {
      getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    }),
    all: (sql, params = []) => new Promise((resolve, reject) => {
      getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    })
  };
}

/**
 * Insert a connected bank (plaid_items row) with a placeholder encrypted token.
 * @returns {Promise<number>} the plaid_items id
 */
function insertItem(run, { itemId = 'item-1', institutionName = 'Test Bank', environment = 'sandbox' } = {}) {
  return run(
    "INSERT INTO plaid_items (item_id, institution_name, access_token_enc, environment) VALUES (?, ?, 'v1:x:y:z', ?)",
    [itemId, institutionName, environment]
  );
}

/** A Plaid account as /accounts/get and /transactions/sync return it. */
const account = (id, extra = {}) => ({ account_id: id, name: `Account ${id}`, mask: '1234', type: 'depository', subtype: 'checking', ...extra });

/** A Plaid transaction (settled, on 'acc-1') as /transactions/sync returns it. */
const txn = (id, extra = {}) => ({
  transaction_id: id, account_id: 'acc-1', amount: 12.34, iso_currency_code: 'CAD',
  date: '2026-10-10', authorized_date: '2026-10-09', name: `RAW ${id}`, merchant_name: `Merchant ${id}`, pending: false, ...extra
});

/** One /transactions/sync response. */
const page = ({ added = [], modified = [], removed = [], next_cursor = 'c1', has_more = false, accounts = [account('acc-1')] } = {}) => ({
  data: { added, modified, removed, next_cursor, has_more, accounts, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' }
});

/** A rejected Plaid API call, shaped like the client's axios error. */
const plaidError = (code, message = code) =>
  Object.assign(new Error('Request failed'), { response: { data: { error_code: code, error_message: message } } });

module.exports = { sqlHelpers, insertItem, account, txn, page, plaidError };
