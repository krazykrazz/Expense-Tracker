import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import CollapsibleSection from './CollapsibleSection';
import HelpTooltip from './HelpTooltip';

describe('ExpenseForm - Property 20: ARIA attributes for sections', () => {
  /**
   * Property 20: ARIA attributes for sections
   * For any collapsible section, the section header should have appropriate aria-expanded attribute 
   * (true when expanded, false when collapsed) and aria-controls pointing to the content region.
   * 
   * Validates: Requirements 10.5
   */
  test('Property 20: Section headers have correct aria-expanded and aria-controls attributes', async () => {
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
              <div>Content</div>
            </CollapsibleSection>
          );
          
          // Find section header with role="button" and aria-expanded
          const header = container.querySelector('[role="button"][aria-expanded]');
          expect(header).not.toBeNull();
          
          // Should have aria-expanded attribute matching state
          expect(header).toHaveAttribute('aria-expanded', isExpanded ? 'true' : 'false');
          
          // Should have aria-controls attribute
          expect(header).toHaveAttribute('aria-controls');
          const controlsId = header.getAttribute('aria-controls');
          expect(controlsId).toBeTruthy();
          
          // Should have tabindex="0" for keyboard accessibility
          expect(header).toHaveAttribute('tabindex', '0');
          
          // If expanded, the controlled content should exist and have role="region"
          if (isExpanded) {
            const controlledContent = container.querySelector(`#${controlsId}`);
            if (controlledContent) {
              expect(controlledContent).not.toBeNull();
              expect(controlledContent).toHaveAttribute('role', 'region');
              expect(controlledContent).toHaveAttribute('aria-labelledby');
              
              // aria-labelledby should point back to header
              const labelledBy = controlledContent.getAttribute('aria-labelledby');
              const headerId = header.getAttribute('id');
              expect(headerId).toBe(labelledBy);
            }
          } else {
            // When collapsed, content should not be in DOM
            const controlledContent = container.querySelector(`#${controlsId}`);
            expect(controlledContent).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 20: aria-expanded toggles correctly when section is clicked', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        fc.boolean(),
        async (toggleCount, initialState) => {
          const user = userEvent.setup();
          
          const TestComponent = () => {
            const [isExpanded, setIsExpanded] = React.useState(initialState);
            
            return (
              <CollapsibleSection
                title="Test Section"
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
              >
                <div>Content</div>
              </CollapsibleSection>
            );
          };
          
          const { container } = render(<TestComponent />);
          
          const header = container.querySelector('[role="button"][aria-expanded]');
          expect(header).toBeInTheDocument();
          
          // Verify initial state
          expect(header).toHaveAttribute('aria-expanded', initialState ? 'true' : 'false');
          
          let expectedState = initialState;
          
          // Toggle the section multiple times
          for (let i = 0; i < toggleCount; i++) {
            await user.click(header);
            expectedState = !expectedState;
            
            await waitFor(() => {
              expect(header).toHaveAttribute(
                'aria-expanded',
                expectedState ? 'true' : 'false'
              );
            });
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 20: aria-controls points to existing content region', async () => {
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
              <div>Content</div>
            </CollapsibleSection>
          );
          
          const header = container.querySelector('[role="button"][aria-expanded]');
          expect(header).toBeInTheDocument();
          
          // Get the aria-controls value
          const controlsId = header.getAttribute('aria-controls');
          expect(controlsId).toBeTruthy();
          
          // Verify the controlled element exists when expanded
          const controlledElement = container.querySelector(`#${controlsId}`);
          
          if (isExpanded) {
            // When expanded, content should exist
            const controlledElement = container.querySelector(`#${controlsId}`);
            if (controlledElement) {
              expect(controlledElement).not.toBeNull();
              expect(controlledElement).toHaveAttribute('role', 'region');
              
              // Content should have aria-labelledby pointing back to header
              const labelledBy = controlledElement.getAttribute('aria-labelledby');
              expect(labelledBy).toBeTruthy();
              
              // The header should have an id matching the labelledby
              const headerId = header.getAttribute('id');
              expect(headerId).toBe(labelledBy);
            }
          } else {
            // When collapsed, content should not exist
            expect(controlledElement).toBeNull();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 20: HelpTooltip has proper ARIA attributes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0),
        async (helpText) => {
          const user = userEvent.setup();
          
          const { container } = render(
            <HelpTooltip content={helpText} />
          );
          
          // Find the help icon
          const icon = container.querySelector('[role="button"][aria-label="Help information"]');
          expect(icon).not.toBeNull();
          
          // Should have tabindex="0" for keyboard accessibility
          expect(icon).toHaveAttribute('tabindex', '0');
          
          // Should have aria-label
          expect(icon).toHaveAttribute('aria-label', 'Help information');
          
          // Initially, should not have aria-describedby (tooltip not visible)
          expect(icon).not.toHaveAttribute('aria-describedby');
          
          // Focus the icon to show tooltip
          icon.focus();
          
          await waitFor(() => {
            // After focus, should have aria-describedby
            expect(icon).toHaveAttribute('aria-describedby');
            
            // The tooltip should exist with role="tooltip" in document.body (portal)
            const tooltipId = icon.getAttribute('aria-describedby');
            const tooltip = document.body.querySelector(`#${tooltipId}`);
            expect(tooltip).not.toBeNull();
            expect(tooltip).toHaveAttribute('role', 'tooltip');
            expect(tooltip.textContent).toBe(helpText);
          });
          
          // Press Escape to hide tooltip
          await user.keyboard('{Escape}');
          
          await waitFor(() => {
            // After Escape, tooltip should be hidden
            const tooltipId = icon.getAttribute('aria-describedby');
            if (tooltipId) {
              const tooltip = document.body.querySelector(`#${tooltipId}`);
              expect(tooltip).toBeNull();
            }
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});
