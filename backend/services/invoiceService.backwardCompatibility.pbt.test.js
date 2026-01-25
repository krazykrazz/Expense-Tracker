/**
 * Property-Based Tests for Invoice Service Backward Compatibility
 * 
 * Feature: multi-invoice-support
 * Property 17: Backward Compatible Single Upload
 * Validates: Requirements 9.1, 9.2, 9.4, 9.5
 * 
 * These tests verify that the multi-invoice system maintains backward compatibility
 * with the original single-invoice workflow.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
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

describe('Invoice Service - Backward Compatibility Property Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock setup
    fileStorage.baseInvoiceDir = '/config/invoices';
    fs.promises.writeFile.mockResolvedValue(undefined);
  });

  // Arbitraries for generating test data
  const expenseIdArbitrary = fc.integer({ min: 1, max: 10000 });
  
  // Helper to generate valid date strings
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

  const validFileArbitrary = fc.record({
    originalname: fc.string({ minLength: 1, maxLength: 50 }).map(name => 
      name.replace(/[<>:"/\\|?*]/g, '_') + '.pdf'
    ),
    mimetype: fc.constant('application/pdf'),
    size: fc.integer({ min: 1024, max: 5 * 1024 * 1024 }),
    buffer: fc.constant(Buffer.from('%PDF-1.4\ntest content\n%%EOF'))
  });

  /**
   * Property 17: Backward Compatible Single Upload
   * 
   * For any single invoice upload without person_id to an expense with no existing invoices,
   * the system SHALL behave identically to the previous single-invoice implementation.
   * 
   * **Validates: Requirements 9.1**
   * 
   * This property verifies:
   * 1. Upload without person selection works (Requirement 9.1)
   * 2. Single invoice is stored correctly
   * 3. Invoice can be retrieved without person info
   * 4. No person_id is stored when none is provided
   */
  test('Property 17: Backward Compatible Single Upload - upload without person selection works', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        async (expense, file) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Setup mocks for expense with NO existing invoices (backward compat scenario)
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(null); // No existing invoice
          expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]); // No people assigned
          
          // Mock successful upload
          const newInvoice = {
            id: 1,
            expenseId: expense.id,
            personId: null, // No person linked
            personName: null,
            filename: 'uploaded_invoice.pdf',
            originalFilename: file.originalname,
            filePath: 'path/to/uploaded_invoice.pdf',
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadDate: new Date().toISOString()
          };

          invoiceRepository.create.mockResolvedValue(newInvoice);
          invoiceRepository.findById.mockResolvedValue(newInvoice);
          invoiceRepository.findAllByExpenseId.mockResolvedValue([newInvoice]);
          
          fileStorage.generateFilePath.mockReturnValue({
            filename: 'uploaded_invoice.pdf',
            relativePath: 'path/to/uploaded_invoice.pdf',
            fullPath: '/config/invoices/path/to/uploaded_invoice.pdf',
            directoryPath: '/config/invoices/path/to'
          });
          fileStorage.ensureDirectoryExists.mockResolvedValue();
          fileStorage.getFileStats.mockResolvedValue({ size: file.size });
          fileStorage.deleteFile.mockResolvedValue();
          fileStorage.fileExists.mockResolvedValue(true);
          
          fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
          fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });

          // Upload invoice WITHOUT personId (backward compatible way)
          const result = await invoiceService.uploadInvoice(expense.id, file, null, null);

          // Property: Upload should succeed
          expect(result).toBeDefined();
          expect(result.expenseId).toBe(expense.id);
          
          // Property: personId should be null (not required)
          expect(result.personId).toBeNull();
          
          // Property: Invoice should be created in repository
          expect(invoiceRepository.create).toHaveBeenCalled();
          
          // Verify the create call had null personId
          const createCall = invoiceRepository.create.mock.calls[0][0];
          expect(createCall.personId).toBeNull();

          // Property: Invoice should be retrievable
          const invoices = await invoiceService.getInvoicesForExpense(expense.id);
          expect(invoices.length).toBe(1);
          expect(invoices[0].personId).toBeNull();

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Backward Compatibility: Single invoice display (no count badge)
   * 
   * Verifies that when an expense has exactly one invoice, the system
   * returns data that would result in no count badge being displayed.
   * 
   * **Validates: Requirements 9.5**
   */
  test('Backward Compatibility: Single invoice returns correct count for display', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        async (expense, file) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Setup single invoice scenario
          const singleInvoice = {
            id: 1,
            expenseId: expense.id,
            personId: null,
            personName: null,
            filename: 'single_invoice.pdf',
            originalFilename: file.originalname,
            filePath: 'path/to/single_invoice.pdf',
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadDate: new Date().toISOString()
          };

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findAllByExpenseId.mockResolvedValue([singleInvoice]);
          invoiceRepository.getCountByExpenseId.mockResolvedValue(1);

          // Get invoices for expense
          const invoices = await invoiceService.getInvoicesForExpense(expense.id);

          // Property: Should return exactly 1 invoice
          expect(invoices.length).toBe(1);
          
          // Property: Invoice should have all required fields for display
          expect(invoices[0].id).toBeDefined();
          expect(invoices[0].expenseId).toBe(expense.id);
          expect(invoices[0].filename).toBeDefined();
          expect(invoices[0].originalFilename).toBeDefined();
          expect(invoices[0].fileSize).toBeDefined();
          expect(invoices[0].uploadDate).toBeDefined();

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Backward Compatibility: File validation rules unchanged
   * 
   * Verifies that the same file validation rules (PDF only, 10MB max) are applied
   * regardless of whether the expense already has invoices.
   * 
   * **Validates: Requirements 9.3**
   */
  test('Backward Compatibility: File validation rules unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        fc.constantFrom('invalid_type', 'too_large', 'valid'),
        async (expense, fileScenario) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          expenseRepository.findById.mockResolvedValue(expense);
          expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);
          
          let file;
          let expectedError = null;
          
          switch (fileScenario) {
            case 'invalid_type':
              file = {
                originalname: 'document.txt',
                mimetype: 'text/plain',
                size: 1024,
                buffer: Buffer.from('text content')
              };
              fileValidation.validateFileBuffer.mockResolvedValue({ 
                isValid: false, 
                errors: ['Invalid file type. Only PDF files are allowed.'], 
                warnings: [] 
              });
              expectedError = /file validation failed/i;
              break;
              
            case 'too_large':
              file = {
                originalname: 'large.pdf',
                mimetype: 'application/pdf',
                size: 15 * 1024 * 1024, // 15MB
                buffer: Buffer.from('%PDF-1.4\nlarge content\n%%EOF')
              };
              fileValidation.validateFileBuffer.mockResolvedValue({ 
                isValid: false, 
                errors: ['File size exceeds 10MB limit'], 
                warnings: [] 
              });
              expectedError = /file validation failed/i;
              break;
              
            case 'valid':
              file = {
                originalname: 'valid.pdf',
                mimetype: 'application/pdf',
                size: 1024,
                buffer: Buffer.from('%PDF-1.4\nvalid content\n%%EOF')
              };
              fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
              fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
              
              const newInvoice = {
                id: 1,
                expenseId: expense.id,
                personId: null,
                filename: 'valid.pdf',
                originalFilename: file.originalname,
                filePath: 'path/to/valid.pdf',
                fileSize: file.size,
                mimeType: file.mimetype,
                uploadDate: new Date().toISOString()
              };
              
              invoiceRepository.create.mockResolvedValue(newInvoice);
              invoiceRepository.findById.mockResolvedValue(newInvoice);
              fileStorage.generateFilePath.mockReturnValue({
                filename: 'valid.pdf',
                relativePath: 'path/to/valid.pdf',
                fullPath: '/config/invoices/path/to/valid.pdf',
                directoryPath: '/config/invoices/path/to'
              });
              fileStorage.ensureDirectoryExists.mockResolvedValue();
              fileStorage.getFileStats.mockResolvedValue({ size: file.size });
              fileStorage.fileExists.mockResolvedValue(true);
              break;
          }

          if (expectedError) {
            // Property: Invalid files should be rejected
            await expect(invoiceService.uploadInvoice(expense.id, file, null, null))
              .rejects.toThrow(expectedError);
            
            // Property: No invoice should be created for invalid files
            expect(invoiceRepository.create).not.toHaveBeenCalled();
          } else {
            // Property: Valid files should be accepted
            const result = await invoiceService.uploadInvoice(expense.id, file, null, null);
            expect(result).toBeDefined();
            expect(invoiceRepository.create).toHaveBeenCalled();
          }

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Backward Compatibility: Drag-and-drop behavior unchanged
   * 
   * This test verifies that the upload mechanism works the same way
   * regardless of how the file is provided (simulating drag-and-drop vs click-to-select).
   * The backend doesn't distinguish between these - it just receives a file.
   * 
   * **Validates: Requirements 9.2**
   */
  test('Backward Compatibility: Upload mechanism works regardless of file source', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        fc.constantFrom('drag_drop', 'click_select'), // Simulated source
        async (expense, file, source) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Setup mocks
          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(null);
          expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);
          
          const newInvoice = {
            id: 1,
            expenseId: expense.id,
            personId: null,
            filename: 'invoice.pdf',
            originalFilename: file.originalname,
            filePath: 'path/to/invoice.pdf',
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadDate: new Date().toISOString()
          };

          invoiceRepository.create.mockResolvedValue(newInvoice);
          invoiceRepository.findById.mockResolvedValue(newInvoice);
          
          fileStorage.generateFilePath.mockReturnValue({
            filename: 'invoice.pdf',
            relativePath: 'path/to/invoice.pdf',
            fullPath: '/config/invoices/path/to/invoice.pdf',
            directoryPath: '/config/invoices/path/to'
          });
          fileStorage.ensureDirectoryExists.mockResolvedValue();
          fileStorage.getFileStats.mockResolvedValue({ size: file.size });
          fileStorage.fileExists.mockResolvedValue(true);
          
          fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
          fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });

          // Upload file (backend doesn't know the source)
          const result = await invoiceService.uploadInvoice(expense.id, file, null, null);

          // Property: Upload should succeed regardless of source
          expect(result).toBeDefined();
          expect(result.expenseId).toBe(expense.id);
          
          // Property: Same invoice structure returned
          expect(result.id).toBeDefined();
          expect(result.filename).toBeDefined();
          expect(result.originalFilename).toBe(file.originalname);
          expect(result.fileSize).toBe(file.size);

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Backward Compatibility: View, download, print support unchanged
   * 
   * Verifies that invoice retrieval returns all necessary data for
   * viewing, downloading, and printing operations.
   * 
   * **Validates: Requirements 9.4**
   */
  test('Backward Compatibility: Invoice retrieval supports view/download/print', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        async (expense, file) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          const invoice = {
            id: 1,
            expenseId: expense.id,
            personId: null,
            personName: null,
            filename: 'invoice.pdf',
            originalFilename: file.originalname,
            filePath: '2025/01/invoice.pdf',
            fileSize: file.size,
            mimeType: 'application/pdf',
            uploadDate: new Date().toISOString()
          };

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findByExpenseId.mockResolvedValue(invoice);
          invoiceRepository.findById.mockResolvedValue(invoice);
          fileStorage.fileExists.mockResolvedValue(true);
          fileStorage.getFileStats.mockResolvedValue({ size: file.size });
          fileStorage.baseInvoiceDir = '/config/invoices';

          // Get invoice for viewing
          const result = await invoiceService.getInvoice(expense.id, null);

          // Property: Should return invoice with all required fields for view/download/print
          expect(result).toBeDefined();
          expect(result.id).toBe(invoice.id);
          expect(result.expenseId).toBe(expense.id);
          expect(result.filename).toBeDefined();
          expect(result.originalFilename).toBeDefined();
          expect(result.filePath).toBeDefined();
          expect(result.fileSize).toBeGreaterThan(0);
          expect(result.mimeType).toBe('application/pdf');
          
          // Property: Should include full file path for serving
          expect(result.fullFilePath).toBeDefined();
          
          // Property: Should include file stats for download headers
          expect(result.fileStats).toBeDefined();
          expect(result.fileStats.size).toBe(file.size);

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Backward Compatibility: Single invoice with no person link displays identically
   * 
   * Verifies that when an expense has exactly one invoice with no person link,
   * the data returned is suitable for the original single-invoice display.
   * 
   * **Validates: Requirements 9.5**
   */
  test('Backward Compatibility: Single invoice without person link has correct structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalExpenseArbitrary,
        validFileArbitrary,
        async (expense, file) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          const singleInvoice = {
            id: 1,
            expenseId: expense.id,
            personId: null,
            personName: null,
            filename: 'single_invoice.pdf',
            originalFilename: file.originalname,
            filePath: 'path/to/single_invoice.pdf',
            fileSize: file.size,
            mimeType: 'application/pdf',
            uploadDate: new Date().toISOString()
          };

          expenseRepository.findById.mockResolvedValue(expense);
          invoiceRepository.findAllByExpenseId.mockResolvedValue([singleInvoice]);

          // Get invoices for expense
          const invoices = await invoiceService.getInvoicesForExpense(expense.id);

          // Property: Should return exactly 1 invoice
          expect(invoices.length).toBe(1);
          
          const invoice = invoices[0];
          
          // Property: personId should be null
          expect(invoice.personId).toBeNull();
          
          // Property: personName should be null
          expect(invoice.personName).toBeNull();
          
          // Property: All display fields should be present
          expect(invoice.id).toBeDefined();
          expect(invoice.expenseId).toBe(expense.id);
          expect(invoice.filename).toBeDefined();
          expect(invoice.originalFilename).toBeDefined();
          expect(invoice.fileSize).toBeDefined();
          expect(invoice.mimeType).toBe('application/pdf');
          expect(invoice.uploadDate).toBeDefined();

          return true;
        }
      ),
      pbtOptions()
    );
  });
});
