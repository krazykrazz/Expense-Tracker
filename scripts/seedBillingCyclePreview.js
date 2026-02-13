/**
 * Seed script for billing cycle automation preview testing.
 * Creates a credit card with billing_cycle_day=10 and expenses
 * in the Jan 11 - Feb 10 cycle window, so the scheduler will
 * detect a completed cycle and auto-generate a billing cycle record.
 *
 * Run inside the preview container:
 *   docker exec expense-tracker-preview node /app/scripts/seedBillingCyclePreview.js
 */
const { initializeDatabase, getDatabase } = require('../database/db');

async function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

async function seed() {
  await initializeDatabase();
  const db = await getDatabase();

  // Create a credit card with billing_cycle_day = 10
  const pmId = await run(db,
    `INSERT INTO payment_methods (full_name, display_name, type, credit_limit, billing_cycle_day, is_active)
     VALUES ('Test Visa Card', 'Test Visa', 'credit_card', 5000, 10, 1)`
  );
  console.log('Created payment method ID:', pmId);

  // Add expenses within the Jan 11 - Feb 10 billing cycle
  const expenses = [
    { date: '2026-01-15', place: 'Amazon', amount: 49.99, category: 'Shopping' },
    { date: '2026-01-22', place: 'Costco', amount: 125.50, category: 'Groceries' },
    { date: '2026-02-01', place: 'Netflix', amount: 15.99, category: 'Entertainment' },
    { date: '2026-02-05', place: 'Shell Gas', amount: 65.00, category: 'Transportation' },
    { date: '2026-02-08', place: 'Walmart', amount: 87.32, category: 'Groceries' },
  ];

  for (const exp of expenses) {
    await run(db,
      `INSERT INTO expenses (date, place, amount, category, payment_method_id)
       VALUES (?, ?, ?, ?, ?)`,
      [exp.date, exp.place, exp.amount, exp.category, pmId]
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
