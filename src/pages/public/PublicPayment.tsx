import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSettings } from '../../SettingsContext';
import { MediaUploader } from '../../components/media/MediaUploader';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Copy, 
  Check, 
  QrCode, 
  Building2, 
  Upload, 
  ArrowLeft, 
  ShieldCheck, 
  Receipt, 
  Sparkles,
  Download,
  Calendar,
  ExternalLink
} from 'lucide-react';
import { showAlert } from '../../lib/alerts';

export default function PublicPayment() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { settings } = useSettings();

  const [invoice, setInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedAccNumber, setCopiedAccNumber] = useState(false);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState(false);
  const [activeTab, setActiveTab] = useState<'qris' | 'manual'>('qris');
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [uploadedProofUrl, setUploadedProofUrl] = useState<string | null>(null);

  // Subscribe to invoice in real-time
  useEffect(() => {
    if (!invoiceId) {
      setError('Nomor Invoice tidak ditemukan pada tautan.');
      setLoading(false);
      return;
    }

    setLoading(true);
    const invoiceRef = doc(db, 'invoices', invoiceId);
    const unsubscribe = onSnapshot(
      invoiceRef,
      (docSnap) => {
        setLoading(false);
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() };
          setInvoice(data);
          if (data.paymentProofUrl) {
            setUploadedProofUrl(data.paymentProofUrl);
          }
          // Set initial payment tab based on invoice preference or system settings
          if (data.paymentMethod === 'manual' || settings?.activePaymentMethod === 'manual') {
            setActiveTab('manual');
          } else {
            setActiveTab('qris');
          }
        } else {
          setError('Invoice dengan nomor tersebut tidak ditemukan atau telah dihapus.');
        }
      },
      (err) => {
        console.error('Error listening to invoice:', err);
        setError('Terjadi kendala saat memuat data tagihan. Silakan segarkan halaman.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [invoiceId, settings?.activePaymentMethod]);

  const handleCopy = (text: string, type: 'amount' | 'acc' | 'id') => {
    navigator.clipboard.writeText(text);
    if (type === 'amount') {
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    } else if (type === 'acc') {
      setCopiedAccNumber(true);
      setTimeout(() => setCopiedAccNumber(false), 2000);
    } else {
      setCopiedInvoiceId(true);
      setTimeout(() => setCopiedInvoiceId(false), 2000);
    }
  };

  const handleProofUploaded = async (uploadData: { url: string }) => {
    if (!invoiceId) return;
    setIsSubmittingProof(true);
    try {
      const invoiceRef = doc(db, 'invoices', invoiceId);
      await updateDoc(invoiceRef, {
        paymentProofUrl: uploadData.url,
        paymentSubmittedAt: serverTimestamp(),
        // Update status to pending_verification if currently pending
        status: invoice?.status === 'paid' ? 'paid' : 'pending_verification',
        updatedAt: serverTimestamp()
      });
      setUploadedProofUrl(uploadData.url);
      showAlert('Berhasil Diunggah', 'Bukti pembayaran berhasil dikirimkan. Admin akan segera memverifikasi pesanan Anda.', 'success');
    } catch (err: any) {
      console.error('Error updating proof:', err);
      showAlert('Gagal Menyimpan', 'Bukti berhasil diunggah namun gagal memperbarui status tagihan. Silakan kirimkan juga melalui WhatsApp admin.', 'error');
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const adminPhone = settings?.adminPhone || '6285158636606';
  const waConfirmText = encodeURIComponent(
    `Halo Admin, saya ingin konfirmasi pembayaran untuk pesanan #${invoice?.id || invoiceId}.\n\n` +
    `Layanan: ${invoice?.serviceName || 'Layanan Acara'}\n` +
    `Total: Rp ${(invoice?.amount || 0).toLocaleString('id-ID')}\n` +
    `Status: Sudah ditransfer / dibayar via QRIS.\n\n` +
    `Mohon dicek dan diaktifkan kuotanya. Terima kasih!`
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800">Memuat Halaman Pembayaran...</h2>
          <p className="text-sm text-slate-500 mt-1">Mengambil rincian invoice #{invoiceId}</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Invoice Tidak Ditemukan</h2>
          <p className="text-sm text-slate-600 mb-6">{error || 'Tautan ini mungkin sudah kadaluarsa atau nomor invoice salah.'}</p>
          <div className="flex flex-col gap-2">
            <a
              href={`https://wa.me/${adminPhone}?text=${encodeURIComponent(`Halo Admin, saya mengalami kendala membuka invoice #${invoiceId}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Hubungi Admin via WhatsApp
            </a>
            <Link
              to="/"
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === 'paid';
  const isCancelled = invoice.status === 'cancelled';
  const isPendingVerification = invoice.status === 'pending_verification';
  const isPending = !isPaid && !isCancelled && !isPendingVerification;

  const formattedAmount = (invoice.amount || 0).toLocaleString('id-ID');
  const invoiceDate = invoice.createdAt?.toDate 
    ? invoice.createdAt.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white text-slate-800 pb-16">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-8 max-w-[130px] object-contain" />
            ) : (
              <div className="flex items-center gap-2 font-black text-lg tracking-tight text-slate-900">
                <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  G
                </span>
                <span>Guestly</span>
              </div>
            )}
            <span className="text-slate-300">|</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pembayaran Aman
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link 
              to="/auth/login"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <span>Masuk ke Akun</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        {/* Status Notification Banner */}
        {isPaid && (
          <div className="mb-6 p-5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl shadow-lg flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Pembayaran Sukses &amp; Lunas!</h2>
                <span className="px-2 py-0.5 bg-white/20 text-xs font-bold rounded-md uppercase tracking-wide">
                  Terverifikasi
                </span>
              </div>
              <p className="text-sm text-emerald-100 mt-1">
                Terima kasih! Pesanan Anda telah dikonfirmasi dan kuota layanan telah aktif otomatis di akun Anda.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-50 transition-colors shadow-sm"
                >
                  <Sparkles className="w-4 h-4 text-emerald-600" /> Buka Dashboard Aplikasi
                </Link>
              </div>
            </div>
          </div>
        )}

        {isPendingVerification && (
          <div className="mb-6 p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-md flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <Clock className="w-7 h-7 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Bukti Pembayaran Diterima</h2>
                <span className="px-2 py-0.5 bg-white/20 text-xs font-bold rounded-md uppercase tracking-wide">
                  Verifikasi
                </span>
              </div>
              <p className="text-sm text-blue-100 mt-1">
                Admin sedang memverifikasi bukti transfer Anda. Halaman ini akan otomatis berubah menjadi <strong>Lunas</strong> setelah dikonfirmasi.
              </p>
            </div>
          </div>
        )}

        {isCancelled && (
          <div className="mb-6 p-5 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-rose-800">Tagihan Ini Telah Dibatalkan</h2>
              <p className="text-xs text-rose-700 mt-1">
                Pesanan ini sudah dibatalkan. Jika Anda ingin memesan kembali, silakan akses katalog layanan di aplikasi.
              </p>
            </div>
          </div>
        )}

        {/* Invoice Summary Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden mb-6">
          <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Tagihan Pembayaran
                </span>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                    #{invoice.id}
                  </h1>
                  <button
                    onClick={() => handleCopy(invoice.id, 'id')}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 rounded transition-colors"
                    title="Salin Nomor Invoice"
                  >
                    {copiedInvoiceId ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                  isPaid ? 'bg-emerald-100 text-emerald-800' :
                  isPendingVerification ? 'bg-blue-100 text-blue-800' :
                  isCancelled ? 'bg-rose-100 text-rose-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    isPaid ? 'bg-emerald-500' :
                    isPendingVerification ? 'bg-blue-500 animate-ping' :
                    isCancelled ? 'bg-rose-500' :
                    'bg-amber-500'
                  }`} />
                  {isPaid ? 'Lunas' : isPendingVerification ? 'Menunggu Verifikasi' : isCancelled ? 'Dibatalkan' : 'Menunggu Pembayaran'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200/60 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-600">
              <div>
                <span className="text-slate-400 block">Tanggal Pesanan:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> {invoiceDate}
                </span>
              </div>
              {invoice.userName && (
                <div>
                  <span className="text-slate-400 block">Atas Nama:</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                    {invoice.userName}
                  </span>
                </div>
              )}
              {invoice.userPhone && (
                <div>
                  <span className="text-slate-400 block">WhatsApp Pemesan:</span>
                  <span className="font-semibold text-slate-800 font-mono mt-0.5 block">
                    {invoice.userPhone}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Breakdown Items */}
          <div className="p-5 sm:p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Rincian Layanan &amp; Paket
            </h3>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs sm:text-sm">
              {invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                invoice.items.map((item: any, idx: number) => (
                  <div key={idx} className="p-3.5 flex justify-between items-center gap-3 bg-white">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{item.serviceName}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                          item.type === 'package' 
                            ? 'bg-rose-50 text-[#8C3A50] border-rose-200' 
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}>
                          {item.type === 'package' ? 'Paket Utama' : 'Add-on'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>Jumlah: <strong className="font-mono text-slate-700">x{item.quantity || 1}</strong></span>
                        <span>•</span>
                        <span>Rp {(item.price || 0).toLocaleString('id-ID')} / item</span>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-slate-900 shrink-0">
                      Rp {((item.price || 0) * (item.quantity || 1)).toLocaleString('id-ID')}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3.5 flex justify-between items-center bg-white">
                  <div>
                    <span className="font-bold text-slate-900 block">{invoice.serviceName || 'Layanan Acara'}</span>
                    <span className="text-xs text-slate-500">1 Paket Layanan</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900">
                    Rp {(invoice.amount || 0).toLocaleString('id-ID')}
                  </div>
                </div>
              )}
            </div>

            {/* Quota Added Highlights */}
            {(invoice.totalActivePeriodDays || invoice.totalEventQuota || invoice.totalGuestQuota || invoice.totalWaBlastQuota) && (
              <div className="mt-4 p-3.5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100/80 rounded-xl text-xs">
                <span className="font-bold text-purple-900 block mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Kuota yang Didapatkan Setelah Lunas:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-700 font-medium">
                  {invoice.totalActivePeriodDays ? (
                    <div className="bg-white/70 p-2 rounded-lg border border-purple-100">
                      <span className="text-[10px] text-slate-500 block">Masa Aktif:</span>
                      <strong className="text-purple-700">+{invoice.totalActivePeriodDays} Hari</strong>
                    </div>
                  ) : null}
                  {invoice.totalEventQuota ? (
                    <div className="bg-white/70 p-2 rounded-lg border border-purple-100">
                      <span className="text-[10px] text-slate-500 block">Kuota Acara:</span>
                      <strong className="text-purple-700">+{invoice.totalEventQuota} Acara</strong>
                    </div>
                  ) : null}
                  {invoice.totalGuestQuota ? (
                    <div className="bg-white/70 p-2 rounded-lg border border-purple-100">
                      <span className="text-[10px] text-slate-500 block">Kuota Tamu:</span>
                      <strong className="text-purple-700">+{invoice.totalGuestQuota.toLocaleString('id-ID')}</strong>
                    </div>
                  ) : null}
                  {invoice.totalWaBlastQuota ? (
                    <div className="bg-white/70 p-2 rounded-lg border border-purple-100">
                      <span className="text-[10px] text-slate-500 block">WA Blast:</span>
                      <strong className="text-purple-700">+{invoice.totalWaBlastQuota.toLocaleString('id-ID')}</strong>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Total Highlight */}
            <div className="mt-5 p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-xs">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                  Total yang Harus Dibayar
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white">
                    Rp {formattedAmount}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(String(invoice.amount || 0), 'amount')}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedAmount ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Salin Nominal</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Payment Instructions (Only if not already paid and not cancelled) */}
        {!isPaid && !isCancelled && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden mb-6">
            {/* Tabs for payment methods */}
            <div className="flex border-b border-slate-200 bg-slate-50/70 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('qris')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'qris'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>QRIS (E-Wallet &amp; M-Banking)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'manual'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>Transfer Bank / DANA</span>
              </button>
            </div>

            <div className="p-5 sm:p-6">
              {activeTab === 'qris' ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block">
                        Merchant QRIS Resmi
                      </span>
                      <strong className="text-sm font-bold text-slate-900">
                        {settings?.qrisPayment?.merchantName || 'Guestly Official'}
                      </strong>
                      {settings?.qrisPayment?.nmid && (
                        <span className="block text-xs font-mono text-slate-500 mt-0.5">
                          NMID: {settings.qrisPayment.nmid}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 px-2.5 py-1 rounded-md shadow-2xs">
                      Semua Bank &amp; E-Wallet
                    </span>
                  </div>

                  {/* QR Code Container */}
                  <div className="flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-indigo-200 rounded-2xl p-6 text-center">
                    {settings?.qrisPayment?.qrisImageUrl ? (
                      <div className="space-y-3">
                        <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200 inline-block">
                          <img
                            src={settings.qrisPayment.qrisImageUrl}
                            alt="Kode QRIS"
                            className="w-56 sm:w-64 h-auto object-contain mx-auto"
                          />
                        </div>
                        <div className="flex justify-center gap-2">
                          <a
                            href={settings.qrisPayment.qrisImageUrl}
                            download="qris-pembayaran.png"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg shadow-2xs transition-colors"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-500" /> Unduh Gambar QRIS
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-slate-500 text-xs sm:text-sm">
                        <QrCode className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                        <p>QRIS sedang disiapkan. Silakan gunakan tab <strong>Transfer Bank / DANA</strong> di atas.</p>
                      </div>
                    )}
                  </div>

                  {/* Step Instructions */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-600 space-y-2">
                    <span className="font-bold text-slate-800 uppercase tracking-wider block text-[11px]">
                      Cara Bayar Pakai QRIS:
                    </span>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                      <li>Buka aplikasi m-Banking (BCA, Mandiri, BRI, BNI) atau E-Wallet (GoPay, OVO, DANA, ShopeePay).</li>
                      <li>Pilih menu <strong>Scan / Bayar QRIS</strong>.</li>
                      <li>Arahkan kamera ke kode QRIS di atas (atau unggah gambar QRIS yang diunduh).</li>
                      <li>Pastikan nominal pembayaran tepat sebesar <strong>Rp {formattedAmount}</strong>.</li>
                      <li>Masukkan PIN Anda untuk menyelesaikan transaksi.</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Bank / Penyedia:</span>
                      <strong className="text-slate-900 font-bold uppercase">
                        {settings?.manualPayment?.bankName || 'BCA / DANA'}
                      </strong>
                    </div>

                    <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          Nomor Rekening / Akun
                        </span>
                        <span className="text-lg font-mono font-black text-slate-900 tracking-wider">
                          {settings?.manualPayment?.accountNumber || '1234567890'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(settings?.manualPayment?.accountNumber || '1234567890', 'acc')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copiedAccNumber ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin No. Rek</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex justify-between items-center text-xs pt-1">
                      <span className="text-slate-500">Atas Nama:</span>
                      <strong className="text-slate-900 font-bold">
                        {settings?.manualPayment?.accountName || 'PT Guestly Digital Indonesia'}
                      </strong>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    {settings?.manualPayment?.instructions ||
                      'Setelah menyelesaikan transfer melalui ATM atau Internet Banking, silakan unggah foto/screenshot bukti pembayaran di bawah ini atau konfirmasi langsung ke WhatsApp Admin.'}
                  </p>
                </div>
              )}

              {/* Upload Proof & WhatsApp Confirmation */}
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-indigo-600" /> Konfirmasi Pembayaran
                </h4>
                <p className="text-xs text-slate-500 mb-4">
                  Kirimkan bukti transfer untuk mempercepat verifikasi otomatis kuota layanan Anda.
                </p>

                <div className="space-y-4">
                  {/* Proof Uploader */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      Upload Struk / Bukti Transfer (Opsional tapi Direkomendasikan)
                    </label>
                    <MediaUploader
                      category="receipt"
                      maxSize={5 * 1024 * 1024}
                      allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                      defaultValue={uploadedProofUrl || undefined}
                      onUploadSuccess={handleProofUploaded}
                      onUploadError={(err) => showAlert('Gagal Upload', `Gagal mengunggah bukti: ${err}`, 'error')}
                    />
                    {uploadedProofUrl && (
                      <p className="text-xs font-medium text-emerald-600 mt-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Bukti transfer tersimpan. Admin akan segera memverifikasi.
                      </p>
                    )}
                  </div>

                  {/* Direct WhatsApp Action Button */}
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <a
                      href={`https://wa.me/${adminPhone}?text=${waConfirmText}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
                        alt="WhatsApp"
                        className="w-4 h-4 brightness-0 invert"
                      />
                      <span>Konfirmasi via WhatsApp ke Admin</span>
                    </a>

                    <Link
                      to="/auth/login/invoices/my"
                      className="w-full sm:w-auto py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm transition-colors text-center"
                    >
                      Lihat Daftar Invoice Saya
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security & Support Footer */}
        <div className="mt-8 text-center text-xs text-slate-400 space-y-2">
          <p className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Sistem pembayaran terlindungi enkripsi standar industri.</span>
          </p>
          <p>
            Butuh bantuan terkait pembayaran ini? Hubungi WhatsApp{' '}
            <a
              href={`https://wa.me/${adminPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline font-medium"
            >
              +{adminPhone}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
