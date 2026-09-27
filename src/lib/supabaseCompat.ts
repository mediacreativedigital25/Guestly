import { supabase } from './supabase';

export class Timestamp {
  seconds: number;
  nanoseconds: number;
  private _iso: string;

  constructor(seconds: number, nanoseconds: number = 0) {
    this.seconds = Math.floor(seconds);
    this.nanoseconds = nanoseconds;
    this._iso = new Date(this.seconds * 1000 + Math.floor(nanoseconds / 1e6)).toISOString();
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(ms: number): Timestamp {
    const sec = Math.floor(ms / 1000);
    const ns = (ms % 1000) * 1e6;
    return new Timestamp(sec, ns);
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }

  toISOString(): string {
    return this._iso;
  }

  toString(): string {
    return this._iso;
  }

  toJSON(): string {
    return this._iso;
  }

  valueOf(): number {
    return this.toMillis();
  }
}

export function toSupabaseTimestamp(val: any): any {
  if (!val) return val;
  if (val instanceof Timestamp) return val;
  if (val instanceof Date) return Timestamp.fromDate(val);
  if (typeof val === 'string') {
    const ms = Date.parse(val);
    if (!isNaN(ms)) return Timestamp.fromMillis(ms);
    return val;
  }
  if (typeof val === 'number') {
    return Timestamp.fromMillis(val);
  }
  if (typeof val === 'object') {
    if (typeof val.seconds === 'number') {
      return new Timestamp(val.seconds, val.nanoseconds || 0);
    }
    if (typeof val._seconds === 'number') {
      return new Timestamp(val._seconds, val._nanoseconds || 0);
    }
  }
  return val;
}

function serializeForStorage(val: any): any {
  if (val === undefined) return null;
  if (val === null) return null;
  if (val instanceof Timestamp) return val.toISOString();
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map(serializeForStorage);
  if (typeof val === 'object') {
    if (val.__op === 'serverTimestamp') return new Date().toISOString();
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v && typeof v === 'object' && (v as any).__op === 'deleteField') continue;
      if (v !== undefined) out[k] = serializeForStorage(v);
    }
    return out;
  }
  return val;
}

const DATE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'uploadedAt',
  'activeUntil',
  'timestamp',
  'attendedAt',
  'checkInTime',
  'souvenirTakenAt',
  'requestedAt',
  'resolvedAt',
  'lastAuditAt',
]);

function hydrateDates(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj instanceof Timestamp) return obj;
  if (Array.isArray(obj)) return obj.map(hydrateDates);
  const copy: Record<string, any> = { ...obj };
  for (const [k, v] of Object.entries(copy)) {
    if (DATE_FIELDS.has(k) && v) {
      copy[k] = toSupabaseTimestamp(v);
    } else if (v && typeof v === 'object' && (typeof v.seconds === 'number' || typeof v._seconds === 'number')) {
      copy[k] = toSupabaseTimestamp(v);
    }
  }
  return copy;
}

export const firebaseConfig = {
  projectId: 'supabase-guestly',
  appId: 'supabase-guestly',
  apiKey: 'supabase',
  authDomain: 'ryixdkgfunuhwxwiivyh.supabase.co',
  firestoreDatabaseId: '(default)',
};

export function initializeApp(_config?: any, name?: string) {
  return { name: name || '[DEFAULT]', options: firebaseConfig };
}

export function getApp() {
  return { name: '[DEFAULT]', options: firebaseConfig };
}

export function getApps() {
  return [{ name: '[DEFAULT]', options: firebaseConfig }];
}

export const db = { __type: 'supabase-db' };

export function getFirestore(_app?: any, _dbId?: any) {
  return db;
}

export function initializeFirestore(_app?: any, _settings?: any, _dbId?: any) {
  return db;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      displayName?: string | null;
      email?: string | null;
      photoUrl?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.error('Supabase Database Error:', errInfo);
  return errInfo;
}

export function serverTimestamp() {
  return { __op: 'serverTimestamp', toISOString: () => new Date().toISOString() };
}

export function deleteField() {
  return { __op: 'deleteField' };
}

export function increment(value: number) {
  return { __op: 'increment', value };
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export interface DocRef {
  __type: 'doc';
  path: string;
  id: string;
  collectionName: string;
  parentId?: string;
}

export interface CollectionRef {
  __type: 'collection';
  path: string;
  collectionName: string;
  parentId?: string;
}

function parseSegments(firstArg: any, segments: string[]): string[] {
  const all: string[] = [];
  if (firstArg && typeof firstArg === 'object' && firstArg.path) {
    all.push(...firstArg.path.split('/').filter(Boolean));
  }
  for (const s of segments) {
    if (s) all.push(...s.split('/').filter(Boolean));
  }
  return all;
}

export function collection(parentOrDb: any, ...pathSegments: string[]): CollectionRef {
  const segs = parseSegments(parentOrDb, pathSegments);
  const path = segs.join('/');
  if (segs.length === 3 && segs[0] === 'events' && segs[2] === 'guests') {
    return {
      __type: 'collection',
      path,
      collectionName: 'guests',
      parentId: segs[1],
    };
  }
  return {
    __type: 'collection',
    path,
    collectionName: segs[segs.length - 1] || '',
  };
}

export function doc(parentOrDb: any, ...pathSegments: string[]): DocRef {
  const segs = parseSegments(parentOrDb, pathSegments);
  if (parentOrDb && parentOrDb.__type === 'collection' && pathSegments.length === 0) {
    segs.push(generateId());
  }
  const path = segs.join('/');
  const id = segs[segs.length - 1] || generateId();
  if (segs.length === 4 && segs[0] === 'events' && segs[2] === 'guests') {
    return {
      __type: 'doc',
      path,
      id,
      collectionName: 'guests',
      parentId: segs[1],
    };
  }
  const collectionName = segs.length >= 2 ? segs[segs.length - 2] : 'settings';
  return {
    __type: 'doc',
    path,
    id,
    collectionName,
  };
}

export function where(field: string, op: string, value: any) {
  return { __type: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  return { __type: 'orderBy', field, direction };
}

export function limit(count: number) {
  return { __type: 'limit', count };
}

export function startAfter(cursor: any) {
  return { __type: 'startAfter', cursor };
}

export function query(ref: any, ...constraints: any[]) {
  const existing = ref?.constraints || [];
  return {
    __type: 'query',
    collectionName: ref.collectionName,
    parentId: ref.parentId,
    path: ref.path,
    constraints: [...existing, ...constraints.filter(Boolean)],
  };
}

export class DocSnapshot {
  id: string;
  ref: DocRef;
  private _data: any;

  constructor(id: string, data: any, ref: DocRef) {
    this.id = id;
    this._data = data ? hydrateDates(data) : null;
    this.ref = ref;
  }

  exists(): boolean {
    return this._data !== null && this._data !== undefined;
  }

  data(): any {
    return this._data;
  }
}

export class QuerySnapshot {
  docs: DocSnapshot[];
  size: number;
  empty: boolean;

  constructor(docs: DocSnapshot[]) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }

  forEach(cb: (doc: DocSnapshot) => void) {
    this.docs.forEach(cb);
  }
}

// ================= ROW <-> MODEL MAPPERS =================

function rowToEventModel(row: any): any {
  const extra = row.settings && typeof row.settings === 'object' ? row.settings : {};
  return hydrateDates({
    ...extra,
    id: row.id,
    title: row.title || extra.title || '',
    coupleName: row.couple_name || extra.coupleName || '',
    slug: row.slug || extra.slug || null,
    partnerId: row.partner_id || extra.partnerId || '',
    clientId: row.client_id || extra.clientId || '',
    date: row.date || extra.date || '',
    time: row.time || extra.time || '',
    location: row.location || extra.location || '',
    rsvpTheme: row.rsvp_theme || row.theme || extra.rsvpTheme || 'default',
    thumbnailUrl:
      row.thumbnail_url ||
      extra.thumbnailUrl ||
      row.cover_image ||
      extra.coverImage ||
      extra.eInvitePhotoUrl ||
      '',
    frameOverlayUrl: row.frame_overlay_url || extra.frameOverlayUrl || '',
    digitalInviteLink: row.digital_invite_link || extra.digitalInviteLink || '',
    invitationUrl: row.invitation_url || extra.invitationUrl || '',
    status: row.status || extra.status || 'published',
    sessions: row.sessions || extra.sessions || [],
    guestCategories: row.guest_categories || extra.guestCategories || ['VIP', 'Keluarga', 'Reguler'],
    invitationTypes: row.invitation_types || extra.invitationTypes || ['Undangan Fisik', 'Undangan Cetak', 'Undangan Digital'],
    souvenirTypes: row.souvenir_types || extra.souvenirTypes || [],
    createdAt: row.created_at || extra.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || extra.updatedAt || new Date().toISOString(),
  });
}

function eventModelToRow(id: string, data: any, existingRow?: any): any {
  const prevExtra = existingRow?.settings && typeof existingRow.settings === 'object' ? existingRow.settings : {};
  const merged = { ...prevExtra, ...serializeForStorage(data) };
  return {
    id,
    title: merged.title ?? existingRow?.title ?? 'Untitled Event',
    couple_name: merged.coupleName ?? existingRow?.couple_name ?? null,
    slug: merged.slug ?? existingRow?.slug ?? null,
    partner_id: merged.partnerId ?? existingRow?.partner_id ?? null,
    client_id: merged.clientId ?? existingRow?.client_id ?? null,
    date: merged.date ?? existingRow?.date ?? null,
    time: merged.time ?? existingRow?.time ?? null,
    location: merged.location ?? existingRow?.location ?? null,
    theme: merged.rsvpTheme ?? existingRow?.theme ?? 'default',
    rsvp_theme: merged.rsvpTheme ?? existingRow?.rsvp_theme ?? 'default',
    cover_image: merged.thumbnailUrl !== undefined ? (merged.thumbnailUrl || null) : (merged.coverImage ?? existingRow?.cover_image ?? null),
    thumbnail_url: merged.thumbnailUrl !== undefined ? (merged.thumbnailUrl || null) : (existingRow?.thumbnail_url ?? null),
    frame_overlay_url: merged.frameOverlayUrl !== undefined ? (merged.frameOverlayUrl || null) : (existingRow?.frame_overlay_url ?? null),
    digital_invite_link: merged.digitalInviteLink ?? existingRow?.digital_invite_link ?? null,
    invitation_url: merged.invitationUrl ?? existingRow?.invitation_url ?? null,
    status: merged.status ?? existingRow?.status ?? 'published',
    sessions: merged.sessions ?? existingRow?.sessions ?? [],
    guest_categories: merged.guestCategories ?? existingRow?.guest_categories ?? ['VIP', 'Keluarga', 'Reguler'],
    souvenir_types: merged.souvenirTypes ?? existingRow?.souvenir_types ?? [],
    settings: merged,
    updated_at: new Date().toISOString(),
  };
}

function rowToGuestModel(row: any): any {
  return hydrateDates({
    id: row.id,
    eventId: row.event_id,
    ticketCode: row.ticket_code || '',
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    category: row.category || 'Reguler',
    invitationType: row.invitation_type || row.qr_code || '',
    tableNumber: row.seat || '',
    seat: row.seat || '',
    pax: row.pax ?? 1,
    session: row.session || '',
    rsvpStatus: row.rsvp_status || row.status || 'pending',
    status: row.status || row.rsvp_status || 'pending',
    attended: Boolean(row.attended),
    attendedAt: row.check_in_time || null,
    checkInTime: row.check_in_time || null,
    checkInStaff: row.check_in_staff || null,
    souvenirTaken: Boolean(row.souvenir_taken),
    souvenirClaimed: Boolean(row.souvenir_taken),
    souvenirName: row.souvenir_type || null,
    souvenirTakenAt: row.souvenir_time || null,
    wishes: row.wishes || '',
    stickerUrl: row.sticker_url || '',
    address: row.notes || '',
    notes: row.notes || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    timestamp: row.updated_at || row.created_at || new Date().toISOString(),
  });
}

function guestModelToRow(id: string, eventId: string, data: any, existingRow?: any): any {
  const s = serializeForStorage(data);
  const checkInRaw =
    s.checkInTime !== undefined
      ? s.checkInTime
      : s.attendedAt !== undefined
      ? s.attendedAt
      : existingRow?.check_in_time ?? null;
  const souvenirTimeRaw =
    s.souvenirTakenAt !== undefined ? s.souvenirTakenAt : existingRow?.souvenir_time ?? null;
  const rsvp = s.rsvpStatus ?? s.status ?? existingRow?.rsvp_status ?? 'pending';
  const validStatus = ['pending', 'attending', 'declined'].includes(rsvp) ? rsvp : 'pending';

  return {
    id,
    event_id: eventId || s.eventId || existingRow?.event_id,
    ticket_code: s.ticketCode !== undefined ? s.ticketCode : existingRow?.ticket_code ?? null,
    name: s.name !== undefined ? s.name : existingRow?.name ?? 'Tamu',
    phone: s.phone !== undefined ? s.phone : existingRow?.phone ?? null,
    email: s.email !== undefined ? s.email : existingRow?.email ?? null,
    category: s.category !== undefined ? s.category : existingRow?.category ?? 'Reguler',
    qr_code: s.invitationType !== undefined ? (s.invitationType || null) : existingRow?.qr_code ?? null,
    seat: s.tableNumber !== undefined ? s.tableNumber : s.seat !== undefined ? s.seat : existingRow?.seat ?? null,
    pax: s.pax !== undefined ? Number(s.pax) : existingRow?.pax ?? 1,
    session: s.session !== undefined ? s.session : existingRow?.session ?? null,
    status: validStatus,
    rsvp_status: rsvp,
    attended: s.attended !== undefined ? Boolean(s.attended) : Boolean(existingRow?.attended),
    check_in_time: checkInRaw ? new Date(checkInRaw).toISOString() : null,
    check_in_staff: s.checkInStaff !== undefined ? s.checkInStaff : existingRow?.check_in_staff ?? null,
    souvenir_taken:
      s.souvenirTaken !== undefined
        ? Boolean(s.souvenirTaken)
        : s.souvenirClaimed !== undefined
        ? Boolean(s.souvenirClaimed)
        : Boolean(existingRow?.souvenir_taken),
    souvenir_type: s.souvenirName !== undefined ? s.souvenirName : existingRow?.souvenir_type ?? null,
    souvenir_time: souvenirTimeRaw ? new Date(souvenirTimeRaw).toISOString() : null,
    wishes: s.wishes !== undefined ? s.wishes : existingRow?.wishes ?? null,
    sticker_url: s.stickerUrl !== undefined ? s.stickerUrl : existingRow?.sticker_url ?? null,
    notes: s.address !== undefined ? s.address : s.notes !== undefined ? s.notes : existingRow?.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

function rowToUserModel(row: any, metaData?: any): any {
  const extra = metaData && typeof metaData === 'object' ? metaData : {};
  return hydrateDates({
    ...extra,
    id: row.id,
    uid: row.id,
    email: row.email || extra.email || '',
    name: row.name || extra.name || '',
    role: extra.role || row.role || 'client',
    staffType: extra.staffType || undefined,
    assignedEventIds: Array.isArray(extra.assignedEventIds) ? extra.assignedEventIds : undefined,
    partnerId: row.partner_id ?? extra.partnerId ?? null,
    clientId: row.client_id ?? extra.clientId ?? null,
    createdAt: row.created_at || extra.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || extra.updatedAt || new Date().toISOString(),
  });
}

// ================= CORE CRUD OPERATIONS =================

function applyFieldOperators(existing: Record<string, any>, incoming: Record<string, any>, merge: boolean): Record<string, any> {
  const base = merge ? { ...existing } : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v && typeof v === 'object') {
      if (v.__op === 'deleteField') {
        delete base[k];
        continue;
      }
      if (v.__op === 'increment') {
        const current = typeof base[k] === 'number' ? base[k] : 0;
        base[k] = current + Number(v.value || 0);
        continue;
      }
      if (v.__op === 'serverTimestamp') {
        base[k] = new Date().toISOString();
        continue;
      }
    }
    base[k] = serializeForStorage(v);
  }
  return base;
}

let crossTabChannel: BroadcastChannel | null = null;
let globalRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let globalRealtimeSubscribed = false;

function initGlobalSyncChannels() {
  if (typeof window === 'undefined') return;

  if (!crossTabChannel && typeof BroadcastChannel !== 'undefined') {
    try {
      crossTabChannel = new BroadcastChannel('guestly-cross-tab-sync');
      crossTabChannel.onmessage = (event) => {
        if (event.data?.collectionName) {
          window.dispatchEvent(
            new CustomEvent('supabase-compat-change', { detail: event.data })
          );
        }
      };
    } catch {
      // ignore if BroadcastChannel is blocked
    }
  }

  if (!globalRealtimeChannel) {
    try {
      globalRealtimeChannel = supabase.channel('guestly-global-sync');
      globalRealtimeChannel
        .on('broadcast', { event: 'data_changed' }, (payload) => {
          const detail = payload?.payload || {};
          window.dispatchEvent(
            new CustomEvent('supabase-compat-change', { detail })
          );
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            globalRealtimeSubscribed = true;
          }
        });
    } catch {
      // ignore realtime init error
    }
  }
}

if (typeof window !== 'undefined') {
  initGlobalSyncChannels();
}

export function notifyLocalListeners(collectionName: string, docId?: string) {
  if (typeof window !== 'undefined') {
    const detail = { collectionName, docId, timestamp: Date.now() };
    window.dispatchEvent(new CustomEvent('supabase-compat-change', { detail }));

    initGlobalSyncChannels();

    if (crossTabChannel) {
      try {
        crossTabChannel.postMessage(detail);
      } catch {
        // ignore
      }
    }

    if (globalRealtimeChannel && globalRealtimeSubscribed) {
      try {
        globalRealtimeChannel.send({
          type: 'broadcast',
          event: 'data_changed',
          payload: detail,
        });
      } catch {
        // ignore
      }
    }
  }
}

export async function getDoc(docRef: DocRef): Promise<DocSnapshot> {
  const { collectionName, id, parentId } = docRef;

  if (collectionName === 'events') {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (error || !data) return new DocSnapshot(id, null, docRef);
    return new DocSnapshot(id, rowToEventModel(data), docRef);
  }

  if (collectionName === 'guests') {
    let q = supabase.from('guests').select('*').eq('id', id);
    if (parentId) q = q.eq('event_id', parentId);
    const { data, error } = await q.maybeSingle();
    if (error || !data) return new DocSnapshot(id, null, docRef);
    return new DocSnapshot(id, rowToGuestModel(data), docRef);
  }

  if (collectionName === 'users') {
    const [{ data: userRow }, { data: metaRow }] = await Promise.all([
      supabase.from('users').select('*').eq('id', id).maybeSingle(),
      supabase.from('settings').select('data').eq('id', `doc:users:${id}`).maybeSingle(),
    ]);
    if (!userRow && !metaRow) return new DocSnapshot(id, null, docRef);
    if (userRow) {
      return new DocSnapshot(id, rowToUserModel(userRow, metaRow?.data), docRef);
    }
    return new DocSnapshot(id, hydrateDates({ id, ...metaRow?.data }), docRef);
  }

  if (collectionName === 'settings') {
    const { data } = await supabase.from('settings').select('*').eq('id', id).maybeSingle();
    if (data && data.data) {
      return new DocSnapshot(id, data.data, docRef);
    }
    const { data: fallback } = await supabase
      .from('settings')
      .select('*')
      .eq('id', `doc:settings:${id}`)
      .maybeSingle();
    if (fallback && fallback.data) {
      return new DocSnapshot(id, fallback.data, docRef);
    }
    return new DocSnapshot(id, null, docRef);
  }

  // Generic collection stored in settings table as doc:{collectionName}:{id}
  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('id', `doc:${collectionName}:${id}`)
    .maybeSingle();
  if (!data || !data.data) return new DocSnapshot(id, null, docRef);
  return new DocSnapshot(id, { id, ...data.data }, docRef);
}

export const getDocFromServer = getDoc;

function evaluateWhere(docData: any, id: string, field: string, op: string, val: any): boolean {
  const rawFieldVal = field === 'id' || field === '__name__' ? id : docData[field];
  const fieldVal = rawFieldVal instanceof Timestamp ? rawFieldVal.toMillis() : rawFieldVal;
  const targetVal = val instanceof Timestamp ? val.toMillis() : val;

  switch (op) {
    case '==':
      if (field === 'ticketCode') {
        return (
          String(fieldVal || '').trim().toUpperCase() ===
          String(targetVal || '').trim().toUpperCase()
        );
      }
      return fieldVal === targetVal;
    case '!=':
      return fieldVal !== targetVal;
    case '>':
      return fieldVal > targetVal;
    case '>=':
      return fieldVal >= targetVal;
    case '<':
      return fieldVal < targetVal;
    case '<=':
      return fieldVal <= targetVal;
    case 'in':
      return Array.isArray(targetVal) && targetVal.includes(fieldVal);
    case 'array-contains':
      return Array.isArray(fieldVal) && fieldVal.includes(targetVal);
    default:
      return true;
  }
}

async function fetchAllRows(buildQuery: () => any): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function getDocs(queryOrRef: any): Promise<QuerySnapshot> {
  const collectionName = queryOrRef.collectionName;
  const parentId = queryOrRef.parentId;
  const constraints: any[] = queryOrRef.constraints || [];

  let docs: DocSnapshot[] = [];

  if (collectionName === 'events') {
    const data = await fetchAllRows(() => {
      let q = supabase.from('events').select('*');
      for (const c of constraints) {
        if (c.__type === 'where' && c.op === '==') {
          if (c.field === 'partnerId') q = q.eq('partner_id', c.value);
          else if (c.field === 'clientId') q = q.eq('client_id', c.value);
          else if (c.field === 'date') q = q.eq('date', c.value);
          else if (c.field === 'status') q = q.eq('status', c.value);
        }
      }
      return q.order('created_at', { ascending: false });
    });
    docs = (data || []).map((row) => {
      const model = rowToEventModel(row);
      return new DocSnapshot(row.id, model, doc(db, 'events', row.id));
    });
  } else if (collectionName === 'guests') {
    const data = await fetchAllRows(() => {
      let q = supabase.from('guests').select('*');
      if (parentId) {
        q = q.eq('event_id', parentId);
      }
      for (const c of constraints) {
        if (c.__type === 'where' && c.op === '==') {
          if (c.field === 'eventId') q = q.eq('event_id', c.value);
          else if (c.field === 'ticketCode') q = q.ilike('ticket_code', String(c.value || '').trim());
          else if (c.field === 'attended') q = q.eq('attended', c.value);
          else if (c.field === 'rsvpStatus') q = q.eq('rsvp_status', c.value);
        }
      }
      return q.order('created_at', { ascending: false });
    });
    docs = (data || []).map((row) => {
      const model = rowToGuestModel(row);
      const refPath = parentId ? ['events', parentId, 'guests', row.id] : ['guests', row.id];
      return new DocSnapshot(row.id, model, doc(db, ...refPath));
    });
  } else if (collectionName === 'users') {
    const [{ data: userRows }, { data: metaRows }] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('settings').select('*').like('id', 'doc:users:%'),
    ]);
    const metaMap = new Map<string, any>();
    for (const m of metaRows || []) {
      const uid = m.id.replace('doc:users:', '');
      metaMap.set(uid, m.data);
    }
    const seen = new Set<string>();
    for (const u of userRows || []) {
      seen.add(u.id);
      const model = rowToUserModel(u, metaMap.get(u.id));
      docs.push(new DocSnapshot(u.id, model, doc(db, 'users', u.id)));
    }
    for (const [uid, mData] of metaMap.entries()) {
      if (!seen.has(uid) && mData) {
        docs.push(new DocSnapshot(uid, hydrateDates({ id: uid, uid, ...mData }), doc(db, 'users', uid)));
      }
    }
  } else if (collectionName === 'settings') {
    const { data } = await supabase.from('settings').select('*').not('id', 'like', 'doc:%');
    docs = (data || []).map((row) => new DocSnapshot(row.id, row.data, doc(db, 'settings', row.id)));
  } else {
    const prefix = `doc:${collectionName}:`;
    const { data } = await supabase.from('settings').select('*').like('id', `${prefix}%`);
    docs = (data || []).map((row) => {
      const itemId = row.id.slice(prefix.length);
      return new DocSnapshot(itemId, { id: itemId, ...(row.data || {}) }, doc(db, collectionName, itemId));
    });
  }

  // Apply remaining in-memory where filters
  for (const c of constraints) {
    if (c.__type === 'where') {
      docs = docs.filter((d) => evaluateWhere(d.data(), d.id, c.field, c.op, c.value));
    }
  }

  // Apply orderBy constraints
  const orderBys = constraints.filter((c) => c.__type === 'orderBy');
  if (orderBys.length > 0) {
    docs.sort((a, b) => {
      const da = a.data();
      const dbData = b.data();
      for (const ob of orderBys) {
        const va = da[ob.field] instanceof Timestamp ? da[ob.field].toMillis() : da[ob.field] ?? '';
        const vb = dbData[ob.field] instanceof Timestamp ? dbData[ob.field].toMillis() : dbData[ob.field] ?? '';
        if (va < vb) return ob.direction === 'desc' ? 1 : -1;
        if (va > vb) return ob.direction === 'desc' ? -1 : 1;
      }
      return 0;
    });
  }

  // Apply startAfter
  const startAfterConstraint = constraints.find((c) => c.__type === 'startAfter');
  if (startAfterConstraint && startAfterConstraint.cursor) {
    const cursorId =
      typeof startAfterConstraint.cursor === 'string'
        ? startAfterConstraint.cursor
        : startAfterConstraint.cursor.id;
    const idx = docs.findIndex((d) => d.id === cursorId);
    if (idx !== -1) {
      docs = docs.slice(idx + 1);
    }
  }

  // Apply limit
  const limitConstraint = constraints.find((c) => c.__type === 'limit');
  if (limitConstraint && typeof limitConstraint.count === 'number') {
    docs = docs.slice(0, limitConstraint.count);
  }

  return new QuerySnapshot(docs);
}

export async function getCountFromServer(queryOrRef: any): Promise<{ data: () => { count: number } }> {
  const snap = await getDocs(queryOrRef);
  return {
    data: () => ({ count: snap.size }),
  };
}

export async function setDoc(docRef: DocRef, data: any, options?: { merge?: boolean }): Promise<void> {
  const { collectionName, id, parentId } = docRef;
  const merge = Boolean(options?.merge);

  if (collectionName === 'events') {
    let existingRow: any = null;
    if (merge) {
      const { data: ex } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
      existingRow = ex;
    }
    const existingModel = existingRow ? rowToEventModel(existingRow) : {};
    const updatedModel = applyFieldOperators(existingModel, data, merge);
    const row = eventModelToRow(id, updatedModel, existingRow);
    const { error } = await supabase.from('events').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    notifyLocalListeners('events', id);
    return;
  }

  if (collectionName === 'guests') {
    let existingRow: any = null;
    if (merge) {
      const { data: ex } = await supabase.from('guests').select('*').eq('id', id).maybeSingle();
      existingRow = ex;
    }
    const existingModel = existingRow ? rowToGuestModel(existingRow) : {};
    const updatedModel = applyFieldOperators(existingModel, data, merge);
    const eventId = parentId || updatedModel.eventId || existingRow?.event_id;
    const row = guestModelToRow(id, eventId, updatedModel, existingRow);
    const { error } = await supabase.from('guests').upsert(row, { onConflict: 'id' });
    if (error) throw error;

    if (row.attended && eventId) {
      try {
        const channel = supabase.channel(`guests-realtime-${eventId}`);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel.send({
              type: 'broadcast',
              event: 'guest_checked_in',
              payload: row,
            });
          }
        });
      } catch (_e) {
        // ignore broadcast errors
      }
    }
    notifyLocalListeners('guests', id);
    return;
  }

  if (collectionName === 'users') {
    const existingSnap = await getDoc(docRef);
    const existingModel = existingSnap?.exists() ? existingSnap.data() : {};
    const preservedPassword = existingModel?._password;
    const updatedModel = applyFieldOperators(existingModel, data, merge);
    if (data?._password || data?.password) {
      updatedModel._password = data._password || data.password;
      delete updatedModel.password;
    } else if (preservedPassword && !updatedModel._password) {
      updatedModel._password = preservedPassword;
    }
    const exactRole = updatedModel.role || 'client';
    const fallbackRole = ['superadmin', 'partner', 'client'].includes(exactRole)
      ? exactRole
      : exactRole === 'owner'
      ? 'partner'
      : 'client';

    const { error: userRowErr } = await supabase.from('users').upsert(
      {
        id,
        email: updatedModel.email || `${id}@guestly.app`,
        name: updatedModel.name || '',
        role: exactRole,
        partner_id: null,
        client_id: updatedModel.clientId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (userRowErr) {
      await supabase.from('users').upsert(
        {
          id,
          email: updatedModel.email || `${id}@guestly.app`,
          name: updatedModel.name || '',
          role: fallbackRole,
          partner_id: null,
          client_id: updatedModel.clientId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    }

    const { error } = await supabase.from('settings').upsert(
      {
        id: `doc:users:${id}`,
        data: { ...updatedModel, id, uid: id, updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) throw error;
    notifyLocalListeners('users', id);
    return;
  }

  if (collectionName === 'settings') {
    let existingData: any = {};
    if (merge) {
      const snap = await getDoc(docRef);
      if (snap.exists()) existingData = snap.data();
    }
    const updatedData = applyFieldOperators(existingData, data, merge);
    const { error } = await supabase.from('settings').upsert(
      {
        id,
        data: updatedData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) throw error;
    notifyLocalListeners('settings', id);
    return;
  }

  // Generic collection stored in settings as doc:{collectionName}:{id}
  const key = `doc:${collectionName}:${id}`;
  let existingData: any = {};
  if (merge) {
    const { data: ex } = await supabase.from('settings').select('data').eq('id', key).maybeSingle();
    if (ex?.data) existingData = ex.data;
  }
  const updatedData = applyFieldOperators(existingData, data, merge);
  const { error } = await supabase.from('settings').upsert(
    {
      id: key,
      data: { ...updatedData, id },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
  notifyLocalListeners(collectionName, id);
}

export async function updateDoc(docRef: DocRef, data: any): Promise<void> {
  return setDoc(docRef, data, { merge: true });
}

export async function addDoc(colRef: CollectionRef, data: any): Promise<DocRef> {
  const newId = generateId();
  const newDocRef: DocRef = {
    __type: 'doc',
    path: `${colRef.path}/${newId}`,
    id: newId,
    collectionName: colRef.collectionName,
    parentId: colRef.parentId,
  };
  await setDoc(newDocRef, data, { merge: false });
  return newDocRef;
}

export async function deleteDoc(docRef: DocRef): Promise<void> {
  const { collectionName, id } = docRef;
  if (collectionName === 'events') {
    await supabase.from('guests').delete().eq('event_id', id);
    await supabase.from('events').delete().eq('id', id);
    notifyLocalListeners('events', id);
    return;
  }
  if (collectionName === 'guests') {
    await supabase.from('guests').delete().eq('id', id);
    notifyLocalListeners('guests', id);
    return;
  }
  if (collectionName === 'users') {
    await supabase.from('settings').delete().eq('id', `doc:users:${id}`);
    await supabase.from('users').delete().eq('id', id);
    notifyLocalListeners('users', id);
    return;
  }
  if (collectionName === 'settings') {
    await supabase.from('settings').delete().eq('id', id);
    notifyLocalListeners('settings', id);
    return;
  }
  await supabase.from('settings').delete().eq('id', `doc:${collectionName}:${id}`);
  notifyLocalListeners(collectionName, id);
}

export function writeBatch(_db?: any) {
  const ops: Array<{ type: 'set' | 'update' | 'delete'; ref: DocRef; data?: any; options?: any }> = [];
  return {
    set(ref: DocRef, data: any, options?: any) {
      ops.push({ type: 'set', ref, data, options });
    },
    update(ref: DocRef, data: any) {
      ops.push({ type: 'update', ref, data });
    },
    delete(ref: DocRef) {
      ops.push({ type: 'delete', ref });
    },
    async commit() {
      // Fast path for bulk guest inserts/upserts
      const guestSets = ops.filter(
        (o) => o.type === 'set' && o.ref.collectionName === 'guests' && !o.options?.merge
      );
      // Fast path for bulk guest deletes
      const guestDeletes = ops.filter(
        (o) => o.type === 'delete' && o.ref.collectionName === 'guests'
      );
      const otherOps = ops.filter(
        (o) =>
          !(o.type === 'set' && o.ref.collectionName === 'guests' && !o.options?.merge) &&
          !(o.type === 'delete' && o.ref.collectionName === 'guests')
      );

      if (guestSets.length > 0) {
        const rows = guestSets.map((o) => {
          const eventId = o.ref.parentId || o.data?.eventId;
          return guestModelToRow(o.ref.id, eventId, o.data);
        });
        const { error } = await supabase.from('guests').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        notifyLocalListeners('guests');
      }

      if (guestDeletes.length > 0) {
        const ids = guestDeletes.map((o) => o.ref.id);
        const { error } = await supabase.from('guests').delete().in('id', ids);
        if (error) throw error;
        notifyLocalListeners('guests');
      }

      for (const op of otherOps) {
        if (op.type === 'set') await setDoc(op.ref, op.data, op.options);
        else if (op.type === 'update') await updateDoc(op.ref, op.data);
        else if (op.type === 'delete') await deleteDoc(op.ref);
      }
    },
  };
}

let txMutex: Promise<any> = Promise.resolve();

export async function runTransaction(_db: any, updateFunction: (transaction: any) => Promise<any>) {
  const executeTx = async () => {
    const pendingWrites: Array<() => Promise<void>> = [];
    const transaction = {
      async get(ref: DocRef) {
        return getDoc(ref);
      },
      set(ref: DocRef, data: any, options?: any) {
        pendingWrites.push(() => setDoc(ref, data, options));
        return transaction;
      },
      update(ref: DocRef, data: any) {
        pendingWrites.push(() => updateDoc(ref, data));
        return transaction;
      },
      delete(ref: DocRef) {
        pendingWrites.push(() => deleteDoc(ref));
        return transaction;
      },
    };
    const result = await updateFunction(transaction);
    for (const write of pendingWrites) {
      await write();
    }
    return result;
  };

  const nextTx = txMutex.then(executeTx, executeTx);
  txMutex = nextTx.catch(() => {});
  return nextTx;
}

export function onSnapshot(target: any, onNext: (snap: any) => void, onError?: (err: any) => void) {
  let active = true;
  const isDoc = target.__type === 'doc';
  const collectionName = target.collectionName;

  const fetchAndEmit = async () => {
    if (!active) return;
    try {
      const snap = isDoc ? await getDoc(target) : await getDocs(target);
      if (active) onNext(snap);
    } catch (err) {
      if (active && onError) onError(err);
    }
  };

  fetchAndEmit();

  const handleLocalChange = (e: any) => {
    if (!active) return;
    if (!e.detail?.collectionName || e.detail.collectionName === collectionName) {
      fetchAndEmit();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('supabase-compat-change', handleLocalChange);
  }

  // Subscribe to Supabase Realtime for live updates
  const tableMap: Record<string, string> = {
    events: 'events',
    guests: 'guests',
    users: 'users',
  };
  const pgTable = tableMap[collectionName] || 'settings';
  const channelName = `compat-${collectionName}-${Math.random().toString(36).slice(2, 9)}`;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: pgTable }, () => {
      if (active) fetchAndEmit();
    })
    .subscribe();

  return () => {
    active = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('supabase-compat-change', handleLocalChange);
    }
    supabase.removeChannel(channel);
  };
}

// ================= AUTHENTICATION (100% SUPABASE) =================

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: any[];
  getIdToken: () => Promise<string>;
}

const SESSION_STORAGE_KEY = 'guestly_supabase_auth_user';

function loadStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.uid) return null;
    return createAuthUserObject(parsed.uid, parsed.email, parsed.displayName);
  } catch {
    return null;
  }
}

function saveStoredUser(u: User | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!u) localStorage.removeItem(SESSION_STORAGE_KEY);
    else {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ uid: u.uid, email: u.email, displayName: u.displayName })
      );
    }
  } catch {
    // ignore storage errors
  }
}

function createAuthUserObject(uid: string, email: string | null, displayName: string | null): User {
  return {
    uid,
    email,
    displayName,
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [{ providerId: 'password', displayName, email, photoURL: null }],
    getIdToken: async () => `supabase-token:${uid}`,
  };
}

const authListeners = new Set<(user: User | null) => void>();

export const auth: {
  currentUser: User | null;
  signOut: () => Promise<void>;
} = {
  currentUser: loadStoredUser(),
  async signOut() {
    auth.currentUser = null;
    saveStoredUser(null);
    await supabase.auth.signOut().catch(() => {});
    authListeners.forEach((cb) => cb(null));
  },
};

function setCurrentAuthUser(u: User | null) {
  auth.currentUser = u;
  saveStoredUser(u);
  authListeners.forEach((cb) => cb(u));
}

export function getAuth(_app?: any) {
  return auth;
}

export class GoogleAuthProvider {}
export const googleProvider = new GoogleAuthProvider();

export function onAuthStateChanged(_authObj: any, callback: (user: User | null) => void) {
  authListeners.add(callback);
  Promise.resolve().then(() => {
    callback(auth.currentUser);
  });
  return () => {
    authListeners.delete(callback);
  };
}

async function findSupabaseUserByEmail(email: string): Promise<{ id: string; email: string; name: string; meta: any } | null> {
  const cleanEmail = email.trim().toLowerCase();
  const { data: userRow } = await supabase
    .from('users')
    .select('*')
    .ilike('email', cleanEmail)
    .maybeSingle();

  if (userRow) {
    const { data: metaRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', `doc:users:${userRow.id}`)
      .maybeSingle();
    return {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name || metaRow?.data?.name || 'User',
      meta: metaRow?.data || {},
    };
  }

  // Also search in settings doc:users:*
  const { data: metaRows } = await supabase.from('settings').select('*').like('id', 'doc:users:%');
  for (const row of metaRows || []) {
    if (row.data?.email && String(row.data.email).trim().toLowerCase() === cleanEmail) {
      const uid = row.id.replace('doc:users:', '');
      return {
        id: uid,
        email: row.data.email,
        name: row.data.name || 'User',
        meta: row.data,
      };
    }
  }
  return null;
}

export async function signInWithEmailAndPassword(_authObj: any, email: string, password: string) {
  const found = await findSupabaseUserByEmail(email);
  if (!found) {
    throw new Error('Akun dengan email tersebut tidak ditemukan di Supabase.');
  }

  const savedPassword = found.meta?._password;
  if (savedPassword && savedPassword !== password) {
    throw new Error('Password yang Anda masukkan salah.');
  }

  // If this user was migrated from Firebase and doesn't have _password saved yet, bind it now
  if (!savedPassword) {
    await supabase.from('settings').upsert(
      {
        id: `doc:users:${found.id}`,
        data: { ...found.meta, id: found.id, email: found.email, name: found.name, _password: password },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  }

  const userObj = createAuthUserObject(found.id, found.email, found.name);
  setCurrentAuthUser(userObj);
  return { user: userObj };
}

export async function createUserWithEmailAndPassword(_authObj: any, email: string, password: string) {
  const existing = await findSupabaseUserByEmail(email);
  if (existing) {
    throw new Error('Email sudah terdaftar. Silakan gunakan email lain atau login.');
  }

  const uid = generateId();
  const cleanEmail = email.trim();
  const role = cleanEmail === '64.iklas@gmail.com' ? 'superadmin' : 'client';

  await supabase.from('users').upsert(
    {
      id: uid,
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  await supabase.from('settings').upsert(
    {
      id: `doc:users:${uid}`,
      data: {
        id: uid,
        uid,
        email: cleanEmail,
        role,
        _password: password,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  const userObj = createAuthUserObject(uid, cleanEmail, cleanEmail.split('@')[0]);
  setCurrentAuthUser(userObj);
  return { user: userObj };
}

export async function createAuthUserSilently(email: string, password: string): Promise<string> {
  const existing = await findSupabaseUserByEmail(email);
  if (existing) {
    return existing.id;
  }

  const uid = generateId();
  const cleanEmail = email.trim();

  await supabase.from('users').upsert(
    {
      id: uid,
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      role: 'client',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  await supabase.from('settings').upsert(
    {
      id: `doc:users:${uid}`,
      data: {
        id: uid,
        uid,
        email: cleanEmail,
        role: 'client',
        _password: password,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  return uid;
}

export async function updatePassword(user: User, newPassword: string): Promise<void> {
  if (!user?.uid) throw new Error('User tidak ditemukan.');
  const { data: metaRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', `doc:users:${user.uid}`)
    .maybeSingle();

  await supabase.from('settings').upsert(
    {
      id: `doc:users:${user.uid}`,
      data: { ...(metaRow?.data || {}), _password: newPassword, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
}

export async function signInWithPopup(_authObj: any, _provider?: any) {
  throw new Error('Silakan login menggunakan Email dan Password.');
}

export async function loginWithGoogle() {
  throw new Error('Silakan login menggunakan Email dan Password.');
}

export async function signOut(_authObj?: any) {
  await auth.signOut();
}

export const logoutUser = () => auth.signOut();
