#!/usr/bin/env node
/**
 * Script to consolidate paymentMethodService PBT test files
 * 
 * Consolidates 13 files into 4 organized groups:
 * - balance.pbt.test.js (4 files)
 * - validation.pbt.test.js (4 files)
 * - creditCard.pbt.test.js (3 files)
 * - lifecycle.pbt.test.js (1 file)
 */

const fs = require('fs');
const path = require('path');

const SERVICES_DIR = path.join(__dirname, '../services');

// Define consolidation groups
const consolidationGroups = {
  'paymentMethodService.balance.pbt.test.js': [
    'paymentMethodService.balanceCoalesce.pbt.test.js',
    'paymentMethodService.balanceTypes.pbt.test.js',
    'paymentMethodService.expenseCountBalance.pbt.test.js',
    'paymentMethodService.effectiveDate.pbt.test.js'
  ],
  'paymentMethodService.validation.pbt.test.js': [
    'paymentMethodService.validation.pbt.test.js',
    'paymentMethodService.requiredFields.pbt.test.js',
    'paymentMethodService.rangeValidation.pbt.test.js',
    'paymentMethodService.uniqueness.pbt.test.js'
  ],
  'paymentMethodService.creditCard.pbt.test.js': [
    'paymentMethodService.utilization.pbt.test.js',
    'paymentMethodService.billingCycle.pbt.test.js',
    'paymentMethodService.paymentImpact.pbt.test.js'
  ],
  'paymentMethodService.lifecycle.pbt.test.js': [
    'paymentMethodService.inactive.pbt.test.js'
  ]
};

// Invariant comments for each group
const invariantComments = {
  'paymentMethodService.balance.pbt.test.js': `/**
 * @invariant Balance Calculation Invariants
 * 
 * This file tests critical balance calculation properties for credit card payment methods:
 * 1. COALESCE behavior: Balance uses COALESCE(posted_date, date) as effective posting date
 * 2. Balance ordering: statement ≤ current ≤ projected
 * 3. Non-negative: All balance types must be >= 0
 * 4. Expense count consistency: Count and balance use same effective date
 * 5. Effective date consistency: COALESCE(posted_date, date) used consistently
 * 
 * Randomness adds value by:
 * - Testing various date combinations (transaction vs posted dates)
 * - Validating balance calculations across random expense/payment amounts
 * - Ensuring SQL COALESCE logic works correctly with NULL and non-NULL posted_dates
 * - Verifying date boundary handling across different time periods
 * 
 * Consolidated from: balanceCoalesce, balanceTypes, expenseCountBalance, effectiveDate
 */`,
  'paymentMethodService.validation.pbt.test.js': `/**
 * @invariant Validation Rule Invariants
 * 
 * This file tests validation properties for payment method creation and updates:
 * 1. Type-specific required fields (cash, cheque, debit, credit_card)
 * 2. Required fields enforcement (billing_cycle_day, payment_due_day for credit cards)
 * 3. Range validation (day values must be 1-31)
 * 4. Display name uniqueness across all payment methods
 * 
 * Randomness adds value by:
 * - Testing validation with various input combinations
 * - Ensuring edge cases (boundary values, invalid types) are handled
 * - Verifying uniqueness constraints across random display names
 * - Testing whitespace handling and string normalization
 * 
 * Consolidated from: validation, requiredFields, rangeValidation, uniqueness
 */`,
  'paymentMethodService.creditCard.pbt.test.js': `/**
 * @invariant Credit Card Feature Invariants
 * 
 * This file tests credit card-specific properties:
 * 1. Utilization calculation: (balance / limit) * 100
 * 2. Billing cycle transaction counting and totals
 * 3. Payment impact on balance reduction
 * 
 * Randomness adds value by:
 * - Testing utilization across various balance/limit combinations
 * - Validating billing cycle calculations with random expense dates
 * - Ensuring payment reductions work correctly across random amounts
 * - Verifying edge cases (over-limit, zero balance, empty cycles)
 * 
 * Consolidated from: utilization, billingCycle, paymentImpact
 */`,
  'paymentMethodService.lifecycle.pbt.test.js': `/**
 * @invariant Lifecycle State Invariants
 * 
 * This file tests payment method lifecycle properties:
 * 1. Inactive methods hidden from active-only queries
 * 2. Inactive methods still retrievable by ID for historical display
 * 3. Activation/deactivation state transitions
 * 
 * Randomness adds value by:
 * - Testing with various combinations of active/inactive methods
 * - Ensuring state transitions work correctly
 * - Verifying count consistency across random method sets
 * 
 * Consolidated from: inactive
 */`
};

console.log('PaymentMethodService PBT Consolidation Script');
console.log('='.repeat(60));

// Process each consolidation group
for (const [targetFile, sourceFiles] of Object.entries(consolidationGroups)) {
  console.log(`\nConsolidating into: ${targetFile}`);
  console.log(`Source files (${sourceFiles.length}):`);
  sourceFiles.forEach(f => console.log(`  - ${f}`));
  
  const targetPath = path.join(SERVICES_DIR, targetFile);
  const invariantComment = invariantComments[targetFile];
  
  // Start with invariant comment
  let consolidatedContent = invariantComment + '\n\n';
  
  // Track which helper functions we've already added
  const addedFunctions = new Set();
  const helperFunctionNames = [
    'createTestDatabase', 'closeDatabase', 'createTables', 'insertCreditCard',
    'insertExpense', 'insertPayment', 'addDays', 'formatDate',
    'calculateDynamicBalance', 'calculateStatementBalance', 'calculateCurrentBalance',
    'calculateProjectedBalance', 'countExpensesInCycle', 'countExpensesInRange',
    'countExpensesUpToDate', 'sumExpensesInRange', 'sumExpensesUpToDate',
    'getEffectiveDate', 'getBillingCycleDetailsFromDb', 'findByDisplayName',
    'insertPaymentMethod', 'createPaymentMethodsTable', 'uniqueDisplayName',
    'validDate', 'expenseType', 'validDisplayName', 'validFullName',
    'validAccountDetails', 'validCreditLimit', 'validBalance', 'validBillingDay',
    'validBillingCycleDay', 'validPaymentDueDay', 'invalidDayValue', 'validPaymentMethod'
  ];
  
  // Read and merge source files
  for (const sourceFile of sourceFiles) {
    const sourcePath = path.join(SERVICES_DIR, sourceFile);
    
    if (!fs.existsSync(sourcePath)) {
      console.log(`  ⚠️  Warning: ${sourceFile} not found, skipping`);
      continue;
    }
    
    const content = fs.readFileSync(sourcePath, 'utf8');
    
    // Extract everything after the initial comment block
    const lines = content.split('\n');
    let startIndex = 0;
    
    // Skip initial comment block
    let inCommentBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('/**')) {
        inCommentBlock = true;
      } else if (line.endsWith('*/') && inCommentBlock) {
        startIndex = i + 1;
        break;
      } else if (!inCommentBlock && line.length > 0 && !line.startsWith('//')) {
        startIndex = i;
        break;
      }
    }
    
    // Parse content and filter out duplicate helper functions
    const contentLines = lines.slice(startIndex);
    const filteredLines = [];
    let skipUntilNextFunction = false;
    let currentFunctionName = null;
    
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      const trimmed = line.trim();
      
      // Check if this is a function declaration
      const functionMatch = trimmed.match(/^(?:function|const)\s+(\w+)/);
      if (functionMatch) {
        const funcName = functionMatch[1];
        
        // Check if this is a helper function we might have already added
        if (helperFunctionNames.includes(funcName)) {
          if (addedFunctions.has(funcName)) {
            // Skip this function - already added
            skipUntilNextFunction = true;
            currentFunctionName = funcName;
            continue;
          } else {
            // Mark as added
            addedFunctions.add(funcName);
            skipUntilNextFunction = false;
            currentFunctionName = funcName;
          }
        }
      }
      
      // Check if we're at the end of a skipped function
      if (skipUntilNextFunction) {
        // Look for closing brace or semicolon at function level
        if (trimmed === '}' || trimmed === '};' || trimmed.startsWith('describe(')) {
          skipUntilNextFunction = false;
          currentFunctionName = null;
        }
        continue;
      }
      
      // Skip require statements if already added
      if (consolidatedContent.includes("const fc = require('fast-check')") && 
          (trimmed.includes('require(') || trimmed.startsWith('//'))) {
        continue;
      }
      
      filteredLines.push(line);
    }
    
    consolidatedContent += '\n' + filteredLines.join('\n');
  }
  
  // Write consolidated file
  fs.writeFileSync(targetPath, consolidatedContent);
  console.log(`  ✓ Created ${targetFile}`);
}

console.log('\n' + '='.repeat(60));
console.log('Consolidation complete!');
console.log('\nNext steps:');
console.log('1. Run tests: cd backend && npx jest --testPathPatterns paymentMethodService.*pbt');
console.log('2. If tests pass, delete original files');
