import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PeopleManagementModal from './PeopleManagementModal';
import * as peopleApi from '../services/peopleApi';

// Mock the people API
vi.mock('../services/peopleApi');

describe('PeopleManagementModal', () => {
  const mockOnClose = vi.fn();
  const mockOnPeopleUpdated = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onPeopleUpdated: mockOnPeopleUpdated
  };

  const mockPeople = [
    { 
      id: 1, 
      name: 'John Doe', 
      dateOfBirth: '1990-05-15',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z'
    },
    { 
      id: 2, 
      name: 'Jane Smith', 
      dateOfBirth: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    peopleApi.getPeople.mockResolvedValue(mockPeople);
    peopleApi.createPerson.mockResolvedValue({ id: 3, name: 'New Person', dateOfBirth: null });
    peopleApi.updatePerson.mockResolvedValue({ id: 1, name: 'Updated Name', dateOfBirth: '1990-05-15' });
    peopleApi.deletePerson.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Modal Rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<PeopleManagementModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('Manage Family Members')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      expect(screen.getByText('Manage Family Members')).toBeInTheDocument();
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('➕ Add Family Member')).toBeInTheDocument();
      });
    });

    it('should display loading state initially', () => {
      render(<PeopleManagementModal {...defaultProps} />);
      expect(screen.getByText('Loading family members...')).toBeInTheDocument();
    });

    it('should call getPeople when modal opens', () => {
      render(<PeopleManagementModal {...defaultProps} />);
      expect(peopleApi.getPeople).toHaveBeenCalledTimes(1);
    });
  });

  describe('Person Creation', () => {
    it('should show add person form when add button is clicked', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('➕ Add Family Member'));
      
      expect(screen.getByText('Add New Person')).toBeInTheDocument();
      expect(screen.getByLabelText('Name *')).toBeInTheDocument();
      expect(screen.getByLabelText('Date of Birth (Optional)')).toBeInTheDocument();
    });

    it('should create person with valid data', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Open add form
      fireEvent.click(screen.getByText('➕ Add Family Member'));
      
      // Fill form
      fireEvent.change(screen.getByLabelText('Name *'), {
        target: { value: 'New Person' }
      });
      fireEvent.change(screen.getByLabelText('Date of Birth (Optional)'), {
        target: { value: '1985-12-25' }
      });
      
      // Submit form
      fireEvent.click(screen.getByText('Add Person'));
      
      await waitFor(() => {
        expect(peopleApi.createPerson).toHaveBeenCalledWith('New Person', '1985-12-25');
        expect(mockOnPeopleUpdated).toHaveBeenCalled();
      });
    });

    it('should create person without date of birth', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Open add form
      fireEvent.click(screen.getByText('➕ Add Family Member'));
      
      // Fill only name
      fireEvent.change(screen.getByLabelText('Name *'), {
        target: { value: 'Person Without DOB' }
      });
      
      // Submit form
      fireEvent.click(screen.getByText('Add Person'));
      
      await waitFor(() => {
        expect(peopleApi.createPerson).toHaveBeenCalledWith('Person Without DOB', null);
      });
    });

    it('should show validation error for empty name', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Open add form
      fireEvent.click(screen.getByText('➕ Add Family Member'));
      
      // Submit without name
      fireEvent.click(screen.getByText('Add Person'));
      
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(peopleApi.createPerson).not.toHaveBeenCalled();
    });

    it('should show validation error for invalid date format', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Open add form
      fireEvent.click(screen.getByText('➕ Add Family Member'));
      
      // Fill with name and manually set an invalid date value
      fireEvent.change(screen.getByLabelText('Name *'), {
        target: { value: 'Test Person' }
      });
      
      // Manually trigger validation by setting invalid date format in state
      const dateInput = screen.getByLabelText('Date of Birth (Optional)');
      // Simulate typing an invalid date that bypasses HTML5 validation
      Object.defineProperty(dateInput, 'value', {
        writable: true,
        value: '2023-13-45' // Invalid month and day
      });
      fireEvent.change(dateInput, { target: { value: '2023-13-45' } });
      
      // Submit form
      fireEvent.click(screen.getByText('Add Person'));
      
      expect(screen.getByText('Invalid date')).toBeInTheDocument();
      expect(peopleApi.createPerson).not.toHaveBeenCalled();
    });

    it('should show validation error for future date', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Open add form
      fireEvent.click(screen.getByText('➕ Add Family Member'));
      
      // Fill with future date
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateString = futureDate.toISOString().split('T')[0];
      
      fireEvent.change(screen.getByLabelText('Name *'), {
        target: { value: 'Test Person' }
      });
      fireEvent.change(screen.getByLabelText('Date of Birth (Optional)'), {
        target: { value: futureDateString }
      });
      
      // Submit form
      fireEvent.click(screen.getByText('Add Person'));
      
      expect(screen.getByText('Date cannot be in the future')).toBeInTheDocument();
      expect(peopleApi.createPerson).not.toHaveBeenCalled();
    });

    it('should cancel add person form', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Open add form
      fireEvent.click(screen.getByText('➕ Add Family Member'));
      
      // Fill form
      fireEvent.change(screen.getByLabelText('Name *'), {
        target: { value: 'Test Person' }
      });
      
      // Cancel
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(screen.queryByText('Add New Person')).not.toBeInTheDocument();
      expect(peopleApi.createPerson).not.toHaveBeenCalled();
    });
  });

  describe('Person Editing', () => {
    it('should show edit form when edit button is clicked', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click edit button for first person
      const editButtons = screen.getAllByTitle('Edit person');
      fireEvent.click(editButtons[0]);
      
      expect(screen.getByText('Edit Person')).toBeInTheDocument();
      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1990-05-15')).toBeInTheDocument();
    });

    it('should update person with valid data', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click edit button
      const editButtons = screen.getAllByTitle('Edit person');
      fireEvent.click(editButtons[0]);
      
      // Update name
      const nameInput = screen.getByDisplayValue('John Doe');
      fireEvent.change(nameInput, {
        target: { value: 'Updated Name' }
      });
      
      // Submit form
      fireEvent.click(screen.getByText('Save Changes'));
      
      await waitFor(() => {
        expect(peopleApi.updatePerson).toHaveBeenCalledWith(1, 'Updated Name', '1990-05-15');
        expect(mockOnPeopleUpdated).toHaveBeenCalled();
      });
    });

    it('should cancel edit form', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click edit button
      const editButtons = screen.getAllByTitle('Edit person');
      fireEvent.click(editButtons[0]);
      
      // Cancel
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(screen.queryByText('Edit Person')).not.toBeInTheDocument();
      expect(peopleApi.updatePerson).not.toHaveBeenCalled();
    });
  });

  describe('Person Deletion', () => {
    it('should show delete confirmation when delete button is clicked', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByTitle('Delete person');
      fireEvent.click(deleteButtons[0]);
      
      expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
      expect(screen.getByText(/This will remove them from all associated medical expenses/)).toBeInTheDocument();
    });

    it('should delete person when confirmed', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByTitle('Delete person');
      fireEvent.click(deleteButtons[0]);
      
      // Confirm deletion
      fireEvent.click(screen.getByText('Yes, Delete'));
      
      await waitFor(() => {
        expect(peopleApi.deletePerson).toHaveBeenCalledWith(1);
        expect(mockOnPeopleUpdated).toHaveBeenCalled();
      });
    });

    it('should cancel deletion', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByTitle('Delete person');
      fireEvent.click(deleteButtons[0]);
      
      // Cancel deletion
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(screen.queryByText('Confirm Deletion')).not.toBeInTheDocument();
      expect(peopleApi.deletePerson).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display error when getPeople fails', async () => {
      peopleApi.getPeople.mockRejectedValue(new Error('Network error'));
      
      render(<PeopleManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should display error when createPerson fails', async () => {
      peopleApi.createPerson.mockRejectedValue(new Error('Creation failed'));
      
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Open add form and submit
      fireEvent.click(screen.getByText('➕ Add Family Member'));
      fireEvent.change(screen.getByLabelText('Name *'), {
        target: { value: 'Test Person' }
      });
      fireEvent.click(screen.getByText('Add Person'));
      
      await waitFor(() => {
        expect(screen.getByText('Creation failed')).toBeInTheDocument();
      });
    });

    it('should display error when updatePerson fails', async () => {
      peopleApi.updatePerson.mockRejectedValue(new Error('Update failed'));
      
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Edit and submit
      const editButtons = screen.getAllByTitle('Edit person');
      fireEvent.click(editButtons[0]);
      fireEvent.click(screen.getByText('Save Changes'));
      
      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument();
      });
    });

    it('should display error when deletePerson fails', async () => {
      peopleApi.deletePerson.mockRejectedValue(new Error('Delete failed'));
      
      render(<PeopleManagementModal {...defaultProps} />);
      
      // Wait for people to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Delete and confirm
      const deleteButtons = screen.getAllByTitle('Delete person');
      fireEvent.click(deleteButtons[0]);
      fireEvent.click(screen.getByText('Yes, Delete'));
      
      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });
    });
  });

  describe('Modal Interaction', () => {
    it('should close modal when close button is clicked', () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      fireEvent.click(screen.getByText('✕'));
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close modal when overlay is clicked', () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      const overlay = screen.getByText('Manage Family Members').closest('.modal-overlay');
      fireEvent.click(overlay);
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not close modal when modal content is clicked', () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      const modalContent = screen.getByText('Manage Family Members').closest('.people-modal-container');
      fireEvent.click(modalContent);
      
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no people exist', async () => {
      peopleApi.getPeople.mockResolvedValue([]);
      
      render(<PeopleManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('No family members added yet.')).toBeInTheDocument();
        expect(screen.getByText('Click "Add Family Member" to get started.')).toBeInTheDocument();
      });
    });
  });

  describe('Date Formatting', () => {
    it('should format date of birth correctly', async () => {
      render(<PeopleManagementModal {...defaultProps} />);
      
      await waitFor(() => {
        // Use more flexible text matching since date formatting can vary by timezone
        expect(screen.getByText(/Born:.*May.*1990/)).toBeInTheDocument();
        expect(screen.getByText('Born: Not specified')).toBeInTheDocument();
      });
    });
  });
});