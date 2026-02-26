import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import { createLogger } from '../utils/logger';
import { authAwareFetch } from '../utils/fetchProvider';

const logger = createLogger('useVersionUpgradeCheck');

const LAST_SEEN_VERSION_KEY = 'last_seen_version';

/**
 * Hook to check for version upgrades on app load.
 * Fetches current version from /api/version, compares with localStorage,
 * and returns modal state for displaying changelog.
 *
 * @param {Object} options
 * @param {Array} options.changelogEntries - All changelog entries available
 * @returns {{ showModal: boolean, newVersion: string|null, changelogEntries: Array, handleClose: function }}
 */
function useVersionUpgradeCheck({ changelogEntries = [] } = {}) {
  const [showModal, setShowModal] = useState(false);
  const [newVersion, setNewVersion] = useState(null);
  const [matchedEntries, setMatchedEntries] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function checkVersion() {
      try {
        const response = await authAwareFetch(API_ENDPOINTS.VERSION);
        if (!response.ok) {
          logger.error('Failed to fetch version', { status: response.status });
          return;
        }

        const data = await response.json();
        const currentVersion = data.version;

        if (!currentVersion) {
          logger.warn('No version in API response');
          return;
        }

        if (cancelled) return;

        let lastSeen;
        try {
          lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
        } catch (e) {
          logger.warn('localStorage unavailable', e);
          return;
        }

        if (!lastSeen) {
          // First-time user: store current version, don't show modal
          try {
            localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
          } catch (e) {
            logger.warn('Failed to write localStorage', e);
          }
          return;
        }

        if (lastSeen === currentVersion) {
          // Same version, nothing to do
          return;
        }

        // Version differs — show upgrade modal
        const entries = changelogEntries.filter(e => e.version === currentVersion);
        if (!cancelled) {
          setNewVersion(currentVersion);
          setMatchedEntries(entries);
          setShowModal(true);
        }
      } catch (error) {
        logger.error('Version check failed', error);
      }
    }

    checkVersion();

    return () => { cancelled = true; };
  }, [changelogEntries]);

  const handleClose = useCallback(() => {
    setShowModal(false);
    if (newVersion) {
      try {
        localStorage.setItem(LAST_SEEN_VERSION_KEY, newVersion);
      } catch (e) {
        logger.warn('Failed to update localStorage on close', e);
      }
    }
  }, [newVersion]);

  return { showModal, newVersion, changelogEntries: matchedEntries, handleClose };
}

export default useVersionUpgradeCheck;
