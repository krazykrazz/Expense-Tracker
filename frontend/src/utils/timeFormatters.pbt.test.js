/**
 * @invariant Relative Time Formatting: For any valid ISO timestamp, the formatted relative time is deterministic and follows the defined pattern (Just now, X minutes ago, X hours ago, Yesterday, X days ago, or full date). Randomization covers diverse timestamp offsets.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatRelativeTime } from './timeFormatters';

describe('formatRelativeTime - Property-Based Tests', () => {
  /**
   * Property 4: Relative Time Formatting
   * Feature: settings-system-split, Property 4: Relative Time Formatting
   * 
   * For any valid ISO timestamp, the formatted relative time should be deterministic
   * and follow the pattern: "Just now" (< 1 min), "X minutes ago" (< 1 hour),
   * "X hours ago" (< 24 hours), "Yesterday at HH:MM" (yesterday), "X days ago" (< 7 days),
   * or full date/time (≥ 7 days).
   * 
   * Validates: Requirements 4.2
   */
  it('Property 4: should format timestamps deterministically based on time difference', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }), // milliseconds in past year
        (msAgo) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - msAgo);
          const isoTimestamp = timestamp.toISOString();

          const result = formatRelativeTime(isoTimestamp);

          // Calculate expected pattern based on time difference
          const diffSeconds = Math.floor(msAgo / 1000);
          const diffMinutes = Math.floor(diffSeconds / 60);
          const diffHours = Math.floor(diffMinutes / 60);
          const diffDays = Math.floor(diffHours / 24);

          if (diffMinutes < 1) {
            expect(result).toBe('Just now');
          } else if (diffHours < 1) {
            expect(result).toMatch(/^\d+ minutes? ago$/);
          } else if (diffDays < 1) {
            expect(result).toMatch(/^\d+ hours? ago$/);
          } else if (diffDays === 1) {
            expect(result).toMatch(/^Yesterday at \d{1,2}:\d{2} (AM|PM)$/);
          } else if (diffDays < 7) {
            expect(result).toMatch(/^\d+ days? ago$/);
          } else {
            // Full date format: "Jan 15 at 3:45 PM"
            expect(result).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} at \d{1,2}:\d{2} (AM|PM)$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4: should be deterministic for the same timestamp', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date() }).filter(d => !isNaN(d.getTime())),
        (date) => {
          const isoTimestamp = date.toISOString();
          
          // Call multiple times
          const result1 = formatRelativeTime(isoTimestamp);
          const result2 = formatRelativeTime(isoTimestamp);
          const result3 = formatRelativeTime(isoTimestamp);

          // Should always return the same result (within same second)
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4: should handle future dates gracefully', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }), // milliseconds in future year
        (msInFuture) => {
          const now = new Date();
          const futureDate = new Date(now.getTime() + msInFuture);
          const isoTimestamp = futureDate.toISOString();

          const result = formatRelativeTime(isoTimestamp);

          // Should indicate future date
          expect(result).toBe('In the future');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4: should handle invalid dates gracefully', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('invalid-date'),
          fc.constant(''),
          fc.constant('not-a-timestamp'),
          fc.constant('2024-13-45T99:99:99Z') // Invalid date components
        ),
        (invalidTimestamp) => {
          const result = formatRelativeTime(invalidTimestamp);

          // Should return error message, not throw
          expect(result).toBe('Invalid date');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 4: should format "Just now" for very recent timestamps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 59 * 1000 }), // 0-59 seconds ago
        (msAgo) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - msAgo);
          const isoTimestamp = timestamp.toISOString();

          const result = formatRelativeTime(isoTimestamp);

          expect(result).toBe('Just now');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4: should format minutes correctly for 1-59 minutes ago', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 59 }), // 1-59 minutes
        (minutes) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - minutes * 60 * 1000);
          const isoTimestamp = timestamp.toISOString();

          const result = formatRelativeTime(isoTimestamp);

          // Should match "X minute(s) ago"
          const expectedSingular = `${minutes} minute ago`;
          const expectedPlural = `${minutes} minutes ago`;
          
          if (minutes === 1) {
            expect(result).toBe(expectedSingular);
          } else {
            expect(result).toBe(expectedPlural);
          }
        }
      ),
      { numRuns: 59 }
    );
  });

  it('Property 4: should format hours correctly for 1-23 hours ago', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 23 }), // 1-23 hours
        (hours) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - hours * 60 * 60 * 1000);
          const isoTimestamp = timestamp.toISOString();

          const result = formatRelativeTime(isoTimestamp);

          // Should match "X hour(s) ago"
          const expectedSingular = `${hours} hour ago`;
          const expectedPlural = `${hours} hours ago`;
          
          if (hours === 1) {
            expect(result).toBe(expectedSingular);
          } else {
            expect(result).toBe(expectedPlural);
          }
        }
      ),
      { numRuns: 23 }
    );
  });

  it('Property 4: should format days correctly for 2-6 days ago', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }), // 2-6 days
        (days) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          const isoTimestamp = timestamp.toISOString();

          const result = formatRelativeTime(isoTimestamp);

          // Should match "X days ago"
          expect(result).toBe(`${days} days ago`);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 4: should format yesterday with time', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const isoTimestamp = yesterday.toISOString();

    const result = formatRelativeTime(isoTimestamp);

    // Should match "Yesterday at HH:MM AM/PM"
    expect(result).toMatch(/^Yesterday at \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('Property 4: should format dates 7+ days ago with full date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 7, max: 365 }), // 7-365 days
        (days) => {
          const now = new Date();
          const timestamp = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          const isoTimestamp = timestamp.toISOString();

          const result = formatRelativeTime(isoTimestamp);

          // Should match "Mon DD at HH:MM AM/PM"
          expect(result).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} at \d{1,2}:\d{2} (AM|PM)$/);
        }
      ),
      { numRuns: 100 }
    );
  });
});
