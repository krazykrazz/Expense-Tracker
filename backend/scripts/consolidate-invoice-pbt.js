#!/usr/bin/env node
/**
 * Script to consolidate invoiceService PBT test files
 * invoiceService (4 → 2): crud.pbt + validation.pbt
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

console.log('Consolidating invoiceService PBT files...\n');

// Read source files
const crudContent = fs.readFileSync(path.join(servicesDir, 'invoiceService.crudOperations.pbt.test.js'), 'utf8');
const multiContent = fs.readFileSync(path.join(servicesDir, 'invoiceService.multiInvoice.pbt.test.js'), 'utf8');
const backwardContent = fs.readFileSync(path.join(servicesDir, 'invoiceService.backwardCompatibility.pbt.test.js'), 'utf8');
const validationContent = fs.readFileSync(path.join(servicesDir, 'invoiceService.fileUploadValidation.pbt.test.js'), 'utf8');

// Extract test blocks
const multiTests = multiContent.split(/describe\(['"]/)[1].split('});')[0];
const backwardTests = backwardContent.split(/describe\(['"]/)[1].split('});')[0];

// Create crud.pbt (crud + multi + backward)
const crudHeader = `/**
 * Property-Based Tests for InvoiceService - CRUD Operations
 * 
 * Consolidates:
 * - invoiceService.crudOperations.pbt.test.js (CRUD Operations)
 * - invoiceService.multiInvoice.pbt.test.js (Multi-Invoice)
 * - invoiceService.backwardCompatibility.pbt.test.js (Backward Compatibility)
 * 
 * **Feature: multi-invoice-pdf-attachments**
 * **Validates: CRUD operations, multi-invoice handling, and backward compatibility**
 * 
 * @invariant CRUD Consistency: Invoice operations maintain data integrity across
 * create, read, update, and delete cycles, with proper handling of multiple invoices
 * per expense and backward compatibility with legacy data.
 */
`;

const crudMain = crudContent.substring(0, crudContent.indexOf('describe('));
const crudTests = crudContent.split(/describe\(['"]/)[1];

const consolidatedCrud = crudHeader + '\n' + crudMain +
  `describe('InvoiceService - CRUD Operations Property Tests', () => {
  // ============================================================================
  // CRUD Operations Tests
  // ============================================================================
` + crudTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Multi-Invoice Tests\n' +
  '  // ============================================================================\n\n' +
  multiTests.split('{').slice(1).join('{').split('});')[0] +
  '\n  // ============================================================================\n' +
  '  // Backward Compatibility Tests\n' +
  '  // ============================================================================\n\n' +
  backwardTests.split('{').slice(1).join('{') +
  '\n});';

fs.writeFileSync(path.join(servicesDir, 'invoiceService.crud.pbt.test.js'), consolidatedCrud);

// Create validation.pbt (just rename fileUploadValidation)
const validationHeader = `/**
 * Property-Based Tests for InvoiceService - File Upload Validation
 * 
 * **Feature: multi-invoice-pdf-attachments**
 * **Validates: File upload validation and security**
 * 
 * @invariant File Upload Validation: Invoice file uploads are validated for type,
 * size, and security constraints before acceptance.
 */
`;

const validationMain = validationContent.substring(validationContent.indexOf('const fc'));
const consolidatedValidation = validationHeader + '\n' + validationMain;

fs.writeFileSync(path.join(servicesDir, 'invoiceService.validation.pbt.test.js'), consolidatedValidation);

console.log('✓ Created invoiceService.crud.pbt.test.js');
console.log('✓ Created invoiceService.validation.pbt.test.js');
console.log('\nOriginal files to delete:');
console.log('  - invoiceService.crudOperations.pbt.test.js');
console.log('  - invoiceService.multiInvoice.pbt.test.js');
console.log('  - invoiceService.backwardCompatibility.pbt.test.js');
console.log('  - invoiceService.fileUploadValidation.pbt.test.js');
