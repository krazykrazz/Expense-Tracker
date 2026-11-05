/**
 * Integration tests: plaidFileImportService -> plaidRepository / plaidInboxService -> real SQLite.
 * Covers importing a bank CSV export next to what Plaid already sent: preview, de-duplication, re-import,
 * pending charges completing, account checks and the activity log.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');
jest.mock('../config/plaid', () => ({
  ...jest.requireActual('../config/plaid'),
  getPlaidConfig: jest.fn(() => ({ environment: 'sandbox' }))
}));

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const plaidFileImportService = require('./plaidFileImportService');
const plaidInboxService = require('./plaidInboxService');

const DEBIT = 2;
const CREDIT_CARD = 4;
const CARD_HEADER = 'transaction_date,transaction_type,status,merchant,amount,currency,notes,category';
const CHEQUING_HEADER = 'transaction_date,transaction_time,account_number,account_type,transaction_type,transaction_sub_type,status,payee,payee_email,amount,currency,notes';
const cardCsv = (...lines) => [CARD_HEADER, ...lines].join('\n');

let db;
let cardAccountId;
let chequingAccountId;
let unmappedAccountId;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const stagePlaid = (transactionId, accountId, amount, date, extra = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, authorized_date, name, merchant_name, status, expense_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [transactionId, accountId, amount, date, extra.authorizedDate ?? date, extra.name || 'BANK ROW', extra.merchantName ?? 'Bank Merchant', extra.status || 'matched', extra.expenseId ?? null]
  );
const fileRows = () => all("SELECT transaction_id AS tid, amount, date, name, pending, status, expense_id AS expenseId FROM plaid_transactions WHERE transaction_id LIKE 'file:%' ORDER BY date, id");

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expenses');
  const itemId = await run("INSERT INTO plaid_items (item_id, institution_name, access_token_enc, environment) VALUES ('item-1', 'Test Bank', 'v1:x:y:z', 'sandbox')");
  cardAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-card', 'Visa', 'KL54', 'credit', ?)", [itemId, CREDIT_CARD]);
  chequingAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-chq', 'Chequing', '5678', 'depository', ?)", [itemId, DEBIT]);
  unmappedAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type) VALUES (?, 'acc-sav', 'Savings', '9999', 'depository')", [itemId]);
});

describe('plaidFileImportService', () => {
  test('previews without writing, skips history before Plaid\'s first date, and leaves what Plaid already sent', async () => {
    await stagePlaid('plaid-1', cardAccountId, 20, '2026-10-10');
    await stagePlaid('plaid-2', cardAccountId, 33.5, '2026-10-20');
    const csv = cardCsv(
      '2026-11-04,Purchase,Pending,Corner Cafe,-10.40,CAD,,',
      '2026-11-03,Purchase,Completed,Grocer,-44.57,CAD,,',
      '2026-10-21,Purchase,Completed,Hardware,-33.50,CAD,,',
      '2026-10-10,Purchase,Completed,Pharmacy,-20.00,CAD,,',
      '2026-09-15,Purchase,Completed,Old Store,-99.00,CAD,,'
    );

    const preview = await plaidFileImportService.importFile(cardAccountId, { csv, dryRun: true });

    expect(preview).toMatchObject({
      format: 'wealthsimple_credit_card', fromDate: '2026-10-10', defaultFromDate: '2026-10-10', dryRun: true,
      total: 5, beforeFrom: 1, alreadyFromBank: 2, added: 2, pendingAdded: 1, updated: 0, unchanged: 0
    });
    expect(await fileRows()).toEqual([]);
    expect(activityLogService.logEvent).not.toHaveBeenCalled();
  });

  test('stages new rows for review in the Inbox, tagged as from a file; importing again changes nothing', async () => {
    await stagePlaid('plaid-1', cardAccountId, 20, '2026-10-10');
    const csv = cardCsv(
      '2026-11-04,Purchase,Pending,Corner Cafe,-10.40,CAD,,',
      '2026-11-03,Purchase,Completed,Grocer,-44.57,CAD,,'
    );

    const imported = await plaidFileImportService.importFile(cardAccountId, { csv });
    const again = await plaidFileImportService.importFile(cardAccountId, { csv });

    expect(imported).toMatchObject({ added: 2, updated: 0 });
    expect(again).toMatchObject({ added: 0, updated: 0, unchanged: 2 });
    const { transactions } = await plaidInboxService.listInbox('new');
    expect(transactions.map(t => [t.place, t.amount, t.pending, t.source, t.paymentMethodId])).toEqual([
      ['Corner Cafe', 10.4, true, 'file', CREDIT_CARD],
      ['Grocer', 44.57, false, 'file', CREDIT_CARD]
    ]);
    expect(activityLogService.logEvent).toHaveBeenCalledTimes(1);
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'plaid_file_imported', 'plaid_transaction', null,
      'Imported Wealthsimple credit card file into Test Bank Visa: 2 new, 0 updated',
      expect.objectContaining({ added: 2, updated: 0, alreadyFromBank: 0 })
    );
  });

  test('a later export settles a pending charge already added as an expense', async () => {
    await plaidFileImportService.importFile(cardAccountId, { csv: cardCsv('2026-11-04,Purchase,Pending,Corner Cafe,-10.40,CAD,,'), fromDate: '2026-11-01' });
    const [row] = await all("SELECT id FROM plaid_transactions WHERE transaction_id LIKE 'file:%'");
    await plaidInboxService.addAsExpense(row.id, { type: 'Dining Out' });

    const result = await plaidFileImportService.importFile(cardAccountId, {
      csv: cardCsv('2026-11-04,Purchase,Completed,Corner Cafe,-10.40,CAD,,'), fromDate: '2026-11-01'
    });

    expect(result).toMatchObject({ updated: 1, settled: 1, added: 0 });
    const [settled] = await fileRows();
    expect(settled).toMatchObject({ pending: 0, status: 'added' });
    // A Wealthsimple export has one date per row, so there's no later posting date to record
    expect(await get('SELECT amount, posted_date AS postedDate FROM expenses WHERE id = ?', [settled.expenseId]))
      .toEqual({ amount: 10.4, postedDate: null });
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'plaid_transaction_updated', 'plaid_transaction', expect.any(Number),
      expect.stringContaining('settled'), expect.objectContaining({ action: 'settled' })
    );
  });

  test('reads chequing exports and checks the file belongs to the account', async () => {
    const csv = [
      CHEQUING_HEADER,
      '2026-11-04,09:10:39,12345678,Chequing,Withdrawal,E Transfer,Completed,A Friend,,-80.00,CAD,',
      '2026-11-03,17:00:00,12345678,Chequing,Deposit,Aft,Completed,Employer,,1500.00,CAD,'
    ].join('\n');

    const result = await plaidFileImportService.importFile(chequingAccountId, { csv, fromDate: '2026-11-01' });

    expect(result).toMatchObject({ format: 'wealthsimple_chequing', added: 2 });
    expect((await fileRows()).map(r => [r.name, r.amount])).toEqual([['Employer - Aft', -1500], ['A Friend - E Transfer', 80]]);
    await expect(plaidFileImportService.importFile(cardAccountId, { csv })).rejects
      .toMatchObject({ statusCode: 400, message: 'This is a Wealthsimple chequing file, but Visa is a credit card account.' });
  });

  test.each([
    ['the account is not mapped to a payment method', () => unmappedAccountId, cardCsv('2026-11-04,Purchase,Completed,X,-1.00,CAD,,'), 400, /Choose a payment method for Savings/],
    ['the account number does not match', () => chequingAccountId,
      [CHEQUING_HEADER, '2026-11-04,09:10:39,87654321,Chequing,Withdrawal,E Transfer,Completed,X,,-1.00,CAD,'].join('\n'), 400, 'This file is for ••4321, not Chequing ••5678.'],
    ['the from date is invalid', () => cardAccountId, cardCsv('2026-11-04,Purchase,Completed,X,-1.00,CAD,,'), 400, 'From date must be YYYY-MM-DD'],
    ['the account does not exist', () => 99999, cardCsv('2026-11-04,Purchase,Completed,X,-1.00,CAD,,'), 404, 'Bank account not found']
  ])('refuses when %s', async (_, accountId, csv, statusCode, message) => {
    const fromDate = /from date/i.test(String(message)) ? '04/11/2026' : undefined;
    await expect(plaidFileImportService.importFile(accountId(), { csv, fromDate })).rejects
      .toMatchObject({ statusCode, message: expect.stringMatching(message instanceof RegExp ? message : new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) });
  });

  test('refuses a bank connected in the other environment', async () => {
    await run("UPDATE plaid_items SET environment = 'production'");
    await expect(plaidFileImportService.importFile(cardAccountId, { csv: cardCsv('2026-11-04,Purchase,Completed,X,-1.00,CAD,,') }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
