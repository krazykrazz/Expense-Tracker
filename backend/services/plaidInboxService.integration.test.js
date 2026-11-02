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
const fixedExpenseService = require('./fixedExpenseService');

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
  await run('DELETE FROM plaid_fixed_expense_links');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expenses');
  await run('DELETE FROM fixed_expenses');
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

    test('reimbursed and insurance-tracked expenses are offered on the amount actually charged', async () => {
      const reimbursed = await run(
        "INSERT INTO expenses (date, place, amount, original_cost, type, week, method, payment_method_id) VALUES ('2026-10-10', 'Hardware', 15, 25.5, 'Other', 2, 'Debit', ?)",
        [DEBIT]
      );
      const insured = await run(
        "INSERT INTO expenses (date, place, amount, original_cost, type, week, method, payment_method_id, insurance_eligible, claim_status) VALUES ('2026-10-11', 'Clinic', 5.5, 25.5, 'Tax - Medical', 2, 'Debit', ?, 1, 'paid')",
        [DEBIT]
      );
      // Out-of-pocket equals the bank amount, but the card was charged more: not a candidate
      await run(
        "INSERT INTO expenses (date, place, amount, original_cost, type, week, method, payment_method_id) VALUES ('2026-10-10', 'Other shop', 25.5, 40, 'Other', 2, 'Debit', ?)",
        [DEBIT]
      );
      const id = await stage('t1');

      const { transactions } = await plaidInboxService.listInbox('new');

      expect(transactions[0].matchCandidates).toEqual([
        expect.objectContaining({ id: reimbursed, amount: 15, originalCost: 25.5, chargedAmount: 25.5 }),
        expect.objectContaining({ id: insured, amount: 5.5, originalCost: 25.5, chargedAmount: 25.5 })
      ]);

      await plaidInboxService.matchToExpense(id, insured);
      const expenses = await expenseService.getExpenses({ year: 2026, month: 10 });
      expect(expenses.find(e => e.id === insured)).toMatchObject({ amount: 5.5, original_cost: 25.5, bankLink: expect.objectContaining({ status: 'matched', amount: 25.5 }) });
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

  describe('fixed expenses', () => {
    const addFixed = ({ name = 'Mortgage', amount = 1500, dueDay = 1, year = 2026, month = 10, paymentType = 'Debit', paymentMethodId = null } = {}) =>
      run(
        "INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_method_id, payment_due_day) VALUES (?, ?, ?, ?, 'Housing', ?, ?, ?)",
        [year, month, name, amount, paymentType, paymentMethodId, dueDay]
      );

    test('offers fixed expenses on the same payment method due around the landing date, by name or id', async () => {
      const mortgage = await addFixed({ name: 'Mortgage', amount: 1500, dueDay: 1 });
      const internet = await addFixed({ name: 'Internet', amount: 80, dueDay: 30, month: 9, paymentType: 'legacy-name', paymentMethodId: DEBIT });
      await addFixed({ name: 'Too late', amount: 1500, dueDay: 1, month: 9 });          // due Sep 1: Oct 3 is 32 days late
      await addFixed({ name: 'Other card', amount: 1500, dueDay: 1, paymentType: 'Credit Card' });
      await stage('t-bill', { amount: 1500, date: '2026-10-03', authorizedDate: '2026-10-03', name: 'MORTGAGE PMT', merchantName: null });

      const { transactions } = await plaidInboxService.listInbox('new');

      expect(transactions[0].fixedCandidates.map(f => f.name)).toEqual(['Mortgage', 'Internet']);
      expect(transactions[0].fixedCandidates[0]).toMatchObject({ id: mortgage, expectedDate: '2026-10-01', amountDiffers: false });
      expect(transactions[0].fixedCandidates[1]).toMatchObject({ id: internet, expectedDate: '2026-09-30', amountDiffers: true });
    });

    test('matching confirms the fixed expense, records when it landed, and creates no expense', async () => {
      const mortgage = await addFixed({ amount: 1500, dueDay: 1 });
      const id = await stage('t-bill', { amount: 1500, date: '2026-10-03', authorizedDate: '2026-10-02' });

      const result = await plaidInboxService.matchToFixedExpense(id, mortgage, 'tab-1');

      expect(result.transaction).toMatchObject({ status: 'matched', expenseId: null });
      expect(result.fixedExpense).toMatchObject({ id: mortgage, plannedAmount: 1500, amount: 1500, amountUpdated: false, landedDate: '2026-10-03' });
      expect((await get('SELECT COUNT(*) AS n FROM expenses')).n).toBe(0);
      expect((await plaidInboxService.listInbox('new')).transactions).toHaveLength(0);

      const { items } = await fixedExpenseService.getMonthlyFixedExpensesWithLoans(2026, 10);
      expect(items.find(i => i.id === mortgage).bankConfirmation).toMatchObject({
        landedDate: '2026-10-03', amount: 1500, plannedAmount: 1500, expectedDate: '2026-10-01', daysFromDue: 2
      });
    });

    test('a different bank amount updates the planned amount through the fixed expense service', async () => {
      const heloc = await addFixed({ name: 'HELOC Interest', amount: 17.47, dueDay: 25, month: 10 });
      const id = await stage('t-heloc', { amount: 17.78, date: '2026-10-27', authorizedDate: '2026-10-27' });

      const result = await plaidInboxService.matchToFixedExpense(id, heloc, 'tab-1');

      expect(result.fixedExpense).toMatchObject({ plannedAmount: 17.47, amount: 17.78, amountUpdated: true });
      expect(await get('SELECT amount FROM fixed_expenses WHERE id = ?', [heloc])).toEqual({ amount: 17.78 });
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'fixed_expense_updated', 'fixed_expense', heloc, expect.stringContaining('$17.47 → $17.78'), expect.objectContaining({ tabId: 'tab-1' })
      );
      const { items } = await fixedExpenseService.getMonthlyFixedExpensesWithLoans(2026, 10);
      expect(items[0].bankConfirmation).toMatchObject({ amount: 17.78, plannedAmount: 17.47 });
    });

    test('if the amount cannot be updated, the link is undone', async () => {
      const legacy = await addFixed({ amount: 50, dueDay: 1, paymentType: 'Fixed', paymentMethodId: DEBIT });
      const id = await stage('t-legacy', { amount: 55, date: '2026-10-02', authorizedDate: '2026-10-02' });

      await expect(plaidInboxService.matchToFixedExpense(id, legacy)).rejects.toMatchObject({ statusCode: 400 });

      expect(await get('SELECT status FROM plaid_transactions WHERE id = ?', [id])).toEqual({ status: 'new' });
      expect((await get('SELECT COUNT(*) AS n FROM plaid_fixed_expense_links')).n).toBe(0);
      expect(await get('SELECT amount FROM fixed_expenses WHERE id = ?', [legacy])).toEqual({ amount: 50 });
    });

    test('rejects fixed expenses on another payment method, outside the window, or already confirmed', async () => {
      const card = await addFixed({ paymentType: 'Credit Card' });
      const septemberDue = await addFixed({ month: 9 });
      const mortgage = await addFixed();
      const first = await stage('t1', { amount: 1500, date: '2026-10-02', authorizedDate: '2026-10-02' });
      const second = await stage('t2', { amount: 1500, date: '2026-10-03', authorizedDate: '2026-10-03' });

      await expect(plaidInboxService.matchToFixedExpense(first, card)).rejects.toMatchObject({ statusCode: 400 });
      await expect(plaidInboxService.matchToFixedExpense(first, septemberDue)).rejects.toMatchObject({ statusCode: 400 });
      await expect(plaidInboxService.matchToFixedExpense(first, 99999)).rejects.toMatchObject({ statusCode: 404 });
      await plaidInboxService.matchToFixedExpense(first, mortgage);
      await expect(plaidInboxService.matchToFixedExpense(second, mortgage)).rejects.toMatchObject({ statusCode: 409 });
      expect(await get('SELECT status FROM plaid_transactions WHERE id = ?', [second])).toEqual({ status: 'new' });
    });

    test('deleting a confirmed fixed expense returns the bank transaction to the inbox', async () => {
      const mortgage = await addFixed();
      const id = await stage('t-bill', { amount: 1500, date: '2026-10-02', authorizedDate: '2026-10-02' });
      await plaidInboxService.matchToFixedExpense(id, mortgage);

      await run('DELETE FROM fixed_expenses WHERE id = ?', [mortgage]);

      expect((await plaidInboxService.listInbox('new')).transactions.map(t => t.id)).toEqual([id]);
      expect((await get('SELECT COUNT(*) AS n FROM plaid_fixed_expense_links')).n).toBe(0);
    });

    test('copied-forward months are confirmed separately', async () => {
      const october = await addFixed({ month: 10 });
      const november = await addFixed({ month: 11 });
      const octTxn = await stage('t-oct', { amount: 1500, date: '2026-10-01', authorizedDate: '2026-10-01' });
      await plaidInboxService.matchToFixedExpense(octTxn, october);
      await stage('t-nov', { amount: 1500, date: '2026-11-02', authorizedDate: '2026-11-02' });

      const { transactions } = await plaidInboxService.listInbox('new');

      expect(transactions[0].fixedCandidates.map(f => f.id)).toEqual([november]);
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
