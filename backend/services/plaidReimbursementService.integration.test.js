/**
 * Integration tests: plaidReimbursementService -> repositories -> real SQLite (spec 3.6 refunds on a card, 3.8
 * deposits from people and businesses), the delete triggers, and the places that read the links.
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
const plaidReimbursementService = require('./plaidReimbursementService');
const plaidInboxService = require('./plaidInboxService');
const creditCardPaymentService = require('./creditCardPaymentService');
const expenseService = require('./expenseService');
const plaidBalanceCheckRepository = require('../repositories/plaidBalanceCheckRepository');
const plaidCardPaymentRepository = require('../repositories/plaidCardPaymentRepository');

const DEBIT = 2;
const CREDIT_CARD = 4;

let db;
let debitAccountId;
let cardAccountId;

const { run, get, all } = sqlHelpers(() => db);

/** A settled bank row: `credit` true = money in (a refund on the card, or a deposit), Plaid amounts are negative then. */
const bankRow = (transactionId, amount, { credit = true, accountId, date = '2026-11-16', authorizedDate = null, name = 'BANK ROW', merchantName = null, pending = 0, entity = null } = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, pending, merchant_entity_id)
     VALUES (?, ?, ?, 'CAD', ?, ?, ?, ?, ?, ?)`,
    [transactionId, accountId, credit ? -amount : amount, date, authorizedDate, name, merchantName, pending, entity]
  );
const refundRow = (transactionId, amount, extra = {}) =>
  bankRow(transactionId, amount, { accountId: cardAccountId, name: 'HOMESENSE #123 KANATA', merchantName: 'HomeSense', ...extra });
const depositRow = (transactionId, amount, extra = {}) =>
  bankRow(transactionId, amount, { accountId: debitAccountId, name: 'Interac e-Transfer from Jordan Lee', ...extra });

const expense = ({ date = '2026-11-12', place = 'HomeSense', amount = 50, originalCost = null, paymentMethodId = CREDIT_CARD, method = 'Credit Card', type = 'Household', insurance = 0, notes = null } = {}) =>
  run(
    `INSERT INTO expenses (date, place, notes, amount, original_cost, type, week, method, payment_method_id, insurance_eligible)
     VALUES (?, ?, ?, ?, ?, ?, 2, ?, ?, ?)`,
    [date, place, notes, amount, originalCost, type, method, paymentMethodId, insurance]
  );

const stateOf = (id) => get('SELECT amount, original_cost AS originalCost FROM expenses WHERE id = ?', [id]);
const statusOf = async (id) => (await get('SELECT status FROM plaid_transactions WHERE id = ?', [id])).status;
const payments = () => all('SELECT id, amount, payment_date AS date, notes FROM credit_card_payments ORDER BY id');
const links = () => all('SELECT kind, amount, applied_amount AS applied, previous_original_cost AS previousOriginalCost, previous_amount AS previousAmount, credit_card_payment_id AS paymentId FROM plaid_reimbursement_links ORDER BY id');
const events = (type) => activityLogService.logEvent.mock.calls.filter(call => call[0] === type);

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_reimbursement_links');
  await run('DELETE FROM plaid_card_payment_links');
  await run('DELETE FROM credit_card_payments');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expense_people');
  await run('DELETE FROM expenses');
  await run('DELETE FROM people');
  const itemId = await insertItem(run);
  debitAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, payment_method_id) VALUES (?, 'acc-debit', 'Chequing', '5070', ?)", [itemId, DEBIT]);
  cardAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-card', 'Visa', '1234', 'credit', ?)", [itemId, CREDIT_CARD]);
});

describe('refunds on a card (3.6)', () => {
  test('a partial refund lowers the purchase, is recorded as a payment on the card and leaves what the card was charged', async () => {
    const purchase = await expense({ amount: 50 });
    await expense({ place: 'Sobeys', amount: 50 });                                  // another merchant: not offered
    const id = await refundRow('r1', 13.74);

    const listed = await plaidReimbursementService.candidates(id);
    expect(listed).toMatchObject({ kind: 'refund', row: { amount: 13.74 }, moreAvailable: true });
    expect(listed.candidates.map(c => c.expenseId)).toEqual([purchase]);
    expect(listed.candidates[0]).toMatchObject({ tags: ['merchant'], alreadyEntered: false });
    expect(listed.suggestion).toEqual([{ expenseId: purchase, amount: 13.74, alreadyEntered: false }]);

    const result = await plaidReimbursementService.apply(id, listed.suggestion, 'tab-1');

    expect(result).toMatchObject({ kind: 'refund', transaction: { status: 'matched' }, payment: { amount: 13.74 } });
    expect(await stateOf(purchase)).toEqual({ amount: 36.26, originalCost: 50 });
    expect(await payments()).toEqual([{ id: expect.any(Number), amount: 13.74, date: '2026-11-16', notes: 'Refund: HomeSense' }]);
    expect(await links()).toEqual([{ kind: 'refund', amount: 13.74, applied: 13.74, previousOriginalCost: null, previousAmount: 50, paymentId: expect.any(Number) }]);
    expect(await statusOf(id)).toBe('matched');
    // The card was charged $50.00 and credited $13.74: spending and the card balance each follow their own record
    expect((await get('SELECT COALESCE(original_cost, amount) AS charged FROM expenses WHERE id = ?', [purchase])).charged).toBe(50);
    expect(events('credit_card_payment_added')).toHaveLength(1);
    expect(events('expense_updated')[0][3]).toContain('amount: $50.00 → $36.26');
    expect(events('expense_updated')[0][4]).toMatchObject({ tabId: 'tab-1' });
    expect(events('plaid_transaction_updated')[0][4]).toMatchObject({ action: 'reimbursement', kind: 'refund' });
  });

  test('a reimbursement already entered by hand is recognised first and left unchanged', async () => {
    const other = await expense({ date: '2026-11-14', amount: 50 });
    const entered = await expense({ date: '2026-11-10', amount: 36.26, originalCost: 50 });
    const id = await refundRow('r1', 13.74);

    const listed = await plaidReimbursementService.candidates(id);

    expect(listed.candidates.map(c => c.expenseId)).toEqual([entered, other]);
    expect(listed.candidates[0]).toMatchObject({ alreadyEntered: true, tags: ['entered', 'merchant'] });
    expect(listed.suggestion).toEqual([{ expenseId: entered, amount: 13.74, alreadyEntered: true }]);

    await plaidReimbursementService.apply(id, listed.suggestion);

    expect(await stateOf(entered)).toEqual({ amount: 36.26, originalCost: 50 });
    expect(await links()).toEqual([expect.objectContaining({ applied: 0 })]);
    expect(events('expense_updated')).toHaveLength(0);
    expect((await payments())).toHaveLength(1);

    await plaidReimbursementService.unlink(id);
    expect(await stateOf(entered)).toEqual({ amount: 36.26, originalCost: 50 });
    expect(await payments()).toEqual([]);
  });

  test('claiming it was entered by hand needs a reimbursement of that size', async () => {
    const plain = await expense({ amount: 50 });
    const id = await refundRow('r1', 13.74);

    await expect(plaidReimbursementService.apply(id, [{ expenseId: plain, amount: 13.74, alreadyEntered: true }])).rejects.toMatchObject({ statusCode: 400 });

    expect(await stateOf(plain)).toEqual({ amount: 50, originalCost: null });
    expect(await payments()).toEqual([]);
    expect(await statusOf(id)).toBe('new');
  });

  test('a reimbursement entered by hand covers one bank row: a second one of the same amount is not offered as entered nor accepted', async () => {
    const dinner = await expense({ place: 'Dinner with Jordan', amount: 40, originalCost: 80, paymentMethodId: DEBIT, method: 'Debit' });
    const first = await depositRow('d1', 40);
    const second = await depositRow('d2', 40, { date: '2026-11-17' });

    await plaidReimbursementService.apply(first, [{ expenseId: dinner, amount: 40, alreadyEntered: true }]);

    const listed = await plaidReimbursementService.candidates(second);
    expect(listed.candidates.find(c => c.expenseId === dinner)).toMatchObject({ alreadyEntered: false });
    expect(listed.candidates.find(c => c.expenseId === dinner).tags).not.toContain('entered');
    await expect(plaidReimbursementService.apply(second, [{ expenseId: dinner, amount: 40, alreadyEntered: true }]))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(await statusOf(second)).toBe('new');

    // Applied for real, it lowers what the dinner cost
    await plaidReimbursementService.apply(second, [{ expenseId: dinner, amount: 40 }]);
    expect(await stateOf(dinner)).toEqual({ amount: 0, originalCost: 80 });
  });

  test('two partial refunds on one purchase, undone in either order', async () => {
    const purchase = await expense({ amount: 50 });
    const first = await refundRow('r1', 10, { date: '2026-11-14' });
    const second = await refundRow('r2', 5, { date: '2026-11-16' });
    await plaidReimbursementService.apply(first, [{ expenseId: purchase, amount: 10 }]);
    await plaidReimbursementService.apply(second, [{ expenseId: purchase, amount: 5 }]);

    expect(await stateOf(purchase)).toEqual({ amount: 35, originalCost: 50 });
    expect((await links()).map(l => l.previousOriginalCost)).toEqual([null, null]);

    await plaidReimbursementService.unlink(first);
    expect(await stateOf(purchase)).toEqual({ amount: 45, originalCost: 50 });
    await plaidReimbursementService.unlink(second);
    expect(await stateOf(purchase)).toEqual({ amount: 50, originalCost: null });
    expect(await payments()).toEqual([]);
  });

  test('a full refund keeps the purchase at $0.00 out of pocket, and undo restores it', async () => {
    const purchase = await expense({ amount: 50 });
    const id = await refundRow('r1', 50);

    await plaidReimbursementService.apply(id, [{ expenseId: purchase, amount: 50 }]);
    expect(await stateOf(purchase)).toEqual({ amount: 0, originalCost: 50 });

    await plaidReimbursementService.unlink(id);
    expect(await stateOf(purchase)).toEqual({ amount: 50, originalCost: null });
    expect(await statusOf(id)).toBe('new');
    expect(events('credit_card_payment_deleted')).toHaveLength(1);
  });

  test('a refund on top of a reimbursement entered earlier by hand takes only what is left', async () => {
    const purchase = await expense({ amount: 60, originalCost: 100 });             // $40.00 reimbursed by hand
    const id = await refundRow('r1', 20);

    await plaidReimbursementService.apply(id, [{ expenseId: purchase, amount: 20 }]);
    expect(await stateOf(purchase)).toEqual({ amount: 40, originalCost: 100 });

    await plaidReimbursementService.unlink(id);
    expect(await stateOf(purchase)).toEqual({ amount: 60, originalCost: 100 });
  });

  test('deleting the card payment, or the purchase, undoes the other side', async () => {
    const purchase = await expense({ amount: 50 });
    const id = await refundRow('r1', 13.74);
    await plaidReimbursementService.apply(id, [{ expenseId: purchase, amount: 13.74 }]);
    const [{ id: paymentId }] = await payments();

    await creditCardPaymentService.deletePayment(paymentId);

    expect(await stateOf(purchase)).toEqual({ amount: 50, originalCost: null });
    expect(await statusOf(id)).toBe('new');
    expect(await links()).toEqual([]);
    expect(events('expense_updated').some(call => call[3].includes('refund undone'))).toBe(true);

    await plaidReimbursementService.apply(id, [{ expenseId: purchase, amount: 13.74 }]);
    await run('DELETE FROM expenses WHERE id = ?', [purchase]);

    expect(await payments()).toEqual([]);
    expect(await statusOf(id)).toBe('new');
    expect(await links()).toEqual([]);
  });

  test('deleting the card the refund was recorded on, with its payments, returns the refund too', async () => {
    const purchase = await expense({ amount: 50 });
    const id = await refundRow('r1', 13.74);
    await plaidReimbursementService.apply(id, [{ expenseId: purchase, amount: 13.74 }]);

    await run('DELETE FROM credit_card_payments WHERE payment_method_id = ?', [CREDIT_CARD]);

    expect(await statusOf(id)).toBe('new');
    expect(await stateOf(purchase)).toEqual({ amount: 50, originalCost: null });
  });

  test.each([
    ['an insurance-tracked expense', () => expense({ type: 'Tax - Medical', insurance: 1, originalCost: 60, amount: 6 }), /insurance claim/],
    ['an expense on another card', () => expense({ paymentMethodId: DEBIT, method: 'Debit' }), /another payment method/],
    ['a purchase charged less than the refund', () => expense({ amount: 10 }), /charged less/],
    ['an expense split between people', async () => {
      const id = await expense({ type: 'Tax - Medical' });
      const person = await run("INSERT INTO people (name) VALUES ('Amara')");
      await run('INSERT INTO expense_people (expense_id, person_id, amount) VALUES (?, ?, 50)', [id, person]);
      return id;
    }, /split between people/]
  ])('refuses %s, and nothing is created or changed', async (_label, make, pattern) => {
    const target = await make();
    const id = await refundRow('r1', 20);

    await expect(plaidReimbursementService.apply(id, [{ expenseId: target, amount: 20 }])).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(pattern) });

    expect(await payments()).toEqual([]);
    expect(await links()).toEqual([]);
    expect(await statusOf(id)).toBe('new');
  });

  test('a refund is applied to one purchase for the whole credit, and only a settled credit on a card or a deposit counts', async () => {
    const purchase = await expense({ amount: 50 });
    const other = await expense({ amount: 40, date: '2026-11-13' });
    const id = await refundRow('r1', 20);

    await expect(plaidReimbursementService.apply(id, [{ expenseId: purchase, amount: 10 }, { expenseId: other, amount: 10 }])).rejects.toMatchObject({ statusCode: 400 });
    await expect(plaidReimbursementService.apply(id, [{ expenseId: purchase, amount: 15 }])).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/add up to \$15\.00 but the refund is \$20\.00/) });
    await expect(plaidReimbursementService.apply(await refundRow('pending', 5, { pending: 1 }), [{ expenseId: purchase, amount: 5 }])).rejects.toMatchObject({ statusCode: 400 });
    await expect(plaidReimbursementService.apply(await bankRow('charge', 9, { credit: false, accountId: cardAccountId }), [{ expenseId: purchase, amount: 9 }])).rejects.toMatchObject({ statusCode: 400 });
    expect(await payments()).toEqual([]);
  });

  test('purchases at other merchants are listed on request, by merchant id or name', async () => {
    const byEntity = await expense({ place: 'Home Sense Kanata', amount: 30, date: '2026-11-01' });
    await run("INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, name, status, expense_id, merchant_entity_id) VALUES ('old', ?, 30, '2026-11-01', 'X', 'added', ?, 'ent-1')", [cardAccountId, byEntity]);
    const elsewhere = await expense({ place: 'Sobeys', amount: 30, date: '2026-11-02' });
    const id = await refundRow('r1', 10, { entity: 'ent-1' });

    const narrow = await plaidReimbursementService.candidates(id);
    const wide = await plaidReimbursementService.candidates(id, { all: true });

    expect(narrow.candidates.map(c => c.expenseId)).toEqual([byEntity]);
    expect(wide.candidates.map(c => c.expenseId)).toEqual([byEntity, elsewhere]);
    expect(wide.moreAvailable).toBe(false);
  });

  test('the refund payment is not a card activity the balance check cannot explain, nor a payment another credit can link to', async () => {
    const purchase = await expense({ amount: 50 });
    const id = await refundRow('r1', 13.74);
    await plaidReimbursementService.apply(id, [{ expenseId: purchase, amount: 13.74 }]);
    const [{ id: paymentId }] = await payments();

    const activity = await plaidBalanceCheckRepository.findUnlinkedCardActivity(CREDIT_CARD, '2026-11-01', '2026-11-30');
    const candidates = await plaidCardPaymentRepository.findPaymentsInRange('2026-11-01', '2026-11-30');
    const linked = await plaidCardPaymentRepository.findLinksForPayments([paymentId]);

    expect(activity.payments).toEqual([]);
    expect(candidates.find(p => p.id === paymentId)).toMatchObject({ cardLinked: true });
    expect(linked.get(paymentId)).toEqual([expect.objectContaining({ side: 'card', amount: -13.74 })]);
  });
});

describe('deposits from people and businesses (3.8)', () => {
  test('one deposit over two expenses on different payment methods: the amounts add up, the card is untouched', async () => {
    const dinner = await expense({ place: 'Dinner with Jordan', amount: 80, date: '2026-11-08' });               // on the card
    const movie = await expense({ place: 'Movie night', amount: 40, date: '2026-11-09', paymentMethodId: DEBIT, method: 'Debit' });
    const id = await depositRow('d1', 60);

    await expect(plaidReimbursementService.apply(id, [{ expenseId: dinner, amount: 40 }, { expenseId: movie, amount: 10 }])).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/add up to \$50\.00 but the deposit is \$60\.00/) });
    const result = await plaidReimbursementService.apply(id, [{ expenseId: dinner, amount: 40 }, { expenseId: movie, amount: 20 }], 'tab-2');

    expect(result).toMatchObject({ kind: 'deposit', transaction: { status: 'matched' } });
    expect(await stateOf(dinner)).toEqual({ amount: 40, originalCost: 80 });
    expect(await stateOf(movie)).toEqual({ amount: 20, originalCost: 40 });
    expect(await payments()).toEqual([]);
    expect((await links()).map(l => [l.kind, l.amount, l.applied, l.paymentId])).toEqual([['deposit', 40, 40, null], ['deposit', 20, 20, null]]);
    expect(events('expense_updated')).toHaveLength(2);

    await plaidReimbursementService.unlink(id);
    expect(await stateOf(dinner)).toEqual({ amount: 80, originalCost: null });
    expect(await stateOf(movie)).toEqual({ amount: 40, originalCost: null });
    expect(await statusOf(id)).toBe('new');
    expect(await links()).toEqual([]);
  });

  test('several deposits repay one expense; undoing the earlier one keeps the original cost', async () => {
    const trip = await expense({ place: 'Cottage rental', amount: 300 });
    const first = await depositRow('d1', 100, { date: '2026-11-14' });
    const second = await depositRow('d2', 100, { date: '2026-11-15' });
    await plaidReimbursementService.apply(first, [{ expenseId: trip, amount: 100 }]);
    await plaidReimbursementService.apply(second, [{ expenseId: trip, amount: 100 }]);
    expect(await stateOf(trip)).toEqual({ amount: 100, originalCost: 300 });

    await plaidReimbursementService.unlink(first);
    expect(await stateOf(trip)).toEqual({ amount: 200, originalCost: 300 });
    await plaidReimbursementService.unlink(second);
    expect(await stateOf(trip)).toEqual({ amount: 300, originalCost: null });
  });

  test('a deposit can not repay more than is left, and an insurance claim is refused', async () => {
    const small = await expense({ place: 'Coffee', amount: 10 });
    const claim = await expense({ type: 'Tax - Medical', insurance: 1, originalCost: 100, amount: 10, place: 'Clinic' });
    const id = await depositRow('d1', 30);

    await expect(plaidReimbursementService.apply(id, [{ expenseId: small, amount: 30 }])).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/at most \$10\.00 left/) });
    await expect(plaidReimbursementService.apply(id, [{ expenseId: claim, amount: 30 }])).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Apply to insurance/) });

    expect(await stateOf(small)).toEqual({ amount: 10, originalCost: null });
    expect(await statusOf(id)).toBe('new');
  });

  test('ranks a learned sender first, then an entered reimbursement, an exact amount (or half of it), a shared name, then the newest', async () => {
    const newest = await expense({ place: 'Groceries', amount: 33, date: '2026-11-15' });
    const named = await expense({ place: 'Lunch with Jordan', amount: 33, date: '2026-11-01' });
    const half = await expense({ place: 'Dinner', amount: 50, date: '2026-11-02' });
    const exact = await expense({ place: 'Tickets', amount: 25, date: '2026-11-03' });
    const entered = await expense({ place: 'Gift', amount: 75, originalCost: 100, date: '2026-11-04' });
    const learnedPlace = await expense({ place: 'Hockey fees', amount: 400, date: '2026-10-30' });
    // An earlier deposit with the same description was applied to Hockey fees
    const earlier = await depositRow('earlier', 20, { date: '2026-10-25' });
    const earlierExpense = await expense({ place: 'Hockey fees', amount: 200, date: '2026-10-21' });
    await plaidReimbursementService.apply(earlier, [{ expenseId: earlierExpense, amount: 20 }]);
    const id = await depositRow('d1', 25);

    const { candidates, suggestion } = await plaidReimbursementService.candidates(id);

    const order = candidates.map(c => c.expenseId);
    expect(order.indexOf(learnedPlace)).toBeLessThan(order.indexOf(entered));
    expect(order.indexOf(entered)).toBeLessThan(order.indexOf(exact));
    expect(order.indexOf(exact)).toBeLessThan(order.indexOf(half));
    expect(order.indexOf(half)).toBeLessThan(order.indexOf(named));
    expect(order.indexOf(named)).toBeLessThan(order.indexOf(newest));
    expect(candidates.find(c => c.expenseId === learnedPlace).tags).toContain('learned');
    expect(candidates.find(c => c.expenseId === entered).tags).toContain('entered');
    expect(suggestion).toEqual([{ expenseId: learnedPlace, amount: 25, alreadyEntered: false }]);
  });

  test('only expenses from the 90 days before the deposit, with something left, are candidates', async () => {
    const inside = await expense({ place: 'Inside', date: '2026-08-20' });
    await expense({ place: 'Too old', date: '2026-08-10' });
    await expense({ place: 'After', date: '2026-11-20' });
    await expense({ place: 'Nothing left', amount: 0, originalCost: 20 });
    const id = await depositRow('d1', 20);

    const { candidates } = await plaidReimbursementService.candidates(id);

    expect(candidates.map(c => c.expenseId)).toEqual([inside]);
  });

  test('the expense list carries its bank reimbursements', async () => {
    const dinner = await expense({ place: 'Dinner', amount: 80 });
    const id = await depositRow('d1', 40);
    await plaidReimbursementService.apply(id, [{ expenseId: dinner, amount: 40 }]);

    const listed = (await expenseService.getExpenses({ year: 2026, month: 11 })).find(e => e.id === dinner);

    expect(listed.bankReimbursements).toEqual([expect.objectContaining({ plaidTransactionId: id, kind: 'deposit', amount: 40, date: '2026-11-16' })]);
  });

  test('deleting a repaid expense returns the deposit once it repays no other expense', async () => {
    const dinner = await expense({ place: 'Dinner', amount: 80 });
    const movie = await expense({ place: 'Movie', amount: 40, paymentMethodId: DEBIT, method: 'Debit' });
    const id = await depositRow('d1', 30);
    await plaidReimbursementService.apply(id, [{ expenseId: dinner, amount: 20 }, { expenseId: movie, amount: 10 }]);

    await run('DELETE FROM expenses WHERE id = ?', [dinner]);
    expect(await statusOf(id)).toBe('matched');
    expect((await links()).map(l => l.amount)).toEqual([10]);

    await run('DELETE FROM expenses WHERE id = ?', [movie]);
    expect(await statusOf(id)).toBe('new');
    expect(await links()).toEqual([]);
  });

  test('undo is refused for a row that is not applied, and the row stays put when it was changed meanwhile', async () => {
    const id = await depositRow('d1', 10);
    await expect(plaidReimbursementService.unlink(id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(plaidReimbursementService.unlink(9999)).rejects.toMatchObject({ statusCode: 404 });

    const dinner = await expense({ place: 'Dinner', amount: 80 });
    await plaidReimbursementService.apply(id, [{ expenseId: dinner, amount: 10 }]);
    await run("UPDATE plaid_transactions SET status = 'ignored' WHERE id = ?", [id]);
    await expect(plaidReimbursementService.unlink(id)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('a row reviewed meanwhile is refused with 409 and the expense is left alone', async () => {
    const dinner = await expense({ place: 'Dinner', amount: 80 });
    const id = await depositRow('d1', 40);
    await run("UPDATE plaid_transactions SET status = 'ignored' WHERE id = ?", [id]);

    await expect(plaidReimbursementService.apply(id, [{ expenseId: dinner, amount: 40 }])).rejects.toMatchObject({ statusCode: 409 });

    expect(await stateOf(dinner)).toEqual({ amount: 80, originalCost: null });
  });
});

describe('the Inbox listing', () => {
  test('flags settled credits on a card (not card payments) and settled deposits, and says whether something fits', async () => {
    await expense({ amount: 50 });
    await expense({ place: 'Dinner with Jordan', amount: 20, paymentMethodId: DEBIT, method: 'Debit' });
    await refundRow('refund', 13.74);
    await bankRow('payment', 500, { accountId: cardAccountId, name: 'PAYMENT THANK YOU/PAIEMEN T MERCI' });
    await refundRow('no-match', 5, { name: 'UNKNOWN SHOP', merchantName: 'Unknown Shop' });
    await depositRow('deposit', 20);
    await bankRow('stranger', 7, { accountId: debitAccountId, name: 'Interac e-Transfer from Nobody Known' });
    await bankRow('pending-refund', 3, { accountId: cardAccountId, pending: 1 });

    const { transactions } = await plaidInboxService.listInbox('new');
    const byId = Object.fromEntries(transactions.map(t => [t.transactionId, t.reimbursement]));

    expect(byId.refund).toEqual({ kind: 'refund', suggested: true });
    expect(byId['no-match']).toEqual({ kind: 'refund', suggested: false });
    expect(byId.payment).toBeNull();
    expect(byId.deposit).toEqual({ kind: 'deposit', suggested: true });
    expect(byId.stranger).toEqual({ kind: 'deposit', suggested: false });
    expect(byId['pending-refund']).toBeNull();
  });
});
