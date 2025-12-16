import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the merchant analytics API
vi.mock('../services/merchantAnalyticsApi', () => ({
  getMerchantDetails: vi.fn(),
  getMerchantTrend: vi.fn()
}));

// Mock the formatters
vi.mock('../utils/formatters', () => ({
  formatCurrency: vi.fn((amount) => `$${amount.toFixed(2)}`),
  formatDate: vi.fn((date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  })
}));

import MerchantDetailView from './MerchantDetailView';
import * as merchantAnalyticsApi from '../services/merchantAnalyticsApi';

describe('MerchantDetailView', () => {
  const mockOnClose = vi.fn();
  const mockOnViewExpenses = vi.fn();
  
  const defaultProps = {
    merchantName: 'Grocery Store',
    period: 'year',
    isOpen: true,
    onClose: mockOnClose,
    onViewExpenses: mockOnViewExpenses
  };

  const mockMerchantDetails = {
    name: 'Grocery Store',
    totalSpend: 1250.50,
    visitCount: 15,
    averageSpend: 83.37,
    percentOfTotal: 25.5,
    firstVisit: '2024-01-15',
    lastVisit: '2024-12-15',
    avgDaysBetweenVisits: 22.5,
    primaryCategory: 'Groceries',
    primaryPaymentMethod: 'Credit Card',
    categoryBreakdown: [
      {
        category: 'Groceries',
        amount: 1000.50,
        count: 12,
        percentage: 80.0
      },
      {
        category: 'Personal Care',
        amount: 250.00,
        count: 3,
        percentage: 20.0
      }
    ],
    paymentMethodBreakdown: [
      {
        method: 'Credit Card',
        amount: 900.50,
        count: 10
      },
      {
        method: 'Debit Card',
        amount: 350.00,
        count: 5
      }
    ]
  };

  const mockTrendData = [
    {
      year: 2024,
      month: 12,
      monthName: 'Dec 2024',
      amount: 120.50,
      visitCount: 2,
      changePercent: 15.5
    },
    {
      year: 2024,
      month: 11,
      monthName: 'Nov 2024',
      amount: 104.25,
      visitCount: 1,
      changePercent: -8.2
    },
    {
      year: 2024,
      month: 10,
      monthName: 'Oct 2024',
      amount: 0,
      visitCount: 0,
      changePercent: null
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    merchantAnalyticsApi.getMerchantDetails.mockResolvedValue(mockMerchantDetails);
    merchantAnalyticsApi.getMerchantTrend.mockResolvedValue(mockTrendData);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    /**
     * Test component visibility based on isOpen prop
     * Requirements: 2.1
     */
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <MerchantDetailView {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders detail view when isOpen is true', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });
    });

    /**
     * Test loading state display
     * Requirements: 2.1
     */
    it('displays loading state initially', () => {
      render(<MerchantDetailView {...defaultProps} />);
      expect(screen.getByText('Loading merchant details...')).toBeInTheDocument();
    });

    /**
     * Test merchant details rendering
     * Requirements: 2.1, 2.2, 2.3
     */
    it('displays merchant details after loading', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
        expect(screen.getByText('Groceries')).toBeInTheDocument(); // Primary category badge
      });

      // Check spending summary
      expect(screen.getByText('$1250.50')).toBeInTheDocument(); // Total spent
      expect(screen.getByText('15')).toBeInTheDocument(); // Visit count
      expect(screen.getByText('$83.37')).toBeInTheDocument(); // Average spend
      expect(screen.getByText('25.5%')).toBeInTheDocument(); // Percentage of total

      // Check date range (dates are formatted by the mock)
      expect(screen.getByText('Jan 14, 2024')).toBeInTheDocument(); // First visit
      expect(screen.getByText('Dec 14, 2024')).toBeInTheDocument(); // Last visit

      // Check average days between visits
      expect(screen.getByText('23 days')).toBeInTheDocument(); // Rounded avgDaysBetweenVisits

      // Check primary payment method
      expect(screen.getByText('Credit Card')).toBeInTheDocument();
    });
  });

  describe('Category Breakdown Display', () => {
    /**
     * Test category breakdown rendering
     * Requirements: 2.3
     */
    it('displays category breakdown correctly', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Category Breakdown')).toBeInTheDocument();
      });

      // Check category breakdown section exists
      const categorySection = screen.getByText('Category Breakdown').closest('.merchant-breakdown-section');
      expect(categorySection).toBeInTheDocument();
      
      // Check first category within the category section
      expect(categorySection).toHaveTextContent('Groceries');
      expect(categorySection).toHaveTextContent('(12 visits)');
      expect(categorySection).toHaveTextContent('$1000.50');
      expect(categorySection).toHaveTextContent('80.0%');

      // Check second category
      expect(categorySection).toHaveTextContent('Personal Care');
      expect(categorySection).toHaveTextContent('(3 visits)');
      expect(categorySection).toHaveTextContent('$250.00');
      expect(categorySection).toHaveTextContent('20.0%');
    });

    it('handles empty category breakdown', async () => {
      const detailsWithoutCategories = {
        ...mockMerchantDetails,
        categoryBreakdown: []
      };
      merchantAnalyticsApi.getMerchantDetails.mockResolvedValue(detailsWithoutCategories);
      
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Category breakdown section should not be rendered
      expect(screen.queryByText('Category Breakdown')).not.toBeInTheDocument();
    });
  });

  describe('Payment Method Breakdown Display', () => {
    /**
     * Test payment method breakdown rendering
     * Requirements: 2.4
     */
    it('displays payment method breakdown correctly', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Payment Method Breakdown')).toBeInTheDocument();
      });

      // Check payment method breakdown section exists
      const paymentSection = screen.getByText('Payment Method Breakdown').closest('.merchant-breakdown-section');
      expect(paymentSection).toBeInTheDocument();
      
      // Check first payment method within the payment section
      expect(paymentSection).toHaveTextContent('Credit Card');
      expect(paymentSection).toHaveTextContent('(10 visits)');
      expect(paymentSection).toHaveTextContent('$900.50');

      // Check second payment method
      expect(paymentSection).toHaveTextContent('Debit Card');
      expect(paymentSection).toHaveTextContent('(5 visits)');
      expect(paymentSection).toHaveTextContent('$350.00');
    });

    it('handles empty payment method breakdown', async () => {
      const detailsWithoutPaymentMethods = {
        ...mockMerchantDetails,
        paymentMethodBreakdown: []
      };
      merchantAnalyticsApi.getMerchantDetails.mockResolvedValue(detailsWithoutPaymentMethods);
      
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Payment method breakdown section should not be rendered
      expect(screen.queryByText('Payment Method Breakdown')).not.toBeInTheDocument();
    });
  });

  describe('N/A Display for Single Visit Merchants', () => {
    /**
     * Test N/A display for single visit merchants
     * Requirements: 3.3
     */
    it('displays N/A for average days between visits when avgDaysBetweenVisits is null', async () => {
      const singleVisitMerchant = {
        ...mockMerchantDetails,
        visitCount: 1,
        avgDaysBetweenVisits: null
      };
      merchantAnalyticsApi.getMerchantDetails.mockResolvedValue(singleVisitMerchant);
      
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('N/A')).toBeInTheDocument();
      });

      // Should not show days text
      expect(screen.queryByText(/days/)).not.toBeInTheDocument();
    });

    it('displays days for merchants with multiple visits', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('23 days')).toBeInTheDocument();
      });
    });
  });

  describe('Trend Chart Rendering', () => {
    /**
     * Test trend chart rendering
     * Requirements: 5.1
     */
    it('displays trend chart when trend data is available', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Monthly Spending Trend')).toBeInTheDocument();
        expect(screen.getByText('Last 12 months of spending at Grocery Store')).toBeInTheDocument();
      });

      // Check for SVG chart
      const svgElement = document.querySelector('svg');
      expect(svgElement).toBeInTheDocument();
    });

    it('handles empty trend data', async () => {
      merchantAnalyticsApi.getMerchantTrend.mockResolvedValue([]);
      
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Trend chart section should not be rendered
      expect(screen.queryByText('Monthly Spending Trend')).not.toBeInTheDocument();
    });

    it('displays month-over-month change percentages in chart', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Monthly Spending Trend')).toBeInTheDocument();
      });

      // Check for change percentage tooltips (these are in SVG title elements)
      const svgElement = document.querySelector('svg');
      expect(svgElement).toBeInTheDocument();
      
      // The chart should contain the trend data points
      const circles = svgElement.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);
    });
  });

  describe('View All Expenses Button', () => {
    /**
     * Test view all expenses functionality
     * Requirements: 2.1
     */
    it('calls onViewExpenses when view all expenses button is clicked', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('📋 View All Expenses')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('📋 View All Expenses'));
      
      expect(mockOnViewExpenses).toHaveBeenCalledWith('Grocery Store');
    });
  });

  describe('Navigation and Close Functionality', () => {
    /**
     * Test navigation and close functionality
     * Requirements: 2.1
     */
    it('calls onClose when back button is clicked', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('← Back to Analytics')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('← Back to Analytics'));
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when close button is clicked', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('✕')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('✕'));
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when overlay is clicked', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Click on overlay
      const overlay = document.querySelector('.merchant-detail-overlay');
      fireEvent.click(overlay);
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not close when modal content is clicked', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Grocery Store')).toBeInTheDocument();
      });

      // Click on modal content
      const modalContent = document.querySelector('.merchant-detail-container');
      fireEvent.click(modalContent);
      
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    /**
     * Test error state display and retry functionality
     * Requirements: 2.1
     */
    it('displays error message when API fails', async () => {
      const errorMessage = 'Network error occurred';
      merchantAnalyticsApi.getMerchantDetails.mockRejectedValue(new Error(errorMessage));
      
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      merchantAnalyticsApi.getMerchantDetails.mockRejectedValue(new Error('Network error'));
      
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries API call when retry button is clicked', async () => {
      // First call fails
      merchantAnalyticsApi.getMerchantDetails.mockRejectedValueOnce(new Error('Network error'));
      merchantAnalyticsApi.getMerchantTrend.mockRejectedValueOnce(new Error('Network error'));
      
      // Second call succeeds
      merchantAnalyticsApi.getMerchantDetails.mockResolvedValueOnce(mockMerchantDetails);
      merchantAnalyticsApi.getMerchantTrend.mockResolvedValueOnce(mockTrendData);
      
      render(<MerchantDetailView {...defaultProps} />);
      
      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByText('Retry'));

      // Should show merchant details after retry
      await waitFor(() => {
        expect(screen.getByText('Spending Summary')).toBeInTheDocument();
      });

      // Verify API was called twice for each endpoint
      expect(merchantAnalyticsApi.getMerchantDetails).toHaveBeenCalledTimes(2);
      expect(merchantAnalyticsApi.getMerchantTrend).toHaveBeenCalledTimes(2);
    });

    it('displays empty state when no merchant details are available', async () => {
      merchantAnalyticsApi.getMerchantDetails.mockResolvedValue(null);
      
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('No details available for this merchant.')).toBeInTheDocument();
      });
    });
  });

  describe('API Integration', () => {
    /**
     * Test API calls with correct parameters
     * Requirements: 2.1, 2.2
     */
    it('calls API with correct parameters on mount', async () => {
      render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(merchantAnalyticsApi.getMerchantDetails).toHaveBeenCalledWith('Grocery Store', 'year');
        expect(merchantAnalyticsApi.getMerchantTrend).toHaveBeenCalledWith('Grocery Store', 12);
      });
    });

    it('refetches data when period changes', async () => {
      const { rerender } = render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(merchantAnalyticsApi.getMerchantDetails).toHaveBeenCalledWith('Grocery Store', 'year');
      });

      // Change period
      rerender(<MerchantDetailView {...defaultProps} period="month" />);
      
      await waitFor(() => {
        expect(merchantAnalyticsApi.getMerchantDetails).toHaveBeenCalledWith('Grocery Store', 'month');
      });
    });

    it('refetches data when merchant name changes', async () => {
      const { rerender } = render(<MerchantDetailView {...defaultProps} />);
      
      await waitFor(() => {
        expect(merchantAnalyticsApi.getMerchantDetails).toHaveBeenCalledWith('Grocery Store', 'year');
      });

      // Change merchant name
      rerender(<MerchantDetailView {...defaultProps} merchantName="Gas Station" />);
      
      await waitFor(() => {
        expect(merchantAnalyticsApi.getMerchantDetails).toHaveBeenCalledWith('Gas Station', 'year');
        expect(merchantAnalyticsApi.getMerchantTrend).toHaveBeenCalledWith('Gas Station', 12);
      });
    });
  });

  describe('State Management', () => {
    /**
     * Test component state reset on close
     * Requirements: 2.1
     */
    it('resets state when component is closed and reopened', async () => {
      const { rerender } = render(<MerchantDetailView {...defaultProps} />);
      
      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Spending Summary')).toBeInTheDocument();
      });

      // Close component
      rerender(<MerchantDetailView {...defaultProps} isOpen={false} />);
      
      // Reopen component
      rerender(<MerchantDetailView {...defaultProps} isOpen={true} />);

      // Should show loading state again
      expect(screen.getByText('Loading merchant details...')).toBeInTheDocument();
    });
  });
});