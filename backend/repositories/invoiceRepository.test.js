const invoiceRepository = require('./invoiceRepository');
const { getDatabase } = require('../database/db');

// Mock the database
jest.mock('../database/db');

describe('InvoiceRepository', () => {
  let mockDb;
  
  const mockInvoiceData = {
    expenseId: 123,
    personId: 5,
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
    person_id: 5,
    person_name: 'John Doe',
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
    personId: 5,
    personName: 'John Doe',
    filename: '123_1704067200_test-invoice.pdf',
    originalFilename: 'test-invoice.pdf',
    filePath: '2025/01/123_1704067200_test-invoice.pdf',
    fileSize: 1024000,
    mimeType: 'application/pdf',
    uploadDate: '2025-01-01T12:00:00Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { run: jest.fn(), get: jest.fn(), all: jest.fn() };
    getDatabase.mockResolvedValue(mockDb);
  });


  describe('create', () => {
    it('should create invoice with personId successfully', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ lastID: 1 }, null);
      });
      const result = await invoiceRepository.create(mockInvoiceData);
      expect(result).toMatchObject({
        id: 1,
        expenseId: mockInvoiceData.expenseId,
        personId: mockInvoiceData.personId,
        filename: mockInvoiceData.filename
      });
    });

    it('should create invoice without personId (null)', async () => {
      const dataWithoutPerson = { ...mockInvoiceData, personId: undefined };
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ lastID: 1 }, null);
      });
      const result = await invoiceRepository.create(dataWithoutPerson);
      expect(result.personId).toBeNull();
    });

    it('should handle database errors during create', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(new Error('Database error'));
      });
      await expect(invoiceRepository.create(mockInvoiceData)).rejects.toThrow('Database error');
    });
  });

  describe('findByExpenseId', () => {
    it('should find invoice by expense ID with person info', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, mockDbRow);
      });
      const result = await invoiceRepository.findByExpenseId(123);
      expect(result).toEqual(expectedInvoice);
    });

    it('should return null if invoice not found', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, null);
      });
      const result = await invoiceRepository.findByExpenseId(123);
      expect(result).toBeNull();
    });
  });

  describe('findAllByExpenseId', () => {
    it('should find all invoices for an expense', async () => {
      const mockRows = [mockDbRow, { ...mockDbRow, id: 2, person_id: null, person_name: null }];
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockRows);
      });
      const result = await invoiceRepository.findAllByExpenseId(123);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expectedInvoice);
      expect(result[1].personId).toBeNull();
    });

    it('should return empty array if no invoices found', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });
      const result = await invoiceRepository.findAllByExpenseId(123);
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find invoice by ID with person info', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, mockDbRow);
      });
      const result = await invoiceRepository.findById(1);
      expect(result).toEqual(expectedInvoice);
    });

    it('should return null if invoice not found', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, null);
      });
      const result = await invoiceRepository.findById(1);
      expect(result).toBeNull();
    });
  });

  describe('updatePersonId', () => {
    it('should update person ID successfully', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 1 }, null);
      });
      const result = await invoiceRepository.updatePersonId(1, 10);
      expect(result).toBe(true);
    });

    it('should set person ID to null', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 1 }, null);
      });
      const result = await invoiceRepository.updatePersonId(1, null);
      expect(result).toBe(true);
    });

    it('should return false if invoice not found', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 0 }, null);
      });
      const result = await invoiceRepository.updatePersonId(999, 10);
      expect(result).toBe(false);
    });
  });

  describe('deleteByExpenseId', () => {
    it('should delete all invoices by expense ID and return count', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 3 }, null);
      });
      const result = await invoiceRepository.deleteByExpenseId(123);
      expect(result).toBe(3);
    });

    it('should return 0 if no invoices deleted', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 0 }, null);
      });
      const result = await invoiceRepository.deleteByExpenseId(123);
      expect(result).toBe(0);
    });
  });

  describe('deleteById', () => {
    it('should delete invoice by ID', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 1 }, null);
      });
      const result = await invoiceRepository.deleteById(1);
      expect(result).toBe(true);
    });

    it('should return false if no rows deleted', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 0 }, null);
      });
      const result = await invoiceRepository.deleteById(1);
      expect(result).toBe(false);
    });
  });

  describe('getCountByExpenseId', () => {
    it('should return invoice count for expense', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { count: 5 });
      });
      const result = await invoiceRepository.getCountByExpenseId(123);
      expect(result).toBe(5);
    });

    it('should return 0 if no invoices', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { count: 0 });
      });
      const result = await invoiceRepository.getCountByExpenseId(123);
      expect(result).toBe(0);
    });
  });

  describe('clearPersonIdForExpense', () => {
    it('should clear person ID for expense invoices', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 2 }, null);
      });
      const result = await invoiceRepository.clearPersonIdForExpense(123, 5);
      expect(result).toBe(2);
    });

    it('should return 0 if no invoices updated', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 0 }, null);
      });
      const result = await invoiceRepository.clearPersonIdForExpense(123, 5);
      expect(result).toBe(0);
    });
  });

  describe('hasInvoice', () => {
    it('should return true if expense has invoice', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { 1: 1 });
      });
      const result = await invoiceRepository.hasInvoice(123);
      expect(result).toBe(true);
    });

    it('should return false if expense has no invoice', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, null);
      });
      const result = await invoiceRepository.hasInvoice(123);
      expect(result).toBe(false);
    });
  });

  describe('getExpenseIdsWithInvoices', () => {
    it('should get all expense IDs with invoices', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, [{ expense_id: 123 }, { expense_id: 456 }]);
      });
      const result = await invoiceRepository.getExpenseIdsWithInvoices();
      expect(result).toEqual([123, 456]);
    });
  });

  describe('getStatistics', () => {
    it('should get invoice statistics', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { totalInvoices: 10, totalSize: 10240000, averageSize: 1024000 });
      });
      const result = await invoiceRepository.getStatistics();
      expect(result.totalInvoices).toBe(10);
    });
  });

  describe('findByDateRange', () => {
    it('should find invoices by date range with person info', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, [mockDbRow]);
      });
      const result = await invoiceRepository.findByDateRange('2025-01-01', '2025-01-31');
      expect(result).toEqual([expectedInvoice]);
    });

    it('should return empty array if no invoices in range', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });
      const result = await invoiceRepository.findByDateRange('2025-01-01', '2025-01-31');
      expect(result).toEqual([]);
    });
  });
});
