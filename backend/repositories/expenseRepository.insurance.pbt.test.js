/**
 * Property-Based Tests for Expense Repository Insurance Fields
 * Tests universal properties of insurance data persistence and retrieval
 * 
 * **Feature: medical-insurance-tracking**
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fc = require('fast-check');
const expenseRepository = require('./expenseRepository');
const { getDatabase } = require('../database/db');

describe('Expense Repository Insurance Property-Based Tests', () => {
  let db;

  beforeEach(async () => {
    db = await getDatabase();
    // Clean up any existing test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expense_people', (err) => {
        if (err) reject(err);
        else {
          db.run('DELETE FROM expenses', (err) => {
            if (err) reject(err);
            else resolve();
          });
        }
      });
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (db) {
      await new Promise((resolve) => {
        db.run('DELETE FROM expense_people', () => {
          db.run('DELETE FROM expenses', () => {
            resolve();
          });
        });
      });
    }
  });

  // Arbitraries for insurance data
  const claimStatusArb = fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied', null);
  
  const validDateArb = fc.date({ 
    min: new Date('2020-01-01'), 
    max: new Date('2030-12-31') 
  }).map(d => d.toISOString().split('T')[0]);

  const paymentMethodArb = fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA');

  /**
   * **Property 3: Insurance Data Persistence Round-Trip**
   * **Validates: Requirements 1.3, 2.3, 5.4**
   * 
   * For any medical expense with insurance data, saving the expense and then 
   * retrieving it SHALL produce an expense with identical insurance_eligible, 
   * claim_status, original_cost, and amount values.
   */
  test('Property 3: Insurance Data Persistence Round-Trip', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate valid insurance data where amount <= original_cost
        fc.record({
          date: validDateArb,
          place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          notes: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
          original_cost: fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          method: paymentMethodArb,
          claim_status: claimStatusArb
        }).chain(data => {
          // Generate amount that is <= original_cost
          return fc.double({ min: 0.01, max: data.original_cost, noNaN: true })
            .map(amount => ({
              ...data,
              amount: Math.round(amount * 100) / 100,
              insurance_eligible: true
            }));
        }),
        async (insuranceData) => {
          // Calculate week from date
          const dateObj = new Date(insuranceData.date);
          const dayOfMonth = dateObj.getDate();
          const week = Math.min(5, Math.ceil(dayOfMonth / 7));

          // Create a medical expense with insurance data
          const expenseId = await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO expenses (date, place, notes, amount, type, week, method, insurance_eligible, claim_status, original_cost) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                insuranceData.date,
                insuranceData.place,
                insuranceData.notes,
                insuranceData.amount,
                'Tax - Medical',
                week,
                insuranceData.method,
                insuranceData.insurance_eligible ? 1 : 0,
                insuranceData.claim_status,
                insuranceData.original_cost
              ],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          });

          // Retrieve the expense
          const retrievedExpense = await expenseRepository.findById(expenseId);

          // Verify round-trip data integrity for insurance fields
          expect(retrievedExpense).not.toBeNull();
          expect(retrievedExpense.insurance_eligible).toBe(insuranceData.insurance_eligible ? 1 : 0);
          expect(retrievedExpense.claim_status).toBe(insuranceData.claim_status);
          expect(retrievedExpense.original_cost).toBeCloseTo(insuranceData.original_cost, 2);
          expect(retrievedExpense.amount).toBeCloseTo(insuranceData.amount, 2);

          // Verify other fields are preserved
          expect(retrievedExpense.date).toBe(insuranceData.date);
          expect(retrievedExpense.place).toBe(insuranceData.place);
          expect(retrievedExpense.type).toBe('Tax - Medical');
          expect(retrievedExpense.method).toBe(insuranceData.method);

          // Verify the expense appears in tax deductible expenses with correct insurance data
          const year = parseInt(insuranceData.date.split('-')[0]);
          const taxDeductibleExpenses = await expenseRepository.getTaxDeductibleExpenses(year);
          const foundExpense = taxDeductibleExpenses.find(e => e.id === expenseId);
          
          expect(foundExpense).toBeDefined();
          expect(foundExpense.insuranceEligible).toBe(insuranceData.insurance_eligible);
          expect(foundExpense.claimStatus).toBe(insuranceData.claim_status);
          expect(foundExpense.originalCost).toBeCloseTo(insuranceData.original_cost, 2);
          expect(foundExpense.amount).toBeCloseTo(insuranceData.amount, 2);
          
          // Verify reimbursement calculation
          const expectedReimbursement = insuranceData.original_cost - insuranceData.amount;
          expect(foundExpense.reimbursement).toBeCloseTo(expectedReimbursement, 2);

          // Test updateInsuranceFields round-trip
          const newClaimStatus = insuranceData.claim_status === 'paid' ? 'denied' : 'paid';
          const newAmount = Math.round((insuranceData.original_cost * 0.5) * 100) / 100;
          
          const updatedExpense = await expenseRepository.updateInsuranceFields(expenseId, {
            claim_status: newClaimStatus,
            amount: newAmount
          });

          expect(updatedExpense).not.toBeNull();
          expect(updatedExpense.claim_status).toBe(newClaimStatus);
          expect(updatedExpense.amount).toBeCloseTo(newAmount, 2);
          // Original cost should remain unchanged
          expect(updatedExpense.original_cost).toBeCloseTo(insuranceData.original_cost, 2);

          // Clean up
          await new Promise((resolve) => {
            db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});
