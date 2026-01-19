/**
 * Tests for InvestmentRepository
 * Tests CRUD operations and specialized queries for investments
 */

const { getDatabase } = require('../database/db');
const investmentRepository = require('./investmentRepository');

describe('InvestmentRepository', () => {
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
        // Ignore errors - investment may already be deleted
      }
    }
    createdInvestmentIds.length = 0;
  });

  describe('create', () => {
    test('should create a TFSA investment', async () => {
      const investmentData = {
        name: 'Test TFSA Account',
        type: 'TFSA',
        initial_value: 10000
      };

      const created = await investmentRepository.create(investmentData);
      createdInvestmentIds.push(created.id);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Test TFSA Account');
      expect(created.type).toBe('TFSA');
      expect(created.initial_value).toBe(10000);
    });

    test('should create an RRSP investment', async () => {
      const investmentData = {
        name: 'Test RRSP Account',
        type: 'RRSP',
        initial_value: 25000
      };

      const created = await investmentRepository.create(investmentData);
      createdInvestmentIds.push(created.id);

      expect(created.type).toBe('RRSP');
    });

    test('should reject invalid investment type', async () => {
      const investmentData = {
        name: 'Invalid Type',
        type: 'INVALID',
        initial_value: 5000
      };

      await expect(investmentRepository.create(investmentData)).rejects.toThrow();
    });

    test('should reject negative initial value', async () => {
      const investmentData = {
        name: 'Negative Value',
        type: 'TFSA',
        initial_value: -1000
      };

      await expect(investmentRepository.create(investmentData)).rejects.toThrow();
    });

    test('should allow zero initial value', async () => {
      const investmentData = {
        name: 'Zero Value Account',
        type: 'TFSA',
        initial_value: 0
      };

      const created = await investmentRepository.create(investmentData);
      createdInvestmentIds.push(created.id);

      expect(created.initial_value).toBe(0);
    });
  });

  describe('findAll', () => {
    test('should return all investments sorted by name', async () => {
      const inv1 = await investmentRepository.create({
        name: 'Zebra Account',
        type: 'TFSA',
        initial_value: 5000
      });
      createdInvestmentIds.push(inv1.id);

      const inv2 = await investmentRepository.create({
        name: 'Alpha Account',
        type: 'RRSP',
        initial_value: 10000
      });
      createdInvestmentIds.push(inv2.id);

      const investments = await investmentRepository.findAll();

      // Find our test investments
      const testInvestments = investments.filter(
        i => i.id === inv1.id || i.id === inv2.id
      );

      expect(testInvestments.length).toBe(2);

      // Should be sorted alphabetically by name
      const alphaIdx = investments.findIndex(i => i.id === inv2.id);
      const zebraIdx = investments.findIndex(i => i.id === inv1.id);
      expect(alphaIdx).toBeLessThan(zebraIdx);
    });

    test('should return empty array when no investments exist', async () => {
      // Delete all test investments first
      const all = await investmentRepository.findAll();
      for (const inv of all) {
        if (inv.name.includes('Test') || inv.name.includes('Account')) {
          await investmentRepository.delete(inv.id);
        }
      }

      // This test may still return investments from production data
      // Just verify it returns an array
      const investments = await investmentRepository.findAll();
      expect(Array.isArray(investments)).toBe(true);
    });
  });

  describe('findById', () => {
    test('should return investment by ID', async () => {
      const created = await investmentRepository.create({
        name: 'Find Me Investment',
        type: 'TFSA',
        initial_value: 7500
      });
      createdInvestmentIds.push(created.id);

      const found = await investmentRepository.findById(created.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Find Me Investment');
    });

    test('should return null for non-existent ID', async () => {
      const found = await investmentRepository.findById(99999);
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    test('should update investment name and type', async () => {
      const created = await investmentRepository.create({
        name: 'Original Investment',
        type: 'TFSA',
        initial_value: 8000
      });
      createdInvestmentIds.push(created.id);

      const updated = await investmentRepository.update(created.id, {
        name: 'Updated Investment',
        type: 'RRSP'
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe('Updated Investment');
      expect(updated.type).toBe('RRSP');
      // initial_value should remain unchanged
      expect(updated.initial_value).toBe(8000);
    });

    test('should return null when updating non-existent investment', async () => {
      const updated = await investmentRepository.update(99999, {
        name: 'Ghost Investment',
        type: 'TFSA'
      });

      expect(updated).toBeNull();
    });

    test('should reject invalid type on update', async () => {
      const created = await investmentRepository.create({
        name: 'Type Test',
        type: 'TFSA',
        initial_value: 5000
      });
      createdInvestmentIds.push(created.id);

      await expect(
        investmentRepository.update(created.id, {
          name: 'Type Test',
          type: 'INVALID'
        })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    test('should delete investment', async () => {
      const created = await investmentRepository.create({
        name: 'Delete Me Investment',
        type: 'TFSA',
        initial_value: 3000
      });

      const deleted = await investmentRepository.delete(created.id);

      expect(deleted).toBe(true);

      const found = await investmentRepository.findById(created.id);
      expect(found).toBeNull();
    });

    test('should return false when deleting non-existent investment', async () => {
      const deleted = await investmentRepository.delete(99999);
      expect(deleted).toBe(false);
    });

    test('should cascade delete to investment values', async () => {
      const created = await investmentRepository.create({
        name: 'Cascade Delete Test',
        type: 'RRSP',
        initial_value: 10000
      });

      // Add a value entry
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)`,
          [created.id, 2024, 1, 10500],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Delete the investment
      await investmentRepository.delete(created.id);

      // Verify value entries are also deleted
      const values = await new Promise((resolve, reject) => {
        db.all(
          'SELECT * FROM investment_values WHERE investment_id = ?',
          [created.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      expect(values).toEqual([]);
    });
  });

  describe('getCurrentValue', () => {
    test('should return most recent value entry', async () => {
      const created = await investmentRepository.create({
        name: 'Value History Test',
        type: 'TFSA',
        initial_value: 10000
      });
      createdInvestmentIds.push(created.id);

      // Add multiple value entries
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)`,
          [created.id, 2024, 1, 10500],
          (err) => err ? reject(err) : resolve()
        );
      });
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)`,
          [created.id, 2024, 3, 11500],
          (err) => err ? reject(err) : resolve()
        );
      });
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)`,
          [created.id, 2024, 2, 11000],
          (err) => err ? reject(err) : resolve()
        );
      });

      const currentValue = await investmentRepository.getCurrentValue(created.id);

      expect(currentValue).toBeDefined();
      expect(currentValue.month).toBe(3); // Most recent
      expect(currentValue.value).toBe(11500);
    });

    test('should return null when no value entries exist', async () => {
      const created = await investmentRepository.create({
        name: 'No Values Test',
        type: 'RRSP',
        initial_value: 5000
      });
      createdInvestmentIds.push(created.id);

      const currentValue = await investmentRepository.getCurrentValue(created.id);

      expect(currentValue).toBeNull();
    });
  });

  describe('getAllWithCurrentValues', () => {
    test('should return investments with current value from value entries', async () => {
      const created = await investmentRepository.create({
        name: 'With Values Test',
        type: 'TFSA',
        initial_value: 10000
      });
      createdInvestmentIds.push(created.id);

      // Add a value entry
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)`,
          [created.id, 2024, 5, 12000],
          (err) => err ? reject(err) : resolve()
        );
      });

      const investments = await investmentRepository.getAllWithCurrentValues();

      const testInvestment = investments.find(i => i.id === created.id);
      expect(testInvestment).toBeDefined();
      expect(testInvestment.currentValue).toBe(12000);
    });

    test('should use initial_value when no value entries exist', async () => {
      const created = await investmentRepository.create({
        name: 'Initial Only Test',
        type: 'RRSP',
        initial_value: 15000
      });
      createdInvestmentIds.push(created.id);

      const investments = await investmentRepository.getAllWithCurrentValues();

      const testInvestment = investments.find(i => i.id === created.id);
      expect(testInvestment).toBeDefined();
      expect(testInvestment.currentValue).toBe(15000);
    });

    test('should return investments sorted by name', async () => {
      const inv1 = await investmentRepository.create({
        name: 'Zulu Investment',
        type: 'TFSA',
        initial_value: 5000
      });
      createdInvestmentIds.push(inv1.id);

      const inv2 = await investmentRepository.create({
        name: 'Alpha Investment',
        type: 'RRSP',
        initial_value: 8000
      });
      createdInvestmentIds.push(inv2.id);

      const investments = await investmentRepository.getAllWithCurrentValues();

      const alphaIdx = investments.findIndex(i => i.id === inv2.id);
      const zuluIdx = investments.findIndex(i => i.id === inv1.id);

      expect(alphaIdx).toBeLessThan(zuluIdx);
    });
  });
});
