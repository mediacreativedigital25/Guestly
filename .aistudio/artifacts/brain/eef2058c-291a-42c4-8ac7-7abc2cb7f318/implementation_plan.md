# Rencana Penyeragaman UI — Fokus Grup B (Standar Konsep Create Event)

Sesuai arahan Anda, cakupan eksekusi difokuskan **khusus pada Grup B** yaitu **6 halaman berbasis daftar & tabel** agar seluruhnya memiliki keseragaman penuh dengan halaman **Events (Create Event)**—baik dari struktur kotak filter terpadu, penempatan baris tombol aksi rata kiri, kolom tabel bernomor, tombol aksi ikon melingkar, maupun footer pagination.

---

## Ringkasan Keputusan & Konfirmasi Ruang Lingkup

> [!IMPORTANT]
> **Keputusan Terkonfirmasi**:
> - **Cakupan Eksekusi**: Hanya **Grup B** (6 halaman tabel/daftar di bawah ini). Halaman di luar Grup B (Grup A, C, D, E) tidak akan diubah.
> - **Jaminan Fungsional**: Seluruh modal tambah/edit/detail, hak akses per role, fitur WhatsApp/Fonnte, serta rute URL tetap utuh tanpa perubahan logika bisnis.

---

## 1. Standar Konsep Layout Acuan (Ala Create Event)

Seluruh 6 halaman Grup B akan mengikuti pola konsisten berikut:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  [Kartu Ringkasan KPI Ringkas — khusus halaman yang memang butuh KPI]   │
├─────────────────────────────────────────────────────────────────────────┤
│  KOTAK 1: FILTER & PENCARIAN TERPADU                                    │
│  (bg-white, rounded-xl, border-gray-200, shadow-xs, p-2.5 sm:p-3)       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ [Rentang Tanggal — bila data berbasis tanggal]                    │  │
│  │ [🔍 Cari ... (dengan tombol X)] [Filter Kontekstual ▾] [10/25/50▾]│  │
│  └───────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│  BARIS AKSI UTAMA (Rata Kiri, di antara Kotak 1 & Kotak 2)              │
│  [ + Tombol Aksi Utama (Indigo) ]  [ Tombol Sekunder (Outline) ]        │
├─────────────────────────────────────────────────────────────────────────┤
│  KOTAK 2: TABEL DATA & FOOTER PAGINATION                                │
│  (bg-white, rounded-xl, border-gray-200, shadow-sm, overflow-hidden)    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ NO | KOLOM DATA UTAMA | INFORMASI PENDUKUNG | STATUS | AKSI       │  │
│  │ 1  | ...              | ...                 | [Pill] | (👁)(✏)(🗑) │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ Menampilkan 1 – 10 dari Z data  Reset   [«] [Sebelumnya] Hal 1/N  │  │
│  │                                         [Selanjutnya] [»]         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Rincian Penyesuaian 6 Halaman Grup B

### 1. Approvals
- **Wadah**: Lebar penuh (`space-y-4`, menghapus batasan `max-w-7xl mx-auto` dan blok judul besar ganda di dalam tabel).
- **Kotak 1 (Filter Terpadu)**:
  - Baris 1: **Rentang Tanggal Pengajuan** (`Dari` – `Sampai`).
  - Baris 2: Input **Pencarian** (nama tamu, acara, pengaju) dengan tombol hapus `X`, filter **Status** (*Semua / Menunggu / Disetujui / Ditolak*), filter **Jenis Permintaan** (*Semua / Tambah / Edit / Hapus*), serta pemilih **Tampilkan 10 / 25 / 50**.
- **Kotak 2 (Tabel & Pagination)**:
  - Kolom: `No | Acara / Pengaju | Detail Perubahan Tamu | Tanggal | Status | Aksi`.
  - Aksi ikon melingkar rata kanan (*Detail*, *Setujui*, *Tolak* sesuai role & status).
  - Empty state dilengkapi tombol **Reset Pencarian & Filter** serta **Footer Pagination** lengkap.

### 2. Manajemen User → Bisnis Partner
- **Wadah**: `space-y-4`, menghapus teks deskripsi mengambang di atas halaman.
- **Ringkasan KPI**: Dipertahankan secara kompak (Total Partner, Terverifikasi, Belum Lengkap, Total Event) dengan gaya `rounded-xl border-gray-200`.
- **Kotak 1 (Filter Terpadu)**:
  - Input **Pencarian** (nama usaha, pemilik, email, alamat, kota) + tombol hapus `X`, filter **Status Verifikasi** (*Semua / Terverifikasi / Belum Lengkap*), dan pemilih **Tampilkan 10 / 25 / 50**.
- **Baris Aksi Rata Kiri**: Tombol **+ Daftarkan Bisnis Partner** dipindahkan ke bawah Kotak 1 (rata kiri).
- **Kotak 2 (Tabel & Pagination)**:
  - Menambahkan kolom **No** di paling kiri.
  - Kolom aksi memakai tombol ikon melingkar (*Edit*, *Hapus*).
  - Menambahkan **Footer Pagination** lengkap dan tombol **Reset Pencarian & Filter**.

### 3. Manajemen User → User
- **Wadah**: `space-y-4`, menghapus paragraf deskripsi mengambang di bagian atas.
- **Kotak 1 (Filter Terpadu)**:
  - Input **Pencarian** (nama, email, no. HP, nama bisnis) + tombol hapus `X`.
  - Filter **Role** (*Semua Role*, *Owner/Partner*, *Admin*, *Staff*, *Client*, dst. sesuai hak akses).
  - Filter **Bisnis / Vendor** (khusus Super Admin).
  - Pemilih **Tampilkan 10 / 25 / 50**.
- **Baris Aksi Rata Kiri**: Tombol **+ Tambah User** dipindahkan rata kiri di antara Kotak 1 dan Kotak 2.
- **Kotak 2 (Tabel & Pagination)**:
  - Menambahkan kolom **No** di paling kiri.
  - Tetap menampilkan informasi bisnis, role, perangkat aktif, dan kuota secara rapi.
  - Menyeragamkan tombol aksi menjadi ikon melingkar (*Kirim Ulang WA*, *Edit*, *Hapus*, *Logout Perangkat* bila ada).
  - Menambahkan **Footer Pagination** lengkap (beserta dukungan muat data lanjutan bila data di server masih tersedia).

### 4. Manajemen User → Sesi Aktif
- **Wadah**: Lebar penuh (`space-y-4`, menghapus batasan `max-w-7xl mx-auto`).
- **Ringkasan KPI**: Kartu statistik sesi (Online, Idle, Offline, Total Perangkat) dirapikan dengan border dan radius `rounded-xl` yang konsisten.
- **Kotak 1 (Filter Terpadu)**:
  - Input **Pencarian** (nama user, email, IP, lokasi, perangkat, halaman aktif) + tombol hapus `X`.
  - Filter **Status Sesi** (*Semua / Online / Idle / Offline*) dan filter **Role**.
  - Pemilih **Tampilkan 10 / 25 / 50**.
- **Baris Aksi Rata Kiri**: Tombol aksi operasional (*Muat Ulang Data* / aksi sesi) ditempatkan rata kiri di antara Kotak 1 dan Kotak 2.
- **Kotak 2 (Tabel & Pagination)**:
  - Menambahkan kolom **No** di paling kiri.
  - Tombol aksi ikon melingkar (*Detail Sesi* / *Putus Sesi*).
  - Menambahkan **Footer Pagination** lengkap dan tombol **Reset Pencarian & Filter**.

### 5. Admin Panel → Template WA
- **Wadah**: `space-y-4`.
- **Kotak 1 (Filter Terpadu)**:
  - Input **Pencarian** (nama template, isi pesan, kategori) + tombol hapus `X`.
  - Filter **Kategori / Tipe Template** (otomatis mengikuti kategori yang tersedia) + pemilih **Tampilkan 10 / 25 / 50**.
- **Baris Aksi Rata Kiri**: Tombol **+ Template Baru** dipindahkan dari pojok kanan ke baris aksi rata kiri di antara Kotak 1 dan Kotak 2.
- **Kotak 2 (Tabel & Pagination)**:
  - Menambahkan kolom **No** di paling kiri.
  - Tombol aksi ikon melingkar (*Edit*, *Hapus*).
  - Menambahkan **Footer Pagination** lengkap dan tombol **Reset Pencarian & Filter**.

### 6. Informasi Layanan → Layanan Saya
- **Wadah**: Lebar penuh (`space-y-4`, menghapus batasan `max-w-6xl mx-auto`).
- **Ringkasan Kuota**: Kartu saldo kuota (Kuota Event, Kuota Client, Masa Aktif, dll.) tetap tampil di bagian atas secara rapi dan kompak.
- **Kotak 1 (Filter Terpadu)**:
  - Input **Pencarian** (nama layanan / paket / ID pesanan) + tombol hapus `X`.
  - Filter **Tipe Layanan** (*Semua / Paket / Add-On*) dan/atau **Status** (*Aktif / Selesai*) + pemilih **Tampilkan 10 / 25 / 50**.
- **Baris Aksi Rata Kiri**: Tombol **Beli Layanan** (utama) dan **Lihat Invoice** (sekunder) dipindahkan rata kiri di antara Kotak 1 dan Kotak 2.
- **Kotak 2 (Tabel & Pagination)**:
  - Menambahkan kolom **No** pada daftar/riwayat layanan aktif.
  - Menambahkan **Footer Pagination** lengkap dan tombol **Reset Pencarian & Filter**.

---

## 3. Alur Eksekusi & Verifikasi

```text
[1] Approvals          ─▶ [2] Bisnis Partner ─▶ [3] Manajemen User
                                                      │
[6] Layanan Saya       ◀─ [5] Template WA    ◀─ [4] Sesi Aktif
        │
        ▼
[Verifikasi Final: Kompilasi & Lint]
```

Setelah seluruh 6 halaman selesai disesuaikan, aplikasi akan dikompilasi dan di-lint untuk memastikan seluruh perubahan bersih tanpa error baru.
