/**
 * @module test-utils/componentMocks
 * @description
 * Mocked React components for testing purposes.
 * These mocks provide simplified versions of complex components that work reliably
 * in the jsdom test environment, avoiding issues with CSS-based visibility,
 * animations, and other browser-specific behaviors.
 *
 * @example <caption>Using MockCollapsibleSection in tests</caption>
 * import { MockCollapsibleSection } from '../test-utils';
 *
 * vi.mock('./CollapsibleSection', () => ({
 *   default: MockCollapsibleSection
 * }));
 *
 * it('should render section content', () => {
 *   render(
 *     <MockCollapsibleSection title="Test" isExpanded={false} onToggle={vi.fn()}>
 *       <div>Content</div>
 *     </MockCollapsibleSection>
 *   );
 *   expect(screen.getByText('Content')).toBeInTheDocument();
 * });
 */

import React from 'react';

/**
 * MockCollapsibleSection - Simplified mock of CollapsibleSection component
 *
 * This mock provides a testing-friendly version of CollapsibleSection that:
 * - Always renders children regardless of isExpanded state (jsdom workaround)
 * - Maintains the same prop interface as the real component
 * - Includes data-testid attributes for easy querying
 * - Preserves accessibility attributes (aria-expanded, role, etc.)
 *
 * **Why this mock exists:**
 * The real CollapsibleSection uses CSS display properties to show/hide content
 * based on the isExpanded state. In jsdom, CSS is not fully evaluated, so
 * visibility checks fail. This mock always renders children, allowing tests to
 * focus on user-facing behavior (field values, validation, submission) rather
 * than implementation details (section expansion mechanics).
 *
 * **When to use:**
 * - Integration tests that need to interact with fields inside collapsible sections
 * - Tests that verify conditional field display based on form state
 * - Tests that verify form submission with data from multiple sections
 *
 * **When NOT to use:**
 * - Unit tests specifically testing CollapsibleSection behavior (use real component)
 * - E2E tests in real browsers (use real component)
 *
 * @param {Object} props - Component props
 * @param {string} props.title - Section title displayed in header
 * @param {boolean} props.isExpanded - Whether section is expanded (preserved for aria-expanded)
 * @param {Function} props.onToggle - Callback when header is clicked
 * @param {string|number} [props.badge] - Optional badge content (count, status, etc.)
 * @param {boolean} [props.hasError] - Whether section contains validation errors
 * @param {React.ReactNode} props.children - Section content (always rendered in mock)
 * @param {string} [props.helpText] - Optional help text shown in header
 * @param {string} [props.className] - Optional CSS class name
 *
 * @example <caption>Basic usage</caption>
 * <MockCollapsibleSection
 *   title="Advanced Options"
 *   isExpanded={true}
 *   onToggle={() => {}}
 * >
 *   <input type="text" />
 * </MockCollapsibleSection>
 *
 * @example <caption>With badge and error indicator</caption>
 * <MockCollapsibleSection
 *   title="People"
 *   isExpanded={false}
 *   onToggle={() => {}}
 *   badge="3"
 *   hasError={true}
 * >
 *   <div>People assignment fields</div>
 * </MockCollapsibleSection>
 *
 * @example <caption>Querying in tests</caption>
 * const section = screen.getByTestId('collapsible-section-advanced-options');
 * const header = screen.getByTestId('collapsible-header-advanced-options');
 * const content = screen.getByTestId('collapsible-content-advanced-options');
 */
export const MockCollapsibleSection = ({
  title,
  isExpanded,
  onToggle,
  badge,
  hasError,
  children,
  helpText,
  className = ''
}) => {
  // Generate consistent IDs for testid attributes
  const sectionId = title.replace(/\s+/g, '-').toLowerCase();
  const headerId = `collapsible-header-${sectionId}`;
  const contentId = `collapsible-content-${sectionId}`;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      className={`collapsible-section ${className}`}
      data-testid={`collapsible-section-${sectionId}`}
    >
      <div
        id={headerId}
        className="collapsible-header"
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        data-testid={`collapsible-header-${sectionId}`}
      >
        <div className="collapsible-header-left">
          <span className={`collapsible-icon ${isExpanded ? 'expanded' : 'collapsed'}`}>
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="collapsible-title">{title}</span>
          {badge && (
            <span className="collapsible-badge" data-testid="section-badge">
              {badge}
            </span>
          )}
          {hasError && (
            <span
              className="collapsible-error-indicator"
              title="Contains errors"
              data-testid="section-error-indicator"
            >
              ⚠
            </span>
          )}
        </div>
        {helpText && (
          <span
            className="collapsible-help-icon"
            title={helpText}
            data-testid="section-help-icon"
          >
            ⓘ
          </span>
        )}
      </div>
      {/* 
        CRITICAL: Always render children in tests, regardless of isExpanded state.
        This is a jsdom workaround - CSS display properties don't work reliably in jsdom,
        so we can't test visibility through CSS. Instead, we always render children and
        preserve the aria-expanded attribute for accessibility testing.
      */}
      <div
        id={contentId}
        className="collapsible-content"
        role="region"
        aria-labelledby={headerId}
        data-testid={`collapsible-content-${sectionId}`}
      >
        {children}
      </div>
    </div>
  );
};
