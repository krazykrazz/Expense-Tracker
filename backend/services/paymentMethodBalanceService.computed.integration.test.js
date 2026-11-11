/**
 * Integration tests: a credit card's balance is always computed as of today (2.4 R7). The stored
 * payment_methods.current_balance is no longer maintained or read: expenses (including future-dated ones) and
 * payments don't write it, and the payment reminder for a card without a statement uses the computed balance.
 */
const { getDatabase } = require('../database/db');
const creditCardPaymentService = require('./creditCardPaymentService');
const expenseService = require('./expenseService');
const paymentMethodBalanceService = require('./paymentMethodBalanceService');
const reminderService = require('./reminderService');
const { runSql } = require('../test/activityLogTestHelpers');
const { getTodayString } = require('../utils/dateUtils');

const STORED = 9999;

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('credit card balance is computed, not stored', () => {
  let db;
  let paymentMethodId;
  let today;

  const storedBalance = () => new Promise((resolve, reject) => {
    db.get('SELECT current_balance FROM payment_methods WHERE id = ?', [paymentMethodId], (err, row) => (err ? reject(err) : resolve(row.current_balance)));
  });

  const addCard = async ({ billingCycleDay = null } = {}) => {
    const result = await runSql(
      db,
      `INSERT INTO payment_methods (display_name, type, credit_limit, current_balance, payment_due_day, billing_cycle_day, is_active)
       VALUES ('Computed Balance Visa', 'credit_card', 5000, ?, 3, ?, 1)`,
      [STORED, billingCycleDay]
    );
    paymentMethodId = result.lastID;
  };

  const addExpense = (date, amount) => expenseService.createExpense({
    date, place: 'Shop', amount, type: 'Other', payment_method_id: paymentMethodId
  });

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(() => {
    today = getTodayString();
  });

  afterEach(async () => {
    if (paymentMethodId) {
      await runSql(db, 'DELETE FROM credit_card_payments WHERE payment_method_id = ?', [paymentMethodId]);
      await runSql(db, 'DELETE FROM credit_card_billing_cycles WHERE payment_method_id = ?', [paymentMethodId]);
      await runSql(db, 'DELETE FROM expenses WHERE payment_method_id = ?', [paymentMethodId]);
      await runSql(db, 'DELETE FROM payment_methods WHERE id = ?', [paymentMethodId]);
      paymentMethodId = null;
    }
  });

  it('counts activity since the last statement, and payments and expenses no longer write the stored value', async () => {
    await addCard({ billingCycleDay: 13 });
    await runSql(
      db,
      `INSERT INTO credit_card_billing_cycles (
        payment_method_id, cycle_start_date, cycle_end_date,
        actual_statement_balance, calculated_statement_balance,
        is_user_entered, effective_balance, balance_type
      ) VALUES (?, ?, ?, ?, ?, 1, ?, 'actual')`,
      [paymentMethodId, addDays(today, -30), addDays(today, -1), 1000, 1000, 1000]
    );
    await addExpense(today, 200);

    await creditCardPaymentService.recordPayment({ payment_method_id: paymentMethodId, amount: 150, payment_date: today });

    expect(await paymentMethodBalanceService.calculateCurrentBalance(paymentMethodId)).toBe(1050);
    expect(await storedBalance()).toBe(STORED);
  });

  it('a future-dated expense joins the balance on its date, not when it is entered', async () => {
    await addCard();
    await addExpense(today, 200);
    const future = await addExpense(addDays(today, 10), 500);
    await creditCardPaymentService.recordPayment({ payment_method_id: paymentMethodId, amount: 50, payment_date: today });

    expect(await paymentMethodBalanceService.calculateCurrentBalance(paymentMethodId)).toBe(150);
    expect(await paymentMethodBalanceService.calculateProjectedBalance(paymentMethodId)).toBe(650);

    await expenseService.updateExpense(future.id, {
      date: addDays(today, 20), place: 'Shop', amount: 600, type: 'Other', payment_method_id: paymentMethodId
    });
    await expenseService.deleteExpense(future.id);
    expect(await paymentMethodBalanceService.calculateCurrentBalance(paymentMethodId)).toBe(150);
    expect(await storedBalance()).toBe(STORED);
  });

  it('the payment reminder for a card without a statement uses the balance as of today', async () => {
    await addCard();
    await addExpense(today, 200);
    await addExpense(addDays(today, 10), 500);

    const { allCreditCards } = await reminderService.getCreditCardReminders();
    const card = allCreditCards.find(c => c.id === paymentMethodId);

    expect(card.statement_balance).toBeNull();
    expect(card.required_payment).toBe(200);
    expect(card.current_balance).toBe(200);
  });
});
