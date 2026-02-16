/**
 * Script to update paymentMethodService PBT tests to use singleton database pattern
 * 
 * This script updates the test files to:
 * 1. Use getTestDatabase() instead of createTestDatabase()
 * 2. Add beforeAll to create database once
 * 3. Add beforeEach to reset database between iterations
 * 4. Add afterAll to close database once
 */

const fs = require('fs');
const path = require('path');

const testFiles = [
  'services/paymentMethodService.balance.pbt.test.js',
  'services/paymentMethodService.creditCard.pbt.test.js',
  'services/paymentMethodService.lifecycle.pbt.test.js',
  'services/paymentMethodService.validation.pbt.test.js'
];

function updateFile(filePath) {
  console.log(`\nUpdating ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Update imports to include getTestDatabase and resetTestDatabase
  content = content.replace(
    /const \{\s*createTestDatabase,/,
    'const {\n  getTestDatabase,\n  resetTestDatabase,\n  createTestDatabase,'
  );
  
  // Add database lifecycle hooks after the describe block starts
  const describeMatch = content.match(/describe\('PaymentMethodService[^']*',\s*\(\)\s*=>\s*\{/);
  if (describeMatch) {
    const insertPos = describeMatch.index + describeMatch[0].length;
    const hooks = `
  let sharedDb = null;

  beforeAll(async () => {
    // Create database once for all tests
    sharedDb = await getTestDatabase();
    await createTables(sharedDb);
  });

  afterAll(async () => {
    // Close database after all tests
    if (sharedDb) {
      await closeDatabase(sharedDb);
    }
  });

  beforeEach(async () => {
    // Reset database between test iterations
    if (sharedDb) {
      await resetTestDatabase(sharedDb);
    }
  });
`;
    
    content = content.slice(0, insertPos) + hooks + content.slice(insertPos);
  }
  
  // Replace all createTestDatabase() calls with sharedDb
  // Pattern: const db = await createTestDatabase();
  content = content.replace(
    /const db = await createTestDatabase\(\);/g,
    'const db = sharedDb;'
  );
  
  // Remove all createTables(db) calls since it's done once in beforeAll
  content = content.replace(
    /await createTables\(db\);\s*/g,
    ''
  );
  
  // Remove all closeDatabase(db) calls from finally blocks
  content = content.replace(
    /await closeDatabase\(db\);\s*/g,
    '// Database closed in afterAll'
  );
  
  // Also handle cases where closeDatabase is the only statement in finally
  content = content.replace(
    /\} finally \{\s*\/\/ Database closed in afterAll\s*\}/g,
    '} finally {\n            // Database reset in beforeEach\n          }'
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ Updated ${filePath}`);
}

console.log('Updating paymentMethodService PBT tests to use singleton pattern...\n');

testFiles.forEach(updateFile);

console.log('\n✓ All files updated successfully!');
console.log('\nNext steps:');
console.log('1. Review the changes');
console.log('2. Run tests to verify: cd backend && npx jest --testPathPatterns paymentMethodService.*pbt');
console.log('3. Expected improvement: 20 minutes → 2-3 minutes per file');
