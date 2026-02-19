const { getDatabase } = require('../database/db');
const billingCycleController = require('./billingCycleController');
const activityLogRepository = require('../repositories/activityLogRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const billingCycleRepository = require('../repositories/billingCycleRepository');

/**
 * Integration Tests for Billing Cycle Activity Logging
 * 
 * Feature: credit-card-billing-fixes, Property 4: Billing cycle CRUD operations produce activity log entries
 * 
 * These tests verify that billing cycle create, update, and delete operations
 * correctly log activity events with proper event_type, entity_type, entity_id,
 * user_action, and metadata fields.
 * 
 * Validates: Requirements 3.1, 3.2, 3.3
 */

describe('Billing Cycle Activity Logging - Integration Tests', () => {
  let db;
  let testPaymentMethod;

  // Helper to create mock Express req/res
  function createMockReqRes(params = {}, body = {}) {
    const req = {
      params,
      body,
      file: null
    };
    const res = {
      statusCode: null,
      responseBody: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.responseBody = data;
        return this;
      }
    };
    return { req, res };
  }

  // Helper to clean activity logs for billing_cycle entity type
  async function cleanActivityLogs() {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM activity_logs WHERE entity_type = 'billing_cycle'`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Helper to clean test billing cycles
  async function cleanBillingCycles() {
    if (testPaymentMethod) {
      return new Promise((resolve, reject) => {
        db.run(`DELETE FROM credit_card_billing_cycles WHERE payment_method_id = ?`, [testPaymentMethod.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Helper to clean test payment method
  async function cleanPaymentMethod() {
    if (testPaymentMethod) {
      return new Promise((resolve, reject) => {
        db.run(`DELETE FROM payment_methods WHERE id = ?`, [testPaymentMethod.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    await cleanActivityLogs();
    await cleanBillingCycles();
    await cleanPaymentMethod();

    // Create a test credit card payment method with billing_cycle_day
    testPaymentMethod = await paymentMethodRepository.create({
      type: 'credit_card',
      display_name: 'Test Visa',
      full_name: 'Test Visa Card',
      credit_limit: 5000,
      current_balance: 200,
      payment_due_day: 15,
      billing_cycle_day: 20,
      is_active: 1
    });
  });

  afterEach(async () => {
    await cleanActivityLogs();
    await cleanBillingCycles();
    await cleanPaymentMethod();
  });

  describe('Create Billing Cycle - Activity Log (Requirement 3.1)', () => {
    it('should log billing_cycle_created event when creating a billing cycle', async () => {
      // Arrange
      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        { actual_statement_balance: 150.75 }
      );

      // Act
      await billingCycleController.createBillingCycle(req, res);

      // Assert - controller returned success
      expect(res.statusCode).toBe(201);
      expect(res.responseBody.success).toBe(true);
      const createdCycle = res.responseBody.billingCycle;

      // Allow async activity logging to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert - activity log entry exists
      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'billing_cycle_created' &&
        e.entity_id === createdCycle.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.entity_type).toBe('billing_cycle');
      expect(logEvent.user_action).toContain('Test Visa');
      expect(logEvent.user_action).toContain('statement balance of $150.75');
      expect(logEvent.user_action).toContain('discrepancy');

      // Verify metadata
      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.paymentMethodName).toBe('Test Visa');
      expect(metadata.cycleStartDate).toBeDefined();
      expect(metadata.cycleEndDate).toBeDefined();
      expect(metadata.actualStatementBalance).toBe(150.75);
      expect(metadata.calculatedStatementBalance).toBeDefined();
      expect(metadata).toHaveProperty('discrepancyAmount');
    });

    it('should include cycle dates in the user_action string', async () => {
      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        { actual_statement_balance: 200 }
      );

      await billingCycleController.createBillingCycle(req, res);
      expect(res.statusCode).toBe(201);

      const createdCycle = res.responseBody.billingCycle;
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'billing_cycle_created' &&
        e.entity_id === createdCycle.id
      );

      expect(logEvent).toBeDefined();
      // user_action should contain the cycle dates
      expect(logEvent.user_action).toContain(createdCycle.cycle_start_date);
      expect(logEvent.user_action).toContain(createdCycle.cycle_end_date);
    });
  });

  describe('Update Billing Cycle - Activity Log (Requirement 3.2)', () => {
    it('should log billing_cycle_updated event when updating a billing cycle', async () => {
      // Arrange - create a billing cycle first
      const { req: createReq, res: createRes } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        { actual_statement_balance: 100 }
      );
      await billingCycleController.createBillingCycle(createReq, createRes);
      expect(createRes.statusCode).toBe(201);
      const createdCycle = createRes.responseBody.billingCycle;

      // Clear activity logs to isolate update event
      await cleanActivityLogs();

      // Act - update the billing cycle
      const { req: updateReq, res: updateRes } = createMockReqRes(
        { id: String(testPaymentMethod.id), cycleId: String(createdCycle.id) },
        { actual_statement_balance: 175.50 }
      );
      await billingCycleController.updateBillingCycle(updateReq, updateRes);

      // Assert - controller returned success
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.responseBody.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert - activity log entry exists
      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'billing_cycle_updated' &&
        e.entity_id === createdCycle.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.entity_type).toBe('billing_cycle');
      expect(logEvent.user_action).toContain('Updated billing cycle');
      expect(logEvent.user_action).toContain('Test Visa');

      // Verify metadata (service logs with cardName and changes array)
      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.cardName).toBe('Test Visa');
      expect(metadata.cycleEndDate).toBeDefined();
      expect(Array.isArray(metadata.changes)).toBe(true);
      const balanceChange = metadata.changes.find(c => c.field === 'actual_statement_balance');
      expect(balanceChange).toBeDefined();
      expect(balanceChange.from).toBe(100);
      expect(balanceChange.to).toBe(175.50);
    });

    it('should track changed fields in metadata', async () => {
      // Create a billing cycle
      const { req: createReq, res: createRes } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        { actual_statement_balance: 100 }
      );
      await billingCycleController.createBillingCycle(createReq, createRes);
      const createdCycle = createRes.responseBody.billingCycle;

      await cleanActivityLogs();

      // Update with multiple fields
      const { req: updateReq, res: updateRes } = createMockReqRes(
        { id: String(testPaymentMethod.id), cycleId: String(createdCycle.id) },
        { actual_statement_balance: 250, minimum_payment: 25, notes: 'Updated notes' }
      );
      await billingCycleController.updateBillingCycle(updateReq, updateRes);
      expect(updateRes.statusCode).toBe(200);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'billing_cycle_updated' &&
        e.entity_id === createdCycle.id
      );

      const metadata = JSON.parse(logEvent.metadata);
      expect(Array.isArray(metadata.changes)).toBe(true);
      expect(metadata.changes.some(c => c.field === 'actual_statement_balance')).toBe(true);
      expect(metadata.changes.some(c => c.field === 'minimum_payment')).toBe(true);
      expect(metadata.changes.some(c => c.field === 'notes')).toBe(true);
    });
  });

  describe('Delete Billing Cycle - Activity Log (Requirement 3.3)', () => {
    it('should log billing_cycle_deleted event when deleting a billing cycle', async () => {
      // Arrange - create a billing cycle first
      const { req: createReq, res: createRes } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        { actual_statement_balance: 300.25 }
      );
      await billingCycleController.createBillingCycle(createReq, createRes);
      expect(createRes.statusCode).toBe(201);
      const createdCycle = createRes.responseBody.billingCycle;

      // Clear activity logs to isolate delete event
      await cleanActivityLogs();

      // Act - delete the billing cycle
      const { req: deleteReq, res: deleteRes } = createMockReqRes(
        { id: String(testPaymentMethod.id), cycleId: String(createdCycle.id) }
      );
      await billingCycleController.deleteBillingCycle(deleteReq, deleteRes);

      // Assert - controller returned success
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.responseBody.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert - activity log entry exists
      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'billing_cycle_deleted' &&
        e.entity_id === createdCycle.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.entity_type).toBe('billing_cycle');
      expect(logEvent.user_action).toContain('Deleted billing cycle');
      expect(logEvent.user_action).toContain('Test Visa');
      expect(logEvent.user_action).toContain(createdCycle.cycle_start_date);
      expect(logEvent.user_action).toContain(createdCycle.cycle_end_date);

      // Verify metadata
      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.paymentMethodName).toBe('Test Visa');
      expect(metadata.cycleStartDate).toBe(createdCycle.cycle_start_date);
      expect(metadata.cycleEndDate).toBe(createdCycle.cycle_end_date);
      expect(metadata.actualStatementBalance).toBe(300.25);
    });

    it('should not log event when deleting non-existent billing cycle', async () => {
      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id), cycleId: '999999' }
      );

      await billingCycleController.deleteBillingCycle(req, res);

      // Should return 404
      expect(res.statusCode).toBe(404);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'billing_cycle_deleted' &&
        e.entity_id === 999999
      );

      expect(logEvent).toBeUndefined();
    });
  });

  describe('Property 4: Billing cycle CRUD operations produce activity log entries (PBT)', () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3**
     */
    it('should log correct event for any billing cycle CRUD operation', async () => {
      const fc = require('fast-check');

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({
            balance: fc.double({ min: 0.01, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            updatedBalance: fc.double({ min: 0.01, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          async (operation, data) => {
            // Clean up before each iteration
            await cleanActivityLogs();
            await cleanBillingCycles();

            let cycleId;
            let expectedEventType;

            if (operation === 'create') {
              const { req, res } = createMockReqRes(
                { id: String(testPaymentMethod.id) },
                { actual_statement_balance: data.balance }
              );
              await billingCycleController.createBillingCycle(req, res);
              expect(res.statusCode).toBe(201);
              cycleId = res.responseBody.billingCycle.id;
              expectedEventType = 'billing_cycle_created';

            } else if (operation === 'update') {
              // Create first
              const { req: cReq, res: cRes } = createMockReqRes(
                { id: String(testPaymentMethod.id) },
                { actual_statement_balance: data.balance }
              );
              await billingCycleController.createBillingCycle(cReq, cRes);
              expect(cRes.statusCode).toBe(201);
              cycleId = cRes.responseBody.billingCycle.id;

              await cleanActivityLogs();

              // Update
              const { req, res } = createMockReqRes(
                { id: String(testPaymentMethod.id), cycleId: String(cycleId) },
                { actual_statement_balance: data.updatedBalance }
              );
              await billingCycleController.updateBillingCycle(req, res);
              expect(res.statusCode).toBe(200);
              expectedEventType = 'billing_cycle_updated';

            } else {
              // Create first
              const { req: cReq, res: cRes } = createMockReqRes(
                { id: String(testPaymentMethod.id) },
                { actual_statement_balance: data.balance }
              );
              await billingCycleController.createBillingCycle(cReq, cRes);
              expect(cRes.statusCode).toBe(201);
              cycleId = cRes.responseBody.billingCycle.id;

              await cleanActivityLogs();

              // Delete
              const { req, res } = createMockReqRes(
                { id: String(testPaymentMethod.id), cycleId: String(cycleId) }
              );
              await billingCycleController.deleteBillingCycle(req, res);
              expect(res.statusCode).toBe(200);
              expectedEventType = 'billing_cycle_deleted';
            }

            // Allow async logging to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify the activity log entry
            const events = await activityLogRepository.findRecent(10, 0);
            const logEvent = events.find(e =>
              e.event_type === expectedEventType &&
              e.entity_id === cycleId
            );

            expect(logEvent).toBeDefined();
            expect(logEvent.entity_type).toBe('billing_cycle');
            expect(logEvent.user_action).toBeTruthy();
            expect(logEvent.user_action).toContain('Test Visa');

            const metadata = JSON.parse(logEvent.metadata);
            // cardName is used by service logs (update/delete), paymentMethodName by controller logs (create)
            const metaCardName = metadata.cardName || metadata.paymentMethodName;
            expect(metaCardName).toBe('Test Visa');
          }
        ),
        { numRuns: 15 } // Reduced runs for integration test performance
      );
    });
  });
});
