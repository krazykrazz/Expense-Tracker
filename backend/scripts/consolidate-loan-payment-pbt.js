#!/usr/bin/env node
/**
 * Script to consolidate loanPaymentService PBT test files
 * loanPaymentService (3 → 2): validation.pbt + roundtrip.pbt
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

console.log('Consolidating loanPaymentService PBT files...\n');

// Read source files
const dateValidation = fs.readFileSync(path.join(servicesDir, 'loanPaymentService.dateValidation.pbt.test.js'), 'utf8');
const amountValidation = fs.readFileSync(path.join(servicesDir, 'loanPaymentService.amountValidation.pbt.test.js'), 'utf8');
const roundtrip = fs.readFileSync(path.join(servicesDir, 'loanPaymentService.roundtrip.pbt.test.js'), 'utf8');

// Extract test blocks from amountValidation
const amountTests = amountValidation.split('describe(\'LoanPaymentService Property Tests - Amount Validation\'')[1];

// Create validation.pbt (date + amount)
const validationHeader = `/**
 * Property-Based Tests for LoanPaymentService - Validation
 * 
 * Consolidates:
 * - loanPaymentService.dateValidation.pbt.test.js (Date Validation)
 * - loanPaymentService.amountValidation.pbt.test.js (Amount Validation)
 * 
 * **Feature: loan-payment-tracking**
 * **Validates: Input validation for loan payment creation**
 * 
 * @invariant Input Validation: Loan payment dates must be valid and not in the future,
 * and payment amounts must be positive non-zero values.
 */
`;

const validationMain = dateValidation.substring(0, dateValidation.indexOf('describe('));
const dateTests = dateValidation.split('describe(\'LoanPaymentService Property Tests - Date Validation\'')[1];

const consolidatedValidation = validationHeader + '\n' + validationMain +
  `describe('LoanPaymentService - Validation Property Tests', () => {
  // ============================================================================
  // Date Validation Tests
  // ============================================================================
` + dateTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Amount Validation Tests\n' +
  '  // ============================================================================\n\n' +
  amountTests.split('{').slice(1).join('{') +
  '\n});';

fs.writeFileSync(path.join(servicesDir, 'loanPaymentService.validation.pbt.test.js'), consolidatedValidation);

// roundtrip.pbt stays as is (just update header)
const roundtripHeader = `/**
 * Property-Based Tests for LoanPaymentService - CRUD Round-Trip
 * 
 * **Feature: loan-payment-tracking**
 * **Validates: Round-trip persistence of loan payment operations**
 * 
 * @invariant Round-Trip Persistence: Loan payment data written through the service
 * can be read back with identical values across create, update, and delete operations.
 */
`;

const roundtripMain = roundtrip.substring(roundtrip.indexOf('const fc'));
const consolidatedRoundtrip = roundtripHeader + '\n' + roundtripMain;

fs.writeFileSync(path.join(servicesDir, 'loanPaymentService.roundtrip.pbt.test.js'), consolidatedRoundtrip);

console.log('✓ Created loanPaymentService.validation.pbt.test.js');
console.log('✓ Updated loanPaymentService.roundtrip.pbt.test.js');
console.log('\nOriginal files to delete:');
console.log('  - loanPaymentService.dateValidation.pbt.test.js');
console.log('  - loanPaymentService.amountValidation.pbt.test.js');
