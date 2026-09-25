export type Role = 'superadmin' | 'partner' | 'client' | 'reseller' | 'staff' | 'admin';

export interface User {
  id?: string;
  uid?: string;
  role: Role;
  name: string;
  email: string;
  package?: string;
  partnerId: string | null;
  clientId: string | null;
  businessName?: string;
  brandName?: string;
  brandLogo?: string;
  logoUrl?: string;
  bannerUrl?: string;
  brandingImageUrl?: string;
  phone?: string;
  fonnteToken?: string;
  eventQuota?: number;
  clientQuota?: number;
  guestQuota?: number;
  waBlastQuota?: number;
  clientCredit?: number;
  eventCredit?: number;
  eventsCreated?: number;
  belongsToReseller?: string;
  allowManualEvent?: boolean;
  eventManual?: boolean;
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
  clientUid?: string;
  clientEmail?: string;
  resellerUid?: string;
  activeDays?: number;
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
  subscriptionStatus?: 'active' | 'expired';
  slug?: string;
  maxGuests?: number;
  maxStaff?: number;
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
  tableNumber?: string;
  pax?: number;
  ticketCode: string;
  rsvpStatus: 'pending' | 'attending' | 'declined';
  wishes?: string;
  stickerUrl?: string;
  attended: boolean;
  attendedAt?: any;
  attendance?: string;
  message?: string;
  reply?: string;
  timestamp?: any;
  checkInTime?: any;
  hasResponded?: boolean;
  souvenirTaken?: boolean;
  souvenirClaimed?: boolean;
  souvenirTakenAt?: any;
  souvenirId?: string;
  souvenirName?: string;
  souvenirQuantity?: number;
  souvenirTakenBy?: string;
  createdAt: any;
  updatedAt: any;
}

export interface SouvenirItem {
  id?: string;
  eventId: string;
  name: string;
  category?: string;
  initialStock: number;
  totalDistributed: number;
  remainingStock: number;
  physicalStockAudit?: number;
  lastAuditAt?: any;
  lastAuditBy?: string;
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

export interface SouvenirLog {
  id?: string;
  eventId: string;
  souvenirId: string;
  souvenirName: string;
  guestId?: string;
  guestName: string;
  ticketCode?: string;
  quantity: number;
  action: 'TAKE' | 'RETURN' | 'ADJUSTMENT';
  notes?: string;
  performedBy?: string;
  timestamp: any;
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
