/**
 * Integration tests: the Inbox tabs (spec 3.1) through plaidInboxService / plaidReviewService / plaidService ->
 * real SQLite. To review ('spending') and Not expenses ('not_expense'): listing, counts, the header badge and
 * moving a row between them.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { sqlHelpers, insertItem } = require('../test/plaidFixtures');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const plaidInboxService = require('./plaidInboxService');
const plaidReviewService = require('./plaidReviewService');
const plaidRepository = require('../repositories/plaidRepository');

const DEBIT = 2;
const CREDIT_CARD = 4;

let db;
let debitAccountId;
let cardAccountId;

const { run, get } = sqlHelpers(() => db);

const stage = (transactionId, { accountId = debitAccountId, amount = 25.5, name = 'SQ *COFFEE SHOP', bucket = 'spending', status = 'new', pending = 0, removedAt = null } = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, name, review_bucket, status, pending, removed_at)
     VALUES (?, ?, ?, '2026-10-12', ?, ?, ?, ?, ?)`,
    [transactionId, accountId, amount, name, bucket, status, pending, removedAt]
  );

const ids = (transactions) => transactions.map(t => t.transactionId).sort();

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
  const itemId = await insertItem(run);
  debitAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'acc-debit', 'Chequing', ?)", [itemId, DEBIT]);
  cardAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'acc-card', 'Visa', ?)", [itemId, CREDIT_CARD]);
});

describe('Inbox tabs: To review / Not expenses', () => {
  test('each tab lists its own new rows, with counts for both; Ignored lists every ignored row', async () => {
    await stage('coffee');
    await stage('deposit', { amount: -105.3 });
    await stage('transfer', { amount: 300, bucket: 'not_expense' });
    await stage('card-payment', { accountId: cardAccountId, amount: -500, name: 'PAYMENT THANK YOU', bucket: 'not_expense' });
    await stage('ignored-spending', { status: 'ignored' });
    await stage('ignored-transfer', { status: 'ignored', bucket: 'not_expense' });
    await stage('dropped-hold', { status: 'added', pending: 1, removedAt: '2026-10-13' });

    const toReview = await plaidInboxService.listInbox('new');
    expect(ids(toReview.transactions)).toEqual(['coffee', 'deposit']);
    expect(toReview.counts).toEqual({ toReview: 3, notExpenses: 2 });
    expect(toReview.cancelled.map(c => c.id)).toHaveLength(1);
    expect(toReview.transactions.every(t => t.bucket === 'spending')).toBe(true);

    const notExpenses = await plaidInboxService.listInbox('new', 'not_expense');
    expect(ids(notExpenses.transactions)).toEqual(['card-payment', 'transfer']);
    expect(notExpenses.counts).toEqual({ toReview: 3, notExpenses: 2 });
    // Dropped pending charges are reviewed from To review only
    expect(notExpenses.cancelled).toEqual([]);
    // Rows keep everything their actions need, and say what kind of movement they are when known
    const byId = Object.fromEntries(notExpenses.transactions.map(t => [t.transactionId, t]));
    expect(byId['card-payment']).toMatchObject({ bucket: 'not_expense', kind: 'card_payment', cardPayment: expect.objectContaining({ side: 'card' }) });
    expect(byId.transfer).toMatchObject({ bucket: 'not_expense', kind: null, canAdd: true });

    expect(ids((await plaidInboxService.listInbox('ignored', 'not_expense')).transactions)).toEqual(['ignored-spending', 'ignored-transfer']);
    await expect(plaidInboxService.listInbox('new', 'transfers')).rejects.toMatchObject({ statusCode: 400 });
  });

  test('the header badge counts To review only (plus dropped pending charges)', async () => {
    await stage('coffee');
    await stage('transfer', { amount: 300, bucket: 'not_expense' });
    await stage('dropped-hold', { status: 'matched', pending: 1, removedAt: '2026-10-13' });

    expect(await plaidRepository.countToReview()).toBe(2);
  });

  test('moving a row sets the bucket for good and logs it; only rows still to review move', async () => {
    const id = await stage('transfer', { amount: 300, bucket: 'not_expense' });

    const { transaction } = await plaidReviewService.setBucket(id, 'spending');

    expect(transaction.bucket).toBe('spending');
    expect(await get('SELECT review_bucket, bucket_overridden FROM plaid_transactions WHERE id = ?', [id]))
      .toEqual({ review_bucket: 'spending', bucket_overridden: 1 });
    expect(activityLogService.logEvent).toHaveBeenCalledWith('plaid_transaction_updated', 'plaid_transaction', id,
      expect.stringContaining('to To review'), expect.objectContaining({ action: 'bucket', bucket: 'spending', previousBucket: 'not_expense' }));
    expect(ids((await plaidInboxService.listInbox('new')).transactions)).toEqual(['transfer']);

    await expect(plaidReviewService.setBucket(id, 'transfers')).rejects.toMatchObject({ statusCode: 400 });
    await plaidReviewService.ignore(id);
    await expect(plaidReviewService.setBucket(id, 'not_expense')).rejects.toMatchObject({ statusCode: 409 });
    await expect(plaidReviewService.setBucket(999999, 'spending')).rejects.toMatchObject({ statusCode: 404 });
  });
});
