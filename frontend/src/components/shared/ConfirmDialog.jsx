import { useEffect, useRef } from 'react';
import './ConfirmDialog.css';

/**
 * A styled replacement for window.confirm() and window.alert().
 *
 * Props:
 *   isOpen       - controls visibility
 *   title        - dialog heading
 *   message      - body text (string or ReactNode)
 *   details      - optional additional content (ReactNode) shown between message and buttons
 *   confirmLabel - text for the confirm button (default: "Confirm")
 *   cancelLabel  - text for the cancel button (default: "Cancel")
 *   variant      - "danger" | "warning" | "info" (default: "danger")
 *   alertOnly    - if true, shows only one dismiss button (replaces window.alert)
 *   onConfirm    - called when the confirm/OK button is clicked
 *   onCancel     - called when the cancel button or overlay is clicked
 */
export default function ConfirmDialog({
  isOpen,
  title = 'Confirm',
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  alertOnly = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);
  const dialogRef = useRef(null);

  // Focus the confirm/dismiss button when opened
  useEffect(() => {
    if (isOpen && confirmRef.current) {
      confirmRef.current.focus();
    }
  }, [isOpen]);

  // Escape key closes dialog
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay confirm-dialog-overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-message">{message}</p>
        {details && <div className="confirm-dialog-details">{details}</div>}
        <div className="dialog-actions">
          {!alertOnly && (
            <button className="cancel-button" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            className={`confirm-button confirm-button--${variant}`}
            onClick={onConfirm}
          >
            {alertOnly ? 'OK' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
