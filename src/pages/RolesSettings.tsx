import { Shield, Check } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function RolesSettings() {
  const { appUser } = useAuth();

  if (appUser?.role !== 'superadmin') {
    return <div className="p-8"><div className="bg-red-50 text-red-700 p-4 rounded-md">Akses Ditolak</div></div>;
  }

  const roleDefinitions = [
    {
      name: 'Super Admin',
      description: 'Akses penuh ke seluruh sistem, manajemen pengguna, white-label, dan semua data partner/klien.',
      permissions: [
        'Semua akses',
        'Manajemen User List',
        'Custom Role / Hak Akses',
        'Manajemen Partner (White-label)',
      ]
    },
    {
      name: 'Partner',
      description: 'Pengelola akun White-label yang dapat mengelola klien, acara, dan tamunya sendiri.',
      permissions: [
        'Dashboard Partner',
        'Branding (White-label mandiri)',
        'Input Client',
        'Input Tamu Client',
        'Input Acara',
      ]
    },
    {
      name: 'Client',
      description: 'Pengguna yang memiliki suatu acara, dibuat oleh Partner / Superadmin.',
      permissions: [
        'Dashboard Client',
        'Manajemen Tamu',
        'Scan Kehadiran',
        'Tambah Tamu',
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-bold text-gray-900">Role / Hak akses Custom</h1>
            <p className="mt-1 text-sm text-gray-500">
              Konfigurasi pengaturan hak akses setiap peran di dalam sistem. Saat ini menggunakan konfigurasi default yang aman.
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {roleDefinitions.map((role) => (
          <div key={role.name} className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm flex flex-col">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex-1">
               <div className="flex items-center gap-2 mb-2">
                 <Shield className="w-5 h-5 text-indigo-600" />
                 <h2 className="text-lg font-semibold text-gray-900">{role.name}</h2>
               </div>
               <p className="text-sm text-gray-600">
                 {role.description}
               </p>
            </div>
            <div className="p-5 bg-white">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Hak Akses:</h3>
              <ul className="space-y-3">
                {role.permissions.map((perm, index) => (
                  <li key={index} className="flex items-start">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{perm}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
