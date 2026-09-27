# Changelog

All notable changes to this project will be documented in this file.

## [v2.3.0] - 2026-09-27

### Added
- **Kartu E-Invitation Digital & Katalog Template R2:** Desain kartu undangan digital beresolusi tinggi (`16:9`) dengan bingkai foto mempelai lengkung (*arch*), pilihan tema warna elegan, serta pengelolaan katalog template terpusat di Cloudflare R2 (`guestly-storage/E-Invitation/`).
- **2 Pilihan Mode Cetak & Unduh (Bentuk Card atau QR Biasa):** Pilihan fleksibel saat melihat tiket maupun mencetak massal: **Bentuk Card E-Invitation** (8 kartu per lembar A4) atau **QR Biasa / Label Standar** (20 label per lembar A4) lengkap dengan pratinjau langsung.
- **Emblem Favicon Guestly di Tengah QR & Latar Logo *Frosted Glass*:** Seluruh QR Code kini menampilkan identitas Favicon Guestly di bagian tengah dengan koreksi error **Level H (30%)** yang tetap responsif saat dipindai, dipadukan dengan area logo berlatar *frosted glass* (`bg-white/45 backdrop-blur-md`) yang menyatu lembut dengan latar kartu.

### Fixed
- **Nama Panjang Anti-Terpotong & Mesin Unduh PNG 2D Canvas:** Ukuran huruf nama tamu beserta gelar/jabatan menyesuaikan otomatis tanpa terpotong (`...`), serta mesin *Direct 2D Canvas Compositor* dan *R2 Media Proxy* (`/api/media/r2/*` & `/api/media/proxy`) memastikan seluruh foto mempelai, logo, dan QR selalu ikut terunduh dengan tajam.

## [v2.2.0] - 2026-09-26

### Added
- **Mode Offline-First pada Scanner & Layar Sapaan (TV Greeting):** Proses *scan check-in* tamu dan tampilan layar sapaan VIP tetap berjalan lancar meskipun koneksi internet di lokasi acara terputus, dan otomatis tersinkronisasi saat kembali *online*.
- **Manajemen Pengambilan Souvenir & Pencatatan Petugas:** Dukungan mode pengambilan souvenir otomatis (*1x scan* sekaligus *check-in*) maupun terpisah (*2x scan* khusus meja souvenir), lengkap dengan pemantauan kuota stok dan pencatatan nama petugas yang melayani.
- **Kalender Jadwal 3 Bulan & Indikator Hitung Mundur H-3 di Dashboard:** Tampilan kalender interaktif untuk memantau jadwal acara berstatus *Published* selama 3 bulan ke depan lengkap dengan lencana pengingat otomatis (`Hari Ini`, `H-1` s/d `H-3`).
- **Workspace Khusus Petugas (Staff) & Identitas Naungan Partner/WO:** Antarmuka *workspace* yang lebih ringkas untuk petugas lapangan, penampil identitas naungan bisnis/WO pada profil pengguna, serta standarisasi hak akses lintas peran.

## [Unreleased]

### Added
- Layar pemuatan (loading screen) kini menampilkan logo aplikasi jika tersedia (diambil dari `faviconUrl` atau `logoUrl`).
- Sinkronisasi otomatis data profil (seperti nama lengkap) ke seluruh aplikasi (termasuk dashboard dan profil) menggunakan pembaruan waktu-nyata.
- Notifikasi suara (beep) ketika pemindaian barcode tiket di aplikasi berhasil.
- **Pembaruan Data Real-time:** Aplikasi kini menggunakan sinkronisasi waktu-nyata (real-time `onSnapshot` Firestore) sehingga tidak perlu me-refresh halaman untuk melihat hasil pemindaian (scan) tamu terbaru, penambahan klien, acara, maupun pembaruan data pengguna. Tampilan akan otomatis diperbarui seketika.
- **Fitur Pembayaran Manual:** Menambahkan tombol "Copy Rekening" di halaman checkout maupun daftar invoice pelanggan, serta fungsi pengiriman konfirmasi otomatis (kirim bukti transfer) yang diarahkan langsung ke WhatsApp nomor 085158636606.

### Changed
- Field nomor telepon sekarang diwajibkan (required) untuk pengguna.

## [v1.0.4] - 2026-05-24

### Added
- Form RSVP Publik (`PublicRSVP.tsx`): Menambahkan pilihan "Sesi Acara" (dropdown) apabila event tersebut memiliki sesi yang telah diatur sebelumnya.
- Pembaruan integrasi agar data sesi (`session`) tersimpan ke dalam koleksi `guests` di Firestore saat tamu melakukan RSVP.

### Fixed
- Memperbaiki error koneksi server-side Firebase (`3 INVALID_ARGUMENT`) dengan mengonfigurasi `server.ts` untuk menggunakan konfigurasi dari `firebase-applet-config.json`.
- Memperbaiki validasi timestamp pada `firestore.rules`.
