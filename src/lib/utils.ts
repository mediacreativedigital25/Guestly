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

export function getExpirationDate(dateString: string): Date {
  const date = new Date(dateString);
  date.setDate(date.getDate() + 30); // Or whatever default
  return date;
}

export function getDaysRemaining(dateString: string): number {
  const diff = getExpirationDate(dateString).getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 3600 * 24)));
}

export function isEventExpired(dateString: string): boolean {
  return getDaysRemaining(dateString) <= 0;
}
