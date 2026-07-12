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
  bannerUrl?: string;
  brandingImageUrl?: string;
  phone?: string;
  fonnteToken?: string;
  eventQuota?: number;
  clientQuota?: number;
  guestQuota?: number;
  waBlastQuota?: number;
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
  fonnteToken?: string;
  createdAt: any;
  updatedAt: any;
}

export interface EventRecord {
  souvenirTypes?: string[];
  invitationUrl?: string;
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
  thumbnailUrl?: string;
  guestCategories?: string[];
  sessions?: string[];
  primaryColor?: string;
  fontFamily?: string;
  rsvpTheme?: string;
  status: 'draft' | 'published' | 'completed';
  activeUntil?: string;
  eventQuota?: number;
  guestQuota?: number;
  waTemplateId?: string;
  waBlastCount?: number;
  disableTicketRsvpForm?: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface WATemplate {
  id?: string;
  name: string;
  content: string; // The message template
  createdAt: any;
  updatedAt: any;
}

export interface Guest {
  id?: string;
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  fonnteToken?: string;
  address?: string;
  category?: string;
  session?: string;
  ticketCode: string;
  rsvpStatus: 'pending' | 'attending' | 'declined';
  wishes?: string;
  stickerUrl?: string;
  attended: boolean;
  attendedAt?: any;
  hasResponded?: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface GuestEditRequest {
  id?: string;
  eventId: string;
  eventTitle: string;
  guestId: string;
  clientId: string;
  partnerId?: string | null;
  originalData: Partial<Guest>;
  requestedData: Partial<Guest>;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: any;
  resolvedAt?: any;
  type?: 'add' | 'edit' | 'delete';
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
  waBlastQuota?: number;
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

export interface Testimonial {
  id?: string;
  name: string;
  role: string;
  content: string;
  rating: number;
  createdAt: any;
  status: 'pending' | 'approved';
}

export type AttendanceStatus = 'pending' | 'attending' | 'declined';

export type AppUser = User;
export type PackageTier = 'trial' | 'lite' | 'standard' | 'pro';
export interface GuestbookEntry {
  id?: string;
  name: string;
  message: string;
  attendance: 'hadir' | 'tidak_hadir' | 'ragu_ragu';
  reply?: string;
  timestamp: any;
}
