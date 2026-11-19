import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, updateDoc, runTransaction, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { User } from '../../types';
import { 
  Laptop, 
  Smartphone, 
  Search, 
  LogOut, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  MessageCircle, 
  Trash2,
  X
} from 'lucide-react';
import { showAlert, showConfirm } from '../../lib/alerts';
import {
  isSessionExpired,
  formatRelativeActivity,
  getTimeRemainingMs,
  formatTimeRemaining,
  normalizeUserDevices,
  getNonExpiredDevices,
  getMaxDevicesForRole,
  buildLegacyDeviceFields,
} from '../../lib/deviceUtils';
import { getRoleLabel, isGreetingScreenUser, getUserBusinessId } from '../../lib/utils';

export default function ActiveSessions() {
  const { appUser, logout } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [cleaningIdle, setCleaningIdle] = useState(false);
  // Periodic tick every 30s so relative timestamps, auto-reset countdowns, and Active->Idle status stay live
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const isSuperAdmin = appUser?.role === 'superadmin';
  const isOwner = appUser?.role === 'owner' || appUser?.role === 'partner' || appUser?.role === 'admin';

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Real-time listener for users
  useEffect(() => {
    if (!appUser || (!isSuperAdmin && !isOwner)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const usersRef = collection(db, 'users');

    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const fetched: User[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as User;
          fetched.push({ id: d.id, ...data });
        });

        // Build full business scope IDs consistently for Owner / Partner / Admin
        const myBizIds = new Set<string>(
          [appUser.id, appUser.partnerId, getUserBusinessId(appUser)].filter(Boolean) as string[]
        );

        if (!isSuperAdmin) {
          fetched.forEach((u) => {
            if (
              (u.partnerId && myBizIds.has(u.partnerId)) ||
              (u.belongsToReseller && myBizIds.has(u.belongsToReseller)) ||
              (u.createdBy && myBizIds.has(u.createdBy)) ||
              (u.id && myBizIds.has(u.id))
            ) {
              if (u.id) myBizIds.add(u.id);
              if (u.partnerId) myBizIds.add(u.partnerId);
            }
          });
        }

        const visibleUsers = fetched.filter((u) => {
          if (isSuperAdmin) return true;
          if (u.role === 'superadmin') return false;
          if (u.id === appUser.id) return true;
          return Boolean(
            (u.partnerId && myBizIds.has(u.partnerId)) ||
            (u.belongsToReseller && myBizIds.has(u.belongsToReseller)) ||
            (u.createdBy && myBizIds.has(u.createdBy))
          );
        });

        // Sort: active sessions first, then most recently active
        visibleUsers.sort((a, b) => {
          const aDevs = normalizeUserDevices(a);
          const bDevs = normalizeUserDevices(b);
          const aHasDev = aDevs.length > 0;
          const bHasDev = bDevs.length > 0;
          if (aHasDev && !bHasDev) return -1;
          if (!aHasDev && bHasDev) return 1;

          const aTime = aDevs[0]?.lastActiveAt || (a.lastActiveAt?.toMillis ? a.lastActiveAt.toMillis() : (a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0));
          const bTime = bDevs[0]?.lastActiveAt || (b.lastActiveAt?.toMillis ? b.lastActiveAt.toMillis() : (b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0));
          return bTime - aTime;
        });

        setUsers(visibleUsers);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching sessions:', err);
        handleFirestoreError(err, OperationType.GET, 'users');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [appUser, isSuperAdmin, isOwner]);

  // Statistics calculation (counts each active/idle device session across all users)
  const stats = useMemo(() => {
    void nowTick;
    let activeCount = 0;
    let idleCount = 0;
    let desktopCount = 0;
    let mobileCount = 0;

    users.forEach((u) => {
      const devices = normalizeUserDevices(u);
      devices.forEach((dev) => {
        const expired = isSessionExpired(dev.lastActiveAt);
        if (expired) {
          idleCount++;
        } else {
          activeCount++;
        }

        const devName = (dev.deviceName || '').toLowerCase();
        if (devName.includes('mobile') || devName.includes('android') || devName.includes('iphone') || devName.includes('ipad')) {
          mobileCount++;
        } else {
          desktopCount++;
        }
      });
    });

    return { activeCount, idleCount, desktopCount, mobileCount, totalCount: users.length };
  }, [users, nowTick]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    void nowTick;
    return users.filter((u) => {
      const devices = normalizeUserDevices(u);
      const hasDevice = devices.length > 0;
      const nonExpiredCount = getNonExpiredDevices(devices).length;
      const hasIdleDevice = devices.some((d) => isSessionExpired(d.lastActiveAt));

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchDevice = devices.some((d) => (d.deviceName || '').toLowerCase().includes(q));
        const matchBusiness = (u.businessName || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchDevice && !matchBusiness) return false;
      }

      // Role filter (accurately handles owner/partner, admin, staff, greeting, client, superadmin)
      if (roleFilter !== 'all') {
        if (roleFilter === 'owner_partner') {
          if (u.role !== 'owner' && u.role !== 'partner') return false;
        } else if (roleFilter === 'greeting') {
          if (!isGreetingScreenUser(u)) return false;
        } else if (roleFilter === 'staff') {
          if (u.role !== 'staff' || isGreetingScreenUser(u)) return false;
        } else if (u.role !== roleFilter) {
          return false;
        }
      }

      // Status filter (matches per-device stats counts accurately)
      if (statusFilter === 'active') {
        if (!hasDevice) return false;
        return nonExpiredCount > 0;
      }
      if (statusFilter === 'idle') {
        if (!hasDevice) return false;
        return hasIdleDevice;
      }

      // 'all': prefer showing users who have device, or if searching include everyone
      if (!searchQuery.trim() && !hasDevice) {
        return false;
      }

      return true;
    });
  }, [users, searchQuery, statusFilter, roleFilter, nowTick]);

  // Force Logout / Reset ALL Device Sessions for a user
  const handleForceLogout = async (userToReset: User) => {
    const isSelf = userToReset.id === appUser?.id;
    const devCount = normalizeUserDevices(userToReset).length;
    const confirmMsg = isSelf
      ? 'Apakah Anda yakin ingin memutus semua sesi perangkat Anda? Anda akan otomatis logout sekarang.'
      : devCount > 1
      ? `Apakah Anda yakin ingin memutuskan SEMUA (${devCount}) sesi perangkat untuk ${userToReset.name || userToReset.email}?\nSeluruh perangkat yang sedang login akan otomatis dikeluarkan seketika.`
      : `Apakah Anda yakin ingin memutuskan sesi perangkat untuk ${userToReset.name || userToReset.email}?\nPerangkat yang sedang login akan otomatis dikeluarkan seketika.`;

    const confirmed = await showConfirm(confirmMsg);
    if (!confirmed) return;

    setRevokingId(userToReset.id || null);
    try {
      if (!userToReset.id) throw new Error('User ID tidak valid');

      const userRef = doc(db, 'users', userToReset.id);
      await updateDoc(userRef, {
        activeDevices: [],
        activeDeviceId: null,
        activeDeviceName: null,
        sessionRevoked: !isSelf,
        sessionRevokedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (isSelf) {
        await logout();
        return;
      }

      showAlert(
        'Sesi Berhasil Diputus',
        `Sesi perangkat untuk akun ${userToReset.name || userToReset.email} berhasil direset. Pengguna kini dapat login di perangkat baru.`,
        'success'
      );
    } catch (err: any) {
      console.error('Error revoking session:', err);
      showAlert('Gagal', err.message || 'Gagal mereset sesi perangkat.', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  // Revoke ONLY a single specific device (keeps other active device signed in for multi-device Client)
  const handleRevokeSingleDevice = async (userToReset: User, targetDeviceId: string, targetDeviceName: string) => {
    if (!userToReset.id) return;
    const confirmed = await showConfirm(
      `Putus sesi perangkat "${targetDeviceName}" untuk ${userToReset.name || userToReset.email}?\nHanya perangkat ini yang akan dikeluarkan; perangkat aktif lainnya tetap dapat login.`
    );
    if (!confirmed) return;

    setRevokingId(`${userToReset.id}:${targetDeviceId}`);
    try {
      const userRef = doc(db, 'users', userToReset.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) return;
        const currentDevices = normalizeUserDevices(snap.data());
        const remaining = currentDevices.filter((d) => d.deviceId !== targetDeviceId);
        tx.update(userRef, {
          activeDevices: remaining,
          ...buildLegacyDeviceFields(remaining),
          sessionRevoked: remaining.length === 0,
          sessionRevokedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      showAlert(
        'Perangkat Diputus',
        `Perangkat "${targetDeviceName}" berhasil dikeluarkan dari akun ${userToReset.name || userToReset.email}.`,
        'success'
      );
    } catch (err: any) {
      console.error('Error revoking single device:', err);
      showAlert('Gagal', err.message || 'Gagal memutus perangkat tersebut.', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  // Clean up all expired (> 2 hours idle) device entries across visible users
  const handleCleanAllIdleSessions = async () => {
    const targets = users.filter((u) => {
      const devs = normalizeUserDevices(u);
      return devs.some((d) => isSessionExpired(d.lastActiveAt));
    });
    if (targets.length === 0) return;

    const confirmed = await showConfirm(
      `Bersihkan ${stats.idleCount} sesi perangkat yang sudah Idle (> 2 jam) dari ${targets.length} akun?\nPerangkat yang masih aktif (< 2 jam) tidak akan terganggu.`
    );
    if (!confirmed) return;

    setCleaningIdle(true);
    try {
      await Promise.all(
        targets.map(async (u) => {
          if (!u.id) return;
          const userRef = doc(db, 'users', u.id);
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(userRef);
            if (!snap.exists()) return;
            const currentDevices = normalizeUserDevices(snap.data());
            const remaining = getNonExpiredDevices(currentDevices);
            if (remaining.length !== currentDevices.length) {
              tx.update(userRef, {
                activeDevices: remaining,
                ...buildLegacyDeviceFields(remaining),
                sessionRevoked: false,
                updatedAt: serverTimestamp(),
              });
            }
          });
        })
      );
      showAlert('Sesi Idle Dibersihkan', 'Seluruh sesi perangkat idle (> 2 jam) berhasil dibersihkan.', 'success');
    } catch (err: any) {
      console.error('Error cleaning idle sessions:', err);
      showAlert('Gagal', err.message || 'Gagal membersihkan sesi idle.', 'error');
    } finally {
      setCleaningIdle(false);
    }
  };

  // Build WhatsApp confirmation notification link
  const buildUserWaUrl = (targetUser: User): string | null => {
    if (!targetUser.phone) return null;
    const cleanPhone = targetUser.phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) return null;
    const phoneWithCountry = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
    const msg = encodeURIComponent(
      `Halo Kak *${targetUser.name || 'Pengguna'}*,\n\n` +
      `Sesi login perangkat pada akun Guestly Anda (*${targetUser.email}*) telah kami reset.\n\n` +
      `Sekarang Anda sudah dapat login kembali di perangkat baru Anda:\n` +
      `🌐 ${window.location.origin}/auth/login\n\n` +
      `Terima kasih!\nAdmin Guestly`
    );
    return `https://wa.me/${phoneWithCountry}?text=${msg}`;
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium">Memuat data sesi aktif...</p>
      </div>
    );
  }

  if (!isSuperAdmin && !isOwner) {
    return (
      <div className="p-8 text-center text-rose-600 bg-rose-50 rounded-2xl border border-rose-200 m-6">
        <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-rose-500" />
        <h2 className="text-lg font-bold text-rose-900">Akses Terbatas</h2>
        <p className="text-sm text-rose-700 mt-1">
          Halaman pemantau sesi aktif hanya dapat diakses oleh Super Admin, Owner, Partner, dan Admin Bisnis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Sesi Aktif</span>
            <span className="text-2xl font-black font-mono text-slate-900">{stats.activeCount}</span>
            <span className="text-[11px] text-emerald-600 font-semibold block mt-0.5">&lt; 2 Jam Terakhir</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Sesi Idle (&gt; 2 Jam)</span>
            <span className="text-2xl font-black font-mono text-slate-900">{stats.idleCount}</span>
            <span className="text-[11px] text-amber-600 font-semibold block mt-0.5">Auto-reset siap lepas</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Laptop className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Perangkat Desktop</span>
            <span className="text-2xl font-black font-mono text-slate-900">{stats.desktopCount}</span>
            <span className="text-[11px] text-indigo-600 font-semibold block mt-0.5">Laptop / Komputer</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Perangkat Mobile</span>
            <span className="text-2xl font-black font-mono text-slate-900">{stats.mobileCount}</span>
            <span className="text-[11px] text-purple-600 font-semibold block mt-0.5">Smartphone / Tablet</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan nama, email, perangkat, atau bisnis..."
            className="w-full h-9 pl-9 pr-8 border border-slate-200 rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              title="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Semua Sesi
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'active' ? 'bg-white text-emerald-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Aktif</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('idle')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'idle' ? 'bg-white text-amber-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Idle (&gt;2 Jam)</span>
            </button>
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 border border-slate-200 bg-white rounded-xl px-3 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-hidden cursor-pointer"
          >
            <option value="all">Semua Role</option>
            <option value="owner_partner">Owner / Partner</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="greeting">Layar Sapa TV</option>
            <option value="client">Client</option>
            {isSuperAdmin && <option value="superadmin">Super Admin</option>}
          </select>

          {stats.idleCount > 0 && (
            <button
              type="button"
              disabled={cleaningIdle}
              onClick={handleCleanAllIdleSessions}
              className="h-9 inline-flex items-center gap-1.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title="Hapus semua catatan perangkat yang sudah idle lebih dari 2 jam"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-600" />
              <span>{cleaningIdle ? 'Membersihkan...' : `Bersihkan Idle (${stats.idleCount})`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-left text-xs sm:text-sm">
            <thead className="bg-slate-50/70 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Pengguna</th>
                <th className="px-5 py-3.5">Peran / Role</th>
                <th className="px-5 py-3.5">Perangkat &amp; Browser</th>
                <th className="px-5 py-3.5">Status Sesi</th>
                <th className="px-5 py-3.5">Aktivitas Terakhir</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <Laptop className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="text-sm font-semibold text-slate-600">Tidak ada sesi aktif yang cocok dengan kriteria.</p>
                    <p className="text-xs text-slate-400 mt-0.5">Coba ubah kata kunci pencarian atau ganti filter status di atas.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const devices = normalizeUserDevices(u);
                  const activeDevices = getNonExpiredDevices(devices);
                  const hasDevice = devices.length > 0;
                  const isUserBypass = u.role === 'superadmin' || isGreetingScreenUser(u);
                  const maxDevices = getMaxDevicesForRole(u.role);
                  const isAllExpired = hasDevice && activeDevices.length === 0;
                  const latestActiveTs = devices[0]?.lastActiveAt || u.lastActiveAt;
                  const earliestActiveTs = activeDevices.length > 0
                    ? activeDevices.reduce((min, d) => (d.lastActiveAt < min ? d.lastActiveAt : min), activeDevices[0].lastActiveAt)
                    : latestActiveTs;
                  const remainingMs = getTimeRemainingMs(earliestActiveTs);
                  const remainingText = formatTimeRemaining(remainingMs);
                  const waUrl = buildUserWaUrl(u);

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* User Info */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                            u.role === 'partner' || u.role === 'owner' ? 'bg-indigo-100 text-indigo-700' :
                            u.role === 'admin' ? 'bg-sky-100 text-sky-700' :
                            isGreetingScreenUser(u) ? 'bg-rose-100 text-rose-700' :
                            u.role === 'staff' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate">
                              {u.name || 'Unnamed User'}
                              {u.id === appUser?.id && (
                                <span className="ml-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                  Anda
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-slate-500 font-mono block truncate">
                              {u.email}
                            </span>
                            {u.businessName && (
                              <span className="text-[10px] text-slate-400 block truncate">
                                {u.businessName}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border w-fit ${
                            u.role === 'superadmin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            u.role === 'partner' || u.role === 'owner' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                            u.role === 'admin' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                            isGreetingScreenUser(u) ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            u.role === 'staff' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            {getRoleLabel(u.role, u.staffType)}
                          </span>
                          {!isUserBypass && maxDevices > 1 && (
                            <span className="text-[10px] font-semibold text-indigo-600">
                              Kuota: Maks. {maxDevices} Device
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Device & Browser Info */}
                      <td className="px-5 py-4">
                        {hasDevice ? (
                          <div className="space-y-2">
                            {devices.map((dev, idx) => {
                              const devExpired = isSessionExpired(dev.lastActiveAt);
                              const isMob = /mobile|android|iphone|ipad/i.test(dev.deviceName || '');
                              const singleKey = `${u.id}:${dev.deviceId}`;
                              return (
                                <div
                                  key={dev.deviceId}
                                  className={`flex items-start justify-between gap-2 ${
                                    devices.length > 1
                                      ? 'p-2 rounded-lg bg-slate-50/80 border border-slate-200/70'
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-start gap-2 min-w-0">
                                    <div className="mt-0.5 text-slate-500 shrink-0">
                                      {isMob ? (
                                        <Smartphone className="w-4 h-4 text-purple-600" />
                                      ) : (
                                        <Laptop className="w-4 h-4 text-indigo-600" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            devExpired ? 'bg-amber-400' : 'bg-emerald-500'
                                          }`}
                                          title={devExpired ? 'Idle (> 2 jam)' : 'Aktif'}
                                        />
                                        <span className="truncate">
                                          {devices.length > 1 ? `${idx + 1}. ` : ''}
                                          {dev.deviceName || 'Perangkat Web'}
                                        </span>
                                        {devices.length > 1 && devExpired && (
                                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                            Idle
                                          </span>
                                        )}
                                      </span>
                                      <span className="font-mono text-[10px] text-slate-400 block truncate max-w-[200px]">
                                        ID: {dev.deviceId} · {formatRelativeActivity(dev.lastActiveAt)}
                                      </span>
                                    </div>
                                  </div>
                                  {devices.length > 1 && (
                                    <button
                                      type="button"
                                      disabled={revokingId === singleKey || revokingId === u.id}
                                      onClick={() => handleRevokeSingleDevice(u, dev.deviceId, dev.deviceName)}
                                      className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-100 rounded-md transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                                      title={`Putus hanya perangkat "${dev.deviceName}"`}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">
                            Tidak ada perangkat aktif
                          </span>
                        )}
                      </td>

                      {/* Session Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {isUserBypass ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                              <span>Multi-Device (Bebas)</span>
                            </span>
                            {activeDevices.length > 0 && (
                              <span className="block text-[10px] text-emerald-600 font-semibold mt-1">
                                {activeDevices.length} perangkat aktif
                              </span>
                            )}
                          </div>
                        ) : hasDevice ? (
                          !isAllExpired ? (
                            <div>
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                  maxDevices > 1 && activeDevices.length >= maxDevices
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                <span
                                  className={`w-2 h-2 rounded-full animate-pulse ${
                                    maxDevices > 1 && activeDevices.length >= maxDevices
                                      ? 'bg-rose-500'
                                      : 'bg-emerald-500'
                                  }`}
                                />
                                <span>
                                  {maxDevices > 1
                                    ? `${activeDevices.length}/${maxDevices} Perangkat Aktif`
                                    : 'Aktif Terkunci'}
                                </span>
                              </span>
                              <span className="block text-[10px] text-slate-400 mt-1">
                                Auto-reset dlm: <strong className="text-slate-600">{remainingText}</strong>
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>Idle (&gt; 2 Jam)</span>
                              </span>
                              <span className="block text-[10px] text-slate-400 mt-1">
                                Lepas saat login baru
                              </span>
                            </div>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                            Offline
                          </span>
                        )}
                      </td>

                      {/* Last Active Timestamp */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-600">
                        {hasDevice ? (
                          <div>
                            <span className="font-semibold text-slate-800 block">
                              {formatRelativeActivity(latestActiveTs)}
                            </span>
                            {u.lastLoginAt && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Login: {formatRelativeActivity(u.lastLoginAt)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 whitespace-nowrap text-right space-x-1.5">
                        {hasDevice && (
                          <button
                            type="button"
                            disabled={revokingId === u.id}
                            onClick={() => handleForceLogout(u)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                            title={devices.length > 1 ? 'Putus Semua Sesi Perangkat' : 'Putus Sesi dan Logout Paksa Perangkat'}
                          >
                            <LogOut className="w-3.5 h-3.5 text-rose-600" />
                            <span>
                              {revokingId === u.id
                                ? 'Memutus...'
                                : devices.length > 1
                                ? 'Putus Semua'
                                : 'Putus Sesi'}
                            </span>
                          </button>
                        )}

                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-medium rounded-xl transition-all"
                            title="Hubungi / Kirim Notifikasi via WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">WA</span>
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
