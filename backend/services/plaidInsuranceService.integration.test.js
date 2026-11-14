/**
 * Integration tests: plaidInsuranceService -> plaidInsuranceRepository -> real SQLite (spec 3.7, insurer
 * deposits closing insurance claims), plus the Inbox listing's `insurance` flag and the expense list's
 * `insuranceReimbursements`.
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
const plaidInsuranceService = require('./plaidInsuranceService');
const plaidInboxService = require('./plaidInboxService');
const expenseService = require('./expenseService');
const plaidRepository = require('../repositories/plaidRepository');
const plaidInsuranceRepository = require('../repositories/plaidInsuranceRepository');

const DEBIT = 2;
const CREDIT_CARD = 4;

let db;
let debitAccountId;
let amara;
let joliet;

const { run, get, all } = sqlHelpers(() => db);

/** A settled deposit (Plaid amounts are negative for money in). */
const deposit = (transactionId, amount, { date = '2026-11-12', name = 'DSF - Direct deposit', merchantName = null, accountId = debitAccountId } = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, name, merchant_name, pending)
     VALUES (?, ?, ?, 'CAD', ?, ?, ?, 0)`,
    [transactionId, accountId, -amount, date, name, merchantName]
  );

/**
 * An insurance-eligible medical expense with its people allocations.
 * @param {Array<[number, number, number]>} people [personId, originalAmount, amount]
 */
async function claim({ date = '2026-11-10', place = 'Carp Chiro', originalCost = 117, amount = 11.7, status = 'in_progress', people = [] } = {}) {
  const id = await run(
    `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id, insurance_eligible, claim_status, original_cost)
     VALUES (?, ?, ?, 'Tax - Medical', 2, 'Credit Card', ?, 1, ?, ?)`,
    [date, place, amount, CREDIT_CARD, status, originalCost]
  );
  for (const [personId, originalAmount, personAmount] of people) {
    await run('INSERT INTO expense_people (expense_id, person_id, amount, original_amount) VALUES (?, ?, ?, ?)', [id, personId, personAmount, originalAmount]);
  }
  return id;
}

/** Amount, claim status and people amounts of a claim, as stored. */
async function state(expenseId) {
  const { amount, claim_status: status, original_cost: originalCost } = await get('SELECT amount, claim_status, original_cost FROM expenses WHERE id = ?', [expenseId]);
  const people = await all('SELECT person_id AS personId, amount FROM expense_people WHERE expense_id = ? ORDER BY person_id', [expenseId]);
  return { amount, status, originalCost, people: people.map(p => [p.personId, p.amount]) };
}

const txnStatus = async (id) => (await get('SELECT status FROM plaid_transactions WHERE id = ?', [id])).status;
const linkCount = async () => (await get('SELECT COUNT(*) AS n FROM plaid_insurance_links')).n;
const loggedEvents = (type) => activityLogService.logEvent.mock.calls.filter(call => call[0] === type);

/** The DSF deposit of 2026-11-12 and the Carp Chiro claim it pays (Amara $6.10 / Joliet $5.60 of $61 / $56). */
async function dsfFixture() {
  const claimId = await claim({ people: [[amara, 61, 6.1], [joliet, 56, 5.6]] });
  const depositId = await deposit('dsf-1', 105.3);
  return { claimId, depositId };
}

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_insurance_links');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expense_people');
  await run('DELETE FROM expenses');
  await run('DELETE FROM people');
  const itemId = await insertItem(run);
  debitAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, payment_method_id) VALUES (?, 'acc-shared', 'Shared', '5070', ?)", [itemId, DEBIT]);
  amara = await run("INSERT INTO people (name) VALUES ('Amara')");
  joliet = await run("INSERT INTO people (name) VALUES ('Joliet')");
});

describe('plaidInsuranceService', () => {
  test('DSF: the deposit ranks its claim exact, applies leaving $11.70 and the people as entered, and undoes', async () => {
    const { claimId, depositId } = await dsfFixture();
    const older = await claim({ date: '2026-09-01', place: 'Dentist', originalCost: 200, amount: 20, status: 'not_claimed' });
    await claim({ date: '2026-04-01', place: 'Too old', originalCost: 117, amount: 11.7 });

    const listed = await plaidInsuranceService.candidates(depositId);
    expect(listed.deposit).toEqual({ id: depositId, amount: 105.3, date: '2026-11-12', name: 'DSF - Direct deposit' });
    expect(listed.candidates.map(c => [c.expenseId, c.rank])).toEqual([[claimId, 'exact'], [older, null]]);
    expect(listed.candidates[0]).toMatchObject({
      date: '2026-11-10', place: 'Carp Chiro', claimStatus: 'in_progress', originalCost: 117, outOfPocket: 11.7,
      reimbursed: 0, expectedPayout: 105.3,
      people: [
        { personId: amara, name: 'Amara', originalAmount: 61, amount: 6.1 },
        { personId: joliet, name: 'Joliet', originalAmount: 56, amount: 5.6 }
      ]
    });
    expect(listed.suggestion).toEqual([{ expenseId: claimId, amount: 105.3 }]);
    expect(listed.paidAvailable).toBe(0);

    const before = await state(claimId);
    const applied = await plaidInsuranceService.apply(depositId, listed.suggestion, 'tab-1');

    expect(applied.transaction.status).toBe('matched');
    expect(applied.claims).toEqual([expect.objectContaining({
      expenseId: claimId, amount: 105.3, previousOutOfPocket: 11.7, outOfPocket: 11.7, previousStatus: 'in_progress', claimStatus: 'paid',
      people: [{ personId: amara, amount: 6.1 }, { personId: joliet, amount: 5.6 }]
    })]);
    expect(await state(claimId)).toEqual({ amount: 11.7, status: 'paid', originalCost: 117, people: [[amara, 6.1], [joliet, 5.6]] });
    expect(loggedEvents('plaid_transaction_updated')[0][4]).toMatchObject({ action: 'insurance', claims: [{ expenseId: claimId, amount: 105.3 }] });
    expect(loggedEvents('expense_updated')).toEqual([
      ['expense_updated', 'expense', claimId, expect.stringContaining('Carp Chiro'), expect.objectContaining({ amount: 11.7, tabId: 'tab-1' })]
    ]);

    activityLogService.logEvent.mockClear();
    const undone = await plaidInsuranceService.unlink(depositId, 'tab-1');

    expect(undone.transaction.status).toBe('new');
    expect(await state(claimId)).toEqual(before);
    expect(await linkCount()).toBe(0);
    expect(loggedEvents('plaid_transaction_updated')[0][4]).toMatchObject({ action: 'insurance_undone' });
    expect(loggedEvents('expense_updated').map(call => call[2])).toEqual([claimId]);
  });

  test('a claim entered at full cost drops to the co-pay; an insurer paying less raises the out-of-pocket', async () => {
    const full = await claim({ originalCost: 100, amount: 100, status: 'not_claimed', people: [[amara, 60, 60], [joliet, 40, 40]] });
    const short = await claim({ originalCost: 117, amount: 11.7 });
    const first = await deposit('d-1', 90);
    const second = await deposit('d-2', 90, { name: 'Other insurer' });

    await plaidInsuranceService.apply(first, [{ expenseId: full, amount: 90 }]);
    await plaidInsuranceService.apply(second, [{ expenseId: short, amount: 90 }]);

    expect(await state(full)).toEqual({ amount: 10, status: 'paid', originalCost: 100, people: [[amara, 6], [joliet, 4]] });
    expect((await state(short)).amount).toBe(27);
  });

  test('undoing the earlier of two deposits hands the before-the-bank snapshot to the later one', async () => {
    const claimId = await claim({ originalCost: 200, amount: 20, status: 'not_claimed', people: [[amara, 120, 12], [joliet, 80, 8]] });
    const first = await deposit('d-1', 100, { date: '2026-11-11' });
    const second = await deposit('d-2', 80, { date: '2026-11-12', name: 'Second plan' });
    const before = await state(claimId);

    await plaidInsuranceService.apply(first, [{ expenseId: claimId, amount: 100 }]);
    expect(await state(claimId)).toMatchObject({ amount: 100, status: 'paid', people: [[amara, 60], [joliet, 40]] });
    await plaidInsuranceService.apply(second, [{ expenseId: claimId, amount: 80 }]);
    expect(await state(claimId)).toMatchObject({ amount: 20, status: 'paid', people: [[amara, 12], [joliet, 8]] });

    await plaidInsuranceService.unlink(first);
    expect(await txnStatus(first)).toBe('new');
    expect(await txnStatus(second)).toBe('matched');
    expect(await state(claimId)).toMatchObject({ amount: 120, status: 'paid', people: [[amara, 72], [joliet, 48]] });
    expect(await get('SELECT previous_amount, previous_status, previous_people FROM plaid_insurance_links')).toEqual({
      previous_amount: 20, previous_status: 'not_claimed', previous_people: JSON.stringify([{ personId: amara, amount: 12 }, { personId: joliet, amount: 8 }])
    });

    await plaidInsuranceService.unlink(second);
    expect(await state(claimId)).toEqual(before);
  });

  test('one deposit over three claims across two people, pre-filled from the unique combination', async () => {
    const amaraOnly = await claim({ date: '2026-10-01', place: 'Physio', originalCost: 80, amount: 8, people: [[amara, 80, 8]] });
    const julietOnly = await claim({ date: '2026-10-05', place: 'Massage', originalCost: 100, amount: 20, status: 'not_claimed', people: [[joliet, 100, 20]] });
    const both = await claim({ date: '2026-10-20', place: 'Chiro', originalCost: 117, amount: 11.7, people: [[amara, 61, 6.1], [joliet, 56, 5.6]] });
    await claim({ date: '2026-10-21', place: 'Unrelated', originalCost: 1000, amount: 100 });
    const depositId = await deposit('d-1', 72 + 80 + 105.3);

    const { candidates, suggestion } = await plaidInsuranceService.candidates(depositId);
    expect(candidates.filter(c => c.rank === 'combination').map(c => c.expenseId)).toEqual([amaraOnly, both, julietOnly]);
    expect(suggestion).toEqual([
      { expenseId: amaraOnly, amount: 72 }, { expenseId: both, amount: 105.3 }, { expenseId: julietOnly, amount: 80 }
    ]);

    const { claims } = await plaidInsuranceService.apply(depositId, suggestion);

    expect(claims.map(c => c.expenseId)).toEqual([amaraOnly, both, julietOnly]);
    expect(await state(amaraOnly)).toMatchObject({ amount: 8, status: 'paid', people: [[amara, 8]] });
    expect(await state(julietOnly)).toMatchObject({ amount: 20, status: 'paid', people: [[joliet, 20]] });
    expect(await state(both)).toMatchObject({ amount: 11.7, status: 'paid', people: [[amara, 6.1], [joliet, 5.6]] });
    expect(loggedEvents('expense_updated')).toHaveLength(3);
  });

  test('a second plan paying the co-pay of a claim marked Paid by hand: listed when it fits, leaves $0.00', async () => {
    const claimId = await claim({ status: 'paid', people: [[amara, 61, 6.1], [joliet, 56, 5.6]] });
    const other = await claim({ place: 'Other paid', status: 'paid', originalCost: 50, amount: 5 });
    const depositId = await deposit('d-1', 11.7, { name: 'Second plan' });
    const before = await state(claimId);

    const listed = await plaidInsuranceService.candidates(depositId);
    expect(listed.candidates).toEqual([expect.objectContaining({ expenseId: claimId, rank: 'exact', paidWithoutBank: true })]);
    expect(listed.paidAvailable).toBe(1);
    const all = await plaidInsuranceService.candidates(depositId, { includePaid: true });
    expect(all.candidates.map(c => c.expenseId)).toEqual([claimId, other]);

    await plaidInsuranceService.apply(depositId, [{ expenseId: claimId, amount: 11.7 }]);
    expect(await state(claimId)).toMatchObject({ amount: 0, status: 'paid', people: [[amara, 0], [joliet, 0]] });
    expect(loggedEvents('insurance_status_changed')).toHaveLength(0);

    await plaidInsuranceService.unlink(depositId);
    expect(await state(claimId)).toEqual(before);
  });

  test('a claim marked Paid by hand before its payout arrived (DSF, Nov 2026): the payout applies and leaves the co-pay', async () => {
    const claimId = await claim({ status: 'paid', people: [[amara, 61, 6.1], [joliet, 56, 5.6]] });
    const depositId = await deposit('dsf-1', 105.3);
    const before = await state(claimId);

    const listed = await plaidInsuranceService.candidates(depositId);
    expect(listed.candidates).toEqual([expect.objectContaining({ expenseId: claimId, rank: 'exact', expectedPayout: 105.3, unreimbursed: 117 })]);
    expect(listed.suggestion).toEqual([{ expenseId: claimId, amount: 105.3 }]);
    const flags = await plaidInsuranceService.describeDeposits([await plaidRepository.findTransactionById(depositId)]);
    expect(flags.get(depositId)).toEqual({ suggested: true });

    await plaidInsuranceService.apply(depositId, listed.suggestion);
    expect(await state(claimId)).toEqual({ amount: 11.7, status: 'paid', originalCost: 117, people: [[amara, 6.1], [joliet, 5.6]] });

    // A second plan then pays the co-pay
    const secondId = await deposit('plan-2', 11.7, { name: 'Second plan' });
    await plaidInsuranceService.apply(secondId, [{ expenseId: claimId, amount: 11.7 }]);
    expect(await state(claimId)).toMatchObject({ amount: 0, people: [[amara, 0], [joliet, 0]] });

    // Undoing the payout leaves the second plan's deposit, still counted against the original cost
    await plaidInsuranceService.unlink(depositId);
    expect(await state(claimId)).toMatchObject({ amount: 105.3, status: 'paid' });
    await plaidInsuranceService.unlink(secondId);
    expect(await state(claimId)).toEqual(before);
  });

  describe('rejected applications change nothing', () => {
    test.each([
      ['amounts not adding up to the deposit', (a, b) => [{ expenseId: a, amount: 100 }, { expenseId: b, amount: 5 }], /add up to \$105\.00 but the deposit is \$105\.30/],
      ['over-reimbursing a claim', (a, b) => [{ expenseId: a, amount: 5.3 }, { expenseId: b, amount: 100 }], /at most \$80\.00 left/],
      ['the same claim twice', (a) => [{ expenseId: a, amount: 50 }, { expenseId: a, amount: 55.3 }], /only be picked once/],
      ['no claims', () => [], /at least one/],
      ['more than two decimals', (a) => [{ expenseId: a, amount: 105.301 }], /dollars and cents/]
    ])('%s → 400', async (_label, claimsFor, message) => {
      const { claimId, depositId } = await dsfFixture();
      const small = await claim({ place: 'Small', originalCost: 80, amount: 8 });
      const before = [await state(claimId), await state(small)];

      await expect(plaidInsuranceService.apply(depositId, claimsFor(claimId, small)))
        .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(message) });

      expect([await state(claimId), await state(small)]).toEqual(before);
      expect(await txnStatus(depositId)).toBe('new');
      expect(await linkCount()).toBe(0);
      expect(activityLogService.logEvent).not.toHaveBeenCalled();
    });

    test('a non-insurance expense → 400; a charge instead of a deposit → 400', async () => {
      const { depositId } = await dsfFixture();
      const groceries = await run("INSERT INTO expenses (date, amount, type, week, method) VALUES ('2026-11-10', 105.3, 'Groceries', 2, 'Debit')");
      await expect(plaidInsuranceService.apply(depositId, [{ expenseId: groceries, amount: 105.3 }])).rejects.toMatchObject({ statusCode: 400 });

      const charge = await deposit('charge', -20);
      await expect(plaidInsuranceService.candidates(charge)).rejects.toMatchObject({ statusCode: 400 });
      expect(await txnStatus(depositId)).toBe('new');
    });

    test('409 when the row changed meanwhile', async () => {
      const { claimId, depositId } = await dsfFixture();
      const asListed = await plaidRepository.findTransactionById(depositId);
      await run("UPDATE plaid_transactions SET status = 'ignored' WHERE id = ?", [depositId]);
      jest.spyOn(plaidRepository, 'findTransactionById').mockResolvedValueOnce(asListed);
      const before = await state(claimId);

      await expect(plaidInsuranceService.apply(depositId, [{ expenseId: claimId, amount: 105.3 }]))
        .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/changed meanwhile/) });

      expect(await state(claimId)).toEqual(before);
      expect(await linkCount()).toBe(0);
    });

    test('a failure part-way rolls back every claim, link and the deposit status', async () => {
      const { claimId, depositId } = await dsfFixture();
      const second = await claim({ place: 'Physio', originalCost: 80, amount: 8, people: [[amara, 80, 8]] });
      const before = [await state(claimId), await state(second)];
      const actual = plaidInsuranceRepository.updateClaim.bind(plaidInsuranceRepository);
      jest.spyOn(plaidInsuranceRepository, 'updateClaim')
        .mockImplementationOnce(actual)
        .mockRejectedValueOnce(new Error('disk I/O error'));

      await expect(plaidInsuranceService.apply(depositId, [{ expenseId: claimId, amount: 33.3 }, { expenseId: second, amount: 72 }]))
        .rejects.toThrow('disk I/O error');

      expect([await state(claimId), await state(second)]).toEqual(before);
      expect(await txnStatus(depositId)).toBe('new');
      expect(await linkCount()).toBe(0);
    });
  });

  test('unlink of a deposit not applied to claims → 404', async () => {
    const depositId = await deposit('d-1', 10);
    await expect(plaidInsuranceService.unlink(depositId)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('deleting a claim returns the deposit to the Inbox only when no link is left', async () => {
    const { claimId, depositId } = await dsfFixture();
    const second = await claim({ place: 'Physio', originalCost: 80, amount: 8 });
    await deposit('other', 5);
    await plaidInsuranceService.apply(depositId, [{ expenseId: claimId, amount: 33.3 }, { expenseId: second, amount: 72 }]);

    await run('DELETE FROM expenses WHERE id = ?', [claimId]);
    expect(await txnStatus(depositId)).toBe('matched');
    expect(await linkCount()).toBe(1);

    await run('DELETE FROM expenses WHERE id = ?', [second]);
    expect(await txnStatus(depositId)).toBe('new');
    expect(await linkCount()).toBe(0);
    expect(await txnStatus(await get("SELECT id FROM plaid_transactions WHERE transaction_id = 'other'").then(r => r.id))).toBe('new');
  });

  test('the Inbox flags deposits matching an open claim exactly or with a learned description', async () => {
    const { claimId, depositId } = await dsfFixture();
    const other = await deposit('pay', 2000, { name: 'Payroll' });
    const charge = await run(
      "INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, name, pending) VALUES ('coffee', ?, 4.5, '2026-11-12', 'Coffee', 0)",
      [debitAccountId]
    );

    let byId = new Map((await plaidInboxService.listInbox('new')).transactions.map(t => [t.id, t]));
    expect(byId.get(depositId).insurance).toEqual({ suggested: true });
    expect(byId.get(other).insurance).toEqual({ suggested: false });
    expect(byId.get(charge).insurance).toBeNull();

    await plaidInsuranceService.apply(depositId, [{ expenseId: claimId, amount: 105.3 }]);
    const next = await deposit('dsf-2', 42, { date: '2026-11-20', name: 'dsf - direct deposit ' });
    byId = new Map((await plaidInboxService.listInbox('new')).transactions.map(t => [t.id, t]));
    expect(byId.get(next).insurance).toEqual({ suggested: true });
  });

  test('getExpenses lists the bank reimbursements on insurance-eligible expenses', async () => {
    const { claimId, depositId } = await dsfFixture();
    const groceries = await run("INSERT INTO expenses (date, amount, type, week, method) VALUES ('2026-11-10', 20, 'Groceries', 2, 'Debit')");
    const unpaid = await claim({ place: 'Dentist', originalCost: 50, amount: 5, status: 'not_claimed' });
    await plaidInsuranceService.apply(depositId, [{ expenseId: claimId, amount: 105.3 }]);

    const byId = new Map((await expenseService.getExpenses({ year: 2026, month: 11 })).map(e => [e.id, e]));

    expect(byId.get(claimId).insuranceReimbursements).toEqual([
      { plaidTransactionId: depositId, amount: 105.3, date: '2026-11-12', name: 'DSF - Direct deposit' }
    ]);
    expect(byId.get(unpaid).insuranceReimbursements).toEqual([]);
    expect(byId.get(groceries)).not.toHaveProperty('insuranceReimbursements');
  });
});
