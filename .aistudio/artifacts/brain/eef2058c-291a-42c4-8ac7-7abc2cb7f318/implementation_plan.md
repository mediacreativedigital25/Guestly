# Rencana Penyederhanaan Tampilan: Detail Acara yang Lebih Ringkas & Fokus ke Inti

Merapikan dan memadatkan tata letak halaman **Detail Acara** untuk seluruh Role (dengan mode paling ringkas bagi **Role Staff**) agar ruang vertikal di atas tabel jauh lebih hemat, informasi berulang hilang, filter lebih bersih, dan kolom utama (**Tamu**, **Kehadiran**, **Souvenir**, **Aksi**) langsung terlihat utuh di layar pertama tanpa perlu banyak menggulir.

---

## Keputusan Terkonfirmasi & Ruang Lingkup

> [!IMPORTANT]
> Seluruh arah desain berikut telah dikonfirmasi dan akan diterapkan secara konsisten:
> - **Cakupan Role**: Berlaku untuk **semua Role** (*Super Admin*, *Owner*, *Admin*, *Partner*, *Client*, dan *Staff*), dengan **Role Staff** mendapatkan tampilan paling fokus (tanpa kolom/filter yang tidak dipakai petugas lapangan).
> - **Header & Ringkasan Metrik**: **Header Acara 2 baris** + **1 strip metrik ringkas horizontal** (menggantikan 5 kartu KPI tinggi).
> - **Filter & Pencarian**: **1 baris filter utama** + tombol **Filter Lanjutan** buka-tutup.
> - **Tabel Tamu**: **Penggabungan kolom pendukung** agar status **Kehadiran** dan **Souvenir** langsung tampak jelas di layar tanpa scroll samping berlebih.

> [!NOTE]
> **Jaminan Fungsional**: Seluruh fitur yang sudah ada tetap bekerja 100% tanpa pengurangan—termasuk *Edit Pangkat/Jabatan cepat* untuk Owner/Partner/Super Admin, aksi massal (*checkbox* bagi non-Staff), *Popup Konfirmasi Staff* saat tambah tamu, *WA Blast*, *Import/Export*, *Layar Sapa*, dan *Paginasi*.

---

## 1. Perbandingan Tata Letak (Sebelum vs. Sesudah)

Dengan memadatkan 4 area di atas tabel, tinggi bagian atas berkurang sekitar **190–210 px** sehingga daftar tamu langsung menjadi fokus utama begitu halaman dibuka:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER ACARA RINGKAS (2 Baris)                                          │
│ [Foto] The Wedding Of Irna dan Acep · Published    [Scanner] [Layar Sapa│
│        21 Nov 2026 (08:30) · Koat Coffee · Info Acara ▾                 │
├─────────────────────────────────────────────────────────────────────────┤
│ STRIP METRIK HORIZONTAL (1 Baris Terpadu, Pemisah Halus)                │
│  Total Tamu        │ Sudah Check-In      │ Belum Hadir   │ Souvenir     │
│  56 (162 Org)      │ 33 (98 Org · 59%)   │ 23 undangan   │ 5 / 56       │
│  *(Non-Staff juga menampilkan kolom ringkas RSVP Hadir di strip ini)*   │
├─────────────────────────────────────────────────────────────────────────┤
│ Tab:  Daftar Tamu (56)   Berhasil Scan (33)   Souvenir & Logistik       │
├─────────────────────────────────────────────────────────────────────────┤
│ FILTER 1 BARIS: [🔍 Cari tamu...] [Kehadiran ▾] [Kategori ▾] [Filter ▾] │
│                 [Tampilkan 50 ▾]   *(Filter Lanjutan buka-tutup)*       │
├─────────────────────────────────────────────────────────────────────────┤
│ AKSI: [ + Tambah Tamu ]  [ Export ]  [ Muat Ulang ]        56 tamu      │
├─────────────────────────────────────────────────────────────────────────┤
│ TABEL FOKUS (Tanpa Scroll Samping Berlebih)                             │
│ NO │ TAMU & KONTAK │ KATEGORI & SESI │ PAX │ KEHADIRAN │ SOUVENIR │AKSI │
│ 1  │ A ari         │ Tamu Mempelai   │7 Org│ Hadir     │ Diambil  │✓ QR │
│    │ ABC123 · Ckp  │ Akad Nikah      │     │ 09:12     │ Oleh Mira│     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Rincian Penyederhanaan per Bagian

### A. Header Konteks Acara (3 Baris → 2 Baris)
- **Menghapus pengulangan info petugas**: Teks `Petugas: Mira Permata Sari (Staff All-in...)` tidak lagi diulang di samping judul acara karena nama dan peran petugas sudah selalu tampil di pojok kanan atas bar navigasi.
- **Merapikan Baris 1**: Thumbnail acara lebih proporsional (`48×48px`), judul acara, status (*Published/Draft/Completed*), dan pemilih status khusus Super Admin.
- **Merapikan Baris 2**: Tanggal & jam `·` Lokasi acara `·` Masa aktif (hanya ditampilkan untuk non-Staff, atau muncul otomatis bila mendekati kedaluwarsa) `·` tombol lipat **Info Acara ▾**.
- **Isi Drawer Info Acara**: Memindahkan ringkasan *Kategori*, *Sesi*, *Tipe Undangan*, dan *Frame Layar Sapa* ke dalam panel lipat **Info Acara** agar header tetap bersih 2 baris saat default.
- **Tombol Aksi Kanan**: Tetap satu baris rapi (**Buka Scanner** sebagai aksi utama, diikuti tombol pendukung sesuai role).

### B. Strip Metrik Ringkas Horizontal (5 Kartu Tinggi → 1 Strip Terpadu)
- Mengganti 5 kartu terpisah dengan **1 wadah strip putih datar** berpemisah garis vertikal halus (`divide-x`), menghilangkan label pojok yang terpotong dua baris (`Pra Check-In`, `Realtime`) serta garis pembatas dalam kartu.
- **Mode Staff (4 metrik inti hari-H)**:
  - **Total Tamu**: `56` undangan · `162 Org`
  - **Sudah Check-In**: `33` · `98 Org (59%)`
  - **Belum Hadir**: `23` undangan
  - **Souvenir Diambil**: `5` · `51 belum`
- **Mode Non-Staff (5 metrik lengkap dalam 1 strip)**:
  - Menambahkan metrik **RSVP Hadir** (`0 Org · 56 pending`) dengan format ringkas yang sama.
- Seluruh angka tetap menggunakan `tabular-nums` agar sejajar vertikal.

### C. Kotak Filter 1 Baris + Filter Lanjutan Buka-Tutup
- **Baris Utama (selalu terlihat, 1 baris)**:
  - Input pencarian cepat (dengan tombol hapus `X`)
  - Filter status utama (*Kehadiran* pada tab Daftar Tamu, atau *Status RSVP* pada tab RSVP)
  - Filter **Kategori**
  - Tombol **Filter Lanjutan** (menampilkan indikator angka jumlah filter lanjutan yang aktif, misal `Filter (1)`)
  - Pilihan batas tampil (**10 / 25 / 50**)
- **Panel Filter Lanjutan (terlipat saat awal, dibuka hanya saat diperlukan)**:
  - **Tipe Undangan**
  - **Status Kirim WA** *(disembunyikan otomatis bagi Role Staff karena Staff tidak mengirim undangan WA)*
  - **Urutkan Berdasarkan** (*Kategori*, *Terbaru*, *Nama A–Z*)
  - Tombol **Reset Filter** saat ada filter aktif.

### D. Tabel Tamu Ringkas & Minim Scroll Samping
- **Penggabungan Kolom Pendukung (dari 14–15 kolom menjadi 7–9 kolom bersih)**:
  1. **Checkbox** *(khusus Non-Staff; disembunyikan penuh untuk Staff karena Staff tidak memiliki aksi massal)*.
  2. **No** (rata angka `tabular-nums`).
  3. **Tamu**: Nama lengkap (termasuk gelar/pangkat), kode tiket mono, baris ringkas `Alamat · No. HP` bila ada, input inline *Pangkat/Jabatan* kompak khusus Owner/Partner/Super Admin, serta keterangan audit Staff (bila ditambahkan petugas).
  4. **Kategori & Sesi**: Nama kategori (tetap bisa diklik untuk mengurutkan) di baris atas, dan `Tipe Undangan · Sesi` sebagai teks tenang di baris kedua.
  5. **Pax**: Jumlah orang (`7 Org`, `tabular-nums`).
  6. **Undangan & RSVP** *(khusus Non-Staff pada tab Daftar Tamu/Berhasil Scan; disembunyikan untuk Staff agar fokus hari-H)*: Status kirim WA dan status RSVP dalam 2 baris semantik ringkas.
  7. **Kehadiran**: Status (`Hadir · Scan QR` / `Belum Hadir`) + waktu hadir & nama petugas di baris bawah.
  8. **Souvenir**: Nama souvenir / `Belum` + nama petugas penyerah di baris bawah.
  9. **Aksi**: Tombol ikon melingkar rata kanan (*sticky* tetap aman bila layar sempit).
- Tab **RSVP & Ucapan** (khusus non-Staff) turut diseragamkan dengan kolom `Tamu` ringkas tanpa kolom *Pangkat/Jabatan* yang lebar terpisah.

---

## 3. Keputusan Desain & Pertimbangan Teknis

- **Keputusan 1 — Satu Sumber Data & Komponen, Tampilan Adaptif per Role**
  - *Pendekatan*: Tetap menggunakan struktur halaman Detail Acara yang sama untuk seluruh Role, namun menyembunyikan metrik RSVP, filter Status Kirim WA, kolom Checkbox, dan kolom Undangan/RSVP secara otomatis ketika pengguna adalah `staff`.
  - *Alasan*: Menjaga konsistensi pola visual dengan halaman **Create Event**, memudahkan pemeliharaan, dan langsung memberikan pengalaman paling fokus bagi petugas lapangan hari-H.
- **Keputusan 2 — Menjaga Edit Pangkat Cepat Tanpa Membebani Lebar Tabel**
  - *Pendekatan*: Kolom terpisah *Pangkat / Jabatan* (yang sebelumnya membuat header terpotong 3 baris dan mendorong kolom *Kehadiran* keluar layar) digabungkan ke dalam sel **Tamu** sebagai input cepat inline yang ringkas khusus bagi Owner/Partner/Super Admin (sementara bagi Role lain, pangkat sudah menyatu secara alami di nama tamu).
  - *Alasan*: Menghemat ~160px lebar tabel sekaligus menjaga kecepatan edit pangkat dengan `Enter` bagi admin acara.
- **Keputusan 3 — Filter Lanjutan Berindikator Status Aktif**
  - *Pendekatan*: Panel filter sekunder ditutup secara default agar hanya 1 baris filter yang tampil, tetapi tombol **Filter** menampilkan jumlah filter lanjutan yang sedang aktif (dan otomatis membuka atau tetap terlihat tombol **Reset**) agar pengguna tidak pernah bingung saat data terfilter.

---

## 4. Pemetaan State & Interaksi

```text
State UI Baru pada Detail Acara:
  • isAdvancedFilterOpen (boolean, default false)
    └── Toggle buka/tutup baris Filter Lanjutan (Tipe Undangan, Status Kirim WA, Urutan)
  • activeAdvancedFilterCount (derived number)
    └── Menghitung filter lanjutan aktif (selain default) untuk indikator tombol Filter

Alur Interaksi:
  1. Klik "Info Acara ▾"      ──▶ Membuka/menutup ringkasan Kategori, Sesi, Tipe, & Frame
  2. Klik "Filter ▾"          ──▶ Membuka/menutup panel Filter Lanjutan tanpa mereset filter
  3. Klik "Reset Filter"      ──▶ Mengosongkan semua pencarian & filter (utama + lanjutan)
  4. Klik Header "Kategori"   ──▶ Tetap men-toggle urutan kategori naik/turun
  5. Edit Pangkat (Non-Staff) ──▶ Ketik & Enter di dalam sel Tamu langsung menyimpan ke server
```
