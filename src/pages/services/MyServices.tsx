import React, { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  CheckCircle,
  Clock,
  CalendarDays,
  Users,
  PartyPopper,
  MessageCircle,
  ShoppingBag,
  Building2,
  ShieldCheck,
  Infinity as InfinityIcon,
  ArrowRight,
  Receipt
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getRoleLabel, getUserBusinessId, canUserAccessEvent, isPartnerBusinessRegistered } from '../../lib/utils';
import { EventRecord } from '../../types';

export default function MyServices() {
  const { appUser, currentUser } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [usageStats, setUsageStats] = useState({
    eventsUsed: 0,
    clientsUsed: 0,
  });
  const [loading, setLoading] = useState(true);

  const isPartnerOrOwner = Boolean(
    appUser && ['owner', 'partner', 'superadmin', 'admin'].includes(appUser.role)
  );

  useEffect(() => {
    const fetchServicesAndUsage = async () => {
      if (!currentUser || !appUser) return;
      try {
        setLoading(true);

        // 1. Fetch Paid Invoices for this user
        const qInvoices = query(
          collection(db, 'invoices'),
          where('userId', '==', currentUser.uid),
          where('status', '==', 'paid')
        );
        const querySnapshot = await getDocs(qInvoices);
        const fetchedInvoices: any[] = [];
        querySnapshot.forEach((docSnap) => {
          fetchedInvoices.push({ id: docSnap.id, ...docSnap.data() });
        });

        fetchedInvoices.sort((a, b) => {
          const msA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : Date.parse(a.createdAt) || 0);
          const msB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : Date.parse(b.createdAt) || 0);
          return msB - msA;
        });
        setInvoices(fetchedInvoices);

        // 2. Fetch actual usage (Events & Clients) for context
        try {
          const myBizId = getUserBusinessId(appUser) || appUser.id || '';
          const [eventsSnap, clientsSnap] = await Promise.all([
            getDocs(collection(db, 'events')),
            isPartnerOrOwner ? getDocs(collection(db, 'clients')) : Promise.resolve(null),
          ]);

          let myEventsCount = 0;
          eventsSnap.forEach((d) => {
            const ev = d.data() as EventRecord;
            if (appUser.role === 'client') {
              const targetClientId = appUser.clientId || appUser.id || '';
              if (ev.clientId === targetClientId) myEventsCount++;
            } else if (canUserAccessEvent(appUser, d.id, ev.partnerId, [myBizId, appUser.id || ''])) {
              myEventsCount++;
            }
          });

          let myClientsCount = 0;
          if (clientsSnap) {
            clientsSnap.forEach((d) => {
              const c = d.data();
              if (
                appUser.role === 'superadmin' ||
                c.partnerId === myBizId ||
                c.partnerId === appUser.id
              ) {
                myClientsCount++;
              }
            });
          }

          setUsageStats({
            eventsUsed: myEventsCount,
            clientsUsed: myClientsCount,
          });
        } catch {
          // ignore auxiliary usage lookup errors
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'invoices');
      } finally {
        setLoading(false);
      }
    };
    fetchServicesAndUsage();
  }, [currentUser, appUser, isPartnerOrOwner]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    return '-';
  };

  const getActiveUntilDate = () => {
    if (!appUser?.activeUntil) return null;
    const formatted = formatDate(appUser.activeUntil);
    return formatted !== '-' ? formatted : null;
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat data layanan...</div>;
  }

  const activeUntilFormatted = getActiveUntilDate();
  const eventQuotaValue =
    appUser?.eventCredit !== undefined
      ? appUser.eventCredit
      : appUser?.eventQuota !== undefined
      ? appUser.eventQuota
      : 0;
  const clientQuotaValue =
    appUser?.clientCredit !== undefined
      ? appUser.clientCredit
      : appUser?.clientQuota !== undefined
      ? appUser.clientQuota
      : 0;
  const hasUnlimitedManualEvents = Boolean(
    appUser?.role === 'superadmin' || appUser?.allowManualEvent || appUser?.eventManual
  );
  const guestQuotaValue = appUser?.guestQuota !== undefined ? Number(appUser.guestQuota) : 0;
  const isUnlimitedGuestQuota = guestQuotaValue <= 0 && (isPartnerOrOwner || eventQuotaValue > 0);
  const waBlastQuotaValue = appUser?.waBlastQuota !== undefined ? Number(appUser.waBlastQuota) : 0;
  const isVerifiedBusiness = isPartnerBusinessRegistered(appUser);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link
          to="/auth/login/invoices/my"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
        >
          <Receipt className="w-4 h-4 text-gray-500" />
          Lihat Invoice
        </Link>
        <Link
          to="/auth/login/services/catalog"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold shadow-xs transition-colors"
        >
          <ShoppingBag className="w-4 h-4" />
          Tambah / Upgrade Layanan
        </Link>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-gray-100">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold text-gray-900">Status Akun Aktif</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  Aktif
                </span>
                {isPartnerOrOwner && isVerifiedBusiness && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Partner Terverifikasi
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 mt-1">
                <span>
                  Sebagai{' '}
                  <strong className="font-semibold text-gray-800">
                    {getRoleLabel(appUser?.role, appUser?.staffType)}
                  </strong>
                </span>
                {appUser?.businessName && (
                  <span className="inline-flex items-center gap-1 text-indigo-700 font-medium">
                    • <Building2 className="w-3.5 h-3.5" /> {appUser.businessName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {hasUnlimitedManualEvents && (
            <div className="bg-indigo-50/80 border border-indigo-100 rounded-lg px-3.5 py-2 text-xs text-indigo-800 flex items-center gap-2 self-start md:self-auto">
              <InfinityIcon className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Hak Akses <strong>Buat Acara Manual</strong> Aktif
              </span>
            </div>
          )}
        </div>

        {/* Quota Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* 1. Masa Aktif */}
          <div className="border border-gray-200/80 bg-gray-50/70 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Masa Aktif Hingga
                </p>
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-lg font-bold text-gray-900 leading-snug mt-1">
                {activeUntilFormatted || 'Selamanya (Tanpa Batas)'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-500">
              <span>Status Lisensi</span>
              <span className="font-semibold text-emerald-700">Aktif Berjalan</span>
            </div>
          </div>

          {/* 2. Kuota Acara */}
          <div className="border border-gray-200/80 bg-gray-50/70 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Kuota Acara
                </p>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <PartyPopper className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
                  {eventQuotaValue}
                </span>
                <span className="text-sm font-medium text-gray-500">Acara Tersisa</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-500">
              <span>Acara Dikelola Saat Ini:</span>
              <span className="font-semibold text-gray-800 font-mono tabular-nums">
                {usageStats.eventsUsed} Acara
              </span>
            </div>
          </div>

          {/* 3. Kuota Client (For Owner / Partner / Admin / Superadmin) OR Kuota WA Blast (For Client) */}
          {isPartnerOrOwner ? (
            <div className="border border-gray-200/80 bg-gray-50/70 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Kuota Client
                  </p>
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
                    {clientQuotaValue}
                  </span>
                  <span className="text-sm font-medium text-gray-500">Client Tersisa</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-500">
                <span>Client Terdaftar:</span>
                <span className="font-semibold text-gray-800 font-mono tabular-nums">
                  {usageStats.clientsUsed} Client
                </span>
              </div>
            </div>
          ) : (
            <div className="border border-gray-200/80 bg-gray-50/70 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Kuota WA Blast
                  </p>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
                    {waBlastQuotaValue.toLocaleString('id-ID')}
                  </span>
                  <span className="text-sm font-medium text-gray-500">Pesan</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-500">
                <span>Pengiriman WhatsApp</span>
                <span className="font-semibold text-indigo-600">Siap Digunakan</span>
              </div>
            </div>
          )}

          {/* 4. Kuota Tamu (Per Acara) */}
          <div className="border border-gray-200/80 bg-gray-50/70 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Kuota Tamu (Per Acara)
                </p>
                <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                  <CalendarDays className="w-4 h-4" />
                </div>
              </div>
              {isUnlimitedGuestQuota ? (
                <div className="mt-1">
                  <p className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
                    <InfinityIcon className="w-5 h-5 text-teal-600 shrink-0" />
                    <span>Tanpa Batas</span>
                  </p>
                </div>
              ) : (
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
                    {guestQuotaValue.toLocaleString('id-ID')}
                  </span>
                  <span className="text-sm font-medium text-gray-500">Tamu</span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-500">
              <span>Kapasitas Undangan:</span>
              <span className="font-semibold text-teal-700">
                {isUnlimitedGuestQuota ? 'Unlimited / Acara' : `Maks. ${guestQuotaValue} Tamu`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Purchase / Allocation History */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Riwayat Pembelian &amp; Aktivasi Layanan</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Daftar paket layanan, add-on, maupun alokasi lisensi yang aktif pada akun Anda.
            </p>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
            {(eventQuotaValue > 0 || clientQuotaValue > 0 || isPartnerOrOwner) ? (
              <div className="divide-y divide-gray-100">
                <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-indigo-50/30">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700 shrink-0 mt-0.5">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900">
                          Alokasi Lisensi &amp; Kuota {isPartnerOrOwner ? 'Partner Guestly' : 'Akun'}
                        </h4>
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-green-100 text-green-800">
                          Aktif
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        Kuota akun Anda ({eventQuotaValue} Acara
                        {isPartnerOrOwner ? `, ${clientQuotaValue} Client` : ''}) telah diaktifkan langsung melalui sistem manajemen lisensi Guestly.
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        Terdaftar sejak: {formatDate(appUser?.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/auth/login/services/catalog"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-3.5 py-2 rounded-lg transition-colors self-start sm:self-center shrink-0"
                  >
                    <span>Tambah Kuota / Add-on</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <div className="px-6 py-3.5 bg-gray-50 text-xs text-gray-500 flex items-center justify-between">
                  <span>Belum ada transaksi pembelian mandiri melalui checkout katalog.</span>
                  <Link to="/auth/login/invoices/my" className="text-indigo-600 hover:underline font-medium">
                    Cek Halaman Invoice &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 space-y-3">
                <p>Belum ada riwayat pembelian layanan.</p>
                <Link
                  to="/auth/login/services/catalog"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <span>Lihat Katalog Layanan</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      ID Invoice / Layanan
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Tanggal Pembelian
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Nominal
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm font-semibold text-gray-900">{invoice.serviceName}</p>
                        <p className="text-xs font-mono text-indigo-600">#{invoice.id}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(invoice.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900">
                        Rp {(invoice.amount || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Lunas &amp; Aktif
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
