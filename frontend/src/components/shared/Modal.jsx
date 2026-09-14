import { useRef, useId } from 'react';
import useModalBehavior from '../../hooks/useModalBehavior';
import './Modal.css';

/**
 * Accessible dialog shell: dialog semantics, focus trap, focus restore, Escape,
 * body scroll lock, and correct behaviour when modals are nested.
 *
 * Reuses the existing `.modal-overlay` / `.modal-content` classes so the
 * UxConsistency overlay, width and z-index guardrails keep holding.
 *
 * Props:
 *   isOpen              - controls visibility
 *   onClose             - called on Escape, overlay click, and the close button
 *   title               - dialog heading; also provides the accessible name
 *   ariaLabel           - accessible name when no visible title is wanted
 *   children            - dialog body
 *   className           - extra classes on the dialog element (bespoke per-modal styling)
 *   overlayClassName    - extra classes on the overlay (legacy per-modal overlay styles)
 *   closeOnOverlayClick - default true
 *   closeOnEscape       - default true
 *   hideCloseButton     - omit the built-in close button
 *   size                - 'sm' | 'md' | 'lg' | 'xl' (default 'md')
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  ariaLabel,
  children,
  className = '',
  overlayClassName = '',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  hideCloseButton = false,
  size = 'md'
}) {
  const dialogRef = useRef(null);
  const generatedId = useId();
  const titleId = `modal-title-${generatedId}`;

  useModalBehavior({ isOpen, onClose, containerRef: dialogRef, closeOnEscape });

  if (!isOpen) return null;

  // Comparing target to currentTarget means a click that merely bubbled up from the
  // dialog body does not dismiss, so the dialog needs no stopPropagation handler.
  const handleOverlayClick = (event) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose?.();
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- overlay click is a mouse-only convenience; Escape is the keyboard equivalent and is handled in useModalBehavior
    <div className={`modal-overlay ${overlayClassName}`.trim()} onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className={`modal-content modal-content--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        {...(title ? { 'aria-labelledby': titleId } : { 'aria-label': ariaLabel })}
        tabIndex={-1}
      >
        {!hideCloseButton && (
          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        )}
        {title && (
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
