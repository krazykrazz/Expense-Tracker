/**
 * Test script to create sample investments for frontend display testing
 */

const investmentService = require('../services/investmentService');
const investmentValueService = require('../services/investmentValueService');

async function createSampleInvestments() {
  console.log('Creating sample investments for display testing...\n');

  try {
    // Create TFSA investment
    console.log('1. Creating TFSA investment...');
    const tfsa = await investmentService.createInvestment({
      name: 'My TFSA Account',
      type: 'TFSA',
      initial_value: 25000
    });
    console.log('   Created:', tfsa);

    // Add a value entry for TFSA
    console.log('\n2. Adding value entry for TFSA...');
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    const tfsaValue = await investmentValueService.createOrUpdateValue({
      investment_id: tfsa.id,
      year: year,
      month: month,
      value: 27500
    });
    console.log('   Added value entry:', tfsaValue);

    // Create RRSP investment
    console.log('\n3. Creating RRSP investment...');
    const rrsp = await investmentService.createInvestment({
      name: 'Retirement RRSP',
      type: 'RRSP',
      initial_value: 50000
    });
    console.log('   Created:', rrsp);

    // Add a value entry for RRSP
    console.log('\n4. Adding value entry for RRSP...');
    const rrspValue = await investmentValueService.createOrUpdateValue({
      investment_id: rrsp.id,
      year: year,
      month: month,
      value: 52300
    });
    console.log('   Added value entry:', rrspValue);

    console.log('\n✅ Sample investments created successfully!');
    console.log('\nYou can now view these investments in the frontend SummaryPanel.');
    console.log('Expected display:');
    console.log('  - My TFSA Account (TFSA): $27,500.00');
    console.log('  - Retirement RRSP (RRSP): $52,300.00');
    console.log('  - Total Investment Value: $79,800.00');

    return true;

  } catch (error) {
    console.error('\n❌ Failed to create sample investments:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run the script
createSampleInvestments()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
