/**
 * Property-Based Tests for Tax Report Multi-Invoice Support
 * 
 * Feature: multi-invoice-support
 * Tests Property 12: Tax Report Invoice Count Accuracy
 * Tests Property 13: Invoice Filter Correctness
 * 
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { getDatabase } = require('../database/db');
const expenseService = require('./expenseService');
const invoiceRepository = require('../repositories/invoiceRepository');

describe('ExpenseService - Property-Based Tests for Tax Report Multi-Invoice Support', () => {
  let db;

  beforeAll(async () => {
    // Get test database (uses shared test database in test mode)
    db = await getDatabase();
  });

  afterAll(async () => {
    // Database will be cleaned up automatically when process exits
  });

  beforeEach(async () => {
    // Clean up tables before each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expense_invoices', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expense_people', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Feature: multi-invoice-support, Property 12: Tax Report Invoice Count Accuracy
   * **Validates: Requirements 7.1**
   * 
   * For any medical expense displayed in the tax report, the shown invoice count 
   * SHALL match the actual number of invoices attached to that expense.
   */
  test('Property 12: Tax Report Invoice Count Accuracy - invoice counts match actual invoices', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate a random number of expenses (1-5)
        fc.integer({ min: 1, max: 5 }),
        // Generate invoice counts per expense (0-5 invoices each)
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 5 }),
        async (year, numExpenses, invoiceCounts) => {
          // Clean up before test
          await new Promise((resolve) => {
            db.run('DELETE FROM expense_invoices', () => {
              db.run('DELETE FROM expenses', resolve);
            });
          });

          const createdExpenses = [];
          
          // Create medical expenses
          for (let i = 0; i < numExpenses; i++) {
            const month = (i % 12) + 1;
            const day = (i % 28) + 1;
            const expense = {
              date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
              place: `Medical Provider ${i + 1}`,
              amount: 100 + (i * 50),
              type: 'Tax - Medical',
              method: 'Debit',
              notes: `Test expense ${i + 1}`
            };
            
            const created = await expenseService.createExpense(expense);
            createdExpenses.push(created);
            
            // Create invoices for this expense based on invoiceCounts array
            const invoiceCount = invoiceCounts[i % invoiceCounts.length];
            for (let j = 0; j < invoiceCount; j++) {
              await invoiceRepository.create({
                expenseId: created.id,
                filename: `invoice_${created.id}_${j}.pdf`,
                originalFilename: `receipt_${j + 1}.pdf`,
                filePath: `/invoices/invoice_${created.id}_${j}.pdf`,
                fileSize: 1024 * (j + 1),
                mimeType: 'application/pdf'
              });
            }
          }
          
          // Get tax-deductible summary for the year
          const summary = await expenseService.getTaxDeductibleSummary(year);
          
          // Property: Each expense's invoiceCount should match actual invoices
          for (let i = 0; i < createdExpenses.length; i++) {
            const expenseInSummary = summary.expenses.medical.find(
              e => e.id === createdExpenses[i].id
            );
            
            if (expenseInSummary) {
              const expectedCount = invoiceCounts[i % invoiceCounts.length];
              
              // Property 12: Invoice count must match actual number of invoices
              expect(expenseInSummary.invoiceCount).toBe(expectedCount);
              
              // Also verify hasInvoice flag is correct
              expect(expenseInSummary.hasInvoice).toBe(expectedCount > 0);
              
              // Verify invoices array length matches count
              expect(expenseInSummary.invoices.length).toBe(expectedCount);
            }
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: multi-invoice-support, Property 13: Invoice Filter Correctness
   * **Validates: Requirements 7.2**
   * 
   * For any filter selection (with invoices, without invoices, all), the filtered 
   * results SHALL contain only expenses matching the filter criteria.
   */
  test('Property 13: Invoice Filter Correctness - filter results match criteria', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate expenses with and without invoices
        fc.array(
          fc.record({
            hasInvoice: fc.boolean(),
            invoiceCount: fc.integer({ min: 1, max: 3 })
          }),
          { minLength: 2, maxLength: 8 }
        ),
        async (year, expenseConfigs) => {
          // Clean up before test
          await new Promise((resolve) => {
            db.run('DELETE FROM expense_invoices', () => {
              db.run('DELETE FROM expenses', resolve);
            });
          });

          const createdExpenses = [];
          
          // Create expenses based on config
          for (let i = 0; i < expenseConfigs.length; i++) {
            const config = expenseConfigs[i];
            const month = (i % 12) + 1;
            const day = (i % 28) + 1;
            const expense = {
              date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
              place: `Provider ${i + 1}`,
              amount: 100 + (i * 25),
              type: 'Tax - Medical',
              method: 'Debit',
              notes: `Expense ${i + 1}`
            };
            
            const created = await expenseService.createExpense(expense);
            createdExpenses.push({ ...created, config });
            
            // Create invoices if configured
            if (config.hasInvoice) {
              for (let j = 0; j < config.invoiceCount; j++) {
                await invoiceRepository.create({
                  expenseId: created.id,
                  filename: `invoice_${created.id}_${j}.pdf`,
                  originalFilename: `receipt_${j + 1}.pdf`,
                  filePath: `/invoices/invoice_${created.id}_${j}.pdf`,
                  fileSize: 1024,
                  mimeType: 'application/pdf'
                });
              }
            }
          }
          
          // Get tax-deductible summary
          const summary = await expenseService.getTaxDeductibleSummary(year);
          const medicalExpenses = summary.expenses.medical;
          
          // Test filter: "with-invoice"
          const withInvoice = medicalExpenses.filter(exp => exp.hasInvoice);
          const expectedWithInvoice = createdExpenses.filter(e => e.config.hasInvoice);
          
          // Property 13a: All expenses in "with invoice" filter must have invoices
          withInvoice.forEach(exp => {
            expect(exp.hasInvoice).toBe(true);
            expect(exp.invoiceCount).toBeGreaterThan(0);
          });
          
          // Property 13b: Count of "with invoice" matches expected
          expect(withInvoice.length).toBe(expectedWithInvoice.length);
          
          // Test filter: "without-invoice"
          const withoutInvoice = medicalExpenses.filter(exp => !exp.hasInvoice);
          const expectedWithoutInvoice = createdExpenses.filter(e => !e.config.hasInvoice);
          
          // Property 13c: All expenses in "without invoice" filter must not have invoices
          withoutInvoice.forEach(exp => {
            expect(exp.hasInvoice).toBe(false);
            expect(exp.invoiceCount).toBe(0);
          });
          
          // Property 13d: Count of "without invoice" matches expected
          expect(withoutInvoice.length).toBe(expectedWithoutInvoice.length);
          
          // Test filter: "all"
          // Property 13e: "All" filter returns all expenses
          expect(medicalExpenses.length).toBe(createdExpenses.length);
          
          // Property 13f: Sum of filtered results equals total
          expect(withInvoice.length + withoutInvoice.length).toBe(medicalExpenses.length);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Additional property test: Invoice data integrity in tax report
   * Validates that invoice details are correctly included in tax report
   */
  test('Property: Invoice data integrity - invoice details are correctly included', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2020, max: 2030 }),
        fc.array(
          fc.record({
            filename: fc.string({ minLength: 5, maxLength: 20 }).map(s => s.replace(/[^a-zA-Z0-9]/g, '') + '.pdf'),
            fileSize: fc.integer({ min: 100, max: 10000000 })
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (year, invoiceData) => {
          // Clean up before test
          await new Promise((resolve) => {
            db.run('DELETE FROM expense_invoices', () => {
              db.run('DELETE FROM expenses', resolve);
            });
          });

          // Create a medical expense
          const expense = await expenseService.createExpense({
            date: `${year}-06-15`,
            place: 'Test Medical Provider',
            amount: 500,
            type: 'Tax - Medical',
            method: 'Debit',
            notes: 'Test expense'
          });
          
          // Create invoices with specific data
          const createdInvoices = [];
          for (const data of invoiceData) {
            const invoice = await invoiceRepository.create({
              expenseId: expense.id,
              filename: `stored_${data.filename}`,
              originalFilename: data.filename,
              filePath: `/invoices/stored_${data.filename}`,
              fileSize: data.fileSize,
              mimeType: 'application/pdf'
            });
            createdInvoices.push(invoice);
          }
          
          // Get tax report
          const summary = await expenseService.getTaxDeductibleSummary(year);
          const expenseInReport = summary.expenses.medical.find(e => e.id === expense.id);
          
          // Property: Expense should be in report
          expect(expenseInReport).toBeDefined();
          
          // Property: Invoice count matches
          expect(expenseInReport.invoiceCount).toBe(invoiceData.length);
          
          // Property: Each invoice's data is preserved
          for (let i = 0; i < createdInvoices.length; i++) {
            const invoiceInReport = expenseInReport.invoices.find(
              inv => inv.id === createdInvoices[i].id
            );
            
            expect(invoiceInReport).toBeDefined();
            expect(invoiceInReport.originalFilename).toBe(invoiceData[i].filename);
            expect(invoiceInReport.fileSize).toBe(invoiceData[i].fileSize);
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});
