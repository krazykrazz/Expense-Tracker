#!/usr/bin/env node

/**
 * Script to replace pbtOptions() with dbPbtOptions() in all backend PBT test files
 * that interact with the database.
 * 
 * This reduces PBT iterations from 30-50 to 10-15 for database tests,
 * significantly improving test performance.
 */

const fs = require('fs');
const path = require('path');

// Files that should use dbPbtOptions (database-backed tests)
const filesToFix = [
  'backend/services/backupService.pbt.test.js',
  'backend/repositories/billingCycleRepository.pbt.test.js',
  'backend/database/migrations.paymentMethods.pbt.test.js',
  'backend/controllers/analyticsController.edgeCases.pbt.test.js',
  'backend/controllers/analyticsController.dateFiltering.pbt.test.js',
  'backend/controllers/analyticsController.metadata.pbt.test.js',
  'backend/database/migrations.pbt.test.js',
  'backend/repositories/creditCardPaymentRepository.pbt.test.js',
  'backend/repositories/expenseRepository.merchantRanking.pbt.test.js',
  'backend/repositories/expenseRepository.insurance.pbt.test.js',
  'backend/repositories/expenseRepository.categoryFrequency.pbt.test.js'
];

let totalReplacements = 0;
let filesModified = 0;

for (const filePath of filesToFix) {
  const fullPath = path.join(__dirname, '../..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Check if file already imports dbPbtOptions
  const hasDbPbtImport = content.includes('dbPbtOptions');
  
  // Count replacements
  const matches = content.match(/pbtOptions\(\)/g);
  const replacementCount = matches ? matches.length : 0;
  
  if (replacementCount === 0) {
    console.log(`✓ ${filePath} - already using dbPbtOptions`);
    continue;
  }
  
  // Add dbPbtOptions to imports if not present
  if (!hasDbPbtImport) {
    content = content.replace(
      /const { pbtOptions } = require\('\.\.\/test\/pbtArbitraries'\);/,
      "const { dbPbtOptions } = require('../test/pbtArbitraries');"
    );
    
    // Alternative import pattern
    content = content.replace(
      /const { pbtOptions } = require\('\.\.\/\.\.\/test\/pbtArbitraries'\);/,
      "const { dbPbtOptions } = require('../../test/pbtArbitraries');"
    );
  }
  
  // Replace all pbtOptions() with dbPbtOptions()
  content = content.replace(/pbtOptions\(\)/g, 'dbPbtOptions()');
  
  // Write back
  fs.writeFileSync(fullPath, content, 'utf8');
  
  totalReplacements += replacementCount;
  filesModified++;
  
  console.log(`✓ ${filePath} - replaced ${replacementCount} occurrences`);
}

console.log(`\n✅ Complete: Modified ${filesModified} files, ${totalReplacements} total replacements`);
console.log(`\nExpected impact: 3-4x faster test execution for these files`);
