import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpTooltip from './HelpTooltip.jsx';

describe('HelpTooltip', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Tooltip display on hover', () => {
    test('shows tooltip when hovering over icon', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="This is helpful information" />
      );

      const icon = container.querySelector('.help-tooltip-icon');

      // Initially hidden
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

      // Hover to show
      await user.hover(icon);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
        expect(screen.getByRole('tooltip')).toHaveTextContent('This is helpful information');
      });
    });

    test('hides tooltip when mouse leaves icon', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Test content" />
      );

      const icon = container.querySelector('.help-tooltip-icon');

      // Show tooltip
      await user.hover(icon);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      // Hide tooltip
      await user.unhover(icon);

      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    });
  });

  describe('Tooltip display on focus', () => {
    test('shows tooltip when icon receives focus', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Focus test content" />
      );

      const icon = container.querySelector('.help-tooltip-icon');

      // Initially hidden
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

      // Focus to show
      await user.click(icon);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
        expect(screen.getByRole('tooltip')).toHaveTextContent('Focus test content');
      });
    });

    test('hides tooltip when icon loses focus', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <HelpTooltip content="Test content" />
          <button>Other element</button>
        </div>
      );

      const icon = container.querySelector('.help-tooltip-icon');

      // Show tooltip
      await user.click(icon);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      // Tab away to blur
      await user.tab();

      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    });
  });

  describe('Tooltip hide on Escape key', () => {
    test('hides tooltip when Escape key is pressed', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Escape test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');

      // Show tooltip
      await user.click(icon);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      // Press Escape
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    });

    test('removes focus from icon when Escape is pressed', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Focus test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');

      // Focus icon
      await user.click(icon);
      expect(icon).toHaveFocus();

      // Press Escape
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(icon).not.toHaveFocus();
      });
    });
  });

  describe('Position prop', () => {
    test('applies top position class by default', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Position test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveClass('help-tooltip-top');
      });
    });

    test('applies bottom position class when specified', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Position test" position="bottom" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveClass('help-tooltip-bottom');
      });
    });

    test('applies left position class when specified', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Position test" position="left" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveClass('help-tooltip-left');
      });
    });

    test('applies right position class when specified', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Position test" position="right" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveClass('help-tooltip-right');
      });
    });
  });

  describe('MaxWidth prop', () => {
    test('applies default maxWidth of 300px', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="MaxWidth test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip.style.maxWidth).toBe('300px');
      });
    });

    test('applies custom maxWidth when specified', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="MaxWidth test" maxWidth={500} />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip.style.maxWidth).toBe('500px');
      });
    });
  });

  describe('ARIA attributes', () => {
    test('icon has proper ARIA attributes', () => {
      const { container } = render(
        <HelpTooltip content="ARIA test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      expect(icon).toHaveAttribute('role', 'button');
      expect(icon).toHaveAttribute('aria-label', 'Help information');
      expect(icon).toHaveAttribute('tabIndex', '0');
    });

    test('icon has aria-describedby when tooltip is visible', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="ARIA test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');

      // Initially no aria-describedby
      expect(icon).not.toHaveAttribute('aria-describedby');

      // Show tooltip
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        const tooltipId = tooltip.getAttribute('id');
        expect(icon).toHaveAttribute('aria-describedby', tooltipId);
      });
    });

    test('tooltip has role="tooltip"', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Role test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveAttribute('role', 'tooltip');
      });
    });

    test('tooltip has unique id', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="ID test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        const id = tooltip.getAttribute('id');
        expect(id).toBeTruthy();
        expect(id).toMatch(/^tooltip-/);
      });
    });
  });

  describe('Icon rendering', () => {
    test('renders info icon', () => {
      const { container } = render(
        <HelpTooltip content="Icon test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveTextContent('ⓘ');
    });

    test('icon is focusable', () => {
      const { container } = render(
        <HelpTooltip content="Focusable test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      expect(icon).toHaveAttribute('tabIndex', '0');
    });
  });

  // Parameterized tests replacing PBT Property 8 (tooltip interactions)
  describe('Tooltip interaction consistency (replaces PBT Property 8)', () => {
    test.each([
      { position: 'top', maxWidth: 200 },
      { position: 'bottom', maxWidth: 300 },
      { position: 'left', maxWidth: 150 },
      { position: 'right', maxWidth: 500 },
    ])('hover shows tooltip with position=$position and maxWidth=$maxWidth', async ({ position, maxWidth }) => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Test content" position={position} maxWidth={maxWidth} />
      );

      const icon = container.querySelector('.help-tooltip-icon');
      await user.hover(icon);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveClass(`help-tooltip-${position}`);
        expect(tooltip.style.maxWidth).toBe(`${maxWidth}px`);
        expect(tooltip).toHaveTextContent('Test content');
      });

      await user.unhover(icon);

      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    });

    test.each([1, 2, 3])('multiple hover/unhover cycles (%i) work consistently', async (cycles) => {
      const user = userEvent.setup();
      const { container } = render(
        <HelpTooltip content="Cycle test" />
      );

      const icon = container.querySelector('.help-tooltip-icon');

      for (let i = 0; i < cycles; i++) {
        await user.hover(icon);
        await waitFor(() => {
          expect(screen.getByRole('tooltip')).toBeInTheDocument();
        });

        await user.unhover(icon);
        await waitFor(() => {
          expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        });
      }
    });
  });
});
