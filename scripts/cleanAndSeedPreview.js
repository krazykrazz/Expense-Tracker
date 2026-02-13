/**
 * Clean up previous seed attempt and re-seed for billing cycle automation testing.
 */
const { initializeDatabase, getDatabase } = require('../database/db');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function seed() {
  await initializeDatabase();
  const db = await getDatabase();

  // Clean up any previous test data
  const existing = await all(db, "SELECT id FROM payment_methods WHERE display_name = 'Test Visa'");
  for (const pm of existing) {
    await run(db, "DELETE FROM expenses WHERE payment_method_id = ?", [pm.id]);
    await run(db, "DELETE FROM credit_card_billing_cycles WHERE payment_method_id = ?", [pm.id]);
    await run(db, "DELETE FROM payment_methods WHERE id = ?", [pm.id]);
    console.log('Cleaned up old payment method ID:', pm.id);
  }

  // Create a credit card with billing_cycle_day = 10
  const pmId = await run(db,
    `INSERT INTO payment_methods (full_name, display_name, type, credit_limit, billing_cycle_day, is_active)
     VALUES ('Test Visa Card', 'Test Visa', 'credit_card', 5000, 10, 1)`
  );
  console.log('Created payment method ID:', pmId);

  // Add expenses within the Jan 11 - Feb 10 billing cycle
  // Schema: date, place, notes, amount, type, week, method, payment_method_id
  const expenses = [
    { date: '2026-01-15', place: 'Amazon', amount: 49.99, type: 'Other', week: 3 },
    { date: '2026-01-22', place: 'Costco', amount: 125.50, type: 'Groceries', week: 4 },
    { date: '2026-02-01', place: 'Netflix', amount: 15.99, type: 'Entertainment', week: 1 },
    { date: '2026-02-05', place: 'Shell Gas', amount: 65.00, type: 'Gas', week: 1 },
    { date: '2026-02-08', place: 'Walmart', amount: 87.32, type: 'Groceries', week: 2 },
  ];

  for (const exp of expenses) {
    await run(db,
      `INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id)
       VALUES (?, ?, ?, ?, ?, 'Credit Card', ?)`,
      [exp.date, exp.place, exp.amount, exp.type, exp.week, pmId]
    );
    console.log('  Created expense:', exp.place, '$' + exp.amount);
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  console.log('');
  console.log('Seed complete!');
  console.log('  Credit card ID:', pmId, '(Test Visa)');
  console.log('  Billing cycle day: 10');
  console.log('  Completed cycle: Jan 11 - Feb 10, 2026');
  console.log('  Total expenses in cycle: $' + total.toFixed(2));
  console.log('');
  console.log('Now restart the container. The scheduler will run ~60s after startup');
  console.log('and auto-generate a billing cycle record for this card.');
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
