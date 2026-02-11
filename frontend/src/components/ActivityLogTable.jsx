import PropTypes from 'prop-types';
import { formatRelativeTime } from '../utils/timeFormatters';
import './ActivityLogTable.css';

/**
 * Reusable activity log table component with pagination
 * @param {Object} props - Component props
 * @param {Array} props.events - Array of activity events
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 * @param {number} props.displayLimit - Current display limit
 * @param {boolean} props.hasMore - Whether more events are available
 * @param {Object} props.stats - Activity log statistics
 * @param {Function} props.onDisplayLimitChange - Handler for display limit changes
 * @param {Function} props.onLoadMore - Handler for loading more events
 */
const ActivityLogTable = ({
  events,
  loading,
  error,
  displayLimit,
  hasMore,
  stats,
  onDisplayLimitChange,
  onLoadMore
}) => {
  // Event type color mapping
  const getEventTypeColor = (entityType) => {
    const colorMap = {
      expense: '#2196F3',
      fixed_expense: '#9C27B0',
      loan: '#FF9800',
      investment: '#4CAF50',
      budget: '#009688',
      payment_method: '#3F51B5',
      backup: '#607D8B'
    };
    return colorMap[entityType] || '#757575';
  };

  // Extract event type from event_type field (e.g., "expense_created" -> "Created")
  const getEventTypeLabel = (eventType) => {
    if (!eventType) return '';
    const parts = eventType.split('_');
    const action = parts[parts.length - 1];
    return action.charAt(0).toUpperCase() + action.slice(1);
  };

  // Extract entity type from event_type field (e.g., "expense_created" -> "expense")
  const getEntityType = (eventType) => {
    if (!eventType) return 'unknown';
    const parts = eventType.split('_');
    return parts.slice(0, -1).join('_');
  };

  return (
    <div className="activity-log-table">
      <div className="activity-log-header">
        <h3>📋 Recent Activity</h3>
        <div className="activity-log-controls">
          <label htmlFor="activity-display-limit">Show:</label>
          <select
            id="activity-display-limit"
            value={displayLimit}
            onChange={(e) => onDisplayLimitChange(parseInt(e.target.value, 10))}
            disabled={loading}
            className="activity-limit-selector"
          >
            <option value="25">25 events</option>
            <option value="50">50 events</option>
            <option value="100">100 events</option>
            <option value="200">200 events</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="activity-error">
          {error}
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="activity-loading">Loading recent activity...</div>
      ) : events.length === 0 ? (
        <div className="activity-empty">
          <p>No recent activity to display.</p>
        </div>
      ) : (
        <>
          <div className="activity-event-list">
            {events.map((event) => {
              const entityType = getEntityType(event.event_type);
              const eventTypeLabel = getEventTypeLabel(event.event_type);
              const badgeColor = getEventTypeColor(entityType);

              return (
                <div key={event.id} className="activity-event-item">
                  <span className="activity-event-timestamp">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                  <span className="activity-event-separator">-</span>
                  <span 
                    className="activity-event-badge"
                    style={{ backgroundColor: badgeColor }}
                  >
                    {eventTypeLabel}
                  </span>
                  <span className="activity-event-separator">-</span>
                  <span className="activity-event-details">
                    {event.user_action}
                  </span>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="activity-load-more">
              <button
                onClick={onLoadMore}
                disabled={loading}
                className="activity-load-more-button"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}

          <div className="activity-event-count">
            Showing {events.length} of {stats?.currentCount || events.length} events
          </div>
        </>
      )}

      {stats && (
        <div className="activity-retention-info">
          <p>
            <strong>Retention Policy:</strong> Keeping last {stats.retentionDays} days or {stats.maxEntries} events
          </p>
        </div>
      )}
    </div>
  );
};

ActivityLogTable.propTypes = {
  events: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    user_action: PropTypes.string.isRequired,
    timestamp: PropTypes.string.isRequired,
    event_type: PropTypes.string.isRequired,
    entity_type: PropTypes.string,
    entity_id: PropTypes.number,
    metadata: PropTypes.object
  })).isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  displayLimit: PropTypes.number.isRequired,
  hasMore: PropTypes.bool.isRequired,
  stats: PropTypes.shape({
    currentCount: PropTypes.number,
    retentionDays: PropTypes.number,
    maxEntries: PropTypes.number
  }),
  onDisplayLimitChange: PropTypes.func.isRequired,
  onLoadMore: PropTypes.func.isRequired
};

export default ActivityLogTable;
