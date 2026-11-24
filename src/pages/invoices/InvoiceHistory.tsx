import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { ExternalLink, Receipt, Search, CheckCircle2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DateRangeFilterBar, isWithinDateRange } from '../../components/DateRangeFilterBar';
import { resolveMediaUrl } from '../../lib/utils';

export default function InvoiceHistory() {
  const { currentUser } = useAuth();
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

  useEffect(() => {
    const fetchHistory = async () => {
      if (!currentUser) return;
      try {
        setLoading(true);
        // Fetch users for vendor mapping
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
          if (data.status === 'paid' || data.status === 'cancelled') {
            fetched.push({ id: docSnap.id, ...data });
          }
        });

        fetched.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setInvoices(fetched);
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'invoice_history');
        setLoading(false);
      }
    };

    fetchHistory();
  }, [currentUser]);

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

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat riwayat invoice...</div>;
  }

  const hasActiveFilter = Boolean(searchTerm || statusFilter !== 'all' || startDate || endDate);

  return (
    <div className="space-y-6">
      {/* Box 1: Filter & Search Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 space-y-4">
        <DateRangeFilterBar
          label="Rentang Tanggal Pesanan"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(val) => { setStartDate(val); setCurrentPage(1); }}
          onEndDateChange={(val) => { setEndDate(val); setCurrentPage(1); }}
          onClear={() => { setStartDate(''); setEndDate(''); setCurrentPage(1); }}
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
              <option value="paid">Lunas</option>
              <option value="cancelled">Dibatalkan</option>
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

      {/* Box 2: Table */}
      {filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
            <Receipt className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-800">Belum Ada Riwayat Invoice</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Invoice yang sudah lunas atau dibatalkan akan tersimpan otomatis di halaman riwayat ini.
          </p>
          <div className="pt-2">
            <Link
              to="/auth/login/services/catalog"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              Lihat Katalog Layanan
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
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
                  const vendorInfo = (inv.userId && vendorById[inv.userId]) || { name: inv.userName || 'Guestly Partner' };
                  
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {startIndex + index + 1}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-indigo-600">
                        {inv.id}
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
                        {inv.status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Lunas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" /> Dibatalkan
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900">
                        Rp {inv.amount?.toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end space-x-1.5">
                          <Link
                            to={`/pay/${inv.id}`}
                            className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors"
                            title="Lihat Bukti Pembayaran"
                            aria-label="Lihat Bukti Pembayaran"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
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
                Menampilkan <span className="font-semibold text-gray-900">{filteredInvoices.length === 0 ? 0 : startIndex + 1}</span> – <span className="font-semibold text-gray-900">{endIndex}</span> dari <span className="font-semibold text-indigo-600">{filteredInvoices.length}</span> riwayat
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
                      setCurrentPage(1);
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
    </div>
  );
}
