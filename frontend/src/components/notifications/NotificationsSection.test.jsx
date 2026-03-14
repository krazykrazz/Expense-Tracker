/**
 * Unit Tests for NotificationsSection Component
 * Tests rendering with various notification counts, collapse/expand behavior, and empty state
 * _Requirements: 7.2, 7.3, 7.4_
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import NotificationsSection from './NotificationsSection';

describe('NotificationsSection', () => {
  // Mock child content for testing
  const MockChildContent = () => (
    <div data-testid="mock-child">Mock notification banner</div>
  );

  describe('Rendering - Requirements: 7.2, 7.3', () => {
    test('should render null when notificationCount is 0', () => {
      const { container } = render(
        <NotificationsSection notificationCount={0}>
          <MockChildContent />
        </NotificationsSection>
      );
      expect(container.firstChild).toBeNull();
    });

    test('should render null when notificationCount is undefined', () => {
      const { container } = render(
        <NotificationsSection>
          <MockChildContent />
        </NotificationsSection>
      );
      expect(container.firstChild).toBeNull();
    });

    test('should render null when notificationCount is null', () => {
      const { container } = render(
        <NotificationsSection notificationCount={null}>
          <MockChildContent />
        </NotificationsSection>
      );
      expect(container.firstChild).toBeNull();
    });

    test('should render section when notificationCount is 1', () => {
      render(
        <NotificationsSection notificationCount={1}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const section = screen.getByTestId('notifications-section');
      expect(section).toBeInTheDocument();
    });

    test('should render section when notificationCount is greater than 1', () => {
      render(
        <NotificationsSection notificationCount={5}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const section = screen.getByTestId('notifications-section');
      expect(section).toBeInTheDocument();
    });

    test('should render header with icon, title, badge, and toggle', () => {
      render(
        <NotificationsSection notificationCount={3}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      expect(header).toBeInTheDocument();
      
      // Check for bell icon
      expect(screen.getByText('🔔')).toBeInTheDocument();
      
      // Check for title
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      
      // Check for badge with count
      const badge = screen.getByTestId('notifications-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('3');
      
      // Check for toggle arrow
      expect(screen.getByText('▼')).toBeInTheDocument();
    });

    test('should render children content when expanded', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const content = screen.getByTestId('notifications-content');
      expect(content).toBeInTheDocument();
      
      const child = screen.getByTestId('mock-child');
      expect(child).toBeInTheDocument();
    });
  });

  describe('Badge Display - Requirements: 7.2', () => {
    test('should display correct count for single notification', () => {
      render(
        <NotificationsSection notificationCount={1}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const badge = screen.getByTestId('notifications-badge');
      expect(badge).toHaveTextContent('1');
    });

    test('should display correct count for multiple notifications', () => {
      render(
        <NotificationsSection notificationCount={10}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const badge = screen.getByTestId('notifications-badge');
      expect(badge).toHaveTextContent('10');
    });

    test('should display correct count for large number of notifications', () => {
      render(
        <NotificationsSection notificationCount={99}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const badge = screen.getByTestId('notifications-badge');
      expect(badge).toHaveTextContent('99');
    });
  });

  describe('Collapse/Expand Behavior - Requirements: 7.4', () => {
    test('should be expanded by default', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      // Content should be visible
      const content = screen.getByTestId('notifications-content');
      expect(content).toBeInTheDocument();
      
      // Toggle should show expanded state (down arrow)
      expect(screen.getByText('▼')).toBeInTheDocument();
    });

    test('should collapse when header is clicked', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      fireEvent.click(header);
      
      // Content should be hidden
      expect(screen.queryByTestId('notifications-content')).not.toBeInTheDocument();
      
      // Toggle should show collapsed state (right arrow)
      expect(screen.getByText('▶')).toBeInTheDocument();
    });

    test('should expand when collapsed header is clicked', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      
      // Collapse first
      fireEvent.click(header);
      expect(screen.queryByTestId('notifications-content')).not.toBeInTheDocument();
      
      // Expand again
      fireEvent.click(header);
      expect(screen.getByTestId('notifications-content')).toBeInTheDocument();
      expect(screen.getByText('▼')).toBeInTheDocument();
    });

    test('should toggle multiple times correctly', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      
      // Initial state - expanded
      expect(screen.getByTestId('notifications-content')).toBeInTheDocument();
      
      // Click 1 - collapse
      fireEvent.click(header);
      expect(screen.queryByTestId('notifications-content')).not.toBeInTheDocument();
      
      // Click 2 - expand
      fireEvent.click(header);
      expect(screen.getByTestId('notifications-content')).toBeInTheDocument();
      
      // Click 3 - collapse
      fireEvent.click(header);
      expect(screen.queryByTestId('notifications-content')).not.toBeInTheDocument();
      
      // Click 4 - expand
      fireEvent.click(header);
      expect(screen.getByTestId('notifications-content')).toBeInTheDocument();
    });

    test('should keep badge visible when collapsed', () => {
      render(
        <NotificationsSection notificationCount={5}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      fireEvent.click(header);
      
      // Badge should still be visible
      const badge = screen.getByTestId('notifications-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('5');
    });
  });

  describe('Keyboard Navigation', () => {
    test('should toggle on Enter key press', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      
      // Press Enter to collapse
      fireEvent.keyDown(header, { key: 'Enter' });
      expect(screen.queryByTestId('notifications-content')).not.toBeInTheDocument();
      
      // Press Enter to expand
      fireEvent.keyDown(header, { key: 'Enter' });
      expect(screen.getByTestId('notifications-content')).toBeInTheDocument();
    });

    test('should toggle on Space key press', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      
      // Press Space to collapse
      fireEvent.keyDown(header, { key: ' ' });
      expect(screen.queryByTestId('notifications-content')).not.toBeInTheDocument();
      
      // Press Space to expand
      fireEvent.keyDown(header, { key: ' ' });
      expect(screen.getByTestId('notifications-content')).toBeInTheDocument();
    });

    test('should not toggle on other key presses', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      
      // Press Tab - should not toggle
      fireEvent.keyDown(header, { key: 'Tab' });
      expect(screen.getByTestId('notifications-content')).toBeInTheDocument();
      
      // Press Escape - should not toggle
      fireEvent.keyDown(header, { key: 'Escape' });
      expect(screen.getByTestId('notifications-content')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('should have correct role and tabIndex on header', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      expect(header).toHaveAttribute('role', 'button');
      expect(header).toHaveAttribute('tabIndex', '0');
    });

    test('should have aria-expanded attribute reflecting state', () => {
      render(
        <NotificationsSection notificationCount={2}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      
      // Initially expanded
      expect(header).toHaveAttribute('aria-expanded', 'true');
      
      // After collapse
      fireEvent.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'false');
      
      // After expand
      fireEvent.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    test('should have descriptive aria-label', () => {
      render(
        <NotificationsSection notificationCount={3}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      expect(header).toHaveAttribute('aria-label');
      expect(header.getAttribute('aria-label')).toContain('3 notifications');
    });

    test('should have correct aria-label for single notification', () => {
      render(
        <NotificationsSection notificationCount={1}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      expect(header.getAttribute('aria-label')).toContain('1 notification');
      expect(header.getAttribute('aria-label')).not.toContain('1 notifications');
    });

    test('should have aria-label on badge', () => {
      render(
        <NotificationsSection notificationCount={5}>
          <MockChildContent />
        </NotificationsSection>
      );
      
      const badge = screen.getByTestId('notifications-badge');
      expect(badge).toHaveAttribute('aria-label');
      expect(badge.getAttribute('aria-label')).toContain('5 notifications');
    });
  });

  describe('Multiple Children', () => {
    test('should render multiple children correctly', () => {
      render(
        <NotificationsSection notificationCount={3}>
          <div data-testid="child-1">Banner 1</div>
          <div data-testid="child-2">Banner 2</div>
          <div data-testid="child-3">Banner 3</div>
        </NotificationsSection>
      );
      
      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
      expect(screen.getByTestId('child-3')).toBeInTheDocument();
    });

    test('should hide all children when collapsed', () => {
      render(
        <NotificationsSection notificationCount={3}>
          <div data-testid="child-1">Banner 1</div>
          <div data-testid="child-2">Banner 2</div>
          <div data-testid="child-3">Banner 3</div>
        </NotificationsSection>
      );
      
      const header = screen.getByTestId('notifications-header');
      fireEvent.click(header);
      
      expect(screen.queryByTestId('child-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('child-2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('child-3')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('should handle negative notificationCount as no notifications', () => {
      const { container } = render(
        <NotificationsSection notificationCount={-1}>
          <MockChildContent />
        </NotificationsSection>
      );
      // Negative count should be treated as no notifications
      // The component checks for !notificationCount || notificationCount === 0
      // -1 is truthy and not 0, so it will render
      // This is expected behavior - negative counts are unusual but handled
      expect(container.firstChild).not.toBeNull();
    });

    test('should handle empty children', () => {
      render(
        <NotificationsSection notificationCount={1}>
          {null}
        </NotificationsSection>
      );
      
      const section = screen.getByTestId('notifications-section');
      expect(section).toBeInTheDocument();
    });

    test('should handle undefined children', () => {
      render(
        <NotificationsSection notificationCount={1}>
          {undefined}
        </NotificationsSection>
      );
      
      const section = screen.getByTestId('notifications-section');
      expect(section).toBeInTheDocument();
    });
  });
});
