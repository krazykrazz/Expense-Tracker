const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const peopleRepository = require('../repositories/peopleRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expenseValidationService = require('./expenseValidationService');
const logger = require('../config/logger');

class ExpensePeopleService {
  constructor() {
    this._facadeMethods = null;
  }

  /**
   * Initialize with facade CRUD methods to avoid circular dependency.
   * Called by expenseService.js during construction.
   * @param {Object} facadeMethods - { createExpense, updateExpense, deleteExpense, getExpenseById,
   *   validateExpense, _validateFutureMonths, _validatePeopleExist, _createSingleExpense, _calculateFutureDate }
   */
  init(facadeMethods) {
    this._facadeMethods = facadeMethods;
  }

  /**
   * Create a new expense with people associations and optional future months
   * @param {Object} expenseData - Expense data
   * @param {Array} personAllocations - Array of {personId, amount} objects
   * @param {number} futureMonths - Number of future months to create (0-12, default 0)
   * @returns {Promise<Object>} Created expense with people data and futureExpenses array
   */
  async createExpenseWithPeople(expenseData, personAllocations = [], futureMonths = 0) {
    const facade = this._facadeMethods;

    // Validate the expense data first
    facade.validateExpense(expenseData);

    // Validate futureMonths parameter
    facade._validateFutureMonths(futureMonths);

    // If people allocations are provided, validate them
    if (personAllocations && personAllocations.length > 0) {
      expenseValidationService.validatePersonAllocations(parseFloat(expenseData.amount), personAllocations);

      // Validate that all people exist in the database
      await facade._validatePeopleExist(personAllocations);
    }

    // Normalize futureMonths to 0 if not provided
    const monthsToCreate = futureMonths || 0;

    // Create the source expense first
    const createdExpense = await facade._createSingleExpense(expenseData);
    const createdExpenseIds = [createdExpense.id];

    // If people allocations are provided, create the associations for source expense
    if (personAllocations && personAllocations.length > 0) {
      await expensePeopleRepository.createAssociations(
        createdExpense.id,
        personAllocations
      );
    }

    // If no future months requested, return simple response
    if (monthsToCreate === 0) {
      // Fetch full people data including names for the response
      if (personAllocations && personAllocations.length > 0) {
        const peopleByExpense = await expensePeopleRepository.getPeopleForExpenses([createdExpense.id]);
        const people = peopleByExpense[createdExpense.id] || [];
        return {
          ...createdExpense,
          people
        };
      }
      return createdExpense;
    }

    // Create future expenses with people allocations
    const futureExpenses = [];

    try {
      for (let i = 1; i <= monthsToCreate; i++) {
        const futureDate = facade._calculateFutureDate(expenseData.date, i);

        // Create future expense with same data but different date
        const futureExpenseData = {
          ...expenseData,
          date: futureDate
        };

        const futureExpense = await facade._createSingleExpense(futureExpenseData);
        createdExpenseIds.push(futureExpense.id);

        // Copy people allocations for medical expenses (Requirement 1.8)
        // Note: Invoices are NOT copied (Requirement 1.9)
        if (personAllocations && personAllocations.length > 0) {
          await expensePeopleRepository.createAssociations(
            futureExpense.id,
            personAllocations
          );
        }

        futureExpenses.push(futureExpense);
      }
    } catch (error) {
      // Rollback: delete all created expenses on error (atomicity)
      for (const expenseId of createdExpenseIds) {
        try {
          await expenseRepository.delete(expenseId);
        } catch (deleteError) {
          // Log but continue cleanup
          logger.error('Error during rollback cleanup:', deleteError);
        }
      }
      throw new Error('Failed to create future expenses. Please try again.');
    }

    // Fetch full people data for all expenses
    const allExpenseIds = [createdExpense.id, ...futureExpenses.map(e => e.id)];
    const peopleByExpense = await expensePeopleRepository.getPeopleForExpenses(allExpenseIds);

    // Attach people data to source expense
    const sourceWithPeople = {
      ...createdExpense,
      people: peopleByExpense[createdExpense.id] || []
    };

    // Attach people data to future expenses
    const futureWithPeople = futureExpenses.map(expense => ({
      ...expense,
      people: peopleByExpense[expense.id] || []
    }));

    // Return response with source expense and futureExpenses array
    return {
      expense: sourceWithPeople,
      futureExpenses: futureWithPeople
    };
  }

  /**
   * Update an expense with people associations and optional future months
   * @param {number} id - Expense ID
   * @param {Object} expenseData - Updated expense data
   * @param {Array} personAllocations - Array of {personId, amount} objects
   * @param {number} futureMonths - Number of future months to create (0-12, default 0)
   * @returns {Promise<Object|null>} Updated expense with people data and futureExpenses array or null
   */
  async updateExpenseWithPeople(id, expenseData, personAllocations = [], futureMonths = 0) {
    const facade = this._facadeMethods;

    // Validate the expense data first
    facade.validateExpense(expenseData);

    // Validate futureMonths parameter
    facade._validateFutureMonths(futureMonths);

    // If people allocations are provided, validate them
    if (personAllocations && personAllocations.length > 0) {
      expenseValidationService.validatePersonAllocations(parseFloat(expenseData.amount), personAllocations);

      // Validate that all people exist in the database
      await facade._validatePeopleExist(personAllocations);
    }

    // Normalize futureMonths to 0 if not provided
    const monthsToCreate = futureMonths || 0;

    // Update the expense first (without futureMonths to avoid double creation)
    const updatedExpense = await facade.updateExpense(id, expenseData, 0);

    if (!updatedExpense) {
      return null;
    }

    // Update people associations for the updated expense
    await expensePeopleRepository.updateExpenseAllocations(
      id,
      personAllocations || []
    );

    // If no future months requested, return simple response
    if (monthsToCreate === 0) {
      // Fetch full people data including names for the response
      const peopleByExpense = await expensePeopleRepository.getPeopleForExpenses([id]);
      const people = peopleByExpense[id] || [];

      // Return expense with complete people data (including names)
      return {
        ...updatedExpense,
        people
      };
    }

    // Create future expenses with updated values and people allocations (Requirement 2.3, 2.4)
    const futureExpenses = [];
    const createdExpenseIds = [];

    try {
      for (let i = 1; i <= monthsToCreate; i++) {
        const futureDate = facade._calculateFutureDate(expenseData.date, i);

        // Create future expense with updated values
        const futureExpenseData = {
          ...expenseData,
          date: futureDate
        };

        const futureExpense = await facade._createSingleExpense(futureExpenseData);
        createdExpenseIds.push(futureExpense.id);

        // Copy people allocations for medical expenses (Requirement 1.8)
        // Note: Invoices are NOT copied (Requirement 1.9)
        if (personAllocations && personAllocations.length > 0) {
          await expensePeopleRepository.createAssociations(
            futureExpense.id,
            personAllocations
          );
        }

        futureExpenses.push(futureExpense);
      }
    } catch (error) {
      // Rollback: delete all created future expenses on error (atomicity)
      for (const expenseId of createdExpenseIds) {
        try {
          await expenseRepository.delete(expenseId);
        } catch (deleteError) {
          // Log but continue cleanup
          logger.error('Error during rollback cleanup:', deleteError);
        }
      }
      throw new Error('Failed to create future expenses. Please try again.');
    }

    // Fetch full people data for all expenses
    const allExpenseIds = [id, ...futureExpenses.map(e => e.id)];
    const peopleByExpense = await expensePeopleRepository.getPeopleForExpenses(allExpenseIds);

    // Attach people data to updated expense
    const updatedWithPeople = {
      ...updatedExpense,
      people: peopleByExpense[id] || []
    };

    // Attach people data to future expenses
    const futureWithPeople = futureExpenses.map(expense => ({
      ...expense,
      people: peopleByExpense[expense.id] || []
    }));

    // Return response with updated expense and futureExpenses array
    return {
      expense: updatedWithPeople,
      futureExpenses: futureWithPeople
    };
  }

  /**
   * Get an expense with associated people data
   * @param {number} id - Expense ID
   * @returns {Promise<Object|null>} Expense with people data or null
   */
  async getExpenseWithPeople(id) {
    const facade = this._facadeMethods;

    // Get the expense first
    const expense = await facade.getExpenseById(id);

    if (!expense) {
      return null;
    }

    // Get associated people
    const people = await expensePeopleRepository.getPeopleForExpense(id);

    // Return expense with people data
    // Note: Repository now returns 'id' for frontend compatibility
    return {
      ...expense,
      people: people.map(person => ({
        id: person.id,
        name: person.name,
        dateOfBirth: person.dateOfBirth,
        amount: person.amount,
        originalAmount: person.originalAmount
      }))
    };
  }

  /**
   * Group expenses by person for tax reporting
   * Only includes medical expenses since person grouping is for medical expense tracking
   * @param {Array} expenses - Array of expenses with people associations
   * @returns {Object} Expenses grouped by person ID
   */
  groupExpensesByPerson(expenses) {
    const grouped = {};

    // Filter to only medical expenses - person grouping is specifically for medical expense tracking
    const medicalExpenses = expenses.filter(exp => exp.type === 'Tax - Medical');

    medicalExpenses.forEach(expense => {
      if (expense.people && expense.people.length > 0) {
        expense.people.forEach(person => {
          // Initialize person group if not exists
          // Note: person.id comes from the repository (was personId, now id for frontend compatibility)
          if (!grouped[person.id]) {
            grouped[person.id] = {
              personId: person.id,  // Keep personId in output for backward compatibility with tax reports
              personName: person.name,
              providers: {},
              total: 0
            };
          }

          // Initialize provider group if not exists
          const provider = expense.place || 'Unknown Provider';
          if (!grouped[person.id].providers[provider]) {
            grouped[person.id].providers[provider] = {
              providerName: provider,
              expenses: [],
              total: 0
            };
          }

          // Ensure expenses array exists before pushing
          if (!grouped[person.id].providers[provider].expenses) {
            grouped[person.id].providers[provider].expenses = [];
          }

          // Add expense to provider group
          grouped[person.id].providers[provider].expenses.push({
            ...expense,
            allocatedAmount: person.amount,
            originalAmount: person.originalAmount
          });
          grouped[person.id].providers[provider].total += person.amount;
          grouped[person.id].total += person.amount;
        });
      }
    });

    // Convert providers object to array for easier frontend consumption
    Object.keys(grouped).forEach(personId => {
      grouped[personId].providers = Object.values(grouped[personId].providers);
      grouped[personId].total = parseFloat(grouped[personId].total.toFixed(2));

      // Sort providers by total amount (descending)
      grouped[personId].providers.sort((a, b) => b.total - a.total);

      // Round provider totals
      grouped[personId].providers.forEach(provider => {
        provider.total = parseFloat(provider.total.toFixed(2));
      });
    });

    return grouped;
  }

  /**
   * Calculate per-person totals from expenses
   * @param {Array} expenses - Array of expenses with people associations
   * @returns {Object} Person totals by person ID
   */
  calculatePersonTotals(expenses) {
    const totals = {};

    expenses.forEach(expense => {
      if (expense.people && expense.people.length > 0) {
        expense.people.forEach(person => {
          // Note: person.id comes from the repository (was personId, now id for frontend compatibility)
          if (!totals[person.id]) {
            totals[person.id] = {
              personId: person.id,  // Keep personId in output for backward compatibility
              personName: person.name,
              medicalTotal: 0,
              donationTotal: 0,
              total: 0
            };
          }

          const amount = person.amount;
          if (expense.type === 'Tax - Medical') {
            totals[person.id].medicalTotal += amount;
          } else if (expense.type === 'Tax - Donation') {
            totals[person.id].donationTotal += amount;
          }
          totals[person.id].total += amount;
        });
      }
    });

    // Round all totals
    Object.keys(totals).forEach(personId => {
      totals[personId].medicalTotal = parseFloat(totals[personId].medicalTotal.toFixed(2));
      totals[personId].donationTotal = parseFloat(totals[personId].donationTotal.toFixed(2));
      totals[personId].total = parseFloat(totals[personId].total.toFixed(2));
    });

    return totals;
  }

  /**
   * Handle unassigned expenses (medical expenses without people associations)
   * Only includes medical expenses since person assignment is for medical expense tracking
   * @param {Array} expenses - Array of expenses with people associations
   * @returns {Object} Unassigned expenses grouped by provider
   */
  handleUnassignedExpenses(expenses) {
    // Filter to only medical expenses without people associations
    const unassigned = expenses.filter(
      expense => expense.type === 'Tax - Medical' && (!expense.people || expense.people.length === 0)
    );

    const groupedByProvider = {};
    let totalUnassigned = 0;

    unassigned.forEach(expense => {
      const provider = expense.place || 'Unknown Provider';

      if (!groupedByProvider[provider]) {
        groupedByProvider[provider] = {
          providerName: provider,
          expenses: [],
          total: 0
        };
      }

      groupedByProvider[provider].expenses.push(expense);
      groupedByProvider[provider].total += expense.amount;
      totalUnassigned += expense.amount;
    });

    // Convert to array and round totals
    const providers = Object.values(groupedByProvider);
    providers.forEach(provider => {
      provider.total = parseFloat(provider.total.toFixed(2));
    });

    // Sort providers by total amount (descending)
    providers.sort((a, b) => b.total - a.total);

    return {
      providers,
      total: parseFloat(totalUnassigned.toFixed(2)),
      count: unassigned.length
    };
  }
}

module.exports = new ExpensePeopleService();
