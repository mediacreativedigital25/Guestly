import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../AuthContext';
import { GuestEditRequest } from '../types';
import { Check, X, Clock, AlertCircle } from 'lucide-react';

export default function Approvals() {
  const { appUser } = useAuth();
  const [requests, setRequests] = useState<GuestEditRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser) return;

    let q;
    if (appUser.role === 'superadmin') {
      q = query(collection(db, 'guest_edit_requests'), where('status', '==', 'pending'));
    } else if (appUser.role === 'partner') {
      q = query(collection(db, 'guest_edit_requests'), where('partnerId', '==', appUser.id || ''), where('status', '==', 'pending'));
    } else if (appUser.role === 'client') {
      q = query(collection(db, 'guest_edit_requests'), where('clientId', '==', appUser.clientId || ''));
    } else {
      setLoading(false);
      return;
    }

    const fetchApprovals = async () => {
      try {
        const { getDocs } = await import('firebase/firestore');
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        setRequests(data);
      } catch (err) {
        console.error('Approvals getDocs error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchApprovals();
  }, [appUser]);

  const handleApprove = async (request: GuestEditRequest) => {
    if (!request.id) return;

    try {
      if (request.type === 'add') {
        await addDoc(collection(db, 'events', request.eventId, 'guests'), {
          ...request.requestedData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // 1. Update guest data
        await updateDoc(doc(db, 'events', request.eventId, 'guests', request.guestId), {
          ...request.requestedData,
          updatedAt: serverTimestamp()
        });
      }

      // 2. Mark request as approved (or just delete it)
      await updateDoc(doc(db, 'guest_edit_requests', request.id), {
        status: 'approved',
        resolvedAt: serverTimestamp()
      });

    } catch (error) {
      console.error('Error approving request:', error);
      alert('Gagal menyetujui permintaan.');
    }
  };

  const handleReject = async (request: GuestEditRequest) => {
    if (!request.id) return;
    try {
      await updateDoc(doc(db, 'guest_edit_requests', request.id), {
        status: 'rejected',
        resolvedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Gagal menolak permintaan.');
    }
  };

  if (!appUser) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-medium text-gray-700">Akses Ditolak</h2>
        <p className="text-gray-500 mt-2">Anda harus login untuk mengakses halaman ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Persetujuan Edit Tamu</h1>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Daftar Permintaan ({requests.length})</h3>
          <p className="mt-1 text-sm text-gray-500">
            {appUser.role === 'client' 
              ? 'Status pengajuan penambahan atau perubahan data tamu Anda.' 
              : 'Permintaan edit data tamu dari Client yang menunggu persetujuan Anda.'}
          </p>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat data...</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
             <Check className="w-12 h-12 text-green-200 mb-3" />
             <p className="text-gray-500">Tidak ada permintaan edit yang tertunda.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {requests.map((req) => (
              <li key={req.id} className="p-4 sm:p-6 hover:bg-gray-50">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                       {req.status === 'pending' && (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                           <Clock className="w-3 h-3 mr-1" /> {req.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Menunggu)
                         </span>
                       )}
                       {req.status === 'approved' && (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                           <Check className="w-3 h-3 mr-1" /> {req.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Disetujui)
                         </span>
                       )}
                       {req.status === 'rejected' && (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                           <X className="w-3 h-3 mr-1" /> {req.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Ditolak)
                         </span>
                       )}
                       <span className="text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{req.eventTitle}</span>
                    </div>
                    
                    <div className={`grid ${req.type === 'add' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-4 mt-4 text-sm border border-gray-100 rounded-lg p-4 bg-white`}>
                      {req.type !== 'add' && (
                        <div>
                          <h4 className="font-semibold text-gray-500 mb-2 border-b pb-1 text-xs uppercase tracking-wider">Data Lama</h4>
                          <div className="space-y-1">
                             {req.originalData.name && <p><span className="text-gray-400">Nama:</span> {req.originalData.name}</p>}
                             {req.originalData.phone && <p><span className="text-gray-400">HP:</span> {req.originalData.phone}</p>}
                             {req.originalData.address && <p><span className="text-gray-400">Alamat:</span> {req.originalData.address}</p>}
                             {req.originalData.category && <p><span className="text-gray-400">Kategori:</span> {req.originalData.category}</p>}
                             {req.originalData.session && <p><span className="text-gray-400">Sesi:</span> {req.originalData.session}</p>}
                          </div>
                        </div>
                      )}
                      <div>
                        <h4 className="font-semibold text-indigo-500 mb-2 border-b pb-1 text-xs uppercase tracking-wider">Data Baru</h4>
                        <div className="space-y-1">
                           <p className={req.type !== 'add' && req.originalData.name !== req.requestedData.name ? 'font-medium text-indigo-700' : ''}><span className="text-gray-400">Nama:</span> {req.requestedData.name || '-'}</p>
                           <p className={req.type !== 'add' && req.originalData.phone !== req.requestedData.phone ? 'font-medium text-indigo-700' : ''}><span className="text-gray-400">HP:</span> {req.requestedData.phone || '-'}</p>
                           <p className={req.type !== 'add' && req.originalData.address !== req.requestedData.address ? 'font-medium text-indigo-700' : ''}><span className="text-gray-400">Alamat:</span> {req.requestedData.address || '-'}</p>
                           <p className={req.type !== 'add' && req.originalData.category !== req.requestedData.category ? 'font-medium text-indigo-700' : ''}><span className="text-gray-400">Kategori:</span> {req.requestedData.category || '-'}</p>
                           <p className={req.type !== 'add' && req.originalData.session !== req.requestedData.session ? 'font-medium text-indigo-700' : ''}><span className="text-gray-400">Sesi:</span> {req.requestedData.session || '-'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-row md:flex-col gap-3 shrink-0">
                    {appUser.role === 'client' ? (
                       <button
                         onClick={() => window.open(`https://wa.me/6285158636606?text=Halo%20Admin,%20saya%20ingin%20follow%20up%20pengajuan%20data%20tamu%20untuk%20acara%20${encodeURIComponent(req.eventTitle)}`, '_blank')}
                         className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
                       >
                         Follow up Pengajuan
                       </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleApprove(req)}
                          className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shadow-sm"
                        >
                          <Check className="w-4 h-4 mr-2" /> Setujui
                        </button>
                        <button 
                          onClick={() => handleReject(req)}
                          className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-white text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors shadow-sm"
                        >
                          <X className="w-4 h-4 mr-2" /> Tolak
                        </button>
                      </>
                    )}
                  </div>
                  
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
