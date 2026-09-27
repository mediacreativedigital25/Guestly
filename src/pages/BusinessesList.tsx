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
  Lock
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { showAlert, showConfirm, showCancelAlert } from '../lib/alerts';
import { getRoleLabel, isPartnerBusinessRegistered } from '../lib/utils';

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <p className="text-sm text-gray-500">
            Pendaftaran dan verifikasi resmi identitas usaha (Nama Usaha & Alamat Lengkap) untuk Partner Guestly (WO / EO / Agensi).
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Daftarkan Partner / Bisnis Baru
        </button>
      </div>

      {/* Info Banner Explaining End-User vs Partner Guestly */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0 mt-0.5">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-xs text-gray-700 space-y-1">
            <div className="font-bold text-sm text-indigo-950">
              Kebijakan Verifikasi Partner Guestly (Pendaftaran Terpusat oleh Super Admin)
            </div>
            <p>
              • <strong>End-User (Mandiri):</strong> Klien pribadi yang menggunakan Guestly langsung di bawah <em>Guestly Official</em> tidak wajib memiliki data usaha.
            </p>
            <p>
              • <strong>Partner Guestly (Owner / WO / EO):</strong> Wajib didaftarkan <strong>Nama Usaha & Alamat Lengkap</strong> oleh Super Admin di halaman ini sebelum akun Partner maupun Admin-nya diizinkan membuat acara baru (<em>Create Event</em>).
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Akun Partner / Owner</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900">{stats.total}</span>
            <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">Mitra Bisnis</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs">
          <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Partner Terverifikasi Lengkap</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-700">{stats.verified}</span>
            <span className="text-xs text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
              Create Event Aktif
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs">
          <div className="text-xs font-medium text-amber-700 uppercase tracking-wider">Data Usaha Belum Lengkap</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-700">{stats.incomplete}</span>
            <span className="text-xs text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
              Terkunci Create Event
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Acara Partner</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900">{stats.totalPartnerEvents}</span>
            <span className="text-xs text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded-full">Acara Dikelola</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama usaha, alamat, kota, atau nama owner..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white font-medium"
          >
            <option value="all">Semua Status Partner ({stats.total})</option>
            <option value="verified">✅ Terverifikasi Lengkap ({stats.verified})</option>
            <option value="incomplete">⚠️ Belum Lengkap Alamat ({stats.incomplete})</option>
          </select>
        </div>
      </div>

      {/* Businesses Table */}
      {loading ? (
        <div className="flex justify-center p-10 bg-white rounded-xl border border-gray-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : filteredBusinesses.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-gray-200">
          <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Belum ada data Partner / Bisnis yang sesuai filter.</p>
          <p className="text-sm text-gray-500 mt-1">
            Klik tombol <strong>Daftarkan Partner / Bisnis Baru</strong> untuk mendaftarkan usaha mitra Guestly.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow-xs rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Nama Usaha / Partner
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Alamat Lengkap & Kontak
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Owner / Penanggung Jawab
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Tim, Klien & Acara
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status Verifikasi & Akses
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBusinesses.map(({ owner, isVerified, adminCount, staffCount, clientCount, eventCount }) => {
                  const clientQuotaVal = owner.clientCredit !== undefined ? owner.clientCredit : (owner.clientQuota || 0);
                  const eventQuotaVal = owner.eventCredit !== undefined ? owner.eventCredit : (owner.eventQuota || 0);
                  const isManualBypass = Boolean(owner.allowManualEvent ?? owner.eventManual);

                  return (
                    <tr key={owner.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Nama Usaha */}
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          {owner.logoUrl ? (
                            <img
                              src={owner.logoUrl}
                              alt={owner.businessName || owner.name}
                              className="w-10 h-10 rounded-lg object-contain border border-gray-200 bg-white shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
                              <Building2 className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-bold text-gray-900">
                              {owner.businessName || <span className="text-red-600 italic">Nama Usaha Belum Diisi</span>}
                            </div>
                            <span className="inline-block mt-0.5 text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                              {owner.businessCategory || 'Wedding Organizer (WO)'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Alamat Lengkap & Kontak */}
                      <td className="px-5 py-4 max-w-xs">
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
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 text-xs font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Alamat Usaha Belum Didaftarkan
                          </div>
                        )}
                      </td>

                      {/* Owner / PIC */}
                      <td className="px-5 py-4 whitespace-nowrap">
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
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <Users className="w-3 h-3" /> {adminCount} Admin, {staffCount} Staff
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {clientCount} Client (Kuota: {isManualBypass ? '∞' : clientQuotaVal})
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                            <CalendarDays className="w-3 h-3" /> {eventCount} Event (Kuota: {isManualBypass ? '∞' : eventQuotaVal})
                          </span>
                        </div>
                      </td>

                      {/* Status Verifikasi & Create Event */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {isVerified ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Partner Terverifikasi
                            </span>
                            <div className="text-[11px] text-emerald-700 font-medium pl-1">
                              Create Event: Diizinkan
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              <Lock className="w-3.5 h-3.5" /> Belum Terdaftar Lengkap
                            </span>
                            <div className="text-[11px] text-red-600 font-medium pl-1">
                              Create Event: Terkunci
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="px-5 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEditModal(owner)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              isVerified
                                ? 'text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100'
                                : 'text-white bg-amber-600 hover:bg-amber-700 shadow-xs'
                            }`}
                          >
                            <Edit className="w-3.5 h-3.5" />
                            {isVerified ? 'Edit Bisnis' : 'Lengkapi & Verifikasi'}
                          </button>
                          <button
                            onClick={() => handleDeleteBusiness(owner)}
                            className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors"
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
        </div>
      )}

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
