const { getDatabase } = require('../database/db');
const creditCardStatementController = require('./creditCardStatementController');
const activityLogRepository = require('../repositories/activityLogRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const creditCardStatementRepository = require('../repositories/creditCardStatementRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Credit Card Statement Activity Logging
 * 
 * Feature: credit-card-billing-fixes, Property 6: Credit card statement operations produce activity log entries
 * 
 * These tests verify that credit card statement upload and delete operations
 * correctly log activity events with proper event_type, entity_type, entity_id,
 * user_action, and metadata fields.
 * 
 * Validates: Requirements 5.1, 5.2
 */

describe('Credit Card Statement Activity Logging - Integration Tests', () => {
  let db;
  let testPaymentMethod;

  // Helper to create mock Express req/res
  function createMockReqRes(params = {}, body = {}, file = null) {
    const req = { params, body, file };
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

  /**
   * Create a minimal valid PDF buffer that passes fileValidation checks.
   * Must have: PDF magic number, version header, obj/endobj, %%EOF, and >= 100 bytes.
   */
  function createValidPdfBuffer() {
    const pdfContent = [
      '%PDF-1.4',
      '1 0 obj',
      '<< /Type /Catalog /Pages 2 0 R >>',
      'endobj',
      '2 0 obj',
      '<< /Type /Pages /Kids [] /Count 0 >>',
      'endobj',
      'xref',
      '0 3',
      'trailer',
      '<< /Size 3 /Root 1 0 R >>',
      'startxref',
      '0',
      '%%EOF'
    ].join('\n');
    return Buffer.from(pdfContent);
  }

  // Helper to insert a statement directly into the DB (bypassing file system)
  async function insertTestStatement(paymentMethodId, statementDate, periodStart, periodEnd, originalFilename = 'test-statement.pdf') {
    return creditCardStatementRepository.create({
      payment_method_id: paymentMethodId,
      statement_date: statementDate,
      statement_period_start: periodStart,
      statement_period_end: periodEnd,
      filename: `statement_${paymentMethodId}_${Date.now()}.pdf`,
      original_filename: originalFilename,
      file_path: `${paymentMethodId}/2025/test_statement_${Date.now()}.pdf`,
      file_size: 1024,
      mime_type: 'application/pdf'
    });
  }

  // Cleanup helpers
  async function cleanActivityLogs() {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM activity_logs WHERE entity_type = 'credit_card_statement'`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function cleanStatements() {
    if (testPaymentMethod) {
      return new Promise((resolve, reject) => {
        db.run(`DELETE FROM credit_card_statements WHERE payment_method_id = ?`, [testPaymentMethod.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

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
    await cleanStatements();
    await cleanPaymentMethod();

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
    await cleanStatements();
    await cleanPaymentMethod();
  });


  describe('Upload Statement - Activity Log (Requirement 5.1)', () => {
    it('should log credit_card_statement_uploaded event when uploading a statement', async () => {
      const mockFile = {
        originalname: 'june-statement.pdf',
        buffer: createValidPdfBuffer(),
        size: 2048,
        mimetype: 'application/pdf'
      };

      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        {
          statement_date: '2025-06-14',
          statement_period_start: '2025-05-15',
          statement_period_end: '2025-06-14'
        },
        mockFile
      );

      await creditCardStatementController.uploadStatement(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.responseBody.success).toBe(true);
      const statement = res.responseBody.statement;

      // Allow async activity logging to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'credit_card_statement_uploaded' &&
        e.entity_id === statement.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.entity_type).toBe('credit_card_statement');
      expect(logEvent.user_action).toContain('Uploaded statement for');
      expect(logEvent.user_action).toContain('Test Visa');
      expect(logEvent.user_action).toContain('2025-06-14');
      expect(logEvent.user_action).toContain('june-statement.pdf');

      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.paymentMethodName).toBe('Test Visa');
      expect(metadata.statementDate).toBe('2025-06-14');
      expect(metadata.originalFilename).toBe('june-statement.pdf');
      expect(metadata.statementPeriodStart).toBe('2025-05-15');
      expect(metadata.statementPeriodEnd).toBe('2025-06-14');
    });

    it('should include statement period dates in metadata', async () => {
      const mockFile = {
        originalname: 'july-statement.pdf',
        buffer: createValidPdfBuffer(),
        size: 2048,
        mimetype: 'application/pdf'
      };

      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        {
          statement_date: '2025-07-14',
          statement_period_start: '2025-06-15',
          statement_period_end: '2025-07-14'
        },
        mockFile
      );

      await creditCardStatementController.uploadStatement(req, res);
      expect(res.statusCode).toBe(201);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'credit_card_statement_uploaded'
      );

      expect(logEvent).toBeDefined();
      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.statementPeriodStart).toBe('2025-06-15');
      expect(metadata.statementPeriodEnd).toBe('2025-07-14');
    });
  });

  describe('Delete Statement - Activity Log (Requirement 5.2)', () => {
    it('should log credit_card_statement_deleted event when deleting a statement', async () => {
      // Insert a statement directly into the DB
      const statement = await insertTestStatement(
        testPaymentMethod.id,
        '2025-06-14',
        '2025-05-15',
        '2025-06-14',
        'visa-june.pdf'
      );

      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id), statementId: String(statement.id) }
      );

      await creditCardStatementController.deleteStatement(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.responseBody.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'credit_card_statement_deleted' &&
        e.entity_id === statement.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.entity_type).toBe('credit_card_statement');
      expect(logEvent.user_action).toContain('Deleted statement for');
      expect(logEvent.user_action).toContain('Test Visa');
      expect(logEvent.user_action).toContain('2025-06-14');

      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.paymentMethodName).toBe('Test Visa');
      expect(metadata.statementDate).toBe('2025-06-14');
      expect(metadata.originalFilename).toBe('visa-june.pdf');
    });

    it('should not log event when deleting non-existent statement', async () => {
      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id), statementId: '999999' }
      );

      await creditCardStatementController.deleteStatement(req, res);
      expect(res.statusCode).toBe(404);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'credit_card_statement_deleted' &&
        e.entity_id === 999999
      );

      expect(logEvent).toBeUndefined();
    });
  });

  describe('Property 6: Credit card statement operations produce activity log entries (PBT)', () => {
    /**
     * **Validates: Requirements 5.1, 5.2**
     */
    it('should log correct event for any credit card statement delete operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            year: fc.integer({ min: 2020, max: 2030 }),
            month: fc.integer({ min: 1, max: 12 }),
            day: fc.integer({ min: 1, max: 28 }),
            filename: fc.stringMatching(/^[a-z]{3,10}\.pdf$/)
          }),
          async (data) => {
            await cleanActivityLogs();
            await cleanStatements();

            const statementDate = `${data.year}-${String(data.month).padStart(2, '0')}-${String(data.day).padStart(2, '0')}`;
            // Period start is one month before statement date
            const periodStartMonth = data.month === 1 ? 12 : data.month - 1;
            const periodStartYear = data.month === 1 ? data.year - 1 : data.year;
            const periodStart = `${periodStartYear}-${String(periodStartMonth).padStart(2, '0')}-${String(data.day).padStart(2, '0')}`;

            // Insert statement directly
            const statement = await insertTestStatement(
              testPaymentMethod.id,
              statementDate,
              periodStart,
              statementDate,
              data.filename
            );

            // Delete via controller
            const { req, res } = createMockReqRes(
              { id: String(testPaymentMethod.id), statementId: String(statement.id) }
            );
            await creditCardStatementController.deleteStatement(req, res);
            expect(res.statusCode).toBe(200);

            await new Promise(resolve => setTimeout(resolve, 100));

            const events = await activityLogRepository.findRecent(10, 0);
            const logEvent = events.find(e =>
              e.event_type === 'credit_card_statement_deleted' &&
              e.entity_id === statement.id
            );

            expect(logEvent).toBeDefined();
            expect(logEvent.entity_type).toBe('credit_card_statement');
            expect(logEvent.user_action).toContain('Test Visa');
            expect(logEvent.user_action).toContain(statementDate);

            const metadata = JSON.parse(logEvent.metadata);
            expect(metadata.paymentMethodName).toBe('Test Visa');
            expect(metadata.statementDate).toBe(statementDate);
            expect(metadata.originalFilename).toBe(data.filename);
          }
        ),
        { numRuns: 15 } // Reduced runs for integration test performance
      );
    });
  });
});
