/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AttendanceStatus = 'hadir' | 'tidak_hadir' | 'ragu_ragu';
export type UserRole = 'admin' | 'client' | 'guest' | 'reseller' | 'staff';

export type PackageTier = 'trial' | 'lite' | 'standard' | 'pro';

export interface GuestEntry {
  id?: string;
  name: string;
  message: string;
  reply?: string;
  attendance: AttendanceStatus;
  timestamp: any;
  eventId: string;
  souvenirClaimed?: boolean;
  souvenirType?: string;
  checkInTime?: any;
}

export interface EventDetails {
  id: string;
  title: string;
  date: string;
  location: string;
  coverImage?: string;
  clientUid: string;
  clientEmail?: string;
  resellerUid?: string;
  subscriptionStatus: 'active' | 'expired';
  slug: string;
  maxGuests: number;
  maxStaff: number;
  maxSouvenirTypes: number;
  souvenirTypes: string[];
  activeDays: number;
  features?: string[];
  invitationUrl?: string;
  createdAt?: any;
}

export interface AppUser {
  uid: string;
  email: string;
  name?: string;
  phone?: string;
  brandName?: string;
  brandLogo?: string;
  password?: string;
  role: UserRole;
  eventId?: string;
  eventQuota?: number;
  eventsCreated?: number;
  package?: PackageTier;
  fonnteToken?: string;
}
