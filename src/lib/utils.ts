import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Safely parse Firestore timestamp or serialized representation
export function parseFirestoreDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (typeof timestamp === 'number') return new Date(timestamp);
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) return d;
  }
  if (timestamp.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000);
  }
  if (timestamp._seconds !== undefined) {
    return new Date(timestamp._seconds * 1000); 
  }
  return null;
}

export function getExpirationDate(input: string | { date?: string; activeUntil?: string }): Date {
  const dateString = typeof input === 'string' ? input : (input?.activeUntil || input?.date || new Date().toISOString());
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return new Date();
  date.setDate(date.getDate() + 30); // Or whatever default
  return date;
}

export function getDaysRemaining(input: string | { date?: string; activeUntil?: string }): number {
  if (!input) return 0;
  const diff = getExpirationDate(input).getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 3600 * 24)));
}

export function isEventExpired(input: string | { date?: string; activeUntil?: string }): boolean {
  return getDaysRemaining(input) <= 0;
}

export function getRoleLabel(role?: string, staffType?: string): string {
  switch (role) {
    case 'superadmin':
      return 'Super Admin';
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'partner':
      return 'Partner';
    case 'client':
      return 'Client';
    case 'staff':
      if (staffType === 'checkin') return 'Staff Scan Kehadiran';
      if (staffType === 'souvenir') return 'Staff Souvenir';
      return 'Staff All-in (Scan & Souvenir)';
    default:
      return role || 'User';
  }
}

export function getOperatorLabel(user?: { name?: string; email?: string; role?: string; staffType?: string } | null): string {
  if (!user) return 'Petugas';
  const name = user.name || user.email || 'Petugas';
  const roleLabel = getRoleLabel(user.role, user.staffType);
  return `${name} (${roleLabel})`;
}

export function canUserAccessEvent(
  user?: { id?: string; role?: string; clientId?: string | null; partnerId?: string | null; assignedEventIds?: string[] } | null,
  eventId?: string
): boolean {
  if (!user || !eventId) return false;
  if (user.role === 'superadmin' || user.role === 'owner') return true;
  if (user.role === 'staff') {
    const assigned = Array.isArray(user.assignedEventIds) ? user.assignedEventIds : [];
    return assigned.includes(eventId);
  }
  if (user.role === 'admin') {
    const assigned = Array.isArray(user.assignedEventIds) ? user.assignedEventIds : [];
    // If admin has specific events assigned, restrict to those; if empty, allow all events
    return assigned.length === 0 ? true : assigned.includes(eventId);
  }
  return true;
}

