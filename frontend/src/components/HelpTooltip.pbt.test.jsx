import { describe, test, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import HelpTooltip from './HelpTooltip.jsx';

// Feature: expense-form-simplification, Property 8: Tooltip display on hover/focus
describe('HelpTooltip - Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  test('Property 8: Tooltip displays on hover and hides on mouse leave', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
          position: fc.constantFrom('top', 'bottom', 'left', 'right'),
          maxWidth: fc.integer({ min: 100, max: 500 })
        }),
        async ({ content, position, maxWidth }) => {
          const user = userEvent.setup();
          const { container, unmount } = render(
            <HelpTooltip
              content={content}
              position={position}
              maxWidth={maxWidth}
            />
          );

          const icon = container.querySelector('.help-tooltip-icon');
          expect(icon).toBeInTheDocument();

          // Initially, tooltip should not be visible
          expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();

          // Hover to show
          await user.hover(icon);

          // Tooltip should be visible
          await waitFor(() => {
            const tooltip = container.querySelector('[role="tooltip"]');
            expect(tooltip).toBeInTheDocument();
            // Use textContent to handle whitespace properly
            expect(tooltip.textContent).toBe(content);
          });

          // Unhover (mouse leave)
          await user.unhover(icon);

          // Tooltip should be hidden
          await waitFor(() => {
            expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 8: Tooltip displays on focus and hides on blur', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
          position: fc.constantFrom('top', 'bottom', 'left', 'right')
        }),
        async ({ content, position }) => {
          const user = userEvent.setup();
          const { container, unmount } = render(
            <HelpTooltip content={content} position={position} />
          );

          const icon = container.querySelector('.help-tooltip-icon');

          // Initially, tooltip should not be visible
          expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();

          // Focus to show
          await user.click(icon);

          // Tooltip should be visible
          await waitFor(() => {
            const tooltip = container.querySelector('[role="tooltip"]');
            expect(tooltip).toBeInTheDocument();
            expect(tooltip.textContent).toBe(content);
          });

          // Blur (tab away)
          await user.tab();

          // Tooltip should be hidden
          await waitFor(() => {
            expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 8: Tooltip hides on Escape key press', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)
        }),
        async ({ content }) => {
          const user = userEvent.setup();
          const { container, unmount } = render(
            <HelpTooltip content={content} />
          );

          const icon = container.querySelector('.help-tooltip-icon');

          // Focus and show tooltip
          await user.click(icon);

          await waitFor(() => {
            expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument();
          });

          // Press Escape
          await user.keyboard('{Escape}');

          // Tooltip should be hidden
          await waitFor(() => {
            expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 8: Tooltip respects maxWidth property', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
          maxWidth: fc.integer({ min: 100, max: 500 })
        }),
        async ({ content, maxWidth }) => {
          const user = userEvent.setup();
          const { container, unmount } = render(
            <HelpTooltip content={content} maxWidth={maxWidth} />
          );

          const icon = container.querySelector('.help-tooltip-icon');

          // Show tooltip
          await user.hover(icon);

          await waitFor(() => {
            const tooltip = container.querySelector('[role="tooltip"]');
            expect(tooltip).toBeInTheDocument();
            
            // Check that maxWidth style is applied
            expect(tooltip.style.maxWidth).toBe(`${maxWidth}px`);
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 8: Tooltip applies correct position class', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
          position: fc.constantFrom('top', 'bottom', 'left', 'right')
        }),
        async ({ content, position }) => {
          const user = userEvent.setup();
          const { container, unmount } = render(
            <HelpTooltip content={content} position={position} />
          );

          const icon = container.querySelector('.help-tooltip-icon');

          // Show tooltip
          await user.hover(icon);

          await waitFor(() => {
            const tooltip = container.querySelector('[role="tooltip"]');
            expect(tooltip).toBeInTheDocument();
            expect(tooltip).toHaveClass(`help-tooltip-${position}`);
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 8: Multiple hover/unhover cycles work consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
          cycles: fc.integer({ min: 1, max: 3 })
        }),
        async ({ content, cycles }) => {
          const user = userEvent.setup();
          const { container, unmount } = render(
            <HelpTooltip content={content} />
          );

          const icon = container.querySelector('.help-tooltip-icon');

          for (let i = 0; i < cycles; i++) {
            // Hover to show
            await user.hover(icon);

            await waitFor(() => {
              expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument();
            });

            // Unhover to hide
            await user.unhover(icon);

            await waitFor(() => {
              expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();
            });
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 8: Tooltip has proper ARIA attributes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        async (content) => {
          const user = userEvent.setup();
          const { container, unmount } = render(
            <HelpTooltip content={content} />
          );

          const icon = container.querySelector('.help-tooltip-icon');

          // Check icon has proper ARIA attributes
          expect(icon).toHaveAttribute('role', 'button');
          expect(icon).toHaveAttribute('aria-label', 'Help information');
          expect(icon).toHaveAttribute('tabIndex', '0');

          // Show tooltip
          await user.hover(icon);

          await waitFor(() => {
            const tooltip = container.querySelector('[role="tooltip"]');
            expect(tooltip).toBeInTheDocument();
            
            // Check tooltip has proper role
            expect(tooltip).toHaveAttribute('role', 'tooltip');
            
            // Check icon has aria-describedby pointing to tooltip
            const tooltipId = tooltip.getAttribute('id');
            expect(tooltipId).toBeTruthy();
            expect(icon).toHaveAttribute('aria-describedby', tooltipId);
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
