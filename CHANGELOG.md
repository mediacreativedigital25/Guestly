# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Form RSVP Publik (`PublicRSVP.tsx`): Menambahkan pilihan "Sesi Acara" (dropdown) apabila event tersebut memiliki sesi yang telah diatur sebelumnya.
- Pembaruan integrasi agar data sesi (`session`) tersimpan ke dalam koleksi `guests` di Firestore saat tamu melakukan RSVP.

### Fixed
- Memperbaiki error koneksi server-side Firebase (`3 INVALID_ARGUMENT`) dengan mengonfigurasi `server.ts` untuk menggunakan konfigurasi dari `firebase-applet-config.json`.
- Memperbaiki validasi timestamp pada `firestore.rules`.
