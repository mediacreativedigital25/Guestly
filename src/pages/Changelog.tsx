export default function Changelog() {
  const versions = [
    {
      version: 'v1.0.7',
      date: '22 Juni 2026',
      changes: [
        'Menambahkan fitur kustomisasi dan manajemen Template WhatsApp Blast pada Admin Panel',
        'Sistem otomatis menyimpan pilihan Template WA terakhir yang digunakan untuk setiap acara',
        'Penyempurnaan sistem kuota: Kuota WA Blast kini dipastikan hanya berkurang secara otomatis ketika pesan berhasil terkirim',
        'Memperbaiki isu perizinan akses database (Firestore rules) saat memperbarui kuota dan menyimpan template'
      ]
    },
    {
      version: 'v1.0.6',
      date: '20 Juni 2026',
      changes: [
        'Memperbarui tampilan Greeting Screen dengan logo vendor partner dan watermark "Powered by Guestly"',
        'Penyempurnaan tipografi pada Greeting Screen menggunakan font Poppins dan Great Vibes',
        'Memperbaiki tampilan preview thumbnail gambar saat membagikan pesan undangan di WhatsApp',
        'Penyesuaian daftar tamu: Tamu yang belum melakukan konfirmasi (Pending) akan tetap masuk ke dalam Guest List',
        'Menambahkan fitur Filter di tab "RSVP & Undangan" dan "Guest List" untuk mempermudah pencarian tamu berdasarkan status RSVP dan Kehadiran'
      ]
    },
    {
      version: 'v1.0.5',
      date: '27 Mei 2026',
      changes: [
        'Menambahkan logo pada layar pemuatan (loading screen)',
        'Sinkronisasi otomatis pembaruan data profil atau nama lengkap pengguna pada dashboard dan profil',
        'Menambahkan efek suara notifikasi (beep) ketika pemindaian barcode tiket berhasil'
      ]
    },
    {
      version: 'v1.0.4',
      date: '24 Mei 2026',
      changes: [
        'Menambahkan pilihan "Sesi Acara" pada Form RSVP Publik apabila event memiliki sesi',
        'Pembaruan integrasi agar data sesi tamu tersimpan saat melakukan RSVP',
        'Memperbaiki error koneksi server-side pada aplikasi',
        'Memperbaiki aturan keamanan Firestore terkait timestamp'
      ]
    },
    {
      version: 'v1.0.3',
      date: '15 Mei 2026',
      changes: [
        'Memperbarui template pesan WhatsApp Broadcast dengan menampilkan Nama Client secara otomatis',
        'Perbaikan aturan keamanan database untuk akses data Client'
      ]
    },
    {
      version: 'v1.0.2',
      date: '11 Mei 2026',
      changes: [
        'Menghapus Menu Partner Setting dan menggabungkannya ke menu White Label',
        'Menambahkan menu Detail Edit Client',
        'Menambahkan fitur Layar Sapa (Greeting Screen) tamu VIP realtime setelah berhasil scan',
        'Penyempurnaan navigasi dan perbaikan bug minor'
      ]
    },
    {
      version: 'v1.0.1',
      date: '7 Mei 2026',
      changes: [
        'Rilis perdana Guestly',
        'Penyempurnaan Manajemen Acara untuk Super Admin dan Partner',
        'Penambahan fitur pembuatan dan pemindaian Barcode Digital',
        'Dukungan pengaturan Label Putih (White label) dengan logo dan warna merek kustom',
        'Integrasi fungsionalitas RSVP daring (online)'
      ]
    }
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Riwayat Perubahan</h1>
      <p className="text-gray-500">Pantau pembaruan dan peningkatan terbaru.</p>
      
      <div className="space-y-8 mt-8">
        {versions.map((release) => (
          <div key={release.version} className="relative pl-8 border-l border-gray-200 ml-4 pb-8">
            <div className="absolute w-3 h-3 bg-indigo-600 rounded-full -left-[6.5px] top-1.5 ring-4 ring-white" />
            <div className="flex gap-4 items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">{release.version}</h2>
              <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{release.date}</span>
            </div>
            <ul className="space-y-3">
              {release.changes.map((change, i) => (
                <li key={i} className="flex gap-2 text-gray-700">
                  <span className="text-gray-300 select-none">•</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
