# Redesign Profesional Halaman Salespage Guestly & CMS Dinamis Super Admin

Merombak total halaman publik Salespage Guestly dari tampilan template generik menjadi landing page **Editorial Wedding-Tech** yang autentik, berkelas, dan selaras dengan identitas asli Guestly (`#8C3A50`), dilengkapi section **Our Partner** di bawah Hero serta kontrol konten & gambar dinamis penuh (Upload file langsung + tempel URL) dari panel Super Admin.

---

## Ringkasan Keputusan & Konfirmasi Pengguna

> [!IMPORTANT]
> Seluruh preferensi utama dari sesi klarifikasi telah dikunci sebagai dasar desain dan arsitektur di bawah ini. Silakan tinjau detail rencana sebelum tahap implementasi dimulai.

- **Hero 2 Sisi Dinamis**: Tetap mempertahankan komposisi 2 kolom (Narasi & CTA di kiri, Visual Editorial di kanan) di mana gambar Hero serta seluruh konten teks dan sorotan dapat diatur dinamis melalui Pengaturan Salespage Super Admin.
- **Input Gambar Fleksibel (Upload + URL)**: Semua slot gambar (Hero, logo Our Partner, Bento Fitur, Galeri Showcase, Masalah & Solusi) mendukung unggah file langsung ke sistem media yang sudah ada sekaligus opsi tempel tautan URL dengan pratinjau instan.
- **Section Our Partner**: Ditempatkan tepat di bawah Hero dalam gaya baris logo monokrom elegan (berwarna saat *hover*) dengan animasi *marquee* halus yang berhenti saat diarahkan kursor dan ramah aksesibilitas (`prefers-reduced-motion`).
- **Nuansa & Kontras Halaman**: Dominan **Terang Editorial Ivory** (`#FAF8F6` & putih bersih) dengan aksen tunggal **Guestly Burgundy (`#8C3A50`)**, dipadukan dengan **1 section gelap mewah** (*Deep Obsidian Charcoal* `#181316`) pada bab *Masalah, Solusi & Alur Kerja* untuk ritme visual yang dramatis.
- **Kontrol Dinamis Penuh + Reset Default**: Seluruh section pada Salespage dapat dikelola dari Super Admin (Hero, Our Partner, Statistik, Bento Fitur, Masalah & Solusi, Galeri Fitur, Alur Kerja, Header Harga, Banner CTA Penutup, dan Footer), lengkap dengan tombol **Reset ke Default** serta kompatibilitas penuh terhadap data lama yang sudah tersimpan.

---

## 1. Gambaran Umum & Konsep Inti

- **Tujuan Utama**: Menghilangkan kesan "buatan AI" (warna pink neon `#F46279`, gambar rusak `source.unsplash.com`, mockup dashboard macOS palsu, tombol mati, dan grid simetris klise) serta menggantinya dengan desain setara produk perangkat lunak kelas studio yang menampilkan keunggulan nyata Guestly V2.5.2.
- **Target Pengguna**:
  - *Pengunjung Publik*: Wedding Organizer (WO), Event Organizer (EO), pengelola venue/ballroom, serta calon pengantin yang mencari sistem buku tamu digital, QR check-in offline, layar sapa TV, souvenir QR, dan wedding planner yang terpercaya.
  - *Super Admin*: Pemilik platform yang perlu memperbarui narasi promosi, mengganti visual Hero, mengelola daftar logo mitra (*Our Partner*), hingga menyesuaikan fitur sorotan tanpa menyentuh kode.
- **Nilai Utama**: Meningkatkan kredibilitas merek sejak 3 detik pertama, menghadirkan seluruh tombol & navigasi yang benar-benar hidup, dan memberi kebebasan penuh bagi Super Admin untuk mengubah konten secara *real-time*.

---

## 2. Pengalaman Pengguna & Desain Visual

### Alur Perjalanan Pengunjung (Proposition → Proof → Mechanism → Conversion)

1. **Top Navigation Bar (Kontrak 3 Zona Satu Baris)**:
   Logo Guestly di kiri — 4 tautan aktif satu baris (`Fitur`, `Alur Kerja`, `Harga`, `Testimoni`) — tautan teks `Masuk` + 1 tombol utama Burgundy `Mulai Gratis` di kanan. Tidak ada menu mati (`Blog`/`Kontak` palsu dihapus) dan tidak ada dua tombol kapsul bersaing.
2. **Hero Section (2 Kolom Editorial Seimbang)**:
   - *Kolom Kiri*: Teks pembuka tenang tanpa bingkai kapsul, judul utama serif editorial berukuran responsif (`clamp(2.25rem, 4vw, 3.75rem)`, `text-wrap: balance`) dengan penekanan frasa pilihan dalam Burgundy miring, deskripsi singkat 2–3 baris, 1 CTA utama solid Burgundy + 1 aksi sekunder bersih (*Lihat Cara Kerja / Konsultasi*), serta 3 bukti konkret dipisahkan tanda titik (`·`) seperti *Scan QR < 1 Detik · Mode Offline Ballroom · Layar Sapa TV & Souvenir*.
   - *Kolom Kanan*: Bingkai visual editorial rasio seimbang (`items-stretch`, `object-cover`) yang menampilkan gambar unggahan/URL dari Super Admin (dengan aset fotografi resepsi eksklusif bawaan sebagai *default* sehingga **nol gambar rusak**). Dilengkapi *overlay* catatan ringkas opsional di sudut bawah dengan *scrim* kontras terukur (dapat dinyalakan/dimatikan dari Admin, tanpa titik macOS dan tanpa grafik palsu).
3. **Our Partner Strip (Tepat di Bawah Hero)**:
   - Judul tenang satu baris (dinamis, default: *Dipercaya oleh Wedding Organizer, Venue & Event Planner*).
   - Deretan logo mitra monokrom (`grayscale`, kontras lembut, berubah penuh warna saat *hover*) bergerak dalam *marquee* horizontal halus tanpa patahan, berhenti saat kursor menyentuh area, dan otomatis menjadi grid rapi statis bila perangkat mengaktifkan *reduced motion*.
   - Mitra yang hanya diisi nama (tanpa file logo) tetap tampil elegan sebagai tipografi *wordmark* berjarak rapi sehingga tidak pernah menampilkan ikon gambar pecah.
4. **Metric Strip (Bukti Kuantitatif Presisi)**:
   Baris metrik besar menggunakan angka tabular (`tabular-nums`) dengan garis pemisah vertikal tipis (`1px`), dapat menarik data *real-time* dari statistik platform maupun nilai kustom dari Pengaturan Admin.
5. **Asymmetric Bento Capabilities (Fitur Unggulan Guestly V2.5.2)**:
   Menggantikan 6 kotak kartu identik dengan tata letak **Bento Asimetris** (kartu sorotan lebar `col-span-2` berdampingan dengan kartu pendukung `col-span-1`), menonjolkan kapabilitas nyata:
   - *Check-In QR Super Cepat & Mode Offline Ballroom*
   - *Layar Sapa TV VIP/VVIP Real-Time*
   - *Manajemen Souvenir, QR Stiker Batch PDF & Berita Acara*
   - *Undangan Digital & Pengingat Otomatis WhatsApp*
   - *Wedding Planner 6 Modul Terintegrasi*
   Setiap kartu mendukung gambar opsional (Upload/URL) dan label kategori tanpa bingkai *pill*.
6. **Section Gelap Mewah — Masalah, Solusi & Alur Kerja (`01` – `04`)**:
   Satu bab editorial kontras tinggi berlatar **Deep Obsidian Charcoal (`#181316`)** dengan teks gading hangat (`#F7F3F0`) dan garis tipis transparan (`rgba(255,255,255,0.1)`):
   - Bagian atas membandingkan realita buku tamu konvensional vs solusi Guestly (disertai visual dinamis dengan fallback rapi).
   - Bagian bawah menampilkan 4 langkah alur kerja bernomor editorial (`01.` hingga `04.`) yang presisi — menghapus ikon miring `rotate-3` dan garis putus-putus pink.
7. **Galeri Preview Produk Interaktif (Showcase)**:
   Menampilkan daftar `featuresCarouselData` dalam galeri interaktif yang benar-benar berfungsi (pilihan tab fitur, panah kiri/kanan, indikator slide aktif, dan tautan opsional) tanpa bingkai browser palsu.
8. **Paket Harga Presisi**:
   Menghapus blok pembungkus pink raksasa (`rounded-[48px]`). Menggunakan kartu putih bersih berborder tipis `1px` dengan satu paket unggulan beraksen Burgundy `#8C3A50`, angka `tabular-nums`, dan sinkronisasi langsung dari database paket `services`.
9. **Testimoni Interaktif + CTA Penutup & Footer Utuh**:
   - Carousel testimoni dilengkapi logika geser/paginasi yang berfungsi penuh (panah kiri/kanan dan indikator titik aktif), ditambah modal *Tulis Ulasan* yang sudah ada.
   - Banner CTA penutup bernuansa Burgundy pekat dengan ajakan aksi konkret (*Mulai Gratis* / *Hubungi via WhatsApp*) diikuti footer tenang yang seluruh tautannya aktif.

### Identitas Visual & Tema

- **Arah Estetika**: *Editorial Luxury Wedding-Tech* — bersih, tenang, presisi, menggunakan ruang kosong (*whitespace*) dan garis pemisah tipis (`1px`) alih-alih tumpukan kartu bersarang dan bayangan tebal.
- **Palet Warna (Disiplin 60-30-10)**:
  - *60% Kanvas Netral*: Warm Editorial Ivory (`#FAF8F6`) dan Crisp White (`#FFFFFF`).
  - *30% Struktur & Tinta*: Deep Plum-Charcoal (`#171417`), Muted Warm Gray (`#5C5559`), Hairline Border (`#E8E2E4`), serta 1 bab gelap mewah Deep Obsidian Charcoal (`#181316`) dengan kompensasi optik teks (`#F7F3F0`, `tracking-[0.01em]`).
  - *10% Aksen Terfokus*: Guestly Burgundy (`#8C3A50`), hover `#702C3E`, dan tint halus `#FCF0F3` khusus pada CTA utama, frasa penekanan, serta paket unggulan.
- **Tipografi (Aturan 2+1 Font)**:
  - *Display / Headline*: `Playfair Display` (serif editorial berwibawa untuk judul utama & judul seksi).
  - *Body & Antarmuka*: `Plus Jakarta Sans` (sans-serif geometris tajam dan modern untuk paragraf, tombol, dan navigasi).
  - *Angka & Metrik*: `JetBrains Mono` / `tabular-nums` agar seluruh angka harga, statistik, dan penomoran `01–04` sejajar vertikal.
- **Disiplin Anti-Slop**: Tanpa *pill badge* statis pada metadata, tanpa titik status berkedip dekoratif, tanpa *gradient glow* pink/ungu, tanpa garis aksen kiri tebal (`border-l-4`), dan seluruh kontrol interaktif dijaga satu baris (`whitespace-nowrap`).

### Pengalaman Editor Pengaturan Salespage di Super Admin

- Dikelompokkan dalam **panel ber-tab / akordeon rapi** agar tetap nyaman diisi meski seluruh section kini dinamis:
  1. `Hero & CTA`
  2. `Our Partner`
  3. `Statistik`
  4. `Bento Fitur`
  5. `Masalah, Solusi & Galeri`
  6. `Alur Kerja (01–04)`
  7. `Harga, CTA Penutup & Footer`
- Setiap kolom gambar memakai komponen **Input Gambar Ganda** yang ringkas: tombol **Upload File** (terhubung ke pipeline media yang sudah ada dengan bilah progres & validasi tipe/ukuran) + input **Tempel URL** + **Pratinjau Thumbnail Instan** + tombol **Hapus**.
- Tersedia tombol **Reset ke Default** (dengan dialog konfirmasi) untuk mengembalikan teks/struktur bawaan kapan saja serta tombol pintas **Lihat Salespage** di tab baru.

---

## 3. Keputusan Produk Utama & Pertimbangan

- **Keputusan 1: Menyatukan Upload File & Tempel URL dalam Satu Komponen Input Gambar**
  - *Pendekatan Dipilih*: Membuat komponen pemilih gambar ringkas yang memanfaatkan layanan unggah media bawaan aplikasi (`mediaService`) berdampingan dengan kolom URL dan pratinjau instan.
  - *Alasan*: Super Admin dapat langsung mengunggah foto/logo dari komputer atau HP tanpa harus mencari hosting pihak ketiga, namun tetap fleksibel menempelkan tautan eksternal bila sudah tersedia.
  - *Alternatif yang Ditinggalkan*: Menggunakan kotak *dropzone* besar pada setiap baris daftar partner/fitur akan membuat formulir admin terlalu panjang dan sulit dipindai.
- **Keputusan 2: Aset Visual Default Dibuat Khusus (Bukan URL Eksternal Acak)**
  - *Pendekatan Dipilih*: Menghasilkan aset fotografi editorial pernikahan/resepsi berkualitas tinggi secara khusus sebagai gambar bawaan (*default*) Hero dan bab Masalah/Solusi, disertai kontainer *fallback* CSS elegan bila URL kustom dari Admin gagal dimuat.
  - *Alasan*: Menghapus 100% risiko gambar pecah seperti yang terjadi pada `source.unsplash.com` dan menjamin tampilan langsung memukau bahkan sebelum Admin mengunggah foto sendiri.
- **Keputusan 3: Skema Data Dinamis yang Kompatibel Mundur (*Backward-Compatible*)**
  - *Pendekatan Dipilih*: Mempertahankan seluruh kunci data lama di dokumen pengaturan global (`heroTitle`, `heroHighlight`, `heroSubtitle`, `stat1*`, `featuresCarousel*`, `problem*`, `solution*`, `s1*..s4*`) sambil menambahkan properti baru secara terstruktur (`heroImage`, `heroProofPoints`, `heroCtaPrimary`, `heroCtaSecondary`, `heroOverlayEnabled`, `heroOverlayCaption`, `partnersEnabled`, `partnersTitle`, `partners`, `bentoTitle`, `bentoSubtitle`, `bentoItems`, `pricingTitle`, `pricingSubtitle`, `ctaTitle`, `ctaSubtitle`, `ctaButtonText`, `footerDescription`, `footerInstagram`).
  - *Alasan*: Data yang sudah pernah disimpan Super Admin tidak hilang, dan bagian yang belum diisi otomatis jatuh ke konten *default* Guestly V2.5.2 yang sudah rapi.

---

## 4. Arsitektur Teknis & Strategi Data

### Diagram Arsitektur & Aliran Data

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                     PANEL SUPER ADMIN (Pengaturan Salespage)               │
│                                                                            │
│  ┌──────────────────────┐   ┌───────────────────────┐   ┌───────────────┐ │
│  │ Editor 7 Bagian      │   │ Input Gambar Ganda    │   │ Aksi Global   │ │
│  │ • Hero & CTA         │──▶│ • Upload File (Media) │   │ • Simpan      │ │
│  │ • Our Partner (CRUD) │   │ • Tempel URL          │   │ • Batal       │ │
│  │ • Statistik & Bento  │   │ • Preview & Hapus     │   │ • Reset       │ │
│  │ • Gelap/Alur/Footer  │   └───────────┬───────────┘   └───────┬───────┘ │
│  └──────────────────────┘               │                       │         │
└─────────────────────────────────────────┼───────────────────────┼─────────┘
                                          ▼                       ▼
                            ┌───────────────────────┐   ┌───────────────────┐
                            │ Layanan Upload Media  │   │ Pengaturan Global │
                            │ (Penyimpanan Aset +   │──▶│ (Dokumen settings │
                            │  URL Publik Instan)   │   │  -> salespage)    │
                            └───────────────────────┘   └─────────┬─────────┘
                                                                  │
                    Sinkronisasi Real-Time (SettingsContext)      │
                                                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         HALAMAN PUBLIK SALESPAGE                           │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ Layer Normalisasi & Fallback Default (Gabung Data DB + Default V2.5) │ │
│  └──────┬───────────────────┬─────────────────────┬─────────────────────┘ │
│         ▼                   ▼                     ▼                       │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────────────┐  │
│  │ Nav + Hero   │   │ Our Partner      │   │ Metric Strip + Bento      │  │
│  │ 2 Sisi + CTA │   │ Marquee Monokrom │   │ Fitur Asimetris           │  │
│  └──────────────┘   └──────────────────┘   └───────────────────────────┘  │
│         ▼                   ▼                     ▼                       │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────────────┐  │
│  │ Bab Gelap    │   │ Galeri Showcase  │   │ Pricing (DB services) +   │  │
│  │ Masalah/Alur │   │ Interaktif       │   │ Testimoni Slider + Footer │  │
│  └──────────────┘   └──────────────────┘   └───────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Model Data & Strategi Konfigurasi

- **Konfigurasi Tersentralisasi (`salespage` di Dokumen Pengaturan Global)**:
  - *Hero*: Judul, frasa sorotan, subjudul, gambar utama (URL/hasil upload), status & teks kartu sorotan opsional, 3 poin bukti konkret, teks tombol CTA utama & sekunder.
  - *Our Partner*: Toggle aktif/nonaktif, label judul, dan array objek mitra `{ id, name, logoUrl, websiteUrl }` yang dapat ditambah, diubah, dihapus, dan diurutkan.
  - *Statistik*: Mode data (gabung statistik nyata dari database atau angka kustom) + hingga 4 metrik `{ label, value, caption }`.
  - *Bento Fitur*: Judul & subjudul seksi + array item `{ id, category, title, description, imageUrl, span: 'wide' | 'normal' }`.
  - *Masalah, Solusi & Galeri*: Judul/poin masalah, gambar masalah (Upload/URL), judul/deskripsi solusi, serta daftar slide galeri `{ title, description, img, link }`.
  - *Alur Kerja, Harga, CTA & Footer*: Judul seksi & 4 langkah bernomor, tajuk bagian paket harga, isi banner CTA penutup, deskripsi footer, dan kontak publik (WhatsApp/Email/Instagram).
- **Sumber Data Live Lainnya**: Paket harga tetap dibaca langsung dari layanan aktif (`services`), ulasan dari koleksi `testimonials` lengkap dengan formulir kirim ulasan, dan statistik publik dari `publicStats`.

### Pemetaan Interaksi & State Komponen

- **Navigasi & Menu Mobile**: Tautan jangkar melakukan *smooth scroll* ke section yang valid; menu mobile membuka *drawer* ringkas dengan tinggi *sticky* header terkontrol ($\le 15\%$ tinggi layar mobile).
- **Our Partner Marquee**: Menduplikasi daftar logo secara otomatis saat aktif agar putaran animasi mulus tanpa jeda kosong; *pause* pada `:hover` dan `:focus-within`; otomatis non-gerak jika preferensi sistem `prefers-reduced-motion` aktif.
- **Galeri Showcase & Carousel Testimoni**: State indeks aktif terhubung ke tombol sebelumnya/berikutnya, klik tab/titik indikator, serta penanganan aman saat jumlah data sedikit (misalnya 1–3 item tidak memunculkan kontrol mati).
- **Pengamanan Gambar (*Zero-Broken-Image*)**: Setiap komponen gambar di Salespage memiliki handler `onError` yang beralih mulus ke tampilan *fallback* editorial yang selaras dengan warna tema, tanpa pernah merender ikon gambar rusak.
- **Validasi Editor Admin**: Validasi tipe berkas gambar & batas ukuran saat unggah, indikator status *loading* saat mengunggah maupun menyimpan, tombol *Batal* mengembalikan state tersimpan terakhir, dan *Reset ke Default* meminta konfirmasi sebelum menimpa draf editor.
