/**
 * Utility functions for formatting dates, timestamps, and numbers.
 */

export function formatLocalDateTime(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp * 1000).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch (e) {
    return '';
  }
}

export function formatFullDateTime(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp * 1000).toLocaleString(undefined, {
      dateStyle: 'full',
      timeStyle: 'medium',
    });
  } catch (e) {
    return '';
  }
}

export function formatDateTimeIso(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp * 1000).toISOString().replace('.000', '');
  } catch (e) {
    return '';
  }
}

export function formatUnixTime(timestamp) {
  if (!timestamp) return 'Never';
  return formatLocalDateTime(timestamp);
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return 'just now';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
