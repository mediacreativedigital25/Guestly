import React, { useState } from 'react';
import {
  Sparkles,
  Zap,
  ShieldCheck,
  Image as ImageIcon,
  Users,
  LayoutDashboard,
  Smartphone,
  Bug,
  CheckCircle2,
  Megaphone,
  Printer,
  QrCode,
  Download,
  WifiOff,
  Gift,
  Calendar,
  Briefcase,
  HeartHandshake,
  Clock,
  SlidersHorizontal,
  UserCheck,
  Tag,
  Send,
  KeyRound,
  Lock,
} from 'lucide-react';

interface ChangeItem {
  icon: any;
  category: 'Fitur Baru' | 'Akses & Sistem' | 'UI & UX' | 'Performa & Keandalan';
  title: string;
  description: string;
  color: string;
  bgColor: string;
}

interface ReleaseVersion {
  version: string;
  date: string;
  badge?: 'Major Update' | 'Feature Drop' | 'Maintenance';
  isLatest?: boolean;
  summary: string;
  changes: ChangeItem[];
}

const CATEGORY_BADGE_STYLES: Record<ChangeItem['category'], string> = {
  'Fitur Baru': 'bg-rose-50 text-[#8C3A50] border-rose-200/80',
  'Akses & Sistem': 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  'UI & UX': 'bg-amber-50 text-amber-800 border-amber-200/80',
  'Performa & Keandalan': 'bg-slate-100 text-slate-700 border-slate-200',
};

export const VERSIONS: ReleaseVersion[] = [
  {
    version: 'V2.5.1',
    date: '19 November 2026',
    badge: 'Feature Drop',
    isLatest: true,
    summary:
      'Tema dashboard ramah mata (Pearl Rose White, Hybrid Contrast, dan Soft Dark Mode), pemisahan hak akses Client Mandiri vs Client Naungan Vendor, Wedding Planner berbasis Top-Up & paket, serta pengaturan paket Wedding Planner di Layanan & Invoice.',
    changes: [
      {
        icon: Sparkles,
        category: 'UI & UX',
        title: 'Tema Dashboard Ramah Mata (Pearl Rose White, Hybrid Contrast & Soft Dark)',
        description:
          'Penambahan pengalih tema langsung di header dashboard dengan tampilan default Pearl Rose White yang nyaman untuk penggunaan lama, opsi Hybrid Contrast (sidebar gelap + kanvas terang), serta Soft Dark Mode yang tersimpan otomatis di perangkat pengguna.',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
      },
      {
        icon: UserCheck,
        category: 'Akses & Sistem',
        title: 'Skema 2 Kondisi Role Client: Client Mandiri vs Client Naungan Vendor',
        description:
          'Client yang mendaftar mandiri kini mulai dengan kuota 0, dapat membuat serta mengelola acara sendiri setelah Top-Up Paket, dan langsung menambah/mengedit/menghapus tamu tanpa alur Approval. Client di bawah naungan Vendor/Owner tetap menggunakan alur Approval dan dikelola oleh Vendor.',
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
      },
      {
        icon: HeartHandshake,
        category: 'Fitur Baru',
        title: 'Wedding Planner Terkunci Hingga Top-Up & Aktivasi Berbasis Paket',
        description:
          'Client Mandiri melihat menu Wedding Planner dengan layar pratinjau 6 modul yang terkunci hingga melakukan Top-Up dan membuat acara aktif pertama, lalu otomatis terbuka. Bagi Client naungan Vendor/Owner, Wedding Planner hanya tampil bila paket mencakup fitur tersebut atau diaktifkan oleh Vendor.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
      {
        icon: Tag,
        category: 'Fitur Baru',
        title: 'Toggle "Termasuk Modul Wedding Planner" pada Paket Layanan & Invoice',
        description:
          'Super Admin dapat menandai layanan paket atau add-on yang menyertakan modul Wedding Planner. Penanda tampil jelas di Katalog Layanan dan otomatis membuka akses Wedding Planner pada akun maupun acara tujuan ketika pembayaran invoice dikonfirmasi.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
    ],
  },
  {
    version: 'V2.5.0',
    date: '19 November 2026',
    badge: 'Major Update',
    summary:
      'Halaman khusus Kirim Undangan WhatsApp dengan tracking status pengiriman, dukungan Token Fonnte pribadi tanpa potong kuota, sinkronisasi kartu E-Invitation WhatsApp, serta penguncian penuh fitur operasional & ekspor saat acara Draft atau kedaluwarsa.',
    changes: [
      {
        icon: Send,
        category: 'Fitur Baru',
        title: 'Halaman Khusus Kirim Undangan WhatsApp & Tracking Status',
        description:
          'Tersedia tombol dan halaman khusus Kirim Undangan dengan tata letak ringkas yang terfokus pada daftar tamu. Pantau status pengiriman secara langsung (Belum Dikirim, Terkirim, Gagal, Tanpa No. HP), kirim satuan maupun massal dengan jeda aman, serta cek pratinjau tampilan WhatsApp per tamu.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
      {
        icon: KeyRound,
        category: 'Fitur Baru',
        title: 'Token Fonnte Pribadi (Tanpa Potong Kuota) & Fallback Otomatis',
        description:
          'Client dan Partner dapat mengisi Token Fonnte pribadi di halaman Profil Saya atau langsung di halaman Kirim Undangan agar pengiriman tidak memotong kuota WA Blast Guestly. Dilengkapi cek koneksi perangkat Fonnte, fallback otomatis ke Token Global Guestly, dan opsi kirim manual via WhatsApp.',
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
      },
      {
        icon: ImageIcon,
        category: 'UI & UX',
        title: 'Pratinjau & Lampiran Kartu E-Invitation WhatsApp Selaras Template',
        description:
          'Pengiriman undangan via Fonnte mendukung lampiran langsung Kartu E-Invitation (1200×675) berisi foto mempelai, nama tamu, detail acara, dan QR Code yang selaras dengan katalog template E-Invitation, didukung validasi media server agar gambar selalu tampil tajam tanpa rusak.',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
      },
      {
        icon: Lock,
        category: 'Akses & Sistem',
        title: 'Ubah Status Khusus Super Admin & Kunci Penuh Operasional/Export Saat Kedaluwarsa',
        description:
          'Perubahan status acara secara manual (Draft/Published/Completed) kini dibatasi khusus untuk Super Admin—role lain wajib melalui proses Top-Up Paket. Saat acara berstatus Draft atau masa aktif habis, seluruh fitur operasional non-Super Admin (termasuk ekspor Excel/PDF, impor, kelola tamu, kirim undangan/WA, check-in, souvenir & Berita Acara, serta edit acara) dikunci otomatis dalam mode baca saja.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
    ],
  },
  {
    version: 'V2.4.0',
    date: '13 November 2026',
    badge: 'Major Update',
    summary:
      'Peluncuran modul Wedding Planner terpadu, manajemen akses kolaboratif per peran, otomatisasi masa aktif acara 30 hari, serta penyempurnaan responsivitas multi-perangkat.',
    changes: [
      {
        icon: HeartHandshake,
        category: 'Fitur Baru',
        title: 'Modul Wedding Planner Terpadu (Menu Dropdown Sidebar)',
        description:
          'Tersedia tepat di bawah menu Events dengan 6 bagian berurutan dari persiapan hingga Hari-H: 1. Overview, 2. Checklist, 3. Vendor, 4. Anggaran, 5. Rundown, dan 6. Denah Meja—lengkap dengan template 1-klik, pelacakan DP/pelunasan vendor, serta salin rundown ke WhatsApp.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
      {
        icon: UserCheck,
        category: 'Akses & Sistem',
        title: 'Pemisahan Client Khusus Planner & Hak Akses Kolaboratif',
        description:
          'Dropdown Wedding Planner kini hanya menampilkan client dan acara yang diaktifkan melalui tombol + Tambah Client dual-mode di Overview (pilih client/acara ada atau buat baru sekaligus). Role Client hanya melihat acaranya sendiri bila diaktifkan dan dapat berkolaborasi langsung, sementara Owner/Partner/Admin dan Super Admin mengelola daftar proyek sesuai naungannya.',
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
      },
      {
        icon: Clock,
        category: 'Akses & Sistem',
        title: 'Otomatisasi Masa Aktif Acara 30 Hari & Alur Perpanjangan',
        description:
          'Setiap acara memperoleh masa aktif otomatis 30 hari sejak dibuat. Apabila melewati batas masa aktif, status acara otomatis beralih menjadi Draft (Kedaluwarsa) dan terhubung langsung ke Katalog Layanan untuk perpanjangan atau top-up paket.',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
      },
      {
        icon: SlidersHorizontal,
        category: 'UI & UX',
        title: 'Konsistensi Tema Guestly, Keranjang Responsif & Scrollbar Bersih',
        description:
          'Penyeragaman palet warna Burgundy Rose & Neutral Slate pada tombol, font, dan notifikasi alert. Popover Keranjang Belanja serta Notifikasi kini terpusat rapi di Mobile, Tablet, dan Desktop, disertai penggantian scrollbar bawaan dengan custom scrollbar tipis tanpa tepian gelap pada sidebar maupun modal.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
    ],
  },
  {
    version: 'V2.3.0',
    date: '27 September 2026',
    badge: 'Major Update',
    summary:
      'Katalog template E-Invitation Digital terpusat, dua mode cetak kartu/QR A4, emblem QR Favicon Guestly, serta mesin unduh PNG resolusi tinggi.',
    changes: [
      {
        icon: Sparkles,
        category: 'Fitur Baru',
        title: 'Kartu E-Invitation Digital & Katalog Template Terpusat',
        description:
          'Desain kartu undangan digital beresolusi tinggi (16:9) dengan bingkai foto mempelai lengkung (arch), pilihan tema warna elegan, serta pengelolaan katalog template terpusat.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
      {
        icon: Printer,
        category: 'Fitur Baru',
        title: '2 Pilihan Mode Cetak & Unduh: Bentuk Card atau QR Biasa',
        description:
          'Pilihan fleksibel saat melihat tiket maupun mencetak massal: Bentuk Card E-Invitation (8 kartu per lembar A4) atau QR Biasa / Label Standar (20 label per lembar A4) lengkap dengan pratinjau langsung.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
      {
        icon: QrCode,
        category: 'UI & UX',
        title: 'Emblem Favicon Guestly di Tengah QR & Latar Logo Frosted Glass',
        description:
          'Seluruh QR Code kini menampilkan identitas Favicon Guestly di bagian tengah dengan koreksi error Level H (30%) yang tetap responsif saat dipindai, dipadukan dengan area logo berlatar frosted glass yang menyatu lembut.',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
      },
      {
        icon: Download,
        category: 'Performa & Keandalan',
        title: 'Nama Panjang Anti-Terpotong & Mesin Unduh PNG 2D Canvas',
        description:
          'Ukuran huruf nama tamu beserta gelar/jabatan menyesuaikan otomatis tanpa terpotong (...), serta mesin Direct 2D Canvas Compositor memastikan foto mempelai, logo, dan QR selalu ikut terunduh dengan tajam.',
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
      },
    ],
  },
  {
    version: 'V2.2.0',
    date: '26 September 2026',
    badge: 'Feature Drop',
    summary:
      'Dukungan mode Offline-First untuk operasional lokasi acara, manajemen stok souvenir, kalender 3 bulan, dan workspace khusus petugas.',
    changes: [
      {
        icon: WifiOff,
        category: 'Performa & Keandalan',
        title: 'Mode Offline-First pada Scanner & Layar Sapaan (TV Greeting)',
        description:
          'Proses scan check-in tamu dan tampilan layar sapaan VIP tetap berjalan lancar meskipun koneksi internet di lokasi acara sedang terputus, lalu otomatis tersinkronisasi saat kembali online.',
        color: 'text-slate-700',
        bgColor: 'bg-slate-100',
      },
      {
        icon: Gift,
        category: 'Fitur Baru',
        title: 'Manajemen Pengambilan Souvenir & Pencatatan Petugas',
        description:
          'Dukungan mode pengambilan souvenir otomatis (1x scan sekaligus check-in) maupun terpisah (2x scan khusus meja souvenir), lengkap dengan pemantauan kuota stok dan pencatatan petugas.',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
      },
      {
        icon: Calendar,
        category: 'Fitur Baru',
        title: 'Kalender Jadwal 3 Bulan & Indikator Hitung Mundur H-3 di Dashboard',
        description:
          'Tampilan kalender interaktif untuk memantau jadwal acara berstatus Published selama 3 bulan ke depan, dilengkapi lencana pengingat otomatis (Hari Ini, H-1 s/d H-3).',
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
      },
      {
        icon: Briefcase,
        category: 'Akses & Sistem',
        title: 'Workspace Khusus Petugas (Staff) & Identitas Naungan Partner/WO',
        description:
          'Antarmuka workspace lebih ringkas untuk petugas lapangan, penampil identitas naungan bisnis/WO pada profil pengguna, serta standarisasi hak akses lintas peran.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
    ],
  },
  {
    version: 'V2.0.0',
    date: '12 Juli 2026',
    badge: 'Major Update',
    summary:
      'Optimasi penyimpanan media berkecepatan tinggi dan pratinjau tautan undangan di WhatsApp.',
    changes: [
      {
        icon: Zap,
        category: 'Performa & Keandalan',
        title: 'Upload Media Sekejap Mata',
        description:
          'Mengunggah logo, banner, dan foto galeri kini jauh lebih cepat, stabil, dan tanpa hambatan.',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
      },
      {
        icon: ImageIcon,
        category: 'UI & UX',
        title: 'Tampilan Link WhatsApp Selalu Sempurna',
        description:
          'Gambar undangan (thumbnail) saat dibagikan via WhatsApp kini tampil konsisten dengan kualitas optimal.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
    ],
  },
  {
    version: 'V1.2.2',
    date: '30 Juni 2026',
    badge: 'Maintenance',
    summary:
      'Pengaturan paginasi daftar tamu, pengamanan data ganda RSVP, dan auto-logout sesi idle 2 jam.',
    changes: [
      {
        icon: Users,
        category: 'UI & UX',
        title: 'Tampilan Daftar Tamu Lebih Fleksibel',
        description:
          'Atur jumlah tamu per halaman (10, 25, atau 50 tamu) dengan tata letak tombol aksi yang lebih ringkas.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
      {
        icon: ShieldCheck,
        category: 'Akses & Sistem',
        title: 'Anti Data Ganda & Keamanan Akun',
        description:
          'Nama tamu otomatis terkunci pada link undangan pribadi untuk mencegah duplikat, disertai auto-logout setelah 2 jam tanpa aktivitas.',
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
      },
    ],
  },
  {
    version: 'V1.2.1',
    date: '29 Juni 2026',
    badge: 'Feature Drop',
    summary:
      'Otomatisasi pengingat WhatsApp H-30 hingga H-3 serta pengelolaan daftar tamu massal.',
    changes: [
      {
        icon: Smartphone,
        category: 'Fitur Baru',
        title: 'Pengingat Acara & Notifikasi Perubahan Data',
        description:
          'Pengingat otomatis H-30 hingga H-3 serta pemberitahuan instan ketika klien mengajukan perubahan data tamu.',
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
      },
      {
        icon: CheckCircle2,
        category: 'UI & UX',
        title: 'Hapus Banyak Tamu & Pilih Template Cepat',
        description:
          'Dukungan seleksi massal untuk menghapus beberapa tamu sekaligus serta pemilihan template pesan cepat.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
    ],
  },
  {
    version: 'V1.2.0',
    date: '23 Juni 2026',
    badge: 'Feature Drop',
    summary:
      'Pengisian formulir RSVP otomatis dan pencegahan entri tamu duplikat.',
    changes: [
      {
        icon: Sparkles,
        category: 'UI & UX',
        title: 'Pengisian Kehadiran Otomatis',
        description:
          'Nama dan nomor WhatsApp tamu terisi otomatis pada formulir undangan dengan penamaan tab yang lebih intuitif.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
      {
        icon: LayoutDashboard,
        category: 'Akses & Sistem',
        title: 'Sinkronisasi Data Cerdas',
        description:
          'Kontrol satu klik untuk menyembunyikan form kehadiran serta validasi cerdas mencegah nama tamu ganda.',
        color: 'text-slate-700',
        bgColor: 'bg-slate-100',
      },
    ],
  },
  {
    version: 'V1.1.x',
    date: '22 Juni 2026',
    badge: 'Feature Drop',
    summary:
      'Hitung mundur acara, tema undangan floral, kustomisasi template WhatsApp, dan stabilitas pesan.',
    changes: [
      {
        icon: Sparkles,
        category: 'UI & UX',
        title: 'Hitung Mundur Acara & Tema Floral',
        description:
          'Tamu dapat melihat hitung mundur hari acara dengan nuansa tampilan floral yang lebih segar.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
      {
        icon: Megaphone,
        category: 'Fitur Baru',
        title: 'Kustomisasi Pesan Bebas',
        description:
          'Buat template pesan WhatsApp langsung dari dashboard dengan penyimpanan preferensi per acara.',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
      },
      {
        icon: Bug,
        category: 'Performa & Keandalan',
        title: 'Berbagi Pesan Lebih Stabil',
        description:
          'Penyempurnaan mekanisme berbagi tautan dan lampiran gambar WhatsApp agar terkirim mulus.',
        color: 'text-slate-700',
        bgColor: 'bg-slate-100',
      },
    ],
  },
  {
    version: 'V1.0.0 - V1.0.6',
    date: 'Mei - Juni 2026',
    badge: 'Major Update',
    summary:
      'Rilis perdana Layar Sapa VIP real-time, pencarian tamu, dan notifikasi suara scan QR.',
    changes: [
      {
        icon: Sparkles,
        category: 'Fitur Baru',
        title: 'Layar Sapa VIP (Greeting Screen)',
        description:
          'Tampilan sambutan tamu secara real-time di layar TV venue lengkap dengan identitas logo penyelenggara.',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
      },
      {
        icon: Zap,
        category: 'Performa & Keandalan',
        title: 'Otomatisasi & Suara Notifikasi Scanner',
        description:
          'Pencarian tamu dengan filter cepat, sinkronisasi profil, dan sinyal suara penanda sukses saat tiket di-scan.',
        color: 'text-[#8C3A50]',
        bgColor: 'bg-rose-50',
      },
    ],
  },
];

function parseSemverTuple(raw: string): [number, number, number] {
  const matches = [...raw.matchAll(/(\d+)\.(\d+)(?:\.(\d+))?/g)];
  if (matches.length === 0) return [0, 0, 0];
  const last = matches[matches.length - 1];
  return [
    Number(last[1] || 0),
    Number(last[2] || 0),
    Number(last[3] || 0),
  ];
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function resolveLatestRelease(): { version: string; date?: string } {
  const sorted = [...VERSIONS].sort((a, b) =>
    compareSemver(parseSemverTuple(b.version), parseSemverTuple(a.version))
  );
  const topChangelog = sorted[0] || VERSIONS[0];
  const pkgRaw = (import.meta.env.VITE_APP_VERSION || '').trim();

  if (pkgRaw) {
    const pkgTuple = parseSemverTuple(pkgRaw);
    const changelogTuple = parseSemverTuple(topChangelog.version);
    if (compareSemver(pkgTuple, changelogTuple) > 0) {
      const normalized = pkgRaw.toUpperCase().startsWith('V') ? pkgRaw.toUpperCase() : `V${pkgRaw}`;
      return { version: normalized };
    }
  }

  return { version: topChangelog.version, date: topChangelog.date };
}

export const LATEST_RELEASE = resolveLatestRelease();
export const CURRENT_APP_VERSION = LATEST_RELEASE.version;

export default function Changelog() {
  const [badgeFilter, setBadgeFilter] = useState<string>('ALL');

  const filteredVersions = VERSIONS.filter(
    (rel) => badgeFilter === 'ALL' || rel.badge === badgeFilter
  );

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-6 font-sans">
      {/* Compact Filter Bar & Latest Version Status */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'ALL', label: `Semua Rilis (${VERSIONS.length})` },
            { key: 'Major Update', label: 'Major Update' },
            { key: 'Feature Drop', label: 'Feature Drop' },
            { key: 'Maintenance', label: 'Maintenance' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setBadgeFilter(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                badgeFilter === tab.key
                  ? 'bg-[#8C3A50] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-[#8C3A50]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-2 text-xs text-slate-600 bg-rose-50/70 border border-rose-200/80 px-3 py-1.5 rounded-xl w-fit shrink-0">
          <Tag className="w-3.5 h-3.5 text-[#8C3A50]" />
          <span>Versi Aktif Saat Ini:</span>
          <strong className="font-mono text-[#8C3A50]">{CURRENT_APP_VERSION}</strong>
        </div>
      </div>

      {/* Editorial 2-Column Release Timeline */}
      <div className="space-y-8">
        {filteredVersions.map((release, idx) => (
          <section
            key={release.version}
            className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 lg:gap-8 items-start"
          >
            {/* Left Sticky Metadata Column */}
            <div className="lg:sticky lg:top-4 flex lg:flex-col items-center lg:items-start justify-between gap-2 pt-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className={`font-mono text-sm sm:text-base font-bold px-3 py-1 rounded-xl border ${
                    release.isLatest
                      ? 'bg-[#8C3A50] text-white border-[#8C3A50] shadow-xs'
                      : 'bg-white text-slate-900 border-slate-200'
                  }`}
                >
                  {release.version}
                </span>
                {release.isLatest && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Terbaru
                  </span>
                )}
              </div>

              <div className="flex items-center lg:flex-col lg:items-start gap-2 lg:gap-1.5 text-right lg:text-left">
                <span className="text-xs font-medium text-slate-500">{release.date}</span>
                {release.badge && (
                  <span
                    className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      release.badge === 'Major Update'
                        ? 'bg-rose-50 text-[#8C3A50] border-rose-200/80'
                        : release.badge === 'Feature Drop'
                        ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {release.badge}
                  </span>
                )}
              </div>

              {idx < filteredVersions.length - 1 && (
                <div className="hidden lg:block w-px h-8 bg-slate-200 ml-4 mt-2" />
              )}
            </div>

            {/* Right Release Detail Card */}
            <div
              className={`bg-white rounded-2xl border p-5 sm:p-6 shadow-2xs transition-shadow hover:shadow-sm space-y-5 ${
                release.isLatest ? 'border-rose-200/90 ring-1 ring-rose-100/70' : 'border-slate-200/90'
              }`}
            >
              <p className="text-sm font-medium text-slate-700 leading-relaxed pb-4 border-b border-slate-100">
                {release.summary}
              </p>

              <div className="space-y-4">
                {release.changes.map((change, i) => {
                  const Icon = change.icon;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3.5 sm:gap-4 p-3 rounded-xl hover:bg-slate-50/70 transition-colors"
                    >
                      <div
                        className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border border-black/5 ${change.bgColor} ${change.color}`}
                      >
                        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm sm:text-[15px] font-bold text-slate-900">
                            {change.title}
                          </h3>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              CATEGORY_BADGE_STYLES[change.category]
                            }`}
                          >
                            {change.category}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                          {change.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Clean Footer */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 text-center space-y-1 shadow-2xs">
        <p className="text-sm font-bold text-slate-900">Terima kasih telah mempercayakan acara Anda bersama Guestly</p>
        <p className="text-xs text-slate-500">
          Pembaruan berkala dirilis untuk menjaga keandalan operasional acara, keamanan data, dan kenyamanan pengguna.
        </p>
      </div>
    </div>
  );
}
