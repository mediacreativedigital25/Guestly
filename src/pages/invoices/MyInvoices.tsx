import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { Modal } from '../../components/Modal';

export default function MyInvoices() {
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  useEffect(() => {
    const fetchInvoices = async () => {
      if (!currentUser) return;
      try {
        const q = query(
          collection(db, 'invoices'),
          where('userId', '==', currentUser.uid)
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

    fetchInvoices();
  }, [currentUser]);

  const handlePayNow = (invoice: any) => {
    setSelectedInvoice(invoice);
    setIsPaymentModalOpen(true);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat data invoice...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invoice Saya</h1>
      </div>
      
      {invoices.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <p className="text-gray-500">Belum ada invoice. Pesan layanan untuk mulai.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Pesanan (Invoice)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Layanan</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {inv.serviceName}
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {inv.status === 'pending' && (
                        <button
                          onClick={() => handlePayNow(inv)}
                          className="text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                        >
                          Bayar Sekarang
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <Modal 
        isOpen={isPaymentModalOpen} 
        onClose={() => setIsPaymentModalOpen(false)} 
        title="Pembayaran Layanan"
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-md">
              <p className="text-sm text-blue-800 font-medium mb-1">Informasi Tagihan</p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Total Harga:</span>
                <span className="font-bold text-gray-900 font-mono text-lg">Rp {selectedInvoice.amount?.toLocaleString('id-ID')}</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-900">Instruksi Pembayaran</h4>
              {settings?.activePaymentMethod === 'tripay' ? (
                <p className="text-sm text-gray-600">
                  Pembayaran menggunakan Payment Gateway sedang dalam pengaturan. Silakan gunakan metode manual untuk sementara atau hubungi admin.
                </p>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm text-gray-700 space-y-2">
                  <p>Silakan transfer ke rekening berikut:</p>
                  <div className="font-mono bg-white p-3 border border-gray-200 rounded">
                    <div>Bank: <span className="font-bold text-gray-900">{settings?.manualPayment?.bankName || 'BCA'}</span></div>
                    <div>No Rek: <span className="font-bold text-gray-900">{settings?.manualPayment?.accountNumber || '1234567890'}</span></div>
                    <div>A.N: <span className="font-bold text-gray-900">{settings?.manualPayment?.accountName || 'PT Guestly'}</span></div>
                  </div>
                  <p className="text-xs text-gray-500 pt-2">
                    {settings?.manualPayment?.instructions || 'Setelah melakukan transfer, silakan konfirmasi ke admin.'}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
