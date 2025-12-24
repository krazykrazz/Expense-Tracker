const { getDatabase } = require('../database/db');
const peopleService = require('./peopleService');
const expenseService = require('./expenseService');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');

/**
 * End-to-End Integration Tests for Medical Expense People Tracking
 * 
 * These tests verify the complete people management flow:
 * - Creating people
 * - Creating medical expenses with people associations
 * - Viewing in tax deductible summary
 * - Editing person details
 * - Verifying updates in expense displays
 * 
 * Requirements: All people management requirements (1.1-1.5, 2.1-2.5, 3.1-3.5)
 */

describe('Medical Expense People Tracking - End-to-End Integration Tests', () => {
  let db;
  const testYear = 2095; // Use future year to avoid conflicts

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    try {
      // Delete expense_people associations first (due to foreign key)
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM expense_people WHERE expense_id IN (
          SELECT id FROM expenses WHERE strftime('%Y', date) = '${testYear}'
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Delete test expenses
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${testYear}'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Delete test people (names starting with 'Test_')
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM people WHERE name LIKE 'Test_%'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Reset auto-increment sequences
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM sqlite_sequence WHERE name IN ('expenses', 'people', 'expense_people')`, (err) => {
          if (err && !err.message.includes('no such table')) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  /**
   * Test 18.1: Complete people management flow
   * Requirements: All people management requirements
   * 
   * This test verifies the complete lifecycle:
   * 1. Create person
   * 2. Create medical expense with person
   * 3. View in tax deductible summary
   * 4. Edit person details
   * 5. Verify updates in expense displays
   */
  describe('18.1 Complete People Management Flow', () => {
    test('should handle complete people management lifecycle', async () => {
      // Step 1: Create person
      const person = await peopleService.createPerson('Test_John_Doe', '1990-05-15');
      
      expect(person).toBeDefined();
      expect(person.id).toBeDefined();
      expect(person.name).toBe('Test_John_Doe');
      // Note: Repository returns date_of_birth, service may return dateOfBirth
      expect(person.date_of_birth || person.dateOfBirth).toBe('1990-05-15');

      // Verify person can be retrieved
      const retrievedPerson = await peopleService.getPersonById(person.id);
      expect(retrievedPerson).toBeDefined();
      expect(retrievedPerson.name).toBe('Test_John_Doe');

      // Step 2: Create medical expense with person
      const dateStr = `${testYear}-06-15`;
      const expense = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 150.00,
          method: 'Debit',
          place: 'Test Medical Clinic',
          notes: 'Annual checkup'
        },
        [{ personId: person.id, amount: 150.00 }]
      );

      expect(expense).toBeDefined();
      expect(expense.id).toBeDefined();
      expect(expense.type).toBe('Tax - Medical');
      expect(expense.amount).toBe(150.00);
      expect(expense.people).toBeDefined();
      expect(expense.people.length).toBe(1);
      expect(expense.people[0].personId).toBe(person.id);
      expect(expense.people[0].amount).toBe(150.00);

      // Step 3: View in tax deductible summary
      const taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      
      expect(taxSummary).toBeDefined();
      expect(taxSummary.year).toBe(testYear);
      expect(taxSummary.medicalTotal).toBe(150.00);
      
      // Verify person grouping
      expect(taxSummary.groupedByPerson).toBeDefined();
      expect(taxSummary.groupedByPerson[person.id]).toBeDefined();
      expect(taxSummary.groupedByPerson[person.id].personName).toBe('Test_John_Doe');
      expect(taxSummary.groupedByPerson[person.id].total).toBe(150.00);
      
      // Verify provider grouping within person
      const personGroup = taxSummary.groupedByPerson[person.id];
      expect(personGroup.providers).toBeDefined();
      expect(personGroup.providers.length).toBe(1);
      expect(personGroup.providers[0].providerName).toBe('Test Medical Clinic');
      expect(personGroup.providers[0].total).toBe(150.00);

      // Verify person totals
      expect(taxSummary.personTotals).toBeDefined();
      expect(taxSummary.personTotals[person.id]).toBeDefined();
      expect(taxSummary.personTotals[person.id].medicalTotal).toBe(150.00);

      // Step 4: Edit person details
      const updatedPerson = await peopleService.updatePerson(
        person.id,
        'Test_John_Smith',
        '1990-05-15'
      );

      expect(updatedPerson).toBeDefined();
      expect(updatedPerson.name).toBe('Test_John_Smith');

      // Step 5: Verify updates in expense displays
      const expenseWithPeople = await expenseService.getExpenseWithPeople(expense.id);
      
      expect(expenseWithPeople).toBeDefined();
      expect(expenseWithPeople.people).toBeDefined();
      expect(expenseWithPeople.people.length).toBe(1);
      expect(expenseWithPeople.people[0].name).toBe('Test_John_Smith');

      // Verify tax summary also reflects the updated name
      const updatedTaxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      expect(updatedTaxSummary.groupedByPerson[person.id].personName).toBe('Test_John_Smith');

      // Clean up
      await expenseService.deleteExpense(expense.id);
      await peopleService.deletePerson(person.id);
    });

    test('should handle multiple people with multiple expenses', async () => {
      // Create multiple people
      const person1 = await peopleService.createPerson('Test_Alice', '1985-03-20');
      const person2 = await peopleService.createPerson('Test_Bob', '1987-07-10');

      // Create multiple medical expenses for different people
      const dateStr = `${testYear}-07-15`;
      
      const expense1 = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 200.00,
          method: 'Debit',
          place: 'Test Hospital',
          notes: 'Alice checkup'
        },
        [{ personId: person1.id, amount: 200.00 }]
      );

      const expense2 = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 300.00,
          method: 'Cash',
          place: 'Test Pharmacy',
          notes: 'Bob prescription'
        },
        [{ personId: person2.id, amount: 300.00 }]
      );

      // Verify tax summary shows both people
      const taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      
      expect(taxSummary.medicalTotal).toBe(500.00);
      expect(taxSummary.groupedByPerson[person1.id]).toBeDefined();
      expect(taxSummary.groupedByPerson[person2.id]).toBeDefined();
      expect(taxSummary.groupedByPerson[person1.id].total).toBe(200.00);
      expect(taxSummary.groupedByPerson[person2.id].total).toBe(300.00);

      // Clean up
      await expenseService.deleteExpense(expense1.id);
      await expenseService.deleteExpense(expense2.id);
      await peopleService.deletePerson(person1.id);
      await peopleService.deletePerson(person2.id);
    });

    test('should handle person deletion with cascade to expense associations', async () => {
      // Create person
      const person = await peopleService.createPerson('Test_ToDelete', '1995-01-01');

      // Create medical expense with person
      const dateStr = `${testYear}-08-15`;
      const expense = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 100.00,
          method: 'Debit',
          place: 'Test Clinic',
          notes: 'Test expense'
        },
        [{ personId: person.id, amount: 100.00 }]
      );

      // Verify association exists
      const peopleForExpense = await expensePeopleRepository.getPeopleForExpense(expense.id);
      expect(peopleForExpense.length).toBe(1);

      // Delete person
      const deleteResult = await peopleService.deletePerson(person.id);
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.cascadeInfo.hadAssociatedExpenses).toBe(true);

      // Verify association was removed (cascade delete)
      const peopleAfterDelete = await expensePeopleRepository.getPeopleForExpense(expense.id);
      expect(peopleAfterDelete.length).toBe(0);

      // Verify expense still exists but without people
      const expenseAfterDelete = await expenseService.getExpenseWithPeople(expense.id);
      expect(expenseAfterDelete).toBeDefined();
      expect(expenseAfterDelete.people.length).toBe(0);

      // Clean up
      await expenseService.deleteExpense(expense.id);
    });
  });


  /**
   * Test 18.2: Expense allocation flow
   * Requirements: All allocation requirements (2.1-2.5, 4.1-4.5)
   * 
   * This test verifies:
   * 1. Create multi-person medical expense
   * 2. Allocate amounts across people
   * 3. Verify storage and retrieval
   * 4. View in person-grouped tax summary
   */
  describe('18.2 Expense Allocation Flow', () => {
    test('should handle multi-person expense allocation correctly', async () => {
      // Create multiple people
      const person1 = await peopleService.createPerson('Test_Parent', '1970-01-15');
      const person2 = await peopleService.createPerson('Test_Child', '2010-06-20');

      // Step 1 & 2: Create multi-person medical expense with allocations
      const dateStr = `${testYear}-09-15`;
      const totalAmount = 500.00;
      const allocations = [
        { personId: person1.id, amount: 300.00 },
        { personId: person2.id, amount: 200.00 }
      ];

      const expense = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: totalAmount,
          method: 'CIBC MC',
          place: 'Test Family Clinic',
          notes: 'Family visit'
        },
        allocations
      );

      expect(expense).toBeDefined();
      expect(expense.id).toBeDefined();
      expect(expense.amount).toBe(totalAmount);
      expect(expense.people).toBeDefined();
      expect(expense.people.length).toBe(2);

      // Step 3: Verify storage and retrieval
      const retrievedExpense = await expenseService.getExpenseWithPeople(expense.id);
      
      expect(retrievedExpense).toBeDefined();
      expect(retrievedExpense.people.length).toBe(2);
      
      // Verify allocations are correct
      const person1Allocation = retrievedExpense.people.find(p => p.personId === person1.id);
      const person2Allocation = retrievedExpense.people.find(p => p.personId === person2.id);
      
      expect(person1Allocation).toBeDefined();
      expect(person1Allocation.amount).toBe(300.00);
      expect(person1Allocation.name).toBe('Test_Parent');
      
      expect(person2Allocation).toBeDefined();
      expect(person2Allocation.amount).toBe(200.00);
      expect(person2Allocation.name).toBe('Test_Child');

      // Step 4: View in person-grouped tax summary
      const taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      
      expect(taxSummary.medicalTotal).toBe(totalAmount);
      
      // Verify both people appear in grouped view
      expect(taxSummary.groupedByPerson[person1.id]).toBeDefined();
      expect(taxSummary.groupedByPerson[person2.id]).toBeDefined();
      
      // Verify allocated amounts in person groups
      expect(taxSummary.groupedByPerson[person1.id].total).toBe(300.00);
      expect(taxSummary.groupedByPerson[person2.id].total).toBe(200.00);
      
      // Verify person totals
      expect(taxSummary.personTotals[person1.id].medicalTotal).toBe(300.00);
      expect(taxSummary.personTotals[person2.id].medicalTotal).toBe(200.00);

      // Clean up
      await expenseService.deleteExpense(expense.id);
      await peopleService.deletePerson(person1.id);
      await peopleService.deletePerson(person2.id);
    });

    test('should handle equal split allocation', async () => {
      // Create people
      const person1 = await peopleService.createPerson('Test_Sibling1', '2000-01-01');
      const person2 = await peopleService.createPerson('Test_Sibling2', '2002-01-01');
      const person3 = await peopleService.createPerson('Test_Sibling3', '2004-01-01');

      // Create expense with equal split
      const dateStr = `${testYear}-10-15`;
      const totalAmount = 300.00;
      const equalAmount = 100.00; // 300 / 3

      const expense = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: totalAmount,
          method: 'Debit',
          place: 'Test Dental Office',
          notes: 'Family dental'
        },
        [
          { personId: person1.id, amount: equalAmount },
          { personId: person2.id, amount: equalAmount },
          { personId: person3.id, amount: equalAmount }
        ]
      );

      // Verify all allocations
      const retrievedExpense = await expenseService.getExpenseWithPeople(expense.id);
      expect(retrievedExpense.people.length).toBe(3);
      
      retrievedExpense.people.forEach(person => {
        expect(person.amount).toBe(equalAmount);
      });

      // Verify tax summary
      const taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      expect(taxSummary.personTotals[person1.id].medicalTotal).toBe(equalAmount);
      expect(taxSummary.personTotals[person2.id].medicalTotal).toBe(equalAmount);
      expect(taxSummary.personTotals[person3.id].medicalTotal).toBe(equalAmount);

      // Clean up
      await expenseService.deleteExpense(expense.id);
      await peopleService.deletePerson(person1.id);
      await peopleService.deletePerson(person2.id);
      await peopleService.deletePerson(person3.id);
    });

    test('should handle updating expense allocations', async () => {
      // Create people
      const person1 = await peopleService.createPerson('Test_UpdatePerson1', '1980-01-01');
      const person2 = await peopleService.createPerson('Test_UpdatePerson2', '1982-01-01');

      // Create initial expense with single person
      const dateStr = `${testYear}-11-15`;
      const expense = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 400.00,
          method: 'Cash',
          place: 'Test Eye Clinic',
          notes: 'Eye exam'
        },
        [{ personId: person1.id, amount: 400.00 }]
      );

      // Verify initial state
      let retrievedExpense = await expenseService.getExpenseWithPeople(expense.id);
      expect(retrievedExpense.people.length).toBe(1);
      expect(retrievedExpense.people[0].personId).toBe(person1.id);

      // Update to split between two people
      const updatedExpense = await expenseService.updateExpenseWithPeople(
        expense.id,
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 400.00,
          method: 'Cash',
          place: 'Test Eye Clinic',
          notes: 'Eye exam - updated'
        },
        [
          { personId: person1.id, amount: 250.00 },
          { personId: person2.id, amount: 150.00 }
        ]
      );

      // Verify updated allocations
      retrievedExpense = await expenseService.getExpenseWithPeople(expense.id);
      expect(retrievedExpense.people.length).toBe(2);
      
      const p1Alloc = retrievedExpense.people.find(p => p.personId === person1.id);
      const p2Alloc = retrievedExpense.people.find(p => p.personId === person2.id);
      
      expect(p1Alloc.amount).toBe(250.00);
      expect(p2Alloc.amount).toBe(150.00);

      // Clean up
      await expenseService.deleteExpense(expense.id);
      await peopleService.deletePerson(person1.id);
      await peopleService.deletePerson(person2.id);
    });

    test('should reject invalid allocation amounts', async () => {
      const person = await peopleService.createPerson('Test_InvalidAlloc', '1990-01-01');

      const dateStr = `${testYear}-12-15`;

      // Try to create expense with allocation that doesn't match total
      await expect(
        expenseService.createExpenseWithPeople(
          {
            date: dateStr,
            type: 'Tax - Medical',
            amount: 200.00,
            method: 'Debit',
            place: 'Test Clinic',
            notes: 'Test'
          },
          [{ personId: person.id, amount: 150.00 }] // Doesn't match 200.00
        )
      ).rejects.toThrow(/must equal expense amount/);

      // Clean up
      await peopleService.deletePerson(person.id);
    });
  });

  /**
   * Test 18.3: Backward compatibility
   * Requirements: All backward compatibility requirements (5.1-5.5, 6.1-6.5)
   * 
   * This test verifies:
   * 1. Test existing medical expenses without people
   * 2. Verify they display as "Unassigned"
   * 3. Add people to existing expense
   * 4. Verify updated display
   */
  describe('18.3 Backward Compatibility', () => {
    test('should handle existing medical expenses without people', async () => {
      // Step 1: Create medical expense WITHOUT people (simulating existing data)
      const dateStr = `${testYear}-01-15`;
      const expense = await expenseService.createExpense({
        date: dateStr,
        type: 'Tax - Medical',
        amount: 250.00,
        method: 'Debit',
        place: 'Test Legacy Clinic',
        notes: 'Legacy expense without people'
      });

      expect(expense).toBeDefined();
      expect(expense.id).toBeDefined();

      // Step 2: Verify it displays as "Unassigned" in tax summary
      const taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      
      expect(taxSummary.unassignedExpenses).toBeDefined();
      expect(taxSummary.unassignedExpenses.count).toBeGreaterThan(0);
      expect(taxSummary.unassignedExpenses.total).toBe(250.00);
      
      // Verify the expense is in unassigned providers
      const unassignedProvider = taxSummary.unassignedExpenses.providers.find(
        p => p.providerName === 'Test Legacy Clinic'
      );
      expect(unassignedProvider).toBeDefined();
      expect(unassignedProvider.total).toBe(250.00);

      // Verify expense is retrievable without people
      const retrievedExpense = await expenseService.getExpenseWithPeople(expense.id);
      expect(retrievedExpense).toBeDefined();
      expect(retrievedExpense.people).toBeDefined();
      expect(retrievedExpense.people.length).toBe(0);

      // Clean up
      await expenseService.deleteExpense(expense.id);
    });

    test('should allow adding people to existing expense retroactively', async () => {
      // Create person
      const person = await peopleService.createPerson('Test_Retroactive', '1988-05-05');

      // Step 1: Create medical expense WITHOUT people
      const dateStr = `${testYear}-02-15`;
      const expense = await expenseService.createExpense({
        date: dateStr,
        type: 'Tax - Medical',
        amount: 175.00,
        method: 'Cash',
        place: 'Test Old Clinic',
        notes: 'Expense to be updated'
      });

      // Verify initially unassigned
      let taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      expect(taxSummary.unassignedExpenses.count).toBeGreaterThan(0);

      // Step 3: Add people to existing expense
      const updatedExpense = await expenseService.updateExpenseWithPeople(
        expense.id,
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 175.00,
          method: 'Cash',
          place: 'Test Old Clinic',
          notes: 'Expense to be updated'
        },
        [{ personId: person.id, amount: 175.00 }]
      );

      expect(updatedExpense).toBeDefined();
      expect(updatedExpense.people.length).toBe(1);

      // Step 4: Verify updated display
      taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      
      // Should now appear in person grouping
      expect(taxSummary.groupedByPerson[person.id]).toBeDefined();
      expect(taxSummary.groupedByPerson[person.id].total).toBe(175.00);
      
      // Should no longer be in unassigned (or reduced count)
      const unassignedForThisProvider = taxSummary.unassignedExpenses.providers.find(
        p => p.providerName === 'Test Old Clinic'
      );
      expect(unassignedForThisProvider).toBeUndefined();

      // Clean up
      await expenseService.deleteExpense(expense.id);
      await peopleService.deletePerson(person.id);
    });

    test('should handle mixed assigned and unassigned expenses in reports', async () => {
      // Create person
      const person = await peopleService.createPerson('Test_Mixed', '1992-08-15');

      const dateStr = `${testYear}-03-15`;

      // Create assigned expense
      const assignedExpense = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 100.00,
          method: 'Debit',
          place: 'Test Assigned Clinic',
          notes: 'Assigned expense'
        },
        [{ personId: person.id, amount: 100.00 }]
      );

      // Create unassigned expense
      const unassignedExpense = await expenseService.createExpense({
        date: dateStr,
        type: 'Tax - Medical',
        amount: 50.00,
        method: 'Cash',
        place: 'Test Unassigned Clinic',
        notes: 'Unassigned expense'
      });

      // Verify tax summary handles both correctly
      const taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      
      // Total should include both
      expect(taxSummary.medicalTotal).toBe(150.00);
      
      // Assigned expense should be in person grouping
      expect(taxSummary.groupedByPerson[person.id]).toBeDefined();
      expect(taxSummary.groupedByPerson[person.id].total).toBe(100.00);
      
      // Unassigned expense should be in unassigned section
      expect(taxSummary.unassignedExpenses.total).toBe(50.00);
      expect(taxSummary.unassignedExpenses.count).toBe(1);

      // Clean up
      await expenseService.deleteExpense(assignedExpense.id);
      await expenseService.deleteExpense(unassignedExpense.id);
      await peopleService.deletePerson(person.id);
    });

    test('should preserve expense data when removing people associations', async () => {
      // Create person
      const person = await peopleService.createPerson('Test_Remove', '1975-12-25');

      // Create expense with person
      const dateStr = `${testYear}-04-15`;
      const expense = await expenseService.createExpenseWithPeople(
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 225.00,
          method: 'Debit',
          place: 'Test Remove Clinic',
          notes: 'Test removal'
        },
        [{ personId: person.id, amount: 225.00 }]
      );

      // Verify initially assigned
      let retrievedExpense = await expenseService.getExpenseWithPeople(expense.id);
      expect(retrievedExpense.people.length).toBe(1);

      // Remove people associations by updating with empty array
      await expenseService.updateExpenseWithPeople(
        expense.id,
        {
          date: dateStr,
          type: 'Tax - Medical',
          amount: 225.00,
          method: 'Debit',
          place: 'Test Remove Clinic',
          notes: 'Test removal'
        },
        [] // Empty allocations
      );

      // Verify expense still exists but without people
      retrievedExpense = await expenseService.getExpenseWithPeople(expense.id);
      expect(retrievedExpense).toBeDefined();
      expect(retrievedExpense.amount).toBe(225.00);
      expect(retrievedExpense.people.length).toBe(0);

      // Verify it now appears as unassigned
      const taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      const unassignedProvider = taxSummary.unassignedExpenses.providers.find(
        p => p.providerName === 'Test Remove Clinic'
      );
      expect(unassignedProvider).toBeDefined();
      expect(unassignedProvider.total).toBe(225.00);

      // Clean up
      await expenseService.deleteExpense(expense.id);
      await peopleService.deletePerson(person.id);
    });

    test('should handle donation expenses without people (non-medical)', async () => {
      // Create donation expense (donations typically don't need people tracking)
      const dateStr = `${testYear}-05-15`;
      const donation = await expenseService.createExpense({
        date: dateStr,
        type: 'Tax - Donation',
        amount: 500.00,
        method: 'Cheque',
        place: 'Test Charity',
        notes: 'Annual donation'
      });

      // Verify it appears in tax summary
      const taxSummary = await expenseService.getTaxDeductibleWithPeople(testYear);
      
      expect(taxSummary.donationTotal).toBe(500.00);
      expect(taxSummary.expenses.donations.length).toBe(1);
      expect(taxSummary.expenses.donations[0].place).toBe('Test Charity');

      // Clean up
      await expenseService.deleteExpense(donation.id);
    });
  });
});
