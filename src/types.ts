export type Role = 'superadmin' | 'partner' | 'client';

export interface User {
  id?: string;
  role: Role;
  name: string;
  email: string;
  partnerId: string | null;
  clientId: string | null;
  businessName?: string;
  logoUrl?: string;
  phone?: string;
  eventQuota?: number;
  clientQuota?: number;
  guestQuota?: number;
  activeUntil?: any;
  createdAt: any;
  updatedAt: any;
}

export interface Partner {
  id?: string;
  name: string;
  logoUrl: string;
  brandColor: string;
  fontFamily?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Client {
  id?: string;
  partnerId: string;
  name: string;
  contactEmail?: string;
  phone?: string;
  createdAt: any;
  updatedAt: any;
}

export interface EventRecord {
  id?: string;
  partnerId: string;
  clientId: string;
  title: string;
  coupleName?: string;
  description?: string;
  date: string;
  time?: string;
  location?: string;
  digitalInviteLink?: string;
  frameOverlayUrl?: string;
  guestCategories?: string[];
  primaryColor?: string;
  fontFamily?: string;
  rsvpTheme?: string;
  status: 'draft' | 'published' | 'completed';
  activeUntil?: string;
  eventQuota?: number;
  guestQuota?: number;
  createdAt: any;
  updatedAt: any;
}

export interface Guest {
  id?: string;
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
  ticketCode: string;
  rsvpStatus: 'pending' | 'attending' | 'declined';
  wishes?: string;
  attended: boolean;
  attendedAt?: any;
  createdAt: any;
  updatedAt: any;
}

export interface GuestlyService {
  id?: string;
  name: string;
  description: string;
  type: 'package' | 'addon';
  targetRole: 'client' | 'partner' | 'all';
  activePeriodDays?: number;
  eventQuota?: number;
  clientQuota?: number;
  guestQuota?: number;
  price: number;
  normalPrice?: number;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface ChangelogEntry {
  id?: string;
  version: string;
  date: string;
  changes: string[];
  createdAt: any;
}
