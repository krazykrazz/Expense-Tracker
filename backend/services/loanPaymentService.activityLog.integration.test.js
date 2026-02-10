const { getDatabase } = require('../database/db');
const loanPaymentService = require('./loanPaymentService');
const loanService = require('./loanService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Loan Payment Activity Logging
 * 
 * Feature: activity-log, Property 4: Entity CRUD Event Tracking (loan_payment portion)
 * 
 * These tests verify that loan payment CRUD operations correctly log activity events:
 * - Creating loan payments logs "loan_payment_added" events
 * - Updating loan payments logs "loan_payment_updated" events
 * - Deleting loan payments logs "loan_payment_deleted" events
 * - Events include correct metadata (loan name, payment amount)
 * 
 * Validates: Requirements 6C.1, 6C.2, 6C.3, 6C.4, 6C.5
 */

describe('Loan Payment Activity Logging - Integration Tests', () => {
  let db;
  const testYear = 2020; // Use past year to avoid future date validation
  let testLoanId;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test loan payments
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM loan_payments WHERE strftime('%Y', payment_date) = '${testYear}'`, (err) => {
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

      // Create a test loan for payments
      const loan = await loanService.createLoan({
        name: 'Test Payment Loan',
        initial_balance: 20000.00,
        start_date: `${testYear}-01-01`,
        loan_type: 'loan'
      });
      testLoanId = loan.id;

      // Clear activity logs after loan creation
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test setup warning:', error.message);
    }
  });

  afterEach(async () => {
    // Clean up test data after each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test loan payments
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM loan_payments WHERE strftime('%Y', payment_date) = '${testYear}'`, (err) => {
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

  describe('Loan Payment Creation Event Logging', () => {
    it('should log loan_payment_added event when creating a payment', async () => {
      // Arrange
      const paymentData = {
        amount: 500.00,
        payment_date: `${testYear}-02-15`,
        notes: 'Test payment'
      };

      // Act
      const createdPayment = await loanPaymentService.createPayment(testLoanId, paymentData);

      // Assert - Verify payment was created
      expect(createdPayment).toBeDefined();
      expect(createdPayment.id).toBeDefined();

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentEvent = events.find(e => 
        e.event_type === 'loan_payment_added' && 
        e.entity_id === createdPayment.id
      );

      expect(paymentEvent).toBeDefined();
      expect(paymentEvent.entity_type).toBe('loan_payment');
      expect(paymentEvent.user_action).toContain('Added loan payment');
      expect(paymentEvent.user_action).toContain('Test Payment Loan');
      expect(paymentEvent.user_action).toContain('$500.00');

      // Assert - Verify metadata
      const metadata = JSON.parse(paymentEvent.metadata);
      expect(metadata.loanName).toBe('Test Payment Loan');
      expect(metadata.amount).toBe(500.00);
      expect(metadata.paymentDate).toBe(`${testYear}-02-15`);
    });

    it('should log loan_payment_added event with correct loan name', async () => {
      // Arrange - Create another loan with different name
      const anotherLoan = await loanService.createLoan({
        name: 'Another Test Loan',
        initial_balance: 15000.00,
        start_date: `${testYear}-01-01`,
        loan_type: 'loan'
      });

      // Clear activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const paymentData = {
        amount: 750.50,
        payment_date: `${testYear}-03-01`
      };

      // Act
      const createdPayment = await loanPaymentService.createPayment(anotherLoan.id, paymentData);

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentEvent = events.find(e => 
        e.event_type === 'loan_payment_added' && 
        e.entity_id === createdPayment.id
      );

      expect(paymentEvent).toBeDefined();
      expect(paymentEvent.user_action).toContain('Another Test Loan');
      
      const metadata = JSON.parse(paymentEvent.metadata);
      expect(metadata.loanName).toBe('Another Test Loan');
      expect(metadata.amount).toBe(750.50);
    });
  });

  describe('Loan Payment Update Event Logging', () => {
    it('should log loan_payment_updated event when updating a payment', async () => {
      // Arrange - Create a payment first
      const paymentData = {
        amount: 400.00,
        payment_date: `${testYear}-04-01`,
        notes: 'Original payment'
      };
      const createdPayment = await loanPaymentService.createPayment(testLoanId, paymentData);

      // Clear activity logs to isolate update event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update the payment
      const updateData = {
        amount: 450.00,
        payment_date: `${testYear}-04-01`,
        notes: 'Updated payment'
      };
      await loanPaymentService.updatePayment(createdPayment.id, updateData);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentEvent = events.find(e => 
        e.event_type === 'loan_payment_updated' && 
        e.entity_id === createdPayment.id
      );

      expect(paymentEvent).toBeDefined();
      expect(paymentEvent.entity_type).toBe('loan_payment');
      expect(paymentEvent.user_action).toContain('Updated loan payment');
      expect(paymentEvent.user_action).toContain('Test Payment Loan');
      expect(paymentEvent.user_action).toContain('$450.00');

      // Assert - Verify metadata reflects updated values
      const metadata = JSON.parse(paymentEvent.metadata);
      expect(metadata.loanName).toBe('Test Payment Loan');
      expect(metadata.amount).toBe(450.00);
      expect(metadata.paymentDate).toBe(`${testYear}-04-01`);
    });

    it('should not log event when updating non-existent payment', async () => {
      // Arrange
      const nonExistentId = 999999;

      // Act
      const updated = await loanPaymentService.updatePayment(nonExistentId, {
        amount: 100.00,
        payment_date: `${testYear}-05-01`
      });

      // Assert
      expect(updated).toBeNull();

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentEvent = events.find(e => 
        e.event_type === 'loan_payment_updated' && 
        e.entity_id === nonExistentId
      );

      expect(paymentEvent).toBeUndefined();
    });
  });

  describe('Loan Payment Deletion Event Logging', () => {
    it('should log loan_payment_deleted event when deleting a payment', async () => {
      // Arrange - Create a payment first
      const paymentData = {
        amount: 600.00,
        payment_date: `${testYear}-06-01`,
        notes: 'Payment to delete'
      };
      const createdPayment = await loanPaymentService.createPayment(testLoanId, paymentData);

      // Clear activity logs to isolate delete event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Delete the payment
      const deleted = await loanPaymentService.deletePayment(createdPayment.id);

      // Assert - Verify deletion was successful
      expect(deleted).toBe(true);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentEvent = events.find(e => 
        e.event_type === 'loan_payment_deleted' && 
        e.entity_id === createdPayment.id
      );

      expect(paymentEvent).toBeDefined();
      expect(paymentEvent.entity_type).toBe('loan_payment');
      expect(paymentEvent.user_action).toContain('Deleted loan payment');
      expect(paymentEvent.user_action).toContain('Test Payment Loan');
      expect(paymentEvent.user_action).toContain('$600.00');

      // Assert - Verify metadata
      const metadata = JSON.parse(paymentEvent.metadata);
      expect(metadata.loanName).toBe('Test Payment Loan');
      expect(metadata.amount).toBe(600.00);
      expect(metadata.paymentDate).toBe(`${testYear}-06-01`);
    });

    it('should not log event when deleting non-existent payment', async () => {
      // Arrange
      const nonExistentId = 999999;

      // Act
      const deleted = await loanPaymentService.deletePayment(nonExistentId);

      // Assert
      expect(deleted).toBe(false);

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentEvent = events.find(e => 
        e.event_type === 'loan_payment_deleted' && 
        e.entity_id === nonExistentId
      );

      expect(paymentEvent).toBeUndefined();
    });
  });

  describe('Property 4: Entity CRUD Event Tracking (PBT)', () => {
    it('should log correct events for any loan payment CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({
            amount: fc.double({ min: 50, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            day: fc.integer({ min: 1, max: 28 })
          }),
          async (operation, paymentData) => {
            // Clean up before test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            let paymentId;
            let expectedEventType;
            const paymentDate = `${testYear}-07-${String(paymentData.day).padStart(2, '0')}`;

            // Perform the operation
            if (operation === 'create') {
              const payment = await loanPaymentService.createPayment(testLoanId, {
                amount: paymentData.amount,
                payment_date: paymentDate
              });
              paymentId = payment.id;
              expectedEventType = 'loan_payment_added';
            } else if (operation === 'update') {
              // Create payment first
              const payment = await loanPaymentService.createPayment(testLoanId, {
                amount: 100.00,
                payment_date: paymentDate
              });
              paymentId = payment.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Update payment
              await loanPaymentService.updatePayment(paymentId, {
                amount: paymentData.amount,
                payment_date: paymentDate
              });
              expectedEventType = 'loan_payment_updated';
            } else { // delete
              // Create payment first
              const payment = await loanPaymentService.createPayment(testLoanId, {
                amount: paymentData.amount,
                payment_date: paymentDate
              });
              paymentId = payment.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'loan_payment'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Delete payment
              await loanPaymentService.deletePayment(paymentId);
              expectedEventType = 'loan_payment_deleted';
            }

            // Retrieve the logged event
            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => 
              e.event_type === expectedEventType && 
              e.entity_id === paymentId
            );

            // Verify event properties
            expect(event).toBeDefined();
            expect(event.entity_type).toBe('loan_payment');
            expect(event.user_action).toBeTruthy();
            expect(event.user_action).toContain('Test Payment Loan');
            
            const metadata = JSON.parse(event.metadata);
            expect(metadata.loanName).toBe('Test Payment Loan');
            expect(metadata.amount).toBe(paymentData.amount);
            expect(metadata.paymentDate).toBe(paymentDate);
          }
        ),
        { numRuns: 20 } // Reduced runs for integration test performance
      );
    });
  });
});
