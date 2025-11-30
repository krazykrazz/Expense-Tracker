/**
 * Test script to verify budget copy functionality
 */

const budgetService = require('../services/budgetService');
const budgetRepository = require('../repositories/budgetRepository');

async function testBudgetCopy() {
  console.log('Testing budget copy functionality...\n');

  try {
    // Test scenario: Copy budgets from December 2025 to January 2026
    const sourceYear = 2025;
    const sourceMonth = 12;
    const targetYear = 2026;
    const targetMonth = 1;

    console.log(`Source: ${sourceYear}-${sourceMonth}`);
    console.log(`Target: ${targetYear}-${targetMonth}\n`);

    // Check what budgets exist in source month
    console.log('Checking source month budgets...');
    const sourceBudgets = await budgetRepository.findByYearMonth(sourceYear, sourceMonth);
    console.log(`Found ${sourceBudgets.length} budgets in source month (raw)`);

    // Check what getBudgets returns (with auto-carry-forward)
    const sourceBudgetsWithCarryForward = await budgetService.getBudgets(sourceYear, sourceMonth);
    console.log(`Found ${sourceBudgetsWithCarryForward.length} budgets in source month (with carry-forward)\n`);

    if (sourceBudgetsWithCarryForward.length > 0) {
      console.log('Source month budgets:');
      sourceBudgetsWithCarryForward.forEach(b => {
        console.log(`  - ${b.category}: $${b.limit}`);
      });
      console.log();
    }

    // Try to copy
    console.log('Attempting to copy budgets...');
    const result = await budgetService.copyBudgets(sourceYear, sourceMonth, targetYear, targetMonth, true);
    
    console.log('\nCopy result:');
    console.log(`  Copied: ${result.copied}`);
    console.log(`  Overwritten: ${result.overwritten}`);
    console.log(`  Skipped: ${result.skipped}`);

    // Verify target month now has budgets
    const targetBudgets = await budgetRepository.findByYearMonth(targetYear, targetMonth);
    console.log(`\nTarget month now has ${targetBudgets.length} budgets:`);
    targetBudgets.forEach(b => {
      console.log(`  - ${b.category}: $${b.limit}`);
    });

    console.log('\n✓ Test completed successfully!');
  } catch (err) {
    console.error('\n✗ Test failed:', err.message);
    if (err.code) {
      console.error(`  Error code: ${err.code}`);
    }
  }
}

// Run the test
testBudgetCopy()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
