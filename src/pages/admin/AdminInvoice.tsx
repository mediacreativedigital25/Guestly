import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, orderBy, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { showAlert, showConfirm } from '../../lib/alerts';
import { CheckCircle, XCircle } from 'lucide-react';

export default function AdminInvoice() {
  const { appUser } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (appUser?.role === 'superadmin') {
      fetchInvoices();
    } else {
      setLoading(false);
    }
  }, [appUser]);

  const fetchInvoices = async () => {
    try {
      // Fetch users first to map names
      let usersMap: Record<string, string> = {};
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        usersSnap.forEach(d => {
          const u = d.data();
          if (u.name) usersMap[u.uid || d.id] = u.name;
        });
      } catch (err) {
        console.warn('Could not fetch users for name mapping', err);
      }

      const q = query(collection(db, 'invoices'));
      const querySnapshot = await getDocs(q);
      const fetchedInvoices: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedInvoices.push({ 
          id: doc.id, 
          ...data,
          userName: data.userName || usersMap[data.userId] || null
        });
      });
      
      // Sort manually by createdAt descended
      fetchedInvoices.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setInvoices(fetchedInvoices);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'invoices');
      showAlert('Error', 'Gagal memuat invoice', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;

    const confirmed = await showConfirm('Apakah Anda yakin ingin mengonfirmasi pembayaran ini?');
    if (!confirmed) return;

    try {
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, 'invoices', invoiceId);
        const serviceRef = doc(db, 'services', invoice.serviceId);
        const userRef = doc(db, 'users', invoice.userId);

        const serviceDoc = await transaction.get(serviceRef);
        const userDoc = await transaction.get(userRef);

        if (!serviceDoc.exists()) {
          throw new Error("Layanan tidak ditemukan.");
        }
        if (!userDoc.exists()) {
          throw new Error("Pengguna tidak ditemukan.");
        }

        const serviceData = serviceDoc.data();
        const userData = userDoc.data();

        const currentEventQuota = userData.eventQuota || 0;
        const currentClientQuota = userData.clientQuota || 0;
        const currentGuestQuota = userData.guestQuota || 0;
        
        let newActiveUntil = userData.activeUntil;
        if (serviceData.activePeriodDays) {
           const now = new Date();
           const currentActiveUntil = userData.activeUntil ? new Date(userData.activeUntil.toMillis()) : now;
           const baseDate = currentActiveUntil > now ? currentActiveUntil : now;
           newActiveUntil = new Date(baseDate.getTime() + serviceData.activePeriodDays * 24 * 60 * 60 * 1000);
        }

        transaction.update(userRef, {
          eventQuota: currentEventQuota + (serviceData.eventQuota || 0),
          clientQuota: currentClientQuota + (serviceData.clientQuota || 0),
          guestQuota: currentGuestQuota + (serviceData.guestQuota || 0),
          ...(newActiveUntil ? { activeUntil: newActiveUntil } : {}),
          updatedAt: serverTimestamp()
        });

        transaction.update(invoiceRef, {
          status: 'paid',
          updatedAt: serverTimestamp()
        });
      });

      setInvoices(invoices.map(inv => inv.id === invoiceId ? { ...inv, status: 'paid' } : inv));
      showAlert('Berhasil', 'Pembayaran berhasil dikonfirmasi dan kuota ditambahkan ke pengguna.', 'success');
    } catch (error) {
      console.error(error);
      showAlert('Gagal', 'Gagal mengonfirmasi pembayaran', 'error');
    }
  };

  const handleCancelPayment = async (invoiceId: string) => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin membatalkan/menolak invoice ini?');
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
      setInvoices(invoices.map(inv => inv.id === invoiceId ? { ...inv, status: 'cancelled' } : inv));
      showAlert('Berhasil', 'Invoice berhasil dibatalkan', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceId}`);
      showAlert('Gagal', 'Gagal membatalkan invoice', 'error');
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat data invoice...</div>;
  }

  if (appUser?.role !== 'superadmin') {
    return <div className="p-6 text-center text-red-500">Akses ditolak. Halaman ini hanya untuk super admin.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Invoice</h1>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pemesan / Service</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                    {inv.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {inv.createdAt ? new Date(inv.createdAt.toMillis()).toLocaleDateString('id-ID') : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    <div className="font-semibold" title={inv.userName || inv.userId}>{inv.userName || inv.userId}</div>
                    <div className="text-gray-500 text-xs truncate" title={inv.serviceName}>{inv.serviceName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    Rp {inv.amount?.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                      inv.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {inv.status === 'paid' ? 'Lunas' : inv.status === 'cancelled' ? 'Dibatalkan' : 'Menunggu Pembayaran'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    {inv.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleConfirmPayment(inv.id)}
                          className="px-3 py-1 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors inline-flex items-center gap-1"
                          title="Konfirmasi Pembayaran Manual"
                        >
                          <CheckCircle className="w-4 h-4" /> Konfirmasi
                        </button>
                        <button
                          onClick={() => handleCancelPayment(inv.id)}
                          className="px-3 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors inline-flex items-center"
                          title="Batalkan Invoice"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && (
            <div className="p-6 text-center text-gray-500">Belum ada invoice dalam sistem.</div>
          )}
        </div>
      </div>
    </div>
  );
}
