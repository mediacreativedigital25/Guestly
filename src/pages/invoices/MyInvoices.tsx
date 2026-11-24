import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { Modal } from '../../components/Modal';
import { showAlert, showConfirm } from '../../lib/alerts';
import { Copy, Check, MessageCircle, ExternalLink, Receipt, CheckSquare, Square, CreditCard, Clock, Search, Eye, Trash2, QrCode, Building, Save, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DateRangeFilterBar, isWithinDateRange } from '../../components/DateRangeFilterBar';
import { resolveMediaUrl } from '../../lib/utils';

export default function MyInvoices() {
  const { appUser, currentUser } = useAuth();
  const { settings } = useSettings();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [vendorById, setVendorById] = useState<Record<string, { name: string; logoUrl?: string }>>({});
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [isBulkPaymentModalOpen, setIsBulkPaymentModalOpen] = useState(false);
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState<'qris' | 'manual'>('qris');
  const [savedGbInvoiceId, setSavedGbInvoiceId] = useState<string | null>(null);
  const [savedGbInvoices, setSavedGbInvoices] = useState<any[]>([]);
  const [isSavingGb, setIsSavingGb] = useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [selectedChildInvoices, setSelectedChildInvoices] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectedInvoice && selectedInvoice.childInvoiceIds && Array.isArray(selectedInvoice.childInvoiceIds)) {
      const found = invoices.filter(inv => selectedInvoice.childInvoiceIds.includes(inv.id));
      if (found.length === selectedInvoice.childInvoiceIds.length) {
        setSelectedChildInvoices(found);
      } else {
        getDocs(collection(db, 'invoices')).then(snap => {
          const all: any[] = [];
          snap.forEach(d => {
            if (selectedInvoice.childInvoiceIds.includes(d.id)) {
              all.push({ id: d.id, ...d.data() });
            }
          });
          setSelectedChildInvoices(all);
        }).catch(err => console.error(err));
      }
    } else {
      setSelectedChildInvoices([]);
    }
  }, [selectedInvoice, invoices]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchUnpaidInvoices = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const usersSnap = await getDocs(collection(db, 'users'));
      const vMap: Record<string, { name: string; logoUrl?: string }> = {};
      usersSnap.forEach(uDoc => {
        const u = uDoc.data();
        vMap[uDoc.id] = {
          name: (u.businessName || u.brandName || u.name || 'Vendor').trim(),
          logoUrl: u.logoUrl || u.brandLogo || undefined
        };
      });
      setVendorById(vMap);

      const q = query(
        collection(db, 'invoices'),
        where('userId', '==', currentUser.uid)
      );
      const querySnapshot = await getDocs(q);
      const fetched: any[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === 'pending' || data.status === 'pending_verification') {
          fetched.push({ id: docSnap.id, ...data });
        }
      });
          
      fetched.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setInvoices(fetched);
      setLoading(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'setup_unpaid_invoices');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnpaidInvoices();
  }, [currentUser]);

  // Set of child invoice IDs that have already been consolidated into an active GB invoice
  const consolidatedChildIds = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach(inv => {
      if (inv.isConsolidated && Array.isArray(inv.childInvoiceIds) && (inv.status === 'pending' || inv.status === 'pending_verification')) {
        inv.childInvoiceIds.forEach((id: string) => set.add(id));
      }
    });
    return set;
  }, [invoices]);

  const handleOpenBulkPaymentModal = () => {
    setSavedGbInvoiceId(null);
    setSavedGbInvoices([]);
    if (selectedInvoicesList.length > 0) {
      const firstMethod = selectedInvoicesList[0]?.paymentMethod;
      if (firstMethod === 'qris' || firstMethod === 'manual') {
        setBulkPaymentMethod(firstMethod);
      } else if (settings?.activePaymentMethod) {
        setBulkPaymentMethod(settings.activePaymentMethod === 'qris' ? 'qris' : 'manual');
      }
    }
    setIsBulkPaymentModalOpen(true);
  };

  const filteredInvoices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!isWithinDateRange(inv.createdAt, startDate, endDate)) return false;

      if (!q) return true;
      const vendorName = (inv.userId && vendorById[inv.userId]?.name) || inv.userName || '';
      const haystack = [inv.id, inv.serviceName, vendorName].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [invoices, searchTerm, statusFilter, startDate, endDate, vendorById]);

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredInvoices.length);
  const paginatedInvoices = filteredInvoices.slice(startIndex, startIndex + itemsPerPage);

  const toggleSelectAll = () => {
    // Only select un-consolidated invoices
    const eligibleInvoices = paginatedInvoices.filter(inv => !consolidatedChildIds.has(inv.id) && !inv.isConsolidated);
    const visibleIds = eligibleInvoices.map(inv => inv.id);
    const allSelected = visibleIds.every(id => selectedInvoiceIds.includes(id));
    if (allSelected) {
      setSelectedInvoiceIds(selectedInvoiceIds.filter(id => !visibleIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedInvoiceIds, ...visibleIds]));
      setSelectedInvoiceIds(merged);
    }
  };

  const toggleSelectInvoice = (id: string) => {
    if (consolidatedChildIds.has(id)) return; // Cannot select consolidated invoice
    if (selectedInvoiceIds.includes(id)) {
      setSelectedInvoiceIds(selectedInvoiceIds.filter(item => item !== id));
    } else {
      setSelectedInvoiceIds([...selectedInvoiceIds, id]);
    }
  };

  const selectedInvoicesList = invoices.filter(inv => selectedInvoiceIds.includes(inv.id));
  const bulkTotalAmount = selectedInvoicesList.reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const activeBulkInvoices = savedGbInvoiceId && savedGbInvoices.length > 0 ? savedGbInvoices : selectedInvoicesList;
  const activeBulkTotalAmount = activeBulkInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const handleSaveConsolidatedInvoice = async () => {
    if (selectedInvoicesList.length < 2) {
      showAlert('Perhatian', 'Pilih minimal 2 invoice untuk membuat invoice gabungan.', 'warning');
      return;
    }
    setIsSavingGb(true);
    try {
      // Format: GB + YYYYMM + 5 sequential digits matching GB20261100001 (same counter pattern as IN invoices)
      const counterRef = doc(db, 'counters', 'invoice_gb');
      const snapshotList = [...selectedInvoicesList];
      const snapshotIds = [...selectedInvoiceIds];
      const snapshotTotal = bulkTotalAmount;
      let gbId = '';

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let currentSeq = 1;
        if (counterDoc.exists() && typeof counterDoc.data()?.seq === 'number' && counterDoc.data().seq > 0) {
          currentSeq = counterDoc.data().seq + 1;
        }

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `GB${yyyy}${mm}`;

        let candidateId = `${prefix}${String(currentSeq).padStart(5, '0')}`;
        let existingDoc = await transaction.get(doc(db, 'invoices', candidateId));
        while (existingDoc.exists()) {
          currentSeq += 1;
          candidateId = `${prefix}${String(currentSeq).padStart(5, '0')}`;
          existingDoc = await transaction.get(doc(db, 'invoices', candidateId));
        }

        if (counterDoc.exists()) {
          transaction.update(counterRef, { seq: currentSeq });
        } else {
          transaction.set(counterRef, { seq: currentSeq });
        }

        gbId = candidateId;
        const gbRef = doc(db, 'invoices', gbId);
        transaction.set(gbRef, {
          id: gbId,
          userId: currentUser?.uid || '',
          userName: appUser?.name || currentUser?.email || 'Partner',
          serviceName: `Invoice Gabungan (${snapshotList.length} Layanan)`,
          amount: snapshotTotal,
          status: 'pending',
          paymentMethod: bulkPaymentMethod,
          childInvoiceIds: snapshotIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isConsolidated: true
        });
      });

      setSavedGbInvoices(snapshotList);
      setSavedGbInvoiceId(gbId);
      setIsSavingGb(false);
      showAlert('Berhasil', `Invoice gabungan berhasil disimpan dengan nomor ${gbId}`, 'success');
      setSelectedInvoiceIds([]);
      fetchUnpaidInvoices();
    } catch (error: any) {
      console.error(error);
      setIsSavingGb(false);
      showAlert('Gagal', error.message || 'Gagal menyimpan invoice gabungan', 'error');
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
      setInvoices(invoices.filter(inv => inv.id !== invoiceId));
      setSelectedInvoiceIds(selectedInvoiceIds.filter(id => id !== invoiceId));
      showAlert('Berhasil', 'Pesanan berhasil dibatalkan', 'success');

      if (appUser?.phone) {
        import('../../lib/fonnte').then(({ sendFonnteMessage }) => {
          let message = `Halo ${appUser.name || 'User'},\n\nPesanan Anda untuk layanan *${serviceName}* dengan nomor Invoice *${invoiceId}* telah Anda batalkan.\n\nJika ada pertanyaan silakan hubungi kami.\n\nTerima kasih,\nAdmin Guestly`;
          
          if (settings.fonnteTemplates?.orderCancelled) {
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
    return <div className="p-6 text-center text-gray-500">Memuat data invoice belum lunas...</div>;
  }

  const hasActiveFilter = Boolean(searchTerm || statusFilter !== 'all' || startDate || endDate);

  const currentDateFormatted = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const formattedInvoiceLines = activeBulkInvoices.map((inv) => {
    const dateStr = inv.createdAt ? new Date(inv.createdAt.toMillis()).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : currentDateFormatted;
    return `- ${inv.id} ${dateStr} - Rp ${(inv.amount || 0).toLocaleString('id-ID')}`;
  }).join('\n');

  const bulkWhatsappMessage = `*[KONFIRMASI PEMBAYARAN SEKALIGUS (BULK PAYMENT)]*
📅 Tanggal Transaksi: ${currentDateFormatted}
👤 Nama Akun / Partner: ${appUser?.name || 'Partner'}
💳 Metode Pembayaran: ${bulkPaymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank Manual'}
${savedGbInvoiceId ? `🆔 No. Invoice Gabungan: ${savedGbInvoiceId}` : ''}

Halo Admin, saya ingin melakukan konfirmasi pembayaran gabungan untuk ${activeBulkInvoices.length} Invoice berikut:
${formattedInvoiceLines}

💰 *Total Pembayaran: Rp ${activeBulkTotalAmount.toLocaleString('id-ID')}*

Berikut saya lampirkan bukti transfer pembayarannya. Mohon bantu verifikasi. Terima kasih!`;

  return (
    <div className="space-y-6">
      {/* Box 1: Filter & Search Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 space-y-4">
        <DateRangeFilterBar
          label="Rentang Tanggal Pesanan"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={() => { setStartDate(''); setEndDate(''); }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-7 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Cari ID pesanan, layanan, atau vendor..."
              className="pl-9 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-gray-50/50"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Menunggu Pembayaran</option>
              <option value="pending_verification">Menunggu Verifikasi</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value={10}>Tampilkan 10</option>
              <option value={25}>Tampilkan 25</option>
              <option value={50}>Tampilkan 50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Between Box 1 & Box 2: Bulk Pay Action Button */}
      {selectedInvoiceIds.length > 0 && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 p-3.5 rounded-xl">
          <span className="text-xs font-semibold text-indigo-900">
            {selectedInvoiceIds.length} invoice dipilih (Total: Rp {bulkTotalAmount.toLocaleString('id-ID')})
          </span>
          <button
            onClick={handleOpenBulkPaymentModal}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Bayar Sekaligus</span>
          </button>
        </div>
      )}

      {/* Box 2: Table */}
      {filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-800">Tidak Ada Tagihan Belum Lunas</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Semua pesanan Anda sudah lunas. Anda dapat melihat riwayat transaksi di menu Riwayat.
          </p>
          <div className="pt-2">
            <Link
              to="/auth/login/invoices/history"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Lihat Riwayat Invoice
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-12">
                    <button type="button" onClick={toggleSelectAll} className="flex items-center text-gray-600 hover:text-indigo-600 cursor-pointer">
                      {paginatedInvoices.length > 0 && paginatedInvoices.filter(inv => !consolidatedChildIds.has(inv.id) && !inv.isConsolidated).every(inv => selectedInvoiceIds.includes(inv.id)) && paginatedInvoices.some(inv => !consolidatedChildIds.has(inv.id) && !inv.isConsolidated) ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">No</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Id Pesanan</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tanggal</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Vendor</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Umur Piutang</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedInvoices.map((inv, index) => {
                  const isChecked = selectedInvoiceIds.includes(inv.id);
                  const isConsolidatedChild = consolidatedChildIds.has(inv.id);
                  const vendorInfo = (inv.userId && vendorById[inv.userId]) || { name: inv.userName || 'Guestly Partner' };
                  const daysOld = inv.createdAt ? Math.max(0, Math.floor((Date.now() - inv.createdAt.toMillis()) / (1000 * 60 * 60 * 24))) : 0;
                  
                  return (
                    <tr key={inv.id} className={`hover:bg-gray-50/60 transition-colors ${isChecked ? 'bg-indigo-50/40' : isConsolidatedChild ? 'bg-gray-50 opacity-75' : ''}`}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isConsolidatedChild ? (
                          <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200" title="Sudah digabungkan ke Invoice Gabungan">
                            Gabung
                          </span>
                        ) : (
                          <button type="button" onClick={() => toggleSelectInvoice(inv.id)} className="flex items-center text-gray-600 cursor-pointer">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {startIndex + index + 1}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-indigo-600">
                        {inv.id}
                        {inv.isConsolidated && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">Gabungan</span>
                        )}
                        {isConsolidatedChild && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">Tergabung di GB</span>
                        )}
                        <div className="text-xs text-gray-500 font-normal mt-0.5">{inv.serviceName}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {inv.createdAt ? new Date(inv.createdAt.toMillis()).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          {vendorInfo.logoUrl ? (
                            <img src={resolveMediaUrl(vendorInfo.logoUrl)} alt="" className="w-6 h-6 rounded-full object-cover border border-gray-200 shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                              {(vendorInfo.name || 'V').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-gray-800">{vendorInfo.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3" /> {daysOld} hari
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900">
                        Rp {inv.amount?.toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end space-x-1.5">
                          {!isConsolidatedChild ? (
                            <>
                              <Link
                                to={`/pay/${inv.id}`}
                                className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors"
                                title="Bayar Invoice"
                                aria-label="Bayar Invoice"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => handlePayNow(inv)}
                                className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                title="Detail Invoice"
                                aria-label="Detail Invoice"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {inv.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelInvoice(inv.id, inv.serviceName)}
                                  className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Batalkan Pesanan"
                                  aria-label="Batalkan Pesanan"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">Dibayar via Invoice Gabungan</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
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

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Sebelumnya
                </button>
                <span className="px-3 py-1 text-xs font-semibold text-gray-700">
                  Hal. {currentPage} dari {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-3 py-1 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Berikutnya
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Payment Modal */}
      <Modal
        isOpen={isBulkPaymentModalOpen}
        onClose={() => setIsBulkPaymentModalOpen(false)}
        title={`Pembayaran Sekaligus (${activeBulkInvoices.length} Invoice)`}
      >
        <div className="space-y-4">
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-2">
            <p className="text-xs text-indigo-800 font-bold uppercase tracking-wider">Ringkasan Pembayaran Gabungan</p>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Total Tagihan ({activeBulkInvoices.length} Invoice):</span>
              <span className="font-black text-indigo-900 font-mono text-xl">Rp {activeBulkTotalAmount.toLocaleString('id-ID')}</span>
            </div>
            {savedGbInvoiceId && (
              <div className="mt-2 pt-2 border-t border-indigo-200 text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Invoice Gabungan Tersimpan: <span className="font-mono">{savedGbInvoiceId}</span></span>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-gray-50 px-3.5 py-2.5 border-b border-gray-200 font-semibold text-gray-700">
              Daftar Invoice yang Dipilih:
            </div>
            <div className="divide-y divide-gray-100 bg-white max-h-36 overflow-y-auto">
              {activeBulkInvoices.map((inv) => (
                <div key={inv.id} className="p-3 flex justify-between items-center gap-2">
                  <div>
                    <span className="font-bold text-indigo-600 block">{inv.id}</span>
                    <span className="text-gray-700">{inv.serviceName}</span>
                  </div>
                  <span className="font-mono font-bold text-gray-900">
                    Rp {inv.amount?.toLocaleString('id-ID')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Method Selector & Instructions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">Pilih Metode Pembayaran</label>
              <span className="text-[11px] text-gray-500">(Acuan dari Checkout / dapat diubah)</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBulkPaymentMethod('qris')}
                className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                  bulkPaymentMethod === 'qris'
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-900 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>QRIS All-in-One</span>
              </button>
              <button
                type="button"
                onClick={() => setBulkPaymentMethod('manual')}
                className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                  bulkPaymentMethod === 'manual'
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-900 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Building className="w-4 h-4 text-indigo-600" />
                <span>Transfer Bank Manual</span>
              </button>
            </div>

            {bulkPaymentMethod === 'qris' ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 space-y-3">
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
                    Scan untuk Total Rp {activeBulkTotalAmount.toLocaleString('id-ID')}
                  </span>
                </div>

                {settings?.qrisPayment?.qrisImageUrl ? (
                  <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-lg p-4">
                    <img
                      src={settings.qrisPayment.qrisImageUrl}
                      alt="Kode QRIS"
                      className="max-w-[200px] w-full h-auto object-contain"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">
                    Gambar QRIS belum diunggah oleh Admin. Silakan hubungi Admin melalui tombol WhatsApp di bawah.
                  </p>
                )}

                <p className="text-xs text-gray-500">
                  Scan kode QRIS di atas untuk membayar total gabungan sebesar <strong className="text-gray-900 font-mono">Rp {activeBulkTotalAmount.toLocaleString('id-ID')}</strong>.
                </p>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 space-y-2">
                <p className="font-semibold text-gray-900">Silakan transfer total gabungan ke rekening:</p>
                <div className="font-mono bg-white p-3 border border-gray-200 rounded-lg text-xs space-y-1">
                  <div>Bank: <span className="font-bold text-gray-900">{settings?.manualPayment?.bankName || 'BCA'}</span></div>
                  <div className="flex items-center gap-2">
                    <span>No Rek: <span className="font-bold text-gray-900">{settings?.manualPayment?.accountNumber || '1234567890'}</span></span>
                    <button 
                      onClick={() => handleCopy(settings?.manualPayment?.accountNumber || '1234567890')}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors cursor-pointer"
                      title="Salin No Rekening"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div>A.N: <span className="font-bold text-gray-900">{settings?.manualPayment?.accountName || 'PT Guestly'}</span></div>
                  <div className="pt-1 text-indigo-600 font-bold">Total: Rp {activeBulkTotalAmount.toLocaleString('id-ID')}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-3 gap-2 flex-wrap">
            {!savedGbInvoiceId ? (
              <button
                type="button"
                disabled={isSavingGb || selectedInvoiceIds.length < 2}
                onClick={handleSaveConsolidatedInvoice}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 w-full sm:w-auto shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSavingGb ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Simpan Invoice Gabungan</span>
                  </>
                )}
              </button>
            ) : (
              <a
                href={`https://wa.me/${settings?.adminPhone || '6285158636606'}?text=${encodeURIComponent(bulkWhatsappMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 w-full sm:w-auto shadow-xs"
              >
                <MessageCircle className="w-4 h-4" /> Konfirmasi ke Admin via WhatsApp ({savedGbInvoiceId})
              </a>
            )}
            <button
              type="button"
              onClick={() => setIsBulkPaymentModalOpen(false)}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-xs sm:text-sm transition-colors w-full sm:w-auto text-center cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* Single Payment Modal */}
      <Modal 
        isOpen={isPaymentModalOpen} 
        onClose={() => setIsPaymentModalOpen(false)} 
        title="Pembayaran Layanan"
      >
        {selectedInvoice && (
          <div className="space-y-4">
            {selectedChildInvoices.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                <div className="bg-gray-50 px-3.5 py-2.5 border-b border-gray-200 font-semibold text-gray-700">
                  Rincian Invoice Gabungan ({selectedChildInvoices.length} Invoice):
                </div>
                <div className="divide-y divide-gray-100 bg-white max-h-48 overflow-y-auto">
                  {selectedChildInvoices.map((child) => (
                    <div key={child.id} className="p-3 flex justify-between items-center gap-2">
                      <div>
                        <span className="font-bold text-indigo-600 block">{child.id}</span>
                        <span className="text-gray-700">{child.serviceName}</span>
                        <span className="text-[11px] text-gray-400 block">
                          {child.createdAt ? new Date(child.createdAt.toMillis?.() || child.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-gray-900">
                        Rp {(child.amount || 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-500 transition-colors cursor-pointer" 
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
                type="button"
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
