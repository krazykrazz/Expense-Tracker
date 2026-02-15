const peopleRepository = require('../repositories/peopleRepository');
const activityLogService = require('./activityLogService');
const logger = require('../config/logger');

class PeopleService {
  /**
   * Validate person data
   * @param {Object} person - Person data to validate
   * @throws {Error} If validation fails
   */
  validatePerson(person) {
    const errors = [];

    // Required fields validation
    if (!person.name || person.name.trim() === '') {
      errors.push('Name is required and cannot be empty');
    }

    // String length validation
    if (person.name && person.name.length > 100) {
      errors.push('Name must not exceed 100 characters');
    }

    // Date of birth validation (if provided)
    if (person.dateOfBirth) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(person.dateOfBirth)) {
        errors.push('Date of birth must be in YYYY-MM-DD format');
      } else {
        const date = new Date(person.dateOfBirth);
        if (isNaN(date.getTime())) {
          errors.push('Date of birth must be a valid date');
        } else {
          // Check if the date string matches what we get back from the Date object
          // This catches invalid dates like 2025-02-30 that get auto-corrected
          const dateString = date.toISOString().split('T')[0];
          if (dateString !== person.dateOfBirth) {
            errors.push('Date of birth must be a valid date');
          }
          // Check if date is not in the future
          if (date > new Date()) {
            errors.push('Date of birth cannot be in the future');
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Create a new person
   * @param {string} name - Person's name (required)
   * @param {string} [dateOfBirth] - Person's date of birth (optional, YYYY-MM-DD format)
   * @returns {Promise<Object>} Created person
   */
  async createPerson(name, dateOfBirth) {
    // Validate input data
    const personData = { name, dateOfBirth };
    this.validatePerson(personData);

    // Prepare person object
    const person = {
      name: name.trim(),
      dateOfBirth: dateOfBirth || null
    };

    // Create person in repository
    const createdPerson = await peopleRepository.create(person);

    // Log activity event (fire-and-forget)
    activityLogService.logEvent(
      'person_added',
      'person',
      createdPerson.id,
      `Added person "${person.name}"`,
      { name: person.name }
    );

    return createdPerson;
  }

  /**
   * Update a person's information
   * @param {number} id - Person ID
   * @param {string} name - Updated name
   * @param {string} [dateOfBirth] - Updated date of birth (optional, YYYY-MM-DD format)
   * @returns {Promise<Object|null>} Updated person or null if not found
   */
  async updatePerson(id, name, dateOfBirth) {
    // Validate ID
    if (!id) {
      throw new Error('Person ID is required');
    }

    // Validate input data
    const personData = { name, dateOfBirth };
    this.validatePerson(personData);

    // Prepare updates object
    const updates = {
      name: name.trim(),
      dateOfBirth: dateOfBirth || null
    };

    // Fetch existing person before update for changes tracking
    const existingPerson = await peopleRepository.findById(id);

    // Update person in repository
    const updatedPerson = await peopleRepository.update(id, updates);
    
    if (updatedPerson) {
      // Build changes array
      const changes = [];
      if (existingPerson) {
        if (existingPerson.name !== updates.name) {
          changes.push({ field: 'name', from: existingPerson.name, to: updates.name });
        }
        if (existingPerson.dateOfBirth !== updates.dateOfBirth) {
          changes.push({ field: 'dateOfBirth', from: existingPerson.dateOfBirth, to: updates.dateOfBirth });
        }
      }

      // Log activity event (fire-and-forget)
      activityLogService.logEvent(
        'person_updated',
        'person',
        id,
        `Updated person "${updates.name}"`,
        { name: updates.name, changes }
      );

      logger.info('Updated person:', { id, name: updatedPerson.name });
    } else {
      logger.warn('Person not found for update:', { id });
    }
    
    return updatedPerson;
  }

  /**
   * Delete a person (with cascade warning for associated expenses)
   * @param {number} id - Person ID
   * @returns {Promise<Object>} Deletion result with warning information
   */
  async deletePerson(id) {
    // Validate ID
    if (!id) {
      throw new Error('Person ID is required');
    }

    // Check if person exists
    const person = await peopleRepository.findById(id);
    if (!person) {
      logger.warn('Person not found for deletion:', { id });
      return {
        success: false,
        message: 'Person not found'
      };
    }

    // Check for associated expenses
    const hasExpenses = await peopleRepository.hasAssociatedExpenses(id);
    const expenseCount = await peopleRepository.getAssociatedExpenseCount(id);

    // Delete person (cascade will handle expense associations)
    const deleted = await peopleRepository.delete(id);

    if (deleted) {
      // Log activity event (fire-and-forget)
      activityLogService.logEvent(
        'person_deleted',
        'person',
        id,
        `Deleted person "${person.name}"`,
        { name: person.name, hadExpenses: hasExpenses, expenseCount }
      );

      logger.info('Deleted person:', { 
        id, 
        name: person.name, 
        hadExpenses: hasExpenses, 
        expenseCount 
      });
      
      return {
        success: true,
        message: hasExpenses 
          ? `Person deleted successfully. ${expenseCount} associated expense(s) were also removed.`
          : 'Person deleted successfully.',
        cascadeInfo: {
          hadAssociatedExpenses: hasExpenses,
          removedExpenseCount: expenseCount
        }
      };
    } else {
      logger.error('Failed to delete person:', { id });
      return {
        success: false,
        message: 'Failed to delete person'
      };
    }
  }

  /**
   * Get all people
   * @returns {Promise<Array>} Array of all people
   */
  async getAllPeople() {
    const people = await peopleRepository.findAll();
    return people;
  }

  /**
   * Get a person by ID
   * @param {number} id - Person ID
   * @returns {Promise<Object|null>} Person object or null if not found
   */
  async getPersonById(id) {
    // Validate ID
    if (!id) {
      throw new Error('Person ID is required');
    }

    const person = await peopleRepository.findById(id);
    
    return person;
  }

  /**
   * Check if a person has associated expenses
   * @param {number} id - Person ID
   * @returns {Promise<Object>} Information about associated expenses
   */
  async getPersonExpenseInfo(id) {
    // Validate ID
    if (!id) {
      throw new Error('Person ID is required');
    }

    const hasExpenses = await peopleRepository.hasAssociatedExpenses(id);
    const expenseCount = await peopleRepository.getAssociatedExpenseCount(id);

    return {
      hasAssociatedExpenses: hasExpenses,
      expenseCount: expenseCount
    };
  }
}

module.exports = new PeopleService();