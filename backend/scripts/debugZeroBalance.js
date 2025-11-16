const { getDatabase } = require('../database/db');
const loanBalanceService = require('../services/loanBalanceService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');

async function debugZeroBalance() {
  console.log('=== Debugging Zero Balance Calculation ===\n');

  try {
    const db = await getDatabase();

    // Create a test loan
    console.log('Creating test loan...');
    const testLoan = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO loans (name, initial_balance, start_date, loan_type, notes)
         VALUES (?, ?, ?, ?, ?)`,
        ['Debug Loan', 1000, '2024-01-01', 'loan', 'Debug test'],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
    console.log(`✓ Created loan with ID: ${testLoan.id}\n`);

    // Add two balance entries
    console.log('Adding balance entries...');
    await loanBalanceService.createOrUpdateBalance({
      loan_id: testLoan.id,
      year: 2024,
      month: 1,
      remaining_balance: 1000,
      rate: 5.0
    });
    console.log('  Added: 2024-01 - $1000');

    await loanBalanceService.createOrUpdateBalance({
      loan_id: testLoan.id,
      year: 2024,
      month: 2,
      remaining_balance: 500,
      rate: 5.0
    });
    console.log('  Added: 2024-02 - $500\n');

    // Check current state
    let loan = await loanRepository.findById(testLoan.id);
    console.log(`Current estimated months: ${loan.estimated_months_left}`);
    console.log(`Current is_paid_off: ${loan.is_paid_off}\n`);

    // Now add zero balance
    console.log('Adding zero balance entry...');
    await loanBalanceService.createOrUpdateBalance({
      loan_id: testLoan.id,
      year: 2024,
      month: 3,
      remaining_balance: 0,
      rate: 5.0
    });
    console.log('  Added: 2024-03 - $0\n');

    // Check balance history
    const balanceHistory = await loanBalanceRepository.getBalanceHistory(testLoan.id);
    console.log('Balance history (chronological):');
    balanceHistory.forEach(entry => {
      console.log(`  ${entry.year}-${entry.month.toString().padStart(2, '0')}: $${entry.remaining_balance}`);
    });
    console.log();

    // Get current balance
    const currentBalanceEntry = await loanRepository.getCurrentBalance(testLoan.id);
    console.log(`Current balance entry: ${currentBalanceEntry ? currentBalanceEntry.remaining_balance : 'none'}\n`);

    // Test the calculation function directly
    const estimatedMonths = loanBalanceService.calculateEstimatedMonths(
      balanceHistory,
      currentBalanceEntry.remaining_balance
    );
    console.log(`Direct calculation result: ${estimatedMonths}\n`);

    // Check final loan state
    loan = await loanRepository.findById(testLoan.id);
    console.log('Final loan state:');
    console.log(`  estimated_months_left: ${loan.estimated_months_left}`);
    console.log(`  is_paid_off: ${loan.is_paid_off}`);

    // Cleanup
    console.log('\nCleaning up...');
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_balances WHERE loan_id = ?', [testLoan.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loans WHERE id = ?', [testLoan.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Cleanup complete');

  } catch (error) {
    console.error('Error during debugging:', error);
    process.exit(1);
  }
}

debugZeroBalance();
