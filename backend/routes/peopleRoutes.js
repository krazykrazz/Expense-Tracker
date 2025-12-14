const express = require('express');
const router = express.Router();
const peopleController = require('../controllers/peopleController');

// GET /api/people - Get all people
router.get('/', peopleController.getAllPeople);

// POST /api/people - Create a new person
router.post('/', peopleController.createPerson);

// PUT /api/people/:id - Update a person by ID
router.put('/:id', peopleController.updatePerson);

// DELETE /api/people/:id - Delete a person by ID
router.delete('/:id', peopleController.deletePerson);

module.exports = router;