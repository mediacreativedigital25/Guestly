import React from 'react';
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
} from 'lucide-react';

export default function Changelog() {
  const versions = [
    {
      version: 'V2.3.0',
      date: '27 September 2026',
      badge: 'Major Update',
      changes: [
        {
          icon: Sparkles,
          title: 'Kartu E-Invitation Digital & Katalog Template Terpusat',
          description:
            'Desain kartu undangan digital beresolusi tinggi (16:9) dengan bingkai foto mempelai lengkung (arch), pilihan tema warna elegan, serta pengelolaan katalog template terpusat.',
          color: 'text-rose-500',
          bgColor: 'bg-rose-50',
        },
        {
          icon: Printer,
          title: '2 Pilihan Mode Cetak & Unduh: Bentuk Card atau QR Biasa',
          description:
            'Pilihan fleksibel saat melihat tiket maupun mencetak massal: Bentuk Card E-Invitation (8 kartu per lembar A4) atau QR Biasa / Label Standar (20 label per lembar A4) lengkap dengan pratinjau langsung.',
          color: 'text-indigo-600',
          bgColor: 'bg-indigo-50',
        },
        {
          icon: QrCode,
          title: 'Emblem Favicon Guestly di Tengah QR & Latar Logo Frosted Glass',
          description:
            'Seluruh QR Code kini menampilkan identitas Favicon Guestly di bagian tengah dengan koreksi error Level H (30%) yang tetap responsif saat dipindai, dipadukan dengan area logo berlatar frosted glass (transparan buram) yang menyatu lembut dengan latar kartu.',
          color: 'text-purple-600',
          bgColor: 'bg-purple-50',
        },
        {
          icon: Download,
          title: 'Nama Panjang Anti-Terpotong & Mesin Unduh PNG 2D Canvas',
          description:
            'Ukuran huruf nama tamu beserta gelar/jabatan menyesuaikan otomatis tanpa terpotong (...), serta mesin Direct 2D Canvas Compositor dan Media Proxy memastikan seluruh foto mempelai, logo, dan QR selalu ikut terunduh dengan tajam.',
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-50',
        },
      ],
    },
    {
      version: 'V2.2.0',
      date: '26 September 2026',
      badge: 'Feature Drop',
      changes: [
        {
          icon: WifiOff,
          title: 'Mode Offline-First pada Scanner & Layar Sapaan (TV Greeting)',
          description:
            'Proses scan check-in tamu dan tampilan layar sapaan VIP tetap berjalan lancar tanpa hambatan meskipun koneksi internet di lokasi acara sedang terputus, serta otomatis tersinkronisasi saat kembali online.',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
        },
        {
          icon: Gift,
          title: 'Manajemen Pengambilan Souvenir & Pencatatan Petugas',
          description:
            'Dukungan mode pengambilan souvenir otomatis (1x scan sekaligus check-in) maupun terpisah (2x scan khusus meja souvenir), lengkap dengan pemantauan kuota stok dan pencatatan nama petugas yang melayani.',
          color: 'text-amber-600',
          bgColor: 'bg-amber-50',
        },
        {
          icon: Calendar,
          title: 'Kalender Jadwal 3 Bulan & Indikator Hitung Mundur H-3 di Dashboard',
          description:
            'Tampilan kalender interaktif untuk memantau jadwal acara berstatus Published selama 3 bulan ke depan, dilengkapi lencana pengingat otomatis (Hari Ini, H-1 s/d H-3).',
          color: 'text-teal-600',
          bgColor: 'bg-teal-50',
        },
        {
          icon: Briefcase,
          title: 'Workspace Khusus Petugas (Staff) & Identitas Naungan Partner/WO',
          description:
            'Antarmuka workspace yang lebih ringkas untuk petugas lapangan, penampil identitas naungan bisnis/WO pada profil pengguna, serta standarisasi hak akses lintas peran.',
          color: 'text-indigo-500',
          bgColor: 'bg-indigo-50',
        },
      ],
    },
    {
      version: 'V2.0.0',
      date: '12 Juli 2026',
      badge: 'Major Update',
      changes: [
        {
          icon: Zap,
          title: 'Upload Media Sekejap Mata',
          description: 'Mengunggah logo, banner, dan foto galeri kini terasa jauh lebih cepat, stabil, dan tanpa hambatan.',
          color: 'text-amber-500',
          bgColor: 'bg-amber-50'
        },
        {
          icon: ImageIcon,
          title: 'Tampilan Link WhatsApp Selalu Sempurna',
          description: 'Gambar undangan (thumbnail) saat dibagikan via WhatsApp kini dijamin selalu muncul dengan kualitas terbaik.',
          color: 'text-blue-500',
          bgColor: 'bg-blue-50'
        }
      ]
    },
    {
      version: 'V1.2.2',
      date: '30 Juni 2026',
      changes: [
        {
          icon: Users,
          title: 'Tampilan Daftar Tamu Lebih Fleksibel',
          description: 'Anda bisa mengatur jumlah tamu yang tampil dalam satu halaman (10, 25, atau 50 tamu). Tombol-tombol aksi juga ditata ulang agar lebih rapi.',
          color: 'text-indigo-500',
          bgColor: 'bg-indigo-50'
        },
        {
          icon: ShieldCheck,
          title: 'Anti Data Ganda & Keamanan Akun',
          description: 'Nama tamu otomatis terkunci jika mengisi dari link pribadi untuk mencegah duplikat. Akun Anda juga akan otomatis keluar (logout) jika dibiarkan terbuka tanpa aktivitas selama 2 jam.',
          color: 'text-emerald-500',
          bgColor: 'bg-emerald-50'
        }
      ]
    },
    {
      version: 'V1.2.1',
      date: '29 Juni 2026',
      changes: [
        {
          icon: Smartphone,
          title: 'Pengingat Acara & Perubahan Data',
          description: 'Sistem kini mengirimkan pesan WhatsApp otomatis untuk mengingatkan hari acara (H-30 hingga H-3), dan memberi tahu Anda jika klien mengubah data tamu.',
          color: 'text-green-500',
          bgColor: 'bg-green-50'
        },
        {
          icon: CheckCircle2,
          title: 'Hapus Banyak Tamu & Pilih Template Cepat',
          description: 'Hemat waktu dengan menghapus banyak tamu sekaligus, dan bebas memilih template pesan saat membagikan undangan.',
          color: 'text-purple-500',
          bgColor: 'bg-purple-50'
        }
      ]
    },
    {
      version: 'V1.2.0',
      date: '23 Juni 2026',
      changes: [
        {
          icon: Sparkles,
          title: 'Pengisian Kehadiran Otomatis',
          description: 'Nama dan nomor WA tamu kini terisi otomatis di form undangan. Tab menu juga diganti nama agar lebih mudah dimengerti.',
          color: 'text-pink-500',
          bgColor: 'bg-pink-50'
        },
        {
          icon: LayoutDashboard,
          title: 'Sinkronisasi Data Cerdas',
          description: 'Menyembunyikan form kehadiran kini bisa dilakukan dengan sekali klik. Sistem juga lebih pintar mencegah nama tamu yang tersimpan ganda.',
          color: 'text-blue-500',
          bgColor: 'bg-blue-50'
        }
      ]
    },
    {
      version: 'V1.1.x',
      date: '22 Juni 2026',
      badge: 'Feature Drop',
      changes: [
        {
          icon: Sparkles,
          title: 'Hitung Mundur Acara & Tema Floral',
          description: 'Tamu bisa melihat waktu hitung mundur menuju hari bahagia Anda. Halaman undangan juga tampil lebih segar dengan nuansa floral elegan.',
          color: 'text-rose-500',
          bgColor: 'bg-rose-50'
        },
        {
          icon: Megaphone,
          title: 'Kustomisasi Pesan Bebas',
          description: 'Buat dan atur template pesan WhatsApp sesuka Anda langsung dari dasbor. Sistem akan mengingat pilihan terakhir Anda untuk setiap acara.',
          color: 'text-teal-500',
          bgColor: 'bg-teal-50'
        },
        {
          icon: Bug,
          title: 'Berbagi Pesan Lebih Stabil',
          description: 'Berbagai penyempurnaan memastikan pesan WhatsApp, pratinjau link, dan pengiriman gambar selalu berhasil terkirim tanpa kendala.',
          color: 'text-gray-500',
          bgColor: 'bg-gray-50'
        }
      ]
    },
    {
      version: 'V1.0.0 - V1.0.6',
      date: 'Mei - Juni 2026',
      changes: [
        {
          icon: Sparkles,
          title: 'Layar Sapa VIP (Greeting Screen)',
          description: 'Tamu spesial yang hadir akan disambut dengan layar sapaan yang cantik secara realtime, lengkap dengan logo Anda.',
          color: 'text-amber-500',
          bgColor: 'bg-amber-50'
        },
        {
          icon: Zap,
          title: 'Otomatisasi & Suara Notifikasi',
          description: 'Pencarian tamu dengan filter baru, sinkronisasi profil otomatis, dan penambahan suara "beep" penanda sukses saat tiket tamu di-scan.',
          color: 'text-indigo-500',
          bgColor: 'bg-indigo-50'
        }
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto py-8 font-sans">
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 mb-6">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">Apa yang Baru di Guestly</h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
          Kami terus menghadirkan pembaruan untuk membuat pengelolaan acara Anda menjadi lebih mudah, cepat, dan aman.
        </p>
      </div>
      
      <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
        {versions.map((release, index) => (
          <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-indigo-100 text-indigo-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              <span className="text-xs font-bold">v{release.version.replace(/[^0-9]/g, '').charAt(0) || '1'}</span>
            </div>
            
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900">{release.version}</h2>
                  {release.badge && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                      {release.badge}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                  {release.date}
                </span>
              </div>
              
              <div className="space-y-6">
                {release.changes.map((change, i) => {
                  const Icon = change.icon;
                  return (
                    <div key={i} className="flex gap-4">
                      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${change.bgColor} ${change.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 mb-1">{change.title}</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {change.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-20 text-center bg-gray-50 rounded-3xl p-8 border border-gray-100">
        <h3 className="text-lg font-bold text-gray-900 mb-2">🙏 Terima kasih telah menggunakan Guestly.</h3>
        <p className="text-gray-500">
          Saran dan masukan Anda membantu kami menjadi lebih baik setiap harinya.
        </p>
      </div>
    </div>
  );
}

