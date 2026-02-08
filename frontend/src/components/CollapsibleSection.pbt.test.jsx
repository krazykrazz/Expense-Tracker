import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import CollapsibleSection from './CollapsibleSection.jsx';

// Feature: expense-form-simplification, Property 6: Section toggle interaction
describe('CollapsibleSection - Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  test('Property 6: Section toggle interaction - clicking header toggles expansion', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          badge: fc.option(fc.oneof(fc.string(), fc.integer()), { nil: null }),
          hasError: fc.boolean(),
          helpText: fc.option(fc.string(), { nil: null }),
          initialExpanded: fc.boolean()
        }),
        async ({ title, badge, hasError, helpText, initialExpanded }) => {
          const onToggle = vi.fn();
          const user = userEvent.setup();

          const { rerender, container, unmount } = render(
            <CollapsibleSection
              title={title}
              isExpanded={initialExpanded}
              onToggle={onToggle}
              badge={badge}
              hasError={hasError}
              helpText={helpText}
            >
              <div data-testid="test-content">Test Content</div>
            </CollapsibleSection>
          );

          // Find the header by class instead of role/name
          const header = container.querySelector('.collapsible-header');
          expect(header).toBeInTheDocument();

          // Click the header
          await user.click(header);

          // Verify onToggle was called exactly once
          expect(onToggle).toHaveBeenCalledTimes(1);

          // Simulate the parent component updating the state
          rerender(
            <CollapsibleSection
              title={title}
              isExpanded={!initialExpanded}
              onToggle={onToggle}
              badge={badge}
              hasError={hasError}
              helpText={helpText}
            >
              <div data-testid="test-content">Test Content</div>
            </CollapsibleSection>
          );

          // Verify aria-expanded reflects the new state
          expect(header).toHaveAttribute('aria-expanded', String(!initialExpanded));

          // Verify content visibility matches expansion state using container queries
          if (!initialExpanded) {
            // Was collapsed, now expanded - content should be visible
            expect(container.querySelector('[data-testid="test-content"]')).toBeInTheDocument();
          } else {
            // Was expanded, now collapsed - content should not be visible
            expect(container.querySelector('[data-testid="test-content"]')).not.toBeInTheDocument();
          }

          // Clean up this render
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 6: Section toggle interaction - Enter key toggles expansion', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          initialExpanded: fc.boolean()
        }),
        async ({ title, initialExpanded }) => {
          const onToggle = vi.fn();
          const user = userEvent.setup();

          const { rerender, container, unmount } = render(
            <CollapsibleSection
              title={title}
              isExpanded={initialExpanded}
              onToggle={onToggle}
            >
              <div>Test Content</div>
            </CollapsibleSection>
          );

          const header = container.querySelector('.collapsible-header');

          // Focus the header and press Enter
          header.focus();
          await user.keyboard('{Enter}');

          // Verify onToggle was called
          expect(onToggle).toHaveBeenCalledTimes(1);

          // Simulate state update
          rerender(
            <CollapsibleSection
              title={title}
              isExpanded={!initialExpanded}
              onToggle={onToggle}
            >
              <div>Test Content</div>
            </CollapsibleSection>
          );

          // Verify aria-expanded updated
          expect(header).toHaveAttribute('aria-expanded', String(!initialExpanded));

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 6: Section toggle interaction - Space key toggles expansion', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          initialExpanded: fc.boolean()
        }),
        async ({ title, initialExpanded }) => {
          const onToggle = vi.fn();
          const user = userEvent.setup();

          const { rerender, container, unmount } = render(
            <CollapsibleSection
              title={title}
              isExpanded={initialExpanded}
              onToggle={onToggle}
            >
              <div>Test Content</div>
            </CollapsibleSection>
          );

          const header = container.querySelector('.collapsible-header');

          // Focus the header and press Space
          header.focus();
          await user.keyboard(' ');

          // Verify onToggle was called
          expect(onToggle).toHaveBeenCalledTimes(1);

          // Simulate state update
          rerender(
            <CollapsibleSection
              title={title}
              isExpanded={!initialExpanded}
              onToggle={onToggle}
            >
              <div>Test Content</div>
            </CollapsibleSection>
          );

          // Verify aria-expanded updated
          expect(header).toHaveAttribute('aria-expanded', String(!initialExpanded));

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 6: Section toggle interaction - multiple toggles maintain consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          toggleCount: fc.integer({ min: 2, max: 5 })
        }),
        async ({ title, toggleCount }) => {
          const onToggle = vi.fn();
          const user = userEvent.setup();

          let isExpanded = false;

          const { rerender, container, unmount } = render(
            <CollapsibleSection
              title={title}
              isExpanded={isExpanded}
              onToggle={onToggle}
            >
              <div data-testid="test-content">Test Content</div>
            </CollapsibleSection>
          );

          const header = container.querySelector('.collapsible-header');

          // Perform multiple toggles
          for (let i = 0; i < toggleCount; i++) {
            await user.click(header);
            isExpanded = !isExpanded;

            rerender(
              <CollapsibleSection
                title={title}
                isExpanded={isExpanded}
                onToggle={onToggle}
              >
                <div data-testid="test-content">Test Content</div>
              </CollapsibleSection>
            );

            // Verify state consistency after each toggle
            expect(header).toHaveAttribute('aria-expanded', String(isExpanded));
            
            if (isExpanded) {
              expect(container.querySelector('[data-testid="test-content"]')).toBeInTheDocument();
            } else {
              expect(container.querySelector('[data-testid="test-content"]')).not.toBeInTheDocument();
            }
          }

          // Verify onToggle was called the correct number of times
          expect(onToggle).toHaveBeenCalledTimes(toggleCount);

          unmount();
        }
      ),
      { numRuns: 50, timeout: 60000 }
    );
  });
});
