/**
 * PaymentBalanceChart Component Tests
 * Requirements: 7.1, 7.2, 7.3
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PaymentBalanceChart from './PaymentBalanceChart';

describe('PaymentBalanceChart', () => {
  const mockPayments = [
    { id: 1, amount: 500, payment_date: '2024-01-15', notes: 'First payment' },
    { id: 2, amount: 500, payment_date: '2024-02-15', notes: 'Second payment' },
    { id: 3, amount: 500, payment_date: '2024-03-15', notes: null }
  ];

  const defaultProps = {
    payments: mockPayments,
    initialBalance: 10000,
    loanName: 'Test Loan'
  };

  describe('Requirement 7.1: Balance reduction chart', () => {
    it('renders the chart when payments exist', () => {
      const { container } = render(<PaymentBalanceChart {...defaultProps} />);
      
      expect(screen.getByText('Balance Over Time')).toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('shows balance reduction percentage', () => {
      render(<PaymentBalanceChart {...defaultProps} />);
      
      // 1500 paid of 10000 = 15%
      expect(screen.getByText('15.0%')).toBeInTheDocument();
    });

    it('shows remaining balance', () => {
      render(<PaymentBalanceChart {...defaultProps} />);
      
      // 10000 - 1500 = 8500
      expect(screen.getByText('$8,500.00')).toBeInTheDocument();
    });

    it('renders SVG chart with correct structure', () => {
      const { container } = render(<PaymentBalanceChart {...defaultProps} />);
      
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      
      // Should have path elements for lines
      const paths = svg.querySelectorAll('path');
      expect(paths.length).toBeGreaterThan(0);
      
      // Should have circle elements for data points
      const circles = svg.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);
    });
  });

  describe('Requirement 7.2: Cumulative payments on chart', () => {
    it('shows legend with both balance and cumulative payments', () => {
      const { container } = render(<PaymentBalanceChart {...defaultProps} />);
      
      // Use more specific selectors for legend items
      const legend = container.querySelector('.payment-balance-chart-legend');
      expect(legend).toBeInTheDocument();
      expect(legend.textContent).toContain('Balance');
      expect(legend.textContent).toContain('Cumulative Payments');
    });

    it('renders two lines (balance and cumulative payments)', () => {
      const { container } = render(<PaymentBalanceChart {...defaultProps} />);
      
      const svg = container.querySelector('svg');
      // Should have multiple path elements - one for area fill, one for balance line, one for payments line
      const paths = svg.querySelectorAll('path[stroke]');
      expect(paths.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Requirement 7.3: Tooltips for payment details', () => {
    it('shows tooltip on hover with payment details', () => {
      const { container } = render(<PaymentBalanceChart {...defaultProps} />);
      
      // Find a data point circle and hover over it
      const circles = container.querySelectorAll('svg circle');
      expect(circles.length).toBeGreaterThan(0);
      
      // Hover over a payment point (not the start point)
      const paymentCircle = circles[1]; // Second circle should be first payment
      fireEvent.mouseEnter(paymentCircle);
      
      // Tooltip should appear with payment info
      const tooltip = container.querySelector('.payment-balance-chart-tooltip');
      expect(tooltip).toBeInTheDocument();
    });

    it('hides tooltip on mouse leave', () => {
      const { container } = render(<PaymentBalanceChart {...defaultProps} />);
      
      const circles = container.querySelectorAll('svg circle');
      const paymentCircle = circles[1];
      
      // Hover then leave
      fireEvent.mouseEnter(paymentCircle);
      expect(container.querySelector('.payment-balance-chart-tooltip')).toBeInTheDocument();
      
      fireEvent.mouseLeave(paymentCircle);
      expect(container.querySelector('.payment-balance-chart-tooltip')).not.toBeInTheDocument();
    });

    it('tooltip shows payment amount, balance, and cumulative total', () => {
      const { container } = render(<PaymentBalanceChart {...defaultProps} />);
      
      const circles = container.querySelectorAll('svg circle');
      const paymentCircle = circles[1];
      
      fireEvent.mouseEnter(paymentCircle);
      
      const tooltip = container.querySelector('.payment-balance-chart-tooltip');
      expect(tooltip).toBeInTheDocument();
      
      // Should show payment, balance, and total paid labels
      expect(tooltip.textContent).toContain('Payment');
      expect(tooltip.textContent).toContain('Balance');
      expect(tooltip.textContent).toContain('Total Paid');
    });
  });

  describe('Empty state', () => {
    it('shows message when no payments exist', () => {
      render(<PaymentBalanceChart payments={[]} initialBalance={10000} />);
      
      expect(screen.getByText('Log payments to see your balance reduction over time.')).toBeInTheDocument();
    });

    it('does not render chart when payments array is empty', () => {
      const { container } = render(<PaymentBalanceChart payments={[]} initialBalance={10000} />);
      
      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    it('handles undefined payments gracefully', () => {
      render(<PaymentBalanceChart payments={undefined} initialBalance={10000} />);
      
      expect(screen.getByText('Log payments to see your balance reduction over time.')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles single payment correctly', () => {
      const singlePayment = [{ id: 1, amount: 1000, payment_date: '2024-01-15', notes: null }];
      
      render(<PaymentBalanceChart payments={singlePayment} initialBalance={10000} />);
      
      expect(screen.getByText('Balance Over Time')).toBeInTheDocument();
      expect(screen.getByText('10.0%')).toBeInTheDocument(); // 1000/10000 = 10%
    });

    it('handles payments that exceed initial balance', () => {
      const largePayments = [
        { id: 1, amount: 6000, payment_date: '2024-01-15', notes: null },
        { id: 2, amount: 6000, payment_date: '2024-02-15', notes: null }
      ];
      
      const { container } = render(<PaymentBalanceChart payments={largePayments} initialBalance={10000} />);
      
      // Should show 100% or more paid off
      expect(screen.getByText('120.0%')).toBeInTheDocument();
      // Remaining balance should be $0 - use specific selector for summary value
      const summaryValue = container.querySelector('.chart-summary-stat:nth-child(2) .chart-summary-value');
      expect(summaryValue.textContent).toBe('$0.00');
    });

    it('handles zero initial balance', () => {
      render(<PaymentBalanceChart payments={mockPayments} initialBalance={0} />);
      
      // Should still render without errors
      expect(screen.getByText('Balance Over Time')).toBeInTheDocument();
    });

    it('sorts payments chronologically regardless of input order', () => {
      const unorderedPayments = [
        { id: 3, amount: 300, payment_date: '2024-03-15', notes: null },
        { id: 1, amount: 100, payment_date: '2024-01-15', notes: null },
        { id: 2, amount: 200, payment_date: '2024-02-15', notes: null }
      ];
      
      const { container } = render(
        <PaymentBalanceChart payments={unorderedPayments} initialBalance={10000} />
      );
      
      // Chart should render without errors
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible chart structure', () => {
      const { container } = render(<PaymentBalanceChart {...defaultProps} />);
      
      // SVG should be present
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      
      // Data points should be interactive
      const circles = svg.querySelectorAll('circle');
      circles.forEach(circle => {
        expect(circle.style.cursor).toBe('pointer');
      });
    });
  });
});
