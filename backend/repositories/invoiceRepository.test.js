const invoiceRepository = require('./invoiceRepository');
const { getDatabase } = require('../database/db');

// Mock the database
jest.mock('../database/db');

describe('InvoiceRepository', () => {
  let mockDb;
  
  const mockInvoiceData = {
    expenseId: 123,
    filename: '123_1704067200_test-invoice.pdf',
    originalFilename: 'test-invoice.pdf',
    filePath: '2025/01/123_1704067200_test-invoice.pdf',
    fileSize: 1024000,
    mimeType: 'application/pdf',
    uploadDate: '2025-01-01T12:00:00Z'
  };

  const mockDbRow = {
    id: 1,
    expense_id: 123,
    filename: '123_1704067200_test-invoice.pdf',
    original_filename: 'test-invoice.pdf',
    file_path: '2025/01/123_1704067200_test-invoice.pdf',
    file_size: 1024000,
    mime_type: 'application/pdf',
    upload_date: '2025-01-01T12:00:00Z'
  };

  const expectedInvoice = {
    id: 1,
    expenseId: 123,
    filename: '123_1704067200_test-invoice.pdf',
    originalFilename: 'test-invoice.pdf',
    filePath: '2025/01/123_1704067200_test-invoice.pdf',
    fileSize: 1024000,
    mimeType: 'application/pdf',
    uploadDate: '2025-01-01T12:00:00Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDb = {
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn()
    };
    
    getDatabase.mockResolvedValue(mockDb);
  });

  describe('create', () => {
    it('should create invoice successfully', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ lastID: 1 }, null);
      });

      const result = await invoiceRepository.create(mockInvoiceData);

      expect(result).toMatchObject({
        id: 1,
        expenseId: mockInvoiceData.expenseId,
        filename: mockInvoiceData.filename,
        originalFilename: mockInvoiceData.originalFilename,
        filePath: mockInvoiceData.filePath,
        fileSize: mockInvoiceData.fileSize,
        mimeType: mockInvoiceData.mimeType
      });

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO expense_invoices'),
        [
          mockInvoiceData.expenseId,
          mockInvoiceData.filename,
          mockInvoiceData.originalFilename,
          mockInvoiceData.filePath,
          mockInvoiceData.fileSize,
          mockInvoiceData.mimeType,
          mockInvoiceData.uploadDate
        ],
        expect.any(Function)
      );
    });

    it('should handle database errors during create', async () => {
      const dbError = new Error('Database error');
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.create(mockInvoiceData))
        .rejects.toThrow('Database error');
    });

    it('should use default values for optional fields', async () => {
      const minimalData = {
        expenseId: 123,
        filename: 'test.pdf',
        originalFilename: 'test.pdf',
        filePath: '2025/01/test.pdf',
        fileSize: 1024
      };

      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ lastID: 1 }, null);
      });

      const result = await invoiceRepository.create(minimalData);

      expect(result.mimeType).toBe('application/pdf');
      expect(result.uploadDate).toBeDefined();
    });
  });

  describe('findByExpenseId', () => {
    it('should find invoice by expense ID', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, mockDbRow);
      });

      const result = await invoiceRepository.findByExpenseId(123);

      expect(result).toEqual(expectedInvoice);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [123],
        expect.any(Function)
      );
    });

    it('should return null if invoice not found', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, null);
      });

      const result = await invoiceRepository.findByExpenseId(123);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.findByExpenseId(123))
        .rejects.toThrow('Database error');
    });
  });

  describe('findById', () => {
    it('should find invoice by ID', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, mockDbRow);
      });

      const result = await invoiceRepository.findById(1);

      expect(result).toEqual(expectedInvoice);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1],
        expect.any(Function)
      );
    });

    it('should return null if invoice not found', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, null);
      });

      const result = await invoiceRepository.findById(1);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.findById(1))
        .rejects.toThrow('Database error');
    });
  });

  describe('update', () => {
    it('should update invoice successfully', async () => {
      const updateData = {
        filename: 'new-filename.pdf',
        fileSize: 2048000
      };

      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 1 }, null);
      });

      const result = await invoiceRepository.update(1, updateData);

      expect(result).toBe(true);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE expense_invoices'),
        ['new-filename.pdf', 2048000, 1],
        expect.any(Function)
      );
    });

    it('should return null if no fields to update', async () => {
      const result = await invoiceRepository.update(1, {});

      expect(result).toBeNull();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    it('should return null if no rows affected', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 0 }, null);
      });

      const result = await invoiceRepository.update(1, { filename: 'test.pdf' });

      expect(result).toBeNull();
    });

    it('should handle database errors during update', async () => {
      const dbError = new Error('Database error');
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.update(1, { filename: 'test.pdf' }))
        .rejects.toThrow('Database error');
    });
  });

  describe('deleteByExpenseId', () => {
    it('should delete invoice by expense ID', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 1 }, null);
      });

      const result = await invoiceRepository.deleteByExpenseId(123);

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM expense_invoices WHERE expense_id = ?',
        [123],
        expect.any(Function)
      );
    });

    it('should return false if no rows deleted', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 0 }, null);
      });

      const result = await invoiceRepository.deleteByExpenseId(123);

      expect(result).toBe(false);
    });

    it('should handle database errors during delete', async () => {
      const dbError = new Error('Database error');
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.deleteByExpenseId(123))
        .rejects.toThrow('Database error');
    });
  });

  describe('deleteById', () => {
    it('should delete invoice by ID', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 1 }, null);
      });

      const result = await invoiceRepository.deleteById(1);

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM expense_invoices WHERE id = ?',
        [1],
        expect.any(Function)
      );
    });

    it('should return false if no rows deleted', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 0 }, null);
      });

      const result = await invoiceRepository.deleteById(1);

      expect(result).toBe(false);
    });

    it('should handle database errors during delete', async () => {
      const dbError = new Error('Database error');
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.deleteById(1))
        .rejects.toThrow('Database error');
    });
  });

  describe('hasInvoice', () => {
    it('should return true if expense has invoice', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { 1: 1 }); // Row exists
      });

      const result = await invoiceRepository.hasInvoice(123);

      expect(result).toBe(true);
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT 1 FROM expense_invoices WHERE expense_id = ? LIMIT 1',
        [123],
        expect.any(Function)
      );
    });

    it('should return false if expense has no invoice', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, null); // No row
      });

      const result = await invoiceRepository.hasInvoice(123);

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.hasInvoice(123))
        .rejects.toThrow('Database error');
    });
  });

  describe('getExpenseIdsWithInvoices', () => {
    it('should get all expense IDs with invoices', async () => {
      const mockRows = [
        { expense_id: 123 },
        { expense_id: 456 },
        { expense_id: 789 }
      ];

      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockRows);
      });

      const result = await invoiceRepository.getExpenseIdsWithInvoices();

      expect(result).toEqual([123, 456, 789]);
      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT DISTINCT expense_id FROM expense_invoices ORDER BY expense_id',
        [],
        expect.any(Function)
      );
    });

    it('should return empty array if no invoices', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      const result = await invoiceRepository.getExpenseIdsWithInvoices();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.getExpenseIdsWithInvoices())
        .rejects.toThrow('Database error');
    });
  });

  describe('getStatistics', () => {
    it('should get invoice statistics', async () => {
      const mockStats = {
        totalInvoices: 10,
        totalSize: 10240000,
        averageSize: 1024000,
        oldestUpload: '2025-01-01T12:00:00Z',
        newestUpload: '2025-01-31T12:00:00Z'
      };

      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, mockStats);
      });

      const result = await invoiceRepository.getStatistics();

      expect(result).toMatchObject({
        totalInvoices: 10,
        totalSize: 10240000,
        totalSizeMB: 9.77,
        averageSize: 1024000,
        averageSizeMB: 0.98,
        oldestUpload: '2025-01-01T12:00:00Z',
        newestUpload: '2025-01-31T12:00:00Z'
      });
    });

    it('should handle null statistics (no invoices)', async () => {
      const mockStats = {
        totalInvoices: null,
        totalSize: null,
        averageSize: null,
        oldestUpload: null,
        newestUpload: null
      };

      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, mockStats);
      });

      const result = await invoiceRepository.getStatistics();

      expect(result).toMatchObject({
        totalInvoices: 0,
        totalSize: 0,
        totalSizeMB: 0,
        averageSize: 0,
        averageSizeMB: 0,
        oldestUpload: null,
        newestUpload: null
      });
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.getStatistics())
        .rejects.toThrow('Database error');
    });
  });

  describe('findByDateRange', () => {
    it('should find invoices by date range', async () => {
      const mockRows = [mockDbRow];
      const startDate = '2025-01-01T00:00:00Z';
      const endDate = '2025-01-31T23:59:59Z';

      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockRows);
      });

      const result = await invoiceRepository.findByDateRange(startDate, endDate);

      expect(result).toEqual([expectedInvoice]);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE upload_date >= ? AND upload_date <= ?'),
        [startDate, endDate],
        expect.any(Function)
      );
    });

    it('should return empty array if no invoices in range', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      const result = await invoiceRepository.findByDateRange('2025-01-01', '2025-01-31');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(dbError);
      });

      await expect(invoiceRepository.findByDateRange('2025-01-01', '2025-01-31'))
        .rejects.toThrow('Database error');
    });
  });
});