import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, doc, deleteDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, createAuthUserSilently } from '../lib/firebase';
import { User, Role, StaffType, EventRecord } from '../types';
import { Shield, Trash2, Edit, Plus, CalendarDays, ScanLine, Gift, CheckSquare, Square } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { Modal } from '../components/Modal';
import { showAlert, showConfirm } from '../lib/alerts';
import { getRoleLabel, canUserAccessEvent } from '../lib/utils';

export default function UsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('staff');
  const [newUserStaffType, setNewUserStaffType] = useState<StaffType>('checkin');
  const [newUserAssignedEvents, setNewUserAssignedEvents] = useState<string[]>([]);
  const [newUserPartnerId, setNewUserPartnerId] = useState('');
  const [newUserClientId, setNewUserClientId] = useState('');
  const [newUserLogoUrl, setNewUserLogoUrl] = useState('');
  const [newUserClientCredit, setNewUserClientCredit] = useState<number>(0);
  const [newUserEventCredit, setNewUserEventCredit] = useState<number>(0);
  const [newUserAllowManualEvent, setNewUserAllowManualEvent] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Edit state
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserBusinessName, setEditUserBusinessName] = useState('');
  const [editUserLogoUrl, setEditUserLogoUrl] = useState('');
  const [editUserRole, setEditUserRole] = useState<Role>('client');
  const [editUserStaffType, setEditUserStaffType] = useState<StaffType>('checkin');
  const [editUserAssignedEvents, setEditUserAssignedEvents] = useState<string[]>([]);
  const [editUserClientCredit, setEditUserClientCredit] = useState<number>(0);
  const [editUserEventCredit, setEditUserEventCredit] = useState<number>(0);
  const [editUserAllowManualEvent, setEditUserAllowManualEvent] = useState<boolean>(false);

  const { appUser } = useAuth();
  const { settings } = useSettings();

  const canManageUsers = appUser && ['superadmin', 'owner', 'admin'].includes(appUser.role);

  useEffect(() => {
    const fetchUsersAndEvents = async () => {
      if (!canManageUsers) return;

      try {
        const { getDocs, limit } = await import('firebase/firestore');
        const q = query(collection(db, 'users'), limit(100));
        const [snapshot, eventsSnap] = await Promise.all([
          getDocs(q),
          getDocs(collection(db, 'events'))
        ]);
        let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as User }));
        if (appUser?.role === 'admin') {
          // Admin focuses on managing operational staff and viewing team members
          data = data.filter(u => u.role !== 'superadmin');
        }
        setUsers(data);

        const evList = eventsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as EventRecord))
          .filter(ev => canUserAccessEvent(appUser, ev.id));
        setEvents(evList);

        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === 100);
        setLoading(false);
      } catch (error) {
        console.error('Error setup listeners users:', error);
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
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as User }));
      setUsers(prev => [...prev, ...data]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more users", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async (userId: string) => {
    const confirmed = await showConfirm('Yakin ingin menghapus pengguna ini?');
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        setUsers(users.filter(u => u.id !== userId));
        showAlert('Berhasil', 'Pengguna berhasil dihapus!', 'success');
      } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('Gagal', 'Gagal menghapus pengguna.', 'error');
      }
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const confirmed = await showConfirm(`Yakin ingin mengubah role pengguna ini menjadi ${getRoleLabel(newRole)}?`);
    if (!confirmed) {
      setUsers([...users]);
      return;
    }
    
    try {
      const updates: any = { role: newRole, updatedAt: serverTimestamp() };
      if (newRole === 'staff') {
        updates.staffType = 'checkin';
      }
      await updateDoc(doc(db, 'users', userId), updates);
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any, staffType: newRole === 'staff' ? (u.staffType || 'checkin') : u.staffType } : u));
      showAlert('Berhasil', 'Role berhasil diperbarui!', 'success');
    } catch (error) {
      console.error('Error updating role:', error);
      showAlert('Gagal', 'Gagal memperbarui role.', 'error');
    }
  };

  const toggleEventSelection = (eventId: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (list.includes(eventId)) {
      setList(list.filter(id => id !== eventId));
    } else {
      setList([...list, eventId]);
    }
  };

  const handleOpenEdit = (user: User) => {
    setEditingUserId(user.id!);
    setEditUserName(user.name || '');
    setEditUserPhone(user.phone || '');
    setEditUserBusinessName(user.businessName || '');
    setEditUserLogoUrl(user.logoUrl || '');
    setEditUserRole(user.role);
    setEditUserStaffType(user.staffType || 'checkin');
    setEditUserAssignedEvents(Array.isArray(user.assignedEventIds) ? user.assignedEventIds : []);
    setEditUserClientCredit(user.clientCredit !== undefined ? user.clientCredit : (user.clientQuota || 0));
    setEditUserEventCredit(user.eventCredit !== undefined ? user.eventCredit : (user.eventQuota || 0));
    setEditUserAllowManualEvent(Boolean(user.allowManualEvent ?? user.eventManual));
    setEditUserPassword('');
    setIsEditingUser(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (editUserRole === 'staff' && editUserAssignedEvents.length === 0) {
        throw new Error('Petugas Staff wajib ditugaskan minimal ke 1 acara agar dapat membuka Scanner/Souvenir.');
      }

      const updateData: Partial<User> = {
        name: editUserName,
        phone: editUserPhone,
        role: editUserRole,
        staffType: editUserRole === 'staff' ? editUserStaffType : undefined,
        assignedEventIds: (editUserRole === 'staff' || editUserRole === 'admin') ? editUserAssignedEvents : [],
        clientCredit: Number(editUserClientCredit) || 0,
        clientQuota: Number(editUserClientCredit) || 0,
        eventCredit: Number(editUserEventCredit) || 0,
        eventQuota: Number(editUserEventCredit) || 0,
        allowManualEvent: Boolean(editUserAllowManualEvent),
        eventManual: Boolean(editUserAllowManualEvent),
        updatedAt: serverTimestamp()
      };

      if (editUserRole === 'partner') {
        updateData.businessName = editUserBusinessName;
        updateData.logoUrl = editUserLogoUrl;
      }

      if (editUserPassword && editUserPassword.trim().length > 0) {
        if (editUserPassword.trim().length < 6) {
          throw new Error('Password baru minimal 6 karakter.');
        }
        (updateData as any)._password = editUserPassword.trim();
      }

      await updateDoc(doc(db, 'users', editingUserId), updateData);
      
      setUsers(users.map(u => u.id === editingUserId ? { ...u, ...updateData } : u));
      setIsEditingUser(false);
      showAlert('Berhasil', 'Data pengguna & penugasan berhasil diperbarui!', 'success');
    } catch (err: any) {
      console.error('Error editing user:', err);
      setError(err.message || 'Gagal memperbarui user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (newUserPassword.length < 6) {
        throw new Error('Password minimal 6 karakter.');
      }

      if (newUserRole === 'staff' && newUserAssignedEvents.length === 0) {
        throw new Error('Silakan centang minimal 1 Acara yang ditugaskan untuk petugas Staff ini.');
      }

      // 1. Create User in Auth via REST API
      const uid = await createAuthUserSilently(newUserEmail, newUserPassword);

      // 2. Add user document
      const newUserDoc: User = {
        name: newUserName,
        email: newUserEmail,
        phone: newUserPhone,
        role: newUserRole,
        staffType: newUserRole === 'staff' ? newUserStaffType : undefined,
        assignedEventIds: (newUserRole === 'staff' || newUserRole === 'admin') ? newUserAssignedEvents : [],
        partnerId: newUserPartnerId || null,
        clientId: newUserClientId || null,
        logoUrl: newUserRole === 'partner' ? newUserLogoUrl : undefined,
        clientCredit: Number(newUserClientCredit) || 0,
        clientQuota: Number(newUserClientCredit) || 0,
        eventCredit: Number(newUserEventCredit) || 0,
        eventQuota: Number(newUserEventCredit) || 0,
        allowManualEvent: Boolean(newUserAllowManualEvent),
        eventManual: Boolean(newUserAllowManualEvent),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', uid), newUserDoc);

      setUsers([{ id: uid, ...newUserDoc }, ...users]);
      
      // 3. Send WhatsApp Notification
      if (newUserPhone) {
        import('../lib/fonnte').then(({ sendFonnteMessage }) => {
          const loginUrl = `${window.location.origin}/auth/login`;
          const roleLabel = getRoleLabel(newUserRole, newUserRole === 'staff' ? newUserStaffType : undefined);
          const message = `🔐 *Informasi Akun Guestly*

Halo Kak *${newUserName}*,

Akun Anda telah terdaftar di sistem Guestly sebagai *${roleLabel}*. Berikut informasi login Anda:

📧 *Email* : ${newUserEmail}
🔑 *Password* : ${newUserPassword}
👤 *Role* : ${roleLabel}
🌐 *Login* : ${loginUrl}

Mohon simpan informasi akun ini dengan baik dan jangan membagikannya kepada pihak lain.`;
          sendFonnteMessage(null, newUserPhone, message);
        });
      }

      // Reset form
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserPhone('');
      setNewUserRole(appUser?.role === 'admin' ? 'staff' : 'staff');
      setNewUserStaffType('checkin');
      setNewUserAssignedEvents([]);
      setNewUserPartnerId('');
      setNewUserClientId('');
      setNewUserLogoUrl('');
      setNewUserClientCredit(0);
      setNewUserEventCredit(0);
      setNewUserAllowManualEvent(false);
      setIsAddingUser(false);
      showAlert('Berhasil', 'User / Petugas berhasil ditambahkan!', 'success');
    } catch (err: any) {
      console.error('Error adding user:', err);
      setError(err.message || 'Gagal menambahkan user');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManageUsers) {
    return <div className="p-8"><div className="bg-red-50 text-red-700 p-4 rounded-md">Akses Ditolak</div></div>;
  }

  const renderEventAssignmentSelector = (
    selectedIds: string[],
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>,
    role: Role
  ) => (
    <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4 text-emerald-600" />
          Penugasan Acara ({selectedIds.length} dipilih)
        </label>
        {events.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (selectedIds.length === events.length) setSelectedIds([]);
              else setSelectedIds(events.map(e => e.id!));
            }}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline"
          >
            {selectedIds.length === events.length ? 'Batal Pilih Semua' : 'Pilih Semua Acara'}
          </button>
        )}
      </div>
      <p className="text-xs text-emerald-800 leading-relaxed">
        {role === 'staff'
          ? 'Wajib: Petugas Staff hanya bisa membuka dan melakukan scan pada acara yang dicentang di bawah ini (acara lain otomatis disembunyikan).'
          : 'Opsional untuk Admin: Centang acara tertentu jika ingin membatasi Admin hanya pada acara tersebut, atau biarkan kosong untuk akses semua acara.'}
      </p>
      <div className="max-h-44 overflow-y-auto space-y-1.5 bg-white p-2.5 rounded-lg border border-emerald-100">
        {events.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">Belum ada acara yang tersedia.</p>
        ) : (
          events.map(ev => {
            const checked = selectedIds.includes(ev.id!);
            return (
              <div
                key={ev.id}
                onClick={() => toggleEventSelection(ev.id!, selectedIds, setSelectedIds)}
                className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                  checked
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-gray-50/60 border-gray-100 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {checked ? (
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen User & Petugas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Kelola akun Super Admin, Owner, Admin, serta penugasan khusus Staff Scan Kehadiran & Staff Souvenir per acara.
          </p>
        </div>
        <button
          onClick={() => {
            setError('');
            if (appUser?.role === 'admin') setNewUserRole('staff');
            setIsAddingUser(true);
          }} 
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" /> Tambah User / Petugas
        </button>
      </div>

      <Modal isOpen={isAddingUser} onClose={() => setIsAddingUser(false)} title="Tambah User / Petugas Baru">
        <form onSubmit={handleAddUser} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap / Nama Meja Petugas</label>
            <input required value={newUserName} onChange={e => setNewUserName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Contoh: Rina - Gate VIP 1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Login</label>
              <input required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} type="email" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="petugas1@guestly.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">No. WhatsApp / Telepon</label>
              <input value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} type="tel" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="08123456789 (Opsional)" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input required minLength={6} value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} type="password" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Min. 6 karakter" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role / Jabatan</label>
            <select 
              value={newUserRole} 
              onChange={e => setNewUserRole(e.target.value as Role)} 
              className="w-full border border-gray-300 rounded-md px-3 py-2 font-medium text-gray-900"
            >
              <option value="staff">Staff Lapangan (Scan Kehadiran / Souvenir)</option>
              {appUser?.role !== 'admin' && <option value="admin">Admin Operasional</option>}
              {appUser?.role !== 'admin' && <option value="owner">Owner</option>}
              {appUser?.role !== 'admin' && <option value="client">Client (Pemilik Acara)</option>}
              {appUser?.role !== 'admin' && <option value="partner">Partner (Vendor White-label)</option>}
              {appUser?.role === 'superadmin' && <option value="superadmin">Super Admin</option>}
            </select>
          </div>

          {newUserRole === 'staff' && (
            <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-indigo-900">
                Spesialisasi Fitur Staff (Mode Fokus)
              </label>
              <div className="grid grid-cols-1 gap-2">
                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${newUserStaffType === 'checkin' ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20' : 'bg-white/60 border-gray-200'}`}>
                  <input type="radio" name="newStaffType" checked={newUserStaffType === 'checkin'} onChange={() => setNewUserStaffType('checkin')} className="mt-1 text-indigo-600" />
                  <div>
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <ScanLine className="w-3.5 h-3.5 text-blue-600" /> Staff Scan Kehadiran (Gate Masuk)
                    </div>
                    <p className="text-[11px] text-gray-500">Hanya menampilkan fitur Scanner Check-in Kehadiran & Daftar Hadir.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${newUserStaffType === 'souvenir' ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20' : 'bg-white/60 border-gray-200'}`}>
                  <input type="radio" name="newStaffType" checked={newUserStaffType === 'souvenir'} onChange={() => setNewUserStaffType('souvenir')} className="mt-1 text-emerald-600" />
                  <div>
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-emerald-600" /> Staff Souvenir (Loket Penukaran)
                    </div>
                    <p className="text-[11px] text-gray-500">Hanya menampilkan fitur Scanner Souvenir, Antrean Serah 1-Klik & Stok Souvenir.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${newUserStaffType === 'all' ? 'bg-white border-purple-500 ring-2 ring-purple-500/20' : 'bg-white/60 border-gray-200'}`}>
                  <input type="radio" name="newStaffType" checked={newUserStaffType === 'all'} onChange={() => setNewUserStaffType('all')} className="mt-1 text-purple-600" />
                  <div>
                    <div className="text-xs font-bold text-gray-900">Staff All-in-One (Scan Kehadiran + Souvenir)</div>
                    <p className="text-[11px] text-gray-500">Dapat mengakses mode Check-in sekaligus penyerahan Souvenir di 1 meja.</p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {(newUserRole === 'staff' || newUserRole === 'admin') &&
            renderEventAssignmentSelector(newUserAssignedEvents, setNewUserAssignedEvents, newUserRole)}

          {newUserRole === 'partner' && (
            <>
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Partner ID</label>
                 <input value={newUserPartnerId} onChange={e => setNewUserPartnerId(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Biarkan kosong jika buat otomatis atau isi ID Partner" />
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL Partner</label>
                 <input value={newUserLogoUrl} onChange={e => setNewUserLogoUrl(e.target.value)} type="url" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="https://contoh.com/logo.png" />
              </div>
            </>
          )}

          {newUserRole === 'client' && (
            <>
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Partner ID (Parent)</label>
                 <input value={newUserPartnerId} onChange={e => setNewUserPartnerId(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="ID Partner yang mengelola client ini" />
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                 <input value={newUserClientId} onChange={e => setNewUserClientId(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="ID Client yang sudah dibuat" />
              </div>
            </>
          )}

          {/* Pengaturan Kuota khusus Partner/Client */}
          {(newUserRole === 'partner' || newUserRole === 'client' || newUserRole === 'owner') && appUser?.role === 'superadmin' && (
            <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  Pengaturan Kuota & Bypass
                </span>
                <span className="text-[11px] text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded font-medium">Super Admin</span>
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
                  <label className="text-xs font-medium text-gray-800 block">Event Manual (Bypass Tanpa Batas)</label>
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

          <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAddingUser(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium mr-3"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center min-w-[100px]"
            >
              {isSubmitting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditingUser} onClose={() => setIsEditingUser(false)} title="Edit User & Penugasan Acara">
        <form onSubmit={handleEditUser} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap / Nama Petugas</label>
            <input required value={editUserName} onChange={e => setEditUserName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Nama Petugas" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">No. WhatsApp / Telepon</label>
            <input value={editUserPhone} onChange={e => setEditUserPhone(e.target.value)} type="tel" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="08123456789" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role / Jabatan</label>
            <select
              value={editUserRole}
              onChange={e => setEditUserRole(e.target.value as Role)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 font-medium text-gray-900"
            >
              <option value="staff">Staff Lapangan (Scan Kehadiran / Souvenir)</option>
              {appUser?.role !== 'admin' && <option value="admin">Admin Operasional</option>}
              {appUser?.role !== 'admin' && <option value="owner">Owner</option>}
              {appUser?.role !== 'admin' && <option value="client">Client (Pemilik Acara)</option>}
              {appUser?.role !== 'admin' && <option value="partner">Partner (Vendor White-label)</option>}
              {appUser?.role === 'superadmin' && <option value="superadmin">Super Admin</option>}
            </select>
          </div>

          {editUserRole === 'staff' && (
            <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-indigo-900">
                Spesialisasi Tugas Staff (Mode Fokus)
              </label>
              <select
                value={editUserStaffType}
                onChange={e => setEditUserStaffType(e.target.value as StaffType)}
                className="w-full border border-indigo-300 rounded-lg px-3 py-2 bg-white text-sm font-semibold text-indigo-950"
              >
                <option value="checkin">Staff Scan Kehadiran (Fokus Gate Masuk)</option>
                <option value="souvenir">Staff Souvenir (Fokus Loket & Stok Souvenir)</option>
                <option value="all">Staff All-in-One (Scan Kehadiran + Souvenir)</option>
              </select>
            </div>
          )}

          {(editUserRole === 'staff' || editUserRole === 'admin') &&
            renderEventAssignmentSelector(editUserAssignedEvents, setEditUserAssignedEvents, editUserRole)}
          
          {editUserRole === 'partner' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Usaha</label>
                <input value={editUserBusinessName} onChange={e => setEditUserBusinessName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Nama Usaha (Opsional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL Partner</label>
                <input value={editUserLogoUrl} onChange={e => setEditUserLogoUrl(e.target.value)} type="url" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="https://contoh.com/logo.png" />
              </div>
            </>
          )}

          {(editUserRole === 'partner' || editUserRole === 'client' || editUserRole === 'owner') && appUser?.role === 'superadmin' && (
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru (Opsional)</label>
            <input minLength={6} value={editUserPassword} onChange={e => setEditUserPassword(e.target.value)} type="password" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Biarkan kosong jika tidak ingin mengubah password" />
          </div>

          <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsEditingUser(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium mr-3"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center min-w-[100px]"
            >
              {isSubmitting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User / Petugas</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role & Spesialisasi</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acara Ditugaskan / Kuota</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Akses</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => {
                  const assignedIds = Array.isArray(user.assignedEventIds) ? user.assignedEventIds : [];
                  const assignedNames = assignedIds
                    .map(id => events.find(e => e.id === id)?.title || id)
                    .filter(Boolean);

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                            {user.name?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                            {user.phone && <div className="text-[11px] text-gray-400">{user.phone}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center w-fit px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            user.role === 'superadmin' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                            user.role === 'owner' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                            user.role === 'admin' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                            user.role === 'staff' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            user.role === 'partner' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            {getRoleLabel(user.role, user.staffType)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {user.role === 'staff' || user.role === 'admin' ? (
                          assignedNames.length > 0 ? (
                            <div className="space-y-1 max-w-xs">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CalendarDays className="w-3 h-3" /> {assignedNames.length} Acara Ditugaskan
                              </span>
                              <p className="text-xs text-gray-600 truncate" title={assignedNames.join(', ')}>
                                {assignedNames.join(', ')}
                              </p>
                            </div>
                          ) : user.role === 'admin' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              Akses Semua Acara
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              ⚠️ Belum Ditugaskan Acara
                            </span>
                          )
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
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        {user.role === 'staff' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Mode Fokus Terkunci
                          </span>
                        ) : user.allowManualEvent || user.eventManual || ['superadmin', 'owner', 'admin'].includes(user.role) ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Akses Operasional Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            Standar (Kuota)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(user)}
                            className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-md hover:bg-indigo-100 transition-colors"
                          >
                            <Edit className="w-4 h-4" /> Edit / Tugaskan
                          </button>
                          {user.id !== appUser?.id && user.role !== 'superadmin' && (
                            <button
                              onClick={() => handleDelete(user.id!)}
                              className="text-red-600 hover:text-red-900 flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-md hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" /> Hapus
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      Belum ada user.
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
