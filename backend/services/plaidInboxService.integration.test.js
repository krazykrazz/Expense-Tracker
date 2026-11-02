/**
 * Integration tests: plaidInboxService -> plaidRepository / expenseService -> real SQLite.
 * Covers the review workflow (add / match / ignore) and the expense list's bank link.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const plaidInboxService = require('./plaidInboxService');
const expenseService = require('./expenseService');

const DEBIT = 2;
const CREDIT_CARD = 4;

let db;
let debitAccountId;
let cardAccountId;
let unmappedAccountId;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const stage = (transactionId, { accountId = debitAccountId, amount = 25.5, date = '2026-10-12', authorizedDate = '2026-10-10', name = 'SQ *COFFEE SHOP', merchantName = 'Coffee Shop' } = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name)
     VALUES (?, ?, ?, 'CAD', ?, ?, ?, ?)`,
    [transactionId, accountId, amount, date, authorizedDate, name, merchantName]
  );

const addExpense = ({ date = '2026-10-10', amount = 25.5, place = 'Coffee', type = 'Dining Out', paymentMethodId = DEBIT, method = 'Debit' } = {}) =>
  run('INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) VALUES (?, ?, ?, ?, 2, ?, ?)', [date, place, amount, type, method, paymentMethodId]);

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
  debitAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'acc-debit', 'Chequing', ?)", [itemId, DEBIT]);
  cardAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'acc-card', 'Visa', ?)", [itemId, CREDIT_CARD]);
  unmappedAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name) VALUES (?, 'acc-savings', 'Savings')", [itemId]);
});

describe('plaidInboxService', () => {
  describe('listInbox', () => {
    test('lists mapped accounts only, newest first, and counts hidden unmapped rows', async () => {
      await stage('older', { authorizedDate: '2026-10-01', date: '2026-10-02' });
      await stage('newer', { authorizedDate: '2026-10-05', date: '2026-10-06' });
      await stage('hidden', { accountId: unmappedAccountId });

      const { transactions, hiddenUnmapped } = await plaidInboxService.listInbox('new');

      expect(transactions.map(t => t.transactionId)).toEqual(['newer', 'older']);
      expect(transactions[0]).toMatchObject({
        date: '2026-10-05', postedDate: '2026-10-06', place: 'Coffee Shop', rawName: 'SQ *COFFEE SHOP',
        paymentMethodId: DEBIT, paymentMethodName: 'Debit', canAdd: true
      });
      expect(hiddenUnmapped).toBe(1);
    });

    test('suggests a category from the place history', async () => {
      await addExpense({ place: 'Coffee Shop', type: 'Dining Out', date: '2025-01-01', amount: 4 });
      await stage('t1');

      const { transactions } = await plaidInboxService.listInbox('new');

      expect(transactions[0].suggestedCategory).toBe('Dining Out');
    });

    test('offers unlinked expenses with the same method, cents and a nearby date as match candidates', async () => {
      const close = await addExpense({ date: '2026-10-11' });
      const exact = await addExpense({ date: '2026-10-10' });
      await addExpense({ date: '2026-10-20' });                                   // too far
      await addExpense({ amount: 25.51 });                                         // different cents
      await addExpense({ paymentMethodId: CREDIT_CARD, method: 'Credit Card' });   // different method
      const linked = await addExpense();
      await stage('linked-elsewhere');
      await run("UPDATE plaid_transactions SET status = 'matched', expense_id = ? WHERE transaction_id = 'linked-elsewhere'", [linked]);
      await stage('t1');

      const { transactions } = await plaidInboxService.listInbox('new');

      expect(transactions[0].matchCandidates.map(c => c.id)).toEqual([exact, close]);
    });

    test('refunds are listed but cannot be added', async () => {
      await stage('refund', { amount: -10 });
      const { transactions } = await plaidInboxService.listInbox('new');
      expect(transactions[0]).toMatchObject({ canAdd: false, matchCandidates: [] });
    });

    test('rejects unknown statuses', async () => {
      await expect(plaidInboxService.listInbox('added')).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('addAsExpense', () => {
    test('creates exactly one expense from the bank transaction and links it', async () => {
      const id = await stage('t1');

      const { transaction, expense } = await plaidInboxService.addAsExpense(id, { type: 'Dining Out', notes: ' latte ' }, 'tab-1');

      expect(expense).toMatchObject({ date: '2026-10-10', place: 'Coffee Shop', amount: 25.5, type: 'Dining Out', payment_method_id: DEBIT, notes: 'latte', posted_date: null });
      expect(transaction).toMatchObject({ status: 'added', expenseId: expense.id });
      expect((await get('SELECT COUNT(*) AS n FROM expenses')).n).toBe(1);
      expect(activityLogService.logEvent).toHaveBeenCalledWith('expense_added', 'expense', expense.id, expect.any(String), expect.objectContaining({ tabId: 'tab-1' }));

      await expect(plaidInboxService.addAsExpense(id, { type: 'Dining Out' })).rejects.toMatchObject({ statusCode: 409 });
      expect((await get('SELECT COUNT(*) AS n FROM expenses')).n).toBe(1);
    });

    test('keeps the bank posting date on credit card expenses and honours edits', async () => {
      const id = await stage('t1', { accountId: cardAccountId });

      const { expense } = await plaidInboxService.addAsExpense(id, { type: 'Groceries', place: ' Corner Store ', date: '2026-10-09' });

      expect(expense).toMatchObject({ date: '2026-10-09', posted_date: '2026-10-12', place: 'Corner Store', payment_method_id: CREDIT_CARD });
    });

    test.each([
      ['a refund', { amount: -10 }, { type: 'Other' }, 400],
      ['a missing category', {}, {}, 400],
      ['an invalid category', {}, { type: 'Nope' }, 400],
    ])('rejects %s', async (_label, stageOptions, input, statusCode) => {
      const id = await stage('t1', stageOptions);
      await expect(plaidInboxService.addAsExpense(id, input)).rejects.toMatchObject({ statusCode });
      expect((await get('SELECT status FROM plaid_transactions WHERE id = ?', [id])).status).toBe('new');
    });

    test('requires a mapped account', async () => {
      const id = await stage('t1', { accountId: unmappedAccountId });
      await expect(plaidInboxService.addAsExpense(id, { type: 'Other' })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('matchToExpense', () => {
    test('links to an existing expense without creating or changing anything', async () => {
      const expenseId = await addExpense({ place: 'Coffee', amount: 25.5 });
      const id = await stage('t1');

      const { transaction } = await plaidInboxService.matchToExpense(id, expenseId);

      expect(transaction).toMatchObject({ status: 'matched', expenseId });
      expect(await get('SELECT place, amount FROM expenses WHERE id = ?', [expenseId])).toEqual({ place: 'Coffee', amount: 25.5 });
      expect((await get('SELECT COUNT(*) AS n FROM expenses')).n).toBe(1);
    });

    test('an expense can be linked to only one bank transaction', async () => {
      const expenseId = await addExpense();
      const first = await stage('t1');
      const second = await stage('t2');
      await plaidInboxService.matchToExpense(first, expenseId);

      await expect(plaidInboxService.matchToExpense(second, expenseId)).rejects.toMatchObject({ statusCode: 409 });
      expect((await get('SELECT status FROM plaid_transactions WHERE id = ?', [second])).status).toBe('new');
    });

    test('rejects expenses on another payment method or that do not exist', async () => {
      const cardExpense = await addExpense({ paymentMethodId: CREDIT_CARD, method: 'Credit Card' });
      const id = await stage('t1');

      await expect(plaidInboxService.matchToExpense(id, cardExpense)).rejects.toMatchObject({ statusCode: 400 });
      await expect(plaidInboxService.matchToExpense(id, 99999)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('ignore / unignore', () => {
    test('round-trips between the inbox and the ignored list', async () => {
      const id = await stage('t1');

      await plaidInboxService.ignore(id);
      expect((await plaidInboxService.listInbox('new')).transactions).toHaveLength(0);
      expect((await plaidInboxService.listInbox('ignored')).transactions.map(t => t.id)).toEqual([id]);

      await plaidInboxService.unignore(id);
      expect((await plaidInboxService.listInbox('new')).transactions.map(t => t.id)).toEqual([id]);
    });

    test('only new rows can be ignored and only ignored rows restored', async () => {
      const expenseId = await addExpense();
      const id = await stage('t1');
      await plaidInboxService.matchToExpense(id, expenseId);

      await expect(plaidInboxService.ignore(id)).rejects.toMatchObject({ statusCode: 409 });
      await expect(plaidInboxService.unignore(id)).rejects.toMatchObject({ statusCode: 409 });
      await expect(plaidInboxService.ignore(99999)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('expense list bankLink', () => {
    test('deleting a linked expense puts its bank transaction back in the inbox', async () => {
      const matched = await addExpense();
      const matchedTxn = await stage('t-matched');
      await plaidInboxService.matchToExpense(matchedTxn, matched);
      const addedTxn = await stage('t-added', { name: 'OTHER', merchantName: 'Other Shop', amount: 9 });
      const { expense: added } = await plaidInboxService.addAsExpense(addedTxn, { type: 'Other' });
      expect((await plaidInboxService.listInbox('new')).transactions).toHaveLength(0);

      await run('DELETE FROM expenses WHERE id IN (?, ?)', [matched, added.id]);

      const rows = (await plaidInboxService.listInbox('new')).transactions;
      expect(rows.map(t => t.transactionId).sort()).toEqual(['t-added', 't-matched']);
      expect(await get('SELECT COUNT(*) AS n FROM plaid_transactions WHERE expense_id IS NOT NULL')).toEqual({ n: 0 });
    });

    test('linked expenses carry the bank details and others carry null', async () => {
      const matched = await addExpense({ date: '2026-10-10', amount: 25.5 });
      await addExpense({ date: '2026-10-11', amount: 7, place: 'Cash thing' });
      const id = await stage('t1');
      await plaidInboxService.matchToExpense(id, matched);

      const expenses = await expenseService.getExpenses({ year: 2026, month: 10 });

      expect(expenses.find(e => e.id === matched).bankLink).toEqual({
        status: 'matched', name: 'Coffee Shop', rawName: 'SQ *COFFEE SHOP', date: '2026-10-10', amount: 25.5
      });
      expect(expenses.find(e => e.id !== matched).bankLink).toBeNull();
    });
  });
});
