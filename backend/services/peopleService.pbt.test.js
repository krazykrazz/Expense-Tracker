/**
 * Property-Based Tests for People Service
 * Tests universal properties of people management business logic
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const peopleService = require('./peopleService');
const { getDatabase } = require('../database/db');

describe('People Service Property-Based Tests', () => {
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
            else {
              db.run('DELETE FROM expenses WHERE type = ?', ['Tax - Medical'], (err) => {
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
          db.run('DELETE FROM people', () => {
            db.run('DELETE FROM expenses WHERE type = ?', ['Tax - Medical'], () => {
              resolve();
            });
          });
        });
      });
    }
  });

  /**
   * **Feature: medical-expense-people-tracking, Property 3: Person updates propagate to associated expenses**
   * **Validates: Requirements 1.5**
   * 
   * For any person with associated expenses, updating the person's information 
   * should reflect in all expense associations
   */
  test('Property 3: Person updates propagate to associated expenses', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate initial person data
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
          dateOfBirth: fc.option(
            fc.date({ min: new Date('1900-01-01'), max: new Date() }) // max is today
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
        // Generate updated person data
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
          dateOfBirth: fc.option(
            fc.date({ min: new Date('1900-01-01'), max: new Date() }) // max is today
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
        // Generate expense associations
        fc.array(
          fc.record({
            amount: fc.double({ min: 0.01, max: 10000, noNaN: true })
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (initialPersonData, updatedPersonData, expenseAssociations) => {
          // Create the initial person
          const createdPerson = await peopleService.createPerson(
            initialPersonData.name, 
            initialPersonData.dateOfBirth
          );
          
          // Create medical expenses and associate them with the person
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
          
          // Verify initial associations exist
          const initialAssociationCount = await new Promise((resolve, reject) => {
            db.get(
              'SELECT COUNT(*) as count FROM expense_people WHERE person_id = ?',
              [createdPerson.id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
              }
            );
          });
          
          expect(initialAssociationCount).toBe(expenseAssociations.length);
          
          // Update the person's information
          const updatedPerson = await peopleService.updatePerson(
            createdPerson.id,
            updatedPersonData.name,
            updatedPersonData.dateOfBirth
          );
          
          // Verify update was successful
          expect(updatedPerson).not.toBeNull();
          expect(updatedPerson.name).toBe(updatedPersonData.name.trim()); // Service trims whitespace
          expect(updatedPerson.dateOfBirth).toBe(updatedPersonData.dateOfBirth);
          
          // Verify the person can still be retrieved with updated information
          const retrievedPerson = await peopleService.getPersonById(createdPerson.id);
          expect(retrievedPerson).not.toBeNull();
          expect(retrievedPerson.name).toBe(updatedPersonData.name.trim()); // Service trims whitespace
          expect(retrievedPerson.dateOfBirth).toBe(updatedPersonData.dateOfBirth);
          
          // Verify all expense associations still exist and reference the same person
          const finalAssociationCount = await new Promise((resolve, reject) => {
            db.get(
              'SELECT COUNT(*) as count FROM expense_people WHERE person_id = ?',
              [createdPerson.id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
              }
            );
          });
          
          expect(finalAssociationCount).toBe(expenseAssociations.length);
          
          // Verify that when we query expenses with people, we get the updated person information
          const expenseWithPeople = await new Promise((resolve, reject) => {
            db.all(
              `SELECT ep.expense_id, ep.amount, p.name, p.date_of_birth 
               FROM expense_people ep 
               JOIN people p ON ep.person_id = p.id 
               WHERE ep.person_id = ?`,
              [createdPerson.id],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              }
            );
          });
          
          // Verify all associations show updated person information
          expect(expenseWithPeople).toHaveLength(expenseAssociations.length);
          expenseWithPeople.forEach(row => {
            expect(row.name).toBe(updatedPersonData.name.trim()); // Service trims whitespace
            expect(row.date_of_birth).toBe(updatedPersonData.dateOfBirth);
          });
          
          // Clean up - delete the person (cascade will handle associations)
          const deleteResult = await peopleService.deletePerson(createdPerson.id);
          expect(deleteResult.success).toBe(true);
          
          // Clean up created expenses
          for (const expenseId of expenseIds) {
            await new Promise((resolve) => {
              db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
            });
          }
        }
      ),
      pbtOptions() // Fewer runs since this test involves more database operations
    );
  });
});