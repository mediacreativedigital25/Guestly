import { Shield, Check } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function RolesSettings() {
  const { appUser } = useAuth();

  if (appUser?.role !== 'superadmin' && appUser?.role !== 'owner') {
    return <div className="p-8"><div className="bg-red-50 text-red-700 p-4 rounded-md">Akses Ditolak</div></div>;
  }

  const roleDefinitions = [
    {
      name: 'Super Admin',
      badge: 'Full System Access',
      description: 'Pemilik platform / teknis utama dengan kendali penuh atas seluruh konfigurasi sistem, pembayaran, dan database.',
      permissions: [
        'Akses penuh ke seluruh menu & pengaturan sistem',
        'Manajemen seluruh User, Owner, Admin, Partner, Client & Staff',
        'Manajemen Katalog Layanan, Approval Invoice & Kuota Kredit',
        'Akses seluruh Acara, Media Library, & Pengaturan Global',
      ]
    },
    {
      name: 'Owner',
      badge: 'Executive & Business',
      description: 'Pemilik bisnis / pimpinan WO yang memantau seluruh acara, klien, tim operasional, serta laporan eksekutif.',
      permissions: [
        'Akses penuh ke seluruh Acara, Klien, dan Statistik Dashboard',
        'Membuat dan menugaskan akun Admin & Staff Lapangan',
        'Persetujuan (Approval) perubahan tamu & pantau Invoice',
        'Download Laporan Rekapitulasi Kehadiran & Berita Acara Souvenir',
      ]
    },
    {
      name: 'Admin',
      badge: 'Operational Manager',
      description: 'Tim operasional back-office yang menyiapkan acara, mengelola daftar tamu, WA Blast, dan menugaskan petugas lapangan.',
      permissions: [
        'Kelola Acara (atau khusus acara yang ditugaskan)',
        'Import/Export Excel Tamu, Tambah/Edit Tamu, & Kirim WA Blast',
        'Atur Stok Awal Souvenir & Stock Opname Logistik',
        'Membuat akun Staff (Scan & Souvenir) serta menugaskan ke acara',
      ]
    },
    {
      name: 'Staff Scan Kehadiran',
      badge: 'Focus Mode: Gate Scanner',
      description: 'Petugas lapangan di meja penerima tamu (Gate Masuk). Tampilan dikunci khusus untuk scan kehadiran pada acara yang ditugaskan.',
      permissions: [
        'Hanya dapat melihat acara yang ditugaskan kepadanya',
        'Fokus penuh pada Kamera Scanner / Alat Barcode Check-in Gate',
        'Pencarian cepat nama tamu & konfirmasi kehadiran manual',
        'Nama petugas otomatis tercatat pada setiap tamu yang di-scan',
      ]
    },
    {
      name: 'Staff Souvenir',
      badge: 'Focus Mode: Souvenir Booth',
      description: 'Petugas lapangan di loket pengambilan souvenir. Tampilan dikunci khusus untuk scan penukaran & kontrol stok souvenir.',
      permissions: [
        'Hanya dapat melihat acara yang ditugaskan kepadanya',
        'Fokus penuh pada Scanner Loket Souvenir & Antrean Penyerahan 1-Klik',
        'Deteksi otomatis klaim ganda (menampilkan siapa petugas sebelumnya)',
        'Nama petugas otomatis tercatat di log penyerahan souvenir',
      ]
    },
    {
      name: 'Partner & Client',
      badge: 'Vendor & Event Host',
      description: 'Partner (Vendor White-label) mengelola klien/acaranya sendiri, sedangkan Client (Mempelai) memantau tamu & RSVP acaranya.',
      permissions: [
        'Partner: Kelola Klien, Acara, Tamu, & Branding White-label',
        'Client: Pantau Dashboard Kehadiran, Ucapan RSVP, & Ajukan Tambah/Edit Tamu',
        'Isolasi data penuh antar Partner dan antar Client',
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-bold text-gray-900">Arsitektur Role & Hak Akses (RBAC)</h1>
            <p className="mt-1 text-sm text-gray-500">
              Konfigurasi hierarki wewenang, isolasi fitur (Focus Mode), dan penguncian akses acara untuk setiap peran pengguna.
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roleDefinitions.map((role) => (
          <div key={role.name} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
            <div className="p-5 border-b border-gray-100 bg-gray-50/80">
               <div className="flex items-center justify-between gap-2 mb-2">
                 <div className="flex items-center gap-2">
                   <Shield className="w-5 h-5 text-indigo-600 shrink-0" />
                   <h2 className="text-base font-bold text-gray-900">{role.name}</h2>
                 </div>
                 <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                   {role.badge}
                 </span>
               </div>
               <p className="text-xs text-gray-600 leading-relaxed">
                 {role.description}
               </p>
            </div>
            <div className="p-5 bg-white flex-1">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Hak Akses & Isolasi Fitur:</h3>
              <ul className="space-y-2.5">
                {role.permissions.map((perm, index) => (
                  <li key={index} className="flex items-start">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 mr-2 flex-shrink-0" />
                    <span className="text-xs text-gray-700 leading-relaxed">{perm}</span>
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
