const { getDatabase } = require('../database/db');
const investmentService = require('./investmentService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Investment Service Metadata Improvements
 *
 * Feature: activity-log-coverage, Property 13: Investment metadata completeness
 *
 * **Validates: Requirements 11.1, 11.2**
 */

const ENTITY_TYPE = 'investment';

describe('Investment Service Metadata Improvements - Integration Tests', () => {
  let db;

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    await runSql(db, `DELETE FROM investments WHERE name LIKE 'MetaTest%'`);
  }

  beforeAll(async () => { db = await getDatabase(); });
  beforeEach(() => resetTestState());
  afterEach(() => resetTestState());

  describe('Create Investment Metadata Enrichment', () => {
    it('should include initial_value in createInvestment metadata for TFSA', async () => {
      const investment = await investmentService.createInvestment({
        name: 'MetaTest TFSA Account', type: 'TFSA', initial_value: 5000.00
      });

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'investment_added', investment.id);

      expect(event).toBeDefined();
      expect(metadata.initial_value).toBe(5000.00);
      expect(metadata.name).toBe('MetaTest TFSA Account');
      expect(metadata.account_type).toBe('TFSA');
    });

    it('should include initial_value in createInvestment metadata for RRSP', async () => {
      const investment = await investmentService.createInvestment({
        name: 'MetaTest RRSP Account', type: 'RRSP', initial_value: 12500.50
      });

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'investment_added', investment.id);

      expect(event).toBeDefined();
      expect(metadata.initial_value).toBe(12500.50);
      expect(metadata.name).toBe('MetaTest RRSP Account');
      expect(metadata.account_type).toBe('RRSP');
    });
  });

  describe('Delete Investment Metadata Enrichment', () => {
    it('should include initial_value in deleteInvestment metadata', async () => {
      const investment = await investmentService.createInvestment({
        name: 'MetaTest Delete Account', type: 'TFSA', initial_value: 7500.25
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      await investmentService.deleteInvestment(investment.id);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'investment_deleted', investment.id);

      expect(event).toBeDefined();
      expect(metadata.initial_value).toBe(7500.25);
      expect(metadata.name).toBe('MetaTest Delete Account');
      expect(metadata.account_type).toBe('TFSA');
    });
  });

  describe('Property 13: Investment metadata completeness (PBT)', () => {
    /**
     * **Validates: Requirements 11.1, 11.2**
     */
    it('should include initial_value in metadata for any investment create/delete', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'delete'),
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0).map(s => `MetaTest ${s}`),
            type: fc.constantFrom('TFSA', 'RRSP'),
            initial_value: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          async (operation, data) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

            let investmentId;
            let expectedEventType;

            if (operation === 'create') {
              const investment = await investmentService.createInvestment({
                name: data.name, type: data.type, initial_value: data.initial_value
              });
              investmentId = investment.id;
              expectedEventType = 'investment_added';
            } else {
              const investment = await investmentService.createInvestment({
                name: data.name, type: data.type, initial_value: data.initial_value
              });
              investmentId = investment.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await investmentService.deleteInvestment(investmentId);
              expectedEventType = 'investment_deleted';
            }

            const events = await activityLogRepository.findRecent(10, 0);
            const { event, metadata } = findEventWithMetadata(events, expectedEventType, investmentId);

            expect(event).toBeDefined();
            expect(metadata.initial_value).toBe(data.initial_value);
            expect(metadata.name).toBe(data.name.trim());
            expect(metadata.account_type).toBe(data.type);
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });
  });
});
