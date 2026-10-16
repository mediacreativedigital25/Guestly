/**
 * Device and Session Management Utilities
 * Handles single active device identification, device name detection,
 * and 2-hour inactivity expiration.
 */

const DEVICE_STORAGE_KEY = 'guestly_device_id_v1';
export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Get or create a persistent unique Device ID for the current browser/device.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server_device';
  try {
    let id = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!id || id.trim().length === 0) {
      const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
      id = `dev_${randomPart}`;
      localStorage.setItem(DEVICE_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'temp_device_' + Date.now().toString(36);
  }
}

/**
 * Detect human-friendly device, OS, and browser name.
 * Example outputs: "Chrome di Windows (Desktop)", "Safari di iPhone (Mobile)"
 */
export function getDeviceName(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Perangkat Web';
  }

  const ua = navigator.userAgent || '';
  
  // Detect OS
  let os = 'Unknown OS';
  if (/Windows NT 10.0|Windows NT 11.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone/i.test(ua)) os = 'iPhone (iOS)';
  else if (/iPad/i.test(ua)) os = 'iPad (iPadOS)';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'Chrome OS';

  // Detect Browser
  let browser = 'Browser Web';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) browser = 'Google Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';

  // Detect Device Type
  const isMobile = /Mobile|Android|iPhone|iPad|Tablet/i.test(ua);
  const typeTag = isMobile ? 'Mobile' : 'Desktop';

  return `${browser} di ${os} (${typeTag})`;
}

/**
 * Check whether a device session has expired due to 2 hours of inactivity.
 * Returns true if expired (meaning auto-reset is allowed), false if still locked.
 */
export function isSessionExpired(lastActiveAt: any, maxAgeMs: number = INACTIVITY_TIMEOUT_MS): boolean {
  if (!lastActiveAt) return true; // No activity timestamp -> consider expired/free
  
  let timestampMs = 0;
  if (typeof lastActiveAt?.toMillis === 'function') {
    timestampMs = lastActiveAt.toMillis();
  } else if (typeof lastActiveAt?.toDate === 'function') {
    timestampMs = lastActiveAt.toDate().getTime();
  } else if (lastActiveAt instanceof Date) {
    timestampMs = lastActiveAt.getTime();
  } else if (typeof lastActiveAt === 'number') {
    timestampMs = lastActiveAt;
  } else if (typeof lastActiveAt === 'string') {
    timestampMs = Date.parse(lastActiveAt) || 0;
  }

  if (timestampMs <= 0) return true;

  const elapsedMs = Date.now() - timestampMs;
  return elapsedMs > maxAgeMs;
}

/**
 * Get milliseconds remaining until the 2-hour inactivity auto-reset.
 */
export function getTimeRemainingMs(lastActiveAt: any, maxAgeMs: number = INACTIVITY_TIMEOUT_MS): number {
  if (!lastActiveAt) return 0;
  
  let timestampMs = 0;
  if (typeof lastActiveAt?.toMillis === 'function') {
    timestampMs = lastActiveAt.toMillis();
  } else if (typeof lastActiveAt?.toDate === 'function') {
    timestampMs = lastActiveAt.toDate().getTime();
  } else if (lastActiveAt instanceof Date) {
    timestampMs = lastActiveAt.getTime();
  } else if (typeof lastActiveAt === 'number') {
    timestampMs = lastActiveAt;
  } else if (typeof lastActiveAt === 'string') {
    timestampMs = Date.parse(lastActiveAt) || 0;
  }

  if (timestampMs <= 0) return 0;

  const elapsedMs = Date.now() - timestampMs;
  const remaining = maxAgeMs - elapsedMs;
  return remaining > 0 ? remaining : 0;
}

/**
 * Format remaining time in human-friendly Indonesian format.
 * Example: "1 jam 25 menit" or "40 menit"
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0 menit (Dapat direset otomatis)';
  const totalMinutes = Math.ceil(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours} jam ${minutes > 0 ? `${minutes} menit` : ''}`;
  }
  return `${minutes} menit`;
}

/**
 * Format a timestamp into friendly relative time or date string in Indonesian.
 */
export function formatRelativeActivity(timestamp: any): string {
  if (!timestamp) return 'Belum ada aktivitas';

  let ms = 0;
  if (typeof timestamp?.toMillis === 'function') {
    ms = timestamp.toMillis();
  } else if (typeof timestamp?.toDate === 'function') {
    ms = timestamp.toDate().getTime();
  } else if (timestamp instanceof Date) {
    ms = timestamp.getTime();
  } else if (typeof timestamp === 'number') {
    ms = timestamp;
  } else if (typeof timestamp === 'string') {
    ms = Date.parse(timestamp) || 0;
  }

  if (ms <= 0) return 'Belum ada aktivitas';

  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit yang lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam yang lalu`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} hari yang lalu`;

  return new Date(ms).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
