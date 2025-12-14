const peopleController = require('./peopleController');
const peopleService = require('../services/peopleService');

// Mock the people service
jest.mock('../services/peopleService');

describe('PeopleController - Unit Tests', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Setup mock request and response objects
    req = {
      query: {},
      params: {},
      body: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('GET /api/people - getAllPeople', () => {
    test('should return all people successfully', async () => {
      const mockPeople = [
        { id: 1, name: 'John Doe', dateOfBirth: '1990-01-15', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
        { id: 2, name: 'Jane Smith', dateOfBirth: null, createdAt: '2025-01-01', updatedAt: '2025-01-01' }
      ];

      peopleService.getAllPeople.mockResolvedValue(mockPeople);

      await peopleController.getAllPeople(req, res);

      expect(peopleService.getAllPeople).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockPeople);
    });

    test('should return empty array when no people exist', async () => {
      peopleService.getAllPeople.mockResolvedValue([]);

      await peopleController.getAllPeople(req, res);

      expect(peopleService.getAllPeople).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    test('should return 500 when service throws error', async () => {
      const error = new Error('Database connection failed');
      peopleService.getAllPeople.mockRejectedValue(error);

      await peopleController.getAllPeople(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database connection failed' });
    });
  });

  describe('POST /api/people - createPerson', () => {
    test('should create person with name and date of birth', async () => {
      const mockPerson = { 
        id: 1, 
        name: 'John Doe', 
        dateOfBirth: '1990-01-15', 
        createdAt: '2025-01-01', 
        updatedAt: '2025-01-01' 
      };

      req.body = { name: 'John Doe', dateOfBirth: '1990-01-15' };
      peopleService.createPerson.mockResolvedValue(mockPerson);

      await peopleController.createPerson(req, res);

      expect(peopleService.createPerson).toHaveBeenCalledWith('John Doe', '1990-01-15');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPerson);
    });

    test('should create person with name only (no date of birth)', async () => {
      const mockPerson = { 
        id: 2, 
        name: 'Jane Smith', 
        dateOfBirth: null, 
        createdAt: '2025-01-01', 
        updatedAt: '2025-01-01' 
      };

      req.body = { name: 'Jane Smith' };
      peopleService.createPerson.mockResolvedValue(mockPerson);

      await peopleController.createPerson(req, res);

      expect(peopleService.createPerson).toHaveBeenCalledWith('Jane Smith', null);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPerson);
    });

    test('should create person with empty date of birth', async () => {
      const mockPerson = { 
        id: 3, 
        name: 'Bob Johnson', 
        dateOfBirth: null, 
        createdAt: '2025-01-01', 
        updatedAt: '2025-01-01' 
      };

      req.body = { name: 'Bob Johnson', dateOfBirth: '' };
      peopleService.createPerson.mockResolvedValue(mockPerson);

      await peopleController.createPerson(req, res);

      expect(peopleService.createPerson).toHaveBeenCalledWith('Bob Johnson', null);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPerson);
    });

    test('should return 400 when name is missing', async () => {
      req.body = { dateOfBirth: '1990-01-15' };

      await peopleController.createPerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required and cannot be empty' });
    });

    test('should return 400 when name is empty string', async () => {
      req.body = { name: '', dateOfBirth: '1990-01-15' };

      await peopleController.createPerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required and cannot be empty' });
    });

    test('should return 400 when name is only whitespace', async () => {
      req.body = { name: '   ', dateOfBirth: '1990-01-15' };

      await peopleController.createPerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required and cannot be empty' });
    });

    test('should return 400 for invalid date format', async () => {
      req.body = { name: 'John Doe', dateOfBirth: '01/15/1990' };

      await peopleController.createPerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Date of birth must be in YYYY-MM-DD format' });
    });

    test('should return 400 for invalid date', async () => {
      req.body = { name: 'John Doe', dateOfBirth: '1990-13-45' };

      await peopleController.createPerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid date of birth' });
    });

    test('should return 400 when service throws validation error', async () => {
      req.body = { name: 'John Doe', dateOfBirth: '1990-01-15' };
      peopleService.createPerson.mockRejectedValue(new Error('Name already exists'));

      await peopleController.createPerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name already exists' });
    });
  });

  describe('PUT /api/people/:id - updatePerson', () => {
    test('should update person successfully', async () => {
      const mockPerson = { 
        id: 1, 
        name: 'John Updated', 
        dateOfBirth: '1990-01-15', 
        createdAt: '2025-01-01', 
        updatedAt: '2025-01-02' 
      };

      req.params = { id: '1' };
      req.body = { name: 'John Updated', dateOfBirth: '1990-01-15' };
      peopleService.updatePerson.mockResolvedValue(mockPerson);

      await peopleController.updatePerson(req, res);

      expect(peopleService.updatePerson).toHaveBeenCalledWith(1, 'John Updated', '1990-01-15');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockPerson);
    });

    test('should update person with null date of birth', async () => {
      const mockPerson = { 
        id: 1, 
        name: 'John Updated', 
        dateOfBirth: null, 
        createdAt: '2025-01-01', 
        updatedAt: '2025-01-02' 
      };

      req.params = { id: '1' };
      req.body = { name: 'John Updated', dateOfBirth: '' };
      peopleService.updatePerson.mockResolvedValue(mockPerson);

      await peopleController.updatePerson(req, res);

      expect(peopleService.updatePerson).toHaveBeenCalledWith(1, 'John Updated', null);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockPerson);
    });

    test('should return 400 for invalid person ID', async () => {
      req.params = { id: 'invalid' };
      req.body = { name: 'John Updated' };

      await peopleController.updatePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid person ID' });
    });

    test('should return 400 when name is missing', async () => {
      req.params = { id: '1' };
      req.body = { dateOfBirth: '1990-01-15' };

      await peopleController.updatePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required and cannot be empty' });
    });

    test('should return 400 for invalid date format', async () => {
      req.params = { id: '1' };
      req.body = { name: 'John Updated', dateOfBirth: '01/15/1990' };

      await peopleController.updatePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Date of birth must be in YYYY-MM-DD format' });
    });

    test('should return 404 when person not found', async () => {
      req.params = { id: '999' };
      req.body = { name: 'John Updated' };
      peopleService.updatePerson.mockResolvedValue(null);

      await peopleController.updatePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Person not found' });
    });

    test('should return 400 when service throws validation error', async () => {
      req.params = { id: '1' };
      req.body = { name: 'John Updated' };
      peopleService.updatePerson.mockRejectedValue(new Error('Name already exists'));

      await peopleController.updatePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name already exists' });
    });
  });

  describe('DELETE /api/people/:id - deletePerson', () => {
    test('should delete person successfully', async () => {
      req.params = { id: '1' };
      peopleService.deletePerson.mockResolvedValue(true);

      await peopleController.deletePerson(req, res);

      expect(peopleService.deletePerson).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Person deleted successfully',
        warning: 'All associated medical expense assignments have been removed'
      });
    });

    test('should return 400 for invalid person ID', async () => {
      req.params = { id: 'invalid' };

      await peopleController.deletePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid person ID' });
    });

    test('should return 404 when person not found', async () => {
      req.params = { id: '999' };
      peopleService.deletePerson.mockResolvedValue(false);

      await peopleController.deletePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Person not found' });
    });

    test('should return 500 when service throws error', async () => {
      req.params = { id: '1' };
      peopleService.deletePerson.mockRejectedValue(new Error('Database error'));

      await peopleController.deletePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });
});