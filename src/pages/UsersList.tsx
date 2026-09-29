import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, doc, deleteDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, createAuthUserSilently } from '../lib/firebase';
import { User, Role, StaffType, EventRecord } from '../types';
import {
  Shield,
  Trash2,
  Edit,
  Plus,
  CalendarDays,
  ScanLine,
  Gift,
  CheckSquare,
  Square,
  Building2,
  EyeOff,
  Search,
  Filter,
  UserCheck,
  Monitor,
  Radio
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { showAlert, showConfirm, showCancelAlert } from '../lib/alerts';
import { getRoleLabel, canUserAccessEvent, getUserBusinessId, shouldHideServiceInfo, isPartnerBusinessRegistered, isGreetingScreenUser } from '../lib/utils';

export default function UsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [businessFilter, setBusinessFilter] = useState<string>('all');

  // Add User state
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('staff');
  const [newUserStaffType, setNewUserStaffType] = useState<StaffType>('checkin');
  const [newUserAssignedEvents, setNewUserAssignedEvents] = useState<string[]>([]);
  const [newUserPartnerId, setNewUserPartnerId] = useState('');
  const [newUserBusinessName, setNewUserBusinessName] = useState('');
  const [newUserBusinessAddress, setNewUserBusinessAddress] = useState('');
  const [newUserBusinessCity, setNewUserBusinessCity] = useState('');
  const [newUserClientId, setNewUserClientId] = useState('');
  const [newUserLogoUrl, setNewUserLogoUrl] = useState('');
  const [newUserClientCredit, setNewUserClientCredit] = useState<number>(0);
  const [newUserEventCredit, setNewUserEventCredit] = useState<number>(0);
  const [newUserAllowManualEvent, setNewUserAllowManualEvent] = useState<boolean>(false);
  const [newUserHideServiceInfo, setNewUserHideServiceInfo] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Edit state
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserBusinessName, setEditUserBusinessName] = useState('');
  const [editUserBusinessAddress, setEditUserBusinessAddress] = useState('');
  const [editUserBusinessCity, setEditUserBusinessCity] = useState('');
  const [editUserPartnerId, setEditUserPartnerId] = useState('');
  const [editUserLogoUrl, setEditUserLogoUrl] = useState('');
  const [editUserRole, setEditUserRole] = useState<Role>('staff');
  const [editUserStaffType, setEditUserStaffType] = useState<StaffType>('checkin');
  const [editUserAssignedEvents, setEditUserAssignedEvents] = useState<string[]>([]);
  const [editUserClientCredit, setEditUserClientCredit] = useState<number>(0);
  const [editUserEventCredit, setEditUserEventCredit] = useState<number>(0);
  const [editUserAllowManualEvent, setEditUserAllowManualEvent] = useState<boolean>(false);
  const [editUserHideServiceInfo, setEditUserHideServiceInfo] = useState<boolean>(true);

  const { appUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { userId: routeUserId } = useParams<{ userId?: string }>();

  const canManageUsers = Boolean(appUser && ['superadmin', 'owner', 'admin', 'partner'].includes(appUser.role));

  // Determine the current user's Business ID & Business Name
  const currentUserBizId = useMemo(() => getUserBusinessId(appUser), [appUser]);
  const currentUserBizName = useMemo(() => {
    if (!appUser) return '';
    if (appUser.businessName) return appUser.businessName;
    if (appUser.role === 'owner' || appUser.role === 'partner') return appUser.name;
    return '';
  }, [appUser]);

  // List of all Businesses (Owners & Partners) for Super Admin dropdown
  const businessOwners = useMemo(() => {
    return users
      .filter(u => u.role === 'owner' || u.role === 'partner')
      .map(u => ({
        id: u.partnerId || u.id!,
        ownerUid: u.id!,
        businessName: u.businessName || u.name,
        ownerName: u.name,
        role: u.role
      }));
  }, [users]);

  // Helper to resolve business label for any user
  const getBusinessLabelForUser = (target: User): string | null => {
    if (target.role === 'superadmin') return 'Platform Global';
    if (target.businessName) return target.businessName;
    if (target.role === 'owner' || target.role === 'partner') {
      return target.businessName || `Bisnis ${target.name}`;
    }
    if (target.partnerId) {
      const foundBiz = businessOwners.find(b => b.id === target.partnerId || b.ownerUid === target.partnerId);
      if (foundBiz) return foundBiz.businessName;
    }
    return null;
  };

  // Strict RBAC check: Can current user edit/delete target user?
  const canModifyTargetUser = (target: User): boolean => {
    if (!appUser) return false;
    if (appUser.role === 'superadmin') return true;

    // Owner / Partner can only manage Admin, Staff, Layar Sapa, and Client within their business
    if (appUser.role === 'owner' || appUser.role === 'partner') {
      if (!['admin', 'staff', 'greeting', 'client'].includes(target.role)) return false;
      const targetBiz = target.partnerId;
      if (targetBiz && currentUserBizId && targetBiz !== currentUserBizId && targetBiz !== appUser.id) {
        return false;
      }
      return true;
    }

    // Admin can only manage Staff & Layar Sapa within their business
    if (appUser.role === 'admin') {
      if (target.role !== 'staff' && target.role !== 'greeting') return false;
      const targetBiz = target.partnerId;
      if (targetBiz && currentUserBizId && targetBiz !== currentUserBizId) {
        return false;
      }
      return true;
    }

    return false;
  };

  // Roles that current user is allowed to assign when creating/editing a user
  const allowedRoleOptions = useMemo(() => {
    if (!appUser) return [];
    if (appUser.role === 'superadmin') {
      return [
        { value: 'owner' as Role, label: 'Owner (Pemilik Bisnis / WO)' },
        { value: 'admin' as Role, label: 'Admin Operasional (Back-Office WO)' },
        { value: 'staff' as Role, label: 'Staff Lapangan (Scan Kehadiran / Souvenir)' },
        { value: 'greeting' as Role, label: 'Layar Sapa (Display TV / Monitor Sambutan)' },
        { value: 'client' as Role, label: 'Client (Pemilik Acara / Mempelai)' },
        { value: 'partner' as Role, label: 'Partner (Vendor White-label)' },
        { value: 'superadmin' as Role, label: 'Super Admin (Pengelola Platform)' },
      ];
    }
    if (appUser.role === 'owner' || appUser.role === 'partner') {
      return [
        { value: 'admin' as Role, label: 'Admin Operasional (Tim Back-Office)' },
        { value: 'staff' as Role, label: 'Staff Lapangan (Scan Kehadiran / Souvenir)' },
        { value: 'greeting' as Role, label: 'Layar Sapa (Display TV / Monitor Sambutan)' },
        { value: 'client' as Role, label: 'Client (Pemilik Acara / Mempelai)' },
      ];
    }
    if (appUser.role === 'admin') {
      return [
        { value: 'staff' as Role, label: 'Staff Lapangan (Scan Kehadiran / Souvenir)' },
        { value: 'greeting' as Role, label: 'Layar Sapa (Display TV / Monitor Sambutan)' },
      ];
    }
    return [];
  }, [appUser]);

  useEffect(() => {
    const fetchUsersAndEvents = async () => {
      if (!canManageUsers || !appUser) return;

      try {
        const { getDocs, limit } = await import('firebase/firestore');
        const q = query(collection(db, 'users'), limit(150));
        const [snapshot, eventsSnap] = await Promise.all([
          getDocs(q),
          getDocs(collection(db, 'events'))
        ]);

        let data = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as User) }));

        // Filter visible users based on role & business scope
        if (appUser.role === 'owner' || appUser.role === 'partner') {
          const myBizId = appUser.partnerId || appUser.id;
          data = data.filter(u => {
            if (u.id === appUser.id) return true;
            if (u.role === 'superadmin') return false;
            // Show users belonging to this Owner's business (or created by this Owner)
            if (u.partnerId && (u.partnerId === myBizId || u.partnerId === appUser.id)) return true;
            if (u.createdBy === appUser.id) return true;
            return false;
          });
        } else if (appUser.role === 'admin') {
          const myBizId = appUser.partnerId;
          data = data.filter(u => {
            if (u.id === appUser.id) return true;
            if (u.role === 'superadmin') return false;
            if (myBizId) {
              return u.partnerId === myBizId || u.id === myBizId || u.createdBy === appUser.id;
            }
            return u.role === 'staff' || u.role === 'greeting' || u.role === 'admin';
          });
        }

        setUsers(data);

        const evList = eventsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as EventRecord))
          .filter(ev => canUserAccessEvent(appUser, ev.id, ev.partnerId));
        setEvents(evList);

        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === 150);
        setLoading(false);
      } catch (err) {
        console.error('Error setup listeners users:', err);
        setLoading(false);
      }
    };
    fetchUsersAndEvents();
  }, [appUser, canManageUsers]);

  const handleLoadMore = async () => {
    if (!lastVisible || !canManageUsers) return;
    setLoadingMore(true);
    try {
      const { collection, query, getDocs, limit, startAfter } = await import('firebase/firestore');
      const q = query(collection(db, 'users'), startAfter(lastVisible), limit(50));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as User) }));
      setUsers(prev => [...prev, ...data]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (err) {
      console.error('Error loading more users', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async (targetUser: User) => {
    if (!canModifyTargetUser(targetUser)) {
      showAlert('Akses Ditolak', 'Anda tidak memiliki wewenang untuk menghapus akun dengan role ini.', 'error');
      return;
    }
    const confirmed = await showConfirm(`Yakin ingin menghapus akun "${targetUser.name}" (${getRoleLabel(targetUser.role, targetUser.staffType)})?`);
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'users', targetUser.id!));
        setUsers(users.filter(u => u.id !== targetUser.id));
        showAlert('Berhasil', 'Pengguna berhasil dihapus!', 'success');
      } catch (err) {
        console.error('Error deleting user:', err);
        showAlert('Gagal', 'Gagal menghapus pengguna.', 'error');
      }
    }
  };

  const toggleEventSelection = (
    eventId: string,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    singleSelect = false
  ) => {
    if (singleSelect) {
      if (list.includes(eventId) && list.length === 1) {
        setList([]);
      } else {
        setList([eventId]);
      }
      return;
    }
    if (list.includes(eventId)) {
      setList(list.filter(id => id !== eventId));
    } else {
      setList([...list, eventId]);
    }
  };

  const handleOpenAddModal = () => {
    setError('');
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserPhone('');
    const defaultRole: Role = 'staff';
    setNewUserRole(defaultRole);
    setNewUserStaffType('checkin');
    setNewUserAssignedEvents([]);
    setNewUserClientId('');
    setNewUserLogoUrl('');
    setNewUserBusinessAddress('');
    setNewUserBusinessCity('');
    setNewUserClientCredit(0);
    setNewUserEventCredit(0);
    setNewUserAllowManualEvent(false);
    setNewUserHideServiceInfo(true);

    if (appUser?.role === 'owner' || appUser?.role === 'partner') {
      setNewUserPartnerId(appUser.partnerId || appUser.id || '');
      setNewUserBusinessName(appUser.businessName || appUser.name || '');
    } else if (appUser?.role === 'admin') {
      setNewUserPartnerId(appUser.partnerId || '');
      setNewUserBusinessName(appUser.businessName || '');
    } else {
      setNewUserPartnerId(businessOwners[0]?.id || '');
      setNewUserBusinessName(businessOwners[0]?.businessName || '');
    }

    setIsAddingUser(true);
    if (!location.pathname.endsWith('/users/add')) {
      navigate('/auth/login/users/add');
    }
  };

  const closeAddUserModal = (showCancel = false) => {
    setIsAddingUser(false);
    if (location.pathname !== '/auth/login/users') {
      navigate('/auth/login/users');
    }
    if (showCancel) {
      showCancelAlert('Penambahan user / petugas baru telah dibatalkan.');
    }
  };

  const closeEditUserModal = (showCancel = false) => {
    setIsEditingUser(false);
    if (location.pathname !== '/auth/login/users') {
      navigate('/auth/login/users');
    }
    if (showCancel) {
      showCancelAlert('Perubahan data user / petugas telah dibatalkan.');
    }
  };

  const handleOpenEdit = (user: User, skipNavigate = false) => {
    if (!canModifyTargetUser(user)) {
      showAlert('Akses Ditolak', 'Anda tidak memiliki wewenang untuk mengubah pengguna ini.', 'warning');
      return;
    }
    setError('');
    setEditingUserId(user.id!);
    setEditUserName(user.name || '');
    setEditUserPhone(user.phone || '');
    setEditUserBusinessName(user.businessName || '');
    setEditUserBusinessAddress(user.businessAddress || '');
    setEditUserBusinessCity(user.businessCity || '');
    setEditUserPartnerId(user.partnerId || (user.role === 'owner' || user.role === 'partner' ? user.id || '' : ''));
    setEditUserLogoUrl(user.logoUrl || '');
    const resolvedEditRole: Role =
      user.role === 'staff' && user.staffType === 'greeting' ? 'greeting' : user.role;
    setEditUserRole(resolvedEditRole);
    setEditUserStaffType(
      resolvedEditRole === 'greeting' ? 'greeting' : (user.staffType || 'checkin')
    );
    const existingAssigned = Array.isArray(user.assignedEventIds) ? user.assignedEventIds : [];
    setEditUserAssignedEvents(
      resolvedEditRole === 'greeting' || resolvedEditRole === 'staff'
        ? existingAssigned.slice(0, 1)
        : existingAssigned
    );
    setEditUserClientCredit(user.clientCredit !== undefined ? user.clientCredit : (user.clientQuota || 0));
    setEditUserEventCredit(user.eventCredit !== undefined ? user.eventCredit : (user.eventQuota || 0));
    setEditUserAllowManualEvent(Boolean(user.allowManualEvent ?? user.eventManual));
    setEditUserHideServiceInfo(shouldHideServiceInfo(user));
    setEditUserPassword('');
    setIsEditingUser(true);
    if (!skipNavigate && user.id) {
      navigate(`/auth/login/users/${user.id}/edit`);
    }
  };

  // Sync URL sub-routes (/users/add, /users/:userId/edit) with modal state
  useEffect(() => {
    if (loading) return;
    const path = location.pathname;
    if (path.endsWith('/users/add')) {
      if (!isAddingUser) {
        handleOpenAddModal();
      }
    } else if (routeUserId && path.endsWith('/edit')) {
      const found = users.find(u => u.id === routeUserId);
      if (found && (!isEditingUser || editingUserId !== found.id)) {
        handleOpenEdit(found, true);
      }
    } else if (path === '/auth/login/users') {
      if (isAddingUser) setIsAddingUser(false);
      if (isEditingUser) setIsEditingUser(false);
    }
  }, [location.pathname, routeUserId, users, loading]);

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    setIsSubmitting(true);
    setError('');

    try {
      const effectiveEditRole: Role =
        editUserRole === 'staff' && editUserStaffType === 'greeting' ? 'greeting' : editUserRole;

      const allowedValues = allowedRoleOptions.map(o => o.value);
      if (!allowedValues.includes(effectiveEditRole)) {
        throw new Error('Anda tidak memiliki izin untuk menetapkan role tersebut.');
      }

      if (effectiveEditRole === 'greeting' && editUserAssignedEvents.length !== 1) {
        throw new Error('Akun Layar Sapa wajib ditugaskan tepat pada 1 acara (1 User = 1 Acara) agar dapat langsung masuk ke Layar Sapa.');
      }

      if (effectiveEditRole === 'staff' && editUserAssignedEvents.length !== 1) {
        throw new Error('Petugas Staff wajib ditugaskan tepat pada 1 acara (1 User = 1 Acara).');
      }

      // Determine business association & clean up stale role attributes
      const existingTargetUser = users.find(u => u.id === editingUserId);
      let resolvedPartnerId: string | null = editUserPartnerId || null;
      let resolvedBizName: string | null = editUserBusinessName?.trim() || null;

      if (effectiveEditRole === 'superadmin') {
        resolvedPartnerId = null;
        resolvedBizName = null;
      } else if (appUser.role === 'owner' || appUser.role === 'partner') {
        resolvedPartnerId = appUser.partnerId || appUser.id || null;
        resolvedBizName = appUser.businessName || appUser.name || null;
      } else if (appUser.role === 'admin') {
        resolvedPartnerId = appUser.partnerId || null;
        resolvedBizName = appUser.businessName || null;
      } else if (appUser.role === 'superadmin') {
        if (effectiveEditRole === 'owner' || effectiveEditRole === 'partner') {
          resolvedPartnerId = editingUserId;
          resolvedBizName = editUserBusinessName?.trim() || editUserName.trim();
        } else {
          // If user was previously an owner/partner, don't keep their own UID as their parent business ID
          if (resolvedPartnerId === editingUserId) {
            resolvedPartnerId = null;
          }
          if (resolvedPartnerId) {
            const matchedOwner = businessOwners.find(
              b => (b.id === resolvedPartnerId || b.ownerUid === resolvedPartnerId) && b.ownerUid !== editingUserId
            );
            resolvedBizName = matchedOwner ? matchedOwner.businessName : null;
          } else {
            resolvedBizName = null;
          }
        }
      }

      const forceHideServices =
        effectiveEditRole === 'superadmin'
          ? false
          : effectiveEditRole === 'staff' ||
            effectiveEditRole === 'greeting' ||
            effectiveEditRole === 'admin' ||
            (effectiveEditRole === 'client' && Boolean(resolvedPartnerId)) ||
            editUserHideServiceInfo;

      const isBusinessRole = effectiveEditRole === 'owner' || effectiveEditRole === 'partner';

      const normalizedAssignedEvents =
        effectiveEditRole === 'greeting' || effectiveEditRole === 'staff'
          ? editUserAssignedEvents.slice(0, 1)
          : effectiveEditRole === 'admin'
          ? editUserAssignedEvents
          : [];

      const updateData: Record<string, any> = {
        name: editUserName.trim(),
        phone: editUserPhone.trim(),
        role: effectiveEditRole,
        staffType:
          effectiveEditRole === 'staff'
            ? editUserStaffType
            : effectiveEditRole === 'greeting'
            ? 'greeting'
            : null,
        assignedEventIds: normalizedAssignedEvents,
        partnerId: resolvedPartnerId,
        clientId: effectiveEditRole === 'client' ? (existingTargetUser?.clientId || editingUserId) : null,
        businessName: resolvedBizName,
        businessAddress: isBusinessRole ? editUserBusinessAddress.trim() : null,
        businessCity: isBusinessRole ? editUserBusinessCity.trim() : null,
        businessCategory: isBusinessRole ? (existingTargetUser?.businessCategory || 'Wedding Organizer (WO)') : null,
        logoUrl: isBusinessRole ? editUserLogoUrl : (existingTargetUser?.logoUrl || ''),
        hideServiceInfo: forceHideServices,
        updatedAt: serverTimestamp()
      };

      if (appUser.role === 'superadmin') {
        const canHaveQuota = editUserRole === 'owner' || editUserRole === 'partner' || editUserRole === 'client';
        updateData.clientCredit = canHaveQuota ? (Number(editUserClientCredit) || 0) : 0;
        updateData.clientQuota = canHaveQuota ? (Number(editUserClientCredit) || 0) : 0;
        updateData.eventCredit = canHaveQuota ? (Number(editUserEventCredit) || 0) : 0;
        updateData.eventQuota = canHaveQuota ? (Number(editUserEventCredit) || 0) : 0;
        updateData.allowManualEvent = canHaveQuota ? Boolean(editUserAllowManualEvent) : false;
        updateData.eventManual = canHaveQuota ? Boolean(editUserAllowManualEvent) : false;
      }

      if (editUserPassword && editUserPassword.trim().length > 0) {
        if (editUserPassword.trim().length < 6) {
          throw new Error('Password baru minimal 6 karakter.');
        }
        updateData._password = editUserPassword.trim();
      }

      await updateDoc(doc(db, 'users', editingUserId), updateData);

      setUsers(prev =>
        prev.map(u => {
          if (u.id !== editingUserId) return u;
          const nextUser: any = { ...u, ...updateData };
          if (!nextUser.staffType) delete nextUser.staffType;
          if (!nextUser.businessName) delete nextUser.businessName;
          if (!nextUser.businessAddress) delete nextUser.businessAddress;
          if (!nextUser.businessCity) delete nextUser.businessCity;
          return nextUser as User;
        })
      );
      setIsEditingUser(false);
      navigate('/auth/login/users', { replace: true });
      showAlert('Berhasil', 'Data pengguna, bisnis naungan & penugasan berhasil diperbarui!', 'success');
    } catch (err: any) {
      console.error('Error editing user:', err);
      setError(err.message || 'Gagal memperbarui user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    setIsSubmitting(true);
    setError('');

    try {
      const effectiveNewRole: Role =
        newUserRole === 'staff' && newUserStaffType === 'greeting' ? 'greeting' : newUserRole;

      const allowedValues = allowedRoleOptions.map(o => o.value);
      if (!allowedValues.includes(effectiveNewRole)) {
        throw new Error('Anda tidak memiliki izin untuk membuat user dengan role tersebut.');
      }

      if (newUserPassword.length < 6) {
        throw new Error('Password minimal 6 karakter.');
      }

      if (effectiveNewRole === 'greeting' && newUserAssignedEvents.length !== 1) {
        throw new Error('Silakan pilih tepat 1 Acara untuk akun Layar Sapa ini (1 User = 1 Acara).');
      }

      if (effectiveNewRole === 'staff' && newUserAssignedEvents.length !== 1) {
        throw new Error('Silakan pilih tepat 1 Acara yang ditugaskan untuk petugas Staff ini (1 User = 1 Acara).');
      }

      // 1. Create User in Auth via REST API
      const uid = await createAuthUserSilently(newUserEmail.trim(), newUserPassword);

      // 2. Resolve Business / Owner Hierarchy
      let resolvedPartnerId: string | null = newUserPartnerId || null;
      let resolvedBusinessName: string | undefined = newUserBusinessName?.trim() || undefined;

      if (appUser.role === 'owner' || appUser.role === 'partner') {
        resolvedPartnerId = appUser.partnerId || appUser.id || null;
        resolvedBusinessName = appUser.businessName || appUser.name;
      } else if (appUser.role === 'admin') {
        resolvedPartnerId = appUser.partnerId || null;
        resolvedBusinessName = appUser.businessName || undefined;
      } else if (appUser.role === 'superadmin') {
        if (effectiveNewRole === 'owner' || effectiveNewRole === 'partner') {
          resolvedPartnerId = uid;
          resolvedBusinessName = newUserBusinessName?.trim() || newUserName.trim();
        } else if (newUserPartnerId) {
          const matchedOwner = businessOwners.find(b => b.id === newUserPartnerId || b.ownerUid === newUserPartnerId);
          if (matchedOwner) {
            resolvedBusinessName = matchedOwner.businessName;
          }
        }
      }

      const forceHideServices =
        effectiveNewRole === 'staff' ||
        effectiveNewRole === 'greeting' ||
        effectiveNewRole === 'admin' ||
        (effectiveNewRole === 'client' && Boolean(resolvedPartnerId)) ||
        newUserHideServiceInfo;

      const normalizedNewAssignedEvents =
        effectiveNewRole === 'greeting' || effectiveNewRole === 'staff'
          ? newUserAssignedEvents.slice(0, 1)
          : effectiveNewRole === 'admin'
          ? newUserAssignedEvents
          : [];

      // 3. Add user document
      const newUserDoc: User = {
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        phone: newUserPhone.trim(),
        role: effectiveNewRole,
        staffType:
          effectiveNewRole === 'staff'
            ? newUserStaffType
            : effectiveNewRole === 'greeting'
            ? 'greeting'
            : undefined,
        assignedEventIds: normalizedNewAssignedEvents,
        partnerId: resolvedPartnerId,
        businessName: resolvedBusinessName,
        businessAddress: (effectiveNewRole === 'owner' || effectiveNewRole === 'partner') ? newUserBusinessAddress.trim() : undefined,
        businessCity: (effectiveNewRole === 'owner' || effectiveNewRole === 'partner') ? newUserBusinessCity.trim() : undefined,
        clientId: effectiveNewRole === 'client' ? (newUserClientId || uid) : null,
        logoUrl: effectiveNewRole === 'partner' || effectiveNewRole === 'owner' ? newUserLogoUrl : undefined,
        clientCredit: appUser.role === 'superadmin' ? (Number(newUserClientCredit) || 0) : 0,
        clientQuota: appUser.role === 'superadmin' ? (Number(newUserClientCredit) || 0) : 0,
        eventCredit: appUser.role === 'superadmin' ? (Number(newUserEventCredit) || 0) : 0,
        eventQuota: appUser.role === 'superadmin' ? (Number(newUserEventCredit) || 0) : 0,
        allowManualEvent: appUser.role === 'superadmin' ? Boolean(newUserAllowManualEvent) : false,
        eventManual: appUser.role === 'superadmin' ? Boolean(newUserAllowManualEvent) : false,
        hideServiceInfo: forceHideServices,
        createdBy: appUser.id,
        createdByName: `${appUser.name || appUser.email} (${getRoleLabel(appUser.role)})`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', uid), newUserDoc);

      setUsers([{ id: uid, ...newUserDoc }, ...users]);

      // 4. Send WhatsApp Notification
      let waResult: { success: boolean; error?: string } | null = null;
      if (newUserPhone) {
        const { sendFonnteMessage } = await import('../lib/fonnte');
        const loginUrl = `${window.location.origin}/auth/login`;
        const roleLabel = getRoleLabel(effectiveNewRole, effectiveNewRole === 'staff' ? newUserStaffType : undefined);
        const bizInfo = resolvedBusinessName ? `\n🏢 *Bisnis / WO* : ${resolvedBusinessName}` : '';
        const assignedEventTitle =
          normalizedNewAssignedEvents.length > 0
            ? events.find(ev => ev.id === normalizedNewAssignedEvents[0])?.title
            : undefined;
        const eventInfo = assignedEventTitle ? `\n📅 *Acara Ditugaskan* : ${assignedEventTitle}` : '';
        const autoRedirectNote =
          effectiveNewRole === 'greeting'
            ? `\n📺 *Akses Langsung* : Saat login, Anda akan otomatis masuk langsung ke layar monitor Layar Sapa TV acara tanpa melalui Dashboard.`
            : '';
        const message = `🔐 *Informasi Akun Guestly*

Halo Kak *${newUserName}*,

Akun Anda telah terdaftar di sistem Guestly sebagai *${roleLabel}*. Berikut informasi login Anda:

📧 *Email* : ${newUserEmail}
🔑 *Password* : ${newUserPassword}
👤 *Role* : ${roleLabel}${bizInfo}${eventInfo}
🌐 *Login* : ${loginUrl}${autoRedirectNote}

Mohon simpan informasi akun ini dengan baik dan jangan membagikannya kepada pihak lain.`;
        waResult = await sendFonnteMessage(null, newUserPhone, message);
      }

      setIsAddingUser(false);
      navigate('/auth/login/users', { replace: true });
      if (newUserPhone && waResult) {
        if (waResult.success) {
          showAlert('Berhasil', 'User / Petugas berhasil ditambahkan dan notifikasi akun telah dikirim ke WhatsApp!', 'success');
        } else {
          showAlert(
            'User Dibuat (WA Belum Terkirim)',
            `User berhasil ditambahkan, namun notifikasi WhatsApp gagal terkirim: ${waResult.error || 'Periksa pengaturan Token Fonnte.'}`,
            'warning'
          );
        }
      } else {
        showAlert('Berhasil', 'User / Petugas berhasil ditambahkan!', 'success');
      }
    } catch (err: any) {
      console.error('Error adding user:', err);
      setError(err.message || 'Gagal menambahkan user');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered users for table display
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (businessFilter !== 'all') {
        const userBiz = u.partnerId || (u.role === 'owner' || u.role === 'partner' ? u.id : '');
        if (userBiz !== businessFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = u.name?.toLowerCase().includes(q);
        const emailMatch = u.email?.toLowerCase().includes(q);
        const bizMatch = (getBusinessLabelForUser(u) || '').toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !bizMatch) return false;
      }
      return true;
    });
  }, [users, roleFilter, businessFilter, searchQuery, businessOwners]);

  if (!canManageUsers) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-md">Akses Ditolak</div>
      </div>
    );
  }

  const renderEventAssignmentSelector = (
    selectedIds: string[],
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>,
    role: Role,
    targetPartnerId?: string
  ) => {
    const scopedEvents = targetPartnerId
      ? events.filter(ev => !ev.partnerId || ev.partnerId === 'default-partner' || ev.partnerId === targetPartnerId)
      : events;
    const displayEvents = scopedEvents.length > 0 ? scopedEvents : events;
    const isSingleEventRole = role === 'greeting' || role === 'staff';

    return (
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          role === 'greeting'
            ? 'bg-rose-50/60 border-rose-200'
            : 'bg-emerald-50/60 border-emerald-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              role === 'greeting' ? 'text-rose-900' : 'text-emerald-900'
            }`}
          >
            <CalendarDays
              className={`w-4 h-4 ${role === 'greeting' ? 'text-rose-600' : 'text-emerald-600'}`}
            />
            {isSingleEventRole
              ? `Penugasan Acara (${selectedIds.length > 0 ? '1 Acara Dipilih' : 'Belum Dipilih'})`
              : `Penugasan Acara (${selectedIds.length} dipilih)`}
          </label>
          {isSingleEventRole ? (
            <span
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                role === 'greeting'
                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
            >
              1 User = 1 Acara
            </span>
          ) : (
            displayEvents.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.length === displayEvents.length) setSelectedIds([]);
                  else setSelectedIds(displayEvents.map(e => e.id!));
                }}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline"
              >
                {selectedIds.length === displayEvents.length ? 'Batal Pilih Semua' : 'Pilih Semua Acara'}
              </button>
            )
          )}
        </div>
        <p
          className={`text-xs leading-relaxed ${
            role === 'greeting' ? 'text-rose-800' : 'text-emerald-800'
          }`}
        >
          {role === 'greeting'
            ? 'Wajib (1 User = 1 Acara): Pilih tepat 1 acara untuk akun Layar Sapa ini. Saat login, akun ini akan otomatis masuk langsung ke layar monitor Layar Sapa TV tanpa melalui Dashboard. Jika ada beberapa acara bersamaan, silakan buat akun baru.'
            : role === 'staff'
            ? 'Wajib (1 User = 1 Acara): Pilih 1 acara yang ditugaskan untuk petugas Staff ini. Jika terdapat beberapa acara dalam waktu bersamaan, silakan buat akun petugas baru untuk masing-masing acara.'
            : 'Opsional untuk Admin: Centang acara tertentu jika ingin membatasi Admin hanya pada acara tersebut, atau biarkan kosong untuk akses semua acara di bisnisnya.'}
        </p>
        <div
          className={`max-h-44 overflow-y-auto space-y-1.5 bg-white p-2.5 rounded-lg border ${
            role === 'greeting' ? 'border-rose-100' : 'border-emerald-100'
          }`}
        >
          {displayEvents.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Belum ada acara yang tersedia.</p>
          ) : (
            displayEvents.map(ev => {
              const checked = selectedIds.includes(ev.id!);
              return (
                <div
                  key={ev.id}
                  onClick={() =>
                    toggleEventSelection(ev.id!, selectedIds, setSelectedIds, isSingleEventRole)
                  }
                  className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? role === 'greeting'
                        ? 'bg-rose-50 border-rose-300 text-rose-950'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-gray-50/60 border-gray-100 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isSingleEventRole ? (
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          checked
                            ? role === 'greeting'
                              ? 'border-rose-600 bg-rose-600'
                              : 'border-emerald-600 bg-emerald-600'
                            : 'border-gray-400 bg-white'
                        }`}
                      >
                        {checked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    ) : checked ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{ev.title}</p>
                      <p className="text-[10px] text-gray-500">{ev.date || '-'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 ml-2 shrink-0">{ev.status}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <p className="text-sm text-gray-500">
            {appUser?.role === 'superadmin' &&
              'Kelola seluruh Bisnis (Owner), Admin, Staff Lapangan, dan Client beserta pengelompokan bisnisnya.'}
            {(appUser?.role === 'owner' || appUser?.role === 'partner') &&
              `Kelola tim Admin Operasional, Staff Lapangan (Scan/Souvenir), dan Client di bawah bisnis ${currentUserBizName || 'Anda'}.`}
            {appUser?.role === 'admin' &&
              `Kelola dan tugaskan akun Staff Lapangan (Scan Kehadiran & Souvenir) untuk acara di bisnis ${currentUserBizName || 'Anda'}.`}
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          {appUser?.role === 'admin' ? 'Tambah Petugas Staff' : 'Tambah User / Petugas'}
        </button>
      </div>

      {/* Hierarchy Info Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 mt-0.5">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="text-xs text-gray-600 space-y-1">
            <div className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
              <span>Wewenang Akun Anda: {getRoleLabel(appUser?.role, appUser?.staffType)}</span>
              {currentUserBizName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                  <Building2 className="w-3 h-3" /> {currentUserBizName}
                </span>
              )}
            </div>
            <p>
              {appUser?.role === 'superadmin' &&
                'Anda dapat menambahkan Owner (Bisnis Baru) serta mengelompokkan Admin, Staff, dan Client ke bawah naungan bisnis tertentu.'}
              {(appUser?.role === 'owner' || appUser?.role === 'partner') &&
                'Anda dapat menambahkan Admin Operasional, Staff Lapangan, dan Client. Seluruh akun yang Anda buat otomatis berada di bawah naungan bisnis Anda dan modul Informasi Layanan disembunyikan dari mereka.'}
              {appUser?.role === 'admin' &&
                'Anda dapat menambahkan dan menugaskan Staff Lapangan (Scan Kehadiran & Souvenir) pada acara yang Anda kelola.'}
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama user, email, atau nama bisnis..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
            >
              <option value="all">Semua Role</option>
              {appUser?.role === 'superadmin' && <option value="superadmin">Super Admin</option>}
              {appUser?.role !== 'admin' && <option value="owner">Owner (Bisnis)</option>}
              <option value="admin">Admin Operasional</option>
              <option value="staff">Staff Lapangan</option>
              <option value="greeting">Layar Sapa (Display TV)</option>
              {appUser?.role !== 'admin' && <option value="client">Client</option>}
            </select>
          </div>

          {appUser?.role === 'superadmin' && businessOwners.length > 0 && (
            <select
              value={businessFilter}
              onChange={e => setBusinessFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white max-w-[220px]"
            >
              <option value="all">Semua Bisnis / Owner</option>
              {businessOwners.map(biz => (
                <option key={biz.id} value={biz.id}>
                  🏢 {biz.businessName}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddingUser}
        onClose={closeAddUserModal}
        title={appUser?.role === 'admin' ? 'Tambah Petugas Staff Baru' : 'Tambah User / Petugas Baru'}
      >
        <form onSubmit={handleAddUser} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role / Jabatan</label>
            <select
              value={newUserRole}
              onChange={e => {
                const selectedRole = e.target.value as Role;
                setNewUserRole(selectedRole);
                if (selectedRole === 'greeting') {
                  setNewUserStaffType('greeting');
                  setNewUserAssignedEvents(prev => prev.slice(0, 1));
                } else if (selectedRole === 'staff') {
                  if (newUserStaffType === 'greeting') setNewUserStaffType('checkin');
                  setNewUserAssignedEvents(prev => prev.slice(0, 1));
                }
                if (
                  selectedRole === 'staff' ||
                  selectedRole === 'greeting' ||
                  selectedRole === 'admin' ||
                  selectedRole === 'client'
                ) {
                  setNewUserHideServiceInfo(true);
                } else {
                  setNewUserHideServiceInfo(false);
                }
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 font-medium text-gray-900 bg-white"
            >
              {allowedRoleOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Super Admin: Business Name & Address input when creating an Owner / Partner */}
          {appUser?.role === 'superadmin' && (newUserRole === 'owner' || newUserRole === 'partner') && (
            <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                <Building2 className="w-4 h-4 text-amber-600" />
                Identitas Partner Guestly (Nama Usaha & Alamat)
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nama Bisnis / Usaha Partner *
                </label>
                <input
                  required
                  type="text"
                  value={newUserBusinessName}
                  onChange={e => setNewUserBusinessName(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                  placeholder="Contoh: Bintang Wedding Organizer"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Alamat Lengkap Usaha *
                  </label>
                  <input
                    required
                    type="text"
                    value={newUserBusinessAddress}
                    onChange={e => setNewUserBusinessAddress(e.target.value)}
                    className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                    placeholder="Contoh: Jl. Merdeka No. 45"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Kota / Kabupaten *
                  </label>
                  <input
                    required
                    type="text"
                    value={newUserBusinessCity}
                    onChange={e => setNewUserBusinessCity(e.target.value)}
                    className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                    placeholder="Bandung"
                  />
                </div>
              </div>
              <p className="text-[11px] text-amber-800">
                Nama usaha & alamat wajib diisi oleh Super Admin agar Partner diizinkan membuat acara (Create Event).
              </p>
            </div>
          )}

          {/* Super Admin: Select which Business / Owner this Admin, Staff, Layar Sapa, or Client belongs to */}
          {appUser?.role === 'superadmin' &&
            (newUserRole === 'admin' ||
              newUserRole === 'staff' ||
              newUserRole === 'greeting' ||
              newUserRole === 'client') && (
              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  Bernaung di Bawah Bisnis / Owner
                </label>
                <select
                  value={newUserPartnerId}
                  onChange={e => {
                    const pid = e.target.value;
                    setNewUserPartnerId(pid);
                    const matched = businessOwners.find(b => b.id === pid || b.ownerUid === pid);
                    setNewUserBusinessName(matched ? matched.businessName : '');
                  }}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 bg-white text-sm font-medium text-gray-900"
                >
                  <option value="">-- Global / Tanpa Naungan Khusus --</option>
                  {businessOwners.map(biz => (
                    <option key={biz.id} value={biz.id}>
                      🏢 {biz.businessName} (Owner: {biz.ownerName})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-amber-800">
                  Pilih bisnis Owner tempat {getRoleLabel(newUserRole)} ini bekerja/bernaung agar datanya terisolasi dengan rapi.
                </p>
              </div>
            )}

          {/* Owner / Admin: Automatic Business Inheritance Badge */}
          {appUser?.role !== 'superadmin' && (
            <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-amber-900">
                <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Naungan Bisnis Otomatis: <strong>{currentUserBizName || appUser?.name}</strong>
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
                Terkunci Otomatis
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {newUserRole === 'greeting'
                ? 'Nama Perangkat / Operator Layar Sapa'
                : newUserRole === 'staff'
                ? 'Nama Lengkap / Nama Meja Petugas'
                : 'Nama Lengkap'}
            </label>
            <input
              required
              value={newUserName}
              onChange={e => setNewUserName(e.target.value)}
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder={
                newUserRole === 'greeting'
                  ? 'Contoh: TV Layar Sapa - Ballroom Utama'
                  : newUserRole === 'staff'
                  ? 'Contoh: Rina - Gate VIP 1'
                  : 'Masukkan nama lengkap'
              }
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Login</label>
              <input
                required
                value={newUserEmail}
                onChange={e => setNewUserEmail(e.target.value)}
                type="email"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="user@guestly.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">No. WhatsApp / Telepon</label>
              <input
                value={newUserPhone}
                onChange={e => setNewUserPhone(e.target.value)}
                type="tel"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="08123456789 (Opsional)"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              required
              minLength={6}
              value={newUserPassword}
              onChange={e => setNewUserPassword(e.target.value)}
              type="password"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Min. 6 karakter"
            />
          </div>

          {newUserRole === 'staff' && (
            <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-indigo-900">
                Spesialisasi Fitur Staff (Mode Fokus)
              </label>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    newUserStaffType === 'checkin'
                      ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-white/60 border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="newStaffType"
                    checked={newUserStaffType === 'checkin'}
                    onChange={() => setNewUserStaffType('checkin')}
                    className="mt-1 text-indigo-600"
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <ScanLine className="w-3.5 h-3.5 text-blue-600" /> Staff Scan Kehadiran (Gate Masuk)
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Hanya menampilkan fitur Scanner Check-in Kehadiran & Daftar Hadir (tidak bisa Create Event).
                    </p>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    newUserStaffType === 'souvenir'
                      ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'bg-white/60 border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="newStaffType"
                    checked={newUserStaffType === 'souvenir'}
                    onChange={() => setNewUserStaffType('souvenir')}
                    className="mt-1 text-emerald-600"
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-emerald-600" /> Staff Souvenir (Loket Penukaran)
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Hanya menampilkan fitur Scanner Souvenir, Antrean Serah 1-Klik & Stok Souvenir.
                    </p>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    newUserStaffType === 'all'
                      ? 'bg-white border-purple-500 ring-2 ring-purple-500/20'
                      : 'bg-white/60 border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="newStaffType"
                    checked={newUserStaffType === 'all'}
                    onChange={() => setNewUserStaffType('all')}
                    className="mt-1 text-purple-600"
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-900">
                      Staff All-in-One (Scan Kehadiran + Souvenir)
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Dapat mengakses mode Check-in sekaligus penyerahan Souvenir di 1 meja.
                    </p>
                  </div>
                </label>
                <label
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors bg-white/60 border-gray-200 hover:border-rose-300"
                >
                  <input
                    type="radio"
                    name="newStaffType"
                    checked={false}
                    onChange={() => {
                      setNewUserRole('greeting');
                      setNewUserStaffType('greeting');
                      setNewUserAssignedEvents(prev => prev.slice(0, 1));
                    }}
                    className="mt-1 text-rose-600"
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-rose-600" /> Layar Sapa (Display TV / Monitor Sambutan)
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Otomatis langsung masuk ke area Layar Sapa TV tanpa ke Dashboard (1 User = 1 Acara).
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {newUserRole === 'greeting' && (
            <div className="bg-rose-50/80 p-3.5 rounded-xl border border-rose-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-rose-600" />
                  Mode Fokus Layar Sapa (Auto-Redirect TV)
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                  Tanpa Dashboard
                </span>
              </div>
              <p className="text-xs text-rose-900 leading-relaxed">
                Begitu akun ini login, sistem akan <strong>otomatis langsung membuka layar penuh Layar Sapa</strong> pada 1 acara yang dipilih di bawah ini tanpa masuk ke halaman Dashboard terlebih dahulu.
              </p>
            </div>
          )}

          {(newUserRole === 'staff' || newUserRole === 'greeting' || newUserRole === 'admin') &&
            renderEventAssignmentSelector(
              newUserAssignedEvents,
              setNewUserAssignedEvents,
              newUserRole,
              appUser?.role === 'superadmin' ? newUserPartnerId : (currentUserBizId || undefined)
            )}

          {/* Pengaturan Kuota khusus Super Admin ketika menambah Owner / Partner / Client */}
          {(newUserRole === 'partner' || newUserRole === 'client' || newUserRole === 'owner') &&
            appUser?.role === 'superadmin' && (
              <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-600" />
                    Pengaturan Kuota & Bypass
                  </span>
                  <span className="text-[11px] text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded font-medium">
                    Super Admin
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Credit Client</label>
                    <input
                      type="number"
                      min="0"
                      value={newUserClientCredit}
                      onChange={e => setNewUserClientCredit(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Credit Event</label>
                    <input
                      type="number"
                      min="0"
                      value={newUserEventCredit}
                      onChange={e => setNewUserEventCredit(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-indigo-100/70 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-gray-800 block">
                      Event Manual (Bypass Tanpa Batas)
                    </label>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                    <input
                      type="checkbox"
                      checked={newUserAllowManualEvent}
                      onChange={e => setNewUserAllowManualEvent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            )}

          {/* Informasi Layanan Visibility Info / Toggle */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center justify-between">
            <div className="flex items-start gap-2">
              <EyeOff className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-800">Sembunyikan Modul "Informasi Layanan"</p>
                <p className="text-[11px] text-gray-500">
                  {newUserRole === 'staff' || newUserRole === 'greeting' || newUserRole === 'admin'
                    ? 'Otomatis disembunyikan untuk seluruh Staff, Layar Sapa, dan Admin.'
                    : 'Menyembunyikan menu harga layanan, katalog paket & invoice dari sidebar user ini.'}
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={
                newUserRole === 'staff' ||
                newUserRole === 'greeting' ||
                newUserRole === 'admin' ||
                (newUserRole === 'client' && Boolean(newUserPartnerId || appUser?.role !== 'superadmin')) ||
                newUserHideServiceInfo
              }
              disabled={
                newUserRole === 'staff' ||
                newUserRole === 'greeting' ||
                newUserRole === 'admin' ||
                appUser?.role !== 'superadmin'
              }
              onChange={e => setNewUserHideServiceInfo(e.target.checked)}
              className="h-4 w-4 rounded text-indigo-600 border-gray-300"
            />
          </div>

          <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => closeAddUserModal(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium mr-3"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center min-w-[100px]"
            >
              {isSubmitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                'Simpan'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditingUser}
        onClose={closeEditUserModal}
        title="Edit User, Bisnis Naungan & Penugasan"
      >
        <form onSubmit={handleEditUser} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role / Jabatan</label>
            <select
              value={editUserRole}
              onChange={e => {
                const nextRole = e.target.value as Role;
                setEditUserRole(nextRole);

                if (nextRole === 'superadmin') {
                  setEditUserPartnerId('');
                  setEditUserBusinessName('');
                  setEditUserBusinessAddress('');
                  setEditUserBusinessCity('');
                  setEditUserAssignedEvents([]);
                  setEditUserHideServiceInfo(false);
                } else if (nextRole === 'owner' || nextRole === 'partner') {
                  setEditUserPartnerId(editingUserId);
                  setEditUserAssignedEvents([]);
                  setEditUserHideServiceInfo(false);
                } else {
                  // Transitioning to admin, staff, greeting, or client
                  if (editUserPartnerId === editingUserId) {
                    setEditUserPartnerId('');
                    setEditUserBusinessName('');
                    setEditUserBusinessAddress('');
                    setEditUserBusinessCity('');
                  }
                  if (nextRole === 'greeting') {
                    setEditUserStaffType('greeting');
                    setEditUserAssignedEvents(prev => prev.slice(0, 1));
                    setEditUserHideServiceInfo(true);
                  } else if (nextRole === 'staff') {
                    if (editUserStaffType === 'greeting') setEditUserStaffType('checkin');
                    setEditUserAssignedEvents(prev => prev.slice(0, 1));
                    setEditUserHideServiceInfo(true);
                  } else if (nextRole === 'admin') {
                    setEditUserHideServiceInfo(true);
                  } else if (nextRole === 'client') {
                    const nextPid = editUserPartnerId === editingUserId ? '' : editUserPartnerId;
                    setEditUserHideServiceInfo(Boolean(nextPid));
                  }
                }
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 font-medium text-gray-900 bg-white"
            >
              {allowedRoleOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Super Admin: Edit Business Name & Address for Owner / Partner */}
          {appUser?.role === 'superadmin' && (editUserRole === 'owner' || editUserRole === 'partner') && (
            <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-amber-600" />
                Identitas Bisnis Partner (Nama Usaha & Alamat)
              </label>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nama Bisnis / Usaha Partner *
                </label>
                <input
                  type="text"
                  required
                  value={editUserBusinessName}
                  onChange={e => setEditUserBusinessName(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                  placeholder="Contoh: Bintang Wedding Organizer"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Alamat Lengkap Usaha *
                  </label>
                  <input
                    type="text"
                    required
                    value={editUserBusinessAddress}
                    onChange={e => setEditUserBusinessAddress(e.target.value)}
                    className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                    placeholder="Contoh: Jl. Merdeka No. 45"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Kota / Kabupaten *
                  </label>
                  <input
                    type="text"
                    required
                    value={editUserBusinessCity}
                    onChange={e => setEditUserBusinessCity(e.target.value)}
                    className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                    placeholder="Bandung"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Super Admin: Assign Admin / Staff / Layar Sapa / Client to an Owner's Business */}
          {appUser?.role === 'superadmin' &&
            (editUserRole === 'admin' ||
              editUserRole === 'staff' ||
              editUserRole === 'greeting' ||
              editUserRole === 'client') && (
              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  Bernaung di Bawah Bisnis / Owner
                </label>
                <select
                  value={editUserPartnerId}
                  onChange={e => {
                    const pid = e.target.value;
                    setEditUserPartnerId(pid);
                    const matched = businessOwners.find(b => b.id === pid || b.ownerUid === pid);
                    setEditUserBusinessName(matched ? matched.businessName : '');
                  }}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 bg-white text-sm font-medium text-gray-900"
                >
                  <option value="">-- Global / Tanpa Naungan Khusus --</option>
                  {businessOwners
                    .filter(biz => biz.ownerUid !== editingUserId)
                    .map(biz => (
                      <option key={biz.id} value={biz.id}>
                        🏢 {biz.businessName} (Owner: {biz.ownerName})
                      </option>
                    ))}
                </select>
              </div>
            )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap / Nama Petugas</label>
            <input
              required
              value={editUserName}
              onChange={e => setEditUserName(e.target.value)}
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Nama Petugas"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">No. WhatsApp / Telepon</label>
            <input
              value={editUserPhone}
              onChange={e => setEditUserPhone(e.target.value)}
              type="tel"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="08123456789"
            />
          </div>

          {editUserRole === 'staff' && (
            <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-indigo-900">
                Spesialisasi Tugas Staff (Mode Fokus)
              </label>
              <select
                value={editUserStaffType}
                onChange={e => {
                  const val = e.target.value as StaffType;
                  if (val === 'greeting') {
                    setEditUserRole('greeting');
                    setEditUserStaffType('greeting');
                    setEditUserAssignedEvents(prev => prev.slice(0, 1));
                  } else {
                    setEditUserStaffType(val);
                  }
                }}
                className="w-full border border-indigo-300 rounded-lg px-3 py-2 bg-white text-sm font-semibold text-indigo-950"
              >
                <option value="checkin">Staff Scan Kehadiran (Fokus Gate Masuk)</option>
                <option value="souvenir">Staff Souvenir (Fokus Loket & Stok Souvenir)</option>
                <option value="all">Staff All-in-One (Scan Kehadiran + Souvenir)</option>
                <option value="greeting">Layar Sapa (Display TV - Otomatis Masuk Layar Sapa)</option>
              </select>
            </div>
          )}

          {editUserRole === 'greeting' && (
            <div className="bg-rose-50/80 p-3.5 rounded-xl border border-rose-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-rose-600" />
                  Mode Fokus Layar Sapa (Auto-Redirect TV)
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                  Tanpa Dashboard
                </span>
              </div>
              <p className="text-xs text-rose-900 leading-relaxed">
                Akun ini akan <strong>otomatis masuk langsung ke tampilan Layar Sapa TV</strong> dari 1 acara yang ditugaskan begitu berhasil login tanpa melalui Dashboard.
              </p>
            </div>
          )}

          {(editUserRole === 'staff' || editUserRole === 'greeting' || editUserRole === 'admin') &&
            renderEventAssignmentSelector(
              editUserAssignedEvents,
              setEditUserAssignedEvents,
              editUserRole,
              appUser?.role === 'superadmin' ? editUserPartnerId : (currentUserBizId || undefined)
            )}

          {(editUserRole === 'partner' || editUserRole === 'client' || editUserRole === 'owner') &&
            appUser?.role === 'superadmin' && (
              <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-600" />
                    Pengaturan Kuota Super Admin
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Credit Client</label>
                    <input
                      type="number"
                      min="0"
                      value={editUserClientCredit}
                      onChange={e => setEditUserClientCredit(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Credit Event</label>
                    <input
                      type="number"
                      min="0"
                      value={editUserEventCredit}
                      onChange={e => setEditUserEventCredit(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-indigo-100/70 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-800">Event Manual (Bypass Tanpa Batas)</label>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                    <input
                      type="checkbox"
                      checked={editUserAllowManualEvent}
                      onChange={e => setEditUserAllowManualEvent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            )}

          {/* Informasi Layanan Visibility Toggle */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center justify-between">
            <div className="flex items-start gap-2">
              <EyeOff className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-800">Sembunyikan Modul "Informasi Layanan"</p>
                <p className="text-[11px] text-gray-500">
                  Menyembunyikan katalog paket, harga layanan & invoice dari pengguna ini.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={
                editUserRole === 'staff' ||
                editUserRole === 'greeting' ||
                editUserRole === 'admin' ||
                (editUserRole === 'client' && Boolean(editUserPartnerId)) ||
                editUserHideServiceInfo
              }
              disabled={
                editUserRole === 'staff' ||
                editUserRole === 'greeting' ||
                editUserRole === 'admin' ||
                appUser?.role !== 'superadmin'
              }
              onChange={e => setEditUserHideServiceInfo(e.target.checked)}
              className="h-4 w-4 rounded text-indigo-600 border-gray-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru (Opsional)</label>
            <input
              minLength={6}
              value={editUserPassword}
              onChange={e => setEditUserPassword(e.target.value)}
              type="password"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Biarkan kosong jika tidak ingin mengubah password"
            />
          </div>

          <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => closeEditUserModal(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium mr-3"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center min-w-[100px]"
            >
              {isSubmitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                'Simpan'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Users Table */}
      {loading ? (
        <div className="flex justify-center p-8 bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User / Petugas
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role & Spesialisasi
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bisnis / Naungan (WO)
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acara Ditugaskan / Kuota
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hak Akses & Layanan
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map(user => {
                  const assignedIds = Array.isArray(user.assignedEventIds) ? user.assignedEventIds : [];
                  const assignedNames = assignedIds
                    .map(id => events.find(e => e.id === id)?.title || id)
                    .filter(Boolean);
                  const bizLabel = getBusinessLabelForUser(user);
                  const canModify = canModifyTargetUser(user);
                  const serviceHidden = shouldHideServiceInfo(user);

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                            {user.name?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div className="ml-3.5">
                            <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                            {user.phone && <div className="text-[11px] text-gray-400">{user.phone}</div>}
                            {user.createdByName && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                Dibuat oleh: <span className="font-medium text-gray-600">{user.createdByName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center w-fit px-2.5 py-1 rounded-full text-xs font-semibold border ${
                              user.role === 'superadmin'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : user.role === 'owner'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : user.role === 'admin'
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : isGreetingScreenUser(user)
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : user.role === 'staff'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : user.role === 'partner'
                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                : 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                          >
                            {getRoleLabel(user.role, user.staffType)}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {bizLabel ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50/80 text-amber-900 border border-amber-200">
                            <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="truncate max-w-[160px]" title={bizLabel}>
                              {bizLabel}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Belum diatur</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-700">
                        {user.role === 'staff' || user.role === 'greeting' || user.role === 'admin' ? (
                          assignedNames.length > 0 ? (
                            <div className="space-y-1 max-w-xs">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${
                                  isGreetingScreenUser(user)
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                <CalendarDays className="w-3 h-3" /> {assignedNames.length} Acara Ditugaskan
                              </span>
                              <p className="text-xs text-gray-600 truncate" title={assignedNames.join(', ')}>
                                {assignedNames.join(', ')}
                              </p>
                            </div>
                          ) : user.role === 'admin' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              Akses Acara Bisnisnya
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              ⚠️ Belum Ditugaskan Acara
                            </span>
                          )
                        ) : user.role === 'client' ? (
                          <span className="text-xs text-gray-500">Khusus Acara Miliknya</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              Client: {user.clientCredit !== undefined ? user.clientCredit : (user.clientQuota || 0)}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                              Event: {user.eventCredit !== undefined ? user.eventCredit : (user.eventQuota || 0)}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-xs">
                        <div className="flex flex-col gap-1">
                          {isGreetingScreenUser(user) ? (
                            <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded font-semibold bg-rose-50 text-rose-700 border border-rose-200 text-[11px]">
                              <Monitor className="w-3 h-3" /> Auto-Masuk Layar Sapa (Tanpa Dashboard)
                            </span>
                          ) : user.role === 'staff' || user.role === 'client' ? (
                            <span className="inline-flex items-center w-fit px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-700 border border-gray-200 text-[11px]">
                              Create Event: Terkunci
                            </span>
                          ) : user.role === 'superadmin' ||
                            isPartnerBusinessRegistered(
                              user,
                              users.find(u => u.id === user.partnerId)
                            ) ? (
                            <span className="inline-flex items-center w-fit px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                              Create Event: Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center w-fit px-2 py-0.5 rounded font-medium bg-amber-50 text-amber-800 border border-amber-200 text-[11px]">
                              Create Event: Terkunci (Alamat Bisnis Belum Diisi)
                            </span>
                          )}
                          {serviceHidden && (
                            <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded font-medium bg-rose-50 text-rose-700 border border-rose-200 text-[10px]">
                              <EyeOff className="w-3 h-3" /> Info Layanan Disembunyikan
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-sm font-medium">
                        {canModify ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-md hover:bg-indigo-100 transition-colors"
                            >
                              <Edit className="w-4 h-4" /> Edit / Tugaskan
                            </button>
                            {user.id !== appUser?.id && user.role !== 'superadmin' && (
                              <button
                                onClick={() => handleDelete(user)}
                                className="text-red-600 hover:text-red-900 flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-md hover:bg-red-100 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" /> Hapus
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Hanya Lihat</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Tidak ada user yang sesuai dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 border-t border-gray-200 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
