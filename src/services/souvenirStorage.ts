import { SouvenirItem, SouvenirLog, SouvenirBatchScanRecord, Guest } from '../types';
import { supabase } from '../lib/supabase';
import { notifyLocalListeners } from '../lib/supabaseCompat';

const SOUVENIR_STORAGE_KEY_PREFIX = 'guestly_souvenirs_';
const SOUVENIR_LOGS_KEY_PREFIX = 'guestly_souvenir_logs_';
const SOUVENIR_GUESTS_KEY_PREFIX = 'guestly_souvenir_guests_';
const SOUVENIR_BATCH_SCANS_KEY_PREFIX = 'guestly_souvenir_batch_scans_';
const SOUVENIR_BATCH_PENDING_KEY_PREFIX = 'guestly_souvenir_batch_pending_';

// Unambiguous uppercase alphanumeric charset (excludes 0/O and 1/I/L for crisp sticker readability)
const BATCH_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const BATCH_DIGITS = '23456789';
const BATCH_ALPHABET = `${BATCH_LETTERS}${BATCH_DIGITS}`;

const hydratedEvents = new Set<string>();
const hydratingNow = new Set<string>();
const confirmedEmptyOnServer = new Set<string>();

export interface GuestSouvenirRecord {
  guestId: string;
  guestName?: string;
  souvenirId: string;
  souvenirName: string;
  takenAt: string;
  takenBy: string;
}

/**
 * Generates a unique 5-character uppercase alphanumeric batch code (guaranteed mix of letters & digits).
 */
export function generateSouvenirBatchCode(existingCodes?: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const chars: string[] = [
      BATCH_LETTERS[Math.floor(Math.random() * BATCH_LETTERS.length)],
      BATCH_DIGITS[Math.floor(Math.random() * BATCH_DIGITS.length)],
      BATCH_ALPHABET[Math.floor(Math.random() * BATCH_ALPHABET.length)],
      BATCH_ALPHABET[Math.floor(Math.random() * BATCH_ALPHABET.length)],
      BATCH_ALPHABET[Math.floor(Math.random() * BATCH_ALPHABET.length)],
    ];
    // Fisher-Yates shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join('');
    if (!existingCodes || !existingCodes.has(candidate)) {
      return candidate;
    }
  }
  return `S${Math.random().toString(36).toUpperCase().replace(/[^A-Z2-9]/g, '7').slice(0, 4).padEnd(4, '9')}`;
}

/**
 * Deterministic fallback 5-char batch code for legacy souvenir items that don't have one stored yet,
 * so multiple devices see the exact same code until saved.
 */
function deriveStableBatchCode(eventId: string, itemId: string): string {
  const seed = `${eventId}:${itemId}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (n: number) => Math.abs((h >>> n) ^ (h * (n + 3)));
  const c0 = BATCH_LETTERS[u(0) % BATCH_LETTERS.length];
  const c1 = BATCH_DIGITS[u(5) % BATCH_DIGITS.length];
  const c2 = BATCH_ALPHABET[u(10) % BATCH_ALPHABET.length];
  const c3 = BATCH_ALPHABET[u(15) % BATCH_ALPHABET.length];
  const c4 = BATCH_ALPHABET[u(20) % BATCH_ALPHABET.length];
  return `${c0}${c1}${c2}${c3}${c4}`;
}

export function formatSouvenirBatchQrPayload(batchCode: string): string {
  return `SV:${String(batchCode || '').trim().toUpperCase()}`;
}

/**
 * Parses a scanned QR string to extract a 5-char Souvenir Batch code if it starts with "SV:".
 * Returns null if the scanned string is NOT a souvenir batch QR (e.g. it's a guest ticket QR).
 */
export function parseSouvenirBatchQrPayload(raw: string): string | null {
  const cleaned = String(raw || '').trim().toUpperCase();
  const match = cleaned.match(/^SV:([A-Z0-9]{5})$/);
  return match ? match[1] : null;
}

async function persistToSupabase(key: string, data: any) {
  try {
    await supabase.from('settings').upsert(
      {
        id: key,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    notifyLocalListeners('settings', key);
  } catch (err) {
    console.warn('Failed to sync souvenir data to Supabase:', err);
  }
}

async function mergeAndPersistGuestTake(
  eventId: string,
  guestId: string,
  record: GuestSouvenirRecord | null
): Promise<boolean> {
  if (!eventId || !guestId) return false;
  const key = `doc:souvenir_guests:${eventId}`;
  const localKey = `${SOUVENIR_GUESTS_KEY_PREFIX}${eventId}`;
  try {
    const { data: existingRow, error: readErr } = await supabase
      .from('settings')
      .select('data')
      .eq('id', key)
      .maybeSingle();

    if (readErr) throw readErr;

    const remoteMap: Record<string, GuestSouvenirRecord> =
      existingRow?.data?.map && typeof existingRow.data.map === 'object'
        ? { ...existingRow.data.map }
        : {};

    let localMap: Record<string, GuestSouvenirRecord> = {};
    try {
      const rawLocal = localStorage.getItem(localKey);
      if (rawLocal) localMap = JSON.parse(rawLocal);
    } catch {
      localMap = {};
    }

    // Union remote with local so concurrent desks don't erase each other
    const mergedMap: Record<string, GuestSouvenirRecord> = {
      ...localMap,
      ...remoteMap,
    };

    if (record) {
      mergedMap[guestId] = record;
    } else {
      delete mergedMap[guestId];
    }

    const { error: upsertErr } = await supabase.from('settings').upsert(
      {
        id: key,
        data: { map: mergedMap },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (upsertErr) throw upsertErr;

    localStorage.setItem(localKey, JSON.stringify(mergedMap));
    notifyLocalListeners('settings', key);
    return true;
  } catch (err) {
    console.warn('Failed to merge souvenir guest map to Supabase (will retry on sync):', err);
    return false;
  }
}

async function mergeAndPersistLog(eventId: string, newEntry: SouvenirLog): Promise<boolean> {
  if (!eventId || !newEntry) return false;
  const key = `doc:souvenir_logs:${eventId}`;
  const localKey = `${SOUVENIR_LOGS_KEY_PREFIX}${eventId}`;
  try {
    const { data: existingRow, error: readErr } = await supabase
      .from('settings')
      .select('data')
      .eq('id', key)
      .maybeSingle();

    if (readErr) throw readErr;

    const remoteLogs: SouvenirLog[] = Array.isArray(existingRow?.data?.logs)
      ? existingRow.data.logs
      : [];

    let localLogs: SouvenirLog[] = [];
    try {
      const rawLocal = localStorage.getItem(localKey);
      if (rawLocal) localLogs = JSON.parse(rawLocal);
    } catch {
      localLogs = [];
    }

    // Deduplicate by log id, keeping newest first (cap at 200 entries)
    const seen = new Set<string>();
    const combined: SouvenirLog[] = [];
    for (const item of [newEntry, ...remoteLogs, ...localLogs]) {
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      combined.push(item);
    }
    combined.sort((a, b) => {
      const ta = Date.parse(a.timestamp || '') || 0;
      const tb = Date.parse(b.timestamp || '') || 0;
      return tb - ta;
    });
    const trimmed = combined.slice(0, 200);

    const { error: upsertErr } = await supabase.from('settings').upsert(
      {
        id: key,
        data: { logs: trimmed },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (upsertErr) throw upsertErr;

    localStorage.setItem(localKey, JSON.stringify(trimmed));
    notifyLocalListeners('settings', key);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('guestly_souvenir_logs_changed', { detail: { eventId, logs: trimmed } })
      );
    }
    return true;
  } catch (err) {
    console.warn('Failed to merge souvenir log to Supabase (will retry on sync):', err);
    return false;
  }
}

function getPendingBatchIds(eventId: string): string[] {
  if (!eventId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${SOUVENIR_BATCH_PENDING_KEY_PREFIX}${eventId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingBatchIds(eventId: string, ids: string[]): void {
  if (!eventId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${SOUVENIR_BATCH_PENDING_KEY_PREFIX}${eventId}`, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    // ignore storage errors
  }
}

function mergeBatchScanRecord(
  existing: SouvenirBatchScanRecord | undefined,
  incoming: SouvenirBatchScanRecord
): SouvenirBatchScanRecord {
  if (!existing) return incoming;
  // Voided tombstone always wins so undone scans never resurrect across devices
  if (existing.voided || incoming.voided) {
    return {
      ...existing,
      ...incoming,
      voided: true,
      voidedAt: incoming.voidedAt || existing.voidedAt,
      voidedBy: incoming.voidedBy || existing.voidedBy,
    };
  }
  return { ...existing, ...incoming };
}

async function mergeAndPersistBatchScans(eventId: string, specificIds?: string[]): Promise<boolean> {
  if (!eventId) return false;
  const key = `doc:souvenir_batch_scans:${eventId}`;
  const localKey = `${SOUVENIR_BATCH_SCANS_KEY_PREFIX}${eventId}`;
  try {
    const { data: existingRow, error: readErr } = await supabase
      .from('settings')
      .select('data')
      .eq('id', key)
      .maybeSingle();

    if (readErr) throw readErr;

    const remoteScans: Record<string, SouvenirBatchScanRecord> =
      existingRow?.data?.scans && typeof existingRow.data.scans === 'object'
        ? { ...existingRow.data.scans }
        : {};

    let localScans: Record<string, SouvenirBatchScanRecord> = {};
    try {
      const rawLocal = localStorage.getItem(localKey);
      if (rawLocal) localScans = JSON.parse(rawLocal);
    } catch {
      localScans = {};
    }

    const merged: Record<string, SouvenirBatchScanRecord> = { ...remoteScans };
    for (const [id, rec] of Object.entries(localScans)) {
      if (!rec || !id) continue;
      merged[id] = mergeBatchScanRecord(merged[id], rec);
    }

    const { error: upsertErr } = await supabase.from('settings').upsert(
      {
        id: key,
        data: { scans: merged },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (upsertErr) throw upsertErr;

    localStorage.setItem(localKey, JSON.stringify(merged));

    // Clear synced IDs from pending queue
    const prevPending = getPendingBatchIds(eventId);
    if (prevPending.length > 0) {
      const syncedSet = new Set(specificIds && specificIds.length > 0 ? specificIds : Object.keys(merged));
      const remaining = prevPending.filter((id) => !syncedSet.has(id));
      savePendingBatchIds(eventId, remaining);
    }

    notifyLocalListeners('settings', key);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('guestly_souvenirs_changed', { detail: { eventId } }));
    }
    return true;
  } catch (err) {
    console.warn('Failed to merge batch souvenir scans to Supabase (queued locally):', err);
    return false;
  }
}

export const souvenirStorage = {
  generateBatchCode: generateSouvenirBatchCode,
  formatBatchQrPayload: formatSouvenirBatchQrPayload,
  parseBatchQrPayload: parseSouvenirBatchQrPayload,

  hydrateFromSupabase(eventId: string, force = false) {
    if (!eventId) return;
    if (!force && hydratedEvents.has(eventId)) return;
    if (hydratingNow.has(eventId)) return;
    hydratedEvents.add(eventId);
    hydratingNow.add(eventId);

    const itemsKey = `doc:souvenirs:${eventId}`;
    const logsKey = `doc:souvenir_logs:${eventId}`;
    const guestsKey = `doc:souvenir_guests:${eventId}`;
    const batchScansKey = `doc:souvenir_batch_scans:${eventId}`;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('id, data')
          .in('id', [itemsKey, logsKey, guestsKey, batchScansKey]);

        if (error || !data) return;
        let hasItemsUpdate = false;
        let hasLogsUpdate = false;
        let foundItemsOnServer = false;

        for (const row of data) {
          if (row.id === itemsKey && Array.isArray(row.data?.items) && row.data.items.length > 0) {
            foundItemsOnServer = true;
            confirmedEmptyOnServer.delete(eventId);
            const nextStr = JSON.stringify(row.data.items);
            if (localStorage.getItem(`${SOUVENIR_STORAGE_KEY_PREFIX}${eventId}`) !== nextStr) {
              localStorage.setItem(`${SOUVENIR_STORAGE_KEY_PREFIX}${eventId}`, nextStr);
              hasItemsUpdate = true;
            }
          } else if (row.id === logsKey && Array.isArray(row.data?.logs)) {
            const nextStr = JSON.stringify(row.data.logs);
            if (localStorage.getItem(`${SOUVENIR_LOGS_KEY_PREFIX}${eventId}`) !== nextStr) {
              localStorage.setItem(`${SOUVENIR_LOGS_KEY_PREFIX}${eventId}`, nextStr);
              hasLogsUpdate = true;
            }
          } else if (row.id === guestsKey && row.data?.map && typeof row.data.map === 'object') {
            const nextStr = JSON.stringify(row.data.map);
            if (localStorage.getItem(`${SOUVENIR_GUESTS_KEY_PREFIX}${eventId}`) !== nextStr) {
              localStorage.setItem(`${SOUVENIR_GUESTS_KEY_PREFIX}${eventId}`, nextStr);
              hasItemsUpdate = true;
            }
          } else if (row.id === batchScansKey && row.data?.scans && typeof row.data.scans === 'object') {
            // Merge remote batch scans with any unsynced local pending scans
            const localKey = `${SOUVENIR_BATCH_SCANS_KEY_PREFIX}${eventId}`;
            const pendingIds = new Set(getPendingBatchIds(eventId));
            let localScans: Record<string, SouvenirBatchScanRecord> = {};
            try {
              const rawLocal = localStorage.getItem(localKey);
              if (rawLocal) localScans = JSON.parse(rawLocal);
            } catch {
              localScans = {};
            }
            const mergedScans: Record<string, SouvenirBatchScanRecord> = { ...row.data.scans };
            for (const pid of pendingIds) {
              if (localScans[pid]) {
                mergedScans[pid] = mergeBatchScanRecord(mergedScans[pid], localScans[pid]);
              }
            }
            const nextStr = JSON.stringify(mergedScans);
            if (localStorage.getItem(localKey) !== nextStr) {
              localStorage.setItem(localKey, nextStr);
              hasItemsUpdate = true;
            }
          }
        }

        if (!foundItemsOnServer) {
          confirmedEmptyOnServer.add(eventId);
        }

        if (hasItemsUpdate && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('guestly_souvenirs_changed', { detail: { eventId } }));
        }
        if (hasLogsUpdate && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('guestly_souvenir_logs_changed', { detail: { eventId } }));
        }
      } catch {
        // ignore background sync error
      } finally {
        hydratingNow.delete(eventId);
      }
    })();
  },

  // ================= BATCH QR SCANS LEDGER =================
  getBatchScansMap(eventId: string): Record<string, SouvenirBatchScanRecord> {
    if (!eventId) return {};
    this.hydrateFromSupabase(eventId);
    const key = `${SOUVENIR_BATCH_SCANS_KEY_PREFIX}${eventId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },

  getActiveBatchScans(eventId: string): SouvenirBatchScanRecord[] {
    const map = this.getBatchScansMap(eventId);
    return (Object.values(map) as SouvenirBatchScanRecord[])
      .filter((r) => r && !r.voided)
      .sort((a, b) => (Date.parse(b.scannedAt || '') || 0) - (Date.parse(a.scannedAt || '') || 0));
  },

  getPendingBatchScanCount(eventId: string): number {
    return getPendingBatchIds(eventId).length;
  },

  findSouvenirByBatchCode(
    eventId: string,
    rawCode: string,
    rawGuests: Guest[] = []
  ): SouvenirItem | null {
    if (!eventId || !rawCode) return null;
    const clean = String(rawCode).trim().toUpperCase().replace(/^SV:/, '');
    if (!/^[A-Z0-9]{5}$/.test(clean)) return null;
    const items = this.getSouvenirs(eventId, rawGuests);
    return items.find((item) => (item.qrBatchCode || '').trim().toUpperCase() === clean) || null;
  },

  recordBatchScan(
    eventId: string,
    params: {
      souvenir: SouvenirItem;
      performedBy: string;
      notes?: string;
      forceOffline?: boolean;
    }
  ): {
    record: SouvenirBatchScanRecord;
    remainingAfter: number;
    processedOffline: boolean;
  } {
    const { souvenir, performedBy, notes, forceOffline } = params;
    const nowIso = new Date().toISOString();
    const scanId = `bs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const batchCode = (souvenir.qrBatchCode || deriveStableBatchCode(eventId, souvenir.id || 'default')).toUpperCase();

    const record: SouvenirBatchScanRecord = {
      id: scanId,
      eventId,
      souvenirId: souvenir.id || '',
      souvenirName: souvenir.name,
      category: souvenir.category || 'Semua Tamu',
      batchCode,
      scannedAt: nowIso,
      scannedBy: performedBy || 'Petugas',
      voided: false,
    };

    const map = this.getBatchScansMap(eventId);
    map[scanId] = record;
    localStorage.setItem(`${SOUVENIR_BATCH_SCANS_KEY_PREFIX}${eventId}`, JSON.stringify(map));

    const pending = getPendingBatchIds(eventId);
    pending.push(scanId);
    savePendingBatchIds(eventId, pending);

    this.addLog(eventId, {
      eventId,
      souvenirId: souvenir.id || '',
      souvenirName: souvenir.name,
      guestName: `Serah Fisik via QR Souvenir (${souvenir.category || souvenir.name})`,
      ticketCode: `BATCH:${batchCode}`,
      batchCode,
      batchScanId: scanId,
      quantity: 1,
      action: 'TAKE',
      notes: notes || `Scan langsung stiker QR Batch ${batchCode} pada fisik souvenir`,
      performedBy: performedBy || 'Petugas',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('guestly_souvenirs_changed', { detail: { eventId } }));
    }

    const isOnline = !forceOffline && (typeof navigator === 'undefined' ? true : navigator.onLine);
    if (isOnline) {
      mergeAndPersistBatchScans(eventId, [scanId]);
    }

    const remainingAfter = Math.max(0, (souvenir.remainingStock || 0) - 1);
    return {
      record,
      remainingAfter,
      processedOffline: !isOnline,
    };
  },

  undoBatchScan(
    eventId: string,
    scanId: string,
    performedBy: string,
    forceOffline?: boolean
  ): { undone: boolean; record?: SouvenirBatchScanRecord } {
    if (!eventId || !scanId) return { undone: false };
    const map = this.getBatchScansMap(eventId);
    const existing = map[scanId];
    if (!existing || existing.voided) {
      return { undone: false };
    }

    const nowIso = new Date().toISOString();
    const updatedRecord: SouvenirBatchScanRecord = {
      ...existing,
      voided: true,
      voidedAt: nowIso,
      voidedBy: performedBy || 'Petugas',
    };
    map[scanId] = updatedRecord;
    localStorage.setItem(`${SOUVENIR_BATCH_SCANS_KEY_PREFIX}${eventId}`, JSON.stringify(map));

    const pending = getPendingBatchIds(eventId);
    pending.push(scanId);
    savePendingBatchIds(eventId, pending);

    this.addLog(eventId, {
      eventId,
      souvenirId: existing.souvenirId,
      souvenirName: existing.souvenirName,
      guestName: `Pembatalan Scan QR Batch (${existing.category || existing.souvenirName})`,
      ticketCode: `BATCH:${existing.batchCode}`,
      batchCode: existing.batchCode,
      batchScanId: scanId,
      quantity: 1,
      action: 'RETURN',
      notes: `Undo scan QR Batch ${existing.batchCode} — stok sistem dipulihkan +1 pcs`,
      performedBy: performedBy || 'Petugas',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('guestly_souvenirs_changed', { detail: { eventId } }));
    }

    const isOnline = !forceOffline && (typeof navigator === 'undefined' ? true : navigator.onLine);
    if (isOnline) {
      mergeAndPersistBatchScans(eventId, [scanId]);
    }

    return { undone: true, record: updatedRecord };
  },

  async syncPendingBatchScansToSupabase(eventId: string): Promise<number> {
    if (!eventId || typeof window === 'undefined') return 0;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
    const pending = getPendingBatchIds(eventId);
    if (pending.length === 0) return 0;
    const ok = await mergeAndPersistBatchScans(eventId, pending);
    if (ok) {
      // Also sync local logs for these scans
      const localLogs = this.getLogs(eventId);
      const pendingSet = new Set(pending);
      for (const log of localLogs) {
        if (log.batchScanId && pendingSet.has(log.batchScanId)) {
          await mergeAndPersistLog(eventId, log);
        }
      }
      return pending.length;
    }
    return 0;
  },

  // Guest-to-Souvenir mapping for zero-error offline/online parity
  getGuestMap(eventId: string): Record<string, GuestSouvenirRecord> {
    if (!eventId) return {};
    this.hydrateFromSupabase(eventId);
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
    const fullRecord: GuestSouvenirRecord = {
      guestId,
      ...record,
    };
    map[guestId] = fullRecord;
    const key = `${SOUVENIR_GUESTS_KEY_PREFIX}${eventId}`;
    localStorage.setItem(key, JSON.stringify(map));
    if (typeof navigator === 'undefined' || navigator.onLine) {
      mergeAndPersistGuestTake(eventId, guestId, fullRecord);
    }
  },

  removeGuestTake(eventId: string, guestId: string): void {
    if (!eventId || !guestId) return;
    const map = this.getGuestMap(eventId);
    delete map[guestId];
    const key = `${SOUVENIR_GUESTS_KEY_PREFIX}${eventId}`;
    localStorage.setItem(key, JSON.stringify(map));
    if (typeof navigator === 'undefined' || navigator.onLine) {
      mergeAndPersistGuestTake(eventId, guestId, null);
    }
  },

  /**
   * Used by offlineSyncService when flushing offline souvenir hand-outs back to Supabase
   * so guest maps and souvenir logs recorded while offline are safely merged to the server.
   */
  async syncOfflineSouvenirToSupabase(
    eventId: string,
    guestId: string,
    record: Omit<GuestSouvenirRecord, 'guestId'>,
    logEntry?: Omit<SouvenirLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
  ): Promise<void> {
    if (!eventId || !guestId) return;
    const fullRecord: GuestSouvenirRecord = { guestId, ...record };
    await mergeAndPersistGuestTake(eventId, guestId, fullRecord);

    if (logEntry) {
      const stableId = logEntry.id || `log_sync_${guestId}_${record.souvenirId || 'souv'}`;
      await mergeAndPersistLog(eventId, {
        ...logEntry,
        id: stableId,
        timestamp: logEntry.timestamp || record.takenAt || new Date().toISOString(),
      });
    }
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
    this.hydrateFromSupabase(eventId);

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

    // Default souvenir item if none configured yet.
    // IMPORTANT: Never persist this default to Supabase before hydration confirms the server has none,
    // otherwise a fresh staff device would overwrite real configured souvenirs in Supabase!
    if (!items || items.length === 0) {
      const defaultInitial = Math.max(100, guests.length || 200);
      const defaultId = `souvenir_default_${eventId}`;
      items = [
        {
          id: defaultId,
          eventId,
          name: 'Souvenir Acara (Reguler)',
          category: 'Semua Tamu',
          qrBatchCode: deriveStableBatchCode(eventId, defaultId),
          initialStock: defaultInitial,
          totalDistributed: 0,
          directQrOutCount: 0,
          remainingStock: defaultInitial,
          physicalStockAudit: defaultInitial,
          lastAuditAt: new Date().toISOString(),
          lastAuditBy: 'Sistem',
          notes: 'Stok awal fisik di meja logistik',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      if (confirmedEmptyOnServer.has(eventId)) {
        this.saveSouvenirs(eventId, items);
      }
    }

    // Ensure every souvenir item has a stable, unique 5-char batch code
    const usedCodes = new Set<string>();
    items.forEach((item, idx) => {
      let code = (item.qrBatchCode || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{5}$/.test(code) || usedCodes.has(code)) {
        code = deriveStableBatchCode(eventId, `${item.id || idx}_${usedCodes.size}`);
        while (usedCodes.has(code)) {
          code = generateSouvenirBatchCode(usedCodes);
        }
      }
      item.qrBatchCode = code;
      usedCodes.add(code);
    });

    // Always recalculate distributed count from authoritative guests list + active direct QR batch scans
    const totalTakenGuests = guests.filter(g => !!g.souvenirTaken);
    const activeBatchScans = this.getActiveBatchScans(eventId);

    // If only one souvenir item, map all taken guests & batch scans to it
    if (items.length === 1) {
      const directCount = activeBatchScans.length;
      items[0].directQrOutCount = directCount;
      items[0].totalDistributed = totalTakenGuests.length + directCount;
      items[0].remainingStock = Math.max(0, items[0].initialStock - items[0].totalDistributed);
      if (items[0].physicalStockAudit === undefined) {
        items[0].physicalStockAudit = items[0].remainingStock;
      }
    } else {
      // Map distributed counts per specific souvenir item
      items.forEach(item => {
        const takenForThisItem = totalTakenGuests.filter(
          g => g.souvenirId === item.id || g.souvenirName === item.name
        );
        const batchScansForThisItem = activeBatchScans.filter(
          bs =>
            bs.souvenirId === item.id ||
            (bs.batchCode && bs.batchCode === item.qrBatchCode) ||
            bs.souvenirName === item.name
        );
        item.directQrOutCount = batchScansForThisItem.length;
        item.totalDistributed = takenForThisItem.length + batchScansForThisItem.length;
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
    confirmedEmptyOnServer.delete(eventId);
    const key = `${SOUVENIR_STORAGE_KEY_PREFIX}${eventId}`;
    localStorage.setItem(key, JSON.stringify(items));
    persistToSupabase(`doc:souvenirs:${eventId}`, { items });
    window.dispatchEvent(new CustomEvent('guestly_souvenirs_changed', { detail: { eventId, items } }));
  },

  regenerateBatchCode(eventId: string, itemId: string, guests: Guest[] = []): SouvenirItem[] {
    const items = this.getSouvenirs(eventId, guests);
    const existingCodes = new Set<string>(
      items.map(i => (i.qrBatchCode || '').trim().toUpperCase()).filter(Boolean)
    );
    const newCode = generateSouvenirBatchCode(existingCodes);
    const updated = items.map(item =>
      item.id === itemId
        ? { ...item, qrBatchCode: newCode, updatedAt: new Date().toISOString() }
        : item
    );
    this.saveSouvenirs(eventId, updated);
    return updated;
  },

  getLogs(eventId: string): SouvenirLog[] {
    if (!eventId) return [];
    this.hydrateFromSupabase(eventId);
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
    const updated = [newEntry, ...current].slice(0, 200); // Keep last 200 logs
    const key = `${SOUVENIR_LOGS_KEY_PREFIX}${eventId}`;
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('guestly_souvenir_logs_changed', { detail: { eventId, logs: updated } }));
    if (typeof navigator === 'undefined' || navigator.onLine) {
      mergeAndPersistLog(eventId, newEntry);
    }
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
    const existingCodes = new Set<string>(
      items.map(i => (i.qrBatchCode || '').trim().toUpperCase()).filter(Boolean)
    );
    const qrBatchCode =
      item.qrBatchCode && /^[A-Z0-9]{5}$/.test(item.qrBatchCode.toUpperCase()) && !existingCodes.has(item.qrBatchCode.toUpperCase())
        ? item.qrBatchCode.toUpperCase()
        : generateSouvenirBatchCode(existingCodes);

    const newItem: SouvenirItem = {
      ...item,
      id: `souvenir_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      qrBatchCode,
      totalDistributed: 0,
      directQrOutCount: 0,
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

