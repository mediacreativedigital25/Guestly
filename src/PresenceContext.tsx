import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAuth } from './AuthContext';
import { User, UserPresenceSession } from './types';
import { parseFirestoreDate, getUserBusinessId } from './lib/utils';

export interface ClientDeviceInfo {
  device: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'tv';
  os: string;
  browser: string;
}

export interface ClientNetworkInfo {
  ip: string;
  location: string;
  city: string;
  region: string;
  country: string;
  isp: string;
}

export interface UnifiedUserTelemetry {
  isOnline: boolean;
  lastSeenDate: Date | null;
  ip: string;
  location: string;
  city: string;
  region: string;
  country: string;
  isp: string;
  deviceLabel: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'tv';
  os: string;
  browser: string;
  activePageLabel: string;
  activePath: string;
}

interface PersistedUserTelemetry {
  userId: string;
  name?: string;
  email?: string;
  role?: any;
  staffType?: any;
  partnerId?: string | null;
  businessName?: string;
  lastSeenAt?: string;
  lastIp?: string;
  lastLocation?: string;
  lastCity?: string;
  lastRegion?: string;
  lastCountry?: string;
  lastIsp?: string;
  lastDevice?: string;
  lastDeviceType?: 'mobile' | 'tablet' | 'desktop' | 'tv';
  lastOs?: string;
  lastBrowser?: string;
  lastActivePath?: string;
  lastActivePageLabel?: string;
  isOnline?: boolean;
}

interface PresenceContextType {
  onlineUsersMap: Record<string, UserPresenceSession>;
  onlineUsersList: UserPresenceSession[];
  myDeviceInfo: ClientDeviceInfo;
  myNetworkInfo: ClientNetworkInfo | null;
  isUserOnline: (userId?: string, userDoc?: Partial<User>) => boolean;
  getUserTelemetry: (user: Partial<User>) => UnifiedUserTelemetry;
  getScopedOnlineUsers: (viewer: User | null, allKnownUsers?: User[]) => UserPresenceSession[];
}

export function detectClientDevice(): ClientDeviceInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      device: 'Desktop • Browser',
      deviceType: 'desktop',
      os: 'Desktop OS',
      browser: 'Browser',
    };
  }

  const ua = navigator.userAgent || '';

  const isTV = /SmartTV|Tizen|Web0S|NetCast|BRAVIA|AFTB|AFTT|AFTM|Android TV|GoogleTV|CrKey/i.test(ua);
  const isTablet =
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const isMobile = !isTablet && !isTV && /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  const deviceType: 'mobile' | 'tablet' | 'desktop' | 'tv' = isTV
    ? 'tv'
    : isTablet
    ? 'tablet'
    : isMobile
    ? 'mobile'
    : 'desktop';

  let os = 'Desktop PC';
  if (isTV) {
    os = 'Smart TV';
  } else if (/iPhone/i.test(ua)) {
    os = 'iPhone (iOS)';
  } else if (/iPad/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) {
    os = 'iPad (iPadOS)';
  } else if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s([0-9.]+)/i);
    os = match ? `Android ${match[1].split('.')[0]}` : 'Android';
  } else if (/Windows NT 10\.0/i.test(ua)) {
    os = 'Windows 10/11';
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows PC';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'Mac (macOS)';
  } else if (/CrOS/i.test(ua)) {
    os = 'Chromebook';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux PC';
  }

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari\//i.test(ua)) {
    browser = 'Safari';
  }

  return {
    device: `${os} • ${browser}`,
    deviceType,
    os,
    browser,
  };
}

const GEO_CACHE_KEY = 'guestly_client_geo_v1';

export async function resolveClientNetworkInfo(): Promise<ClientNetworkInfo> {
  if (typeof window !== 'undefined') {
    try {
      const cached = sessionStorage.getItem(GEO_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.ip && parsed.ip !== '-') {
          return parsed;
        }
      }
    } catch {
      // ignore storage error
    }
  }

  const fetchWithTimeout = async (url: string, timeoutMs = 4000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  let info: ClientNetworkInfo = {
    ip: '-',
    location: 'Indonesia',
    city: '',
    region: '',
    country: 'Indonesia',
    isp: '',
  };

  // 1. Try ipwho.is (HTTPS, CORS-enabled)
  try {
    const data = await fetchWithTimeout('https://ipwho.is/');
    if (data && data.success !== false && data.ip) {
      const city = data.city || '';
      const region = data.region || '';
      const country = data.country || 'Indonesia';
      const isp = data.connection?.isp || data.connection?.org || '';
      const locParts = [city, region, country].filter(Boolean);
      info = {
        ip: String(data.ip),
        location: locParts.slice(0, 2).join(', ') || country,
        city,
        region,
        country,
        isp,
      };
    }
  } catch {
    // fallback 2
  }

  // 2. Fallback to db-ip free
  if (info.ip === '-') {
    try {
      const data = await fetchWithTimeout('https://api.db-ip.com/v2/free/self');
      if (data && data.ipAddress) {
        const city = data.city || '';
        const region = data.stateProv || '';
        const country = data.countryName || 'Indonesia';
        const locParts = [city, region, country].filter(Boolean);
        info = {
          ip: String(data.ipAddress),
          location: locParts.slice(0, 2).join(', ') || country,
          city,
          region,
          country,
          isp: '',
        };
      }
    } catch {
      // fallback 3
    }
  }

  // 3. Fallback to ipify
  if (info.ip === '-') {
    try {
      const data = await fetchWithTimeout('https://api.ipify.org?format=json');
      if (data && data.ip) {
        info.ip = String(data.ip);
      }
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined' && info.ip !== '-') {
    try {
      sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(info));
    } catch {
      // ignore
    }
  }

  return info;
}

export function getActivePageLabel(pathname: string): string {
  if (!pathname) return 'Aplikasi Guestly';
  if (pathname.includes('/greeting')) return 'Layar Sapa TV';
  if (pathname.includes('/scan')) return 'Scanner QR Check-In';
  if (pathname.startsWith('/auth/login/events/') && pathname.includes('/tables')) return 'Manajemen Meja';
  if (pathname.startsWith('/auth/login/events/') && pathname.includes('/edit')) return 'Edit Pengaturan Acara';
  if (pathname.startsWith('/auth/login/events/')) return 'Detail Acara & Tamu';
  if (pathname.startsWith('/auth/login/events')) return 'Daftar Acara';
  if (pathname.startsWith('/auth/login/users')) return 'Manajemen User & Tim';
  if (pathname.startsWith('/auth/login/businesses')) return 'Daftar Bisnis Partner';
  if (pathname.startsWith('/auth/login/clients')) return 'Manajemen Client';
  if (pathname.startsWith('/auth/login/approvals')) return 'Persetujuan Edit Tamu';
  if (pathname.startsWith('/auth/login/settings')) return 'Pengaturan White-Label';
  if (pathname.startsWith('/auth/login/roles')) return 'Hak Akses & Role';
  if (pathname.startsWith('/auth/login/profile')) return 'Profil Saya';
  if (pathname.startsWith('/auth/login/media')) return 'Pustaka Media';
  if (pathname.startsWith('/auth/login/admin/services')) return 'Admin: Katalog Layanan';
  if (pathname.startsWith('/auth/login/admin/invoice')) return 'Admin: Manajemen Invoice';
  if (pathname.startsWith('/auth/login/admin/settings')) return 'Admin: Pengaturan Sistem';
  if (pathname.startsWith('/auth/login/admin/wa-templates')) return 'Admin: Template WhatsApp';
  if (pathname.startsWith('/auth/login/admin/e-invitation-templates')) return 'Admin: Template E-Invite';
  if (pathname.startsWith('/auth/login/admin/greeting-templates')) return 'Admin: Template Layar Sapa';
  if (pathname.startsWith('/auth/login/services')) return 'Informasi Layanan';
  if (pathname.startsWith('/auth/login/invoices')) return 'Invoice Saya';
  if (pathname === '/auth/login' || pathname === '/auth/login/') return 'Dashboard Utama';
  return 'Panel Guestly';
}

const PresenceContext = createContext<PresenceContextType | null>(null);

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { appUser } = useAuth();
  const location = useLocation();

  const myDeviceInfo = useMemo(() => detectClientDevice(), []);
  const [myNetworkInfo, setMyNetworkInfo] = useState<ClientNetworkInfo | null>(null);
  const [presenceMap, setPresenceMap] = useState<Record<string, UserPresenceSession>>({});
  const [broadcastMap, setBroadcastMap] = useState<Record<string, UserPresenceSession>>({});
  const [persistedMap, setPersistedMap] = useState<Record<string, PersistedUserTelemetry>>({});

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localBcRef = useRef<BroadcastChannel | null>(null);
  const lastDbSyncRef = useRef<number>(0);
  const lastSyncedIpRef = useRef<string>('');
  const lastSyncedPathRef = useRef<string>('');

  // Extract primitive user fields so object reference changes never trigger effects
  const userId = appUser?.id || '';
  const userName = appUser?.name || appUser?.email || 'User';
  const userEmail = appUser?.email || '';
  const userRole = appUser?.role || 'client';
  const userStaffType = appUser?.staffType;
  const userPartnerId =
    appUser?.partnerId || (userRole === 'owner' || userRole === 'partner' ? userId : null);
  const userBusinessName = appUser?.businessName || '';

  // Resolve IP & Geolocation once on mount
  useEffect(() => {
    let mounted = true;
    resolveClientNetworkInfo().then((net) => {
      if (mounted) setMyNetworkInfo(net);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Load persisted telemetry from dedicated settings prefix `doc:user_presence:%`
  // (isolated from `users` table so it never triggers AuthContext or page reloads!)
  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    const loadPersistedPresence = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('id, data')
          .like('id', 'doc:user_presence:%');
        if (!mounted || !data) return;
        const map: Record<string, PersistedUserTelemetry> = {};
        for (const row of data) {
          const uid = String(row.id || '').replace('doc:user_presence:', '');
          if (uid && row.data) {
            map[uid] = { userId: uid, ...row.data };
          }
        }
        setPersistedMap(map);
      } catch {
        // ignore
      }
    };

    loadPersistedPresence();
    return () => {
      mounted = false;
    };
  }, [userId]);

  // Build current user's live session payload from primitive dependencies only
  const buildMySessionPayload = useCallback((): UserPresenceSession | null => {
    if (!userId) return null;
    const pageLabel =
      userRole === 'greeting'
        ? 'Layar Sapa TV'
        : getActivePageLabel(location.pathname);

    return {
      userId,
      name: userName,
      email: userEmail,
      role: userRole,
      staffType: userStaffType,
      partnerId: userPartnerId,
      businessName: userBusinessName,
      ip: myNetworkInfo?.ip || '-',
      location: myNetworkInfo?.location || 'Indonesia',
      city: myNetworkInfo?.city || '',
      region: myNetworkInfo?.region || '',
      country: myNetworkInfo?.country || 'Indonesia',
      isp: myNetworkInfo?.isp || '',
      device: myDeviceInfo.device,
      deviceType: myDeviceInfo.deviceType,
      os: myDeviceInfo.os,
      browser: myDeviceInfo.browser,
      activePath: location.pathname,
      activePageLabel: pageLabel,
      onlineAt: new Date().toISOString(),
      lastHeartbeat: Date.now(),
    };
  }, [
    userId,
    userName,
    userEmail,
    userRole,
    userStaffType,
    userPartnerId,
    userBusinessName,
    location.pathname,
    myDeviceInfo,
    myNetworkInfo,
  ]);

  // Persist telemetry silently to `doc:user_presence:{userId}` in settings table
  // WITHOUT calling notifyLocalListeners('users') so AuthContext/Dashboard never loop!
  const syncMyTelemetryToStorage = useCallback(
    async (session: UserPresenceSession, onlineState: boolean, force = false) => {
      if (!session.userId) return;
      const now = Date.now();
      const ipChanged = Boolean(
        session.ip && session.ip !== '-' && session.ip !== lastSyncedIpRef.current
      );
      const pathChanged = session.activePath !== lastSyncedPathRef.current;

      if (!force && !ipChanged && !pathChanged && now - lastDbSyncRef.current < 45000) {
        return;
      }

      lastDbSyncRef.current = now;
      if (session.ip && session.ip !== '-') lastSyncedIpRef.current = session.ip;
      if (session.activePath) lastSyncedPathRef.current = session.activePath;

      const nowIso = new Date().toISOString();
      const record: PersistedUserTelemetry = {
        userId: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
        staffType: session.staffType,
        partnerId: session.partnerId,
        businessName: session.businessName,
        lastSeenAt: nowIso,
        lastIp: session.ip,
        lastLocation: session.location,
        lastCity: session.city || '',
        lastRegion: session.region || '',
        lastCountry: session.country || 'Indonesia',
        lastIsp: session.isp || '',
        lastDevice: session.device,
        lastDeviceType: session.deviceType,
        lastOs: session.os,
        lastBrowser: session.browser,
        lastActivePath: session.activePath,
        lastActivePageLabel: session.activePageLabel,
        isOnline: onlineState,
      };

      setPersistedMap((prev) => ({
        ...prev,
        [session.userId]: record,
      }));

      try {
        await supabase.from('settings').upsert(
          {
            id: `doc:user_presence:${session.userId}`,
            data: record,
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        );
      } catch {
        // ignore transient network error
      }
    },
    []
  );

  // Setup Supabase Realtime Presence + Broadcast + Local BroadcastChannel
  useEffect(() => {
    if (!userId) {
      setPresenceMap({});
      setBroadcastMap({});
      return;
    }

    const channel = supabase.channel('guestly-online-users-v1', {
      config: {
        presence: {
          key: userId,
        },
      },
    });
    channelRef.current = channel;

    const syncPresenceState = () => {
      try {
        const rawState = channel.presenceState();
        const nextMap: Record<string, UserPresenceSession> = {};
        Object.entries(rawState).forEach(([key, presences]) => {
          if (Array.isArray(presences) && presences.length > 0) {
            const latest = presences[presences.length - 1] as any;
            if (latest && (latest.userId || key)) {
              const uid = latest.userId || key;
              nextMap[uid] = {
                ...latest,
                userId: uid,
                lastHeartbeat: latest.lastHeartbeat || Date.now(),
              };
            }
          }
        });
        setPresenceMap(nextMap);
      } catch {
        // ignore
      }
    };

    channel
      .on('presence', { event: 'sync' }, syncPresenceState)
      .on('presence', { event: 'join' }, syncPresenceState)
      .on('presence', { event: 'leave' }, syncPresenceState)
      .on('broadcast', { event: 'presence_heartbeat' }, (msg) => {
        const session = msg?.payload as UserPresenceSession | undefined;
        if (session?.userId) {
          setBroadcastMap((prev) => ({
            ...prev,
            [session.userId]: {
              ...session,
              lastHeartbeat: Date.now(),
            },
          }));
        }
      })
      .on('broadcast', { event: 'presence_leave' }, (msg) => {
        const leftUserId = msg?.payload?.userId;
        if (leftUserId) {
          setBroadcastMap((prev) => {
            const copy = { ...prev };
            delete copy[leftUserId];
            return copy;
          });
          setPresenceMap((prev) => {
            const copy = { ...prev };
            delete copy[leftUserId];
            return copy;
          });
          setPersistedMap((prev) => {
            if (!prev[leftUserId]) return prev;
            return {
              ...prev,
              [leftUserId]: {
                ...prev[leftUserId],
                isOnline: false,
                lastSeenAt: new Date().toISOString(),
              },
            };
          });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const payload = buildMySessionPayload();
          if (payload) {
            try {
              await channel.track(payload);
              channel.send({
                type: 'broadcast',
                event: 'presence_heartbeat',
                payload,
              });
            } catch {
              // ignore
            }
          }
        }
      });

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('guestly-presence-cross-tab');
        localBcRef.current = bc;
        bc.onmessage = (ev) => {
          const data = ev.data;
          if (data?.type === 'heartbeat' && data.session?.userId) {
            setBroadcastMap((prev) => ({
              ...prev,
              [data.session.userId]: {
                ...data.session,
                lastHeartbeat: Date.now(),
              },
            }));
          } else if (data?.type === 'leave' && data.userId) {
            setBroadcastMap((prev) => {
              const copy = { ...prev };
              delete copy[data.userId];
              return copy;
            });
          }
        };
      } catch {
        // ignore
      }
    }

    const handleBeforeUnload = () => {
      const payload = buildMySessionPayload();
      if (payload) {
        try {
          channel.send({
            type: 'broadcast',
            event: 'presence_leave',
            payload: { userId: payload.userId },
          });
          localBcRef.current?.postMessage({ type: 'leave', userId: payload.userId });
          syncMyTelemetryToStorage(payload, false, true);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
      try {
        channel.untrack();
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      try {
        localBcRef.current?.close();
      } catch {
        // ignore
      }
      channelRef.current = null;
      localBcRef.current = null;
    };
  }, [userId]);

  // Update presence when route or network info updates
  useEffect(() => {
    const payload = buildMySessionPayload();
    if (!payload) return;

    setBroadcastMap((prev) => ({
      ...prev,
      [payload.userId]: payload,
    }));

    if (channelRef.current) {
      try {
        channelRef.current.track(payload);
        channelRef.current.send({
          type: 'broadcast',
          event: 'presence_heartbeat',
          payload,
        });
      } catch {
        // ignore
      }
    }

    try {
      localBcRef.current?.postMessage({ type: 'heartbeat', session: payload });
    } catch {
      // ignore
    }

    syncMyTelemetryToStorage(payload, true, false);
  }, [buildMySessionPayload, syncMyTelemetryToStorage]);

  // Periodic heartbeat every 30s
  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const payload = buildMySessionPayload();
      if (payload && document.visibilityState === 'visible') {
        setBroadcastMap((prev) => ({
          ...prev,
          [payload.userId]: payload,
        }));
        try {
          channelRef.current?.track(payload);
          channelRef.current?.send({
            type: 'broadcast',
            event: 'presence_heartbeat',
            payload,
          });
          localBcRef.current?.postMessage({ type: 'heartbeat', session: payload });
        } catch {
          // ignore
        }
        syncMyTelemetryToStorage(payload, true, false);
      }

      setBroadcastMap((prev) => {
        let changed = false;
        const next: Record<string, UserPresenceSession> = {};
        (Object.entries(prev) as [string, UserPresenceSession][]).forEach(([uid, sess]) => {
          if (uid === userId || now - (sess.lastHeartbeat || 0) < 85000) {
            next[uid] = sess;
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [userId, buildMySessionPayload, syncMyTelemetryToStorage]);

  const onlineUsersMap = useMemo(() => {
    const merged: Record<string, UserPresenceSession> = {
      ...broadcastMap,
      ...presenceMap,
    };
    (Object.entries(broadcastMap) as [string, UserPresenceSession][]).forEach(([uid, bSess]) => {
      const pSess = presenceMap[uid];
      if (!pSess || (bSess.lastHeartbeat || 0) >= (pSess.lastHeartbeat || 0) || (bSess.ip && bSess.ip !== '-')) {
        merged[uid] = {
          ...(pSess || {}),
          ...bSess,
          ip: bSess.ip && bSess.ip !== '-' ? bSess.ip : pSess?.ip || '-',
          location:
            bSess.location && bSess.location !== 'Indonesia'
              ? bSess.location
              : pSess?.location || bSess.location || 'Indonesia',
        };
      }
    });
    const selfPayload = buildMySessionPayload();
    if (selfPayload) {
      merged[selfPayload.userId] = selfPayload;
    }
    return merged;
  }, [presenceMap, broadcastMap, buildMySessionPayload]);

  const onlineUsersList = useMemo(() => Object.values(onlineUsersMap), [onlineUsersMap]);

  const isUserOnline = useCallback(
    (targetUid?: string, userDoc?: Partial<User>): boolean => {
      if (!targetUid) return false;
      if (onlineUsersMap[targetUid]) return true;
      const persisted = persistedMap[targetUid];
      if (persisted && persisted.isOnline !== false && persisted.lastSeenAt) {
        const dt = parseFirestoreDate(persisted.lastSeenAt);
        if (dt && Date.now() - dt.getTime() < 90000) {
          return true;
        }
      }
      if (userDoc && userDoc.isOnline !== false && userDoc.lastSeenAt) {
        const lastDate = parseFirestoreDate(userDoc.lastSeenAt);
        if (lastDate && Date.now() - lastDate.getTime() < 90000) {
          return true;
        }
      }
      return false;
    },
    [onlineUsersMap, persistedMap]
  );

  const getUserTelemetry = useCallback(
    (user: Partial<User>): UnifiedUserTelemetry => {
      const uid = user.id || user.uid || '';
      const live = uid ? onlineUsersMap[uid] : undefined;
      const persisted = uid ? persistedMap[uid] : undefined;
      const online = isUserOnline(uid, user);

      const lastSeenDate = live
        ? new Date(live.lastHeartbeat || Date.now())
        : persisted?.lastSeenAt
        ? parseFirestoreDate(persisted.lastSeenAt)
        : user.lastSeenAt
        ? parseFirestoreDate(user.lastSeenAt)
        : user.updatedAt
        ? parseFirestoreDate(user.updatedAt)
        : null;

      const ip =
        (live?.ip && live.ip !== '-' ? live.ip : '') ||
        (persisted?.lastIp && persisted.lastIp !== '-' ? persisted.lastIp : '') ||
        (user.lastIp && user.lastIp !== '-' ? user.lastIp : '') ||
        '-';

      const city = live?.city || persisted?.lastCity || user.lastCity || '';
      const region = live?.region || persisted?.lastRegion || user.lastRegion || '';
      const country = live?.country || persisted?.lastCountry || user.lastCountry || '';
      const location =
        live?.location ||
        persisted?.lastLocation ||
        user.lastLocation ||
        [city, region, country].filter(Boolean).slice(0, 2).join(', ') ||
        '-';
      const isp = live?.isp || persisted?.lastIsp || user.lastIsp || '';

      const deviceType =
        live?.deviceType || persisted?.lastDeviceType || user.lastDeviceType || 'desktop';
      const os = live?.os || persisted?.lastOs || user.lastOs || '';
      const browser = live?.browser || persisted?.lastBrowser || user.lastBrowser || '';
      const deviceLabel =
        live?.device ||
        persisted?.lastDevice ||
        user.lastDevice ||
        (os && browser ? `${os} • ${browser}` : os || browser || '-');

      const activePath = live?.activePath || persisted?.lastActivePath || user.lastActivePath || '';
      const activePageLabel =
        live?.activePageLabel ||
        persisted?.lastActivePageLabel ||
        user.lastActivePageLabel ||
        (activePath ? getActivePageLabel(activePath) : '');

      return {
        isOnline: online,
        lastSeenDate,
        ip,
        location,
        city,
        region,
        country,
        isp,
        deviceLabel,
        deviceType,
        os,
        browser,
        activePageLabel,
        activePath,
      };
    },
    [onlineUsersMap, persistedMap, isUserOnline]
  );

  const getScopedOnlineUsers = useCallback(
    (viewer: User | null, allKnownUsers?: User[]): UserPresenceSession[] => {
      if (!viewer) return [];

      const knownMap = new Map<string, User>();
      (allKnownUsers || []).forEach((u) => {
        if (u.id) knownMap.set(u.id, u);
      });

      const combinedMap = new Map<string, UserPresenceSession>();
      onlineUsersList.forEach((sess) => {
        combinedMap.set(sess.userId, sess);
      });

      (allKnownUsers || []).forEach((u) => {
        if (!u.id || combinedMap.has(u.id)) return;
        if (isUserOnline(u.id, u)) {
          const tel = getUserTelemetry(u);
          combinedMap.set(u.id, {
            userId: u.id,
            name: u.name || u.email || 'User',
            email: u.email || '',
            role: u.role,
            staffType: u.staffType,
            partnerId: u.partnerId,
            businessName: u.businessName,
            ip: tel.ip,
            location: tel.location,
            city: tel.city,
            region: tel.region,
            country: tel.country,
            isp: tel.isp,
            device: tel.deviceLabel,
            deviceType: tel.deviceType,
            os: tel.os,
            browser: tel.browser,
            activePath: tel.activePath,
            activePageLabel: tel.activePageLabel || 'Panel Guestly',
            onlineAt: tel.lastSeenDate?.toISOString() || new Date().toISOString(),
            lastHeartbeat: tel.lastSeenDate?.getTime() || Date.now(),
          });
        }
      });

      const allOnline = Array.from(combinedMap.values());

      if (viewer.role === 'superadmin') {
        return allOnline;
      }

      const viewerBizId = getUserBusinessId(viewer) || viewer.partnerId || viewer.id;

      if (viewer.role === 'owner' || viewer.role === 'partner') {
        return allOnline.filter((sess) => {
          if (sess.userId === viewer.id) return true;
          if (sess.role === 'superadmin') return false;
          const known = knownMap.get(sess.userId);
          const targetPartnerId = sess.partnerId || known?.partnerId;
          if (targetPartnerId && (targetPartnerId === viewerBizId || targetPartnerId === viewer.id)) {
            return true;
          }
          if (known?.createdBy === viewer.id) return true;
          return false;
        });
      }

      if (viewer.role === 'admin') {
        return allOnline.filter((sess) => {
          if (sess.userId === viewer.id) return true;
          if (sess.role === 'superadmin') return false;
          const known = knownMap.get(sess.userId);
          const targetPartnerId = sess.partnerId || known?.partnerId;
          if (viewerBizId && (targetPartnerId === viewerBizId || sess.userId === viewerBizId)) {
            return true;
          }
          if (known?.createdBy === viewer.id) return true;
          return false;
        });
      }

      return allOnline.filter((sess) => sess.userId === viewer.id);
    },
    [onlineUsersList, isUserOnline, getUserTelemetry]
  );

  const value = useMemo(
    () => ({
      onlineUsersMap,
      onlineUsersList,
      myDeviceInfo,
      myNetworkInfo,
      isUserOnline,
      getUserTelemetry,
      getScopedOnlineUsers,
    }),
    [
      onlineUsersMap,
      onlineUsersList,
      myDeviceInfo,
      myNetworkInfo,
      isUserOnline,
      getUserTelemetry,
      getScopedOnlineUsers,
    ]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
};

export function usePresence(): PresenceContextType {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    throw new Error('usePresence must be used within a PresenceProvider');
  }
  return ctx;
}
