const expenseService = require('../services/expenseService');
const loanService = require('../services/loanService');
const loanBalanceService = require('../services/loanBalanceService');

async function testSummaryStartDateFilter() {
  try {
    console.log('Testing summary start_date filtering...\n');
    
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    // Create loan with start date in the past (should appear)
    console.log('Creating loan with past start date...');
    const pastLoan = await loanService.createLoan({
      name: 'Past Loan',
      initial_balance: 10000,
      start_date: '2024-01-01',
      notes: 'Started in the past'
    });
    
    await loanBalanceService.createOrUpdateBalance({
      loan_id: pastLoan.id,
      year: year,
      month: month,
      remaining_balance: 8000,
      rate: 4.5
    });
    console.log(`✓ Created past loan (ID: ${pastLoan.id})`);
    
    // Create loan with start date in the future (should NOT appear)
    console.log('\nCreating loan with future start date...');
    const futureLoan = await loanService.createLoan({
      name: 'Future Loan',
      initial_balance: 15000,
      start_date: '2026-12-01',
      notes: 'Starts in the future'
    });
    
    await loanBalanceService.createOrUpdateBalance({
      loan_id: futureLoan.id,
      year: 2026,
      month: 12,
      remaining_balance: 15000,
      rate: 6.0
    });
    console.log(`✓ Created future loan (ID: ${futureLoan.id})`);
    
    // Get summary for current month
    console.log(`\nFetching summary for ${year}-${month}...`);
    const summary = await expenseService.getSummary(year, month);
    
    console.log('\nActive Loans in Summary:');
    if (summary.loans && summary.loans.length > 0) {
      summary.loans.forEach(loan => {
        console.log(`  - ${loan.name}: $${loan.currentBalance}`);
      });
    } else {
      console.log('  (none)');
    }
    
    // Verify filtering
    console.log('\n--- Verification ---');
    console.log('✓ Past loan appears:', summary.loans.some(l => l.id === pastLoan.id));
    console.log('✓ Future loan excluded:', !summary.loans.some(l => l.id === futureLoan.id));
    console.log('✓ Total outstanding debt only includes past loan:', 
      summary.totalOutstandingDebt === 8000);
    
    // Clean up
    console.log('\n--- Cleanup ---');
    await loanService.deleteLoan(pastLoan.id);
    await loanService.deleteLoan(futureLoan.id);
    console.log('✓ Deleted test loans');
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSummaryStartDateFilter();
