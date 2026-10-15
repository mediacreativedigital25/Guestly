import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { runTransaction, doc, getDoc, collection, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { GuestlyService } from '../../types';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { showAlert, showConfirm, showCancelAlert } from '../../lib/alerts';
import { Copy, Check, QrCode, ArrowLeft, ShieldCheck, Zap, Sparkles, Clock, Calendar, Users, Send, CheckCircle2, Lock, CreditCard, Building2, HelpCircle, AlertCircle, Info, ChevronRight, MessageSquare, BadgeCheck } from 'lucide-react';

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

  // Set default payment method based on activePaymentMethod
  useEffect(() => {
    if (settings?.activePaymentMethod === 'tripay' || settings?.activePaymentMethod === 'qris') {
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
    return (
      <div className="max-w-4xl mx-auto py-20 text-center space-y-3">
        <div className="w-10 h-10 border-3 border-[#8C3A50] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-500">Memuat rincian paket layanan...</p>
      </div>
    );
  }

  if (!service) {
    return null; // Handled by redirect in useEffect
  }

  const normalPrice = service.normalPrice && service.normalPrice > service.price ? service.normalPrice : null;
  const discountAmount = normalPrice ? normalPrice - service.price : 0;

  return (
    <div className="w-full space-y-5 pb-12">
      {/* Top Header Bar (Harmonized with Breadcrumbs) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#96475D]">
              Guestly Checkout
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500">Konfirmasi Pemesanan &amp; Pembayaran</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
            Checkout Layanan
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Enkripsi SSL 256-Bit Aman</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Kolom Kiri: Rincian Layanan & Metode Pembayaran */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-5">
          {/* Kartu 1: Rincian Paket Layanan & Akun Terintegrasi */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 to-white">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-50 text-[#8C3A50] border border-rose-200/70">
                  <Sparkles className="w-3 h-3 text-[#8C3A50]" />
                  Paket Layanan Acara
                </span>
                {service.activePeriodDays ? (
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    Masa Aktif {service.activePeriodDays} Hari
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                    Akses Permanen
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {service.name}
              </h2>
              {service.description && (
                <p className="text-slate-600 text-sm leading-relaxed mt-2 whitespace-pre-line">
                  {service.description}
                </p>
              )}
            </div>

            {/* Grid Spesifikasi Layanan (Spec Cards) */}
            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                  Spesifikasi Kuota &amp; Fasilitas
                </h3>
                <div className={`grid grid-cols-1 sm:grid-cols-2 ${service.waBlastQuota ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
                  {/* Spesifikasi 1: Masa Aktif */}
                  <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-600">Masa Aktif</span>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {service.activePeriodDays ? `${service.activePeriodDays} Hari` : 'Selamanya'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Akses sistem &amp; kelola acara
                    </p>
                  </div>

                  {/* Spesifikasi 2: Kuota Acara */}
                  <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-600">Kuota Acara</span>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {service.eventQuota ? `${service.eventQuota} Acara` : 'Unlimited'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Buku tamu &amp; QR check-in
                    </p>
                  </div>

                  {/* Spesifikasi 3: Kuota Tamu (Buku Tamu Digital) */}
                  <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-600">Kuota Tamu</span>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {service.guestQuota ? `${service.guestQuota.toLocaleString('id-ID')} Tamu` : 'Standar'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Kapasitas buku tamu per acara
                    </p>
                  </div>

                  {/* Spesifikasi 4: Kuota WA Blast (Pesan Broadcast) */}
                  {service.waBlastQuota ? (
                    <div className="p-3.5 rounded-xl border border-purple-200/80 bg-purple-50/40 hover:bg-purple-50/70 transition-colors">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                          <Send className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium text-purple-900">Kuota Blast</span>
                      </div>
                      <div className="text-base font-bold text-purple-950">
                        {service.waBlastQuota.toLocaleString('id-ID')} Pesan
                      </div>
                      <p className="text-[11px] text-purple-700/80 mt-0.5">
                        Kredit broadcast WhatsApp
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Fitur yang Termasuk */}
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                  Fitur Unggulan Yang Anda Dapatkan
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Scan Tiket QR Cepat &amp; Realtime Gate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Buku Tamu Digital &amp; Card E-Invitation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Dukungan Mode Scanner Offline Aman</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Ekspor Lengkap ke Microsoft Excel &amp; PDF</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Manajemen Suvenir &amp; Riwayat Petugas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Sinkronisasi Multi-Device Tanpa Batas</span>
                  </div>
                  {service.waBlastQuota ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                      <span className="font-semibold text-purple-900">
                        Kredit WA Blast {service.waBlastQuota.toLocaleString('id-ID')} Pesan Otomatis
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Akun Lisensi Terintegrasi (Menyatu dalam kartu paket) */}
              <div className="pt-4 border-t border-slate-100 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-4 sm:p-5 bg-slate-50/70 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#8C3A50]/10 text-[#8C3A50] font-bold flex items-center justify-center shrink-0 text-sm">
                    {(appUser?.name || currentUser?.displayName || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Akun Tujuan Lisensi
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                        {appUser?.role?.toUpperCase() || 'USER'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">
                      {appUser?.name || currentUser?.displayName || 'Pengguna Guestly'}{' '}
                      <span className="font-normal text-slate-500">
                        ({currentUser?.email || '-'} {appUser?.phone ? `• ${appUser.phone}` : ''})
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/70 self-start sm:self-auto shrink-0">
                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Otomatis Diaktifkan ke Akun Ini</span>
                </div>
              </div>
            </div>
          </div>

          {/* Kartu 2: Pilihan Metode Pembayaran */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Pilih Metode Pembayaran</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih jalur pembayaran resmi yang paling mudah untuk Anda selesaikan.
              </p>
            </div>

            <div className="space-y-3">
              {settings?.activePaymentMethod !== 'tripay' ? (
                <>
                  {/* Opsi QRIS */}
                  {(settings?.activePaymentMethod === 'qris' ||
                    Boolean(settings?.qrisPayment?.qrisImageUrl || settings?.qrisPayment?.merchantName)) && (
                    <label
                      className={`flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${
                        paymentMethod === 'qris'
                          ? 'border-[#8C3A50] bg-rose-50/20 ring-1 ring-[#8C3A50]/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="qris"
                          checked={paymentMethod === 'qris'}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="h-4 w-4 text-[#8C3A50] border-slate-300 focus:ring-[#8C3A50]"
                        />
                        <div className="ml-3 flex-1 flex flex-wrap justify-between items-center gap-2">
                          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <QrCode className="w-4 h-4 text-[#8C3A50]" />
                            <span>QRIS (Semua E-Wallet &amp; Mobile Banking)</span>
                          </span>
                          <span className="text-xs font-semibold px-2 py-0.5 bg-rose-100 text-[#8C3A50] rounded-md">
                            Instan
                          </span>
                        </div>
                      </div>

                      {paymentMethod === 'qris' && (
                        <div className="ml-7 mt-3 p-4 bg-white border border-rose-100 rounded-xl text-sm text-slate-600 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {settings?.qrisPayment?.merchantName || 'QRIS Official Merchant'}
                              </p>
                              {settings?.qrisPayment?.nmid && (
                                <p className="text-xs font-mono text-slate-500 mt-0.5">
                                  NMID: {settings.qrisPayment.nmid}
                                </p>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              GoPay • OVO • DANA • ShopeePay • M-Banking
                            </span>
                          </div>

                          {settings?.qrisPayment?.qrisImageUrl ? (
                            <div className="flex flex-col items-center justify-center py-2">
                              <img
                                src={settings.qrisPayment.qrisImageUrl}
                                alt="Kode QRIS Pembayaran"
                                className="max-w-[240px] w-full h-auto rounded-xl border border-slate-200 shadow-xs bg-white p-2.5 object-contain"
                              />
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic">
                              Kode QRIS akan langsung ditampilkan pada halaman detail faktur setelah pesanan dibuat.
                            </p>
                          )}

                          {settings?.qrisPayment?.instructions && (
                            <div className="text-xs bg-slate-50 p-3 rounded-lg text-slate-600 whitespace-pre-line border border-slate-100">
                              {settings.qrisPayment.instructions}
                            </div>
                          )}
                        </div>
                      )}
                    </label>
                  )}

                  {/* Opsi Transfer Bank Manual */}
                  {(settings?.activePaymentMethod === 'manual' ||
                    !settings?.activePaymentMethod ||
                    Boolean(settings?.manualPayment?.accountNumber || settings?.manualPayment?.bankName)) && (
                    <label
                      className={`flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${
                        paymentMethod === 'transfer'
                          ? 'border-[#8C3A50] bg-rose-50/20 ring-1 ring-[#8C3A50]/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="transfer"
                          checked={paymentMethod === 'transfer'}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="h-4 w-4 text-[#8C3A50] border-slate-300 focus:ring-[#8C3A50]"
                        />
                        <div className="ml-3 flex-1 flex flex-wrap justify-between items-center gap-2">
                          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <Building2 className="w-4 h-4 text-[#8C3A50]" />
                            <span>Transfer Bank Manual</span>
                          </span>
                          <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                            Verifikasi Cepat
                          </span>
                        </div>
                      </div>

                      {paymentMethod === 'transfer' && settings?.manualPayment && (
                        <div className="ml-7 mt-3 p-4 bg-white border border-rose-100 rounded-xl text-sm text-slate-600 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              Informasi Rekening Resmi
                            </span>
                            <span className="text-xs font-semibold text-slate-700">
                              {settings.manualPayment.bankName || 'Bank Transfer'}
                            </span>
                          </div>

                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="text-[11px] text-slate-500 block">Nomor Rekening:</span>
                                <span className="text-base font-mono font-bold text-slate-900 tracking-wider">
                                  {settings.manualPayment.accountNumber || '-'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleCopy(settings?.manualPayment?.accountNumber || '');
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-200 hover:border-[#8C3A50] hover:text-[#8C3A50] rounded-lg text-xs font-semibold text-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                title="Salin Nomor Rekening"
                              >
                                {copied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-700">Tersalin!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Salin Rekening</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="text-xs text-slate-600 pt-1 border-t border-slate-200/60">
                              <span className="text-slate-400">Atas Nama: </span>
                              <span className="font-semibold text-slate-800">
                                {settings.manualPayment.accountName || '-'}
                              </span>
                            </div>
                          </div>

                          {settings.manualPayment.instructions && (
                            <div className="text-xs bg-slate-50 p-3 rounded-lg text-slate-600 whitespace-pre-line border border-slate-100">
                              {settings.manualPayment.instructions}
                            </div>
                          )}
                        </div>
                      )}
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label
                    className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${
                      paymentMethod === 'qris'
                        ? 'border-[#8C3A50] bg-rose-50/20 ring-1 ring-[#8C3A50]/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="qris"
                      checked={paymentMethod === 'qris'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 text-[#8C3A50] border-slate-300 focus:ring-[#8C3A50]"
                    />
                    <div className="ml-3 flex-1 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-900">QRIS (OVO, GoPay, DANA)</span>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        Otomatis via Tripay
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${
                      paymentMethod === 'virtual_account'
                        ? 'border-[#8C3A50] bg-rose-50/20 ring-1 ring-[#8C3A50]/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="virtual_account"
                      checked={paymentMethod === 'virtual_account'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 text-[#8C3A50] border-slate-300 focus:ring-[#8C3A50]"
                    />
                    <div className="ml-3 flex-1 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-900">Virtual Account</span>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        Otomatis via Tripay
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${
                      paymentMethod === 'credit_card'
                        ? 'border-[#8C3A50] bg-rose-50/20 ring-1 ring-[#8C3A50]/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="credit_card"
                      checked={paymentMethod === 'credit_card'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 text-[#8C3A50] border-slate-300 focus:ring-[#8C3A50]"
                    />
                    <div className="ml-3 flex-1 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-900">Kartu Kredit / Debit</span>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        Visa / Mastercard
                      </span>
                    </div>
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Ringkasan Pesanan & Tombol Checkout (Sticky Sidebar) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sticky top-6 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Ringkasan Pembayaran</h2>
              <p className="text-xs text-slate-500 mt-0.5">Rincian biaya transaksi paket layanan</p>
            </div>

            {/* Rincian Harga */}
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Harga Paket</span>
                <span className="font-semibold text-slate-900">
                  Rp {(normalPrice || service.price).toLocaleString('id-ID')}
                </span>
              </div>

              {normalPrice && discountAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-600">
                  <div className="flex items-center gap-1.5">
                    <span>Diskon Promo</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded">
                      Hemat
                    </span>
                  </div>
                  <span className="font-bold">- Rp {discountAmount.toLocaleString('id-ID')}</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Biaya Layanan</span>
                <span className="font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs">
                  Rp 0 (Gratis)
                </span>
              </div>
            </div>

            {/* Total Harga Box */}
            <div className="pt-4 border-t border-dashed border-slate-200">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Total Pembayaran
                  </span>
                  <span className="text-[11px] text-slate-400">Termasuk seluruh fitur</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    Rp {service.price.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>

            {/* Tombol Aksi (Dirampingkan & Elegan) */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleOrder}
                disabled={ordering}
                className="w-full bg-[#8C3A50] hover:bg-[#772F42] active:bg-[#682436] text-white font-medium py-2.5 px-4 rounded-xl shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer text-xs sm:text-sm tracking-wide"
              >
                {ordering ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Memproses Pesanan...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-rose-200" />
                    <span>Konfirmasi Pesanan</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={ordering}
                onClick={() => {
                  navigate('/auth/login/services/catalog');
                  showCancelAlert('Pemesanan layanan telah dibatalkan.');
                }}
                className="w-full bg-transparent hover:bg-slate-100/70 border border-slate-200/90 text-slate-600 hover:text-slate-800 font-medium py-2 px-4 rounded-xl transition-colors text-xs disabled:opacity-60 cursor-pointer"
              >
                Batal
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              Dengan melanjutkan pemesanan, Anda menyetujui Syarat &amp; Ketentuan serta Kebijakan Privasi layanan Guestly.
            </p>

            {/* Trust Badges */}
            <div className="pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Transaksi Terenkripsi &amp; Terlindungi</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Aktivasi Cepat Setelah Verifikasi</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Bantuan Pelanggan Langsung via WhatsApp</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
