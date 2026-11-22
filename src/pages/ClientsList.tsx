import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, getDocs, where, addDoc, serverTimestamp, doc, setDoc, deleteDoc, updateDoc, runTransaction, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, createAuthUserSilently } from '../lib/firebase';
import { Client, User } from '../types';
import { parseFirestoreDate, getUserBusinessId, resolveMediaUrl } from '../lib/utils';
import { format } from 'date-fns';
import { Plus, Trash2, Edit, Eye, Phone, MessageSquare, Send, Search, X } from 'lucide-react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { showAlert, showConfirm, showCancelAlert } from '../lib/alerts';
import { Modal } from '../components/Modal';
import { sendFonnteMessage } from '../lib/fonnte';
import { DateRangeFilterBar, isWithinDateRange } from '../components/DateRangeFilterBar';

export default function ClientsList() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId: routeClientId } = useParams<{ clientId?: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [partners, setPartners] = useState<{id: string, name: string, logoUrl?: string}[]>([]);
  const [vendorById, setVendorById] = useState<Record<string, { name: string; logoUrl?: string }>>({});
  const [loading, setLoading] = useState(true);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Table Search, Filter & Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState<'all' | 'has_events' | 'no_events'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  
  // New state for creating user account
  const [createAccount, setCreateAccount] = useState(false);
  const [newClientPassword, setNewClientPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  
  const [viewingClient, setViewingClient] = useState<Client | null>(null);

  const [clientEventsCount, setClientEventsCount] = useState<Record<string, number>>({});

  useEffect(() => {
    let unsubscribeClients: () => void;
    let unsubscribeEvents: () => void;

    const fetchData = async () => {
      try {
        const clientsRef = collection(db, 'clients');
        const qClients = query(clientsRef);

        const isSuperAdmin = appUser?.role === 'superadmin';
        const myBizIds = new Set<string>(
          [appUser?.id, appUser?.partnerId, getUserBusinessId(appUser)].filter(Boolean) as string[]
        );

        const usersRef = collection(db, 'users');
        const allUsersSnap = await getDocs(usersRef);

        // Build comprehensive Vendor (Partner / Owner Business) lookup map
        const vendorMap: Record<string, { name: string; logoUrl?: string }> = {};
        const bizUsers = allUsersSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as Partial<User>) }))
          .filter(u => ['owner', 'partner'].includes(u.role || ''));

        bizUsers.forEach(u => {
          const info = {
            name: (u.businessName || u.brandName || u.name || 'Vendor').trim(),
            logoUrl: u.logoUrl || u.brandLogo || undefined,
          };
          if (u.id) vendorMap[u.id] = info;
          if (u.partnerId) vendorMap[u.partnerId] = info;
        });

        // Also map team/admin accounts back to their business vendor
        allUsersSnap.docs.forEach(uDoc => {
          const u = uDoc.data() as Partial<User>;
          if (!vendorMap[uDoc.id]) {
            const parentInfo =
              (u.partnerId && vendorMap[u.partnerId]) ||
              (u.createdBy && vendorMap[u.createdBy]);
            if (parentInfo) {
              vendorMap[uDoc.id] = parentInfo;
            } else if (u.businessName || u.brandName) {
              vendorMap[uDoc.id] = {
                name: (u.businessName || u.brandName || u.name || '').trim(),
                logoUrl: u.logoUrl || u.brandLogo || undefined,
              };
            }
          }
        });

        if (!isSuperAdmin) {
          const safePid = getUserBusinessId(appUser) || appUser?.id || '';
          if (!safePid) {
            setClients([]);
            setLoading(false);
            return;
          }
          allUsersSnap.docs.forEach(uDoc => {
            const u = uDoc.data();
            if (
              (u.partnerId && myBizIds.has(u.partnerId)) ||
              (u.createdBy && myBizIds.has(u.createdBy)) ||
              myBizIds.has(uDoc.id)
            ) {
              myBizIds.add(uDoc.id);
              if (u.partnerId) myBizIds.add(u.partnerId);
            }
          });
          const myVendorInfo = vendorMap[safePid] || {
            name: appUser?.businessName || appUser?.brandName || appUser?.name || 'Vendor',
            logoUrl: appUser?.logoUrl || appUser?.brandLogo || undefined,
          };
          myBizIds.forEach(id => {
            if (!vendorMap[id]) vendorMap[id] = myVendorInfo;
          });
          setPartners([{ id: safePid, name: myVendorInfo.name, logoUrl: myVendorInfo.logoUrl }]);
          setSelectedPartnerId(safePid);
        } else {
          // Fetch businesses (owners & partners) for superadmin
          const partnersData = bizUsers.map(u => ({
            id: u.partnerId || u.id,
            name: (u.businessName || u.brandName || u.name || 'Vendor').trim(),
            logoUrl: u.logoUrl || u.brandLogo
          }));
          setPartners(partnersData);
          if (partnersData.length > 0) {
            setSelectedPartnerId(partnersData[0].id);
          }
        }
        setVendorById(vendorMap);

        try {
          const { getDocs, limit } = await import('firebase/firestore');
          const qLimited = query(qClients, limit(100));
          const clientsSnap = await getDocs(qLimited);
          let data = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
          if (!isSuperAdmin && myBizIds.size > 0) {
            data = data.filter(c => c.partnerId && myBizIds.has(c.partnerId));
          }
          setClients(data);
          setLastVisible(clientsSnap.docs[clientsSnap.docs.length - 1]);
          setHasMore(clientsSnap.docs.length === 100);
          setLoading(false);
          const { getCountFromServer, collection, where } = await import('firebase/firestore');
          const eventsRef = collection(db, 'events');
          const eventsCount: Record<string, number> = {};
          
          await Promise.all(data.map(async (client: any) => {
            if (client.id) {
              const q = query(eventsRef, where('clientId', '==', client.id));
              const snap = await getCountFromServer(q);
              eventsCount[client.id] = snap.data().count;
            }
          }));
          setClientEventsCount(eventsCount);
        } catch(error) {
           console.error("Error fetching events for client list", error);
        }


      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'clients');
        setLoading(false);
      }
    };
    if (appUser) fetchData();

    return () => {};
  }, [appUser]);

  // Sync URL sub-routes (/clients/add, /clients/:clientId/edit, /clients/:clientId/view) with modal/form state
  useEffect(() => {
    const path = location.pathname;
    if (path.endsWith('/clients/add')) {
      setIsAddingClient(true);
      setEditingClient(null);
      setViewingClient(null);
    } else if (routeClientId && path.endsWith('/edit')) {
      const found = clients.find(c => c.id === routeClientId);
      if (found) {
        setEditingClient(found);
        setEditClientName(found.name);
        setEditClientEmail(found.contactEmail || '');
        setEditClientPhone(found.phone || '');
        setIsAddingClient(false);
        setViewingClient(null);
      }
    } else if (routeClientId && path.endsWith('/view')) {
      const found = clients.find(c => c.id === routeClientId);
      if (found) {
        setViewingClient(found);
        setIsAddingClient(false);
        setEditingClient(null);
      }
    } else if (path === '/auth/login/clients') {
      setIsAddingClient(false);
      setEditingClient(null);
      setViewingClient(null);
    }
  }, [location.pathname, routeClientId, clients]);

  
  const handleLoadMore = async () => {
    if (!lastVisible || !appUser) return;
    setLoadingMore(true);
    try {
      const { collection, query, getDocs, where, limit, startAfter, getCountFromServer } = await import('firebase/firestore');
      const clientsRef = collection(db, 'clients');
      let qClients = query(clientsRef);
      
      if (appUser?.role !== 'superadmin' && appUser?.role !== 'owner' && appUser?.role !== 'admin') {
        const pid = appUser?.role === 'partner' ? appUser.id : appUser?.partnerId;
        const safePid = pid || '';
        qClients = query(clientsRef, where('partnerId', '==', safePid));
      }
      
      const qLimited = query(qClients, startAfter(lastVisible), limit(50));
      const clientsSnap = await getDocs(qLimited);
      const data = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as Client }));
      setClients(prev => [...prev, ...data]);
      setLastVisible(clientsSnap.docs[clientsSnap.docs.length - 1]);
      setHasMore(clientsSnap.docs.length === 50);

      // Fetch event counts for new clients
      const eventsRef = collection(db, 'events');
      const eventsCount = { ...clientEventsCount };
      await Promise.all(data.map(async (client) => {
        if (client.id) {
          const q = query(eventsRef, where('clientId', '==', client.id));
          const snap = await getCountFromServer(q);
          eventsCount[client.id] = snap.data().count;
        }
      }));
      setClientEventsCount(eventsCount);
    } catch (error) {
      console.error("Error loading more clients", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin menghapus client ini?');
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'clients', clientId));
        setClients(clients.filter(c => c.id !== clientId));
        showAlert('Berhasil', 'Client berhasil dihapus!', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'clients');
        showAlert('Gagal', 'Gagal menghapus client.', 'error');
      }
    }
  };

  const closeAddModal = (showCancel = false) => {
    setIsAddingClient(false);
    setError('');
    if (location.pathname !== '/auth/login/clients') {
      navigate('/auth/login/clients');
    }
    if (showCancel) {
      showCancelAlert('Penambahan client baru telah dibatalkan.');
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    
    setIsSubmitting(true);
    setError('');

    const isFullManagement = appUser.role === 'superadmin' || appUser.role === 'owner' || appUser.role === 'admin';
    const partnerId = appUser.role === 'superadmin'
      ? (selectedPartnerId || appUser.id || 'default-partner')
      : (getUserBusinessId(appUser) || selectedPartnerId || appUser.id || 'default-partner');

    try {
      const cleanedPhone = newClientPhone.trim();
      if (createAccount) {
        if (!newClientEmail.trim()) {
           throw new Error('Email dibutuhkan untuk membuat akun.');
        }
        if (newClientPassword.length < 6) {
           throw new Error('Password minimal 6 karakter.');
        }
        if (!cleanedPhone) {
           throw new Error('Nomor WhatsApp dibutuhkan untuk mengirim notifikasi informasi akun ke Client.');
        }
      }

      const clientData = {
        name: newClientName.trim(),
        contactEmail: newClientEmail.trim(),
        phone: cleanedPhone,
        partnerId: partnerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      let newDocId = '';
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', appUser.id!);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User not found");
        
        const userData = userDoc.data();
        const currentQuota = userData.clientCredit !== undefined 
          ? userData.clientCredit 
          : (userData.clientQuota || 0);
        if (!isFullManagement && currentQuota <= 0) {
          throw new Error("QUOTA_EXCEEDED");
        }

        if (!isFullManagement) {
          transaction.update(userRef, { 
            clientCredit: Math.max(0, currentQuota - 1),
            clientQuota: Math.max(0, currentQuota - 1),
            updatedAt: serverTimestamp()
          });
        }

        const newClientRef = doc(collection(db, 'clients'));
        newDocId = newClientRef.id;
        transaction.set(newClientRef, clientData);
      });
      
      const matchedPartner = partners.find(p => p.id === partnerId);
      const resolvedBizName = matchedPartner?.name || appUser.businessName || undefined;

      let waResult: { success: boolean; error?: string } | null = null;

      if (createAccount) {
         const uid = await createAuthUserSilently(newClientEmail.trim(), newClientPassword);
         const newUserDoc: User = {
            name: newClientName.trim(),
            email: newClientEmail.trim(),
            phone: cleanedPhone,
            role: 'client',
            partnerId: partnerId,
            clientId: newDocId,
            businessName: resolvedBizName,
            hideServiceInfo: true,
            createdBy: appUser.id,
            createdByName: appUser.name || appUser.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
         };
         await setDoc(doc(db, 'users', uid), newUserDoc);

         // Send WhatsApp Notification via Fonnte
         if (cleanedPhone) {
           const loginUrl = `${window.location.origin}/auth/login`;
           const bizInfo = resolvedBizName ? `\n🏢 *Bisnis / WO* : ${resolvedBizName}` : '';
           const message = `🔐 *Informasi Akun Client Guestly*

Halo Kak *${newClientName.trim()}*,

Akun Client Anda telah berhasil dibuat di sistem *Guestly*. Berikut adalah informasi login akun Anda untuk mengelola acara dan buku tamu digital:

📧 *Email* : ${newClientEmail.trim()}
🔑 *Password* : ${newClientPassword}
👤 *Role* : Client / Pemilik Acara${bizInfo}
🌐 *Link Login* : ${loginUrl}

Silakan login menggunakan Email dan Password di atas. Mohon simpan informasi akun ini dengan baik dan jangan membagikannya kepada pihak lain. Terima kasih! 🙏`;

           waResult = await sendFonnteMessage(null, cleanedPhone, message);
         }
      }

      setClients([...clients, { id: newDocId, ...clientData } as unknown as Client]);
      setNewClientName('');
      setNewClientEmail('');
      setNewClientPhone('');
      setCreateAccount(false);
      setNewClientPassword('');
      setIsAddingClient(false);
      navigate('/auth/login/clients', { replace: true });
      if (createAccount && cleanedPhone && waResult) {
        if (waResult.success) {
          showAlert(
            'Berhasil',
            'Client & Akun User berhasil dibuat! Notifikasi informasi akun telah dikirim ke WhatsApp Client.',
            'success'
          );
        } else {
          showAlert(
            'Client Dibuat (WA Belum Terkirim)',
            `Data Client & Akun User berhasil dibuat, namun notifikasi WhatsApp gagal terkirim: ${waResult.error || 'Periksa pengaturan Token Fonnte.'}`,
            'warning'
          );
        }
      } else {
        showAlert('Berhasil', 'Client berhasil ditambahkan!', 'success');
      }
    } catch (error: any) {
      console.error(error);
      setError(error.message || 'Terjadi kesalahan saat menambahkan client.');
      // Fallback
      if (!error.message) handleFirestoreError(error, OperationType.CREATE, 'clients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getVendorInfo = (partnerId?: string | null) => {
    if (!partnerId) return null;
    if (vendorById[partnerId]) return vendorById[partnerId];
    const matched = partners.find(p => p.id === partnerId);
    if (matched?.name) return { name: matched.name, logoUrl: matched.logoUrl };
    return null;
  };

  const getPartnerName = (partnerId: string) => {
    const info = getVendorInfo(partnerId);
    return info?.name || '-';
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setEditClientName(client.name);
    setEditClientEmail(client.contactEmail || '');
    setEditClientPhone(client.phone || '');
    setError('');
    if (client.id) {
      navigate(`/auth/login/clients/${client.id}/edit`);
    }
  };

  const closeEditModal = (showCancel = false) => {
    setEditingClient(null);
    setError('');
    if (location.pathname !== '/auth/login/clients') {
      navigate('/auth/login/clients');
    }
    if (showCancel) {
      showCancelAlert('Perubahan data client telah dibatalkan.');
    }
  };

  const openViewModal = (client: Client) => {
    setViewingClient(client);
    if (client.id) {
      navigate(`/auth/login/clients/${client.id}/view`);
    }
  };

  const closeViewModal = () => {
    setViewingClient(null);
    if (location.pathname !== '/auth/login/clients') {
      navigate('/auth/login/clients');
    }
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editingClient.id) return;
    
    setIsSubmitting(true);
    setError('');

    try {
      const clientRef = doc(db, 'clients', editingClient.id);
      const cleanedPhone = editClientPhone.trim();
      await updateDoc(clientRef, {
        name: editClientName.trim(),
        contactEmail: editClientEmail.trim(),
        phone: cleanedPhone,
        updatedAt: serverTimestamp()
      });

      setClients(clients.map(c => 
        c.id === editingClient.id 
          ? { ...c, name: editClientName.trim(), contactEmail: editClientEmail.trim(), phone: cleanedPhone } 
          : c
      ));
      
      setEditingClient(null);
      navigate('/auth/login/clients', { replace: true });
      showAlert('Berhasil', 'Client berhasil diperbarui!', 'success');
    } catch (error: any) {
      console.error(error);
      setError(error.message || 'Terjadi kesalahan saat mengupdate client.');
      if (!error.message) handleFirestoreError(error, OperationType.UPDATE, 'clients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return clients.filter((client) => {
      const evCount = client.id ? (clientEventsCount[client.id] || 0) : 0;
      if (clientFilter === 'has_events' && evCount <= 0) return false;
      if (clientFilter === 'no_events' && evCount > 0) return false;

      if (!isWithinDateRange(client.createdAt, startDate, endDate)) return false;

      if (!q) return true;
      const partnerName = client.partnerId ? getPartnerName(client.partnerId) : '';
      const haystack = [
        client.name,
        client.contactEmail,
        client.phone,
        partnerName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [clients, searchTerm, clientFilter, startDate, endDate, clientEventsCount, partners, vendorById]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredClients.length);
  const paginatedClients = useMemo(
    () => filteredClients.slice(startIndex, endIndex),
    [filteredClients, startIndex, endIndex]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, clientFilter, startDate, endDate, itemsPerPage]);

  const hasActiveFilter =
    searchTerm.trim() !== '' ||
    clientFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '';

  return (
    <div className="space-y-4">
      {/* Unified Filter Box: Row 1 Rentang Tanggal | Row 2 Search, Filter & Limit */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-2.5 sm:p-3">
        <DateRangeFilterBar
          label="Rentang Tanggal"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={() => {
            setStartDate('');
            setEndDate('');
          }}
          position="top"
        />

        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama client, vendor, email, atau no. WhatsApp..."
              className="w-full h-8.5 pl-8.5 pr-7 text-xs sm:text-sm bg-gray-50/70 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Filter Client */}
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value as 'all' | 'has_events' | 'no_events')}
              className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[130px]"
              title="Filter status acara client"
            >
              <option value="all">Semua Client</option>
              <option value="has_events">Memiliki Acara</option>
              <option value="no_events">Belum Ada Acara</option>
            </select>

            {/* Tampilkan 10, 25, 50 */}
            <div className="flex items-center gap-1.5 h-8.5 px-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition shrink-0">
              <span className="text-xs text-gray-500 whitespace-nowrap">Tampilkan</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="bg-transparent text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer pr-0.5"
                title="Jumlah baris per halaman"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Bar (Between Filter Box & Table Box, Left Aligned) */}
      <div className="flex items-center justify-start">
        <button
          onClick={() => {
            const isFullManagement = appUser?.role === 'superadmin' || appUser?.role === 'owner' || appUser?.role === 'admin';
            const userCredit = appUser?.clientCredit !== undefined ? appUser.clientCredit : (appUser?.clientQuota || 0);
            if (!isFullManagement && userCredit <= 0) {
               showAlert('Akses Ditolak', 'Anda tidak memiliki kuota klien. Silakan beli layanan terlebih dahulu.', 'warning');
               navigate('/auth/login/clients');
               return;
            }
            setError('');
            setIsAddingClient(true);
            navigate('/auth/login/clients/add');
          }}
          className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Client</span>
        </button>
      </div>

      {/* Add Client Modal (Popup) */}
      <Modal
        isOpen={isAddingClient}
        onClose={() => closeAddModal(true)}
        title="Tambah Client Baru"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleAddClient} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-100">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Client / Perusahaan <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={newClientName}
              onChange={e => setNewClientName(e.target.value)}
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Contoh: Romeo & Juliet / Acme Corp"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Email {createAccount && <span className="text-red-500">*</span>}
              </label>
              <input
                value={newClientEmail}
                onChange={e => setNewClientEmail(e.target.value)}
                type="email"
                required={createAccount}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="client@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                No. WhatsApp (Notifikasi) {createAccount && <span className="text-red-500">*</span>}
              </label>
              <input
                value={newClientPhone}
                onChange={e => setNewClientPhone(e.target.value)}
                type="tel"
                required={createAccount}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="081234567890"
              />
            </div>
          </div>
          
          {appUser?.role === 'superadmin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Partner / Bisnis</label>
              <select 
                value={selectedPartnerId} 
                onChange={e => setSelectedPartnerId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              >
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-2.5 text-sm font-medium text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAccount}
                  onChange={e => setCreateAccount(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300"
                />
                Buat Akun User untuk Client ini
              </label>
              <p className="text-xs text-gray-500 ml-6 mt-1">
                Jika dicentang, sistem akan membuat akun login Client dan mengirimkan <strong>Notifikasi Informasi Akun otomatis via WhatsApp (Fonnte)</strong> ke nomor WA di atas.
              </p>
            </div>

            {createAccount && (
              <div className="ml-6 pt-2 border-t border-indigo-100/80 space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password Login Client <span className="text-red-500">*</span>
                  </label>
                  <input
                    required={createAccount}
                    minLength={6}
                    value={newClientPassword}
                    onChange={e => setNewClientPassword(e.target.value)}
                    type="password"
                    className="w-full border border-gray-300 bg-white rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Minimal 6 karakter"
                  />
                </div>
                <div className="flex items-start gap-2 text-xs text-indigo-700 bg-indigo-100/70 p-2.5 rounded-md">
                  <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                  <span>
                    Pesan WhatsApp berisi <strong>Email, Password, Role, dan Link Login</strong> akan langsung dikirimkan ke nomor WhatsApp Client setelah disimpan.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-gray-100 flex justify-end items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => closeAddModal(true)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium transition-colors"
            >
              Batal
            </button>
            <button
              disabled={isSubmitting}
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 flex items-center justify-center min-w-[130px] transition-colors"
            >
              {isSubmitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                'Simpan Client'
              )}
            </button>
          </div>
        </form>
      </Modal>
      
      {loading ? (
        <div className="bg-white p-8 text-center rounded-xl shadow-xs border border-gray-200">
          <p className="text-gray-500 text-sm">Memuat data clients...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl shadow-xs border border-gray-200">
          <p className="text-gray-500 text-sm">Belum ada client yang ditambahkan. Silakan tambah client baru.</p>
        </div>
      ) : (
        <div className="bg-white shadow-xs rounded-xl border border-gray-200 overflow-hidden">
          {filteredClients.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                <Search className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-800">Tidak ada client yang cocok</p>
                <p className="text-xs text-gray-500">
                  Coba ubah kata kunci pencarian, status, atau rentang tanggal.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setClientFilter('all');
                  setStartDate('');
                  setEndDate('');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
              >
                Reset Pencarian &amp; Filter
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-14">No</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama &amp; Kontak</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">No. WhatsApp</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Acara</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tanggal</th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedClients.map((client, index) => {
                      const vendorInfo = getVendorInfo(client.partnerId);
                      return (
                      <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500">
                           {startIndex + index + 1}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                           <div className="text-sm font-medium text-gray-900">{client.name}</div>
                           <div className="text-sm text-gray-500">{client.contactEmail || '-'}</div>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-600">
                           {client.phone ? (
                             <span className="inline-flex items-center gap-1.5 text-gray-700">
                               <Phone className="w-3.5 h-3.5 text-emerald-600" />
                               {client.phone}
                             </span>
                           ) : (
                             <span className="text-gray-400">-</span>
                           )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-700">
                          {vendorInfo ? (
                            <div className="flex items-center gap-2">
                              {vendorInfo.logoUrl ? (
                                <img
                                  src={resolveMediaUrl(vendorInfo.logoUrl)}
                                  alt={vendorInfo.name}
                                  className="w-6 h-6 rounded-md object-contain bg-white border border-gray-200 shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold border border-indigo-100 shrink-0">
                                  {vendorInfo.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="font-medium text-gray-800">{vendorInfo.name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500">
                           {clientEventsCount[client.id!] || 0} Acara
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500">
                           {client.createdAt && parseFirestoreDate(client.createdAt) ? format(parseFirestoreDate(client.createdAt)!, 'dd MMM yyyy') : '-'}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-right text-sm font-medium">
                           <div className="flex justify-end gap-2">
                             {appUser?.role !== 'client' && appUser?.role !== 'staff' && (
                               <Link
                                 to={`/auth/login/clients/${client.id}/send-access`}
                                 className="text-[#8C3A50] hover:text-[#722B3E] bg-rose-50 hover:bg-rose-100 p-2 rounded-md transition-colors inline-block"
                                 title="Kirim Akses ke Client"
                               >
                                 <Send className="w-4 h-4" />
                               </Link>
                             )}
                             <button
                               onClick={() => openViewModal(client)}
                               className="text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-200 p-2 rounded-md transition-colors inline-block"
                               title="Detail Client"
                             >
                               <Eye className="w-4 h-4" />
                             </button>
                             <button
                               onClick={() => openEditModal(client)}
                               className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-md transition-colors inline-block"
                               title="Edit Client"
                             >
                               <Edit className="w-4 h-4" />
                             </button>
                             <button
                               onClick={() => handleDeleteClient(client.id!)}
                               className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 p-2 rounded-md transition-colors inline-block"
                               title="Hapus Client"
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
              <div className="px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 sm:px-5 gap-3 bg-gray-50/50">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  <span>
                    Menampilkan <span className="font-semibold text-gray-900">{filteredClients.length === 0 ? 0 : startIndex + 1}</span> – <span className="font-semibold text-gray-900">{endIndex}</span> dari <span className="font-semibold text-indigo-600">{filteredClients.length}</span> client
                  </span>
                  {hasActiveFilter && (
                    <>
                      <span className="text-xs text-gray-400">({clients.length} total)</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setClientFilter('all');
                          setStartDate('');
                          setEndDate('');
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {totalPages > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={safeCurrentPage === 1}
                        className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title="Halaman Pertama"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safeCurrentPage === 1}
                        className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        Sebelumnya
                      </button>
                      <span className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg">
                        Hal <span className="text-indigo-600 font-bold">{safeCurrentPage}</span> / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safeCurrentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        Selanjutnya
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={safeCurrentPage === totalPages}
                        className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title="Halaman Terakhir"
                      >
                        »
                      </button>
                    </>
                  )}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg hover:bg-indigo-100 text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Detail Client Modal */}
      <Modal
        isOpen={Boolean(viewingClient)}
        onClose={closeViewModal}
        title="Detail Client"
        maxWidth="max-w-md"
      >
        {viewingClient && (
          <div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Nama</label>
                <div className="mt-1 text-sm text-gray-900 font-medium">{viewingClient.name}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Email Kontak</label>
                <div className="mt-1 text-sm text-gray-900">{viewingClient.contactEmail || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">No. WhatsApp</label>
                <div className="mt-1 text-sm text-gray-900">{viewingClient.phone || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Total Acara</label>
                <div className="mt-1 text-sm text-gray-900">{clientEventsCount[viewingClient.id!] || 0} Acara</div>
              </div>
              {viewingClient.partnerId && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Vendor</label>
                  <div className="mt-1 text-sm text-gray-900">{getPartnerName(viewingClient.partnerId)}</div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-500">Tanggal Terdaftar</label>
                <div className="mt-1 text-sm text-gray-900">
                  {viewingClient.createdAt && parseFirestoreDate(viewingClient.createdAt)
                    ? format(parseFirestoreDate(viewingClient.createdAt)!, 'dd MMMM yyyy, HH:mm')
                    : '-'}
                </div>
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={closeViewModal}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Client Modal */}
      <Modal
        isOpen={Boolean(editingClient)}
        onClose={() => closeEditModal(true)}
        title="Edit Client"
        maxWidth="max-w-md"
      >
        {editingClient && (
          <form onSubmit={handleUpdateClient} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-100">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nama Client <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editClientName}
                onChange={e => setEditClientName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Kontak
              </label>
              <input
                type="email"
                value={editClientEmail}
                onChange={e => setEditClientEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                No. WhatsApp (Notifikasi)
              </label>
              <input
                type="tel"
                value={editClientPhone}
                onChange={e => setEditClientPhone(e.target.value)}
                placeholder="081234567890"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeEditModal(true)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
