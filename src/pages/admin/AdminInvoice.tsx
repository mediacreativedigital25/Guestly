import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, orderBy, serverTimestamp, runTransaction, getDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { showAlert, showConfirm } from '../../lib/alerts';
import { CheckCircle, XCircle, Eye, ShoppingBag, Layers, Users, Send, Calendar, Clock, ExternalLink, Copy, Check, Image as ImageIcon, MessageCircle } from 'lucide-react';
import { Modal } from '../../components/Modal';

export default function AdminInvoice() {
  const { appUser } = useAuth();
  const { settings } = useSettings();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [copiedInvId, setCopiedInvId] = useState<string | null>(null);

  const handleCopyPaymentLink = (invId: string) => {
    const url = `${window.location.origin}/pay/${invId}`;
    navigator.clipboard.writeText(url);
    setCopiedInvId(invId);
    showAlert('Tersalin', 'Link pembayaran berhasil disalin ke clipboard!', 'success');
    setTimeout(() => setCopiedInvId(null), 2000);
  };


  useEffect(() => {
    if (appUser?.role === 'superadmin') {
      const setupData = async () => {
        setLoading(true);
        let usersMap = {};
        
        try {
          const usersSnap = await getDocs(collection(db, 'users'));
          usersSnap.forEach(d => {
            const u = d.data();
            if (u.name) usersMap[u.uid || d.id] = u.name;
          });
          
          const q = query(collection(db, 'invoices'));
          const querySnapshot = await getDocs(q);
          const fetchedInvoices = [];
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
          setLoading(false);
        } catch (error) {
           handleFirestoreError(error, OperationType.GET, 'admin_invoices_setup');
           setLoading(false);
        }
      };

      setupData();
    } else {
      setLoading(false);
    }

    return () => {
      
    };
  }, [appUser]);

  const handleConfirmPayment = async (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;

    const confirmed = await showConfirm('Apakah Anda yakin ingin mengonfirmasi pembayaran ini?');
    if (!confirmed) return;

    try {
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, 'invoices', invoiceId);
        const userRef = doc(db, 'users', invoice.userId);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
          throw new Error("Pengguna tidak ditemukan.");
        }

        const userData = userDoc.data();
        const currentEventQuota = userData.eventCredit !== undefined ? userData.eventCredit : (userData.eventQuota || 0);
        const currentClientQuota = userData.clientCredit !== undefined ? userData.clientCredit : (userData.clientQuota || 0);
        const currentGuestQuota = userData.guestQuota || 0;
        const currentWaBlastQuota = userData.waBlastQuota || 0;

        let addedEventQuota = 0;
        let addedClientQuota = 0;
        let addedGuestQuota = 0;
        let addedWaBlastQuota = 0;
        let addedActiveDays = 0;

        // Check if invoice has structured multi-item array
        if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
          invoice.items.forEach((item: any) => {
            const qty = item.quantity || 1;
            addedEventQuota += (item.eventQuota || 0) * qty;
            addedClientQuota += (item.clientQuota || 0) * qty;
            addedGuestQuota += (item.guestQuota || 0) * qty;
            addedWaBlastQuota += (item.waBlastQuota || 0) * qty;
            addedActiveDays += (item.activePeriodDays || 0) * qty;
          });
        } else if (invoice.serviceId) {
          // Legacy single service checkout
          const serviceRef = doc(db, 'services', invoice.serviceId);
          const serviceDoc = await transaction.get(serviceRef);
          if (serviceDoc.exists()) {
            const serviceData = serviceDoc.data();
            addedEventQuota = serviceData.eventQuota || 0;
            addedClientQuota = serviceData.clientQuota || 0;
            addedGuestQuota = serviceData.guestQuota || 0;
            addedWaBlastQuota = serviceData.waBlastQuota || 0;
            addedActiveDays = serviceData.activePeriodDays || 0;
          }
        }

        let newActiveUntil = userData.activeUntil;
        if (addedActiveDays > 0) {
          const now = new Date();
          const currentActiveUntil = userData.activeUntil?.toMillis
            ? new Date(userData.activeUntil.toMillis())
            : (userData.activeUntil ? new Date(userData.activeUntil) : now);
          const baseDate = currentActiveUntil > now ? currentActiveUntil : now;
          newActiveUntil = new Date(baseDate.getTime() + addedActiveDays * 24 * 60 * 60 * 1000);
        }

        const nextEventQuota = currentEventQuota + addedEventQuota;
        const nextClientQuota = currentClientQuota + addedClientQuota;
        const nextGuestQuota = currentGuestQuota + addedGuestQuota;
        const nextWaBlastQuota = currentWaBlastQuota + addedWaBlastQuota;

        transaction.update(userRef, {
          eventQuota: nextEventQuota,
          eventCredit: nextEventQuota,
          clientQuota: nextClientQuota,
          clientCredit: nextClientQuota,
          guestQuota: nextGuestQuota,
          waBlastQuota: nextWaBlastQuota,
          ...(newActiveUntil ? { activeUntil: newActiveUntil } : {}),
          updatedAt: serverTimestamp(),
        });

        transaction.update(invoiceRef, {
          status: 'paid',
          updatedAt: serverTimestamp(),
        });
      });

      setInvoices(invoices.map(inv => inv.id === invoiceId ? { ...inv, status: 'paid' } : inv));
      showAlert('Berhasil', 'Pembayaran berhasil dikonfirmasi dan kuota ditambahkan ke pengguna.', 'success');
      
      // Send Fonnte WhatsApp Notification
      const userRefQuery = await getDoc(doc(db, 'users', invoice.userId));
      if (userRefQuery.exists()) {
        const uData = userRefQuery.data();
        if (uData.phone) {
          import('../../lib/fonnte').then(({ sendFonnteMessage }) => {
            let message = `Halo ${uData.name || 'User'},\n\nPembayaran untuk pesanan layanan *${invoice.serviceName}* dengan nomor Invoice *${invoiceId}* telah berhasil dikonfirmasi.\n\nLayanan Anda sudah aktif dan kuota telah ditambahkan ke akun Anda.\n\nTerima kasih,\nAdmin Guestly`;
            
            if (settings.fonnteTemplates?.orderPaid) {
              message = settings.fonnteTemplates.orderPaid
                .replace(/{userName}/g, uData.name || 'User')
                .replace(/{serviceName}/g, invoice.serviceName)
                .replace(/{invoiceId}/g, invoiceId)
                .replace(/{amount}/g, `Rp ${(invoice.amount || 0).toLocaleString('id-ID')}`);
            }
            
            sendFonnteMessage(null, uData.phone, message);
          });
        }
      }
    } catch (error) {
      console.error(error);
      showAlert('Gagal', 'Gagal mengonfirmasi pembayaran', 'error');
    }
  };

  const handleCancelPayment = async (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    const confirmed = await showConfirm('Apakah Anda yakin ingin membatalkan/menolak invoice ini?');
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
      setInvoices(invoices.map(inv => inv.id === invoiceId ? { ...inv, status: 'cancelled' } : inv));
      showAlert('Berhasil', 'Invoice berhasil dibatalkan', 'success');
      
      if (invoice?.userId) {
        const userRefQuery = await getDoc(doc(db, 'users', invoice.userId));
        if (userRefQuery.exists()) {
          const uData = userRefQuery.data();
          if (uData.phone) {
            import('../../lib/fonnte').then(({ sendFonnteMessage }) => {
              let message = `Halo ${uData.name || 'User'},\n\nMohon maaf, pesanan layanan *${invoice?.serviceName}* dengan nomor Invoice *${invoiceId}* telah dibatalkan.\n\nJika ada pertanyaan silakan hubungi kami.\n\nTerima kasih,\nAdmin Guestly`;
              
              if (settings.fonnteTemplates?.orderCancelled) {
                message = settings.fonnteTemplates.orderCancelled
                  .replace(/{userName}/g, uData.name || 'User')
                  .replace(/{serviceName}/g, invoice?.serviceName || '')
                  .replace(/{invoiceId}/g, invoiceId)
                  .replace(/{amount}/g, `Rp ${(invoice?.amount || 0).toLocaleString('id-ID')}`);
              }
              
              sendFonnteMessage(null, uData.phone, message);
            });
          }
        }
      }
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
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                    <div className="font-semibold" title={inv.userName || inv.userId}>{inv.userName || inv.userId}</div>
                    <div className="text-gray-500 text-xs flex items-center gap-1.5 flex-wrap" title={inv.serviceName}>
                      <span>{inv.serviceName}</span>
                      {inv.items && inv.items.length > 1 && (
                        <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 text-[10px] font-bold rounded border border-purple-200">
                          {inv.items.length} item
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    Rp {inv.amount?.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                        inv.status === 'pending_verification' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                        inv.status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {inv.status === 'paid' ? 'Lunas' : inv.status === 'pending_verification' ? 'Menunggu Verifikasi' : inv.status === 'cancelled' ? 'Dibatalkan' : 'Menunggu Pembayaran'}
                      </span>
                      {inv.paymentProofUrl && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> Ada Bukti Transfer
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-1.5">
                    <button
                      onClick={() => setViewingInvoice(inv)}
                      className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
                      title="Lihat Detail Item"
                    >
                      <Eye className="w-3.5 h-3.5" /> Detail
                    </button>
                    {(inv.status === 'pending' || inv.status === 'pending_verification') && (
                      <>
                        <button
                          onClick={() => handleCopyPaymentLink(inv.id)}
                          className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                          title="Salin Link Pembayaran Pelanggan"
                        >
                          {copiedInvId === inv.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>Link Bayar</span>
                        </button>
                        <button
                          onClick={() => handleConfirmPayment(inv.id)}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 transition-colors inline-flex items-center gap-1 text-xs font-bold cursor-pointer"
                          title="Konfirmasi Pembayaran Lunas"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Konfirmasi
                        </button>
                        <button
                          onClick={() => handleCancelPayment(inv.id)}
                          className="px-2 py-1 bg-rose-50 text-rose-600 rounded-md hover:bg-rose-100 transition-colors inline-flex items-center cursor-pointer"
                          title="Batalkan Invoice"
                        >
                          <XCircle className="w-3.5 h-3.5" />
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

      {/* Invoice Detail Breakdown Modal */}
      <Modal
        isOpen={Boolean(viewingInvoice)}
        onClose={() => setViewingInvoice(null)}
        title={`Rincian Invoice #${viewingInvoice?.id || ''}`}
      >
        {viewingInvoice && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Pemesan:</span>
                <span className="font-bold text-slate-900">{viewingInvoice.userName || viewingInvoice.userId}</span>
                {viewingInvoice.userPhone && (
                  <span className="text-slate-500 block mt-0.5">{viewingInvoice.userPhone}</span>
                )}
              </div>
              <div>
                <span className="text-slate-500 block">Metode Pembayaran:</span>
                <span className="font-semibold text-slate-800 uppercase tracking-wider">{viewingInvoice.paymentMethod || 'Manual'}</span>
                <span className={`block mt-1 text-[11px] font-bold ${viewingInvoice.status === 'paid' ? 'text-emerald-700' : viewingInvoice.status === 'pending_verification' ? 'text-blue-700' : viewingInvoice.status === 'cancelled' ? 'text-rose-700' : 'text-amber-700'}`}>
                  Status: {viewingInvoice.status === 'paid' ? 'Lunas' : viewingInvoice.status === 'pending_verification' ? 'Menunggu Verifikasi' : viewingInvoice.status === 'cancelled' ? 'Dibatalkan' : 'Menunggu Pembayaran'}
                </span>
              </div>
            </div>

            {/* Payment Proof Preview if uploaded */}
            {viewingInvoice.paymentProofUrl && (
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-900 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" /> Bukti Pembayaran / Struk Transfer
                  </span>
                  <a
                    href={viewingInvoice.paymentProofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-blue-700 hover:text-blue-800 underline inline-flex items-center gap-1"
                  >
                    <span>Buka Ukuran Asli</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="bg-white p-2 rounded-lg border border-blue-100 flex justify-center">
                  <img
                    src={viewingInvoice.paymentProofUrl}
                    alt="Bukti Transfer"
                    className="max-h-52 w-auto object-contain rounded-md"
                  />
                </div>
              </div>
            )}

            {/* Public Link Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs">
              <div className="truncate">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Link Pembayaran Publik:</span>
                <span className="font-mono text-slate-700 truncate block">
                  {window.location.origin}/pay/{viewingInvoice.id}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyPaymentLink(viewingInvoice.id)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                  title="Salin Link"
                >
                  {copiedInvId === viewingInvoice.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Salin</span>
                </button>
                <a
                  href={`/pay/${viewingInvoice.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-lg font-medium inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka</span>
                </a>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Daftar Item Layanan &amp; Add-on
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100/70">
                    <tr>
                      <th className="px-3.5 py-2.5 text-left font-semibold text-slate-600">Layanan</th>
                      <th className="px-3.5 py-2.5 text-center font-semibold text-slate-600">Qty</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold text-slate-600">Harga Satuan</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold text-slate-600">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {viewingInvoice.items && Array.isArray(viewingInvoice.items) && viewingInvoice.items.length > 0 ? (
                      viewingInvoice.items.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-3.5 py-2.5">
                            <span className="font-semibold text-slate-900 block">{item.serviceName}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${item.type === 'package' ? 'bg-rose-50 text-[#8C3A50]' : 'bg-purple-50 text-purple-700'}`}>
                              {item.type === 'package' ? 'Paket Utama' : 'Add-on'}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-center font-mono font-medium">
                            {item.quantity || 1}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-slate-600">
                            Rp {(item.price || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900">
                            Rp {((item.price || 0) * (item.quantity || 1)).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3.5 py-2.5 font-semibold text-slate-900">
                          {viewingInvoice.serviceName}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono">1</td>
                        <td className="px-3.5 py-2.5 text-right font-mono">Rp {(viewingInvoice.amount || 0).toLocaleString('id-ID')}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold">Rp {(viewingInvoice.amount || 0).toLocaleString('id-ID')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quota Highlights */}
            <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-200/70 text-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 block">
                Total Kuota yang Diberikan ke Akun
              </span>
              <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                {viewingInvoice.totalActivePeriodDays ? (
                  <div>Masa Aktif: <strong>+{viewingInvoice.totalActivePeriodDays} Hari</strong></div>
                ) : null}
                {viewingInvoice.totalEventQuota ? (
                  <div>Kuota Acara: <strong>+{viewingInvoice.totalEventQuota} Acara</strong></div>
                ) : null}
                {viewingInvoice.totalGuestQuota ? (
                  <div>Kuota Tamu: <strong>+{viewingInvoice.totalGuestQuota.toLocaleString('id-ID')} Tamu</strong></div>
                ) : null}
                {viewingInvoice.totalWaBlastQuota ? (
                  <div>Kuota WA Blast: <strong>+{viewingInvoice.totalWaBlastQuota.toLocaleString('id-ID')} Pesan</strong></div>
                ) : null}
              </div>
            </div>

            {/* Total Footer */}
            <div className="pt-2 flex justify-between items-center border-t border-slate-200">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Total Tagihan</span>
              <span className="text-xl font-black font-mono text-slate-900">
                Rp {(viewingInvoice.amount || 0).toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {(viewingInvoice.status === 'pending' || viewingInvoice.status === 'pending_verification') && (
                <button
                  type="button"
                  onClick={() => {
                    const id = viewingInvoice.id;
                    setViewingInvoice(null);
                    handleConfirmPayment(id);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Konfirmasi Lunas Sekarang
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewingInvoice(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
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
