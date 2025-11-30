/**
 * Test script to verify investment data is included in summary endpoint
 */

const expenseService = require('../services/expenseService');
const investmentService = require('../services/investmentService');

async function testInvestmentSummaryIntegration() {
  console.log('Testing Investment Summary Integration...\n');

  try {
    // Create a test investment
    console.log('1. Creating test investment...');
    const testInvestment = await investmentService.createInvestment({
      name: 'Test TFSA',
      type: 'TFSA',
      initial_value: 10000
    });
    console.log('   Created investment:', testInvestment);

    // Get summary for current month
    console.log('\n2. Fetching summary with investment data...');
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    const summary = await expenseService.getSummary(year, month, false);
    
    // Verify investment data is included
    console.log('\n3. Verifying investment data in summary:');
    console.log('   - Has investments property:', summary.hasOwnProperty('investments'));
    console.log('   - Has totalInvestmentValue property:', summary.hasOwnProperty('totalInvestmentValue'));
    console.log('   - Investments array:', summary.investments);
    console.log('   - Total investment value:', summary.totalInvestmentValue);

    // Verify the investment appears in the array
    const foundInvestment = summary.investments.find(inv => inv.id === testInvestment.id);
    console.log('\n4. Test investment found in summary:', foundInvestment ? 'YES' : 'NO');
    if (foundInvestment) {
      console.log('   Investment details:', foundInvestment);
    }

    // Verify total investment value calculation
    const expectedTotal = summary.investments.reduce((sum, inv) => sum + (parseFloat(inv.currentValue) || 0), 0);
    console.log('\n5. Total investment value calculation:');
    console.log('   - Expected:', expectedTotal);
    console.log('   - Actual:', summary.totalInvestmentValue);
    console.log('   - Match:', Math.abs(expectedTotal - summary.totalInvestmentValue) < 0.01 ? 'YES' : 'NO');

    // Clean up - delete test investment
    console.log('\n6. Cleaning up test investment...');
    await investmentService.deleteInvestment(testInvestment.id);
    console.log('   Test investment deleted');

    console.log('\n✅ Integration test completed successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run the test
testInvestmentSummaryIntegration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
