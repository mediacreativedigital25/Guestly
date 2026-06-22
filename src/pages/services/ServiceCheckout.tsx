import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { runTransaction, doc, getDoc, collection, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { GuestlyService } from '../../types';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { showAlert, showConfirm } from '../../lib/alerts';
import { Copy, Check } from 'lucide-react';

export default function ServiceCheckout() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const { appUser, currentUser } = useAuth();
  const { settings } = useSettings();
  
  const [service, setService] = useState<GuestlyService | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Change default payment method if active payment method is 'tripay'
  useEffect(() => {
    if (settings?.activePaymentMethod === 'tripay') {
      setPaymentMethod('qris');
    } else {
      setPaymentMethod('transfer');
    }
  }, [settings?.activePaymentMethod]);

  useEffect(() => {
    if (!serviceId) return;
    
    const fetchService = async () => {
      try {
        const docRef = doc(db, 'services', serviceId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setService({ id: docSnap.id, ...docSnap.data() } as GuestlyService);
        } else {
          // Service not found
          navigate('/auth/login/services/catalog');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `services/${serviceId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchService();
  }, [serviceId, navigate]);

  const handleOrder = async () => {
    if (!service) return;
    
    if (!currentUser) {
      showAlert('Peringatan', 'Silakan login terlebih dahulu untuk membuat pesanan.', 'warning');
      return;
    }

    const confirmed = await showConfirm("Apakah Anda yakin ingin membuat pesanan ini?");
    if (!confirmed) {
      return;
    }

    setOrdering(true);
    
    try {
      const counterRef = doc(db, 'counters', 'invoice');
      let createdInvoiceId = '';
      
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let currentSeq = 1;
        if (counterDoc.exists()) {
          currentSeq = counterDoc.data().seq + 1;
          transaction.update(counterRef, { seq: currentSeq });
        } else {
          transaction.set(counterRef, { seq: currentSeq });
        }

        const paddedSeq = currentSeq.toString().padStart(5, '0');
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const invoiceId = `IN${year}${month}${paddedSeq}`;
        createdInvoiceId = invoiceId;

        const newInvoiceRef = doc(db, 'invoices', invoiceId);
        
        transaction.set(newInvoiceRef, {
          userId: currentUser.uid,
          userName: appUser?.name || currentUser.displayName || currentUser.email || 'Unknown User',
          userPhone: appUser?.phone || '',
          serviceId: service.id,
          serviceName: service.name,
          amount: service.price,
          status: 'pending',
          paymentMethod: paymentMethod,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      
      // Send Fonnte WhatsApp Notification
      if (appUser?.phone) {
        import('../../lib/fonnte').then(({ sendFonnteMessage }) => {
          let message = `Halo ${appUser.name || 'User'},\n\nPesanan Anda untuk layanan *${service.name}* telah berhasil dibuat.\nNomor Invoice: *${createdInvoiceId}*\nTotal: *Rp ${service.price.toLocaleString('id-ID')}*\nStatus: *Pending*\n\nSilakan selesaikan pembayaran sesuai instruksi pada aplikasi.\n\nTerima kasih,\nAdmin Guestly`;
          
          if (settings.fonnteTemplates?.orderCreated) {
            message = settings.fonnteTemplates.orderCreated
              .replace(/{userName}/g, appUser.name || 'User')
              .replace(/{serviceName}/g, service.name)
              .replace(/{invoiceId}/g, createdInvoiceId)
              .replace(/{amount}/g, `Rp ${service.price.toLocaleString('id-ID')}`);
          }
          
          sendFonnteMessage(null, appUser.phone!, message);
        });
      }
      
      showAlert('Berhasil', 'Pesanan berhasil dibuat!', 'success');
      // Navigate to my invoices page
      navigate('/auth/login/invoices/my');
    } catch (error) {
      console.error("Order error:", error);
      showAlert('Gagal', 'Gagal membuat pesanan. Silakan periksa koneksi Anda atau hubungi admin.', 'error');
      try {
        handleFirestoreError(error, OperationType.CREATE, 'invoices');
      } catch (e) {
        // ignore the thrown error from handleFirestoreError so we don't crash
      }
    } finally {
      setOrdering(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Memuat rincian layanan...</div>;
  }

  if (!service) {
    return null; // Handled by redirect in useEffect
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Checkout Layanan</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100">Rincian Layanan</h2>
            
            <div className="flex flex-col gap-1">
              <h3 className="text-xl font-bold text-gray-900">{service.name}</h3>
              <p className="text-gray-500 text-sm whitespace-pre-line mt-2">{service.description}</p>
            </div>
            
            <div className="mt-6 space-y-3 pt-6 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700">Yang Anda dapatkan:</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                 {service.activePeriodDays ? (
                   <li className="flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                     Masa aktif {service.activePeriodDays} hari
                   </li>
                 ) : (
                   <li className="flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                     Masa aktif selamanya
                   </li>
                 )}
                 {service.eventQuota ? (
                   <li className="flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                     Termasuk kuota {service.eventQuota} acara
                   </li>
                 ) : null}
                 {service.guestQuota ? (
                   <li className="flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                     Kapasitas blast {service.guestQuota} tamu undangan
                   </li>
                 ) : null}
              </ul>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100">Metode Pembayaran</h2>
            
            <div className="space-y-3">
              {(!settings?.activePaymentMethod || settings?.activePaymentMethod === 'manual') ? (
                <label className={`flex flex-col p-4 border rounded-lg cursor-pointer transition-colors ${paymentMethod === 'transfer' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-300'}`}>
                  <div className="flex items-center">
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="transfer" 
                      checked={paymentMethod === 'transfer'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    <div className="ml-3 flex-1 flex justify-between items-center">
                      <span className="block text-sm font-medium text-gray-900">Transfer Bank Manual</span>
                      <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded">Manual</span>
                    </div>
                  </div>
                  {paymentMethod === 'transfer' && settings?.manualPayment && (
                    <div className="ml-7 mt-3 p-3 bg-white border border-indigo-100 rounded text-sm text-gray-600">
                      <p className="font-semibold text-gray-900 mb-1">Informasi Rekening:</p>
                      <div className="space-y-1">
                        <p><span className="text-gray-500">Bank:</span> {settings.manualPayment.bankName || '-'}</p>
                        <div className="flex items-center gap-2">
                          <p><span className="text-gray-500">No. Rekening:</span> <span className="font-mono font-medium">{settings.manualPayment.accountNumber || '-'}</span></p>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              handleCopy(settings?.manualPayment?.accountNumber || '');
                            }}
                            className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors" 
                            title="Copy Rekening"
                          >
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <p><span className="text-gray-500">Atas Nama:</span> {settings.manualPayment.accountName || '-'}</p>
                      </div>
                      {settings.manualPayment.instructions && (
                        <div className="mt-2 text-xs bg-gray-50 p-2 rounded text-gray-500 whitespace-pre-line">
                          {settings.manualPayment.instructions}
                        </div>
                      )}
                    </div>
                  )}
                </label>
              ) : (
                <>
                  <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${paymentMethod === 'qris' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-300'}`}>
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="qris" 
                      checked={paymentMethod === 'qris'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    <div className="ml-3 flex-1 flex justify-between items-center">
                      <span className="block text-sm font-medium text-gray-900">QRIS (OVO, GoPay, DANA)</span>
                      <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded">Otomatis via Tripay</span>
                    </div>
                  </label>
                  
                  <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${paymentMethod === 'virtual_account' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-300'}`}>
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="virtual_account" 
                      checked={paymentMethod === 'virtual_account'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    <div className="ml-3 flex-1 flex justify-between items-center">
                      <span className="block text-sm font-medium text-gray-900">Virtual Account</span>
                      <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded">Otomatis via Tripay</span>
                    </div>
                  </label>
    
                  <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${paymentMethod === 'credit_card' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-300'}`}>
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="credit_card" 
                      checked={paymentMethod === 'credit_card'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    <div className="ml-3 flex-1 flex justify-between items-center">
                      <span className="block text-sm font-medium text-gray-900">Kartu Kredit / Debit</span>
                      <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded">Visa/Mastercard</span>
                    </div>
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="md:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100">Ringkasan Pesanan</h2>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-900">
                  Rp {service.normalPrice && service.normalPrice > service.price ? service.normalPrice.toLocaleString('id-ID') : service.price.toLocaleString('id-ID')}
                </span>
              </div>
              
              {service.normalPrice && service.normalPrice > service.price && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Diskon Layanan</span>
                  <span>- Rp {(service.normalPrice - service.price).toLocaleString('id-ID')}</span>
                </div>
              )}
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Biaya Layanan</span>
                <span className="font-medium text-gray-900">Rp 0</span>
              </div>
            </div>
            
            <div className="pt-4 border-t border-dashed border-gray-200 mb-6 flex justify-between items-end">
              <span className="text-base font-semibold text-gray-900">Total Harga</span>
              <span className="text-2xl font-black text-indigo-700">Rp {service.price.toLocaleString('id-ID')}</span>
            </div>
            
            <button
              onClick={handleOrder}
              disabled={ordering}
              className="w-full bg-indigo-600 text-white font-semibold py-3.5 rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm"
            >
              {ordering ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Memproses...
                </>
              ) : (
                "Pesan Sekarang"
              )}
            </button>
            <p className="text-xs text-gray-400 text-center mt-4">
              Dengan melanjutkan, Anda menyetujui Syarat dan Ketentuan layanan kami.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
