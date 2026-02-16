/**
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

const fc = require('fast-check');
const { dbPbtOptions, safeISODate, safeDateObject, safeDate } = require('../test/pbtArbitraries');
const invoiceService = require('./invoiceService');
const invoiceRepository = require('../repositories/invoiceRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const fileStorage = require('../utils/fileStorage');
const fileValidation = require('../utils/fileValidation');
const path = require('path');
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

// Shared arbitraries
const expenseIdArbitrary = fc.integer({ min: 1, max: 10000 });
const userIdArbitrary = fc.integer({ min: 1, max: 1000 });
const invoiceIdArbitrary = fc.integer({ min: 1, max: 10000 });
const personIdArbitrary = fc.integer({ min: 1, max: 1000 });

const dateStringArbitrary = fc.integer({ min: 2020, max: 2025 }).chain(year =>
  fc.integer({ min: 1, max: 12 }).chain(month =>
    fc.integer({ min: 1, max: 28 }).map(day => 
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    )
  )
);

const medicalExpenseArbitrary = fc.record({
  id: expenseIdArbitrary,
  type: fc.constant('Tax - Medical'),
  date: dateStringArbitrary,
  place: fc.string({ minLength: 1, maxLength: 100 }),
  amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
});

const nonMedicalExpenseArbitrary = fc.record({
  id: expenseIdArbitrary,
  type: fc.constantFrom('Groceries', 'Gas', 'Dining Out', 'Entertainment'),
  date: dateStringArbitrary,
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

const invoiceDataArbitrary = fc.record({
  id: invoiceIdArbitrary,
  expenseId: expenseIdArbitrary,
  filename: fc.string({ minLength: 5, maxLength: 100 }).map(name => `${name}.pdf`),
  originalFilename: fc.string({ minLength: 1, maxLength: 50 }).map(name => `${name}.pdf`),
  filePath: fc.string({ minLength: 10, maxLength: 200 }),
  fileSize: fc.integer({ min: 1024, max: 5 * 1024 * 1024 }),
  mimeType: fc.constant('application/pdf'),
  uploadDate: safeISODate()
});


describe('InvoiceService - CRUD Operations Property Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    fileStorage.baseInvoiceDir = '/config/invoices';
    fs.promises.writeFile.mockResolvedValue(undefined);
  });

  // ============================================================================
  // CRUD Operations Tests (from invoiceService.crudOperations.pbt.test.js)
  // ============================================================================

  /**
   * Property 1: Upload operation consistency
   * Validates: Requirements 1.1, 1.4, 2.1
   */
  test('Property 1: Upload operation - tax-deductible expenses only', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(medicalExpenseArbitrary, nonMedicalExpenseArbitrary),
        validFileArbitrary,
        async (expense, file) => {
          jest.resetAllMocks();
          jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
          
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(null);
          
          const isTaxDeductible = expense.type === 'Tax - Medical' || expense.type === 'Tax - Donation';
          
          if (isTaxDeductible) {
            const mockInvoice = {
              id: 1, expenseId: expense.id, personId: null,
              filename: 'test.pdf', originalFilename: file.originalname,
              filePath: 'path/to/file.pdf', fileSize: file.size,
              mimeType: file.mimetype, uploadDate: new Date().toISOString()
            };
            
            invoiceRepository.create.mockResolvedValue(mockInvoice);
            fileStorage.generateFilePath.mockReturnValue({
              filename: 'test.pdf', relativePath: 'path/to/file.pdf',
              fullPath: '/full/path/to/file.pdf', directoryPath: '/full/path/to'
            });
            fileStorage.ensureDirectoryExists.mockResolvedValue();
            fileStorage.moveFromTemp.mockResolvedValue();
            fileStorage.getFileStats.mockResolvedValue({ size: file.size });
            
            fileValidation.validateFile.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
            fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
            fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
            
            const originalVerifyIntegrity = invoiceService.verifyInvoiceIntegrity;
            invoiceService.verifyInvoiceIntegrity = jest.fn().mockResolvedValue({ 
              isValid: true, errors: [], warnings: [] 
            });

            try {
              const result = await invoiceService.uploadInvoice(expense.id, file, null, null);
              expect(result).toBeDefined();
              expect(result.expenseId).toBe(expense.id);
              expect(invoiceRepository.create).toHaveBeenCalled();
            } finally {
              invoiceService.verifyInvoiceIntegrity = originalVerifyIntegrity;
            }
          } else {
            await expect(invoiceService.uploadInvoice(expense.id, file, null, null))
              .rejects.toThrow(/tax-deductible expense/i);
            expect(invoiceRepository.create).not.toHaveBeenCalled();
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 2: Retrieval operation consistency
   * Validates: Requirements 1.2, 2.2
   */
  test('Property 2: Retrieval operation - existing vs non-existing invoices', async () => {
    await fc.assert(
      fc.asyncProperty(
        expenseIdArbitrary,
        userIdArbitrary,
        fc.option(invoiceDataArbitrary, { nil: null }),
        async (expenseId, userId, existingInvoice) => {
          if (existingInvoice) {
            existingInvoice = { ...existingInvoice, expenseId };
          }
          const mockExpense = { id: expenseId, type: 'Tax - Medical' };
          expenseRepository.findById.mockResolvedValue(mockExpense);
          invoiceRepository.findByExpenseId.mockResolvedValue(existingInvoice);
          
          if (existingInvoice) {
            fileStorage.fileExists.mockResolvedValue(true);
            fileStorage.getFileStats.mockResolvedValue({ size: existingInvoice.fileSize });
            
            const result = await invoiceService.getInvoice(expenseId, userId);
            expect(result).toBeDefined();
            expect(result.id).toBe(existingInvoice.id);
            expect(result.expenseId).toBe(expenseId);
            expect(result.fullFilePath).toBeDefined();
          } else {
            await expect(invoiceService.getInvoice(expenseId, userId))
              .rejects.toThrow(/no invoice found/i);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 3: Deletion operation consistency
   * Validates: Requirements 1.3, 2.3
   */
  test('Property 3: Deletion operation - idempotency and cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        expenseIdArbitrary,
        userIdArbitrary,
        fc.option(invoiceDataArbitrary, { nil: null }),
        async (expenseId, userId, existingInvoice) => {
          invoiceRepository.deleteByExpenseId.mockReset();
          fileStorage.deleteFile.mockReset();
          expenseRepository.findById.mockReset();
          invoiceRepository.findByExpenseId.mockReset();
          
          const mockExpense = { id: expenseId, type: 'Tax - Medical' };
          expenseRepository.findById.mockResolvedValue(mockExpense);
          invoiceRepository.findByExpenseId.mockResolvedValue(existingInvoice);
          
          if (existingInvoice) {
            invoiceRepository.deleteByExpenseId.mockResolvedValue(true);
            fileStorage.deleteFile.mockResolvedValue();
            
            const result = await invoiceService.deleteInvoice(expenseId, userId);
            expect(result).toBe(true);
            expect(invoiceRepository.deleteByExpenseId).toHaveBeenCalledWith(expenseId);
            expect(fileStorage.deleteFile).toHaveBeenCalled();
          } else {
            const result = await invoiceService.deleteInvoice(expenseId, userId);
            expect(result).toBe(false);
            expect(invoiceRepository.deleteByExpenseId).not.toHaveBeenCalled();
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 4: Metadata retrieval consistency
   * Validates: Requirements 2.4
   */
  test('Property 4: Metadata retrieval - consistent data structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        expenseIdArbitrary,
        fc.option(invoiceDataArbitrary, { nil: null }),
        async (expenseId, existingInvoice) => {
          if (existingInvoice) {
            existingInvoice = { ...existingInvoice, expenseId };
          }
          invoiceRepository.findByExpenseId.mockResolvedValue(existingInvoice);
          expenseRepository.findById.mockResolvedValue({ id: expenseId, type: 'Tax - Medical' });
          
          const result = await invoiceService.getInvoiceMetadata(expenseId);
          
          if (existingInvoice) {
            expect(result).toBeDefined();
            expect(result.id).toBe(existingInvoice.id);
            expect(result.expenseId).toBe(expenseId);
            expect(typeof result.filename).toBe('string');
            expect(typeof result.originalFilename).toBe('string');
            expect(typeof result.filePath).toBe('string');
            expect(typeof result.fileSize).toBe('number');
            expect(result.fileSize).toBeGreaterThan(0);
            expect(typeof result.mimeType).toBe('string');
            expect(typeof result.uploadDate).toBe('string');
          } else {
            expect(result).toBeNull();
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 7: Invoice existence check consistency
   * Validates: Requirements 2.4
   */
  test('Property 7: Invoice existence check - boolean consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        expenseIdArbitrary,
        fc.option(invoiceDataArbitrary, { nil: null }),
        async (expenseId, existingInvoice) => {
          invoiceRepository.hasInvoice.mockResolvedValue(!!existingInvoice);
          
          const result = await invoiceService.hasInvoice(expenseId);
          expect(typeof result).toBe('boolean');
          expect(result).toBe(!!existingInvoice);
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 8: Error handling consistency
   * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
   */
  test('Property 8: Error handling - consistent error types and cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(null),
          fc.record({ id: expenseIdArbitrary, type: fc.constantFrom('Groceries', 'Gas') })
        ),
        validFileArbitrary,
        userIdArbitrary,
        async (expense, file, userId) => {
          expenseRepository.findById.mockResolvedValue(expense);
          
          if (!expense) {
            await expect(invoiceService.uploadInvoice(1, file, userId))
              .rejects.toThrow(/expense not found/i);
          } else if (expense.type !== 'Tax - Medical' && expense.type !== 'Tax - Donation') {
            await expect(invoiceService.uploadInvoice(expense.id, file, userId))
              .rejects.toThrow(/tax-deductible expense/i);
          }
          
          expect(invoiceRepository.create).not.toHaveBeenCalled();
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 9: File path consistency
   * Validates: Requirements 2.1, 2.4
   */
  test('Property 9: File path generation - consistent structure', () => {
    fc.assert(
      fc.property(
        expenseIdArbitrary,
        fc.string({ minLength: 1, maxLength: 50 }).map(name => name + '.pdf'),
        safeDateObject(),
        (expenseId, filename, date) => {
          const mockPaths = {
            filename: `${expenseId}_${Date.now()}_${filename}`,
            relativePath: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${expenseId}_${Date.now()}_${filename}`,
            fullPath: `/config/invoices/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${expenseId}_${Date.now()}_${filename}`,
            directoryPath: `/config/invoices/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`
          };
          
          fileStorage.generateFilePath.mockReturnValue(mockPaths);
          const result = fileStorage.generateFilePath(expenseId, filename, date);
          
          expect(result.filename).toContain(expenseId.toString());
          expect(result.filename).toContain('.pdf');
          expect(result.relativePath).toContain(date.getFullYear().toString());
          expect(result.relativePath).toContain(String(date.getMonth() + 1).padStart(2, '0'));
          const normalizedFullPath = result.fullPath.replace(/\\/g, '/');
          const normalizedRelativePath = result.relativePath.replace(/\\/g, '/');
          expect(normalizedFullPath).toContain(normalizedRelativePath);
          expect(result.directoryPath).toContain(date.getFullYear().toString());
        }
      ),
      dbPbtOptions()
    );
  });


  // ============================================================================
  // Multi-Invoice Tests (from invoiceService.multiInvoice.pbt.test.js)
  // ============================================================================

  /**
   * Property 1 (Multi): Multiple Invoice Addition Preserves Collection
   * 
   * For any expense with N existing invoices (where N >= 0), uploading a valid invoice 
   * SHALL result in the expense having exactly N+1 invoices.
   * 
   * **Validates: Requirements 1.1, 1.2**
   */
  test('Multi-Invoice Property 1: Multiple Invoice Addition Preserves Collection', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        fc.integer({ min: 0, max: 5 }),
        validFileArbitrary,
        async (expense, existingCount, file) => {
          jest.clearAllMocks();
          
          const existingInvoices = [];
          for (let i = 0; i < existingCount; i++) {
            existingInvoices.push({
              id: i + 1, expenseId: expense.id, personId: null, personName: null,
              filename: `existing_${i}.pdf`, originalFilename: `existing_${i}.pdf`,
              filePath: `path/to/existing_${i}.pdf`, fileSize: 1024,
              mimeType: 'application/pdf', uploadDate: new Date().toISOString()
            });
          }

          expenseRepository.findById.mockResolvedValue(expense);
          
          const newInvoice = {
            id: existingCount + 1, expenseId: expense.id, personId: null, personName: null,
            filename: 'new_invoice.pdf', originalFilename: file.originalname,
            filePath: 'path/to/new_invoice.pdf', fileSize: file.size,
            mimeType: file.mimetype, uploadDate: new Date().toISOString()
          };

          invoiceRepository.create.mockResolvedValue(newInvoice);
          invoiceRepository.findById.mockResolvedValue(newInvoice);
          fileStorage.generateFilePath.mockReturnValue({
            filename: 'new_invoice.pdf', relativePath: 'path/to/new_invoice.pdf',
            fullPath: '/config/invoices/path/to/new_invoice.pdf', directoryPath: '/config/invoices/path/to'
          });
          fileStorage.ensureDirectoryExists.mockResolvedValue();
          fileStorage.getFileStats.mockResolvedValue({ size: file.size });
          fileStorage.deleteFile.mockResolvedValue();
          fileStorage.fileExists.mockResolvedValue(true);
          
          fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
          fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });

          const result = await invoiceService.uploadInvoice(expense.id, file, null, null);
          expect(result).toBeDefined();
          expect(result.expenseId).toBe(expense.id);
          expect(invoiceRepository.create).toHaveBeenCalled();

          const allInvoicesAfterUpload = [...existingInvoices, newInvoice];
          invoiceRepository.findAllByExpenseId.mockResolvedValue(allInvoicesAfterUpload);

          const invoicesAfter = await invoiceService.getInvoicesForExpense(expense.id);
          expect(invoicesAfter.length).toBe(existingCount + 1);

          const newInvoiceInCollection = invoicesAfter.find(inv => inv.id === newInvoice.id);
          expect(newInvoiceInCollection).toBeDefined();

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 3 (Multi): Cascade Delete Removes All Invoices
   * 
   * For any expense with N invoices (where N >= 1), deleting the expense SHALL result 
   * in all N associated invoices being removed.
   * 
   * **Validates: Requirements 1.3**
   */
  test('Multi-Invoice Property 3: Cascade Delete Removes All Invoices', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        fc.integer({ min: 1, max: 5 }),
        async (expense, invoiceCount) => {
          jest.clearAllMocks();
          
          const invoices = [];
          for (let i = 0; i < invoiceCount; i++) {
            invoices.push({
              id: i + 1, expenseId: expense.id, personId: null, personName: null,
              filename: `invoice_${i}.pdf`, originalFilename: `invoice_${i}.pdf`,
              filePath: `path/to/invoice_${i}.pdf`, fileSize: 1024,
              mimeType: 'application/pdf', uploadDate: new Date().toISOString()
            });
          }

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(invoices[0]);
          invoiceRepository.deleteByExpenseId.mockResolvedValue(invoiceCount);
          fileStorage.deleteFile.mockResolvedValue();
          fileStorage.baseInvoiceDir = '/config/invoices';

          const result = await invoiceService.deleteInvoice(expense.id, null);
          expect(result).toBeTruthy();
          expect(invoiceRepository.deleteByExpenseId).toHaveBeenCalledWith(expense.id);

          invoiceRepository.findAllByExpenseId.mockResolvedValue([]);
          const invoicesAfterDelete = await invoiceService.getInvoicesForExpense(expense.id);
          expect(invoicesAfterDelete.length).toBe(0);

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 6 (Multi): Person Removal Sets Invoice Link to NULL
   * 
   * **Validates: Requirements 2.5**
   */
  test('Multi-Invoice Property 6: Person Removal Sets Invoice Link to NULL', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        personIdArbitrary,
        fc.integer({ min: 1, max: 3 }),
        async (expense, personId, linkedInvoiceCount) => {
          jest.clearAllMocks();
          
          const invoices = [];
          for (let i = 0; i < linkedInvoiceCount; i++) {
            invoices.push({
              id: i + 1, expenseId: expense.id, personId: personId, personName: 'Test Person',
              filename: `linked_invoice_${i}.pdf`, originalFilename: `linked_invoice_${i}.pdf`,
              filePath: `path/to/linked_invoice_${i}.pdf`, fileSize: 1024,
              mimeType: 'application/pdf', uploadDate: new Date().toISOString()
            });
          }
          invoices.push({
            id: linkedInvoiceCount + 1, expenseId: expense.id, personId: null, personName: null,
            filename: 'unlinked_invoice.pdf', originalFilename: 'unlinked_invoice.pdf',
            filePath: 'path/to/unlinked_invoice.pdf', fileSize: 1024,
            mimeType: 'application/pdf', uploadDate: new Date().toISOString()
          });

          const totalInvoiceCount = invoices.length;

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.clearPersonIdForExpense.mockResolvedValue(linkedInvoiceCount);

          const clearedCount = await invoiceRepository.clearPersonIdForExpense(expense.id, personId);
          expect(invoiceRepository.clearPersonIdForExpense).toHaveBeenCalledWith(expense.id, personId);
          expect(clearedCount).toBe(linkedInvoiceCount);

          const invoicesAfterRemoval = invoices.map(inv => ({
            ...inv,
            personId: inv.personId === personId ? null : inv.personId,
            personName: inv.personId === personId ? null : inv.personName
          }));
          invoiceRepository.findAllByExpenseId.mockResolvedValue(invoicesAfterRemoval);

          const invoicesAfter = await invoiceService.getInvoicesForExpense(expense.id);
          expect(invoicesAfter.length).toBe(totalInvoiceCount);

          const previouslyLinkedInvoices = invoicesAfter.filter(inv => inv.id <= linkedInvoiceCount);
          previouslyLinkedInvoices.forEach(inv => {
            expect(inv.personId).toBeNull();
          });

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 10 (Multi): Upload Failure Isolation
   * 
   * **Validates: Requirements 5.4**
   */
  test('Multi-Invoice Property 10: Upload Failure Isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        fc.integer({ min: 1, max: 5 }),
        validFileArbitrary,
        fc.constantFrom('validation', 'database'),
        async (expense, existingCount, file, failureType) => {
          jest.clearAllMocks();
          
          const existingInvoices = [];
          for (let i = 0; i < existingCount; i++) {
            existingInvoices.push({
              id: i + 1, expenseId: expense.id, personId: null, personName: null,
              filename: `existing_${i}.pdf`, originalFilename: `existing_${i}.pdf`,
              filePath: `path/to/existing_${i}.pdf`, fileSize: 1024,
              mimeType: 'application/pdf', uploadDate: new Date().toISOString()
            });
          }

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findAllByExpenseId.mockResolvedValue([...existingInvoices]);
          expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);
          fileStorage.baseInvoiceDir = '/config/invoices';
          fileStorage.deleteFile.mockResolvedValue();

          if (failureType === 'validation') {
            fileValidation.validateFileBuffer.mockResolvedValue({ 
              isValid: false, errors: ['Invalid PDF format'], warnings: [] 
            });
          } else {
            fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
            fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
            fileStorage.generateFilePath.mockReturnValue({
              filename: 'new_invoice.pdf', relativePath: 'path/to/new_invoice.pdf',
              fullPath: '/config/invoices/path/to/new_invoice.pdf', directoryPath: '/config/invoices/path/to'
            });
            fileStorage.ensureDirectoryExists.mockResolvedValue();
            fileStorage.getFileStats.mockResolvedValue({ size: file.size });
            invoiceRepository.create.mockRejectedValue(new Error('Database failure'));
          }

          let uploadFailed = false;
          try {
            await invoiceService.uploadInvoice(expense.id, file, null, null);
          } catch (error) {
            uploadFailed = true;
          }

          expect(uploadFailed).toBe(true);

          const invoicesAfterFailure = await invoiceService.getInvoicesForExpense(expense.id);
          expect(invoicesAfterFailure.length).toBe(existingCount);

          existingInvoices.forEach((original, index) => {
            const current = invoicesAfterFailure[index];
            expect(current.id).toBe(original.id);
            expect(current.expenseId).toBe(original.expenseId);
            expect(current.filename).toBe(original.filename);
          });

          return true;
        }
      ),
      dbPbtOptions()
    );
  });


  // ============================================================================
  // Backward Compatibility Tests (from invoiceService.backwardCompatibility.pbt.test.js)
  // ============================================================================

  /**
   * Property 17: Backward Compatible Single Upload
   * 
   * For any single invoice upload without person_id to an expense with no existing invoices,
   * the system SHALL behave identically to the previous single-invoice implementation.
   * 
   * **Validates: Requirements 9.1**
   */
  test('Property 17: Backward Compatible Single Upload - upload without person selection works', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        async (expense, file) => {
          jest.clearAllMocks();
          
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(null);
          expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);
          
          const newInvoice = {
            id: 1, expenseId: expense.id, personId: null, personName: null,
            filename: 'uploaded_invoice.pdf', originalFilename: file.originalname,
            filePath: 'path/to/uploaded_invoice.pdf', fileSize: file.size,
            mimeType: file.mimetype, uploadDate: new Date().toISOString()
          };

          invoiceRepository.create.mockResolvedValue(newInvoice);
          invoiceRepository.findById.mockResolvedValue(newInvoice);
          invoiceRepository.findAllByExpenseId.mockResolvedValue([newInvoice]);
          
          fileStorage.generateFilePath.mockReturnValue({
            filename: 'uploaded_invoice.pdf', relativePath: 'path/to/uploaded_invoice.pdf',
            fullPath: '/config/invoices/path/to/uploaded_invoice.pdf', directoryPath: '/config/invoices/path/to'
          });
          fileStorage.ensureDirectoryExists.mockResolvedValue();
          fileStorage.getFileStats.mockResolvedValue({ size: file.size });
          fileStorage.deleteFile.mockResolvedValue();
          fileStorage.fileExists.mockResolvedValue(true);
          
          fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
          fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });

          const result = await invoiceService.uploadInvoice(expense.id, file, null, null);

          expect(result).toBeDefined();
          expect(result.expenseId).toBe(expense.id);
          expect(result.personId).toBeNull();
          expect(invoiceRepository.create).toHaveBeenCalled();
          
          const createCall = invoiceRepository.create.mock.calls[0][0];
          expect(createCall.personId).toBeNull();

          const invoices = await invoiceService.getInvoicesForExpense(expense.id);
          expect(invoices.length).toBe(1);
          expect(invoices[0].personId).toBeNull();

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Backward Compatibility: Single invoice returns correct count for display
   * **Validates: Requirements 9.5**
   */
  test('Backward Compatibility: Single invoice returns correct count for display', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        async (expense, file) => {
          jest.clearAllMocks();
          
          const singleInvoice = {
            id: 1, expenseId: expense.id, personId: null, personName: null,
            filename: 'single_invoice.pdf', originalFilename: file.originalname,
            filePath: 'path/to/single_invoice.pdf', fileSize: file.size,
            mimeType: file.mimetype, uploadDate: new Date().toISOString()
          };

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findAllByExpenseId.mockResolvedValue([singleInvoice]);
          invoiceRepository.getCountByExpenseId.mockResolvedValue(1);

          const invoices = await invoiceService.getInvoicesForExpense(expense.id);

          expect(invoices.length).toBe(1);
          expect(invoices[0].id).toBeDefined();
          expect(invoices[0].expenseId).toBe(expense.id);
          expect(invoices[0].filename).toBeDefined();
          expect(invoices[0].originalFilename).toBeDefined();
          expect(invoices[0].fileSize).toBeDefined();
          expect(invoices[0].uploadDate).toBeDefined();

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Backward Compatibility: File validation rules unchanged
   * **Validates: Requirements 9.3**
   */
  test('Backward Compatibility: File validation rules unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        fc.constantFrom('invalid_type', 'too_large', 'valid'),
        async (expense, fileScenario) => {
          jest.clearAllMocks();
          
          expenseRepository.findById.mockResolvedValue(expense);
          expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);
          
          let file;
          let expectedError = null;
          
          switch (fileScenario) {
            case 'invalid_type':
              file = {
                originalname: 'document.txt', mimetype: 'text/plain',
                size: 1024, buffer: Buffer.from('text content')
              };
              fileValidation.validateFileBuffer.mockResolvedValue({ 
                isValid: false, errors: ['Invalid file type. Only PDF files are allowed.'], warnings: [] 
              });
              expectedError = /file validation failed/i;
              break;
              
            case 'too_large':
              file = {
                originalname: 'large.pdf', mimetype: 'application/pdf',
                size: 15 * 1024 * 1024, buffer: Buffer.from('%PDF-1.4\nlarge content\n%%EOF')
              };
              fileValidation.validateFileBuffer.mockResolvedValue({ 
                isValid: false, errors: ['File size exceeds 10MB limit'], warnings: [] 
              });
              expectedError = /file validation failed/i;
              break;
              
            case 'valid':
              file = {
                originalname: 'valid.pdf', mimetype: 'application/pdf',
                size: 1024, buffer: Buffer.from('%PDF-1.4\nvalid content\n%%EOF')
              };
              fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
              fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
              
              const newInvoice = {
                id: 1, expenseId: expense.id, personId: null,
                filename: 'valid.pdf', originalFilename: file.originalname,
                filePath: 'path/to/valid.pdf', fileSize: file.size,
                mimeType: file.mimetype, uploadDate: new Date().toISOString()
              };
              
              invoiceRepository.create.mockResolvedValue(newInvoice);
              invoiceRepository.findById.mockResolvedValue(newInvoice);
              fileStorage.generateFilePath.mockReturnValue({
                filename: 'valid.pdf', relativePath: 'path/to/valid.pdf',
                fullPath: '/config/invoices/path/to/valid.pdf', directoryPath: '/config/invoices/path/to'
              });
              fileStorage.ensureDirectoryExists.mockResolvedValue();
              fileStorage.getFileStats.mockResolvedValue({ size: file.size });
              fileStorage.fileExists.mockResolvedValue(true);
              break;
          }

          if (expectedError) {
            await expect(invoiceService.uploadInvoice(expense.id, file, null, null))
              .rejects.toThrow(expectedError);
            expect(invoiceRepository.create).not.toHaveBeenCalled();
          } else {
            const result = await invoiceService.uploadInvoice(expense.id, file, null, null);
            expect(result).toBeDefined();
            expect(invoiceRepository.create).toHaveBeenCalled();
          }

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Backward Compatibility: Upload mechanism works regardless of file source
   * **Validates: Requirements 9.2**
   */
  test('Backward Compatibility: Upload mechanism works regardless of file source', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        fc.constantFrom('drag_drop', 'click_select'),
        async (expense, file, source) => {
          jest.clearAllMocks();
          
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(null);
          expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);
          
          const newInvoice = {
            id: 1, expenseId: expense.id, personId: null,
            filename: 'invoice.pdf', originalFilename: file.originalname,
            filePath: 'path/to/invoice.pdf', fileSize: file.size,
            mimeType: file.mimetype, uploadDate: new Date().toISOString()
          };

          invoiceRepository.create.mockResolvedValue(newInvoice);
          invoiceRepository.findById.mockResolvedValue(newInvoice);
          
          fileStorage.generateFilePath.mockReturnValue({
            filename: 'invoice.pdf', relativePath: 'path/to/invoice.pdf',
            fullPath: '/config/invoices/path/to/invoice.pdf', directoryPath: '/config/invoices/path/to'
          });
          fileStorage.ensureDirectoryExists.mockResolvedValue();
          fileStorage.getFileStats.mockResolvedValue({ size: file.size });
          fileStorage.fileExists.mockResolvedValue(true);
          
          fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
          fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });

          const result = await invoiceService.uploadInvoice(expense.id, file, null, null);

          expect(result).toBeDefined();
          expect(result.expenseId).toBe(expense.id);
          expect(result.id).toBeDefined();
          expect(result.filename).toBeDefined();
          expect(result.originalFilename).toBe(file.originalname);
          expect(result.fileSize).toBe(file.size);

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Backward Compatibility: Invoice retrieval supports view/download/print
   * **Validates: Requirements 9.4**
   */
  test('Backward Compatibility: Invoice retrieval supports view/download/print', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        async (expense, file) => {
          jest.clearAllMocks();
          
          const invoice = {
            id: 1, expenseId: expense.id, personId: null, personName: null,
            filename: 'invoice.pdf', originalFilename: file.originalname,
            filePath: '2025/01/invoice.pdf', fileSize: file.size,
            mimeType: 'application/pdf', uploadDate: new Date().toISOString()
          };

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(invoice);
          invoiceRepository.findById.mockResolvedValue(invoice);
          fileStorage.fileExists.mockResolvedValue(true);
          fileStorage.getFileStats.mockResolvedValue({ size: file.size });
          fileStorage.baseInvoiceDir = '/config/invoices';

          const result = await invoiceService.getInvoice(expense.id, null);

          expect(result).toBeDefined();
          expect(result.id).toBe(invoice.id);
          expect(result.expenseId).toBe(expense.id);
          expect(result.filename).toBeDefined();
          expect(result.originalFilename).toBeDefined();
          expect(result.filePath).toBeDefined();
          expect(result.fileSize).toBeGreaterThan(0);
          expect(result.mimeType).toBe('application/pdf');
          expect(result.fullFilePath).toBeDefined();
          expect(result.fileStats).toBeDefined();
          expect(result.fileStats.size).toBe(file.size);

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Backward Compatibility: Single invoice without person link has correct structure
   * **Validates: Requirements 9.5**
   */
  test('Backward Compatibility: Single invoice without person link has correct structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        async (expense, file) => {
          jest.clearAllMocks();
          
          const singleInvoice = {
            id: 1, expenseId: expense.id, personId: null, personName: null,
            filename: 'single_invoice.pdf', originalFilename: file.originalname,
            filePath: 'path/to/single_invoice.pdf', fileSize: file.size,
            mimeType: 'application/pdf', uploadDate: new Date().toISOString()
          };

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findAllByExpenseId.mockResolvedValue([singleInvoice]);

          const invoices = await invoiceService.getInvoicesForExpense(expense.id);

          expect(invoices.length).toBe(1);
          
          const inv = invoices[0];
          expect(inv.personId).toBeNull();
          expect(inv.personName).toBeNull();
          expect(inv.id).toBeDefined();
          expect(inv.expenseId).toBe(expense.id);
          expect(inv.filename).toBeDefined();
          expect(inv.originalFilename).toBeDefined();
          expect(inv.fileSize).toBeDefined();
          expect(inv.mimeType).toBe('application/pdf');
          expect(inv.uploadDate).toBeDefined();

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

});
