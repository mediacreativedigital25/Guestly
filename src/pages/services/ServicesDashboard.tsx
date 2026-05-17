import React, { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { Package, Users, PartyPopper, CalendarDays, Server, FileText, TrendingUp, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function ServicesDashboard() {
  const { appUser } = useAuth();
  
  const [stats, setStats] = useState({
    totalServices: 0,
    activeServices: 0,
    totalInvoices: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSuperadminStats() {
      if (appUser?.role !== 'superadmin') {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        // Fetch Services
        const servicesSnapshot = await getDocs(collection(db, 'services'));
        let totalSvc = 0;
        let activeSvc = 0;
        servicesSnapshot.forEach(doc => {
          totalSvc++;
          if (doc.data().status === 'active') activeSvc++;
        });

        // Fetch Invoices (Paid only for revenue)
        const invoicesSnapshot = await getDocs(query(collection(db, 'invoices'), where('status', '==', 'paid')));
        let totalInv = 0;
        let totalRev = 0;
        invoicesSnapshot.forEach(doc => {
          totalInv++;
          totalRev += (doc.data().amount || 0);
        });

        setStats({
          totalServices: totalSvc,
          activeServices: activeSvc,
          totalInvoices: totalInv,
          totalRevenue: totalRev,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSuperadminStats();
  }, [appUser]);

  if (!appUser) {
    return null;
  }

  const isSuperAdmin = appUser.role === 'superadmin';
  const activeUntilDate = appUser.activeUntil ? new Date(appUser.activeUntil.seconds * 1000).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Layanan</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isSuperAdmin ? 'Ringkasan performa dan metrik layanan sistem.' : 'Pantau sisa kuota dan masa aktif layanan Anda.'}
          </p>
        </div>
        {!isSuperAdmin && (
          <Link
            to="/services/catalog"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
          >
            Beli Layanan
          </Link>
        )}
      </div>

      {isSuperAdmin ? (
        loading ? (
          <div className="p-8 text-center text-gray-500">Memuat statistik layanan...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Layanan</p>
                  <div className="mt-2 text-4xl font-bold text-gray-900">
                    {stats.totalServices}
                  </div>
                </div>
                <div className="p-3 bg-blue-50 rounded-full shrink-0">
                  <Server className="w-8 h-8 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Layanan Aktif</p>
                  <div className="mt-2 text-4xl font-bold text-gray-900">
                    {stats.activeServices}
                  </div>
                </div>
                <div className="p-3 bg-green-50 rounded-full shrink-0">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Transaksi (Dibayar)</p>
                  <div className="mt-2 text-4xl font-bold text-gray-900">
                    {stats.totalInvoices}
                  </div>
                </div>
                <div className="p-3 bg-purple-50 rounded-full shrink-0">
                  <FileText className="w-8 h-8 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Pendapatan</p>
                  <div className="mt-2 text-2xl font-bold text-gray-900 whitespace-nowrap">
                    Rp {stats.totalRevenue.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-full shrink-0">
                  <TrendingUp className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Masa Aktif</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-xl sm:text-2xl font-bold ${activeUntilDate ? 'text-gray-900' : 'text-gray-400'}`}>
                    {activeUntilDate || 'Tidak Aktif'}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-rose-50 rounded-full shrink-0">
                <CalendarDays className="w-8 h-8 text-rose-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Kuota Klien</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-gray-900">
                    {appUser.clientQuota || 0}
                  </span>
                  <span className="text-sm text-gray-500">tersisa</span>
                </div>
              </div>
              <div className="p-3 bg-blue-50 rounded-full shrink-0">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Kuota Acara</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-gray-900">
                    {appUser.eventQuota || 0}
                  </span>
                  <span className="text-sm text-gray-500">tersisa</span>
                </div>
              </div>
              <div className="p-3 bg-indigo-50 rounded-full shrink-0">
                <PartyPopper className="w-8 h-8 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Kuota Tamu</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-gray-900">
                    {appUser.guestQuota || 0}
                  </span>
                  <span className="text-sm text-gray-500">tersisa</span>
                </div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-full shrink-0">
                <Package className="w-8 h-8 text-emerald-600" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
