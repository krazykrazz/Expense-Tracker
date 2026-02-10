import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';

/**
 * Custom hook for managing activity log data with pagination
 * @param {number} initialLimit - Initial display limit (default: 50)
 * @returns {Object} Activity log state and methods
 */
function useActivityLog(initialLimit = 50) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [displayLimit, setDisplayLimitState] = useState(() => {
    // Load display limit from localStorage
    try {
      const stored = localStorage.getItem('activityLogDisplayLimit');
      return stored ? parseInt(stored, 10) : initialLimit;
    } catch (err) {
      console.error('Failed to load display limit from localStorage:', err);
      return initialLimit;
    }
  });
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState(null);
  const [offset, setOffset] = useState(0);

  // Fetch activity events
  const fetchEvents = useCallback(async (newOffset = 0, limit = displayLimit) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_ENDPOINTS.ACTIVITY_LOGS}?offset=${newOffset}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch activity logs: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (newOffset === 0) {
        // Initial load or refresh
        setEvents(data.events || []);
      } else {
        // Load more - append to existing events
        setEvents(prev => [...prev, ...(data.events || [])]);
      }

      setHasMore(data.hasMore || false);
      setOffset(newOffset);
    } catch (err) {
      console.error('Error fetching activity logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [displayLimit]);

  // Fetch activity stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.ACTIVITY_LOGS_STATS);

      if (!response.ok) {
        throw new Error(`Failed to fetch activity stats: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching activity stats:', err);
      // Don't set error state for stats - it's not critical
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchEvents(0, displayLimit);
    fetchStats();
  }, [displayLimit, fetchEvents, fetchStats]);

  // Set display limit with localStorage persistence
  const setDisplayLimit = useCallback((limit) => {
    try {
      localStorage.setItem('activityLogDisplayLimit', limit.toString());
    } catch (err) {
      console.error('Failed to save display limit to localStorage:', err);
    }
    setDisplayLimitState(limit);
    // Reset to beginning when limit changes
    setOffset(0);
  }, []);

  // Load more events
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      const newOffset = offset + displayLimit;
      fetchEvents(newOffset, displayLimit);
    }
  }, [loading, hasMore, offset, displayLimit, fetchEvents]);

  // Refresh events (reset to beginning)
  const refresh = useCallback(() => {
    setOffset(0);
    fetchEvents(0, displayLimit);
    fetchStats();
  }, [displayLimit, fetchEvents, fetchStats]);

  return {
    events,
    loading,
    error,
    displayLimit,
    hasMore,
    stats,
    setDisplayLimit,
    loadMore,
    refresh
  };
}

export default useActivityLog;
