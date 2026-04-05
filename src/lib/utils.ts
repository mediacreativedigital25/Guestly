/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EventDetails } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isEventExpired(event: EventDetails): boolean {
  if (event.subscriptionStatus === 'expired') return true;
  const expirationDate = getExpirationDate(event);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > expirationDate;
}

export function getExpirationDate(event: EventDetails): Date {
  // Use createdAt as the base for expiration (subscription start)
  const baseDate = event.createdAt 
    ? (event.createdAt.toDate ? event.createdAt.toDate() : new Date(event.createdAt)) 
    : new Date(event.date); // Fallback to wedding date if createdAt is missing
  const expirationDate = new Date(baseDate);
  expirationDate.setDate(baseDate.getDate() + (event.activeDays || 0));
  return expirationDate;
}

export function getDaysRemaining(event: EventDetails): number {
  const expirationDate = getExpirationDate(event);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = expirationDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}
