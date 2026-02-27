const { getDatabase } = require('../database/db');
const invoiceService = require('./invoiceService');
const activityLogRepository = require('../repositories/activityLogRepository');
const invoiceRepository = require('../repositories/invoiceRepository');
const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const fileStorage = require('../utils/fileStorage');
const { runSql, clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Invoice Service Activity Logging
 *
 * Feature: activity-log-coverage, Property 6: Invoice CRUD logging
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 */

const ENTITY_TYPE = 'invoice';

/** Create a minimal valid PDF buffer that passes file validation. */
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

describe('Invoice Service Activity Logging - Integration Tests', () => {
  let db;
  const testYear = 2096;
  const createdExpenseIds = [];
  const createdInvoiceIds = [];
  const createdPersonIds = [];

  beforeAll(async () => { db = await getDatabase(); });

  afterAll(async () => {
    try {
      for (const id of createdInvoiceIds) {
        try {
          const invoice = await invoiceRepository.findById(id);
          if (invoice) {
            const fullPath = path.join(fileStorage.baseInvoiceDir, invoice.filePath);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          }
        } catch (e) { /* ignore */ }
        await runSql(db, `DELETE FROM expense_invoices WHERE id = ?`, [id]);
      }
      for (const expId of createdExpenseIds) {
        await runSql(db, `DELETE FROM expense_people WHERE expense_id = ?`, [expId]);
      }
      for (const id of createdExpenseIds) {
        await runSql(db, `DELETE FROM expenses WHERE id = ?`, [id]);
      }
      for (const id of createdPersonIds) {
        await runSql(db, `DELETE FROM people WHERE id = ?`, [id]);
      }
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  beforeEach(() => clearActivityLogs(db, 'entity_type', ENTITY_TYPE));
  afterEach(() => clearActivityLogs(db, 'entity_type', ENTITY_TYPE));

  async function createTestExpense(suffix = '') {
    const { lastID } = await runSql(db,
      `INSERT INTO expenses (place, amount, date, type, week, method) VALUES (?, ?, ?, ?, ?, ?)`,
      [`Test Medical${suffix}`, 150.00, `${testYear}-06-15`, 'Tax - Medical', 3, 'Cash']
    );
    createdExpenseIds.push(lastID);
    return lastID;
  }

  async function createTestPerson(name) {
    const { lastID } = await runSql(db, `INSERT INTO people (name) VALUES (?)`, [name]);
    createdPersonIds.push(lastID);
    return lastID;
  }

  async function linkPersonToExpense(expenseId, personId) {
    await runSql(db,
      `INSERT INTO expense_people (expense_id, person_id, amount) VALUES (?, ?, ?)`,
      [expenseId, personId, 150.00]
    );
  }

  async function uploadTestInvoice(expenseId, filename = 'test-invoice.pdf', personId = null) {
    const pdfBuffer = createValidPdfBuffer();
    const file = { buffer: pdfBuffer, originalname: filename, mimetype: 'application/pdf', size: pdfBuffer.length };
    const invoice = await invoiceService.uploadInvoice(expenseId, file, personId);
    createdInvoiceIds.push(invoice.id);
    return invoice;
  }

  describe('Upload Invoice Event Logging', () => {
    it('should log invoice_uploaded event when uploading an invoice', async () => {
      const expenseId = await createTestExpense();
      const invoice = await uploadTestInvoice(expenseId, 'medical-receipt.pdf');

      expect(invoice).toBeDefined();
      expect(invoice.id).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'invoice_uploaded', invoice.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Uploaded invoice');
      expect(event.user_action).toContain('medical-receipt.pdf');

      expect(metadata.expenseId).toBe(expenseId);
      expect(metadata.filename).toBe('medical-receipt.pdf');
      expect(metadata.personId).toBeNull();
    });

    it('should log invoice_uploaded event with personId when person is linked', async () => {
      const expenseId = await createTestExpense(' PersonLink');
      const personId = await createTestPerson(`Test_InvoicePerson_${Date.now()}`);
      await linkPersonToExpense(expenseId, personId);

      const invoice = await uploadTestInvoice(expenseId, 'person-invoice.pdf', personId);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'invoice_uploaded', invoice.id);

      expect(event).toBeDefined();
      expect(metadata.expenseId).toBe(expenseId);
      expect(metadata.filename).toBe('person-invoice.pdf');
      expect(metadata.personId).toBe(personId);
    });
  });

  describe('Delete Invoice (by expense) Event Logging', () => {
    it('should log invoice_deleted event when deleting an invoice by expense', async () => {
      const expenseId = await createTestExpense(' Delete');
      const invoice = await uploadTestInvoice(expenseId, 'to-delete.pdf');

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const deleted = await invoiceService.deleteInvoice(expenseId);
      expect(deleted).toBeTruthy();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'invoice_deleted', invoice.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Deleted invoice');

      expect(metadata.expenseId).toBe(expenseId);
      expect(metadata.filename).toBeDefined();
    });

    it('should not log event when deleting invoice for expense with no invoice', async () => {
      const expenseId = await createTestExpense(' NoInvoice');

      const deleted = await invoiceService.deleteInvoice(expenseId);
      expect(deleted).toBe(false);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const deleteEvents = events.filter(e => e.event_type === 'invoice_deleted');
      expect(deleteEvents.length).toBe(0);
    });
  });

  describe('Delete Invoice By ID Event Logging', () => {
    it('should log invoice_deleted event with invoiceId when deleting by ID', async () => {
      const expenseId = await createTestExpense(' DeleteById');
      const invoice = await uploadTestInvoice(expenseId, 'delete-by-id.pdf');

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const deleted = await invoiceService.deleteInvoiceById(invoice.id);
      expect(deleted).toBe(true);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'invoice_deleted', invoice.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Deleted invoice');

      expect(metadata.invoiceId).toBe(invoice.id);
      expect(metadata.expenseId).toBe(expenseId);
      expect(metadata.filename).toBeDefined();
    });

    it('should not log event when deleting non-existent invoice by ID', async () => {
      const deleted = await invoiceService.deleteInvoiceById(999999);
      expect(deleted).toBe(false);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const deleteEvents = events.filter(e => e.event_type === 'invoice_deleted' && e.entity_id === 999999);
      expect(deleteEvents.length).toBe(0);
    });
  });

  describe('Update Invoice Person Link Event Logging', () => {
    it('should log invoice_person_link_updated event when updating person link', async () => {
      const expenseId = await createTestExpense(' PersonUpdate');
      const person1Id = await createTestPerson(`Test_Person1_${Date.now()}`);
      const person2Id = await createTestPerson(`Test_Person2_${Date.now()}`);
      await linkPersonToExpense(expenseId, person1Id);
      await linkPersonToExpense(expenseId, person2Id);

      const invoice = await uploadTestInvoice(expenseId, 'person-link.pdf', person1Id);

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const updated = await invoiceService.updateInvoicePersonLink(invoice.id, person2Id);
      expect(updated).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'invoice_person_link_updated', invoice.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Updated person link');

      expect(metadata.invoiceId).toBe(invoice.id);
      expect(metadata.oldPersonId).toBe(person1Id);
      expect(metadata.newPersonId).toBe(person2Id);
    });

    it('should log invoice_person_link_updated event when removing person link', async () => {
      const expenseId = await createTestExpense(' PersonRemove');
      const personId = await createTestPerson(`Test_PersonRemove_${Date.now()}`);
      await linkPersonToExpense(expenseId, personId);

      const invoice = await uploadTestInvoice(expenseId, 'remove-person.pdf', personId);

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const updated = await invoiceService.updateInvoicePersonLink(invoice.id, null);
      expect(updated).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'invoice_person_link_updated', invoice.id);

      expect(event).toBeDefined();
      expect(metadata.invoiceId).toBe(invoice.id);
      expect(metadata.oldPersonId).toBe(personId);
      expect(metadata.newPersonId).toBeNull();
    });
  });

  describe('Property 6: Invoice CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 6: Invoice CRUD logging
     * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
     */
    it('should log correct events for any invoice CRUD operation', async () => {
      const pbtExpenseId = await createTestExpense(' PBT');
      const pbtPerson1Id = await createTestPerson(`Test_PBTPerson1_${Date.now()}`);
      const pbtPerson2Id = await createTestPerson(`Test_PBTPerson2_${Date.now()}`);
      await linkPersonToExpense(pbtExpenseId, pbtPerson1Id);
      await linkPersonToExpense(pbtExpenseId, pbtPerson2Id);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('upload', 'deleteById', 'updatePersonLink'),
          fc.stringMatching(/^[a-z]{3,10}$/).map(s => `${s}.pdf`),
          async (operation, filename) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

            const iterExpenseId = await createTestExpense(` PBT-${Date.now()}`);
            await linkPersonToExpense(iterExpenseId, pbtPerson1Id);
            await linkPersonToExpense(iterExpenseId, pbtPerson2Id);

            if (operation === 'upload') {
              const invoice = await uploadTestInvoice(iterExpenseId, filename);

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'invoice_uploaded', invoice.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.expenseId).toBe(iterExpenseId);
              expect(metadata.filename).toBe(filename);

            } else if (operation === 'deleteById') {
              const invoice = await uploadTestInvoice(iterExpenseId, filename);

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await invoiceService.deleteInvoiceById(invoice.id);

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'invoice_deleted', invoice.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.invoiceId).toBe(invoice.id);
              expect(metadata.expenseId).toBe(iterExpenseId);
              expect(metadata.filename).toBeDefined();

            } else {
              const invoice = await uploadTestInvoice(iterExpenseId, filename, pbtPerson1Id);

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await invoiceService.updateInvoicePersonLink(invoice.id, pbtPerson2Id);

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'invoice_person_link_updated', invoice.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.invoiceId).toBe(invoice.id);
              expect(metadata.oldPersonId).toBe(pbtPerson1Id);
              expect(metadata.newPersonId).toBe(pbtPerson2Id);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
