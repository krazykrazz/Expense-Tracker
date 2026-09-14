import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

// Shared across every modal in the process. Nested modals must agree on who is on
// top and who owns the body scroll lock, so this cannot live in component state.
const modalStack = [];
let savedBodyOverflow = null;

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
}

/**
 * Which open modal should answer a key press.
 *
 * Push order is NOT stacking order: React runs child effects before parent effects,
 * so a nested modal registers before the modal containing it. Containment is the
 * reliable signal — a modal that contains another open modal is not on top. Among
 * modals that contain nothing (siblings), the most recently opened wins.
 */
function getTopmostEntry() {
  if (modalStack.length === 0) return null;

  const outermostFirst = modalStack.filter((entry) => {
    const el = entry.getElement();
    if (!el) return false;
    return !modalStack.some((other) => {
      if (other === entry) return false;
      const otherEl = other.getElement();
      return otherEl && el.contains(otherEl);
    });
  });

  return outermostFirst[outermostFirst.length - 1] || modalStack[modalStack.length - 1];
}

/**
 * Dialog behaviour — focus management, focus trap, Escape, and body scroll lock.
 *
 * Split out from <Modal> so a modal that cannot adopt the full shell (for example
 * one with its own bespoke keyboard handling) can still get correct behaviour.
 *
 * @param {object} options
 * @param {boolean} options.isOpen
 * @param {Function} options.onClose
 * @param {object} options.containerRef - ref to the dialog element
 * @param {boolean} [options.closeOnEscape]
 */
export function useModalBehavior({ isOpen, onClose, containerRef, closeOnEscape = true }) {
  const idRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  if (idRef.current === null) {
    idRef.current = Symbol('modal');
  }

  // Registers on the stack and owns the scroll lock. Declared first so the stack is
  // populated before the Escape and Tab handlers below consult it.
  useEffect(() => {
    if (!isOpen) return undefined;

    const entry = { id: idRef.current, getElement: () => containerRef.current };
    modalStack.push(entry);

    if (modalStack.length === 1) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      const index = modalStack.indexOf(entry);
      if (index !== -1) modalStack.splice(index, 1);

      // Only the last modal to close restores scrolling; an inner modal closing
      // must not unlock the page while its parent is still open.
      if (modalStack.length === 0) {
        document.body.style.overflow = savedBodyOverflow ?? '';
        savedBodyOverflow = null;
      }
    };
  }, [isOpen, containerRef]);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement;

    const container = containerRef.current;
    if (container) {
      const focusable = getFocusableElements(container);
      const target = focusable[0] || container;
      if (typeof target.focus === 'function') target.focus();
    }

    return () => {
      const previous = previouslyFocusedRef.current;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [isOpen, containerRef]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      const topmost = getTopmostEntry();
      if (!topmost || topmost.id !== idRef.current) return;

      if (event.key === 'Escape' && closeOnEscape) {
        // Stops an outer modal's handler from also firing on the same keypress.
        event.stopPropagation();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, closeOnEscape, containerRef]);
}

/** Test-only: the stack is module state and would otherwise leak between tests. */
export function __resetModalStack() {
  modalStack.length = 0;
  savedBodyOverflow = null;
}

export default useModalBehavior;
