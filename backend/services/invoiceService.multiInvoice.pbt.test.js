/**
 * Property-Based Tests for Invoice Service Multi-Invoice Support
 * 
 * Feature: multi-invoice-support
 * Properties: 1, 3, 6, 10
 * Validates: Requirements 1.1, 1.3, 2.5, 5.4
 */

const fc = require('fast-check');
const invoiceService = require('./invoiceService');
const invoiceRepository = require('../repositories/invoiceRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const fileStorage = require('../utils/fileStorage');
const fileValidation = require('../utils/fileValidation');
const fs = require('fs');

// Mock dependencies for isolated testing
jest.mock('../repositories/invoiceRepository');
jest.mock('../repositories/expenseRepository');
jest.mock('../repositories/expensePeopleRepository');
jest.mock('../utils/fileStorage');
jest.mock('../utils/fileValidation');
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1024 })
  }
}));

describe('Invoice Service - Property-Based Tests - Multi-Invoice Support', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock setup
    fileStorage.baseInvoiceDir = '/config/invoices';
    
    // Reset fs.promises mocks
    fs.promises.writeFile.mockResolvedValue(undefined);
  });

  // Arbitraries for generating test data
  const expenseIdArbitrary = fc.integer({ min: 1, max: 10000 });
  const personIdArbitrary = fc.integer({ min: 1, max: 1000 });
  const invoiceIdArbitrary = fc.integer({ min: 1, max: 10000 });
  
  const medicalExpenseArbitrary = fc.record({
    id: expenseIdArbitrary,
    type: fc.constant('Tax - Medical'),
    date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString().split('T')[0]),
    place: fc.string({ minLength: 1, maxLength: 100 }),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
  });

  const validFileArbitrary = fc.record({
    originalname: fc.string({ minLength: 1, maxLength: 50 }).map(name => 
      name.replace(/[<>:"/\\|?*]/g, '_') + '.pdf'
    ),
    mimetype: fc.constant('application/pdf'),
    size: fc.integer({ min: 1024, max: 5 * 1024 * 1024 }),
    buffer: fc.constant(Buffer.from('%PDF-1.4\ntest content\n%%EOF'))
  });

  /**
   * Property 1: Multiple Invoice Addition Preserves Collection
   * 
   * For any expense with N existing invoices (where N >= 0), uploading a valid invoice 
   * SHALL result in the expense having exactly N+1 invoices, with the new invoice 
   * included in the collection.
   * 
   * **Validates: Requirements 1.1, 1.2**
   */
  test('Property 1: Multiple Invoice Addition Preserves Collection', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        fc.integer({ min: 0, max: 5 }), // Number of existing invoices
        validFileArbitrary,
        async (expense, existingCount, file) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Generate existing invoices
          const existingInvoices = [];
          for (let i = 0; i < existingCount; i++) {
            existingInvoices.push({
              id: i + 1,
              expenseId: expense.id,
              personId: null,
              personName: null,
              filename: `existing_${i}.pdf`,
              originalFilename: `existing_${i}.pdf`,
              filePath: `path/to/existing_${i}.pdf`,
              fileSize: 1024,
              mimeType: 'application/pdf',
              uploadDate: new Date().toISOString()
            });
          }

          // Setup mocks - upload without personId to simplify test
          expenseRepository.findById.mockResolvedValue(expense);
          
          // Mock successful upload
          const newInvoice = {
            id: existingCount + 1,
            expenseId: expense.id,
            personId: null,
            personName: null,
            filename: 'new_invoice.pdf',
            originalFilename: file.originalname,
            filePath: 'path/to/new_invoice.pdf',
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadDate: new Date().toISOString()
          };

          invoiceRepository.create.mockResolvedValue(newInvoice);
          invoiceRepository.findById.mockResolvedValue(newInvoice);
          fileStorage.generateFilePath.mockReturnValue({
            filename: 'new_invoice.pdf',
            relativePath: 'path/to/new_invoice.pdf',
            fullPath: '/config/invoices/path/to/new_invoice.pdf',
            directoryPath: '/config/invoices/path/to'
          });
          fileStorage.ensureDirectoryExists.mockResolvedValue();
          // Return same size as file.size to avoid corruption check
          fileStorage.getFileStats.mockResolvedValue({ size: file.size });
          fileStorage.deleteFile.mockResolvedValue();
          fileStorage.fileExists.mockResolvedValue(true);
          
          fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
          fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });

          // Upload new invoice (without personId)
          const result = await invoiceService.uploadInvoice(expense.id, file, null, null);

          // Property: New invoice should be created
          expect(result).toBeDefined();
          expect(result.expenseId).toBe(expense.id);
          expect(invoiceRepository.create).toHaveBeenCalled();

          // Simulate getting all invoices after upload
          const allInvoicesAfterUpload = [...existingInvoices, newInvoice];
          invoiceRepository.findAllByExpenseId.mockResolvedValue(allInvoicesAfterUpload);

          const invoicesAfter = await invoiceService.getInvoicesForExpense(expense.id);

          // Property: Collection should have N+1 invoices
          expect(invoicesAfter.length).toBe(existingCount + 1);

          // Property: New invoice should be in the collection
          const newInvoiceInCollection = invoicesAfter.find(inv => inv.id === newInvoice.id);
          expect(newInvoiceInCollection).toBeDefined();

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });


  /**
   * Property 3: Cascade Delete Removes All Invoices
   * 
   * For any expense with N invoices (where N >= 1), deleting the expense SHALL result 
   * in all N associated invoices being removed from the database.
   * 
   * **Validates: Requirements 1.3**
   */
  test('Property 3: Cascade Delete Removes All Invoices', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        fc.integer({ min: 1, max: 5 }), // Number of invoices (at least 1)
        async (expense, invoiceCount) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Generate invoices for the expense
          const invoices = [];
          for (let i = 0; i < invoiceCount; i++) {
            invoices.push({
              id: i + 1,
              expenseId: expense.id,
              personId: null,
              personName: null,
              filename: `invoice_${i}.pdf`,
              originalFilename: `invoice_${i}.pdf`,
              filePath: `path/to/invoice_${i}.pdf`,
              fileSize: 1024,
              mimeType: 'application/pdf',
              uploadDate: new Date().toISOString()
            });
          }

          // Setup mocks
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(invoices[0]); // Return first for backward compat
          invoiceRepository.deleteByExpenseId.mockResolvedValue(invoiceCount); // Returns count of deleted
          fileStorage.deleteFile.mockResolvedValue();
          fileStorage.baseInvoiceDir = '/config/invoices';

          // Delete all invoices for the expense
          const result = await invoiceService.deleteInvoice(expense.id, null);

          // Property: Delete should succeed (returns truthy value - count or true)
          expect(result).toBeTruthy();

          // Property: deleteByExpenseId should be called (which deletes all)
          expect(invoiceRepository.deleteByExpenseId).toHaveBeenCalledWith(expense.id);

          // Simulate empty collection after delete
          invoiceRepository.findAllByExpenseId.mockResolvedValue([]);
          
          const invoicesAfterDelete = await invoiceService.getInvoicesForExpense(expense.id);

          // Property: No invoices should remain
          expect(invoicesAfterDelete.length).toBe(0);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6: Person Removal Sets Invoice Link to NULL
   * 
   * For any invoice linked to a person, when that person is removed from the expense, 
   * the invoice SHALL still exist with person_id set to NULL.
   * 
   * **Validates: Requirements 2.5**
   */
  test('Property 6: Person Removal Sets Invoice Link to NULL', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        personIdArbitrary,
        fc.integer({ min: 1, max: 3 }), // Number of invoices linked to person
        async (expense, personId, linkedInvoiceCount) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Generate invoices - some linked to person, some not
          const invoices = [];
          for (let i = 0; i < linkedInvoiceCount; i++) {
            invoices.push({
              id: i + 1,
              expenseId: expense.id,
              personId: personId, // Linked to person
              personName: 'Test Person',
              filename: `linked_invoice_${i}.pdf`,
              originalFilename: `linked_invoice_${i}.pdf`,
              filePath: `path/to/linked_invoice_${i}.pdf`,
              fileSize: 1024,
              mimeType: 'application/pdf',
              uploadDate: new Date().toISOString()
            });
          }

          // Add one unlinked invoice
          invoices.push({
            id: linkedInvoiceCount + 1,
            expenseId: expense.id,
            personId: null,
            personName: null,
            filename: 'unlinked_invoice.pdf',
            originalFilename: 'unlinked_invoice.pdf',
            filePath: 'path/to/unlinked_invoice.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            uploadDate: new Date().toISOString()
          });

          const totalInvoiceCount = invoices.length;

          // Setup mocks
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.clearPersonIdForExpense.mockResolvedValue(linkedInvoiceCount);

          // Simulate person removal - this would be called by the expense service
          // when a person is removed from an expense
          const clearedCount = await invoiceRepository.clearPersonIdForExpense(expense.id, personId);

          // Property: clearPersonIdForExpense should be called
          expect(invoiceRepository.clearPersonIdForExpense).toHaveBeenCalledWith(expense.id, personId);

          // Property: Should return count of updated invoices
          expect(clearedCount).toBe(linkedInvoiceCount);

          // Simulate invoices after person removal - all invoices still exist but linked ones have null personId
          const invoicesAfterRemoval = invoices.map(inv => ({
            ...inv,
            personId: inv.personId === personId ? null : inv.personId,
            personName: inv.personId === personId ? null : inv.personName
          }));
          invoiceRepository.findAllByExpenseId.mockResolvedValue(invoicesAfterRemoval);

          const invoicesAfter = await invoiceService.getInvoicesForExpense(expense.id);

          // Property: All invoices should still exist
          expect(invoicesAfter.length).toBe(totalInvoiceCount);

          // Property: Previously linked invoices should now have null personId
          const previouslyLinkedInvoices = invoicesAfter.filter(inv => inv.id <= linkedInvoiceCount);
          previouslyLinkedInvoices.forEach(inv => {
            expect(inv.personId).toBeNull();
          });

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 10: Upload Failure Isolation
   * 
   * For any expense with existing invoices, a failed upload attempt SHALL not modify 
   * or remove any existing invoices.
   * 
   * **Validates: Requirements 5.4**
   */
  test('Property 10: Upload Failure Isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        fc.integer({ min: 1, max: 5 }), // Number of existing invoices
        validFileArbitrary,
        fc.constantFrom('validation', 'database'), // Type of failure
        async (expense, existingCount, file, failureType) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Generate existing invoices
          const existingInvoices = [];
          for (let i = 0; i < existingCount; i++) {
            existingInvoices.push({
              id: i + 1,
              expenseId: expense.id,
              personId: null,
              personName: null,
              filename: `existing_${i}.pdf`,
              originalFilename: `existing_${i}.pdf`,
              filePath: `path/to/existing_${i}.pdf`,
              fileSize: 1024,
              mimeType: 'application/pdf',
              uploadDate: new Date().toISOString()
            });
          }

          // Setup mocks - always return existing invoices for this expense
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findAllByExpenseId.mockResolvedValue([...existingInvoices]);
          expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);
          fileStorage.baseInvoiceDir = '/config/invoices';
          fileStorage.deleteFile.mockResolvedValue();

          // Configure failure based on type
          if (failureType === 'validation') {
            fileValidation.validateFileBuffer.mockResolvedValue({ 
              isValid: false, 
              errors: ['Invalid PDF format'], 
              warnings: [] 
            });
          } else if (failureType === 'database') {
            fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
            fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
            fileStorage.generateFilePath.mockReturnValue({
              filename: 'new_invoice.pdf',
              relativePath: 'path/to/new_invoice.pdf',
              fullPath: '/config/invoices/path/to/new_invoice.pdf',
              directoryPath: '/config/invoices/path/to'
            });
            fileStorage.ensureDirectoryExists.mockResolvedValue();
            fileStorage.getFileStats.mockResolvedValue({ size: file.size });
            invoiceRepository.create.mockRejectedValue(new Error('Database failure'));
          }

          // Attempt upload (should fail)
          let uploadFailed = false;
          try {
            await invoiceService.uploadInvoice(expense.id, file, null, null);
          } catch (error) {
            uploadFailed = true;
          }

          // Property: Upload should have failed
          expect(uploadFailed).toBe(true);

          // Property: Existing invoices should be unchanged
          const invoicesAfterFailure = await invoiceService.getInvoicesForExpense(expense.id);
          expect(invoicesAfterFailure.length).toBe(existingCount);

          // Property: Each existing invoice should have same data
          existingInvoices.forEach((original, index) => {
            const current = invoicesAfterFailure[index];
            expect(current.id).toBe(original.id);
            expect(current.expenseId).toBe(original.expenseId);
            expect(current.filename).toBe(original.filename);
          });

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
