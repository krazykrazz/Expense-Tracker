/**
 * Integration tests: plaidCardBalanceService -> plaidRepository / paymentMethodBalanceService -> real SQLite.
 * Covers the bank vs tracker card balance check and the causes it lists for a difference.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');
jest.mock('../utils/dateUtils', () => ({
  ...jest.requireActual('../utils/dateUtils'),
  getTodayString: jest.fn(() => '2026-11-03')
}));
jest.mock('../config/plaid', () => ({
  ...jest.requireActual('../config/plaid'),
  getPlaidConfig: jest.fn(() => ({ environment: 'sandbox' }))
}));

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const plaidCardBalanceService = require('./plaidCardBalanceService');
const { bankOwed, pairUp, postedFromBalance } = plaidCardBalanceService._internal;

const CREDIT_CARD = 4;

let db;
let itemId;
let cardAccountId;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const setBank = ({ current = null, available = null, limit = null } = {}) =>
  run(
    `UPDATE plaid_accounts SET current_balance = ?, available_balance = ?, credit_limit = ?, balance_currency = 'CAD',
       balance_as_of = '2026-11-03T20:00:00.000Z' WHERE id = ?`,
    [current, available, limit, cardAccountId]
  );

const addExpense = (date, amount, place = 'Shop', extra = {}) =>
  run(
    'INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id, posted_date) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    [date, place, amount, 'Other', 'Visa', CREDIT_CARD, extra.postedDate ?? null]
  );

const stage = (transactionId, { amount, date, status = 'new', pending = 0, expenseId = null, name = 'SHOP' }) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, name, status, pending, expense_id)
     VALUES (?, ?, ?, 'CAD', ?, ?, ?, ?, ?)`,
    [transactionId, cardAccountId, amount, date, name, status, pending, expenseId]
  );

const addPayment = (date, amount) =>
  run('INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, ?, ?)', [CREDIT_CARD, amount, date]);

const cardCheck = async () => (await plaidCardBalanceService.getCardBalances()).cards.find(c => c.paymentMethodId === CREDIT_CARD);

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_fixed_expense_links');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expenses');
  await run('DELETE FROM fixed_expenses');
  await run('DELETE FROM credit_card_payments');
  await run('DELETE FROM credit_card_billing_cycles');
  await run('UPDATE payment_methods SET credit_limit = NULL WHERE id = ?', [CREDIT_CARD]);
  itemId = await run("INSERT INTO plaid_items (item_id, institution_name, access_token_enc, environment) VALUES ('item-1', 'Test Bank', 'v1:x:y:z', 'sandbox')");
  cardAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-card', 'Visa', '4242', 'credit', ?)", [itemId, CREDIT_CARD]);
});

describe('plaidCardBalanceService', () => {
  test('a bank that sends available credit: owed includes pending, matches the tracker, future entries kept apart', async () => {
    const coffee = await addExpense('2026-10-20', 40);
    await stage('t-coffee', { amount: 40, date: '2026-10-20', status: 'added', expenseId: coffee });
    const dinner = await addExpense('2026-11-02', 60);
    await stage('t-dinner', { amount: 60, date: '2026-11-02', status: 'added', pending: 1, expenseId: dinner });
    await addExpense('2026-11-20', 1000, 'Car service');
    await setBank({ current: 40, available: 900, limit: 1000 });

    const card = await cardCheck();

    expect(card).toMatchObject({
      name: expect.any(String),
      accounts: [{ institutionName: 'Test Bank', name: 'Visa', mask: '4242' }],
      status: 'match',
      bank: { owed: 100, includesPending: true, asOf: '2026-11-03T20:00:00.000Z', currency: 'CAD' },
      tracker: 100,
      difference: 0,
      futureDated: { amount: 1000, count: 1 },
      causes: [],
      unexplained: 0,
      limit: { bank: 1000, tracker: null, utilization: 10 }
    });
  });

  test('a bank without available credit uses its balance; a linked pending charge it leaves out is "settling"', async () => {
    const dinner = await addExpense('2026-11-02', 60);
    await stage('t-dinner', { amount: 60, date: '2026-11-02', status: 'added', pending: 1, expenseId: dinner });
    await setBank({ current: 0, limit: 1000 });

    const card = await cardCheck();

    expect(card.bank).toMatchObject({ owed: 0, includesPending: false });
    expect(card).toMatchObject({ status: 'differs', difference: -60, unexplained: 0 });
    expect(card.causes).toEqual([
      expect.objectContaining({ type: 'settling', expenseId: dinner, name: 'SHOP', amount: 60, effect: -60 })
    ]);
  });

  test('explains a typo in the tracker, an unrecorded charge and an ignored refund', async () => {
    const first = await addExpense('2026-10-10', 25);
    await stage('t-first', { amount: 25, date: '2026-10-10', status: 'matched', expenseId: first });
    await addExpense('2026-10-30', 50, 'Typo');
    await stage('t-fee', { amount: 3.5, date: '2026-10-31', name: 'ANNUAL FEE' });
    await stage('t-refund', { amount: -15.5, date: '2026-11-01', status: 'ignored', name: 'REFUND' });
    // bank: 25 + 3.50 − 15.50; tracker: 25 + 50
    await setBank({ current: 13, available: 987, limit: 1000 });

    const card = await cardCheck();

    expect(card).toMatchObject({ status: 'differs', bank: { owed: 13 }, tracker: 75, difference: -62, unexplained: 0 });
    expect(card.causes.map(c => [c.type, c.name, c.effect, c.inboxStatus])).toEqual([
      ['tracker_only', 'Typo', -50, undefined],
      ['bank_only', 'ANNUAL FEE', 3.5, 'new'],
      ['bank_only', 'REFUND', -15.5, 'ignored']
    ]);
  });

  test('inbox rows already entered by hand, card payments and split charges cancel out', async () => {
    await addExpense('2026-10-10', 10, 'Earlier, before bank history');
    await stage('t-first', { amount: 1, date: '2026-10-12', status: 'ignored' });
    await addExpense('2026-10-12', 1, 'Matches the ignored row');
    await addExpense('2026-10-20', 30, 'Coffee by hand');
    await stage('t-coffee', { amount: 30, date: '2026-10-21' });
    await addPayment('2026-10-25', 500);
    await stage('t-payment', { amount: -500, date: '2026-10-27', name: 'PAYMENT THANK YOU' });
    await addExpense('2026-10-28', 20.6, 'Amazon order');
    await stage('t-amzn-1', { amount: 8.4, date: '2026-10-28', name: 'Amazon' });
    await stage('t-amzn-2', { amount: 12.2, date: '2026-10-30', name: 'Amazon' });
    // tracker: 10 + 1 + 30 + 20.60 − 500 → 0 (balances never go below zero); bank agrees
    await setBank({ current: 0, available: 1000, limit: 1000 });

    const card = await cardCheck();

    expect(card).toMatchObject({ status: 'match', causes: [], awaitingMatch: 2, splitCharges: 1 });
  });

  test('unknown without balances, and a bank in error is flagged', async () => {
    await run("UPDATE plaid_items SET last_error = 'ITEM_LOGIN_REQUIRED' WHERE id = ?", [itemId]);

    const card = await cardCheck();

    expect(card).toMatchObject({ status: 'unknown', bank: null, difference: null, unexplained: 0 });
    expect(card.bankError).toMatch(/not syncing/);
  });

  test('lists only credit cards mapped in the current environment', async () => {
    await run("UPDATE plaid_items SET environment = 'production' WHERE id = ?", [itemId]);
    expect((await plaidCardBalanceService.getCardBalances()).cards).toEqual([]);
  });

  test('uses the bank credit limit when asked, logged as a payment method update', async () => {
    await setBank({ current: 0, available: 1500, limit: 1500 });

    await plaidCardBalanceService.applyBankCreditLimit(CREDIT_CARD);

    expect((await get('SELECT credit_limit FROM payment_methods WHERE id = ?', [CREDIT_CARD])).credit_limit).toBe(1500);
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'payment_method_updated', 'payment_method', CREDIT_CARD, expect.stringContaining('credit limit: 0 → 1500'), expect.any(Object)
    );
    await expect(plaidCardBalanceService.applyBankCreditLimit(99999)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('refuses to use a limit the bank did not report', async () => {
    await setBank({ current: 10 });
    await expect(plaidCardBalanceService.applyBankCreditLimit(CREDIT_CARD)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('bank file rows are not in the bank\'s balance until Plaid sends them: added ones are a cause, unreviewed or ignored ones are not', async () => {
    const plaidFileImportService = require('./plaidFileImportService');
    const plaidReviewService = require('./plaidReviewService');
    const header = 'transaction_date,transaction_type,status,merchant,amount,currency,notes,category';
    await plaidFileImportService.importFile(cardAccountId, {
      csv: [header, '2026-11-02,Purchase,Completed,Grocer,-50.00,CAD,,', '2026-11-03,Refund,Completed,Book Store,15.50,CAD,,'].join('\n'),
      fromDate: '2026-11-01'
    });
    // Plaid's balance is from before both
    await setBank({ current: 0, limit: 1000 });

    expect(await cardCheck()).toMatchObject({ status: 'match', causes: [] });

    const grocer = await get("SELECT id FROM plaid_transactions WHERE name = 'Grocer'");
    const refund = await get("SELECT id FROM plaid_transactions WHERE name = 'Book Store'");
    await plaidReviewService.addAsExpense(grocer.id, { type: 'Groceries' });
    await plaidReviewService.ignore(refund.id);

    const card = await cardCheck();
    expect(card).toMatchObject({ tracker: 50, difference: -50, unexplained: 0 });
    expect(card.causes.map(c => [c.type, c.name, c.effect])).toEqual([['from_file', 'Grocer', -50]]);
  });

  test('an expense entered by hand that matches a file row is not in the bank\'s balance yet either', async () => {
    const plaidFileImportService = require('./plaidFileImportService');
    await addExpense('2026-11-02', 50, 'Grocer');
    await plaidFileImportService.importFile(cardAccountId, {
      csv: 'transaction_date,transaction_type,status,merchant,amount,currency,notes,category\n2026-11-02,Purchase,Completed,Grocer,-50.00,CAD,,',
      fromDate: '2026-11-01'
    });
    await setBank({ current: 0, limit: 1000 });

    const card = await cardCheck();
    expect(card).toMatchObject({ difference: -50, unexplained: 0, awaitingMatch: 1 });
    expect(card.causes.map(c => [c.type, c.kind, c.effect])).toEqual([['from_file', 'expense', -50]]);
  });

  test('a pending charge a file showed settled is no longer "settling" on a bank that leaves pending out', async () => {
    const plaidFileImportService = require('./plaidFileImportService');
    const dinner = await addExpense('2026-11-02', 60, 'Dinner');
    await stage('t-dinner', { amount: 60, date: '2026-11-02', status: 'added', pending: 1, expenseId: dinner, name: 'DINNER PLACE' });
    await setBank({ current: 0, limit: 1000 });
    expect((await cardCheck()).causes.map(c => c.type)).toEqual(['settling']);

    await plaidFileImportService.importFile(cardAccountId, { csv: '2026-11-03,DINNER PLACE,60.00,,5223********4242', fromDate: '2026-11-01' });
    await setBank({ current: 60, limit: 1000 });

    expect(await cardCheck()).toMatchObject({ status: 'match', causes: [] });
  });

  test('names a pending charge the bank cancelled while the tracker still has its expense', async () => {
    const dinner = await addExpense('2026-11-01', 40, 'Dinner');
    await run(
      `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, name, status, pending, expense_id, removed_at)
       VALUES ('t-hold', ?, 40, '2026-11-01', 'HOLD', 'added', 1, ?, CURRENT_TIMESTAMP)`,
      [cardAccountId, dinner]
    );
    await setBank({ current: 0, available: 1000, limit: 1000 });

    const card = await cardCheck();

    expect(card).toMatchObject({ status: 'differs', difference: -40, unexplained: 0 });
    expect(card.causes).toEqual([expect.objectContaining({ type: 'cancelled', expenseId: dinner, name: 'HOLD', effect: -40 })]);
  });

  test('names a charge confirmed as a fixed expense, which the card balance does not include', async () => {
    const fixedId = await run(
      "INSERT INTO fixed_expenses (year, month, name, amount, payment_method_id) VALUES (2026, 11, 'Streaming', 18.99, ?)",
      [CREDIT_CARD]
    );
    const rowId = await stage('t-streaming', { amount: 18.99, date: '2026-11-02', status: 'matched', name: 'STREAMING' });
    await run("INSERT INTO plaid_fixed_expense_links (plaid_transaction_id, fixed_expense_id, landed_date) VALUES (?, ?, '2026-11-02')", [rowId, fixedId]);
    await setBank({ current: 18.99, available: 981.01, limit: 1000 });

    const card = await cardCheck();

    expect(card).toMatchObject({ status: 'differs', difference: 18.99, unexplained: 0 });
    expect(card.causes).toEqual([expect.objectContaining({ type: 'fixed_expense', name: 'STREAMING', effect: 18.99 })]);
  });

  test('explains a credit balance at the bank, which the tracker shows as $0', async () => {
    await setBank({ current: -25, available: 1025, limit: 1000 });

    const card = await cardCheck();

    expect(card).toMatchObject({ status: 'differs', bank: { owed: -25 }, tracker: 0, unexplained: 0 });
    expect(card.causes).toEqual([expect.objectContaining({ type: 'credit_balance', amount: -25, effect: -25 })]);
  });

  test('ignores activity already covered by a statement entered from the real statement', async () => {
    // Statement to Oct 15 entered as $100: that's the anchor; the unlinked Oct 12 entry is inside it
    await run(
      `INSERT INTO credit_card_billing_cycles (payment_method_id, cycle_start_date, cycle_end_date, actual_statement_balance,
         calculated_statement_balance, is_user_entered) VALUES (?, '2026-09-16', '2026-10-15', 100, 95, 1)`,
      [CREDIT_CARD]
    );
    await stage('t-first', { amount: 100, date: '2026-10-05', status: 'matched' });
    await addExpense('2026-10-12', 5, 'Inside the statement');
    await addExpense('2026-10-20', 30, 'Typo after the statement');
    await setBank({ current: 100, available: 900, limit: 1000 });

    const card = await cardCheck();

    expect(card).toMatchObject({ status: 'differs', tracker: 130, difference: -30, unexplained: 0 });
    expect(card.causes.map(c => c.name)).toEqual(['Typo after the statement']);
  });

  test('settleFromBalance: pending charges the bank\'s balance (pending left out) shows posted are settled; the rest stay', async () => {
    const haircut = await addExpense('2026-11-02', 45.41, 'Haircut');
    const groceries = await addExpense('2026-11-02', 12.41, 'Groceries');
    await stage('t-haircut', { amount: 45.41, date: '2026-11-02', status: 'added', pending: 1, expenseId: haircut });
    await stage('t-groceries', { amount: 12.41, date: '2026-11-02', status: 'added', pending: 1, expenseId: groceries });
    // Balance only (no available credit): the haircut is in it, the groceries aren't yet
    await setBank({ current: 45.41 });

    const settlements = await plaidCardBalanceService.settleFromBalance(itemId);

    expect(settlements).toEqual([expect.objectContaining({ expenseId: haircut, settled: true, amount: 45.41 })]);
    expect(await get("SELECT pending FROM plaid_transactions WHERE transaction_id = 't-haircut'")).toEqual({ pending: 0 });
    expect(await get("SELECT pending FROM plaid_transactions WHERE transaction_id = 't-groceries'")).toEqual({ pending: 1 });
    expect(await cardCheck()).toMatchObject({ difference: -12.41, unexplained: 0 });
  });

  test('a pending charge the bank counts (CIBC) but the tracker counts from a later posted date explains the difference', async () => {
    // Hand-entered yesterday with the form's estimated posted date (the next business day, after today)
    const scone = await addExpense('2026-11-02', 25, 'Rocket Scone', { postedDate: '2026-11-04' });
    await stage('t-scone', { amount: 25, date: '2026-11-02', status: 'matched', pending: 1, expenseId: scone, name: 'ROCKET SCONE' });
    await setBank({ current: 0, available: 975, limit: 1000 });

    const card = await cardCheck();

    expect(card).toMatchObject({ status: 'differs', tracker: 0, difference: 25, unexplained: 0 });
    expect(card.causes).toEqual([expect.objectContaining({ type: 'posts_later', name: 'ROCKET SCONE', effect: 25, trackerPostedDate: '2026-11-04' })]);
  });

  test('settleFromBalance: when the balance matches the tracker, the last pending charge posted (Sobeys case)', async () => {
    const groceries = await addExpense('2026-11-02', 12.41, 'Groceries');
    await stage('t-groceries', { amount: 12.41, date: '2026-11-02', status: 'added', pending: 1, expenseId: groceries });
    await setBank({ current: 12.41 });
    expect(await cardCheck()).toMatchObject({ status: 'match', difference: 0 });

    const settlements = await plaidCardBalanceService.settleFromBalance(itemId);

    expect(settlements).toEqual([expect.objectContaining({ expenseId: groceries, settled: true })]);
    expect(await get("SELECT pending FROM plaid_transactions WHERE transaction_id = 't-groceries'")).toEqual({ pending: 0 });
    expect((await cardCheck()).causes).toEqual([]);
  });

  test('settleFromBalance does nothing for banks whose balance includes pending charges, or when unsure', async () => {
    const haircut = await addExpense('2026-11-02', 45.41, 'Haircut');
    await stage('t-haircut', { amount: 45.41, date: '2026-11-02', status: 'added', pending: 1, expenseId: haircut });
    await setBank({ current: 45.41, available: 954.59, limit: 1000 });
    expect(await plaidCardBalanceService.settleFromBalance(itemId)).toEqual([]);

    await setBank({ current: 49.37 });
    expect(await plaidCardBalanceService.settleFromBalance(itemId)).toEqual([]);
    expect(await get("SELECT pending FROM plaid_transactions WHERE transaction_id = 't-haircut'")).toEqual({ pending: 1 });
  });

  test('balances received on sync are stored, and kept when a page omits them', async () => {
    const plaidRepository = require('../repositories/plaidRepository');
    await plaidRepository.upsertAccount(itemId, {
      account_id: 'acc-card', name: 'Visa', mask: '4242', type: 'credit',
      balances: { current: 120.5, available: 879.5, limit: 1000, iso_currency_code: 'CAD' }
    });
    await plaidRepository.upsertAccount(itemId, { account_id: 'acc-card', name: 'Visa', mask: '4242', type: 'credit' });

    expect(await get('SELECT current_balance, available_balance, credit_limit, balance_currency, balance_as_of FROM plaid_accounts WHERE id = ?', [cardAccountId]))
      .toEqual({ current_balance: 120.5, available_balance: 879.5, credit_limit: 1000, balance_currency: 'CAD', balance_as_of: expect.any(String) });
  });
});

describe('bank balance helpers', () => {
  test.each([
    ['limit and available', { creditLimit: 1000, availableBalance: 900, currentBalance: 40 }, { owed: 100, includesPending: true }],
    ['balance only', { creditLimit: 1000, availableBalance: null, currentBalance: 40 }, { owed: 40, includesPending: false }],
    ['nothing received', { creditLimit: null, availableBalance: null, currentBalance: null }, null]
  ])('bankOwed: %s', (_, account, expected) => {
    expect(bankOwed(account)).toEqual(expected);
  });

  test('pairUp prefers the closest date and never reuses an entry', () => {
    const bank = [{ id: 'b1', effect: 10, date: '2026-10-10' }, { id: 'b2', effect: 10, date: '2026-10-20' }];
    const tracker = [{ id: 't1', effect: 10, date: '2026-10-19' }];

    const { bankOnly, trackerOnly, pairs } = pairUp(bank, tracker);

    expect(pairs).toEqual([{ bank: bank[1], tracker: tracker[0] }]);
    expect(bankOnly).toEqual([bank[0]]);
    expect(trackerOnly).toEqual([]);
  });

  test('pairUp leaves entries more than 5 days apart unpaired', () => {
    const { pairs } = pairUp([{ effect: 10, date: '2026-10-01' }], [{ effect: 10, date: '2026-10-07' }]);
    expect(pairs).toEqual([]);
  });

  const settling = (id, amount) => ({ type: 'settling', transactionId: id, amount, effect: -amount });

  test('postedFromBalance: the charges the balance includes, when exactly one choice explains the difference', () => {
    const causes = [settling(1, 10.4), settling(2, 45.41), settling(3, 12.41), { type: 'tracker_only', effect: -4 }];
    // Only #3 still left out of the bank's balance, plus a tracker entry the bank doesn't have yet
    expect(postedFromBalance({ difference: -16.41, causes }).map(c => c.transactionId)).toEqual([1, 2]);
    // All still pending: nothing posted
    expect(postedFromBalance({ difference: -72.22, causes })).toEqual([]);
    // The balance matches the tracker: every one of them posted
    expect(postedFromBalance({ difference: -4, causes }).map(c => c.transactionId)).toEqual([1, 2, 3]);
    expect(postedFromBalance({ difference: 0, causes: [settling(9, 12.41)] }).map(c => c.transactionId)).toEqual([9]);
  });

  test('postedFromBalance settles nothing when unsure', () => {
    // A tip or fee: no choice fits to the cent
    expect(postedFromBalance({ difference: -64.26, causes: [settling(1, 10.4), settling(2, 45.41), settling(3, 12.41)] })).toEqual([]);
    // Two charges of the same amount: either could be the one still pending
    expect(postedFromBalance({ difference: -20, causes: [settling(1, 20), settling(2, 20)] })).toEqual([]);
  });
});
