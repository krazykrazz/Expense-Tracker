import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PaymentTrackingHistory from './PaymentTrackingHistory';

describe('PaymentTrackingHistory', () => {
  const defaultProps = {
    payments: [],
    onAddPayment: vi.fn(),
    onUpdatePayment: vi.fn(),
    onDeletePayment: vi.fn(),
    loading: false
  };

  /**
   * Test heading displays "Payment Amount History"
   * Requirements: 3.1
   * Validates: Requirements 3.1
   */
  it('should display "Payment Amount History" heading', () => {
    render(<PaymentTrackingHistory {...defaultProps} />);

    expect(screen.getByText('Payment Amount History')).toBeInTheDocument();
  });

  /**
   * Test add button displays "+ Add Payment Amount Change"
   * Requirements: 3.2
   * Validates: Requirements 3.2
   */
  it('should display "+ Add Payment Amount Change" button label', () => {
    render(<PaymentTrackingHistory {...defaultProps} />);

    expect(screen.getByRole('button', { name: '+ Add Payment Amount Change' })).toBeInTheDocument();
  });

  /**
   * Test empty state displays "No payment amount changes recorded yet"
   * Requirements: 3.3
   * Validates: Requirements 3.3
   */
  it('should display "No payment amount changes recorded yet" when no payments', () => {
    render(<PaymentTrackingHistory {...defaultProps} payments={[]} />);

    expect(screen.getByText('No payment amount changes recorded yet')).toBeInTheDocument();
  });

  /**
   * Test empty hint displays the rate renewal guidance text
   * Requirements: 3.3
   * Validates: Requirements 3.3
   */
  it('should display empty hint about tracking payment amount changes', () => {
    render(<PaymentTrackingHistory {...defaultProps} payments={[]} />);

    expect(
      screen.getByText('Track when your recurring mortgage payment amount changes (e.g., after a rate renewal)')
    ).toBeInTheDocument();
  });
});
