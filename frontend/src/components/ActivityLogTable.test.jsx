import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActivityLogTable from './ActivityLogTable';

/**
 * Unit Tests for ActivityLogTable Component
 * 
 * These tests validate specific examples, edge cases, and error conditions.
 */

describe('ActivityLogTable - Unit Tests', () => {
  const mockEvents = [
    {
      id: 1,
      user_action: 'Created expense for groceries',
      timestamp: '2024-01-15T10:30:00Z',
      event_type: 'expense_created',
      entity_type: 'expense',
      entity_id: 123,
      metadata: null
    },
    {
      id: 2,
      user_action: 'Updated loan balance',
      timestamp: '2024-01-15T09:15:00Z',
      event_type: 'loan_updated',
      entity_type: 'loan',
      entity_id: 456,
      metadata: { amount: 5000 }
    },
    {
      id: 3,
      user_action: 'Deleted backup file',
      timestamp: '2024-01-14T18:45:00Z',
      event_type: 'backup_deleted',
      entity_type: 'backup',
      entity_id: 789,
      metadata: null
    }
  ];

  const defaultProps = {
    events: mockEvents,
    loading: false,
    error: null,
    displayLimit: 50,
    hasMore: false,
    stats: null,
    onDisplayLimitChange: vi.fn(),
    onLoadMore: vi.fn()
  };

  describe('Empty state rendering', () => {
    it('should render empty state when no events and not loading', () => {
      render(
        <ActivityLogTable
          {...defaultProps}
          events={[]}
          loading={false}
        />
      );

      expect(screen.getByText(/no recent activity/i)).toBeTruthy();
    });

    it('should render loading state when loading with no events', () => {
      render(
        <ActivityLogTable
          {...defaultProps}
          events={[]}
          loading={true}
        />
      );

      expect(screen.getByText(/loading recent activity/i)).toBeTruthy();
    });

    it('should not render table when events array is empty', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          events={[]}
        />
      );

      const table = container.querySelector('.activity-event-table');
      expect(table).toBeFalsy();
    });
  });

  describe('Event list rendering', () => {
    it('should render all events in the list', () => {
      render(<ActivityLogTable {...defaultProps} />);

      expect(screen.getByText('Created expense for groceries')).toBeTruthy();
      expect(screen.getByText('Updated loan balance')).toBeTruthy();
      expect(screen.getByText('Deleted backup file')).toBeTruthy();
    });

    it('should render table with correct headers', () => {
      const { container } = render(<ActivityLogTable {...defaultProps} />);

      const headers = container.querySelectorAll('.activity-event-table thead th');
      expect(headers.length).toBe(3);
      expect(headers[0].textContent).toBe('Time');
      expect(headers[1].textContent).toBe('Event Type');
      expect(headers[2].textContent).toBe('Details');
    });

    it('should render correct number of table rows', () => {
      const { container } = render(<ActivityLogTable {...defaultProps} />);

      const rows = container.querySelectorAll('.activity-event-table tbody tr');
      expect(rows.length).toBe(mockEvents.length);
    });

    it('should render event type badges for each event', () => {
      const { container } = render(<ActivityLogTable {...defaultProps} />);

      const badges = container.querySelectorAll('.activity-event-badge');
      expect(badges.length).toBe(mockEvents.length);
      
      // Check badge text
      expect(badges[0].textContent).toBe('Created');
      expect(badges[1].textContent).toBe('Updated');
      expect(badges[2].textContent).toBe('Deleted');
    });

    it('should apply correct colors to event type badges', () => {
      const { container } = render(<ActivityLogTable {...defaultProps} />);

      const badges = container.querySelectorAll('.activity-event-badge');
      
      // Expense badge should be blue
      expect(badges[0].style.backgroundColor).toBe('rgb(33, 150, 243)');
      
      // Loan badge should be orange
      expect(badges[1].style.backgroundColor).toBe('rgb(255, 152, 0)');
      
      // Backup badge should be gray
      expect(badges[2].style.backgroundColor).toBe('rgb(96, 125, 139)');
    });
  });

  describe('Error state display', () => {
    it('should display error message when error prop is provided', () => {
      const errorMessage = 'Failed to load activity events';
      
      render(
        <ActivityLogTable
          {...defaultProps}
          error={errorMessage}
        />
      );

      expect(screen.getByText(errorMessage)).toBeTruthy();
    });

    it('should display error but still render table when events are present', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          error="Something went wrong"
        />
      );

      // Error should be displayed
      expect(screen.getByText("Something went wrong")).toBeTruthy();
      
      // Table should still be rendered since events are present
      const table = container.querySelector('.activity-event-table');
      expect(table).toBeTruthy();
    });

    it('should display error even when events are present', () => {
      const errorMessage = 'Partial load failure';
      
      render(
        <ActivityLogTable
          {...defaultProps}
          error={errorMessage}
        />
      );

      expect(screen.getByText(errorMessage)).toBeTruthy();
    });
  });

  describe('Loading state', () => {
    it('should show loading message when loading with no events', () => {
      render(
        <ActivityLogTable
          {...defaultProps}
          events={[]}
          loading={true}
        />
      );

      expect(screen.getByText(/loading recent activity/i)).toBeTruthy();
    });

    it('should still render events when loading with existing events', () => {
      render(
        <ActivityLogTable
          {...defaultProps}
          loading={true}
        />
      );

      // Events should still be visible
      expect(screen.getByText('Created expense for groceries')).toBeTruthy();
    });

    it('should disable Load More button when loading', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          hasMore={true}
          loading={true}
        />
      );

      const button = container.querySelector('.activity-load-more-button');
      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe('Loading...');
    });
  });

  describe('Display limit controls', () => {
    it('should render display limit selector with current value', () => {
      const { container } = render(<ActivityLogTable {...defaultProps} displayLimit={100} />);

      const selector = container.querySelector('#activity-display-limit');
      expect(selector.value).toBe('100');
    });

    it('should call onDisplayLimitChange when limit is changed', () => {
      const onDisplayLimitChange = vi.fn();
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          onDisplayLimitChange={onDisplayLimitChange}
        />
      );

      const selector = container.querySelector('#activity-display-limit');
      fireEvent.change(selector, { target: { value: '100' } });

      expect(onDisplayLimitChange).toHaveBeenCalledWith(100);
    });

    it('should disable display limit selector when loading', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          loading={true}
        />
      );

      const selector = container.querySelector('#activity-display-limit');
      expect(selector.disabled).toBe(true);
    });

    it('should have all expected limit options', () => {
      const { container } = render(<ActivityLogTable {...defaultProps} />);

      const options = container.querySelectorAll('#activity-display-limit option');
      expect(options.length).toBe(4);
      expect(options[0].value).toBe('25');
      expect(options[1].value).toBe('50');
      expect(options[2].value).toBe('100');
      expect(options[3].value).toBe('200');
    });
  });

  describe('Load More functionality', () => {
    it('should render Load More button when hasMore is true', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          hasMore={true}
        />
      );

      const button = container.querySelector('.activity-load-more-button');
      expect(button).toBeTruthy();
      expect(button.textContent).toBe('Load More');
    });

    it('should not render Load More button when hasMore is false', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          hasMore={false}
        />
      );

      const button = container.querySelector('.activity-load-more-button');
      expect(button).toBeFalsy();
    });

    it('should call onLoadMore when Load More button is clicked', () => {
      const onLoadMore = vi.fn();
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          hasMore={true}
          onLoadMore={onLoadMore}
        />
      );

      const button = container.querySelector('.activity-load-more-button');
      fireEvent.click(button);

      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('should not render Load More button when events array is empty', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          events={[]}
          hasMore={true}
        />
      );

      const button = container.querySelector('.activity-load-more-button');
      expect(button).toBeFalsy();
    });
  });

  describe('Event count display', () => {
    it('should display event count when events are present', () => {
      render(<ActivityLogTable {...defaultProps} />);

      expect(screen.getByText(/showing 3 of 3 events/i)).toBeTruthy();
    });

    it('should display event count with stats when provided', () => {
      const stats = {
        currentCount: 150,
        retentionDays: 90,
        maxEntries: 10000
      };

      render(
        <ActivityLogTable
          {...defaultProps}
          stats={stats}
        />
      );

      expect(screen.getByText(/showing 3 of 150 events/i)).toBeTruthy();
    });

    it('should not display event count when no events', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          events={[]}
        />
      );

      const eventCount = container.querySelector('.activity-event-count');
      expect(eventCount).toBeFalsy();
    });
  });

  describe('Retention policy information', () => {
    it('should display retention policy when stats are provided', () => {
      const stats = {
        currentCount: 150,
        retentionDays: 90,
        maxEntries: 10000
      };

      render(
        <ActivityLogTable
          {...defaultProps}
          stats={stats}
        />
      );

      expect(screen.getByText(/keeping last 90 days or 10000 events/i)).toBeTruthy();
    });

    it('should not display retention policy when stats are null', () => {
      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          stats={null}
        />
      );

      const retentionInfo = container.querySelector('.activity-retention-info');
      expect(retentionInfo).toBeFalsy();
    });
  });

  describe('Event type extraction', () => {
    it('should correctly extract event type from event_type field', () => {
      const events = [
        { ...mockEvents[0], event_type: 'expense_created' },
        { ...mockEvents[1], event_type: 'fixed_expense_updated' },
        { ...mockEvents[2], event_type: 'payment_method_deleted' }
      ];

      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          events={events}
        />
      );

      const badges = container.querySelectorAll('.activity-event-badge');
      expect(badges[0].textContent).toBe('Created');
      expect(badges[1].textContent).toBe('Updated');
      expect(badges[2].textContent).toBe('Deleted');
    });

    it('should handle event types with underscores in entity name', () => {
      const events = [
        { ...mockEvents[0], event_type: 'fixed_expense_created' }
      ];

      const { container } = render(
        <ActivityLogTable
          {...defaultProps}
          events={events}
        />
      );

      const badge = container.querySelector('.activity-event-badge');
      expect(badge.textContent).toBe('Created');
      
      // Should use fixed_expense color (purple)
      expect(badge.style.backgroundColor).toBe('rgb(156, 39, 176)');
    });
  });

  describe('Accessibility', () => {
    it('should have proper label for display limit selector', () => {
      render(<ActivityLogTable {...defaultProps} />);

      const label = screen.getByText('Show:');
      expect(label).toBeTruthy();
      expect(label.getAttribute('for')).toBe('activity-display-limit');
    });

    it('should have semantic table structure', () => {
      const { container } = render(<ActivityLogTable {...defaultProps} />);

      const table = container.querySelector('.activity-event-table');
      const thead = table.querySelector('thead');
      const tbody = table.querySelector('tbody');

      expect(table).toBeTruthy();
      expect(thead).toBeTruthy();
      expect(tbody).toBeTruthy();
    });
  });
});

describe('ActivityLogTable - Version Upgrade Event Rendering', () => {
  const defaultProps = {
    events: [],
    loading: false,
    error: null,
    displayLimit: 50,
    hasMore: false,
    stats: null,
    onDisplayLimitChange: vi.fn(),
    onLoadMore: vi.fn()
  };

  it('should render version_upgraded event with formatted message from metadata', () => {
    const events = [
      {
        id: 10,
        user_action: 'Application upgraded from v5.9.0 to v5.10.0',
        timestamp: '2025-01-27T10:30:00Z',
        event_type: 'version_upgraded',
        entity_type: 'system',
        entity_id: null,
        metadata: { old_version: '5.9.0', new_version: '5.10.0' }
      }
    ];

    render(<ActivityLogTable {...defaultProps} events={events} />);

    expect(screen.getByText('Upgraded from v5.9.0 to v5.10.0')).toBeTruthy();
  });

  it('should display old and new versions from metadata', () => {
    const events = [
      {
        id: 11,
        user_action: 'Application upgraded from v1.0.0 to v2.0.0',
        timestamp: '2025-02-01T08:00:00Z',
        event_type: 'version_upgraded',
        entity_type: 'system',
        entity_id: null,
        metadata: { old_version: '1.0.0', new_version: '2.0.0' }
      }
    ];

    render(<ActivityLogTable {...defaultProps} events={events} />);

    const detailText = screen.getByText('Upgraded from v1.0.0 to v2.0.0');
    expect(detailText).toBeTruthy();
    // Verify both versions are present in the formatted string
    expect(detailText.textContent).toContain('v1.0.0');
    expect(detailText.textContent).toContain('v2.0.0');
  });

  it('should fall back to user_action when metadata is missing', () => {
    const events = [
      {
        id: 12,
        user_action: 'Application upgraded from v3.0.0 to v3.1.0',
        timestamp: '2025-02-01T08:00:00Z',
        event_type: 'version_upgraded',
        entity_type: 'system',
        entity_id: null,
        metadata: null
      }
    ];

    render(<ActivityLogTable {...defaultProps} events={events} />);

    expect(screen.getByText('Application upgraded from v3.0.0 to v3.1.0')).toBeTruthy();
  });

  it('should fall back to user_action when metadata lacks version fields', () => {
    const events = [
      {
        id: 13,
        user_action: 'Application upgraded from v4.0.0 to v4.1.0',
        timestamp: '2025-02-01T08:00:00Z',
        event_type: 'version_upgraded',
        entity_type: 'system',
        entity_id: null,
        metadata: { some_other_field: 'value' }
      }
    ];

    render(<ActivityLogTable {...defaultProps} events={events} />);

    expect(screen.getByText('Application upgraded from v4.0.0 to v4.1.0')).toBeTruthy();
  });

  it('should use system event styling (same color as backup events)', () => {
    const events = [
      {
        id: 14,
        user_action: 'Application upgraded from v5.9.0 to v5.10.0',
        timestamp: '2025-01-27T10:30:00Z',
        event_type: 'version_upgraded',
        entity_type: 'system',
        entity_id: null,
        metadata: { old_version: '5.9.0', new_version: '5.10.0' }
      }
    ];

    const { container } = render(<ActivityLogTable {...defaultProps} events={events} />);

    const badge = container.querySelector('.activity-event-badge');
    // version entity type should use #607D8B (same as backup)
    expect(badge.style.backgroundColor).toBe('rgb(96, 125, 139)');
  });

  it('should show "Upgraded" as the event type badge label', () => {
    const events = [
      {
        id: 15,
        user_action: 'Application upgraded from v5.9.0 to v5.10.0',
        timestamp: '2025-01-27T10:30:00Z',
        event_type: 'version_upgraded',
        entity_type: 'system',
        entity_id: null,
        metadata: { old_version: '5.9.0', new_version: '5.10.0' }
      }
    ];

    const { container } = render(<ActivityLogTable {...defaultProps} events={events} />);

    const badge = container.querySelector('.activity-event-badge');
    expect(badge.textContent).toBe('Upgraded');
  });

  it('should handle metadata as a JSON string gracefully', () => {
    const events = [
      {
        id: 16,
        user_action: 'Application upgraded from v5.9.0 to v5.10.0',
        timestamp: '2025-01-27T10:30:00Z',
        event_type: 'version_upgraded',
        entity_type: 'system',
        entity_id: null,
        metadata: JSON.stringify({ old_version: '5.9.0', new_version: '5.10.0' })
      }
    ];

    render(<ActivityLogTable {...defaultProps} events={events} />);

    expect(screen.getByText('Upgraded from v5.9.0 to v5.10.0')).toBeTruthy();
  });
});
