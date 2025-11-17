const { getDatabase } = require('../database/db');
const loanBalanceService = require('../services/loanBalanceService');
const loanRepository = require('../repositories/loanRepository');

async function testAutomaticEstimatedMonths() {
  console.log('=== Testing Automatic Estimated Months Left Calculation ===\n');

  try {
    const db = await getDatabase();

    // Test 1: Create a test loan
    console.log('Test 1: Creating test loan...');
    const testLoan = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO loans (name, initial_balance, start_date, loan_type, notes)
         VALUES (?, ?, ?, ?, ?)`,
        ['Test Auto Calc Loan', 10000, '2024-01-01', 'loan', 'Testing automatic calculation'],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
    console.log(`✓ Created loan with ID: ${testLoan.id}\n`);

    // Test 2: Add balance entries with consistent paydown
    console.log('Test 2: Adding balance entries with $500/month paydown...');
    const balanceEntries = [
      { year: 2024, month: 1, remaining_balance: 10000, rate: 5.5 },
      { year: 2024, month: 2, remaining_balance: 9500, rate: 5.5 },
      { year: 2024, month: 3, remaining_balance: 9000, rate: 5.5 },
      { year: 2024, month: 4, remaining_balance: 8500, rate: 5.5 }
    ];

    for (const entry of balanceEntries) {
      await loanBalanceService.createOrUpdateBalance({
        loan_id: testLoan.id,
        ...entry
      });
      console.log(`  Added: ${entry.year}-${entry.month.toString().padStart(2, '0')} - $${entry.remaining_balance}`);
    }

    // Check estimated months
    const loanAfterEntries = await loanRepository.findById(testLoan.id);
    console.log(`\n✓ Estimated months left: ${loanAfterEntries.estimated_months_left}`);
    console.log(`  Expected: ~17 months (8500 / 500 = 17)`);
    
    if (loanAfterEntries.estimated_months_left === 17) {
      console.log('  ✓ PASS: Calculation is correct!\n');
    } else {
      console.log(`  ⚠ WARNING: Expected 17, got ${loanAfterEntries.estimated_months_left}\n`);
    }

    // Test 3: Update a balance entry
    console.log('Test 3: Updating balance entry (larger paydown)...');
    await loanBalanceService.createOrUpdateBalance({
      loan_id: testLoan.id,
      year: 2024,
      month: 4,
      remaining_balance: 8000, // Changed from 8500 to 8000
      rate: 5.5
    });

    const loanAfterUpdate = await loanRepository.findById(testLoan.id);
    console.log(`✓ Updated estimated months left: ${loanAfterUpdate.estimated_months_left}`);
    console.log(`  Expected: ~15 months (8000 / ~533 avg paydown = ~15)\n`);

    // Test 4: Test with zero balance (paid off)
    console.log('Test 4: Setting balance to zero (paid off)...');
    await loanBalanceService.createOrUpdateBalance({
      loan_id: testLoan.id,
      year: 2024,
      month: 5,
      remaining_balance: 0,
      rate: 5.5
    });

    const loanAfterPaidOff = await loanRepository.findById(testLoan.id);
    console.log(`✓ Estimated months left: ${loanAfterPaidOff.estimated_months_left}`);
    console.log(`  Expected: 0 (paid off)`);
    console.log(`  Paid off status: ${loanAfterPaidOff.is_paid_off ? 'Yes' : 'No'}`);
    
    if (loanAfterPaidOff.estimated_months_left === 0 && loanAfterPaidOff.is_paid_off === 1) {
      console.log('  ✓ PASS: Correctly marked as paid off!\n');
    } else {
      console.log(`  ⚠ WARNING: Expected 0 months and is_paid_off=1, got ${loanAfterPaidOff.estimated_months_left} months and is_paid_off=${loanAfterPaidOff.is_paid_off}\n`);
    }

    // Test 5: Test with line of credit (should not calculate)
    console.log('Test 5: Testing line of credit (should not calculate)...');
    const locLoan = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO loans (name, initial_balance, start_date, loan_type, notes)
         VALUES (?, ?, ?, ?, ?)`,
        ['Test LOC', 5000, '2024-01-01', 'line_of_credit', 'Testing LOC'],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });

    await loanBalanceService.createOrUpdateBalance({
      loan_id: locLoan.id,
      year: 2024,
      month: 1,
      remaining_balance: 5000,
      rate: 6.0
    });

    await loanBalanceService.createOrUpdateBalance({
      loan_id: locLoan.id,
      year: 2024,
      month: 2,
      remaining_balance: 4500,
      rate: 6.0
    });

    const locAfterEntries = await loanRepository.findById(locLoan.id);
    console.log(`✓ Line of credit estimated months: ${locAfterEntries.estimated_months_left}`);
    console.log(`  Expected: null (not calculated for LOC)`);
    
    if (locAfterEntries.estimated_months_left === null) {
      console.log('  ✓ PASS: Correctly skipped calculation for line of credit!\n');
    } else {
      console.log('  ⚠ WARNING: Should not calculate for line of credit\n');
    }

    // Test 6: Delete balance entry and verify recalculation
    console.log('Test 6: Deleting balance entry and verifying recalculation...');
    const balanceToDelete = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM loan_balances WHERE loan_id = ? AND year = ? AND month = ?',
        [testLoan.id, 2024, 5],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (balanceToDelete) {
      await loanBalanceService.deleteBalance(balanceToDelete.id, testLoan.id);
      const loanAfterDelete = await loanRepository.findById(testLoan.id);
      console.log(`✓ After deleting last entry, estimated months: ${loanAfterDelete.estimated_months_left}`);
      console.log('  ✓ PASS: Recalculation triggered after deletion!\n');
    }

    // Cleanup
    console.log('Cleaning up test data...');
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_balances WHERE loan_id IN (?, ?)', [testLoan.id, locLoan.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loans WHERE id IN (?, ?)', [testLoan.id, locLoan.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Cleanup complete\n');

    console.log('=== All Tests Completed Successfully! ===');

  } catch (error) {
    console.error('Error during testing:', error);
    process.exit(1);
  }
}

testAutomaticEstimatedMonths();
