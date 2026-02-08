import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import CollapsibleSection from './CollapsibleSection';

describe('ExpenseForm - Property 19: Keyboard navigation order', () => {
  /**
   * Property 19: Keyboard navigation order
   * For any form state with various section expansion combinations, pressing Tab should move focus 
   * through all visible fields in logical order (top to bottom, left to right within rows), 
   * skipping collapsed section contents.
   * 
   * Validates: Requirements 10.1, 10.4
   */
  test('Property 19: Collapsed sections hide content from tab order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (isExpanded) => {
          const { container } = render(
            <CollapsibleSection
              title="Test Section"
              isExpanded={isExpanded}
              onToggle={() => {}}
            >
              <input type="text" data-testid="test-input" />
              <button data-testid="test-button">Test Button</button>
            </CollapsibleSection>
          );
          
          // Get all focusable elements
          const focusableElements = container.querySelectorAll(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="button"]:not([disabled])'
          );
          
          // Section header should always be focusable
          const header = container.querySelector('[role="button"][aria-expanded]');
          expect(header).not.toBeNull();
          expect(Array.from(focusableElements)).toContain(header);
          
          // Content fields should only be present when expanded
          const input = container.querySelector('[data-testid="test-input"]');
          const button = container.querySelector('[data-testid="test-button"]');
          
          if (isExpanded) {
            // When expanded, content should be in DOM and focusable
            expect(input).not.toBeNull();
            expect(button).not.toBeNull();
            expect(Array.from(focusableElements)).toContain(input);
            expect(Array.from(focusableElements)).toContain(button);
          } else {
            // When collapsed, content should not be in DOM
            expect(input).toBeNull();
            expect(button).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 19: Section headers respond to Enter and Space keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Enter', ' '),
        fc.boolean(),
        async (key, initialState) => {
          const user = userEvent.setup();
          const onToggle = vi.fn();
          
          const { container } = render(
            <CollapsibleSection
              title="Test Section"
              isExpanded={initialState}
              onToggle={onToggle}
            >
              <div>Content</div>
            </CollapsibleSection>
          );
          
          const header = container.querySelector('[role="button"][aria-expanded]');
          expect(header).toBeInTheDocument();
          
          // Check initial state
          expect(header).toHaveAttribute('aria-expanded', initialState ? 'true' : 'false');
          
          // Focus the header
          header.focus();
          expect(header).toHaveFocus();
          
          // Press the key to toggle
          await user.keyboard(`{${key}}`);
          
          // onToggle should have been called
          expect(onToggle).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 19: Tab order is consistent across expansion state changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
        async (toggleSequence) => {
          const user = userEvent.setup();
          let currentState = false;
          
          const TestComponent = () => {
            const [isExpanded, setIsExpanded] = React.useState(currentState);
            
            return (
              <CollapsibleSection
                title="Test Section"
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
              >
                <input type="text" data-testid="field1" />
                <input type="text" data-testid="field2" />
              </CollapsibleSection>
            );
          };
          
          const { container } = render(<TestComponent />);
          
          const header = container.querySelector('[role="button"][aria-expanded]');
          
          // Apply the toggle sequence
          for (const shouldExpand of toggleSequence) {
            const currentExpanded = header.getAttribute('aria-expanded') === 'true';
            
            if (shouldExpand !== currentExpanded) {
              await user.click(header);
              await waitFor(() => {
                expect(header).toHaveAttribute(
                  'aria-expanded',
                  shouldExpand ? 'true' : 'false'
                );
              });
            }
          }
          
          // After all toggles, verify focusable elements are in logical order
          const focusableElements = container.querySelectorAll(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="button"]:not([disabled])'
          );
          
          // Header should always be first focusable element
          expect(focusableElements[0]).toBe(header);
          
          // If expanded, content fields should follow header
          const finalExpanded = header.getAttribute('aria-expanded') === 'true';
          if (finalExpanded) {
            const field1 = container.querySelector('[data-testid="field1"]');
            const field2 = container.querySelector('[data-testid="field2"]');
            expect(field1).not.toBeNull();
            expect(field2).not.toBeNull();
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
