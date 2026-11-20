import heroReceptionDefault from '../assets/images/hero_wedding_reception_1795200341439.jpg';
import bentoQrCheckinDefault from '../assets/images/bento_qr_checkin_1795200341370.jpg';
import bentoWelcomeScreenDefault from '../assets/images/bento_welcome_screen_1795200341207.jpg';
import bentoSouvenirDefault from '../assets/images/bento_souvenir_station_1795200342134.jpg';
import darkBallroomDefault from '../assets/images/editorial_ballroom_dark_1795200341404.jpg';

export interface SalespagePartnerItem {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string;
}

export interface SalespageStatItem {
  label: string;
  value: string;
  caption: string;
}

export type SalespageVideoMode = 'autoplay' | 'click';
export type SalespageVideoFit = 'auto' | 'portrait' | 'contain' | 'cover';

export interface SalespageBentoItem {
  id: string;
  category: string;
  title: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  videoMode?: SalespageVideoMode;
  videoFit?: SalespageVideoFit;
  span: 'wide' | 'normal';
}

export interface SalespageCarouselItem {
  title: string;
  description?: string;
  img: string;
  videoUrl?: string;
  videoMode?: SalespageVideoMode;
  videoFit?: SalespageVideoFit;
  link?: string;
}

export interface SalespageStepItem {
  title: string;
  description: string;
}

export interface SalespageFaqItem {
  question: string;
  answer: string;
}

export interface SalespageConfig {
  // Hero Section
  heroLayout: 'split' | 'fullbg';
  heroBlurStyle: 'gradient' | 'card';
  heroBlurTone: 'dark' | 'light';
  heroKicker: string;
  heroTitle: string;
  heroHighlight: string;
  heroSubtitle: string;
  heroImage: string;
  heroVideoUrl: string;
  heroVideoMode: 'autoplay' | 'click';
  heroVideoFit: 'auto' | 'portrait' | 'contain' | 'cover';
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  heroProofPoints: string;
  heroOverlayEnabled: boolean;
  heroOverlayLabel: string;
  heroOverlayTitle: string;

  // Our Partner Section
  partnersEnabled: boolean;
  partnersTitle: string;
  partnersLogoSize: 'sm' | 'md' | 'lg';
  partners: SalespagePartnerItem[];

  // Stats Section
  statsUseLive: boolean;
  stat1Label: string;
  stat1Value: string;
  stat1Caption: string;
  stat2Label: string;
  stat2Value: string;
  stat2Caption: string;
  stat3Label: string;
  stat3Value: string;
  stat3Caption: string;
  stat4Label: string;
  stat4Value: string;
  stat4Caption: string;

  // Bento Features Section
  bentoKicker: string;
  bentoTitle: string;
  bentoSubtitle: string;
  bentoItems: SalespageBentoItem[];

  // Dark Luxury Problem, Solution & Steps Section
  darkSectionKicker: string;
  problemTitle: string;
  problemImage: string;
  problemVideoUrl: string;
  problemVideoMode: SalespageVideoMode;
  problemVideoFit: SalespageVideoFit;
  problemItems: string;
  solutionTitle: string;
  solutionDesc: string;
  stepsTitle: string;
  stepsSubtitle: string;
  s1Title: string;
  s1Desc: string;
  s2Title: string;
  s2Desc: string;
  s3Title: string;
  s3Desc: string;
  s4Title: string;
  s4Desc: string;

  // Interactive Showcase Gallery
  featuresCarouselTitle: string;
  featuresCarouselDesc: string;
  featuresCarouselData: SalespageCarouselItem[];

  // Pricing Section
  pricingKicker: string;
  pricingTitle: string;
  pricingSubtitle: string;
  pricingFootnote: string;

  // Testimonials Section
  testimonialsKicker: string;
  testimonialsTitle: string;

  // FAQ & Closing CTA
  faqTitle: string;
  faqItems: SalespageFaqItem[];
  ctaTitle: string;
  ctaDesc: string;
  ctaPrimaryText: string;
  ctaSecondaryText: string;

  // Footer
  footerDescription: string;
  footerEmail: string;
  footerPhone: string;
  footerAddress: string;
  footerInstagram: string;
  footerFacebook: string;
  footerYoutube: string;
}

export const SALESPAGE_DEFAULT_ASSETS = {
  hero: heroReceptionDefault,
  bentoQr: bentoQrCheckinDefault,
  bentoWelcome: bentoWelcomeScreenDefault,
  bentoSouvenir: bentoSouvenirDefault,
  darkBallroom: darkBallroomDefault,
};

export const DEFAULT_SALESPAGE_CONFIG: SalespageConfig = {
  heroLayout: 'split',
  heroBlurStyle: 'gradient',
  heroBlurTone: 'dark',
  heroKicker: 'Platform Buku Tamu Digital & Manajemen Resepsi',
  heroTitle: 'Sambut Setiap Tamu dengan Rapi, Cepat & Berkelas',
  heroHighlight: 'Cepat & Berkelas',
  heroSubtitle:
    'Dari check-in QR kurang dari satu detik, mode offline anti-sinyal gedung, layar sapa TV VIP, hingga kontrol stok souvenir dan wedding planner dalam satu ekosistem terpadu.',
  heroImage: heroReceptionDefault,
  heroVideoUrl: '',
  heroVideoMode: 'click',
  heroVideoFit: 'auto',
  heroCtaPrimary: 'Mulai Gratis Sekarang',
  heroCtaSecondary: 'Pelajari Alur Kerja',
  heroProofPoints: 'Scan QR < 1 Detik\nMode Offline Ballroom\nLayar Sapa TV & Souvenir QR',
  heroOverlayEnabled: true,
  heroOverlayLabel: 'Operasional Hari-H',
  heroOverlayTitle: 'Check-in tamu, layar sapa VIP & audit souvenir sinkron otomatis.',

  partnersEnabled: true,
  partnersTitle: 'Dipercaya oleh Wedding Organizer, Venue & Event Planner Pilihan',
  partnersLogoSize: 'md',
  partners: [
    { id: 'p-1', name: 'Aurelia Ballroom', logoUrl: '' },
    { id: 'p-2', name: 'Nusantara Wedding House', logoUrl: '' },
    { id: 'p-3', name: 'Maison de Fête WO', logoUrl: '' },
    { id: 'p-4', name: 'Kencana Grand Hall', logoUrl: '' },
    { id: 'p-5', name: 'Svara Event Production', logoUrl: '' },
    { id: 'p-6', name: 'Loka Heritage Venue', logoUrl: '' },
  ],

  statsUseLive: false,
  stat1Label: 'Acara Terkelola',
  stat1Value: '1.200+',
  stat1Caption: 'Resepsi, gala & korporat',
  stat2Label: 'Tamu Check-In',
  stat2Value: '180.000+',
  stat2Caption: 'Tercatat presisi real-time',
  stat3Label: 'Kecepatan Scan',
  stat3Value: '< 1 dtk',
  stat3Caption: 'Kamera & barcode scanner',
  stat4Label: 'Keandalan Gedung',
  stat4Value: '100% Offline',
  stat4Caption: 'Sinkron otomatis saat online',

  bentoKicker: 'Kapabilitas Utama',
  bentoTitle: 'Dirancang untuk Standar Operasional Resepsi Sesungguhnya',
  bentoSubtitle:
    'Bukan sekadar daftar hadir. Setiap modul Guestly menjawab tantangan nyata tim resepsi di meja penerima tamu hingga laporan akhir acara.',
  bentoItems: [
    {
      id: 'bento-qr',
      category: 'Gate & Check-In',
      title: 'QR Check-In Ultra Cepat dengan Mode Offline Ballroom',
      description:
        'Mendukung kamera HP, tablet, dan alat barcode scanner USB/Bluetooth. Sinyal basement atau gedung hilang? Data check-in tersimpan lokal dan otomatis sinkron begitu koneksi kembali.',
      imageUrl: bentoQrCheckinDefault,
      span: 'wide',
    },
    {
      id: 'bento-tv',
      category: 'Pengalaman VIP',
      title: 'Layar Sapa TV Real-Time',
      description:
        'Begitu tamu VIP atau VVIP dipindai di pintu masuk, nama dan ucapan selamat datang tampil otomatis di layar TV foyer dengan tipografi elegan.',
      imageUrl: bentoWelcomeScreenDefault,
      span: 'normal',
    },
    {
      id: 'bento-souvenir',
      category: 'Logistik & Audit',
      title: 'Manajemen Souvenir & Stiker QR Batch PDF',
      description:
        'Cetak stiker QR fisik hemat kertas untuk setiap kategori souvenir. Scan sekali langsung memotong stok dengan proteksi anti-double-scan serta berita acara Excel & PDF.',
      imageUrl: bentoSouvenirDefault,
      span: 'normal',
    },
    {
      id: 'bento-wa',
      category: 'Komunikasi & Otomasi',
      title: 'E-Invitation WhatsApp & Pengingat Tugas Staff Otomatis',
      description:
        'Kirim undangan digital personal lengkap dengan QR unik, konfirmasi RSVP otomatis, hingga pengingat jadwal H-3, H-1, dan pagi Hari-H ke seluruh staf dan grup WhatsApp panitia.',
      imageUrl: '',
      span: 'normal',
    },
    {
      id: 'bento-planner',
      category: 'Perencanaan Terpadu',
      title: 'Wedding Planner 6 Modul dalam Satu Dashboard',
      description:
        'Kelola anggaran, daftar vendor, rundown acara, checklist persiapan, susunan panitia, hingga pembagian tugas tim tanpa berpindah-pindah spreadsheet.',
      imageUrl: '',
      span: 'normal',
    },
  ],

  darkSectionKicker: 'Transformasi Operasional',
  problemTitle: 'Tinggalkan Antrean Panjang & Buku Tamu Kertas yang Rentan Selisih',
  problemImage: darkBallroomDefault,
  problemVideoUrl: '',
  problemVideoMode: 'click',
  problemVideoFit: 'auto',
  problemItems:
    'Antrean menumpuk di pintu masuk karena tamu menulis manual\nTulisan tangan sulit dibaca saat rekap daftar hadir & ucapan\nStok souvenir dan angpau sering selisih tanpa catatan serah terima\nKoordinasi kedatangan tamu VIP terlambat sampai ke MC & penerima tamu',
  solutionTitle: 'Satu Sistem Tenang untuk Tim yang Bekerja Tanpa Panik',
  solutionDesc:
    'Guestly menyatukan seluruh titik operasional resepsi—meja registrasi, layar sapa foyer, stasiun souvenir, hingga laporan akhir—dalam alur kerja yang ringan dipahami tim lapangan dalam 5 menit.',
  stepsTitle: 'Empat Langkah Menuju Hari-H yang Terkendali',
  stepsSubtitle: 'Alur persiapan ringkas yang dirancang mengikuti ritme kerja Wedding Organizer dan panitia keluarga.',
  s1Title: 'Impor Daftar Tamu & Kategori',
  s1Desc: 'Unggah data tamu dari Excel dalam hitungan detik, tentukan kategori Reguler, VIP, atau VVIP beserta kuota pendamping.',
  s2Title: 'Kirim Undangan & QR Personal',
  s2Desc: 'Bagikan tautan undangan digital berisi QR Code eksklusif via WhatsApp dan pantau konfirmasi RSVP secara real-time.',
  s3Title: 'Scan Cepat di Meja Registrasi',
  s3Desc: 'Tim lapangan cukup memindai QR tamu atau stiker souvenir. Layar sapa TV dan penghitung kehadiran langsung diperbarui.',
  s4Title: 'Unduh Laporan & Berita Acara',
  s4Desc: 'Selesai acara, ekspor rekap kehadiran, daftar ucapan, dan audit trail keluar-masuk souvenir ke format Excel atau PDF rapi.',

  featuresCarouselTitle: 'Pratinjau Alur Kerja & Tampilan Lapangan',
  featuresCarouselDesc:
    'Lihat bagaimana setiap bagian Guestly bekerja harmonis mulai dari persiapan undangan, penyambutan di foyer, hingga serah terima souvenir.',
  featuresCarouselData: [
    {
      title: 'Registrasi QR & Pencarian Instan',
      description:
        'Tamu cukup menunjukkan QR di ponsel; untuk tamu tanpa QR, staf dapat mencari nama dalam sekejap tanpa menghambat antrean.',
      img: bentoQrCheckinDefault,
      link: '',
    },
    {
      title: 'Layar Sapa TV Foyer VIP & VVIP',
      description:
        'Sambutan personal berskala layar penuh di pintu ballroom yang langsung memberi tahu MC dan keluarga saat tamu kehormatan tiba.',
      img: bentoWelcomeScreenDefault,
      link: '',
    },
    {
      title: 'Kontrol Souvenir dengan QR Stiker Fisik',
      description:
        'Setiap paket souvenir terpantau transparan dengan rekap terpisah antara pengambilan via tamu dan scan stiker QR fisik.',
      img: bentoSouvenirDefault,
      link: '',
    },
  ],

  pricingKicker: 'Investasi Transparan',
  pricingTitle: 'Pilih Paket Sesuai Skala Acara Anda',
  pricingSubtitle:
    'Tanpa biaya tersembunyi. Mulai dari acara intimate hingga grand ballroom dengan fleksibilitas upgrade kapan saja.',
  pricingFootnote: 'Seluruh paket dapat di-upgrade kapan saja sebelum hari acara berlangsung.',

  testimonialsKicker: 'Cerita Pengguna',
  testimonialsTitle: 'Dipilih oleh Mereka yang Mengutamakan Kerapian Acara',

  faqTitle: 'Pertanyaan yang Sering Diajukan',
  faqItems: [
    {
      question: 'Apakah tim resepsi harus menginstal aplikasi khusus?',
      answer:
        'Tidak perlu. Guestly berjalan langsung melalui browser di laptop, tablet, maupun smartphone dan tetap mendukung alat scanner barcode USB/Bluetooth.',
    },
    {
      question: 'Bagaimana jika sinyal internet di dalam ballroom tidak stabil?',
      answer:
        'Guestly dilengkapi Mode Offline Ballroom. Data check-in dan scan souvenir disimpan aman di perangkat lalu disinkronkan otomatis ke cloud saat koneksi kembali pulih.',
    },
    {
      question: 'Apakah tamu wajib membawa atau menunjukkan QR Code?',
      answer:
        'Tidak wajib. Jika tamu lupa membawa undangan QR, petugas dapat langsung mencari nama tamu secara manual atau menambah tamu on-the-spot dalam beberapa detik.',
    },
    {
      question: 'Apakah daftar tamu dalam jumlah besar bisa diimpor dari Excel?',
      answer:
        'Bisa. Tersedia template impor Excel untuk memasukkan ratusan hingga ribuan tamu lengkap dengan kategori VIP, sesi acara, dan nomor WhatsApp sekaligus.',
    },
    {
      question: 'Apakah keamanan data tamu dan acara terjamin?',
      answer:
        'Seluruh data dienkripsi dengan kontrol akses per akun dan per peran staf, termasuk pencatatan riwayat log untuk setiap aktivitas penting.',
    },
  ],

  ctaTitle: 'Siap Menghadirkan Resepsi yang Lebih Tenang & Berkelas?',
  ctaDesc:
    'Buat akun gratis sekarang untuk mencoba seluruh alur manajemen tamu, atau diskusikan kebutuhan acara Anda bersama tim kami.',
  ctaPrimaryText: 'Mulai Gratis Sekarang',
  ctaSecondaryText: 'Konsultasi via WhatsApp',

  footerDescription:
    'Platform buku tamu digital, QR check-in offline, layar sapa TV, manajemen souvenir, dan wedding planner untuk acara yang rapi dan berkesan.',
  footerEmail: 'support@guestly.id',
  footerPhone: '085158636606',
  footerAddress: 'Semarang, Indonesia',
  footerInstagram: '',
  footerFacebook: '',
  footerYoutube: '',
};

const isBrokenLegacyUrl = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return (
    trimmed.includes('source.unsplash.com') ||
    trimmed.includes('pravatar.cc') ||
    trimmed.includes('queinvite.yulovi.com/wp-content/uploads/2026/06/cowo.webp')
  );
};

export function resolveSalespageConfig(raw?: Record<string, any> | null): SalespageConfig {
  const src = raw && typeof raw === 'object' ? raw : {};

  const pickString = (key: keyof SalespageConfig, fallback: string): string => {
    const val = src[key];
    if (typeof val === 'string' && val.trim() !== '') {
      return val;
    }
    return fallback;
  };

  const pickImage = (key: keyof SalespageConfig, fallback: string): string => {
    const val = src[key];
    if (typeof val === 'string' && val.trim() !== '' && !isBrokenLegacyUrl(val)) {
      return val.trim();
    }
    return fallback;
  };

  const partners: SalespagePartnerItem[] = Array.isArray(src.partners)
    ? src.partners
        .filter((p: any) => p && (typeof p.name === 'string' || typeof p.logoUrl === 'string'))
        .map((p: any, idx: number) => ({
          id: p.id || `partner-${idx}`,
          name: (p.name || '').trim(),
          logoUrl: isBrokenLegacyUrl(p.logoUrl) ? '' : (p.logoUrl || '').trim(),
          websiteUrl: (p.websiteUrl || '').trim(),
        }))
        .filter((p: SalespagePartnerItem) => p.name || p.logoUrl)
    : DEFAULT_SALESPAGE_CONFIG.partners;

  const defaultBentoImageById: Record<string, string> = {
    'bento-qr': bentoQrCheckinDefault,
    'bento-tv': bentoWelcomeScreenDefault,
    'bento-souvenir': bentoSouvenirDefault,
  };

  const normalizeVideoFit = (val: any): SalespageVideoFit =>
    val === 'portrait' || val === 'contain' || val === 'cover' ? val : 'auto';

  const bentoItems: SalespageBentoItem[] =
    Array.isArray(src.bentoItems) && src.bentoItems.length > 0
      ? src.bentoItems.map((item: any, idx: number) => {
          const itemId = item.id || `bento-${idx}`;
          const rawImg = isBrokenLegacyUrl(item.imageUrl) ? '' : (item.imageUrl || '').trim();
          return {
            id: itemId,
            category: item.category || 'Fitur',
            title: item.title || '',
            description: item.description || '',
            imageUrl: rawImg || defaultBentoImageById[itemId] || '',
            videoUrl: typeof item.videoUrl === 'string' ? item.videoUrl.trim() : '',
            videoMode: item.videoMode === 'autoplay' ? 'autoplay' : 'click',
            videoFit: normalizeVideoFit(item.videoFit),
            span: item.span === 'wide' ? 'wide' : 'normal',
          };
        })
      : DEFAULT_SALESPAGE_CONFIG.bentoItems;

  const featuresCarouselData: SalespageCarouselItem[] =
    Array.isArray(src.featuresCarouselData) && src.featuresCarouselData.length > 0
      ? src.featuresCarouselData.map((item: any, idx: number) => {
          const defaultSlideImg =
            DEFAULT_SALESPAGE_CONFIG.featuresCarouselData[idx % DEFAULT_SALESPAGE_CONFIG.featuresCarouselData.length]
              ?.img || bentoQrCheckinDefault;
          const rawImg = isBrokenLegacyUrl(item.img) ? '' : (item.img || '').trim();
          return {
            title: item.title || `Fitur ${idx + 1}`,
            description: item.description || '',
            img: rawImg || defaultSlideImg,
            videoUrl: typeof item.videoUrl === 'string' ? item.videoUrl.trim() : '',
            videoMode: item.videoMode === 'autoplay' ? 'autoplay' : 'click',
            videoFit: normalizeVideoFit(item.videoFit),
            link: (item.link || '').trim(),
          };
        })
      : DEFAULT_SALESPAGE_CONFIG.featuresCarouselData;

  const faqItems: SalespageFaqItem[] =
    Array.isArray(src.faqItems) && src.faqItems.length > 0
      ? src.faqItems
          .filter((item: any) => item && (item.question || item.answer))
          .map((item: any) => ({
            question: item.question || '',
            answer: item.answer || '',
          }))
      : DEFAULT_SALESPAGE_CONFIG.faqItems;

  return {
    heroLayout: src.heroLayout === 'fullbg' ? 'fullbg' : 'split',
    heroBlurStyle: src.heroBlurStyle === 'card' ? 'card' : 'gradient',
    heroBlurTone: src.heroBlurTone === 'light' ? 'light' : 'dark',
    heroKicker: pickString('heroKicker', DEFAULT_SALESPAGE_CONFIG.heroKicker),
    heroTitle: pickString('heroTitle', DEFAULT_SALESPAGE_CONFIG.heroTitle),
    heroHighlight: typeof src.heroHighlight === 'string' ? src.heroHighlight : DEFAULT_SALESPAGE_CONFIG.heroHighlight,
    heroSubtitle: pickString('heroSubtitle', DEFAULT_SALESPAGE_CONFIG.heroSubtitle),
    heroImage: pickImage('heroImage', DEFAULT_SALESPAGE_CONFIG.heroImage),
    heroVideoUrl: typeof src.heroVideoUrl === 'string' ? src.heroVideoUrl.trim() : '',
    heroVideoMode: src.heroVideoMode === 'autoplay' ? 'autoplay' : 'click',
    heroVideoFit:
      src.heroVideoFit === 'portrait' ||
      src.heroVideoFit === 'contain' ||
      src.heroVideoFit === 'cover'
        ? src.heroVideoFit
        : 'auto',
    heroCtaPrimary: pickString('heroCtaPrimary', DEFAULT_SALESPAGE_CONFIG.heroCtaPrimary),
    heroCtaSecondary: pickString('heroCtaSecondary', DEFAULT_SALESPAGE_CONFIG.heroCtaSecondary),
    heroProofPoints: pickString('heroProofPoints', DEFAULT_SALESPAGE_CONFIG.heroProofPoints),
    heroOverlayEnabled:
      typeof src.heroOverlayEnabled === 'boolean'
        ? src.heroOverlayEnabled
        : DEFAULT_SALESPAGE_CONFIG.heroOverlayEnabled,
    heroOverlayLabel: pickString('heroOverlayLabel', DEFAULT_SALESPAGE_CONFIG.heroOverlayLabel),
    heroOverlayTitle: pickString('heroOverlayTitle', DEFAULT_SALESPAGE_CONFIG.heroOverlayTitle),

    partnersEnabled:
      typeof src.partnersEnabled === 'boolean' ? src.partnersEnabled : DEFAULT_SALESPAGE_CONFIG.partnersEnabled,
    partnersTitle: pickString('partnersTitle', DEFAULT_SALESPAGE_CONFIG.partnersTitle),
    partnersLogoSize:
      src.partnersLogoSize === 'sm' || src.partnersLogoSize === 'lg' ? src.partnersLogoSize : 'md',
    partners,

    statsUseLive: typeof src.statsUseLive === 'boolean' ? src.statsUseLive : DEFAULT_SALESPAGE_CONFIG.statsUseLive,
    stat1Label: pickString('stat1Label', DEFAULT_SALESPAGE_CONFIG.stat1Label),
    stat1Value: pickString('stat1Value', DEFAULT_SALESPAGE_CONFIG.stat1Value),
    stat1Caption: pickString('stat1Caption', DEFAULT_SALESPAGE_CONFIG.stat1Caption),
    stat2Label: pickString('stat2Label', DEFAULT_SALESPAGE_CONFIG.stat2Label),
    stat2Value: pickString('stat2Value', DEFAULT_SALESPAGE_CONFIG.stat2Value),
    stat2Caption: pickString('stat2Caption', DEFAULT_SALESPAGE_CONFIG.stat2Caption),
    stat3Label: pickString('stat3Label', DEFAULT_SALESPAGE_CONFIG.stat3Label),
    stat3Value: pickString('stat3Value', DEFAULT_SALESPAGE_CONFIG.stat3Value),
    stat3Caption: pickString('stat3Caption', DEFAULT_SALESPAGE_CONFIG.stat3Caption),
    stat4Label: pickString('stat4Label', DEFAULT_SALESPAGE_CONFIG.stat4Label),
    stat4Value: pickString('stat4Value', DEFAULT_SALESPAGE_CONFIG.stat4Value),
    stat4Caption: pickString('stat4Caption', DEFAULT_SALESPAGE_CONFIG.stat4Caption),

    bentoKicker: pickString('bentoKicker', DEFAULT_SALESPAGE_CONFIG.bentoKicker),
    bentoTitle: pickString('bentoTitle', DEFAULT_SALESPAGE_CONFIG.bentoTitle),
    bentoSubtitle: pickString('bentoSubtitle', DEFAULT_SALESPAGE_CONFIG.bentoSubtitle),
    bentoItems,

    darkSectionKicker: pickString('darkSectionKicker', DEFAULT_SALESPAGE_CONFIG.darkSectionKicker),
    problemTitle: pickString('problemTitle', DEFAULT_SALESPAGE_CONFIG.problemTitle),
    problemImage: pickImage('problemImage', DEFAULT_SALESPAGE_CONFIG.problemImage),
    problemVideoUrl: typeof src.problemVideoUrl === 'string' ? src.problemVideoUrl.trim() : '',
    problemVideoMode: src.problemVideoMode === 'autoplay' ? 'autoplay' : 'click',
    problemVideoFit: normalizeVideoFit(src.problemVideoFit),
    problemItems: pickString('problemItems', DEFAULT_SALESPAGE_CONFIG.problemItems),
    solutionTitle: pickString('solutionTitle', DEFAULT_SALESPAGE_CONFIG.solutionTitle),
    solutionDesc: pickString('solutionDesc', DEFAULT_SALESPAGE_CONFIG.solutionDesc),
    stepsTitle: pickString('stepsTitle', DEFAULT_SALESPAGE_CONFIG.stepsTitle),
    stepsSubtitle: pickString('stepsSubtitle', DEFAULT_SALESPAGE_CONFIG.stepsSubtitle),
    s1Title: pickString('s1Title', DEFAULT_SALESPAGE_CONFIG.s1Title),
    s1Desc: pickString('s1Desc', DEFAULT_SALESPAGE_CONFIG.s1Desc),
    s2Title: pickString('s2Title', DEFAULT_SALESPAGE_CONFIG.s2Title),
    s2Desc: pickString('s2Desc', DEFAULT_SALESPAGE_CONFIG.s2Desc),
    s3Title: pickString('s3Title', DEFAULT_SALESPAGE_CONFIG.s3Title),
    s3Desc: pickString('s3Desc', DEFAULT_SALESPAGE_CONFIG.s3Desc),
    s4Title: pickString('s4Title', DEFAULT_SALESPAGE_CONFIG.s4Title),
    s4Desc: pickString('s4Desc', DEFAULT_SALESPAGE_CONFIG.s4Desc),

    featuresCarouselTitle: pickString('featuresCarouselTitle', DEFAULT_SALESPAGE_CONFIG.featuresCarouselTitle),
    featuresCarouselDesc: pickString('featuresCarouselDesc', DEFAULT_SALESPAGE_CONFIG.featuresCarouselDesc),
    featuresCarouselData,

    pricingKicker: pickString('pricingKicker', DEFAULT_SALESPAGE_CONFIG.pricingKicker),
    pricingTitle: pickString('pricingTitle', DEFAULT_SALESPAGE_CONFIG.pricingTitle),
    pricingSubtitle: pickString('pricingSubtitle', DEFAULT_SALESPAGE_CONFIG.pricingSubtitle),
    pricingFootnote: pickString('pricingFootnote', DEFAULT_SALESPAGE_CONFIG.pricingFootnote),

    testimonialsKicker: pickString('testimonialsKicker', DEFAULT_SALESPAGE_CONFIG.testimonialsKicker),
    testimonialsTitle: pickString('testimonialsTitle', DEFAULT_SALESPAGE_CONFIG.testimonialsTitle),

    faqTitle: pickString('faqTitle', DEFAULT_SALESPAGE_CONFIG.faqTitle),
    faqItems,
    ctaTitle: pickString('ctaTitle', DEFAULT_SALESPAGE_CONFIG.ctaTitle),
    ctaDesc: pickString('ctaDesc', DEFAULT_SALESPAGE_CONFIG.ctaDesc),
    ctaPrimaryText: pickString('ctaPrimaryText', DEFAULT_SALESPAGE_CONFIG.ctaPrimaryText),
    ctaSecondaryText: pickString('ctaSecondaryText', DEFAULT_SALESPAGE_CONFIG.ctaSecondaryText),

    footerDescription: pickString('footerDescription', DEFAULT_SALESPAGE_CONFIG.footerDescription),
    footerEmail: pickString('footerEmail', DEFAULT_SALESPAGE_CONFIG.footerEmail),
    footerPhone: pickString('footerPhone', DEFAULT_SALESPAGE_CONFIG.footerPhone),
    footerAddress: pickString('footerAddress', DEFAULT_SALESPAGE_CONFIG.footerAddress),
    footerInstagram: typeof src.footerInstagram === 'string' ? src.footerInstagram.trim() : '',
    footerFacebook: typeof src.footerFacebook === 'string' ? src.footerFacebook.trim() : '',
    footerYoutube: typeof src.footerYoutube === 'string' ? src.footerYoutube.trim() : '',
  };
}
