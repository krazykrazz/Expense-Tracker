const peopleService = require('../services/peopleService');
const logger = require('../config/logger');

/**
 * Get all people
 * GET /api/people
 */
async function getAllPeople(req, res) {
  try {
    const people = await peopleService.getAllPeople();
    res.status(200).json(people);
  } catch (error) {
    logger.error('Error fetching people:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create a new person
 * POST /api/people
 */
async function createPerson(req, res) {
  try {
    const { name, dateOfBirth } = req.body;
    
    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required and cannot be empty' });
    }
    
    // Validate date of birth format if provided
    if (dateOfBirth && dateOfBirth.trim() !== '') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        return res.status(400).json({ error: 'Date of birth must be in YYYY-MM-DD format' });
      }
      
      // Validate it's a valid date
      const date = new Date(dateOfBirth);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Invalid date of birth' });
      }
    }
    
    const personData = {
      name: name.trim(),
      dateOfBirth: dateOfBirth && dateOfBirth.trim() !== '' ? dateOfBirth.trim() : null
    };
    
    const tabId = req.headers['x-tab-id'] ?? null;
    const createdPerson = await peopleService.createPerson(personData.name, personData.dateOfBirth, tabId);
    res.status(201).json(createdPerson);
  } catch (error) {
    logger.error('Error creating person:', error);
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update a person by ID
 * PUT /api/people/:id
 */
async function updatePerson(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid person ID' });
    }
    
    const { name, dateOfBirth } = req.body;
    
    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required and cannot be empty' });
    }
    
    // Validate date of birth format if provided
    if (dateOfBirth && dateOfBirth.trim() !== '') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        return res.status(400).json({ error: 'Date of birth must be in YYYY-MM-DD format' });
      }
      
      // Validate it's a valid date
      const date = new Date(dateOfBirth);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Invalid date of birth' });
      }
    }
    
    const personData = {
      name: name.trim(),
      dateOfBirth: dateOfBirth && dateOfBirth.trim() !== '' ? dateOfBirth.trim() : null
    };
    
    const tabId = req.headers['x-tab-id'] ?? null;
    const updatedPerson = await peopleService.updatePerson(id, personData.name, personData.dateOfBirth, tabId);
    
    if (!updatedPerson) {
      return res.status(404).json({ error: 'Person not found' });
    }
    
    res.status(200).json(updatedPerson);
  } catch (error) {
    logger.error('Error updating person:', error);
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete a person by ID
 * DELETE /api/people/:id
 */
async function deletePerson(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid person ID' });
    }
    
    const tabId = req.headers['x-tab-id'] ?? null;
    const deleted = await peopleService.deletePerson(id, tabId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Person not found' });
    }
    
    res.status(200).json({ 
      message: 'Person deleted successfully',
      warning: 'All associated medical expense assignments have been removed'
    });
  } catch (error) {
    logger.error('Error deleting person:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAllPeople,
  createPerson,
  updatePerson,
  deletePerson
};