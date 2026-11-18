/**
 * Integration tests: plaidBackfillService -> plaidBackfillRepository -> real SQLite, with the Plaid client mocked
 * (spec 2.1 capture backfill, spec 2.5.7 posted-date backfill).
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { sqlHelpers, insertItem, txn } = require('../test/plaidFixtures');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');
jest.mock('../config/plaid', () => ({
  ...jest.requireActual('../config/plaid'),
  getPlaidClient: jest.fn()
}));

const { getDatabase } = require('../database/db');
const plaidConfig = require('../config/plaid');
const activityLogService = require('./activityLogService');
const plaidBackfillService = require('./plaidBackfillService');

const TODAY = '2026-11-17';
const CREDIT_CARD = 4;
const ITEM = { id: 0, institutionName: 'Test Bank' };

let db;
let client;
let cardAccountId;

const { run, get, all } = sqlHelpers(() => db);

const stage = (transactionId, extra = {}) => {
  const row = { accountId: cardAccountId, amount: 20, date: '2026-11-10', authorizedDate: null, name: 'SOME SHOP', status: 'new', pending: 0, pfc: null, channel: null, expenseId: null, ...extra };
  return run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, authorized_date, name, status, pending, pfc_primary, payment_channel, expense_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [transactionId, row.accountId, row.amount, row.date, row.authorizedDate, row.name, row.status, row.pending, row.pfc, row.channel, row.expenseId]
  );
};

const rowOf = (transactionId) => get(
  'SELECT status, pfc_primary AS pfc, pfc_detailed AS detailed, payment_channel AS channel, merchant_entity_id AS entity, original_description AS original, review_bucket AS bucket FROM plaid_transactions WHERE transaction_id = ?',
  [transactionId]
);

const fromPlaid = (id, extra = {}) => ({
  ...txn(id),
  payment_channel: 'in store',
  merchant_entity_id: `entity-${id}`,
  original_description: `ORIGINAL ${id}`,
  personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_OTHER', confidence_level: 'HIGH' },
  ...extra
});

const getResponse = (transactions, total = transactions.length) => ({ data: { transactions, total_transactions: total } });

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  client = { transactionsGet: jest.fn() };
  plaidConfig.getPlaidClient.mockReturnValue(client);
  plaidBackfillService._failed.clear();
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM expenses');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run("DELETE FROM settings WHERE key LIKE 'plaid_%_backfill_done'");
  ITEM.id = await insertItem(run);
  cardAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'acc-card', 'Visa', ?)", [ITEM.id, CREDIT_CARD]);
});

describe('plaidBackfillService.backfillCapture', () => {
  test('fills the category and details of rows staged before they were kept, only for rows still to review or ignored', async () => {
    await stage('new-old');
    await stage('ignored-old', { status: 'ignored' });
    await stage('matched-old', { status: 'matched' });
    await stage('has-pfc', { pfc: 'FOOD_AND_DRINK' });
    await stage('complete', { pfc: 'FOOD_AND_DRINK', channel: 'online' });
    client.transactionsGet.mockResolvedValueOnce(getResponse([
      fromPlaid('new-old'), fromPlaid('ignored-old'), fromPlaid('matched-old'),
      fromPlaid('has-pfc', { personal_finance_category: { primary: 'OTHER', detailed: 'OTHER_OTHER', confidence_level: 'LOW' } }),
      fromPlaid('complete')
    ]));

    const result = await plaidBackfillService.backfillCapture(ITEM, 'access-token', TODAY);

    expect(result.filled).toBe(3);
    expect(await rowOf('new-old')).toMatchObject({ pfc: 'GENERAL_MERCHANDISE', channel: 'in store', entity: 'entity-new-old', original: 'ORIGINAL new-old' });
    expect(await rowOf('ignored-old')).toMatchObject({ pfc: 'GENERAL_MERCHANDISE', channel: 'in store' });
    expect(await rowOf('matched-old')).toMatchObject({ pfc: null, channel: null, entity: null });
    // An existing category is kept; only what was empty is filled
    expect(await rowOf('has-pfc')).toMatchObject({ pfc: 'FOOD_AND_DRINK', channel: 'in store' });
    expect(await rowOf('complete')).toMatchObject({ pfc: 'FOOD_AND_DRINK', channel: 'online' });
    expect(activityLogService.logEvent).toHaveBeenCalledWith('plaid_data_backfilled', 'plaid_transaction', null, expect.stringContaining('3 earlier Test Bank transactions'), expect.any(Object));
  });

  test('asks Plaid read-only for the span of the rows, with the original description, and only once per bank', async () => {
    await stage('new-old', { date: '2026-10-20' });
    client.transactionsGet.mockResolvedValue(getResponse([fromPlaid('new-old')]));

    await plaidBackfillService.backfillCapture(ITEM, 'access-token', TODAY);
    expect(await plaidBackfillService.backfillCapture(ITEM, 'access-token', TODAY)).toBeNull();

    expect(client.transactionsGet).toHaveBeenCalledTimes(1);
    expect(client.transactionsGet).toHaveBeenCalledWith({
      access_token: 'access-token', start_date: '2026-10-20', end_date: TODAY,
      options: { count: 500, offset: 0, include_original_description: true }
    });
  });

  test('never looks back further than 90 days', async () => {
    await stage('ancient', { date: '2025-01-05' });
    client.transactionsGet.mockResolvedValueOnce(getResponse([]));

    await plaidBackfillService.backfillCapture(ITEM, 'access-token', TODAY);

    expect(client.transactionsGet.mock.calls[0][0].start_date).toBe('2026-08-19');
  });

  test('reads every page', async () => {
    await stage('a');
    await stage('b');
    await stage('c');
    client.transactionsGet
      .mockResolvedValueOnce(getResponse([fromPlaid('a'), fromPlaid('b')], 3))
      .mockResolvedValueOnce(getResponse([fromPlaid('c')], 3));

    const result = await plaidBackfillService.backfillCapture(ITEM, 'access-token', TODAY);

    expect(result.filled).toBe(3);
    expect(client.transactionsGet.mock.calls.map(([args]) => args.options.offset)).toEqual([0, 2]);
  });

  test('rows that now count as card payments move to Not expenses', async () => {
    await stage('payment', { amount: -500, name: 'PAYMENT THANK YOU' });
    client.transactionsGet.mockResolvedValueOnce(getResponse([fromPlaid('payment', {
      amount: -500, personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', confidence_level: 'VERY_HIGH' }
    })]));

    const result = await plaidBackfillService.backfillCapture(ITEM, 'access-token', TODAY);

    expect(result).toEqual({ filled: 1, moved: 1 });
    expect((await rowOf('payment')).bucket).toBe('not_expense');
  });

  test('a bank with nothing to fill is not asked about, and a failure is retried only after a restart', async () => {
    expect(await plaidBackfillService.backfillCapture(ITEM, 'access-token', TODAY)).toEqual({ filled: 0, moved: 0 });
    expect(client.transactionsGet).not.toHaveBeenCalled();

    const other = await insertItem(run, { itemId: 'item-2' });
    await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'acc-2', 'Visa 2', ?)", [other, CREDIT_CARD]);
    const account2 = (await get("SELECT id FROM plaid_accounts WHERE account_id = 'acc-2'")).id;
    await stage('x', { accountId: account2 });
    client.transactionsGet.mockRejectedValue(Object.assign(new Error('Request failed'), { response: { data: { error_code: 'PRODUCT_NOT_READY' } } }));

    expect(await plaidBackfillService.backfillCapture({ id: other, institutionName: 'Other' }, 'access-token', TODAY)).toBeNull();
    expect(await plaidBackfillService.backfillCapture({ id: other, institutionName: 'Other' }, 'access-token', TODAY)).toBeNull();

    expect(client.transactionsGet).toHaveBeenCalledTimes(1);
    expect(await rowOf('x')).toMatchObject({ pfc: null });
    plaidBackfillService._failed.clear();
    client.transactionsGet.mockResolvedValue(getResponse([fromPlaid('x')]));
    expect(await plaidBackfillService.backfillCapture({ id: other, institutionName: 'Other' }, 'access-token', TODAY)).toMatchObject({ filled: 1 });
  });
});

describe('plaidBackfillService.afterSync', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    plaidBackfillService._postedDatesFailed = false;
  });

  test('a failing posted-date backfill does not stop the capture backfill, and is not retried until a restart', async () => {
    await stage('new-old');
    client.transactionsGet.mockResolvedValue(getResponse([fromPlaid('new-old')]));
    const posted = jest.spyOn(plaidBackfillService, 'backfillPostedDates').mockRejectedValue(new Error('locked'));

    await plaidBackfillService.afterSync(ITEM, 'access-token');
    await plaidBackfillService.afterSync(ITEM, 'access-token');

    expect(posted).toHaveBeenCalledTimes(1);
    expect(await rowOf('new-old')).toMatchObject({ pfc: 'GENERAL_MERCHANDISE' });
  });
});

describe('plaidBackfillService.backfillPostedDates', () => {
  let realDatesAccount;

  const addLinkedExpense = async ({ accountId, date, bankDate, postedDate = null, amount = 30, id = `t-${date}-${bankDate}` }) => {
    const expenseId = await run(
      'INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [date, postedDate, 'Shop', amount, 'Groceries', 'Visa', CREDIT_CARD]
    );
    await stage(id, { accountId, date: bankDate, authorizedDate: date, status: 'matched', expenseId, amount });
    return expenseId;
  };
  const postedOf = async (expenseId) => (await get('SELECT posted_date FROM expenses WHERE id = ?', [expenseId])).posted_date;

  beforeEach(async () => {
    // A bank that reports real posting dates: its settled rows post after the purchase date
    realDatesAccount = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'acc-real', 'Real', ?)", [ITEM.id, CREDIT_CARD]);
    for (const n of [1, 2, 3]) {
      await stage(`history-${n}`, { accountId: realDatesAccount, date: '2026-10-07', authorizedDate: '2026-10-05', status: 'ignored' });
    }
  });

  test('takes the bank date where the bank reports posting dates, and the form estimate where it does not', async () => {
    const real = await addLinkedExpense({ accountId: realDatesAccount, date: '2026-11-03', bankDate: '2026-11-05' });
    const estimated = await addLinkedExpense({ accountId: cardAccountId, date: '2026-10-06', bankDate: '2026-10-06' });

    const result = await plaidBackfillService.backfillPostedDates(TODAY);

    expect(result).toEqual({ changed: 2 });
    expect(await postedOf(real)).toBe('2026-11-05');
    expect(await postedOf(estimated)).toBe('2026-10-07');
    expect(activityLogService.logEvent).toHaveBeenCalledWith('plaid_posted_dates_backfilled', 'expense', null, expect.stringContaining('2 credit card expenses'), expect.objectContaining({ changed: 2 }));
  });

  test('never replaces a posted date, and an estimate is not later than today or the purchase day itself', async () => {
    const kept = await addLinkedExpense({ accountId: cardAccountId, date: '2026-10-06', bankDate: '2026-10-06', postedDate: '2026-10-09' });
    const sameDay = await addLinkedExpense({ accountId: realDatesAccount, date: '2026-11-04', bankDate: '2026-11-04' });
    const today = await addLinkedExpense({ accountId: cardAccountId, date: '2026-11-17', bankDate: '2026-11-17' });
    const capped = await addLinkedExpense({ accountId: cardAccountId, date: '2026-11-16', bankDate: '2026-11-16' });

    await plaidBackfillService.backfillPostedDates(TODAY);

    expect(await postedOf(kept)).toBe('2026-10-09');
    expect(await postedOf(sameDay)).toBeNull();
    expect(await postedOf(today)).toBeNull();
    expect(await postedOf(capped)).toBe(TODAY);
  });

  test('only settled bank rows count, and it runs once', async () => {
    const pending = await addLinkedExpense({ accountId: cardAccountId, date: '2026-10-06', bankDate: '2026-10-06' });
    await run('UPDATE plaid_transactions SET pending = 1 WHERE expense_id = ?', [pending]);

    expect(await plaidBackfillService.backfillPostedDates(TODAY)).toEqual({ changed: 0 });
    expect(await postedOf(pending)).toBeNull();

    await run('UPDATE plaid_transactions SET pending = 0 WHERE expense_id = ?', [pending]);
    expect(await plaidBackfillService.backfillPostedDates(TODAY)).toBeNull();
    expect(await postedOf(pending)).toBeNull();
    expect(await all("SELECT value FROM settings WHERE key = 'plaid_posted_date_backfill_done'")).toEqual([{ value: '1' }]);
  });
});
