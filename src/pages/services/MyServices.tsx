import React from 'react';

export default function MyServices() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Layanan Saya</h1>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-gray-500">Daftar layanan yang telah dibeli atau aktif akan ditampilkan di sini.</p>
      </div>
    </div>
  );
}
