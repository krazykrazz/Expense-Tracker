import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the merchant analytics API
vi.mock('../services/merchantAnalyticsApi', () => ({
  getTopMerchants: vi.fn(),
  getPeriodDisplayName: vi.fn((period) => {
    const names = {
      'all': 'All Time',
      'year': 'This Year', 
      'month': 'This Month',
      '3months': 'Last 3 Months'
    };
    return names[period] || period;
  }),
  getSortByDisplayName: vi.fn((sortBy) => {
    const names = {
      'total': 'Total Spend',
      'visits': 'Visit Count',
      'average': 'Average Spend'
    };
    return names[sortBy] || sortBy;
  })
}));

// Mock the formatters
vi.mock('../utils/formatters', () => ({
  formatCurrency: vi.fn((amount) => `$${amount.toFixed(2)}`)
}));

// Mock MerchantDetailView component
vi.mock('./MerchantDetailView', () => {
  return {
    default: ({ merchantName, period, isOpen, onClose, onViewExpenses }) => {
      if (!isOpen) return null;
      return (
        <div data-testid="merchant-detail-view">
          <h2>{merchantName} Details</h2>
          <p>Period: {period}</p>
          <button onClick={onClose}>Back to Analytics</button>
          <button onClick={() => onViewExpenses(merchantName)}>View Expenses</button>
        </div>
      );
    }
  };
});

import MerchantAnalyticsModal from './MerchantAnalyticsModal';
import * as merchantAnalyticsApi from '../services/merchantAnalyticsApi';

describe('MerchantAnalyticsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnViewExpenses = vi.fn();
  
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onViewExpenses: mockOnViewExpenses
  };

  const mockMerchants = [
    {
      name: 'Grocery Store',
      totalSpend: 1250.50,
      visitCount: 15,
      averageSpend: 83.37,
      percentOfTotal: 25.5,
      primaryCategory: 'Groceries',
      lastVisit: '2024-12-15'
    },
    {
      name: 'Gas Station',
      totalSpend: 800.25,
      visitCount: 12,
      averageSpend: 66.69,
      percentOfTotal: 16.3,
      primaryCategory: 'Gas',
      lastVisit: '2024-12-14'
    },
    {
      name: 'Restaurant',
      totalSpend: 450.75,
      visitCount: 8,
      averageSpend: 56.34,
      percentOfTotal: 9.2,
      primaryCategory: 'Dining Out',
      lastVisit: '2024-12-13'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    merchantAnalyticsApi.getTopMerchants.mockResolvedValue(mockMerchants);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    /**
     * Test modal visibility based on isOpen prop
     * Requirements: 1.1
     */
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <MerchantAnalyticsModal {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders modal when isOpen is true', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Merchant Analytics')).toBeInTheDocument();
      });
    });

    /**
     * Test loading state display
     * Requirements: 1.1
     */
    it('displays loading state initially', () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      expect(screen.getByText('Loading merchant analytics...')).toBeInTheDocument();
    });

    /**
     * Test merchant data rendering
     * Requirements: 1.1
     */
    it('displays merchants after loading', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
        expect(screen.getByText('Gas Station')).toBeInTheDocument();
        expect(screen.getByText('Restaurant')).toBeInTheDocument();
      });

      // Check merchant stats are displayed
      expect(screen.getByText('$1250.50')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('$83.37')).toBeInTheDocument();
      expect(screen.getByText('25.5%')).toBeInTheDocument();
    });

    /**
     * Test empty state display
     * Requirements: 1.1
     */
    it('displays empty state when no merchants exist', async () => {
      merchantAnalyticsApi.getTopMerchants.mockResolvedValue([]);
      
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('No merchant data found for the selected period.')).toBeInTheDocument();
      });
    });
  });

  describe('Period Filter Changes', () => {
    /**
     * Test period filter functionality
     * Requirements: 4.1
     */
    it('changes period filter and refetches data', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Find and change the period filter
      const periodSelect = document.querySelector('select[class*="merchant-analytics-filter-select"]');
      fireEvent.change(periodSelect, { target: { value: 'month' } });

      // Verify API was called with new period (includeFixedExpenses defaults to false)
      await waitFor(() => {
        expect(merchantAnalyticsApi.getTopMerchants).toHaveBeenCalledWith('month', 'total', false);
      });

      // Verify display text updates - check within the current-filters section
      const currentFilters = document.querySelector('.merchant-analytics-current-filters');
      expect(currentFilters).toHaveTextContent('This Month');
    });

    it('handles all period options correctly', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      const periodSelect = document.querySelector('select[class*="merchant-analytics-filter-select"]');
      
      // Test each period option
      const periods = [
        { value: 'all', display: 'All Time' },
        { value: '3months', display: 'Last 3 Months' },
        { value: 'month', display: 'This Month' }
      ];

      for (const period of periods) {
        fireEvent.change(periodSelect, { target: { value: period.value } });
        
        await waitFor(() => {
          expect(merchantAnalyticsApi.getTopMerchants).toHaveBeenCalledWith(period.value, 'total', false);
          // Check within the current-filters section to avoid matching dropdown options
          const currentFilters = document.querySelector('.merchant-analytics-current-filters');
          expect(currentFilters).toHaveTextContent(period.display);
        });
      }
    });
  });

  describe('Sort Toggle Functionality', () => {
    /**
     * Test sort toggle functionality
     * Requirements: 4.1
     */
    it('changes sort criteria and refetches data', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Find and change the sort filter
      const sortSelect = document.querySelectorAll('select[class*="merchant-analytics-filter-select"]')[1];
      fireEvent.change(sortSelect, { target: { value: 'visits' } });

      // Verify API was called with new sort criteria (includeFixedExpenses defaults to false)
      await waitFor(() => {
        expect(merchantAnalyticsApi.getTopMerchants).toHaveBeenCalledWith('year', 'visits', false);
      });

      // Verify display text updates - check within the current-filters section
      const currentFilters = document.querySelector('.merchant-analytics-current-filters');
      expect(currentFilters).toHaveTextContent('Visit Count');
    });

    it('handles all sort options correctly', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Test each sort option individually
      const sortOptions = [
        { value: 'visits', display: 'Visit Count' },
        { value: 'average', display: 'Average Spend' },
        { value: 'total', display: 'Total Spend' }
      ];

      for (const sort of sortOptions) {
        const sortSelect = document.querySelectorAll('select[class*="merchant-analytics-filter-select"]')[1];
        fireEvent.change(sortSelect, { target: { value: sort.value } });
        
        await waitFor(() => {
          expect(merchantAnalyticsApi.getTopMerchants).toHaveBeenCalledWith('year', sort.value, false);
          // Check within the current-filters section to avoid matching dropdown options
          const currentFilters = document.querySelector('.merchant-analytics-current-filters');
          expect(currentFilters).toHaveTextContent(sort.display);
        });
      }
    });
  });

  describe('Merchant Selection', () => {
    /**
     * Test merchant detail view navigation
     * Requirements: 1.1
     */
    it('shows merchant detail view when merchant is clicked', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      // Wait for merchants to load
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Click on a merchant
      fireEvent.click(screen.getByText('Grocery Store'));

      // Should show detail view
      await waitFor(() => {
        expect(screen.getByTestId('merchant-detail-view')).toBeInTheDocument();
        expect(screen.getByText('Grocery Store Details')).toBeInTheDocument();
      });

      // Main list should not be visible
      expect(screen.queryByText('Merchant Analytics')).not.toBeInTheDocument();
    });

    it('returns to main list from detail view', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      // Navigate to detail view
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Grocery Store'));

      await waitFor(() => {
        expect(screen.getByTestId('merchant-detail-view')).toBeInTheDocument();
      });

      // Click back button
      fireEvent.click(screen.getByText('Back to Analytics'));

      // Should return to main list
      await waitFor(() => {
        expect(screen.getByText('Merchant Analytics')).toBeInTheDocument();
        expect(screen.queryByTestId('merchant-detail-view')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    /**
     * Test error state display and retry functionality
     * Requirements: 1.1
     */
    it('displays error message when API fails', async () => {
      const errorMessage = 'Network error occurred';
      merchantAnalyticsApi.getTopMerchants.mockRejectedValue(new Error(errorMessage));
      
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('shows retry button on error with empty merchants list', async () => {
      merchantAnalyticsApi.getTopMerchants.mockRejectedValue(new Error('Network error'));
      
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries API call when retry button is clicked', async () => {
      // First call fails
      merchantAnalyticsApi.getTopMerchants.mockRejectedValueOnce(new Error('Network error'));
      // Second call succeeds
      merchantAnalyticsApi.getTopMerchants.mockResolvedValueOnce(mockMerchants);
      
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByText('Retry'));

      // Should show merchants after retry
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Verify API was called twice
      expect(merchantAnalyticsApi.getTopMerchants).toHaveBeenCalledTimes(2);
    });
  });

  describe('Modal Close Functionality', () => {
    /**
     * Test modal closing and state reset
     * Requirements: 1.1
     */
    it('calls onClose when close button is clicked', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Merchant Analytics')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('✕'));
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when overlay is clicked', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Merchant Analytics')).toBeInTheDocument();
      });

      // Click on overlay (the modal container's parent)
      const overlay = document.querySelector('.modal-overlay');
      fireEvent.click(overlay);
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not close when modal content is clicked', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Merchant Analytics')).toBeInTheDocument();
      });

      // Click on modal content
      const modalContent = document.querySelector('.merchant-analytics-modal-container');
      fireEvent.click(modalContent);
      
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Filter State Management', () => {
    /**
     * Test filter state persistence and reset
     * Requirements: 4.1
     */
    it('resets filters when modal is closed and reopened', async () => {
      const { rerender } = render(<MerchantAnalyticsModal {...defaultProps} />);
      
      // Wait for initial load and change filters
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      const periodSelect = document.querySelector('select[class*="merchant-analytics-filter-select"]');
      const sortSelect = document.querySelectorAll('select[class*="merchant-analytics-filter-select"]')[1];
      
      fireEvent.change(periodSelect, { target: { value: 'month' } });
      fireEvent.change(sortSelect, { target: { value: 'visits' } });

      // Close modal by clicking close button (which triggers handleClose that resets state)
      fireEvent.click(screen.getByText('✕'));
      
      // Reopen modal
      rerender(<MerchantAnalyticsModal {...defaultProps} isOpen={true} />);

      // Filters should be reset to defaults
      await waitFor(() => {
        const newPeriodSelect = document.querySelector('select[class*="merchant-analytics-filter-select"]');
        const newSortSelect = document.querySelectorAll('select[class*="merchant-analytics-filter-select"]')[1];
        expect(newPeriodSelect.value).toBe('year');
        expect(newSortSelect.value).toBe('total');
      });
    });
  });

  describe('View Expenses Integration', () => {
    /**
     * Test expense view integration from detail view
     * Requirements: 1.1
     */
    it('calls onViewExpenses and closes modal when view expenses is triggered', async () => {
      render(<MerchantAnalyticsModal {...defaultProps} />);
      
      // Navigate to detail view
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Grocery Store'));

      await waitFor(() => {
        expect(screen.getByTestId('merchant-detail-view')).toBeInTheDocument();
      });

      // Click view expenses button
      fireEvent.click(screen.getByText('View Expenses'));

      // Should call onViewExpenses with merchant name and close modal
      expect(mockOnViewExpenses).toHaveBeenCalledWith('Grocery Store');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});