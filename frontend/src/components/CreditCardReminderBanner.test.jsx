/**
 * Unit Tests for CreditCardReminderBanner Component
 * Tests rendering, required payment display, urgency indicators, and paid status
 * _Requirements: 8.1, 8.4, 8.5_
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import CreditCardReminderBanner from './CreditCardReminderBanner';

describe('CreditCardReminderBanner', () => {
  // Mock card data for single card scenarios
  const mockSingleCard = {
    id: 1,
    display_name: 'Visa',
    full_name: 'Visa Credit Card',
    current_balance: 1500.00,
    statement_balance: 850.00,
    required_payment: 850.00,
    credit_limit: 5000,
    payment_due_day: 15,
    billing_cycle_day: 25,
    days_until_due: 5,
    is_statement_paid: false,
    is_overdue: false,
    is_due_soon: true,
    cycle_start_date: '2026-01-26',
    cycle_end_date: '2026-02-25'
  };

  // Mock card data for overdue scenario
  const mockOverdueCard = {
    ...mockSingleCard,
    id: 2,
    display_name: 'Mastercard',
    days_until_due: -3,
    is_overdue: true,
    is_due_soon: false
  };

  // Mock card data for paid scenario
  const mockPaidCard = {
    ...mockSingleCard,
    id: 3,
    display_name: 'Amex',
    statement_balance: 0,
    required_payment: 0,
    is_statement_paid: true,
    is_overdue: false,
    is_due_soon: false
  };

  const mockCallbacks = {
    onDismiss: vi.fn(),
    onClick: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    test('should render null when no cards provided', () => {
      const { container } = render(
        <CreditCardReminderBanner cards={[]} {...mockCallbacks} />
      );
      expect(container.firstChild).toBeNull();
    });

    test('should render null when cards is null', () => {
      const { container } = render(
        <CreditCardReminderBanner cards={null} {...mockCallbacks} />
      );
      expect(container.firstChild).toBeNull();
    });

    test('should render banner with single card', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockSingleCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('credit-card-reminder-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveClass('credit-card-reminder-banner', 'due-soon');
    });

    test('should render overdue banner with correct styling', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockOverdueCard]} 
          isOverdue={true}
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('credit-card-reminder-banner');
      expect(banner).toHaveClass('credit-card-reminder-banner', 'overdue');
    });
  });

  describe('Required Payment Amount Display - Requirements: 8.1', () => {
    test('should display required payment amount for single card', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockSingleCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const paymentAmount = screen.getByTestId('required-payment-amount');
      expect(paymentAmount).toBeInTheDocument();
      expect(paymentAmount).toHaveTextContent('$850.00');
    });

    test('should display total required payment for multiple cards', () => {
      const multipleCards = [
        { ...mockSingleCard, id: 1, required_payment: 500 },
        { ...mockSingleCard, id: 2, display_name: 'Mastercard', required_payment: 300 }
      ];
      
      render(
        <CreditCardReminderBanner 
          cards={multipleCards} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const paymentAmount = screen.getByTestId('required-payment-amount');
      expect(paymentAmount).toBeInTheDocument();
      expect(paymentAmount).toHaveTextContent('$800.00');
    });

    test('should display $0.00 for paid statement', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockPaidCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const paymentAmount = screen.getByTestId('required-payment-amount');
      expect(paymentAmount).toHaveTextContent('$0.00');
    });

    test('should handle cards with undefined required_payment', () => {
      const cardWithUndefinedPayment = {
        ...mockSingleCard,
        required_payment: undefined
      };
      
      render(
        <CreditCardReminderBanner 
          cards={[cardWithUndefinedPayment]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const paymentAmount = screen.getByTestId('required-payment-amount');
      expect(paymentAmount).toHaveTextContent('$0.00');
    });
  });

  describe('Urgency Indicator Display - Requirements: 8.4', () => {
    test('should display "Overdue" indicator for overdue cards', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockOverdueCard]} 
          isOverdue={true}
          {...mockCallbacks} 
        />
      );
      
      const urgencyIndicator = screen.getByTestId('urgency-indicator');
      expect(urgencyIndicator).toBeInTheDocument();
      expect(urgencyIndicator).toHaveTextContent('Overdue');
      expect(urgencyIndicator).toHaveClass('overdue');
    });

    test('should display "Due Today" indicator when days_until_due is 0', () => {
      const dueTodayCard = {
        ...mockSingleCard,
        days_until_due: 0,
        is_due_soon: true
      };
      
      render(
        <CreditCardReminderBanner 
          cards={[dueTodayCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const urgencyIndicator = screen.getByTestId('urgency-indicator');
      expect(urgencyIndicator).toHaveTextContent('Due Today');
      expect(urgencyIndicator).toHaveClass('due-today');
    });

    test('should display "Due Soon" indicator when due within 3 days', () => {
      const dueSoonCard = {
        ...mockSingleCard,
        days_until_due: 2,
        is_due_soon: true
      };
      
      render(
        <CreditCardReminderBanner 
          cards={[dueSoonCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const urgencyIndicator = screen.getByTestId('urgency-indicator');
      expect(urgencyIndicator).toHaveTextContent('Due Soon');
      expect(urgencyIndicator).toHaveClass('due-soon');
    });

    test('should display "Upcoming" indicator when due in more than 3 days', () => {
      const upcomingCard = {
        ...mockSingleCard,
        days_until_due: 5,
        is_due_soon: true
      };
      
      render(
        <CreditCardReminderBanner 
          cards={[upcomingCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const urgencyIndicator = screen.getByTestId('urgency-indicator');
      expect(urgencyIndicator).toHaveTextContent('Upcoming');
      expect(urgencyIndicator).toHaveClass('upcoming');
    });
  });

  describe('Paid Status Display - Requirements: 8.5', () => {
    test('should display "Paid" indicator when statement is paid', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockPaidCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const urgencyIndicator = screen.getByTestId('urgency-indicator');
      expect(urgencyIndicator).toHaveTextContent('Paid');
      expect(urgencyIndicator).toHaveClass('paid');
    });

    test('should prioritize paid status over other indicators', () => {
      // Card that is both paid and would otherwise be due soon
      const paidButDueSoon = {
        ...mockSingleCard,
        is_statement_paid: true,
        is_due_soon: true,
        required_payment: 0
      };
      
      render(
        <CreditCardReminderBanner 
          cards={[paidButDueSoon]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const urgencyIndicator = screen.getByTestId('urgency-indicator');
      expect(urgencyIndicator).toHaveTextContent('Paid');
    });
  });

  describe('Payment Due Date Display - Requirements: 8.2', () => {
    test('should display payment due day for single card', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockSingleCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const dueDate = screen.getByTestId('payment-due-date');
      expect(dueDate).toBeInTheDocument();
      expect(dueDate).toHaveTextContent('Due on day 15 of each month');
    });
  });

  describe('Multiple Cards Display', () => {
    test('should display breakdown of individual card amounts', () => {
      const multipleCards = [
        { ...mockSingleCard, id: 1, display_name: 'Visa', required_payment: 500 },
        { ...mockSingleCard, id: 2, display_name: 'Mastercard', required_payment: 300 }
      ];
      
      render(
        <CreditCardReminderBanner 
          cards={multipleCards} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      // Check card names are displayed
      expect(screen.getByText('Visa')).toBeInTheDocument();
      expect(screen.getByText('Mastercard')).toBeInTheDocument();
      
      // Check individual amounts
      expect(screen.getByText('$500.00')).toBeInTheDocument();
      expect(screen.getByText('$300.00')).toBeInTheDocument();
    });

    test('should display urgency indicators for each card in multiple cards view', () => {
      const multipleCards = [
        { ...mockOverdueCard, id: 1, display_name: 'Visa' },
        { ...mockSingleCard, id: 2, display_name: 'Mastercard', days_until_due: 2 }
      ];
      
      render(
        <CreditCardReminderBanner 
          cards={multipleCards} 
          isOverdue={true}
          {...mockCallbacks} 
        />
      );
      
      // Check urgency indicators exist for each card
      expect(screen.getByTestId('urgency-indicator-1')).toBeInTheDocument();
      expect(screen.getByTestId('urgency-indicator-2')).toBeInTheDocument();
    });
  });

  describe('Button Interactions', () => {
    test('should call onClick when banner is clicked', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockSingleCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('credit-card-reminder-banner');
      fireEvent.click(banner);
      
      expect(mockCallbacks.onClick).toHaveBeenCalledTimes(1);
    });

    test('should call onDismiss when dismiss button is clicked', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockSingleCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const dismissButton = screen.getByRole('button', { name: /dismiss reminder/i });
      fireEvent.click(dismissButton);
      
      expect(mockCallbacks.onDismiss).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onClick).not.toHaveBeenCalled();
    });

    test('should handle keyboard navigation', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockSingleCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('credit-card-reminder-banner');
      
      // Test Enter key
      fireEvent.keyDown(banner, { key: 'Enter' });
      expect(mockCallbacks.onClick).toHaveBeenCalledTimes(1);
      
      // Test Space key
      fireEvent.keyDown(banner, { key: ' ' });
      expect(mockCallbacks.onClick).toHaveBeenCalledTimes(2);
    });

    test('should handle missing callback functions gracefully', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockSingleCard]} 
          isOverdue={false}
        />
      );
      
      const banner = screen.getByTestId('credit-card-reminder-banner');
      const dismissButton = screen.getByRole('button', { name: /dismiss reminder/i });
      
      // Should not throw errors when callbacks are undefined
      expect(() => {
        fireEvent.click(banner);
        fireEvent.click(dismissButton);
      }).not.toThrow();
    });
  });

  describe('Message Display', () => {
    test('should display correct message for single due soon card', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockSingleCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/Visa payment due in 5 days/)).toBeInTheDocument();
    });

    test('should display correct message for single overdue card', () => {
      render(
        <CreditCardReminderBanner 
          cards={[mockOverdueCard]} 
          isOverdue={true}
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/Mastercard payment is 3 days overdue!/)).toBeInTheDocument();
    });

    test('should display correct message for multiple due soon cards', () => {
      const multipleCards = [mockSingleCard, { ...mockSingleCard, id: 2 }];
      
      render(
        <CreditCardReminderBanner 
          cards={multipleCards} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/2 credit card payments due soon/)).toBeInTheDocument();
    });

    test('should display correct message for multiple overdue cards', () => {
      const multipleCards = [mockOverdueCard, { ...mockOverdueCard, id: 3, display_name: 'Amex' }];
      
      render(
        <CreditCardReminderBanner 
          cards={multipleCards} 
          isOverdue={true}
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/2 credit card payments are overdue!/)).toBeInTheDocument();
    });

    test('should display "due today" for card due today', () => {
      const dueTodayCard = { ...mockSingleCard, days_until_due: 0 };
      
      render(
        <CreditCardReminderBanner 
          cards={[dueTodayCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/Visa payment due today/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('should handle card with zero required payment', () => {
      const zeroPaymentCard = { ...mockSingleCard, required_payment: 0 };
      
      render(
        <CreditCardReminderBanner 
          cards={[zeroPaymentCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const paymentAmount = screen.getByTestId('required-payment-amount');
      expect(paymentAmount).toHaveTextContent('$0.00');
    });

    test('should display balance source indicator when has_actual_balance is true', () => {
      const cardWithActualBalance = { 
        ...mockSingleCard, 
        has_actual_balance: true 
      };
      
      render(
        <CreditCardReminderBanner 
          cards={[cardWithActualBalance]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const sourceIndicator = screen.getByTestId('balance-source-indicator');
      expect(sourceIndicator).toBeInTheDocument();
      expect(sourceIndicator).toHaveTextContent('Statement');
    });

    test('should not display balance source indicator when has_actual_balance is false', () => {
      const cardWithoutActualBalance = { 
        ...mockSingleCard, 
        has_actual_balance: false 
      };
      
      render(
        <CreditCardReminderBanner 
          cards={[cardWithoutActualBalance]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      expect(screen.queryByTestId('balance-source-indicator')).not.toBeInTheDocument();
    });

    test('should handle card with negative days_until_due', () => {
      const overdueCard = { ...mockSingleCard, days_until_due: -1 };
      
      render(
        <CreditCardReminderBanner 
          cards={[overdueCard]} 
          isOverdue={true}
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/1 day overdue/)).toBeInTheDocument();
    });

    test('should handle card without payment_due_day', () => {
      const cardWithoutDueDay = { ...mockSingleCard, payment_due_day: null };
      
      render(
        <CreditCardReminderBanner 
          cards={[cardWithoutDueDay]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      // Should not display due date info
      expect(screen.queryByTestId('payment-due-date')).not.toBeInTheDocument();
    });

    test('should handle large payment amounts', () => {
      const largePaymentCard = { ...mockSingleCard, required_payment: 99999.99 };
      
      render(
        <CreditCardReminderBanner 
          cards={[largePaymentCard]} 
          isOverdue={false}
          {...mockCallbacks} 
        />
      );
      
      const paymentAmount = screen.getByTestId('required-payment-amount');
      expect(paymentAmount).toHaveTextContent('$99,999.99');
    });
  });

  describe('Badge Consistency - Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5', () => {
    describe('Single Card View', () => {
      test('should display Statement badge for single card with has_actual_balance true', () => {
        const cardWithStatement = {
          ...mockSingleCard,
          has_actual_balance: true
        };
        
        render(
          <CreditCardReminderBanner 
            cards={[cardWithStatement]} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        const statementBadge = screen.getByTestId('balance-source-indicator');
        expect(statementBadge).toBeInTheDocument();
        expect(statementBadge).toHaveTextContent('✓ Statement');
        expect(statementBadge).toHaveClass('reminder-balance-source', 'actual');
        expect(statementBadge).toHaveAttribute('title', 'From your entered statement balance');
      });

      test('should not display Statement badge for single card with has_actual_balance false', () => {
        const cardWithoutStatement = {
          ...mockSingleCard,
          has_actual_balance: false
        };
        
        render(
          <CreditCardReminderBanner 
            cards={[cardWithoutStatement]} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        expect(screen.queryByTestId('balance-source-indicator')).not.toBeInTheDocument();
      });

      test('should display due date for single card with payment_due_day', () => {
        const cardWithDueDate = {
          ...mockSingleCard,
          payment_due_day: 15
        };
        
        render(
          <CreditCardReminderBanner 
            cards={[cardWithDueDate]} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        const dueDate = screen.getByTestId('payment-due-date');
        expect(dueDate).toBeInTheDocument();
        expect(dueDate).toHaveTextContent('Due on day 15 of each month');
      });

      test('should not display due date for single card without payment_due_day', () => {
        const cardWithoutDueDate = {
          ...mockSingleCard,
          payment_due_day: null
        };
        
        render(
          <CreditCardReminderBanner 
            cards={[cardWithoutDueDate]} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        expect(screen.queryByTestId('payment-due-date')).not.toBeInTheDocument();
      });
    });

    describe('Multiple Cards View', () => {
      test('should display Statement badges for multiple cards with mixed has_actual_balance', () => {
        const multipleCards = [
          { ...mockSingleCard, id: 1, display_name: 'Visa', has_actual_balance: true, required_payment: 500 },
          { ...mockSingleCard, id: 2, display_name: 'Mastercard', has_actual_balance: false, required_payment: 300 },
          { ...mockSingleCard, id: 3, display_name: 'Amex', has_actual_balance: true, required_payment: 200 }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        // Visa should have Statement badge
        const visaStatementBadge = screen.getByTestId('balance-source-indicator-1');
        expect(visaStatementBadge).toBeInTheDocument();
        expect(visaStatementBadge).toHaveTextContent('✓ Statement');
        expect(visaStatementBadge).toHaveClass('reminder-balance-source', 'actual');
        expect(visaStatementBadge).toHaveAttribute('title', 'From your entered statement balance');
        
        // Mastercard should NOT have Statement badge
        expect(screen.queryByTestId('balance-source-indicator-2')).not.toBeInTheDocument();
        
        // Amex should have Statement badge
        const amexStatementBadge = screen.getByTestId('balance-source-indicator-3');
        expect(amexStatementBadge).toBeInTheDocument();
        expect(amexStatementBadge).toHaveTextContent('✓ Statement');
      });

      test('should display due dates for multiple cards with payment_due_day', () => {
        const multipleCards = [
          { ...mockSingleCard, id: 1, display_name: 'Visa', payment_due_day: 15, required_payment: 500 },
          { ...mockSingleCard, id: 2, display_name: 'Mastercard', payment_due_day: 20, required_payment: 300 }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        const visaDueDate = screen.getByTestId('payment-due-date-1');
        expect(visaDueDate).toBeInTheDocument();
        expect(visaDueDate).toHaveTextContent('Due: day 15');
        
        const mastercardDueDate = screen.getByTestId('payment-due-date-2');
        expect(mastercardDueDate).toBeInTheDocument();
        expect(mastercardDueDate).toHaveTextContent('Due: day 20');
      });

      test('should not display due dates for cards without payment_due_day', () => {
        const multipleCards = [
          { ...mockSingleCard, id: 1, display_name: 'Visa', payment_due_day: 15, required_payment: 500 },
          { ...mockSingleCard, id: 2, display_name: 'Mastercard', payment_due_day: null, required_payment: 300 }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        // Visa should have due date
        expect(screen.getByTestId('payment-due-date-1')).toBeInTheDocument();
        
        // Mastercard should NOT have due date
        expect(screen.queryByTestId('payment-due-date-2')).not.toBeInTheDocument();
      });

      test('should display Statement badge before Urgency indicator (badge ordering)', () => {
        const multipleCards = [
          {
            ...mockSingleCard,
            id: 1,
            display_name: 'Visa',
            has_actual_balance: true,
            is_due_soon: true,
            days_until_due: 2,
            required_payment: 500
          },
          {
            ...mockSingleCard,
            id: 2,
            display_name: 'Mastercard',
            has_actual_balance: false,
            is_overdue: true,
            required_payment: 300
          }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        const badgesContainer = screen.getByTestId('balance-source-indicator-1').parentElement;
        const badges = Array.from(badgesContainer.children);
        
        // First badge should be Statement badge
        expect(badges[0]).toHaveClass('reminder-balance-source', 'actual');
        expect(badges[0]).toHaveTextContent('✓ Statement');
        
        // Second badge should be Urgency indicator
        expect(badges[1]).toHaveClass('reminder-urgency-badge');
      });

      test('should maintain urgency indicators for all cards in multiple view', () => {
        const multipleCards = [
          { ...mockSingleCard, id: 1, display_name: 'Visa', is_overdue: true, required_payment: 500 },
          { ...mockSingleCard, id: 2, display_name: 'Mastercard', is_due_soon: true, days_until_due: 2, required_payment: 300 }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={true}
            {...mockCallbacks} 
          />
        );
        
        // Both cards should have urgency indicators
        expect(screen.getByTestId('urgency-indicator-1')).toBeInTheDocument();
        expect(screen.getByTestId('urgency-indicator-2')).toBeInTheDocument();
      });

      test('should display card names and amounts in multiple view', () => {
        const multipleCards = [
          { ...mockSingleCard, id: 1, display_name: 'Visa', required_payment: 500 },
          { ...mockSingleCard, id: 2, display_name: 'Mastercard', required_payment: 300 }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        expect(screen.getByText('Visa')).toBeInTheDocument();
        expect(screen.getByText('Mastercard')).toBeInTheDocument();
        expect(screen.getByText('$500.00')).toBeInTheDocument();
        expect(screen.getByText('$300.00')).toBeInTheDocument();
      });
    });

    describe('Backward Compatibility', () => {
      test('should preserve onClick handler functionality', () => {
        const multipleCards = [
          { ...mockSingleCard, id: 1, display_name: 'Visa', has_actual_balance: true, required_payment: 500 },
          { ...mockSingleCard, id: 2, display_name: 'Mastercard', required_payment: 300 }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        const banner = screen.getByTestId('credit-card-reminder-banner');
        fireEvent.click(banner);
        
        expect(mockCallbacks.onClick).toHaveBeenCalledTimes(1);
      });

      test('should preserve onDismiss handler functionality', () => {
        const multipleCards = [
          { ...mockSingleCard, id: 1, display_name: 'Visa', has_actual_balance: true, required_payment: 500 },
          { ...mockSingleCard, id: 2, display_name: 'Mastercard', required_payment: 300 }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        const dismissButton = screen.getByRole('button', { name: /dismiss reminder/i });
        fireEvent.click(dismissButton);
        
        expect(mockCallbacks.onDismiss).toHaveBeenCalledTimes(1);
        expect(mockCallbacks.onClick).not.toHaveBeenCalled();
      });

      test('should preserve keyboard navigation', () => {
        const multipleCards = [
          { ...mockSingleCard, id: 1, display_name: 'Visa', has_actual_balance: true, required_payment: 500 },
          { ...mockSingleCard, id: 2, display_name: 'Mastercard', required_payment: 300 }
        ];
        
        render(
          <CreditCardReminderBanner 
            cards={multipleCards} 
            isOverdue={false}
            {...mockCallbacks} 
          />
        );
        
        const banner = screen.getByTestId('credit-card-reminder-banner');
        
        // Test Enter key
        fireEvent.keyDown(banner, { key: 'Enter' });
        expect(mockCallbacks.onClick).toHaveBeenCalledTimes(1);
        
        // Test Space key
        fireEvent.keyDown(banner, { key: ' ' });
        expect(mockCallbacks.onClick).toHaveBeenCalledTimes(2);
      });
    });
  });
});
