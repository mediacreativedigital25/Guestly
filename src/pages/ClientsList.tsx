import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, getDocs, where, addDoc, serverTimestamp, doc, setDoc, deleteDoc, updateDoc, runTransaction, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, createAuthUserSilently } from '../lib/firebase';
import { Client, User } from '../types';
import { parseFirestoreDate, getUserBusinessId } from '../lib/utils';
import { format } from 'date-fns';
import { Plus, Trash2, Edit, Eye } from 'lucide-react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { showAlert, showConfirm, showCancelAlert } from '../lib/alerts';

export default function ClientsList() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId: routeClientId } = useParams<{ clientId?: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [partners, setPartners] = useState<{id: string, name: string, logoUrl?: string}[]>([]);
  const [loading, setLoading] = useState(true);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  
  // New state for creating user account
  const [createAccount, setCreateAccount] = useState(false);
  const [newClientPassword, setNewClientPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  
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
          setPartners([{ id: safePid, name: appUser?.businessName || appUser?.name || 'Partner', logoUrl: appUser?.logoUrl }]);
          setSelectedPartnerId(safePid);
        } else {
          // Fetch businesses (owners & partners) for superadmin
          const partnersData = allUsersSnap.docs
            .filter(d => ['owner', 'partner'].includes(d.data().role))
            .map(doc => ({
              id: doc.data().partnerId || doc.id,
              name: doc.data().businessName || doc.data().name,
              logoUrl: doc.data().logoUrl
            }));
          setPartners(partnersData);
          if (partnersData.length > 0) {
            setSelectedPartnerId(partnersData[0].id);
          }
        }

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

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    
    const confirmed = await showConfirm('Apakah Anda yakin ingin menambahkan client ini?');
    if (!confirmed) return;
    
    setIsSubmitting(true);
    setError('');

    const isFullManagement = appUser.role === 'superadmin' || appUser.role === 'owner' || appUser.role === 'admin';
    const partnerId = appUser.role === 'superadmin'
      ? (selectedPartnerId || appUser.id || 'default-partner')
      : (getUserBusinessId(appUser) || selectedPartnerId || appUser.id || 'default-partner');

    try {
      if (createAccount) {
        if (!newClientEmail) {
           throw new Error('Email dibutuhkan untuk membuat akun.');
        }
        if (newClientPassword.length < 6) {
           throw new Error('Password minimal 6 karakter.');
        }
      }

      const clientData = {
        name: newClientName,
        contactEmail: newClientEmail,
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
      
      if (createAccount) {
         const uid = await createAuthUserSilently(newClientEmail, newClientPassword);
         const matchedPartner = partners.find(p => p.id === partnerId);
         const resolvedBizName = matchedPartner?.name || appUser.businessName || undefined;
         const newUserDoc: User = {
            name: newClientName,
            email: newClientEmail,
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
      }

      setClients([...clients, { id: newDocId, ...clientData } as unknown as Client]);
      setNewClientName('');
      setNewClientEmail('');
      setCreateAccount(false);
      setNewClientPassword('');
      setIsAddingClient(false);
      navigate('/auth/login/clients', { replace: true });
      showAlert('Berhasil', 'Client berhasil ditambahkan!', 'success');
    } catch (error: any) {
      console.error(error);
      setError(error.message || 'Terjadi kesalahan saat menambahkan client.');
      // Fallback
      if (!error.message) handleFirestoreError(error, OperationType.CREATE, 'clients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPartnerName = (partnerId: string) => {
    const partner = partners.find(p => p.id === partnerId);
    return (partner && partner.name) ? partner.name : (partnerId || '-');
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setEditClientName(client.name);
    setEditClientEmail(client.contactEmail || '');
    if (client.id) {
      navigate(`/auth/login/clients/${client.id}/edit`);
    }
  };

  const closeEditModal = (showCancel = false) => {
    setEditingClient(null);
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
    
    const confirmed = await showConfirm('Apakah Anda yakin ingin menyimpan perubahan client ini?');
    if (!confirmed) return;
    
    setIsSubmitting(true);
    setError('');

    try {
      const clientRef = doc(db, 'clients', editingClient.id);
      await updateDoc(clientRef, {
        name: editClientName,
        contactEmail: editClientEmail,
        updatedAt: serverTimestamp()
      });

      setClients(clients.map(c => 
        c.id === editingClient.id 
          ? { ...c, name: editClientName, contactEmail: editClientEmail } 
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center">
        <button 
          onClick={() => {
            if (isAddingClient) {
              setIsAddingClient(false);
              navigate('/auth/login/clients');
              showCancelAlert('Penambahan client baru telah dibatalkan.');
              return;
            }
            const userCredit = appUser?.clientCredit !== undefined ? appUser.clientCredit : (appUser?.clientQuota || 0);
            if (appUser?.role !== 'superadmin' && userCredit <= 0) {
               showAlert('Akses Ditolak', 'Anda tidak memiliki kuota klien. Silakan beli layanan terlebih dahulu.', 'warning');
               navigate('/auth/login/clients');
               return;
            }
            setIsAddingClient(true);
            navigate('/auth/login/clients/add');
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
        >
          <Plus className="w-4 h-4" />
          {isAddingClient ? 'Batal' : 'Add Client'}
        </button>
      </div>

      {isAddingClient && (
        <form onSubmit={handleAddClient} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-medium text-gray-900 mb-4">Create New Client</h2>
          {error && <div className="bg-red-50 text-red-600 p-3 mb-4 rounded text-sm">{error}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company/Client Name</label>
              <input required value={newClientName} onChange={e => setNewClientName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Acme Corp" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <input value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} type="email" required={createAccount} className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="contact@acme.com" />
            </div>
          </div>
          
          {appUser?.role === 'superadmin' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Partner</label>
              <select 
                value={selectedPartnerId} 
                onChange={e => setSelectedPartnerId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 max-w-sm"
              >
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
               <input type="checkbox" checked={createAccount} onChange={e => setCreateAccount(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300" />
               Buat Akun User untuk Client ini
            </label>
            <p className="text-xs text-gray-500 ml-6 mt-1">Jika dicentang, Client dapat login menggunakan Contact Email dan Password di bawah.</p>
          </div>

          {createAccount && (
            <div className="mb-4 ml-6">
               <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
               <input required={createAccount} minLength={6} value={newClientPassword} onChange={e => setNewClientPassword(e.target.value)} type="password" className="w-full border border-gray-300 rounded-md px-3 py-2 max-w-sm" placeholder="Min. 6 karakter" />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setIsAddingClient(false);
                navigate('/auth/login/clients');
                showCancelAlert('Penambahan client baru telah dibatalkan.');
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium"
            >
              Batal
            </button>
            <button disabled={isSubmitting} type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center min-w-[120px]">
               {isSubmitting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : 'Save Client'}
            </button>
          </div>
        </form>
      )}
      
      {loading ? (
        <p className="text-gray-500 text-sm">Memuat data clients...</p>
      ) : clients.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-lg shadow-sm border border-gray-200">
          <p className="text-gray-500">Belum ada client yang ditambahkan. Silakan tambah client baru.</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">No</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acara</th>
                  {(appUser?.role === 'superadmin' || appUser?.role === 'partner') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Partner</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {clients.map((client, index) => (
                  <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm font-medium text-gray-900">{client.name}</div>
                       <div className="text-sm text-gray-500">{client.contactEmail || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       {clientEventsCount[client.id!] || 0} Acara
                    </td>
                    {(appUser?.role === 'superadmin' || appUser?.role === 'partner') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                         {client.partnerId && partners.find(p => p.id === client.partnerId) ? (
                           <div className="flex items-center gap-2">
                             {partners.find(p => p.id === client.partnerId)?.logoUrl ? (
                               <img src={partners.find(p => p.id === client.partnerId)?.logoUrl} alt="Logo" className="w-6 h-6 rounded-md object-contain bg-white border border-gray-200" />
                             ) : (
                               <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold border border-indigo-100">
                                 {getPartnerName(client.partnerId).charAt(0).toUpperCase()}
                               </div>
                             )}
                             <span>{getPartnerName(client.partnerId)}</span>
                           </div>
                         ) : '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       {client.createdAt && parseFirestoreDate(client.createdAt) ? format(parseFirestoreDate(client.createdAt)!, 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                       <div className="flex justify-end gap-2">
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
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 border-t border-gray-200 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit View Modal */}
      {viewingClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full relative">
             <button
                onClick={closeViewModal}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold"
             >
                ✕
             </button>
             <h2 className="text-xl font-bold text-gray-900 mb-4">Detail Client</h2>
             
             <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Nama</label>
                  <div className="mt-1 text-sm text-gray-900">{viewingClient.name}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Email Kontak</label>
                  <div className="mt-1 text-sm text-gray-900">{viewingClient.contactEmail || '-'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Total Acara</label>
                  <div className="mt-1 text-sm text-gray-900">{clientEventsCount[viewingClient.id!] || 0} Acara</div>
                </div>
                {(appUser?.role === 'superadmin' || appUser?.role === 'partner') && viewingClient.partnerId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Partner</label>
                    <div className="mt-1 text-sm text-gray-900">{getPartnerName(viewingClient.partnerId)}</div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-500">Tanggal Terdaftar</label>
                  <div className="mt-1 text-sm text-gray-900">{viewingClient.createdAt && parseFirestoreDate(viewingClient.createdAt) ? format(parseFirestoreDate(viewingClient.createdAt)!, 'dd MMMM yyyy, HH:mm') : '-'}</div>
                </div>
             </div>
             
             <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={closeViewModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Tutup
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full relative">
            <button
               onClick={closeEditModal}
               className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold"
            >
               ✕
            </button>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Client</h2>
            
            <form onSubmit={handleUpdateClient} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md mb-4 border border-red-100">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Client
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
              
              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => closeEditModal(true)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
