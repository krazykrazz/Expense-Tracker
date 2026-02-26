import { useState, useEffect, useRef, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import { authAwareFetch } from '../utils/fetchProvider';

/** Retry delays for initial version capture: 1s, 2s, 4s */
const RETRY_DELAYS = [1000, 2000, 4000];
const MAX_RETRIES = 3;
const DEBOUNCE_WINDOW_MS = 5000;

/**
 * Fetch version info from the backend.
 * Returns { version, startupId } or throws on failure/malformed response.
 */
async function fetchVersionInfo() {
  const response = await authAwareFetch(API_ENDPOINTS.VERSION);
  if (!response.ok) {
    throw new Error(`Version endpoint returned ${response.status}`);
  }
  const data = await response.json();
  if (!data.version || !data.startupId) {
    throw new Error('Malformed version response');
  }
  return { version: data.version, startupId: data.startupId };
}

/**
 * Hook that captures the baseline version/startupId on mount and
 * provides an onSseReconnect callback for useDataSync.
 *
 * On mount, fetches /api/version with exponential backoff retry (up to 3 attempts).
 * On SSE reconnect, compares current version against baseline to detect container updates.
 * Includes debounce (5s window), in-flight dedup, and banner-visible suppression.
 *
 * @returns {{
 *   showBanner: boolean,
 *   newVersion: string|null,
 *   dismissBanner: () => void,
 *   onSseReconnect: () => void
 * }}
 */
export function useContainerUpdateCheck() {
  const [showBanner, setShowBanner] = useState(false);
  const [newVersion, setNewVersion] = useState(null);

  const baselineRef = useRef(null);
  const unmountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const showBannerRef = useRef(false);

  // Keep showBannerRef in sync with state for use in callbacks
  useEffect(() => {
    showBannerRef.current = showBanner;
  }, [showBanner]);

  // Initial version capture with exponential backoff retry
  useEffect(() => {
    unmountedRef.current = false;
    let retryTimer = null;

    async function captureBaseline(attempt) {
      try {
        const info = await fetchVersionInfo();
        if (!unmountedRef.current) {
          baselineRef.current = info;
        }
      } catch {
        if (unmountedRef.current) return;
        if (attempt < MAX_RETRIES) {
          retryTimer = setTimeout(() => {
            if (!unmountedRef.current) {
              captureBaseline(attempt + 1);
            }
          }, RETRY_DELAYS[attempt]);
        }
        // After MAX_RETRIES failures, baseline stays null
      }
    }

    captureBaseline(0);

    return () => {
      unmountedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  /**
   * Perform the actual version check against baseline.
   * Called after debounce/dedup gates pass.
   */
  const performVersionCheck = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const info = await fetchVersionInfo();
      if (unmountedRef.current) return;

      // Null baseline adoption: adopt fetched values without triggering mismatch
      if (baselineRef.current === null) {
        baselineRef.current = info;
        return;
      }

      // Mismatch detection
      if (
        info.version !== baselineRef.current.version ||
        info.startupId !== baselineRef.current.startupId
      ) {
        setShowBanner(true);
        setNewVersion(info.version);
      }
    } catch {
      // Silent skip on fetch error — no banner, no throw
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  /**
   * SSE reconnect callback — wired into useDataSync's onReconnect.
   * Applies banner-visible suppression, debounce, and dedup before checking.
   */
  const onSseReconnect = useCallback(() => {
    // Banner-visible suppression: skip if banner already showing
    if (showBannerRef.current) return;

    // In-flight dedup: skip if a request is already running
    if (inFlightRef.current) return;

    // Debounce: collapse rapid reconnects into one fetch per 5s window
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (!unmountedRef.current && !showBannerRef.current) {
        performVersionCheck();
      }
    }, DEBOUNCE_WINDOW_MS);
  }, [performVersionCheck]);

  /**
   * Dismiss the update banner. Allows subsequent mismatches to re-show it.
   */
  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    setNewVersion(null);
  }, []);

  return { showBanner, newVersion, dismissBanner, onSseReconnect };
}

export default useContainerUpdateCheck;
