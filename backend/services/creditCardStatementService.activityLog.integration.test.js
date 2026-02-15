const { getDatabase } = require('../database/db');
const creditCardStatementService = require('./creditCardStatementService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const { runSql, clearActivityLogs, findEventWithMetadata } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Credit Card Statement Activity Logging
 * 
 * Feature: activity-log-coverage, Property 2: Credit card statement CRUD logging
 * 
 * These tests verify that credit card statement CRUD operations correctly log activity events:
 * - Uploading statements logs "credit_card_statement_uploaded" events
 * - Deleting statements logs "credit_card_statement_deleted" events
 * - Deleting non-existent statements does not log
 * - Events include correct metadata (paymentMethodId, statementDate, filename, cardName)
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

const ENTITY_TYPE = 'credit_card_statement';

/**
 * Create a minimal valid PDF buffer that passes file validation.
 */
function createValidPdfBuffer() {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [] /Count 0 >>
endobj
xref
0 3
trailer
<< /Root 1 0 R /Size 3 >>
startxref
0
%%EOF
`;
  return Buffer.from(content.padEnd(200, ' '));
}

describe('Credit Card Statement Activity Logging - Integration Tests', () => {
  let db;
  let testPaymentMethodId;
  const createdStatementIds = [];

  beforeAll(async () => {
    db = await getDatabase();

    const result = await runSql(db,
      `INSERT INTO payment_methods (display_name, type, credit_limit, current_balance, is_active) VALUES (?, ?, ?, ?, ?)`,
      ['Test Visa Statement', 'credit_card', 5000, 1000, 1]
    );
    testPaymentMethodId = result.lastID;
  });

  afterAll(async () => {
    try {
      for (const id of createdStatementIds) {
        await runSql(db, `DELETE FROM credit_card_statements WHERE id = ?`, [id]);
      }
      await runSql(db, `DELETE FROM credit_card_statements WHERE payment_method_id = ?`, [testPaymentMethodId]);
      await runSql(db, `DELETE FROM payment_methods WHERE id = ?`, [testPaymentMethodId]);
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
      const statementsDir = path.join(creditCardStatementService.baseStatementDir, String(testPaymentMethodId));
      if (fs.existsSync(statementsDir)) {
        fs.rmSync(statementsDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  beforeEach(() => clearActivityLogs(db, 'entity_type', ENTITY_TYPE));
  afterEach(() => clearActivityLogs(db, 'entity_type', ENTITY_TYPE));

  describe('Upload Statement Event Logging', () => {
    it('should log credit_card_statement_uploaded event when uploading a statement', async () => {
      const pdfBuffer = createValidPdfBuffer();
      const file = {
        buffer: pdfBuffer,
        originalname: 'visa-june-2096.pdf',
        mimetype: 'application/pdf',
        size: pdfBuffer.length
      };

      const statement = await creditCardStatementService.uploadStatement(
        testPaymentMethodId, file, '2096-06-15', '2096-05-16', '2096-06-15'
      );
      createdStatementIds.push(statement.id);

      expect(statement).toBeDefined();
      expect(statement.id).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'credit_card_statement_uploaded', statement.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Uploaded statement');
      expect(event.user_action).toContain('visa-june-2096.pdf');
      expect(event.user_action).toContain('Test Visa Statement');

      expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
      expect(metadata.statementDate).toBe('2096-06-15');
      expect(metadata.filename).toBe('visa-june-2096.pdf');
      expect(metadata.cardName).toBe('Test Visa Statement');
    });
  });

  describe('Delete Statement Event Logging', () => {
    it('should log credit_card_statement_deleted event when deleting a statement', async () => {
      const pdfBuffer = createValidPdfBuffer();
      const file = {
        buffer: pdfBuffer,
        originalname: 'visa-july-2096.pdf',
        mimetype: 'application/pdf',
        size: pdfBuffer.length
      };

      const statement = await creditCardStatementService.uploadStatement(
        testPaymentMethodId, file, '2096-07-15', '2096-06-16', '2096-07-15'
      );
      createdStatementIds.push(statement.id);

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const deleted = await creditCardStatementService.deleteStatement(statement.id);
      expect(deleted).toBe(true);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'credit_card_statement_deleted', statement.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Deleted statement');
      expect(event.user_action).toContain('visa-july-2096.pdf');
      expect(event.user_action).toContain('Test Visa Statement');

      expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
      expect(metadata.statementDate).toBe('2096-07-15');
      expect(metadata.filename).toBe('visa-july-2096.pdf');
      expect(metadata.cardName).toBe('Test Visa Statement');
    });

    it('should not log event when deleting non-existent statement', async () => {
      const nonExistentId = 999999;
      const deleted = await creditCardStatementService.deleteStatement(nonExistentId);
      expect(deleted).toBe(false);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event } = findEventWithMetadata(events, 'credit_card_statement_deleted', nonExistentId);
      expect(event).toBeNull();
    });
  });

  describe('Property 2: Credit card statement CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 2: Credit card statement CRUD logging
     * 
     * **Validates: Requirements 2.1, 2.2, 2.3**
     */
    it('should log correct events for any credit card statement CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('upload', 'delete'),
          fc.record({
            day: fc.integer({ min: 1, max: 28 }),
            month: fc.integer({ min: 1, max: 12 }),
            filenameBase: fc.stringMatching(/^[a-z]{3,10}$/)
          }),
          async (operation, input) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

            const statementDate = `2096-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')}`;
            const prevMonth = input.month === 1 ? 12 : input.month - 1;
            const periodStart = `2096-${String(prevMonth).padStart(2, '0')}-16`;
            const periodEnd = statementDate;
            const filename = `${input.filenameBase}.pdf`;

            const pdfBuffer = createValidPdfBuffer();
            const file = {
              buffer: pdfBuffer,
              originalname: filename,
              mimetype: 'application/pdf',
              size: pdfBuffer.length
            };

            let expectedEventType;
            let entityId;

            if (operation === 'upload') {
              const statement = await creditCardStatementService.uploadStatement(
                testPaymentMethodId, file, statementDate, periodStart, periodEnd
              );
              createdStatementIds.push(statement.id);
              entityId = statement.id;
              expectedEventType = 'credit_card_statement_uploaded';
            } else {
              const statement = await creditCardStatementService.uploadStatement(
                testPaymentMethodId, file, statementDate, periodStart, periodEnd
              );
              createdStatementIds.push(statement.id);
              entityId = statement.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await creditCardStatementService.deleteStatement(statement.id);
              expectedEventType = 'credit_card_statement_deleted';
            }

            const events = await activityLogRepository.findRecent(10, 0);
            const { event, metadata } = findEventWithMetadata(events, expectedEventType, entityId);

            expect(event).toBeDefined();
            expect(event.entity_type).toBe(ENTITY_TYPE);
            expect(event.user_action).toBeTruthy();

            expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
            expect(metadata.statementDate).toBe(statementDate);
            expect(metadata.filename).toBe(filename);
            expect(metadata.cardName).toBe('Test Visa Statement');
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
