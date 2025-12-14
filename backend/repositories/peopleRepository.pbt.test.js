/**
 * Property-Based Tests for People Repository
 * Tests universal properties of people storage and retrieval
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fc = require('fast-check');
const peopleRepository = require('./peopleRepository');
const { getDatabase } = require('../database/db');

describe('People Repository Property-Based Tests', () => {
  let db;

  beforeEach(async () => {
    db = await getDatabase();
    // Clean up any existing test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expense_people', (err) => {
        if (err) reject(err);
        else {
          db.run('DELETE FROM people', (err) => {
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
          db.run('DELETE FROM people', () => {
            resolve();
          });
        });
      });
    }
  });

  /**
   * **Feature: medical-expense-people-tracking, Property 1: Person data round-trip**
   * **Validates: Requirements 1.3**
   * 
   * For any valid person with name and optional date of birth, 
   * storing then retrieving the person should produce equivalent data
   */
  test('Property 1: Person data round-trip', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate valid person data
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
          dateOfBirth: fc.option(
            fc.date({ min: new Date('1900-01-01'), max: new Date('2025-12-31') })
              .map(date => {
                try {
                  return date.toISOString().split('T')[0];
                } catch (e) {
                  return '2000-01-01'; // fallback for invalid dates
                }
              }),
            { nil: null }
          )
        }),
        async (personData) => {
          // Create the person
          const createdPerson = await peopleRepository.create(personData);
          
          // Verify creation returned expected structure
          expect(createdPerson).toHaveProperty('id');
          expect(typeof createdPerson.id).toBe('number');
          expect(createdPerson.id).toBeGreaterThan(0);
          
          // Retrieve the person by ID
          const retrievedPerson = await peopleRepository.findById(createdPerson.id);
          
          // Verify retrieval was successful
          expect(retrievedPerson).not.toBeNull();
          
          // Verify round-trip data integrity
          expect(retrievedPerson.id).toBe(createdPerson.id);
          expect(retrievedPerson.name).toBe(personData.name);
          expect(retrievedPerson.dateOfBirth).toBe(personData.dateOfBirth);
          
          // Verify timestamps exist and are valid
          expect(retrievedPerson.createdAt).toBeDefined();
          expect(retrievedPerson.updatedAt).toBeDefined();
          
          // Clean up - delete the created person
          const deleted = await peopleRepository.delete(createdPerson.id);
          expect(deleted).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: medical-expense-people-tracking, Property 2: Person deletion cascades to expense associations**
   * **Validates: Requirements 1.4**
   * 
   * For any person with associated medical expenses, deleting the person 
   * should remove all expense-person associations
   */
  test('Property 2: Person deletion cascades to expense associations', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate valid person data
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
          dateOfBirth: fc.option(
            fc.date({ min: new Date('1900-01-01'), max: new Date('2025-12-31') })
              .map(date => {
                try {
                  return date.toISOString().split('T')[0];
                } catch (e) {
                  return '2000-01-01'; // fallback for invalid dates
                }
              }),
            { nil: null }
          )
        }),
        // Generate expense data and amounts for associations
        fc.array(
          fc.record({
            amount: fc.double({ min: 0.01, max: 10000, noNaN: true })
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (personData, expenseAssociations) => {
          // Create the person
          const createdPerson = await peopleRepository.create(personData);
          
          // Create actual expenses first, then create associations
          const expenseIds = [];
          for (let i = 0; i < expenseAssociations.length; i++) {
            const expenseId = await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  '2025-01-01',
                  'Test Medical Provider',
                  'Test medical expense',
                  100.00,
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
            expenseIds.push(expenseId);
            
            // Create expense-person association
            await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO expense_people (expense_id, person_id, amount) VALUES (?, ?, ?)',
                [expenseId, createdPerson.id, expenseAssociations[i].amount],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
          
          // Verify associations were created
          const associationCount = await new Promise((resolve, reject) => {
            db.get(
              'SELECT COUNT(*) as count FROM expense_people WHERE person_id = ?',
              [createdPerson.id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
              }
            );
          });
          
          expect(associationCount).toBe(expenseAssociations.length);
          
          // Delete the person
          const deleted = await peopleRepository.delete(createdPerson.id);
          expect(deleted).toBe(true);
          
          // Verify all expense associations were cascade deleted
          const remainingAssociations = await new Promise((resolve, reject) => {
            db.get(
              'SELECT COUNT(*) as count FROM expense_people WHERE person_id = ?',
              [createdPerson.id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
              }
            );
          });
          
          expect(remainingAssociations).toBe(0);
          
          // Clean up created expenses
          for (const expenseId of expenseIds) {
            await new Promise((resolve) => {
              db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
            });
          }
        }
      ),
      { numRuns: 20 } // Fewer runs since this test involves more database operations
    );
  });
});