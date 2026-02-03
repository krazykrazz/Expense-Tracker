/**
 * Script to recalculate statement balances for migrated billing cycles
 * 
 * This script finds billing cycles that were migrated from PDF statements
 * (identified by notes containing "Migrated from PDF statement") and
 * recalculates their calculated_statement_balance based on expenses
 * in that billing period.
 * 
 * Usage: node backend/scripts/recalculateMigratedBillingCycles.js
 */

const { getDatabase } = require('../database/db');

async function recalculateMigratedBillingCycles() {
  console.log('Starting recalculation of migrated billing cycles...\n');
  
  const db = await getDatabase();
  
  // Find all migrated billing cycles
  const migratedCycles = await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        bc.id,
        bc.payment_method_id,
        bc.cycle_start_date,
        bc.cycle_end_date,
        bc.actual_statement_balance,
        bc.calculated_statement_balance,
        bc.notes,
        pm.display_name as card_name
      FROM credit_card_billing_cycles bc
      JOIN payment_methods pm ON pm.id = bc.payment_method_id
      WHERE bc.notes LIKE '%Migrated from PDF statement%'
      ORDER BY bc.payment_method_id, bc.cycle_end_date
    `, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  if (migratedCycles.length === 0) {
    console.log('No migrated billing cycles found.');
    return;
  }
  
  console.log(`Found ${migratedCycles.length} migrated billing cycles to recalculate.\n`);
  
  let updatedCount = 0;
  let errorCount = 0;
  
  for (const cycle of migratedCycles) {
    try {
      // Calculate total expenses in the billing period
      // Use COALESCE(posted_date, date) for effective posting date
      // Use COALESCE(original_cost, amount) for full charge amount
      const expenseTotal = await new Promise((resolve, reject) => {
        db.get(`
          SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total
          FROM expenses
          WHERE payment_method_id = ?
            AND COALESCE(posted_date, date) >= ?
            AND COALESCE(posted_date, date) <= ?
        `, [cycle.payment_method_id, cycle.cycle_start_date, cycle.cycle_end_date], (err, row) => {
          if (err) reject(err);
          else resolve(row?.total || 0);
        });
      });
      
      // Round to 2 decimal places
      const calculatedBalance = Math.round(expenseTotal * 100) / 100;
      
      // Update the billing cycle record
      await new Promise((resolve, reject) => {
        db.run(`
          UPDATE credit_card_billing_cycles
          SET calculated_statement_balance = ?
          WHERE id = ?
        `, [calculatedBalance, cycle.id], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      console.log(`✓ ${cycle.card_name}: ${cycle.cycle_start_date} to ${cycle.cycle_end_date}`);
      console.log(`  Calculated balance: $${calculatedBalance.toFixed(2)}`);
      
      updatedCount++;
    } catch (err) {
      console.error(`✗ Error updating cycle ${cycle.id}:`, err.message);
      errorCount++;
    }
  }
  
  console.log(`\nRecalculation complete:`);
  console.log(`  Updated: ${updatedCount}`);
  console.log(`  Errors: ${errorCount}`);
}

// Run the script
recalculateMigratedBillingCycles()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  });
