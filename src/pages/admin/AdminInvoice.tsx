import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, query, serverTimestamp, runTransaction, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { showAlert, showConfirm } from '../../lib/alerts';
import { CheckCircle, XCircle, Eye, Calendar, Clock, ExternalLink, Copy, Check, Image as ImageIcon, Search, X, Receipt } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { DateRangeFilterBar, isWithinDateRange } from '../../components/DateRangeFilterBar';
import { resolveEventActiveUntil, formatDateInputYMD, resolveMediaUrl } from '../../lib/utils';

export default function AdminInvoice() {
  const { appUser } = useAuth();
  const { settings } = useSettings();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [vendorById, setVendorById] = useState<Record<string, { name: string; logoUrl?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null);
  const [copiedInvId, setCopiedInvId] = useState<string | null>(null);

  // Filters & Pagination (consistent with EventsList / Add Event)
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'pending_verification' | 'paid' | 'cancelled'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

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
        let usersMap: Record<string, string> = {};
        const vMap: Record<string, { name: string; logoUrl?: string }> = {};
        
        try {
          const usersSnap = await getDocs(collection(db, 'users'));
          usersSnap.forEach(d => {
            const u = d.data();
            const key = u.uid || d.id;
            const displayName = (u.businessName || u.brandName || u.name || 'Vendor').trim();
            if (u.name) usersMap[key] = u.name;
            vMap[key] = {
              name: displayName,
              logoUrl: u.logoUrl || u.brandLogo || undefined,
            };
            if (d.id !== key) {
              if (u.name) usersMap[d.id] = u.name;
              vMap[d.id] = {
                name: displayName,
                logoUrl: u.logoUrl || u.brandLogo || undefined,
              };
            }
          });
          setVendorById(vMap);
          
          const q = query(collection(db, 'invoices'));
          const querySnapshot = await getDocs(q);
          const fetchedInvoices: any[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            fetchedInvoices.push({ 
              id: docSnap.id, 
              ...data,
              userName: data.userName || usersMap[data.userId] || null
            });
          });
              
          // Sort manually by createdAt descended
          fetchedInvoices.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
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

        const targetEventRef = invoice.targetEventId ? doc(db, 'events', invoice.targetEventId) : null;
        const targetEventDoc = targetEventRef ? await transaction.get(targetEventRef) : null;

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
        let grantsWeddingPlanner = Boolean(invoice.includeWeddingPlanner);

        // Check if invoice is a consolidated (GB) invoice with childInvoiceIds
        const childTargetEventRefs: Array<{ ref: any; doc: any; activeDays: number; eventQuota: number; grantsWp: boolean }> = [];
        if (invoice.childInvoiceIds && Array.isArray(invoice.childInvoiceIds) && invoice.childInvoiceIds.length > 0) {
          for (const childId of invoice.childInvoiceIds) {
            const childRef = doc(db, 'invoices', childId);
            const childSnap = await transaction.get(childRef);
            if (!childSnap.exists()) continue;
            const childData = childSnap.data() as any;
            if (childData.status === 'paid') continue;

            let childActiveDays = 0;
            let childEventQuota = 0;
            let childGrantsWp = Boolean(childData.includeWeddingPlanner);

            if (childData.items && Array.isArray(childData.items) && childData.items.length > 0) {
              childData.items.forEach((item: any) => {
                const qty = item.quantity || 1;
                childEventQuota += (item.eventQuota || 0) * qty;
                addedClientQuota += (item.clientQuota || 0) * qty;
                addedGuestQuota += (item.guestQuota || 0) * qty;
                addedWaBlastQuota += (item.waBlastQuota || 0) * qty;
                childActiveDays += (item.activePeriodDays || 0) * qty;
                if (item.includeWeddingPlanner) childGrantsWp = true;
              });
            } else if (childData.serviceId) {
              const sSnap = await transaction.get(doc(db, 'services', childData.serviceId));
              if (sSnap.exists()) {
                const sData = sSnap.data() as any;
                childEventQuota += sData.eventQuota || 0;
                addedClientQuota += sData.clientQuota || 0;
                addedGuestQuota += sData.guestQuota || 0;
                addedWaBlastQuota += sData.waBlastQuota || 0;
                childActiveDays += sData.activePeriodDays || 0;
                if (sData.includeWeddingPlanner) childGrantsWp = true;
              }
            } else {
              childEventQuota += childData.totalEventQuota || 0;
              addedClientQuota += childData.totalClientQuota || 0;
              addedGuestQuota += childData.totalGuestQuota || 0;
              addedWaBlastQuota += childData.totalWaBlastQuota || 0;
              childActiveDays += childData.totalActivePeriodDays || 0;
            }

            addedEventQuota += childEventQuota;
            addedActiveDays += childActiveDays;
            if (childGrantsWp) grantsWeddingPlanner = true;

            if (childData.targetEventId && (childActiveDays > 0 || childEventQuota > 0 || childGrantsWp)) {
              const cEvRef = doc(db, 'events', childData.targetEventId);
              const cEvDoc = await transaction.get(cEvRef);
              if (cEvDoc.exists()) {
                childTargetEventRefs.push({
                  ref: cEvRef,
                  doc: cEvDoc,
                  activeDays: childActiveDays,
                  eventQuota: childEventQuota,
                  grantsWp: childGrantsWp,
                });
              }
            }
          }
        } else if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
          invoice.items.forEach((item: any) => {
            const qty = item.quantity || 1;
            addedEventQuota += (item.eventQuota || 0) * qty;
            addedClientQuota += (item.clientQuota || 0) * qty;
            addedGuestQuota += (item.guestQuota || 0) * qty;
            addedWaBlastQuota += (item.waBlastQuota || 0) * qty;
            addedActiveDays += (item.activePeriodDays || 0) * qty;
            if (item.includeWeddingPlanner) {
              grantsWeddingPlanner = true;
            }
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
            if (serviceData.includeWeddingPlanner) {
              grantsWeddingPlanner = true;
            }
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
          ...(grantsWeddingPlanner ? { includeWeddingPlanner: true } : {}),
          ...(newActiveUntil ? { activeUntil: newActiveUntil } : {}),
          updatedAt: serverTimestamp(),
        });

        if (targetEventRef && targetEventDoc && targetEventDoc.exists() && (addedActiveDays > 0 || addedEventQuota > 0 || grantsWeddingPlanner)) {
          const evData = targetEventDoc.data() as any;
          const now = new Date();
          const extensionDays = addedActiveDays > 0 ? addedActiveDays : 30;
          const currentEvExpiry = resolveEventActiveUntil(evData);
          const baseEventDate = currentEvExpiry && currentEvExpiry > now ? currentEvExpiry : now;
          const nextEvExpiryDate = new Date(baseEventDate.getTime() + extensionDays * 24 * 60 * 60 * 1000);
          const nextEvActiveUntil = formatDateInputYMD(nextEvExpiryDate);

          transaction.update(targetEventRef, {
            ...(addedActiveDays > 0 || addedEventQuota > 0
              ? {
                  activeUntil: nextEvActiveUntil,
                  activeDays: extensionDays,
                  status: 'published',
                  subscriptionStatus: 'active',
                }
              : {}),
            ...(grantsWeddingPlanner ? { includeWeddingPlanner: true } : {}),
            updatedAt: serverTimestamp(),
          });
        }

        for (const cEv of childTargetEventRefs) {
          const evData = cEv.doc.data() as any;
          const now = new Date();
          const extensionDays = cEv.activeDays > 0 ? cEv.activeDays : 30;
          const currentEvExpiry = resolveEventActiveUntil(evData);
          const baseEventDate = currentEvExpiry && currentEvExpiry > now ? currentEvExpiry : now;
          const nextEvExpiryDate = new Date(baseEventDate.getTime() + extensionDays * 24 * 60 * 60 * 1000);
          const nextEvActiveUntil = formatDateInputYMD(nextEvExpiryDate);

          transaction.update(cEv.ref, {
            ...(cEv.activeDays > 0 || cEv.eventQuota > 0
              ? {
                  activeUntil: nextEvActiveUntil,
                  activeDays: extensionDays,
                  status: 'published',
                  subscriptionStatus: 'active',
                }
              : {}),
            ...(cEv.grantsWp ? { includeWeddingPlanner: true } : {}),
            updatedAt: serverTimestamp(),
          });
        }

        transaction.update(invoiceRef, {
          status: 'paid',
          updatedAt: serverTimestamp(),
        });

        if (invoice.childInvoiceIds && Array.isArray(invoice.childInvoiceIds)) {
          for (const childId of invoice.childInvoiceIds) {
            const childRef = doc(db, 'invoices', childId);
            transaction.update(childRef, {
              status: 'paid',
              updatedAt: serverTimestamp(),
            });
          }
        }
      });

      const paidIds = new Set<string>([
        invoiceId,
        ...(Array.isArray(invoice.childInvoiceIds) ? invoice.childInvoiceIds : []),
      ]);
      setInvoices(invoices.map(inv => paidIds.has(inv.id) ? { ...inv, status: 'paid' } : inv));
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

  const consolidatedChildIds = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => {
      if (
        inv.isConsolidated &&
        Array.isArray(inv.childInvoiceIds) &&
        (inv.status === 'pending' || inv.status === 'pending_verification')
      ) {
        inv.childInvoiceIds.forEach((cid: string) => set.add(cid));
      }
    });
    return set;
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!isWithinDateRange(inv.createdAt, startDate, endDate)) return false;

      if (!q) return true;
      const vendorName = (inv.userId && vendorById[inv.userId]?.name) || inv.userName || '';
      const haystack = [
        inv.id,
        inv.serviceName,
        inv.userName,
        inv.userPhone,
        inv.targetEventTitle,
        vendorName,
        inv.paymentMethod,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [invoices, searchTerm, statusFilter, startDate, endDate, vendorById]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredInvoices.length);
  const paginatedInvoices = useMemo(
    () => filteredInvoices.slice(startIndex, endIndex),
    [filteredInvoices, startIndex, endIndex]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, startDate, endDate, itemsPerPage]);

  const hasActiveFilter =
    searchTerm.trim() !== '' ||
    statusFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '';

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat data payment receive...</div>;
  }

  if (appUser?.role !== 'superadmin') {
    return <div className="p-6 text-center text-red-500">Akses ditolak. Halaman ini hanya untuk super admin.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Unified Filter Box: Row 1 Rentang Tanggal | Row 2 Search, Status & Limit (Consistent with Add Event) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-2.5 sm:p-3">
        <DateRangeFilterBar
          label="Rentang Tgl Pesanan"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={() => {
            setStartDate('');
            setEndDate('');
          }}
          position="top"
        />

        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari ID pesanan, layanan, atau vendor..."
              className="w-full h-8.5 pl-8.5 pr-7 text-xs sm:text-sm bg-gray-50/70 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Filter Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[155px]"
              title="Filter status pembayaran"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Menunggu Pembayaran</option>
              <option value="pending_verification">Menunggu Verifikasi</option>
              <option value="paid">Lunas</option>
              <option value="cancelled">Dibatalkan</option>
            </select>

            {/* Tampilkan 10, 25, 50 */}
            <div className="flex items-center gap-1.5 h-8.5 px-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition shrink-0">
              <span className="text-xs text-gray-500 whitespace-nowrap">Tampilkan</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="bg-transparent text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer pr-0.5"
                title="Jumlah baris per halaman"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Box 2: Table Container */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {invoices.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
              <Receipt className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">Belum Ada Transaksi</h3>
            <p className="text-sm text-gray-500">Belum ada data invoice atau pembayaran masuk dalam sistem.</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-gray-500">Tidak ada data pembayaran yang sesuai dengan pencarian atau filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setStartDate('');
                setEndDate('');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
            >
              Reset Pencarian &amp; Filter
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">No</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Id Pesanan</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tanggal</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Umur Piutang</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedInvoices.map((inv, index) => {
                    const vendorInfo = (inv.userId && vendorById[inv.userId]) || { name: inv.userName || inv.userId || 'Guestly Partner' };
                    const isConsolidatedChild = consolidatedChildIds.has(inv.id);
                    const isUnpaid = inv.status === 'pending' || inv.status === 'pending_verification';
                    const daysOld = inv.createdAt?.toMillis
                      ? Math.max(0, Math.floor((Date.now() - inv.createdAt.toMillis()) / (1000 * 60 * 60 * 24)))
                      : 0;
                    const formattedDate = inv.createdAt?.toMillis
                      ? new Date(inv.createdAt.toMillis()).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '-';

                    return (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500">
                          {startIndex + index + 1}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-indigo-600">{inv.id}</span>
                            {inv.isConsolidated && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                                Gabungan
                              </span>
                            )}
                            {isConsolidatedChild && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                                Tergabung di GB
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>{inv.serviceName}</span>
                            {inv.items && inv.items.length > 1 && (
                              <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 text-[10px] font-bold rounded border border-purple-200">
                                {inv.items.length} item
                              </span>
                            )}
                            {inv.targetEventTitle && (
                              <span className="px-1.5 py-0.5 bg-rose-50 text-[#8C3A50] text-[10px] font-bold rounded border border-rose-200">
                                Perpanjang: {inv.targetEventTitle}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500">
                          {formattedDate}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            {vendorInfo.logoUrl ? (
                              <img
                                src={resolveMediaUrl(vendorInfo.logoUrl)}
                                alt={vendorInfo.name}
                                className="w-6 h-6 rounded-md object-contain bg-white border border-gray-200 shrink-0"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold border border-indigo-100 shrink-0">
                                {(vendorInfo.name || 'V').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium text-gray-800">{vendorInfo.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm">
                          {isUnpaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3" /> {daysOld} hari
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              inv.status === 'pending_verification' ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse' :
                              inv.status === 'cancelled' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}>
                              {inv.status === 'paid' ? 'Lunas' : inv.status === 'pending_verification' ? 'Menunggu Verifikasi' : inv.status === 'cancelled' ? 'Dibatalkan' : 'Menunggu Pembayaran'}
                            </span>
                            {inv.paymentProofUrl && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                <ImageIcon className="w-3 h-3" /> Bukti Transfer
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm font-mono font-bold text-gray-900">
                          Rp {(inv.amount || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingInvoice(inv)}
                              className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                              title="Detail Invoice"
                              aria-label="Detail Invoice"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {(inv.status === 'pending' || inv.status === 'pending_verification') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPaymentLink(inv.id)}
                                  className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors cursor-pointer"
                                  title="Salin Link Pembayaran"
                                  aria-label="Salin Link Pembayaran"
                                >
                                  {copiedInvId === inv.id ? (
                                    <Check className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmPayment(inv.id)}
                                  className="text-emerald-600 hover:text-emerald-900 flex items-center justify-center p-1.5 rounded-full hover:bg-emerald-50 transition-colors cursor-pointer"
                                  title="Konfirmasi Pembayaran Lunas"
                                  aria-label="Konfirmasi Pembayaran Lunas"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelPayment(inv.id)}
                                  className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Batalkan Invoice"
                                  aria-label="Batalkan Invoice"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer (Consistent with Add Event) */}
            <div className="px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 sm:px-5 gap-3 bg-gray-50/50">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span>
                  Menampilkan <span className="font-semibold text-gray-900">{filteredInvoices.length === 0 ? 0 : startIndex + 1}</span> – <span className="font-semibold text-gray-900">{endIndex}</span> dari <span className="font-semibold text-indigo-600">{filteredInvoices.length}</span> invoice
                </span>
                {hasActiveFilter && (
                  <>
                    <span className="text-xs text-gray-400">({invoices.length} total)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setStatusFilter('all');
                        setStartDate('');
                        setEndDate('');
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {totalPages > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(1)}
                      disabled={safeCurrentPage === 1}
                      className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title="Halaman Pertama"
                    >
                      «
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safeCurrentPage === 1}
                      className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      Sebelumnya
                    </button>
                    <span className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg">
                      Hal <span className="text-indigo-600 font-bold">{safeCurrentPage}</span> / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safeCurrentPage === totalPages}
                      className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      Selanjutnya
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={safeCurrentPage === totalPages}
                      className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title="Halaman Terakhir"
                    >
                      »
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
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
              {viewingInvoice.targetEventTitle && (
                <div className="col-span-2 pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                  <span className="text-slate-500">Target Perpanjangan Acara:</span>
                  <span className="font-bold text-[#8C3A50]">{viewingInvoice.targetEventTitle}</span>
                </div>
              )}
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

            {/* Items / Consolidated Child Invoices Breakdown */}
            {(() => {
              const childIds: string[] = Array.isArray(viewingInvoice.childInvoiceIds)
                ? viewingInvoice.childInvoiceIds
                : [];
              const childInvoices = childIds.map((cid) => {
                const found = invoices.find((inv) => inv.id === cid);
                return found || { id: cid, serviceName: 'Invoice Layanan', amount: 0 };
              });

              const totalActivePeriodDays =
                viewingInvoice.totalActivePeriodDays ||
                childInvoices.reduce((sum, c) => sum + (c.totalActivePeriodDays || 0), 0);
              const totalEventQuota =
                viewingInvoice.totalEventQuota ||
                childInvoices.reduce((sum, c) => sum + (c.totalEventQuota || 0), 0);
              const totalGuestQuota =
                viewingInvoice.totalGuestQuota ||
                childInvoices.reduce((sum, c) => sum + (c.totalGuestQuota || 0), 0);
              const totalWaBlastQuota =
                viewingInvoice.totalWaBlastQuota ||
                childInvoices.reduce((sum, c) => sum + (c.totalWaBlastQuota || 0), 0);
              const hasAnyQuota = Boolean(
                totalActivePeriodDays || totalEventQuota || totalGuestQuota || totalWaBlastQuota
              );

              return (
                <>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      {childInvoices.length > 0
                        ? `Rincian Invoice Gabungan (${childInvoices.length} Invoice)`
                        : 'Daftar Item Layanan & Add-on'}
                    </h4>

                    {childInvoices.length > 0 ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs bg-white max-h-64 overflow-y-auto">
                        {childInvoices.map((child: any, idx: number) => {
                          const childDate = child.createdAt?.toMillis
                            ? new Date(child.createdAt.toMillis()).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '-';
                          return (
                            <div key={child.id || idx} className="p-3.5 space-y-2">
                              <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono font-bold text-indigo-700">#{child.id}</span>
                                    <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                                      <Calendar className="w-3 h-3 text-slate-400" />
                                      {childDate}
                                    </span>
                                    {child.status && (
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          child.status === 'paid'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : child.status === 'cancelled'
                                            ? 'bg-rose-100 text-rose-700'
                                            : 'bg-amber-100 text-amber-700'
                                        }`}
                                      >
                                        {child.status === 'paid'
                                          ? 'Lunas'
                                          : child.status === 'cancelled'
                                          ? 'Dibatalkan'
                                          : 'Belum Lunas'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-semibold text-slate-900">
                                    {child.serviceName || 'Layanan Acara'}
                                  </div>
                                </div>
                                <div className="text-right font-mono font-bold text-slate-900 shrink-0">
                                  Rp {(child.amount || 0).toLocaleString('id-ID')}
                                </div>
                              </div>

                              {Array.isArray(child.items) && child.items.length > 0 && (
                                <div className="pl-3 border-l-2 border-slate-200 space-y-1">
                                  {child.items.map((item: any, itemIdx: number) => (
                                    <div key={itemIdx} className="flex justify-between items-center gap-2 text-[11px] text-slate-600">
                                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                        <span className="truncate">{item.serviceName}</span>
                                        <span
                                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                            item.type === 'package'
                                              ? 'bg-rose-50 text-[#8C3A50]'
                                              : 'bg-purple-50 text-purple-700'
                                          }`}
                                        >
                                          {item.type === 'package' ? 'Paket Utama' : 'Add-on'}
                                        </span>
                                        {(item.quantity || 1) > 1 && (
                                          <span className="font-mono text-slate-500">x{item.quantity}</span>
                                        )}
                                      </div>
                                      <span className="font-mono text-slate-700 shrink-0">
                                        Rp {((item.price || 0) * (item.quantity || 1)).toLocaleString('id-ID')}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
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
                    )}
                  </div>

                  {/* Quota Highlights */}
                  {hasAnyQuota && (
                    <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-200/70 text-xs space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 block">
                        Total Kuota yang Diberikan ke Akun
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                        {totalActivePeriodDays ? (
                          <div>Masa Aktif: <strong>+{totalActivePeriodDays} Hari</strong></div>
                        ) : null}
                        {totalEventQuota ? (
                          <div>Kuota Acara: <strong>+{totalEventQuota} Acara</strong></div>
                        ) : null}
                        {totalGuestQuota ? (
                          <div>Kuota Tamu: <strong>+{totalGuestQuota.toLocaleString('id-ID')} Tamu</strong></div>
                        ) : null}
                        {totalWaBlastQuota ? (
                          <div>Kuota WA Blast: <strong>+{totalWaBlastQuota.toLocaleString('id-ID')} Pesan</strong></div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

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
