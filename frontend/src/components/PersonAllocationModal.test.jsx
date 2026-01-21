import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PersonAllocationModal from './PersonAllocationModal';

describe('PersonAllocationModal', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();
  
  const defaultProps = {
    isOpen: true,
    expense: { amount: 100 },
    selectedPeople: [
      { id: 1, name: 'John Doe' },
      { id: 2, name: 'Jane Doe' }
    ],
    onSave: mockOnSave,
    onCancel: mockOnCancel
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <PersonAllocationModal {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders modal when isOpen is true', () => {
      render(<PersonAllocationModal {...defaultProps} />);
      expect(screen.getByText('Allocate Expense Amount')).toBeInTheDocument();
    });

    it('displays expense total amount', () => {
      render(<PersonAllocationModal {...defaultProps} />);
      expect(screen.getByText(/Total Expense:/)).toBeInTheDocument();
      // Multiple elements may show $100.00 (total and remaining), so use getAllByText
      expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    });

    it('displays all selected people', () => {
      render(<PersonAllocationModal {...defaultProps} />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('displays Split Equally button', () => {
      render(<PersonAllocationModal {...defaultProps} />);
      expect(screen.getByText('Split Equally')).toBeInTheDocument();
    });

    it('displays Save and Cancel buttons', () => {
      render(<PersonAllocationModal {...defaultProps} />);
      expect(screen.getByText('Save Allocation')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Split Equally functionality', () => {
    it('splits amount equally among people', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Split Equally'));
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      await waitFor(() => {
        expect(inputs[0].value).toBe('50');
        expect(inputs[1].value).toBe('50');
      });
    });

    it('handles odd amounts correctly', async () => {
      render(
        <PersonAllocationModal 
          {...defaultProps} 
          expense={{ amount: 99.99 }}
        />
      );
      
      fireEvent.click(screen.getByText('Split Equally'));
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      await waitFor(() => {
        // Each person gets 49.995 rounded to 50.00
        expect(parseFloat(inputs[0].value)).toBeCloseTo(50, 1);
      });
    });
  });

  describe('Manual allocation', () => {
    it('allows manual amount entry', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '60' } });
      
      await waitFor(() => {
        expect(inputs[0].value).toBe('60');
      });
    });

    it('updates total allocated when amounts change', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '60' } });
      fireEvent.change(inputs[1], { target: { value: '40' } });
      
      await waitFor(() => {
        expect(screen.getByText(/Total Allocated:/)).toBeInTheDocument();
      });
    });
  });

  describe('Validation', () => {
    it('disables save button when allocations do not sum to total', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '30' } });
      fireEvent.change(inputs[1], { target: { value: '30' } });
      
      await waitFor(() => {
        expect(screen.getByText('Save Allocation')).toBeDisabled();
      });
    });

    it('enables save button when allocations sum to total', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '60' } });
      fireEvent.change(inputs[1], { target: { value: '40' } });
      
      await waitFor(() => {
        expect(screen.getByText('Save Allocation')).not.toBeDisabled();
      });
    });

    it('shows error when total exceeds expense amount', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '80' } });
      fireEvent.change(inputs[1], { target: { value: '80' } });
      
      await waitFor(() => {
        expect(screen.getByText(/exceeds expense amount/)).toBeInTheDocument();
      });
    });

    it('shows error when total is less than expense amount', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '30' } });
      fireEvent.change(inputs[1], { target: { value: '30' } });
      
      await waitFor(() => {
        expect(screen.getByText(/is less than expense amount/)).toBeInTheDocument();
      });
    });
  });

  describe('Save and Cancel actions', () => {
    it('calls onSave with formatted allocations when save is clicked', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Split Equally'));
      
      await waitFor(() => {
        expect(screen.getByText('Save Allocation')).not.toBeDisabled();
      });
      
      fireEvent.click(screen.getByText('Save Allocation'));
      
      expect(mockOnSave).toHaveBeenCalledWith([
        { id: 1, name: 'John Doe', amount: 50, originalAmount: null },
        { id: 2, name: 'Jane Doe', amount: 50, originalAmount: null }
      ]);
    });

    it('calls onCancel when cancel button is clicked', () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('calls onCancel when close button is clicked', () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      fireEvent.click(screen.getByLabelText('Close'));
      
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Remaining amount display', () => {
    it('shows remaining amount correctly', async () => {
      render(<PersonAllocationModal {...defaultProps} />);
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '60' } });
      
      await waitFor(() => {
        expect(screen.getByText(/Remaining:/)).toBeInTheDocument();
      });
    });
  });

  describe('Edge cases', () => {
    it('handles single person allocation', async () => {
      render(
        <PersonAllocationModal 
          {...defaultProps} 
          selectedPeople={[{ id: 1, name: 'John Doe' }]}
        />
      );
      
      fireEvent.click(screen.getByText('Split Equally'));
      
      const inputs = screen.getAllByPlaceholderText('0.00');
      await waitFor(() => {
        expect(inputs[0].value).toBe('100');
      });
    });

    it('handles zero expense amount', () => {
      render(
        <PersonAllocationModal 
          {...defaultProps} 
          expense={{ amount: 0 }}
        />
      );
      
      // Multiple elements may show $0.00, so use getAllByText
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });

    it('handles empty selectedPeople array', () => {
      render(
        <PersonAllocationModal 
          {...defaultProps} 
          selectedPeople={[]}
        />
      );
      
      expect(screen.queryAllByPlaceholderText('0.00')).toHaveLength(0);
    });
  });
});
