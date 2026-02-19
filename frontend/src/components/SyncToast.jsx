import './SyncToast.css';

/**
 * SyncToast — renders a stack of brief sync notification toasts.
 * Each toast auto-dismisses after 2000ms via CSS animation.
 *
 * @param {{ messages: Array<{id: string, text: string}> }} props
 */
function SyncToast({ messages = [] }) {
  if (messages.length === 0) return null;

  return (
    <div className="sync-toast-container" aria-live="polite" aria-atomic="false">
      {messages.map(({ id, text }) => (
        <div key={id} className="sync-toast" role="status">
          {text}
        </div>
      ))}
    </div>
  );
}

export default SyncToast;
