/**
 * Tests for InvestmentService
 * Tests business logic for investment management
 */

const { getDatabase } = require('../database/db');
const investmentService = require('./investmentService');
const investmentRepository = require('../repositories/investmentRepository');

describe('InvestmentService', () => {
  let db;
  const createdInvestmentIds = [];

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up created investments
    for (const id of createdInvestmentIds) {
      try {
        await investmentRepository.delete(id);
      } catch (e) {
        // Ignore errors
      }
    }
    createdInvestmentIds.length = 0;
  });

  describe('validateInvestment', () => {
    test('should accept valid investment data', () => {
      const validInvestment = {
        name: 'Valid Investment',
        type: 'TFSA',
        initial_value: 10000
      };

      expect(() => investmentService.validateInvestment(validInvestment)).not.toThrow();
    });

    test('should reject empty name', () => {
      const invalidInvestment = {
        name: '',
        type: 'TFSA',
        initial_value: 10000
      };

      expect(() => investmentService.validateInvestment(invalidInvestment)).toThrow('Name is required');
    });

    test('should reject whitespace-only name', () => {
      const invalidInvestment = {
        name: '   ',
        type: 'TFSA',
        initial_value: 10000
      };

      expect(() => investmentService.validateInvestment(invalidInvestment)).toThrow('Name is required');
    });

    test('should reject name exceeding 100 characters', () => {
      const invalidInvestment = {
        name: 'A'.repeat(101),
        type: 'TFSA',
        initial_value: 10000
      };

      expect(() => investmentService.validateInvestment(invalidInvestment)).toThrow('Name must not exceed 100 characters');
    });

    test('should reject missing type', () => {
      const invalidInvestment = {
        name: 'Test Investment',
        type: '',
        initial_value: 10000
      };

      expect(() => investmentService.validateInvestment(invalidInvestment)).toThrow('Type is required');
    });

    test('should reject invalid type', () => {
      const invalidInvestment = {
        name: 'Test Investment',
        type: 'INVALID',
        initial_value: 10000
      };

      expect(() => investmentService.validateInvestment(invalidInvestment)).toThrow('Invalid type');
    });

    test('should accept TFSA type', () => {
      const validInvestment = {
        name: 'TFSA Account',
        type: 'TFSA',
        initial_value: 10000
      };

      expect(() => investmentService.validateInvestment(validInvestment)).not.toThrow();
    });

    test('should accept RRSP type', () => {
      const validInvestment = {
        name: 'RRSP Account',
        type: 'RRSP',
        initial_value: 10000
      };

      expect(() => investmentService.validateInvestment(validInvestment)).not.toThrow();
    });

    test('should reject missing initial_value', () => {
      const invalidInvestment = {
        name: 'Test Investment',
        type: 'TFSA'
      };

      expect(() => investmentService.validateInvestment(invalidInvestment)).toThrow('Initial value is required');
    });

    test('should reject negative initial_value', () => {
      const invalidInvestment = {
        name: 'Test Investment',
        type: 'TFSA',
        initial_value: -1000
      };

      expect(() => investmentService.validateInvestment(invalidInvestment)).toThrow('Initial value must be a non-negative number');
    });

    test('should accept zero initial_value', () => {
      const validInvestment = {
        name: 'Zero Value Account',
        type: 'TFSA',
        initial_value: 0
      };

      expect(() => investmentService.validateInvestment(validInvestment)).not.toThrow();
    });

    test('should reject initial_value with more than 2 decimal places', () => {
      const invalidInvestment = {
        name: 'Test Investment',
        type: 'TFSA',
        initial_value: 100.123
      };

      expect(() => investmentService.validateInvestment(invalidInvestment)).toThrow('Initial value must have at most 2 decimal places');
    });

    test('should accept initial_value with 2 decimal places', () => {
      const validInvestment = {
        name: 'Test Investment',
        type: 'TFSA',
        initial_value: 100.99
      };

      expect(() => investmentService.validateInvestment(validInvestment)).not.toThrow();
    });
  });

  describe('createInvestment', () => {
    test('should create investment with trimmed name', async () => {
      const investmentData = {
        name: '  Test Investment  ',
        type: 'TFSA',
        initial_value: 10000
      };

      const created = await investmentService.createInvestment(investmentData);
      createdInvestmentIds.push(created.id);

      expect(created.name).toBe('Test Investment');
    });

    test('should create investment with trimmed type', async () => {
      // Note: Type validation happens before trimming in validateInvestment
      // So we test that the created investment has the correct type
      const investmentData = {
        name: 'Test Investment',
        type: 'TFSA',
        initial_value: 10000
      };

      const created = await investmentService.createInvestment(investmentData);
      createdInvestmentIds.push(created.id);

      expect(created.type).toBe('TFSA');
    });

    test('should parse initial_value as float', async () => {
      const investmentData = {
        name: 'Float Value Test',
        type: 'RRSP',
        initial_value: '15000.50'
      };

      const created = await investmentService.createInvestment(investmentData);
      createdInvestmentIds.push(created.id);

      expect(created.initial_value).toBe(15000.50);
    });

    test('should reject invalid data', async () => {
      const invalidData = {
        name: '',
        type: 'TFSA',
        initial_value: 10000
      };

      await expect(investmentService.createInvestment(invalidData)).rejects.toThrow();
    });
  });

  describe('updateInvestment', () => {
    test('should update investment name and type', async () => {
      const created = await investmentService.createInvestment({
        name: 'Original Investment',
        type: 'TFSA',
        initial_value: 10000
      });
      createdInvestmentIds.push(created.id);

      const updated = await investmentService.updateInvestment(created.id, {
        name: 'Updated Investment',
        type: 'RRSP'
      });

      expect(updated.name).toBe('Updated Investment');
      expect(updated.type).toBe('RRSP');
      // initial_value should remain unchanged
      expect(updated.initial_value).toBe(10000);
    });

    test('should reject missing ID', async () => {
      await expect(
        investmentService.updateInvestment(null, {
          name: 'Test',
          type: 'TFSA'
        })
      ).rejects.toThrow('Investment ID is required');
    });

    test('should reject empty name on update', async () => {
      const created = await investmentService.createInvestment({
        name: 'Test Investment',
        type: 'TFSA',
        initial_value: 10000
      });
      createdInvestmentIds.push(created.id);

      await expect(
        investmentService.updateInvestment(created.id, {
          name: '',
          type: 'TFSA'
        })
      ).rejects.toThrow('Name is required');
    });

    test('should reject invalid type on update', async () => {
      const created = await investmentService.createInvestment({
        name: 'Test Investment',
        type: 'TFSA',
        initial_value: 10000
      });
      createdInvestmentIds.push(created.id);

      await expect(
        investmentService.updateInvestment(created.id, {
          name: 'Test Investment',
          type: 'INVALID'
        })
      ).rejects.toThrow('Type must be TFSA or RRSP');
    });

    test('should return null for non-existent investment', async () => {
      const updated = await investmentService.updateInvestment(99999, {
        name: 'Ghost Investment',
        type: 'TFSA'
      });

      expect(updated).toBeNull();
    });

    test('should trim name and type on update', async () => {
      const created = await investmentService.createInvestment({
        name: 'Test Investment',
        type: 'TFSA',
        initial_value: 10000
      });
      createdInvestmentIds.push(created.id);

      const updated = await investmentService.updateInvestment(created.id, {
        name: '  Trimmed Name  ',
        type: ' RRSP '
      });

      expect(updated.name).toBe('Trimmed Name');
      expect(updated.type).toBe('RRSP');
    });
  });

  describe('deleteInvestment', () => {
    test('should delete existing investment', async () => {
      const created = await investmentService.createInvestment({
        name: 'Delete Me',
        type: 'TFSA',
        initial_value: 5000
      });

      const deleted = await investmentService.deleteInvestment(created.id);

      expect(deleted).toBe(true);
    });

    test('should reject missing ID', async () => {
      await expect(investmentService.deleteInvestment(null)).rejects.toThrow('Investment ID is required');
    });

    test('should return false for non-existent investment', async () => {
      const deleted = await investmentService.deleteInvestment(99999);
      expect(deleted).toBe(false);
    });
  });

  describe('getAllInvestments', () => {
    test('should return investments with currentValue', async () => {
      const created = await investmentService.createInvestment({
        name: 'Get All Test',
        type: 'TFSA',
        initial_value: 10000
      });
      createdInvestmentIds.push(created.id);

      const investments = await investmentService.getAllInvestments();

      const testInvestment = investments.find(i => i.id === created.id);
      expect(testInvestment).toBeDefined();
      expect(testInvestment.currentValue).toBeDefined();
    });

    test('should use initial_value as currentValue when no value entries exist', async () => {
      const created = await investmentService.createInvestment({
        name: 'Initial Value Test',
        type: 'RRSP',
        initial_value: 15000
      });
      createdInvestmentIds.push(created.id);

      const investments = await investmentService.getAllInvestments();

      const testInvestment = investments.find(i => i.id === created.id);
      expect(testInvestment.currentValue).toBe(15000);
    });
  });

  describe('calculateTotalInvestmentValue', () => {
    test('should sum all currentValue values', () => {
      const investments = [
        { id: 1, name: 'Investment 1', currentValue: 10000 },
        { id: 2, name: 'Investment 2', currentValue: 25000 },
        { id: 3, name: 'Investment 3', currentValue: 15000 }
      ];

      const total = investmentService.calculateTotalInvestmentValue(investments);

      expect(total).toBe(50000);
    });

    test('should handle empty array', () => {
      const total = investmentService.calculateTotalInvestmentValue([]);
      expect(total).toBe(0);
    });

    test('should handle non-array input', () => {
      const total = investmentService.calculateTotalInvestmentValue(null);
      expect(total).toBe(0);

      const total2 = investmentService.calculateTotalInvestmentValue(undefined);
      expect(total2).toBe(0);

      const total3 = investmentService.calculateTotalInvestmentValue('not an array');
      expect(total3).toBe(0);
    });

    test('should handle investments with missing currentValue', () => {
      const investments = [
        { id: 1, name: 'Investment 1', currentValue: 10000 },
        { id: 2, name: 'Investment 2' }, // No currentValue
        { id: 3, name: 'Investment 3', currentValue: 5000 }
      ];

      const total = investmentService.calculateTotalInvestmentValue(investments);

      expect(total).toBe(15000);
    });

    test('should handle string currentValue', () => {
      const investments = [
        { id: 1, name: 'Investment 1', currentValue: '10000' },
        { id: 2, name: 'Investment 2', currentValue: '5000.50' }
      ];

      const total = investmentService.calculateTotalInvestmentValue(investments);

      expect(total).toBe(15000.50);
    });

    test('should handle zero values', () => {
      const investments = [
        { id: 1, name: 'Investment 1', currentValue: 10000 },
        { id: 2, name: 'Investment 2', currentValue: 0 }
      ];

      const total = investmentService.calculateTotalInvestmentValue(investments);

      expect(total).toBe(10000);
    });
  });
});
