import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Settings,
  LogOut,
  FileText,
  ChevronDown,
  ChevronRight,
  UserCog,
  Menu,
  X,
  Shield,
  User,
  Briefcase,
  CreditCard,
  ShoppingBag,
  Package,
  Receipt,
  Image as ImageIcon,
  Building2,
  Sparkles,
  Bell,
  Search,
  Clock,
  CheckCircle2,
  Monitor,
} from 'lucide-react';
import { cn, getRoleLabel, shouldHideServiceInfo, isGreetingScreenUser } from './lib/utils';
import { showConfirm } from './lib/alerts';
import RouteBreadcrumbs from './components/RouteBreadcrumbs';
import { auth, db } from './lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where, setDoc, serverTimestamp } from 'firebase/firestore';

interface TopbarNotification {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  to: string;
  type: 'approval' | 'event' | 'system';
}

export default function AppLayout() {
  const { currentUser, appUser, loading, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAdminPanelMenuOpen, setIsAdminPanelMenuOpen] = useState(false);
  const [isServiceInfoMenuOpen, setIsServiceInfoMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [resolvedBusinessName, setResolvedBusinessName] = useState<string>('');

  // Topbar states
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<TopbarNotification[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setIsNotifDropdownOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K for search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
        setIsNotifDropdownOpen(false);
        setIsProfileDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-sync active sidebar dropdown with current route (saling bergantian aktif)
  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith('/auth/login/services') || p.startsWith('/auth/login/invoices')) {
      setIsServiceInfoMenuOpen(true);
      setIsUserMenuOpen(false);
      setIsAdminPanelMenuOpen(false);
    } else if (
      p.startsWith('/auth/login/users') ||
      p.startsWith('/auth/login/businesses') ||
      p.startsWith('/auth/login/roles')
    ) {
      setIsUserMenuOpen(true);
      setIsServiceInfoMenuOpen(false);
      setIsAdminPanelMenuOpen(false);
    } else if (p.startsWith('/auth/login/admin')) {
      setIsAdminPanelMenuOpen(true);
      setIsServiceInfoMenuOpen(false);
      setIsUserMenuOpen(false);
    } else {
      setIsServiceInfoMenuOpen(false);
      setIsUserMenuOpen(false);
      setIsAdminPanelMenuOpen(false);
    }
  }, [location.pathname]);

  // Load notifications (pending approvals & upcoming events)
  useEffect(() => {
    if (!appUser) {
      setNotifications([]);
      return;
    }
    let isMounted = true;
    const loadNotifications = async () => {
      try {
        const items: TopbarNotification[] = [];

        // 1. Check pending edit_requests / approvals
        const reqSnap = await getDocs(query(collection(db, 'edit_requests'), where('status', '==', 'pending')));
        const pendingReqs = reqSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        const relevantReqs = pendingReqs.filter(r => {
          if (appUser.role === 'superadmin') return true;
          if (appUser.role === 'client') return r.requestedBy === appUser.id;
          return true;
        });

        if (relevantReqs.length > 0) {
          items.push({
            id: `approvals-${relevantReqs.length}`,
            title: `${relevantReqs.length} Pengajuan Approval Menunggu`,
            description:
              appUser.role === 'client'
                ? 'Pengajuan perubahan data tamu Anda sedang menunggu persetujuan.'
                : 'Terdapat pengajuan data tamu yang memerlukan persetujuan Anda.',
            timeLabel: 'Menunggu tindakan',
            to: '/auth/login/approvals',
            type: 'approval',
          });
        }

        // 2. Check upcoming published events within 7 days
        const evSnap = await getDocs(collection(db, 'events'));
        const now = new Date();
        evSnap.docs.forEach(docSnap => {
          const ev = docSnap.data() as any;
          if (ev.status !== 'published' || !ev.date) return;
          if (appUser.role === 'client' && ev.clientId !== (appUser.clientId || appUser.id)) return;
          if (appUser.role === 'staff' && Array.isArray(appUser.assignedEvents) && !appUser.assignedEvents.includes(docSnap.id)) return;

          const evDate = new Date(ev.date);
          if (isNaN(evDate.getTime())) return;
          const diffDays = Math.ceil((evDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 7) {
            items.push({
              id: `event-${docSnap.id}`,
              title: `Acara Terdekat: ${ev.title || 'Acara'}`,
              description: diffDays === 0 ? 'Berlangsung hari ini!' : `Berlangsung dalam ${diffDays} hari ke depan.`,
              timeLabel: ev.date,
              to: `/auth/login/events/${docSnap.id}`,
              type: 'event',
            });
          }
        });

        if (items.length === 0) {
          items.push({
            id: 'welcome-notif',
            title: `Selamat datang, ${appUser.name || 'Pengguna'}!`,
            description: `Anda login sebagai ${getRoleLabel(appUser.role, appUser.staffType)}. Semua sistem berjalan normal.`,
            timeLabel: 'Hari ini',
            to: '/auth/login',
            type: 'system',
          });
        }

        if (isMounted) {
          setNotifications(items.slice(0, 6));
        }
      } catch (_e) {
        if (isMounted) {
          setNotifications([
            {
              id: 'welcome-notif',
              title: `Halo, ${appUser.name || 'Pengguna'}`,
              description: `Anda login sebagai ${getRoleLabel(appUser.role, appUser.staffType)}.`,
              timeLabel: 'Aktif',
              to: '/auth/login',
              type: 'system',
            },
          ]);
        }
      }
    };

    loadNotifications();
    return () => {
      isMounted = false;
    };
  }, [appUser]);

  useEffect(() => {
    let isMounted = true;
    const resolveNaungan = async () => {
      if (!appUser) {
        if (isMounted) setResolvedBusinessName('');
        return;
      }
      if (appUser.role === 'superadmin') {
        if (isMounted) setResolvedBusinessName('Guestly Official (Super Admin)');
        return;
      }
      if (appUser.businessName || appUser.brandName) {
        if (isMounted) setResolvedBusinessName(appUser.businessName || appUser.brandName || '');
        return;
      }
      if (appUser.role === 'owner' || appUser.role === 'partner') {
        if (isMounted) setResolvedBusinessName(appUser.businessName || appUser.name || 'Owner WO');
        return;
      }

      try {
        let targetPartnerId = appUser.partnerId;

        if (!targetPartnerId || targetPartnerId === 'default-partner') {
          const clientLookupId = appUser.clientId || appUser.id;
          if (clientLookupId) {
            const clientSnap = await getDoc(doc(db, 'clients', clientLookupId));
            if (clientSnap.exists() && clientSnap.data()?.partnerId && clientSnap.data()?.partnerId !== 'default-partner') {
              targetPartnerId = clientSnap.data().partnerId;
            } else {
              const evSnap = await getDocs(query(collection(db, 'events'), where('clientId', '==', clientLookupId)));
              const evWithPartner = evSnap.docs.find(d => d.data()?.partnerId && d.data()?.partnerId !== 'default-partner');
              if (evWithPartner) {
                targetPartnerId = evWithPartner.data().partnerId;
              }
            }
          }
        }

        if (targetPartnerId && targetPartnerId !== 'default-partner') {
          const ownerSnap = await getDoc(doc(db, 'users', targetPartnerId));
          if (ownerSnap.exists()) {
            const oData = ownerSnap.data();
            const nameFound = oData.businessName || oData.brandName || oData.name;
            if (nameFound && isMounted) {
              setResolvedBusinessName(nameFound);
              return;
            }
          }
          const partnerQuerySnap = await getDocs(query(collection(db, 'users'), where('partnerId', '==', targetPartnerId)));
          const ownerDoc = partnerQuerySnap.docs.find(d => ['owner', 'partner'].includes(d.data()?.role));
          if (ownerDoc && isMounted) {
            const oData = ownerDoc.data();
            setResolvedBusinessName(oData.businessName || oData.brandName || oData.name || 'Guestly Official');
            return;
          }
        }

        if (appUser.createdByName && isMounted) {
          setResolvedBusinessName(appUser.createdByName.replace(/\s*\(.*\)$/, ''));
          return;
        }

        const allUsersSnap = await getDocs(collection(db, 'users'));
        const primaryOwner = allUsersSnap.docs.find(d => d.data()?.role === 'owner' || d.data()?.role === 'partner');
        if (primaryOwner && isMounted) {
          const pData = primaryOwner.data();
          setResolvedBusinessName(pData.businessName || pData.brandName || pData.name || 'Guestly Official');
          return;
        }

        if (isMounted) {
          setResolvedBusinessName('Guestly Official');
        }
      } catch (_err) {
        if (isMounted) setResolvedBusinessName('Guestly Official');
      }
    };

    resolveNaungan();
    return () => {
      isMounted = false;
    };
  }, [appUser]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Ensure URL resets to /auth/login whenever user is logged out
  useEffect(() => {
    if (!loading && (!currentUser || !appUser) && location.pathname !== '/auth/login') {
      navigate('/auth/login', { replace: true });
    }
  }, [loading, currentUser, appUser, location.pathname, navigate]);

  const handleLogoutClick = async () => {
    setIsProfileDropdownOpen(false);
    const confirmed = await showConfirm(
      'Yakin ingin keluar?',
      'Sesi Anda akan berakhir dan Anda harus login kembali untuk mengakses dashboard.'
    );
    if (!confirmed) return;

    setIsUserMenuOpen(false);
    setIsAdminPanelMenuOpen(false);
    setIsServiceInfoMenuOpen(false);
    setIsMobileMenuOpen(false);
    navigate('/auth/login', { replace: true });
    logout();
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = {
          role: email === '64.iklas@gmail.com' ? 'superadmin' : 'client',
          name: name || 'Unnamed User',
          email: email,
          phone: phone || null,
          partnerId: null,
          clientId: null,
          eventQuota: 1,
          guestQuota: 10,
          activeUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', userCredential.user.uid), newUser);

        if (phone) {
          import('./lib/fonnte').then(({ sendFonnteMessage }) => {
            const loginUrl = `${window.location.origin}/auth/login`;
            const message = `🔐 *Informasi Akun Guestly*

Halo Kak *${name}*,

Terima kasih telah bergabung dengan Guestly. Berikut informasi akun yang dapat digunakan untuk mengakses layanan Guestly:

📧 *Email* : ${email}
🔑 *Password* : ${password}
🌐 *Login* : ${loginUrl}

Mohon simpan informasi akun ini dengan baik dan jangan membagikannya kepada pihak lain untuk menjaga keamanan akun.

Jika mengalami kendala atau memerlukan bantuan, silakan hubungi tim support kami:

📞 0851-5863-6606

─────────────────
*Guestly*
Smart Digital Guestbook & Event Management

🌐 guestly.yulovi.com
📧 support@guestly.yulovi.com
💬 Layanan Bantuan: 0851-5863-6606

Terima kasih telah mempercayakan kebutuhan manajemen tamu Anda kepada Guestly.
─────────────────`;
            sendFonnteMessage(null, phone, message);
          });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/auth/login', { replace: true });
    } catch (error: any) {
      setLoginError(error.message || 'Otentikasi gagal. Periksa kembali data Anda.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center justify-center space-y-4">
          <img
            src={settings?.faviconUrl || settings?.logoUrl || '/favicon.ico'}
            alt="Guestly Logo"
            className="w-16 h-16 object-contain animate-pulse"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="text-gray-500 font-medium">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!currentUser || !appUser) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        {/* Left Column - Image */}
        <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900">
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?q=80&w=2070&auto=format&fit=crop"
              alt="Wedding Event"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/40 to-transparent"></div>
          </div>
          <div className="relative z-10 flex flex-col justify-between p-16 xl:p-24 h-full text-white w-full">
            <div>
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-10 w-auto object-contain brightness-0 invert" />
              ) : (
                <h1 className="text-3xl font-bold tracking-tight text-white">Guestly</h1>
              )}
            </div>
            <blockquote className="space-y-6">
              <p className="text-2xl font-medium leading-relaxed font-serif">
                "Manajemen tamu yang modern dan elegan. Membuat hari spesial Anda lebih terorganisir dan bebas dari kekhawatiran."
              </p>
              <footer className="text-sm text-gray-300">
                — Guestly Smart Management
              </footer>
            </blockquote>
          </div>
        </div>

        {/* Right Column - Form */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24 relative py-12 lg:py-0">
          <div className="w-full max-w-md mx-auto space-y-6 mt-4 lg:mt-0 bg-white p-8 sm:p-10 rounded-2xl shadow-xl border border-gray-100">
            <div className="flex justify-center mb-6">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-10 sm:h-12 w-auto object-contain" />
              ) : (
                <h1 className="text-3xl font-bold tracking-tight text-indigo-600">Guestly</h1>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                {isRegistering ? 'Buat Akun Baru' : 'Selamat Datang'}
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                {isRegistering
                  ? 'Daftar untuk mulai mengelola acara dan tamu Anda'
                  : 'Masuk ke akun Anda untuk mengelola acara dan tamu'}
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleEmailAuth}>
              {loginError && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-lg text-sm flex items-center">
                  {loginError}
                </div>
              )}
              <div className="space-y-5">
                {isRegistering && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1.5">Nama Lengkap</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                        placeholder="Nama Anda"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1.5">No. WhatsApp / HP</label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                        placeholder="08123456789"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
              >
                {isLoggingIn ? 'Memproses...' : isRegistering ? 'Daftar' : 'Masuk'}
              </button>
            </form>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-sm text-gray-600 hover:text-indigo-600 font-medium transition-colors"
              >
                {isRegistering ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Auto-redirect Role Layar Sapa langsung ke halaman Layar Sapa TV tanpa masuk ke Dashboard terlebih dahulu
  if (isGreetingScreenUser(appUser)) {
    const assignedEventId =
      Array.isArray(appUser.assignedEventIds) && appUser.assignedEventIds.length > 0
        ? appUser.assignedEventIds[0]
        : null;

    if (assignedEventId) {
      return <Navigate to={`/events/${assignedEventId}/greeting`} replace />;
    }

    return (
      <div className="min-h-screen bg-[#FAF5F0] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-amber-200/80 p-8 space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <Monitor className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              {getRoleLabel(appUser.role, appUser.staffType)}
            </span>
            <h2 className="text-xl font-bold text-gray-900">
              Akun Layar Sapa Belum Ditugaskan ke Acara
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Halo <strong>{appUser.name || appUser.email}</strong>, akun khusus Layar Sapa ini belum ditautkan ke acara mana pun. Silakan hubungi <strong>Owner / Admin Operasional</strong> untuk menugaskan 1 acara pada akun ini.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/auth/login', { replace: true });
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar / Ganti Akun</span>
          </button>
        </div>
      </div>
    );
  }

  const isStaff = appUser.role === 'staff';
  const navItems = [
    { name: isStaff ? 'Workspace Petugas' : 'Dashboard', path: '/auth/login', icon: LayoutDashboard },
    { name: 'Clients', path: '/auth/login/clients', icon: Users, role: ['superadmin', 'owner', 'partner'] },
    { name: isStaff ? 'Acara Ditugaskan' : 'Events', path: '/auth/login/events', icon: CalendarDays },
    { name: 'Approvals', path: '/auth/login/approvals', icon: FileText, role: ['superadmin', 'owner', 'admin', 'partner', 'client'] },
    { name: 'Media', path: '/auth/login/media', icon: ImageIcon, role: ['superadmin'] },
    { name: 'White Label', path: '/auth/login/settings', icon: Settings, role: ['superadmin', 'owner', 'partner'] },
  ];

  const unreadCount = notifications.filter(n => !readNotifIds.includes(n.id)).length;

  const quickNavigationLinks = [
    { label: 'Dashboard', path: '/auth/login', keywords: 'dashboard beranda statistik ringkasan' },
    ...(['superadmin', 'owner', 'partner'].includes(appUser.role)
      ? [
          { label: 'Clients (Daftar Klien)', path: '/auth/login/clients', keywords: 'client klien mempelai tambah client' },
          { label: 'Tambah Client Baru', path: '/auth/login/clients/add', keywords: 'add client tambah klien baru' },
        ]
      : []),
    { label: 'Events (Daftar Acara)', path: '/auth/login/events', keywords: 'events acara pernikahan tamu undangan' },
    { label: 'Approvals (Persetujuan Tamu)', path: '/auth/login/approvals', keywords: 'approvals persetujuan edit tamu' },
    { label: 'Profil Saya', path: '/auth/login/profile', keywords: 'profil saya akun password ubah' },
    ...(!isStaff ? [{ label: 'Changelog', path: '/auth/login/changelog', keywords: 'changelog update versi baru' }] : []),
  ].filter(item => {
    if (!globalSearch.trim()) return false;
    const q = globalSearch.toLowerCase();
    return item.label.toLowerCase().includes(q) || item.keywords.includes(q);
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* =================================================================== */}
      {/* STICKY TOPBAR (Sesuai referensi gambar dashboard.png)               */}
      {/* =================================================================== */}
      <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shrink-0">
        {/* Left: Brand Logo + Sidebar Toggle + Search Bar */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          {/* Brand Logo (Tampilan Mobile & Sidebar Diperkecil: Gunakan Favicon) */}
          <div
            className={cn(
              "flex items-center shrink-0 transition-all duration-300",
              isSidebarCollapsed ? "md:w-12 md:justify-center" : "md:w-56"
            )}
          >
            <Link
              to="/auth/login"
              className="flex items-center gap-2 font-bold text-xl tracking-tight text-indigo-600"
            >
              {/* Tampilan Mobile: Selalu Gunakan Favicon */}
              <span className="flex md:hidden items-center justify-center">
                {settings?.faviconUrl || settings?.logoUrl ? (
                  <img
                    src={settings?.faviconUrl || '/favicon.ico'}
                    alt="Guestly"
                    className="w-9 h-9 object-contain"
                    onError={(e) => {
                      if (settings?.logoUrl && e.currentTarget.src !== settings.logoUrl) {
                        e.currentTarget.src = settings.logoUrl;
                      }
                    }}
                  />
                ) : (
                  <span className="w-9 h-9 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
                    G
                  </span>
                )}
              </span>

              {/* Tampilan Desktop: Gunakan Favicon saat Sidebar Diperkecil, Logo Penuh saat Diperluas */}
              <span className="hidden md:flex items-center">
                {isSidebarCollapsed ? (
                  settings?.faviconUrl || settings?.logoUrl ? (
                    <img
                      src={settings?.faviconUrl || '/favicon.ico'}
                      alt="Favicon"
                      className="w-9 h-9 object-contain"
                      onError={(e) => {
                        if (settings?.logoUrl && e.currentTarget.src !== settings.logoUrl) {
                          e.currentTarget.src = settings.logoUrl;
                        }
                      }}
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
                      G
                    </span>
                  )
                ) : settings?.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt="Logo"
                    className="h-auto max-h-10 w-auto max-w-[150px] object-contain"
                  />
                ) : (
                  <span>Guestly</span>
                )}
              </span>
            </Link>
          </div>

          {/* Hamburger Menu Toggle (Desktop Collapse / Mobile Drawer) */}
          <button
            type="button"
            onClick={() => {
              if (window.innerWidth < 768) {
                setIsMobileMenuOpen(!isMobileMenuOpen);
              } else {
                setIsSidebarCollapsed(!isSidebarCollapsed);
              }
            }}
            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer shrink-0"
            title="Toggle Menu Navigasi"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search Bar */}
          <div ref={searchContainerRef} className="relative hidden sm:block flex-1 max-w-md">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={globalSearch}
                onFocus={() => {
                  setIsSearchOpen(true);
                  setIsNotifDropdownOpen(false);
                  setIsProfileDropdownOpen(false);
                }}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setIsSearchOpen(true);
                  setIsNotifDropdownOpen(false);
                  setIsProfileDropdownOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickNavigationLinks.length > 0) {
                    navigate(quickNavigationLinks[0].path);
                    setIsSearchOpen(false);
                    setGlobalSearch('');
                  }
                }}
                placeholder="Cari tamu, event, atau informasi..."
                className="w-full pl-10 pr-16 py-2 text-sm bg-gray-50/90 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 transition-all"
              />
              <div className="absolute right-2.5 flex items-center gap-1 pointer-events-none">
                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 rounded shadow-2xs">
                  Ctrl
                </kbd>
                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 rounded shadow-2xs">
                  K
                </kbd>
              </div>
            </div>

            {/* Quick Search Suggestions Popup (Smooth Transition) */}
            <div
              className={cn(
                "absolute left-0 right-0 mt-1.5 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50 origin-top transition-all duration-200 ease-out",
                isSearchOpen && globalSearch.trim() !== ''
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto visible"
                  : "opacity-0 scale-95 -translate-y-1.5 pointer-events-none invisible"
              )}
            >
              {quickNavigationLinks.length > 0 ? (
                quickNavigationLinks.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      navigate(item.path);
                      setIsSearchOpen(false);
                      setGlobalSearch('');
                    }}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs text-gray-400">Buka &rarr;</span>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    navigate('/auth/login/events');
                    setIsSearchOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-xs text-gray-600 hover:bg-gray-50 text-left flex items-center justify-between"
                >
                  <span>Cari "{globalSearch}" di halaman Events</span>
                  <span className="text-indigo-600 font-semibold">Lihat Events &rarr;</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Notification Bell & Person Profile Dropdown */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* 1. Notification Bell & Popup (Smooth & Mutually Exclusive) */}
          <div ref={notifDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsNotifDropdownOpen((prev) => !prev);
                setIsProfileDropdownOpen(false);
                setIsSearchOpen(false);
              }}
              className={cn(
                "relative p-2 rounded-full transition-all duration-200 cursor-pointer",
                isNotifDropdownOpen
                  ? "bg-indigo-50 text-indigo-600 ring-2 ring-indigo-500/15"
                  : "text-gray-600 hover:text-indigo-600 hover:bg-gray-100"
              )}
              title="Notifikasi"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-2xs">
                  {unreadCount}
                </span>
              )}
            </button>

            <div
              className={cn(
                "absolute right-0 mt-1.5 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50 origin-top-right transition-all duration-200 ease-out",
                isNotifDropdownOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto visible"
                  : "opacity-0 scale-95 -translate-y-1.5 pointer-events-none invisible"
              )}
            >
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">Notifikasi</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setReadNotifIds(notifications.map(n => n.id))}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    Tandai sudah dibaca
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {notifications.map((notif) => {
                  const isRead = readNotifIds.includes(notif.id);
                  return (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => {
                        if (!isRead) setReadNotifIds(prev => [...prev, notif.id]);
                        setIsNotifDropdownOpen(false);
                        navigate(notif.to);
                      }}
                      className={cn(
                        "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer",
                        !isRead ? "bg-indigo-50/30" : ""
                      )}
                    >
                      <div
                        className={cn(
                          "p-2 rounded-full shrink-0 mt-0.5",
                          notif.type === 'approval'
                            ? "bg-amber-100 text-amber-600"
                            : notif.type === 'event'
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-emerald-100 text-emerald-600"
                        )}
                      >
                        {notif.type === 'approval' ? (
                          <Clock className="w-4 h-4" />
                        ) : notif.type === 'event' ? (
                          <CalendarDays className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-900 truncate">{notif.title}</p>
                          {!isRead && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{notif.description}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{notif.timeLabel}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Person Icon + User Info + Dropdown (Smooth & Mutually Exclusive) */}
          <div ref={profileDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsProfileDropdownOpen((prev) => !prev);
                setIsNotifDropdownOpen(false);
                setIsSearchOpen(false);
              }}
              className={cn(
                "flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-all duration-200 cursor-pointer text-left",
                isProfileDropdownOpen
                  ? "bg-indigo-50/80 ring-2 ring-indigo-500/15"
                  : "hover:bg-gray-100"
              )}
              title="Menu Profil"
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-200",
                  isProfileDropdownOpen
                    ? "bg-indigo-100 border-indigo-200 text-indigo-700"
                    : "bg-slate-100 border-slate-200 text-slate-700"
                )}
              >
                <User className="w-5 h-5" />
              </div>
              <div className="hidden sm:block leading-tight max-w-[160px]">
                <div className="text-xs font-bold text-gray-900 truncate">
                  {appUser.name || appUser.email}
                </div>
                <div className="text-[11px] text-gray-500 truncate mt-0.5">
                  {getRoleLabel(appUser.role, appUser.staffType)}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200",
                  isProfileDropdownOpen ? "rotate-180 text-indigo-600" : ""
                )}
              />
            </button>

            <div
              className={cn(
                "absolute right-0 mt-1.5 w-60 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 origin-top-right transition-all duration-200 ease-out",
                isProfileDropdownOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto visible"
                  : "opacity-0 scale-95 -translate-y-1.5 pointer-events-none invisible"
              )}
            >
              {/* Account & Business Info Header */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-xs font-bold text-gray-900 truncate">
                  {appUser.name || appUser.email}
                </div>
                <div className="text-[11px] font-medium text-indigo-600 mt-0.5">
                  {getRoleLabel(appUser.role, appUser.staffType)}
                </div>
                {(appUser.role === 'superadmin' ? 'Guestly Official (Super Admin)' : (appUser.businessName || resolvedBusinessName)) && (
                  <div
                    className="mt-2 pt-2 border-t border-gray-100 text-[11px] font-medium text-gray-600 flex items-center gap-1.5 truncate"
                    title={appUser.role === 'superadmin' ? 'Guestly Official (Super Admin)' : (appUser.businessName || resolvedBusinessName)}
                  >
                    <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">
                      {appUser.role === 'superadmin' ? 'Guestly Official (Super Admin)' : (appUser.businessName || resolvedBusinessName)}
                    </span>
                  </div>
                )}
              </div>

              {/* Menu: Profil Saya & Changelog (Saling Bergantian Aktif) */}
              <div className="py-1">
                <Link
                  to="/auth/login/profile"
                  onClick={() => setIsProfileDropdownOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors",
                    location.pathname === '/auth/login/profile'
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
                  )}
                >
                  <User
                    className={cn(
                      "w-4 h-4",
                      location.pathname === '/auth/login/profile' ? "text-indigo-600" : "text-gray-400"
                    )}
                  />
                  <span>Profil Saya</span>
                </Link>
                {!isStaff && (
                  <Link
                    to="/auth/login/changelog"
                    onClick={() => setIsProfileDropdownOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors",
                      location.pathname === '/auth/login/changelog'
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
                    )}
                  >
                    <FileText
                      className={cn(
                        "w-4 h-4",
                        location.pathname === '/auth/login/changelog' ? "text-indigo-600" : "text-gray-400"
                      )}
                    />
                    <span>Changelog</span>
                  </Link>
                )}
              </div>

              <div className="border-t border-gray-100 my-0.5" />

              {/* Menu: Keluar (with confirmation prompt) */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* BODY AREA: SIDEBAR + MAIN CONTENT                                   */}
      {/* =================================================================== */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar (Tanpa Menu Profil Saya & Tanpa Tombol Keluar karena sudah di Dropdown Person) */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 md:z-20 transform bg-white flex flex-col border-r border-gray-200 transition-all duration-300 ease-in-out md:relative md:translate-x-0 md:flex-shrink-0",
            isSidebarCollapsed ? "md:w-20" : "md:w-64",
            isMobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Mobile Drawer Top Header */}
          <div className="flex md:hidden h-16 items-center justify-between px-6 border-b border-gray-200">
            <div className="flex items-center gap-2.5 font-bold text-xl tracking-tight text-indigo-600 truncate">
              {settings?.faviconUrl || settings?.logoUrl ? (
                <img
                  src={settings?.faviconUrl || '/favicon.ico'}
                  alt="Guestly"
                  className="w-9 h-9 object-contain shrink-0"
                  onError={(e) => {
                    if (settings?.logoUrl && e.currentTarget.src !== settings.logoUrl) {
                      e.currentTarget.src = settings.logoUrl;
                    }
                  }}
                />
              ) : (
                'Guestly'
              )}
            </div>
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1 p-4 overflow-y-auto">
            {navItems
              .filter(item => !item.role || item.role.includes(appUser.role))
              .map((item) => {
                const isItemActive =
                  item.path === '/auth/login'
                    ? location.pathname === '/auth/login'
                    : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    title={isSidebarCollapsed ? item.name : undefined}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isSidebarCollapsed ? "justify-center px-0" : "",
                      isItemActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <item.icon className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                    {!isSidebarCollapsed && <span>{item.name}</span>}
                  </Link>
                );
              })}

            {/* Informasi Layanan Dropdown (Smooth Accordion & Saling Bergantian Aktif) */}
            {!shouldHideServiceInfo(appUser) && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    if (isSidebarCollapsed) {
                      setIsSidebarCollapsed(false);
                      setIsServiceInfoMenuOpen(true);
                      setIsUserMenuOpen(false);
                      setIsAdminPanelMenuOpen(false);
                    } else {
                      const nextState = !isServiceInfoMenuOpen;
                      setIsServiceInfoMenuOpen(nextState);
                      if (nextState) {
                        setIsUserMenuOpen(false);
                        setIsAdminPanelMenuOpen(false);
                      }
                    }
                  }}
                  title={isSidebarCollapsed ? "Informasi Layanan" : undefined}
                  className={cn(
                    "w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    isSidebarCollapsed ? "justify-center px-0" : "",
                    isServiceInfoMenuOpen ||
                      location.pathname.startsWith('/auth/login/services') ||
                      location.pathname.startsWith('/auth/login/invoices')
                      ? "bg-indigo-50/70 text-indigo-700"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <ShoppingBag className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                    {!isSidebarCollapsed && <span>Informasi Layanan</span>}
                  </div>
                  {!isSidebarCollapsed && (
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform duration-300 ease-in-out",
                        isServiceInfoMenuOpen ? "rotate-90 text-indigo-600" : ""
                      )}
                    />
                  )}
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-300 ease-in-out",
                    !isSidebarCollapsed && isServiceInfoMenuOpen
                      ? "grid-rows-[1fr] opacity-100 mt-1"
                      : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="ml-8 flex flex-col gap-1 space-y-1">
                      <Link
                        to="/auth/login/services/dashboard"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          location.pathname === '/auth/login/services/dashboard'
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-4 w-4" />
                          Dashboard
                        </div>
                      </Link>
                      <Link
                        to="/auth/login/services/catalog"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          location.pathname === '/auth/login/services/catalog'
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Layanan
                        </div>
                      </Link>
                      <Link
                        to="/auth/login/invoices/my"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          location.pathname === '/auth/login/invoices/my'
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4" />
                          Invoice
                        </div>
                      </Link>

                      {!!(
                        appUser &&
                        ((appUser.eventQuota && appUser.eventQuota > 0) ||
                          (appUser.eventCredit && appUser.eventCredit > 0) ||
                          (appUser.clientQuota && appUser.clientQuota > 0) ||
                          (appUser.clientCredit && appUser.clientCredit > 0) ||
                          appUser.allowManualEvent ||
                          appUser.eventManual ||
                          (appUser.guestQuota && appUser.guestQuota > 0) ||
                          appUser.activeUntil)
                      ) && (
                        <Link
                          to="/auth/login/services/my"
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            location.pathname === '/auth/login/services/my'
                              ? "bg-indigo-50 text-indigo-700"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            Layanan Saya
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {['superadmin', 'owner', 'admin'].includes(appUser.role) && (
              <>
                <div className="mt-2">
                  <button
                    onClick={() => {
                      if (isSidebarCollapsed) {
                        setIsSidebarCollapsed(false);
                        setIsUserMenuOpen(true);
                        setIsServiceInfoMenuOpen(false);
                        setIsAdminPanelMenuOpen(false);
                      } else {
                        const nextState = !isUserMenuOpen;
                        setIsUserMenuOpen(nextState);
                        if (nextState) {
                          setIsServiceInfoMenuOpen(false);
                          setIsAdminPanelMenuOpen(false);
                        }
                      }
                    }}
                    title={isSidebarCollapsed ? "Manajemen User" : undefined}
                    className={cn(
                      "w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      isSidebarCollapsed ? "justify-center px-0" : "",
                      isUserMenuOpen ||
                        location.pathname.startsWith('/auth/login/users') ||
                        location.pathname.startsWith('/auth/login/businesses') ||
                        location.pathname === '/auth/login/roles'
                        ? "bg-indigo-50/70 text-indigo-700"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <UserCog className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                      {!isSidebarCollapsed && <span>Manajemen User</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform duration-300 ease-in-out",
                          isUserMenuOpen ? "rotate-90 text-indigo-600" : ""
                        )}
                      />
                    )}
                  </button>
                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-in-out",
                      !isSidebarCollapsed && isUserMenuOpen
                        ? "grid-rows-[1fr] opacity-100 mt-1"
                        : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-8 flex flex-col gap-1 space-y-1">
                        {appUser.role === 'superadmin' && (
                          <Link
                            to="/auth/login/businesses"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname.startsWith('/auth/login/businesses')
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            Manajemen Bisnis
                          </Link>
                        )}
                        <Link
                          to="/auth/login/users"
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            location.pathname.startsWith('/auth/login/users')
                              ? "bg-indigo-50 text-indigo-700"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          )}
                        >
                          User & Petugas
                        </Link>
                        {['superadmin', 'owner', 'admin'].includes(appUser.role) && (
                          <Link
                            to="/auth/login/roles"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/roles'
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            Role / Hak Akses
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {appUser.role === 'superadmin' && (
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        if (isSidebarCollapsed) {
                          setIsSidebarCollapsed(false);
                          setIsAdminPanelMenuOpen(true);
                          setIsServiceInfoMenuOpen(false);
                          setIsUserMenuOpen(false);
                        } else {
                          const nextState = !isAdminPanelMenuOpen;
                          setIsAdminPanelMenuOpen(nextState);
                          if (nextState) {
                            setIsServiceInfoMenuOpen(false);
                            setIsUserMenuOpen(false);
                          }
                        }
                      }}
                      title={isSidebarCollapsed ? "Admin Panel" : undefined}
                      className={cn(
                        "w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        isSidebarCollapsed ? "justify-center px-0" : "",
                        isAdminPanelMenuOpen || location.pathname.startsWith('/auth/login/admin')
                          ? "bg-indigo-50/70 text-indigo-700"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Shield className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                        {!isSidebarCollapsed && <span>Admin Panel</span>}
                      </div>
                      {!isSidebarCollapsed && (
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 transition-transform duration-300 ease-in-out",
                            isAdminPanelMenuOpen ? "rotate-90 text-indigo-600" : ""
                          )}
                        />
                      )}
                    </button>
                    <div
                      className={cn(
                        "grid transition-all duration-300 ease-in-out",
                        !isSidebarCollapsed && isAdminPanelMenuOpen
                          ? "grid-rows-[1fr] opacity-100 mt-1"
                          : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="ml-8 flex flex-col gap-1 space-y-1">
                          <Link
                            to="/auth/login/admin/services"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/admin/services'
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Briefcase className="h-4 w-4" />
                              Layanan
                            </div>
                          </Link>
                          <Link
                            to="/auth/login/admin/invoice"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/admin/invoice'
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4" />
                              Invoice
                            </div>
                          </Link>
                          <Link
                            to="/auth/login/admin/settings"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/admin/settings'
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4" />
                              Admin Setting
                            </div>
                          </Link>
                          <Link
                            to="/auth/login/admin/calendar"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/admin/calendar'
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-4 w-4" />
                              Kalender Acara
                            </div>
                          </Link>
                          <Link
                            to="/auth/login/admin/wa-templates"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/admin/wa-templates'
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Template WA
                            </div>
                          </Link>
                          <Link
                            to="/auth/login/admin/e-invitation-templates"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/admin/e-invitation-templates'
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4" />
                              Template E-Invitation
                            </div>
                          </Link>
                          <Link
                            to="/auth/login/admin/greeting-templates"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/admin/greeting-templates'
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Monitor className="h-4 w-4" />
                              Template Layar Sapa
                            </div>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
            <div className="w-full">
              {(shouldHideServiceInfo(appUser) &&
                (location.pathname.startsWith('/auth/login/services') ||
                  location.pathname.startsWith('/auth/login/invoices'))) ||
              (appUser.role !== 'superadmin' &&
                (location.pathname.startsWith('/auth/login/admin') ||
                  location.pathname.startsWith('/auth/login/businesses'))) ? (
                <Navigate to="/auth/login" replace />
              ) : (
                <>
                  <RouteBreadcrumbs />
                  <Outlet />
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
