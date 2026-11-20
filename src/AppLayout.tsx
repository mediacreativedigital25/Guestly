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
  Radio,
  ShieldAlert,
  Laptop,
  Smartphone,
  ArrowRight,
  HeartHandshake,
  ListChecks,
  Store,
  Wallet,
  CalendarClock,
  LayoutGrid,
  Tag,
  Sun,
  Moon,
  PanelLeft,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useCart } from './CartContext';
import { cn, getRoleLabel, shouldHideServiceInfo, isGreetingScreenUser, canUserAccessEvent, getUserBusinessId, isVendorManagedClient, isSelfRegisteredClient } from './lib/utils';
import { CURRENT_APP_VERSION, LATEST_RELEASE } from './pages/Changelog';
import { showConfirm } from './lib/alerts';
import RouteBreadcrumbs from './components/RouteBreadcrumbs';
import { Modal } from './components/Modal';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import { auth, db } from './lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import {
  getDeviceId,
  getDeviceName,
  getMaxDevicesForRole,
  normalizeUserDevices,
  getNonExpiredDevices,
  buildLegacyDeviceFields,
  setLoginHandshakeActive,
  getTimeRemainingMs,
  formatTimeRemaining,
  formatRelativeActivity,
} from './lib/deviceUtils';
import type { ActiveDeviceSession } from './types';

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
  const [isWeddingPlannerMenuOpen, setIsWeddingPlannerMenuOpen] = useState(false);
  const [hasClientWeddingPlanner, setHasClientWeddingPlanner] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [resolvedBusinessName, setResolvedBusinessName] = useState<string>('');

  // Topbar states
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const [isCartDropdownOpen, setIsCartDropdownOpen] = useState(false);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [dashboardTheme, setDashboardTheme] = useState<'soft' | 'hybrid' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('guestly_dashboard_theme_v2');
      if (saved === 'soft' || saved === 'hybrid' || saved === 'dark') {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'soft';
  });
  const [notifications, setNotifications] = useState<TopbarNotification[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const cartDropdownRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.dashboardTheme = dashboardTheme;
    return () => {
      delete document.documentElement.dataset.dashboardTheme;
    };
  }, [dashboardTheme]);

  // Cart context data for header cart icon
  const {
    mainPackage,
    addons,
    itemCount,
    totalPrice,
    clearCart,
    removeAddon,
    setMainPackage,
  } = useCart();

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setIsNotifDropdownOpen(false);
      }
      if (cartDropdownRef.current && !cartDropdownRef.current.contains(e.target as Node)) {
        setIsCartDropdownOpen(false);
      }
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setIsThemeDropdownOpen(false);
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
  // serta otomatis memperkecil (collapse) sidebar saat masuk ke halaman Scanner agar area scan leluasa
  useEffect(() => {
    const p = location.pathname;
    const isScanPage = p.includes('/scan');

    if (isScanPage) {
      setIsSidebarCollapsed(true);
    } else {
      setIsSidebarCollapsed(false);
    }

    if (p.startsWith('/auth/login/wedding-planner')) {
      setIsWeddingPlannerMenuOpen(true);
      setIsServiceInfoMenuOpen(false);
      setIsUserMenuOpen(false);
      setIsAdminPanelMenuOpen(false);
    } else if (p.startsWith('/auth/login/services') || p.startsWith('/auth/login/invoices')) {
      setIsServiceInfoMenuOpen(true);
      setIsWeddingPlannerMenuOpen(false);
      setIsUserMenuOpen(false);
      setIsAdminPanelMenuOpen(false);
    } else if (
      p.startsWith('/auth/login/users') ||
      p.startsWith('/auth/login/businesses') ||
      p.startsWith('/auth/login/roles') ||
      p.startsWith('/auth/login/sessions')
    ) {
      setIsUserMenuOpen(true);
      setIsWeddingPlannerMenuOpen(false);
      setIsServiceInfoMenuOpen(false);
      setIsAdminPanelMenuOpen(false);
    } else if (p.startsWith('/auth/login/admin')) {
      setIsAdminPanelMenuOpen(true);
      setIsWeddingPlannerMenuOpen(false);
      setIsServiceInfoMenuOpen(false);
      setIsUserMenuOpen(false);
    } else {
      setIsWeddingPlannerMenuOpen(false);
      setIsServiceInfoMenuOpen(false);
      setIsUserMenuOpen(false);
      setIsAdminPanelMenuOpen(false);
    }
  }, [location.pathname]);

  // Check if role 'client' (under Vendor/Owner) has active Wedding Planner package/project
  useEffect(() => {
    if (!appUser || appUser.role !== 'client') {
      setHasClientWeddingPlanner(false);
      return;
    }

    // Client Mandiri always sees the Wedding Planner menu (locked inside workspace until top-up/event)
    if (isSelfRegisteredClient(appUser)) {
      setHasClientWeddingPlanner(true);
      return;
    }

    let mounted = true;
    const checkClientPlanner = async () => {
      try {
        if (appUser.includeWeddingPlanner === true) {
          if (mounted) setHasClientWeddingPlanner(true);
          return;
        }
        const [evSnap, wpSnap] = await Promise.all([
          getDocs(collection(db, 'events')),
          getDocs(collection(db, 'wedding_planners')),
        ]);
        const targetClientId = appUser.clientId || appUser.id || '';
        const assignedIds = Array.isArray(appUser.assignedEventIds) ? appUser.assignedEventIds : [];

        const clientEventIds = new Set<string>();
        let hasEventPackagePlanner = false;
        evSnap.docs.forEach((d) => {
          const ev = d.data() as any;
          if (
            (targetClientId && ev.clientId === targetClientId) ||
            ev.clientUid === appUser.id ||
            assignedIds.includes(d.id)
          ) {
            clientEventIds.add(d.id);
            if (ev.includeWeddingPlanner === true) {
              hasEventPackagePlanner = true;
            }
          }
        });

        const hasEnrolled = hasEventPackagePlanner || wpSnap.docs.some((d) => {
          const data = d.data() as any;
          const evId = data.eventId || d.id;
          return data.plannerStatus !== 'archived' && clientEventIds.has(evId);
        });

        if (mounted) {
          setHasClientWeddingPlanner(hasEnrolled);
        }
      } catch {
        if (mounted) setHasClientWeddingPlanner(false);
      }
    };

    checkClientPlanner();
    const handleRefresh = () => checkClientPlanner();
    window.addEventListener('guestly-planner-updated', handleRefresh);
    return () => {
      mounted = false;
      window.removeEventListener('guestly-planner-updated', handleRefresh);
    };
  }, [appUser]);

  // Load notifications (pending approvals & upcoming events)
  useEffect(() => {
    if (!appUser) {
      setNotifications([]);
      setReadNotifIds([]);
      return;
    }
    try {
      const savedRead = localStorage.getItem(`guestly_read_notifs_${appUser.id || appUser.email}`);
      setReadNotifIds(savedRead ? JSON.parse(savedRead) : []);
    } catch {
      setReadNotifIds([]);
    }

    let isMounted = true;
    const loadNotifications = async () => {
      try {
        const items: TopbarNotification[] = [];

        const isVendorRole = ['owner', 'partner', 'admin'].includes(appUser.role);
        const [reqSnap, evSnap, usersSnap, clientsSnap] = await Promise.all([
          getDocs(collection(db, 'guest_edit_requests')),
          getDocs(collection(db, 'events')),
          isVendorRole ? getDocs(collection(db, 'users')) : Promise.resolve(null),
          isVendorRole ? getDocs(collection(db, 'clients')) : Promise.resolve(null),
        ]);

        const myBizIds = new Set<string>(
          [appUser.id, appUser.partnerId, getUserBusinessId(appUser)].filter(
            (id): id is string => Boolean(id && id !== 'default-partner')
          )
        );
        const myClientIds = new Set<string>();

        if (isVendorRole) {
          usersSnap?.docs.forEach(uDoc => {
            const u = uDoc.data() as any;
            if (
              (u.partnerId && u.partnerId !== 'default-partner' && myBizIds.has(u.partnerId)) ||
              (u.createdBy && myBizIds.has(u.createdBy)) ||
              myBizIds.has(uDoc.id)
            ) {
              myBizIds.add(uDoc.id);
              if (u.partnerId && u.partnerId !== 'default-partner') {
                myBizIds.add(u.partnerId);
              }
            }
          });

          clientsSnap?.docs.forEach(cDoc => {
            const c = cDoc.data() as any;
            if (c.partnerId && c.partnerId !== 'default-partner' && myBizIds.has(c.partnerId)) {
              myClientIds.add(cDoc.id);
            }
          });
        }

        const allowedPartnerIds = Array.from(myBizIds);
        const userPrimaryBizId = getUserBusinessId(appUser) || appUser.id || '';
        const targetClientId = appUser.clientId || appUser.id || '';
        const assignedEventIds = Array.isArray(appUser.assignedEventIds)
          ? appUser.assignedEventIds
          : Array.isArray((appUser as any).assignedEvents)
          ? (appUser as any).assignedEvents
          : [];

        const allEventsMap = new Map<string, any>();
        const accessibleEventIds = new Set<string>();

        evSnap.docs.forEach(docSnap => {
          const ev = docSnap.data() as any;
          allEventsMap.set(docSnap.id, ev);

          if (appUser.role === 'superadmin') {
            accessibleEventIds.add(docSnap.id);
            return;
          }
          if (appUser.role === 'client') {
            if (
              (targetClientId && ev.clientId === targetClientId) ||
              assignedEventIds.includes(docSnap.id)
            ) {
              accessibleEventIds.add(docSnap.id);
            }
            return;
          }
          if (appUser.role === 'staff' || appUser.role === 'greeting') {
            if (assignedEventIds.includes(docSnap.id)) {
              accessibleEventIds.add(docSnap.id);
            }
            return;
          }
          if (isVendorRole) {
            const rawPartnerId =
              ev.partnerId && ev.partnerId !== 'default-partner' ? ev.partnerId : null;
            const effectivePartnerId =
              ev.clientId && myClientIds.has(ev.clientId) ? userPrimaryBizId : rawPartnerId;
            if (canUserAccessEvent(appUser, docSnap.id, effectivePartnerId, allowedPartnerIds)) {
              accessibleEventIds.add(docSnap.id);
            }
          }
        });

        // 1. Check guest_edit_requests (pending & resolved approvals)
        const allReqs = reqSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

        if (appUser.role === 'client') {
          const clientReqs = allReqs.filter(
            r =>
              (targetClientId && r.clientId === targetClientId) ||
              (r.eventId && accessibleEventIds.has(r.eventId))
          );
          const approvedReqs = clientReqs.filter(r => r.status === 'approved');
          const rejectedReqs = clientReqs.filter(r => r.status === 'rejected');
          const pendingClientReqs = clientReqs.filter(r => r.status === 'pending');

          if (approvedReqs.length > 0) {
            const latest = approvedReqs[approvedReqs.length - 1];
            const guestName = latest?.requestedData?.name || 'Tamu';
            items.push({
              id: `client-approved-${approvedReqs.length}-${latest?.id || ''}`,
              title: `${approvedReqs.length} Pengajuan Data Tamu Disetujui ✅`,
              description: `Pengajuan "${guestName}"${approvedReqs.length > 1 ? ` dan ${approvedReqs.length - 1} lainnya` : ''} telah disetujui.`,
              timeLabel: 'Lihat Riwayat Approval',
              to: '/auth/login/approvals?tab=history',
              type: 'approval',
            });
          }

          if (rejectedReqs.length > 0) {
            const latest = rejectedReqs[rejectedReqs.length - 1];
            const guestName = latest?.requestedData?.name || 'Tamu';
            items.push({
              id: `client-rejected-${rejectedReqs.length}-${latest?.id || ''}`,
              title: `${rejectedReqs.length} Pengajuan Data Tamu Ditolak`,
              description: `Pengajuan "${guestName}" tidak disetujui. Cek tab Riwayat untuk detailnya.`,
              timeLabel: 'Lihat Riwayat Approval',
              to: '/auth/login/approvals?tab=history',
              type: 'approval',
            });
          }

          if (pendingClientReqs.length > 0) {
            items.push({
              id: `approvals-pending-${pendingClientReqs.length}`,
              title: `${pendingClientReqs.length} Pengajuan Menunggu Persetujuan`,
              description: 'Pengajuan perubahan data tamu Anda sedang menunggu persetujuan.',
              timeLabel: 'Menunggu tindakan',
              to: '/auth/login/approvals',
              type: 'approval',
            });
          }
        } else if (appUser.role === 'superadmin' || isVendorRole) {
          const pendingReqs = allReqs.filter(r => {
            if (r.status !== 'pending') return false;
            if (appUser.role === 'superadmin') return true;

            if (r.eventId && allEventsMap.has(r.eventId)) {
              return accessibleEventIds.has(r.eventId);
            }

            const rawReqPartnerId =
              r.partnerId && r.partnerId !== 'default-partner' ? r.partnerId : null;
            const effectivePartnerId =
              r.clientId && myClientIds.has(r.clientId) ? userPrimaryBizId : rawReqPartnerId;
            return canUserAccessEvent(appUser, r.eventId, effectivePartnerId, allowedPartnerIds);
          });

          if (pendingReqs.length > 0) {
            items.push({
              id: `approvals-${pendingReqs.length}`,
              title: `${pendingReqs.length} Pengajuan Approval Menunggu`,
              description: 'Terdapat pengajuan data tamu dari Client yang memerlukan persetujuan Anda.',
              timeLabel: 'Menunggu tindakan',
              to: '/auth/login/approvals',
              type: 'approval',
            });
          }
        }

        // 2. Check upcoming published events within 7 days (strictly scoped to current user/vendor)
        const now = new Date();
        evSnap.docs.forEach(docSnap => {
          if (!accessibleEventIds.has(docSnap.id)) return;
          const ev = docSnap.data() as any;
          if (ev.status !== 'published' || !ev.date) return;

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

    const handleCompatChange = (e: any) => {
      const col = e.detail?.collectionName;
      if (!col || col === 'guest_edit_requests' || col === 'events' || col === 'clients' || col === 'users') {
        loadNotifications();
      }
    };
    window.addEventListener('supabase-compat-change', handleCompatChange);

    return () => {
      isMounted = false;
      window.removeEventListener('supabase-compat-change', handleCompatChange);
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
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [lockedSessionInfo, setLockedSessionInfo] = useState<{
    email: string;
    name: string;
    deviceName: string;
    activeDevices: ActiveDeviceSession[];
    maxDevices: number;
    lastActiveAt: any;
    remainingStr: string;
    partnerId?: string | null;
  } | null>(null);

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
        setLoginHandshakeActive(true);
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          const currentDevId = getDeviceId();
          const currentDevName = getDeviceName();
          const now = Date.now();
          const initialDevices: ActiveDeviceSession[] = [
            {
              deviceId: currentDevId,
              deviceName: currentDevName,
              lastActiveAt: now,
              loggedInAt: now,
            },
          ];
          const newUser = {
            role: email === '64.iklas@gmail.com' ? 'superadmin' : 'client',
            name: name || 'Unnamed User',
            email: email,
            phone: phone || null,
            partnerId: null,
            clientId: null,
            eventQuota: 0,
            eventCredit: 0,
            guestQuota: 0,
            activeUntil: null,
            activeDevices: initialDevices,
            ...buildLegacyDeviceFields(initialDevices),
            lastActiveAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            sessionRevoked: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'users', userCredential.user.uid), newUser);
        } finally {
          setLoginHandshakeActive(false);
        }

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
        setLoginHandshakeActive(true);
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          const loggedUser = userCredential.user;

          // Atomic device limit check & 2-hour inactivity auto-reset
          // Client role: max 2 active devices (strict block on 3rd); other standard roles: 1 device
          const userDocRef = doc(db, 'users', loggedUser.uid);
          const currentDevId = getDeviceId();
          const currentDevName = getDeviceName();

          const lockCheck = await runTransaction(db, async (tx) => {
            const snap = await tx.get(userDocRef);
            if (!snap.exists()) {
              return { allowed: true as const };
            }

            const uData = snap.data();
            const isUnlimitedRole = uData.role === 'superadmin' || isGreetingScreenUser(uData);
            const maxDevices = isUnlimitedRole ? Infinity : getMaxDevicesForRole(uData.role);
            const activeOnes = getNonExpiredDevices(normalizeUserDevices(uData));
            const existingIdx = activeOnes.findIndex((d) => d.deviceId === currentDevId);

            // Strict block (Opsi A) when capacity is already full on other devices (skipped for unlimited roles)
            if (!isUnlimitedRole && existingIdx === -1 && activeOnes.length >= maxDevices) {
              return {
                allowed: false as const,
                uData,
                activeOnes,
                maxDevices,
              };
            }

            const now = Date.now();
            let updatedDevices: ActiveDeviceSession[] =
              existingIdx >= 0
                ? activeOnes.map((d, i) =>
                    i === existingIdx
                      ? { ...d, deviceName: currentDevName, lastActiveAt: now }
                      : d
                  )
                : [
                    ...activeOnes,
                    {
                      deviceId: currentDevId,
                      deviceName: currentDevName,
                      lastActiveAt: now,
                      loggedInAt: now,
                    },
                  ];

            // Keep unlimited-role device history tidy (latest 5 active devices)
            if (isUnlimitedRole && updatedDevices.length > 5) {
              updatedDevices = [...updatedDevices]
                .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
                .slice(0, 5);
            }

            tx.update(userDocRef, {
              activeDevices: updatedDevices,
              ...buildLegacyDeviceFields(updatedDevices),
              lastActiveAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
              sessionRevoked: false,
              updatedAt: serverTimestamp(),
            });

            return { allowed: true as const };
          });

          if (!lockCheck.allowed) {
            await auth.signOut();

            const { uData, activeOnes, maxDevices } = lockCheck;
            // Earliest expiring device determines when the next slot will open automatically
            const earliestLastActive = activeOnes.reduce(
              (min, d) => (d.lastActiveAt < min ? d.lastActiveAt : min),
              activeOnes[0]?.lastActiveAt || Date.now()
            );
            const latestLastActive = activeOnes.reduce(
              (max, d) => (d.lastActiveAt > max ? d.lastActiveAt : max),
              activeOnes[0]?.lastActiveAt || Date.now()
            );
            const remainingMs = getTimeRemainingMs(earliestLastActive);
            const remainingStr = formatTimeRemaining(remainingMs);

            setLockedSessionInfo({
              email: uData.email || email,
              name: uData.name || 'Pengguna',
              deviceName:
                activeOnes.map((d) => d.deviceName).join(', ') ||
                uData.activeDeviceName ||
                'Perangkat Lain',
              activeDevices: activeOnes,
              maxDevices,
              lastActiveAt: latestLastActive,
              remainingStr,
              partnerId: uData.partnerId,
            });
            setIsLoggingIn(false);
            return;
          }
        } finally {
          setLoginHandshakeActive(false);
        }
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
      <div className="flex min-h-[100dvh] bg-gray-50">
        {/* Left Column - Editorial Visual (Desktop) */}
        <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-gray-900 to-rose-950/60">
            <img
              src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?q=80&w=2070&auto=format&fit=crop"
              alt="Wedding Event"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-900/45 to-gray-900/20" />
          </div>
          <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 h-full text-white w-full">
            <div>
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-9 xl:h-10 w-auto object-contain brightness-0 invert" />
              ) : (
                <h1 className="text-2xl xl:text-3xl font-bold tracking-tight text-white">Guestly</h1>
              )}
            </div>
            <blockquote className="space-y-4 max-w-lg">
              <p className="text-xl xl:text-2xl font-medium leading-relaxed font-serif text-balance">
                "Manajemen tamu yang modern dan elegan. Membuat hari spesial Anda lebih terorganisir dan bebas dari kekhawatiran."
              </p>
              <footer className="text-xs xl:text-sm text-gray-300">
                — Guestly Smart Management
              </footer>
            </blockquote>
          </div>
        </div>

        {/* Right Column - Compact Login Card (Responsive Mobile / Tablet / Desktop) */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-4 sm:px-8 lg:px-12 xl:px-16 py-6 sm:py-10">
          <div className="w-full max-w-[400px] sm:max-w-[420px]">
            {/* Brand Logo shown outside card on Mobile & Tablet only (desktop already shows logo on left panel) */}
            <div className="flex justify-center mb-4 sm:mb-5 lg:hidden">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-9 sm:h-10 w-auto object-contain" />
              ) : (
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-indigo-600">Guestly</h1>
              )}
            </div>

            <div className="bg-white px-5 py-6 sm:px-7 sm:py-7 rounded-2xl shadow-lg shadow-slate-900/[0.06] border border-gray-200/80">
              <div className="text-center">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                  {isRegistering ? 'Buat Akun Baru' : 'Selamat Datang'}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-gray-500">
                  {isRegistering
                    ? 'Daftar untuk mulai mengelola acara dan tamu Anda'
                    : 'Masuk ke akun Anda untuk mengelola acara dan tamu'}
                </p>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleEmailAuth}>
                {loginError && (
                  <div className="bg-red-50 border border-red-200/80 text-red-700 px-3 py-2.5 rounded-lg text-xs sm:text-sm leading-snug">
                    {loginError}
                  </div>
                )}

                <div className="space-y-3.5">
                  {isRegistering && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1">Nama Lengkap</label>
                        <input
                          type="text"
                          required
                          autoComplete="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full h-10 text-sm border border-gray-300 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                          placeholder="Nama Anda"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1">No. WhatsApp / HP</label>
                        <input
                          type="tel"
                          required
                          autoComplete="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full h-10 text-sm border border-gray-300 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                          placeholder="08123456789"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Email</label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-10 text-sm border border-gray-300 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-gray-700">Password</label>
                      {!isRegistering && (
                        <button
                          type="button"
                          onClick={() => setIsForgotPasswordOpen(true)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline transition-colors cursor-pointer"
                        >
                          Lupa kata sandi?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete={isRegistering ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-10 text-sm border border-gray-300 rounded-lg pl-3.5 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                        title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full h-10.5 flex items-center justify-center px-4 border border-transparent rounded-lg shadow-xs text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isLoggingIn ? 'Memproses...' : isRegistering ? 'Daftar' : 'Masuk'}
                </button>
              </form>

              <div className="mt-4 pt-3.5 border-t border-gray-100 text-center text-xs sm:text-sm text-gray-500">
                <span>{isRegistering ? 'Sudah punya akun?' : 'Belum punya akun?'} </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(!isRegistering);
                    setLoginError('');
                  }}
                  className="text-indigo-600 hover:text-indigo-700 font-semibold hover:underline transition-colors cursor-pointer"
                >
                  {isRegistering ? 'Masuk' : 'Daftar'}
                </button>
              </div>
            </div>

            {/* Versi Aktif Saat Ini (matching Changelog indicator) */}
            <div className="mt-4 flex justify-center">
              <div
                className="inline-flex items-center gap-2 text-xs text-slate-600 bg-rose-50/70 border border-rose-200/80 px-3 py-1.5 rounded-xl w-fit"
                title={LATEST_RELEASE.date ? `Rilis ${LATEST_RELEASE.date}` : undefined}
              >
                <Tag className="w-3.5 h-3.5 text-[#8C3A50] shrink-0" />
                <span>Versi Aktif Saat Ini:</span>
                <strong className="font-mono tabular-nums text-[#8C3A50]">{CURRENT_APP_VERSION}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Locked Device Session Modal */}
        <Modal
          isOpen={Boolean(lockedSessionInfo)}
          onClose={() => setLockedSessionInfo(null)}
          title={
            lockedSessionInfo && lockedSessionInfo.maxDevices > 1
              ? `Batas ${lockedSessionInfo.maxDevices} Perangkat Tercapai`
              : 'Akun Aktif di Perangkat Lain'
          }
          maxWidth="max-w-md"
        >
          {lockedSessionInfo && (
            <div className="space-y-4 text-slate-700">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    {lockedSessionInfo.maxDevices > 1
                      ? `Batasan Akun Client = Maksimal ${lockedSessionInfo.maxDevices} Perangkat Aktif`
                      : 'Batasan 1 Akun = 1 Perangkat Aktif'}
                  </h4>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    {lockedSessionInfo.maxDevices > 1 ? (
                      <>
                        Akun <strong>{lockedSessionInfo.email}</strong> saat ini sudah aktif di{' '}
                        <strong>
                          {lockedSessionInfo.activeDevices.length}/{lockedSessionInfo.maxDevices} perangkat
                        </strong>
                        . Silakan logout dari salah satu perangkat terlebih dahulu sebelum login di perangkat baru.
                      </>
                    ) : (
                      <>
                        Akun <strong>{lockedSessionInfo.email}</strong> saat ini sedang memegang sesi login aktif di perangkat lain.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
                <div className="space-y-2">
                  <span className="text-slate-500 font-medium block">
                    {lockedSessionInfo.activeDevices.length > 1
                      ? `Perangkat Aktif (${lockedSessionInfo.activeDevices.length}/${lockedSessionInfo.maxDevices}):`
                      : 'Perangkat Aktif:'}
                  </span>
                  {lockedSessionInfo.activeDevices.length > 0 ? (
                    <div className="space-y-1.5">
                      {lockedSessionInfo.activeDevices.map((dev, idx) => {
                        const isMob = /mobile|android|iphone|ipad/i.test(dev.deviceName);
                        return (
                          <div
                            key={dev.deviceId}
                            className="flex items-center justify-between gap-2 bg-white border border-slate-200/80 rounded-lg px-2.5 py-2"
                          >
                            <span className="font-semibold text-slate-800 flex items-center gap-1.5 min-w-0">
                              {isMob ? (
                                <Smartphone className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              ) : (
                                <Laptop className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              )}
                              <span className="truncate">
                                {lockedSessionInfo.activeDevices.length > 1 ? `${idx + 1}. ` : ''}
                                {dev.deviceName}
                              </span>
                            </span>
                            <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                              {formatRelativeActivity(dev.lastActiveAt)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="font-bold text-slate-800 flex items-center gap-1">
                      <Laptop className="w-3.5 h-3.5 text-indigo-600" />
                      {lockedSessionInfo.deviceName}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <span className="text-slate-500">
                    {lockedSessionInfo.activeDevices.length > 1
                      ? 'Slot Terdekat Terbuka Otomatis:'
                      : 'Auto-Reset Otomatis:'}
                  </span>
                  <span className="font-bold text-emerald-700">
                    {lockedSessionInfo.remainingStr}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Jika perangkat lama sudah tidak digunakan atau tertinggal, slot perangkat akan otomatis terlepas sendiri setelah tidak ada aktivitas selama 2 jam. Atau Anda dapat meminta <strong>Super Admin / Owner</strong> untuk memutuskan sesi sekarang juga.
              </p>

              <div className="pt-2 flex flex-col gap-2">
                <a
                  href={`https://wa.me/${settings?.adminPhone || '6285158636606'}?text=${encodeURIComponent(
                    `Halo Admin / Owner, tolong bantu reset sesi login perangkat akun saya:\nEmail: ${lockedSessionInfo.email}\nNama: ${lockedSessionInfo.name}\n\nSaya ingin login di perangkat baru. Terima kasih!`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
                    alt="WhatsApp"
                    className="w-4 h-4 brightness-0 invert"
                  />
                  <span>Minta Reset Sesi via WhatsApp</span>
                </a>

                <button
                  type="button"
                  onClick={() => setLockedSessionInfo(null)}
                  className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Tutup &amp; Coba Lagi Nanti
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Forgot Password Modal (WhatsApp OTP + WA Admin Manual Fallback) */}
        <ForgotPasswordModal
          isOpen={isForgotPasswordOpen}
          onClose={() => setIsForgotPasswordOpen(false)}
          initialEmail={email}
          adminPhone={settings?.adminPhone || '6285158636606'}
          onResetSuccess={(resolvedEmail) => {
            if (resolvedEmail) setEmail(resolvedEmail);
            setPassword('');
            setLoginError('');
          }}
        />
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
  const isSelfClient = isSelfRegisteredClient(appUser);
  const isManagedClient = isVendorManagedClient(appUser);
  const showApprovalsNav =
    ['superadmin', 'owner', 'admin', 'partner'].includes(appUser.role) || isManagedClient;

  const navItems: Array<{
    name: string;
    path: string;
    icon: any;
    role?: string[];
    badge?: string;
  }> = [
    { name: isStaff ? 'Workspace Petugas' : 'Dashboard', path: '/auth/login', icon: LayoutDashboard },
    { name: 'Clients', path: '/auth/login/clients', icon: Users, role: ['superadmin', 'owner', 'partner'] },
    { name: isStaff ? 'Acara Ditugaskan' : 'Events', path: '/auth/login/events', icon: CalendarDays },
    ...(showApprovalsNav
      ? [{ name: 'Approvals', path: '/auth/login/approvals', icon: FileText, role: ['superadmin', 'owner', 'admin', 'partner', 'client'] }]
      : []),
    { name: 'Media', path: '/auth/login/media', icon: ImageIcon, role: ['superadmin'] },
    { name: 'White Label', path: '/auth/login/settings', icon: Settings, role: ['superadmin', 'owner', 'partner'] },
  ];

  const showWeddingPlannerNav =
    ['superadmin', 'owner', 'admin', 'partner'].includes(appUser.role) ||
    isSelfClient ||
    (isManagedClient && hasClientWeddingPlanner);

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
    ...(showWeddingPlannerNav
      ? [
          { label: 'Wedding Planner — Overview', path: '/auth/login/wedding-planner', keywords: 'wedding planner overview ringkasan' },
          { label: 'Wedding Planner — Checklist & Tugas', path: '/auth/login/wedding-planner/checklist', keywords: 'wedding planner checklist tugas panitia' },
          { label: 'Wedding Planner — Vendor & Kontrak', path: '/auth/login/wedding-planner/vendors', keywords: 'wedding planner vendor kontrak catering dekorasi mua' },
          { label: 'Wedding Planner — Anggaran & Pembayaran', path: '/auth/login/wedding-planner/budget', keywords: 'wedding planner anggaran budget dp pelunasan' },
          { label: 'Wedding Planner — Rundown Hari-H', path: '/auth/login/wedding-planner/rundown', keywords: 'wedding planner rundown timeline jadwal akad resepsi' },
          { label: 'Wedding Planner — Denah Meja & Tamu', path: '/auth/login/wedding-planner/seating', keywords: 'wedding planner denah meja seating kursi tamu' },
        ]
      : []),
    ...(showApprovalsNav
      ? [{ label: 'Approvals (Persetujuan Tamu)', path: '/auth/login/approvals', keywords: 'approvals persetujuan edit tamu' }]
      : []),
    { label: 'Profil Saya', path: '/auth/login/profile', keywords: 'profil saya akun password ubah' },
    ...(!isStaff ? [{ label: 'Changelog', path: '/auth/login/changelog', keywords: 'changelog update versi baru' }] : []),
  ].filter(item => {
    if (!globalSearch.trim()) return false;
    const q = globalSearch.toLowerCase();
    return item.label.toLowerCase().includes(q) || item.keywords.includes(q);
  });

  const isDarkTheme = dashboardTheme === 'dark';
  const isDarkSidebar = dashboardTheme === 'hybrid' || dashboardTheme === 'dark';
  const navActiveClass = isDarkSidebar
    ? "bg-[#8C3A50] text-white font-semibold shadow-sm shadow-black/20"
    : "bg-rose-50 text-[#8C3A50] font-semibold";
  const navIdleClass = isDarkSidebar
    ? "text-[#D4CFD2] hover:bg-white/[0.07] hover:text-[#FAF9F6]"
    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900";
  const groupActiveClass = isDarkSidebar
    ? "bg-white/[0.09] text-[#FAF9F6]"
    : "bg-rose-50/70 text-[#8C3A50]";
  const subActiveClass = isDarkSidebar
    ? "bg-[#8C3A50]/35 text-[#FCE7EC] font-semibold"
    : "bg-rose-50 text-[#8C3A50] font-semibold";
  const subIdleClass = isDarkSidebar
    ? "text-[#ABA4A8] hover:bg-white/[0.06] hover:text-[#FAF9F6]"
    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900";
  const chevronOpenClass = isDarkSidebar ? "rotate-90 text-[#F0A8B9]" : "rotate-90 text-[#8C3A50]";
  const chevronClosedClass = isDarkSidebar ? "text-[#9A9297]" : "";
  const subTreeBorderClass = isDarkSidebar ? "border-white/10" : "border-rose-100";

  return (
    <div
      data-theme={dashboardTheme}
      className={cn(
        "dashboard-shell flex flex-col h-screen overflow-hidden transition-colors duration-200",
        isDarkTheme ? "bg-[#151416] text-[#ECE9E4]" : "bg-[#F5F3F4]"
      )}
    >
      {/* =================================================================== */}
      {/* STICKY TOPBAR (Sesuai referensi gambar dashboard.png)               */}
      {/* =================================================================== */}
      <header
        className={cn(
          "sticky top-0 z-30 h-16 border-b flex items-center justify-between px-4 sm:px-6 shrink-0 transition-colors duration-200",
          isDarkTheme
            ? "bg-[#1B191C] border-[#2E2A31] shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
            : "bg-[#FBFAFB] border-[#E7E3E5] shadow-[0_1px_2px_rgba(32,28,30,0.03)]"
        )}
      >
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
              className="flex items-center gap-2 font-bold text-xl tracking-tight text-[#8C3A50]"
            >
              {/* Tampilan Mobile: Selalu Gunakan Favicon */}
              <span className="flex md:hidden items-center justify-center">
                {settings?.faviconUrl || settings?.logoUrl ? (
                  <span className={cn("w-9 h-9 flex items-center justify-center", isDarkTheme && "rounded-lg bg-[#FAF9F6] p-1")}>
                    <img
                      src={settings?.faviconUrl || '/favicon.ico'}
                      alt="Guestly"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        if (settings?.logoUrl && e.currentTarget.src !== settings.logoUrl) {
                          e.currentTarget.src = settings.logoUrl;
                        }
                      }}
                    />
                  </span>
                ) : (
                  <span className="w-9 h-9 rounded-md bg-rose-50 text-[#8C3A50] flex items-center justify-center font-bold text-lg">
                    G
                  </span>
                )}
              </span>

              {/* Tampilan Desktop: Gunakan Favicon saat Sidebar Diperkecil, Logo Penuh saat Diperluas */}
              <span className="hidden md:flex items-center">
                {isSidebarCollapsed ? (
                  settings?.faviconUrl || settings?.logoUrl ? (
                    <span className={cn("w-9 h-9 flex items-center justify-center", isDarkTheme && "rounded-lg bg-[#FAF9F6] p-1")}>
                      <img
                        src={settings?.faviconUrl || '/favicon.ico'}
                        alt="Favicon"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          if (settings?.logoUrl && e.currentTarget.src !== settings.logoUrl) {
                            e.currentTarget.src = settings.logoUrl;
                          }
                        }}
                      />
                    </span>
                  ) : (
                    <span className="w-9 h-9 rounded-md bg-rose-50 text-[#8C3A50] flex items-center justify-center font-bold text-lg">
                      G
                    </span>
                  )
                ) : settings?.logoUrl ? (
                  <span className={cn("flex items-center", isDarkTheme && "rounded-lg bg-[#FAF9F6]/95 px-2.5 py-1 shadow-xs")}>
                    <img
                      src={settings.logoUrl}
                      alt="Logo"
                      className={cn("h-auto w-auto max-w-[145px] object-contain", isDarkTheme ? "max-h-8" : "max-h-10")}
                    />
                  </span>
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
                className={cn(
                  "w-full pl-10 pr-16 py-2 text-sm border rounded-lg focus:outline-none focus:border-[#8C3A50] focus:ring-2 focus:ring-[#8C3A50]/20 transition-all",
                  isDarkTheme
                    ? "bg-[#262329] border-[#36323B] text-[#F2EFEA] placeholder-[#8D878E] focus:bg-[#2C2930]"
                    : "bg-[#F2EFF0] border-[#E7E3E5] text-gray-800 placeholder-gray-400 focus:bg-[#FEFEFE]"
                )}
              />
              <div className="absolute right-2.5 flex items-center gap-1 pointer-events-none">
                <kbd
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-semibold border rounded shadow-2xs",
                    isDarkTheme
                      ? "text-[#A59FA6] bg-[#1B191C] border-[#36323B]"
                      : "text-gray-500 bg-[#FEFEFE] border-[#E4DFE2]"
                  )}
                >
                  Ctrl
                </kbd>
                <kbd
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-semibold border rounded shadow-2xs",
                    isDarkTheme
                      ? "text-[#A59FA6] bg-[#1B191C] border-[#36323B]"
                      : "text-gray-500 bg-[#FEFEFE] border-[#E4DFE2]"
                  )}
                >
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
                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-rose-50 hover:text-[#8C3A50] transition-colors text-left cursor-pointer"
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
                  className="w-full px-4 py-2.5 text-xs text-gray-600 hover:bg-gray-50 text-left flex items-center justify-between cursor-pointer"
                >
                  <span>Cari "{globalSearch}" di halaman Events</span>
                  <span className="text-[#8C3A50] font-semibold">Lihat Events &rarr;</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Theme Switcher, Cart, Notification Bell & Person Profile Dropdown */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Theme Switcher (Opsi 1 Soft Warm / Opsi 2 Hybrid / Opsi 3 Soft Dark) */}
          <div ref={themeDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsThemeDropdownOpen((prev) => !prev);
                setIsCartDropdownOpen(false);
                setIsNotifDropdownOpen(false);
                setIsProfileDropdownOpen(false);
                setIsSearchOpen(false);
              }}
              className={cn(
                "relative p-2 rounded-full transition-all duration-200 cursor-pointer",
                isThemeDropdownOpen
                  ? "bg-rose-50 text-[#8C3A50] ring-2 ring-[#8C3A50]/20"
                  : "text-gray-600 hover:text-[#8C3A50] hover:bg-rose-50/60"
              )}
              title="Ganti Tema Tampilan Dashboard"
              aria-label="Ganti Tema Tampilan Dashboard"
            >
              {dashboardTheme === 'soft' && <Sun className="w-5 h-5" />}
              {dashboardTheme === 'hybrid' && <PanelLeft className="w-5 h-5" />}
              {dashboardTheme === 'dark' && <Moon className="w-5 h-5" />}
            </button>

            <div
              className={cn(
                "absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 z-50 origin-top-right transition-all duration-200 ease-out",
                isThemeDropdownOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto visible"
                  : "opacity-0 scale-95 -translate-y-1.5 pointer-events-none invisible"
              )}
            >
              <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Tema Dashboard
              </div>
              {[
                { id: 'soft' as const, label: 'Pearl White', desc: 'Putih mutiara selaras Guestly', icon: Sun },
                { id: 'hybrid' as const, label: 'Hybrid Contrast', desc: 'Sidebar gelap + konten putih', icon: PanelLeft },
                { id: 'dark' as const, label: 'Soft Dark Mode', desc: 'Gelap teduh nyaman di mata', icon: Moon },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = dashboardTheme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setDashboardTheme(opt.id);
                      try {
                        localStorage.setItem('guestly_dashboard_theme_v2', opt.id);
                      } catch {
                        // ignore storage errors
                      }
                      setIsThemeDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer",
                      active
                        ? "bg-rose-50 text-[#8C3A50]"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold leading-tight">{opt.label}</div>
                      <div className="text-[11px] text-gray-500 truncate">{opt.desc}</div>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 0. Cart Icon & Popover (Standard Guestly Palette) */}
          <div ref={cartDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsCartDropdownOpen((prev) => !prev);
                setIsThemeDropdownOpen(false);
                setIsNotifDropdownOpen(false);
                setIsProfileDropdownOpen(false);
                setIsSearchOpen(false);
              }}
              className={cn(
                "relative p-2 rounded-full transition-all duration-200 cursor-pointer",
                isCartDropdownOpen
                  ? "bg-rose-50 text-[#8C3A50] ring-2 ring-[#8C3A50]/20"
                  : "text-gray-600 hover:text-[#8C3A50] hover:bg-rose-50/60"
              )}
              title="Keranjang Belanja"
              aria-label="Keranjang Belanja"
            >
              <ShoppingBag className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#8C3A50] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Mobile Backdrop for Cart Popover */}
            {isCartDropdownOpen && (
              <div
                className="fixed inset-0 top-16 bg-slate-900/20 backdrop-blur-[1px] z-40 sm:hidden"
                onClick={() => setIsCartDropdownOpen(false)}
                aria-hidden="true"
              />
            )}

            {/* Cart Dropdown Preview (Responsive across Mobile, Tablet, Desktop) */}
            <div
              className={cn(
                "fixed inset-x-3 top-[70px] mx-auto w-auto max-w-md sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mx-0 sm:mt-2 sm:w-96 sm:max-w-none bg-white rounded-2xl shadow-xl border border-rose-100 z-50 origin-top sm:origin-top-right transition-all duration-200 ease-out flex flex-col max-h-[calc(100dvh-86px)] sm:max-h-[calc(100vh-96px)] overflow-hidden",
                isCartDropdownOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto visible"
                  : "opacity-0 scale-95 -translate-y-1.5 pointer-events-none invisible"
              )}
            >
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 shrink-0 bg-white">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-[#8C3A50] flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-gray-900 block leading-tight truncate">Keranjang Belanja</span>
                    <span className="text-[11px] text-gray-500 font-medium">{itemCount} item dipilih</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {itemCount > 0 && (
                    <button
                      type="button"
                      onClick={() => clearCart()}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      Kosongkan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCartDropdownOpen(false)}
                    className="sm:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    aria-label="Tutup keranjang"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {itemCount === 0 ? (
                <div className="p-5 sm:p-6 text-center space-y-2.5 overflow-y-auto">
                  <div className="w-12 h-12 rounded-full bg-rose-50 text-[#8C3A50] flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <p className="text-sm sm:text-xs font-bold text-gray-900">Keranjang Anda masih kosong</p>
                  <p className="text-xs sm:text-[11px] text-gray-500 max-w-xs mx-auto leading-relaxed">
                    Pilih paket buku tamu utama atau add-on kuota tambahan dari katalog layanan.
                  </p>
                  <div className="pt-2">
                    <Link
                      to="/auth/login/services"
                      onClick={() => setIsCartDropdownOpen(false)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <span>Buka Katalog Layanan</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col min-h-0 flex-1">
                  <div className="p-3 overflow-y-auto modal-scroll space-y-2 flex-1 min-h-0">
                    {mainPackage && (
                      <div className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-200/60 flex items-center justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-[#8C3A50] uppercase tracking-wider inline-block">
                            Paket Utama
                          </span>
                          <p className="text-xs font-bold text-gray-900 truncate mt-1">{mainPackage.name}</p>
                          <p className="text-xs font-mono font-bold text-[#8C3A50] mt-0.5">
                            Rp {(mainPackage.price || 0).toLocaleString('id-ID')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMainPackage(null)}
                          className="text-gray-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 shrink-0 cursor-pointer transition-colors"
                          title="Hapus paket"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {addons.map((addon) => (
                      <div
                        key={addon.service.id}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-[#8C3A50] border border-rose-200/70 uppercase tracking-wider inline-block">
                            Add-on ({addon.quantity}x)
                          </span>
                          <p className="text-xs font-semibold text-gray-900 truncate mt-1">{addon.service.name}</p>
                          <p className="text-xs font-mono font-bold text-gray-800 mt-0.5">
                            Rp {((addon.service.price || 0) * addon.quantity).toLocaleString('id-ID')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAddon(addon.service.id!)}
                          className="text-gray-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 shrink-0 cursor-pointer transition-colors"
                          title="Hapus add-on"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 border-t border-gray-100 bg-white space-y-2.5 shrink-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-medium">Total Tagihan:</span>
                      <span className="font-mono font-black text-sm sm:text-base text-[#8C3A50]">
                        Rp {totalPrice.toLocaleString('id-ID')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        to="/auth/login/services"
                        onClick={() => setIsCartDropdownOpen(false)}
                        className="w-full py-2.5 sm:py-2 px-3 rounded-xl border border-gray-200 hover:bg-rose-50/50 hover:border-rose-200 hover:text-[#8C3A50] text-gray-700 text-xs font-semibold text-center transition-colors"
                      >
                        Katalog
                      </Link>
                      <Link
                        to="/auth/login/services/checkout"
                        onClick={() => setIsCartDropdownOpen(false)}
                        className="w-full py-2.5 sm:py-2 px-3 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-bold text-center shadow-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>Checkout</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 1. Notification Bell & Popup (Standard Guestly Palette) */}
          <div ref={notifDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsNotifDropdownOpen((prev) => !prev);
                setIsProfileDropdownOpen(false);
                setIsCartDropdownOpen(false);
                setIsSearchOpen(false);
              }}
              className={cn(
                "relative p-2 rounded-full transition-all duration-200 cursor-pointer",
                isNotifDropdownOpen
                  ? "bg-rose-50 text-[#8C3A50] ring-2 ring-[#8C3A50]/20"
                  : "text-gray-600 hover:text-[#8C3A50] hover:bg-rose-50/60"
              )}
              title="Notifikasi"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#8C3A50] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotifDropdownOpen && (
              <div
                className="fixed inset-0 top-16 bg-slate-900/20 backdrop-blur-[1px] z-40 sm:hidden"
                onClick={() => setIsNotifDropdownOpen(false)}
                aria-hidden="true"
              />
            )}

            <div
              className={cn(
                "fixed inset-x-3 top-[70px] mx-auto w-auto max-w-md sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mx-0 sm:mt-2 sm:w-96 sm:max-w-none bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 z-50 origin-top sm:origin-top-right transition-all duration-200 ease-out flex flex-col max-h-[calc(100dvh-86px)] sm:max-h-[calc(100vh-96px)] overflow-hidden",
                isNotifDropdownOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto visible"
                  : "opacity-0 scale-95 -translate-y-1.5 pointer-events-none invisible"
              )}
            >
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <span className="text-sm font-bold text-gray-900">Notifikasi</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setReadNotifIds(notifications.map(n => n.id))}
                    className="text-xs font-semibold text-[#8C3A50] hover:text-[#722B3E] cursor-pointer"
                  >
                    Tandai sudah dibaca
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto modal-scroll divide-y divide-gray-100">
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
                        !isRead ? "bg-rose-50/30" : ""
                      )}
                    >
                      <div
                        className={cn(
                          "p-2 rounded-full shrink-0 mt-0.5",
                          notif.type === 'approval'
                            ? "bg-amber-100 text-amber-600"
                            : notif.type === 'event'
                            ? "bg-rose-100 text-[#8C3A50]"
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
                          {!isRead && <span className="w-2 h-2 rounded-full bg-[#8C3A50] shrink-0" />}
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

          {/* 2. Person Icon + User Info + Dropdown (Standard Guestly Palette) */}
          <div ref={profileDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsProfileDropdownOpen((prev) => !prev);
                setIsNotifDropdownOpen(false);
                setIsCartDropdownOpen(false);
                setIsSearchOpen(false);
              }}
              className={cn(
                "flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-all duration-200 cursor-pointer text-left",
                isProfileDropdownOpen
                  ? "bg-rose-50/80 ring-2 ring-[#8C3A50]/20"
                  : "hover:bg-gray-100"
              )}
              title="Menu Profil"
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-200",
                  isProfileDropdownOpen
                    ? "bg-rose-100 border-rose-200 text-[#8C3A50]"
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
                  isProfileDropdownOpen ? "rotate-180 text-[#8C3A50]" : ""
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
                <div className="text-[11px] font-semibold text-[#8C3A50] mt-0.5">
                  {getRoleLabel(appUser.role, appUser.staffType)}
                </div>
                {(appUser.role === 'superadmin' ? 'Guestly Official (Super Admin)' : (appUser.businessName || resolvedBusinessName)) && (
                  <div
                    className="mt-2 pt-2 border-t border-gray-100 text-[11px] font-medium text-gray-600 flex items-center gap-1.5 truncate"
                    title={appUser.role === 'superadmin' ? 'Guestly Official (Super Admin)' : (appUser.businessName || resolvedBusinessName)}
                  >
                    <Building2 className="w-3.5 h-3.5 text-[#8C3A50] shrink-0" />
                    <span className="truncate">
                      {appUser.role === 'superadmin' ? 'Guestly Official (Super Admin)' : (appUser.businessName || resolvedBusinessName)}
                    </span>
                  </div>
                )}
              </div>

              {/* Menu: Profil Saya & Changelog (Standard Guestly Palette) */}
              <div className="py-1">
                <Link
                  to="/auth/login/profile"
                  onClick={() => setIsProfileDropdownOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors",
                    location.pathname === '/auth/login/profile'
                      ? "bg-rose-50 text-[#8C3A50] font-semibold"
                      : "text-gray-700 hover:bg-rose-50/50 hover:text-[#8C3A50]"
                  )}
                >
                  <User
                    className={cn(
                      "w-4 h-4",
                      location.pathname === '/auth/login/profile' ? "text-[#8C3A50]" : "text-gray-400"
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
                        ? "bg-rose-50 text-[#8C3A50] font-semibold"
                        : "text-gray-700 hover:bg-rose-50/50 hover:text-[#8C3A50]"
                    )}
                  >
                    <FileText
                      className={cn(
                        "w-4 h-4",
                        location.pathname === '/auth/login/changelog' ? "text-[#8C3A50]" : "text-gray-400"
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

        {/* Sidebar (Adaptif: Pearl White / Hybrid / Soft Dark Mode) */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 md:z-20 transform flex flex-col border-r transition-all duration-300 ease-in-out md:relative md:translate-x-0 md:flex-shrink-0",
            isDarkTheme
              ? "bg-[#1B191C] text-[#D4CFD2] border-[#2E2A31]"
              : isDarkSidebar
                ? "bg-[#1F1C1E] text-[#D4CFD2] border-[#302B2E]"
                : "bg-[#FBFAFB] text-gray-700 border-[#E7E3E5]",
            isSidebarCollapsed ? "md:w-20" : "md:w-64",
            isMobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Mobile Drawer Top Header */}
          <div
            className={cn(
              "flex md:hidden h-16 items-center justify-between px-5 border-b",
              isDarkSidebar ? "border-white/10" : "border-[#E7E3E5]"
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2.5 font-bold text-xl tracking-tight truncate",
                isDarkSidebar ? "text-[#FAF9F6]" : "text-[#8C3A50]"
              )}
            >
              {settings?.faviconUrl || settings?.logoUrl ? (
                <span className={cn("w-9 h-9 flex items-center justify-center shrink-0", isDarkSidebar && "rounded-lg bg-[#FAF9F6] p-1")}>
                  <img
                    src={settings?.faviconUrl || '/favicon.ico'}
                    alt="Guestly"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      if (settings?.logoUrl && e.currentTarget.src !== settings.logoUrl) {
                        e.currentTarget.src = settings.logoUrl;
                      }
                    }}
                  />
                </span>
              ) : (
                'Guestly'
              )}
              <span
                className={cn(
                  "text-base font-semibold tracking-tight truncate",
                  isDarkSidebar ? "text-[#FAF9F6]" : "text-[#8C3A50]"
                )}
              >
                Guestly
              </span>
            </div>
            <button
              type="button"
              className={cn(
                "p-1.5 rounded-md transition-colors cursor-pointer",
                isDarkSidebar
                  ? "text-[#B8B1B5] hover:text-white hover:bg-white/10"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              )}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1 p-3.5 sm:p-4 overflow-y-auto hide-scrollbar">
            {navItems
              .filter(item => !item.role || item.role.includes(appUser.role))
              .map((item) => {
                const isItemActive =
                  item.path === '/auth/login'
                    ? location.pathname === '/auth/login'
                    : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                return (
                  <React.Fragment key={item.name}>
                    <Link
                      to={item.path}
                      title={isSidebarCollapsed ? item.name : undefined}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isSidebarCollapsed ? "justify-center px-0" : "",
                        isItemActive ? navActiveClass : navIdleClass
                      )}
                    >
                      <item.icon className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                      {!isSidebarCollapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className="truncate">{item.name}</span>
                          {item.badge && (
                            <span
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded-full border leading-none",
                                isDarkSidebar
                                  ? "bg-amber-500/20 text-amber-200 border-amber-400/30"
                                  : "bg-amber-50 text-amber-800 border-amber-200/80"
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </Link>

                    {/* Wedding Planner Dropdown (Tepat di bawah menu Events, dengan badge New) */}
                    {item.path === '/auth/login/events' && showWeddingPlannerNav && (
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            if (isSidebarCollapsed) {
                              setIsSidebarCollapsed(false);
                              setIsWeddingPlannerMenuOpen(true);
                              setIsServiceInfoMenuOpen(false);
                              setIsUserMenuOpen(false);
                              setIsAdminPanelMenuOpen(false);
                            } else {
                              const nextState = !isWeddingPlannerMenuOpen;
                              setIsWeddingPlannerMenuOpen(nextState);
                              if (nextState) {
                                setIsServiceInfoMenuOpen(false);
                                setIsUserMenuOpen(false);
                                setIsAdminPanelMenuOpen(false);
                              }
                            }
                          }}
                          title={isSidebarCollapsed ? "Wedding Planner (New)" : undefined}
                          className={cn(
                            "w-full flex items-center justify-between gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                            isSidebarCollapsed ? "justify-center px-0" : "",
                            isWeddingPlannerMenuOpen || location.pathname.startsWith('/auth/login/wedding-planner')
                              ? groupActiveClass
                              : navIdleClass
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <HeartHandshake className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                            {!isSidebarCollapsed && (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="whitespace-nowrap">Wedding Planner</span>
                                <span
                                  className={cn(
                                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full border leading-none shrink-0",
                                    isDarkSidebar
                                      ? "bg-[#8C3A50]/45 text-[#FAD4DF] border-[#C25972]/45"
                                      : "bg-rose-100 text-[#8C3A50] border-rose-200"
                                  )}
                                >
                                  New
                                </span>
                              </div>
                            )}
                          </div>
                          {!isSidebarCollapsed && (
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0 transition-transform duration-300 ease-in-out",
                                isWeddingPlannerMenuOpen ? chevronOpenClass : chevronClosedClass
                              )}
                            />
                          )}
                        </button>
                        <div
                          className={cn(
                            "grid transition-all duration-300 ease-in-out",
                            !isSidebarCollapsed && isWeddingPlannerMenuOpen
                              ? "grid-rows-[1fr] opacity-100 mt-1"
                              : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
                          )}
                        >
                          <div className="overflow-hidden">
                            <div className={cn("ml-6 flex flex-col gap-1 space-y-0.5 border-l pl-2.5", subTreeBorderClass)}>
                              <Link
                                to="/auth/login/wedding-planner"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                  "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                  location.pathname === '/auth/login/wedding-planner' ? subActiveClass : subIdleClass
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                                  <span>1. Overview</span>
                                </div>
                              </Link>
                              <Link
                                to="/auth/login/wedding-planner/checklist"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                  "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                  location.pathname === '/auth/login/wedding-planner/checklist' ? subActiveClass : subIdleClass
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <ListChecks className="h-4 w-4 shrink-0" />
                                  <span>2. Checklist</span>
                                </div>
                              </Link>
                              <Link
                                to="/auth/login/wedding-planner/vendors"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                  "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                  location.pathname === '/auth/login/wedding-planner/vendors' ? subActiveClass : subIdleClass
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <Store className="h-4 w-4 shrink-0" />
                                  <span>3. Vendor</span>
                                </div>
                              </Link>
                              <Link
                                to="/auth/login/wedding-planner/budget"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                  "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                  location.pathname === '/auth/login/wedding-planner/budget' ? subActiveClass : subIdleClass
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <Wallet className="h-4 w-4 shrink-0" />
                                  <span>4. Anggaran</span>
                                </div>
                              </Link>
                              <Link
                                to="/auth/login/wedding-planner/rundown"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                  "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                  location.pathname === '/auth/login/wedding-planner/rundown' ? subActiveClass : subIdleClass
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <CalendarClock className="h-4 w-4 shrink-0" />
                                  <span>5. Rundown</span>
                                </div>
                              </Link>
                              <Link
                                to="/auth/login/wedding-planner/seating"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                  "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                  location.pathname === '/auth/login/wedding-planner/seating' ? subActiveClass : subIdleClass
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <LayoutGrid className="h-4 w-4 shrink-0" />
                                  <span>6. Denah Meja</span>
                                </div>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

            {/* Informasi Layanan Dropdown */}
            {!shouldHideServiceInfo(appUser) && (
              <div className={cn("mt-2 pt-2 border-t", isDarkSidebar ? "border-white/[0.07]" : "border-[#E7E3E5]")}>
                <button
                  onClick={() => {
                    if (isSidebarCollapsed) {
                      setIsSidebarCollapsed(false);
                      setIsServiceInfoMenuOpen(true);
                      setIsWeddingPlannerMenuOpen(false);
                      setIsUserMenuOpen(false);
                      setIsAdminPanelMenuOpen(false);
                    } else {
                      const nextState = !isServiceInfoMenuOpen;
                      setIsServiceInfoMenuOpen(nextState);
                      if (nextState) {
                        setIsWeddingPlannerMenuOpen(false);
                        setIsUserMenuOpen(false);
                        setIsAdminPanelMenuOpen(false);
                      }
                    }
                  }}
                  title={isSidebarCollapsed ? "Informasi Layanan" : undefined}
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    isSidebarCollapsed ? "justify-center px-0" : "",
                    isServiceInfoMenuOpen ||
                      location.pathname.startsWith('/auth/login/services') ||
                      location.pathname.startsWith('/auth/login/invoices')
                      ? groupActiveClass
                      : navIdleClass
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
                        isServiceInfoMenuOpen ? chevronOpenClass : chevronClosedClass
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
                    <div className={cn("ml-6 flex flex-col gap-1 space-y-0.5 border-l pl-2.5", subTreeBorderClass)}>
                      <Link
                        to="/auth/login/services/dashboard"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          location.pathname === '/auth/login/services/dashboard' ? subActiveClass : subIdleClass
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
                          location.pathname === '/auth/login/services/catalog' ? subActiveClass : subIdleClass
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
                          location.pathname === '/auth/login/invoices/my' ? subActiveClass : subIdleClass
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
                            location.pathname === '/auth/login/services/my' ? subActiveClass : subIdleClass
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
                <div className="mt-1">
                  <button
                    onClick={() => {
                      if (isSidebarCollapsed) {
                        setIsSidebarCollapsed(false);
                        setIsUserMenuOpen(true);
                        setIsWeddingPlannerMenuOpen(false);
                        setIsServiceInfoMenuOpen(false);
                        setIsAdminPanelMenuOpen(false);
                      } else {
                        const nextState = !isUserMenuOpen;
                        setIsUserMenuOpen(nextState);
                        if (nextState) {
                          setIsWeddingPlannerMenuOpen(false);
                          setIsServiceInfoMenuOpen(false);
                          setIsAdminPanelMenuOpen(false);
                        }
                      }
                    }}
                    title={isSidebarCollapsed ? "Manajemen User" : undefined}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      isSidebarCollapsed ? "justify-center px-0" : "",
                      isUserMenuOpen ||
                        location.pathname.startsWith('/auth/login/users') ||
                        location.pathname.startsWith('/auth/login/businesses') ||
                        location.pathname.startsWith('/auth/login/sessions') ||
                        location.pathname === '/auth/login/roles'
                        ? groupActiveClass
                        : navIdleClass
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
                          isUserMenuOpen ? chevronOpenClass : chevronClosedClass
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
                      <div className={cn("ml-6 flex flex-col gap-1 space-y-0.5 border-l pl-2.5", subTreeBorderClass)}>
                        {appUser.role === 'superadmin' && (
                          <Link
                            to="/auth/login/businesses"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname.startsWith('/auth/login/businesses') ? subActiveClass : subIdleClass
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
                            location.pathname.startsWith('/auth/login/users') ? subActiveClass : subIdleClass
                          )}
                        >
                          User & Petugas
                        </Link>
                        {['superadmin', 'owner', 'partner', 'admin'].includes(appUser.role) && (
                          <Link
                            to="/auth/login/sessions"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname.startsWith('/auth/login/sessions') ? subActiveClass : subIdleClass
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
                                Sesi Aktif
                              </span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            </div>
                          </Link>
                        )}
                        {['superadmin', 'owner', 'admin'].includes(appUser.role) && (
                          <Link
                            to="/auth/login/roles"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/roles' ? subActiveClass : subIdleClass
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
                  <div className="mt-1">
                    <button
                      onClick={() => {
                        if (isSidebarCollapsed) {
                          setIsSidebarCollapsed(false);
                          setIsAdminPanelMenuOpen(true);
                          setIsWeddingPlannerMenuOpen(false);
                          setIsServiceInfoMenuOpen(false);
                          setIsUserMenuOpen(false);
                        } else {
                          const nextState = !isAdminPanelMenuOpen;
                          setIsAdminPanelMenuOpen(nextState);
                          if (nextState) {
                            setIsWeddingPlannerMenuOpen(false);
                            setIsServiceInfoMenuOpen(false);
                            setIsUserMenuOpen(false);
                          }
                        }
                      }}
                      title={isSidebarCollapsed ? "Admin Panel" : undefined}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        isSidebarCollapsed ? "justify-center px-0" : "",
                        isAdminPanelMenuOpen || location.pathname.startsWith('/auth/login/admin')
                          ? groupActiveClass
                          : navIdleClass
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
                            isAdminPanelMenuOpen ? chevronOpenClass : chevronClosedClass
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
                        <div className={cn("ml-6 flex flex-col gap-1 space-y-0.5 border-l pl-2.5", subTreeBorderClass)}>
                          <Link
                            to="/auth/login/admin/services"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              location.pathname === '/auth/login/admin/services' ? subActiveClass : subIdleClass
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
                              location.pathname === '/auth/login/admin/invoice' ? subActiveClass : subIdleClass
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
                              location.pathname === '/auth/login/admin/settings' ? subActiveClass : subIdleClass
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
                              location.pathname === '/auth/login/admin/calendar' ? subActiveClass : subIdleClass
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
                              location.pathname === '/auth/login/admin/wa-templates' ? subActiveClass : subIdleClass
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
                              location.pathname === '/auth/login/admin/e-invitation-templates' ? subActiveClass : subIdleClass
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
                              location.pathname === '/auth/login/admin/greeting-templates' ? subActiveClass : subIdleClass
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
          <main
            className={cn(
              "flex-1 overflow-y-auto",
              location.pathname.includes('/scan')
                ? "p-2 sm:p-4 md:p-5"
                : "p-4 sm:p-6 md:p-8"
            )}
          >
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
