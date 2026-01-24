const invoiceService = require('./invoiceService');
const invoiceRepository = require('../repositories/invoiceRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const fileStorage = require('../utils/fileStorage');
const fileValidation = require('../utils/fileValidation');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('../repositories/invoiceRepository');
jest.mock('../repositories/expenseRepository');
jest.mock('../repositories/expensePeopleRepository');
jest.mock('../utils/fileStorage');
jest.mock('../utils/fileValidation');
jest.mock('fs');
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn(),
  basename: jest.fn(),
  extname: jest.fn()
}));

describe('InvoiceService', () => {
  const mockExpenseId = 123;
  const mockUserId = 1;
  const mockFile = {
    originalname: 'test-invoice.pdf',
    path: '/tmp/upload_123.pdf',
    size: 1024000,
    mimetype: 'application/pdf',
    buffer: Buffer.from('mock pdf content')
  };
  
  const mockExpense = {
    id: mockExpenseId,
    date: '2025-01-01',
    type: 'Tax - Medical',
    amount: 150.00
  };

  const mockInvoice = {
    id: 1,
    expenseId: mockExpenseId,
    filename: '123_1704067200_test-invoice.pdf',
    originalFilename: 'test-invoice.pdf',
    filePath: '2025/01/123_1704067200_test-invoice.pdf',
    fileSize: 1024000,
    mimeType: 'application/pdf',
    uploadDate: '2025-01-01T12:00:00Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    expenseRepository.findById.mockResolvedValue(mockExpense);
    invoiceRepository.findByExpenseId.mockResolvedValue(null);
    expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]); // No people assigned by default
    fileValidation.validateFile.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    fileValidation.validateFileBuffer.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
    fileStorage.generateFilePath.mockReturnValue({
      filename: '123_1704067200_test-invoice.pdf',
      relativePath: '2025/01/123_1704067200_test-invoice.pdf',
      fullPath: '/config/invoices/2025/01/123_1704067200_test-invoice.pdf',
      directoryPath: '/config/invoices/2025/01'
    });
    fileStorage.ensureDirectoryExists.mockResolvedValue();
    fileStorage.moveFromTemp.mockResolvedValue();
    fileStorage.getFileStats.mockResolvedValue({ size: 1024000 });
    fileStorage.deleteFile.mockResolvedValue();
    fileStorage.fileExists.mockResolvedValue(true);
    fileStorage.baseInvoiceDir = '/config/invoices';
    invoiceRepository.create.mockResolvedValue(mockInvoice);
    invoiceRepository.findById.mockResolvedValue(mockInvoice);
    
    // Mock fs.promises.writeFile
    fs.promises = {
      writeFile: jest.fn().mockResolvedValue()
    };
  });

  describe('uploadInvoice', () => {
    it('should successfully upload an invoice', async () => {
      // Mock successful verification
      const mockVerification = { isValid: true, errors: [], warnings: [] };
      jest.spyOn(invoiceService, 'verifyInvoiceIntegrity').mockResolvedValue(mockVerification);

      const result = await invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId);

      expect(result).toEqual(mockInvoice);
      expect(expenseRepository.findById).toHaveBeenCalledWith(mockExpenseId);
      expect(fileValidation.validateFileBuffer).toHaveBeenCalledWith(mockFile.buffer, mockFile.originalname);
      expect(invoiceRepository.create).toHaveBeenCalled();
    });

    it('should throw error if expense ID is missing', async () => {
      await expect(invoiceService.uploadInvoice(null, mockFile, null, mockUserId))
        .rejects.toThrow('Expense ID and file are required');
    });

    it('should throw error if file is missing', async () => {
      await expect(invoiceService.uploadInvoice(mockExpenseId, null, null, mockUserId))
        .rejects.toThrow('Expense ID and file are required');
    });

    it('should throw error if expense does not exist', async () => {
      expenseRepository.findById.mockResolvedValue(null);

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('Expense not found');
    });

    it('should throw error if expense is not tax-deductible type', async () => {
      const nonTaxDeductibleExpense = { ...mockExpense, type: 'Groceries' };
      expenseRepository.findById.mockResolvedValue(nonTaxDeductibleExpense);

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('Invoices can only be attached to tax-deductible expenses');
    });

    it('should allow multiple invoices for same expense', async () => {
      // Mock existing invoice - should NOT throw error anymore
      invoiceRepository.findByExpenseId.mockResolvedValue(mockInvoice);
      
      // Mock successful verification
      const mockVerification = { isValid: true, errors: [], warnings: [] };
      jest.spyOn(invoiceService, 'verifyInvoiceIntegrity').mockResolvedValue(mockVerification);

      const result = await invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId);

      expect(result).toEqual(mockInvoice);
    });

    it('should throw error if file validation fails', async () => {
      fileValidation.validateFileBuffer.mockResolvedValue({
        isValid: false,
        errors: ['Invalid PDF format'],
        warnings: []
      });

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('File validation failed: Invalid PDF format');
    });

    it('should clean up temp file on validation failure', async () => {
      fileValidation.validateFileBuffer.mockResolvedValue({
        isValid: false,
        errors: ['Invalid PDF format'],
        warnings: []
      });
      fileStorage.deleteFile.mockResolvedValue();

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('File validation failed');
    });

    it('should clean up final file if database operation fails', async () => {
      const dbError = new Error('Database error');
      invoiceRepository.create.mockRejectedValue(dbError);
      fileStorage.deleteFile.mockResolvedValue();
      
      // Mock successful verification
      const mockVerification = { isValid: true, errors: [], warnings: [] };
      jest.spyOn(invoiceService, 'verifyInvoiceIntegrity').mockResolvedValue(mockVerification);

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('Failed to save invoice metadata');

      expect(fileStorage.deleteFile).toHaveBeenCalled();
    });

    it('should handle file size mismatch during upload', async () => {
      fileStorage.getFileStats.mockResolvedValue({ size: 500000 }); // Different size
      fileStorage.deleteFile.mockResolvedValue();

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('File corruption detected during upload');

      expect(fileStorage.deleteFile).toHaveBeenCalled();
    });

    it('should handle content validation failure after upload', async () => {
      fileValidation.validateFileContent.mockResolvedValue({
        isValid: false,
        errors: ['Corrupted PDF content']
      });
      fileStorage.deleteFile.mockResolvedValue();

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('File content validation failed: Corrupted PDF content');

      expect(fileStorage.deleteFile).toHaveBeenCalled();
    });

    it('should handle integrity verification failure', async () => {
      const mockVerification = { 
        isValid: false, 
        errors: ['File integrity check failed'], 
        warnings: [] 
      };
      jest.spyOn(invoiceService, 'verifyInvoiceIntegrity').mockResolvedValue(mockVerification);
      fileStorage.deleteFile.mockResolvedValue();
      invoiceRepository.deleteById.mockResolvedValue(true);

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('Invoice integrity check failed: File integrity check failed');

      expect(fileStorage.deleteFile).toHaveBeenCalled();
      expect(invoiceRepository.deleteById).toHaveBeenCalledWith(mockInvoice.id);
    });

    it('should upload invoice with person link when person is assigned to expense', async () => {
      const mockPersonId = 5;
      // Note: getPeopleForExpense returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue([
        { id: mockPersonId, name: 'John Doe', amount: 100 }
      ]);
      
      const mockVerification = { isValid: true, errors: [], warnings: [] };
      jest.spyOn(invoiceService, 'verifyInvoiceIntegrity').mockResolvedValue(mockVerification);

      const result = await invoiceService.uploadInvoice(mockExpenseId, mockFile, mockPersonId, mockUserId);

      expect(result).toEqual(mockInvoice);
      expect(invoiceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        personId: mockPersonId
      }));
    });

    it('should throw error if person is not assigned to expense', async () => {
      const mockPersonId = 5;
      // Note: getPeopleForExpense returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue([
        { id: 10, name: 'Jane Doe', amount: 100 } // Different person
      ]);

      await expect(invoiceService.uploadInvoice(mockExpenseId, mockFile, mockPersonId, mockUserId))
        .rejects.toThrow('Person is not assigned to this expense');
    });
  });

  describe('getInvoice', () => {
    beforeEach(() => {
      invoiceRepository.findByExpenseId.mockResolvedValue(mockInvoice);
      fileStorage.fileExists.mockResolvedValue(true);
      fileStorage.getFileStats.mockResolvedValue({ size: 1024000 });
    });

    it('should successfully get invoice', async () => {
      const result = await invoiceService.getInvoice(mockExpenseId, mockUserId);

      expect(result).toMatchObject(mockInvoice);
      expect(result.fullFilePath).toBeDefined();
      expect(result.fileStats).toBeDefined();
      expect(expenseRepository.findById).toHaveBeenCalledWith(mockExpenseId);
      expect(invoiceRepository.findByExpenseId).toHaveBeenCalledWith(mockExpenseId);
    });

    it('should throw error if expense ID is missing', async () => {
      await expect(invoiceService.getInvoice(null, mockUserId))
        .rejects.toThrow('Expense ID is required');
    });

    it('should throw error if expense does not exist', async () => {
      expenseRepository.findById.mockResolvedValue(null);

      await expect(invoiceService.getInvoice(mockExpenseId, mockUserId))
        .rejects.toThrow('Expense not found');
    });

    it('should throw error if no invoice found', async () => {
      invoiceRepository.findByExpenseId.mockResolvedValue(null);

      await expect(invoiceService.getInvoice(mockExpenseId, mockUserId))
        .rejects.toThrow('No invoice found for this expense');
    });

    it('should throw error if file does not exist on disk', async () => {
      fileStorage.fileExists.mockResolvedValue(false);

      await expect(invoiceService.getInvoice(mockExpenseId, mockUserId))
        .rejects.toThrow('Invoice file not found');
    });
  });

  describe('deleteInvoice', () => {
    beforeEach(() => {
      invoiceRepository.findByExpenseId.mockResolvedValue(mockInvoice);
      fileStorage.deleteFile.mockResolvedValue();
      invoiceRepository.deleteByExpenseId.mockResolvedValue(true);
    });

    it('should successfully delete invoice', async () => {
      const result = await invoiceService.deleteInvoice(mockExpenseId, mockUserId);

      expect(result).toBe(true);
      expect(expenseRepository.findById).toHaveBeenCalledWith(mockExpenseId);
      expect(invoiceRepository.findByExpenseId).toHaveBeenCalledWith(mockExpenseId);
      expect(fileStorage.deleteFile).toHaveBeenCalled();
      expect(invoiceRepository.deleteByExpenseId).toHaveBeenCalledWith(mockExpenseId);
    });

    it('should throw error if expense ID is missing', async () => {
      await expect(invoiceService.deleteInvoice(null, mockUserId))
        .rejects.toThrow('Expense ID is required');
    });

    it('should throw error if expense does not exist', async () => {
      expenseRepository.findById.mockResolvedValue(null);

      await expect(invoiceService.deleteInvoice(mockExpenseId, mockUserId))
        .rejects.toThrow('Expense not found');
    });

    it('should return false if no invoice found to delete', async () => {
      invoiceRepository.findByExpenseId.mockResolvedValue(null);

      const result = await invoiceService.deleteInvoice(mockExpenseId, mockUserId);

      expect(result).toBe(false);
      expect(fileStorage.deleteFile).not.toHaveBeenCalled();
      expect(invoiceRepository.deleteByExpenseId).not.toHaveBeenCalled();
    });

    it('should continue with database cleanup if file deletion fails', async () => {
      fileStorage.deleteFile.mockRejectedValue(new Error('File deletion failed'));

      const result = await invoiceService.deleteInvoice(mockExpenseId, mockUserId);

      expect(result).toBe(true);
      expect(invoiceRepository.deleteByExpenseId).toHaveBeenCalledWith(mockExpenseId);
    });
  });

  describe('getInvoiceMetadata', () => {
    it('should successfully get invoice metadata', async () => {
      invoiceRepository.findByExpenseId.mockResolvedValue(mockInvoice);

      const result = await invoiceService.getInvoiceMetadata(mockExpenseId);

      expect(result).toEqual(mockInvoice);
      expect(invoiceRepository.findByExpenseId).toHaveBeenCalledWith(mockExpenseId);
    });

    it('should throw error if expense ID is missing', async () => {
      await expect(invoiceService.getInvoiceMetadata(null))
        .rejects.toThrow('Expense ID is required');
    });

    it('should return null if no invoice found', async () => {
      invoiceRepository.findByExpenseId.mockResolvedValue(null);

      const result = await invoiceService.getInvoiceMetadata(mockExpenseId);

      expect(result).toBeNull();
    });
  });

  describe('replaceInvoice', () => {
    it('should successfully replace invoice', async () => {
      // Mock deleteInvoice and uploadInvoice
      jest.spyOn(invoiceService, 'deleteInvoice').mockResolvedValue(true);
      jest.spyOn(invoiceService, 'uploadInvoice').mockResolvedValue(mockInvoice);

      const result = await invoiceService.replaceInvoice(mockExpenseId, mockFile, null, mockUserId);

      expect(result).toEqual(mockInvoice);
      expect(invoiceService.deleteInvoice).toHaveBeenCalledWith(mockExpenseId, mockUserId);
      expect(invoiceService.uploadInvoice).toHaveBeenCalledWith(mockExpenseId, mockFile, null, mockUserId);
    });

    it('should handle delete failure during replace', async () => {
      jest.spyOn(invoiceService, 'deleteInvoice').mockRejectedValue(new Error('Delete failed'));

      await expect(invoiceService.replaceInvoice(mockExpenseId, mockFile, null, mockUserId))
        .rejects.toThrow('Delete failed');
    });
  });

  describe('hasInvoice', () => {
    it('should return true if expense has invoice', async () => {
      invoiceRepository.hasInvoice.mockResolvedValue(true);

      const result = await invoiceService.hasInvoice(mockExpenseId);

      expect(result).toBe(true);
      expect(invoiceRepository.hasInvoice).toHaveBeenCalledWith(mockExpenseId);
    });

    it('should return false if expense has no invoice', async () => {
      invoiceRepository.hasInvoice.mockResolvedValue(false);

      const result = await invoiceService.hasInvoice(mockExpenseId);

      expect(result).toBe(false);
    });

    it('should handle repository errors', async () => {
      invoiceRepository.hasInvoice.mockRejectedValue(new Error('Database error'));

      await expect(invoiceService.hasInvoice(mockExpenseId))
        .rejects.toThrow('Database error');
    });
  });

  describe('validateExpenseForInvoice', () => {
    it('should validate medical expense successfully', async () => {
      const result = await invoiceService.validateExpenseForInvoice(mockExpenseId);

      expect(result).toEqual(mockExpense);
      expect(expenseRepository.findById).toHaveBeenCalledWith(mockExpenseId);
    });

    it('should throw error if expense not found', async () => {
      expenseRepository.findById.mockResolvedValue(null);

      await expect(invoiceService.validateExpenseForInvoice(mockExpenseId))
        .rejects.toThrow('Expense not found');
    });

    it('should throw error if expense is not tax-deductible type', async () => {
      const nonTaxDeductibleExpense = { ...mockExpense, type: 'Groceries' };
      expenseRepository.findById.mockResolvedValue(nonTaxDeductibleExpense);

      await expect(invoiceService.validateExpenseForInvoice(mockExpenseId))
        .rejects.toThrow('Invoices can only be attached to tax-deductible expenses');
    });
  });

  describe('validateExpenseAccess', () => {
    it('should validate expense access successfully', async () => {
      const result = await invoiceService.validateExpenseAccess(mockExpenseId, mockUserId);

      expect(result).toEqual(mockExpense);
      expect(expenseRepository.findById).toHaveBeenCalledWith(mockExpenseId);
    });

    it('should throw error if expense not found', async () => {
      expenseRepository.findById.mockResolvedValue(null);

      await expect(invoiceService.validateExpenseAccess(mockExpenseId, mockUserId))
        .rejects.toThrow('Expense not found');
    });
  });

  describe('verifyInvoiceIntegrity', () => {
    const mockInvoiceId = 1;

    beforeEach(() => {
      // Reset mocks for verifyInvoiceIntegrity tests
      jest.clearAllMocks();
      // Restore any spies on verifyInvoiceIntegrity
      jest.restoreAllMocks();
    });

    it('should verify invoice integrity successfully', async () => {
      // Reset mocks for this specific test
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      fileStorage.fileExists.mockResolvedValue(true);
      fileStorage.getFileStats.mockResolvedValue({ size: 1024000 });
      fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
      fileStorage.baseInvoiceDir = '/config/invoices';

      const result = await invoiceService.verifyInvoiceIntegrity(mockInvoiceId);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(invoiceRepository.findById).toHaveBeenCalledWith(mockInvoiceId);
    });

    it('should fail if invoice not found in database', async () => {
      invoiceRepository.findById.mockResolvedValue(null);
      fileStorage.baseInvoiceDir = '/config/invoices';

      const result = await invoiceService.verifyInvoiceIntegrity(mockInvoiceId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invoice not found in database');
    });

    it('should fail if file not found on disk', async () => {
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      fileStorage.fileExists.mockResolvedValue(false);
      fileStorage.baseInvoiceDir = '/config/invoices';

      const result = await invoiceService.verifyInvoiceIntegrity(mockInvoiceId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invoice file not found on disk');
    });

    it('should warn about file size mismatch', async () => {
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      fileStorage.fileExists.mockResolvedValue(true);
      fileStorage.getFileStats.mockResolvedValue({ size: 500000 }); // Different size
      fileValidation.validateFileContent.mockResolvedValue({ isValid: true, errors: [] });
      fileStorage.baseInvoiceDir = '/config/invoices';

      const result = await invoiceService.verifyInvoiceIntegrity(mockInvoiceId);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('File size mismatch: DB=1024000, Disk=500000');
    });

    it('should fail if content validation fails', async () => {
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      fileStorage.fileExists.mockResolvedValue(true);
      fileStorage.getFileStats.mockResolvedValue({ size: 1024000 });
      fileValidation.validateFileContent.mockResolvedValue({
        isValid: false,
        errors: ['Invalid PDF content']
      });
      fileStorage.baseInvoiceDir = '/config/invoices';

      const result = await invoiceService.verifyInvoiceIntegrity(mockInvoiceId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid PDF content');
    });
  });

  describe('cleanupOrphanedFiles', () => {
    it('should cleanup orphaned files successfully', async () => {
      const expenseIds = [123, 456, 789];
      invoiceRepository.getExpenseIdsWithInvoices.mockResolvedValue(expenseIds);
      fileStorage.cleanupOrphanedFiles.mockResolvedValue(3);

      const result = await invoiceService.cleanupOrphanedFiles();

      expect(result).toBe(3);
      expect(invoiceRepository.getExpenseIdsWithInvoices).toHaveBeenCalled();
      expect(fileStorage.cleanupOrphanedFiles).toHaveBeenCalled();
    });

    it('should handle cleanup errors', async () => {
      invoiceRepository.getExpenseIdsWithInvoices.mockRejectedValue(new Error('Database error'));

      await expect(invoiceService.cleanupOrphanedFiles())
        .rejects.toThrow('Database error');
    });
  });

  describe('getStorageStatistics', () => {
    it('should get storage statistics successfully', async () => {
      const dbStats = { totalInvoices: 10, totalSize: 10240000 };
      const fileStats = { totalFiles: 10, totalSize: 10240000 };
      
      invoiceRepository.getStatistics.mockResolvedValue(dbStats);
      fileStorage.getStorageStats.mockResolvedValue(fileStats);

      const result = await invoiceService.getStorageStatistics();

      expect(result.database).toEqual(dbStats);
      expect(result.fileSystem).toEqual(fileStats);
      expect(result.consistency.isConsistent).toBe(true);
    });

    it('should detect inconsistency between database and file system', async () => {
      const dbStats = { totalInvoices: 10, totalSize: 10240000 };
      const fileStats = { totalFiles: 8, totalSize: 8192000 };
      
      invoiceRepository.getStatistics.mockResolvedValue(dbStats);
      fileStorage.getStorageStats.mockResolvedValue(fileStats);

      const result = await invoiceService.getStorageStatistics();

      expect(result.consistency.isConsistent).toBe(false);
      expect(result.consistency.dbCount).toBe(10);
      expect(result.consistency.fileCount).toBe(8);
    });
  });

  describe('getInvoicesForExpense', () => {
    it('should return all invoices for an expense', async () => {
      const mockInvoices = [
        { ...mockInvoice, id: 1, personId: null, personName: null },
        { ...mockInvoice, id: 2, personId: 5, personName: 'John Doe' }
      ];
      invoiceRepository.findAllByExpenseId.mockResolvedValue(mockInvoices);

      const result = await invoiceService.getInvoicesForExpense(mockExpenseId);

      expect(result).toEqual(mockInvoices);
      expect(invoiceRepository.findAllByExpenseId).toHaveBeenCalledWith(mockExpenseId);
    });

    it('should throw error if expense ID is missing', async () => {
      await expect(invoiceService.getInvoicesForExpense(null))
        .rejects.toThrow('Expense ID is required');
    });

    it('should throw error if expense does not exist', async () => {
      expenseRepository.findById.mockResolvedValue(null);

      await expect(invoiceService.getInvoicesForExpense(mockExpenseId))
        .rejects.toThrow('Expense not found');
    });

    it('should return empty array if no invoices found', async () => {
      invoiceRepository.findAllByExpenseId.mockResolvedValue([]);

      const result = await invoiceService.getInvoicesForExpense(mockExpenseId);

      expect(result).toEqual([]);
    });
  });

  describe('deleteInvoiceById', () => {
    it('should successfully delete invoice by ID', async () => {
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      fileStorage.deleteFile.mockResolvedValue();
      invoiceRepository.deleteById.mockResolvedValue(true);

      const result = await invoiceService.deleteInvoiceById(mockInvoice.id, mockUserId);

      expect(result).toBe(true);
      expect(invoiceRepository.findById).toHaveBeenCalledWith(mockInvoice.id);
      expect(fileStorage.deleteFile).toHaveBeenCalled();
      expect(invoiceRepository.deleteById).toHaveBeenCalledWith(mockInvoice.id);
    });

    it('should throw error if invoice ID is missing', async () => {
      await expect(invoiceService.deleteInvoiceById(null, mockUserId))
        .rejects.toThrow('Invoice ID is required');
    });

    it('should return false if invoice not found', async () => {
      invoiceRepository.findById.mockResolvedValue(null);

      const result = await invoiceService.deleteInvoiceById(999, mockUserId);

      expect(result).toBe(false);
      expect(fileStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('should continue with database cleanup if file deletion fails', async () => {
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      fileStorage.deleteFile.mockRejectedValue(new Error('File deletion failed'));
      invoiceRepository.deleteById.mockResolvedValue(true);

      const result = await invoiceService.deleteInvoiceById(mockInvoice.id, mockUserId);

      expect(result).toBe(true);
      expect(invoiceRepository.deleteById).toHaveBeenCalledWith(mockInvoice.id);
    });
  });

  describe('updateInvoicePersonLink', () => {
    it('should successfully update person link', async () => {
      const mockPersonId = 5;
      const updatedInvoice = { ...mockInvoice, personId: mockPersonId, personName: 'John Doe' };
      
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      // Note: getPeopleForExpense returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue([
        { id: mockPersonId, name: 'John Doe', amount: 100 }
      ]);
      invoiceRepository.updatePersonId.mockResolvedValue(true);
      invoiceRepository.findById.mockResolvedValueOnce(mockInvoice).mockResolvedValueOnce(updatedInvoice);

      const result = await invoiceService.updateInvoicePersonLink(mockInvoice.id, mockPersonId);

      expect(result).toEqual(updatedInvoice);
      expect(invoiceRepository.updatePersonId).toHaveBeenCalledWith(mockInvoice.id, mockPersonId);
    });

    it('should throw error if invoice ID is missing', async () => {
      await expect(invoiceService.updateInvoicePersonLink(null, 5))
        .rejects.toThrow('Invoice ID is required');
    });

    it('should throw error if invoice not found', async () => {
      invoiceRepository.findById.mockResolvedValue(null);

      await expect(invoiceService.updateInvoicePersonLink(999, 5))
        .rejects.toThrow('Invoice not found');
    });

    it('should throw error if person is not assigned to expense', async () => {
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      // Note: getPeopleForExpense returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue([
        { id: 10, name: 'Jane Doe', amount: 100 } // Different person
      ]);

      await expect(invoiceService.updateInvoicePersonLink(mockInvoice.id, 5))
        .rejects.toThrow('Person is not assigned to this expense');
    });

    it('should allow setting person link to null', async () => {
      const updatedInvoice = { ...mockInvoice, personId: null, personName: null };
      
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      invoiceRepository.updatePersonId.mockResolvedValue(true);
      invoiceRepository.findById.mockResolvedValueOnce(mockInvoice).mockResolvedValueOnce(updatedInvoice);

      const result = await invoiceService.updateInvoicePersonLink(mockInvoice.id, null);

      expect(result).toEqual(updatedInvoice);
      expect(invoiceRepository.updatePersonId).toHaveBeenCalledWith(mockInvoice.id, null);
    });
  });

  describe('getInvoiceById', () => {
    it('should successfully get invoice by ID', async () => {
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      fileStorage.fileExists.mockResolvedValue(true);
      fileStorage.getFileStats.mockResolvedValue({ size: 1024000 });

      const result = await invoiceService.getInvoiceById(mockInvoice.id, mockUserId);

      expect(result).toMatchObject(mockInvoice);
      expect(result.fullFilePath).toBeDefined();
      expect(result.fileStats).toBeDefined();
    });

    it('should throw error if invoice ID is missing', async () => {
      await expect(invoiceService.getInvoiceById(null, mockUserId))
        .rejects.toThrow('Invoice ID is required');
    });

    it('should throw error if invoice not found', async () => {
      invoiceRepository.findById.mockResolvedValue(null);

      await expect(invoiceService.getInvoiceById(999, mockUserId))
        .rejects.toThrow('Invoice not found');
    });

    it('should throw error if file does not exist on disk', async () => {
      invoiceRepository.findById.mockResolvedValue(mockInvoice);
      fileStorage.fileExists.mockResolvedValue(false);

      await expect(invoiceService.getInvoiceById(mockInvoice.id, mockUserId))
        .rejects.toThrow('Invoice file not found');
    });
  });

  describe('validatePersonBelongsToExpense', () => {
    it('should validate person belongs to expense', async () => {
      const mockPersonId = 5;
      // Note: getPeopleForExpense returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue([
        { id: mockPersonId, name: 'John Doe', amount: 100 }
      ]);

      const result = await invoiceService.validatePersonBelongsToExpense(mockExpenseId, mockPersonId);

      expect(result).toBe(true);
    });

    it('should throw error if person is not assigned to expense', async () => {
      // Note: getPeopleForExpense returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue([
        { id: 10, name: 'Jane Doe', amount: 100 }
      ]);

      await expect(invoiceService.validatePersonBelongsToExpense(mockExpenseId, 5))
        .rejects.toThrow('Person is not assigned to this expense');
    });

    it('should throw error if expense has no people assigned', async () => {
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);

      await expect(invoiceService.validatePersonBelongsToExpense(mockExpenseId, 5))
        .rejects.toThrow('Person is not assigned to this expense');
    });
  });
});