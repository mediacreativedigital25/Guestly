import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { Modal } from '../../components/Modal';
import { showAlert, showConfirm } from '../../lib/alerts';
import { Copy, Check, MessageCircle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MyInvoices() {
  const { appUser, currentUser } = useAuth();
  const { settings } = useSettings();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    
    const fetchInvoices = async () => {
      if (!currentUser) return;
      try {
        setLoading(true);
        const q = query(
          collection(db, 'invoices'),
          where('userId', '==', currentUser.uid)
        );
        const { getDocs } = await import('firebase/firestore');
        const querySnapshot = await getDocs(q);
        const fetchedInvoices = [];
        querySnapshot.forEach((doc) => {
          fetchedInvoices.push({ id: doc.id, ...doc.data() });
        });
            
        // Sort manually by createdAt descended
        fetchedInvoices.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setInvoices(fetchedInvoices);
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'setup_invoices_listener');
        setLoading(false);
      }
    };

    fetchInvoices();
    
    return () => {};
  }, [currentUser]);

  
  const handleLoadMore = async () => {
    if (!lastVisible || !currentUser) return;
    setLoadingMore(true);
    try {
      const { startAfter, limit } = await import('firebase/firestore');
      const q = query(
        collection(db, 'invoices'),
        where('userId', '==', currentUser.uid),
        startAfter(lastVisible),
        limit(50)
      );
      const querySnapshot = await getDocs(q);
      const fetchedInvoices: any[] = [];
      querySnapshot.forEach((doc) => {
        fetchedInvoices.push({ id: doc.id, ...doc.data() });
      });
      fetchedInvoices.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setInvoices(prev => [...prev, ...fetchedInvoices]);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      setHasMore(querySnapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more invoices", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePayNow = (invoice: any) => {
    setSelectedInvoice(invoice);
    setIsPaymentModalOpen(true);
  };

  const handleCancelInvoice = async (invoiceId: string, serviceName: string) => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin membatalkan pesanan ini?');
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
      setInvoices(invoices.map(inv => inv.id === invoiceId ? { ...inv, status: 'cancelled' } : inv));
      showAlert('Berhasil', 'Pesanan berhasil dibatalkan', 'success');

      if (appUser?.phone) {
        import('../../lib/fonnte').then(({ sendFonnteMessage }) => {
          let message = `Halo ${appUser.name || 'User'},\n\nPesanan Anda untuk layanan *${serviceName}* dengan nomor Invoice *${invoiceId}* telah Anda batalkan.\n\nJika ada pertanyaan silakan hubungi kami.\n\nTerima kasih,\nAdmin Guestly`;
          
          if (settings.fonnteTemplates?.orderCancelled) {
            // we don't have exact amount here easily, so we just pass what we have
            message = settings.fonnteTemplates.orderCancelled
              .replace(/{userName}/g, appUser.name || 'User')
              .replace(/{serviceName}/g, serviceName)
              .replace(/{invoiceId}/g, invoiceId)
              .replace(/{amount}/g, '');
          }

          sendFonnteMessage(null, appUser.phone, message);
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceId}`);
      showAlert('Gagal', 'Gagal membatalkan pesanan', 'error');
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat data invoice...</div>;
  }

  return (
    <div className="space-y-6">
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
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-semibold">{inv.serviceName}</div>
                      {inv.items && inv.items.length > 1 && (
                        <div className="flex gap-1 mt-1">
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded border border-purple-200">
                            {inv.items.length} Layanan Termasuk
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      Rp {inv.amount?.toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                        inv.status === 'pending_verification' ? 'bg-blue-100 text-blue-800' :
                        inv.status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {inv.status === 'paid' ? 'Lunas' : inv.status === 'pending_verification' ? 'Menunggu Verifikasi' : inv.status === 'cancelled' ? 'Dibatalkan' : 'Menunggu Pembayaran'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      {inv.status === 'pending' || inv.status === 'pending_verification' ? (
                        <>
                          <Link
                            to={`/pay/${inv.id}`}
                            className="text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Bayar</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => handlePayNow(inv)}
                            className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors inline-block cursor-pointer"
                            title="Rincian Instruksi"
                          >
                            Detail
                          </button>
                          {inv.status === 'pending' && (
                            <button
                              onClick={() => handleCancelInvoice(inv.id, inv.serviceName)}
                              className="text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors inline-block cursor-pointer"
                            >
                              Batal
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Link
                            to={`/pay/${inv.id}`}
                            className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Lihat Bukti</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
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
            {/* Items Breakdown if multi-item */}
            {selectedInvoice.items && Array.isArray(selectedInvoice.items) && selectedInvoice.items.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                <div className="bg-gray-50 px-3.5 py-2 border-b border-gray-200 font-semibold text-gray-700">
                  Rincian Layanan &amp; Add-on
                </div>
                <div className="divide-y divide-gray-100 bg-white">
                  {selectedInvoice.items.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex justify-between items-center gap-2">
                      <div>
                        <span className="font-semibold text-gray-900 block">{item.serviceName}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${item.type === 'package' ? 'bg-rose-50 text-[#8C3A50]' : 'bg-purple-50 text-purple-700'}`}>
                            {item.type === 'package' ? 'Paket Utama' : 'Add-on'}
                          </span>
                          {item.quantity > 1 && (
                            <span className="text-gray-500 text-[11px]">x{item.quantity}</span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-gray-900">
                        Rp {((item.price || 0) * (item.quantity || 1)).toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <p className="text-xs text-blue-800 font-bold uppercase tracking-wider mb-1">Informasi Tagihan</p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Total Pembayaran:</span>
                <span className="font-black text-gray-900 font-mono text-xl">Rp {selectedInvoice.amount?.toLocaleString('id-ID')}</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-900">Instruksi Pembayaran</h4>
              {settings?.activePaymentMethod === 'tripay' ? (
                <p className="text-sm text-gray-600">
                  Pembayaran menggunakan Payment Gateway sedang dalam pengaturan. Silakan gunakan metode manual untuk sementara atau hubungi admin.
                </p>
              ) : selectedInvoice.paymentMethod === 'qris' || settings?.activePaymentMethod === 'qris' ? (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm text-gray-700 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {settings?.qrisPayment?.merchantName || 'Pembayaran via QRIS'}
                      </p>
                      {settings?.qrisPayment?.nmid && (
                        <p className="text-xs font-mono text-gray-500">
                          NMID: {settings.qrisPayment.nmid}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded">
                      QRIS Semua E-Wallet &amp; Bank
                    </span>
                  </div>

                  {settings?.qrisPayment?.qrisImageUrl ? (
                    <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-lg p-4">
                      <img
                        src={settings.qrisPayment.qrisImageUrl}
                        alt="Kode QRIS"
                        className="max-w-[240px] w-full h-auto object-contain"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">
                      Gambar QRIS belum diunggah oleh Admin. Silakan hubungi Admin melalui tombol WhatsApp di bawah.
                    </p>
                  )}

                  <p className="text-xs text-gray-500 whitespace-pre-line">
                    {settings?.qrisPayment?.instructions ||
                      'Silakan scan kode QRIS di atas menggunakan aplikasi M-Banking atau E-Wallet (GoPay, OVO, DANA, ShopeePay), lalu konfirmasi bukti pembayaran ke admin.'}
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm text-gray-700 space-y-2">
                  <p>Silakan transfer ke rekening berikut:</p>
                  <div className="font-mono bg-white p-3 border border-gray-200 rounded">
                    <div>Bank: <span className="font-bold text-gray-900">{settings?.manualPayment?.bankName || 'BCA'}</span></div>
                    <div className="flex items-center gap-2 mt-1">
                      <span>No Rek: <span className="font-bold text-gray-900">{settings?.manualPayment?.accountNumber || '1234567890'}</span></span>
                      <button 
                        onClick={() => handleCopy(settings?.manualPayment?.accountNumber || '1234567890')}
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-500 transition-colors" 
                        title="Copy Rekening"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="mt-1">A.N: <span className="font-bold text-gray-900">{settings?.manualPayment?.accountName || 'PT Guestly'}</span></div>
                  </div>
                  <p className="text-xs text-gray-500 pt-2">
                    {settings?.manualPayment?.instructions || 'Setelah melakukan transfer, silakan konfirmasi ke admin.'}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end pt-4 gap-2 flex-wrap sm:flex-nowrap">
              <a
                href={`/pay/${selectedInvoice?.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto text-xs sm:text-sm"
              >
                <ExternalLink className="w-4 h-4" /> Buka Halaman Bayar
              </a>
              {settings?.activePaymentMethod !== 'tripay' && (
                <a
                  href={`https://wa.me/${settings?.adminPhone || '6285158636606'}?text=${encodeURIComponent(`Halo Admin, saya ingin konfirmasi pembayaran untuk Invoice ${selectedInvoice?.id} atas layanan ${selectedInvoice?.serviceName}. Berikut saya lampirkan bukti transfernya.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 w-full sm:w-auto text-xs sm:text-sm"
                >
                  <MessageCircle className="w-4 h-4" /> Kirim Bukti via WhatsApp
                </a>
              )}
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors w-full sm:w-auto text-center text-xs sm:text-sm cursor-pointer"
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
