/**
 * Unit Tests for BillingCycleReminderBanner Component
 * Tests rendering, cycle dates display, and user interactions
 * _Requirements: 4.1, 4.2, 4.4_
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import BillingCycleReminderBanner from './BillingCycleReminderBanner';

describe('BillingCycleReminderBanner', () => {
  // Mock card data for single card scenario
  const mockSingleCard = {
    paymentMethodId: 1,
    displayName: 'Visa',
    cycleStartDate: '2026-01-16',
    cycleEndDate: '2026-02-15',
    needsEntry: true,
    hasEntry: false
  };

  // Mock card data for multiple cards
  const mockMultipleCards = [
    {
      paymentMethodId: 1,
      displayName: 'Visa',
      cycleStartDate: '2026-01-16',
      cycleEndDate: '2026-02-15',
      needsEntry: true,
      hasEntry: false
    },
    {
      paymentMethodId: 2,
      displayName: 'Mastercard',
      cycleStartDate: '2026-01-20',
      cycleEndDate: '2026-02-19',
      needsEntry: true,
      hasEntry: false
    }
  ];

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
        <BillingCycleReminderBanner cards={[]} {...mockCallbacks} />
      );
      expect(container.firstChild).toBeNull();
    });

    test('should render null when cards is null', () => {
      const { container } = render(
        <BillingCycleReminderBanner cards={null} {...mockCallbacks} />
      );
      expect(container.firstChild).toBeNull();
    });

    test('should render banner with single card', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('billing-cycle-reminder-banner');
      expect(banner).toBeInTheDocument();
    });

    test('should render banner with multiple cards', () => {
      render(
        <BillingCycleReminderBanner 
          cards={mockMultipleCards} 
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('billing-cycle-reminder-banner');
      expect(banner).toBeInTheDocument();
    });
  });

  describe('Single Card Display - Requirements: 4.1', () => {
    test('should display card name in message', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/Enter statement balance for Visa/)).toBeInTheDocument();
    });

    test('should display cycle dates', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
          {...mockCallbacks} 
        />
      );
      
      const cycleDates = screen.getByTestId('cycle-dates');
      expect(cycleDates).toBeInTheDocument();
      // Check for formatted dates (Jan 16 - Feb 15)
      expect(cycleDates).toHaveTextContent(/Jan.*16/);
      expect(cycleDates).toHaveTextContent(/Feb.*15/);
    });

    test('should display action hint', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/Click to enter your actual statement balance/)).toBeInTheDocument();
    });
  });

  describe('Multiple Cards Display - Requirements: 4.1', () => {
    test('should display count of cards needing entry', () => {
      render(
        <BillingCycleReminderBanner 
          cards={mockMultipleCards} 
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText(/2 credit cards need statement balance entry/)).toBeInTheDocument();
    });

    test('should display all card names', () => {
      render(
        <BillingCycleReminderBanner 
          cards={mockMultipleCards} 
          {...mockCallbacks} 
        />
      );
      
      expect(screen.getByText('Visa')).toBeInTheDocument();
      expect(screen.getByText('Mastercard')).toBeInTheDocument();
    });

    test('should display cycle dates for each card', () => {
      render(
        <BillingCycleReminderBanner 
          cards={mockMultipleCards} 
          {...mockCallbacks} 
        />
      );
      
      // Check for both cards' cycle dates
      expect(screen.getByText(/Jan.*16.*Feb.*15/)).toBeInTheDocument();
      expect(screen.getByText(/Jan.*20.*Feb.*19/)).toBeInTheDocument();
    });
  });

  describe('Button Interactions', () => {
    test('should call onClick when banner is clicked', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('billing-cycle-reminder-banner');
      fireEvent.click(banner);
      
      expect(mockCallbacks.onClick).toHaveBeenCalledTimes(1);
    });

    test('should call onDismiss when dismiss button is clicked', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
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
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('billing-cycle-reminder-banner');
      
      // Test Enter key
      fireEvent.keyDown(banner, { key: 'Enter' });
      expect(mockCallbacks.onClick).toHaveBeenCalledTimes(1);
      
      // Test Space key
      fireEvent.keyDown(banner, { key: ' ' });
      expect(mockCallbacks.onClick).toHaveBeenCalledTimes(2);
    });

    test('should handle missing callback functions gracefully', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
        />
      );
      
      const banner = screen.getByTestId('billing-cycle-reminder-banner');
      const dismissButton = screen.getByRole('button', { name: /dismiss reminder/i });
      
      // Should not throw errors when callbacks are undefined
      expect(() => {
        fireEvent.click(banner);
        fireEvent.click(dismissButton);
      }).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    test('should have correct role and tabIndex', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
          {...mockCallbacks} 
        />
      );
      
      const banner = screen.getByTestId('billing-cycle-reminder-banner');
      expect(banner).toHaveAttribute('role', 'button');
      expect(banner).toHaveAttribute('tabIndex', '0');
    });

    test('should have accessible dismiss button', () => {
      render(
        <BillingCycleReminderBanner 
          cards={[mockSingleCard]} 
          {...mockCallbacks} 
        />
      );
      
      const dismissButton = screen.getByRole('button', { name: /dismiss reminder/i });
      expect(dismissButton).toHaveAttribute('aria-label', 'Dismiss reminder');
    });
  });
});
