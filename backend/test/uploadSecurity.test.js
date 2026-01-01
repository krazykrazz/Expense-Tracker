const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fileValidation = require('../utils/fileValidation');
const { upload, handleMulterError } = require('../middleware/uploadMiddleware');

// Test constants
const TEST_TEMP_DIR = path.join(__dirname, '../config/invoices/temp/test');
const VALID_PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

describe('Upload Security and Validation Tests', () => {
  let testFiles = [];

  beforeAll(async () => {
    // Ensure test directories exist
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    // Clean up test files
    for (const filePath of testFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn('Failed to cleanup test file:', filePath);
      }
    }

    // Clean up test directory
    try {
      if (fs.existsSync(TEST_TEMP_DIR)) {
        fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('Failed to cleanup test directory');
    }
  });

  /**
   * Helper function to create test PDF file
   */
  function createTestPDF(filename, size = 1000, isValid = true) {
    const filePath = path.join(TEST_TEMP_DIR, filename);
    testFiles.push(filePath);

    let content;
    if (isValid) {
      // Create a minimal valid PDF
      content = Buffer.concat([
        VALID_PDF_HEADER,
        Buffer.from('-1.4\n'),
        Buffer.from('1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n'),
        Buffer.from('2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n'),
        Buffer.from('3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n>>\nendobj\n'),
        Buffer.from('xref\n0 4\n0000000000 65535 f \n'),
        Buffer.from('0000000009 00000 n \n'),
        Buffer.from('0000000074 00000 n \n'),
        Buffer.from('0000000120 00000 n \n'),
        Buffer.from('trailer\n<<\n/Size 4\n/Root 1 0 R\n>>\n'),
        Buffer.from('startxref\n149\n%%EOF\n')
      ]);

      // Pad to desired size if needed
      if (size > content.length) {
        const padding = Buffer.alloc(size - content.length, 0x20); // Space padding
        content = Buffer.concat([content, padding]);
      }
    } else {
      // Create invalid file
      content = Buffer.alloc(size, 0x41); // Fill with 'A'
    }

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  /**
   * Helper function to create malicious filename test
   */
  function createMaliciousFile(filename) {
    const filePath = path.join(TEST_TEMP_DIR, 'safe_test.pdf');
    testFiles.push(filePath);
    
    // Create valid PDF content but with malicious filename
    const content = Buffer.concat([
      VALID_PDF_HEADER,
      Buffer.from('-1.4\n%%EOF\n')
    ]);
    
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  describe('File Size Validation', () => {
    test('should reject files larger than 10MB', () => {
      const result = fileValidation.validateFileSize(11 * 1024 * 1024); // 11MB
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('too large');
    });

    test('should accept files under 10MB', () => {
      const result = fileValidation.validateFileSize(5 * 1024 * 1024); // 5MB
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject empty files', () => {
      const result = fileValidation.validateFileSize(0);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('invalid or zero');
    });

    test('should reject files smaller than minimum size', () => {
      const result = fileValidation.validateFileSize(50); // 50 bytes
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('too small');
    });
  });

  describe('File Type Validation', () => {
    test('should reject non-PDF files by extension', () => {
      const result = fileValidation.validateFileExtension('test.txt');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Only PDF files are allowed');
    });

    test('should accept PDF files by extension', () => {
      const result = fileValidation.validateFileExtension('document.pdf');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject files without extension', () => {
      const result = fileValidation.validateFileExtension('document');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('must have an extension');
    });

    test('should reject files with wrong MIME type', () => {
      const result = fileValidation.validateMimeType('text/plain');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid file type');
    });

    test('should accept PDF MIME type', () => {
      const result = fileValidation.validateMimeType('application/pdf');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate PDF magic numbers', async () => {
      const validPDF = createTestPDF('magic_test.pdf');
      const invalidFile = createTestPDF('magic_invalid.pdf', 1000, false);
      
      const validResult = await fileValidation.validateFileContent(validPDF);
      const invalidResult = await fileValidation.validateFileContent(invalidFile);
      
      expect(validResult.isValid).toBe(true);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0]).toContain('invalid file signature');
    });
  });

  describe('Filename Security Validation', () => {
    test('should reject filenames with path traversal attempts', () => {
      const result = fileValidation.validateFileSecurity('../../../etc/passwd.pdf');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('invalid path characters');
    });

    test('should reject filenames with dangerous characters', () => {
      const result = fileValidation.validateFileSecurity('test<script>.pdf');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('dangerous characters');
    });

    test('should reject extremely long filenames', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const result = fileValidation.validateFileSecurity(longName);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('too long');
    });

    test('should reject reserved system names', () => {
      const result = fileValidation.validateFileSecurity('CON.pdf');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('reserved system name');
    });

    test('should accept safe filenames', () => {
      const result = fileValidation.validateFileSecurity('medical_receipt_2025.pdf');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject filenames with null bytes', () => {
      const result = fileValidation.validateFileSecurity('test\x00.pdf');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('dangerous characters');
    });
  });

  describe('File Validation Utility Tests', () => {
    test('should validate file sizes correctly', () => {
      const tooSmall = fileValidation.validateFileSize(50);
      const tooLarge = fileValidation.validateFileSize(15 * 1024 * 1024);
      const justRight = fileValidation.validateFileSize(5 * 1024 * 1024);
      
      expect(tooSmall.isValid).toBe(false);
      expect(tooLarge.isValid).toBe(false);
      expect(justRight.isValid).toBe(true);
    });

    test('should validate file extensions correctly', () => {
      const validExt = fileValidation.validateFileExtension('document.pdf');
      const invalidExt = fileValidation.validateFileExtension('document.txt');
      const noExt = fileValidation.validateFileExtension('document');
      
      expect(validExt.isValid).toBe(true);
      expect(invalidExt.isValid).toBe(false);
      expect(noExt.isValid).toBe(false);
    });

    test('should validate MIME types correctly', () => {
      const validMime = fileValidation.validateMimeType('application/pdf');
      const invalidMime = fileValidation.validateMimeType('text/plain');
      const emptyMime = fileValidation.validateMimeType('');
      
      expect(validMime.isValid).toBe(true);
      expect(invalidMime.isValid).toBe(false);
      expect(emptyMime.isValid).toBe(false);
    });

    test('should validate filename security correctly', () => {
      const safeName = fileValidation.validateFileSecurity('document.pdf');
      const pathTraversal = fileValidation.validateFileSecurity('../../../etc/passwd.pdf');
      const dangerousChars = fileValidation.validateFileSecurity('doc<script>.pdf');
      const tooLong = fileValidation.validateFileSecurity('a'.repeat(300) + '.pdf');
      
      expect(safeName.isValid).toBe(true);
      expect(pathTraversal.isValid).toBe(false);
      expect(dangerousChars.isValid).toBe(false);
      expect(tooLong.isValid).toBe(false);
    });

    test('should get file size limits', () => {
      const limits = fileValidation.getFileSizeLimits();
      expect(limits.maxSize).toBe(10 * 1024 * 1024);
      expect(limits.maxSizeMB).toBe(10);
      expect(limits.minSize).toBe(100);
    });

    test('should get allowed file types', () => {
      const types = fileValidation.getAllowedFileTypes();
      expect(types.extensions).toContain('.pdf');
      expect(types.mimeTypes).toContain('application/pdf');
    });
  });
});