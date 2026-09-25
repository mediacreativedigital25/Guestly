import { SouvenirItem, SouvenirLog, Guest } from '../types';

const SOUVENIR_STORAGE_KEY_PREFIX = 'guestly_souvenirs_';
const SOUVENIR_LOGS_KEY_PREFIX = 'guestly_souvenir_logs_';
const SOUVENIR_GUESTS_KEY_PREFIX = 'guestly_souvenir_guests_';

export interface GuestSouvenirRecord {
  guestId: string;
  guestName?: string;
  souvenirId: string;
  souvenirName: string;
  takenAt: string;
  takenBy: string;
}

export const souvenirStorage = {
  // Guest-to-Souvenir mapping for zero-error offline/online parity
  getGuestMap(eventId: string): Record<string, GuestSouvenirRecord> {
    if (!eventId) return {};
    const key = `${SOUVENIR_GUESTS_KEY_PREFIX}${eventId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },

  isGuestTaken(eventId: string, guestId: string): boolean {
    if (!eventId || !guestId) return false;
    const map = this.getGuestMap(eventId);
    return !!map[guestId];
  },

  getGuestTakenInfo(eventId: string, guestId: string): GuestSouvenirRecord | null {
    if (!eventId || !guestId) return null;
    const map = this.getGuestMap(eventId);
    return map[guestId] || null;
  },

  recordGuestTake(eventId: string, guestId: string, record: Omit<GuestSouvenirRecord, 'guestId'>): void {
    if (!eventId || !guestId) return;
    const map = this.getGuestMap(eventId);
    map[guestId] = {
      guestId,
      ...record
    };
    const key = `${SOUVENIR_GUESTS_KEY_PREFIX}${eventId}`;
    localStorage.setItem(key, JSON.stringify(map));
  },

  removeGuestTake(eventId: string, guestId: string): void {
    if (!eventId || !guestId) return;
    const map = this.getGuestMap(eventId);
    delete map[guestId];
    const key = `${SOUVENIR_GUESTS_KEY_PREFIX}${eventId}`;
    localStorage.setItem(key, JSON.stringify(map));
  },

  mergeGuestsWithSouvenirs(eventId: string, guests: Guest[]): Guest[] {
    if (!eventId || !guests) return [];
    const map = this.getGuestMap(eventId);
    return guests.map(g => {
      const local = g.id ? map[g.id] : null;
      if (local || g.souvenirTaken) {
        return {
          ...g,
          souvenirTaken: true,
          souvenirTakenAt: g.souvenirTakenAt || local?.takenAt,
          souvenirId: g.souvenirId || local?.souvenirId,
          souvenirName: g.souvenirName || local?.souvenirName,
          souvenirTakenBy: g.souvenirTakenBy || local?.takenBy,
          souvenirQuantity: g.souvenirQuantity || 1
        };
      }
      return g;
    });
  },

  getSouvenirs(eventId: string, rawGuests: Guest[] = []): SouvenirItem[] {
    if (!eventId) return [];

    const guests = this.mergeGuestsWithSouvenirs(eventId, rawGuests);

    const key = `${SOUVENIR_STORAGE_KEY_PREFIX}${eventId}`;
    const raw = localStorage.getItem(key);
    let items: SouvenirItem[] = [];

    if (raw) {
      try {
        items = JSON.parse(raw);
      } catch (e) {
        console.warn('Failed to parse souvenirs from localStorage', e);
      }
    }

    // Default souvenir item if none configured yet
    if (!items || items.length === 0) {
      const defaultInitial = Math.max(100, guests.length || 200);
      items = [
        {
          id: `souvenir_default_${eventId}`,
          eventId,
          name: 'Souvenir Acara (Reguler)',
          category: 'Semua Tamu',
          initialStock: defaultInitial,
          totalDistributed: 0,
          remainingStock: defaultInitial,
          physicalStockAudit: defaultInitial,
          lastAuditAt: new Date().toISOString(),
          lastAuditBy: 'Sistem',
          notes: 'Stok awal fisik di meja logistik',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      this.saveSouvenirs(eventId, items);
    }

    // Always recalculate distributed count from authoritative guests list
    const totalTakenGuests = guests.filter(g => !!g.souvenirTaken);

    // If only one souvenir item, map all taken guests to it
    if (items.length === 1) {
      items[0].totalDistributed = totalTakenGuests.length;
      items[0].remainingStock = Math.max(0, items[0].initialStock - items[0].totalDistributed);
      if (items[0].physicalStockAudit === undefined) {
        items[0].physicalStockAudit = items[0].remainingStock;
      }
    } else {
      // Map distributed counts per specific souvenir item
      items.forEach(item => {
        const takenForThisItem = totalTakenGuests.filter(g => g.souvenirId === item.id || g.souvenirName === item.name);
        item.totalDistributed = takenForThisItem.length;
        item.remainingStock = Math.max(0, item.initialStock - item.totalDistributed);
        if (item.physicalStockAudit === undefined) {
          item.physicalStockAudit = item.remainingStock;
        }
      });
    }

    return items;
  },

  saveSouvenirs(eventId: string, items: SouvenirItem[]): void {
    if (!eventId) return;
    const key = `${SOUVENIR_STORAGE_KEY_PREFIX}${eventId}`;
    localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('guestly_souvenirs_changed', { detail: { eventId, items } }));
  },

  getLogs(eventId: string): SouvenirLog[] {
    if (!eventId) return [];
    const key = `${SOUVENIR_LOGS_KEY_PREFIX}${eventId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  addLog(eventId: string, log: Omit<SouvenirLog, 'id' | 'timestamp'>): void {
    if (!eventId) return;
    const current = this.getLogs(eventId);
    const newEntry: SouvenirLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...log
    };
    const updated = [newEntry, ...current].slice(0, 100); // Keep last 100 logs
    const key = `${SOUVENIR_LOGS_KEY_PREFIX}${eventId}`;
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('guestly_souvenir_logs_changed', { detail: { eventId, logs: updated } }));
  },

  updateItem(eventId: string, itemId: string, updates: Partial<SouvenirItem>, guests: Guest[] = []): SouvenirItem[] {
    const items = this.getSouvenirs(eventId, guests);
    const updated = items.map(item => {
      if (item.id === itemId) {
        const initial = updates.initialStock !== undefined ? updates.initialStock : item.initialStock;
        const distributed = item.totalDistributed || 0;
        const remaining = Math.max(0, initial - distributed);
        return {
          ...item,
          ...updates,
          initialStock: initial,
          remainingStock: remaining,
          updatedAt: new Date().toISOString()
        };
      }
      return item;
    });
    this.saveSouvenirs(eventId, updated);
    return updated;
  },

  addItem(eventId: string, item: Omit<SouvenirItem, 'id' | 'createdAt' | 'updatedAt'>, guests: Guest[] = []): SouvenirItem[] {
    const items = this.getSouvenirs(eventId, guests);
    const newItem: SouvenirItem = {
      ...item,
      id: `souvenir_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      totalDistributed: 0,
      remainingStock: item.initialStock,
      physicalStockAudit: item.initialStock,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [...items, newItem];
    this.saveSouvenirs(eventId, updated);
    return updated;
  },

  deleteItem(eventId: string, itemId: string, guests: Guest[] = []): SouvenirItem[] {
    const items = this.getSouvenirs(eventId, guests);
    const updated = items.filter(item => item.id !== itemId);
    this.saveSouvenirs(eventId, updated);
    return updated;
  }
};
