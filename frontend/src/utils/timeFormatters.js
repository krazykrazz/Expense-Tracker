/**
 * Format an ISO timestamp as relative time
 * @param {string} isoTimestamp - ISO 8601 timestamp string
 * @returns {string} Human-readable relative time
 */
export function formatRelativeTime(isoTimestamp) {
  try {
    const date = new Date(isoTimestamp);
    const now = new Date();

    // Handle invalid dates
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    // Handle future dates
    if (date > now) {
      return 'In the future';
    }

    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    // Less than 1 minute: "Just now"
    if (diffMinutes < 1) {
      return 'Just now';
    }

    // Less than 1 hour: "X minutes ago"
    if (diffHours < 1) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    }

    // Less than 24 hours: "X hours ago"
    if (diffDays < 1) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    }

    // Yesterday: "Yesterday at HH:MM"
    if (diffDays === 1) {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      return `Yesterday at ${displayHours}:${displayMinutes} ${ampm}`;
    }

    // Less than 7 days: "X days ago"
    if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    }

    // 7 days or more: Full date and time
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');

    return `${month} ${day} at ${displayHours}:${displayMinutes} ${ampm}`;
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return 'Unknown time';
  }
}
