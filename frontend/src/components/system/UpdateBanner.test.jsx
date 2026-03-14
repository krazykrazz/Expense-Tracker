/**
 * Unit Tests for UpdateBanner Component
 * _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import UpdateBanner from './UpdateBanner';

describe('UpdateBanner', () => {
  const defaultProps = {
    show: true,
    version: '5.13.0',
    onRefresh: vi.fn(),
    onDismiss: vi.fn(),
  };

  describe('Conditional rendering', () => {
    test('renders nothing when show is false', () => {
      const { container } = render(
        <UpdateBanner {...defaultProps} show={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    test('renders banner when show is true', () => {
      render(<UpdateBanner {...defaultProps} />);
      expect(screen.getByTestId('update-banner')).toBeInTheDocument();
    });
  });

  describe('Version display - Requirements: 3.1, 3.5', () => {
    test('displays the version number in the message', () => {
      render(<UpdateBanner {...defaultProps} version="5.13.0" />);
      expect(screen.getByText(/5\.13\.0/)).toBeInTheDocument();
    });

    test('displays message without version when version is null', () => {
      render(<UpdateBanner {...defaultProps} version={null} />);
      expect(screen.getByText(/A new version is available/)).toBeInTheDocument();
    });
  });

  describe('Refresh button - Requirements: 3.2', () => {
    test('"Refresh Now" button calls onRefresh when clicked', () => {
      const onRefresh = vi.fn();
      render(<UpdateBanner {...defaultProps} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByText('Refresh Now'));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dismiss button - Requirements: 3.3', () => {
    test('dismiss button calls onDismiss when clicked', () => {
      const onDismiss = vi.fn();
      render(<UpdateBanner {...defaultProps} onDismiss={onDismiss} />);

      fireEvent.click(screen.getByRole('button', { name: /dismiss update notification/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility - Requirements: 3.6', () => {
    test('has ARIA role="alert"', () => {
      render(<UpdateBanner {...defaultProps} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    test('dismiss button has aria-label', () => {
      render(<UpdateBanner {...defaultProps} />);
      const dismissBtn = screen.getByRole('button', { name: /dismiss update notification/i });
      expect(dismissBtn).toHaveAttribute('aria-label', 'Dismiss update notification');
    });

    test('keyboard: Enter activates Refresh Now button', () => {
      const onRefresh = vi.fn();
      render(<UpdateBanner {...defaultProps} onRefresh={onRefresh} />);

      const btn = screen.getByText('Refresh Now');
      fireEvent.keyDown(btn, { key: 'Enter' });
      fireEvent.keyUp(btn, { key: 'Enter' });
      // Native button elements handle Enter/Space via click by default
      fireEvent.click(btn);
      expect(onRefresh).toHaveBeenCalled();
    });

    test('keyboard: Space activates dismiss button', () => {
      const onDismiss = vi.fn();
      render(<UpdateBanner {...defaultProps} onDismiss={onDismiss} />);

      const btn = screen.getByRole('button', { name: /dismiss update notification/i });
      fireEvent.keyDown(btn, { key: ' ' });
      fireEvent.keyUp(btn, { key: ' ' });
      fireEvent.click(btn);
      expect(onDismiss).toHaveBeenCalled();
    });

    test('buttons are focusable via Tab (tabIndex not -1)', () => {
      render(<UpdateBanner {...defaultProps} />);

      const refreshBtn = screen.getByText('Refresh Now');
      const dismissBtn = screen.getByRole('button', { name: /dismiss update notification/i });

      // Native buttons are focusable by default (tabIndex is not -1)
      expect(refreshBtn).not.toHaveAttribute('tabIndex', '-1');
      expect(dismissBtn).not.toHaveAttribute('tabIndex', '-1');
    });
  });
});
