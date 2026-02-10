const { getDatabase } = require('../database/db');
const loanService = require('./loanService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Loan Activity Logging
 * 
 * Feature: activity-log, Property 4: Entity CRUD Event Tracking (loan portion)
 * 
 * These tests verify that loan CRUD operations correctly log activity events:
 * - Creating loans logs "loan_added" events
 * - Updating loans logs "loan_updated" events
 * - Deleting loans logs "loan_deleted" events
 * - Events include correct metadata (loan name, loan type)
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */

describe('Loan Activity Logging - Integration Tests', () => {
  let db;
  const testYear = 2096; // Use future year to avoid conflicts

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test loans
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM loans WHERE strftime('%Y', start_date) = '${testYear}'`, (err) => {
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
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test loans
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM loans WHERE strftime('%Y', start_date) = '${testYear}'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Loan Creation Event Logging', () => {
    it('should log loan_added event when creating a loan', async () => {
      // Arrange
      const loanData = {
        name: 'Test Car Loan',
        initial_balance: 15000.00,
        start_date: `${testYear}-01-15`,
        loan_type: 'loan',
        notes: 'Test loan for activity logging'
      };

      // Act
      const createdLoan = await loanService.createLoan(loanData);

      // Assert - Verify loan was created
      expect(createdLoan).toBeDefined();
      expect(createdLoan.id).toBeDefined();

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const loanEvent = events.find(e => 
        e.event_type === 'loan_added' && 
        e.entity_id === createdLoan.id
      );

      expect(loanEvent).toBeDefined();
      expect(loanEvent.entity_type).toBe('loan');
      expect(loanEvent.user_action).toContain('Added loan');
      expect(loanEvent.user_action).toContain('Test Car Loan');

      // Assert - Verify metadata
      const metadata = JSON.parse(loanEvent.metadata);
      expect(metadata.name).toBe('Test Car Loan');
      expect(metadata.loan_type).toBe('loan');
    });

    it('should log loan_added event when creating a line of credit', async () => {
      // Arrange
      const loanData = {
        name: 'Test Line of Credit',
        initial_balance: 5000.00,
        start_date: `${testYear}-02-01`,
        loan_type: 'line_of_credit',
        notes: 'Test LOC'
      };

      // Act
      const createdLoan = await loanService.createLoan(loanData);

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const loanEvent = events.find(e => 
        e.event_type === 'loan_added' && 
        e.entity_id === createdLoan.id
      );

      expect(loanEvent).toBeDefined();
      const metadata = JSON.parse(loanEvent.metadata);
      expect(metadata.name).toBe('Test Line of Credit');
      expect(metadata.loan_type).toBe('line_of_credit');
    });

    it('should log loan_added event when creating a mortgage', async () => {
      // Arrange
      const mortgageData = {
        name: 'Test Mortgage',
        initial_balance: 300000.00,
        start_date: `${testYear}-03-01`,
        amortization_period: 25, // years
        term_length: 5, // years
        renewal_date: `${testYear + 5}-03-01`,
        rate_type: 'variable',
        payment_frequency: 'monthly',
        estimated_property_value: 400000.00
      };

      // Act
      const createdMortgage = await loanService.createMortgage(mortgageData);

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const loanEvent = events.find(e => 
        e.event_type === 'loan_added' && 
        e.entity_id === createdMortgage.id
      );

      expect(loanEvent).toBeDefined();
      const metadata = JSON.parse(loanEvent.metadata);
      expect(metadata.name).toBe('Test Mortgage');
      expect(metadata.loan_type).toBe('mortgage');
    });
  });

  describe('Loan Update Event Logging', () => {
    it('should log loan_updated event when updating a loan', async () => {
      // Arrange - Create a loan first
      const loanData = {
        name: 'Original Loan Name',
        initial_balance: 10000.00,
        start_date: `${testYear}-04-01`,
        loan_type: 'loan'
      };
      const createdLoan = await loanService.createLoan(loanData);

      // Clear activity logs to isolate update event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update the loan
      const updateData = {
        name: 'Updated Loan Name',
        notes: 'Updated notes'
      };
      await loanService.updateLoan(createdLoan.id, updateData);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const loanEvent = events.find(e => 
        e.event_type === 'loan_updated' && 
        e.entity_id === createdLoan.id
      );

      expect(loanEvent).toBeDefined();
      expect(loanEvent.entity_type).toBe('loan');
      expect(loanEvent.user_action).toContain('Updated loan');
      expect(loanEvent.user_action).toContain('Updated Loan Name');

      // Assert - Verify metadata reflects updated values
      const metadata = JSON.parse(loanEvent.metadata);
      expect(metadata.name).toBe('Updated Loan Name');
      expect(metadata.loan_type).toBe('loan');
    });

    it('should log loan_updated event when updating a mortgage', async () => {
      // Arrange - Create a mortgage first
      const mortgageData = {
        name: 'Original Mortgage',
        initial_balance: 250000.00,
        start_date: `${testYear}-05-01`,
        amortization_period: 25, // years
        term_length: 5, // years
        renewal_date: `${testYear + 5}-05-01`,
        rate_type: 'fixed',
        payment_frequency: 'monthly'
      };
      const createdMortgage = await loanService.createMortgage(mortgageData);

      // Clear activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update the mortgage
      const updateData = {
        name: 'Updated Mortgage',
        estimated_property_value: 350000.00
      };
      await loanService.updateMortgage(createdMortgage.id, updateData);

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const loanEvent = events.find(e => 
        e.event_type === 'loan_updated' && 
        e.entity_id === createdMortgage.id
      );

      expect(loanEvent).toBeDefined();
      const metadata = JSON.parse(loanEvent.metadata);
      expect(metadata.name).toBe('Updated Mortgage');
      expect(metadata.loan_type).toBe('mortgage');
    });

    it('should not log event when updating non-existent loan', async () => {
      // Arrange
      const nonExistentId = 999999;

      // Act
      const updated = await loanService.updateLoan(nonExistentId, { name: 'Test' });

      // Assert
      expect(updated).toBeNull();

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const loanEvent = events.find(e => 
        e.event_type === 'loan_updated' && 
        e.entity_id === nonExistentId
      );

      expect(loanEvent).toBeUndefined();
    });
  });

  describe('Loan Deletion Event Logging', () => {
    it('should log loan_deleted event when deleting a loan', async () => {
      // Arrange - Create a loan first
      const loanData = {
        name: 'Loan to Delete',
        initial_balance: 8000.00,
        start_date: `${testYear}-06-01`,
        loan_type: 'loan'
      };
      const createdLoan = await loanService.createLoan(loanData);

      // Clear activity logs to isolate delete event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Delete the loan
      const deleted = await loanService.deleteLoan(createdLoan.id);

      // Assert - Verify deletion was successful
      expect(deleted).toBe(true);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const loanEvent = events.find(e => 
        e.event_type === 'loan_deleted' && 
        e.entity_id === createdLoan.id
      );

      expect(loanEvent).toBeDefined();
      expect(loanEvent.entity_type).toBe('loan');
      expect(loanEvent.user_action).toContain('Deleted loan');
      expect(loanEvent.user_action).toContain('Loan to Delete');

      // Assert - Verify metadata
      const metadata = JSON.parse(loanEvent.metadata);
      expect(metadata.name).toBe('Loan to Delete');
      expect(metadata.loan_type).toBe('loan');
    });

    it('should not log event when deleting non-existent loan', async () => {
      // Arrange
      const nonExistentId = 999999;

      // Act
      const deleted = await loanService.deleteLoan(nonExistentId);

      // Assert
      expect(deleted).toBe(false);

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const loanEvent = events.find(e => 
        e.event_type === 'loan_deleted' && 
        e.entity_id === nonExistentId
      );

      expect(loanEvent).toBeUndefined();
    });
  });

  describe('Property 4: Entity CRUD Event Tracking (PBT)', () => {
    it('should log correct events for any loan CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.constantFrom('loan', 'line_of_credit'),
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            initial_balance: fc.double({ min: 100, max: 50000, noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          async (operation, loanType, loanData) => {
            // Clean up before test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            let loanId;
            let expectedEventType;
            let expectedName = loanData.name.trim();

            // Perform the operation
            if (operation === 'create') {
              const loan = await loanService.createLoan({
                name: expectedName,
                initial_balance: loanData.initial_balance,
                start_date: `${testYear}-07-01`,
                loan_type: loanType
              });
              loanId = loan.id;
              expectedEventType = 'loan_added';
            } else if (operation === 'update') {
              // Create loan first
              const loan = await loanService.createLoan({
                name: 'Original Name',
                initial_balance: 5000.00,
                start_date: `${testYear}-07-01`,
                loan_type: loanType
              });
              loanId = loan.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Update loan
              await loanService.updateLoan(loanId, {
                name: expectedName
              });
              expectedEventType = 'loan_updated';
            } else { // delete
              // Create loan first
              const loan = await loanService.createLoan({
                name: expectedName,
                initial_balance: loanData.initial_balance,
                start_date: `${testYear}-07-01`,
                loan_type: loanType
              });
              loanId = loan.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Delete loan
              await loanService.deleteLoan(loanId);
              expectedEventType = 'loan_deleted';
            }

            // Retrieve the logged event
            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => 
              e.event_type === expectedEventType && 
              e.entity_id === loanId
            );

            // Verify event properties
            expect(event).toBeDefined();
            expect(event.entity_type).toBe('loan');
            expect(event.user_action).toBeTruthy();
            expect(event.user_action).toContain(expectedName);
            
            const metadata = JSON.parse(event.metadata);
            expect(metadata.name).toBe(expectedName);
            expect(metadata.loan_type).toBe(loanType);
          }
        ),
        { numRuns: 20 } // Reduced runs for integration test performance
      );
    });
  });
});
