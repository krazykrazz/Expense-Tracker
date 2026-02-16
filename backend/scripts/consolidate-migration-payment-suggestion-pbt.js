#!/usr/bin/env node
/**
 * Script to consolidate migrationService and paymentSuggestionService PBT test files
 * migrationService (3 → 1): consolidated.pbt
 * paymentSuggestionService (3 → 1): consolidated.pbt
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

console.log('Consolidating migrationService and paymentSuggestionService PBT files...\n');

// ============================================================================
// migrationService (3 → 1)
// ============================================================================
console.log('1. Consolidating migrationService files...');

const migrationPaymentCalc = fs.readFileSync(path.join(servicesDir, 'migrationService.paymentCalc.pbt.test.js'), 'utf8');
const migrationPreserve = fs.readFileSync(path.join(servicesDir, 'migrationService.preserveBalances.pbt.test.js'), 'utf8');
const migrationSkip = fs.readFileSync(path.join(servicesDir, 'migrationService.skipIncreases.pbt.test.js'), 'utf8');

// Extract test blocks
const preserveTests = migrationPreserve.split('describe(\'MigrationService Property Tests - Preserve Balance Entries\'')[1];
const skipTests = migrationSkip.split('describe(\'MigrationService Property Tests - Skip Balance Increases\'')[1];

const migrationHeader = `/**
 * Property-Based Tests for MigrationService - Balance Entry Migration
 * 
 * Consolidates:
 * - migrationService.paymentCalc.pbt.test.js (Payment Calculation)
 * - migrationService.preserveBalances.pbt.test.js (Preserve Balance Entries)
 * - migrationService.skipIncreases.pbt.test.js (Skip Balance Increases)
 * 
 * **Feature: loan-payment-tracking**
 * **Validates: Balance entry migration logic and payment calculation**
 * 
 * @invariant Migration Integrity: Balance entry migration preserves existing balance
 * history, correctly calculates payments from balance decreases, and skips balance
 * increases to avoid creating invalid payment records.
 */
`;

const migrationMain = migrationPaymentCalc.substring(0, migrationPaymentCalc.indexOf('describe('));
const paymentCalcTests = migrationPaymentCalc.split('describe(\'MigrationService Property Tests - Payment Calculation\'')[1];

const consolidatedMigration = migrationHeader + '\n' + migrationMain +
  `describe('MigrationService - Balance Entry Migration Property Tests', () => {
  // ============================================================================
  // Payment Calculation Tests
  // ============================================================================
` + paymentCalcTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Preserve Balance Entries Tests\n' +
  '  // ============================================================================\n\n' +
  preserveTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Skip Balance Increases Tests\n' +
  '  // ============================================================================\n\n' +
  skipTests.split('{').slice(1).join('{') +
  '\n});';

fs.writeFileSync(path.join(servicesDir, 'migrationService.consolidated.pbt.test.js'), consolidatedMigration);

console.log('  ✓ Created migrationService.consolidated.pbt.test.js');

// ============================================================================
// paymentSuggestionService (3 → 1)
// ============================================================================
console.log('\n2. Consolidating paymentSuggestionService files...');

const suggestionAverage = fs.readFileSync(path.join(servicesDir, 'paymentSuggestionService.average.pbt.test.js'), 'utf8');
const suggestionEmpty = fs.readFileSync(path.join(servicesDir, 'paymentSuggestionService.empty.pbt.test.js'), 'utf8');
const suggestionMortgage = fs.readFileSync(path.join(servicesDir, 'paymentSuggestionService.mortgage.pbt.test.js'), 'utf8');

// Extract test blocks
const emptyTests = suggestionEmpty.split('describe(\'PaymentSuggestionService Property Tests - No Suggestion for Empty History\'')[1];
const mortgageTests = suggestionMortgage.split('describe(\'PaymentSuggestionService Property Tests - Mortgage Payment Suggestion\'')[1];

const suggestionHeader = `/**
 * Property-Based Tests for PaymentSuggestionService - Payment Suggestions
 * 
 * Consolidates:
 * - paymentSuggestionService.average.pbt.test.js (Loan Average Payment Suggestion)
 * - paymentSuggestionService.empty.pbt.test.js (No Suggestion for Empty History)
 * - paymentSuggestionService.mortgage.pbt.test.js (Mortgage Payment Suggestion)
 * 
 * **Feature: loan-payment-tracking**
 * **Validates: Payment suggestion calculation logic**
 * 
 * @invariant Payment Suggestion Logic: Loan payment suggestions are calculated as the
 * average of historical payments, mortgages use configured payment amounts, and loans
 * without payment history return null suggestions.
 */
`;

const suggestionMain = suggestionAverage.substring(0, suggestionAverage.indexOf('describe('));
const averageTests = suggestionAverage.split('describe(\'PaymentSuggestionService Property Tests - Loan Average Payment Suggestion\'')[1];

const consolidatedSuggestion = suggestionHeader + '\n' + suggestionMain +
  `describe('PaymentSuggestionService - Payment Suggestions Property Tests', () => {
  // ============================================================================
  // Loan Average Payment Suggestion Tests
  // ============================================================================
` + averageTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Empty History Tests\n' +
  '  // ============================================================================\n\n' +
  emptyTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Mortgage Payment Suggestion Tests\n' +
  '  // ============================================================================\n\n' +
  mortgageTests.split('{').slice(1).join('{') +
  '\n});';

fs.writeFileSync(path.join(servicesDir, 'paymentSuggestionService.consolidated.pbt.test.js'), consolidatedSuggestion);

console.log('  ✓ Created paymentSuggestionService.consolidated.pbt.test.js');

console.log('\n✓ Consolidation complete!');
console.log('\nOriginal files to delete:');
console.log('  Migration Service:');
console.log('    - migrationService.paymentCalc.pbt.test.js');
console.log('    - migrationService.preserveBalances.pbt.test.js');
console.log('    - migrationService.skipIncreases.pbt.test.js');
console.log('  Payment Suggestion Service:');
console.log('    - paymentSuggestionService.average.pbt.test.js');
console.log('    - paymentSuggestionService.empty.pbt.test.js');
console.log('    - paymentSuggestionService.mortgage.pbt.test.js');
