/**
 * Device and Session Management Utilities
 * Handles active device identification, multi-device quota per role
 * (Client = 2 devices, Super Admin & Layar Sapa = unlimited, others = 1 device),
 * device name detection, and 2-hour inactivity expiration.
 */

import type { ActiveDeviceSession } from '../types';

const DEVICE_STORAGE_KEY = 'guestly_device_id_v1';
export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

// In-memory handshake guard so AuthContext onSnapshot does not kick out
// a newly signing-in device before AppLayout finishes validating/registering its slot.
let loginHandshakeInProgress = false;

export function setLoginHandshakeActive(active: boolean): void {
  loginHandshakeInProgress = active;
}

export function isLoginHandshakeActive(): boolean {
  return loginHandshakeInProgress;
}

/**
 * Maximum concurrent active devices allowed per role.
 * - superadmin / greeting: unlimited (Infinity)
 * - client: 2 devices
 * - owner / partner / admin / staff / reseller: 1 device
 */
export function getMaxDevicesForRole(role?: string | null): number {
  if (role === 'superadmin' || role === 'greeting') return Infinity;
  if (role === 'client') return 2;
  return 1;
}

/**
 * Safely convert Firestore Timestamp / Date / number / string into epoch ms.
 */
export function toMillisSafe(timestamp: any): number {
  if (!timestamp) return 0;
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate().getTime();
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'number') return Number.isFinite(timestamp) ? timestamp : 0;
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Normalize a user document's active device sessions into an array.
 * Backward-compatible with legacy single-device fields (activeDeviceId / activeDeviceName).
 */
export function normalizeUserDevices(userData: any): ActiveDeviceSession[] {
  if (!userData) return [];

  if (Array.isArray(userData.activeDevices)) {
    const seen = new Map<string, ActiveDeviceSession>();
    for (const raw of userData.activeDevices) {
      if (!raw || typeof raw.deviceId !== 'string' || !raw.deviceId.trim()) continue;
      const lastActiveMs = toMillisSafe(raw.lastActiveAt) || Date.now();
      const loggedInMs = toMillisSafe(raw.loggedInAt) || lastActiveMs;
      const prev = seen.get(raw.deviceId);
      if (!prev || lastActiveMs >= prev.lastActiveAt) {
        seen.set(raw.deviceId, {
          deviceId: raw.deviceId,
          deviceName: raw.deviceName || 'Perangkat Web',
          lastActiveAt: lastActiveMs,
          loggedInAt: loggedInMs,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  // Fallback for legacy documents that only have activeDeviceId
  if (typeof userData.activeDeviceId === 'string' && userData.activeDeviceId.trim()) {
    const lastActiveMs = toMillisSafe(userData.lastActiveAt) || Date.now();
    const loggedInMs = toMillisSafe(userData.lastLoginAt) || lastActiveMs;
    return [
      {
        deviceId: userData.activeDeviceId,
        deviceName: userData.activeDeviceName || 'Perangkat Web',
        lastActiveAt: lastActiveMs,
        loggedInAt: loggedInMs,
      },
    ];
  }

  return [];
}

/**
 * Filter active device sessions to only those that have NOT expired (> 2h idle).
 */
export function getNonExpiredDevices(
  devices: ActiveDeviceSession[],
  maxAgeMs: number = INACTIVITY_TIMEOUT_MS
): ActiveDeviceSession[] {
  return devices.filter((d) => !isSessionExpired(d.lastActiveAt, maxAgeMs));
}

/**
 * Compute legacy single-device mirror fields from the normalized activeDevices array.
 */
export function buildLegacyDeviceFields(devices: ActiveDeviceSession[]): {
  activeDeviceId: string | null;
  activeDeviceName: string | null;
} {
  if (!devices || devices.length === 0) {
    return { activeDeviceId: null, activeDeviceName: null };
  }
  const sorted = [...devices].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return {
    activeDeviceId: sorted[0].deviceId,
    activeDeviceName:
      sorted.length === 1
        ? sorted[0].deviceName
        : `${sorted[0].deviceName} (+${sorted.length - 1} perangkat)`,
  };
}

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
  const timestampMs = toMillisSafe(lastActiveAt);
  if (timestampMs <= 0) return true; // No activity timestamp -> consider expired/free

  const elapsedMs = Date.now() - timestampMs;
  return elapsedMs > maxAgeMs;
}

/**
 * Get milliseconds remaining until the 2-hour inactivity auto-reset.
 */
export function getTimeRemainingMs(lastActiveAt: any, maxAgeMs: number = INACTIVITY_TIMEOUT_MS): number {
  const timestampMs = toMillisSafe(lastActiveAt);
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
    return `${hours} jam ${minutes > 0 ? `${minutes} menit` : ''}`.trim();
  }
  return `${minutes} menit`;
}

/**
 * Format a timestamp into friendly relative time or date string in Indonesian.
 */
export function formatRelativeActivity(timestamp: any): string {
  const ms = toMillisSafe(timestamp);
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
