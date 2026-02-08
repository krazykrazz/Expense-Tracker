import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollapsibleSection from './CollapsibleSection.jsx';

describe('CollapsibleSection', () => {
  describe('Rendering in expanded/collapsed states', () => {
    test('renders in collapsed state with right-pointing chevron', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      expect(header).toBeInTheDocument();
      expect(screen.getByText('▶')).toBeInTheDocument();
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    test('renders in expanded state with down-pointing chevron', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      expect(header).toBeInTheDocument();
      expect(screen.getByText('▼')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    test('renders content only when expanded', () => {
      const { rerender } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.queryByText('Content')).not.toBeInTheDocument();

      rerender(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('Badge display', () => {
    test('displays string badge when provided', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          badge="2 items"
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('2 items')).toBeInTheDocument();
      expect(screen.getByText('2 items')).toHaveClass('collapsible-badge');
    });

    test('displays numeric badge when provided', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          badge={5}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('5')).toHaveClass('collapsible-badge');
    });

    test('does not display badge when not provided', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(container.querySelector('.collapsible-badge')).not.toBeInTheDocument();
    });
  });

  describe('Error indicator display', () => {
    test('displays error indicator when hasError is true', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          hasError={true}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const errorIndicator = screen.getByTitle('Contains errors');
      expect(errorIndicator).toBeInTheDocument();
      expect(errorIndicator).toHaveClass('collapsible-error-indicator');
      expect(errorIndicator).toHaveTextContent('⚠');
    });

    test('does not display error indicator when hasError is false', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          hasError={false}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.queryByTitle('Contains errors')).not.toBeInTheDocument();
    });

    test('does not display error indicator when hasError is not provided', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.queryByTitle('Contains errors')).not.toBeInTheDocument();
    });
  });

  describe('Keyboard interactions', () => {
    test('calls onToggle when Enter key is pressed', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      header.focus();
      await user.keyboard('{Enter}');

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test('calls onToggle when Space key is pressed', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      header.focus();
      await user.keyboard(' ');

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test('does not call onToggle for other keys', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      header.focus();
      await user.keyboard('a');
      await user.keyboard('{Escape}');
      await user.keyboard('{Tab}');

      expect(onToggle).not.toHaveBeenCalled();
    });

    test('header is focusable with tabIndex 0', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      expect(header).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Click interaction', () => {
    test('calls onToggle when header is clicked', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={onToggle}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      await user.click(header);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('ARIA attributes', () => {
    test('has correct aria-expanded attribute when collapsed', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    test('has correct aria-expanded attribute when expanded', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    test('has aria-controls linking header to content', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      const contentId = header.getAttribute('aria-controls');
      expect(contentId).toBeTruthy();

      const content = screen.getByText('Content').closest('.collapsible-content');
      expect(content).toHaveAttribute('id', contentId);
    });

    test('content has role="region" and aria-labelledby', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={true}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      const headerId = header.getAttribute('id');

      const content = screen.getByText('Content').closest('.collapsible-content');
      expect(content).toHaveAttribute('role', 'region');
      expect(content).toHaveAttribute('aria-labelledby', headerId);
    });

    test('header has role="button"', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = screen.getByText('Test Section').closest('.collapsible-header');
      expect(header).toHaveAttribute('role', 'button');
    });
  });

  describe('Help text', () => {
    test('displays help icon with title when helpText is provided', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          helpText="This is helpful information"
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const helpIcon = screen.getByTitle('This is helpful information');
      expect(helpIcon).toBeInTheDocument();
      expect(helpIcon).toHaveClass('collapsible-help-icon');
      expect(helpIcon).toHaveTextContent('ⓘ');
    });

    test('does not display help icon when helpText is not provided', () => {
      render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.queryByText('ⓘ')).not.toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    test('applies custom className to section', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
          className="custom-class"
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const section = container.querySelector('.collapsible-section');
      expect(section).toHaveClass('custom-class');
    });

    test('applies default empty className when not provided', () => {
      const { container } = render(
        <CollapsibleSection
          title="Test Section"
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const section = container.querySelector('.collapsible-section');
      expect(section).toHaveClass('collapsible-section');
    });
  });

  // Parameterized tests replacing PBT Property 6 (toggle interaction consistency)
  describe('Toggle interaction consistency (replaces PBT Property 6)', () => {
    test.each([
      { method: 'click', initialExpanded: false, desc: 'click from collapsed' },
      { method: 'click', initialExpanded: true, desc: 'click from expanded' },
      { method: 'Enter', initialExpanded: false, desc: 'Enter from collapsed' },
      { method: 'Enter', initialExpanded: true, desc: 'Enter from expanded' },
      { method: 'Space', initialExpanded: false, desc: 'Space from collapsed' },
      { method: 'Space', initialExpanded: true, desc: 'Space from expanded' },
    ])('toggles via $desc', async ({ method, initialExpanded }) => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      const { rerender, container } = render(
        <CollapsibleSection title="Section" isExpanded={initialExpanded} onToggle={onToggle}>
          <div data-testid="content">Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('.collapsible-header');

      if (method === 'click') {
        await user.click(header);
      } else {
        header.focus();
        await user.keyboard(method === 'Enter' ? '{Enter}' : ' ');
      }

      expect(onToggle).toHaveBeenCalledTimes(1);

      rerender(
        <CollapsibleSection title="Section" isExpanded={!initialExpanded} onToggle={onToggle}>
          <div data-testid="content">Content</div>
        </CollapsibleSection>
      );

      expect(header).toHaveAttribute('aria-expanded', String(!initialExpanded));
      if (!initialExpanded) {
        expect(container.querySelector('[data-testid="content"]')).toBeInTheDocument();
      } else {
        expect(container.querySelector('[data-testid="content"]')).not.toBeInTheDocument();
      }
    });

    test.each([2, 3, 5])('multiple toggles (%i times) maintain consistency', async (toggleCount) => {
      const onToggle = vi.fn();
      const user = userEvent.setup();
      let isExpanded = false;

      const { rerender, container } = render(
        <CollapsibleSection title="Section" isExpanded={isExpanded} onToggle={onToggle}>
          <div data-testid="content">Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('.collapsible-header');

      for (let i = 0; i < toggleCount; i++) {
        await user.click(header);
        isExpanded = !isExpanded;
        rerender(
          <CollapsibleSection title="Section" isExpanded={isExpanded} onToggle={onToggle}>
            <div data-testid="content">Content</div>
          </CollapsibleSection>
        );
        expect(header).toHaveAttribute('aria-expanded', String(isExpanded));
      }

      expect(onToggle).toHaveBeenCalledTimes(toggleCount);
    });

    test('toggle works with all optional props present', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      const { container } = render(
        <CollapsibleSection
          title="Full Props"
          isExpanded={false}
          onToggle={onToggle}
          badge="3"
          hasError={true}
          helpText="Help info"
          className="custom"
        >
          <div>Content</div>
        </CollapsibleSection>
      );

      const header = container.querySelector('.collapsible-header');
      await user.click(header);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });
});

