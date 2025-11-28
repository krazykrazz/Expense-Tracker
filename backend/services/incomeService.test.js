const incomeService = require('./incomeService');
const incomeRepository = require('../repositories/incomeRepository');
const { validateYearMonth } = require('../utils/validators');

// Mock dependencies
jest.mock('../repositories/incomeRepository');
jest.mock('../utils/validators');

describe('incomeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default validator mock to not throw
    validateYearMonth.mockImplementation(() => {});
  });

  describe('getMonthlyIncome', () => {
    it('should return income sources and total for a month', async () => {
      const mockSources = [
        { id: 1, name: 'Salary', amount: 5000, year: 2024, month: 11 },
        { id: 2, name: 'Freelance', amount: 1500, year: 2024, month: 11 }
      ];
      incomeRepository.getIncomeSources.mockResolvedValue(mockSources);
      incomeRepository.getTotalMonthlyGross.mockResolvedValue(6500);

      const result = await incomeService.getMonthlyIncome(2024, 11);

      expect(result).toEqual({
        sources: mockSources,
        total: 6500
      });
      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
      expect(incomeRepository.getIncomeSources).toHaveBeenCalledWith(2024, 11);
      expect(incomeRepository.getTotalMonthlyGross).toHaveBeenCalledWith(2024, 11);
    });

    it('should handle invalid year/month', async () => {
      validateYearMonth.mockImplementation(() => {
        throw new Error('Invalid year or month');
      });

      await expect(incomeService.getMonthlyIncome(2024, 13)).rejects.toThrow('Invalid year or month');
    });

    it('should return empty sources and zero total when no income exists', async () => {
      incomeRepository.getIncomeSources.mockResolvedValue([]);
      incomeRepository.getTotalMonthlyGross.mockResolvedValue(0);

      const result = await incomeService.getMonthlyIncome(2024, 11);

      expect(result).toEqual({
        sources: [],
        total: 0
      });
    });
  });

  describe('createIncomeSource', () => {
    it('should create a new income source with valid data', async () => {
      const incomeData = {
        year: 2024,
        month: 11,
        name: 'Salary',
        amount: 5000
      };
      const mockCreatedIncome = { id: 1, ...incomeData };
      incomeRepository.createIncomeSource.mockResolvedValue(mockCreatedIncome);

      const result = await incomeService.createIncomeSource(incomeData);

      expect(result).toEqual(mockCreatedIncome);
      expect(incomeRepository.createIncomeSource).toHaveBeenCalledWith({
        year: 2024,
        month: 11,
        name: 'Salary',
        amount: 5000
      });
    });

    it('should throw error when name is missing', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: '',
        amount: 5000
      };

      await expect(incomeService.createIncomeSource(invalidData)).rejects.toThrow('Name is required');
    });

    it('should throw error when amount is missing', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Salary'
      };

      await expect(incomeService.createIncomeSource(invalidData)).rejects.toThrow('Amount is required');
    });

    it('should throw error when amount is negative', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Salary',
        amount: -100
      };

      await expect(incomeService.createIncomeSource(invalidData)).rejects.toThrow('Amount must be a non-negative number');
    });

    it('should throw error when year/month is missing', async () => {
      const invalidData = {
        name: 'Salary',
        amount: 5000
      };

      await expect(incomeService.createIncomeSource(invalidData)).rejects.toThrow('Year and month are required');
    });

    it('should trim whitespace from name', async () => {
      const incomeData = {
        year: 2024,
        month: 11,
        name: '  Salary  ',
        amount: 5000
      };
      incomeRepository.createIncomeSource.mockResolvedValue({ id: 1, ...incomeData, name: 'Salary' });

      await incomeService.createIncomeSource(incomeData);

      expect(incomeRepository.createIncomeSource).toHaveBeenCalledWith({
        year: 2024,
        month: 11,
        name: 'Salary',
        amount: 5000
      });
    });
  });

  describe('updateIncomeSource', () => {
    it('should update existing income source', async () => {
      const updateData = {
        name: 'Updated Salary',
        amount: 5500
      };
      const mockUpdatedIncome = { id: 1, year: 2024, month: 11, ...updateData };
      incomeRepository.updateIncomeSource.mockResolvedValue(mockUpdatedIncome);

      const result = await incomeService.updateIncomeSource(1, updateData);

      expect(result).toEqual(mockUpdatedIncome);
      expect(incomeRepository.updateIncomeSource).toHaveBeenCalledWith(1, {
        name: 'Updated Salary',
        amount: 5500
      });
    });

    it('should throw error when id is missing', async () => {
      await expect(incomeService.updateIncomeSource(null, { name: 'Test', amount: 100 }))
        .rejects.toThrow('Income source ID is required');
    });

    it('should return null when income source not found', async () => {
      incomeRepository.updateIncomeSource.mockResolvedValue(null);

      const result = await incomeService.updateIncomeSource(999, { name: 'Test', amount: 100 });

      expect(result).toBeNull();
    });
  });

  describe('deleteIncomeSource', () => {
    it('should delete income source by id', async () => {
      incomeRepository.deleteIncomeSource.mockResolvedValue(true);

      const result = await incomeService.deleteIncomeSource(1);

      expect(result).toBe(true);
      expect(incomeRepository.deleteIncomeSource).toHaveBeenCalledWith(1);
    });

    it('should throw error when id is missing', async () => {
      await expect(incomeService.deleteIncomeSource(null))
        .rejects.toThrow('Income source ID is required');
    });

    it('should return false when income source not found', async () => {
      incomeRepository.deleteIncomeSource.mockResolvedValue(false);

      const result = await incomeService.deleteIncomeSource(999);

      expect(result).toBe(false);
    });
  });

  describe('copyFromPreviousMonth', () => {
    it('should copy income sources from previous month', async () => {
      const mockCopiedSources = [
        { id: 3, year: 2024, month: 12, name: 'Salary', amount: 5000 },
        { id: 4, year: 2024, month: 12, name: 'Freelance', amount: 1500 }
      ];
      incomeRepository.getIncomeSources.mockResolvedValue([]);
      incomeRepository.copyFromPreviousMonth.mockResolvedValue(mockCopiedSources);

      const result = await incomeService.copyFromPreviousMonth(2024, 12);

      expect(result).toEqual(mockCopiedSources);
      expect(validateYearMonth).toHaveBeenCalledWith(2024, 12);
      expect(incomeRepository.copyFromPreviousMonth).toHaveBeenCalledWith(2024, 12);
    });

    it('should throw error when current month already has income sources', async () => {
      incomeRepository.getIncomeSources.mockResolvedValue([
        { id: 1, name: 'Existing', amount: 1000 }
      ]);

      await expect(incomeService.copyFromPreviousMonth(2024, 12))
        .rejects.toThrow('Cannot copy from previous month. Current month already has income sources.');
    });

    it('should handle invalid year/month', async () => {
      validateYearMonth.mockImplementation(() => {
        throw new Error('Invalid year or month');
      });

      await expect(incomeService.copyFromPreviousMonth(2024, 13)).rejects.toThrow('Invalid year or month');
    });
  });

  describe('validateIncomeSource', () => {
    it('should throw error for name exceeding max length', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'A'.repeat(101),
        amount: 5000
      };

      await expect(incomeService.createIncomeSource(invalidData))
        .rejects.toThrow('Name must not exceed 100 characters');
    });

    it('should throw error for invalid amount format', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Salary',
        amount: 'not-a-number'
      };

      await expect(incomeService.createIncomeSource(invalidData))
        .rejects.toThrow('Amount must be a valid number');
    });
  });
});
