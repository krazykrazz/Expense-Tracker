/**
 * Integration tests: plaidSplitService -> repositories -> real SQLite (spec 3.9, one bank charge entered as several
 * expenses), the triggers that keep the links consistent, and the places that must treat every part as linked.
 * The data is the production case: a $326.49 Brio charge entered as $244.02 and $82.47.
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
const plaidSplitService = require('./plaidSplitService');
const plaidSettlementService = require('./plaidSettlementService');
const plaidInboxService = require('./plaidInboxService');
const plaidCycleCheckService = require('./plaidCycleCheckService');
const expenseService = require('./expenseService');
const plaidRepository = require('../repositories/plaidRepository');
const plaidSplitRepository = require('../repositories/plaidSplitRepository');
const plaidBalanceCheckRepository = require('../repositories/plaidBalanceCheckRepository');

const DEBIT = 2;
const CREDIT_CARD = 4;

let db;
let debitAccountId;
let cardAccountId;

const { run, get, all } = sqlHelpers(() => db);

const bankRow = (transactionId, amount, { accountId = cardAccountId, date = '2026-11-20', authorizedDate = null, pending = 0, status = 'new', expenseId = null, name = 'Brio Bodywear Inc-Ottawa - Purchase' } = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, authorized_date, name, pending, status, expense_id)
     VALUES (?, ?, ?, 'CAD', ?, ?, ?, ?, ?, ?)`,
    [transactionId, accountId, amount, date, authorizedDate, name, pending, status, expenseId]
  );

const expense = ({ date = '2026-11-20', place = 'Brio', amount = 10, originalCost = null, type = 'Gifts', paymentMethodId = CREDIT_CARD, method = 'Credit Card', notes = null } = {}) =>
  run(
    `INSERT INTO expenses (date, place, notes, amount, original_cost, type, week, method, payment_method_id)
     VALUES (?, ?, ?, ?, ?, ?, 3, ?, ?)`,
    [date, place, notes, amount, originalCost, type, method, paymentMethodId]
  );

const rowOf = (id) => get('SELECT status, expense_id AS expenseId FROM plaid_transactions WHERE id = ?', [id]);
const partsOf = async (id) => (await all('SELECT expense_id AS expenseId FROM plaid_split_links WHERE plaid_transaction_id = ? ORDER BY id', [id])).map(r => r.expenseId);
const amountsOf = (ids) => all(`SELECT id, amount, original_cost AS originalCost, type, notes FROM expenses WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids);
const events = (type) => activityLogService.logEvent.mock.calls.filter(call => call[0] === type);

/** The production case: bank row 326.49, expenses 244.02 and 82.47 on the card, plus noise that must never be offered. */
async function brio(rowExtra = {}) {
  const id = await bankRow('brio', 326.49, rowExtra);
  const big = await expense({ amount: 244.02, type: 'Recreation Activities', notes: 'Pointe + Accessories' });
  const small = await expense({ amount: 82.47, type: 'Gifts', notes: 'Suit & Ballet Shoes' });
  return { id, big, small };
}

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_split_links');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expense_people');
  await run('DELETE FROM expenses');
  const itemId = await insertItem(run);
  debitAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, payment_method_id) VALUES (?, 'acc-debit', 'Chequing', '5070', ?)", [itemId, DEBIT]);
  cardAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-card', 'Visa', '1234', 'credit', ?)", [itemId, CREDIT_CARD]);
});

describe('candidates', () => {
  test('lists the unlinked expenses that could be parts, not those that can not, and pre-selects the combination that adds up', async () => {
    const { id, big, small } = await brio();
    const small2 = await expense({ amount: 50, place: 'Other' });
    await expense({ amount: 82.47, paymentMethodId: DEBIT, method: 'Debit' });        // another payment method
    await expense({ amount: 82.47, date: '2026-11-01' });                              // too early for this row
    await expense({ amount: 326.49 });                                                 // as big as the charge: a plain match
    await expense({ amount: 400 });                                                    // bigger than the charge
    const linked = await expense({ amount: 20 });
    await bankRow('other-row', 20, { status: 'added', expenseId: linked });            // already linked

    const result = await plaidSplitService.candidates(id);

    expect(result).toMatchObject({ mode: 'match', bankAmount: 326.49, partsTotal: 0, remaining: 326.49, minExpenses: 2, parts: [] });
    expect(result.candidates.map(c => c.expenseId)).toEqual([big, small, small2]);
    expect(result.candidates[0]).toMatchObject({ date: '2026-11-20', place: 'Brio', type: 'Recreation Activities', amount: 244.02, charged: 244.02 });
    expect(result.suggestion).toEqual([big, small]);
  });

  test('suggests nothing when several combinations add up, or none does', async () => {
    const id = await bankRow('b', 100);
    await expense({ amount: 60 });
    await expense({ amount: 40 });
    await expense({ amount: 70 });
    await expense({ amount: 30 });
    expect((await plaidSplitService.candidates(id)).suggestion).toBeNull();      // 60+40 and 70+30

    const other = await bankRow('c', 101);
    expect((await plaidSplitService.candidates(other)).suggestion).toBeNull();   // nothing adds up
  });

  test('counts the charged amount of a reimbursed expense, not what it cost out of pocket', async () => {
    const id = await bankRow('b', 100);
    const reimbursed = await expense({ amount: 20, originalCost: 60 });
    const plain = await expense({ amount: 40 });

    expect((await plaidSplitService.candidates(id)).suggestion).toEqual([reimbursed, plain]);
  });

  test('for a reviewed charge it lists what fits in what is left, with the parts already linked', async () => {
    const { id, big, small } = await brio();
    await run("UPDATE plaid_transactions SET status = 'added', expense_id = ? WHERE id = ?", [big, id]);
    const fifty = await expense({ amount: 50 });

    const result = await plaidSplitService.candidates(id);

    expect(result).toMatchObject({ mode: 'complete', partsTotal: 244.02, remaining: 82.47, minExpenses: 1 });
    expect(result.parts.map(p => p.expenseId)).toEqual([big]);
    expect(result.candidates.map(c => c.expenseId)).toEqual([small, fifty]);
    expect(result.suggestion).toEqual([small]);
  });

  test('refuses a row that can not be split', async () => {
    await expect(plaidSplitService.candidates(99999)).rejects.toMatchObject({ statusCode: 404 });
    await expect(plaidSplitService.candidates(await bankRow('c', -50))).rejects.toMatchObject({ statusCode: 400 });
    await expect(plaidSplitService.candidates(await bankRow('i', 50, { status: 'ignored' }))).rejects.toMatchObject({ statusCode: 409 });
    await run('UPDATE plaid_accounts SET payment_method_id = NULL WHERE id = ?', [debitAccountId]);
    await expect(plaidSplitService.candidates(await bankRow('u', 50, { accountId: debitAccountId }))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('a pending charge (owner, 2026-11-27)', () => {
  test('can be split; the links stay when it settles, and move with it when it settles under a new reference', async () => {
    const { id, big, small } = await brio({ pending: 1 });
    await plaidSplitService.apply(id, [big, small]);
    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: big });
    expect(await partsOf(id)).toEqual([small]);

    // Dropped by the bank and posted under its own id: linking the posted row takes the split along
    await run("UPDATE plaid_transactions SET removed_at = '2026-11-22' WHERE id = ?", [id]);
    const posted = await bankRow('brio-posted', 326.49, { date: '2026-11-21' });
    await plaidSettlementService.resolveCancelled(id, { action: 'link', postedId: posted });

    expect(await rowOf(posted)).toEqual({ status: 'matched', expenseId: big });
    expect(await partsOf(posted)).toEqual([small]);
  });

  test('a cancelled one deletes every expense it was entered as', async () => {
    const { id, big, small } = await brio({ pending: 1 });
    await plaidSplitService.apply(id, [big, small]);
    await run("UPDATE plaid_transactions SET removed_at = '2026-11-22' WHERE id = ?", [id]);

    await plaidSettlementService.resolveCancelled(id, { action: 'delete_expense' });

    expect(await all(`SELECT id FROM expenses WHERE id IN (${big}, ${small})`)).toEqual([]);
  });
});

describe('apply to a charge still to review', () => {
  test('matches the charge to the expenses: the larger is the primary, the other a split link, and nothing about the expenses changes', async () => {
    const { id, big, small } = await brio();
    const before = await amountsOf([big, small]);

    const result = await plaidSplitService.apply(id, [small, big]);

    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: big });
    expect(await partsOf(id)).toEqual([small]);
    expect(await amountsOf([big, small])).toEqual(before);
    expect(result).toMatchObject({ expenseIds: [small, big], total: 326.49, complete: true, transaction: { status: 'matched', expenseId: big } });
    expect(events('plaid_transaction_updated')[0][4]).toMatchObject({ action: 'match_split', expenseIds: [small, big], primaryExpenseId: big, total: 326.49 });
    expect(events('expense_updated')).toHaveLength(0);
  });

  test('gives each expense the bank posted date, like a plain match', async () => {
    const { id, big, small } = await brio({ date: '2026-11-23' });

    await plaidSplitService.apply(id, [big, small]);

    const rows = await all('SELECT id, date, posted_date AS postedDate FROM expenses WHERE id IN (?, ?) ORDER BY id', [big, small]);
    expect(rows).toEqual([{ id: big, date: '2026-11-20', postedDate: '2026-11-23' }, { id: small, date: '2026-11-20', postedDate: '2026-11-23' }]);
  });

  test('three expenses: the largest is the primary, the others are linked largest first', async () => {
    const id = await bankRow('b', 376.49);
    const small = await expense({ amount: 50 });
    const big = await expense({ amount: 244.02 });
    const mid = await expense({ amount: 82.47 });

    await plaidSplitService.apply(id, [small, big, mid]);

    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: big });
    expect(await partsOf(id)).toEqual([mid, small]);
  });

  test('refuses a set that does not add up to the charge to the cent, or is a single expense, and changes nothing', async () => {
    const { id, big, small } = await brio();
    const extra = await expense({ amount: 0.01 });
    const other = await expense({ amount: 40 });

    await expect(plaidSplitService.apply(id, [big])).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/at least two/) });
    await expect(plaidSplitService.apply(id, [big, other])).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/add up to \$284\.02 but the charge is \$326\.49/) });
    await expect(plaidSplitService.apply(id, [big, small, extra])).rejects.toMatchObject({ statusCode: 400 });
    await expect(plaidSplitService.apply(id, [big, big])).rejects.toMatchObject({ statusCode: 400 });
    await expect(plaidSplitService.apply(id, [])).rejects.toMatchObject({ statusCode: 400 });
    await expect(plaidSplitService.apply(id, [big, 'x'])).rejects.toMatchObject({ statusCode: 400 });
    await expect(plaidSplitService.apply(id, [big, 99999])).rejects.toMatchObject({ statusCode: 404 });

    expect(await rowOf(id)).toEqual({ status: 'new', expenseId: null });
    expect(await partsOf(id)).toEqual([]);
    expect(activityLogService.logEvent).not.toHaveBeenCalled();
  });

  test('refuses another payment method, an expense already linked (as an expense or as a part), a credit and a reviewed row', async () => {
    const { id, big, small } = await brio();
    const debit = await expense({ amount: 82.47, paymentMethodId: DEBIT, method: 'Debit' });
    await expect(plaidSplitService.apply(id, [big, debit])).rejects.toMatchObject({ statusCode: 400 });

    const taken = await expense({ amount: 82.47 });
    await bankRow('taken', 82.47, { status: 'added', expenseId: taken });
    await expect(plaidSplitService.apply(id, [big, taken])).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/"Brio" \(2026-11-20\) is already linked to a bank transaction/) });

    const otherCharge = await bankRow('o', 326.49);
    await plaidSplitService.apply(otherCharge, [big, small]);
    const again = await bankRow('again', 326.49);
    await expect(plaidSplitService.apply(again, [big, small])).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/is already linked to a bank transaction/) });

    await expect(plaidSplitService.apply(await bankRow('c', -100), [big, small])).rejects.toMatchObject({ statusCode: 400 });
    expect(await rowOf(id)).toEqual({ status: 'new', expenseId: null });
    expect(await rowOf(again)).toEqual({ status: 'new', expenseId: null });
  });

  test('a row that was reviewed meanwhile is not split and nothing stays linked', async () => {
    const { id, big, small } = await brio();
    const realFind = plaidSplitRepository.findExpensesByIds.bind(plaidSplitRepository);
    jest.spyOn(plaidSplitRepository, 'findExpensesByIds').mockImplementation(async (...args) => {
      await run("UPDATE plaid_transactions SET status = 'ignored' WHERE id = ?", [id]);
      return realFind(...args);
    });

    await expect(plaidSplitService.apply(id, [big, small])).rejects.toMatchObject({ statusCode: 409 });

    expect(await partsOf(id)).toEqual([]);
    expect(await rowOf(id)).toEqual({ status: 'ignored', expenseId: null });
  });
});

describe('completing a reviewed charge from its expenses', () => {
  test('adds the expense that completes it, and never more than the charge', async () => {
    const { id, big, small } = await brio();
    await run("UPDATE plaid_transactions SET status = 'added', expense_id = ? WHERE id = ?", [big, id]);
    const tooBig = await expense({ amount: 100 });

    await expect(plaidSplitService.apply(id, [tooBig])).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/linked for \$344\.02 but the bank charged \$326\.49/) });
    const result = await plaidSplitService.apply(id, [small]);

    expect(result).toMatchObject({ total: 326.49, complete: true, expenseIds: [big, small] });
    expect(await rowOf(id)).toEqual({ status: 'added', expenseId: big });
    expect(await partsOf(id)).toEqual([small]);
    expect(events('plaid_transaction_updated').pop()[4]).toMatchObject({ action: 'split_added', expenseIds: [small], total: 326.49 });
  });

  test('allows a charge in three parts to be completed one at a time', async () => {
    const id = await bankRow('b', 376.49);
    const a = await expense({ amount: 244.02 });
    const b = await expense({ amount: 82.47 });
    const c = await expense({ amount: 50 });
    await run("UPDATE plaid_transactions SET status = 'matched', expense_id = ? WHERE id = ?", [a, id]);

    expect(await plaidSplitService.apply(id, [b])).toMatchObject({ total: 326.49, complete: false });
    expect(await plaidSplitService.apply(id, [c])).toMatchObject({ total: 376.49, complete: true });
    expect(await partsOf(id)).toEqual([b, c]);
  });

  test('refuses a row linked to no expense (a fixed expense or insurance link)', async () => {
    const { id, big } = await brio();
    await run("UPDATE plaid_transactions SET status = 'matched' WHERE id = ?", [id]);
    await expect(plaidSplitService.apply(id, [big, big + 1])).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('removing an expense from a split', () => {
  async function threeParts() {
    const id = await bankRow('b', 376.49);
    const a = await expense({ amount: 244.02 });
    const b = await expense({ amount: 82.47 });
    const c = await expense({ amount: 50 });
    await plaidSplitService.apply(id, [a, b, c]);
    return { id, a, b, c };
  }

  test('takes a part out: it is unlinked, the others stay', async () => {
    const { id, a, b, c } = await threeParts();

    const result = await plaidSplitService.remove(id, c);

    expect(result.expenseIds).toEqual([a, b]);
    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: a });
    expect(await partsOf(id)).toEqual([b]);
    expect(events('plaid_transaction_updated').pop()[4]).toMatchObject({ action: 'split_removed', expenseId: c, remaining: 2 });
  });

  test('takes the primary out: the next part becomes the bank row expense', async () => {
    const { id, a, b, c } = await threeParts();

    await plaidSplitService.remove(id, a);

    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: b });
    expect(await partsOf(id)).toEqual([c]);
    expect(await get('SELECT COUNT(*) AS n FROM plaid_transactions WHERE expense_id = ?', [a])).toEqual({ n: 0 });
  });

  test('refuses an expense that is not part of the charge and a charge with a single expense', async () => {
    const { id, a, b, c } = await threeParts();
    const stranger = await expense({ amount: 5 });
    await expect(plaidSplitService.remove(id, stranger)).rejects.toMatchObject({ statusCode: 404 });
    await expect(plaidSplitService.remove(99999, a)).rejects.toMatchObject({ statusCode: 404 });
    await plaidSplitService.remove(id, b);
    await plaidSplitService.remove(id, c);

    await expect(plaidSplitService.remove(id, a)).rejects.toMatchObject({ statusCode: 400 });
    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: a });
  });
});

describe('deleting expenses of a split (triggers)', () => {
  async function split() {
    const id = await bankRow('b', 376.49);
    const a = await expense({ amount: 244.02 });
    const b = await expense({ amount: 82.47 });
    const c = await expense({ amount: 50 });
    await plaidSplitService.apply(id, [a, b, c]);
    return { id, a, b, c };
  }

  test('deleting a part removes it and keeps the row linked to the others', async () => {
    const { id, a, b, c } = await split();

    await run('DELETE FROM expenses WHERE id = ?', [b]);

    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: a });
    expect(await partsOf(id)).toEqual([c]);
  });

  test('deleting the primary lets the first part take over; the row only returns to the Inbox when the last expense is gone', async () => {
    const { id, a, b, c } = await split();

    await run('DELETE FROM expenses WHERE id = ?', [a]);
    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: b });
    expect(await partsOf(id)).toEqual([c]);

    await run('DELETE FROM expenses WHERE id = ?', [b]);
    expect(await rowOf(id)).toEqual({ status: 'matched', expenseId: c });
    expect(await partsOf(id)).toEqual([]);

    await run('DELETE FROM expenses WHERE id = ?', [c]);
    expect(await rowOf(id)).toEqual({ status: 'new', expenseId: null });
  });

  test('deleting the expense of a plain (not split) row still returns it to the Inbox', async () => {
    const id = await bankRow('plain', 20);
    const only = await expense({ amount: 20 });
    await run("UPDATE plaid_transactions SET status = 'added', expense_id = ? WHERE id = ?", [only, id]);

    await run('DELETE FROM expenses WHERE id = ?', [only]);

    expect(await rowOf(id)).toEqual({ status: 'new', expenseId: null });
  });

  test('deleting the bank row removes its links and keeps the expenses', async () => {
    const { id, a, b, c } = await split();

    await run('DELETE FROM plaid_transactions WHERE id = ?', [id]);

    expect(await all('SELECT id FROM plaid_split_links')).toEqual([]);
    expect((await all('SELECT id FROM expenses WHERE id IN (?, ?, ?)', [a, b, c])).length).toBe(3);
  });
});

describe('an expense is a primary or a part, never both', () => {
  test('the database refuses it in every direction', async () => {
    const { id, big, small } = await brio();
    await plaidSplitService.apply(id, [big, small]);
    const other = await bankRow('other', 50);
    const free = await expense({ amount: 50 });

    await expect(run('INSERT INTO plaid_split_links (plaid_transaction_id, expense_id) VALUES (?, ?)', [other, big])).rejects.toThrow(/UNIQUE constraint failed/);
    await expect(run('INSERT INTO plaid_split_links (plaid_transaction_id, expense_id) VALUES (?, ?)', [other, small])).rejects.toThrow(/UNIQUE constraint failed/);
    await expect(run('UPDATE plaid_transactions SET expense_id = ? WHERE id = ?', [small, other])).rejects.toThrow(/UNIQUE constraint failed/);
    await expect(run("INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, name, expense_id) VALUES ('x', ?, 1, '2026-11-20', 'X', ?)", [cardAccountId, small])).rejects.toThrow(/UNIQUE constraint failed/);
    await run('UPDATE plaid_transactions SET expense_id = ? WHERE id = ?', [free, other]);   // a free expense is fine
    expect(await rowOf(other)).toMatchObject({ expenseId: free });
  });
});

describe('everything that reads links treats every part as linked', () => {
  test('a later settlement gives every expense of the split the bank posted date, and never changes their amounts', async () => {
    const plaidSettlementService = require('./plaidSettlementService');
    const { id, big, small } = await brio();
    await plaidSplitService.apply(id, [big, small]);

    await plaidSettlementService.applySettlements([{
      plaidTransactionId: id, expenseId: big, settled: true, previousAmount: 326.49, amount: 326.49, postedDate: '2026-11-24'
    }]);

    const rows = await all('SELECT id, amount, posted_date AS postedDate FROM expenses WHERE id IN (?, ?) ORDER BY id', [big, small]);
    expect(rows).toEqual([
      { id: big, amount: 244.02, postedDate: '2026-11-24' },
      { id: small, amount: 82.47, postedDate: '2026-11-24' }
    ]);
  });
  test('the Match candidates and the balance check skip parts', async () => {
    const { id, big, small } = await brio();
    const free = await expense({ amount: 12 });
    await plaidSplitService.apply(id, [big, small]);

    const candidates = await plaidRepository.findUnlinkedExpenses([CREDIT_CARD], '2026-11-01', '2026-11-30');
    const activity = await plaidBalanceCheckRepository.findUnlinkedCardActivity(CREDIT_CARD, '2026-11-01', '2026-11-30');

    expect(candidates.map(e => e.id)).toEqual([free]);
    expect(activity.expenses.map(e => e.id)).toEqual([free]);
  });

  test('the expense list gives every part the bank link, with the split totals', async () => {
    const { id, big, small } = await brio();
    const free = await expense({ amount: 12 });
    await plaidSplitService.apply(id, [big, small]);

    const list = await expenseService.getExpenses({ year: 2026, month: 11 });
    const link = (expenseId) => list.find(e => e.id === expenseId).bankLink;

    expect(link(big)).toMatchObject({ bankTransactionId: id, status: 'matched', amount: 326.49, split: { parts: 2, total: 326.49 } });
    expect(link(small)).toMatchObject({ bankTransactionId: id, status: 'matched', amount: 326.49, split: { parts: 2, total: 326.49 } });
    expect(link(free)).toBeNull();
  });

  test('a split that is not complete says so in its totals', async () => {
    const id = await bankRow('b', 376.49);
    const a = await expense({ amount: 244.02 });
    const b = await expense({ amount: 82.47 });
    await run("UPDATE plaid_transactions SET status = 'added', expense_id = ? WHERE id = ?", [a, id]);
    await plaidSplitService.apply(id, [b]);

    const list = await expenseService.getExpenses({ year: 2026, month: 11 });

    expect(list.find(e => e.id === b).bankLink.split).toEqual({ parts: 2, total: 326.49 });
  });

  test('the Inbox listing offers the split on a charge that two unlinked expenses could be parts of', async () => {
    const { id } = await brio();
    const plain = await bankRow('plain', 20, { name: 'Plain' });
    await expense({ amount: 15 });
    await expense({ amount: 20 });          // as big as the Plain charge: a plain match, not a part of a split

    const { transactions } = await plaidInboxService.listInbox('new', 'spending');
    const split = (rowId) => transactions.find(t => t.id === rowId).split;

    expect(split(id)).toEqual({ suggested: true });
    expect(split(plain)).toBeNull();
  });

  test('the billing cycle check compares a split charge with all its expenses: a complete split is clean, an incomplete one shows what is missing', async () => {
    const { id, big, small } = await brio();
    await run("UPDATE plaid_transactions SET status = 'added', expense_id = ? WHERE id = ?", [big, id]);

    const incomplete = await plaidCycleCheckService._checkCycle(CREDIT_CARD, [cardAccountId], '2026-11-01', '2026-11-30');
    expect(incomplete.difference).toBe(0);
    expect(incomplete.causes.map(c => [c.type, c.effect]).sort()).toEqual([['amount_differs', 82.47], ['tracker_only', -82.47]]);

    await plaidSplitService.apply(id, [small]);

    const complete = await plaidCycleCheckService._checkCycle(CREDIT_CARD, [cardAccountId], '2026-11-01', '2026-11-30');
    expect(complete).toMatchObject({ difference: 0, status: 'match', causes: [] });
  });
});
