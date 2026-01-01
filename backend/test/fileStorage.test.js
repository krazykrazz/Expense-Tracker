const fs = require('fs');
const path = require('path');
const fileStorage = require('../utils/fileStorage');
const fileValidation = require('../utils/fileValidation');
const filePermissions = require('../utils/filePermissions');

describe('File Storage Infrastructure', () => {
  const testDir = path.join(process.cwd(), 'config', 'invoices', 'test');
  const testFile = path.join(testDir, 'test.pdf');

  beforeAll(async () => {
    // Create test directory
    await fileStorage.ensureDirectoryExists(testDir);
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      if (await fileStorage.fileExists(testFile)) {
        await fileStorage.deleteFile(testFile);
      }
      await fs.promises.rmdir(testDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Directory Management', () => {
    test('should initialize directories', async () => {
      await fileStorage.initializeDirectories();
      
      const baseDir = path.join(process.cwd(), 'config', 'invoices');
      const tempDir = path.join(baseDir, 'temp');
      
      expect(await fileStorage.fileExists(baseDir)).toBe(true);
      expect(await fileStorage.fileExists(tempDir)).toBe(true);
    });

    test('should generate directory paths correctly', () => {
      const testDate = new Date('2025-01-15');
      const dirPath = fileStorage.generateDirectoryPath(testDate);
      
      expect(dirPath).toContain('2025');
      expect(dirPath).toContain('01');
    });
  });

  describe('Filename Sanitization', () => {
    test('should sanitize dangerous filenames', () => {
      const dangerous = 'test<>:"/\\|?*file.pdf';
      const sanitized = fileStorage.sanitizeFilename(dangerous);
      
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).not.toContain(':');
      expect(sanitized).toMatch(/\.pdf$/);
    });

    test('should handle empty filenames', () => {
      const sanitized = fileStorage.sanitizeFilename('');
      expect(sanitized).toBe('invoice.pdf');
    });

    test('should limit filename length', () => {
      const longName = 'a'.repeat(200) + '.pdf';
      const sanitized = fileStorage.sanitizeFilename(longName);
      
      expect(sanitized.length).toBeLessThanOrEqual(104); // 100 + '.pdf'
    });
  });

  describe('File Path Generation', () => {
    test('should generate unique filenames', async () => {
      const expenseId = 123;
      const originalName = 'receipt.pdf';
      
      const path1 = fileStorage.generateFilePath(expenseId, originalName);
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      const path2 = fileStorage.generateFilePath(expenseId, originalName);
      
      expect(path1.filename).not.toBe(path2.filename);
      expect(path1.filename).toContain('123_');
      expect(path1.filename).toContain('receipt');
    });

    test('should generate temp file paths', () => {
      const originalName = 'temp-receipt.pdf';
      const tempPath = fileStorage.generateTempFilePath(originalName);
      
      expect(tempPath.filename).toContain('temp_');
      expect(tempPath.filename).toContain('temp-receipt');
      expect(tempPath.fullPath).toContain('temp');
    });
  });

  describe('File Operations', () => {
    test('should create and delete files', async () => {
      // Create a test file
      await fs.promises.writeFile(testFile, 'test content');
      
      expect(await fileStorage.fileExists(testFile)).toBe(true);
      
      // Delete the file
      await fileStorage.deleteFile(testFile);
      
      expect(await fileStorage.fileExists(testFile)).toBe(false);
    });

    test('should get file stats', async () => {
      // Create a test file
      const content = 'test content for stats';
      await fs.promises.writeFile(testFile, content);
      
      const stats = await fileStorage.getFileStats(testFile);
      
      expect(stats.size).toBe(content.length);
      expect(stats.isFile).toBe(true);
      expect(stats.created).toBeDefined();
      expect(stats.modified).toBeDefined();
      
      // Clean up
      await fileStorage.deleteFile(testFile);
    });
  });

  describe('Storage Statistics', () => {
    test('should get storage stats', async () => {
      const stats = await fileStorage.getStorageStats();
      
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('totalSizeMB');
      expect(typeof stats.totalFiles).toBe('number');
      expect(typeof stats.totalSize).toBe('number');
    });
  });
});

describe('File Validation', () => {
  describe('File Size Validation', () => {
    test('should validate file sizes', () => {
      const validSize = fileValidation.validateFileSize(1024 * 1024); // 1MB
      expect(validSize.isValid).toBe(true);
      
      const tooLarge = fileValidation.validateFileSize(20 * 1024 * 1024); // 20MB
      expect(tooLarge.isValid).toBe(false);
      expect(tooLarge.errors[0]).toContain('too large');
      
      const tooSmall = fileValidation.validateFileSize(50); // 50 bytes
      expect(tooSmall.isValid).toBe(false);
      expect(tooSmall.errors[0]).toContain('too small');
    });
  });

  describe('File Extension Validation', () => {
    test('should validate PDF extensions', () => {
      const validPdf = fileValidation.validateFileExtension('document.pdf');
      expect(validPdf.isValid).toBe(true);
      
      const invalidExt = fileValidation.validateFileExtension('document.txt');
      expect(invalidExt.isValid).toBe(false);
      expect(invalidExt.errors[0]).toContain('PDF files are allowed');
      
      const noExt = fileValidation.validateFileExtension('document');
      expect(noExt.isValid).toBe(false);
      expect(noExt.errors[0]).toContain('must have an extension');
    });
  });

  describe('MIME Type Validation', () => {
    test('should validate PDF MIME types', () => {
      const validMime = fileValidation.validateMimeType('application/pdf');
      expect(validMime.isValid).toBe(true);
      
      const invalidMime = fileValidation.validateMimeType('text/plain');
      expect(invalidMime.isValid).toBe(false);
      expect(invalidMime.errors[0]).toContain('Invalid file type');
    });
  });

  describe('Security Validation', () => {
    test('should detect path traversal attempts', () => {
      const pathTraversal = fileValidation.validateFileSecurity('../../../etc/passwd');
      expect(pathTraversal.isValid).toBe(false);
      expect(pathTraversal.errors[0]).toContain('invalid path characters');
      
      const dangerous = fileValidation.validateFileSecurity('file<script>.pdf');
      expect(dangerous.isValid).toBe(false);
      expect(dangerous.errors[0]).toContain('dangerous characters');
    });

    test('should validate filename length', () => {
      const tooLong = 'a'.repeat(300) + '.pdf';
      const result = fileValidation.validateFileSecurity(tooLong);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('too long');
    });
  });

  describe('File Limits', () => {
    test('should return correct file size limits', () => {
      const limits = fileValidation.getFileSizeLimits();
      expect(limits.maxSizeMB).toBe(10);
      expect(limits.maxSize).toBe(10 * 1024 * 1024);
    });

    test('should return allowed file types', () => {
      const types = fileValidation.getAllowedFileTypes();
      expect(types.extensions).toContain('.pdf');
      expect(types.mimeTypes).toContain('application/pdf');
    });
  });
});

describe('File Permissions', () => {
  const testDir = path.join(process.cwd(), 'config', 'invoices', 'perm-test');

  beforeAll(async () => {
    await fileStorage.ensureDirectoryExists(testDir);
  });

  afterAll(async () => {
    try {
      await fs.promises.rmdir(testDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Permission Checking', () => {
    test('should check directory permissions', async () => {
      const permInfo = await filePermissions.getPermissionInfo(testDir);
      
      expect(permInfo.exists).toBe(true);
      expect(permInfo.isDirectory).toBe(true);
      expect(permInfo.readable).toBe(true);
      expect(permInfo.writable).toBe(true);
    });

    test('should check file access permissions', async () => {
      const canRead = await filePermissions.hasPermission(testDir, 'read');
      const canWrite = await filePermissions.hasPermission(testDir, 'write');
      
      expect(canRead).toBe(true);
      expect(canWrite).toBe(true);
    });
  });

  describe('Security Initialization', () => {
    test('should initialize secure directory structure', async () => {
      const secureDir = path.join(testDir, 'secure');
      const subdirs = ['sub1', 'sub2'];
      
      await filePermissions.initializeSecureStructure(secureDir, subdirs);
      
      expect(await fileStorage.fileExists(secureDir)).toBe(true);
      expect(await fileStorage.fileExists(path.join(secureDir, 'sub1'))).toBe(true);
      expect(await fileStorage.fileExists(path.join(secureDir, 'sub2'))).toBe(true);
      
      // Clean up
      await fs.promises.rmdir(path.join(secureDir, 'sub1'));
      await fs.promises.rmdir(path.join(secureDir, 'sub2'));
      await fs.promises.rmdir(secureDir);
    });
  });
});