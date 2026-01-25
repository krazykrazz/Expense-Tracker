/**
 * Property-Based Tests for Invoice Repository
 * Tests universal properties of multi-invoice storage and retrieval
 * 
 * Feature: multi-invoice-support
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const invoiceRepository = require('./invoiceRepository');
const { getDatabase } = require('../database/db');

describe('Invoice Repository Property-Based Tests', () => {
  let db;
  let testExpenseId;
  let testPersonIds = [];

  beforeEach(async () => {
    db = await getDatabase();
    
    // Clean up any existing test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expense_invoices', (err) => {
        if (err && !err.message.includes('no such table')) reject(err);
        else resolve();
      });
    });
    
    // Create a test expense for invoice associations
    testExpenseId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['2025-01-01', 'Test Medical Provider', 'Test expense', 100.00, 'Tax - Medical', 1, 'Debit'],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Create test people for person linking
    testPersonIds = [];
    for (let i = 0; i < 3; i++) {
      const personId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO people (name, date_of_birth) VALUES (?, ?)',
          [`Test Person ${i + 1}`, '1990-01-01'],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
      testPersonIds.push(personId);
    }
  });

  afterEach(async () => {
    if (db) {
      // Clean up test data
      await new Promise((resolve) => {
        db.run('DELETE FROM expense_invoices', () => {
          db.run('DELETE FROM expense_people', () => {
            db.run(`DELETE FROM expenses WHERE id = ?`, [testExpenseId], () => {
              const placeholders = testPersonIds.map(() => '?').join(',');
              if (testPersonIds.length > 0) {
                db.run(`DELETE FROM people WHERE id IN (${placeholders})`, testPersonIds, () => resolve());
              } else {
                resolve();
              }
            });
          });
        });
      });
    }
  });


  /**
   * **Feature: multi-invoice-support, Property 2: Invoice Uniqueness Within Expense**
   * **Validates: Requirements 1.2**
   * 
   * For any expense with multiple invoices, all invoice IDs SHALL be unique,
   * and all invoices SHALL have the same expense_id matching the parent expense.
   */
  test('Property 2: Invoice Uniqueness Within Expense', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate 1-5 invoices to create
        fc.integer({ min: 1, max: 5 }),
        async (invoiceCount) => {
          const createdInvoices = [];
          
          // Create multiple invoices for the same expense
          for (let i = 0; i < invoiceCount; i++) {
            const invoiceData = {
              expenseId: testExpenseId,
              personId: null,
              filename: `invoice_${Date.now()}_${i}.pdf`,
              originalFilename: `test_invoice_${i}.pdf`,
              filePath: `2025/01/invoice_${Date.now()}_${i}.pdf`,
              fileSize: 1024 * (i + 1),
              mimeType: 'application/pdf',
              uploadDate: new Date(Date.now() + i * 1000).toISOString()
            };
            
            const created = await invoiceRepository.create(invoiceData);
            createdInvoices.push(created);
          }
          
          // Verify all invoice IDs are unique
          const invoiceIds = createdInvoices.map(inv => inv.id);
          const uniqueIds = new Set(invoiceIds);
          expect(uniqueIds.size).toBe(invoiceCount);
          
          // Verify all invoices have the same expense_id
          for (const invoice of createdInvoices) {
            expect(invoice.expenseId).toBe(testExpenseId);
          }
          
          // Retrieve all invoices and verify
          const retrievedInvoices = await invoiceRepository.findAllByExpenseId(testExpenseId);
          expect(retrievedInvoices.length).toBe(invoiceCount);
          
          // Verify retrieved invoices also have unique IDs and correct expense_id
          const retrievedIds = retrievedInvoices.map(inv => inv.id);
          const uniqueRetrievedIds = new Set(retrievedIds);
          expect(uniqueRetrievedIds.size).toBe(invoiceCount);
          
          for (const invoice of retrievedInvoices) {
            expect(invoice.expenseId).toBe(testExpenseId);
          }
          
          // Clean up
          for (const invoice of createdInvoices) {
            await invoiceRepository.deleteById(invoice.id);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * **Feature: multi-invoice-support, Property 4: Invoice Retrieval Ordering**
   * **Validates: Requirements 1.5**
   * 
   * For any expense with multiple invoices having different upload dates,
   * retrieving invoices SHALL return them ordered by upload_date (ascending).
   */
  test('Property 4: Invoice Retrieval Ordering', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate 2-5 invoices with different timestamps
        fc.integer({ min: 2, max: 5 }),
        async (invoiceCount) => {
          const createdInvoices = [];
          const baseTime = Date.now();
          
          // Create invoices with different upload dates (in random order)
          const indices = Array.from({ length: invoiceCount }, (_, i) => i);
          // Shuffle indices to create invoices in random order
          for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
          }
          
          for (const idx of indices) {
            const invoiceData = {
              expenseId: testExpenseId,
              personId: null,
              filename: `invoice_${baseTime}_${idx}.pdf`,
              originalFilename: `test_invoice_${idx}.pdf`,
              filePath: `2025/01/invoice_${baseTime}_${idx}.pdf`,
              fileSize: 1024,
              mimeType: 'application/pdf',
              // Create timestamps with clear ordering (idx * 1 hour apart)
              uploadDate: new Date(baseTime + idx * 3600000).toISOString()
            };
            
            const created = await invoiceRepository.create(invoiceData);
            createdInvoices.push(created);
          }
          
          // Retrieve all invoices
          const retrievedInvoices = await invoiceRepository.findAllByExpenseId(testExpenseId);
          
          // Verify they are ordered by upload_date ascending
          for (let i = 1; i < retrievedInvoices.length; i++) {
            const prevDate = new Date(retrievedInvoices[i - 1].uploadDate);
            const currDate = new Date(retrievedInvoices[i].uploadDate);
            expect(prevDate.getTime()).toBeLessThanOrEqual(currDate.getTime());
          }
          
          // Clean up
          for (const invoice of createdInvoices) {
            await invoiceRepository.deleteById(invoice.id);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * **Feature: multi-invoice-support, Property 5: Person ID Storage Consistency**
   * **Validates: Requirements 2.2, 2.3**
   * 
   * For any invoice upload, the stored person_id SHALL match the provided value
   * when a valid person_id is given, or SHALL be NULL when no person_id is provided.
   */
  test('Property 5: Person ID Storage Consistency', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate either a valid person index or null
        fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
        async (personIndex) => {
          const personId = personIndex !== null ? testPersonIds[personIndex] : null;
          
          const invoiceData = {
            expenseId: testExpenseId,
            personId: personId,
            filename: `invoice_${Date.now()}.pdf`,
            originalFilename: 'test_invoice.pdf',
            filePath: `2025/01/invoice_${Date.now()}.pdf`,
            fileSize: 1024,
            mimeType: 'application/pdf',
            uploadDate: new Date().toISOString()
          };
          
          // Create the invoice
          const created = await invoiceRepository.create(invoiceData);
          
          // Verify the created invoice has the correct person_id
          expect(created.personId).toBe(personId);
          
          // Retrieve the invoice and verify person_id consistency
          const retrieved = await invoiceRepository.findById(created.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved.personId).toBe(personId);
          
          // If person_id is set, verify person name is retrieved
          if (personId !== null) {
            expect(retrieved.personName).toBeDefined();
            expect(retrieved.personName).toContain('Test Person');
          } else {
            expect(retrieved.personName).toBeNull();
          }
          
          // Clean up
          await invoiceRepository.deleteById(created.id);
        }
      ),
      pbtOptions()
    );
  });
});
