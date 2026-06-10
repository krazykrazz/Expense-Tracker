const { getDatabase } = require('../database/db');
const creditCardPaymentService = require('./creditCardPaymentService');
const { runSql } = require('../test/activityLogTestHelpers');
const { getTodayString } = require('../utils/dateUtils');

describe('CreditCardPaymentService current balance integration', () => {
  let db;
  let paymentMethodId;

  beforeAll(async () => {
    db = await getDatabase();
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

  it('recalculates anchored current balance when recording a post-cycle payment', async () => {
    const today = getTodayString();
    const paymentMethodResult = await runSql(
      db,
      `INSERT INTO payment_methods (display_name, type, credit_limit, current_balance, payment_due_day, billing_cycle_day, is_active)
       VALUES (?, 'credit_card', 5000, 9999, 3, 13, 1)`,
      ['Anchor Test Visa']
    );
    paymentMethodId = paymentMethodResult.lastID;

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    await runSql(
      db,
      `INSERT INTO credit_card_billing_cycles (
        payment_method_id, cycle_start_date, cycle_end_date,
        actual_statement_balance, calculated_statement_balance,
        is_user_entered, effective_balance, balance_type
      ) VALUES (?, ?, ?, ?, ?, 1, ?, 'actual')`,
      [paymentMethodId, '2026-05-01', yesterdayStr, 1000, 1000, 1000]
    );

    await runSql(
      db,
      `INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id)
       VALUES (?, ?, 'Post-cycle charge', 200, 'Other', 1, 'Anchor Test Visa', ?)`,
      [today, today, paymentMethodId]
    );

    await creditCardPaymentService.recordPayment({
      payment_method_id: paymentMethodId,
      amount: 150,
      payment_date: today,
      notes: 'Post-cycle payment'
    });

    const updated = await new Promise((resolve, reject) => {
      db.get('SELECT current_balance FROM payment_methods WHERE id = ?', [paymentMethodId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    expect(updated.current_balance).toBe(1050);
  });
});