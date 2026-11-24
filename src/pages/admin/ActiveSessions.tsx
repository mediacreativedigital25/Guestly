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
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, roleFilter, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredUsers.length);
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
  const hasActiveFilters = Boolean(searchQuery.trim() || statusFilter !== 'all' || roleFilter !== 'all');

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setRoleFilter('all');
    setCurrentPage(1);
  };

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
    <div className="space-y-4">
      {/* Compact Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Sesi Aktif</span>
            <span className="text-xl font-bold font-mono text-gray-900">{stats.activeCount}</span>
            <span className="text-[11px] text-emerald-600 font-medium block">&lt; 2 Jam Terakhir</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Sesi Idle (&gt; 2 Jam)</span>
            <span className="text-xl font-bold font-mono text-gray-900">{stats.idleCount}</span>
            <span className="text-[11px] text-amber-600 font-medium block">Siap auto-reset</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Laptop className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Desktop</span>
            <span className="text-xl font-bold font-mono text-gray-900">{stats.desktopCount}</span>
            <span className="text-[11px] text-indigo-600 font-medium block">Laptop / PC</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Mobile</span>
            <span className="text-xl font-bold font-mono text-gray-900">{stats.mobileCount}</span>
            <span className="text-[11px] text-purple-600 font-medium block">HP / Tablet</span>
          </div>
        </div>
      </div>

      {/* Box 1: Unified Filter & Search Box */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-2.5 sm:p-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan nama, email, perangkat, atau bisnis..."
              className="w-full h-8.5 pl-9 pr-8 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'idle')}
              className="h-8.5 px-2.5 text-xs bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">Semua Sesi</option>
              <option value="active">Aktif (&lt; 2 Jam)</option>
              <option value="idle">Idle (&gt; 2 Jam)</option>
            </select>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-8.5 px-2.5 text-xs bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">Semua Role</option>
              <option value="owner_partner">Owner / Partner</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="greeting">Layar Sapa TV</option>
              <option value="client">Client</option>
              {isSuperAdmin && <option value="superadmin">Super Admin</option>}
            </select>

            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="h-8.5 px-2.5 text-xs bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value={10}>Tampilkan 10</option>
              <option value={25}>Tampilkan 25</option>
              <option value={50}>Tampilkan 50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action Bar (Left-Aligned between Filter Box & Table Box) */}
      {stats.idleCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={cleaningIdle}
            onClick={handleCleanAllIdleSessions}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            title="Hapus semua catatan perangkat yang sudah idle lebih dari 2 jam"
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-600" />
            <span>{cleaningIdle ? 'Membersihkan...' : `Bersihkan Sesi Idle (${stats.idleCount})`}</span>
          </button>
        </div>
      )}

      {/* Box 2: Sessions Table Container */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-2">
            <Laptop className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">
              {hasActiveFilters
                ? 'Tidak ada sesi aktif yang cocok dengan pencarian atau filter.'
                : 'Tidak ada sesi perangkat aktif saat ini.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
              >
                Reset Pencarian &amp; Filter
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                      No
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Pengguna
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Peran / Role
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Perangkat &amp; Browser
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status Sesi
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Aktivitas Terakhir
                    </th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {paginatedUsers.map((u, index) => {
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
                      <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs font-mono text-gray-500">
                          {startIndex + index + 1}
                        </td>

                        {/* User Info */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                              u.role === 'partner' || u.role === 'owner' ? 'bg-indigo-100 text-indigo-700' :
                              u.role === 'admin' ? 'bg-sky-100 text-sky-700' :
                              isGreetingScreenUser(u) ? 'bg-rose-100 text-rose-700' :
                              u.role === 'staff' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-semibold text-gray-900 block truncate">
                                {u.name || 'Unnamed User'}
                                {u.id === appUser?.id && (
                                  <span className="ml-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                    Anda
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-gray-500 font-mono block truncate">
                                {u.email}
                              </span>
                              {u.businessName && (
                                <span className="text-[10px] text-gray-400 block truncate">
                                  {u.businessName}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border w-fit ${
                              u.role === 'superadmin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                              u.role === 'partner' || u.role === 'owner' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                              u.role === 'admin' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                              isGreetingScreenUser(u) ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              u.role === 'staff' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
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
                        <td className="px-4 py-3.5">
                          {hasDevice ? (
                            <div className="space-y-1.5">
                              {devices.map((dev, idx) => {
                                const devExpired = isSessionExpired(dev.lastActiveAt);
                                const isMob = /mobile|android|iphone|ipad/i.test(dev.deviceName || '');
                                const singleKey = `${u.id}:${dev.deviceId}`;
                                return (
                                  <div
                                    key={dev.deviceId}
                                    className={`flex items-start justify-between gap-2 ${
                                      devices.length > 1
                                        ? 'p-2 rounded-lg bg-gray-50 border border-gray-200/70'
                                        : ''
                                    }`}
                                  >
                                    <div className="flex items-start gap-2 min-w-0">
                                      <div className="mt-0.5 text-gray-500 shrink-0">
                                        {isMob ? (
                                          <Smartphone className="w-4 h-4 text-purple-600" />
                                        ) : (
                                          <Laptop className="w-4 h-4 text-indigo-600" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <span className="font-semibold text-gray-900 flex items-center gap-1.5 text-xs">
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
                                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                              Idle
                                            </span>
                                          )}
                                        </span>
                                        <span className="font-mono text-[10px] text-gray-400 block truncate max-w-[200px]">
                                          ID: {dev.deviceId} · {formatRelativeActivity(dev.lastActiveAt)}
                                        </span>
                                      </div>
                                    </div>
                                    {devices.length > 1 && (
                                      <button
                                        type="button"
                                        disabled={revokingId === singleKey || revokingId === u.id}
                                        onClick={() => handleRevokeSingleDevice(u, dev.deviceId, dev.deviceName)}
                                        className="p-1 text-rose-600 hover:bg-rose-50 rounded-full transition-colors shrink-0 cursor-pointer disabled:opacity-50"
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
                            <span className="text-gray-400 text-xs italic">
                              Tidak ada perangkat aktif
                            </span>
                          )}
                        </td>

                        {/* Session Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isUserBypass ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                                <span>Multi-Device</span>
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
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                    maxDevices > 1 && activeDevices.length >= maxDevices
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                      maxDevices > 1 && activeDevices.length >= maxDevices
                                        ? 'bg-rose-500'
                                        : 'bg-emerald-500'
                                    }`}
                                  />
                                  <span>
                                    {maxDevices > 1
                                      ? `${activeDevices.length}/${maxDevices} Aktif`
                                      : 'Aktif Terkunci'}
                                  </span>
                                </span>
                                <span className="block text-[10px] text-gray-400 mt-1">
                                  Auto-reset: <strong className="text-gray-600">{remainingText}</strong>
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>Idle (&gt; 2 Jam)</span>
                                </span>
                                <span className="block text-[10px] text-gray-400 mt-1">
                                  Lepas saat login baru
                                </span>
                              </div>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                              Offline
                            </span>
                          )}
                        </td>

                        {/* Last Active Timestamp */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-600">
                          {hasDevice ? (
                            <div>
                              <span className="font-semibold text-gray-800 block">
                                {formatRelativeActivity(latestActiveTs)}
                              </span>
                              {u.lastLoginAt && (
                                <span className="text-[10px] text-gray-400 block mt-0.5">
                                  Login: {formatRelativeActivity(u.lastLoginAt)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-full text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title="Hubungi / Kirim Notifikasi via WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                            {hasDevice && (
                              <button
                                type="button"
                                disabled={revokingId === u.id}
                                onClick={() => handleForceLogout(u)}
                                className="p-1.5 rounded-full text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                                title={devices.length > 1 ? 'Putus Semua Sesi Perangkat' : 'Putus Sesi & Logout Paksa'}
                              >
                                <LogOut className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50/70 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>
                  Menampilkan <strong className="text-gray-900">{startIndex + 1}</strong> –{' '}
                  <strong className="text-gray-900">{endIndex}</strong> dari{' '}
                  <strong className="text-gray-900">{filteredUsers.length}</strong> sesi
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Halaman Pertama"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Sebelumnya
                </button>
                <span className="px-2.5 py-1 text-gray-700 font-medium">
                  Hal {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Selanjutnya
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Halaman Terakhir"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
