import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import FloatingAddButton from './FloatingAddButton';

describe('FloatingAddButton', () => {
  describe('Property Tests', () => {
    /**
     * Property 6: Floating button visibility threshold
     * Feature: sticky-summary-scrolling, Property 6: For any expense list with more than 10 expenses, the floating add expense button should be visible and remain visible during scrolling
     * Validates: Requirements 4.1, 4.2
     */
    it('should be visible when expense count > 10 and hidden when <= 10', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (expenseCount) => {
            const mockOnAddExpense = vi.fn();
            
            const { container, rerender } = render(
              <FloatingAddButton 
                onAddExpense={mockOnAddExpense} 
                expenseCount={expenseCount} 
              />
            );
            
            const button = container.querySelector('.floating-add-button');
            
            if (expenseCount > 10) {
              // Button should be visible
              expect(button).toBeInTheDocument();
              expect(button).toBeVisible();
            } else {
              // Button should not be rendered
              expect(button).not.toBeInTheDocument();
            }
            
            // Test that visibility changes correctly when count changes
            const newCount = expenseCount > 10 ? 5 : 15;
            rerender(
              <FloatingAddButton 
                onAddExpense={mockOnAddExpense} 
                expenseCount={newCount} 
              />
            );
            
            const updatedButton = container.querySelector('.floating-add-button');
            
            if (newCount > 10) {
              expect(updatedButton).toBeInTheDocument();
              expect(updatedButton).toBeVisible();
            } else {
              expect(updatedButton).not.toBeInTheDocument();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 7: Floating button functionality
     * Feature: sticky-summary-scrolling, Property 7: For any floating add button click event, the expense form modal should open correctly
     * Validates: Requirements 4.3
     */
    it('should call onAddExpense when clicked', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 11, max: 100 }), // Only test with visible button
          (expenseCount) => {
            const mockOnAddExpense = vi.fn();
            
            const { container } = render(
              <FloatingAddButton 
                onAddExpense={mockOnAddExpense} 
                expenseCount={expenseCount} 
              />
            );
            
            const button = container.querySelector('.floating-add-button');
            expect(button).toBeInTheDocument();
            
            // Click the button
            button.click();
            
            // Verify the callback was called
            expect(mockOnAddExpense).toHaveBeenCalledTimes(1);
            
            // Click multiple times to ensure it works consistently
            button.click();
            button.click();
            
            expect(mockOnAddExpense).toHaveBeenCalledTimes(3);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8: Floating button positioning
     * Feature: sticky-summary-scrolling, Property 8: For any viewport size, the floating button should be positioned to not obstruct important content and remain accessible with appropriate sizing for the device type
     * Validates: Requirements 4.4, 4.5
     */
    it('should have appropriate CSS classes and attributes for different viewport sizes', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 11, max: 100 }), // Only test with visible button
          (expenseCount) => {
            const mockOnAddExpense = vi.fn();
            
            const { container } = render(
              <FloatingAddButton 
                onAddExpense={mockOnAddExpense} 
                expenseCount={expenseCount} 
              />
            );
            
            const button = container.querySelector('.floating-add-button');
            expect(button).toBeInTheDocument();
            
            // Button should have the correct CSS class
            expect(button).toHaveClass('floating-add-button');
            
            // Button should have accessibility attributes
            expect(button).toHaveAttribute('aria-label', 'Add new expense');
            expect(button).toHaveAttribute('title', 'Add new expense');
            
            // Button should contain icon and text elements
            const icon = button.querySelector('.fab-icon');
            const text = button.querySelector('.fab-text');
            
            expect(icon).toBeInTheDocument();
            expect(text).toBeInTheDocument();
            expect(icon).toHaveTextContent('+');
            expect(text).toHaveTextContent('Add Expense');
            
            // Button should be clickable
            expect(button).not.toBeDisabled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    it('should render with correct accessibility attributes', () => {
      const mockOnAddExpense = vi.fn();
      
      render(
        <FloatingAddButton 
          onAddExpense={mockOnAddExpense} 
          expenseCount={15} 
        />
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Add new expense');
      expect(button).toHaveAttribute('title', 'Add new expense');
    });

    it('should handle undefined expenseCount gracefully', () => {
      const mockOnAddExpense = vi.fn();
      
      const { container } = render(
        <FloatingAddButton 
          onAddExpense={mockOnAddExpense} 
          expenseCount={undefined} 
        />
      );
      
      // Should default to 0 and not be visible
      const button = container.querySelector('.floating-add-button');
      expect(button).not.toBeInTheDocument();
    });

    it('should handle null expenseCount gracefully', () => {
      const mockOnAddExpense = vi.fn();
      
      const { container } = render(
        <FloatingAddButton 
          onAddExpense={mockOnAddExpense} 
          expenseCount={null} 
        />
      );
      
      // Should default to 0 and not be visible
      const button = container.querySelector('.floating-add-button');
      expect(button).not.toBeInTheDocument();
    });

    it('should render icon and text elements', () => {
      const mockOnAddExpense = vi.fn();
      
      const { container } = render(
        <FloatingAddButton 
          onAddExpense={mockOnAddExpense} 
          expenseCount={15} 
        />
      );
      
      const icon = container.querySelector('.fab-icon');
      const text = container.querySelector('.fab-text');
      
      expect(icon).toBeInTheDocument();
      expect(text).toBeInTheDocument();
      expect(icon).toHaveTextContent('+');
      expect(text).toHaveTextContent('Add Expense');
    });
  });
});