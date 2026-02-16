/**
 * Script to consolidate billingCycleHistoryService PBT files
 * 
 * Consolidation mapping:
 * - billingCycleHistoryService.core.pbt.test.js ← pbt (general), autoGeneration, effective
 * - billingCycleHistoryService.balance.pbt.test.js ← balanceFormula, crossPath
 * - billingCycleHistoryService.ordering.pbt.test.js ← chronological, trend
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

// Source files to consolidate
const sourceFiles = {
  core: [
    'billingCycleHistoryService.pbt.test.js',
    'billingCycleHistoryService.autoGeneration.pbt.test.js',
    'billingCycleHistoryService.effective.pbt.test.js'
  ],
  balance: [
    'billingCycleHistoryService.balanceFormula.pbt.test.js',
    'billingCycleHistoryService.crossPath.pbt.test.js'
  ],
  ordering: [
    'billingCycleHistoryService.chronological.pbt.test.js',
    'billingCycleHistoryService.trend.pbt.test.js'
  ]
};

// Target files
const targetFiles = {
  core: 'billingCycleHistoryService.core.pbt.test.js',
  balance: 'billingCycleHistoryService.balance.pbt.test.js',
  ordering: 'billingCycleHistoryService.ordering.pbt.test.js'
};

function extractTestContent(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract everything after the imports and before the first describe block
  const lines = content.split('\n');
  let helperStart = -1;
  let describeStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Find where helpers start (after imports/requires)
    if (helperStart === -1 && 
        !line.startsWith('const ') && 
        !line.startsWith('require(') &&
        !line.startsWith('//') &&
        !line.startsWith('/*') &&
        !line.startsWith('*') &&
        line.length > 0) {
      helperStart = i;
    }
    
    // Find first describe block
    if (line.startsWith('describe(')) {
      describeStart = i;
      break;
    }
  }
  
  // Extract helpers (between imports and describe)
  const helpers = helperStart !== -1 && describeStart !== -1
    ? lines.slice(helperStart, describeStart).join('\n').trim()
    : '';
  
  // Extract test blocks (from first describe to end)
  const tests = describeStart !== -1
    ? lines.slice(describeStart).join('\n').trim()
    : '';
  
  return { helpers, tests };
}

function consolidateFiles(group, sources, target) {
  console.log(`\nConsolidating ${group} files into ${target}...`);
  
  const allHelpers = new Set();
  const allTests = [];
  const sourceFileNames = [];
  
  // Read all source files
  for (const sourceFile of sources) {
    const sourcePath = path.join(servicesDir, sourceFile);
    
    if (!fs.existsSync(sourcePath)) {
      console.log(`  ⚠️  Source file not found: ${sourceFile}`);
      continue;
    }
    
    console.log(`  Reading ${sourceFile}...`);
    sourceFileNames.push(sourceFile);
    
    const { helpers, tests } = extractTestContent(sourcePath);
    
    if (helpers) {
      allHelpers.add(helpers);
    }
    
    if (tests) {
      allTests.push(tests);
    }
  }
  
  // Build consolidated file
  const header = `/**
 * Property-Based Tests for Billing Cycle History Service - ${group.charAt(0).toUpperCase() + group.slice(1)} Tests
 * 
 * Consolidated from:
${sourceFileNames.map(f => ` * - ${f}`).join('\n')}
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Mock activity log service
jest.mock('./activityLogService');
`;
  
  const helpersSection = Array.from(allHelpers).join('\n\n');
  const testsSection = allTests.join('\n\n');
  
  const consolidatedContent = `${header}\n${helpersSection}\n\n${testsSection}\n`;
  
  // Write consolidated file
  const targetPath = path.join(servicesDir, target);
  fs.writeFileSync(targetPath, consolidatedContent, 'utf8');
  console.log(`  ✓ Created ${target}`);
  
  return sourceFileNames;
}

// Main execution
console.log('Starting billingCycleHistoryService PBT consolidation...');

const allSourceFiles = [];

// Consolidate each group
for (const [group, sources] of Object.entries(sourceFiles)) {
  const target = targetFiles[group];
  const processedFiles = consolidateFiles(group, sources, target);
  allSourceFiles.push(...processedFiles);
}

console.log('\n✓ Consolidation complete!');
console.log('\nNext steps:');
console.log('1. Review the consolidated files');
console.log('2. Run tests: npx jest --testPathPatterns "billingCycleHistoryService.*pbt"');
console.log('3. If tests pass, delete the original source files');
console.log('\nOriginal files to delete:');
allSourceFiles.forEach(f => console.log(`  - ${f}`));
