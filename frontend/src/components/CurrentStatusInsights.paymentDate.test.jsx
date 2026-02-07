import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the nextPaymentCalculator utility to control payment date calculations
vi.mock('../utils/nextPaymentCalculator', () => ({
  calculateNextPaymentDate: vi.fn(),
  formatNextPaymentDate: vi.fn(),
  classifyPaymentUrgency: vi.fn()
}));

// Mock formatters used by the component
vi.mock('../utils/formatters', () => ({
  formatCurrency: vi.fn((val) => `$${(val || 0).toFixed(2)}`),
  getTodayLocalDate: vi.fn(() => '2025-06-15'),
  formatMonthString: vi.fn((str) => str)
}));

import CurrentStatusInsights from './CurrentStatusInsights';
import { calculateNextPaymentDate, formatNextPaymentDate, classifyPaymentUrgency } from '../utils/nextPaymentCalculator';

// Valid insights data required for the component to render (avoids "Rate not set" fallback)
const validInsights = {
  currentStatus: {
    balance: 250000,
    rate: 4.5,
    rateType: 'variable',
    currentPayment: 1500,
    minimumPayment: 1200,
    interestBreakdown: {
      daily: 30.82,
      weekly: 215.75,
      monthly: 937.50,
      annual: 11250
    }
  },
  dataStatus: {
    hasBalanceData: true,
    hasPaymentData: true,
    lastUpdated: '2025-06'
  }
};

describe('CurrentStatusInsights - Payment Date Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: Renders formatted next payment date when paymentDueDay is set
   * Requirements: 3.1
   */
  it('should display formatted next payment date when paymentDueDay is set', () => {
    const nextDate = new Date(2025, 6, 15); // July 15, 2025
    calculateNextPaymentDate.mockReturnValue({ nextDate, daysUntil: 30 });
    formatNextPaymentDate.mockReturnValue('July 15, 2025');
    classifyPaymentUrgency.mockReturnValue({ isPaymentToday: false, isPaymentSoon: false, urgency: 'normal' });

    render(
      <CurrentStatusInsights
        insights={validInsights}
        onEditPayment={vi.fn()}
        onEditRate={vi.fn()}
        paymentDueDay={15}
      />
    );

    expect(screen.getByText('Next Payment')).toBeInTheDocument();
    expect(screen.getByText('July 15, 2025')).toBeInTheDocument();
    expect(calculateNextPaymentDate).toHaveBeenCalledWith(15);
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment due today')).not.toBeInTheDocument();
  });

  /**
   * Test: Shows "Due soon" badge when payment is within 7 days
   * Requirements: 3.2
   */
  it('should show "Due soon" badge when payment is within 7 days', () => {
    const nextDate = new Date(2025, 5, 20); // June 20, 2025
    calculateNextPaymentDate.mockReturnValue({ nextDate, daysUntil: 5 });
    formatNextPaymentDate.mockReturnValue('June 20, 2025');
    classifyPaymentUrgency.mockReturnValue({ isPaymentToday: false, isPaymentSoon: true, urgency: 'soon' });

    render(
      <CurrentStatusInsights
        insights={validInsights}
        onEditPayment={vi.fn()}
        onEditRate={vi.fn()}
        paymentDueDay={20}
      />
    );

    expect(screen.getByText('June 20, 2025')).toBeInTheDocument();
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    // Verify the date element has the 'soon' class
    const dateElement = screen.getByText('June 20, 2025');
    expect(dateElement).toHaveClass('soon');
  });

  /**
   * Test: Shows "Payment due today" when daysUntil is 0
   * Requirements: 3.3
   */
  it('should show "Payment due today" when payment is due today', () => {
    const nextDate = new Date(2025, 5, 15); // June 15, 2025
    calculateNextPaymentDate.mockReturnValue({ nextDate, daysUntil: 0 });
    formatNextPaymentDate.mockReturnValue('June 15, 2025');
    classifyPaymentUrgency.mockReturnValue({ isPaymentToday: true, isPaymentSoon: true, urgency: 'today' });

    render(
      <CurrentStatusInsights
        insights={validInsights}
        onEditPayment={vi.fn()}
        onEditRate={vi.fn()}
        paymentDueDay={15}
      />
    );

    expect(screen.getByText('Payment due today')).toBeInTheDocument();
    // Verify the element has the 'today' class
    const todayElement = screen.getByText('Payment due today');
    expect(todayElement).toHaveClass('today');
    // Should NOT show "Due soon" badge when it's today
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
  });

  /**
   * Test: Shows "Payment day not set" fallback when paymentDueDay is null
   * Requirements: 3.4
   */
  it('should display "Payment day not set" when paymentDueDay is null', () => {
    render(
      <CurrentStatusInsights
        insights={validInsights}
        onEditPayment={vi.fn()}
        onEditRate={vi.fn()}
        paymentDueDay={null}
      />
    );

    expect(screen.getByText('Payment day not set')).toBeInTheDocument();
    expect(screen.getByText('Configure in fixed expenses')).toBeInTheDocument();
    // calculateNextPaymentDate should not be called when paymentDueDay is null
    expect(calculateNextPaymentDate).not.toHaveBeenCalled();
  });

  /**
   * Test: Shows "Payment day not set" when paymentDueDay prop is omitted (defaults to null)
   * Requirements: 3.4
   */
  it('should display "Payment day not set" when paymentDueDay prop is omitted', () => {
    render(
      <CurrentStatusInsights
        insights={validInsights}
        onEditPayment={vi.fn()}
        onEditRate={vi.fn()}
      />
    );

    expect(screen.getByText('Payment day not set')).toBeInTheDocument();
    expect(screen.getByText('Configure in fixed expenses')).toBeInTheDocument();
  });
});
