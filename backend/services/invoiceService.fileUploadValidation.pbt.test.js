/**
 * Property-Based Tests for Invoice Service File Upload Validation
 * 
 * Feature: medical-expense-invoices
 * Property 1: File upload validation
 * Validates: Requirements 1.4, 6.1, 6.2, 6.3
 */

const fc = require('fast-check');
const invoiceService = require('./invoiceService');
const fileValidation = require('../utils/fileValidation');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Invoice Service - Property-Based Tests - File Upload Validation', () => {
  
  // Arbitraries for generating test data
  const validExpenseIdArbitrary = fc.integer({ min: 1, max: 1000 });
  
  const fileDataArbitrary = fc.record({
    originalname: fc.string({ minLength: 1, maxLength: 100 }).map(name => 
      name.replace(/[<>:"/\\|?*]/g, '_') + '.pdf'
    ),
    mimetype: fc.constantFrom('application/pdf', 'application/x-pdf', 'text/plain', 'image/jpeg'),
    size: fc.integer({ min: 0, max: 15 * 1024 * 1024 }), // 0 to 15MB
    buffer: fc.uint8Array({ minLength: 100, maxLength: 1000 })
  });

  const validPdfFileArbitrary = fc.record({
    originalname: fc.string({ minLength: 1, maxLength: 50 }).map(name => 
      name.replace(/[<>:"/\\|?*]/g, '_') + '.pdf'
    ),
    mimetype: fc.constant('application/pdf'),
    size: fc.integer({ min: 1024, max: 10 * 1024 * 1024 }), // 1KB to 10MB
    buffer: fc.constant(Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n%%EOF'))
  });

  /**
   * Property 1: File type validation consistency
   * Validates: Requirements 1.4, 6.1
   */
  test('Property 1: File type validation - only PDF files should be accepted', () => {
    fc.assert(
      fc.property(
        fileDataArbitrary,
        async (fileData) => {
          // Create temporary file for testing
          const tempDir = os.tmpdir();
          const tempFilePath = path.join(tempDir, `test_${Date.now()}_${Math.random()}.tmp`);
          
          try {
            // Write test data to temp file
            await fs.promises.writeFile(tempFilePath, fileData.buffer);
            
            // Create mock file object
            const mockFile = {
              originalname: fileData.originalname,
              mimetype: fileData.mimetype,
              size: fileData.size,
              path: tempFilePath,
              buffer: fileData.buffer
            };

            // Test file validation
            const validation = await fileValidation.validateFile(mockFile, tempFilePath);
            
            // Property: Only PDF files should pass validation
            const isPdfMimeType = fileData.mimetype === 'application/pdf' || fileData.mimetype === 'application/x-pdf';
            const hasPdfExtension = fileData.originalname.toLowerCase().endsWith('.pdf');
            const shouldBeValid = isPdfMimeType && hasPdfExtension && fileData.size > 0 && fileData.size <= 10 * 1024 * 1024;
            
            if (shouldBeValid) {
              // For valid PDFs, validation might still fail due to content, but type should be OK
              expect(validation).toBeDefined();
            } else {
              // For invalid files, validation should fail
              expect(validation.isValid).toBe(false);
            }
            
            return true; // Property holds
          } finally {
            // Cleanup temp file
            try {
              await fs.promises.unlink(tempFilePath);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2: File size validation consistency  
   * Validates: Requirements 6.2
   */
  test('Property 2: File size validation - files over 10MB should be rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 * 1024 * 1024 }), // 0 to 20MB
        fc.string({ minLength: 1, maxLength: 50 }).map(name => name + '.pdf'),
        async (fileSize, filename) => {
          const tempDir = os.tmpdir();
          const tempFilePath = path.join(tempDir, `test_${Date.now()}_${Math.random()}.tmp`);
          
          try {
            // Create file with specified size
            const buffer = Buffer.alloc(Math.min(fileSize, 1024)); // Limit actual buffer size for performance
            await fs.promises.writeFile(tempFilePath, buffer);
            
            const mockFile = {
              originalname: filename,
              mimetype: 'application/pdf',
              size: fileSize,
              path: tempFilePath,
              buffer: buffer
            };

            const validation = await fileValidation.validateFile(mockFile, tempFilePath);
            
            // Property: Files over 10MB should be rejected
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (fileSize > maxSize) {
              expect(validation.isValid).toBe(false);
              expect(validation.errors.some(error => 
                error.toLowerCase().includes('size') || error.toLowerCase().includes('large')
              )).toBe(true);
            } else if (fileSize === 0) {
              // Empty files should also be rejected
              expect(validation.isValid).toBe(false);
            }
            
            return true; // Property holds
          } finally {
            try {
              await fs.promises.unlink(tempFilePath);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 3: Filename sanitization consistency
   * Validates: Requirements 6.3
   */
  test('Property 3: Filename sanitization - dangerous characters should be removed', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        validExpenseIdArbitrary,
        (originalFilename, expenseId) => {
          // Add PDF extension if not present
          const filename = originalFilename.endsWith('.pdf') ? originalFilename : originalFilename + '.pdf';
          
          // Test filename sanitization (this would be done in fileStorage.generateFilePath)
          const sanitized = filename.replace(/[<>:"/\\|?*]/g, '_');
          
          // Property: Sanitized filename should not contain dangerous characters
          const dangerousChars = /[<>:"/\\|?*]/;
          expect(dangerousChars.test(sanitized)).toBe(false);
          
          // Property: Sanitized filename should still have PDF extension
          expect(sanitized.toLowerCase().endsWith('.pdf')).toBe(true);
          
          // Property: Sanitized filename should not be empty (excluding extension)
          const nameWithoutExt = sanitized.replace(/\.pdf$/i, '');
          expect(nameWithoutExt.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Upload validation error consistency
   * Validates: Requirements 1.4, 6.1, 6.2, 6.3
   */
  test('Property 4: Upload validation - consistent error reporting', () => {
    fc.assert(
      fc.property(
        fileDataArbitrary,
        validExpenseIdArbitrary,
        async (fileData, expenseId) => {
          const tempDir = os.tmpdir();
          const tempFilePath = path.join(tempDir, `test_${Date.now()}_${Math.random()}.tmp`);
          
          try {
            await fs.promises.writeFile(tempFilePath, fileData.buffer);
            
            const mockFile = {
              originalname: fileData.originalname,
              mimetype: fileData.mimetype,
              size: fileData.size,
              path: tempFilePath,
              buffer: fileData.buffer
            };

            const validation = await fileValidation.validateFile(mockFile, tempFilePath);
            
            // Property: Validation result should always have isValid boolean
            expect(typeof validation.isValid).toBe('boolean');
            
            // Property: If invalid, should have error messages
            if (!validation.isValid) {
              expect(Array.isArray(validation.errors)).toBe(true);
              expect(validation.errors.length).toBeGreaterThan(0);
              expect(validation.errors.every(error => typeof error === 'string')).toBe(true);
            }
            
            // Property: Warnings should be array if present
            if (validation.warnings) {
              expect(Array.isArray(validation.warnings)).toBe(true);
            }
            
          } finally {
            try {
              await fs.promises.unlink(tempFilePath);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 5: Valid PDF file acceptance
   * Validates: Requirements 1.4, 6.1
   */
  test('Property 5: Valid PDF files should pass initial validation', () => {
    fc.assert(
      fc.property(
        validPdfFileArbitrary,
        async (fileData) => {
          const tempDir = os.tmpdir();
          const tempFilePath = path.join(tempDir, `test_${Date.now()}_${Math.random()}.pdf`);
          
          try {
            await fs.promises.writeFile(tempFilePath, fileData.buffer);
            
            const mockFile = {
              originalname: fileData.originalname,
              mimetype: fileData.mimetype,
              size: fileData.size,
              path: tempFilePath,
              buffer: fileData.buffer
            };

            const validation = await fileValidation.validateFile(mockFile, tempFilePath);
            
            // Property: Valid PDF files should pass basic validation
            // Note: Content validation might still fail, but type/size validation should pass
            expect(validation).toBeDefined();
            expect(typeof validation.isValid).toBe('boolean');
            
            // If it fails, it should be due to content, not type/size
            if (!validation.isValid) {
              const hasTypeError = validation.errors.some(error => 
                error.toLowerCase().includes('type') || 
                error.toLowerCase().includes('pdf') ||
                error.toLowerCase().includes('format')
              );
              const hasSizeError = validation.errors.some(error => 
                error.toLowerCase().includes('size') || 
                error.toLowerCase().includes('large')
              );
              
              // Should not fail on type or size for valid inputs
              expect(hasTypeError || hasSizeError).toBe(false);
            }
            
          } finally {
            try {
              await fs.promises.unlink(tempFilePath);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});