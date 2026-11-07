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
const incomeService = require('./incomeService');

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

const stage = (transactionId, { accountId = debitAccountId, amount = 25.5, date = '2026-10-12', authorizedDate = '2026-10-10', name = 'SQ *COFFEE SHOP', merchantName = 'Coffee Shop', pending = 0 } = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, pending)
     VALUES (?, ?, ?, 'CAD', ?, ?, ?, ?, ?)`,
    [transactionId, accountId, amount, date, authorizedDate, name, merchantName, pending]
  );

const addExpense = ({ date = '2026-10-10', amount = 25.5, place = 'Coffee', type = 'Dining Out', paymentMethodId = DEBIT, method = 'Debit', posted_date = null } = {}) =>
  run('INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id) VALUES (?, ?, ?, ?, ?, 2, ?, ?)', [date, posted_date, place, amount, type, method, paymentMethodId]);

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_fixed_expense_links');
  await run('DELETE FROM plaid_income_links');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expenses');
  await run('DELETE FROM fixed_expenses');
  await run('DELETE FROM income_sources');
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

    test('carries the card statement close day, for the pending charge turnover warning', async () => {
      await run('UPDATE payment_methods SET billing_cycle_day = 15 WHERE id = ?', [CREDIT_CARD]);
      await stage('card-charge', { accountId: cardAccountId, pending: 1 });
      await stage('debit-charge');

      const { transactions } = await plaidInboxService.listInbox('new');
      const byId = Object.fromEntries(transactions.map(t => [t.transactionId, t]));

      expect(byId['card-charge']).toMatchObject({ paymentMethodType: 'credit_card', billingCycleDay: 15, pending: true });
      expect(byId['debit-charge'].billingCycleDay).toBeNull();
    });

    test('suggests a category from the place history', async () => {
      await addExpense({ place: 'Coffee Shop', type: 'Dining Out', date: '2025-01-01', amount: 4 });
      await stage('t1');

      const { transactions } = await plaidInboxService.listInbox('new');

      expect(transactions[0].suggestedCategory).toBe('Dining Out');
    });

    test('pre-fills the place chosen before for the same bank description, else the existing place it starts with', async () => {
      const earlier = await addExpense({ place: "Brown's Independent", type: 'Groceries', date: '2026-09-01', amount: 30 });
      await run(
        "INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, name, merchant_name, status, expense_id) VALUES ('old', ?, 30, '2026-09-01', 'Yig Browns 405 - Purchase', 'YIG', 'added', ?)",
        [debitAccountId, earlier]
      );
      await addExpense({ place: 'Sobeys', type: 'Groceries', date: '2026-08-01', amount: 12 });
      await stage('learned', { name: 'Yig Browns 406 - Purchase', merchantName: null });
      await stage('closest', { name: 'SOBEYS #4123', merchantName: null, amount: 40 });
      await stage('unknown', { name: 'SQ *CORNER STORE', merchantName: null, amount: 9 });

      const { transactions } = await plaidInboxService.listInbox('new');
      const byId = Object.fromEntries(transactions.map(t => [t.transactionId, t]));

      expect(byId.learned).toMatchObject({ place: "Brown's Independent", rawName: 'Yig Browns 406 - Purchase', suggestedCategory: 'Groceries' });
      expect(byId.closest).toMatchObject({ place: 'Sobeys', rawName: 'SOBEYS #4123', suggestedCategory: 'Groceries' });
      expect(byId.unknown).toMatchObject({ place: 'SQ *CORNER STORE', suggestedCategory: null });
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

    test('undoes the expense when a sync changed the bank row meanwhile', async () => {
      const plaidRepository = require('../repositories/plaidRepository');
      const id = await stage('t1');
      jest.spyOn(plaidRepository, 'resolveTransaction').mockResolvedValueOnce(false);

      await expect(plaidInboxService.addAsExpense(id, { type: 'Dining Out' })).rejects.toMatchObject({ statusCode: 409 });

      expect((await get('SELECT COUNT(*) AS n FROM expenses')).n).toBe(0);
      expect(activityLogService.logEvent).not.toHaveBeenCalledWith('plaid_transaction_updated', expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ action: 'add' }));
    });

    test('a database error is a server error, not bad input', async () => {
      const id = await stage('t1');
      jest.spyOn(expenseService, 'createExpense').mockRejectedValueOnce(Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' }));

      const err = await plaidInboxService.addAsExpense(id, { type: 'Dining Out' }).catch(e => e);

      expect(err.statusCode).toBeUndefined();
      expect((await get('SELECT status FROM plaid_transactions WHERE id = ?', [id])).status).toBe('new');
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
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_transaction_updated', 'plaid_transaction', id,
        'Matched bank transaction "Coffee Shop" ($25.50, 2026-10-12) to an existing expense',
        { action: 'match', place: 'Coffee Shop', amount: 25.5, date: '2026-10-12', expenseId }
      );
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

  describe('posted date follows the bank for credit cards', () => {
    const cardExpense = (extra = {}) => addExpense({ paymentMethodId: CREDIT_CARD, method: 'Credit Card', date: '2026-10-31', amount: 35.54, ...extra });
    const cardRow = (extra = {}) => stage('card-row', { accountId: cardAccountId, amount: 35.54, date: '2026-11-02', authorizedDate: '2026-10-31', ...extra });
    const expenseRow = (id) => get('SELECT date, posted_date FROM expenses WHERE id = ?', [id]);

    test('matching sets the bank posted date and leaves the purchase date alone', async () => {
      const expenseId = await cardExpense();
      const id = await cardRow();

      const result = await plaidInboxService.matchToExpense(id, expenseId);

      expect(await expenseRow(expenseId)).toEqual({ date: '2026-10-31', posted_date: '2026-11-02' });
      expect(result.postedDateUpdated).toBe(true);
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_transaction_updated', 'plaid_transaction', id,
        expect.stringMatching(/to an existing expense; posted date 2026-11-02$/),
        expect.objectContaining({ action: 'match', expenseId, postedDateUpdated: true })
      );
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'expense_updated', 'expense', expenseId, expect.stringContaining('posted date: none → 2026-11-02'), expect.any(Object)
      );
    });

    test('an estimate the user or the form set is replaced by the bank date', async () => {
      const expenseId = await cardExpense({ posted_date: '2026-11-04' });
      const id = await cardRow();

      await plaidInboxService.matchToExpense(id, expenseId);

      expect(await expenseRow(expenseId)).toEqual({ date: '2026-10-31', posted_date: '2026-11-02' });
    });

    test('posted the same day as the purchase clears an estimate (no posted date)', async () => {
      const expenseId = await cardExpense({ posted_date: '2026-11-02' });
      const id = await cardRow({ date: '2026-10-31', authorizedDate: null });

      await plaidInboxService.matchToExpense(id, expenseId);

      expect(await expenseRow(expenseId)).toEqual({ date: '2026-10-31', posted_date: null });
    });

    test('a bank date before the purchase date is ignored, and an agreeing date is left as is', async () => {
      const early = await cardExpense({ date: '2026-11-05', posted_date: '2026-11-06' });
      const earlyRow = await cardRow({ date: '2026-11-02', authorizedDate: null });
      await plaidInboxService.matchToExpense(earlyRow, early);
      expect(await expenseRow(early)).toEqual({ date: '2026-11-05', posted_date: '2026-11-06' });

      const agreeing = await cardExpense({ posted_date: '2026-11-02' });
      const agreeingRow = await stage('agree', { accountId: cardAccountId, amount: 35.54, date: '2026-11-02', authorizedDate: '2026-10-31' });
      activityLogService.logEvent.mockClear();
      const result = await plaidInboxService.matchToExpense(agreeingRow, agreeing);

      expect(result.postedDateUpdated).toBe(false);
      expect(activityLogService.logEvent).not.toHaveBeenCalledWith('expense_updated', expect.anything(), expect.anything(), expect.anything(), expect.anything());
    });

    test('a pending charge leaves the posted date until it settles; debit accounts have none', async () => {
      const pendingExpense = await cardExpense();
      const pendingRow = await cardRow({ pending: 1 });
      await plaidInboxService.matchToExpense(pendingRow, pendingExpense);
      expect((await expenseRow(pendingExpense)).posted_date).toBeNull();

      const debitExpense = await addExpense({ date: '2026-10-31' });
      const debitRow = await stage('debit-row', { amount: 25.5, date: '2026-11-02', authorizedDate: '2026-10-31' });
      await plaidInboxService.matchToExpense(debitRow, debitExpense);
      expect((await expenseRow(debitExpense)).posted_date).toBeNull();
    });

    test('a pending charge that settles takes the bank date even over an estimate', async () => {
      const expenseId = await cardExpense({ posted_date: '2026-11-04' });
      const id = await cardRow();

      await plaidInboxService.applySettlements([
        { plaidTransactionId: id, expenseId, settled: true, previousAmount: 35.54, amount: 35.54, postedDate: '2026-11-02' }
      ]);

      expect(await expenseRow(expenseId)).toEqual({ date: '2026-10-31', posted_date: '2026-11-02' });
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_transaction_updated', 'plaid_transaction', id,
        expect.stringMatching(/settled: posted date 2026-11-02$/),
        expect.objectContaining({ action: 'settled', postedDateUpdated: true })
      );
    });
  });

  describe('ignore / unignore', () => {
    test('match and ignore fail with 409 instead of claiming success when a sync changed the row meanwhile', async () => {
      const plaidRepository = require('../repositories/plaidRepository');
      const expenseId = await addExpense();
      const id = await stage('t1');
      jest.spyOn(plaidRepository, 'resolveTransaction').mockResolvedValueOnce(false).mockResolvedValueOnce(false);

      await expect(plaidInboxService.matchToExpense(id, expenseId)).rejects.toMatchObject({ statusCode: 409 });
      await expect(plaidInboxService.ignore(id)).rejects.toMatchObject({ statusCode: 409 });
      expect(activityLogService.logEvent).not.toHaveBeenCalled();
    });

    test('round-trips between the inbox and the ignored list', async () => {
      const id = await stage('t1');

      await plaidInboxService.ignore(id);
      expect((await plaidInboxService.listInbox('new')).transactions).toHaveLength(0);
      expect((await plaidInboxService.listInbox('ignored')).transactions.map(t => t.id)).toEqual([id]);

      await plaidInboxService.unignore(id);
      expect((await plaidInboxService.listInbox('new')).transactions.map(t => t.id)).toEqual([id]);

      const actions = activityLogService.logEvent.mock.calls
        .filter(([type]) => type === 'plaid_transaction_updated')
        .map(([, entity, entityId, , metadata]) => [entity, entityId, metadata.action]);
      expect(actions).toEqual([['plaid_transaction', id, 'ignore'], ['plaid_transaction', id, 'unignore']]);
    });

    test('a rejected action logs nothing', async () => {
      const expenseId = await addExpense();
      const id = await stage('t1');
      await plaidInboxService.matchToExpense(id, expenseId);
      activityLogService.logEvent.mockClear();

      await expect(plaidInboxService.ignore(id)).rejects.toMatchObject({ statusCode: 409 });
      expect(activityLogService.logEvent).not.toHaveBeenCalled();
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

  describe('income', () => {
    const addIncome = ({ name = 'JAT', amount = 10848.23, year = 2026, month = 11, category = 'Salary' } = {}) =>
      run('INSERT INTO income_sources (year, month, name, amount, category) VALUES (?, ?, ?, ?, ?)', [year, month, name, amount, category]);
    const stageDeposit = (transactionId, { amount = -10848.23, date = '2026-10-29', name = 'JAT - Direct deposit', accountId = debitAccountId } = {}) =>
      stage(transactionId, { accountId, amount, date, authorizedDate: null, name, merchantName: null });

    test('deposits are flagged and offered expected income in their month, or the next month near its end', async () => {
      const november = await addIncome({ month: 11 });
      const october = await addIncome({ name: 'Bonus', amount: 500, month: 10 });
      await addIncome({ month: 9 });
      await stageDeposit('t-pay');
      await stage('t-card-refund', { accountId: cardAccountId, amount: -20, date: '2026-10-29' });

      const { transactions } = await plaidInboxService.listInbox('new');
      const deposit = transactions.find(t => t.transactionId === 't-pay');
      const refund = transactions.find(t => t.transactionId === 't-card-refund');

      expect(deposit).toMatchObject({ isDeposit: true, canAdd: false, incomeSuggestion: { name: 'JAT - Direct deposit', category: 'Other' } });
      expect(deposit.incomeCandidates.map(s => [s.id, s.nameMatch, s.amountDiffers])).toEqual([[november, true, false], [october, false, true]]);
      expect(refund).toMatchObject({ isDeposit: false, incomeCandidates: [], incomeSuggestion: null });
    });

    test('confirming records when it landed, shows on the income source, and creates nothing else', async () => {
      const pay = await addIncome();
      const id = await stageDeposit('t-pay');

      const result = await plaidInboxService.matchToIncome(id, pay, {}, 'tab-1');

      expect(result.transaction).toMatchObject({ status: 'matched', expenseId: null });
      expect(result.incomeSource).toMatchObject({ id: pay, amount: 10848.23, amountUpdated: false, landedDate: '2026-10-29' });
      expect((await plaidInboxService.listInbox('new')).transactions).toHaveLength(0);
      const { sources } = await incomeService.getMonthlyIncome(2026, 11);
      expect(sources[0].bankConfirmation).toMatchObject({ landedDate: '2026-10-29', amount: 10848.23, plannedAmount: 10848.23, name: 'JAT - Direct deposit' });
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_transaction_updated', 'plaid_transaction', id,
        'Confirmed income "JAT" with bank deposit "JAT - Direct deposit" ($10848.23, 2026-10-29)',
        expect.objectContaining({ action: 'match_income', incomeSourceId: pay, amountUpdated: false })
      );
    });

    test('a different amount updates the income unless declined', async () => {
      const pay = await addIncome({ amount: 10500 });
      const other = await addIncome({ name: 'Other pay', amount: 100 });
      const first = await stageDeposit('t-1', { amount: -10848.23 });
      const second = await stageDeposit('t-2', { amount: -120, name: 'Other pay' });

      expect((await plaidInboxService.matchToIncome(first, pay, {}, 'tab-1')).incomeSource).toMatchObject({ plannedAmount: 10500, amountUpdated: true });
      expect(await get('SELECT amount FROM income_sources WHERE id = ?', [pay])).toEqual({ amount: 10848.23 });
      expect(activityLogService.logEvent).toHaveBeenCalledWith('income_source_updated', 'income_source', pay, expect.any(String), expect.objectContaining({ tabId: 'tab-1' }));

      expect((await plaidInboxService.matchToIncome(second, other, { updateAmount: false })).incomeSource).toMatchObject({ amountUpdated: false });
      expect(await get('SELECT amount FROM income_sources WHERE id = ?', [other])).toEqual({ amount: 100 });
    });

    test('next month the same description suggests the same income source first', async () => {
      const october = await addIncome({ name: 'Paycheque', month: 10 });
      const octDeposit = await stageDeposit('t-oct', { date: '2026-10-15' });
      await plaidInboxService.matchToIncome(octDeposit, october);
      await addIncome({ name: 'Bonus', amount: 10848.23, month: 11 });
      const november = await addIncome({ name: 'Paycheque', amount: 9000, month: 11 });
      await stageDeposit('t-nov', { date: '2026-11-14' });

      const [txn] = (await plaidInboxService.listInbox('new')).transactions;

      expect(txn.incomeCandidates[0]).toMatchObject({ id: november, nameMatch: true });
      expect(txn.incomeSuggestion).toEqual({ name: 'Paycheque', category: 'Salary' });
    });

    test('rejects card credits, purchases, out-of-window months and already-confirmed income', async () => {
      const pay = await addIncome();
      const september = await addIncome({ month: 9 });
      const cardCredit = await stage('t-card', { accountId: cardAccountId, amount: -10848.23, date: '2026-10-29' });
      const purchase = await stage('t-buy', { amount: 50, date: '2026-10-29' });
      const first = await stageDeposit('t-1');
      const second = await stageDeposit('t-2');

      await expect(plaidInboxService.matchToIncome(cardCredit, pay)).rejects.toMatchObject({ statusCode: 400 });
      await expect(plaidInboxService.matchToIncome(purchase, pay)).rejects.toMatchObject({ statusCode: 400 });
      await expect(plaidInboxService.matchToIncome(first, september)).rejects.toMatchObject({ statusCode: 400 });
      await expect(plaidInboxService.matchToIncome(first, 99999)).rejects.toMatchObject({ statusCode: 404 });
      await plaidInboxService.matchToIncome(first, pay);
      await expect(plaidInboxService.matchToIncome(second, pay)).rejects.toMatchObject({ statusCode: 409 });
      expect(await get('SELECT status FROM plaid_transactions WHERE id = ?', [second])).toEqual({ status: 'new' });
    });

    test('Add as income creates an income source in the deposit month and links it', async () => {
      const id = await stageDeposit('t-gift', { amount: -250, date: '2026-10-12', name: 'E-TRANSFER FROM MOM' });

      const result = await plaidInboxService.addAsIncome(id, { name: 'Birthday', category: 'Gifts' }, 'tab-1');

      expect(result.transaction).toMatchObject({ status: 'added' });
      expect(await get('SELECT year, month, name, amount, category FROM income_sources WHERE id = ?', [result.incomeSource.id]))
        .toEqual({ year: 2026, month: 10, name: 'Birthday', amount: 250, category: 'Gifts' });
      const { sources } = await incomeService.getMonthlyIncome(2026, 10);
      expect(sources[0].bankConfirmation).toMatchObject({ landedDate: '2026-10-12', amount: 250, plannedAmount: null });

      const purchase = await stage('t-buy', { amount: 50 });
      await expect(plaidInboxService.addAsIncome(purchase, {})).rejects.toMatchObject({ statusCode: 400 });
      const other = await stageDeposit('t-other');
      await expect(plaidInboxService.addAsIncome(other, { category: 'Lottery' })).rejects.toMatchObject({ statusCode: 400 });
      expect((await get('SELECT COUNT(*) AS n FROM income_sources')).n).toBe(1);
    });

    test('deleting a confirmed income source returns the deposit to the inbox', async () => {
      const pay = await addIncome();
      const id = await stageDeposit('t-pay');
      await plaidInboxService.matchToIncome(id, pay);

      await run('DELETE FROM income_sources WHERE id = ?', [pay]);

      expect((await plaidInboxService.listInbox('new')).transactions.map(t => t.id)).toEqual([id]);
      expect((await get('SELECT COUNT(*) AS n FROM plaid_income_links')).n).toBe(0);
    });
  });

  describe('pending transactions', () => {
    test('are listed as pending and can be added or matched, but never confirm fixed expenses or income', async () => {
      await run("INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_method_id, payment_due_day) VALUES (2026, 10, 'Mortgage', 1500, 'Housing', 'Debit', ?, 10)", [DEBIT]);
      await run("INSERT INTO income_sources (year, month, name, amount, category) VALUES (2026, 10, 'Pay', 500, 'Salary')");
      const charge = await stage('p-charge', { amount: 1500, date: '2026-10-11', authorizedDate: '2026-10-11' });
      const deposit = await stage('p-deposit', { amount: -500, date: '2026-10-11', authorizedDate: null });
      await run("UPDATE plaid_transactions SET pending = 1 WHERE transaction_id IN ('p-charge', 'p-deposit')");

      const { transactions } = await plaidInboxService.listInbox('new');
      const pendingCharge = transactions.find(t => t.id === charge);
      const pendingDeposit = transactions.find(t => t.id === deposit);

      expect(pendingCharge).toMatchObject({ pending: true, canAdd: true, fixedCandidates: [] });
      expect(pendingDeposit).toMatchObject({ pending: true, isDeposit: false, incomeCandidates: [] });
      await expect(plaidInboxService.matchToFixedExpense(charge, 1)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('still pending') });
      await expect(plaidInboxService.addAsIncome(deposit, {})).rejects.toMatchObject({ statusCode: 400 });

      const { expense } = await plaidInboxService.addAsExpense(charge, { type: 'Housing' });
      expect(expense).toMatchObject({ amount: 1500, date: '2026-10-11', posted_date: null });
    });

    test('a settled charge whose expense cannot be updated is reported in the activity log', async () => {
      const id = await stage('p-fail', { accountId: cardAccountId, amount: 40, date: '2026-10-12', authorizedDate: '2026-10-10' });
      const { expense } = await plaidInboxService.addAsExpense(id, { type: 'Other' });
      jest.spyOn(expenseService, 'updateExpense').mockRejectedValueOnce(new Error('Expense date is locked'));

      await plaidInboxService.applySettlements([
        { plaidTransactionId: id, expenseId: expense.id, settled: true, previousAmount: 40, amount: 46, postedDate: '2026-10-12' }
      ]);

      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_transaction_updated', 'plaid_transaction', id,
        expect.stringMatching(/settled, but its expense could not be updated \(Expense date is locked\)\. Check its amount and posted date \(2026-10-12\)/),
        expect.objectContaining({ action: 'settle_failed', expenseId: expense.id })
      );
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
        status: 'matched', name: 'Coffee Shop', rawName: 'SQ *COFFEE SHOP', date: '2026-10-10', amount: 25.5, pending: false, removed: false, disconnected: false
      });
      expect(expenses.find(e => e.id !== matched).bankLink).toBeNull();
    });
  });
});
