import React, { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { CheckCircle, Clock } from 'lucide-react';

export default function MyServices() {
  const { appUser, currentUser } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      if (!currentUser) return;
      try {
        setLoading(true);
        const q = query(
          collection(db, 'invoices'),
          where('userId', '==', currentUser.uid),
          where('status', '==', 'paid')
        );
        const querySnapshot = await getDocs(q);
        const fetchedInvoices: any[] = [];
        querySnapshot.forEach((doc) => {
          fetchedInvoices.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort manually by createdAt descended
        fetchedInvoices.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setInvoices(fetchedInvoices);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'invoices');
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, [currentUser]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    // Handle Firestore Timestamp
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
    }
    // Handle potential JS Date string/number just in case
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  const getActiveUntilDate = () => {
    if (!appUser?.activeUntil) return '-';
    if (appUser.activeUntil.toDate) return formatDate(appUser.activeUntil);
    if (typeof appUser.activeUntil === 'string') return formatDate(new Date(appUser.activeUntil));
    // Check if Timestamp has seconds
    if (appUser.activeUntil.seconds) return formatDate(new Date(appUser.activeUntil.seconds * 1000));
    return '-';
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat data layanan...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Layanan Saya</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Status Akun Aktif</h2>
            <p className="text-sm text-gray-500">Sebagai <span className="uppercase text-xs font-bold text-gray-700">{appUser?.role}</span></p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="border border-gray-100 bg-gray-50 rounded-lg p-5">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Masa Aktif Hingga</p>
            <p className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              {appUser?.activeUntil ? getActiveUntilDate() : 'Selamanya (Tanpa Batas)'}
            </p>
          </div>
          
          <div className="border border-gray-100 bg-gray-50 rounded-lg p-5">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Kuota Acara</p>
            <p className="text-2xl font-bold text-gray-900">
              {appUser?.eventQuota !== undefined ? appUser.eventQuota : 0} <span className="text-sm font-normal text-gray-500">Acara</span>
            </p>
          </div>

          {(appUser?.role === 'partner' || appUser?.role === 'superadmin') && (
            <div className="border border-gray-100 bg-gray-50 rounded-lg p-5">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Kuota Client</p>
              <p className="text-2xl font-bold text-gray-900">
                {appUser?.clientQuota !== undefined ? appUser.clientQuota : 0} <span className="text-sm font-normal text-gray-500">Client</span>
              </p>
            </div>
          )}

          <div className="border border-gray-100 bg-gray-50 rounded-lg p-5">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Kuota Tamu (Per Acara)</p>
            <p className="text-2xl font-bold text-gray-900">
              {appUser?.guestQuota !== undefined ? appUser.guestQuota : 0} <span className="text-sm font-normal text-gray-500">Tamu</span>
            </p>
          </div>
        </div>
      </div>

      <h3 className="text-lg font-bold text-gray-900 mt-8 mb-4">Riwayat Pembelian Layanan</h3>
      
      {invoices.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          Belum ada riwayat pembelian layanan.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama Layanan</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tanggal Beli</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-gray-900">{invoice.serviceName}</p>
                      <p className="text-xs text-gray-500">#{invoice.id}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(invoice.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
