const { getDatabase } = require('../database/db');
const investmentService = require('./investmentService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Investment Activity Logging
 * 
 * Feature: activity-log, Property 4: Entity CRUD Event Tracking (investment portion)
 * 
 * These tests verify that investment CRUD operations correctly log activity events:
 * - Creating investments logs "investment_added" events
 * - Updating investments logs "investment_updated" events
 * - Deleting investments logs "investment_deleted" events
 * - Events include correct metadata (name, account_type)
 * 
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */

describe('Investment Activity Logging - Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'investment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test investments
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM investments WHERE name LIKE 'Test%'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  afterEach(async () => {
    // Clean up test data after each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'investment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test investments
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM investments WHERE name LIKE 'Test%'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Investment Creation Event Logging', () => {
    it('should log investment_added event when creating an investment', async () => {
      // Arrange
      const investmentData = {
        name: 'Test TFSA Account',
        type: 'TFSA',
        initial_value: 5000.00
      };

      // Act
      const createdInvestment = await investmentService.createInvestment(investmentData);

      // Assert - Verify investment was created
      expect(createdInvestment).toBeDefined();
      expect(createdInvestment.id).toBeDefined();

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const investmentEvent = events.find(e => 
        e.event_type === 'investment_added' && 
        e.entity_id === createdInvestment.id
      );

      expect(investmentEvent).toBeDefined();
      expect(investmentEvent.entity_type).toBe('investment');
      expect(investmentEvent.user_action).toContain('Added investment');
      expect(investmentEvent.user_action).toContain('Test TFSA Account');

      // Assert - Verify metadata
      const metadata = JSON.parse(investmentEvent.metadata);
      expect(metadata.name).toBe('Test TFSA Account');
      expect(metadata.account_type).toBe('TFSA');
    });

    it('should log investment_added event for RRSP account', async () => {
      // Arrange
      const investmentData = {
        name: 'Test RRSP Account',
        type: 'RRSP',
        initial_value: 10000.00
      };

      // Act
      const createdInvestment = await investmentService.createInvestment(investmentData);

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const investmentEvent = events.find(e => 
        e.event_type === 'investment_added' && 
        e.entity_id === createdInvestment.id
      );

      expect(investmentEvent).toBeDefined();
      expect(investmentEvent.user_action).toContain('Test RRSP Account');

      const metadata = JSON.parse(investmentEvent.metadata);
      expect(metadata.name).toBe('Test RRSP Account');
      expect(metadata.account_type).toBe('RRSP');
    });
  });

  describe('Investment Update Event Logging', () => {
    it('should log investment_updated event when updating an investment', async () => {
      // Arrange - Create an investment first
      const investmentData = {
        name: 'Test Original Name',
        type: 'TFSA',
        initial_value: 3000.00
      };
      const createdInvestment = await investmentService.createInvestment(investmentData);

      // Clear activity logs to isolate update event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'investment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update the investment
      const updateData = {
        name: 'Test Updated Name',
        type: 'RRSP'
      };
      await investmentService.updateInvestment(createdInvestment.id, updateData);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const investmentEvent = events.find(e => 
        e.event_type === 'investment_updated' && 
        e.entity_id === createdInvestment.id
      );

      expect(investmentEvent).toBeDefined();
      expect(investmentEvent.entity_type).toBe('investment');
      expect(investmentEvent.user_action).toContain('Updated investment');
      expect(investmentEvent.user_action).toContain('Test Updated Name');

      // Assert - Verify metadata reflects updated values
      const metadata = JSON.parse(investmentEvent.metadata);
      expect(metadata.name).toBe('Test Updated Name');
      expect(metadata.account_type).toBe('RRSP');
    });

    it('should not log event when updating non-existent investment', async () => {
      // Arrange
      const nonExistentId = 999999;
      const updateData = {
        name: 'Test Name',
        type: 'TFSA'
      };

      // Act
      const result = await investmentService.updateInvestment(nonExistentId, updateData);

      // Assert
      expect(result).toBeNull();

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const investmentEvent = events.find(e => 
        e.event_type === 'investment_updated' && 
        e.entity_id === nonExistentId
      );

      expect(investmentEvent).toBeUndefined();
    });
  });

  describe('Investment Deletion Event Logging', () => {
    it('should log investment_deleted event when deleting an investment', async () => {
      // Arrange - Create an investment first
      const investmentData = {
        name: 'Test Delete Account',
        type: 'TFSA',
        initial_value: 2500.00
      };
      const createdInvestment = await investmentService.createInvestment(investmentData);

      // Clear activity logs to isolate delete event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'investment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Delete the investment
      const deleted = await investmentService.deleteInvestment(createdInvestment.id);

      // Assert - Verify deletion was successful
      expect(deleted).toBe(true);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const investmentEvent = events.find(e => 
        e.event_type === 'investment_deleted' && 
        e.entity_id === createdInvestment.id
      );

      expect(investmentEvent).toBeDefined();
      expect(investmentEvent.entity_type).toBe('investment');
      expect(investmentEvent.user_action).toContain('Deleted investment');
      expect(investmentEvent.user_action).toContain('Test Delete Account');

      // Assert - Verify metadata
      const metadata = JSON.parse(investmentEvent.metadata);
      expect(metadata.name).toBe('Test Delete Account');
      expect(metadata.account_type).toBe('TFSA');
    });

    it('should not log event when deleting non-existent investment', async () => {
      // Arrange
      const nonExistentId = 999999;

      // Act
      const deleted = await investmentService.deleteInvestment(nonExistentId);

      // Assert
      expect(deleted).toBe(false);

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const investmentEvent = events.find(e => 
        e.event_type === 'investment_deleted' && 
        e.entity_id === nonExistentId
      );

      expect(investmentEvent).toBeUndefined();
    });
  });

  describe('Property 4: Entity CRUD Event Tracking (PBT)', () => {
    it('should log correct events for any investment CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0).map(s => `Test ${s}`),
            type: fc.constantFrom('TFSA', 'RRSP'),
            initial_value: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          async (operation, investmentData) => {
            // Clean up before test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'investment'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            let investmentId;
            let expectedEventType;

            // Perform the operation
            if (operation === 'create') {
              const investment = await investmentService.createInvestment({
                name: investmentData.name,
                type: investmentData.type,
                initial_value: investmentData.initial_value
              });
              investmentId = investment.id;
              expectedEventType = 'investment_added';
            } else if (operation === 'update') {
              // Create investment first
              const investment = await investmentService.createInvestment({
                name: 'Test Original',
                type: 'TFSA',
                initial_value: 1000.00
              });
              investmentId = investment.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'investment'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Update investment
              await investmentService.updateInvestment(investmentId, {
                name: investmentData.name,
                type: investmentData.type
              });
              expectedEventType = 'investment_updated';
            } else { // delete
              // Create investment first
              const investment = await investmentService.createInvestment({
                name: investmentData.name,
                type: investmentData.type,
                initial_value: investmentData.initial_value
              });
              investmentId = investment.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'investment'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Delete investment
              await investmentService.deleteInvestment(investmentId);
              expectedEventType = 'investment_deleted';
            }

            // Retrieve the logged event
            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => 
              e.event_type === expectedEventType && 
              e.entity_id === investmentId
            );

            // Verify event properties
            expect(event).toBeDefined();
            expect(event.entity_type).toBe('investment');
            expect(event.user_action).toBeTruthy();
            
            const metadata = JSON.parse(event.metadata);
            expect(metadata.name).toBe(investmentData.name.trim());
            expect(metadata.account_type).toBe(investmentData.type);
          }
        ),
        { numRuns: 20 } // Reduced runs for integration test performance
      );
    });
  });
});
