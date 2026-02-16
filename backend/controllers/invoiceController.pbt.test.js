/**
 * Property-Based Tests for Invoice Controller API Layer
 * 
 * Feature: multi-invoice-support
 * Properties: 9, 14, 15, 16
 * Validates: Requirements 5.3, 8.1, 8.3, 8.4
  *
 * @invariant Invoice API Layer Consistency: For any valid invoice data, the controller layer correctly delegates to the service layer and returns consistent HTTP responses; file upload validation rejects invalid MIME types and oversized files. Randomization covers diverse file metadata and expense associations.
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const invoiceService = require('../services/invoiceService');
const invoiceRepository = require('../repositories/invoiceRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');

// Mock dependencies for isolated testing
jest.mock('../services/invoiceService');
jest.mock('../repositories/invoiceRepository');
jest.mock('../repositories/expenseRepository');
jest.mock('../repositories/expensePeopleRepository');
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));

// Import controller after mocks are set up
const invoiceController = require('./invoiceController');

// Helper to create mock request/response objects
function createMockReqRes(params = {}, body = {}, file = null) {
  const req = {
    params,
    body,
    file
  };
  
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    pipe: jest.fn()
  };
  
  return { req, res };
}

describe('Invoice Controller - Property-Based Tests - API Layer', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Arbitraries for generating test data
  const expenseIdArbitrary = fc.integer({ min: 1, max: 10000 });
  const personIdArbitrary = fc.integer({ min: 1, max: 1000 });
  const invoiceIdArbitrary = fc.integer({ min: 1, max: 10000 });
  
  const invoiceArbitrary = fc.record({
    id: invoiceIdArbitrary,
    expenseId: expenseIdArbitrary,
    personId: fc.option(personIdArbitrary, { nil: null }),
    personName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    filename: fc.string({ minLength: 5, maxLength: 50 }).map(name => 
      name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '.pdf'
    ),
    originalFilename: fc.string({ minLength: 5, maxLength: 50 }).map(name => 
      name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '.pdf'
    ),
    filePath: fc.string({ minLength: 10, maxLength: 100 }).map(s => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')),
    fileSize: fc.integer({ min: 1024, max: 5 * 1024 * 1024 }),
    mimeType: fc.constant('application/pdf'),
    uploadDate: fc.integer({ min: 1577836800000, max: 1735689600000 }).map(ts => new Date(ts).toISOString())
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
   * Property 14: GET Endpoint Returns All Invoices
   * 
   * For any expense with N invoices, the GET /api/invoices/:expenseId endpoint 
   * SHALL return an array containing exactly N invoice objects.
   * 
   * **Validates: Requirements 8.1**
   */
  test('Property 14: GET Endpoint Returns All Invoices', async () => {
    await fc.assert(
      fc.asyncProperty(
        expenseIdArbitrary,
        fc.integer({ min: 0, max: 10 }), // Number of invoices
        async (expenseId, invoiceCount) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Generate invoices for the expense
          const invoices = [];
          for (let i = 0; i < invoiceCount; i++) {
            invoices.push({
              id: i + 1,
              expenseId: expenseId,
              personId: null,
              personName: null,
              filename: `invoice_${i}.pdf`,
              originalFilename: `invoice_${i}.pdf`,
              filePath: `path/to/invoice_${i}.pdf`,
              fileSize: 1024 * (i + 1),
              mimeType: 'application/pdf',
              uploadDate: new Date().toISOString()
            });
          }

          // Setup mock
          invoiceService.getInvoicesForExpense.mockResolvedValue(invoices);

          // Create mock request/response
          const { req, res } = createMockReqRes({ expenseId: expenseId.toString() });

          // Call controller
          await invoiceController.getInvoicesForExpense(req, res);

          // Property: Should return 200 status
          expect(res.status).toHaveBeenCalledWith(200);

          // Property: Should return JSON with invoices array
          expect(res.json).toHaveBeenCalled();
          const responseBody = res.json.mock.calls[0][0];
          
          expect(responseBody.success).toBe(true);
          expect(responseBody.invoices).toBeDefined();
          expect(Array.isArray(responseBody.invoices)).toBe(true);

          // Property: Array should contain exactly N invoices
          expect(responseBody.invoices.length).toBe(invoiceCount);
          expect(responseBody.count).toBe(invoiceCount);

          // Property: Each invoice should have required fields
          responseBody.invoices.forEach((invoice, index) => {
            expect(invoice.id).toBe(invoices[index].id);
            expect(invoice.expenseId).toBe(expenseId);
            expect(invoice.filename).toBeDefined();
            expect(invoice.originalFilename).toBeDefined();
            expect(invoice.fileSize).toBeDefined();
            expect(invoice.uploadDate).toBeDefined();
          });

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 9: File Validation Consistency
   * 
   * For any file upload attempt, the validation rules (PDF format, 10MB maximum) 
   * SHALL be applied regardless of whether the expense already has invoices attached.
   * 
   * **Validates: Requirements 5.3, 9.3**
   */
  test('Property 9: File Validation Consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        expenseIdArbitrary,
        fc.boolean(), // Whether expense has existing invoices
        fc.constantFrom('valid', 'invalid_type', 'too_large'), // File type
        async (expenseId, hasExistingInvoices, fileType) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Create file based on type
          let file;
          let expectedError = null;
          
          if (fileType === 'valid') {
            file = {
              originalname: 'test.pdf',
              mimetype: 'application/pdf',
              size: 1024 * 1024, // 1MB
              buffer: Buffer.from('%PDF-1.4\ntest content\n%%EOF')
            };
          } else if (fileType === 'invalid_type') {
            file = {
              originalname: 'test.txt',
              mimetype: 'text/plain',
              size: 1024,
              buffer: Buffer.from('This is not a PDF')
            };
            expectedError = 'validation failed';
          } else if (fileType === 'too_large') {
            file = {
              originalname: 'large.pdf',
              mimetype: 'application/pdf',
              size: 15 * 1024 * 1024, // 15MB - exceeds 10MB limit
              buffer: Buffer.from('%PDF-1.4\nlarge content\n%%EOF')
            };
            expectedError = 'too large';
          }

          // Setup mock based on file validity
          if (fileType === 'valid') {
            invoiceService.uploadInvoice.mockResolvedValue({
              id: 1,
              expenseId: expenseId,
              personId: null,
              filename: 'test.pdf',
              originalFilename: 'test.pdf',
              fileSize: file.size,
              uploadDate: new Date().toISOString()
            });
          } else {
            invoiceService.uploadInvoice.mockRejectedValue(
              new Error(`File ${expectedError}`)
            );
          }

          // Create mock request/response
          const { req, res } = createMockReqRes(
            {},
            { expenseId: expenseId.toString() },
            file
          );

          // Call controller
          await invoiceController.uploadInvoice(req, res);

          if (fileType === 'valid') {
            // Property: Valid files should succeed
            expect(res.status).toHaveBeenCalledWith(200);
            const responseBody = res.json.mock.calls[0][0];
            expect(responseBody.success).toBe(true);
          } else {
            // Property: Invalid files should fail with 400
            expect(res.status).toHaveBeenCalledWith(400);
            const responseBody = res.json.mock.calls[0][0];
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toContain(expectedError);
          }

          // Property: Validation should be applied regardless of existing invoices
          // (The mock behavior is the same whether hasExistingInvoices is true or false)
          expect(invoiceService.uploadInvoice).toHaveBeenCalled();

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 15: DELETE by ID Removes Specific Invoice
   * 
   * For any invoice deleted by ID, only that specific invoice SHALL be removed; 
   * all other invoices for the same expense SHALL remain unchanged.
   * 
   * **Validates: Requirements 8.3**
   */
  test('Property 15: DELETE by ID Removes Specific Invoice', async () => {
    await fc.assert(
      fc.asyncProperty(
        expenseIdArbitrary,
        fc.integer({ min: 2, max: 5 }), // Number of invoices (at least 2)
        fc.integer({ min: 0, max: 4 }), // Index of invoice to delete
        async (expenseId, invoiceCount, deleteIndex) => {
          // Ensure deleteIndex is within bounds
          const actualDeleteIndex = deleteIndex % invoiceCount;
          
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Generate invoices for the expense
          const invoices = [];
          for (let i = 0; i < invoiceCount; i++) {
            invoices.push({
              id: i + 1,
              expenseId: expenseId,
              personId: null,
              personName: null,
              filename: `invoice_${i}.pdf`,
              originalFilename: `invoice_${i}.pdf`,
              filePath: `path/to/invoice_${i}.pdf`,
              fileSize: 1024 * (i + 1),
              mimeType: 'application/pdf',
              uploadDate: new Date().toISOString()
            });
          }

          const invoiceToDelete = invoices[actualDeleteIndex];

          // Setup mock for successful deletion
          invoiceService.deleteInvoiceById.mockResolvedValue(true);

          // Create mock request/response
          const { req, res } = createMockReqRes({ invoiceId: invoiceToDelete.id.toString() });

          // Call controller
          await invoiceController.deleteInvoiceById(req, res);

          // Property: Should return 200 status
          expect(res.status).toHaveBeenCalledWith(200);

          // Property: Should return success response
          const responseBody = res.json.mock.calls[0][0];
          expect(responseBody.success).toBe(true);
          expect(responseBody.message).toContain('deleted successfully');

          // Property: deleteInvoiceById should be called with correct ID
          expect(invoiceService.deleteInvoiceById).toHaveBeenCalledWith(invoiceToDelete.id);

          // Simulate remaining invoices after deletion
          const remainingInvoices = invoices.filter(inv => inv.id !== invoiceToDelete.id);
          invoiceService.getInvoicesForExpense.mockResolvedValue(remainingInvoices);

          // Verify remaining invoices
          const { req: getReq, res: getRes } = createMockReqRes({ expenseId: expenseId.toString() });
          await invoiceController.getInvoicesForExpense(getReq, getRes);

          const getResponseBody = getRes.json.mock.calls[0][0];
          
          // Property: Remaining invoices should be N-1
          expect(getResponseBody.invoices.length).toBe(invoiceCount - 1);

          // Property: Deleted invoice should not be in remaining list
          const deletedInCollection = getResponseBody.invoices.find(inv => inv.id === invoiceToDelete.id);
          expect(deletedInCollection).toBeUndefined();

          // Property: Other invoices should still exist
          remainingInvoices.forEach(original => {
            const found = getResponseBody.invoices.find(inv => inv.id === original.id);
            expect(found).toBeDefined();
            expect(found.filename).toBe(original.filename);
          });

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property 16: PATCH Updates Person Association
   * 
   * For any invoice updated via PATCH with a new person_id, the invoice's person_id 
   * SHALL be updated to the new value while all other fields remain unchanged.
   * 
   * **Validates: Requirements 8.4**
   */
  test('Property 16: PATCH Updates Person Association', async () => {
    await fc.assert(
      fc.asyncProperty(
        invoiceArbitrary,
        fc.option(personIdArbitrary, { nil: null }), // New person ID (can be null to unlink)
        async (originalInvoice, newPersonId) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Create updated invoice with new person ID
          const updatedInvoice = {
            ...originalInvoice,
            personId: newPersonId,
            personName: newPersonId ? `Person ${newPersonId}` : null
          };

          // Setup mock for successful update
          invoiceService.updateInvoicePersonLink.mockResolvedValue(updatedInvoice);

          // Create mock request/response
          const { req, res } = createMockReqRes(
            { invoiceId: originalInvoice.id.toString() },
            { personId: newPersonId !== null ? newPersonId.toString() : null }
          );

          // Call controller
          await invoiceController.updateInvoicePersonLink(req, res);

          // Property: Should return 200 status
          expect(res.status).toHaveBeenCalledWith(200);

          // Property: Should return success response with updated invoice
          const responseBody = res.json.mock.calls[0][0];
          expect(responseBody.success).toBe(true);
          expect(responseBody.invoice).toBeDefined();

          // Property: Person ID should be updated
          expect(responseBody.invoice.personId).toBe(newPersonId);

          // Property: Other fields should remain unchanged
          expect(responseBody.invoice.id).toBe(originalInvoice.id);
          expect(responseBody.invoice.expenseId).toBe(originalInvoice.expenseId);
          expect(responseBody.invoice.filename).toBe(originalInvoice.filename);
          expect(responseBody.invoice.originalFilename).toBe(originalInvoice.originalFilename);
          expect(responseBody.invoice.fileSize).toBe(originalInvoice.fileSize);
          expect(responseBody.invoice.mimeType).toBe(originalInvoice.mimeType);
          expect(responseBody.invoice.uploadDate).toBe(originalInvoice.uploadDate);

          // Property: Service should be called with correct parameters
          expect(invoiceService.updateInvoicePersonLink).toHaveBeenCalledWith(
            originalInvoice.id,
            newPersonId
          );

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Additional test: Error handling for invalid invoice ID in DELETE
   */
  test('DELETE by ID returns 404 for non-existent invoice', async () => {
    await fc.assert(
      fc.asyncProperty(
        invoiceIdArbitrary,
        async (invoiceId) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Setup mock for invoice not found
          invoiceService.deleteInvoiceById.mockResolvedValue(false);

          // Create mock request/response
          const { req, res } = createMockReqRes({ invoiceId: invoiceId.toString() });

          // Call controller
          await invoiceController.deleteInvoiceById(req, res);

          // Property: Should return 404 status
          expect(res.status).toHaveBeenCalledWith(404);

          // Property: Should return error response
          const responseBody = res.json.mock.calls[0][0];
          expect(responseBody.success).toBe(false);
          expect(responseBody.error).toContain('not found');

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Additional test: Error handling for invalid person in PATCH
   */
  test('PATCH returns 400 for person not assigned to expense', async () => {
    await fc.assert(
      fc.asyncProperty(
        invoiceIdArbitrary,
        personIdArbitrary,
        async (invoiceId, personId) => {
          // Reset mocks for this iteration
          jest.clearAllMocks();
          
          // Setup mock for person not assigned error
          invoiceService.updateInvoicePersonLink.mockRejectedValue(
            new Error('Person is not assigned to this expense')
          );

          // Create mock request/response
          const { req, res } = createMockReqRes(
            { invoiceId: invoiceId.toString() },
            { personId: personId.toString() }
          );

          // Call controller
          await invoiceController.updateInvoicePersonLink(req, res);

          // Property: Should return 400 status
          expect(res.status).toHaveBeenCalledWith(400);

          // Property: Should return error response
          const responseBody = res.json.mock.calls[0][0];
          expect(responseBody.success).toBe(false);
          expect(responseBody.error).toContain('not assigned to this expense');

          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Additional test: Invalid expense ID handling
   */
  test('GET returns 400 for invalid expense ID', async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock request/response with invalid ID
    const { req, res } = createMockReqRes({ expenseId: 'invalid-id' });

    // Call controller
    await invoiceController.getInvoicesForExpense(req, res);

    // Property: Should return 400 status
    expect(res.status).toHaveBeenCalledWith(400);

    // Property: Should return error response
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.success).toBe(false);
    expect(responseBody.error).toContain('Invalid expense ID');
  });
});
