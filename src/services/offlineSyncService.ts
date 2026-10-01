import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { supabaseDb } from '../lib/supabaseDb';
import { EventRecord, Guest, SouvenirItem } from '../types';
import { souvenirStorage } from './souvenirStorage';

const OFFLINE_GUESTS_PREFIX = 'guestly_offline_guests_';
const OFFLINE_META_PREFIX = 'guestly_offline_meta_';
const OFFLINE_QUEUE_PREFIX = 'guestly_sync_queue_';
const OFFLINE_FORCE_PREFIX = 'guestly_force_offline_';
const OFFLINE_EVENT_PREFIX = 'guestly_offline_event_';

export interface OfflineSnapshotMeta {
  updatedAt: string | null;
  count: number;
}

export interface OfflineSyncItem {
  id: string;
  eventId: string;
  guestId: string;
  ticketCode: string;
  guestName: string;
  category?: string;
  session?: string;
  mode: 'checkin' | 'checkin_souvenir' | 'souvenir_only';
  attended: boolean;
  attendedAt: string;
  checkInStaff: string;
  souvenirGiven: boolean;
  souvenirId?: string;
  souvenirName?: string;
  souvenirTakenAt?: string;
  souvenirTakenBy?: string;
  createdAt: string;
  retryCount: number;
}

export interface OfflineProcessResult {
  name: string;
  category: string;
  session: string;
  souvenirGiven: boolean;
  souvenirName?: string;
  guestDocId: string;
  mode: 'checkin' | 'checkin_souvenir' | 'souvenir_only';
  wasAlreadyAttended: boolean;
  processedOffline: boolean;
}

const activeFlushLocks = new Set<string>();
const memorySnapshotCache = new Map<string, Guest[]>();
const debouncedSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSnapshotPersist(eventId: string, guests: Guest[]) {
  if (typeof window === 'undefined' || !eventId) return;
  const prevTimer = debouncedSaveTimers.get(eventId);
  if (prevTimer) clearTimeout(prevTimer);

  const timer = setTimeout(() => {
    debouncedSaveTimers.delete(eventId);
    try {
      localStorage.setItem(`${OFFLINE_GUESTS_PREFIX}${eventId}`, JSON.stringify(guests));
      const meta: OfflineSnapshotMeta = {
        updatedAt: new Date().toISOString(),
        count: guests.length,
      };
      localStorage.setItem(`${OFFLINE_META_PREFIX}${eventId}`, JSON.stringify(meta));
    } catch (e) {
      console.warn('Failed to persist offline guests snapshot:', e);
    }
  }, 300);

  debouncedSaveTimers.set(eventId, timer);
}

function notifyQueueChanged(eventId: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('guestly_offline_queue_changed', { detail: { eventId } })
    );
  }
}

function broadcastLocalGreeting(eventId: string, payload: any) {
  if (typeof window === 'undefined') return;
  try {
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel(`guestly_greeting_${eventId}`);
      bc.postMessage({ type: 'GUEST_ARRIVAL', payload });
      bc.close();
    }
    localStorage.setItem(
      `guestly_local_greeting_ping_${eventId}`,
      JSON.stringify({ ...payload, _ts: Date.now() })
    );
  } catch {
    // ignore broadcast errors
  }
}

export const offlineSyncService = {
  // ================= FORCE OFFLINE MODE =================
  isForceOffline(eventId: string): boolean {
    if (!eventId || typeof window === 'undefined') return false;
    return localStorage.getItem(`${OFFLINE_FORCE_PREFIX}${eventId}`) === 'true';
  },

  setForceOffline(eventId: string, enabled: boolean): void {
    if (!eventId || typeof window === 'undefined') return;
    if (enabled) {
      localStorage.setItem(`${OFFLINE_FORCE_PREFIX}${eventId}`, 'true');
    } else {
      localStorage.removeItem(`${OFFLINE_FORCE_PREFIX}${eventId}`);
    }
    notifyQueueChanged(eventId);
  },

  // ================= EVENT CACHE (FOR GREETING SCREEN & SCANNER) =================
  saveEventSnapshot(eventId: string, event: EventRecord, partnerLogoUrl?: string | null): void {
    if (!eventId || typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        `${OFFLINE_EVENT_PREFIX}${eventId}`,
        JSON.stringify({ event, partnerLogoUrl: partnerLogoUrl || null, savedAt: new Date().toISOString() })
      );
    } catch (e) {
      console.warn('Failed to cache event snapshot locally:', e);
    }
  },

  getEventSnapshot(eventId: string): { event: EventRecord; partnerLogoUrl: string | null } | null {
    if (!eventId || typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`${OFFLINE_EVENT_PREFIX}${eventId}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  // ================= GUEST SNAPSHOT CACHE =================
  saveGuestsSnapshot(eventId: string, guests: Guest[], immediate = false): Guest[] {
    if (!eventId || typeof window === 'undefined') return guests;
    const mergedWithQueue = this.mergeGuestsWithPendingQueue(eventId, guests);
    memorySnapshotCache.set(eventId, mergedWithQueue);

    if (immediate) {
      try {
        localStorage.setItem(`${OFFLINE_GUESTS_PREFIX}${eventId}`, JSON.stringify(mergedWithQueue));
        const meta: OfflineSnapshotMeta = {
          updatedAt: new Date().toISOString(),
          count: mergedWithQueue.length,
        };
        localStorage.setItem(`${OFFLINE_META_PREFIX}${eventId}`, JSON.stringify(meta));
      } catch (e) {
        console.warn('Failed to save offline guests snapshot:', e);
      }
    } else {
      scheduleSnapshotPersist(eventId, mergedWithQueue);
    }
    return mergedWithQueue;
  },

  getGuestsSnapshot(eventId: string): Guest[] {
    if (!eventId || typeof window === 'undefined') return [];
    const inMem = memorySnapshotCache.get(eventId);
    if (inMem && inMem.length > 0) {
      return this.mergeGuestsWithPendingQueue(eventId, inMem);
    }
    try {
      const raw = localStorage.getItem(`${OFFLINE_GUESTS_PREFIX}${eventId}`);
      if (!raw) return [];
      const parsed: Guest[] = JSON.parse(raw);
      memorySnapshotCache.set(eventId, parsed);
      return this.mergeGuestsWithPendingQueue(eventId, parsed);
    } catch {
      return [];
    }
  },

  getSnapshotMeta(eventId: string): OfflineSnapshotMeta {
    if (!eventId || typeof window === 'undefined') return { updatedAt: null, count: 0 };
    const inMem = memorySnapshotCache.get(eventId);
    try {
      const raw = localStorage.getItem(`${OFFLINE_META_PREFIX}${eventId}`);
      if (!raw) {
        const guests = inMem || this.getGuestsSnapshot(eventId);
        return { updatedAt: null, count: guests.length };
      }
      const parsed = JSON.parse(raw) as OfflineSnapshotMeta;
      if (inMem && inMem.length > 0) {
        return { ...parsed, count: inMem.length };
      }
      return parsed;
    } catch {
      return { updatedAt: null, count: inMem ? inMem.length : 0 };
    }
  },

  updateGuestInSnapshot(eventId: string, guestId: string, updates: Partial<Guest>): void {
    if (!eventId || !guestId || typeof window === 'undefined') return;
    try {
      const current = this.getGuestsSnapshot(eventId);
      if (current.length === 0) return;
      let found = false;
      const updated = current.map((g) => {
        if (g.id === guestId) {
          found = true;
          return { ...g, ...updates };
        }
        return g;
      });
      if (!found && updates.name) {
        updated.unshift({ id: guestId, eventId, ...updates } as Guest);
      }
      memorySnapshotCache.set(eventId, updated);
      scheduleSnapshotPersist(eventId, updated);
    } catch (e) {
      console.warn('Failed to update guest in local snapshot:', e);
    }
  },

  // ================= SYNC QUEUE (OUTBOX) =================
  getSyncQueue(eventId: string): OfflineSyncItem[] {
    if (!eventId || typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`${OFFLINE_QUEUE_PREFIX}${eventId}`);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  saveSyncQueue(eventId: string, queue: OfflineSyncItem[]): void {
    if (!eventId || typeof window === 'undefined') return;
    try {
      localStorage.setItem(`${OFFLINE_QUEUE_PREFIX}${eventId}`, JSON.stringify(queue));
      notifyQueueChanged(eventId);
    } catch (e) {
      console.warn('Failed to save offline sync queue:', e);
    }
  },

  enqueueSyncItem(
    eventId: string,
    item: Omit<OfflineSyncItem, 'id' | 'createdAt' | 'retryCount'>
  ): OfflineSyncItem {
    const queue = this.getSyncQueue(eventId);
    const existingIdx = queue.findIndex((q) => q.guestId === item.guestId);

    const newItem: OfflineSyncItem = {
      ...item,
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    if (existingIdx >= 0) {
      const prev = queue[existingIdx];
      queue[existingIdx] = {
        ...prev,
        ...newItem,
        attended: prev.attended || newItem.attended,
        attendedAt: prev.attendedAt || newItem.attendedAt,
        checkInStaff: prev.checkInStaff || newItem.checkInStaff,
        souvenirGiven: prev.souvenirGiven || newItem.souvenirGiven,
        souvenirId: newItem.souvenirId || prev.souvenirId,
        souvenirName: newItem.souvenirName || prev.souvenirName,
        souvenirTakenAt: newItem.souvenirTakenAt || prev.souvenirTakenAt,
        souvenirTakenBy: newItem.souvenirTakenBy || prev.souvenirTakenBy,
      };
    } else {
      queue.push(newItem);
    }

    this.saveSyncQueue(eventId, queue);

    // Broadcast immediately to same-device tabs (e.g. GreetingScreen on same laptop)
    broadcastLocalGreeting(eventId, {
      id: item.guestId,
      event_id: eventId,
      name: item.guestName,
      ticket_code: item.ticketCode,
      category: item.category,
      session: item.session,
      attended: true,
      check_in_time: item.attendedAt,
    });

    return newItem;
  },

  mergeGuestsWithPendingQueue(eventId: string, guests: Guest[]): Guest[] {
    if (!eventId || !guests || guests.length === 0) return guests || [];
    const queue = this.getSyncQueue(eventId);
    if (queue.length === 0) return guests;

    const queueByGuestId = new Map<string, OfflineSyncItem>();
    const queueByTicket = new Map<string, OfflineSyncItem>();
    for (const item of queue) {
      if (item.guestId) queueByGuestId.set(item.guestId, item);
      if (item.ticketCode) queueByTicket.set(item.ticketCode.toUpperCase(), item);
    }

    return guests.map((g) => {
      const pending =
        (g.id && queueByGuestId.get(g.id)) ||
        (g.ticketCode && queueByTicket.get(g.ticketCode.toUpperCase()));
      if (!pending) return g;

      return {
        ...g,
        attended: g.attended || pending.attended,
        attendedAt: g.attendedAt || pending.attendedAt,
        checkInTime: g.checkInTime || pending.attendedAt,
        checkInStaff: g.checkInStaff || pending.checkInStaff,
        souvenirTaken: g.souvenirTaken || pending.souvenirGiven,
        souvenirId: g.souvenirId || pending.souvenirId,
        souvenirName: g.souvenirName || pending.souvenirName,
        souvenirTakenAt: g.souvenirTakenAt || pending.souvenirTakenAt,
        souvenirTakenBy: g.souvenirTakenBy || pending.souvenirTakenBy,
      };
    });
  },

  // ================= INSTANT LOCAL VERIFICATION (< 10ms) =================
  processTicketLocally(params: {
    eventId: string;
    ticketCode: string;
    stationMode: 'checkin' | 'checkin_souvenir' | 'souvenir_only';
    activeSouvenir?: SouvenirItem;
    currentOperator: string;
    inMemoryGuests: Guest[];
  }): OfflineProcessResult {
    const { eventId, ticketCode, stationMode, activeSouvenir, currentOperator, inMemoryGuests } = params;
    const normalizedCode = ticketCode.trim().toUpperCase();

    // Combine snapshot and in-memory guests
    const snapshotGuests = this.getGuestsSnapshot(eventId);
    const sourceList = snapshotGuests.length >= inMemoryGuests.length ? snapshotGuests : inMemoryGuests;
    const mergedList = souvenirStorage.mergeGuestsWithSouvenirs(
      eventId,
      this.mergeGuestsWithPendingQueue(eventId, sourceList)
    );

    const guest = mergedList.find(
      (g) => (g.ticketCode || '').trim().toUpperCase() === normalizedCode
    );

    if (!guest || !guest.id) {
      const err = new Error('TICKET_NOT_FOUND_LOCALLY');
      throw err;
    }

    const guestDocId = guest.id;
    const nowIso = new Date().toISOString();

    if (stationMode === 'souvenir_only') {
      const isAlreadyTaken = guest.souvenirTaken || souvenirStorage.isGuestTaken(eventId, guestDocId);
      if (isAlreadyTaken) {
        const localTaken = souvenirStorage.getGuestTakenInfo(eventId, guestDocId);
        const error: any = new Error('ALREADY_TAKEN_SOUVENIR');
        error.souvenirTakenAt = guest.souvenirTakenAt || localTaken?.takenAt;
        error.guestName = guest.name;
        error.souvenirName = guest.souvenirName || localTaken?.souvenirName || 'Souvenir';
        error.souvenirTakenBy = guest.souvenirTakenBy || localTaken?.takenBy;
        throw error;
      }

      if (!activeSouvenir || !activeSouvenir.id) {
        throw new Error('NO_SOUVENIR_CONFIGURED');
      }

      if ((activeSouvenir.remainingStock || 0) <= 0) {
        const error: any = new Error('OUT_OF_STOCK');
        error.guestName = guest.name;
        throw error;
      }

      const attendedAtVal = guest.attendedAt || nowIso;
      const checkInStaffVal = guest.checkInStaff || currentOperator;

      this.updateGuestInSnapshot(eventId, guestDocId, {
        attended: true,
        attendedAt: attendedAtVal,
        checkInTime: attendedAtVal,
        checkInStaff: checkInStaffVal,
        souvenirTaken: true,
        souvenirTakenAt: nowIso,
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        souvenirQuantity: 1,
        souvenirTakenBy: currentOperator,
        updatedAt: nowIso,
      });

      this.enqueueSyncItem(eventId, {
        eventId,
        guestId: guestDocId,
        ticketCode: normalizedCode,
        guestName: guest.name,
        category: guest.category || '',
        session: guest.session || '',
        mode: 'souvenir_only',
        attended: true,
        attendedAt: typeof attendedAtVal === 'string' ? attendedAtVal : nowIso,
        checkInStaff: checkInStaffVal,
        souvenirGiven: true,
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        souvenirTakenAt: nowIso,
        souvenirTakenBy: currentOperator,
      });

      return {
        name: guest.name,
        category: guest.category || '',
        session: guest.session || '',
        souvenirGiven: true,
        souvenirName: activeSouvenir.name,
        guestDocId,
        mode: 'souvenir_only',
        wasAlreadyAttended: !!guest.attended,
        processedOffline: true,
      };
    } else if (stationMode === 'checkin_souvenir') {
      if (guest.attended) {
        const error: any = new Error('ALREADY_ATTENDED');
        error.attendedAt = guest.attendedAt;
        error.guestName = guest.name;
        error.category = guest.category;
        error.checkInStaff = guest.checkInStaff;
        error.souvenirTaken = guest.souvenirTaken || souvenirStorage.isGuestTaken(eventId, guestDocId);
        throw error;
      }

      let souvenirGiven = false;
      let targetSouvenirName = '';
      let targetSouvenirId = '';

      const isAlreadyTaken = guest.souvenirTaken || souvenirStorage.isGuestTaken(eventId, guestDocId);
      if (activeSouvenir && activeSouvenir.id && !isAlreadyTaken && (activeSouvenir.remainingStock || 0) > 0) {
        souvenirGiven = true;
        targetSouvenirName = activeSouvenir.name;
        targetSouvenirId = activeSouvenir.id;
      }

      this.updateGuestInSnapshot(eventId, guestDocId, {
        attended: true,
        attendedAt: nowIso,
        checkInTime: nowIso,
        checkInStaff: currentOperator,
        ...(souvenirGiven
          ? {
              souvenirTaken: true,
              souvenirTakenAt: nowIso,
              souvenirId: targetSouvenirId,
              souvenirName: targetSouvenirName,
              souvenirQuantity: 1,
              souvenirTakenBy: currentOperator,
            }
          : {}),
        updatedAt: nowIso,
      });

      this.enqueueSyncItem(eventId, {
        eventId,
        guestId: guestDocId,
        ticketCode: normalizedCode,
        guestName: guest.name,
        category: guest.category || '',
        session: guest.session || '',
        mode: 'checkin_souvenir',
        attended: true,
        attendedAt: nowIso,
        checkInStaff: currentOperator,
        souvenirGiven,
        souvenirId: souvenirGiven ? targetSouvenirId : undefined,
        souvenirName: souvenirGiven ? targetSouvenirName : undefined,
        souvenirTakenAt: souvenirGiven ? nowIso : undefined,
        souvenirTakenBy: souvenirGiven ? currentOperator : undefined,
      });

      return {
        name: guest.name,
        category: guest.category || '',
        session: guest.session || '',
        souvenirGiven,
        souvenirName: targetSouvenirName,
        guestDocId,
        mode: 'checkin_souvenir',
        wasAlreadyAttended: false,
        processedOffline: true,
      };
    } else {
      // CHECK-IN ONLY
      if (guest.attended) {
        const error: any = new Error('ALREADY_ATTENDED');
        error.attendedAt = guest.attendedAt;
        error.guestName = guest.name;
        error.category = guest.category;
        error.checkInStaff = guest.checkInStaff;
        throw error;
      }

      this.updateGuestInSnapshot(eventId, guestDocId, {
        attended: true,
        attendedAt: nowIso,
        checkInTime: nowIso,
        checkInStaff: currentOperator,
        updatedAt: nowIso,
      });

      this.enqueueSyncItem(eventId, {
        eventId,
        guestId: guestDocId,
        ticketCode: normalizedCode,
        guestName: guest.name,
        category: guest.category || '',
        session: guest.session || '',
        mode: 'checkin',
        attended: true,
        attendedAt: nowIso,
        checkInStaff: currentOperator,
        souvenirGiven: false,
      });

      return {
        name: guest.name,
        category: guest.category || '',
        session: guest.session || '',
        souvenirGiven: false,
        guestDocId,
        mode: 'checkin',
        wasAlreadyAttended: false,
        processedOffline: true,
      };
    }
  },

  // ================= BACKGROUND & MANUAL SYNC FLUSH =================
  async flushSyncQueue(
    eventId: string,
    options: { ignoreForceOffline?: boolean } = {}
  ): Promise<{ synced: number; remaining: number }> {
    if (!eventId || typeof window === 'undefined') return { synced: 0, remaining: 0 };
    const queue = this.getSyncQueue(eventId);
    if (queue.length === 0) return { synced: 0, remaining: 0 };

    if (!navigator.onLine) {
      return { synced: 0, remaining: queue.length };
    }

    if (!options.ignoreForceOffline && this.isForceOffline(eventId)) {
      return { synced: 0, remaining: queue.length };
    }

    if (activeFlushLocks.has(eventId)) {
      return { synced: 0, remaining: queue.length };
    }

    activeFlushLocks.add(eventId);
    let syncedCount = 0;
    const remainingQueue: OfflineSyncItem[] = [];

    try {
      for (const item of queue) {
        try {
          // 1. Single direct update to Supabase guests table by primary key
          await supabaseDb.updateGuest(item.guestId, {
            attended: item.attended,
            attendedAt: item.attendedAt,
            checkInTime: item.attendedAt,
            checkInStaff: item.checkInStaff,
            ...(item.souvenirGiven
              ? {
                  souvenirTaken: true,
                  souvenirName: item.souvenirName,
                  souvenirTakenAt: item.souvenirTakenAt,
                  souvenirTakenBy: item.souvenirTakenBy,
                }
              : {}),
          });

          // 2. Only broadcast to Greeting Screen TV if scan happened within the last 25 seconds
          // (prevents flooding the TV with old arrivals when syncing a batch later)
          const itemAgeMs = Date.now() - (new Date(item.createdAt || item.attendedAt).getTime() || 0);
          if (itemAgeMs >= 0 && itemAgeMs <= 25000) {
            await supabaseDb.broadcastGuestArrival(eventId, {
              id: item.guestId,
              event_id: eventId,
              name: item.guestName,
              category: item.category,
              ticketCode: item.ticketCode,
              ticket_code: item.ticketCode,
              session: item.session,
              attended: true,
              attendedAt: item.attendedAt,
              check_in_time: item.attendedAt,
            });
          }

          syncedCount++;
        } catch (err) {
          console.warn(`Offline sync retry queued for guest ${item.guestName}:`, err);
          remainingQueue.push({
            ...item,
            retryCount: (item.retryCount || 0) + 1,
          });
        }
      }

      this.saveSyncQueue(eventId, remainingQueue);
      return { synced: syncedCount, remaining: remainingQueue.length };
    } finally {
      activeFlushLocks.delete(eventId);
    }
  },
};
