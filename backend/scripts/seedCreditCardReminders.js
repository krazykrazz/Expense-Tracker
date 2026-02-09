const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

const dbPath = getDatabasePath();

console.log('Seeding credit card reminder test data...');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
});

// Get current date info
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed

db.serialize(() => {
  // First, get all credit card payment methods
  db.all(`SELECT id, display_name FROM payment_methods WHERE type = 'credit_card'`, [], (err, cards) => {
    if (err) {
      console.error('Error fetching credit cards:', err);
      db.close();
      process.exit(1);
    }

    if (cards.length === 0) {
      console.log('No credit cards found. Please run seedTestData.js first.');
      db.close();
      process.exit(1);
    }

    console.log(`Found ${cards.length} credit cards`);

    // Delete existing billing cycles for current month
    db.run(`DELETE FROM credit_card_billing_cycles WHERE cycle_end_date LIKE '${currentYear}-${String(currentMonth).padStart(2, '0')}%'`, (err) => {
      if (err) {
        console.error('Error deleting existing cycles:', err);
        db.close();
        process.exit(1);
      }
      console.log('Cleared existing billing cycles for current month');

      // First, update payment_due_day and billing_cycle_day for each card
      const updateCardStmt = db.prepare(`
        UPDATE payment_methods 
        SET payment_due_day = ?, billing_cycle_day = ?, current_balance = ?
        WHERE id = ?
      `);
      
      cards.forEach((card, index) => {
        const dueDay = 5 + (index * 5); // Days 5, 10, 15, 20, etc.
        const billingCycleDay = 1 + (index * 3); // Days 1, 4, 7, 10, etc. (must be 1-31)
        const currentBalance = 500 + (index * 100); // Set a balance so reminders show
        updateCardStmt.run(dueDay, billingCycleDay, currentBalance, card.id);
      });
      
      updateCardStmt.finalize();
      console.log('Updated payment_due_day, billing_cycle_day, and current_balance for all cards');

      // Create billing cycles for each card
      const billingCycles = [];
      cards.forEach((card, index) => {
        // Vary the due dates and statement balances
        const dueDay = 5 + (index * 5); // Days 5, 10, 15, 20, etc.
        const hasActualBalance = index % 2 === 0; // Alternate cards have actual statement balances
        
        // Calculate dates for current billing cycle
        const cycleStartDate = new Date(currentYear, currentMonth - 1, 1);
        const cycleEndDate = new Date(currentYear, currentMonth, 0); // Last day of current month
        const dueDate = new Date(currentYear, currentMonth, dueDay); // Due date in next month
        
        // Both fields are required, but actual_statement_balance indicates if user entered it
        const statementBalance = 500 + (index * 100);
        
        billingCycles.push({
          payment_method_id: card.id,
          cycle_start_date: cycleStartDate.toISOString().split('T')[0],
          cycle_end_date: cycleEndDate.toISOString().split('T')[0],
          actual_statement_balance: statementBalance,
          calculated_statement_balance: statementBalance,
          due_date: dueDate.toISOString().split('T')[0]
        });

        console.log(`  - ${card.display_name}: Due ${dueDate.toISOString().split('T')[0]}, Balance: $${statementBalance}`);
      });

      // Insert billing cycles
      const insertStmt = db.prepare(`
        INSERT INTO credit_card_billing_cycles 
        (payment_method_id, cycle_start_date, cycle_end_date, actual_statement_balance, calculated_statement_balance, due_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      billingCycles.forEach(cycle => {
        insertStmt.run(
          cycle.payment_method_id,
          cycle.cycle_start_date,
          cycle.cycle_end_date,
          cycle.actual_statement_balance,
          cycle.calculated_statement_balance,
          cycle.due_date
        );
      });

      insertStmt.finalize((err) => {
        if (err) {
          console.error('Error inserting billing cycles:', err);
          db.close();
          process.exit(1);
        }

        console.log('\n✓ Billing cycles created successfully!');
        console.log('\nTo see reminders:');
        console.log('1. Restart your backend server');
        console.log('2. Refresh your frontend');
        console.log('3. Look for credit card reminder banners on the dashboard');
        
        db.close();
      });
    });
  });
});
