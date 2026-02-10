/**
 * Script to recalculate credit card balances from existing expenses
 * 
 * This script:
 * 1. Gets all credit card payment methods
 * 2. Sums up all expenses for each credit card
 * 3. Subtracts any recorded payments
 * 4. Updates the current_balance field
 * 
 * Run with: node scripts/recalculateCreditCardBalances.js
 */

const { getDatabase } = require('../database/db');

async function recalculateBalances() {
  console.log('=== Recalculating Credit Card Balances ===\n');
  
  const db = await getDatabase();
  
  // Get all credit cards
  const creditCards = await new Promise((resolve, reject) => {
    db.all(
      'SELECT id, display_name, current_balance FROM payment_methods WHERE type = "credit_card"',
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
  
  console.log(`Found ${creditCards.length} credit cards\n`);
  
  for (const card of creditCards) {
    // Sum expenses for this card
    // Use original_cost when set (for medical expenses with insurance) to reflect full credit card charge
    const expenseTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total FROM expenses WHERE payment_method_id = ?',
        [card.id],
        (err, row) => err ? reject(err) : resolve(row.total)
      );
    });
    
    // Sum payments for this card
    const paymentTotal = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(amount), 0) as total FROM credit_card_payments WHERE payment_method_id = ?',
        [card.id],
        (err, row) => err ? reject(err) : resolve(row.total)
      );
    });
    
    // Calculate new balance
    const newBalance = Math.round((expenseTotal - paymentTotal) * 100) / 100;
    
    console.log(`${card.display_name} (ID: ${card.id}):`);
    console.log(`  Current balance in DB: $${card.current_balance}`);
    console.log(`  Total expenses: $${expenseTotal.toFixed(2)}`);
    console.log(`  Total payments: $${paymentTotal.toFixed(2)}`);
    console.log(`  Calculated balance: $${newBalance.toFixed(2)}`);
    
    if (Math.abs(card.current_balance - newBalance) > 0.01) {
      // Update the balance
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE payment_methods SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newBalance, card.id],
          (err) => err ? reject(err) : resolve()
        );
      });
      console.log(`  ✓ Updated balance to $${newBalance.toFixed(2)}`);
    } else {
      console.log(`  (No update needed)`);
    }
    console.log('');
  }
  
  console.log('=== Done ===');
  process.exit(0);
}

recalculateBalances().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
