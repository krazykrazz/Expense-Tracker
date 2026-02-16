#!/usr/bin/env node
/**
 * Script to consolidate remaining service PBT test files for task 6.6
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

console.log('Consolidating remaining PBT files...\n');

// ============================================================================
// loanService (5 → 2): roundtrip.pbt + data.pbt
// ============================================================================
console.log('1. Consolidating loanService files...');

const loanRoundtrip = fs.readFileSync(path.join(servicesDir, 'loanService.roundtrip.pbt.test.js'), 'utf8');
const loanApiRoundTrip = fs.readFileSync(path.join(servicesDir, 'loanService.apiRoundTrip.pbt.test.js'), 'utf8');
const loanBackwardCompat = fs.readFileSync(path.join(servicesDir, 'loanService.backwardCompatibility.pbt.test.js'), 'utf8');

// Extract test content from apiRoundTrip and backwardCompat
const apiTests = loanApiRoundTrip.split('describe(\'LoanService API Round Trip Property Tests\'')[1];
const backwardTests = loanBackwardCompat.split('describe(\'LoanService Backward Compatibility Property Tests\'')[1];

// Create roundtrip.pbt with all three
const loanRoundtripHeader = `/**
 * Property-Based Tests for LoanService - Round-Trip Operations
 * 
 * Consolidates:
 * - loanService.roundtrip.pbt.test.js (Mortgage Round-Trip)
 * - loanService.apiRoundTrip.pbt.test.js (API Round-Trip)
 * - loanService.backwardCompatibility.pbt.test.js (Backward Compatibility)
 * 
 * **Feature: loan-payment-tracking, mortgage-tracking**
 * **Validates: Round-trip persistence and API consistency**
 * 
 * @invariant Round-Trip Persistence: Data written through the service can be read back
 * with identical values, and API operations maintain consistency across create/read/update cycles.
 */
`;

const loanRoundtripMain = loanRoundtrip.substring(0, loanRoundtrip.indexOf('describe('));
const loanRoundtripTests = loanRoundtrip.split('describe(\'LoanService Mortgage Round-Trip Property Tests\'')[1];

const consolidatedLoanRoundtrip = loanRoundtripHeader + '\n' + loanRoundtripMain +
  `describe('LoanService - Round-Trip Operations Property Tests', () => {
  // ============================================================================
  // Mortgage Round-Trip Tests
  // ============================================================================
` + loanRoundtripTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // API Round-Trip Tests\n' +
  '  // ============================================================================\n\n' +
  apiTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Backward Compatibility Tests\n' +
  '  // ============================================================================\n\n' +
  backwardTests.split('{').slice(1).join('{') +
  '\n});';

fs.writeFileSync(path.join(servicesDir, 'loanService.roundtrip.pbt.test.js'), consolidatedLoanRoundtrip);

// Create data.pbt with existingBalances and fixedRate
const loanExistingBalances = fs.readFileSync(path.join(servicesDir, 'loanService.existingBalances.pbt.test.js'), 'utf8');
const loanFixedRate = fs.readFileSync(path.join(servicesDir, 'loanService.fixedRate.pbt.test.js'), 'utf8');

const existingTests = loanExistingBalances.split('describe(\'LoanService Existing Balance Entries Property Tests\'')[1];
const fixedRateTests = loanFixedRate.split('describe(\'LoanService Fixed Interest Rate Property Tests\'')[1];

const loanDataHeader = `/**
 * Property-Based Tests for LoanService - Data Management
 * 
 * Consolidates:
 * - loanService.existingBalances.pbt.test.js (Existing Balance Entries)
 * - loanService.fixedRate.pbt.test.js (Fixed Interest Rate)
 * 
 * **Feature: loan-payment-tracking**
 * **Validates: Balance history preservation and interest rate management**
 * 
 * @invariant Data Integrity: Existing balance entries are preserved during loan updates,
 * and fixed interest rate changes maintain data consistency.
 */
`;

const loanDataMain = loanExistingBalances.substring(0, loanExistingBalances.indexOf('describe('));

const consolidatedLoanData = loanDataHeader + '\n' + loanDataMain +
  `describe('LoanService - Data Management Property Tests', () => {
  // ============================================================================
  // Existing Balance Entries Tests
  // ============================================================================
` + existingTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Fixed Interest Rate Tests\n' +
  '  // ============================================================================\n\n' +
  fixedRateTests.split('{').slice(1).join('{') +
  '\n});';

fs.writeFileSync(path.join(servicesDir, 'loanService.data.pbt.test.js'), consolidatedLoanData);

console.log('  ✓ Created loanService.roundtrip.pbt.test.js');
console.log('  ✓ Created loanService.data.pbt.test.js');

// Files to delete
const loanFilesToDelete = [
  'loanService.apiRoundTrip.pbt.test.js',
  'loanService.backwardCompatibility.pbt.test.js',
  'loanService.existingBalances.pbt.test.js',
  'loanService.fixedRate.pbt.test.js'
];

console.log('\n✓ Consolidation complete!');
console.log('\nOriginal files to delete:');
loanFilesToDelete.forEach(f => console.log(`  - ${f}`));
