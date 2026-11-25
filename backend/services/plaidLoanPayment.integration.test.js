/**
 * Integration tests: a bank payment confirming a fixed expense linked to a loan can also be the loan's payment
 * (spec 3.5): plaidReviewService.matchToFixedExpense / plaidInboxService -> plaidLoanPaymentService -> real SQLite.
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
const loanPaymentService = require('./loanPaymentService');
const plaidLinkRepository = require('../repositories/plaidLinkRepository');

const DEBIT = 2;

let db;
let debitAccountId;

const { run, get, all } = sqlHelpers(() => db);

const stage = (transactionId, { amount = 1500, date = '2026-10-03' } = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, pending)
     VALUES (?, ?, ?, 'CAD', ?, ?, 'LOAN PMT', NULL, 0)`,
    [transactionId, debitAccountId, amount, date, date]
  );
const addLoan = ({ name = 'Home loan', type = 'loan', paidOff = 0 } = {}) =>
  run("INSERT INTO loans (name, initial_balance, start_date, loan_type, is_paid_off) VALUES (?, 100000, '2025-01-01', ?, ?)", [name, type, paidOff]);
const addFixed = ({ name = 'Loan payment', amount = 1500, dueDay = 1, month = 10, loanId = null } = {}) =>
  run(
    "INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_method_id, payment_due_day, linked_loan_id) VALUES (2026, ?, ?, ?, 'Housing', 'Debit', ?, ?, ?)",
    [month, name, amount, DEBIT, dueDay, loanId]
  );
const logPayment = (loanId, date, amount = 1500, notes = 'Auto-logged from fixed expense: Loan payment') =>
  run('INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)', [loanId, amount, date, notes]);

const paymentsOf = (loanId) => all('SELECT id, amount, payment_date AS date, notes FROM loan_payments WHERE loan_id = ? ORDER BY id', [loanId]);
const linkOf = (fixedId) => get('SELECT loan_payment_id AS id FROM plaid_fixed_expense_links WHERE fixed_expense_id = ?', [fixedId]);
const statusOf = async (id) => (await get('SELECT status FROM plaid_transactions WHERE id = ?', [id])).status;
const events = (type) => activityLogService.logEvent.mock.calls.filter(call => call[0] === type);

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_fixed_expense_links');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM fixed_expenses');
  await run('DELETE FROM loan_payments');
  await run('DELETE FROM loans');
  const itemId = await insertItem(run);
  debitAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'acc-debit', 'Chequing', ?)", [itemId, DEBIT]);
});

describe('what the Inbox offers on a fixed expense linked to a loan', () => {
  test('the payment already logged, or recording one; nothing for a fixed expense without a loan or a loan paid off', async () => {
    const loan = await addLoan({ name: 'Home loan' });
    const paidOff = await addLoan({ name: 'Old loan', paidOff: 1 });
    const logged = await logPayment(loan, '2026-10-01');
    await logPayment(loan, '2026-09-20');                                  // more than 5 days from Oct 3
    const mortgage = await addFixed({ name: 'Mortgage', loanId: loan });
    const old = await addFixed({ name: 'Old loan pmt', loanId: paidOff, dueDay: 2 });
    const plain = await addFixed({ name: 'Internet', dueDay: 2 });
    await stage('t-bill');

    const { transactions } = await plaidInboxService.listInbox('new');

    const byId = Object.fromEntries(transactions[0].fixedCandidates.map(f => [f.id, f]));
    expect(byId[mortgage].loanPayment).toEqual({ loanId: loan, loanName: 'Home loan', existing: { id: logged, date: '2026-10-01', amount: 1500 } });
    expect(byId[old].loanPayment).toBeUndefined();
    expect(byId[plain].loanPayment).toBeUndefined();
  });

  test('a payment another bank payment already confirms is not offered again', async () => {
    const loan = await addLoan();
    const logged = await logPayment(loan, '2026-10-01');
    const october = await addFixed({ loanId: loan });
    const first = await stage('t-first', { date: '2026-10-02' });
    await plaidReviewService.matchToFixedExpense(first, october, null, { loanPayment: 'link', loanPaymentId: logged });
    const november = await addFixed({ month: 11, loanId: loan });
    await stage('t-second', { date: '2026-11-02' });

    const { transactions } = await plaidInboxService.listInbox('new');

    expect(transactions[0].fixedCandidates.find(f => f.id === november).loanPayment).toMatchObject({ existing: null });
  });
});

describe('confirming a fixed expense linked to a loan', () => {
  test('recording the payment: at the bank date and amount, shown as from the bank in the payment history', async () => {
    const loan = await addLoan({ name: 'HELOC', type: 'line_of_credit' });
    const interest = await addFixed({ name: 'HELOC interest', amount: 17.47, dueDay: 25, loanId: loan });
    const id = await stage('t-heloc', { amount: 17.78, date: '2026-10-27' });

    const result = await plaidReviewService.matchToFixedExpense(id, interest, 'tab-1', { loanPayment: 'log' });

    const [payment] = await paymentsOf(loan);
    expect(payment).toEqual({ id: expect.any(Number), amount: 17.78, date: '2026-10-27', notes: 'Recorded from bank: HELOC interest' });
    expect(result.fixedExpense).toMatchObject({
      amount: 17.78, amountUpdated: true,
      loanPayment: { id: payment.id, loanId: loan, loanName: 'HELOC', amount: 17.78, date: '2026-10-27', created: true }
    });
    expect((await linkOf(interest)).id).toBe(payment.id);
    expect(await statusOf(id)).toBe('matched');
    const history = await loanPaymentService.getPayments(loan);
    expect(history[0].bankConfirmation).toEqual({
      landedDate: '2026-10-27', amount: 17.78, plannedAmount: 17.47, name: 'LOAN PMT', fixedExpenseName: 'HELOC interest'
    });
    expect(events('loan_payment_added')).toHaveLength(1);
    expect(events('plaid_transaction_updated')[0][4]).toMatchObject({ action: 'match_fixed', loanPaymentId: payment.id, loanPaymentCreated: true });
  });

  test('linking the payment already logged leaves it as it is and shows it as from the bank', async () => {
    const loan = await addLoan();
    const logged = await logPayment(loan, '2026-10-01', 1500);
    const mortgage = await addFixed({ loanId: loan });
    const id = await stage('t-bill', { amount: 1500, date: '2026-10-03' });

    const result = await plaidReviewService.matchToFixedExpense(id, mortgage, null, { loanPayment: 'link', loanPaymentId: logged });

    expect(await paymentsOf(loan)).toEqual([{ id: logged, amount: 1500, date: '2026-10-01', notes: 'Auto-logged from fixed expense: Loan payment' }]);
    expect(result.fixedExpense.loanPayment).toMatchObject({ id: logged, created: false });
    expect((await loanPaymentService.getPayments(loan))[0].bankConfirmation).toMatchObject({ landedDate: '2026-10-03', amount: 1500 });
    expect(events('loan_payment_added')).toHaveLength(0);
  });

  test('without a choice, or with none, no loan payment is recorded or linked', async () => {
    const loan = await addLoan();
    const mortgage = await addFixed({ loanId: loan });
    const id = await stage('t-bill');

    await plaidReviewService.matchToFixedExpense(id, mortgage, null, { loanPayment: 'none' });

    expect(await paymentsOf(loan)).toEqual([]);
    expect((await linkOf(mortgage)).id).toBeNull();
  });

  test('a bad request changes nothing: no loan, a paid-off loan, another loan\'s payment, a payment too far away, a claimed payment', async () => {
    const loan = await addLoan({ name: 'Home loan' });
    const other = await addLoan({ name: 'Car loan' });
    const paidOff = await addLoan({ name: 'Old loan', paidOff: 1 });
    await logPayment(loan, '2026-10-01');
    const far = await logPayment(loan, '2026-09-01');
    const theirs = await logPayment(other, '2026-10-01');
    const claimed = await logPayment(loan, '2026-10-02');
    const earlier = await addFixed({ name: 'Earlier', month: 10, loanId: loan });
    const noLoan = await addFixed({ name: 'Internet', dueDay: 2 });
    const oldPmt = await addFixed({ name: 'Old pmt', dueDay: 2, loanId: paidOff });
    const mortgage = await addFixed({ name: 'Mortgage', dueDay: 2, loanId: loan });
    await plaidReviewService.matchToFixedExpense(await stage('t-claim', { date: '2026-10-02' }), earlier, null, { loanPayment: 'link', loanPaymentId: claimed });
    const id = await stage('t-bill', { date: '2026-10-03' });
    const before = await all('SELECT id FROM loan_payments ORDER BY id');

    const attempt = (fixed, choice) => plaidReviewService.matchToFixedExpense(id, fixed, null, choice);
    await expect(attempt(noLoan, { loanPayment: 'log' })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/not linked to a loan/) });
    await expect(attempt(oldPmt, { loanPayment: 'log' })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/paid off/) });
    await expect(attempt(mortgage, { loanPayment: 'sometimes' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(attempt(mortgage, { loanPayment: 'link' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(attempt(mortgage, { loanPayment: 'link', loanPaymentId: theirs })).rejects.toMatchObject({ statusCode: 400 });
    await expect(attempt(mortgage, { loanPayment: 'link', loanPaymentId: far })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/more than 5 days/) });
    await expect(attempt(mortgage, { loanPayment: 'link', loanPaymentId: claimed })).rejects.toMatchObject({ statusCode: 409 });
    await expect(attempt(mortgage, { loanPayment: 'link', loanPaymentId: 99999 })).rejects.toMatchObject({ statusCode: 409 });

    expect(await statusOf(id)).toBe('new');
    expect(await linkOf(mortgage)).toBeUndefined();
    expect(await all('SELECT id FROM loan_payments ORDER BY id')).toEqual(before);
  });

  test('if naming the payment on the confirmation fails, the recorded payment and the confirmation are undone', async () => {
    const loan = await addLoan();
    const mortgage = await addFixed({ loanId: loan });
    const id = await stage('t-bill');
    jest.spyOn(plaidLinkRepository, 'setLoanPayment').mockRejectedValue(new Error('boom'));

    await expect(plaidReviewService.matchToFixedExpense(id, mortgage, null, { loanPayment: 'log' })).rejects.toThrow('boom');

    expect(await paymentsOf(loan)).toEqual([]);
    expect(await statusOf(id)).toBe('new');
    expect(await linkOf(mortgage)).toBeUndefined();
  });
});

describe('after a loan payment is tied to a bank payment', () => {
  test('deleting the payment leaves the fixed expense confirmed; deleting the fixed expense leaves the payment and frees the bank row', async () => {
    const loan = await addLoan();
    const mortgage = await addFixed({ loanId: loan });
    const id = await stage('t-bill');
    await plaidReviewService.matchToFixedExpense(id, mortgage, null, { loanPayment: 'log' });
    const [payment] = await paymentsOf(loan);

    expect(await loanPaymentService.deletePayment(payment.id)).toBe(true);

    expect(await linkOf(mortgage)).toEqual({ id: null });
    expect(await statusOf(id)).toBe('matched');

    const second = await addFixed({ month: 11, loanId: loan });
    const next = await stage('t-next', { date: '2026-11-03' });
    await plaidReviewService.matchToFixedExpense(next, second, null, { loanPayment: 'log' });
    await run('DELETE FROM fixed_expenses WHERE id = ?', [second]);

    expect(await paymentsOf(loan)).toHaveLength(1);
    expect(await statusOf(next)).toBe('new');
    expect((await loanPaymentService.getPayments(loan))[0].bankConfirmation).toBeNull();
  });
});
