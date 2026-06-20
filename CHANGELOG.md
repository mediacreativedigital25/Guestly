# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Layar pemuatan (loading screen) kini menampilkan logo aplikasi jika tersedia (diambil dari `faviconUrl` atau `logoUrl`).
- Sinkronisasi otomatis data profil (seperti nama lengkap) ke seluruh aplikasi (termasuk dashboard dan profil) menggunakan pembaruan waktu-nyata.
- Notifikasi suara (beep) ketika pemindaian barcode tiket di aplikasi berhasil.

### Changed
- Field nomor telepon sekarang diwajibkan (required) untuk pengguna.

## [v1.0.4] - 2026-05-24

### Added
- Form RSVP Publik (`PublicRSVP.tsx`): Menambahkan pilihan "Sesi Acara" (dropdown) apabila event tersebut memiliki sesi yang telah diatur sebelumnya.
- Pembaruan integrasi agar data sesi (`session`) tersimpan ke dalam koleksi `guests` di Firestore saat tamu melakukan RSVP.

### Fixed
- Memperbaiki error koneksi server-side Firebase (`3 INVALID_ARGUMENT`) dengan mengonfigurasi `server.ts` untuk menggunakan konfigurasi dari `firebase-applet-config.json`.
- Memperbaiki validasi timestamp pada `firestore.rules`.
