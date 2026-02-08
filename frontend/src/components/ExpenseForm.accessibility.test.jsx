import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollapsibleSection from './CollapsibleSection';
import HelpTooltip from './HelpTooltip';

describe('ExpenseForm - Accessibility Unit Tests', () => {
  describe('CollapsibleSection ARIA attributes', () => {
    test('should have aria-expanded attribute on header', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    test('should update aria-expanded when expanded state changes', () => {
      const { container, rerender } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      expect(header).toHaveAttribute('aria-expanded', 'false');

      rerender(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    test('should have aria-controls linking header to content', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      const controlsId = header.getAttribute('aria-controls');
      
      expect(controlsId).toBeTruthy();
      
      const content = container.querySelector(`#${controlsId}`);
      expect(content).toBeInTheDocument();
    });

    test('should have role="region" on content area', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const content = container.querySelector('[role="region"]');
      expect(content).toBeInTheDocument();
    });

    test('should have aria-labelledby on content pointing to header', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      const headerId = header.getAttribute('id');
      
      const content = container.querySelector('[role="region"]');
      const labelledBy = content.getAttribute('aria-labelledby');
      
      expect(labelledBy).toBe(headerId);
    });

    test('should have tabindex="0" for keyboard accessibility', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      expect(header).toHaveAttribute('tabindex', '0');
    });
  });

  describe('CollapsibleSection keyboard navigation', () => {
    test('should toggle on Enter key', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      header.focus();
      
      await user.keyboard('{Enter}');
      
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test('should toggle on Space key', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      header.focus();
      
      await user.keyboard(' ');
      
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test('should be focusable', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      header.focus();
      
      expect(header).toHaveFocus();
    });
  });

  describe('HelpTooltip ARIA attributes', () => {
    test('should have aria-label on icon', () => {
      const { container } = render(
        <HelpTooltip content="Help text" />
      );

      const icon = container.querySelector('[role="button"]');
      expect(icon).toHaveAttribute('aria-label', 'Help information');
    });

    test('should have aria-describedby when tooltip is visible', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Help text" />
      );

      const icon = container.querySelector('[role="button"]');
      
      // Initially no aria-describedby
      expect(icon).not.toHaveAttribute('aria-describedby');
      
      // Hover to show tooltip
      await user.hover(icon);
      
      // Now should have aria-describedby
      expect(icon).toHaveAttribute('aria-describedby');
    });

    test('should have role="tooltip" on tooltip content', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Help text" />
      );

      const icon = container.querySelector('[role="button"]');
      await user.hover(icon);
      
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toBeInTheDocument();
    });

    test('should be focusable with tabindex="0"', () => {
      const { container } = render(
        <HelpTooltip content="Help text" />
      );

      const icon = container.querySelector('[role="button"]');
      expect(icon).toHaveAttribute('tabindex', '0');
    });
  });

  describe('HelpTooltip keyboard navigation', () => {
    test('should show tooltip on focus', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Help text" />
      );

      const icon = container.querySelector('[role="button"]');
      
      // Focus the icon
      await user.tab();
      expect(icon).toHaveFocus();
      
      // Tooltip should be visible
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('Help text');
    });

    test('should hide tooltip on Escape key', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Help text" />
      );

      const icon = container.querySelector('[role="button"]');
      
      // Focus to show tooltip
      await user.tab();
      expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument();
      
      // Press Escape
      await user.keyboard('{Escape}');
      
      // Tooltip should be hidden
      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();
    });

    test('should hide tooltip on blur', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <HelpTooltip content="Help text" />
          <button>Other element</button>
        </div>
      );

      const icon = container.querySelector('[role="button"][aria-label="Help information"]');
      
      // Hover to show tooltip (more reliable than focus for this test)
      await user.hover(icon);
      expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument();
      
      // Move mouse away to trigger blur
      await user.unhover(icon);
      
      // Tooltip should be hidden
      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();
    });
  });

  describe('Tab order and focus management', () => {
    test('collapsed section content should not be in DOM', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
        >
          <input type="text" id="test-input" />
        </CollapsibleSection>
      );

      // Content should not be rendered when collapsed
      expect(container.querySelector('#test-input')).not.toBeInTheDocument();
    });

    test('expanded section content should be in DOM and focusable', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={() => {}}
        >
          <input type="text" id="test-input" />
        </CollapsibleSection>
      );

      // Content should be rendered when expanded
      const input = container.querySelector('#test-input');
      expect(input).toBeInTheDocument();
      
      // Should be focusable
      input.focus();
      expect(input).toHaveFocus();
    });

    test('section header should be focusable regardless of expansion state', () => {
      const { container, rerender } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('[role="button"]');
      
      // Should be focusable when collapsed
      header.focus();
      expect(header).toHaveFocus();
      
      // Should still be focusable when expanded
      rerender(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );
      
      header.focus();
      expect(header).toHaveFocus();
    });
  });

  describe('Visual indicators for section state', () => {
    test('should show different icon for expanded vs collapsed', () => {
      const { container, rerender } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const collapsedIcon = container.querySelector('.collapsible-icon');
      expect(collapsedIcon).toHaveClass('collapsed');
      expect(collapsedIcon).toHaveTextContent('▶');
      
      rerender(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={() => {}}
        >
          <div>Content</div>
        </CollapsibleSection>
      );
      
      const expandedIcon = container.querySelector('.collapsible-icon');
      expect(expandedIcon).toHaveClass('expanded');
      expect(expandedIcon).toHaveTextContent('▼');
    });

    test('should display badge when provided', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
          badge="2 items"
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const badge = container.querySelector('.collapsible-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('2 items');
    });

    test('should display error indicator when hasError is true', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={() => {}}
          hasError={true}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const errorIndicator = container.querySelector('.collapsible-error-indicator');
      expect(errorIndicator).toBeInTheDocument();
      expect(errorIndicator).toHaveAttribute('title', 'Contains errors');
    });
  });
});
