const incomeService = require('./incomeService');
const incomeRepository = require('../repositories/incomeRepository');
const { validateNumber, validateString, validateYearMonth } = require('../utils/validators');

// Mock dependencies
jest.mock('../repositories/incomeRepository');
jest.mock('../utils/validators');

describe('incomeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default validator mocks to return true
    validateNumber.mockReturnValue(true);
    validateString.mockReturnValue(true);
    validateYearMonth.mockReturnValue(true);
  });

  describe('getAllIncomes', () => {
    it('should return all incomes from repository', async () => {
      const mockIncomes = [
        { id: 1, source: 'Salary', amount: 5000, year: 2024, month: 11 },
        { id: 2, source: 'Freelance', amount: 1500, year: 2024, month: 11 }
      ];
      incomeRepository.getAll.mockResolvedValue(mockIncomes);

      const result = await incomeService.getAllIncomes();

      expect(result).toEqual(mockIncomes);
      expect(incomeRepository.getAll).toHaveBeenCalledTimes(1);
    });

    it('should handle repository errors', async () => {
      const error = new Error('Database error');
      incomeRepository.getAll.mockRejectedValue(error);

      await expect(incomeService.getAllIncomes()).rejects.toThrow('Database error');
    });
  });

  describe('getIncomeById', () => {
    it('should return income by id', async () => {
      const mockIncome = { id: 1, source: 'Salary', amount: 5000, year: 2024, month: 11 };
      incomeRepository.getById.mockResolvedValue(mockIncome);

      const result = await incomeService.getIncomeById(1);

      expect(result).toEqual(mockIncome);
      expect(incomeRepository.getById).toHaveBeenCalledWith(1);
    });

    it('should validate id parameter', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (value !== 1) throw new Error(`${name} must be a valid number`);
        return true;
      });

      await expect(incomeService.getIncomeById('invalid')).rejects.toThrow('ID must be a valid number');
      expect(validateNumber).toHaveBeenCalledWith('invalid', 'ID', { min: 1 });
    });

    it('should return null when income not found', async () => {
      incomeRepository.getById.mockResolvedValue(null);

      const result = await incomeService.getIncomeById(999);

      expect(result).toBeNull();
    });
  });

  describe('createIncome', () => {
    const validIncomeData = {
      source: 'Salary',
      amount: 5000,
      year: 2024,
      month: 11,
      description: 'Monthly salary'
    };

    it('should create a new income with valid data', async () => {
      const mockCreatedIncome = { id: 1, ...validIncomeData };
      incomeRepository.create.mockResolvedValue(mockCreatedIncome);

      const result = await incomeService.createIncome(validIncomeData);

      expect(result).toEqual(mockCreatedIncome);
      expect(incomeRepository.create).toHaveBeenCalledWith(validIncomeData);
    });

    it('should validate source field', async () => {
      validateString.mockImplementation((value, name) => {
        if (!value || value.trim() === '') throw new Error(`${name} is required`);
        return true;
      });

      const invalidData = { ...validIncomeData, source: '' };
      
      await expect(incomeService.createIncome(invalidData)).rejects.toThrow('Source is required');
      expect(validateString).toHaveBeenCalledWith('', 'Source', { minLength: 1, maxLength: 100 });
    });

    it('should validate amount field', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (value <= 0) throw new Error(`${name} must be greater than 0`);
        return true;
      });

      const invalidData = { ...validIncomeData, amount: -100 };
      
      await expect(incomeService.createIncome(invalidData)).rejects.toThrow('Amount must be greater than 0');
      expect(validateNumber).toHaveBeenCalledWith(-100, 'Amount', { min: 0.01 });
    });

    it('should validate year and month fields', async () => {
      await incomeService.createIncome(validIncomeData);

      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should handle optional description field', async () => {
      const dataWithoutDescription = {
        source: 'Salary',
        amount: 5000,
        year: 2024,
        month: 11
      };
      const mockCreatedIncome = { id: 1, ...dataWithoutDescription, description: null };
      incomeRepository.create.mockResolvedValue(mockCreatedIncome);

      const result = await incomeService.createIncome(dataWithoutDescription);

      expect(result).toEqual(mockCreatedIncome);
      expect(validateString).toHaveBeenCalledWith(undefined, 'Description', { required: false, maxLength: 255 });
    });
  });

  describe('updateIncome', () => {
    const validUpdateData = {
      source: 'Updated Salary',
      amount: 5500,
      year: 2024,
      month: 11,
      description: 'Updated monthly salary'
    };

    it('should update existing income', async () => {
      const mockUpdatedIncome = { id: 1, ...validUpdateData };
      incomeRepository.update.mockResolvedValue(mockUpdatedIncome);

      const result = await incomeService.updateIncome(1, validUpdateData);

      expect(result).toEqual(mockUpdatedIncome);
      expect(incomeRepository.update).toHaveBeenCalledWith(1, validUpdateData);
    });

    it('should validate id parameter', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (typeof value !== 'number' || value < 1) throw new Error(`${name} must be a valid positive number`);
        return true;
      });

      await expect(incomeService.updateIncome('invalid', validUpdateData)).rejects.toThrow('ID must be a valid positive number');
    });

    it('should validate update data fields', async () => {
      validateString.mockImplementation((value, name) => {
        if (name === 'Source' && (!value || value.trim() === '')) {
          throw new Error(`${name} is required`);
        }
        return true;
      });

      const invalidData = { ...validUpdateData, source: '' };
      
      await expect(incomeService.updateIncome(1, invalidData)).rejects.toThrow('Source is required');
    });

    it('should handle partial updates', async () => {
      const partialUpdate = { amount: 5200 };
      const mockUpdatedIncome = { id: 1, source: 'Salary', amount: 5200, year: 2024, month: 11 };
      incomeRepository.update.mockResolvedValue(mockUpdatedIncome);

      const result = await incomeService.updateIncome(1, partialUpdate);

      expect(result).toEqual(mockUpdatedIncome);
      expect(incomeRepository.update).toHaveBeenCalledWith(1, partialUpdate);
    });
  });

  describe('deleteIncome', () => {
    it('should delete income by id', async () => {
      incomeRepository.delete.mockResolvedValue(true);

      const result = await incomeService.deleteIncome(1);

      expect(result).toBe(true);
      expect(incomeRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should validate id parameter', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (typeof value !== 'number' || value < 1) throw new Error(`${name} must be a valid positive number`);
        return true;
      });

      await expect(incomeService.deleteIncome('invalid')).rejects.toThrow('ID must be a valid positive number');
    });

    it('should return false when income not found', async () => {
      incomeRepository.delete.mockResolvedValue(false);

      const result = await incomeService.deleteIncome(999);

      expect(result).toBe(false);
    });
  });

  describe('getIncomesForMonth', () => {
    it('should return incomes for specific month', async () => {
      const mockIncomes = [
        { id: 1, source: 'Salary', amount: 5000, year: 2024, month: 11 },
        { id: 2, source: 'Freelance', amount: 1500, year: 2024, month: 11 }
      ];
      incomeRepository.getForMonth.mockResolvedValue(mockIncomes);

      const result = await incomeService.getIncomesForMonth(2024, 11);

      expect(result).toEqual(mockIncomes);
      expect(incomeRepository.getForMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should validate year and month parameters', async () => {
      incomeRepository.getForMonth.mockResolvedValue([]);
      
      await incomeService.getIncomesForMonth(2024, 11);

      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should handle invalid year/month', async () => {
      validateYearMonth.mockImplementation(() => {
        throw new Error('Invalid year or month');
      });

      await expect(incomeService.getIncomesForMonth(2024, 13)).rejects.toThrow('Invalid year or month');
    });
  });

  describe('getTotalIncomeForMonth', () => {
    it('should return total income amount for month', async () => {
      const mockIncomes = [
        { amount: 5000 },
        { amount: 1500 },
        { amount: 800 }
      ];
      incomeRepository.getForMonth.mockResolvedValue(mockIncomes);

      const result = await incomeService.getTotalIncomeForMonth(2024, 11);

      expect(result).toBe(7300);
      expect(incomeRepository.getForMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should return 0 when no incomes exist', async () => {
      incomeRepository.getForMonth.mockResolvedValue([]);

      const result = await incomeService.getTotalIncomeForMonth(2024, 11);

      expect(result).toBe(0);
    });

    it('should validate year and month parameters', async () => {
      incomeRepository.getForMonth.mockResolvedValue([]);
      
      await incomeService.getTotalIncomeForMonth(2024, 11);

      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
    });
  });

  describe('getIncomesBySource', () => {
    it('should return incomes grouped by source', async () => {
      const mockIncomes = [
        { id: 1, source: 'Salary', amount: 5000, year: 2024, month: 11 },
        { id: 2, source: 'Salary', amount: 5000, year: 2024, month: 10 },
        { id: 3, source: 'Freelance', amount: 1500, year: 2024, month: 11 },
        { id: 4, source: 'Freelance', amount: 2000, year: 2024, month: 10 }
      ];
      incomeRepository.getAll.mockResolvedValue(mockIncomes);

      const result = await incomeService.getIncomesBySource();

      expect(result).toEqual({
        'Salary': [
          { id: 1, source: 'Salary', amount: 5000, year: 2024, month: 11 },
          { id: 2, source: 'Salary', amount: 5000, year: 2024, month: 10 }
        ],
        'Freelance': [
          { id: 3, source: 'Freelance', amount: 1500, year: 2024, month: 11 },
          { id: 4, source: 'Freelance', amount: 2000, year: 2024, month: 10 }
        ]
      });
    });

    it('should return empty object when no incomes exist', async () => {
      incomeRepository.getAll.mockResolvedValue([]);

      const result = await incomeService.getIncomesBySource();

      expect(result).toEqual({});
    });
  });

  describe('carryForwardIncome', () => {
    it('should carry forward income to next month', async () => {
      const mockCarriedIncomes = [
        { id: 3, source: 'Salary', amount: 5000, year: 2024, month: 12 },
        { id: 4, source: 'Freelance', amount: 1500, year: 2024, month: 12 }
      ];
      incomeRepository.carryForward.mockResolvedValue(mockCarriedIncomes);

      const result = await incomeService.carryForwardIncome(2024, 11);

      expect(result).toEqual(mockCarriedIncomes);
      expect(incomeRepository.carryForward).toHaveBeenCalledWith(2024, 11);
    });

    it('should validate year and month parameters', async () => {
      incomeRepository.carryForward.mockResolvedValue([]);
      
      await incomeService.carryForwardIncome(2024, 11);

      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should handle carry forward errors', async () => {
      const error = new Error('Carry forward failed');
      incomeRepository.carryForward.mockRejectedValue(error);

      await expect(incomeService.carryForwardIncome(2024, 11)).rejects.toThrow('Carry forward failed');
    });

    it('should handle year rollover (December to January)', async () => {
      const mockCarriedIncomes = [
        { id: 5, source: 'Salary', amount: 5000, year: 2025, month: 1 }
      ];
      incomeRepository.carryForward.mockResolvedValue(mockCarriedIncomes);

      const result = await incomeService.carryForwardIncome(2024, 12);

      expect(result).toEqual(mockCarriedIncomes);
      expect(incomeRepository.carryForward).toHaveBeenCalledWith(2024, 12);
    });
  });

  describe('getIncomeHistory', () => {
    it('should return income history for a specific source', async () => {
      const mockHistory = [
        { year: 2024, month: 9, amount: 4800 },
        { year: 2024, month: 10, amount: 5000 },
        { year: 2024, month: 11, amount: 5200 }
      ];
      incomeRepository.getHistoryBySource.mockResolvedValue(mockHistory);

      const result = await incomeService.getIncomeHistory('Salary', 3);

      expect(result).toEqual(mockHistory);
      expect(incomeRepository.getHistoryBySource).toHaveBeenCalledWith('Salary', 3);
    });

    it('should validate source parameter', async () => {
      validateString.mockImplementation((value, name) => {
        if (!value || value.trim() === '') throw new Error(`${name} is required`);
        return true;
      });

      await expect(incomeService.getIncomeHistory('', 3)).rejects.toThrow('Source is required');
      expect(validateString).toHaveBeenCalledWith('', 'Source', { minLength: 1 });
    });

    it('should validate months parameter', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (value < 1 || value > 12) throw new Error(`${name} must be between 1 and 12`);
        return true;
      });

      await expect(incomeService.getIncomeHistory('Salary', 15)).rejects.toThrow('Months must be between 1 and 12');
      expect(validateNumber).toHaveBeenCalledWith(15, 'Months', { min: 1, max: 12 });
    });

    it('should use default months value when not provided', async () => {
      const mockHistory = [];
      incomeRepository.getHistoryBySource.mockResolvedValue(mockHistory);

      await incomeService.getIncomeHistory('Salary');

      expect(incomeRepository.getHistoryBySource).toHaveBeenCalledWith('Salary', 6); // default 6 months
    });
  });
});
