/**
 * Unit tests for MockCollapsibleSection component.
 * **Validates: Requirements 8.1**
 *
 * These tests verify that MockCollapsibleSection provides a reliable testing mock
 * that works in jsdom and maintains the same interface as the real CollapsibleSection.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockCollapsibleSection } from '../componentMocks';

describe('MockCollapsibleSection', () => {
  describe('Children rendering (jsdom workaround)', () => {
    test('renders children when isExpanded is false', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      // CRITICAL: Unlike real CollapsibleSection, mock always renders children
      // This is a jsdom workaround - CSS display properties don't work reliably
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    test('renders children when isExpanded is true', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    test('renders multiple children elements', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>First child</div>
          <div>Second child</div>
          <input type="text" placeholder="Input field" />
        </MockCollapsibleSection>
      );

      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Input field')).toBeInTheDocument();
    });

    test('renders complex nested children', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>
            <label htmlFor="test-input">Test Label</label>
            <input id="test-input" type="text" />
            <button>Submit</button>
          </div>
        </MockCollapsibleSection>
      );

      expect(screen.getByLabelText('Test Label')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });
  });

  describe('Badge display', () => {
    test('displays string badge when provided', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          badge="3 items"
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const badge = screen.getByTestId('section-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('3 items');
      expect(badge).toHaveClass('collapsible-badge');
    });

    test('displays numeric badge when provided', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          badge={5}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const badge = screen.getByTestId('section-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('5');
    });

    test('does not display badge when zero (falsy value)', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          badge={0}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      // Zero is falsy, so badge is not rendered (consistent with real component)
      expect(screen.queryByTestId('section-badge')).not.toBeInTheDocument();
    });

    test('does not display badge when not provided', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.queryByTestId('section-badge')).not.toBeInTheDocument();
    });

    test('does not display badge when undefined', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          badge={undefined}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.queryByTestId('section-badge')).not.toBeInTheDocument();
    });

    test('does not display badge when null', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          badge={null}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.queryByTestId('section-badge')).not.toBeInTheDocument();
    });
  });

  describe('onToggle callback', () => {
    test('calls onToggle when header is clicked', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      await user.click(header);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test('calls onToggle when Enter key is pressed', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      header.focus();
      await user.keyboard('{Enter}');

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test('calls onToggle when Space key is pressed', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      header.focus();
      await user.keyboard(' ');

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test('does not call onToggle for other keys', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      header.focus();
      await user.keyboard('a');
      await user.keyboard('{Escape}');
      await user.keyboard('{Tab}');

      expect(onToggle).not.toHaveBeenCalled();
    });

    test('calls onToggle multiple times for multiple clicks', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      await user.click(header);
      await user.click(header);
      await user.click(header);

      expect(onToggle).toHaveBeenCalledTimes(3);
    });
  });

  describe('aria-expanded attribute', () => {
    test('sets aria-expanded to false when isExpanded is false', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    test('sets aria-expanded to true when isExpanded is true', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    test('updates aria-expanded when isExpanded prop changes', () => {
      const { rerender } = render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      expect(header).toHaveAttribute('aria-expanded', 'false');

      rerender(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(header).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('ARIA attributes and accessibility', () => {
    test('header has role="button"', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      expect(header).toHaveAttribute('role', 'button');
    });

    test('header is focusable with tabIndex 0', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      expect(header).toHaveAttribute('tabIndex', '0');
    });

    test('has aria-controls linking header to content', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      const contentId = header.getAttribute('aria-controls');
      expect(contentId).toBeTruthy();
      expect(contentId).toBe('collapsible-content-test-section');

      const content = screen.getByTestId('collapsible-content-test-section');
      expect(content).toHaveAttribute('id', contentId);
    });

    test('content has role="region" and aria-labelledby', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const header = screen.getByTestId('collapsible-header-test-section');
      const headerId = header.getAttribute('id');
      expect(headerId).toBe('collapsible-header-test-section');

      const content = screen.getByTestId('collapsible-content-test-section');
      expect(content).toHaveAttribute('role', 'region');
      expect(content).toHaveAttribute('aria-labelledby', headerId);
    });
  });

  describe('Visual indicators', () => {
    test('shows right-pointing chevron when collapsed', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.getByText('▶')).toBeInTheDocument();
      expect(screen.queryByText('▼')).not.toBeInTheDocument();
    });

    test('shows down-pointing chevron when expanded', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.getByText('▼')).toBeInTheDocument();
      expect(screen.queryByText('▶')).not.toBeInTheDocument();
    });

    test('displays error indicator when hasError is true', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          hasError={true}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const errorIndicator = screen.getByTestId('section-error-indicator');
      expect(errorIndicator).toBeInTheDocument();
      expect(errorIndicator).toHaveTextContent('⚠');
      expect(errorIndicator).toHaveAttribute('title', 'Contains errors');
    });

    test('does not display error indicator when hasError is false', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          hasError={false}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.queryByTestId('section-error-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Help text', () => {
    test('displays help icon when helpText is provided', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          helpText="This is helpful information"
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const helpIcon = screen.getByTestId('section-help-icon');
      expect(helpIcon).toBeInTheDocument();
      expect(helpIcon).toHaveTextContent('ⓘ');
      expect(helpIcon).toHaveAttribute('title', 'This is helpful information');
    });

    test('does not display help icon when helpText is not provided', () => {
      render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.queryByTestId('section-help-icon')).not.toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    test('applies custom className to section', () => {
      const { container } = render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          className="custom-class"
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const section = container.querySelector('.collapsible-section');
      expect(section).toHaveClass('custom-class');
      expect(section).toHaveClass('collapsible-section');
    });

    test('applies default empty className when not provided', () => {
      const { container } = render(
        <MockCollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      const section = container.querySelector('.collapsible-section');
      expect(section).toHaveClass('collapsible-section');
    });
  });

  describe('Title handling', () => {
    test('renders title text', () => {
      render(
        <MockCollapsibleSection
          title="My Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.getByText('My Test Section')).toBeInTheDocument();
    });

    test('generates correct testid from title with spaces', () => {
      render(
        <MockCollapsibleSection
          title="Advanced Options Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.getByTestId('collapsible-section-advanced-options-section')).toBeInTheDocument();
      expect(screen.getByTestId('collapsible-header-advanced-options-section')).toBeInTheDocument();
      expect(screen.getByTestId('collapsible-content-advanced-options-section')).toBeInTheDocument();
    });

    test('generates correct testid from title with special characters', () => {
      render(
        <MockCollapsibleSection
          title="People & Assignments"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      // Special characters are preserved in the testid generation
      expect(screen.getByTestId('collapsible-section-people-&-assignments')).toBeInTheDocument();
    });
  });

  describe('Integration with all props', () => {
    test('works correctly with all optional props provided', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <MockCollapsibleSection
          title="Full Props Section"
          isExpanded={false}
          onToggle={onToggle}
          badge="5"
          hasError={true}
          helpText="Help information"
          className="custom-section"
        >
          <div>Section content</div>
        </MockCollapsibleSection>
      );

      // Verify all elements are present
      expect(screen.getByText('Full Props Section')).toBeInTheDocument();
      expect(screen.getByTestId('section-badge')).toHaveTextContent('5');
      expect(screen.getByTestId('section-error-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('section-help-icon')).toBeInTheDocument();
      expect(screen.getByText('Section content')).toBeInTheDocument();

      // Verify interaction still works
      const header = screen.getByTestId('collapsible-header-full-props-section');
      await user.click(header);
      expect(onToggle).toHaveBeenCalledTimes(1);

      // Verify accessibility attributes
      expect(header).toHaveAttribute('aria-expanded', 'false');
      expect(header).toHaveAttribute('role', 'button');
    });

    test('works correctly with minimal props', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <MockCollapsibleSection
          title="Minimal"
          isExpanded={true}
          onToggle={onToggle}
        >
          <div>Content</div>
        </MockCollapsibleSection>
      );

      expect(screen.getByText('Minimal')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();

      const header = screen.getByTestId('collapsible-header-minimal');
      await user.click(header);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Comparison with real CollapsibleSection behavior', () => {
    test('maintains same prop interface as real component', () => {
      // This test documents that MockCollapsibleSection accepts the same props
      // as the real CollapsibleSection, ensuring drop-in compatibility
      const props = {
        title: 'Test',
        isExpanded: false,
        onToggle: vi.fn(),
        badge: '3',
        hasError: true,
        helpText: 'Help',
        className: 'custom',
        children: <div>Content</div>
      };

      const { container } = render(<MockCollapsibleSection {...props} />);
      expect(container.querySelector('.collapsible-section')).toBeInTheDocument();
    });

    test('differs from real component: always renders children', () => {
      // CRITICAL DIFFERENCE: Real CollapsibleSection hides children when collapsed
      // MockCollapsibleSection always renders children (jsdom workaround)
      render(
        <MockCollapsibleSection
          title="Test"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div data-testid="child-content">Hidden in real component</div>
        </MockCollapsibleSection>
      );

      // In real component with isExpanded=false, this would not be in the document
      // In mock, it's always present
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
  });
});
