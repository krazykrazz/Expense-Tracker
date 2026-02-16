#!/usr/bin/env node
/**
 * Script to consolidate expenseService PBT test files
 * Part of test-suite-rationalization spec task 4.1
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

// Consolidation mapping for expenseService
const consolidationMap = {
  'expenseService.financial.pbt.test.js': [
    'expenseService.aggregation.pbt.test.js',
    'expenseService.fixedaggregation.pbt.test.js',
    'expenseService.creditCardBalance.pbt.test.js',
    'expenseService.networth.pbt.test.js',
    'expenseService.taxdeductible.pbt.test.js',
    'expenseService.taxreport.pbt.test.js'
  ],
  'expenseService.people.pbt.test.js': [
    'expenseService.allocation.pbt.test.js',
    'expenseService.singleperson.pbt.test.js',
    'expenseService.peoplegrouping.pbt.test.js',
    'expenseService.peopleEquivalence.pbt.test.js',
    'expenseService.assignmentworkflow.pbt.test.js',
    'expenseService.unassignedidentification.pbt.test.js'
  ],
  'expenseService.filtering.pbt.test.js': [
    'expenseService.filtering.pbt.test.js',
    'expenseService.methodFiltering.pbt.test.js',
    'expenseService.reportfiltering.pbt.test.js',
    'expenseService.dateCalculation.pbt.test.js',
    'expenseService.futureMonths.pbt.test.js'
  ],
  'expenseService.validation.pbt.test.js': [
    'expenseService.facadeApiSurface.pbt.test.js',
    'expenseService.postedDateValidation.pbt.test.js',
    'expenseService.budgetIntegration.pbt.test.js'
  ],
  'expenseService.integrity.pbt.test.js': [
    'expenseService.atomicity.pbt.test.js',
    'expenseService.independence.pbt.test.js',
    'expenseService.pbt.test.js'
  ],
  'expenseService.insurance.pbt.test.js': [
    'expenseService.insurance.pbt.test.js',
    'expenseService.insuranceDefaultsEquivalence.pbt.test.js',
    'expenseService.reimbursement.pbt.test.js',
    'expenseService.postedDate.pbt.test.js'
  ]
};

console.log('Consolidating expenseService PBT files...\n');

for (const [targetFile, sourceFiles] of Object.entries(consolidationMap)) {
  console.log(`Creating ${targetFile}...`);
  
  const targetPath = path.join(servicesDir, targetFile);
  const invariantComment = getInvariantComment(targetFile);
  
  let consolidatedContent = invariantComment + '\n\n';
  
  // Collect all imports
  const imports = new Set();
  const describeBlocks = [];
  
  for (const sourceFile of sourceFiles) {
    const sourcePath = path.join(servicesDir, sourceFile);
    
    if (!fs.existsSync(sourcePath)) {
      console.log(`  ⚠️  Skipping ${sourceFile} (not found)`);
      continue;
    }
    
    const content = fs.readFileSync(sourcePath, 'utf8');
    
    // Extract imports
    const importMatches = content.match(/^const .+ = require\(.+\);$/gm);
    if (importMatches) {
      importMatches.forEach(imp => imports.add(imp));
    }
    
    // Extract describe blocks
    const describeMatch = content.match(/describe\([^{]+\{[\s\S]+\}\);/);
    if (describeMatch) {
      describeBlocks.push({
        source: sourceFile,
        content: describeMatch[0]
      });
    }
  }
  
  // Add imports
  consolidatedContent += Array.from(imports).join('\n') + '\n\n';
  
  // Add main describe block
  consolidatedContent += `describe('ExpenseService - ${getDescribeName(targetFile)} PBT', () => {\n`;
  consolidatedContent += `  let db;\n`;
  consolidatedContent += `  let validPaymentMethods = [];\n\n`;
  
  // Add setup/teardown
  consolidatedContent += `  beforeAll(async () => {\n`;
  consolidatedContent += `    db = await getDatabase();\n`;
  consolidatedContent += `    const paymentMethods = await paymentMethodRepository.findAll();\n`;
  consolidatedContent += `    validPaymentMethods = paymentMethods.map(pm => pm.display_name);\n`;
  consolidatedContent += `  });\n\n`;
  
  consolidatedContent += `  afterEach(async () => {\n`;
  consolidatedContent += `    // Clean up test data\n`;
  consolidatedContent += `    await new Promise((resolve, reject) => {\n`;
  consolidatedContent += `      db.run('DELETE FROM expenses WHERE place LIKE "PBT_%"', (err) => {\n`;
  consolidatedContent += `        if (err) reject(err); else resolve();\n`;
  consolidatedContent += `      });\n`;
  consolidatedContent += `    });\n`;
  consolidatedContent += `  });\n\n`;
  
  // Add nested describe blocks from source files
  for (const block of describeBlocks) {
    consolidatedContent += `  // From: ${block.source}\n`;
    consolidatedContent += `  ${block.content.replace(/\n/g, '\n  ')}\n\n`;
  }
  
  consolidatedContent += `});\n`;
  
  // Write consolidated file
  fs.writeFileSync(targetPath, consolidatedContent);
  console.log(`  ✓ Created ${targetFile}`);
}

console.log('\nConsolidation complete!');

function getInvariantComment(filename) {
  const comments = {
    'expenseService.financial.pbt.test.js': `/**
 * @invariant Financial calculations (aggregation, balance tracking, net worth, tax deductions)
 * must maintain mathematical correctness across randomized inputs. Randomization validates
 * that totals equal sums, balances reflect transactions, and tax reports include all eligible
 * expenses regardless of input variations.
 * 
 * Consolidated from: aggregation, fixedaggregation, creditCardBalance, networth, taxdeductible, taxreport
 */`,
    'expenseService.people.pbt.test.js': `/**
 * @invariant People allocation and tracking must preserve data integrity across all operations.
 * Randomization validates that allocations sum correctly, assignments persist through round-trips,
 * and grouping logic handles edge cases consistently.
 * 
 * Consolidated from: allocation, singleperson, peoplegrouping, peopleEquivalence, assignmentworkflow, unassignedidentification
 */`,
    'expenseService.filtering.pbt.test.js': `/**
 * @invariant Filtering operations must return correct subsets of data regardless of filter
 * combinations. Randomization validates that method filters, date calculations, and report
 * filtering produce consistent results across varied inputs.
 * 
 * Consolidated from: filtering, methodFiltering, reportfiltering, dateCalculation, futureMonths
 */`,
    'expenseService.validation.pbt.test.js': `/**
 * @invariant Validation logic must reject invalid inputs and accept valid inputs consistently.
 * Randomization validates that API surface contracts hold, posted date validation works across
 * date ranges, and budget integration maintains correctness.
 * 
 * Consolidated from: facadeApiSurface, postedDateValidation, budgetIntegration
 */`,
    'expenseService.integrity.pbt.test.js': `/**
 * @invariant Data integrity must be maintained across all operations. Randomization validates
 * that atomic operations succeed or fail completely, operations are independent, and general
 * service properties hold across varied scenarios.
 * 
 * Consolidated from: atomicity, independence, pbt (general)
 */`,
    'expenseService.insurance.pbt.test.js': `/**
 * @invariant Insurance claim tracking must maintain data consistency and defaults. Randomization
 * validates that insurance status persists, reimbursement calculations are correct, and posted
 * dates interact properly with insurance claims.
 * 
 * Consolidated from: insurance, insuranceDefaultsEquivalence, reimbursement, postedDate
 */`
  };
  
  return comments[filename] || '// Consolidated PBT tests';
}

function getDescribeName(filename) {
  const names = {
    'expenseService.financial.pbt.test.js': 'Financial Calculations',
    'expenseService.people.pbt.test.js': 'People Allocation',
    'expenseService.filtering.pbt.test.js': 'Filtering Operations',
    'expenseService.validation.pbt.test.js': 'Validation Logic',
    'expenseService.integrity.pbt.test.js': 'Data Integrity',
    'expenseService.insurance.pbt.test.js': 'Insurance Claims'
  };
  
  return names[filename] || 'Consolidated';
}
