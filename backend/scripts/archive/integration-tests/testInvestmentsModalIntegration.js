/**
 * Integration test for InvestmentsModal component
 * Tests the full flow of investment management through the services
 */

const investmentService = require('../services/investmentService');

async function testInvestmentsModalIntegration() {
  console.log('🧪 Testing InvestmentsModal Integration...\n');

  try {
    // Test 1: Create a new investment
    console.log('1️⃣ Creating new investment...');
    const createdInvestment = await investmentService.createInvestment({
      name: 'Test TFSA',
      type: 'TFSA',
      initial_value: 10000
    });
    console.log('✅ Investment created:', createdInvestment);
    const investmentId = createdInvestment.id;

    // Test 2: Get all investments
    console.log('\n2️⃣ Fetching all investments...');
    const allInvestments = await investmentService.getAllInvestments();
    console.log('✅ Investments fetched:', allInvestments.length, 'investment(s)');
    console.log('   Investment details:', allInvestments.find(i => i.id === investmentId));

    // Test 3: Update investment
    console.log('\n3️⃣ Updating investment...');
    const updatedInvestment = await investmentService.updateInvestment(investmentId, {
      name: 'Updated TFSA',
      type: 'RRSP'
    });
    console.log('✅ Investment updated:', updatedInvestment);

    // Test 4: Verify update
    console.log('\n4️⃣ Verifying update...');
    const verifiedInvestments = await investmentService.getAllInvestments();
    const verifiedInvestment = verifiedInvestments.find(i => i.id === investmentId);
    
    if (verifiedInvestment.name === 'Updated TFSA' && verifiedInvestment.type === 'RRSP') {
      console.log('✅ Update verified successfully');
    } else {
      throw new Error('Update verification failed');
    }

    // Test 5: Test validation - invalid type
    console.log('\n5️⃣ Testing validation (invalid type)...');
    try {
      await investmentService.createInvestment({
        name: 'Invalid Investment',
        type: 'INVALID',
        initial_value: 5000
      });
      throw new Error('Expected validation error for invalid type');
    } catch (error) {
      if (error.message.includes('TFSA') || error.message.includes('RRSP')) {
        console.log('✅ Validation working correctly (rejected invalid type)');
      } else {
        throw error;
      }
    }

    // Test 6: Test validation - negative initial value
    console.log('\n6️⃣ Testing validation (negative value)...');
    try {
      await investmentService.createInvestment({
        name: 'Negative Investment',
        type: 'TFSA',
        initial_value: -1000
      });
      throw new Error('Expected validation error for negative value');
    } catch (error) {
      if (error.message.includes('non-negative') || error.message.includes('greater than or equal to 0')) {
        console.log('✅ Validation working correctly (rejected negative value)');
      } else {
        throw error;
      }
    }

    // Test 7: Delete investment
    console.log('\n7️⃣ Deleting investment...');
    await investmentService.deleteInvestment(investmentId);
    console.log('✅ Investment deleted successfully');

    // Test 8: Verify deletion
    console.log('\n8️⃣ Verifying deletion...');
    const finalInvestments = await investmentService.getAllInvestments();
    const deletedInvestment = finalInvestments.find(i => i.id === investmentId);
    
    if (deletedInvestment) {
      throw new Error('Investment still exists after deletion');
    }
    console.log('✅ Deletion verified successfully');

    console.log('\n✅ All InvestmentsModal integration tests passed!\n');

  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testInvestmentsModalIntegration();
