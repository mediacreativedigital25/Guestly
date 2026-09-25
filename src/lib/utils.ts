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
