/**
 * Integration tests: plaidCycleCheckService -> plaidCycleRepository / statementBalanceService -> real SQLite.
 * Covers the per-cycle bank vs tracker check and the causes it lists for a difference.
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
const plaidCycleCheckService = require('./plaidCycleCheckService');

const CREDIT_CARD = 4;

let db;
let itemId;
let cardAccountId;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});

const addExpense = (date, amount, place = 'Shop', postedDate = null) =>
  run(
    'INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id, posted_date) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    [date, place, amount, 'Other', 'Visa', CREDIT_CARD, postedDate]
  );

const stage = (transactionId, { amount, date, status = 'new', pending = 0, expenseId = null, name = 'SHOP', removed = false }) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, name, status, pending, expense_id, removed_at)
     VALUES (?, ?, ?, 'CAD', ?, ?, ?, ?, ?, ?)`,
    [transactionId, cardAccountId, amount, date, name, status, pending, expenseId, removed ? '2026-10-20T00:00:00.000Z' : null]
  );

const checks = async () => plaidCycleCheckService.getCycleChecks(CREDIT_CARD);
const byType = (cycle, type) => cycle.causes.filter(cause => cause.type === type);

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  await run('DELETE FROM plaid_card_payment_links');
  await run('DELETE FROM plaid_fixed_expense_links');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expenses');
  await run('DELETE FROM fixed_expenses');
  await run('DELETE FROM credit_card_payments');
  await run('UPDATE payment_methods SET billing_cycle_day = 15 WHERE id = ?', [CREDIT_CARD]);
  itemId = await run("INSERT INTO plaid_items (item_id, institution_name, access_token_enc, environment) VALUES ('item-1', 'Test Bank', 'v1:x:y:z', 'sandbox')");
  cardAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-card', 'Visa', '4242', 'credit', ?)", [itemId, CREDIT_CARD]);
});

describe('plaidCycleCheckService', () => {
  test('a card with no linked bank account is a 404', async () => {
    await run('DELETE FROM plaid_accounts');
    await expect(checks()).rejects.toMatchObject({ statusCode: 404 });
  });

  test('no cycles without a statement day or without bank history', async () => {
    expect((await checks()).cycles).toEqual([]);
    await stage('t-old', { amount: 5, date: '2026-01-01' });
    await run('UPDATE payment_methods SET billing_cycle_day = NULL WHERE id = ?', [CREDIT_CARD]);
    expect(await checks()).toMatchObject({ billingCycleDay: null, cycles: [] });
  });

  test('lists the closed cycles the bank history fully covers, newest first', async () => {
    await stage('t-start', { amount: 5, date: '2026-08-10' });

    const { cycles } = await checks();

    expect(cycles.map(c => [c.startDate, c.endDate])).toEqual([
      ['2026-09-16', '2026-10-15'],
      ['2026-08-16', '2026-09-15']
    ]);
  });

  test('bank history that starts mid-cycle does not cover that cycle', async () => {
    await stage('t-start', { amount: 5, date: '2026-09-20' });

    expect((await checks()).cycles).toEqual([]);
  });

  test('a cycle where everything matches is a match', async () => {
    await stage('t-start', { amount: 5, date: '2026-08-10' });
    const coffee = await addExpense('2026-09-20', 40);
    await stage('t-coffee', { amount: 40, date: '2026-09-21', status: 'added', expenseId: coffee });

    const [cycle] = (await checks()).cycles;

    expect(cycle).toMatchObject({ status: 'match', difference: 0, causes: [], matchedCount: 1, bank: { total: 40, count: 1 }, tracker: { total: 40, count: 1 } });
  });

  test('every kind of difference is listed and the effects add up to the difference', async () => {
    await stage('t-start', { amount: 5, date: '2026-08-10' });

    const matched = await addExpense('2026-09-20', 40);
    await stage('t-matched', { amount: 40, date: '2026-09-21', status: 'added', expenseId: matched });

    const typo = await addExpense('2026-09-22', 25, 'Typo');
    await stage('t-typo', { amount: 52, date: '2026-09-22', status: 'added', expenseId: typo });

    // Counted on the next statement in the tracker, posted in this one at the bank
    const late = await addExpense('2026-10-10', 30, 'Late', '2026-10-18');
    await stage('t-late', { amount: 30, date: '2026-10-14', status: 'added', expenseId: late });

    // Counted in this statement in the tracker, posted in the next one at the bank
    const early = await addExpense('2026-10-12', 11, 'Early', '2026-10-14');
    await stage('t-early', { amount: 11, date: '2026-10-16', status: 'added', expenseId: early });

    const fixedId = await run("INSERT INTO fixed_expenses (year, month, name, amount, payment_method_id) VALUES (2026, 9, 'Streaming', 15, ?)", [CREDIT_CARD]);
    const streaming = await stage('t-streaming', { amount: 15, date: '2026-09-30', status: 'matched', name: 'STREAMING' });
    await run("INSERT INTO plaid_fixed_expense_links (plaid_transaction_id, fixed_expense_id, landed_date) VALUES (?, ?, '2026-09-30')", [streaming, fixedId]);

    await stage('t-fee', { amount: 3.5, date: '2026-10-01', name: 'ANNUAL FEE' });
    await addExpense('2026-10-02', 9.99, 'Unrecorded');

    // Same money on both sides, not matched yet
    await stage('t-waiting', { amount: 12, date: '2026-10-05', name: 'WAITING' });
    await addExpense('2026-10-05', 12, 'Waiting');

    const payment = await run('INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 100, ?)', [CREDIT_CARD, '2026-10-03']);
    const credit = await stage('t-payment', { amount: -100, date: '2026-10-03', status: 'matched', name: 'PAYMENT' });
    await run("INSERT INTO plaid_card_payment_links (plaid_transaction_id, credit_card_payment_id, side) VALUES (?, ?, 'card')", [credit, payment]);

    const cancelled = await addExpense('2026-10-04', 7, 'Cancelled');
    await stage('t-cancelled', { amount: 7, date: '2026-10-04', status: 'added', expenseId: cancelled, removed: true });
    const pending = await addExpense('2026-10-06', 8, 'Pending');
    await stage('t-pending', { amount: 8, date: '2026-10-06', status: 'added', pending: 1, expenseId: pending });

    const [cycle] = (await checks()).cycles;

    expect(cycle.status).toBe('differs');
    expect(byType(cycle, 'amount_differs')).toEqual([expect.objectContaining({ effect: 27, bankAmount: 52, trackerAmount: 25 })]);
    expect(byType(cycle, 'other_statement').map(c => [c.name, c.effect]).sort()).toEqual([['Early', -11], ['SHOP', 30]].sort());
    expect(byType(cycle, 'fixed_expense')).toEqual([expect.objectContaining({ effect: 15 })]);
    expect(byType(cycle, 'bank_only')).toEqual([expect.objectContaining({ name: 'ANNUAL FEE', effect: 3.5, status: 'new' })]);
    expect(byType(cycle, 'tracker_only')).toEqual([expect.objectContaining({ name: 'Unrecorded', effect: -9.99 })]);
    expect(byType(cycle, 'cancelled')).toEqual([expect.objectContaining({ name: 'Cancelled', effect: -7 })]);
    expect(byType(cycle, 'pending')).toEqual([expect.objectContaining({ name: 'Pending', effect: -8 })]);
    expect(cycle.awaitingMatch).toBe(1);
    expect(cycle.causes.map(c => c.name)).not.toContain('WAITING');

    const explained = Math.round(cycle.causes.reduce((sum, cause) => sum + cause.effect, 0) * 100) / 100;
    expect(explained).toBe(cycle.difference);
  });

  test('a bank charge posted in the cycle whose expense is on another statement is "other statement"', async () => {
    await stage('t-start', { amount: 5, date: '2026-08-10' });
    const late = await addExpense('2026-10-10', 30, 'Late', '2026-10-18');
    await stage('t-late', { amount: 30, date: '2026-10-14', status: 'added', expenseId: late });

    const [cycle] = (await checks()).cycles;

    expect(cycle).toMatchObject({ difference: 30, tracker: { total: 0, count: 0 } });
    expect(byType(cycle, 'other_statement')).toEqual([expect.objectContaining({ trackerDate: '2026-10-18' })]);
  });

  test('pending bank charges and removed bank rows are not part of the bank total', async () => {
    await stage('t-start', { amount: 5, date: '2026-08-10' });
    await stage('t-pending', { amount: 20, date: '2026-10-10', pending: 1 });
    await stage('t-removed', { amount: 21, date: '2026-10-11', removed: true });

    const [cycle] = (await checks()).cycles;

    expect(cycle).toMatchObject({ status: 'match', bank: { total: 0, count: 0 } });
  });
});
