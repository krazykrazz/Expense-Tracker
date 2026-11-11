/**
 * Integration tests: plaidLinkRepository -> real SQLite. Linking a bank row to a fixed expense, income source or
 * card payment marks the row reviewed and adds the link in one step, and only while the row is still waiting
 * for review (a sync may have changed it meanwhile); unlinking undoes both.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { sqlHelpers, insertItem } = require('../test/plaidFixtures');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../database/db');
const plaidLinkRepository = require('./plaidLinkRepository');
const plaidCardPaymentRepository = require('./plaidCardPaymentRepository');

const CREDIT_CARD = 4;

let db;
let accountId;

const { run, get } = sqlHelpers(() => db);

const stage = (transactionId, status = 'new') => run(
  `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, name, status)
   VALUES (?, ?, 50, '2026-11-02', 'X', ?)`,
  [transactionId, accountId, status]
);
const statusOf = async (id) => (await get('SELECT status FROM plaid_transactions WHERE id = ?', [id])).status;
const linkCount = async (table) => (await get(`SELECT COUNT(*) AS n FROM ${table}`)).n;

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

let fixedId;
let incomeId;
let paymentId;

beforeEach(async () => {
  for (const table of ['plaid_card_payment_links', 'plaid_fixed_expense_links', 'plaid_income_links', 'plaid_transactions', 'plaid_accounts', 'plaid_items',
    'fixed_expenses', 'income_sources', 'credit_card_payments']) {
    await run(`DELETE FROM ${table}`);
  }
  const itemId = await insertItem(run, { itemId: 'i-1', institutionName: 'Bank' });
  accountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'a-1', 'Chequing', 1)", [itemId]);
  fixedId = await run("INSERT INTO fixed_expenses (year, month, name, amount, payment_type) VALUES (2026, 11, 'Rent', 50, 'Debit')");
  incomeId = await run("INSERT INTO income_sources (year, month, name, amount, category) VALUES (2026, 11, 'Salary', 50, 'Salary')");
  paymentId = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 50, '2026-11-02')", [CREDIT_CARD]);
});

describe('plaidLinkRepository', () => {
  test('a fixed expense link marks the row matched; unlinking returns it to the inbox', async () => {
    const id = await stage('t-fixed');

    expect(await plaidLinkRepository.linkFixedExpense(id, fixedId, '2026-11-02', 50)).toBe(true);
    expect(await statusOf(id)).toBe('matched');
    expect(await get('SELECT fixed_expense_id AS f, landed_date AS d, planned_amount AS p FROM plaid_fixed_expense_links WHERE plaid_transaction_id = ?', [id]))
      .toEqual({ f: fixedId, d: '2026-11-02', p: 50 });

    await plaidLinkRepository.unlinkFixedExpense(id);
    expect(await statusOf(id)).toBe('new');
    expect(await linkCount('plaid_fixed_expense_links')).toBe(0);
  });

  test('an income link records the status asked for (added for Add as income); unlinking undoes either', async () => {
    const added = await stage('t-added');
    const matched = await stage('t-matched');
    const secondIncome = await run("INSERT INTO income_sources (year, month, name, amount, category) VALUES (2026, 11, 'Gift', 50, 'Gifts')");

    expect(await plaidLinkRepository.linkIncomeSource(added, incomeId, '2026-11-02', null, 'added')).toBe(true);
    expect(await plaidLinkRepository.linkIncomeSource(matched, secondIncome, '2026-11-02', 50)).toBe(true);
    expect([await statusOf(added), await statusOf(matched)]).toEqual(['added', 'matched']);

    await plaidLinkRepository.unlinkIncomeSource(added);
    await plaidLinkRepository.unlinkIncomeSource(matched);
    expect([await statusOf(added), await statusOf(matched)]).toEqual(['new', 'new']);
    expect(await linkCount('plaid_income_links')).toBe(0);
  });

  test.each(['ignored', 'added', 'matched'])('a row a sync or another action already moved to %s is not linked, and nothing is added', async (status) => {
    const id = await stage(`t-${status}`, status);

    expect(await plaidLinkRepository.linkFixedExpense(id, fixedId, '2026-11-02', 50)).toBe(false);
    expect(await plaidLinkRepository.linkIncomeSource(id, incomeId, '2026-11-02', 50)).toBe(false);
    await expect(plaidCardPaymentRepository.link(null, id, paymentId, 'card')).rejects.toMatchObject({ statusCode: 409 });

    expect(await statusOf(id)).toBe(status);
    expect(await linkCount('plaid_fixed_expense_links') + await linkCount('plaid_income_links') + await linkCount('plaid_card_payment_links')).toBe(0);
  });

  test('a second link for the same fixed expense fails and leaves the row in the inbox', async () => {
    await plaidLinkRepository.linkFixedExpense(await stage('t-first'), fixedId, '2026-11-02', 50);
    const second = await stage('t-second');

    await expect(plaidLinkRepository.linkFixedExpense(second, fixedId, '2026-11-02', 50)).rejects.toThrow(/UNIQUE/);
    expect(await statusOf(second)).toBe('new');
  });

  test('a card payment link marks the row matched; a second row on the same side is a 409 and stays in the inbox', async () => {
    const first = await stage('t-card');
    await plaidCardPaymentRepository.link(null, first, paymentId, 'card');
    expect(await statusOf(first)).toBe('matched');

    const second = await stage('t-card-2');
    await expect(plaidCardPaymentRepository.link(null, second, paymentId, 'card')).rejects.toMatchObject({ statusCode: 409 });
    expect(await statusOf(second)).toBe('new');
  });
});
