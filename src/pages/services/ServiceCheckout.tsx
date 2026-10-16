import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { runTransaction, doc, getDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { GuestlyService } from '../../types';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { useCart } from '../../CartContext';
import { showAlert, showConfirm, showCancelAlert } from '../../lib/alerts';
import {
  Copy,
  Check,
  QrCode,
  ArrowLeft,
  ShieldCheck,
  Zap,
  Sparkles,
  Clock,
  Calendar,
  Users,
  Send,
  CheckCircle2,
  Lock,
  Building2,
  AlertCircle,
  MessageSquare,
  BadgeCheck,
  Plus,
  Trash2,
  ShoppingBag,
  Layers,
  ChevronRight,
  ArrowRight
} from 'lucide-react';

export default function ServiceCheckout() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const { appUser, currentUser } = useAuth();
  const { settings } = useSettings();
  const {
    mainPackage,
    addons,
    setMainPackage,
    addAddon,
    removeAddon,
    updateAddonQuantity,
    clearCart,
    isAddonInCart,
    itemCount,
    totalPrice,
    totalNormalPrice,
    totalDiscount,
    totalEventQuota,
    totalClientQuota,
    totalGuestQuota,
    totalWaBlastQuota,
    totalActivePeriodDays,
  } = useCart();

  const [loading, setLoading] = useState(true);
  const [availableAddons, setAvailableAddons] = useState<GuestlyService[]>([]);
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

  // Load service if serviceId in URL and fetch available add-ons
  useEffect(() => {
    let isMounted = true;

    const initCheckout = async () => {
      try {
        setLoading(true);

        // 1. If serviceId provided, check if it's already in cart or load it
        if (serviceId) {
          const docRef = doc(db, 'services', serviceId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const fetched = { id: docSnap.id, ...docSnap.data() } as GuestlyService;
            if (fetched.type === 'package') {
              // Set as main package if not already set or different
              if (!mainPackage || mainPackage.id !== fetched.id) {
                setMainPackage(fetched);
              }
            } else if (fetched.type === 'addon') {
              // Add to addons if not in cart
              if (!isAddonInCart(fetched.id!)) {
                addAddon(fetched);
              }
            }
          }
        }

        // 2. Fetch all available add-ons for the user's role to suggest directly in checkout
        const servicesRef = collection(db, 'services');
        const qAddons = query(
          servicesRef,
          where('isActive', '==', true),
          where('type', '==', 'addon')
        );
        const snapshot = await getDocs(qAddons);
        const addonData = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as GuestlyService)
        );

        let filteredAddons = addonData;
        if (appUser?.role === 'client') {
          filteredAddons = addonData.filter(
            (s) => s.targetRole === 'client' || s.targetRole === 'all'
          );
        } else if (appUser?.role === 'partner' || appUser?.role === 'owner') {
          filteredAddons = addonData.filter(
            (s) => s.targetRole === 'partner' || s.targetRole === 'all'
          );
        }

        if (isMounted) {
          setAvailableAddons(filteredAddons);
        }
      } catch (error) {
        console.error('Init checkout error:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initCheckout();

    return () => {
      isMounted = false;
    };
  }, [serviceId, appUser?.role]);

  // Handle Order creation
  const handleOrder = async () => {
    if (itemCount === 0) {
      showAlert('Peringatan', 'Keranjang pesanan masih kosong. Silakan pilih layanan.', 'warning');
      return;
    }

    if (!currentUser) {
      showAlert('Peringatan', 'Silakan login terlebih dahulu untuk membuat pesanan.', 'warning');
      return;
    }

    const confirmed = await showConfirm(
      `Apakah Anda yakin ingin membuat pesanan ini dengan total Rp ${totalPrice.toLocaleString('id-ID')}?`
    );
    if (!confirmed) {
      return;
    }

    setOrdering(true);

    try {
      const counterRef = doc(db, 'counters', 'invoice');
      let createdInvoiceId = '';

      // Build structured items array
      const itemsPayload: any[] = [];
      if (mainPackage) {
        itemsPayload.push({
          serviceId: mainPackage.id,
          serviceName: mainPackage.name,
          type: 'package',
          price: mainPackage.price,
          normalPrice: mainPackage.normalPrice || 0,
          activePeriodDays: mainPackage.activePeriodDays || 0,
          eventQuota: mainPackage.eventQuota || 0,
          clientQuota: mainPackage.clientQuota || 0,
          guestQuota: mainPackage.guestQuota || 0,
          waBlastQuota: mainPackage.waBlastQuota || 0,
          quantity: 1,
        });
      }

      addons.forEach((it) => {
        itemsPayload.push({
          serviceId: it.service.id,
          serviceName: it.service.name,
          type: 'addon',
          price: it.service.price,
          normalPrice: it.service.normalPrice || 0,
          activePeriodDays: it.service.activePeriodDays || 0,
          eventQuota: it.service.eventQuota || 0,
          clientQuota: it.service.clientQuota || 0,
          guestQuota: it.service.guestQuota || 0,
          waBlastQuota: it.service.waBlastQuota || 0,
          quantity: it.quantity,
        });
      });

      const primaryServiceId = mainPackage?.id || addons[0]?.service.id || '';
      let compositeServiceName = mainPackage ? mainPackage.name : addons[0]?.service.name || 'Layanan';
      if (mainPackage && addons.length > 0) {
        compositeServiceName = `${mainPackage.name} + ${addons.length} Add-on`;
      } else if (!mainPackage && addons.length > 1) {
        compositeServiceName = `${addons.length} Add-on Terpilih`;
      }

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
          serviceId: primaryServiceId,
          serviceName: compositeServiceName,
          items: itemsPayload,
          amount: totalPrice,
          totalEventQuota,
          totalClientQuota,
          totalGuestQuota,
          totalWaBlastQuota,
          totalActivePeriodDays,
          status: 'pending',
          paymentMethod: paymentMethod,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      // Send Fonnte WhatsApp Notification
      if (appUser?.phone) {
        import('../../lib/fonnte').then(({ sendFonnteMessage }) => {
          const paymentUrl = `${window.location.origin}/pay/${createdInvoiceId}`;
          let message = `Halo ${appUser.name || 'User'},\n\nPesanan Anda untuk layanan *${compositeServiceName}* dengan total *Rp ${totalPrice.toLocaleString('id-ID')}* telah berhasil dibuat.\nNomor Invoice: *${createdInvoiceId}*\nStatus: *Menunggu Pembayaran*\n\n💳 *Link Pembayaran Langsung:*\n${paymentUrl}\n\nSilakan klik tautan di atas untuk melihat rincian tagihan, scan kode QRIS, atau transfer ke rekening tujuan.\n\nTerima kasih,\nAdmin Guestly`;

          if (settings.fonnteTemplates?.orderCreated) {
            message = settings.fonnteTemplates.orderCreated
              .replace(/{userName}/g, appUser.name || 'User')
              .replace(/{serviceName}/g, compositeServiceName)
              .replace(/{invoiceId}/g, createdInvoiceId)
              .replace(/{amount}/g, `Rp ${totalPrice.toLocaleString('id-ID')}`)
              .replace(/{paymentLink}/g, paymentUrl)
              .replace(/{invoiceUrl}/g, paymentUrl);
          }

          sendFonnteMessage(null, appUser.phone!, message);
        });
      }

      // Clear shopping cart on successful checkout
      clearCart();

      showAlert('Berhasil', 'Pesanan berhasil dibuat!', 'success');
      navigate('/auth/login/invoices/my');
    } catch (error) {
      console.error('Order error:', error);
      showAlert('Gagal', 'Gagal membuat pesanan. Silakan periksa koneksi Anda atau hubungi admin.', 'error');
      try {
        handleFirestoreError(error, OperationType.CREATE, 'invoices');
      } catch (e) {
        // ignore
      }
    } finally {
      setOrdering(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center space-y-3">
        <div className="w-10 h-10 border-3 border-[#8C3A50] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-500">Memuat rincian pesanan layanan &amp; add-on...</p>
      </div>
    );
  }

  if (itemCount === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 bg-white rounded-2xl border border-slate-200/90 p-8 text-center space-y-4 shadow-xs">
        <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Keranjang Pesanan Kosong</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Anda belum memilih paket layanan atau add-on untuk dipesan. Silakan buka katalog layanan untuk memilih.
        </p>
        <button
          type="button"
          onClick={() => navigate('/auth/login/services/catalog')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8C3A50] hover:bg-[#772F42] text-white text-xs font-semibold cursor-pointer shadow-xs"
        >
          <span>Buka Katalog Layanan</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 pb-12">
      {/* Top Header Bar */}
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
            Checkout Layanan &amp; Add-on
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Enkripsi SSL 256-Bit Aman</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Kolom Kiri: Rincian Paket, Add-on Selector, & Metode Pembayaran */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-5">
          {/* Kartu 1: Paket Layanan Utama */}
          {mainPackage ? (
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 to-white">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-50 text-[#8C3A50] border border-rose-200/70">
                    <Sparkles className="w-3 h-3 text-[#8C3A50]" />
                    Paket Layanan Utama
                  </span>
                  <div className="flex items-center gap-2">
                    {mainPackage.activePeriodDays ? (
                      <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        Masa Aktif {mainPackage.activePeriodDays} Hari
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                        Akses Permanen
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('/auth/login/services/catalog')}
                      className="text-xs text-[#8C3A50] hover:underline font-semibold cursor-pointer"
                    >
                      Ganti Paket
                    </button>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                      {mainPackage.name}
                    </h2>
                    {mainPackage.description && (
                      <p className="text-slate-600 text-sm leading-relaxed mt-2 whitespace-pre-line">
                        {mainPackage.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-2xl font-black font-mono text-slate-900">
                      Rp {mainPackage.price.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid Spesifikasi Kuota Terintegrasi */}
              <div className="p-5 sm:p-6 space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                    Spesifikasi Kuota &amp; Fasilitas Paket
                  </h3>
                  <div
                    className={`grid grid-cols-1 sm:grid-cols-2 ${
                      mainPackage.waBlastQuota ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
                    } gap-3`}
                  >
                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-600">Masa Aktif</span>
                      </div>
                      <div className="text-base font-bold text-slate-900">
                        {mainPackage.activePeriodDays ? `${mainPackage.activePeriodDays} Hari` : 'Selamanya'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-600">Kuota Acara</span>
                      </div>
                      <div className="text-base font-bold text-slate-900">
                        {mainPackage.eventQuota ? `${mainPackage.eventQuota} Acara` : 'Unlimited'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-600">Kuota Tamu</span>
                      </div>
                      <div className="text-base font-bold text-slate-900">
                        {mainPackage.guestQuota
                          ? `${mainPackage.guestQuota.toLocaleString('id-ID')} Tamu`
                          : 'Standar'}
                      </div>
                    </div>

                    {mainPackage.waBlastQuota ? (
                      <div className="p-3.5 rounded-xl border border-purple-200/80 bg-purple-50/40">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                            <Send className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-medium text-purple-900">Kuota Blast</span>
                        </div>
                        <div className="text-base font-bold text-purple-950">
                          {mainPackage.waBlastQuota.toLocaleString('id-ID')} Pesan
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Akun Lisensi Tujuan */}
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#8C3A50]/10 text-[#8C3A50] font-bold flex items-center justify-center shrink-0 text-sm">
                      {(appUser?.name || currentUser?.displayName || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Akun Penerima Lisensi
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
          ) : (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-6 h-6 text-amber-700 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-amber-900">Hanya Memesan Add-on</h3>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Anda tidak memilih paket utama, kuota add-on akan ditambahkan ke akun Anda saat ini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/auth/login/services/catalog')}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
              >
                + Pilih Paket Utama
              </button>
            </div>
          )}

          {/* Kartu 2: Add-on Terpilih & Selector Add-on Baru */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Tambahan Layanan (Add-on)</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tambahkan kuota ekstra (tamu, blast, masa aktif) dalam satu invoice sekaligus.
                </p>
              </div>
              <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                {addons.length} Add-on Terpilih
              </span>
            </div>

            {/* List of currently chosen add-ons in cart */}
            {addons.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Add-on Dalam Pesanan Ini
                </h3>
                <div className="space-y-2">
                  {addons.map((item) => (
                    <div
                      key={item.service.id}
                      className="p-3.5 rounded-xl border border-purple-200/90 bg-purple-50/40 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            {item.service.name}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md">
                            Add-on
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                          {item.service.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-purple-900">
                          {item.service.guestQuota ? (
                            <span>+{item.service.guestQuota * item.quantity} Tamu</span>
                          ) : null}
                          {item.service.waBlastQuota ? (
                            <span>• +{item.service.waBlastQuota * item.quantity} WA Blast</span>
                          ) : null}
                          {item.service.activePeriodDays ? (
                            <span>• +{item.service.activePeriodDays * item.quantity} Hari</span>
                          ) : null}
                        </div>
                      </div>

                      {/* Quantity Control */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateAddonQuantity(item.service.id!, item.quantity - 1)}
                          className="w-7 h-7 bg-white rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-100 flex items-center justify-center text-sm font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold font-mono text-purple-950 w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateAddonQuantity(item.service.id!, item.quantity + 1)}
                          className="w-7 h-7 bg-white rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-100 flex items-center justify-center text-sm font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      {/* Price & Delete */}
                      <div className="text-right min-w-[90px]">
                        <span className="text-sm font-bold font-mono text-purple-950 block">
                          Rp {(item.service.price * item.quantity).toLocaleString('id-ID')}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAddon(item.service.id!)}
                          className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Add Available Addons Carousel / Grid */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pilih &amp; Tambahkan Add-on Lainnya
                </h3>
                <span className="text-[11px] text-slate-400">1-klik langsung masuk invoice</span>
              </div>

              {availableAddons.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Belum ada add-on aktif lainnya.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableAddons.map((addon) => {
                    const inCart = isAddonInCart(addon.id!);
                    return (
                      <div
                        key={addon.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                          inCart
                            ? 'border-purple-300 bg-purple-50/20'
                            : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold text-slate-900">{addon.name}</span>
                            <span className="text-xs font-bold font-mono text-[#8C3A50]">
                              Rp {addon.price.toLocaleString('id-ID')}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-2">{addon.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] text-slate-600">
                            {addon.guestQuota ? (
                              <span className="bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200/60">
                                +{addon.guestQuota.toLocaleString('id-ID')} Tamu
                              </span>
                            ) : null}
                            {addon.waBlastQuota ? (
                              <span className="bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded border border-purple-200/60">
                                +{addon.waBlastQuota.toLocaleString('id-ID')} Blast
                              </span>
                            ) : null}
                            {addon.activePeriodDays ? (
                              <span className="bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded border border-indigo-200/60">
                                +{addon.activePeriodDays} Hari
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="pt-3 mt-3 border-t border-slate-100 flex justify-end">
                          {inCart ? (
                            <button
                              type="button"
                              onClick={() => removeAddon(addon.id!)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                            >
                              ✓ Terpasang (Hapus)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addAddon(addon)}
                              className="px-3 py-1 rounded-lg text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Tambah Add-on</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Kartu 3: Pilihan Metode Pembayaran */}
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
                <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-600">
                  Pembayaran gateway Tripay aktif.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Ringkasan Pesanan & Tombol Checkout (Sticky Sidebar) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sticky top-6 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Ringkasan Pembayaran</h2>
              <p className="text-xs text-slate-500 mt-0.5">Rincian item paket &amp; add-on pesanan</p>
            </div>

            {/* Itemized List */}
            <div className="space-y-2.5 text-xs text-slate-700 border-b border-slate-100 pb-4">
              {mainPackage && (
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="font-bold text-slate-900 block">{mainPackage.name}</span>
                    <span className="text-[11px] text-slate-400">Paket Layanan Utama</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 shrink-0">
                    Rp {mainPackage.price.toLocaleString('id-ID')}
                  </span>
                </div>
              )}

              {addons.map((item) => (
                <div key={item.service.id} className="flex justify-between items-start gap-2">
                  <div>
                    <span className="font-semibold text-slate-900 block">
                      {item.service.name} {item.quantity > 1 ? `(x${item.quantity})` : ''}
                    </span>
                    <span className="text-[11px] text-purple-600">Add-on Tambahan</span>
                  </div>
                  <span className="font-mono font-semibold text-purple-900 shrink-0">
                    Rp {(item.service.price * item.quantity).toLocaleString('id-ID')}
                  </span>
                </div>
              ))}
            </div>

            {/* Combined Quota Highlight Box */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs text-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Akumulasi Kuota yang Didapat
              </span>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Masa Aktif:</span>
                  <span className="font-bold text-slate-900">
                    {totalActivePeriodDays ? `${totalActivePeriodDays} Hari` : 'Permanen'}
                  </span>
                </div>
                {totalGuestQuota > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kuota Tamu:</span>
                    <span className="font-bold text-amber-700 font-mono">
                      {totalGuestQuota.toLocaleString('id-ID')} Tamu
                    </span>
                  </div>
                )}
                {totalWaBlastQuota > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kuota WA Blast:</span>
                    <span className="font-bold text-purple-700 font-mono">
                      {totalWaBlastQuota.toLocaleString('id-ID')} Pesan
                    </span>
                  </div>
                )}
                {totalEventQuota > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kuota Acara:</span>
                    <span className="font-bold text-emerald-700">
                      {totalEventQuota} Acara
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-slate-500">
                <span>Subtotal Harga</span>
                <span className="font-semibold text-slate-800">
                  Rp {totalNormalPrice.toLocaleString('id-ID')}
                </span>
              </div>

              {totalDiscount > 0 && (
                <div className="flex justify-between items-center text-emerald-600">
                  <div className="flex items-center gap-1.5">
                    <span>Diskon Promo</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded">
                      Hemat
                    </span>
                  </div>
                  <span className="font-bold">- Rp {totalDiscount.toLocaleString('id-ID')}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-slate-500">
                <span>Biaya Layanan</span>
                <span className="font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs">
                  Rp 0 (Gratis)
                </span>
              </div>
            </div>

            {/* Total Box */}
            <div className="pt-4 border-t border-dashed border-slate-200">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Total Pembayaran
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {itemCount} Layanan ({mainPackage ? '1 Paket' : '0 Paket'} + {addons.length} Add-on)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
                    Rp {totalPrice.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>

            {/* Compact Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleOrder}
                disabled={ordering}
                className="w-full bg-[#8C3A50] hover:bg-[#772F42] active:bg-[#682436] text-white font-medium py-2.5 px-4 rounded-xl shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer text-xs sm:text-sm tracking-wide"
              >
                {ordering ? (
                  <>
                    <svg
                      className="animate-spin h-3.5 w-3.5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
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
                <span>Aktivasi Otomatis Setelah Verifikasi</span>
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
