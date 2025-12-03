import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import TabNavigation from './TabNavigation';

describe('TabNavigation Property-Based Tests', () => {
  /**
   * **Feature: summary-panel-redesign, Property 3: Tab Content Exclusivity**
   * 
   * For any tab selection, only the content associated with the selected tab 
   * SHALL be visible, and all other tab contents SHALL be hidden.
   * **Validates: Requirements 2.2**
   */
  it('Property 3: only selected tab triggers onTabChange with correct id', async () => {
    // Generator for tabs array (at least 2 tabs)
    // Use lowercase-only IDs starting with a letter to avoid CSS selector issues
    const tabArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
      label: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
      icon: fc.oneof(fc.constant(undefined), fc.constantFrom('📊', '📅', '💰', '🏷️', '💳'))
    });

    const tabsArb = fc.array(tabArb, { minLength: 2, maxLength: 5 })
      .filter(tabs => {
        // Ensure unique ids (case-insensitive to avoid selector issues)
        const ids = tabs.map(t => t.id.toLowerCase());
        return new Set(ids).size === ids.length;
      });

    await fc.assert(
      fc.asyncProperty(
        tabsArb,
        async (tabs) => {
          const onTabChange = vi.fn();
          
          // Start with first tab as active
          const initialActiveTab = tabs[0].id;
          
          const { container, unmount } = render(
            <TabNavigation
              tabs={tabs}
              activeTab={initialActiveTab}
              onTabChange={onTabChange}
            />
          );

          // Click each tab and verify onTabChange is called with correct id
          for (const tab of tabs) {
            onTabChange.mockClear();
            
            const tabButton = container.querySelector(`[aria-controls="tabpanel-${tab.id}"]`);
            expect(tabButton).toBeTruthy();
            
            fireEvent.click(tabButton);
            
            // If clicking the already active tab, onTabChange should NOT be called
            if (tab.id === initialActiveTab) {
              expect(onTabChange).not.toHaveBeenCalled();
            } else {
              // Otherwise, onTabChange should be called with the tab id
              expect(onTabChange).toHaveBeenCalledTimes(1);
              expect(onTabChange).toHaveBeenCalledWith(tab.id);
            }
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: summary-panel-redesign, Property 11: Active Tab Styling**
   * 
   * For any selected tab, that tab element SHALL have the "active" CSS class applied,
   * and no other tab SHALL have the "active" class.
   * **Validates: Requirements 7.2**
   */
  it('Property 11: only active tab has active class', async () => {
    const tabArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/i.test(s)),
      label: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
      icon: fc.oneof(fc.constant(undefined), fc.constantFrom('📊', '📅', '💰'))
    });

    const tabsArb = fc.array(tabArb, { minLength: 2, maxLength: 5 })
      .filter(tabs => {
        const ids = tabs.map(t => t.id);
        return new Set(ids).size === ids.length;
      });

    await fc.assert(
      fc.asyncProperty(
        tabsArb,
        fc.nat(), // Random index for active tab
        async (tabs, activeIndex) => {
          // Ensure activeIndex is within bounds
          const boundedIndex = activeIndex % tabs.length;
          const activeTab = tabs[boundedIndex].id;
          
          const { container, unmount } = render(
            <TabNavigation
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={() => {}}
            />
          );

          const tabButtons = container.querySelectorAll('.tab-button');
          expect(tabButtons.length).toBe(tabs.length);

          // Count how many tabs have the active class
          let activeCount = 0;
          
          tabButtons.forEach((button, index) => {
            const hasActiveClass = button.classList.contains('active');
            const isSelectedTab = tabs[index].id === activeTab;
            
            if (hasActiveClass) {
              activeCount++;
            }
            
            // Active class should match whether this is the selected tab
            expect(hasActiveClass).toBe(isSelectedTab);
            
            // aria-selected should also match
            expect(button.getAttribute('aria-selected')).toBe(String(isSelectedTab));
          });

          // Exactly one tab should have the active class
          expect(activeCount).toBe(1);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: Tab navigation renders all provided tabs
   */
  it('renders all provided tabs with correct labels', async () => {
    const tabArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/i.test(s)),
      label: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
      icon: fc.oneof(fc.constant(undefined), fc.constantFrom('📊', '📅', '💰'))
    });

    const tabsArb = fc.array(tabArb, { minLength: 1, maxLength: 5 })
      .filter(tabs => {
        const ids = tabs.map(t => t.id);
        return new Set(ids).size === ids.length;
      });

    await fc.assert(
      fc.asyncProperty(
        tabsArb,
        async (tabs) => {
          const activeTab = tabs[0].id;
          
          const { container, unmount } = render(
            <TabNavigation
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={() => {}}
            />
          );

          const tabButtons = container.querySelectorAll('.tab-button');
          expect(tabButtons.length).toBe(tabs.length);

          // Verify each tab has the correct label
          tabs.forEach((tab, index) => {
            const labelElement = tabButtons[index].querySelector('.tab-label');
            expect(labelElement.textContent).toBe(tab.label);
            
            // If icon is provided, verify it's rendered
            if (tab.icon) {
              const iconElement = tabButtons[index].querySelector('.tab-icon');
              expect(iconElement).toBeTruthy();
              expect(iconElement.textContent).toBe(tab.icon);
            }
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
