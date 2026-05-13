import React from 'react';
import { useAuth } from '../../AuthContext';
import { Package, Users, PartyPopper } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ServicesDashboard() {
  const { appUser } = useAuth();

  if (!appUser) {
    return null;
  }

  const isSuperAdmin = appUser.role === 'superadmin';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Layanan</h1>
          <p className="text-sm text-gray-500 mt-1">Pantau sisa kuota layanan Anda.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Kuota Klien</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900">
                  {isSuperAdmin ? '∞' : (appUser.clientQuota || 0)}
                </span>
                {!isSuperAdmin && <span className="text-sm text-gray-500">tersisa</span>}
              </div>
            </div>
            <div className="p-3 bg-blue-50 rounded-full">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          {isSuperAdmin && (
            <p className="text-xs text-gray-500 mt-4">Superadmin tidak memiliki batasan kuota klien.</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Kuota Acara</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900">
                  {isSuperAdmin ? '∞' : (appUser.eventQuota || 0)}
                </span>
                {!isSuperAdmin && <span className="text-sm text-gray-500">tersisa</span>}
              </div>
            </div>
            <div className="p-3 bg-indigo-50 rounded-full">
              <PartyPopper className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          {isSuperAdmin && (
             <p className="text-xs text-gray-500 mt-4">Superadmin tidak memiliki batasan kuota acara.</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Kuota Tamu</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900">
                  {isSuperAdmin ? '∞' : (appUser.guestQuota || 0)}
                </span>
                {!isSuperAdmin && <span className="text-sm text-gray-500">tersisa</span>}
              </div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-full">
              <Package className="w-8 h-8 text-emerald-600" />
            </div>
          </div>
          {isSuperAdmin && (
            <p className="text-xs text-gray-500 mt-4">Superadmin tidak memiliki batasan kuota tamu.</p>
          )}
        </div>
      </div>
    </div>
  );
}
