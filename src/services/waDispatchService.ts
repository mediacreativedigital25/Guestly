import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { WaGuestDispatchEntry } from '../types';

export type WaDispatchMap = Record<string, WaGuestDispatchEntry>;

const DISPATCH_COLLECTION = 'wa_dispatch';

export async function getWaDispatchMap(eventId: string): Promise<WaDispatchMap> {
  if (!eventId) return {};
  try {
    const snap = await getDoc(doc(db, DISPATCH_COLLECTION, eventId));
    if (snap.exists()) {
      const data = snap.data() as any;
      if (data?.statuses && typeof data.statuses === 'object') {
        return data.statuses as WaDispatchMap;
      }
    }
  } catch (err) {
    console.warn('Could not load WA dispatch map:', err);
  }
  return {};
}

export function subscribeWaDispatch(
  eventId: string,
  onChange: (statuses: WaDispatchMap) => void
): () => void {
  if (!eventId) {
    onChange({});
    return () => {};
  }
  const ref = doc(db, DISPATCH_COLLECTION, eventId);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        onChange(data?.statuses && typeof data.statuses === 'object' ? data.statuses : {});
      } else {
        onChange({});
      }
    },
    (err) => {
      console.warn('WA dispatch snapshot error:', err);
    }
  );
}

export async function saveGuestWaStatus(
  eventId: string,
  guestId: string,
  entry: WaGuestDispatchEntry | null
): Promise<WaDispatchMap> {
  if (!eventId || !guestId) return {};
  const ref = doc(db, DISPATCH_COLLECTION, eventId);
  const existing = await getWaDispatchMap(eventId);
  const nextStatuses: WaDispatchMap = { ...existing };

  if (entry === null) {
    delete nextStatuses[guestId];
  } else {
    const prevCount = existing[guestId]?.count || 0;
    nextStatuses[guestId] = {
      ...entry,
      count: entry.status === 'sent' ? (entry.count ?? prevCount + 1) : prevCount,
    };
  }

  await setDoc(
    ref,
    {
      eventId,
      statuses: nextStatuses,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return nextStatuses;
}

export async function saveBulkGuestWaStatuses(
  eventId: string,
  updates: Record<string, WaGuestDispatchEntry>
): Promise<WaDispatchMap> {
  if (!eventId || Object.keys(updates).length === 0) return {};
  const ref = doc(db, DISPATCH_COLLECTION, eventId);
  const existing = await getWaDispatchMap(eventId);
  const nextStatuses: WaDispatchMap = { ...existing };

  for (const [guestId, entry] of Object.entries(updates)) {
    const prevCount = existing[guestId]?.count || 0;
    nextStatuses[guestId] = {
      ...entry,
      count: entry.status === 'sent' ? (entry.count ?? prevCount + 1) : prevCount,
    };
  }

  await setDoc(
    ref,
    {
      eventId,
      statuses: nextStatuses,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return nextStatuses;
}

export async function clearWaDispatchMap(eventId: string): Promise<void> {
  if (!eventId) return;
  try {
    const ref = doc(db, DISPATCH_COLLECTION, eventId);
    await setDoc(
      ref,
      {
        eventId,
        statuses: {},
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Could not clear WA dispatch map:', err);
  }
}
