const incomeRepository = require('./incomeRepository');
const db = require('../database/db');

// Mock the database
jest.mock('../database/db');

describe('incomeRepository', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      prepare: jest.fn(),
      exec: jest.fn(),
      transaction: jest.fn()
    };
    db.mockReturnValue(mockDb);
    jest.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all income sources', () => {
      const mockIncomes = [
        { id: 1, source: 'Salary', amount: 5000, year: 2024, month: 11 },
        { id: 2, source: 'Freelance', amount: 1500, year: 2024, month: 11 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockIncomes)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = incomeRepository.getAll();

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM income_sources ORDER BY year DESC, month DESC, source ASC'
      );
      expect(mockStmt.all).toHaveBeenCalled();
      expect(result).toEqual(mockIncomes);
    });
  });

  describe('getById', () => {
    it('should return income by id', () => {
      const mockIncome = { id: 1, source: 'Salary', amount: 5000, year: 2024, month: 11 };
      
      const mockStmt = {
        get: jest.fn().mockReturnValue(mockIncome)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = incomeRepository.getById(1);

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM income_sources WHERE id = ?');
      expect(mockStmt.get).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockIncome);
    });
  });

  describe('create', () => {
    it('should create new income source', () => {
      const incomeData = {
        source: 'Salary',
        amount: 5000,
        year: 2024,
        month: 11,
        description: 'Monthly salary'
      };

      const mockInsertStmt = {
        run: jest.fn().mockReturnValue({ lastInsertRowid: 1 })
      };
      const mockSelectStmt = {
        get: jest.fn().mockReturnValue({ id: 1, ...incomeData })
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockInsertStmt)
        .mockReturnValueOnce(mockSelectStmt);

      const result = incomeRepository.create(incomeData);

      expect(mockInsertStmt.run).toHaveBeenCalledWith(
        'Salary', 5000, 2024, 11, 'Monthly salary'
      );
      expect(result).toEqual({ id: 1, ...incomeData });
    });
  });

  describe('update', () => {
    it('should update existing income source', () => {
      const updateData = {
        source: 'Updated Salary',
        amount: 5500,
        year: 2024,
        month: 11,
        description: 'Updated salary'
      };

      const mockUpdateStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };
      const mockSelectStmt = {
        get: jest.fn().mockReturnValue({ id: 1, ...updateData })
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockUpdateStmt)
        .mockReturnValueOnce(mockSelectStmt);

      const result = incomeRepository.update(1, updateData);

      expect(mockUpdateStmt.run).toHaveBeenCalledWith(
        'Updated Salary', 5500, 2024, 11, 'Updated salary', 1
      );
      expect(result).toEqual({ id: 1, ...updateData });
    });
  });

  describe('delete', () => {
    it('should delete income source by id', () => {
      const mockStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = incomeRepository.delete(1);

      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM income_sources WHERE id = ?');
      expect(mockStmt.run).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });
  });

  describe('getForMonth', () => {
    it('should return income sources for specific month', () => {
      const mockIncomes = [
        { id: 1, source: 'Salary', amount: 5000, year: 2024, month: 11 },
        { id: 2, source: 'Freelance', amount: 1500, year: 2024, month: 11 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockIncomes)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = incomeRepository.getForMonth(2024, 11);

      expect(mockStmt.all).toHaveBeenCalledWith(2024, 11);
      expect(result).toEqual(mockIncomes);
    });
  });

  describe('getTotalForMonth', () => {
    it('should return total income for month', () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ total: 6500 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = incomeRepository.getTotalForMonth(2024, 11);

      expect(mockStmt.get).toHaveBeenCalledWith(2024, 11);
      expect(result).toBe(6500);
    });

    it('should return 0 when no income exists', () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ total: null })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = incomeRepository.getTotalForMonth(2024, 11);

      expect(result).toBe(0);
    });
  });

  describe('carryForward', () => {
    it('should carry forward income to next month', () => {
      const mockIncomes = [
        { id: 1, source: 'Salary', amount: 5000, description: 'Monthly salary' },
        { id: 2, source: 'Freelance', amount: 1500, description: 'Side work' }
      ];

      const mockSelectStmt = {
        all: jest.fn().mockReturnValue(mockIncomes)
      };
      const mockInsertStmt = {
        run: jest.fn().mockReturnValue({ lastInsertRowid: 3 })
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)
        .mockReturnValue(mockInsertStmt);

      const result = incomeRepository.carryForward(2024, 11);

      expect(mockSelectStmt.all).toHaveBeenCalledWith(2024, 11);
      expect(mockInsertStmt.run).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('should handle year rollover', () => {
      const mockIncomes = [
        { id: 1, source: 'Salary', amount: 5000, description: 'Monthly salary' }
      ];

      const mockSelectStmt = {
        all: jest.fn().mockReturnValue(mockIncomes)
      };
      const mockInsertStmt = {
        run: jest.fn().mockReturnValue({ lastInsertRowid: 2 })
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)
        .mockReturnValue(mockInsertStmt);

      const result = incomeRepository.carryForward(2024, 12);

      // Should insert with year 2025, month 1
      expect(mockInsertStmt.run).toHaveBeenCalledWith(
        'Salary', 5000, 2025, 1, 'Monthly salary'
      );
    });
  });

  describe('getHistoryBySource', () => {
    it('should return income history for specific source', () => {
      const mockHistory = [
        { year: 2024, month: 9, amount: 4800 },
        { year: 2024, month: 10, amount: 5000 },
        { year: 2024, month: 11, amount: 5200 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockHistory)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = incomeRepository.getHistoryBySource('Salary', 3);

      expect(mockStmt.all).toHaveBeenCalledWith('Salary', 3);
      expect(result).toEqual(mockHistory);
    });
  });
});
