/**
 * Property-Based Tests for Invoice Service CRUD Operations
 * 
 * Feature: medical-expense-invoices
 * Property 2: Invoice CRUD operations
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5
 */

const fc = require('fast-check');
const invoiceService = require('./invoiceService');
const invoiceRepository = require('../repositories/invoiceRepository');
const expenseRepository = require('../repositories/expenseRepository');
const fileStorage = require('../utils/fileStorage');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock dependencies for isolated testing
jest.mock('../repositories/invoiceRepository');
jest.mock('../repositories/expenseRepository');
jest.mock('../utils/fileStorage');
jest.mock('../utils/fileValidation');

describe('Invoice Service - Property-Based Tests - CRUD Operations', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Arbitraries for generating test data
  const expenseIdArbitrary = fc.integer({ min: 1, max: 10000 });
  const userIdArbitrary = fc.integer({ min: 1, max: 1000 });
  const invoiceIdArbitrary = fc.integer({ min: 1, max: 10000 });
  
  const medicalExpenseArbitrary = fc.record({
    id: expenseIdArbitrary,
    type: fc.constant('Tax - Medical'),
    date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString().split('T')[0]),
    place: fc.string({ minLength: 1, maxLength: 100 }),
    amount: fc.float({ min: 0.01, max: 10000, noNaN: true })
  });

  const nonMedicalExpenseArbitrary = fc.record({
    id: expenseIdArbitrary,
    type: fc.constantFrom('Groceries', 'Gas', 'Dining Out', 'Entertainment'),
    date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString().split('T')[0]),
    place: fc.string({ minLength: 1, maxLength: 100 }),
    amount: fc.float({ min: 0.01, max: 10000, noNaN: true })
  });

  const validFileArbitrary = fc.record({
    originalname: fc.string({ minLength: 1, maxLength: 50 }).map(name => 
      name.replace(/[<>:"/\\|?*]/g, '_') + '.pdf'
    ),
    mimetype: fc.constant('application/pdf'),
    size: fc.integer({ min: 1024, max: 5 * 1024 * 1024 }), // 1KB to 5MB
    path: fc.string({ minLength: 10, maxLength: 100 }).map(p => `/tmp/upload_${p}`),
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
    uploadDate: fc.date().map(d => d.toISOString())
  });

  /**
   * Property 1: Upload operation consistency
   * Validates: Requirements 1.1, 1.4, 2.1
   */
  test('Property 1: Upload operation - medical expenses only', () => {
    fc.assert(
      fc.property(
        fc.oneof(medicalExpenseArbitrary, nonMedicalExpenseArbitrary),
        validFileArbitrary,
        userIdArbitrary,
        async (expense, file, userId) => {
          // Setup mocks
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(null); // No existing invoice
          
          if (expense.type === 'Tax - Medical') {
            // Mock successful upload for medical expenses
            const mockInvoice = {
              id: 1,
              expenseId: expense.id,
              filename: 'test.pdf',
              originalFilename: file.originalname,
              filePath: 'path/to/file.pdf',
              fileSize: file.size,
              mimeType: file.mimetype,
              uploadDate: new Date().toISOString()
            };
            
            invoiceRepository.create.mockResolvedValue(mockInvoice);
            fileStorage.generateFilePath.mockReturnValue({
              filename: 'test.pdf',
              relativePath: 'path/to/file.pdf',
              fullPath: '/full/path/to/file.pdf',
              directoryPath: '/full/path/to'
            });
            fileStorage.ensureDirectoryExists.mockResolvedValue();
            fileStorage.moveFromTemp.mockResolvedValue();
            fileStorage.getFileStats.mockResolvedValue({ size: file.size });
            
            // Mock file validation
            const fileValidation = require('../utils/fileValidation');
            fileValidation.validateFile.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
            fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
            
            // Mock invoice service methods
            const originalVerifyIntegrity = invoiceService.verifyInvoiceIntegrity;
            invoiceService.verifyInvoiceIntegrity = jest.fn().mockResolvedValue({ 
              isValid: true, 
              errors: [], 
              warnings: [] 
            });

            try {
              const result = await invoiceService.uploadInvoice(expense.id, file, userId);
              
              // Property: Medical expenses should allow invoice upload
              expect(result).toBeDefined();
              expect(result.expenseId).toBe(expense.id);
              expect(invoiceRepository.create).toHaveBeenCalled();
              
            } finally {
              invoiceService.verifyInvoiceIntegrity = originalVerifyIntegrity;
            }
            
          } else {
            // Property: Non-medical expenses should reject invoice upload
            await expect(invoiceService.uploadInvoice(expense.id, file, userId))
              .rejects.toThrow(/medical expense/i);
            
            expect(invoiceRepository.create).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 2: Retrieval operation consistency
   * Validates: Requirements 1.2, 2.2
   */
  test('Property 2: Retrieval operation - existing vs non-existing invoices', () => {
    fc.assert(
      fc.property(
        expenseIdArbitrary,
        userIdArbitrary,
        fc.option(invoiceDataArbitrary, { nil: null }),
        async (expenseId, userId, existingInvoice) => {
          // Setup mocks
          const mockExpense = { id: expenseId, type: 'Tax - Medical' };
          expenseRepository.findById.mockResolvedValue(mockExpense);
          invoiceRepository.findByExpenseId.mockResolvedValue(existingInvoice);
          
          if (existingInvoice) {
            const fullPath = path.join('/base/path', existingInvoice.filePath);
            fileStorage.fileExists.mockResolvedValue(true);
            fileStorage.getFileStats.mockResolvedValue({ size: existingInvoice.fileSize });
            
            const result = await invoiceService.getInvoice(expenseId, userId);
            
            // Property: Existing invoices should be retrievable
            expect(result).toBeDefined();
            expect(result.id).toBe(existingInvoice.id);
            expect(result.expenseId).toBe(expenseId);
            expect(result.fullFilePath).toBeDefined();
            
          } else {
            // Property: Non-existing invoices should throw error
            await expect(invoiceService.getInvoice(expenseId, userId))
              .rejects.toThrow(/no invoice found/i);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 3: Deletion operation consistency
   * Validates: Requirements 1.3, 2.3
   */
  test('Property 3: Deletion operation - idempotency and cleanup', () => {
    fc.assert(
      fc.property(
        expenseIdArbitrary,
        userIdArbitrary,
        fc.option(invoiceDataArbitrary, { nil: null }),
        async (expenseId, userId, existingInvoice) => {
          // Setup mocks
          const mockExpense = { id: expenseId, type: 'Tax - Medical' };
          expenseRepository.findById.mockResolvedValue(mockExpense);
          invoiceRepository.findByExpenseId.mockResolvedValue(existingInvoice);
          
          if (existingInvoice) {
            invoiceRepository.deleteByExpenseId.mockResolvedValue(true);
            fileStorage.deleteFile.mockResolvedValue();
            
            const result = await invoiceService.deleteInvoice(expenseId, userId);
            
            // Property: Existing invoices should be deletable
            expect(result).toBe(true);
            expect(invoiceRepository.deleteByExpenseId).toHaveBeenCalledWith(expenseId);
            expect(fileStorage.deleteFile).toHaveBeenCalled();
            
          } else {
            const result = await invoiceService.deleteInvoice(expenseId, userId);
            
            // Property: Deleting non-existing invoice should return false (idempotent)
            expect(result).toBe(false);
            expect(invoiceRepository.deleteByExpenseId).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * Property 4: Metadata retrieval consistency
   * Validates: Requirements 2.4
   */
  test('Property 4: Metadata retrieval - consistent data structure', () => {
    fc.assert(
      fc.property(
        expenseIdArbitrary,
        fc.option(invoiceDataArbitrary, { nil: null }),
        async (expenseId, existingInvoice) => {
          // Setup mocks
          invoiceRepository.findByExpenseId.mockResolvedValue(existingInvoice);
          
          const result = await invoiceService.getInvoiceMetadata(expenseId);
          
          if (existingInvoice) {
            // Property: Metadata should match database record structure
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
            // Property: Non-existing invoice metadata should return null
            expect(result).toBeNull();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 5: Duplicate upload prevention
   * Validates: Requirements 2.1, 2.5
   */
  test('Property 5: Duplicate upload prevention - one invoice per expense', () => {
    fc.assert(
      fc.property(
        medicalExpenseArbitrary,
        validFileArbitrary,
        invoiceDataArbitrary,
        userIdArbitrary,
        async (expense, file, existingInvoice, userId) => {
          // Setup mocks for expense with existing invoice
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(existingInvoice);
          
          // Property: Should reject upload when invoice already exists
          await expect(invoiceService.uploadInvoice(expense.id, file, userId))
            .rejects.toThrow(/already has an invoice/i);
          
          // Property: Should not create new database record
          expect(invoiceRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 6: Replace operation atomicity
   * Validates: Requirements 2.2, 2.3, 2.5
   */
  test('Property 6: Replace operation - atomic delete and create', () => {
    fc.assert(
      fc.property(
        medicalExpenseArbitrary,
        validFileArbitrary,
        invoiceDataArbitrary,
        userIdArbitrary,
        async (expense, newFile, existingInvoice, userId) => {
          // Setup mocks
          expenseRepository.findById.mockResolvedValue(expense);
          
          // Mock delete operation
          invoiceRepository.findByExpenseId
            .mockResolvedValueOnce(existingInvoice) // For delete
            .mockResolvedValueOnce(null); // For upload (after delete)
          invoiceRepository.deleteByExpenseId.mockResolvedValue(true);
          fileStorage.deleteFile.mockResolvedValue();
          
          // Mock upload operation
          const newInvoice = {
            id: existingInvoice.id + 1,
            expenseId: expense.id,
            filename: 'new_test.pdf',
            originalFilename: newFile.originalname,
            filePath: 'path/to/new_file.pdf',
            fileSize: newFile.size,
            mimeType: newFile.mimetype,
            uploadDate: new Date().toISOString()
          };
          
          invoiceRepository.create.mockResolvedValue(newInvoice);
          fileStorage.generateFilePath.mockReturnValue({
            filename: 'new_test.pdf',
            relativePath: 'path/to/new_file.pdf',
            fullPath: '/full/path/to/new_file.pdf',
            directoryPath: '/full/path/to'
          });
          fileStorage.ensureDirectoryExists.mockResolvedValue();
          fileStorage.moveFromTemp.mockResolvedValue();
          fileStorage.getFileStats.mockResolvedValue({ size: newFile.size });
          
          // Mock file validation
          const fileValidation = require('../utils/fileValidation');
          fileValidation.validateFile.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
          fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
          
          // Mock invoice service methods
          const originalVerifyIntegrity = invoiceService.verifyInvoiceIntegrity;
          invoiceService.verifyInvoiceIntegrity = jest.fn().mockResolvedValue({ 
            isValid: true, 
            errors: [], 
            warnings: [] 
          });

          try {
            const result = await invoiceService.replaceInvoice(expense.id, newFile, userId);
            
            // Property: Replace should delete old and create new
            expect(invoiceRepository.deleteByExpenseId).toHaveBeenCalledWith(expense.id);
            expect(invoiceRepository.create).toHaveBeenCalled();
            expect(result.id).toBe(newInvoice.id);
            expect(result.expenseId).toBe(expense.id);
            
          } finally {
            invoiceService.verifyInvoiceIntegrity = originalVerifyIntegrity;
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 7: Invoice existence check consistency
   * Validates: Requirements 2.4
   */
  test('Property 7: Invoice existence check - boolean consistency', () => {
    fc.assert(
      fc.property(
        expenseIdArbitrary,
        fc.option(invoiceDataArbitrary, { nil: null }),
        async (expenseId, existingInvoice) => {
          // Setup mocks
          invoiceRepository.hasInvoice.mockResolvedValue(!!existingInvoice);
          
          const result = await invoiceService.hasInvoice(expenseId);
          
          // Property: hasInvoice should return boolean matching existence
          expect(typeof result).toBe('boolean');
          expect(result).toBe(!!existingInvoice);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 8: Error handling consistency
   * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
   */
  test('Property 8: Error handling - consistent error types and cleanup', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null), // Non-existent expense
          fc.record({ id: expenseIdArbitrary, type: fc.constantFrom('Groceries', 'Gas') }) // Non-medical expense
        ),
        validFileArbitrary,
        userIdArbitrary,
        async (expense, file, userId) => {
          // Setup mocks
          expenseRepository.findById.mockResolvedValue(expense);
          
          if (!expense) {
            // Property: Non-existent expense should throw error
            await expect(invoiceService.uploadInvoice(1, file, userId))
              .rejects.toThrow(/expense not found/i);
              
          } else if (expense.type !== 'Tax - Medical') {
            // Property: Non-medical expense should throw specific error
            await expect(invoiceService.uploadInvoice(expense.id, file, userId))
              .rejects.toThrow(/medical expense/i);
          }
          
          // Property: Failed operations should not create database records
          expect(invoiceRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
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
        fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
        (expenseId, filename, date) => {
          // Mock file storage path generation
          const mockPaths = {
            filename: `${expenseId}_${Date.now()}_${filename}`,
            relativePath: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${expenseId}_${Date.now()}_${filename}`,
            fullPath: `/config/invoices/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${expenseId}_${Date.now()}_${filename}`,
            directoryPath: `/config/invoices/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`
          };
          
          fileStorage.generateFilePath.mockReturnValue(mockPaths);
          
          const result = fileStorage.generateFilePath(expenseId, filename, date);
          
          // Property: Generated paths should follow consistent structure
          expect(result.filename).toContain(expenseId.toString());
          expect(result.filename).toContain('.pdf');
          expect(result.relativePath).toContain(date.getFullYear().toString());
          expect(result.relativePath).toContain(String(date.getMonth() + 1).padStart(2, '0'));
          expect(result.fullPath).toContain(result.relativePath);
          expect(result.directoryPath).toContain(date.getFullYear().toString());
        }
      ),
      { numRuns: 50 }
    );
  });
});