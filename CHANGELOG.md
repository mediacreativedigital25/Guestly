# Changelog

All notable changes to this project will be documented in this file.

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
