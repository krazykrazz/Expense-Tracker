import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import CollapsibleSection from './CollapsibleSection';

describe('CollapsibleSection Property-Based Tests', () => {
  /**
   * **Feature: summary-panel-redesign, Property 4: Collapsible Section Toggle**
   * 
   * For any collapsible section, clicking the section header SHALL toggle 
   * its expanded state (collapsed becomes expanded, expanded becomes collapsed).
   * **Validates: Requirements 3.2, 3.3**
   */
  it('Property 4: clicking header toggles expanded state', async () => {
    // Generator for section props
    const titleArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
    const summaryValueArb = fc.oneof(
      fc.constant(undefined),
      fc.string({ minLength: 1, maxLength: 20 })
    );
    const iconArb = fc.oneof(
      fc.constant(undefined),
      fc.constantFrom('📅', '💳', '🏷️', '💰', '📊')
    );
    const defaultExpandedArb = fc.boolean();
    const clickCountArb = fc.integer({ min: 1, max: 10 });

    await fc.assert(
      fc.asyncProperty(
        titleArb,
        summaryValueArb,
        iconArb,
        defaultExpandedArb,
        clickCountArb,
        async (title, summaryValue, icon, defaultExpanded, clickCount) => {
          const { container, unmount } = render(
            <CollapsibleSection
              title={title}
              summaryValue={summaryValue}
              icon={icon}
              defaultExpanded={defaultExpanded}
            >
              <div data-testid="content">Test Content</div>
            </CollapsibleSection>
          );

          const header = container.querySelector('.collapsible-header');
          expect(header).toBeTruthy();

          // Track expected state starting from defaultExpanded
          let expectedExpanded = defaultExpanded;

          // Verify initial state
          const section = container.querySelector('.collapsible-section');
          expect(section.classList.contains('expanded')).toBe(expectedExpanded);
          expect(section.classList.contains('collapsed')).toBe(!expectedExpanded);

          // Click the header multiple times and verify toggle behavior
          for (let i = 0; i < clickCount; i++) {
            fireEvent.click(header);
            expectedExpanded = !expectedExpanded;

            // Verify the state toggled correctly
            expect(section.classList.contains('expanded')).toBe(expectedExpanded);
            expect(section.classList.contains('collapsed')).toBe(!expectedExpanded);
            
            // Verify aria-expanded attribute
            expect(header.getAttribute('aria-expanded')).toBe(String(expectedExpanded));
            
            // Verify chevron rotation
            const chevron = container.querySelector('.collapsible-chevron');
            expect(chevron.classList.contains('rotated')).toBe(expectedExpanded);
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: summary-panel-redesign, Property 4 (continued): Summary visibility**
   * 
   * When a section is collapsed, the summary value SHALL be visible.
   * When a section is expanded, the summary value SHALL be hidden.
   * **Validates: Requirements 3.4**
   */
  it('Property 4: summary value visibility matches collapsed state', async () => {
    const titleArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
    const summaryValueArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0);
    const defaultExpandedArb = fc.boolean();

    await fc.assert(
      fc.asyncProperty(
        titleArb,
        summaryValueArb,
        defaultExpandedArb,
        async (title, summaryValue, defaultExpanded) => {
          const { container, unmount } = render(
            <CollapsibleSection
              title={title}
              summaryValue={summaryValue}
              defaultExpanded={defaultExpanded}
            >
              <div>Test Content</div>
            </CollapsibleSection>
          );

          const header = container.querySelector('.collapsible-header');
          
          // Check initial state
          let summaryElement = container.querySelector('.collapsible-summary');
          if (defaultExpanded) {
            // When expanded, summary should NOT be visible
            expect(summaryElement).toBeNull();
          } else {
            // When collapsed, summary should be visible
            expect(summaryElement).toBeTruthy();
            expect(summaryElement.textContent).toBe(summaryValue);
          }

          // Toggle and check again
          fireEvent.click(header);
          
          summaryElement = container.querySelector('.collapsible-summary');
          if (defaultExpanded) {
            // Now collapsed, summary should be visible
            expect(summaryElement).toBeTruthy();
            expect(summaryElement.textContent).toBe(summaryValue);
          } else {
            // Now expanded, summary should NOT be visible
            expect(summaryElement).toBeNull();
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
