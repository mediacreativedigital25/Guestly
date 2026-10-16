import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { GuestlyService } from '../../types';
import { useAuth } from '../../AuthContext';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../CartContext';
import { Modal } from '../../components/Modal';
import {
  ShoppingBag,
  Sparkles,
  Check,
  Plus,
  Trash2,
  Clock,
  Calendar,
  Users,
  Send,
  ArrowRight,
  ShieldCheck,
  Layers,
  HelpCircle,
  X,
  Zap,
  CheckCircle2,
  Lock,
  CreditCard,
  Flame,
  Minus,
  Building2,
  ChevronRight
} from 'lucide-react';

export default function ServicesCatalog() {
  const [services, setServices] = useState<GuestlyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'package' | 'addon'>('all');
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  const { appUser } = useAuth();
  const navigate = useNavigate();
  const {
    mainPackage,
    addons,
    setMainPackage,
    addAddon,
    removeAddon,
    toggleAddon,
    updateAddonQuantity,
    clearCart,
    isAddonInCart,
    isPackageInCart,
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

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const servicesRef = collection(db, 'services');
        const q = query(servicesRef, where('isActive', '==', true));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as GuestlyService)
        );

        let filteredData = data;
        if (appUser?.role === 'client') {
          filteredData = data.filter((s) => s.targetRole === 'client' || s.targetRole === 'all');
        } else if (appUser?.role === 'partner' || appUser?.role === 'owner') {
          filteredData = data.filter((s) => s.targetRole === 'partner' || s.targetRole === 'all');
        }

        setServices(filteredData);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'services');
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, [appUser?.role]);

  const packageServices = services.filter((s) => s.type === 'package');
  const addonServices = services.filter((s) => s.type === 'addon');

  const displayedPackages = activeTab === 'addon' ? [] : packageServices;
  const displayedAddons = activeTab === 'package' ? [] : addonServices;

  const handleSelectPackage = (service: GuestlyService) => {
    if (isPackageInCart(service.id!)) {
      setMainPackage(null);
    } else {
      setMainPackage(service);
    }
  };

  const handleDirectCheckout = (service: GuestlyService) => {
    if (service.type === 'package') {
      setMainPackage(service);
    } else {
      if (!isAddonInCart(service.id!)) {
        addAddon(service);
      }
    }
    navigate('/auth/login/services/checkout');
  };

  return (
    <div className="space-y-8 pb-32 max-w-7xl mx-auto">
      {/* Guestly Signature Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#4A1623] via-[#652435] to-[#8C3A50] text-white p-7 sm:p-9 rounded-3xl border border-rose-900/40 shadow-xl shadow-[#8C3A50]/15">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-gradient-to-bl from-rose-300/20 to-transparent blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-64 h-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-white/10 backdrop-blur-md text-rose-200 border border-white/20 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-rose-200" />
              <span>GUESTLY CLOUD MARKETPLACE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Katalog Layanan &amp; Paket Kuota
            </h1>
            <p className="text-sm text-rose-100/90 mt-2 leading-relaxed">
              Pilih paket fondasi buku tamu digital sesuai skala acara Anda, lalu gabungkan dengan add-on kuota tambahan dalam satu invoice resmi.
            </p>
          </div>

          {/* Trust Badge / Header Info */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="bg-black/20 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/15 text-xs text-rose-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-rose-200 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-white block">Aktivasi Instan &amp; Resmi</span>
                <span className="text-[11px] text-rose-200">Kuota &amp; lisensi bertambah otomatis</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200/60 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua Layanan ({services.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('package')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'package'
                ? 'bg-white text-[#8C3A50] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#8C3A50]" />
            <span>Paket Utama ({packageServices.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('addon')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'addon'
                ? 'bg-white text-[#8C3A50] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5 text-[#8C3A50]" />
            <span>Add-on Tambahan ({addonServices.length})</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2 px-2">
          <Zap className="w-4 h-4 text-amber-500 shrink-0" />
          <span>Bisa checkout <strong>1 Paket Utama + berbagai Add-on</strong> sekaligus.</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-24 bg-white rounded-3xl border border-slate-200/80 shadow-2xs">
          <div className="w-10 h-10 border-4 border-[#8C3A50] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Memuat katalog layanan...</p>
        </div>
      ) : services.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-16 text-center text-slate-500 space-y-3">
          <Layers className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Katalog Layanan Sedang Diperbarui</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Belum ada paket yang aktif untuk akun Anda saat ini. Hubungi Super Admin jika membutuhkan bantuan.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Section 1: Paket Utama (Core Plans) */}
          {displayedPackages.length > 0 && (
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8C3A50]" />
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">
                      1. Pilih Paket Fondasi Utama
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Paket lengkap yang mencakup sistem buku tamu QR, hak akses acara, layar sapa, dan laporan realtime.
                  </p>
                </div>
                <span className="hidden sm:inline-block text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  Wajib pilih minimal 1 paket
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedPackages.map((service) => {
                  const isSelected = isPackageInCart(service.id!);

                  return (
                    <div
                      key={service.id}
                      className={`rounded-3xl transition-all duration-300 flex flex-col h-full relative overflow-hidden bg-white border ${
                        isSelected
                          ? 'border-[#8C3A50] ring-3 ring-[#8C3A50]/20 shadow-xl shadow-[#8C3A50]/5 -translate-y-1'
                          : 'border-slate-200/90 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5'
                      }`}
                    >
                      {/* Top Accent Gradient Bar */}
                      <div className={`h-2 w-full ${isSelected ? 'bg-gradient-to-r from-[#8C3A50] via-rose-500 to-amber-500' : 'bg-slate-100'}`} />

                      <div className="p-6 flex-1 flex flex-col justify-between">
                        <div>
                          {/* Badge Bar */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-50 text-[#8C3A50] border border-rose-200/80 shadow-2xs">
                              <Sparkles className="w-3.5 h-3.5 text-[#8C3A50]" />
                              <span>Paket Utama</span>
                            </span>

                            {isSelected && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 shadow-2xs">
                                <Check className="w-3.5 h-3.5" />
                                Terpilih
                              </span>
                            )}
                          </div>

                          <h3 className="text-xl font-black text-slate-900 tracking-tight">{service.name}</h3>
                          <p className="mt-2 text-xs text-slate-500 line-clamp-3 leading-relaxed whitespace-pre-line">
                            {service.description || 'Sistem buku tamu digital lengkap untuk manajemen tamu profesional.'}
                          </p>

                          {/* Bento Quota Chips Grid */}
                          <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <span className="text-[10px] text-slate-400 uppercase font-bold block">Masa Aktif</span>
                              <span className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                {service.activePeriodDays ? `${service.activePeriodDays} Hari` : 'Selamanya'}
                              </span>
                            </div>

                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <span className="text-[10px] text-slate-400 uppercase font-bold block">Kuota Acara</span>
                              <span className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                {service.eventQuota || 1} Acara
                              </span>
                            </div>

                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <span className="text-[10px] text-slate-400 uppercase font-bold block">Kuota Tamu</span>
                              <span className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                                <Users className="w-3.5 h-3.5 text-amber-600" />
                                {service.guestQuota ? `${service.guestQuota.toLocaleString('id-ID')} Tamu` : '-'}
                              </span>
                            </div>

                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <span className="text-[10px] text-slate-400 uppercase font-bold block">WA Blast</span>
                              <span className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                                <Send className="w-3.5 h-3.5 text-purple-600" />
                                {service.waBlastQuota ? `${service.waBlastQuota.toLocaleString('id-ID')}` : 'Tersedia'}
                              </span>
                            </div>
                          </div>

                          {/* Standard Included Features List */}
                          <div className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Buku Tamu Digital QR &amp; Undangan Terintegrasi</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Layar Sapa TV (*Greeting Display Ready*)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Scanner Petugas (Check-in &amp; Souvenir)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Ekspor Rekap Kehadiran Realtime Excel</span>
                            </div>
                          </div>
                        </div>

                        {/* Pricing & CTA */}
                        <div className="mt-6 pt-4 border-t border-slate-100 space-y-4">
                          <div className="flex items-baseline justify-between">
                            <div>
                              {service.normalPrice && service.normalPrice > service.price && (
                                <span className="text-xs text-slate-400 line-through block font-mono">
                                  Rp {service.normalPrice.toLocaleString('id-ID')}
                                </span>
                              )}
                              <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                                Rp {service.price.toLocaleString('id-ID')}
                              </span>
                            </div>
                            {service.normalPrice && service.normalPrice > service.price && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Hemat Rp {(service.normalPrice - service.price).toLocaleString('id-ID')}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectPackage(service)}
                              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                isSelected
                                  ? 'bg-rose-50 text-[#8C3A50] border border-rose-300 hover:bg-rose-100'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {isSelected ? (
                                <>
                                  <Check className="w-4 h-4 text-[#8C3A50]" />
                                  <span>Paket Dipilih</span>
                                </>
                              ) : (
                                <span>Pilih Paket</span>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDirectCheckout(service)}
                              className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-[#8C3A50] to-[#702b3d] hover:from-[#7b3245] hover:to-[#5e2332] text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-[#8C3A50]/20"
                            >
                              <span>Checkout</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section 2: Add-on Booster Modular */}
          {displayedAddons.length > 0 && (
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">
                      2. Tambah Kuota &amp; Booster Modular (Add-on)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tingkatkan kapasitas acara, tamu ekstra, atau perpanjang masa aktif sesuai kebutuhan Anda.
                  </p>
                </div>
                <span className="hidden sm:inline-block text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                  Bisa beli lebih dari 1 unit
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {displayedAddons.map((service) => {
                  const addonItem = addons.find((a) => a.service.id === service.id);
                  const inCart = Boolean(addonItem);
                  const qty = addonItem?.quantity || 0;

                  return (
                    <div
                      key={service.id}
                      className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between bg-white relative ${
                        inCart
                          ? 'border-indigo-400 ring-2 ring-indigo-500/20 shadow-md bg-gradient-to-b from-indigo-50/20 to-white'
                          : 'border-slate-200/90 hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Plus className="w-3 h-3 text-indigo-600" />
                            Booster Add-on
                          </span>

                          {inCart && (
                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                              {qty}x di Keranjang
                            </span>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-slate-900">{service.name}</h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {service.description || 'Tambahan kapasitas kuota layanan.'}
                        </p>

                        {/* Specs Chips */}
                        <div className="mt-3.5 flex flex-wrap gap-1.5 text-[11px]">
                          {service.activePeriodDays ? (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                              +{service.activePeriodDays} Hari
                            </span>
                          ) : null}
                          {service.eventQuota ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold border border-emerald-100">
                              +{service.eventQuota} Acara
                            </span>
                          ) : null}
                          {service.clientQuota ? (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-800 font-semibold border border-cyan-100">
                              +{service.clientQuota} Client
                            </span>
                          ) : null}
                          {service.guestQuota ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold border border-amber-100">
                              +{service.guestQuota.toLocaleString('id-ID')} Tamu
                            </span>
                          ) : null}
                          {service.waBlastQuota ? (
                            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 font-semibold border border-purple-100">
                              +{service.waBlastQuota.toLocaleString('id-ID')} WA Blast
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Addon Price & Stepper */}
                      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div>
                          {service.normalPrice && service.normalPrice > service.price && (
                            <span className="text-[11px] text-slate-400 line-through font-mono block">
                              Rp {service.normalPrice.toLocaleString('id-ID')}
                            </span>
                          )}
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black font-mono text-slate-900">
                              Rp {service.price.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-slate-400">/ unit</span>
                          </div>
                        </div>

                        {inCart ? (
                          <div className="flex items-center gap-1.5 bg-indigo-50/80 p-1 rounded-xl border border-indigo-200">
                            <button
                              type="button"
                              onClick={() => updateAddonQuantity(service.id!, qty - 1)}
                              className="w-7 h-7 bg-white rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-100 flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs"
                              title="Kurangi"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-6 text-center text-xs font-mono font-bold text-indigo-900">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateAddonQuantity(service.id!, qty + 1)}
                              className="w-7 h-7 bg-white rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-100 flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs"
                              title="Tambah"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeAddon(service.id!)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer ml-0.5"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addAddon(service)}
                            className="py-2 px-3 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Tambah</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* SaaS Trust & Guarantee Pillars */}
          <div className="pt-6 border-t border-slate-200/70 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-start gap-3 shadow-2xs">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <strong className="text-slate-900 block text-xs">Aktivasi Instan Otomatis</strong>
                <p className="text-slate-500 mt-0.5 text-[11px] leading-relaxed">
                  Begitu pembayaran terkonfirmasi, kuota dan masa aktif langsung aktif di akun Anda.
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-start gap-3 shadow-2xs">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <strong className="text-slate-900 block text-xs">QRIS &amp; Transfer Bank</strong>
                <p className="text-slate-500 mt-0.5 text-[11px] leading-relaxed">
                  Mendukung seluruh m-Banking (BCA, Mandiri, BRI) dan E-Wallet (GoPay, OVO, DANA).
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-start gap-3 shadow-2xs">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <strong className="text-slate-900 block text-xs">Faktur &amp; Invoice Resmi</strong>
                <p className="text-slate-500 mt-0.5 text-[11px] leading-relaxed">
                  Setiap transaksi disertai nomor invoice unik yang dapat diunduh kapan saja.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Glassmorphic Cart Drawer Bar (Guestly Palette) */}
      {itemCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:left-64 md:right-8 z-40">
          <div className="bg-[#2D0F17]/95 backdrop-blur-xl text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border border-rose-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
            {/* Left summary */}
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#8C3A50] to-[#A3435E] text-white flex items-center justify-center shadow-md">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-400 text-[#2D0F17] text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#2D0F17]">
                  {itemCount}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">
                    {mainPackage ? mainPackage.name : 'Paket Belum Dipilih'}
                  </span>
                  {addons.length > 0 && (
                    <span className="text-[11px] font-bold bg-rose-500/20 text-rose-200 px-2.5 py-0.5 rounded-full border border-rose-400/30">
                      +{addons.length} Booster Add-on
                    </span>
                  )}
                </div>

                {/* Cumulative Quotas Pills */}
                <div className="flex items-center gap-1.5 text-[11px] text-rose-100/90 mt-1 flex-wrap">
                  {totalGuestQuota > 0 && (
                    <span className="bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                      👥 {totalGuestQuota.toLocaleString('id-ID')} Tamu
                    </span>
                  )}
                  {totalEventQuota > 0 && (
                    <span className="bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                      🎯 {totalEventQuota} Acara
                    </span>
                  )}
                  {totalActivePeriodDays > 0 && (
                    <span className="bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                      ⏳ {totalActivePeriodDays} Hari Aktif
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right price and actions */}
            <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
              <div className="text-right sm:pr-3">
                <span className="text-[10px] text-rose-200/80 block uppercase tracking-wider font-semibold">Total Tagihan</span>
                <span className="text-xl sm:text-2xl font-black font-mono text-white tracking-tight">
                  Rp {totalPrice.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCartModalOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-rose-100 text-xs font-bold transition-colors cursor-pointer border border-white/15"
                >
                  Rincian
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/auth/login/services/checkout')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#8C3A50] to-[#A3435E] hover:from-[#722B3E] hover:to-[#8C3A50] text-white text-xs font-black transition-all shadow-md shadow-black/30 flex items-center gap-2 cursor-pointer hover:scale-[1.02]"
                >
                  <span>Checkout Sekarang</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Modal / Slideout */}
      <Modal
        isOpen={isCartModalOpen}
        onClose={() => setIsCartModalOpen(false)}
        title="Rincian Keranjang Pesanan Layanan"
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          {itemCount === 0 ? (
            <div className="py-10 text-center text-slate-500 space-y-3">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">Keranjang Anda Masih Kosong</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Silakan pilih paket utama atau tambahkan booster kuota dari katalog.
              </p>
            </div>
          ) : (
            <>
              {/* Main Package Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Paket Layanan Utama
                  </span>
                  {mainPackage && (
                    <button
                      type="button"
                      onClick={() => setMainPackage(null)}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer font-semibold"
                    >
                      Hapus Paket
                    </button>
                  )}
                </div>

                {mainPackage ? (
                  <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex justify-between items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{mainPackage.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-[#8C3A50]">
                          Paket Utama
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex gap-2">
                        {mainPackage.activePeriodDays && <span>{mainPackage.activePeriodDays} Hari</span>}
                        {mainPackage.eventQuota && <span>• {mainPackage.eventQuota} Acara</span>}
                        {mainPackage.guestQuota && <span>• {mainPackage.guestQuota.toLocaleString('id-ID')} Tamu</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono font-bold text-slate-900">
                        Rp {mainPackage.price.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                    <span>Belum memilih paket utama. Anda dapat checkout add-on saja atau pilih paket di katalog.</span>
                  </div>
                )}
              </div>

              {/* Addons Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Booster Add-on ({addons.length})
                  </span>
                </div>

                {addons.length > 0 ? (
                  <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                    {addons.map((item) => (
                      <div key={item.service.id} className="p-3.5 flex justify-between items-center gap-3 bg-white">
                        <div>
                          <span className="font-semibold text-slate-900 text-xs block">{item.service.name}</span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            Rp {item.service.price.toLocaleString('id-ID')} x {item.quantity}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                            <button
                              type="button"
                              onClick={() => updateAddonQuantity(item.service.id!, item.quantity - 1)}
                              className="w-6 h-6 bg-white rounded border border-slate-200 flex items-center justify-center font-bold text-xs hover:bg-slate-50 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-5 text-center text-xs font-mono font-bold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateAddonQuantity(item.service.id!, item.quantity + 1)}
                              className="w-6 h-6 bg-white rounded border border-slate-200 flex items-center justify-center font-bold text-xs hover:bg-slate-50 cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          <span className="font-bold font-mono text-xs text-slate-900 w-24 text-right">
                            Rp {(item.service.price * item.quantity).toLocaleString('id-ID')}
                          </span>

                          <button
                            type="button"
                            onClick={() => removeAddon(item.service.id!)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Belum ada add-on yang ditambahkan.</p>
                )}
              </div>

              {/* Total Calculation Card */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Total Item:</span>
                  <span className="font-bold text-white">{itemCount} Layanan</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-300">Total Pembayaran:</span>
                  <span className="text-2xl font-black font-mono text-white">
                    Rp {totalPrice.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  Kosongkan Keranjang
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCartModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                  >
                    Lanjut Belanja
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCartModalOpen(false);
                      navigate('/auth/login/services/checkout');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#8C3A50] hover:bg-[#722b3e] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Lanjut ke Checkout</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
