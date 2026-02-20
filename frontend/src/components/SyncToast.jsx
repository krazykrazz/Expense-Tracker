import { memo, useSyncExternalStore } from 'react';
import './SyncToast.css';

/**
 * SyncToast — renders a stack of brief sync notification toasts.
 * Each toast auto-dismisses after 2000ms via CSS animation.
 *
 * Uses useSyncExternalStore to subscribe to the toast store in useDataSync,
 * so only this component re-renders when toasts change (not AppContent).
 *
 * @param {{ subscribe: Function, getSnapshot: Function }} props
 */
function SyncToast({ subscribe, getSnapshot }) {
  const messages = useSyncExternalStore(subscribe, getSnapshot);

  if (!messages || messages.length === 0) return null;

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

export default memo(SyncToast);
