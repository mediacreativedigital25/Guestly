import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, serverTimestamp, query, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { User, Role } from '../../types';
import { 
  Laptop, 
  Smartphone, 
  Radio, 
  Search, 
  Filter, 
  LogOut, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  MessageCircle, 
  Users,
  Check,
  Copy
} from 'lucide-react';
import { showAlert, showConfirm } from '../../lib/alerts';
import { isSessionExpired, formatRelativeActivity, getTimeRemainingMs, formatTimeRemaining } from '../../lib/deviceUtils';
import { getRoleLabel } from '../../lib/utils';

export default function ActiveSessions() {
  const { appUser } = useAuth();
  const { settings } = useSettings();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const isSuperAdmin = appUser?.role === 'superadmin';
  const isOwner = appUser?.role === 'owner' || appUser?.role === 'partner' || appUser?.role === 'admin';

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

        // Filter based on role:
        // Superadmin: see all users
        // Owner/Partner: only see users under their partnerId, or created by them, or staff
        const myPartnerId = appUser.partnerId || appUser.id;
        const visibleUsers = fetched.filter((u) => {
          if (isSuperAdmin) return true;
          if (u.id === appUser.id) return true; // self
          return u.partnerId === myPartnerId || u.belongsToReseller === myPartnerId || u.createdBy === appUser.id;
        });

        // Sort: active sessions first, then most recently active
        visibleUsers.sort((a, b) => {
          const aHasDev = Boolean(a.activeDeviceId);
          const bHasDev = Boolean(b.activeDeviceId);
          if (aHasDev && !bHasDev) return -1;
          if (!aHasDev && bHasDev) return 1;

          const aTime = a.lastActiveAt?.toMillis ? a.lastActiveAt.toMillis() : (a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0);
          const bTime = b.lastActiveAt?.toMillis ? b.lastActiveAt.toMillis() : (b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0);
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

  // Statistics calculation
  const stats = useMemo(() => {
    let activeCount = 0;
    let idleCount = 0;
    let desktopCount = 0;
    let mobileCount = 0;

    users.forEach((u) => {
      if (u.activeDeviceId) {
        const expired = isSessionExpired(u.lastActiveAt);
        if (expired) {
          idleCount++;
        } else {
          activeCount++;
        }

        const devName = (u.activeDeviceName || '').toLowerCase();
        if (devName.includes('mobile') || devName.includes('android') || devName.includes('iphone') || devName.includes('ipad')) {
          mobileCount++;
        } else {
          desktopCount++;
        }
      }
    });

    return { activeCount, idleCount, desktopCount, mobileCount, totalCount: users.length };
  }, [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Must only show users with activeDeviceId unless statusFilter is all and searching
      const hasDevice = Boolean(u.activeDeviceId);

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchDevice = (u.activeDeviceName || '').toLowerCase().includes(q);
        const matchBusiness = (u.businessName || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchDevice && !matchBusiness) return false;
      }

      // Role filter
      if (roleFilter !== 'all' && u.role !== roleFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'active') {
        if (!hasDevice) return false;
        return !isSessionExpired(u.lastActiveAt);
      }
      if (statusFilter === 'idle') {
        if (!hasDevice) return false;
        return isSessionExpired(u.lastActiveAt);
      }

      // 'all': prefer showing users who have device, or if searching include everyone
      if (!searchQuery.trim() && !hasDevice) {
        return false;
      }

      return true;
    });
  }, [users, searchQuery, statusFilter, roleFilter]);

  // Force Logout / Reset Device Session
  const handleForceLogout = async (userToReset: User) => {
    const isSelf = userToReset.id === appUser?.id;
    const confirmMsg = isSelf
      ? 'Apakah Anda yakin ingin memutus sesi perangkat Anda saat ini? Anda akan otomatis logout.'
      : `Apakah Anda yakin ingin memutuskan sesi perangkat untuk ${userToReset.name || userToReset.email}?\nPerangkat yang sedang login akan otomatis dikeluarkan seketika.`;

    const confirmed = await showConfirm(confirmMsg);
    if (!confirmed) return;

    setRevokingId(userToReset.id || null);
    try {
      if (!userToReset.id) throw new Error('User ID tidak valid');

      const userRef = doc(db, 'users', userToReset.id);
      await updateDoc(userRef, {
        activeDeviceId: null,
        activeDeviceName: null,
        sessionRevoked: true,
        sessionRevokedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showAlert(
        'Sesi Berhasil Diputus',
        `Perangkat untuk akun ${userToReset.name || userToReset.email} berhasil direset. Pengguna kini dapat login di perangkat baru.`,
        'success'
      );
    } catch (err: any) {
      console.error('Error revoking session:', err);
      showAlert('Gagal', err.message || 'Gagal mereset sesi perangkat.', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  // WhatsApp confirmation notification to user
  const handleNotifyUserWA = (targetUser: User) => {
    if (!targetUser.phone) {
      showAlert('Nomor Tidak Ada', 'Pengguna ini belum mendaftarkan nomor telepon/WhatsApp pada profilnya.', 'info');
      return;
    }
    const cleanPhone = targetUser.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
    const msg = encodeURIComponent(
      `Halo Kak *${targetUser.name || 'Pengguna'}*,\n\n` +
      `Sesi login perangkat pada akun Guestly Anda (*${targetUser.email}*) telah kami reset.\n\n` +
      `Sekarang Anda sudah dapat login kembali di perangkat baru Anda:\n` +
      `🌐 ${window.location.origin}/auth/login\n\n` +
      `Terima kasih!\nAdmin Guestly`
    );
    window.open(`https://wa.me/${phoneWithCountry}?text=${msg}`, '_blank');
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
          Halaman pemantau sesi aktif hanya dapat diakses oleh Super Admin dan Owner Bisnis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-sm">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Pemantau Sesi Aktif</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  1 Akun = 1 Device
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelola perangkat yang terhubung, amankan lisensi akun, dan lakukan logout paksa (*force logout*) secara instan.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Aturan Otomatis</span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block mt-0.5">
              Auto-Reset jika 2 Jam Idle
            </span>
          </div>
        </div>
      </div>

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
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan nama, email, perangkat, atau bisnis..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Semua Sesi
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'active' ? 'bg-white text-emerald-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Aktif</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('idle')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
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
            className="border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-hidden cursor-pointer"
          >
            <option value="all">Semua Role</option>
            <option value="partner">Partner / Owner</option>
            <option value="staff">Staff</option>
            <option value="client">Klien</option>
            {isSuperAdmin && <option value="superadmin">Super Admin</option>}
          </select>
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
                  const hasDevice = Boolean(u.activeDeviceId);
                  const isExpired = isSessionExpired(u.lastActiveAt);
                  const isUserSuperAdmin = u.role === 'superadmin';
                  const remainingMs = getTimeRemainingMs(u.lastActiveAt);
                  const remainingText = formatTimeRemaining(remainingMs);
                  const devName = u.activeDeviceName || 'Perangkat Tidak Diketahui';
                  const isMobile = devName.toLowerCase().includes('mobile') || devName.toLowerCase().includes('android') || devName.toLowerCase().includes('iphone');

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* User Info */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isUserSuperAdmin ? 'bg-purple-100 text-purple-700' :
                            u.role === 'partner' || u.role === 'owner' ? 'bg-indigo-100 text-indigo-700' :
                            u.role === 'staff' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate">
                              {u.name || 'Unnamed User'}
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
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                          isUserSuperAdmin ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          u.role === 'partner' || u.role === 'owner' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                          u.role === 'staff' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {getRoleLabel(u.role)}
                        </span>
                      </td>

                      {/* Device & Browser Info */}
                      <td className="px-5 py-4">
                        {hasDevice ? (
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 text-slate-500">
                              {isMobile ? <Smartphone className="w-4 h-4 text-purple-600" /> : <Laptop className="w-4 h-4 text-indigo-600" />}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900 block text-xs">
                                {u.activeDeviceName || 'Perangkat Web'}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 block truncate max-w-[180px]">
                                ID: {u.activeDeviceId}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">
                            Tidak ada perangkat aktif
                          </span>
                        )}
                      </td>

                      {/* Session Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {isUserSuperAdmin ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                            <span>Multi-Device (Bebas)</span>
                          </span>
                        ) : hasDevice ? (
                          !isExpired ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Aktif Terkunci</span>
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
                              {formatRelativeActivity(u.lastActiveAt)}
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
                            title="Putus Sesi dan Logout Paksa Perangkat"
                          >
                            <LogOut className="w-3.5 h-3.5 text-rose-600" />
                            <span>{revokingId === u.id ? 'Memutus...' : 'Putus Sesi'}</span>
                          </button>
                        )}

                        {u.phone && (
                          <button
                            type="button"
                            onClick={() => handleNotifyUserWA(u)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-medium rounded-xl transition-all cursor-pointer"
                            title="Hubungi / Kirim Notifikasi via WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">WA</span>
                          </button>
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
