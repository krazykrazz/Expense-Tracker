import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdvancedFilters from './AdvancedFilters';

describe('AdvancedFilters', () => {
  describe('Collapsed State', () => {
    it('should render toggle button with "Advanced" text', () => {
      render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      expect(screen.getByText('Advanced')).toBeInTheDocument();
    });

    it('should show badge with correct count when activeCount > 0', () => {
      render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={2}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const badge = screen.getByTestId('advanced-filters-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('2');
    });

    it('should not show badge when activeCount is 0', () => {
      render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      expect(screen.queryByTestId('advanced-filters-badge')).not.toBeInTheDocument();
    });

    it('should hide content when collapsed', () => {
      const { container } = render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const content = container.querySelector('.advanced-filters-content');
      expect(content).not.toHaveClass('expanded');
      expect(content).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Expanded State', () => {
    it('should show content when expanded', () => {
      const { container } = render(
        <AdvancedFilters isExpanded={true} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const content = container.querySelector('.advanced-filters-content');
      expect(content).toHaveClass('expanded');
      expect(content).toHaveAttribute('aria-hidden', 'false');
    });

    it('should render children when expanded', () => {
      render(
        <AdvancedFilters isExpanded={true} onToggle={() => {}} activeCount={0}>
          <select data-testid="invoice-filter">
            <option>All</option>
          </select>
          <select data-testid="insurance-filter">
            <option>All</option>
          </select>
        </AdvancedFilters>
      );
      
      expect(screen.getByTestId('invoice-filter')).toBeInTheDocument();
      expect(screen.getByTestId('insurance-filter')).toBeInTheDocument();
    });

    it('should apply expanded class to toggle button', () => {
      const { container } = render(
        <AdvancedFilters isExpanded={true} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const toggle = container.querySelector('.advanced-filters-toggle');
      expect(toggle).toHaveClass('expanded');
    });
  });

  describe('Toggle Interaction', () => {
    it('should call onToggle when toggle button is clicked', () => {
      const onToggle = vi.fn();
      render(
        <AdvancedFilters isExpanded={false} onToggle={onToggle} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const toggleButton = screen.getByRole('button');
      fireEvent.click(toggleButton);
      
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('should call onToggle when clicking expanded toggle', () => {
      const onToggle = vi.fn();
      render(
        <AdvancedFilters isExpanded={true} onToggle={onToggle} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const toggleButton = screen.getByRole('button');
      fireEvent.click(toggleButton);
      
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('should have aria-expanded attribute on toggle button', () => {
      const { rerender } = render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const toggleButton = screen.getByRole('button');
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
      
      rerender(
        <AdvancedFilters isExpanded={true} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('should have aria-controls linking to content', () => {
      const { container } = render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const toggleButton = screen.getByRole('button');
      const content = container.querySelector('#advanced-filters-content');
      
      expect(toggleButton).toHaveAttribute('aria-controls', 'advanced-filters-content');
      expect(content).toBeInTheDocument();
    });

    it('should have button type to prevent form submission', () => {
      render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const toggleButton = screen.getByRole('button');
      expect(toggleButton).toHaveAttribute('type', 'button');
    });
  });

  describe('Badge Count Variations', () => {
    it('should display badge with count 1', () => {
      render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={1}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const badge = screen.getByTestId('advanced-filters-badge');
      expect(badge.textContent).toBe('1');
    });

    it('should display badge with count 5', () => {
      render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={5}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      const badge = screen.getByTestId('advanced-filters-badge');
      expect(badge.textContent).toBe('5');
    });
  });

  describe('CSS Classes', () => {
    it('should have advanced-filters class on container', () => {
      const { container } = render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      expect(container.querySelector('.advanced-filters')).toBeInTheDocument();
    });

    it('should have advanced-filters-toggle class on button', () => {
      const { container } = render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      expect(container.querySelector('.advanced-filters-toggle')).toBeInTheDocument();
    });

    it('should have advanced-filters-content class on content area', () => {
      const { container } = render(
        <AdvancedFilters isExpanded={false} onToggle={() => {}} activeCount={0}>
          <div>Filter content</div>
        </AdvancedFilters>
      );
      
      expect(container.querySelector('.advanced-filters-content')).toBeInTheDocument();
    });
  });
});
