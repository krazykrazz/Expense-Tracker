/**
 * Property-Based Tests for Expense People Repository
 * Tests universal properties of expense-person association storage and retrieval
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fc = require('fast-check');
const expensePeopleRepository = require('./expensePeopleRepository');
const peopleRepository = require('./peopleRepository');
const { getDatabase } = require('../database/db');

describe('Expense People Repository Property-Based Tests', () => {
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
            else {
              db.run('DELETE FROM people', (err) => {
                if (err) reject(err);
                else resolve();
              });
            }
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
            db.run('DELETE FROM people', () => {
              resolve();
            });
          });
        });
      });
    }
  });

  /**
   * **Feature: medical-expense-people-tracking, Property 5: Person-amount relationship storage**
   * **Validates: Requirements 2.5, 4.5**
   * 
   * For any medical expense with people associations, storing then retrieving 
   * should preserve all person-amount pairs accurately
   */
  test('Property 5: Person-amount relationship storage', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate people data
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(name => name.trim().length > 0),
            dateOfBirth: fc.option(
              fc.date({ min: new Date('1900-01-01'), max: new Date('2025-12-31') })
                .map(date => {
                  try {
                    return date.toISOString().split('T')[0];
                  } catch (e) {
                    return '2000-01-01';
                  }
                }),
              { nil: null }
            )
          }),
          { minLength: 1, maxLength: 4 }
        ),
        // Generate expense data
        fc.record({
          totalAmount: fc.double({ min: 0.01, max: 10000, noNaN: true })
        }),
        // Generate allocation amounts that sum to total
        async (peopleData, expenseData) => {
          // Create people first
          const createdPeople = [];
          for (const personData of peopleData) {
            const person = await peopleRepository.create(personData);
            createdPeople.push(person);
          }
          
          // Create an expense
          const expenseId = await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                '2025-01-01',
                'Test Medical Provider',
                'Test medical expense',
                expenseData.totalAmount,
                'Tax - Medical',
                1,
                'Debit'
              ],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          });
          
          // Generate allocations that sum to the total amount
          const allocations = [];
          let remainingAmount = expenseData.totalAmount;
          
          for (let i = 0; i < createdPeople.length; i++) {
            let amount;
            if (i === createdPeople.length - 1) {
              // Last person gets the remaining amount
              amount = remainingAmount;
            } else {
              // Allocate a portion of the remaining amount
              const maxAllocation = remainingAmount - (0.01 * (createdPeople.length - i - 1));
              amount = Math.max(0.01, Math.min(maxAllocation, remainingAmount * 0.8));
              amount = Math.round(amount * 100) / 100; // Round to 2 decimal places
            }
            
            allocations.push({
              personId: createdPeople[i].id,
              amount: amount
            });
            
            remainingAmount -= amount;
          }
          
          // Create the associations
          const createdAssociations = await expensePeopleRepository.createAssociations(expenseId, allocations);
          
          // Verify associations were created
          expect(createdAssociations).toHaveLength(allocations.length);
          
          // Retrieve the associations
          const retrievedPeople = await expensePeopleRepository.getPeopleForExpense(expenseId);
          
          // Verify round-trip data integrity
          expect(retrievedPeople).toHaveLength(allocations.length);
          
          // Check that all original allocations are preserved
          for (const originalAllocation of allocations) {
            const retrievedPerson = retrievedPeople.find(p => p.personId === originalAllocation.personId);
            expect(retrievedPerson).toBeDefined();
            expect(retrievedPerson.amount).toBeCloseTo(originalAllocation.amount, 2);
          }
          
          // Verify total allocated amount matches
          const totalAllocated = await expensePeopleRepository.getTotalAllocatedAmount(expenseId);
          expect(totalAllocated).toBeCloseTo(expenseData.totalAmount, 2);
          
          // Verify people information is preserved
          for (const retrievedPerson of retrievedPeople) {
            const originalPerson = createdPeople.find(p => p.id === retrievedPerson.personId);
            expect(originalPerson).toBeDefined();
            expect(retrievedPerson.name).toBe(originalPerson.name);
            expect(retrievedPerson.dateOfBirth).toBe(originalPerson.dateOfBirth);
          }
          
          // Clean up - delete the expense (associations will cascade)
          await new Promise((resolve) => {
            db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
          });
          
          // Clean up people
          for (const person of createdPeople) {
            await peopleRepository.delete(person.id);
          }
        }
      ),
      { numRuns: 30 } // Fewer runs since this test involves complex database operations
    );
  });
});