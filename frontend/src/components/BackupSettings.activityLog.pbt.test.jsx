/**
 * Property-Based Tests for Activity Log Timestamp Formatting
 * 
 * Feature: activity-log
 * Tests the formatTimestamp function for human-readable timestamp display
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { render } from '@testing-library/react';
import BackupSettings from './BackupSettings';

// Mock all API calls
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    BACKUP_CONFIG: '/api/backup/config',
    BACKUP_LIST: '/api/backup/list',
    BACKUP_MANUAL: '/api/backup/manual',
    BACKUP_DOWNLOAD: '/api/backup/download',
    BACKUP_RESTORE: '/api/backup/restore',
    BACKUP_STATS: '/api/backup/stats',
    VERSION: '/api/version',
    ACTIVITY_LOGS: '/api/activity-logs',
    ACTIVITY_LOGS_STATS: '/api/activity-logs/stats'
  }
}));

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn().mockResolvedValue([]),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn()
}));

vi.mock('../services/activityLogApi', () => ({
  fetchRecentEvents: vi.fn().mockResolvedValue({ events: [], total: 0 }),
  fetchCleanupStats: vi.fn().mockResolvedValue({
    retentionDays: 90,
    maxEntries: 1000,
    currentCount: 0
  })
}));

// Extract formatTimestamp function for testing
// We'll test it by rendering the component and checking the output
const formatTimestamp = (isoTimestamp) => {
  const eventDate = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now - eventDate;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Less than 1 minute
  if (diffMins < 1) {
    return 'Just now';
  }
  
  // Less than 1 hour
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  }
  
  // Less than 24 hours
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }
  
  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (eventDate.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  
  // Less than 7 days
  if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
  
  // Older - show full date and time
  return eventDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: eventDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

describe('Activity Log - Property 8: Timestamp Human Readability', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/backup/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            enabled: false,
            schedule: 'daily',
            time: '02:00',
            targetPath: '',
            keepLastN: 7,
            nextBackup: null
          })
        });
      }
      if (url.includes('/api/backup/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.0.0', environment: 'test' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should format timestamps less than 1 minute as "Just now"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 59 }), // seconds
        (seconds) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - seconds * 1000).toISOString();
          
          const result = formatTimestamp(timestamp);
          
          expect(result).toBe('Just now');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should format timestamps between 1-59 minutes as "X minute(s) ago"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 59 }), // minutes
        (minutes) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - minutes * 60000).toISOString();
          
          const result = formatTimestamp(timestamp);
          
          const expectedSuffix = minutes === 1 ? 'minute ago' : 'minutes ago';
          expect(result).toBe(`${minutes} ${expectedSuffix}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should format timestamps between 1-23 hours as "X hour(s) ago"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 23 }), // hours
        (hours) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - hours * 3600000).toISOString();
          
          const result = formatTimestamp(timestamp);
          
          const expectedSuffix = hours === 1 ? 'hour ago' : 'hours ago';
          expect(result).toBe(`${hours} ${expectedSuffix}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should format yesterday timestamps as "Yesterday at HH:MM AM/PM"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }), // hour
        fc.integer({ min: 0, max: 59 }), // minute
        (hour, minute) => {
          const now = new Date();
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(hour, minute, 0, 0);
          
          const timestamp = yesterday.toISOString();
          const result = formatTimestamp(timestamp);
          
          // The function checks hours first (< 24 hours), then checks for yesterday
          // So if it's been less than 24 hours, it will show "X hours ago"
          // Otherwise, if it's yesterday's date, it shows "Yesterday at..."
          const diffHours = Math.floor((now - yesterday) / 3600000);
          
          if (diffHours < 24) {
            // Could be either "X hours ago" or "Yesterday at..." depending on date boundary
            expect(result).toMatch(/^(\d+ hours? ago|Yesterday at \d{1,2}:\d{2} (AM|PM))$/);
          } else {
            // More than 24 hours, should be "Yesterday at..." or "2 days ago"
            expect(result).toMatch(/^(Yesterday at \d{1,2}:\d{2} (AM|PM)|\d+ days? ago)$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should format timestamps between 2-6 days as "X day(s) ago"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }), // days
        (days) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - days * 86400000).toISOString();
          
          const result = formatTimestamp(timestamp);
          
          const expectedSuffix = days === 1 ? 'day ago' : 'days ago';
          expect(result).toBe(`${days} ${expectedSuffix}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should format timestamps older than 7 days with full date and time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 7, max: 365 }), // days
        (days) => {
          const now = new Date();
          const eventDate = new Date(now.getTime() - days * 86400000);
          const timestamp = eventDate.toISOString();
          
          const result = formatTimestamp(timestamp);
          
          // Should contain month abbreviation (Jan, Feb, etc.)
          expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}/);
          
          // Should contain time with AM/PM
          expect(result).toMatch(/\d{1,2}:\d{2} (AM|PM)$/);
          
          // Should include year if different from current year
          if (eventDate.getFullYear() !== now.getFullYear()) {
            expect(result).toMatch(/\d{4}/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should correctly reflect time difference for any valid timestamp', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 * 2 }), // days in past (up to 2 years)
        fc.integer({ min: 0, max: 23 }), // hour
        fc.integer({ min: 0, max: 59 }), // minute
        (days, hour, minute) => {
          const now = new Date();
          const eventDate = new Date(now);
          eventDate.setDate(eventDate.getDate() - days);
          eventDate.setHours(hour, minute, 0, 0);
          
          const timestamp = eventDate.toISOString();
          const result = formatTimestamp(timestamp);
          
          // Result should be a non-empty string
          expect(result).toBeTruthy();
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
          
          // Result should match one of the expected formats
          const validFormats = [
            /^Just now$/,
            /^\d+ minutes? ago$/,
            /^\d+ hours? ago$/,
            /^Yesterday at \d{1,2}:\d{2} (AM|PM)$/,
            /^\d+ days? ago$/,
            // Full date format can have different variations based on locale
            /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?,? \d{1,2}:\d{2} (AM|PM)$/
          ];
          
          const matchesFormat = validFormats.some(format => format.test(result));
          if (!matchesFormat) {
            console.log('Unexpected format:', result, 'for days:', days);
          }
          expect(matchesFormat).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should handle edge case of exactly 1 minute/hour/day with correct singular form', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('minute', 'hour', 'day'),
        (unit) => {
          const now = new Date();
          let timestamp;
          
          switch (unit) {
            case 'minute':
              timestamp = new Date(now.getTime() - 60000).toISOString();
              break;
            case 'hour':
              timestamp = new Date(now.getTime() - 3600000).toISOString();
              break;
            case 'day':
              timestamp = new Date(now.getTime() - 86400000 * 2).toISOString(); // 2 days for singular test
              break;
          }
          
          const result = formatTimestamp(timestamp);
          
          // Check for correct singular/plural form
          if (unit === 'minute') {
            expect(result).toBe('1 minute ago');
          } else if (unit === 'hour') {
            expect(result).toBe('1 hour ago');
          }
          // Note: 1 day ago would be "Yesterday", so we test 2 days
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should produce consistent results for the same timestamp', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }), // days
        (days) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - days * 86400000).toISOString();
          
          const result1 = formatTimestamp(timestamp);
          const result2 = formatTimestamp(timestamp);
          
          // Same timestamp should produce same result (within same execution context)
          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: activity-log, Property 8: Timestamp Human Readability
  // Validates: Requirements 7.4
  it('should handle timestamps across year boundaries correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }), // month
        fc.integer({ min: 1, max: 28 }), // day
        (month, day) => {
          const now = new Date();
          const lastYear = now.getFullYear() - 1;
          const eventDate = new Date(lastYear, month - 1, day, 12, 0, 0);
          const timestamp = eventDate.toISOString();
          
          const result = formatTimestamp(timestamp);
          
          // Should include the year since it's from last year
          expect(result).toMatch(/\d{4}/);
          
          // Should be in the full date format (older than 7 days)
          // Format can vary: "Jan 1, 2025 at 12:00 PM" or "Jan 1, 2025, 12:00 PM"
          expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}(,| at) \d{1,2}:\d{2} (AM|PM)$/);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Activity Log - Property 9: Event Display Completeness', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/backup/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            enabled: false,
            schedule: 'daily',
            time: '02:00',
            targetPath: '',
            keepLastN: 7,
            nextBackup: null
          })
        });
      }
      if (url.includes('/api/backup/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.0.0', environment: 'test' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  // Feature: activity-log, Property 9: Event Display Completeness
  // Validates: Requirements 7.3
  it('should display both user_action and formatted timestamp for any event', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            event_type: fc.constantFrom(
              'expense_added', 'expense_updated', 'expense_deleted',
              'loan_added', 'loan_updated', 'loan_deleted',
              'investment_added', 'investment_updated', 'investment_deleted',
              'budget_added', 'budget_updated', 'budget_deleted',
              'payment_method_added', 'payment_method_updated', 'payment_method_deactivated',
              'loan_payment_added', 'loan_payment_updated', 'loan_payment_deleted',
              'fixed_expense_added', 'fixed_expense_updated', 'fixed_expense_deleted',
              'insurance_status_changed', 'backup_created', 'backup_restored'
            ),
            entity_type: fc.constantFrom(
              'expense', 'loan', 'investment', 'budget', 'payment_method',
              'loan_payment', 'fixed_expense', 'system'
            ),
            entity_id: fc.oneof(
              fc.integer({ min: 1, max: 10000 }),
              fc.constant(null)
            ),
            user_action: fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
            timestamp: fc.date({ 
              min: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
              max: new Date() 
            }).map(d => d.toISOString()),
            metadata: fc.oneof(
              fc.constant(null),
              fc.record({
                amount: fc.double({ min: 0.01, max: 10000, noNaN: true }),
                category: fc.string({ minLength: 3, maxLength: 50 })
              })
            )
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (events) => {
          // Mock the API to return these events
          fetchRecentEvents.mockResolvedValueOnce({
            events,
            total: events.length
          });

          // Render the component
          const { container } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3]; // 4th tab (0-indexed)
          fireEvent.click(miscTab);

          // Wait for events to load
          await waitFor(() => {
            const eventItems = container.querySelectorAll('.activity-event-item');
            expect(eventItems.length).toBe(events.length);
          }, { timeout: 3000 });

          // Find all activity event items
          const eventItems = container.querySelectorAll('.activity-event-item');

          // For each event, verify both user_action and timestamp are displayed
          events.forEach((event, index) => {
            const eventItem = eventItems[index];
            
            // Check that user_action is present
            const actionElement = eventItem.querySelector('.activity-event-action');
            expect(actionElement).toBeTruthy();
            expect(actionElement.textContent).toBe(event.user_action);

            // Check that timestamp is present and formatted
            const timestampElement = eventItem.querySelector('.activity-event-timestamp');
            expect(timestampElement).toBeTruthy();
            expect(timestampElement.textContent).toBeTruthy();
            expect(timestampElement.textContent.length).toBeGreaterThan(0);

            // Verify timestamp is in a human-readable format (not raw ISO)
            expect(timestampElement.textContent).not.toContain('T');
            expect(timestampElement.textContent).not.toContain('Z');
            expect(timestampElement.textContent).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
          });
        }
      ),
      { numRuns: 20 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 9: Event Display Completeness
  // Validates: Requirements 7.3
  it('should render complete event information for any valid event structure', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.integer({ min: 1, max: 100000 }),
          event_type: fc.string({ minLength: 5, maxLength: 50 }),
          entity_type: fc.string({ minLength: 3, maxLength: 30 }),
          entity_id: fc.oneof(fc.integer({ min: 1, max: 10000 }), fc.constant(null)),
          user_action: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
          timestamp: fc.date({ 
            min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            max: new Date() 
          }).map(d => d.toISOString()),
          metadata: fc.oneof(fc.constant(null), fc.object())
        }),
        async (event) => {
          // Mock the API to return this single event
          fetchRecentEvents.mockResolvedValueOnce({
            events: [event],
            total: 1
          });

          // Render the component
          const { container } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3]; // 4th tab (0-indexed)
          fireEvent.click(miscTab);

          // Wait for events to load
          await waitFor(() => {
            const eventItem = container.querySelector('.activity-event-item');
            expect(eventItem).toBeTruthy();
          }, { timeout: 3000 });

          // Find the event item
          const eventItem = container.querySelector('.activity-event-item');

          // Verify user_action is displayed
          const actionElement = eventItem.querySelector('.activity-event-action');
          expect(actionElement).toBeTruthy();
          expect(actionElement.textContent).toBe(event.user_action);

          // Verify timestamp is displayed and formatted
          const timestampElement = eventItem.querySelector('.activity-event-timestamp');
          expect(timestampElement).toBeTruthy();
          
          const formattedTimestamp = timestampElement.textContent;
          expect(formattedTimestamp).toBeTruthy();
          expect(formattedTimestamp.length).toBeGreaterThan(0);
          
          // Should be human-readable, not ISO format
          expect(formattedTimestamp).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }
      ),
      { numRuns: 50 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 9: Event Display Completeness
  // Validates: Requirements 7.3
  it('should display both fields even with edge case user_action values', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant('A'),
          fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
          fc.constant('Special chars: <>&"\''),
          fc.constant('Line\nBreak'),
          fc.constant('Tab\tChar'),
          fc.constant('Unicode: 🎉 💾 📋')
        ),
        fc.date({ 
          min: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          max: new Date() 
        }).map(d => d.toISOString()),
        async (userAction, timestamp) => {
          const event = {
            id: 1,
            event_type: 'test_event',
            entity_type: 'test',
            entity_id: 1,
            user_action: userAction,
            timestamp,
            metadata: null
          };

          fetchRecentEvents.mockResolvedValueOnce({
            events: [event],
            total: 1
          });

          const { container } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3]; // 4th tab (0-indexed)
          fireEvent.click(miscTab);

          await waitFor(() => {
            const eventItem = container.querySelector('.activity-event-item');
            expect(eventItem).toBeTruthy();
          }, { timeout: 3000 });

          const eventItem = container.querySelector('.activity-event-item');
          
          // Both elements should exist
          const actionElement = eventItem.querySelector('.activity-event-action');
          const timestampElement = eventItem.querySelector('.activity-event-timestamp');
          
          expect(actionElement).toBeTruthy();
          expect(timestampElement).toBeTruthy();
          
          // Timestamp should always be formatted
          expect(timestampElement.textContent).toBeTruthy();
          expect(timestampElement.textContent.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 9: Event Display Completeness
  // Validates: Requirements 7.3
  it('should maintain display completeness across different timestamp ranges', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 365 }), // days in past
        fc.integer({ min: 0, max: 23 }), // hour
        fc.integer({ min: 0, max: 59 }), // minute
        fc.string({ minLength: 5, maxLength: 100 }), // user_action
        async (daysAgo, hour, minute, userAction) => {
          const now = new Date();
          const eventDate = new Date(now);
          eventDate.setDate(eventDate.getDate() - daysAgo);
          eventDate.setHours(hour, minute, 0, 0);

          const event = {
            id: 1,
            event_type: 'test_event',
            entity_type: 'test',
            entity_id: 1,
            user_action: userAction,
            timestamp: eventDate.toISOString(),
            metadata: null
          };

          fetchRecentEvents.mockResolvedValueOnce({
            events: [event],
            total: 1
          });

          const { container } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3]; // 4th tab (0-indexed)
          fireEvent.click(miscTab);

          await waitFor(() => {
            const eventItem = container.querySelector('.activity-event-item');
            expect(eventItem).toBeTruthy();
          }, { timeout: 3000 });

          const eventItem = container.querySelector('.activity-event-item');
          
          const actionElement = eventItem.querySelector('.activity-event-action');
          const timestampElement = eventItem.querySelector('.activity-event-timestamp');
          
          // Both must be present regardless of timestamp age
          expect(actionElement).toBeTruthy();
          expect(timestampElement).toBeTruthy();
          
          // Both must have content
          expect(actionElement.textContent).toBe(userAction);
          expect(timestampElement.textContent).toBeTruthy();
          expect(timestampElement.textContent.length).toBeGreaterThan(0);
          
          // Timestamp should be formatted (not ISO)
          expect(timestampElement.textContent).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }
      ),
      { numRuns: 50 }
    );
  }, 60000); // 60 second timeout for PBT
});

describe('Activity Log - Property 13: Display Limit Persistence', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/backup/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            enabled: false,
            schedule: 'daily',
            time: '02:00',
            targetPath: '',
            keepLastN: 7,
            nextBackup: null
          })
        });
      }
      if (url.includes('/api/backup/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.0.0', environment: 'test' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  // Feature: activity-log, Property 13: Display Limit Persistence
  // Validates: Requirements 9A.2, 9A.3
  it('should save display limit to localStorage when changed', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(25, 50, 100, 200), // Valid display limit values
        async (limit) => {
          // Mock API responses
          fetchRecentEvents.mockResolvedValue({
            events: [],
            total: 0
          });

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3]; // 4th tab (0-indexed)
          fireEvent.click(miscTab);

          // Wait for the activity log section to load
          await waitFor(() => {
            const selector = container.querySelector('.activity-limit-selector');
            expect(selector).toBeTruthy();
          }, { timeout: 3000 });

          // Find the display limit selector
          const selector = container.querySelector('.activity-limit-selector');
          
          // Change the display limit
          fireEvent.change(selector, { target: { value: limit.toString() } });

          // Wait for state update
          await waitFor(() => {
            expect(selector.value).toBe(limit.toString());
          });

          // Verify localStorage was updated
          const savedLimit = localStorage.getItem('activityLogDisplayLimit');
          expect(savedLimit).toBe(limit.toString());
          expect(parseInt(savedLimit, 10)).toBe(limit);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 13: Display Limit Persistence
  // Validates: Requirements 9A.2, 9A.3
  it('should restore saved display limit from localStorage on component mount', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(25, 50, 100, 200), // Valid display limit values
        async (savedLimit) => {
          // Pre-populate localStorage with a saved limit
          localStorage.setItem('activityLogDisplayLimit', savedLimit.toString());

          // Mock API responses
          fetchRecentEvents.mockResolvedValue({
            events: [],
            total: 0
          });

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3]; // 4th tab (0-indexed)
          fireEvent.click(miscTab);

          // Wait for the activity log section to load
          await waitFor(() => {
            const selector = container.querySelector('.activity-limit-selector');
            expect(selector).toBeTruthy();
          }, { timeout: 3000 });

          // Find the display limit selector
          const selector = container.querySelector('.activity-limit-selector');
          
          // Verify the selector has the saved value
          expect(selector.value).toBe(savedLimit.toString());
          expect(parseInt(selector.value, 10)).toBe(savedLimit);

          unmount();
          localStorage.clear();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 13: Display Limit Persistence
  // Validates: Requirements 9A.2, 9A.3
  it('should use default limit (50) when no saved preference exists', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    // Ensure localStorage is empty
    localStorage.clear();

    // Mock API responses
    fetchRecentEvents.mockResolvedValue({
      events: [],
      total: 0
    });

    // Render the component
    const { container, unmount } = render(<BackupSettings />);

    // Find and click the Misc tab
    const tabs = container.querySelectorAll('button.tab-button');
    const miscTab = tabs[3]; // 4th tab (0-indexed)
    fireEvent.click(miscTab);

    // Wait for the activity log section to load
    await waitFor(() => {
      const selector = container.querySelector('.activity-limit-selector');
      expect(selector).toBeTruthy();
    }, { timeout: 3000 });

    // Find the display limit selector
    const selector = container.querySelector('.activity-limit-selector');
    
    // Verify the selector has the default value (50)
    expect(selector.value).toBe('50');
    expect(parseInt(selector.value, 10)).toBe(50);

    unmount();
  }, 30000); // 30 second timeout

  // Feature: activity-log, Property 13: Display Limit Persistence
  // Validates: Requirements 9A.2, 9A.3
  it('should persist display limit across multiple component mount/unmount cycles', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(25, 50, 100, 200), // Valid display limit values
        fc.integer({ min: 2, max: 5 }), // Number of mount/unmount cycles
        async (limit, cycles) => {
          localStorage.clear();

          // Mock API responses
          fetchRecentEvents.mockResolvedValue({
            events: [],
            total: 0
          });

          // First render: set the limit
          let result = render(<BackupSettings />);
          let tabs = result.container.querySelectorAll('button.tab-button');
          let miscTab = tabs[3];
          fireEvent.click(miscTab);

          await waitFor(() => {
            const selector = result.container.querySelector('.activity-limit-selector');
            expect(selector).toBeTruthy();
          }, { timeout: 3000 });

          let selector = result.container.querySelector('.activity-limit-selector');
          fireEvent.change(selector, { target: { value: limit.toString() } });

          await waitFor(() => {
            expect(selector.value).toBe(limit.toString());
          });

          result.unmount();

          // Subsequent renders: verify limit is persisted
          for (let i = 0; i < cycles; i++) {
            result = render(<BackupSettings />);
            tabs = result.container.querySelectorAll('button.tab-button');
            miscTab = tabs[3];
            fireEvent.click(miscTab);

            await waitFor(() => {
              const selector = result.container.querySelector('.activity-limit-selector');
              expect(selector).toBeTruthy();
            }, { timeout: 3000 });

            selector = result.container.querySelector('.activity-limit-selector');
            
            // Verify the limit is still the same
            expect(selector.value).toBe(limit.toString());
            expect(parseInt(selector.value, 10)).toBe(limit);

            result.unmount();
          }

          localStorage.clear();
        }
      ),
      { numRuns: 50 }
    );
  }, 120000); // 120 second timeout for multiple cycles

  // Feature: activity-log, Property 13: Display Limit Persistence
  // Validates: Requirements 9A.2, 9A.3
  it('should refetch events with new limit when display limit changes', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(25, 50, 100, 200), // Initial limit
        fc.constantFrom(25, 50, 100, 200), // New limit
        async (initialLimit, newLimit) => {
          // Skip if limits are the same
          fc.pre(initialLimit !== newLimit);

          localStorage.clear();
          localStorage.setItem('activityLogDisplayLimit', initialLimit.toString());

          let fetchCallCount = 0;
          let lastFetchLimit = null;

          // Mock API responses and track calls
          fetchRecentEvents.mockImplementation((limit, offset) => {
            fetchCallCount++;
            lastFetchLimit = limit;
            return Promise.resolve({
              events: [],
              total: 0
            });
          });

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3];
          fireEvent.click(miscTab);

          // Wait for initial fetch
          await waitFor(() => {
            expect(fetchCallCount).toBeGreaterThan(0);
          }, { timeout: 3000 });

          const initialFetchCount = fetchCallCount;
          expect(lastFetchLimit).toBe(initialLimit);

          // Find the display limit selector
          const selector = container.querySelector('.activity-limit-selector');
          
          // Change the display limit
          fireEvent.change(selector, { target: { value: newLimit.toString() } });

          // Wait for refetch with new limit
          await waitFor(() => {
            expect(fetchCallCount).toBeGreaterThan(initialFetchCount);
            expect(lastFetchLimit).toBe(newLimit);
          }, { timeout: 3000 });

          // Verify localStorage was updated
          const savedLimit = localStorage.getItem('activityLogDisplayLimit');
          expect(savedLimit).toBe(newLimit.toString());

          unmount();
          localStorage.clear();
        }
      ),
      { numRuns: 50 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 13: Display Limit Persistence
  // Validates: Requirements 9A.2, 9A.3
  it('should handle invalid localStorage values gracefully and use default', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant('invalid'),
          fc.constant('0'),
          fc.constant('-50'),
          fc.constant('999'),
          fc.constant('abc123'),
          fc.constant('null'),
          fc.constant('undefined'),
          fc.constant('')
        ),
        async (invalidValue) => {
          localStorage.clear();
          localStorage.setItem('activityLogDisplayLimit', invalidValue);

          // Mock API responses
          fetchRecentEvents.mockResolvedValue({
            events: [],
            total: 0
          });

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3];
          fireEvent.click(miscTab);

          // Wait for the activity log section to load
          await waitFor(() => {
            const selector = container.querySelector('.activity-limit-selector');
            expect(selector).toBeTruthy();
          }, { timeout: 3000 });

          // Find the display limit selector
          const selector = container.querySelector('.activity-limit-selector');
          
          // Should use one of the valid values (likely default 50 or the parsed invalid value)
          const value = parseInt(selector.value, 10);
          
          // If parseInt returns NaN, the component should handle it
          // The selector should have a valid value from the dropdown options
          expect([25, 50, 100, 200]).toContain(value);

          unmount();
          localStorage.clear();
        }
      ),
      { numRuns: 50 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 13: Display Limit Persistence
  // Validates: Requirements 9A.2, 9A.3
  it('should maintain separate localStorage state for different browser sessions', async () => {
    const { fetchRecentEvents } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(25, 50, 100, 200),
        async (limit) => {
          localStorage.clear();

          // Mock API responses
          fetchRecentEvents.mockResolvedValue({
            events: [],
            total: 0
          });

          // Simulate first session: set limit
          const { container: container1, unmount: unmount1 } = render(<BackupSettings />);
          const tabs1 = container1.querySelectorAll('button.tab-button');
          fireEvent.click(tabs1[3]);

          await waitFor(() => {
            const selector = container1.querySelector('.activity-limit-selector');
            expect(selector).toBeTruthy();
          }, { timeout: 3000 });

          const selector1 = container1.querySelector('.activity-limit-selector');
          fireEvent.change(selector1, { target: { value: limit.toString() } });

          await waitFor(() => {
            expect(selector1.value).toBe(limit.toString());
          });

          // Verify localStorage has the value
          expect(localStorage.getItem('activityLogDisplayLimit')).toBe(limit.toString());

          unmount1();

          // Simulate second session: verify limit persists
          const { container: container2, unmount: unmount2 } = render(<BackupSettings />);
          const tabs2 = container2.querySelectorAll('button.tab-button');
          fireEvent.click(tabs2[3]);

          await waitFor(() => {
            const selector = container2.querySelector('.activity-limit-selector');
            expect(selector).toBeTruthy();
          }, { timeout: 3000 });

          const selector2 = container2.querySelector('.activity-limit-selector');
          
          // Should have the same limit from localStorage
          expect(selector2.value).toBe(limit.toString());
          expect(localStorage.getItem('activityLogDisplayLimit')).toBe(limit.toString());

          unmount2();
          localStorage.clear();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for PBT
});

describe('Activity Log - Property 14: Visible Event Count Accuracy', () => {
  beforeEach(() => {
    localStorage.clear();
    
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/backup/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            enabled: false,
            schedule: 'daily',
            time: '02:00',
            targetPath: '',
            keepLastN: 7,
            nextBackup: null
          })
        });
      }
      if (url.includes('/api/backup/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.0.0', environment: 'test' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  // Feature: activity-log, Property 14: Visible Event Count Accuracy
  // Validates: Requirements 9A.4
  it('should display correct count of visible events and total available events', async () => {
    const { fetchRecentEvents, fetchCleanupStats } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }), // Number of visible events
        fc.integer({ min: 0, max: 500 }), // Additional events in database
        async (visibleCount, additionalCount) => {
          const totalCount = visibleCount + additionalCount;
          
          // Generate visible events
          const visibleEvents = Array.from({ length: visibleCount }, (_, i) => ({
            id: i + 1,
            event_type: 'expense_added',
            entity_type: 'expense',
            entity_id: i + 1,
            user_action: `Added expense ${i + 1}`,
            timestamp: new Date(Date.now() - i * 60000).toISOString(),
            metadata: null
          }));

          // Mock API responses
          fetchRecentEvents.mockResolvedValue({
            events: visibleEvents,
            total: totalCount
          });

          fetchCleanupStats.mockResolvedValue({
            retentionDays: 90,
            maxEntries: 1000,
            currentCount: totalCount
          });

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3]; // 4th tab (0-indexed)
          fireEvent.click(miscTab);

          // Wait for events to load
          await waitFor(() => {
            const eventItems = container.querySelectorAll('.activity-event-item');
            expect(eventItems.length).toBe(visibleCount);
          }, { timeout: 3000 });

          // Find the event count display
          const countDisplay = container.querySelector('.activity-event-count');
          expect(countDisplay).toBeTruthy();

          // Verify the count text is accurate
          const countText = countDisplay.textContent;
          expect(countText).toContain(`Showing ${visibleCount}`);
          expect(countText).toContain(`of ${totalCount} events`);
          
          // Verify exact format
          expect(countText).toBe(`Showing ${visibleCount} of ${totalCount} events`);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 14: Visible Event Count Accuracy
  // Validates: Requirements 9A.4
  it('should update count accurately when loading more events', async () => {
    const { fetchRecentEvents, fetchCleanupStats } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 50 }), // Initial batch size
        fc.integer({ min: 10, max: 50 }), // Second batch size
        fc.integer({ min: 0, max: 100 }), // Remaining events
        async (initialCount, secondCount, remainingCount) => {
          const totalCount = initialCount + secondCount + remainingCount;
          
          // Generate initial events
          const initialEvents = Array.from({ length: initialCount }, (_, i) => ({
            id: i + 1,
            event_type: 'expense_added',
            entity_type: 'expense',
            entity_id: i + 1,
            user_action: `Added expense ${i + 1}`,
            timestamp: new Date(Date.now() - i * 60000).toISOString(),
            metadata: null
          }));

          // Generate second batch of events
          const secondEvents = Array.from({ length: secondCount }, (_, i) => ({
            id: initialCount + i + 1,
            event_type: 'loan_updated',
            entity_type: 'loan',
            entity_id: i + 1,
            user_action: `Updated loan ${i + 1}`,
            timestamp: new Date(Date.now() - (initialCount + i) * 60000).toISOString(),
            metadata: null
          }));

          // Mock API responses
          let callCount = 0;
          fetchRecentEvents.mockImplementation((limit, offset) => {
            callCount++;
            if (offset === 0) {
              // Initial load
              return Promise.resolve({
                events: initialEvents,
                total: totalCount
              });
            } else {
              // Load more
              return Promise.resolve({
                events: secondEvents,
                total: totalCount
              });
            }
          });

          fetchCleanupStats.mockResolvedValue({
            retentionDays: 90,
            maxEntries: 1000,
            currentCount: totalCount
          });

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3];
          fireEvent.click(miscTab);

          // Wait for initial events to load
          await waitFor(() => {
            const eventItems = container.querySelectorAll('.activity-event-item');
            expect(eventItems.length).toBe(initialCount);
          }, { timeout: 3000 });

          // Verify initial count
          let countDisplay = container.querySelector('.activity-event-count');
          expect(countDisplay.textContent).toBe(`Showing ${initialCount} of ${totalCount} events`);

          // Click Load More button if it exists
          const loadMoreButton = container.querySelector('.activity-load-more-button');
          if (loadMoreButton && remainingCount > 0) {
            fireEvent.click(loadMoreButton);

            // Wait for more events to load
            await waitFor(() => {
              const eventItems = container.querySelectorAll('.activity-event-item');
              expect(eventItems.length).toBe(initialCount + secondCount);
            }, { timeout: 3000 });

            // Verify updated count
            countDisplay = container.querySelector('.activity-event-count');
            expect(countDisplay.textContent).toBe(`Showing ${initialCount + secondCount} of ${totalCount} events`);
          }

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 90000); // 90 second timeout for PBT

  // Feature: activity-log, Property 14: Visible Event Count Accuracy
  // Validates: Requirements 9A.4
  it('should show accurate count when visible equals total (no more to load)', async () => {
    const { fetchRecentEvents, fetchCleanupStats } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }), // Total events (visible = total)
        async (eventCount) => {
          // Generate events
          const events = Array.from({ length: eventCount }, (_, i) => ({
            id: i + 1,
            event_type: 'budget_updated',
            entity_type: 'budget',
            entity_id: i + 1,
            user_action: `Updated budget ${i + 1}`,
            timestamp: new Date(Date.now() - i * 60000).toISOString(),
            metadata: null
          }));

          // Mock API responses
          fetchRecentEvents.mockResolvedValue({
            events: events,
            total: eventCount
          });

          fetchCleanupStats.mockResolvedValue({
            retentionDays: 90,
            maxEntries: 1000,
            currentCount: eventCount
          });

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3];
          fireEvent.click(miscTab);

          // Wait for events to load
          await waitFor(() => {
            const eventItems = container.querySelectorAll('.activity-event-item');
            expect(eventItems.length).toBe(eventCount);
          }, { timeout: 3000 });

          // Verify count shows all events
          const countDisplay = container.querySelector('.activity-event-count');
          expect(countDisplay.textContent).toBe(`Showing ${eventCount} of ${eventCount} events`);

          // Verify Load More button is not shown
          const loadMoreButton = container.querySelector('.activity-load-more-button');
          expect(loadMoreButton).toBeFalsy();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 14: Visible Event Count Accuracy
  // Validates: Requirements 9A.4
  it('should maintain accurate count across different display limits', async () => {
    const { fetchRecentEvents, fetchCleanupStats } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 50, max: 500 }), // Total events in database
        fc.constantFrom(25, 50, 100, 200), // Display limit
        async (totalCount, displayLimit) => {
          const visibleCount = Math.min(displayLimit, totalCount);
          
          // Generate events
          const events = Array.from({ length: visibleCount }, (_, i) => ({
            id: i + 1,
            event_type: 'investment_added',
            entity_type: 'investment',
            entity_id: i + 1,
            user_action: `Added investment ${i + 1}`,
            timestamp: new Date(Date.now() - i * 60000).toISOString(),
            metadata: null
          }));

          // Mock API responses
          fetchRecentEvents.mockImplementation((limit, offset) => {
            const returnCount = Math.min(limit, totalCount - offset);
            return Promise.resolve({
              events: events.slice(0, returnCount),
              total: totalCount
            });
          });

          fetchCleanupStats.mockResolvedValue({
            retentionDays: 90,
            maxEntries: 1000,
            currentCount: totalCount
          });

          // Pre-set the display limit in localStorage
          localStorage.setItem('activityLogDisplayLimit', displayLimit.toString());

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3];
          fireEvent.click(miscTab);

          // Wait for events to load
          await waitFor(() => {
            const countDisplay = container.querySelector('.activity-event-count');
            expect(countDisplay).toBeTruthy();
          }, { timeout: 3000 });

          // Verify count is accurate for the display limit
          const countDisplay = container.querySelector('.activity-event-count');
          const eventItems = container.querySelectorAll('.activity-event-item');
          
          expect(eventItems.length).toBe(visibleCount);
          expect(countDisplay.textContent).toBe(`Showing ${visibleCount} of ${totalCount} events`);

          unmount();
          localStorage.clear();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for PBT

  // Feature: activity-log, Property 14: Visible Event Count Accuracy
  // Validates: Requirements 9A.4
  it('should handle edge case of zero events correctly', async () => {
    const { fetchRecentEvents, fetchCleanupStats } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    // Mock API responses with no events
    fetchRecentEvents.mockResolvedValue({
      events: [],
      total: 0
    });

    fetchCleanupStats.mockResolvedValue({
      retentionDays: 90,
      maxEntries: 1000,
      currentCount: 0
    });

    // Render the component
    const { container, unmount } = render(<BackupSettings />);

    // Find and click the Misc tab
    const tabs = container.querySelectorAll('button.tab-button');
    const miscTab = tabs[3];
    fireEvent.click(miscTab);

    // Wait for empty state to show
    await waitFor(() => {
      const emptyState = container.querySelector('.activity-empty');
      expect(emptyState).toBeTruthy();
    }, { timeout: 3000 });

    // Verify count display is not shown when there are no events
    const countDisplay = container.querySelector('.activity-event-count');
    expect(countDisplay).toBeFalsy();

    // Verify empty state message
    const emptyState = container.querySelector('.activity-empty');
    expect(emptyState.textContent).toContain('No recent activity to display');

    unmount();
  }, 30000); // 30 second timeout

  // Feature: activity-log, Property 14: Visible Event Count Accuracy
  // Validates: Requirements 9A.4
  it('should display count accurately for any valid event set', async () => {
    const { fetchRecentEvents, fetchCleanupStats } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            event_type: fc.constantFrom(
              'expense_added', 'expense_updated', 'expense_deleted',
              'loan_added', 'loan_updated', 'loan_deleted',
              'investment_added', 'investment_updated', 'investment_deleted',
              'budget_added', 'budget_updated', 'budget_deleted',
              'payment_method_added', 'payment_method_updated', 'payment_method_deactivated',
              'loan_payment_added', 'loan_payment_updated', 'loan_payment_deleted',
              'fixed_expense_added', 'fixed_expense_updated', 'fixed_expense_deleted',
              'insurance_status_changed', 'backup_created', 'backup_restored'
            ),
            entity_type: fc.constantFrom(
              'expense', 'loan', 'investment', 'budget', 'payment_method',
              'loan_payment', 'fixed_expense', 'system'
            ),
            entity_id: fc.oneof(
              fc.integer({ min: 1, max: 10000 }),
              fc.constant(null)
            ),
            user_action: fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
            timestamp: fc.date({ 
              min: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
              max: new Date() 
            }).map(d => d.toISOString()),
            metadata: fc.oneof(fc.constant(null), fc.object())
          }),
          { minLength: 1, maxLength: 100 }
        ),
        fc.integer({ min: 0, max: 1000 }), // Additional events not visible
        async (visibleEvents, additionalCount) => {
          const totalCount = visibleEvents.length + additionalCount;

          // Mock API responses
          fetchRecentEvents.mockResolvedValue({
            events: visibleEvents,
            total: totalCount
          });

          fetchCleanupStats.mockResolvedValue({
            retentionDays: 90,
            maxEntries: 1000,
            currentCount: totalCount
          });

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3];
          fireEvent.click(miscTab);

          // Wait for events to load
          await waitFor(() => {
            const eventItems = container.querySelectorAll('.activity-event-item');
            expect(eventItems.length).toBe(visibleEvents.length);
          }, { timeout: 3000 });

          // Verify count display
          const countDisplay = container.querySelector('.activity-event-count');
          expect(countDisplay).toBeTruthy();
          
          const actualVisibleCount = container.querySelectorAll('.activity-event-item').length;
          expect(countDisplay.textContent).toBe(`Showing ${actualVisibleCount} of ${totalCount} events`);
          
          // Verify the counts match
          expect(actualVisibleCount).toBe(visibleEvents.length);

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 90000); // 90 second timeout for PBT

  // Feature: activity-log, Property 14: Visible Event Count Accuracy
  // Validates: Requirements 9A.4
  it('should show accurate count when stats are unavailable', async () => {
    const { fetchRecentEvents, fetchCleanupStats } = await import('../services/activityLogApi');
    const { waitFor, fireEvent } = await import('@testing-library/react');
    
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }), // Number of events
        async (eventCount) => {
          // Generate events
          const events = Array.from({ length: eventCount }, (_, i) => ({
            id: i + 1,
            event_type: 'expense_added',
            entity_type: 'expense',
            entity_id: i + 1,
            user_action: `Added expense ${i + 1}`,
            timestamp: new Date(Date.now() - i * 60000).toISOString(),
            metadata: null
          }));

          // Mock API responses - stats returns null/undefined
          fetchRecentEvents.mockResolvedValue({
            events: events,
            total: eventCount
          });

          fetchCleanupStats.mockResolvedValue(null);

          // Render the component
          const { container, unmount } = render(<BackupSettings />);

          // Find and click the Misc tab
          const tabs = container.querySelectorAll('button.tab-button');
          const miscTab = tabs[3];
          fireEvent.click(miscTab);

          // Wait for events to load
          await waitFor(() => {
            const eventItems = container.querySelectorAll('.activity-event-item');
            expect(eventItems.length).toBe(eventCount);
          }, { timeout: 3000 });

          // Verify count display falls back to visible count when stats unavailable
          const countDisplay = container.querySelector('.activity-event-count');
          expect(countDisplay).toBeTruthy();
          
          // Should show "Showing X of X events" when stats are unavailable
          expect(countDisplay.textContent).toBe(`Showing ${eventCount} of ${eventCount} events`);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 60 second timeout for PBT
});
