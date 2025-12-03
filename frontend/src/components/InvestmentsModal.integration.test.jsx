/**
 * Integration tests for InvestmentsModal component
 * Tests UI interactions, API calls, and data flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InvestmentsModal from './InvestmentsModal';
import * as investmentApi from '../services/investmentApi';
import * as investmentValueApi from '../services/investmentValueApi';

// Mock the API modules
vi.mock('../services/investmentApi');
vi.mock('../services/investmentValueApi');

describe('InvestmentsModal Integration Tests', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  const mockInvestments = [
    {
      id: 1,
      name: 'My TFSA',
      type: 'TFSA',
      initial_value: 10000,
      currentValue: 11500
    },
    {
      id: 2,
      name: 'My RRSP',
      type: 'RRSP',
      initial_value: 20000,
      currentValue: 22000
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    investmentApi.getAllInvestments.mockResolvedValue(mockInvestments);
  });

  it('should load and display investments on mount', async () => {
    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
      expect(screen.getByText('My RRSP')).toBeInTheDocument();
    });

    expect(investmentApi.getAllInvestments).toHaveBeenCalledTimes(1);
  });

  it('should handle empty investments list', async () => {
    investmentApi.getAllInvestments.mockResolvedValue([]);

    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/no investments/i)).toBeInTheDocument();
    });
  });

  it('should validate investment type (TFSA/RRSP only)', async () => {
    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    // Wait for investments to load first
    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
    });

    // Click add new investment
    const addButton = screen.getByText(/add new investment/i);
    fireEvent.click(addButton);

    // Check that type dropdown only has TFSA and RRSP
    const typeSelect = screen.getByRole('combobox');
    const options = typeSelect.querySelectorAll('option');
    
    expect(options).toHaveLength(2);
    expect(options[0].value).toBe('TFSA');
    expect(options[1].value).toBe('RRSP');
  });

  it('should reject negative initial values', async () => {
    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    // Wait for investments to load first
    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
    });

    // Click add new investment
    const addButton = screen.getByText(/add new investment/i);
    fireEvent.click(addButton);

    // Fill form with negative value
    const nameInput = screen.getByPlaceholderText(/e\.g\., My TFSA/i);
    const typeSelect = screen.getByRole('combobox');
    const valueInput = screen.getByPlaceholderText(/0\.00/i);

    fireEvent.change(nameInput, { target: { value: 'Test Investment' } });
    fireEvent.change(typeSelect, { target: { value: 'TFSA' } });
    fireEvent.change(valueInput, { target: { value: '-1000' } });

    // Try to submit
    const submitButton = screen.getByText(/create investment/i);
    fireEvent.click(submitButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/must be a non-negative number/i)).toBeInTheDocument();
    });

    expect(investmentApi.createInvestment).not.toHaveBeenCalled();
  });

  it('should create new investment successfully', async () => {
    const newInvestment = {
      id: 3,
      name: 'New TFSA',
      type: 'TFSA',
      initial_value: 5000,
      currentValue: 5000
    };

    investmentApi.createInvestment.mockResolvedValue(newInvestment);
    investmentApi.getAllInvestments
      .mockResolvedValueOnce(mockInvestments)
      .mockResolvedValueOnce([...mockInvestments, newInvestment]);

    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
    });

    // Click add new investment
    const addButton = screen.getByText(/add new investment/i);
    fireEvent.click(addButton);

    // Fill form
    const nameInput = screen.getByPlaceholderText(/e\.g\., My TFSA/i);
    const typeSelect = screen.getByRole('combobox');
    const valueInput = screen.getByPlaceholderText(/0\.00/i);

    fireEvent.change(nameInput, { target: { value: 'New TFSA' } });
    fireEvent.change(typeSelect, { target: { value: 'TFSA' } });
    fireEvent.change(valueInput, { target: { value: '5000' } });

    // Submit
    const submitButton = screen.getByText(/create investment/i);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(investmentApi.createInvestment).toHaveBeenCalledWith({
        name: 'New TFSA',
        type: 'TFSA',
        initial_value: 5000
      });
    });

    // Should refresh list
    await waitFor(() => {
      expect(investmentApi.getAllInvestments).toHaveBeenCalledTimes(2);
    });
  });

  it('should delete investment with confirmation', async () => {
    global.confirm = vi.fn(() => true);
    investmentApi.deleteInvestment.mockResolvedValue({});
    investmentApi.getAllInvestments
      .mockResolvedValueOnce(mockInvestments)
      .mockResolvedValueOnce([mockInvestments[1]]);

    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
    });

    // Find and click delete button for first investment (uses title attribute)
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);

    expect(global.confirm).toHaveBeenCalled();

    await waitFor(() => {
      expect(investmentApi.deleteInvestment).toHaveBeenCalledWith(1);
    });

    // Should refresh list
    await waitFor(() => {
      expect(investmentApi.getAllInvestments).toHaveBeenCalledTimes(2);
    });
  });

  it('should open investment detail view', async () => {
    const mockValueHistory = [
      { id: 1, investment_id: 1, year: 2025, month: 11, value: 11500 },
      { id: 2, investment_id: 1, year: 2025, month: 10, value: 11000 }
    ];

    investmentValueApi.getValueHistory.mockResolvedValue(mockValueHistory);

    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
    });

    // Click view button (uses title attribute)
    const viewButtons = screen.getAllByTitle('View Details');
    fireEvent.click(viewButtons[0]);

    // Should show detail view
    await waitFor(() => {
      expect(screen.getByText(/value history/i)).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    investmentApi.getAllInvestments.mockRejectedValue(new Error('Network error'));

    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('should close modal and call onUpdate', async () => {
    render(
      <InvestmentsModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        year={2025}
        month={11}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('My TFSA')).toBeInTheDocument();
    });

    // Click close button (the X button)
    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOnUpdate).toHaveBeenCalled();
  });
});
