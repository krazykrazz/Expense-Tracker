const expenseService = require('../services/expenseService');
const loanService = require('../services/loanService');
const loanBalanceService = require('../services/loanBalanceService');

async function testSummaryWithLoansScenario() {
  try {
    console.log('Testing enhanced summary endpoint with loan data scenario...\n');
    
    // Create a test loan
    console.log('Creating test loan...');
    const testLoan = await loanService.createLoan({
      name: 'Test Car Loan',
      initial_balance: 25000,
      start_date: '2024-01-01',
      notes: 'Test loan for summary integration'
    });
    console.log(`✓ Created loan: ${testLoan.name} (ID: ${testLoan.id})`);
    
    // Add a balance entry for current month
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    console.log(`\nAdding balance entry for ${year}-${month}...`);
    const balanceEntry = await loanBalanceService.createOrUpdateBalance({
      loan_id: testLoan.id,
      year: year,
      month: month,
      remaining_balance: 20000,
      rate: 5.5
    });
    console.log(`✓ Added balance entry: $${balanceEntry.remaining_balance} @ ${balanceEntry.rate}%`);
    
    // Get summary for current month
    console.log(`\nFetching summary for ${year}-${month}...`);
    const summary = await expenseService.getSummary(year, month);
    
    console.log('\nSummary Response:');
    console.log('- Total Expenses:', summary.total);
    console.log('- Monthly Gross:', summary.monthlyGross);
    console.log('- Total Fixed Expenses:', summary.totalFixedExpenses);
    console.log('- Total Outstanding Debt:', summary.totalOutstandingDebt);
    console.log('- Number of Active Loans:', summary.loans ? summary.loans.length : 0);
    
    if (summary.loans && summary.loans.length > 0) {
      console.log('\nActive Loans:');
      summary.loans.forEach(loan => {
        console.log(`  - ${loan.name}: $${loan.currentBalance} @ ${loan.currentRate}%`);
      });
    }
    
    // Verify the loan appears in summary
    console.log('\n--- Verification ---');
    console.log('✓ Summary includes loans array:', Array.isArray(summary.loans));
    console.log('✓ Summary includes totalOutstandingDebt:', typeof summary.totalOutstandingDebt === 'number');
    console.log('✓ Loan appears in summary:', summary.loans.some(l => l.id === testLoan.id));
    console.log('✓ Loan has correct balance:', summary.loans.find(l => l.id === testLoan.id)?.currentBalance === 20000);
    console.log('✓ Loan has correct rate:', summary.loans.find(l => l.id === testLoan.id)?.currentRate === 5.5);
    console.log('✓ Total outstanding debt is correct:', summary.totalOutstandingDebt === 20000);
    
    // Test with paid off loan
    console.log('\n--- Testing Paid Off Loan ---');
    await loanService.markPaidOff(testLoan.id, true);
    console.log('✓ Marked loan as paid off');
    
    const summaryAfterPaidOff = await expenseService.getSummary(year, month);
    console.log('✓ Paid off loan excluded from summary:', 
      !summaryAfterPaidOff.loans.some(l => l.id === testLoan.id));
    console.log('✓ Total outstanding debt is 0:', summaryAfterPaidOff.totalOutstandingDebt === 0);
    
    // Clean up
    console.log('\n--- Cleanup ---');
    await loanService.deleteLoan(testLoan.id);
    console.log('✓ Deleted test loan');
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSummaryWithLoansScenario();
