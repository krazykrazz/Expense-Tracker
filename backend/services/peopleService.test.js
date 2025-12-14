const peopleService = require('./peopleService');
const peopleRepository = require('../repositories/peopleRepository');

// Mock dependencies
jest.mock('../repositories/peopleRepository');

describe('peopleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPerson', () => {
    it('should create a new person with valid data', async () => {
      const mockCreatedPerson = {
        id: 1,
        name: 'John Doe',
        dateOfBirth: '1990-01-01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      };
      peopleRepository.create.mockResolvedValue(mockCreatedPerson);

      const result = await peopleService.createPerson('John Doe', '1990-01-01');

      expect(result).toEqual(mockCreatedPerson);
      expect(peopleRepository.create).toHaveBeenCalledWith({
        name: 'John Doe',
        dateOfBirth: '1990-01-01'
      });
    });

    it('should create a person without date of birth', async () => {
      const mockCreatedPerson = {
        id: 1,
        name: 'Jane Doe',
        dateOfBirth: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      };
      peopleRepository.create.mockResolvedValue(mockCreatedPerson);

      const result = await peopleService.createPerson('Jane Doe');

      expect(result).toEqual(mockCreatedPerson);
      expect(peopleRepository.create).toHaveBeenCalledWith({
        name: 'Jane Doe',
        dateOfBirth: null
      });
    });

    it('should trim whitespace from name', async () => {
      const mockCreatedPerson = {
        id: 1,
        name: 'John Doe',
        dateOfBirth: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      };
      peopleRepository.create.mockResolvedValue(mockCreatedPerson);

      await peopleService.createPerson('  John Doe  ');

      expect(peopleRepository.create).toHaveBeenCalledWith({
        name: 'John Doe',
        dateOfBirth: null
      });
    });

    it('should throw error when name is empty', async () => {
      await expect(peopleService.createPerson('')).rejects.toThrow('Name is required and cannot be empty');
    });

    it('should throw error when name is only whitespace', async () => {
      await expect(peopleService.createPerson('   ')).rejects.toThrow('Name is required and cannot be empty');
    });

    it('should throw error when name exceeds max length', async () => {
      const longName = 'A'.repeat(101);
      await expect(peopleService.createPerson(longName)).rejects.toThrow('Name must not exceed 100 characters');
    });

    it('should throw error for invalid date format', async () => {
      await expect(peopleService.createPerson('John Doe', 'invalid-date')).rejects.toThrow('Date of birth must be in YYYY-MM-DD format');
    });

    it('should throw error for invalid date', async () => {
      await expect(peopleService.createPerson('John Doe', '2025-02-30')).rejects.toThrow('Date of birth must be a valid date');
    });

    it('should throw error for future date', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateString = futureDate.toISOString().split('T')[0];
      
      await expect(peopleService.createPerson('John Doe', futureDateString)).rejects.toThrow('Date of birth cannot be in the future');
    });
  });

  describe('updatePerson', () => {
    it('should update existing person', async () => {
      const mockUpdatedPerson = {
        id: 1,
        name: 'John Smith',
        dateOfBirth: '1990-01-01',
        updatedAt: '2025-01-01T00:00:00.000Z'
      };
      peopleRepository.update.mockResolvedValue(mockUpdatedPerson);

      const result = await peopleService.updatePerson(1, 'John Smith', '1990-01-01');

      expect(result).toEqual(mockUpdatedPerson);
      expect(peopleRepository.update).toHaveBeenCalledWith(1, {
        name: 'John Smith',
        dateOfBirth: '1990-01-01'
      });
    });

    it('should return null when person not found', async () => {
      peopleRepository.update.mockResolvedValue(null);

      const result = await peopleService.updatePerson(999, 'John Smith', '1990-01-01');

      expect(result).toBeNull();
    });

    it('should throw error when id is missing', async () => {
      await expect(peopleService.updatePerson(null, 'John Smith', '1990-01-01'))
        .rejects.toThrow('Person ID is required');
    });

    it('should throw error when name is empty', async () => {
      await expect(peopleService.updatePerson(1, '', '1990-01-01'))
        .rejects.toThrow('Name is required and cannot be empty');
    });

    it('should trim whitespace from name', async () => {
      const mockUpdatedPerson = {
        id: 1,
        name: 'John Smith',
        dateOfBirth: null,
        updatedAt: '2025-01-01T00:00:00.000Z'
      };
      peopleRepository.update.mockResolvedValue(mockUpdatedPerson);

      await peopleService.updatePerson(1, '  John Smith  ');

      expect(peopleRepository.update).toHaveBeenCalledWith(1, {
        name: 'John Smith',
        dateOfBirth: null
      });
    });
  });

  describe('deletePerson', () => {
    it('should delete person without associated expenses', async () => {
      const mockPerson = {
        id: 1,
        name: 'John Doe',
        dateOfBirth: '1990-01-01'
      };
      peopleRepository.findById.mockResolvedValue(mockPerson);
      peopleRepository.hasAssociatedExpenses.mockResolvedValue(false);
      peopleRepository.getAssociatedExpenseCount.mockResolvedValue(0);
      peopleRepository.delete.mockResolvedValue(true);

      const result = await peopleService.deletePerson(1);

      expect(result).toEqual({
        success: true,
        message: 'Person deleted successfully.',
        cascadeInfo: {
          hadAssociatedExpenses: false,
          removedExpenseCount: 0
        }
      });
      expect(peopleRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should delete person with associated expenses and show cascade warning', async () => {
      const mockPerson = {
        id: 1,
        name: 'John Doe',
        dateOfBirth: '1990-01-01'
      };
      peopleRepository.findById.mockResolvedValue(mockPerson);
      peopleRepository.hasAssociatedExpenses.mockResolvedValue(true);
      peopleRepository.getAssociatedExpenseCount.mockResolvedValue(3);
      peopleRepository.delete.mockResolvedValue(true);

      const result = await peopleService.deletePerson(1);

      expect(result).toEqual({
        success: true,
        message: 'Person deleted successfully. 3 associated expense(s) were also removed.',
        cascadeInfo: {
          hadAssociatedExpenses: true,
          removedExpenseCount: 3
        }
      });
    });

    it('should return failure when person not found', async () => {
      peopleRepository.findById.mockResolvedValue(null);

      const result = await peopleService.deletePerson(999);

      expect(result).toEqual({
        success: false,
        message: 'Person not found'
      });
      expect(peopleRepository.delete).not.toHaveBeenCalled();
    });

    it('should return failure when delete operation fails', async () => {
      const mockPerson = {
        id: 1,
        name: 'John Doe',
        dateOfBirth: '1990-01-01'
      };
      peopleRepository.findById.mockResolvedValue(mockPerson);
      peopleRepository.hasAssociatedExpenses.mockResolvedValue(false);
      peopleRepository.getAssociatedExpenseCount.mockResolvedValue(0);
      peopleRepository.delete.mockResolvedValue(false);

      const result = await peopleService.deletePerson(1);

      expect(result).toEqual({
        success: false,
        message: 'Failed to delete person'
      });
    });

    it('should throw error when id is missing', async () => {
      await expect(peopleService.deletePerson(null))
        .rejects.toThrow('Person ID is required');
    });
  });

  describe('getAllPeople', () => {
    it('should return all people', async () => {
      const mockPeople = [
        { id: 1, name: 'John Doe', dateOfBirth: '1990-01-01' },
        { id: 2, name: 'Jane Smith', dateOfBirth: null }
      ];
      peopleRepository.findAll.mockResolvedValue(mockPeople);

      const result = await peopleService.getAllPeople();

      expect(result).toEqual(mockPeople);
      expect(peopleRepository.findAll).toHaveBeenCalled();
    });

    it('should return empty array when no people exist', async () => {
      peopleRepository.findAll.mockResolvedValue([]);

      const result = await peopleService.getAllPeople();

      expect(result).toEqual([]);
    });
  });

  describe('getPersonById', () => {
    it('should return person when found', async () => {
      const mockPerson = {
        id: 1,
        name: 'John Doe',
        dateOfBirth: '1990-01-01'
      };
      peopleRepository.findById.mockResolvedValue(mockPerson);

      const result = await peopleService.getPersonById(1);

      expect(result).toEqual(mockPerson);
      expect(peopleRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should return null when person not found', async () => {
      peopleRepository.findById.mockResolvedValue(null);

      const result = await peopleService.getPersonById(999);

      expect(result).toBeNull();
    });

    it('should throw error when id is missing', async () => {
      await expect(peopleService.getPersonById(null))
        .rejects.toThrow('Person ID is required');
    });
  });

  describe('getPersonExpenseInfo', () => {
    it('should return expense info for person with expenses', async () => {
      peopleRepository.hasAssociatedExpenses.mockResolvedValue(true);
      peopleRepository.getAssociatedExpenseCount.mockResolvedValue(5);

      const result = await peopleService.getPersonExpenseInfo(1);

      expect(result).toEqual({
        hasAssociatedExpenses: true,
        expenseCount: 5
      });
      expect(peopleRepository.hasAssociatedExpenses).toHaveBeenCalledWith(1);
      expect(peopleRepository.getAssociatedExpenseCount).toHaveBeenCalledWith(1);
    });

    it('should return expense info for person without expenses', async () => {
      peopleRepository.hasAssociatedExpenses.mockResolvedValue(false);
      peopleRepository.getAssociatedExpenseCount.mockResolvedValue(0);

      const result = await peopleService.getPersonExpenseInfo(1);

      expect(result).toEqual({
        hasAssociatedExpenses: false,
        expenseCount: 0
      });
    });

    it('should throw error when id is missing', async () => {
      await expect(peopleService.getPersonExpenseInfo(null))
        .rejects.toThrow('Person ID is required');
    });
  });

  describe('validatePerson', () => {
    it('should not throw error for valid person data', () => {
      const validPerson = {
        name: 'John Doe',
        dateOfBirth: '1990-01-01'
      };

      expect(() => peopleService.validatePerson(validPerson)).not.toThrow();
    });

    it('should not throw error for person without date of birth', () => {
      const validPerson = {
        name: 'John Doe'
      };

      expect(() => peopleService.validatePerson(validPerson)).not.toThrow();
    });

    it('should throw error for multiple validation failures', async () => {
      const invalidPerson = {
        name: '',
        dateOfBirth: 'invalid-date'
      };

      await expect(peopleService.createPerson(invalidPerson.name, invalidPerson.dateOfBirth))
        .rejects.toThrow('Name is required and cannot be empty; Date of birth must be in YYYY-MM-DD format');
    });
  });
});