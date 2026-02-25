/**
 * Property-Based Tests for UpdateBanner Component
 *
 * @invariant Banner Renders with Version: For any non-empty version string when show is true,
 * the rendered output contains that version string and is visible with role="alert".
 * When show is false, nothing renders regardless of version.
 * Randomization adds value because version strings can contain special characters,
 * varying lengths, and edge-case patterns that fixed examples would miss.
 *
 * Feature: container-update-refresh, Property 6: Banner Renders with Version
 * Validates: Requirements 3.1, 3.5
 */

import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import fc from 'fast-check';
import UpdateBanner from './UpdateBanner';

describe('UpdateBanner - Property-Based Tests', () => {
  // Feature: container-update-refresh, Property 6: Banner Renders with Version
  // For any non-empty version string when show is true, rendered output contains
  // that version string and is visible as a fixed-position element.
  test('Property 6: Banner renders with any non-empty version string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (version) => {
          const { unmount } = render(
            <UpdateBanner
              show={true}
              version={version}
              onRefresh={vi.fn()}
              onDismiss={vi.fn()}
            />
          );

          const banner = screen.getByTestId('update-banner');

          // Banner is rendered and contains the version string
          expect(banner).toBeInTheDocument();
          expect(banner.textContent).toContain(version);

          // Banner has role="alert" for accessibility
          expect(banner).toHaveAttribute('role', 'alert');

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 6: Banner renders nothing when show is false regardless of version', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (version) => {
          const { container, unmount } = render(
            <UpdateBanner
              show={false}
              version={version}
              onRefresh={vi.fn()}
              onDismiss={vi.fn()}
            />
          );

          expect(container.firstChild).toBeNull();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
