import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import CollapsibleSection from './CollapsibleSection';

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

describe('ExpenseForm Section Header Structure - Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * **Feature: expense-form-simplification, Property 18: Section header structure**
   *
   * For any collapsible section, the section header should contain an expand/collapse icon
   * that changes based on the expansion state (chevron-right when collapsed, chevron-down
   * when expanded).
   * **Validates: Requirements 9.3, 12.2, 12.5**
   */
  it('Property 18: section header icon reflects expansion state', () => {
    // Arbitrary for section props - use alphanumeric titles to avoid invalid CSS selectors
    const sectionTitleArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,49}$/)
      .filter(s => s.trim().length > 0);

    const sectionPropsArb = fc.record({
      title: sectionTitleArb,
      isExpanded: fc.boolean(),
      badge: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
      hasError: fc.option(fc.boolean(), { nil: false }),
    });

    fc.assert(
      fc.property(sectionPropsArb, (props) => {
        const onToggle = vi.fn();
        const { container, unmount } = render(
          <CollapsibleSection
            title={props.title}
            isExpanded={props.isExpanded}
            onToggle={onToggle}
            badge={props.badge}
            hasError={props.hasError}
          >
            <div>Content</div>
          </CollapsibleSection>
        );

        const header = container.querySelector('.collapsible-header');
        expect(header).toBeTruthy();

        // Header must have aria-expanded matching isExpanded
        expect(header.getAttribute('aria-expanded')).toBe(String(props.isExpanded));

        // Icon must reflect expansion state
        const icon = container.querySelector('.collapsible-icon');
        expect(icon).toBeTruthy();

        if (props.isExpanded) {
          expect(icon.classList.contains('expanded')).toBe(true);
          expect(icon.textContent).toBe('▼'); // chevron-down
        } else {
          expect(icon.classList.contains('collapsed')).toBe(true);
          expect(icon.textContent).toBe('▶'); // chevron-right
        }

        // Title must be present
        const titleEl = container.querySelector('.collapsible-title');
        expect(titleEl).toBeTruthy();
        expect(titleEl.textContent).toBe(props.title);

        // Badge should be present only when provided
        const badgeEl = container.querySelector('.collapsible-badge');
        if (props.badge) {
          expect(badgeEl).toBeTruthy();
          expect(badgeEl.textContent).toBe(props.badge);
        } else {
          expect(badgeEl).toBeFalsy();
        }

        // Error indicator should be present only when hasError is true
        const errorEl = container.querySelector('.collapsible-error-indicator');
        if (props.hasError) {
          expect(errorEl).toBeTruthy();
        } else {
          expect(errorEl).toBeFalsy();
        }

        // Content should only render when expanded
        const content = container.querySelector('.collapsible-content');
        if (props.isExpanded) {
          expect(content).toBeTruthy();
        } else {
          expect(content).toBeFalsy();
        }

        // Consistent iconography: aria-controls must link to content id
        const controlsId = header.getAttribute('aria-controls');
        expect(controlsId).toBeTruthy();
        if (props.isExpanded) {
          const contentById = container.querySelector(`#${controlsId}`);
          expect(contentById).toBeTruthy();
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
