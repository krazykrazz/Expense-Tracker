import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InvestmentsModal from './InvestmentsModal';
import * as investmentApi from '../services/investmentApi';

// Mock the investment API
vi.mock('../services/investmentApi');

describe('InvestmentsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render modal when isOpen is true', () => {
    investmentApi.getAllInvestments.mockResolvedValue([]);
    
    render(
      <InvestmentsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        onUpdate={mockOnUpdate} 
      />
    );

    expect(screen.getByText('Manage Investments')).toBeInTheDocument();
  });

  it('should not render modal when isOpen is false', () => {
    const { container } = render(
      <InvestmentsModal 
        isOpen={false} 
        onClose={mockOnClose} 
        onUpdate={mockOnUpdate} 
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should fetch investments on mount', async () => {
    const mockInvestments = [
      { id: 1, name: 'My TFSA', type: 'TFSA', currentValue: 10000 },
      { id: 2, name: 'Retirement RRSP', type: 'RRSP', currentValue: 25000 }
    ];
    
    investmentApi.getAllInvestments.mockResolvedValue(mockInvestments);

    render(
      <InvestmentsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        onUpdate={mockOnUpdate} 
      />
    );

    await waitFor(() => {
      expect(investmentApi.getAllInvestments).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
      expect(screen.getByText('Retirement RRSP')).toBeInTheDocument();
    });
  });

  it('should show add form when Add New Investment button is clicked', async () => {
    investmentApi.getAllInvestments.mockResolvedValue([]);

    render(
      <InvestmentsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        onUpdate={mockOnUpdate} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText('+ Add New Investment')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add New Investment'));

    expect(screen.getByText('Add New Investment')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., My TFSA, Retirement RRSP')).toBeInTheDocument();
  });

  it('should validate form fields before submission', async () => {
    investmentApi.getAllInvestments.mockResolvedValue([]);

    render(
      <InvestmentsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        onUpdate={mockOnUpdate} 
      />
    );

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add New Investment'));
    });

    // Try to submit empty form
    const submitButton = screen.getByText('Create Investment');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please fix the validation errors before submitting.')).toBeInTheDocument();
    });
  });

  it('should call createInvestment API when form is submitted with valid data', async () => {
    investmentApi.getAllInvestments.mockResolvedValue([]);
    investmentApi.createInvestment.mockResolvedValue({ id: 1, name: 'Test TFSA', type: 'TFSA', initial_value: 5000 });

    render(
      <InvestmentsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        onUpdate={mockOnUpdate} 
      />
    );

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add New Investment'));
    });

    // Fill in form
    fireEvent.change(screen.getByPlaceholderText('e.g., My TFSA, Retirement RRSP'), {
      target: { value: 'Test TFSA' }
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '5000' }
    });

    // Submit form
    fireEvent.click(screen.getByText('Create Investment'));

    await waitFor(() => {
      expect(investmentApi.createInvestment).toHaveBeenCalledWith({
        name: 'Test TFSA',
        type: 'TFSA',
        initial_value: 5000
      });
    });
  });

  it('should show delete confirmation dialog', async () => {
    const mockInvestments = [
      { id: 1, name: 'My TFSA', type: 'TFSA', currentValue: 10000 }
    ];
    
    investmentApi.getAllInvestments.mockResolvedValue(mockInvestments);
    window.confirm = vi.fn(() => false);

    render(
      <InvestmentsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        onUpdate={mockOnUpdate} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
    });

    const deleteButton = screen.getByTitle('Delete');
    fireEvent.click(deleteButton);

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete this investment? This will also delete all value entries for this investment.'
    );
  });

  it('should call onClose and onUpdate when modal is closed', async () => {
    investmentApi.getAllInvestments.mockResolvedValue([]);

    render(
      <InvestmentsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        onUpdate={mockOnUpdate} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText('✕')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('✕'));

    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOnUpdate).toHaveBeenCalled();
  });
});
