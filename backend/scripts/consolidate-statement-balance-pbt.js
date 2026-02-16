#!/usr/bin/env node
/**
 * Script to consolidate statementBalanceService PBT test files
 * 
 * Consolidates:
 * - statementBalanceService.expense.pbt.test.js
 * - statementBalanceService.payment.pbt.test.js  
 * - statementBalanceService.floor.pbt.test.js
 * Into: statementBalanceService.calculation.pbt.test.js
 * 
 * - statementBalanceService.billingCycle.pbt.test.js
 * Remains as: statementBalanceService.cycle.pbt.test.js (renamed)
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

// Read source files
const expenseContent = fs.readFileSync(path.join(servicesDir, 'statementBalanceService.expense.pbt.test.js'), 'utf8');
const paymentContent = fs.readFileSync(path.join(servicesDir, 'statementBalanceService.payment.pbt.test.js'), 'utf8');
const floorContent = fs.readFileSync(path.join(servicesDir, 'statementBalanceService.floor.pbt.test.js'), 'utf8');
const billingCycleContent = fs.readFileSync(path.join(servicesDir, 'statementBalanceService.billingCycle.pbt.test.js'), 'utf8');

// Extract test blocks from payment file (skip header and setup)
const paymentTests = paymentContent
  .split('describe(\'StatementBalanceService - Payment Subtraction - Property-Based Tests\'')[1]
  .split('});')[0] + '});';

// Extract test blocks from floor file (skip header and setup)
const floorTests = floorContent
  .split('describe(\'StatementBalanceService - Floor at Zero - Property-Based Tests\'')[1]
  .split('});')[0] + '});';

// Create consolidated calculation file
const calculationHeader = `/**
 * Property-Based Tests for StatementBalanceService - Balance Calculation
 * 
 * Consolidates:
 * - statementBalanceService.expense.pbt.test.js (Expense Calculation)
 * - statementBalanceService.payment.pbt.test.js (Payment Subtraction)
 * - statementBalanceService.floor.pbt.test.js (Floor at Zero)
 * 
 * **Feature: credit-card-statement-balance**
 * **Validates: Requirements 3.1, 3.2, 3.5, 3.6, 4.2, 4.3, 4.4**
 * 
 * @invariant Statement Balance Calculation: For any credit card with a configured billing
 * cycle, the statement balance equals the sum of expenses in the previous cycle minus
 * payments made since the statement date, floored at zero for overpayment scenarios.
 */
`;

// Get the main describe block from expense file and add other test sections
const expenseMainBlock = expenseContent.split('describe(\'StatementBalanceService - Statement Balance Expense Calculation - Property-Based Tests\'')[1];
const expenseTestsOnly = expenseMainBlock.substring(0, expenseMainBlock.lastIndexOf('});'));

const calculationContent = calculationHeader + '\n' +
  expenseContent.substring(0, expenseContent.indexOf('describe(')) +
  `describe('StatementBalanceService - Balance Calculation Property Tests'` +
  expenseTestsOnly +
  '\n  // ============================================================================\n' +
  '  // Payment Subtraction Tests\n' +
  '  // ============================================================================\n\n' +
  paymentTests.split('{')[1].split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Floor at Zero Tests\n' +
  '  // ============================================================================\n\n' +
  floorTests.split('{')[1] +
  '\n});';

// Create cycle file (just rename billingCycle)
const cycleContent = billingCycleContent.replace(
  'StatementBalanceService - Billing Cycle Date Calculation - Property-Based Tests',
  'StatementBalanceService - Billing Cycle Property Tests'
).replace(
  '/**\n * Property-Based Tests for StatementBalanceService - Billing Cycle Date Calculation',
  '/**\n * Property-Based Tests for StatementBalanceService - Billing Cycle\n * \n * **Feature: credit-card-statement-balance**\n * **Validates: Requirements 3.3**\n * \n * @invariant Billing Cycle Date Calculation'
);

// Write consolidated files
fs.writeFileSync(path.join(servicesDir, 'statementBalanceService.calculation.pbt.test.js'), calculationContent);
fs.writeFileSync(path.join(servicesDir, 'statementBalanceService.cycle.pbt.test.js'), cycleContent);

console.log('✓ Created statementBalanceService.calculation.pbt.test.js');
console.log('✓ Created statementBalanceService.cycle.pbt.test.js');
console.log('\nOriginal files to delete:');
console.log('  - statementBalanceService.expense.pbt.test.js');
console.log('  - statementBalanceService.payment.pbt.test.js');
console.log('  - statementBalanceService.floor.pbt.test.js');
console.log('  - statementBalanceService.billingCycle.pbt.test.js');
