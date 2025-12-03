import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import BreakdownTab from './BreakdownTab';

/**
 * Property-Based Tests for BreakdownTab Component
 * Tests universal properties that should hold across all valid inputs
 */

describe('BreakdownTab - Property-Based Tests', () => {
  /**
   * **Feature: summary-panel-redesign, Property 5: Collapsed Section Summary**
   * **Validates: Requirements 3.4**
   * 
   * For any collapsible section in collapsed state with data items,
   * the section header SHALL display a summary total value.
   */
  it('Property 5: displays summary total when section is collapsed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary weekly totals (5 weeks)
        fc.record({
          week1: fc.float({ min: 0, max: 10000, noNaN: true }),
          week2: fc.float({ min: 0, max: 10000, noNaN: true }),
          week3: fc.float({ min: 0, max: 10000, noNaN: true }),
          week4: fc.float({ min: 0, max: 10000, noNaN: true }),
          week5: fc.float({ min: 0, max: 10000, noNaN: true })
        }),
        // Generate arbitrary method totals (1-5 payment methods)
        fc.dictionary(
          fc.constantFrom('Credit Card', 'Debit Card', 'Cash', 'E-Transfer', 'Cheque'),
          fc.float({ min: 0, max: 10000, noNaN: true }),
          { minKeys: 1, maxKeys: 5 }
        ),
        async (weeklyTotals, methodTotals) => {
          // Calculate expected totals
          const expectedWeeklyTotal = Object.values(weeklyTotals).reduce((sum, val) => sum + val, 0);
          const expectedMethodTotal = Object.values(methodTotals).reduce((sum, val) => sum + val, 0);

          // Render component
          const { container, unmount } = render(
            <BreakdownTab
              weeklyTotals={weeklyTotals}
              methodTotals={methodTotals}
              previousWeeklyTotals={{}}
              previousMethodTotals={{}}
            />
          );

          // Find all collapsible sections
          const collapsibleSections = container.querySelectorAll('.collapsible-section');
          
          // Check each section
          collapsibleSections.forEach((section) => {
            const isCollapsed = section.classList.contains('collapsed');
            const summaryElement = section.querySelector('.collapsible-summary');
            
            if (isCollapsed && summaryElement) {
              // When collapsed, summary should be visible and contain a dollar amount
              expect(summaryElement.textContent).toMatch(/\$[\d,]+\.\d{2}/);
              
              // Verify the summary value matches one of our expected totals
              const summaryText = summaryElement.textContent;
              const summaryValue = parseFloat(summaryText.replace(/[$,]/g, ''));
              
              // Should match either weekly or method total (within floating point precision)
              const matchesWeekly = Math.abs(summaryValue - expectedWeeklyTotal) < 0.01;
              const matchesMethod = Math.abs(summaryValue - expectedMethodTotal) < 0.01;
              
              expect(matchesWeekly || matchesMethod).toBe(true);
            }
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: summary-panel-redesign, Property 6: Expanded Section Items**
   * **Validates: Requirements 3.5**
   * 
   * For any collapsible section in expanded state,
   * all data items within that section SHALL be rendered with their values and trend indicators.
   */
  it('Property 6: displays all items with values when section is expanded', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary weekly totals
        fc.record({
          week1: fc.float({ min: 0, max: 10000, noNaN: true }),
          week2: fc.float({ min: 0, max: 10000, noNaN: true }),
          week3: fc.float({ min: 0, max: 10000, noNaN: true }),
          week4: fc.float({ min: 0, max: 10000, noNaN: true }),
          week5: fc.float({ min: 0, max: 10000, noNaN: true })
        }),
        // Generate arbitrary method totals
        fc.dictionary(
          fc.constantFrom('Credit Card', 'Debit Card', 'Cash', 'E-Transfer', 'Cheque'),
          fc.float({ min: 0, max: 10000, noNaN: true }),
          { minKeys: 1, maxKeys: 5 }
        ),
        async (weeklyTotals, methodTotals) => {
          // Render component
          const { container, unmount } = render(
            <BreakdownTab
              weeklyTotals={weeklyTotals}
              methodTotals={methodTotals}
              previousWeeklyTotals={{}}
              previousMethodTotals={{}}
            />
          );

          // Find all expanded sections
          const expandedSections = container.querySelectorAll('.collapsible-section.expanded');
          
          expandedSections.forEach((section) => {
            const content = section.querySelector('.collapsible-content');
            expect(content).toBeTruthy();
            expect(content.classList.contains('visible')).toBe(true);
            
            // Find all items in the expanded section
            const items = content.querySelectorAll('.breakdown-item');
            expect(items.length).toBeGreaterThan(0);
            
            // Each item should have a label and value
            items.forEach((item) => {
              const label = item.querySelector('.breakdown-label');
              const value = item.querySelector('.breakdown-value');
              
              expect(label).toBeTruthy();
              expect(label.textContent).toBeTruthy();
              
              expect(value).toBeTruthy();
              expect(value.textContent).toMatch(/\$[\d,]+\.\d{2}/);
            });
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
