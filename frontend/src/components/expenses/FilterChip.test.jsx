import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterChip from './FilterChip';

describe('FilterChip', () => {
  describe('Rendering', () => {
    it('should render with label and value in correct format', () => {
      render(<FilterChip label="Type" value="Groceries" onRemove={() => {}} />);
      
      expect(screen.getByText('Type: Groceries')).toBeInTheDocument();
    });

    it('should render remove button with × symbol', () => {
      render(<FilterChip label="Method" value="Visa" onRemove={() => {}} />);
      
      const removeButton = screen.getByRole('button', { name: /remove method filter/i });
      expect(removeButton).toBeInTheDocument();
      expect(removeButton.textContent).toBe('×');
    });

    it('should have title attribute with full label and value', () => {
      const { container } = render(
        <FilterChip label="Type" value="Groceries" onRemove={() => {}} />
      );
      
      const chip = container.querySelector('.filter-chip');
      expect(chip.getAttribute('title')).toBe('Type: Groceries');
    });

    it('should render with various label/value combinations', () => {
      const testCases = [
        { label: 'Type', value: 'Dining Out' },
        { label: 'Method', value: 'Credit Card' },
        { label: 'Invoice', value: 'With Invoice' },
        { label: 'Insurance', value: 'In Progress' }
      ];

      testCases.forEach(({ label, value }) => {
        const { unmount } = render(
          <FilterChip label={label} value={value} onRemove={() => {}} />
        );
        
        expect(screen.getByText(`${label}: ${value}`)).toBeInTheDocument();
        unmount();
      });
    });

    it('should handle long values with text truncation via CSS', () => {
      const longValue = 'This is a very long filter value that should be truncated';
      const { container } = render(
        <FilterChip label="Type" value={longValue} onRemove={() => {}} />
      );
      
      const textElement = container.querySelector('.filter-chip-text');
      expect(textElement).toBeInTheDocument();
      expect(textElement.textContent).toBe(`Type: ${longValue}`);
      // CSS handles truncation via text-overflow: ellipsis
    });
  });

  describe('Interactions', () => {
    it('should call onRemove when remove button is clicked', () => {
      const onRemove = vi.fn();
      render(<FilterChip label="Type" value="Groceries" onRemove={onRemove} />);
      
      const removeButton = screen.getByRole('button', { name: /remove type filter/i });
      fireEvent.click(removeButton);
      
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('should call onRemove only once per click', () => {
      const onRemove = vi.fn();
      render(<FilterChip label="Method" value="Visa" onRemove={onRemove} />);
      
      const removeButton = screen.getByRole('button', { name: /remove method filter/i });
      fireEvent.click(removeButton);
      fireEvent.click(removeButton);
      fireEvent.click(removeButton);
      
      expect(onRemove).toHaveBeenCalledTimes(3);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible remove button with aria-label', () => {
      render(<FilterChip label="Type" value="Groceries" onRemove={() => {}} />);
      
      const removeButton = screen.getByRole('button');
      expect(removeButton).toHaveAttribute('aria-label', 'Remove Type filter');
    });

    it('should have button type attribute to prevent form submission', () => {
      render(<FilterChip label="Type" value="Groceries" onRemove={() => {}} />);
      
      const removeButton = screen.getByRole('button');
      expect(removeButton).toHaveAttribute('type', 'button');
    });
  });

  describe('CSS Classes', () => {
    it('should have filter-chip class on container', () => {
      const { container } = render(
        <FilterChip label="Type" value="Groceries" onRemove={() => {}} />
      );
      
      expect(container.querySelector('.filter-chip')).toBeInTheDocument();
    });

    it('should have filter-chip-text class on text element', () => {
      const { container } = render(
        <FilterChip label="Type" value="Groceries" onRemove={() => {}} />
      );
      
      expect(container.querySelector('.filter-chip-text')).toBeInTheDocument();
    });

    it('should have filter-chip-remove class on remove button', () => {
      const { container } = render(
        <FilterChip label="Type" value="Groceries" onRemove={() => {}} />
      );
      
      expect(container.querySelector('.filter-chip-remove')).toBeInTheDocument();
    });
  });
});
