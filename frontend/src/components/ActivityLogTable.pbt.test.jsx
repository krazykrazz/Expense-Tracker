import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import ActivityLogTable from './ActivityLogTable';

/**
 * Property-Based Tests for ActivityLogTable Component
 * 
 * These tests validate universal properties that should hold across all valid inputs.
 * Each test runs 100+ iterations with randomly generated data.
 */

describe('ActivityLogTable - Property-Based Tests', () => {
  /**
   * **Feature: settings-system-split, Property 3: Activity Log Table Structure**
   * 
   * For any non-empty array of activity events, rendering the ActivityLogTable 
   * should produce a table with exactly two columns (Action and Timestamp) and 
   * one row per event.
   * 
   * **Validates: Requirements 4.1**
   */
  it('Property 3: renders table with correct structure for any event array', () => {
    // Arbitrary for activity events
    const activityEventArb = fc.record({
      id: fc.integer({ min: 1, max: 100000 }),
      user_action: fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 5),
      timestamp: fc.integer({ min: Date.parse('2020-01-01'), max: Date.now() }).map(ms => new Date(ms).toISOString()),
      event_type: fc.constantFrom('expense_created', 'loan_updated', 'backup_deleted', 'investment_created'),
      entity_type: fc.constantFrom('expense', 'fixed_expense', 'loan', 'investment', 'budget', 'payment_method', 'backup'),
      entity_id: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
      metadata: fc.option(fc.object(), { nil: null })
    });

    // Generate non-empty arrays of events
    const eventsArrayArb = fc.array(activityEventArb, { minLength: 1, maxLength: 50 });

    fc.assert(
      fc.property(eventsArrayArb, (events) => {
        const { container } = render(
          <ActivityLogTable
            events={events}
            loading={false}
            error={null}
            displayLimit={50}
            hasMore={false}
            stats={null}
            onDisplayLimitChange={() => {}}
            onLoadMore={() => {}}
          />
        );

        // Verify table exists
        const table = container.querySelector('.activity-table');
        expect(table).toBeTruthy();

        // Verify header row has exactly 2 columns
        const headerCells = container.querySelectorAll('.activity-table thead th');
        expect(headerCells.length).toBe(2);
        expect(headerCells[0].textContent).toBe('Action');
        expect(headerCells[1].textContent).toBe('Timestamp');

        // Verify body has exactly N rows (one per event)
        const bodyRows = container.querySelectorAll('.activity-table tbody tr');
        expect(bodyRows.length).toBe(events.length);

        // Verify each row has exactly 2 cells
        bodyRows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          expect(cells.length).toBe(2);
        });
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: settings-system-split, Property 5: Load More Button Visibility**
   * 
   * For any activity log state, the "Load More" button should be visible if and 
   * only if hasMore === true AND events.length > 0. When loading is true,
   * the button should be disabled.
   * 
   * **Validates: Requirements 4.3**
   */
  it('Property 5: Load More button visibility follows hasMore and loading state', () => {
    const activityEventArb = fc.record({
      id: fc.integer({ min: 1, max: 100000 }),
      user_action: fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 5),
      timestamp: fc.integer({ min: Date.parse('2020-01-01'), max: Date.now() }).map(ms => new Date(ms).toISOString()),
      event_type: fc.constantFrom('expense_created', 'loan_updated', 'backup_deleted'),
      entity_type: fc.constantFrom('expense', 'loan', 'backup'),
      entity_id: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
      metadata: fc.option(fc.object(), { nil: null })
    });

    const stateArb = fc.record({
      events: fc.array(activityEventArb, { minLength: 0, maxLength: 20 }),
      hasMore: fc.boolean(),
      loading: fc.boolean()
    });

    fc.assert(
      fc.property(stateArb, ({ events, hasMore, loading }) => {
        const { container } = render(
          <ActivityLogTable
            events={events}
            loading={loading}
            error={null}
            displayLimit={50}
            hasMore={hasMore}
            stats={null}
            onDisplayLimitChange={() => {}}
            onLoadMore={() => {}}
          />
        );

        const loadMoreSection = container.querySelector('.activity-load-more');
        const loadMoreButton = container.querySelector('.activity-load-more-button');

        // Load More button should only appear when hasMore is true AND there are events
        if (hasMore && events.length > 0) {
          // Load More section and button should exist
          expect(loadMoreSection).toBeTruthy();
          expect(loadMoreButton).toBeTruthy();
          
          // Button should be disabled when loading
          if (loading) {
            expect(loadMoreButton.disabled).toBe(true);
            expect(loadMoreButton.textContent).toBe('Loading...');
          } else {
            expect(loadMoreButton.disabled).toBe(false);
            expect(loadMoreButton.textContent).toBe('Load More');
          }
        } else {
          // Load More section should not exist when hasMore is false or events is empty
          expect(loadMoreSection).toBeFalsy();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: settings-system-split, Property 6: Event Type Badge Color Consistency**
   * 
   * For any event type string, the badge color should be deterministic and 
   * consistent across all views (same event type always produces same color).
   * 
   * **Validates: Requirements 5.1**
   */
  it('Property 6: event type badges have consistent colors for same entity type', () => {
    const entityTypeArb = fc.constantFrom(
      'expense',
      'fixed_expense',
      'loan',
      'investment',
      'budget',
      'payment_method',
      'backup'
    );

    // Generate multiple events with the same entity type
    const consistencyTestArb = fc.record({
      entityType: entityTypeArb,
      eventCount: fc.integer({ min: 2, max: 10 })
    }).chain(({ entityType, eventCount }) => {
      return fc.tuple(
        fc.constant(entityType),
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            user_action: fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 5),
            timestamp: fc.integer({ min: Date.parse('2020-01-01'), max: Date.now() }).map(ms => new Date(ms).toISOString()),
            event_type: fc.constantFrom(`${entityType}_created`, `${entityType}_updated`, `${entityType}_deleted`),
            entity_type: fc.constant(entityType),
            entity_id: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
            metadata: fc.option(fc.object(), { nil: null })
          }),
          { minLength: eventCount, maxLength: eventCount }
        )
      );
    });

    fc.assert(
      fc.property(consistencyTestArb, ([entityType, events]) => {
        const { container } = render(
          <ActivityLogTable
            events={events}
            loading={false}
            error={null}
            displayLimit={50}
            hasMore={false}
            stats={null}
            onDisplayLimitChange={() => {}}
            onLoadMore={() => {}}
          />
        );

        // Get all badges for this entity type
        const badges = Array.from(container.querySelectorAll('.activity-event-badge'));
        
        // All badges should exist
        expect(badges.length).toBe(events.length);

        // Extract background colors from all badges (inline styles)
        const colors = badges.map(badge => {
          return badge.style.backgroundColor;
        });

        // All colors should be identical (deterministic and consistent)
        const uniqueColors = new Set(colors);
        expect(uniqueColors.size).toBe(1);

        // Verify the color matches the expected entity type color
        const expectedColors = {
          expense: 'rgb(33, 150, 243)',        // #2196F3
          fixed_expense: 'rgb(156, 39, 176)',  // #9C27B0
          loan: 'rgb(255, 152, 0)',            // #FF9800
          investment: 'rgb(76, 175, 80)',      // #4CAF50
          budget: 'rgb(0, 150, 136)',          // #009688
          payment_method: 'rgb(63, 81, 181)',  // #3F51B5
          backup: 'rgb(96, 125, 139)'          // #607D8B
        };

        const expectedColor = expectedColors[entityType];
        if (expectedColor) {
          expect(colors[0]).toBe(expectedColor);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Empty state handling
   * 
   * For any empty event array, the component should render an empty state message
   * and no table rows.
   */
  it('Property: handles empty event arrays gracefully', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (hasMore, loading) => {
        const { container } = render(
          <ActivityLogTable
            events={[]}
            loading={loading}
            error={null}
            displayLimit={50}
            hasMore={hasMore}
            stats={null}
            onDisplayLimitChange={() => {}}
            onLoadMore={() => {}}
          />
        );

        // Should not crash
        expect(container).toBeTruthy();

        // Should show empty state when not loading
        if (!loading) {
          const emptyMessage = container.querySelector('.activity-empty');
          expect(emptyMessage).toBeTruthy();
          expect(emptyMessage.textContent).toContain('No recent activity');
        }

        // Should have no table rows
        const bodyRows = container.querySelectorAll('.activity-table tbody tr');
        expect(bodyRows.length).toBe(0);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Additional property: Error state handling
   * 
   * For any error message, the component should display the error and not render
   * the table.
   */
  it('Property: displays error state for any error message', () => {
    const errorMessageArb = fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 5);

    fc.assert(
      fc.property(errorMessageArb, (errorMessage) => {
        const { container } = render(
          <ActivityLogTable
            events={[]}
            loading={false}
            error={errorMessage}
            displayLimit={50}
            hasMore={false}
            stats={null}
            onDisplayLimitChange={() => {}}
            onLoadMore={() => {}}
          />
        );

        // Should display error message
        const errorElement = container.querySelector('.activity-error');
        expect(errorElement).toBeTruthy();
        expect(errorElement.textContent).toContain(errorMessage.trim());

        // Should not render table
        const table = container.querySelector('.activity-table');
        expect(table).toBeFalsy();
      }),
      { numRuns: 50 }
    );
  });
});
