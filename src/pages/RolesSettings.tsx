import { Shield, Check, Building2, EyeOff, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function RolesSettings() {
  const { appUser } = useAuth();

  if (!appUser || !['superadmin', 'owner', 'admin', 'partner'].includes(appUser.role)) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-md">Akses Ditolak</div>
      </div>
    );
  }

  const roleDefinitions = [
    {
      name: '1. Super Admin',
      badge: 'Full Platform Control',
      canCreate: 'Owner (Bisnis), Admin, Staff, Client, Super Admin',
      createEvent: 'Bisa Buat & Kelola Semua Acara',
      serviceInfo: 'Tampil Penuh (Manajemen Katalog & Invoice)',
      description:
        'Pengelola utama platform Guestly yang mengatur seluruh bisnis/vendor (Owner), alokasi kuota kredit, dan konfigurasi sistem.',
      permissions: [
        'Menambahkan akun Owner beserta Nama Bisnis / Usaha WO',
        'Menautkan Admin, Staff, atau Client ke bawah naungan Bisnis Owner tertentu',
        'Mengatur Kuota Kredit Client/Event & Bypass Event Manual',
        'Kendali penuh atas Katalog Layanan, Approval Invoice, & Pengaturan Global'
      ]
    },
    {
      name: '2. Owner (Pemilik Bisnis / WO)',
      badge: 'Business Head & White-Label',
      canCreate: 'Admin, Staff, & Client (Otomatis di Bawah Bisnisnya)',
      createEvent: 'Bisa Buat & Kelola Acara Bisnisnya',
      serviceInfo: 'Tampil (Beli Layanan, Kuota & Invoice)',
      description:
        'Pemilik bisnis Wedding Organizer / Event Planner yang menaungi tim Admin, petugas lapangan (Staff), dan Client mempelai.',
      permissions: [
        'Membuat & mengelola akun Admin Operasional, Staff Lapangan, dan Client',
        'Seluruh akun yang dibuat otomatis mewarisi identitas Bisnis milik Owner',
        'Membuat acara baru (Create Event), mengelola klien, & pengaturan White-Label',
        'Memantau statistik eksekutif, approval tamu, serta pembelian kuota layanan'
      ]
    },
    {
      name: '3. Admin Operasional',
      badge: 'Back-Office Manager',
      canCreate: 'Staff Lapangan & Layar Sapa (1 User = 1 Acara)',
      createEvent: 'Bisa Buat & Kelola Acara Bisnisnya',
      serviceInfo: 'Disembunyikan Otomatis',
      description:
        'Tim operasional di bawah naungan Bisnis Owner yang menyiapkan teknis acara, daftar tamu, WA Blast, dan menugaskan petugas lapangan serta TV Layar Sapa.',
      permissions: [
        'Membuat dan menugaskan akun Staff Lapangan & Akun Layar Sapa TV (1 User = 1 Acara)',
        'Membuat acara (Create Event), Import/Export Excel Tamu, & kirim WA Blast',
        'Mengatur stok awal souvenir & audit logistik acara',
        'Modul "Informasi Layanan" (harga paket/tagihan Owner) disembunyikan otomatis'
      ]
    },
    {
      name: '4. Staff Lapangan (Scan & Souvenir)',
      badge: 'Focus Mode Terkunci (1 User = 1 Acara)',
      canCreate: 'Tidak Bisa Menambah User',
      createEvent: 'Terkunci (Tidak Bisa Create Event)',
      serviceInfo: 'Disembunyikan Otomatis',
      description:
        'Petugas hari-H di Gate Masuk atau Loket Souvenir di bawah naungan Bisnis Owner/Admin. 1 user ditugaskan khusus untuk 1 acara.',
      permissions: [
        '1 Akun ditugaskan fokus pada 1 acara (jika ada banyak acara bersamaan, cukup buat akun baru)',
        'Tersedia 3 mode fokus: Staff Scan Kehadiran, Staff Souvenir, atau All-in-One',
        'Tidak dapat membuat acara baru (Create Event) maupun mengubah pengaturan acara',
        'Modul "Informasi Layanan" disembunyikan sepenuhnya'
      ]
    },
    {
      name: '5. Layar Sapa (Display TV / Monitor Sambutan)',
      badge: 'Auto-Redirect Tanpa Dashboard',
      canCreate: 'Tidak Bisa Menambah User',
      createEvent: 'Terkunci (Tidak Bisa Create Event)',
      serviceInfo: 'Disembunyikan Otomatis',
      description:
        'Akun khusus perangkat TV / Proyektor / Mini-PC di area resepsi yang langsung menampilkan Layar Sapa begitu berhasil login tanpa masuk ke Dashboard.',
      permissions: [
        'Otomatis langsung masuk ke halaman Layar Sapa TV (/events/:eventId/greeting) setelah login tanpa ke Dashboard',
        '1 User = 1 Acara (terkunci khusus pada 1 acara yang ditugaskan oleh Owner/Admin)',
        'Dilengkapi proteksi anti auto-logout selama acara berlangsung & tombol keluar akun tersembunyi di pojok layar',
        'Tidak memiliki akses ke Dashboard, daftar tamu, maupun pengaturan acara'
      ]
    },
    {
      name: '6. Client (Pemilik Acara / Mempelai)',
      badge: 'Event Host Monitor',
      canCreate: 'Tidak Bisa Menambah User',
      createEvent: 'Terkunci (Tidak Bisa Create Event)',
      serviceInfo: 'Disembunyikan (Client Naungan Bisnis/WO)',
      description:
        'Pemilik hajat / mempelai yang memantau kehadiran tamu, ucapan RSVP, dan mengelola daftar tamu undangannya.',
      permissions: [
        'Memantau Dashboard kehadiran real-time, jumlah Pax, & ucapan RSVP',
        'Mengelola / mengajukan penambahan & perubahan data tamu pada acaranya',
        'Tidak dapat membuat acara baru (Create Event disiapkan oleh Owner/Admin)',
        'Modul "Informasi Layanan" disembunyikan otomatis bagi Client di bawah naungan Bisnis/WO'
      ]
    }
  ];

  return (
    <div className="space-y-6">
      {/* Visual Hierarchy Flow */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
          <Building2 className="w-4 h-4" />
          Alur Hierarki Pendelegasian Role & Naungan Bisnis
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
          <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200">
            <div className="text-xs font-bold text-purple-900">1. Super Admin</div>
            <p className="text-[11px] text-purple-700 mt-1">
              Menambah <strong>Owner</strong> + Nama Bisnis WO & mengatur kuota.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-xs font-bold text-amber-900 flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-amber-600" /> 2. Owner (Bisnis WO)
            </div>
            <p className="text-[11px] text-amber-800 mt-1">
              Menambah <strong>Admin</strong>, <strong>Staff</strong>, & <strong>Client</strong> di bisnisnya + Create Event.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
            <div className="text-xs font-bold text-blue-900 flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-blue-600" /> 3. Admin Operasional
            </div>
            <p className="text-[11px] text-blue-800 mt-1">
              Menambah & menugaskan <strong>Staff Lapangan</strong> + Create/Kelola Event.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="text-xs font-bold text-emerald-900 flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-emerald-600" /> 4. Staff & Client
            </div>
            <p className="text-[11px] text-emerald-800 mt-1">
              Fokus operasional/pantau acara. <strong>Tidak bisa Create Event</strong> & <strong>Info Layanan disembunyikan</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Role Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roleDefinitions.map(role => (
          <div
            key={role.name}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col"
          >
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
              <p className="text-xs text-gray-600 leading-relaxed">{role.description}</p>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-b border-gray-100 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 font-medium">Hak Tambah Role:</span>
                <span className="font-semibold text-gray-800 text-right">{role.canCreate}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                  <Lock className="w-3 h-3 text-gray-400" /> Create Event:
                </span>
                <span className="font-semibold text-gray-800 text-right">{role.createEvent}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                  <EyeOff className="w-3 h-3 text-gray-400" /> Info Layanan:
                </span>
                <span className="font-semibold text-gray-800 text-right">{role.serviceInfo}</span>
              </div>
            </div>

            <div className="p-5 bg-white flex-1">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Rincian Hak Akses & Isolasi:
              </h3>
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
