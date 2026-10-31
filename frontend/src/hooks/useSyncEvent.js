import { useEffect, useRef } from 'react';

/**
 * Run a callback when another tab/device changes one of the given entity types.
 * useDataSync dispatches these as window `syncEvent`s for entity types that have no
 * shared context (loan, income, investment, fixed_expense, credit_card).
 *
 * @param {string|string[]} entityTypes - routing keys to react to
 * @param {(entityType: string) => void} callback - called with the matching entity type
 */
export function useSyncEvent(entityTypes, callback) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  const typesKey = [].concat(entityTypes).join(',');
  useEffect(() => {
    const types = new Set(typesKey.split(','));
    const handleSyncEvent = (event) => {
      const entityType = event.detail?.entityType;
      if (types.has(entityType)) {
        callbackRef.current(entityType);
      }
    };
    window.addEventListener('syncEvent', handleSyncEvent);
    return () => window.removeEventListener('syncEvent', handleSyncEvent);
  }, [typesKey]);
}

export default useSyncEvent;
