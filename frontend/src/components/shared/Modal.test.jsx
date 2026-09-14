import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';
import { __resetModalStack } from '../../hooks/useModalBehavior';

describe('Modal', () => {
  beforeEach(() => {
    __resetModalStack();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    cleanup();
    __resetModalStack();
    document.body.style.overflow = '';
  });

  describe('dialog semantics', () => {
    it('exposes role="dialog" and aria-modal when open', () => {
      render(
        <Modal isOpen onClose={vi.fn()} title="Budget settings">
          <p>body</p>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('names the dialog from its visible title', () => {
      render(
        <Modal isOpen onClose={vi.fn()} title="Budget settings">
          <p>body</p>
        </Modal>
      );

      expect(screen.getByRole('dialog', { name: 'Budget settings' })).toBeInTheDocument();
    });

    it('falls back to ariaLabel when there is no visible title', () => {
      render(
        <Modal isOpen onClose={vi.fn()} ariaLabel="Invoice preview">
          <p>body</p>
        </Modal>
      );

      expect(screen.getByRole('dialog', { name: 'Invoice preview' })).toBeInTheDocument();
    });

    it('renders nothing when closed', () => {
      render(
        <Modal isOpen={false} onClose={vi.fn()} title="Hidden">
          <p>body</p>
        </Modal>
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('gives the close button an accessible name', () => {
      render(
        <Modal isOpen onClose={vi.fn()} title="T">
          <p>body</p>
        </Modal>
      );

      expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    });

    it('omits the close button when hideCloseButton is set', () => {
      render(
        <Modal isOpen onClose={vi.fn()} title="T" hideCloseButton>
          <p>body</p>
        </Modal>
      );

      expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument();
    });

    it('keeps the shared overlay and width-token classes the UX guardrails expect', () => {
      const { container } = render(
        <Modal isOpen onClose={vi.fn()} title="T" size="lg">
          <p>body</p>
        </Modal>
      );

      expect(container.querySelector('.modal-overlay')).toBeInTheDocument();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('modal-content');
      expect(dialog).toHaveClass('modal-content--lg');
    });
  });

  describe('dismissal', () => {
    it('closes on Escape', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal isOpen onClose={onClose} title="T">
          <p>body</p>
        </Modal>
      );

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Escape when closeOnEscape is false', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal isOpen onClose={onClose} title="T" closeOnEscape={false}>
          <p>body</p>
        </Modal>
      );

      await user.keyboard('{Escape}');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes when the overlay itself is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <Modal isOpen onClose={onClose} title="T">
          <p>body</p>
        </Modal>
      );

      await user.click(container.querySelector('.modal-overlay'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT close when content inside the dialog is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal isOpen onClose={onClose} title="T">
          <p>click me</p>
        </Modal>
      );

      await user.click(screen.getByText('click me'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('ignores overlay clicks when closeOnOverlayClick is false', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <Modal isOpen onClose={onClose} title="T" closeOnOverlayClick={false}>
          <p>body</p>
        </Modal>
      );

      await user.click(container.querySelector('.modal-overlay'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes from the close button', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal isOpen onClose={onClose} title="T">
          <p>body</p>
        </Modal>
      );

      await user.click(screen.getByRole('button', { name: 'Close dialog' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('body scroll lock', () => {
    it('locks scrolling while open', () => {
      render(
        <Modal isOpen onClose={vi.fn()} title="T">
          <p>body</p>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores the previous overflow value on close, not a hardcoded default', () => {
      document.body.style.overflow = 'scroll';

      const { rerender } = render(
        <Modal isOpen onClose={vi.fn()} title="T">
          <p>body</p>
        </Modal>
      );
      expect(document.body.style.overflow).toBe('hidden');

      rerender(
        <Modal isOpen={false} onClose={vi.fn()} title="T">
          <p>body</p>
        </Modal>
      );
      expect(document.body.style.overflow).toBe('scroll');
    });

    it('restores scrolling on unmount', () => {
      const { unmount } = render(
        <Modal isOpen onClose={vi.fn()} title="T">
          <p>body</p>
        </Modal>
      );
      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('focus management', () => {
    it('moves focus into the dialog on open', () => {
      render(
        <Modal isOpen onClose={vi.fn()} title="T">
          <button type="button">inner action</button>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('focuses the dialog container when it holds no focusable children', () => {
      render(
        <Modal isOpen onClose={vi.fn()} title="T" hideCloseButton>
          <p>nothing focusable here</p>
        </Modal>
      );

      expect(document.activeElement).toBe(screen.getByRole('dialog'));
    });

    it('restores focus to the triggering element on close', async () => {
      const user = userEvent.setup();

      function Harness() {
        const [open, setOpen] = require('react').useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              open modal
            </button>
            <Modal isOpen={open} onClose={() => setOpen(false)} title="T">
              <p>body</p>
            </Modal>
          </>
        );
      }

      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'open modal' });
      await user.click(trigger);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Close dialog' }));
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('focus trap', () => {
    it('wraps Tab from the last focusable element back to the first', async () => {
      const user = userEvent.setup();
      render(
        <Modal isOpen onClose={vi.fn()} title="T" hideCloseButton>
          <button type="button">first</button>
          <button type="button">last</button>
        </Modal>
      );

      const first = screen.getByRole('button', { name: 'first' });
      const last = screen.getByRole('button', { name: 'last' });

      last.focus();
      await user.tab();
      expect(document.activeElement).toBe(first);
    });

    it('wraps Shift+Tab from the first focusable element back to the last', async () => {
      const user = userEvent.setup();
      render(
        <Modal isOpen onClose={vi.fn()} title="T" hideCloseButton>
          <button type="button">first</button>
          <button type="button">last</button>
        </Modal>
      );

      const first = screen.getByRole('button', { name: 'first' });
      const last = screen.getByRole('button', { name: 'last' });

      first.focus();
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(last);
    });

    it('keeps focus inside rather than escaping to elements behind the modal', async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">outside</button>
          <Modal isOpen onClose={vi.fn()} title="T" hideCloseButton>
            <button type="button">only</button>
          </Modal>
        </>
      );

      const only = screen.getByRole('button', { name: 'only' });
      only.focus();
      await user.tab();

      expect(document.activeElement).toBe(only);
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'outside' }));
    });
  });

  describe('nesting', () => {
    it('Escape closes only the innermost modal', async () => {
      const outerClose = vi.fn();
      const innerClose = vi.fn();
      const user = userEvent.setup();

      render(
        <Modal isOpen onClose={outerClose} title="Outer">
          <p>outer body</p>
          <Modal isOpen onClose={innerClose} title="Inner">
            <p>inner body</p>
          </Modal>
        </Modal>
      );

      await user.keyboard('{Escape}');

      expect(innerClose).toHaveBeenCalledTimes(1);
      expect(outerClose).not.toHaveBeenCalled();
    });

    it('keeps scrolling locked while an outer modal is still open', () => {
      function Nested({ innerOpen }) {
        return (
          <Modal isOpen onClose={vi.fn()} title="Outer">
            <Modal isOpen={innerOpen} onClose={vi.fn()} title="Inner">
              <p>inner</p>
            </Modal>
          </Modal>
        );
      }

      const { rerender } = render(<Nested innerOpen />);
      expect(document.body.style.overflow).toBe('hidden');

      // Closing the inner modal must not unlock the page behind the outer one.
      rerender(<Nested innerOpen={false} />);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('unlocks scrolling only once the last modal closes', () => {
      function Nested({ outerOpen, innerOpen }) {
        return (
          <Modal isOpen={outerOpen} onClose={vi.fn()} title="Outer">
            <Modal isOpen={innerOpen} onClose={vi.fn()} title="Inner">
              <p>inner</p>
            </Modal>
          </Modal>
        );
      }

      const { rerender } = render(<Nested outerOpen innerOpen />);
      rerender(<Nested outerOpen innerOpen={false} />);
      expect(document.body.style.overflow).toBe('hidden');

      rerender(<Nested outerOpen={false} innerOpen={false} />);
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('composition', () => {
    it('passes bespoke classes through to the overlay and dialog', () => {
      const { container } = render(
        <Modal
          isOpen
          onClose={vi.fn()}
          title="T"
          className="budgets-modal"
          overlayClassName="income-modal-overlay"
        >
          <p>body</p>
        </Modal>
      );

      expect(container.querySelector('.modal-overlay')).toHaveClass('income-modal-overlay');
      expect(screen.getByRole('dialog')).toHaveClass('budgets-modal');
    });

    it('renders its children', () => {
      render(
        <Modal isOpen onClose={vi.fn()} title="T">
          <p>child content</p>
        </Modal>
      );

      expect(within(screen.getByRole('dialog')).getByText('child content')).toBeInTheDocument();
    });
  });
});
