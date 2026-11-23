import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, createAuthUserSilently } from '../lib/firebase';
import { User, EventRecord, Client } from '../types';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Plus,
  Edit,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Users,
  CalendarDays,
  Shield,
  Lock,
  X
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { showAlert, showConfirm, showCancelAlert } from '../lib/alerts';
import { getRoleLabel, isPartnerBusinessRegistered } from '../lib/utils';
import { WaGroupSettingsPanel, WaGroupSettingsValue } from '../components/WaGroupSettingsPanel';
import { DEFAULT_GROUP_REMINDER_TIME, DEFAULT_GROUP_REMINDER_H0_TIME } from '../lib/waGroupReminder';

const createDefaultWaGroupSettings = (): WaGroupSettingsValue => ({
  waGroupId: '',
  waGroupName: '',
  waGroupReminderEnabled: false,
  waGroupReminderH3: true,
  waGroupReminderH1: true,
  waGroupReminderH0: true,
  waGroupReminderTime: DEFAULT_GROUP_REMINDER_TIME,
  waGroupReminderH0Time: DEFAULT_GROUP_REMINDER_H0_TIME,
});

export default function BusinessesList() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { businessId: routeBusinessId } = useParams<{ businessId?: string }>();
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'incomplete'>('all');
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Add Business / Partner Modal State
  const [isAdding, setIsAdding] = useState(false);
  const [registerMode, setRegisterMode] = useState<'new_owner' | 'existing_owner'>('new_owner');
  const [selectedExistingOwnerId, setSelectedExistingOwnerId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('Wedding Organizer (WO)');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [clientCredit, setClientCredit] = useState<number>(0);
  const [eventCredit, setEventCredit] = useState<number>(0);
  const [allowManualEvent, setAllowManualEvent] = useState<boolean>(false);
  const [addWaGroup, setAddWaGroup] = useState<WaGroupSettingsValue>(createDefaultWaGroupSettings());

  // Edit Business Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editingOwnerId, setEditingOwnerId] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editBusinessCategory, setEditBusinessCategory] = useState('Wedding Organizer (WO)');
  const [editBusinessAddress, setEditBusinessAddress] = useState('');
  const [editBusinessCity, setEditBusinessCity] = useState('');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editOwnerPhone, setEditOwnerPhone] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editClientCredit, setEditClientCredit] = useState<number>(0);
  const [editEventCredit, setEditEventCredit] = useState<number>(0);
  const [editAllowManualEvent, setEditAllowManualEvent] = useState<boolean>(false);
  const [editWaGroup, setEditWaGroup] = useState<WaGroupSettingsValue>(createDefaultWaGroupSettings());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersSnap, eventsSnap, clientsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'events')),
        getDocs(collection(db, 'clients'))
      ]);

      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      setEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EventRecord)));
      setClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    } catch (err) {
      console.error('Error loading business management data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (appUser?.role === 'superadmin') {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [appUser]);

  // All Partner / Owner accounts
  const partnerBusinesses = useMemo(() => {
    return users.filter(u => u.role === 'owner' || u.role === 'partner');
  }, [users]);

  // Enrich each Partner Business with counts of Team, Clients, Events, and Verification status
  const enrichedBusinesses = useMemo(() => {
    return partnerBusinesses.map(owner => {
      const bizId = owner.partnerId || owner.id || '';
      const isVerified = isPartnerBusinessRegistered(owner);

      const teamMembers = users.filter(
        u =>
          (u.role === 'admin' || u.role === 'staff') &&
          (u.partnerId === bizId || u.partnerId === owner.id)
      );

      const bizClients = clients.filter(
        c => c.partnerId === bizId || c.partnerId === owner.id
      );

      const bizEvents = events.filter(
        ev => ev.partnerId === bizId || ev.partnerId === owner.id
      );

      return {
        owner,
        bizId,
        isVerified,
        teamCount: teamMembers.length,
        adminCount: teamMembers.filter(m => m.role === 'admin').length,
        staffCount: teamMembers.filter(m => m.role === 'staff').length,
        clientCount: bizClients.length,
        eventCount: bizEvents.length
      };
    });
  }, [partnerBusinesses, users, clients, events]);

  const filteredBusinesses = useMemo(() => {
    return enrichedBusinesses.filter(item => {
      if (statusFilter === 'verified' && !item.isVerified) return false;
      if (statusFilter === 'incomplete' && item.isVerified) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (item.owner.businessName || '').toLowerCase().includes(q);
        const ownerMatch = (item.owner.name || '').toLowerCase().includes(q);
        const emailMatch = (item.owner.email || '').toLowerCase().includes(q);
        const addrMatch = (item.owner.businessAddress || '').toLowerCase().includes(q);
        const cityMatch = (item.owner.businessCity || '').toLowerCase().includes(q);
        return nameMatch || ownerMatch || emailMatch || addrMatch || cityMatch;
      }

      return true;
    });
  }, [enrichedBusinesses, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = enrichedBusinesses.length;
    const verified = enrichedBusinesses.filter(b => b.isVerified).length;
    const incomplete = total - verified;
    const totalPartnerEvents = enrichedBusinesses.reduce((acc, b) => acc + b.eventCount, 0);
    return { total, verified, incomplete, totalPartnerEvents };
  }, [enrichedBusinesses]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredBusinesses.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredBusinesses.length);
  const paginatedBusinesses = filteredBusinesses.slice(startIndex, endIndex);
  const hasActiveFilters = Boolean(searchQuery.trim() || statusFilter !== 'all');

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCurrentPage(1);
  };

  const handleOpenAddModal = () => {
    setError('');
    setRegisterMode('new_owner');
    setSelectedExistingOwnerId(partnerBusinesses[0]?.id || '');
    setBusinessName('');
    setBusinessCategory('Wedding Organizer (WO)');
    setBusinessAddress('');
    setBusinessCity('');
    setOwnerName('');
    setOwnerEmail('');
    setOwnerPassword('');
    setOwnerPhone('');
    setLogoUrl('');
    setClientCredit(5);
    setEventCredit(5);
    setAllowManualEvent(false);
    setAddWaGroup(createDefaultWaGroupSettings());
    setIsAdding(true);
    if (!location.pathname.endsWith('/businesses/add')) {
      navigate('/auth/login/businesses/add');
    }
  };

  const closeAddBusinessModal = (showCancel = false) => {
    setIsAdding(false);
    if (location.pathname !== '/auth/login/businesses') {
      navigate('/auth/login/businesses');
    }
    if (showCancel) {
      showCancelAlert('Pendaftaran bisnis partner baru telah dibatalkan.');
    }
  };

  const closeEditBusinessModal = (showCancel = false) => {
    setIsEditing(false);
    if (location.pathname !== '/auth/login/businesses') {
      navigate('/auth/login/businesses');
    }
    if (showCancel) {
      showCancelAlert('Perubahan data bisnis partner telah dibatalkan.');
    }
  };

  const handleOpenEditModal = (owner: User, skipNavigate = false) => {
    setError('');
    setEditingOwnerId(owner.id!);
    setEditBusinessName(owner.businessName || '');
    setEditBusinessCategory(owner.businessCategory || 'Wedding Organizer (WO)');
    setEditBusinessAddress(owner.businessAddress || '');
    setEditBusinessCity(owner.businessCity || '');
    setEditOwnerName(owner.name || '');
    setEditOwnerPhone(owner.phone || '');
    setEditLogoUrl(owner.logoUrl || '');
    setEditClientCredit(owner.clientCredit !== undefined ? owner.clientCredit : (owner.clientQuota || 0));
    setEditEventCredit(owner.eventCredit !== undefined ? owner.eventCredit : (owner.eventQuota || 0));
    setEditAllowManualEvent(Boolean(owner.allowManualEvent ?? owner.eventManual));
    setEditWaGroup({
      waGroupId: owner.waGroupId || '',
      waGroupName: owner.waGroupName || '',
      waGroupReminderEnabled: Boolean(owner.waGroupReminderEnabled),
      waGroupReminderH3: owner.waGroupReminderH3 !== false,
      waGroupReminderH1: owner.waGroupReminderH1 !== false,
      waGroupReminderH0: owner.waGroupReminderH0 !== false,
      waGroupReminderTime: owner.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME,
      waGroupReminderH0Time: owner.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME,
    });
    setIsEditing(true);
    if (!skipNavigate && owner.id) {
      navigate(`/auth/login/businesses/${owner.id}/edit`);
    }
  };

  // Sync URL sub-routes (/businesses/add, /businesses/:businessId/edit) with modal state
  useEffect(() => {
    if (loading) return;
    const path = location.pathname;
    if (path.endsWith('/businesses/add')) {
      if (!isAdding) {
        handleOpenAddModal();
      }
    } else if (routeBusinessId && path.endsWith('/edit')) {
      const found = partnerBusinesses.find(u => u.id === routeBusinessId);
      if (found && (!isEditing || editingOwnerId !== found.id)) {
        handleOpenEditModal(found, true);
      }
    } else if (path === '/auth/login/businesses') {
      if (isAdding) setIsAdding(false);
      if (isEditing) setIsEditing(false);
    }
  }, [location.pathname, routeBusinessId, partnerBusinesses, loading]);

  const syncDownstreamUsersBusinessName = async (partnerId: string, ownerId: string, newBizName: string) => {
    try {
      const affectedUsers = users.filter(
        u =>
          u.id !== ownerId &&
          (u.partnerId === partnerId || u.partnerId === ownerId)
      );
      if (affectedUsers.length === 0) return;

      const batch = writeBatch(db);
      affectedUsers.forEach(u => {
        if (u.id) {
          batch.update(doc(db, 'users', u.id), {
            businessName: newBizName,
            updatedAt: serverTimestamp()
          });
        }
      });
      await batch.commit();
    } catch (e) {
      console.warn('Error syncing downstream users businessName:', e);
    }
  };

  const handleRegisterBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    setError('');

    if (!businessName.trim() || !businessAddress.trim()) {
      setError('Nama Usaha dan Alamat Lengkap Usaha wajib diisi untuk mendaftarkan Partner Guestly.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (registerMode === 'existing_owner') {
        if (!selectedExistingOwnerId) {
          throw new Error('Silakan pilih akun Owner/Partner yang akan didaftarkan.');
        }

        const existingOwner = users.find(u => u.id === selectedExistingOwnerId);
        if (!existingOwner) {
          throw new Error('Akun Owner tidak ditemukan.');
        }

        const partnerIdVal = existingOwner.partnerId || existingOwner.id!;
        const updatePayload: Partial<User> = {
          businessName: businessName.trim(),
          businessCategory: businessCategory.trim(),
          businessAddress: businessAddress.trim(),
          businessCity: businessCity.trim(),
          partnerId: partnerIdVal,
          phone: ownerPhone.trim() || existingOwner.phone || '',
          logoUrl: logoUrl.trim() || existingOwner.logoUrl || '',
          clientCredit: Number(clientCredit) || 0,
          clientQuota: Number(clientCredit) || 0,
          eventCredit: Number(eventCredit) || 0,
          eventQuota: Number(eventCredit) || 0,
          allowManualEvent: Boolean(allowManualEvent),
          eventManual: Boolean(allowManualEvent),
          waGroupId: addWaGroup.waGroupId.trim(),
          waGroupName: addWaGroup.waGroupName.trim(),
          waGroupReminderEnabled: Boolean(addWaGroup.waGroupReminderEnabled && addWaGroup.waGroupId.trim()),
          waGroupReminderH3: Boolean(addWaGroup.waGroupReminderH3),
          waGroupReminderH1: Boolean(addWaGroup.waGroupReminderH1),
          waGroupReminderH0: Boolean(addWaGroup.waGroupReminderH0),
          waGroupReminderTime: addWaGroup.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME,
          waGroupReminderH0Time: addWaGroup.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME,
          updatedAt: serverTimestamp()
        };

        await updateDoc(doc(db, 'users', selectedExistingOwnerId), updatePayload);
        await syncDownstreamUsersBusinessName(partnerIdVal, selectedExistingOwnerId, businessName.trim());

        await fetchData();
        setIsAdding(false);
        showAlert('Berhasil', `Partner "${businessName.trim()}" berhasil didaftarkan & diverifikasi!`, 'success');
      } else {
        if (!ownerName.trim() || !ownerEmail.trim() || ownerPassword.length < 6) {
          throw new Error('Nama PIC/Owner, Email, dan Password (minimal 6 karakter) wajib diisi.');
        }

        const uid = await createAuthUserSilently(ownerEmail.trim(), ownerPassword);

        const newOwnerDoc: User = {
          name: ownerName.trim(),
          email: ownerEmail.trim(),
          phone: ownerPhone.trim(),
          role: 'owner',
          partnerId: uid,
          clientId: null,
          businessName: businessName.trim(),
          businessCategory: businessCategory.trim(),
          businessAddress: businessAddress.trim(),
          businessCity: businessCity.trim(),
          logoUrl: logoUrl.trim() || undefined,
          clientCredit: Number(clientCredit) || 0,
          clientQuota: Number(clientCredit) || 0,
          eventCredit: Number(eventCredit) || 0,
          eventQuota: Number(eventCredit) || 0,
          allowManualEvent: Boolean(allowManualEvent),
          eventManual: Boolean(allowManualEvent),
          waGroupId: addWaGroup.waGroupId.trim(),
          waGroupName: addWaGroup.waGroupName.trim(),
          waGroupReminderEnabled: Boolean(addWaGroup.waGroupReminderEnabled && addWaGroup.waGroupId.trim()),
          waGroupReminderH3: Boolean(addWaGroup.waGroupReminderH3),
          waGroupReminderH1: Boolean(addWaGroup.waGroupReminderH1),
          waGroupReminderH0: Boolean(addWaGroup.waGroupReminderH0),
          waGroupReminderTime: addWaGroup.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME,
          waGroupReminderH0Time: addWaGroup.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME,
          hideServiceInfo: false,
          createdBy: appUser.id,
          createdByName: `${appUser.name || appUser.email} (Super Admin)`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'users', uid), newOwnerDoc);

        if (ownerPhone.trim()) {
          import('../lib/fonnte').then(({ sendFonnteMessage }) => {
            const loginUrl = `${window.location.origin}/auth/login`;
            const message = `🏢 *Registrasi Resmi Partner Guestly*

Halo Kak *${ownerName.trim()}*,

Selamat! Usaha Anda telah terdaftar resmi sebagai *Partner Guestly*:

🏢 *Nama Usaha* : ${businessName.trim()}
📍 *Alamat* : ${businessAddress.trim()}${businessCity.trim() ? `, ${businessCity.trim()}` : ''}
📧 *Email Login* : ${ownerEmail.trim()}
🔑 *Password* : ${ownerPassword}
👤 *Role* : Owner (Partner Guestly)
🌐 *Login* : ${loginUrl}

Anda kini dapat membuat dan mengelola acara serta menambahkan tim Admin & Staff lapangan.`;
            sendFonnteMessage(null, ownerPhone.trim(), message);
          });
        }

        await fetchData();
        setIsAdding(false);
        navigate('/auth/login/businesses', { replace: true });
        showAlert('Berhasil', `Partner Guestly "${businessName.trim()}" beserta akun Owner berhasil didaftarkan!`, 'success');
      }
    } catch (err: any) {
      console.error('Error registering partner business:', err);
      setError(err.message || 'Gagal mendaftarkan bisnis Partner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEditBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOwnerId) return;
    setError('');

    if (!editBusinessName.trim() || !editBusinessAddress.trim()) {
      setError('Nama Usaha dan Alamat Lengkap Usaha wajib diisi agar Partner dapat membuat acara.');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetOwner = users.find(u => u.id === editingOwnerId);
      const partnerIdVal = targetOwner?.partnerId || editingOwnerId;

      const updatePayload: Partial<User> = {
        name: editOwnerName.trim(),
        phone: editOwnerPhone.trim(),
        businessName: editBusinessName.trim(),
        businessCategory: editBusinessCategory.trim(),
        businessAddress: editBusinessAddress.trim(),
        businessCity: editBusinessCity.trim(),
        partnerId: partnerIdVal,
        logoUrl: editLogoUrl.trim(),
        clientCredit: Number(editClientCredit) || 0,
        clientQuota: Number(editClientCredit) || 0,
        eventCredit: Number(editEventCredit) || 0,
        eventQuota: Number(editEventCredit) || 0,
        allowManualEvent: Boolean(editAllowManualEvent),
        eventManual: Boolean(editAllowManualEvent),
        waGroupId: editWaGroup.waGroupId.trim(),
        waGroupName: editWaGroup.waGroupName.trim(),
        waGroupReminderEnabled: Boolean(editWaGroup.waGroupReminderEnabled && editWaGroup.waGroupId.trim()),
        waGroupReminderH3: Boolean(editWaGroup.waGroupReminderH3),
        waGroupReminderH1: Boolean(editWaGroup.waGroupReminderH1),
        waGroupReminderH0: Boolean(editWaGroup.waGroupReminderH0),
        waGroupReminderTime: editWaGroup.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME,
        waGroupReminderH0Time: editWaGroup.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'users', editingOwnerId), updatePayload);
      await syncDownstreamUsersBusinessName(partnerIdVal, editingOwnerId, editBusinessName.trim());

      await fetchData();
      setIsEditing(false);
      navigate('/auth/login/businesses', { replace: true });
      showAlert('Berhasil', `Data Partner "${editBusinessName.trim()}" berhasil diperbarui & disinkronkan!`, 'success');
    } catch (err: any) {
      console.error('Error updating business:', err);
      setError(err.message || 'Gagal memperbarui data bisnis.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBusiness = async (owner: User) => {
    const label = owner.businessName || owner.name;
    const confirmed = await showConfirm(
      `Yakin ingin menghapus akun Partner / Bisnis "${label}"? Pastikan tidak ada acara aktif yang masih berjalan.`
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'users', owner.id!));
      setUsers(users.filter(u => u.id !== owner.id));
      showAlert('Berhasil', 'Data Partner berhasil dihapus.', 'success');
    } catch (err) {
      console.error('Error deleting business:', err);
      showAlert('Gagal', 'Gagal menghapus data Partner.', 'error');
    }
  };

  if (appUser?.role !== 'superadmin') {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
        <Shield className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-900">Akses Terbatas</h2>
        <p className="text-gray-600 mt-1">
          Halaman Manajemen Bisnis / Partner Guestly hanya dapat diakses oleh Super Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Partner / Owner</div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono text-gray-900">{stats.total}</span>
            <span className="text-[11px] text-indigo-700 font-semibold bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 rounded-full">Mitra</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Terverifikasi</div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-700">{stats.verified}</span>
            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Event Aktif
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Belum Lengkap</div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono text-amber-700">{stats.incomplete}</span>
            <span className="text-[11px] text-amber-800 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Terkunci
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Acara Partner</div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono text-gray-900">{stats.totalPartnerEvents}</span>
            <span className="text-[11px] text-gray-600 font-semibold bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Acara</span>
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
              placeholder="Cari nama usaha, alamat, kota, email, atau nama owner..."
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
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'verified' | 'incomplete')}
              className="h-8.5 px-2.5 text-xs bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">Semua Status ({stats.total})</option>
              <option value="verified">Terverifikasi Lengkap ({stats.verified})</option>
              <option value="incomplete">Belum Lengkap Alamat ({stats.incomplete})</option>
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

      {/* Primary Action Bar (Left-Aligned between Filter Box & Table Box) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Daftarkan Partner / Bisnis Baru</span>
        </button>
      </div>

      {/* Box 2: Businesses Table Container */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : filteredBusinesses.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-2">
            <Building2 className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">
              {hasActiveFilters
                ? 'Tidak ada data Partner / Bisnis yang cocok dengan pencarian atau filter.'
                : 'Belum ada data Partner / Bisnis yang terdaftar.'}
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
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                      No
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Nama Usaha / Partner
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Alamat Lengkap &amp; Kontak
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Owner / PIC
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Tim, Klien &amp; Acara
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status Verifikasi
                    </th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedBusinesses.map(({ owner, isVerified, adminCount, staffCount, clientCount, eventCount }, index) => {
                    const clientQuotaVal = owner.clientCredit !== undefined ? owner.clientCredit : (owner.clientQuota || 0);
                    const eventQuotaVal = owner.eventCredit !== undefined ? owner.eventCredit : (owner.eventQuota || 0);
                    const isManualBypass = Boolean(owner.allowManualEvent ?? owner.eventManual);

                    return (
                      <tr key={owner.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs font-mono text-gray-500">
                          {startIndex + index + 1}
                        </td>

                        {/* Nama Usaha */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-3">
                            {owner.logoUrl ? (
                              <img
                                src={owner.logoUrl}
                                alt={owner.businessName || owner.name}
                                className="w-9 h-9 rounded-lg object-contain border border-gray-200 bg-white shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                                <Building2 className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {owner.businessName || <span className="text-red-600 italic">Nama Usaha Belum Diisi</span>}
                              </div>
                              <span className="inline-block mt-0.5 text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                                {owner.businessCategory || 'Wedding Organizer (WO)'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Alamat Lengkap & Kontak */}
                        <td className="px-4 py-3.5 max-w-xs">
                          {owner.businessAddress ? (
                            <div className="space-y-1">
                              <div className="text-xs text-gray-800 flex items-start gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                                <span>
                                  {owner.businessAddress}
                                  {owner.businessCity ? `, ${owner.businessCity}` : ''}
                                </span>
                              </div>
                              {owner.phone && (
                                <div className="text-xs text-gray-500 flex items-center gap-1.5">
                                  <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                                  <span>{owner.phone}</span>
                                </div>
                              )}
                              {owner.waGroupReminderEnabled && owner.waGroupId?.trim() && (
                                <div
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded w-fit"
                                  title={`ID Grup: ${owner.waGroupId} · H-3/H-1 ${owner.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME} WIB · Hari H ${owner.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME} WIB`}
                                >
                                  <Users className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                  <span className="truncate max-w-[180px]">
                                    Grup WA: {owner.waGroupName?.trim() || 'Aktif'}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-xs font-medium">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              Alamat Belum Diisi
                            </div>
                          )}
                        </td>

                        {/* Owner / PIC */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">{owner.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 text-gray-400" />
                            {owner.email}
                          </div>
                          <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            {getRoleLabel(owner.role)}
                          </span>
                        </td>

                        {/* Statistik Naungan */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1.5 mb-1">
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                              <Users className="w-3 h-3" /> {adminCount} Admin, {staffCount} Staff
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {clientCount} Client (Kuota: {isManualBypass ? '∞' : clientQuotaVal})
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                              <CalendarDays className="w-3 h-3" /> {eventCount} Event (Kuota: {isManualBypass ? '∞' : eventQuotaVal})
                            </span>
                          </div>
                        </td>

                        {/* Status Verifikasi & Create Event */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isVerified ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Terverifikasi
                              </span>
                              <div className="text-[11px] text-emerald-700 font-medium pl-1">
                                Create Event: Aktif
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                <Lock className="w-3.5 h-3.5" /> Belum Lengkap
                              </span>
                              <div className="text-[11px] text-rose-600 font-medium pl-1">
                                Create Event: Terkunci
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Aksi */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(owner)}
                              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                                isVerified
                                  ? 'text-indigo-600 hover:bg-indigo-50'
                                  : 'text-amber-600 hover:bg-amber-50'
                              }`}
                              title={isVerified ? 'Edit Bisnis Partner' : 'Lengkapi & Verifikasi Partner'}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBusiness(owner)}
                              className="p-1.5 rounded-full text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Hapus Partner"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                  <strong className="text-gray-900">{filteredBusinesses.length}</strong> partner
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

      {/* Modal: Daftarkan Partner / Bisnis Baru */}
      <Modal
        isOpen={isAdding}
        onClose={closeAddBusinessModal}
        title="Daftarkan Partner / Bisnis Guestly Baru"
      >
        <form onSubmit={handleRegisterBusiness} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200">{error}</div>}

          {/* Mode Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => setRegisterMode('new_owner')}
              className={`py-2 px-3 rounded-md text-xs font-bold transition-colors ${
                registerMode === 'new_owner'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              + Buat Akun Owner & Bisnis Baru
            </button>
            <button
              type="button"
              onClick={() => setRegisterMode('existing_owner')}
              className={`py-2 px-3 rounded-md text-xs font-bold transition-colors ${
                registerMode === 'existing_owner'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Lengkapi Akun Owner yang Sudah Ada
            </button>
          </div>

          {registerMode === 'existing_owner' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pilih Akun Owner / Partner *
              </label>
              <select
                required
                value={selectedExistingOwnerId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedExistingOwnerId(id);
                  const found = partnerBusinesses.find(u => u.id === id);
                  if (found) {
                    setBusinessName(found.businessName || '');
                    setBusinessAddress(found.businessAddress || '');
                    setBusinessCity(found.businessCity || '');
                    setOwnerPhone(found.phone || '');
                    setClientCredit(found.clientCredit ?? found.clientQuota ?? 0);
                    setEventCredit(found.eventCredit ?? found.eventQuota ?? 0);
                    setAllowManualEvent(Boolean(found.allowManualEvent ?? found.eventManual));
                    setAddWaGroup({
                      waGroupId: found.waGroupId || '',
                      waGroupName: found.waGroupName || '',
                      waGroupReminderEnabled: Boolean(found.waGroupReminderEnabled),
                      waGroupReminderH3: found.waGroupReminderH3 !== false,
                      waGroupReminderH1: found.waGroupReminderH1 !== false,
                      waGroupReminderH0: found.waGroupReminderH0 !== false,
                      waGroupReminderTime: found.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME,
                      waGroupReminderH0Time: found.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME,
                    });
                  }
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white font-medium"
              >
                <option value="" disabled>-- Pilih Akun Owner --</option>
                {partnerBusinesses.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) — {u.businessName || 'Belum ada Nama Usaha'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Identitas Bisnis / Usaha */}
          <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
              <Building2 className="w-4 h-4 text-amber-600" />
              Data Resmi Usaha Partner (Wajib Diisi Super Admin)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nama Usaha / Brand Partner *
                </label>
                <input
                  required
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                  placeholder="Contoh: Bintang Wedding Organizer"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Kategori Usaha
                </label>
                <select
                  value={businessCategory}
                  onChange={e => setBusinessCategory(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                >
                  <option value="Wedding Organizer (WO)">Wedding Organizer (WO)</option>
                  <option value="Event Organizer (EO)">Event Organizer (EO)</option>
                  <option value="Digital Invitation / Vendor">Digital Invitation / Vendor</option>
                  <option value="Corporate / Agensi">Corporate / Agensi</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Alamat Lengkap Usaha *
              </label>
              <textarea
                required
                rows={2}
                value={businessAddress}
                onChange={e => setBusinessAddress(e.target.value)}
                className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                placeholder="Contoh: Jl. Merdeka No. 45, Kec. Sumur Bandung"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Kota / Kabupaten *
                </label>
                <input
                  required
                  type="text"
                  value={businessCity}
                  onChange={e => setBusinessCity(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                  placeholder="Contoh: Bandung"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  No. WhatsApp Bisnis *
                </label>
                <input
                  required
                  type="tel"
                  value={ownerPhone}
                  onChange={e => setOwnerPhone(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                  placeholder="081234567890"
                />
              </div>
            </div>
          </div>

          {/* Data Akun Login Owner (Jika membuat Owner baru) */}
          {registerMode === 'new_owner' && (
            <div className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Akun Login Owner / Penanggung Jawab (PIC)
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nama Lengkap Owner *</label>
                <input
                  required
                  type="text"
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Contoh: Budi Santoso"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email Login *</label>
                  <input
                    required
                    type="email"
                    value={ownerEmail}
                    onChange={e => setOwnerEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="owner@bisniswo.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Password Login *</label>
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={ownerPassword}
                    onChange={e => setOwnerPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Min. 6 karakter"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Pengaturan Kuota Partner */}
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              Kuota Layanan Partner
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kuota Client</label>
                <input
                  type="number"
                  min="0"
                  value={clientCredit}
                  onChange={e => setClientCredit(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kuota Event</label>
                <input
                  type="number"
                  min="0"
                  value={eventCredit}
                  onChange={e => setEventCredit(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-indigo-100 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-800">
                Event Manual (Bypass Kuota Tanpa Batas)
              </label>
              <input
                type="checkbox"
                checked={allowManualEvent}
                onChange={e => setAllowManualEvent(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600 border-gray-300"
              />
            </div>
          </div>

          {/* Pengaturan Grup WhatsApp Tim (H-3 & H-1) */}
          <WaGroupSettingsPanel
            value={addWaGroup}
            onChange={setAddWaGroup}
            vendorFonnteToken={
              registerMode === 'existing_owner'
                ? partnerBusinesses.find(u => u.id === selectedExistingOwnerId)?.fonnteToken || null
                : null
            }
            businessName={businessName}
            compact
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => closeAddBusinessModal(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan...' : 'Daftarkan & Verifikasi Partner'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit / Verifikasi Bisnis Partner */}
      <Modal
        isOpen={isEditing}
        onClose={closeEditBusinessModal}
        title="Edit & Verifikasi Data Bisnis Partner"
      >
        <form onSubmit={handleSaveEditBusiness} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200">{error}</div>}

          <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
              <Building2 className="w-4 h-4 text-amber-600" />
              Identitas Resmi Partner Guestly
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nama Usaha / Brand Partner *
                </label>
                <input
                  required
                  type="text"
                  value={editBusinessName}
                  onChange={e => setEditBusinessName(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                  placeholder="Contoh: Ki Mi Ko Pager Ayu"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Kategori Usaha
                </label>
                <select
                  value={editBusinessCategory}
                  onChange={e => setEditBusinessCategory(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                >
                  <option value="Wedding Organizer (WO)">Wedding Organizer (WO)</option>
                  <option value="Event Organizer (EO)">Event Organizer (EO)</option>
                  <option value="Digital Invitation / Vendor">Digital Invitation / Vendor</option>
                  <option value="Corporate / Agensi">Corporate / Agensi</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Alamat Lengkap Usaha *
              </label>
              <textarea
                required
                rows={2}
                value={editBusinessAddress}
                onChange={e => setEditBusinessAddress(e.target.value)}
                className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                placeholder="Masukkan alamat lengkap kantor / operasional usaha..."
              />
              <p className="text-[11px] text-amber-800 mt-1">
                Wajib diisi agar Partner ini berstatus Terverifikasi dan diizinkan membuat acara (Create Event).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Kota / Kabupaten *
                </label>
                <input
                  required
                  type="text"
                  value={editBusinessCity}
                  onChange={e => setEditBusinessCity(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                  placeholder="Contoh: Bandung"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  No. WhatsApp Bisnis
                </label>
                <input
                  type="tel"
                  value={editOwnerPhone}
                  onChange={e => setEditOwnerPhone(e.target.value)}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white text-sm"
                  placeholder="081234567890"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Owner / PIC *</label>
              <input
                required
                type="text"
                value={editOwnerName}
                onChange={e => setEditOwnerName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">URL Logo Usaha (Opsional)</label>
              <input
                type="text"
                value={editLogoUrl}
                onChange={e => setEditLogoUrl(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Kuota */}
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-900">
              Pengaturan Kuota Partner
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kuota Client</label>
                <input
                  type="number"
                  min="0"
                  value={editClientCredit}
                  onChange={e => setEditClientCredit(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kuota Event</label>
                <input
                  type="number"
                  min="0"
                  value={editEventCredit}
                  onChange={e => setEditEventCredit(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-indigo-100 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-800">
                Event Manual (Bypass Kuota Tanpa Batas)
              </label>
              <input
                type="checkbox"
                checked={editAllowManualEvent}
                onChange={e => setEditAllowManualEvent(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600 border-gray-300"
              />
            </div>
          </div>

          {/* Pengaturan Grup WhatsApp Tim (H-3 & H-1) */}
          <WaGroupSettingsPanel
            value={editWaGroup}
            onChange={setEditWaGroup}
            vendorFonnteToken={users.find(u => u.id === editingOwnerId)?.fonnteToken || null}
            businessName={editBusinessName}
            compact
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => closeEditBusinessModal(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan & Sinkronkan Bisnis'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
