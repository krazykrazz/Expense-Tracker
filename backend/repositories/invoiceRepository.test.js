const invoiceRepository = require('./invoiceRepository');
const { getDatabase } = require('../database/db');

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
    it('should create invoice with personId', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ lastID: 1 }, null);
      });
      const result = await invoiceRepository.create(mockInvoiceData);
      expect(result.id).toBe(1);
      expect(result.personId).toBe(5);
    });

    it('should create invoice without personId', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ lastID: 1 }, null);
      });
      const result = await invoiceRepository.create({ ...mockInvoiceData, personId: undefined });
      expect(result.personId).toBeNull();
    });
  });

  describe('findAllByExpenseId', () => {
    it('should find all invoices for expense', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, [mockDbRow, { ...mockDbRow, id: 2, person_id: null, person_name: null }]);
      });
      const result = await invoiceRepository.findAllByExpenseId(123);
      expect(result).toHaveLength(2);
      expect(result[0].personId).toBe(5);
      expect(result[1].personId).toBeNull();
    });
  });

  describe('updatePersonId', () => {
    it('should update person ID', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 1 }, null);
      });
      const result = await invoiceRepository.updatePersonId(1, 10);
      expect(result).toBe(true);
    });
  });

  describe('getCountByExpenseId', () => {
    it('should return count', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { count: 5 });
      });
      const result = await invoiceRepository.getCountByExpenseId(123);
      expect(result).toBe(5);
    });
  });

  describe('clearPersonIdForExpense', () => {
    it('should clear person ID', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 2 }, null);
      });
      const result = await invoiceRepository.clearPersonIdForExpense(123, 5);
      expect(result).toBe(2);
    });
  });

  describe('deleteByExpenseId', () => {
    it('should return count of deleted', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 3 }, null);
      });
      const result = await invoiceRepository.deleteByExpenseId(123);
      expect(result).toBe(3);
    });
  });
});
