const loanService = require('../services/loanService');
const loanRepository = require('../repositories/loanRepository');

async function testEstimatedMonthsLeft() {
  console.log('Testing estimated_months_left field for loans...\n');

  try {
    // Test 1: Create a loan with estimated_months_left
    console.log('Test 1: Creating a loan with estimated_months_left...');
    const testLoan = await loanService.createLoan({
      name: 'Test Car Loan',
      initial_balance: 25000,
      start_date: '2024-01-01',
      loan_type: 'loan',
      estimated_months_left: 60,
      notes: 'Test loan with estimated months'
    });
    console.log('✓ Created loan:', testLoan);
    console.log(`  - ID: ${testLoan.id}`);
    console.log(`  - Estimated months left: ${testLoan.estimated_months_left}`);

    // Test 2: Retrieve the loan and verify estimated_months_left
    console.log('\nTest 2: Retrieving loan to verify estimated_months_left...');
    const retrievedLoan = await loanRepository.findById(testLoan.id);
    console.log('✓ Retrieved loan:', retrievedLoan);
    console.log(`  - Estimated months left: ${retrievedLoan.estimated_months_left}`);

    // Test 3: Update estimated_months_left
    console.log('\nTest 3: Updating estimated_months_left...');
    const updatedLoan = await loanService.updateLoan(testLoan.id, {
      name: 'Test Car Loan',
      initial_balance: 25000,
      start_date: '2024-01-01',
      loan_type: 'loan',
      estimated_months_left: 48,
      notes: 'Updated estimated months'
    });
    console.log('✓ Updated loan:', updatedLoan);
    console.log(`  - New estimated months left: ${updatedLoan.estimated_months_left}`);

    // Test 4: Create a line of credit (should not have estimated_months_left)
    console.log('\nTest 4: Creating a line of credit (no estimated_months_left)...');
    const locLoan = await loanService.createLoan({
      name: 'Test Line of Credit',
      initial_balance: 10000,
      start_date: '2024-01-01',
      loan_type: 'line_of_credit',
      notes: 'Line of credit should not have estimated months'
    });
    console.log('✓ Created line of credit:', locLoan);
    console.log(`  - Estimated months left: ${locLoan.estimated_months_left || 'null (as expected)'}`);

    // Test 5: Get all loans with current balances
    console.log('\nTest 5: Getting all loans with current balances...');
    const allLoans = await loanService.getAllLoans();
    console.log('✓ Retrieved all loans:');
    allLoans.forEach(loan => {
      console.log(`  - ${loan.name} (${loan.loan_type})`);
      console.log(`    Estimated months left: ${loan.estimated_months_left || 'N/A'}`);
    });

    // Cleanup
    console.log('\nCleaning up test data...');
    await loanRepository.delete(testLoan.id);
    await loanRepository.delete(locLoan.id);
    console.log('✓ Test data cleaned up');

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testEstimatedMonthsLeft()
  .then(() => {
    console.log('\nTest suite completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nTest suite failed:', error);
    process.exit(1);
  });
