/**
 * Property-Based Tests for Expense People Repository
 * Tests universal properties of expense-person association storage and retrieval
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
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
        // Generate unique people count (1-4 people)
        fc.integer({ min: 1, max: 4 }),
        // Generate expense data - ensure minimum amount allows for proper splitting
        fc.record({
          totalAmount: fc.double({ min: 1.00, max: 10000, noNaN: true })
        }),
        // Generate allocation amounts that sum to total
        async (peopleCount, expenseData) => {
          // Round total amount to 2 decimal places for consistency
          const totalAmount = Math.round(expenseData.totalAmount * 100) / 100;
          
          // Create people with unique names using timestamp + index
          const createdPeople = [];
          const timestamp = Date.now();
          for (let i = 0; i < peopleCount; i++) {
            const personData = {
              name: `TestPerson_${timestamp}_${i}`,
              dateOfBirth: null
            };
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
                totalAmount,
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
          // Split equally and give remainder to last person
          const allocations = [];
          const baseAmount = Math.floor((totalAmount / createdPeople.length) * 100) / 100;
          let allocatedSoFar = 0;
          
          for (let i = 0; i < createdPeople.length; i++) {
            let amount;
            if (i === createdPeople.length - 1) {
              // Last person gets the remaining amount to ensure exact total
              amount = Math.round((totalAmount - allocatedSoFar) * 100) / 100;
            } else {
              amount = baseAmount;
            }
            
            allocations.push({
              personId: createdPeople[i].id,
              amount: amount
            });
            
            allocatedSoFar += amount;
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
            const retrievedPerson = retrievedPeople.find(p => p.id === originalAllocation.personId);
            expect(retrievedPerson).toBeDefined();
            expect(retrievedPerson.amount).toBeCloseTo(originalAllocation.amount, 2);
          }
          
          // Verify total allocated amount matches
          const totalAllocated = await expensePeopleRepository.getTotalAllocatedAmount(expenseId);
          expect(totalAllocated).toBeCloseTo(totalAmount, 2);
          
          // Verify people information is preserved
          for (const retrievedPerson of retrievedPeople) {
            const originalPerson = createdPeople.find(p => p.id === retrievedPerson.id);
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
      pbtOptions() // Fewer runs since this test involves complex database operations
    );
  });
});