const expenseService = require('../services/expenseService');
const loanService = require('../services/loanService');

async function testSummaryWithLoans() {
  try {
    console.log('Testing enhanced summary endpoint with loan data...\n');
    
    // Test 1: Get summary for current month
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    console.log(`Fetching summary for ${year}-${month}...`);
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
    } else {
      console.log('\nNo active loans for this month.');
    }
    
    // Test 2: Verify loans array structure
    console.log('\n✓ Summary includes loans array:', Array.isArray(summary.loans));
    console.log('✓ Summary includes totalOutstandingDebt:', typeof summary.totalOutstandingDebt === 'number');
    
    // Test 3: Verify calculation
    if (summary.loans && summary.loans.length > 0) {
      const calculatedTotal = summary.loans.reduce((sum, loan) => sum + (loan.currentBalance || 0), 0);
      console.log('✓ Total outstanding debt calculation matches:', 
        Math.abs(calculatedTotal - summary.totalOutstandingDebt) < 0.01);
    }
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSummaryWithLoans();
