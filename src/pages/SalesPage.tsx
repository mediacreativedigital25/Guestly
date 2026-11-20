import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Instagram,
  Facebook,
  Youtube,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Play,
  Star,
  X,
} from 'lucide-react';
import { collection, query, getDocs, where, addDoc, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GuestlyService, Testimonial } from '../types';
import { useSettings } from '../SettingsContext';
import {
  SALESPAGE_DEFAULT_ASSETS,
  SalespagePartnerItem,
  resolveSalespageConfig,
} from '../lib/salespageDefaults';
import {
  HeroMediaSurface,
  HeroVideoFitMode,
  HeroVideoLightbox,
  parseHeroVideoUrl,
} from '../components/salespage/HeroMediaStage';

interface ResilientImageProps {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  fallbackSrc,
  alt,
  className = '',
  fallbackLabel,
}) => {
  const [activeSrc, setActiveSrc] = useState<string>(src || fallbackSrc || '');
  const [failedAll, setFailedAll] = useState<boolean>(!(src || fallbackSrc));

  useEffect(() => {
    const next = src || fallbackSrc || '';
    setActiveSrc(next);
    setFailedAll(!next);
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (fallbackSrc && activeSrc !== fallbackSrc) {
      setActiveSrc(fallbackSrc);
    } else {
      setFailedAll(true);
    }
  };

  if (failedAll || !activeSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F4EEF0] via-[#FAF8F6] to-[#EDE4E7] text-[#6F5C63] p-6 text-center ${className}`}
      >
        <span className="text-base font-semibold tracking-tight text-[#8C3A50]">
          {fallbackLabel || alt || 'Guestly'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
    />
  );
};

const PARTNER_LOGO_SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-14 sm:h-16 lg:h-20 max-w-[180px] sm:max-w-[210px]',
  md: 'h-20 sm:h-24 lg:h-28 max-w-[230px] sm:max-w-[280px]',
  lg: 'h-24 sm:h-30 lg:h-36 max-w-[270px] sm:max-w-[330px]',
};

const PartnerLogoTile: React.FC<{
  partner: SalespagePartnerItem;
  size?: 'sm' | 'md' | 'lg';
}> = ({ partner, size = 'md' }) => {
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [partner.logoUrl]);

  const sizeClass = PARTNER_LOGO_SIZE_CLASSES[size] || PARTNER_LOGO_SIZE_CLASSES.md;

  const content =
    partner.logoUrl && !logoError ? (
      <img
        src={partner.logoUrl}
        alt={partner.name || 'Mitra Guestly'}
        referrerPolicy="no-referrer"
        onError={() => setLogoError(true)}
        className={`${sizeClass} w-auto object-contain grayscale opacity-85 contrast-115 group-hover:grayscale-0 group-hover:opacity-100 group-hover:contrast-100 transition-all duration-200`}
      />
    ) : (
      <span className="text-[16px] sm:text-[18px] font-semibold tracking-[-0.015em] text-[#5C5559]/75 group-hover:text-[#8C3A50] transition-colors duration-200 whitespace-nowrap px-3">
        {partner.name}
      </span>
    );

  if (partner.websiteUrl) {
    return (
      <a
        href={partner.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={partner.name}
        className="group inline-flex items-center justify-center px-3 sm:px-5 py-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C3A50]/40 rounded-lg"
      >
        {content}
      </a>
    );
  }

  return (
    <div
      title={partner.name}
      className="group inline-flex items-center justify-center px-3 sm:px-5 py-1 shrink-0 select-none"
    >
      {content}
    </div>
  );
};

const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    id: 'default-t1',
    name: 'Nadia Kusuma',
    role: 'Lead Planner, Maison Wedding Organizer',
    content:
      'Resepsi 1.200 tamu di ballroom basement sebelumnya selalu terkendala sinyal. Sejak memakai Mode Offline dan QR Scanner Guestly, antrean meja registrasi tuntas dalam hitungan detik tanpa satu pun data yang hilang.',
    rating: 5,
    status: 'approved',
    createdAt: null,
  },
  {
    id: 'default-t2',
    name: 'Raka Pratama',
    role: 'Event Director, Kencana Production',
    content:
      'Layar Sapa TV VIP dan sistem Stiker QR Souvenir sangat membantu tim lapangan kami. Akhir acara, laporan kehadiran dan berita acara stok souvenir bisa langsung kami serahkan ke keluarga klien.',
    rating: 5,
    status: 'approved',
    createdAt: null,
  },
  {
    id: 'default-t3',
    name: 'Dimas & Laras',
    role: 'Pengantin, Grand Ballroom Semarang',
    content:
      'Dari undangan WhatsApp personal, pantauan RSVP, hingga modul Wedding Planner untuk anggaran dan vendor semuanya rapi di satu tempat. Hari pernikahan terasa jauh lebih tenang.',
    rating: 5,
    status: 'approved',
    createdAt: null,
  },
];

function getInitials(name?: string): string {
  const parts = (name || 'G')
    .replace(/&/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'G';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatWhatsAppUrl(phoneRaw?: string, prefill?: string): string {
  const digits = (phoneRaw || '6285158636606').replace(/[^0-9]/g, '');
  const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : digits || '6285158636606';
  const text = encodeURIComponent(
    prefill || 'Halo Tim Guestly, saya ingin berkonsultasi mengenai paket buku tamu digital untuk acara kami.'
  );
  return `https://wa.me/${normalized}?text=${text}`;
}

export default function SalesPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const cfg = useMemo(() => resolveSalespageConfig(settings?.salespage), [settings?.salespage]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [services, setServices] = useState<GuestlyService[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const pricingSliderRef = useRef<HTMLDivElement>(null);

  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loadingTesti, setLoadingTesti] = useState(true);
  const [testiPage, setTestiPage] = useState(0);

  // Interactive Showcase Slide state
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Open FAQ index state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Testimonial Submission Modal state
  const [isTestiModalOpen, setIsTestiModalOpen] = useState(false);
  const [testiForm, setTestiForm] = useState({ name: '', role: '', content: '', rating: 5 });
  const [submittingTesti, setSubmittingTesti] = useState(false);
  const [testiSuccess, setTestiSuccess] = useState(false);
  const [testiError, setTestiError] = useState<string | null>(null);

  // Shared Video Lightbox Modal state (Hero, Bento, Problem, Gallery)
  const [activeVideoModal, setActiveVideoModal] = useState<{
    url: string;
    poster: string;
    fit?: HeroVideoFitMode;
    title?: string;
  } | null>(null);

  const openHeroVideoModal = () =>
    setActiveVideoModal({
      url: cfg.heroVideoUrl,
      poster: cfg.heroImage || SALESPAGE_DEFAULT_ASSETS.hero,
      fit: cfg.heroVideoFit,
      title: 'Video Preview Guestly',
    });

  // Live Stats from Firestore
  const [realStats, setRealStats] = useState<{ totalEvents: number; totalGuests: number } | null>(null);

  useEffect(() => {
    const fetchClientServices = async () => {
      try {
        const servicesRef = collection(db, 'services');
        const q = query(servicesRef, where('isActive', '==', true));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as GuestlyService));
        const clientPackages = data
          .filter((s) => (s.targetRole === 'client' || s.targetRole === 'all') && s.type === 'package')
          .sort((a, b) => a.price - b.price);

        if (clientPackages.length > 0) {
          setServices(clientPackages);
        } else {
          throw new Error('No client packages');
        }
      } catch {
        setServices([
          {
            id: 'basic',
            name: 'Basic',
            description:
              'Untuk acara intimate & keluarga\n- Undangan Digital & QR Personal\n- Kelola Tamu & RSVP Real-Time\n- Laporan Kehadiran Dasar\n- Ekspor Excel',
            type: 'package',
            targetRole: 'client',
            price: 99000,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'pro',
            name: 'Pro',
            description:
              'Untuk resepsi menengah & ballroom\n- Semua Fitur Basic\n- QR Check-In & Mode Offline\n- Layar Sapa TV VIP/VVIP\n- Manajemen Souvenir & Stiker QR\n- Ekspor PDF & Excel Lengkap',
            type: 'package',
            targetRole: 'client',
            price: 199000,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'premium',
            name: 'Premium',
            description:
              'Untuk Wedding Organizer & Grand Event\n- Semua Fitur Pro\n- Multi Event & Wedding Planner 6 Modul\n- Pengingat Otomatis WhatsApp Staff\n- Custom Domain Undangan\n- Dukungan Prioritas Dedicated',
            type: 'package',
            targetRole: 'client',
            price: 399000,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      } finally {
        setLoadingServices(false);
      }
    };

    const fetchTestimonials = async () => {
      try {
        const q = query(collection(db, 'testimonials'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as Testimonial))
          .filter((t) => !t.status || t.status === 'approved');
        data.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setTestimonials(data);
      } catch {
        setTestimonials([]);
      } finally {
        setLoadingTesti(false);
      }
    };

    const fetchStats = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'publicStats'));
        if (docSnap.exists()) {
          const d = docSnap.data();
          setRealStats({
            totalEvents: Number(d.totalEvents) || 0,
            totalGuests: Number(d.totalGuests) || 0,
          });
        }
      } catch {
        // Silently fall back to configured values
      }
    };

    fetchStats();
    fetchClientServices();
    fetchTestimonials();
  }, []);

  useEffect(() => {
    if (activeSlideIndex >= cfg.featuresCarouselData.length && cfg.featuresCarouselData.length > 0) {
      setActiveSlideIndex(0);
    }
  }, [cfg.featuresCarouselData.length, activeSlideIndex]);

  const displayedTestimonials = testimonials.length > 0 ? testimonials : FALLBACK_TESTIMONIALS;
  const TESTI_PER_PAGE = 3;
  const totalTestiPages = Math.max(1, Math.ceil(displayedTestimonials.length / TESTI_PER_PAGE));
  const safeTestiPage = Math.min(testiPage, totalTestiPages - 1);
  const visibleTestimonials = displayedTestimonials.slice(
    safeTestiPage * TESTI_PER_PAGE,
    safeTestiPage * TESTI_PER_PAGE + TESTI_PER_PAGE
  );

  const handleSubmitTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestiError(null);
    if (!testiForm.name.trim() || !testiForm.content.trim()) {
      setTestiError('Mohon lengkapi nama dan ulasan Anda sebelum mengirim.');
      return;
    }

    setSubmittingTesti(true);
    try {
      const payload = {
        name: testiForm.name.trim(),
        role: testiForm.role.trim() || 'Klien Guestly',
        content: testiForm.content.trim(),
        rating: testiForm.rating,
        status: 'approved' as const,
        createdAt: new Date(),
      };
      const addedRef = await addDoc(collection(db, 'testimonials'), payload);
      setTestimonials((prev) => [{ id: addedRef.id, ...payload }, ...prev]);
      setTestiPage(0);
      setTestiSuccess(true);
      setTestiForm({ name: '', role: '', content: '', rating: 5 });
      setTimeout(() => {
        setIsTestiModalOpen(false);
        setTestiSuccess(false);
      }, 2200);
    } catch {
      setTestiError('Gagal mengirim ulasan saat ini. Silakan coba beberapa saat lagi.');
    } finally {
      setSubmittingTesti(false);
    }
  };

  const scrollPricing = (direction: 'left' | 'right') => {
    if (!pricingSliderRef.current) return;
    const step = Math.min(340, Math.max(260, Math.round(pricingSliderRef.current.clientWidth * 0.85)));
    pricingSliderRef.current.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  const renderHeroHeadline = (accentClass = 'text-[#8C3A50]') => {
    const title = cfg.heroTitle;
    const highlight = cfg.heroHighlight.trim();
    if (!highlight || !title.includes(highlight)) {
      return title;
    }
    const idx = title.indexOf(highlight);
    const before = title.slice(0, idx);
    const after = title.slice(idx + highlight.length);
    return (
      <>
        {before}
        <span className={accentClass}>{highlight}</span>
        {after}
      </>
    );
  };

  const hasHeroVideo = parseHeroVideoUrl(cfg.heroVideoUrl).type !== 'none';
  const isFullBgHero = cfg.heroLayout === 'fullbg';
  const isDarkFrosted = cfg.heroBlurTone === 'dark';

  const proofPoints = cfg.heroProofPoints
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const problemLines = cfg.problemItems
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const statItems = [
    {
      value:
        cfg.statsUseLive && realStats && realStats.totalEvents > 0
          ? `${realStats.totalEvents.toLocaleString('id-ID')}+`
          : cfg.stat1Value,
      label: cfg.stat1Label,
      caption: cfg.stat1Caption,
    },
    {
      value:
        cfg.statsUseLive && realStats && realStats.totalGuests > 0
          ? `${realStats.totalGuests.toLocaleString('id-ID')}+`
          : cfg.stat2Value,
      label: cfg.stat2Label,
      caption: cfg.stat2Caption,
    },
    {
      value: cfg.stat3Value,
      label: cfg.stat3Label,
      caption: cfg.stat3Caption,
    },
    {
      value: cfg.stat4Value,
      label: cfg.stat4Label,
      caption: cfg.stat4Caption,
    },
  ];

  const workflowSteps = [
    { num: '01', title: cfg.s1Title, desc: cfg.s1Desc },
    { num: '02', title: cfg.s2Title, desc: cfg.s2Desc },
    { num: '03', title: cfg.s3Title, desc: cfg.s3Desc },
    { num: '04', title: cfg.s4Title, desc: cfg.s4Desc },
  ];

  const waContactUrl = formatWhatsAppUrl(cfg.footerPhone || settings?.adminPhone);
  const activeSlide = cfg.featuresCarouselData[activeSlideIndex] || cfg.featuresCarouselData[0];

  const navLinks = [
    { label: 'Fitur', href: '#fitur' },
    { label: 'Alur Kerja', href: '#alur-kerja' },
    { label: 'Harga', href: '#harga' },
    { label: 'Testimoni', href: '#testimoni' },
  ];

  return (
    <div className="sales-body min-h-screen bg-[#FAF8F6] text-[#171417] overflow-x-hidden selection:bg-[#8C3A50]/15 selection:text-[#8C3A50]">
      {/* TOP BAR CONTRACT: 1-row, 3-zone, clean hairline */}
      <header className="sticky top-0 z-50 h-[68px] bg-[#FAF8F6]/92 backdrop-blur-md border-b border-[#E8E2E4]">
        <div className="max-w-[1200px] h-full mx-auto px-5 sm:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark / Logo */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C3A50]/40 rounded"
          >
            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Guestly"
                referrerPolicy="no-referrer"
                className="h-8 w-auto object-contain"
              />
            ) : (
              <span className="text-xl font-bold tracking-[-0.025em] text-[#8C3A50]">Guestly</span>
            )}
          </a>

          {/* Zone 2: 4 Single-line Navigation Links */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Navigasi utama">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[14px] font-medium text-[#5C5559] hover:text-[#171417] transition-colors whitespace-nowrap shrink-0 relative py-1 after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[1.5px] after:w-0 hover:after:w-full after:bg-[#8C3A50] after:transition-all after:duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Zone 3: Masuk text link + 1 Primary Action */}
          <div className="flex items-center gap-5 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/auth/login')}
              className="hidden sm:inline-flex text-[14px] font-medium text-[#3D373B] hover:text-[#8C3A50] transition-colors whitespace-nowrap shrink-0"
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => navigate('/auth/login')}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-[14px] font-medium bg-[#8C3A50] text-white hover:bg-[#702C3E] transition-colors whitespace-nowrap shrink-0 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C3A50] focus-visible:ring-offset-2"
            >
              Mulai Gratis
            </button>
            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[#E8E2E4] bg-white text-[#171417] hover:bg-[#F4EEF0] transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#FAF8F6] border-b border-[#E8E2E4] px-5 py-4 space-y-1 shadow-sm">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2.5 text-[15px] font-medium text-[#3D373B] hover:text-[#8C3A50]"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 mt-2 border-t border-[#E8E2E4] flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/auth/login');
                }}
                className="flex-1 py-2.5 rounded-lg border border-[#D8CFD2] bg-white text-[14px] font-medium text-[#171417]"
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/auth/login');
                }}
                className="flex-1 py-2.5 rounded-lg bg-[#8C3A50] text-[14px] font-medium text-white"
              >
                Mulai Gratis
              </button>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        {/* HERO SECTION — DYNAMIC SPLIT 2-COLUMN OR FULL-BG FROSTED BLUR + VIDEO */}
        {isFullBgHero ? (
          <section className="relative overflow-hidden min-h-[560px] lg:min-h-[620px] flex items-center bg-[#181316]">
            {/* Full-Bleed Background Photo / Video Layer */}
            <div className="absolute inset-0">
              <HeroMediaSurface
                posterSrc={cfg.heroImage}
                fallbackPosterSrc={SALESPAGE_DEFAULT_ASSETS.hero}
                videoUrl={cfg.heroVideoUrl}
                videoMode={cfg.heroVideoMode}
                videoFit={cfg.heroVideoFit}
                layoutMode="fullbg"
                onOpenLightbox={openHeroVideoModal}
                showPlayTrigger={false}
                controlsPosition="bottom-right"
              />
            </div>

            {/* Frosted Blur & Contrast Scrim Layer */}
            {cfg.heroBlurStyle === 'gradient' ? (
              <>
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 backdrop-blur-md hero-blur-mask-ltr ${
                    isDarkFrosted
                      ? 'bg-[#181316]/52 lg:bg-[#181316]/42'
                      : 'bg-[#FAF8F6]/72 lg:bg-[#FAF8F6]/62'
                  }`}
                />
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 ${
                    isDarkFrosted
                      ? 'bg-gradient-to-t from-[#181316]/88 via-[#181316]/68 to-[#181316]/45 lg:bg-gradient-to-r lg:from-[#181316]/88 lg:via-[#181316]/62 lg:to-[#181316]/12'
                      : 'bg-gradient-to-t from-[#FAF8F6]/94 via-[#FAF8F6]/80 to-[#FAF8F6]/58 lg:bg-gradient-to-r lg:from-[#FAF8F6]/95 lg:via-[#FAF8F6]/78 lg:to-transparent'
                  }`}
                />
              </>
            ) : (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 ${
                  isDarkFrosted
                    ? 'bg-gradient-to-r from-[#181316]/45 via-[#181316]/25 to-[#181316]/15'
                    : 'bg-gradient-to-r from-[#FAF8F6]/30 via-[#FAF8F6]/15 to-transparent'
                }`}
              />
            )}

            {/* Foreground Narrative + Optional Video Trigger */}
            <div className="relative z-10 w-full max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-18 lg:py-22">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                <div
                  className={`lg:col-span-7 ${
                    cfg.heroBlurStyle === 'card'
                      ? isDarkFrosted
                        ? 'rounded-2xl bg-[#181316]/66 backdrop-blur-xl border border-white/15 p-7 sm:p-9 shadow-2xl'
                        : 'rounded-2xl bg-[#FAF8F6]/84 backdrop-blur-xl border border-white/75 p-7 sm:p-9 shadow-xl'
                      : ''
                  }`}
                >
                  <p
                    className={`text-[13px] font-semibold tracking-[0.01em] mb-3.5 ${
                      isDarkFrosted ? 'text-[#F0C2CF]' : 'text-[#8C3A50]'
                    }`}
                  >
                    {cfg.heroKicker}
                  </p>

                  <h1
                    className={`text-[clamp(2.15rem,3.8vw,3.4rem)] font-bold leading-[1.12] tracking-[-0.03em] text-balance mb-5 ${
                      isDarkFrosted ? 'text-white' : 'text-[#171417]'
                    }`}
                  >
                    {renderHeroHeadline(isDarkFrosted ? 'text-[#F0B9C8]' : 'text-[#8C3A50]')}
                  </h1>

                  <p
                    className={`text-[15.5px] sm:text-[16px] leading-[1.68] max-w-[52ch] mb-8 ${
                      isDarkFrosted ? 'text-[#E4DDE0]' : 'text-[#3D373B]'
                    }`}
                  >
                    {cfg.heroSubtitle}
                  </p>

                  <div className="flex flex-wrap items-center gap-3.5 mb-8">
                    <button
                      type="button"
                      onClick={() => navigate('/auth/login')}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#8C3A50] text-white text-[14.5px] font-semibold hover:bg-[#702C3E] transition-colors whitespace-nowrap shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C3A50] focus-visible:ring-offset-2"
                    >
                      <span>{cfg.heroCtaPrimary}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    {hasHeroVideo && cfg.heroVideoMode === 'click' ? (
                      <button
                        type="button"
                        onClick={openHeroVideoModal}
                        className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-[14.5px] font-medium transition-colors whitespace-nowrap ${
                          isDarkFrosted
                            ? 'border border-white/25 bg-white/10 text-white hover:bg-white/20 backdrop-blur-xs'
                            : 'border border-[#D5C9CD] bg-white/92 text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50]'
                        }`}
                      >
                        <Play className="w-4 h-4 fill-current shrink-0" />
                        <span>Putar Video</span>
                      </button>
                    ) : (
                      <a
                        href="#alur-kerja"
                        className={`inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-lg text-[14.5px] font-medium transition-colors whitespace-nowrap ${
                          isDarkFrosted
                            ? 'border border-white/25 bg-white/10 text-white hover:bg-white/20 backdrop-blur-xs'
                            : 'border border-[#D5C9CD] bg-white/92 text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50]'
                        }`}
                      >
                        <span>{cfg.heroCtaSecondary}</span>
                      </a>
                    )}
                  </div>

                  {proofPoints.length > 0 && (
                    <div
                      className={`pt-6 border-t flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[13px] ${
                        isDarkFrosted
                          ? 'border-white/15 text-[#EAE4E7]'
                          : 'border-[#171417]/12 text-[#2B2629]'
                      }`}
                    >
                      {proofPoints.map((point, idx) => (
                        <div key={idx} className="inline-flex items-center gap-1.5 font-medium">
                          <Check
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isDarkFrosted ? 'text-[#F0B9C8]' : 'text-[#8C3A50]'
                            }`}
                            strokeWidth={2.5}
                          />
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Open Visual Showcase Side (Desktop Click-to-Play trigger when video is set) */}
                {hasHeroVideo && cfg.heroVideoMode === 'click' && (
                  <div className="hidden lg:flex lg:col-span-5 items-center justify-center">
                    <button
                      type="button"
                      onClick={openHeroVideoModal}
                      aria-label="Putar video preview Guestly"
                      className="group inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-[#181316]/70 hover:bg-[#8C3A50] backdrop-blur-md border border-white/25 text-white text-[14.5px] font-semibold shadow-xl transition-all duration-200 hover:scale-[1.03]"
                    >
                      <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                        <Play className="w-4 h-4 fill-white" />
                      </span>
                      <span>Tonton Video Singkat</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="pt-10 pb-14 sm:pt-14 sm:pb-18 lg:pt-18 lg:pb-22">
            <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
                {/* Left Narrative Column */}
                <div className="lg:col-span-6 flex flex-col justify-center">
                  <p className="text-[13px] font-semibold text-[#8C3A50] tracking-[0.01em] mb-3.5">
                    {cfg.heroKicker}
                  </p>

                  <h1 className="text-[clamp(2.15rem,3.7vw,3.35rem)] font-bold leading-[1.12] tracking-[-0.03em] text-[#171417] text-balance mb-5">
                    {renderHeroHeadline()}
                  </h1>

                  <p className="text-[15.5px] sm:text-[16px] leading-[1.68] text-[#5C5559] max-w-[52ch] mb-8">
                    {cfg.heroSubtitle}
                  </p>

                  <div className="flex flex-wrap items-center gap-3.5 mb-8">
                    <button
                      type="button"
                      onClick={() => navigate('/auth/login')}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#8C3A50] text-white text-[14.5px] font-semibold hover:bg-[#702C3E] transition-colors whitespace-nowrap shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C3A50] focus-visible:ring-offset-2"
                    >
                      <span>{cfg.heroCtaPrimary}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <a
                      href="#alur-kerja"
                      className="inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-lg border border-[#D8CFD2] bg-white text-[#171417] text-[14.5px] font-medium hover:border-[#8C3A50]/50 hover:text-[#8C3A50] transition-colors whitespace-nowrap"
                    >
                      <span>{cfg.heroCtaSecondary}</span>
                    </a>
                  </div>

                  {/* Crisp Unboxed Concrete Proof Points */}
                  {proofPoints.length > 0 && (
                    <div className="pt-6 border-t border-[#E8E2E4] flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[13px] text-[#3D373B]">
                      {proofPoints.map((point, idx) => (
                        <div key={idx} className="inline-flex items-center gap-1.5 font-medium">
                          <Check className="w-3.5 h-3.5 text-[#8C3A50] shrink-0" strokeWidth={2.5} />
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Dynamic Editorial Image / Video Frame */}
                <div className="lg:col-span-6">
                  <div
                    className={`relative h-full ${
                      hasHeroVideo &&
                      (cfg.heroVideoFit === 'portrait' ||
                        /youtube\.com\/shorts\//i.test(cfg.heroVideoUrl))
                        ? 'aspect-[4/5] sm:aspect-[4/3] lg:aspect-auto lg:min-h-[480px]'
                        : 'aspect-[4/3] lg:aspect-auto lg:min-h-[455px]'
                    } rounded-2xl overflow-hidden border border-[#E8E2E4] bg-[#EDE7E9] ring-1 ring-inset ring-black/5`}
                  >
                    <HeroMediaSurface
                      posterSrc={cfg.heroImage}
                      fallbackPosterSrc={SALESPAGE_DEFAULT_ASSETS.hero}
                      videoUrl={cfg.heroVideoUrl}
                      videoMode={cfg.heroVideoMode}
                      videoFit={cfg.heroVideoFit}
                      layoutMode="split"
                      onOpenLightbox={openHeroVideoModal}
                      showPlayTrigger={true}
                      controlsPosition="top-right"
                    />

                    {cfg.heroOverlayEnabled &&
                      (cfg.heroOverlayLabel || cfg.heroOverlayTitle) &&
                      !(hasHeroVideo && cfg.heroVideoMode === 'autoplay') && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#181316]/85 via-[#181316]/40 to-transparent pt-16 pb-5 px-5 sm:px-6 z-10">
                          <p className="text-[12px] font-semibold text-[#F0C2CF] tracking-[0.01em] mb-1">
                            {cfg.heroOverlayLabel}
                          </p>
                          <p className="text-[14px] leading-[1.45] text-[#FAF8F6] max-w-[46ch]">
                            {cfg.heroOverlayTitle}
                          </p>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* OUR PARTNER STRIP (IMMEDIATELY BELOW HERO — MONOCHROME MARQUEE) */}
        {cfg.partnersEnabled && cfg.partners.length > 0 && (() => {
          const repeatCount = Math.max(1, Math.ceil(10 / cfg.partners.length));
          const marqueeSet = Array.from({ length: repeatCount }, () => cfg.partners).flat();
          return (
            <section
              aria-label="Our Partner"
              className="border-y border-[#E8E2E4] bg-white py-6 sm:py-8 overflow-hidden"
            >
              <div className="max-w-[1200px] mx-auto px-5 sm:px-8 mb-3.5 sm:mb-4 text-center">
                <p className="text-[12.5px] sm:text-[13px] font-medium text-[#6F686C] tracking-[0.01em]">
                  {cfg.partnersTitle}
                </p>
              </div>

              <div className="sales-marquee-wrap relative overflow-hidden">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28 bg-gradient-to-r from-white to-transparent z-10"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28 bg-gradient-to-l from-white to-transparent z-10"
                />

                <div className="sales-marquee-track items-center">
                  <div className="flex items-center shrink-0">
                    {marqueeSet.map((partner, idx) => (
                      <PartnerLogoTile
                        key={`${partner.id}-a-${idx}`}
                        partner={partner}
                        size={cfg.partnersLogoSize}
                      />
                    ))}
                  </div>
                  <div className="sales-marquee-clone flex items-center shrink-0" aria-hidden="true">
                    {marqueeSet.map((partner, idx) => (
                      <PartnerLogoTile
                        key={`${partner.id}-b-${idx}`}
                        partner={partner}
                        size={cfg.partnersLogoSize}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        {/* METRIC STRIP — SYMMETRICAL 2x2 MOBILE / 4-COL DESKTOP PROOF */}
        <section className="bg-[#FAF8F6] border-b border-[#E8E2E4]">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-10 sm:py-12">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 lg:gap-x-0 lg:divide-x lg:divide-[#E8E2E4]">
              {statItems.map((stat, idx) => (
                <div
                  key={idx}
                  className="lg:px-8 lg:first:pl-0 lg:last:pr-0 flex flex-col justify-between"
                >
                  <div className="sales-mono text-2xl sm:text-[30px] lg:text-[34px] font-bold tracking-[-0.03em] text-[#171417] leading-none mb-2">
                    {stat.value}
                  </div>
                  <div className="text-[14px] font-semibold text-[#2B2629]">{stat.label}</div>
                  <div className="text-[12.5px] text-[#6F686C] mt-0.5 leading-snug">{stat.caption}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ASYMMETRIC BENTO CAPABILITIES (#fitur) — ZERO UNBALANCED HEIGHTS */}
        <section id="fitur" className="scroll-mt-20 py-16 sm:py-20 lg:py-24 bg-[#FAF8F6]">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
            <div className="max-w-2xl mb-11">
              <p className="text-[13px] font-semibold text-[#8C3A50] mb-2.5">{cfg.bentoKicker}</p>
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold leading-[1.16] tracking-[-0.025em] text-[#171417] text-balance mb-3.5">
                {cfg.bentoTitle}
              </h2>
              <p className="text-[15.5px] leading-[1.65] text-[#5C5559]">{cfg.bentoSubtitle}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {cfg.bentoItems.map((item, idx) => {
                const isWide = item.span === 'wide';
                const hasImage = Boolean(item.imageUrl && item.imageUrl.trim() !== '');
                const hasVideo = parseHeroVideoUrl(item.videoUrl).type !== 'none';
                const hasMedia = hasImage || hasVideo;
                const itemPoster = item.imageUrl || SALESPAGE_DEFAULT_ASSETS.bentoQr;
                const itemVideoMode = item.videoMode === 'autoplay' ? 'autoplay' : 'click';
                const itemVideoFit = item.videoFit || 'auto';

                if (isWide) {
                  return (
                    <article
                      key={item.id || idx}
                      className="md:col-span-2 bg-white border border-[#E8E2E4] rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch transition-colors duration-200 hover:border-[#D4C7CB]"
                    >
                      {hasMedia && (
                        <div className="lg:col-span-6 aspect-[16/10] lg:aspect-auto lg:min-h-[320px] bg-[#F4EEF0] overflow-hidden border-b lg:border-b-0 lg:border-r border-[#EFEAED]">
                          {hasVideo ? (
                            <HeroMediaSurface
                              posterSrc={itemPoster}
                              fallbackPosterSrc={SALESPAGE_DEFAULT_ASSETS.bentoQr}
                              videoUrl={item.videoUrl}
                              videoMode={itemVideoMode}
                              videoFit={itemVideoFit}
                              layoutMode="split"
                              onOpenLightbox={() =>
                                setActiveVideoModal({
                                  url: item.videoUrl || '',
                                  poster: itemPoster,
                                  fit: itemVideoFit,
                                  title: item.title || 'Video Fitur Guestly',
                                })
                              }
                              showPlayTrigger={true}
                              controlsPosition="top-right"
                            />
                          ) : (
                            <ResilientImage
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                            />
                          )}
                        </div>
                      )}
                      <div
                        className={`${
                          hasMedia ? 'lg:col-span-6' : 'lg:col-span-12'
                        } p-7 sm:p-9 flex flex-col justify-center`}
                      >
                        <p className="text-[12.5px] font-semibold text-[#8C3A50] mb-2.5">
                          {item.category}
                        </p>
                        <h3 className="text-[22px] sm:text-[26px] font-bold leading-[1.22] tracking-[-0.02em] text-[#171417] mb-3.5">
                          {item.title}
                        </h3>
                        <p className="text-[15px] leading-[1.68] text-[#5C5559] max-w-[54ch]">
                          {item.description}
                        </p>
                      </div>
                    </article>
                  );
                }

                return (
                  <article
                    key={item.id || idx}
                    className="bg-white border border-[#E8E2E4] rounded-2xl overflow-hidden flex flex-col transition-colors duration-200 hover:border-[#D4C7CB]"
                  >
                    {hasMedia && (
                      <div
                        className={`w-full ${
                          hasVideo &&
                          (itemVideoFit === 'portrait' ||
                            /youtube\.com\/shorts\//i.test(item.videoUrl || ''))
                            ? 'h-[300px] sm:h-[340px]'
                            : 'h-[220px] sm:h-[250px]'
                        } overflow-hidden border-b border-[#EFEAED] bg-[#F4EEF0]`}
                      >
                        {hasVideo ? (
                          <HeroMediaSurface
                            posterSrc={itemPoster}
                            fallbackPosterSrc={SALESPAGE_DEFAULT_ASSETS.bentoWelcome}
                            videoUrl={item.videoUrl}
                            videoMode={itemVideoMode}
                            videoFit={itemVideoFit}
                            layoutMode="split"
                            onOpenLightbox={() =>
                              setActiveVideoModal({
                                url: item.videoUrl || '',
                                poster: itemPoster,
                                fit: itemVideoFit,
                                title: item.title || 'Video Fitur Guestly',
                              })
                            }
                            showPlayTrigger={true}
                            controlsPosition="top-right"
                          />
                        ) : (
                          <ResilientImage
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                          />
                        )}
                      </div>
                    )}

                    <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-[12.5px] font-semibold text-[#8C3A50] mb-2">
                          {item.category}
                        </p>
                        <h3 className="text-[19px] sm:text-[20px] font-bold leading-[1.28] tracking-[-0.015em] text-[#171417] mb-2.5">
                          {item.title}
                        </h3>
                        <p className="text-[14.5px] leading-[1.65] text-[#5C5559]">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* 1 VELVET ROYAL BURGUNDY EDITORIAL SECTION — MASALAH, SOLUSI & ALUR KERJA (01–04) */}
        <section
          id="alur-kerja"
          className="scroll-mt-20 bg-gradient-to-b from-[#461826] via-[#3A1320] to-[#2E0E18] text-[#FCF9F7] py-16 sm:py-20 lg:py-24 border-y border-[#E7C89E]/15"
        >
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
            {/* Part A: Problem & Solution Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-5">
                {(() => {
                  const hasProblemVideo = parseHeroVideoUrl(cfg.problemVideoUrl).type !== 'none';
                  const isPortraitProblem =
                    hasProblemVideo &&
                    (cfg.problemVideoFit === 'portrait' ||
                      /youtube\.com\/shorts\//i.test(cfg.problemVideoUrl));
                  return (
                    <div
                      className={`rounded-2xl overflow-hidden border border-[#E7C89E]/20 shadow-2xl shadow-black/35 ${
                        isPortraitProblem ? 'aspect-[4/5] sm:aspect-[4/4.2]' : 'aspect-[4/3]'
                      } bg-[#2B0D16]`}
                    >
                      {hasProblemVideo ? (
                        <HeroMediaSurface
                          posterSrc={cfg.problemImage || SALESPAGE_DEFAULT_ASSETS.darkBallroom}
                          fallbackPosterSrc={SALESPAGE_DEFAULT_ASSETS.darkBallroom}
                          videoUrl={cfg.problemVideoUrl}
                          videoMode={cfg.problemVideoMode}
                          videoFit={cfg.problemVideoFit}
                          layoutMode="split"
                          onOpenLightbox={() =>
                            setActiveVideoModal({
                              url: cfg.problemVideoUrl,
                              poster: cfg.problemImage || SALESPAGE_DEFAULT_ASSETS.darkBallroom,
                              fit: cfg.problemVideoFit,
                              title: cfg.problemTitle || 'Transformasi Operasional Guestly',
                            })
                          }
                          showPlayTrigger={true}
                          controlsPosition="top-right"
                        />
                      ) : (
                        <ResilientImage
                          src={cfg.problemImage}
                          fallbackSrc={SALESPAGE_DEFAULT_ASSETS.darkBallroom}
                          alt="Suasana foyer ballroom malam hari yang tertata rapi"
                          className="w-full h-full object-cover"
                          fallbackLabel="Guestly Ballroom"
                        />
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div>
                  <p className="text-[13px] font-semibold text-[#E7C89E] tracking-[0.02em] mb-2.5">
                    {cfg.darkSectionKicker}
                  </p>
                  <h2 className="text-[clamp(1.7rem,2.9vw,2.35rem)] font-bold leading-[1.18] tracking-[-0.02em] text-[#FCF9F7] text-balance mb-5">
                    {cfg.problemTitle}
                  </h2>

                  <ul className="divide-y divide-white/12 border-y border-white/12">
                    {problemLines.map((line, i) => (
                      <li
                        key={i}
                        className="py-3 flex items-start gap-3 text-[14.5px] leading-[1.58] text-[#ECDFE3] tracking-[0.005em]"
                      >
                        <span aria-hidden="true" className="sales-mono text-[#E7C89E] shrink-0">
                          —
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl bg-[#592132]/75 border border-[#E7C89E]/25 p-6">
                  <h3 className="text-[18px] sm:text-[19px] font-bold text-[#FCF9F7] tracking-[-0.01em] mb-2">
                    {cfg.solutionTitle}
                  </h3>
                  <p className="text-[14.5px] leading-[1.68] text-[#EFE3E7] tracking-[0.005em]">
                    {cfg.solutionDesc}
                  </p>
                </div>
              </div>
            </div>

            {/* Part B: Numbered Workflow (01–04) */}
            <div className="mt-16 pt-16 sm:mt-20 sm:pt-20 border-t border-white/12">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-10">
                <div className="max-w-xl">
                  <p className="text-[13px] font-semibold text-[#E7C89E] tracking-[0.02em] mb-2">
                    Cara Kerja
                  </p>
                  <h2 className="text-[clamp(1.65rem,2.8vw,2.25rem)] font-bold leading-[1.18] tracking-[-0.02em] text-[#FCF9F7] text-balance">
                    {cfg.stepsTitle}
                  </h2>
                </div>
                <p className="text-[14.5px] leading-[1.65] text-[#DFCFD4] max-w-md tracking-[0.005em]">
                  {cfg.stepsSubtitle}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {workflowSteps.map((step) => (
                  <div
                    key={step.num}
                    className="rounded-xl bg-white/[0.06] hover:bg-white/[0.09] border border-white/14 transition-colors duration-200 p-6 flex flex-col justify-between"
                  >
                    <div>
                      <div className="sales-mono text-[13px] font-semibold text-[#E7C89E] mb-3.5">
                        {step.num}
                      </div>
                      <h3 className="text-[16px] font-semibold text-[#FCF9F7] mb-2 tracking-[-0.01em]">
                        {step.title}
                      </h3>
                      <p className="text-[13.5px] leading-[1.65] text-[#E4D4D9] tracking-[0.005em]">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* INTERACTIVE PRODUCT SHOWCASE GALLERY (#galeri) */}
        {cfg.featuresCarouselData.length > 0 && activeSlide && (
          <section
            id="galeri"
            className="scroll-mt-20 py-16 sm:py-20 lg:py-24 bg-white border-b border-[#E8E2E4]"
          >
            <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                <div className="max-w-2xl">
                  <p className="text-[13px] font-semibold text-[#8C3A50] mb-2">Sorotan Sistem</p>
                  <h2 className="text-[clamp(1.7rem,2.9vw,2.35rem)] font-bold leading-[1.16] tracking-[-0.025em] text-[#171417] text-balance mb-3">
                    {cfg.featuresCarouselTitle}
                  </h2>
                  <p className="text-[15px] leading-[1.65] text-[#5C5559]">
                    {cfg.featuresCarouselDesc}
                  </p>
                </div>

                {cfg.featuresCarouselData.length > 1 && (
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="sales-mono text-[13px] font-medium text-[#6F686C] mr-1">
                      {String(activeSlideIndex + 1).padStart(2, '0')} /{' '}
                      {String(cfg.featuresCarouselData.length).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      aria-label="Slide sebelumnya"
                      onClick={() =>
                        setActiveSlideIndex((prev) =>
                          prev === 0 ? cfg.featuresCarouselData.length - 1 : prev - 1
                        )
                      }
                      className="w-10 h-10 rounded-lg border border-[#E8E2E4] bg-[#FAF8F6] text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Slide berikutnya"
                      onClick={() =>
                        setActiveSlideIndex((prev) => (prev + 1) % cfg.featuresCarouselData.length)
                      }
                      className="w-10 h-10 rounded-lg border border-[#E8E2E4] bg-[#FAF8F6] text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-stretch">
                {/* Left Interactive Selector List */}
                <div className="lg:col-span-4 flex flex-col justify-between gap-3">
                  {cfg.featuresCarouselData.map((slide, idx) => {
                    const isActive = idx === activeSlideIndex;
                    const slideHasVideo = parseHeroVideoUrl(slide.videoUrl).type !== 'none';
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveSlideIndex(idx)}
                        className={`flex-1 text-left p-5 rounded-xl border transition-all duration-200 flex flex-col justify-center ${
                          isActive
                            ? 'bg-[#FAF8F6] border-[#8C3A50] ring-1 ring-[#8C3A50]/15'
                            : 'bg-white border-[#E8E2E4] hover:border-[#D4C7CB]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="sales-mono text-[12px] font-semibold text-[#8C3A50]">
                            {String(idx + 1).padStart(2, '0')}
                          </div>
                          {slideHasVideo && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8C3A50]">
                              <Play className="w-3 h-3 fill-[#8C3A50]" />
                              Video
                            </span>
                          )}
                        </div>
                        <div className="text-[15px] font-semibold text-[#171417] mb-1">
                          {slide.title}
                        </div>
                        {slide.description && (
                          <p className="text-[13.5px] leading-[1.55] text-[#5C5559] line-clamp-3">
                            {slide.description}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Right Crisp Preview Frame */}
                <div className="lg:col-span-8 flex flex-col rounded-2xl overflow-hidden border border-[#E8E2E4] bg-[#FAF8F6]">
                  <div className="aspect-[16/10] w-full bg-[#EDE7E9] overflow-hidden">
                    {parseHeroVideoUrl(activeSlide.videoUrl).type !== 'none' ? (
                      <HeroMediaSurface
                        key={`${activeSlideIndex}-${activeSlide.videoUrl}`}
                        posterSrc={activeSlide.img || SALESPAGE_DEFAULT_ASSETS.bentoQr}
                        fallbackPosterSrc={SALESPAGE_DEFAULT_ASSETS.bentoQr}
                        videoUrl={activeSlide.videoUrl}
                        videoMode={activeSlide.videoMode === 'autoplay' ? 'autoplay' : 'click'}
                        videoFit={activeSlide.videoFit || 'auto'}
                        layoutMode="split"
                        onOpenLightbox={() =>
                          setActiveVideoModal({
                            url: activeSlide.videoUrl || '',
                            poster: activeSlide.img || SALESPAGE_DEFAULT_ASSETS.bentoQr,
                            fit: activeSlide.videoFit || 'auto',
                            title: activeSlide.title || 'Preview Sistem Guestly',
                          })
                        }
                        showPlayTrigger={true}
                        controlsPosition="top-right"
                      />
                    ) : (
                      <ResilientImage
                        src={activeSlide.img}
                        fallbackSrc={SALESPAGE_DEFAULT_ASSETS.bentoQr}
                        alt={activeSlide.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="px-6 py-4 bg-white border-t border-[#E8E2E4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-[#171417]">{activeSlide.title}</div>
                      {activeSlide.description && (
                        <p className="text-[13.5px] text-[#5C5559] mt-0.5">{activeSlide.description}</p>
                      )}
                    </div>
                    {activeSlide.link && (
                      <a
                        href={activeSlide.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#8C3A50] hover:text-[#702C3E] whitespace-nowrap shrink-0"
                      >
                        <span>Lihat Detail</span>
                        <ArrowUpRight className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* PRICING SECTION (#harga) — RESPONSIVE HAIRLINE PRECISION */}
        <section id="harga" className="scroll-mt-20 py-14 sm:py-18 lg:py-24 bg-[#FAF8F6]">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 sm:gap-6 mb-8 sm:mb-11">
              <div className="max-w-2xl">
                <p className="text-[12.5px] sm:text-[13px] font-semibold text-[#8C3A50] mb-2">
                  {cfg.pricingKicker}
                </p>
                <h2 className="text-[clamp(1.45rem,2.6vw,2.25rem)] font-bold leading-[1.18] tracking-[-0.025em] text-[#171417] text-balance mb-2.5 sm:mb-3">
                  {cfg.pricingTitle}
                </h2>
                <p className="text-[14px] sm:text-[15px] leading-[1.65] text-[#5C5559]">
                  {cfg.pricingSubtitle}
                </p>
              </div>

              {services.length > 3 && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label="Geser paket ke kiri"
                    onClick={() => scrollPricing('left')}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-[#E8E2E4] bg-white text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Geser paket ke kanan"
                    onClick={() => scrollPricing('right')}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-[#E8E2E4] bg-white text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {loadingServices ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-[380px] sm:h-[410px] rounded-2xl border border-[#E8E2E4] bg-white p-5 sm:p-6 lg:p-7 animate-pulse"
                  />
                ))}
              </div>
            ) : services.length === 0 ? (
              <div className="rounded-2xl border border-[#E8E2E4] bg-white py-12 px-5 text-center text-[14px] text-[#5C5559]">
                Belum ada paket layanan aktif yang tersedia saat ini.
              </div>
            ) : (
              <div
                ref={pricingSliderRef}
                className={
                  services.length <= 3
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 items-stretch'
                    : 'flex overflow-x-auto gap-4 sm:gap-5 lg:gap-6 pb-4 snap-x snap-mandatory hide-scrollbar scroll-smooth'
                }
              >
                {services.map((service, index) => {
                  const hasDiamond = services.some((s) => s.name.toLowerCase().includes('diamond'));
                  const isPopular = hasDiamond
                    ? service.name.toLowerCase().includes('diamond')
                    : services.length >= 3 && index === 1;
                  const normalPrice =
                    service.normalPrice ||
                    (service.price > 0 ? Math.round((service.price * 1.4) / 1000) * 1000 : 0);
                  const formattedPrice = service.price > 0 ? service.price.toLocaleString('id-ID') : '';
                  const priceSizeClass =
                    formattedPrice.length >= 10
                      ? 'text-[clamp(1.2rem,2.1vw,1.5rem)]'
                      : formattedPrice.length >= 8
                      ? 'text-[clamp(1.32rem,2.2vw,1.68rem)]'
                      : 'text-[clamp(1.45rem,2.4vw,1.88rem)]';

                  return (
                    <div
                      key={service.id}
                      className={`${
                        services.length > 3
                          ? 'w-[84vw] max-w-[320px] sm:w-[300px] lg:w-[330px] snap-start shrink-0'
                          : 'min-w-0'
                      } bg-white rounded-2xl overflow-hidden flex flex-col justify-between transition-colors ${
                        isPopular
                          ? 'border border-[#8C3A50] shadow-[0_14px_34px_-16px_rgba(140,58,80,0.22)]'
                          : 'border border-[#E8E2E4]'
                      }`}
                    >
                      <div className="min-w-0">
                        {/* Subtle top bar accent only on featured card */}
                        <div className={`h-1 w-full ${isPopular ? 'bg-[#8C3A50]' : 'bg-transparent'}`} />

                        <div className="p-5 sm:p-6 lg:p-7 pb-0">
                          <div className="flex items-start justify-between gap-2 mb-3.5 sm:mb-4 min-h-[22px]">
                            <h3 className="text-[15.5px] sm:text-[16.5px] lg:text-[17px] font-bold text-[#171417] leading-snug break-words min-w-0">
                              {service.name}
                            </h3>
                            {isPopular && (
                              <span className="text-[11.5px] sm:text-[12px] font-semibold text-[#8C3A50] whitespace-nowrap shrink-0 mt-0.5">
                                Pilihan Populer
                              </span>
                            )}
                          </div>

                          <div className="pb-5 sm:pb-6 mb-5 sm:mb-6 border-b border-[#EFEAED]">
                            <div className="min-h-[18px] mb-1">
                              {service.price > 0 && normalPrice > service.price && (
                                <span className="sales-mono text-[12px] sm:text-[12.5px] text-[#9E969A] line-through">
                                  Rp {normalPrice.toLocaleString('id-ID')}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                              {service.price === 0 ? (
                                <span className="sales-mono text-[clamp(1.45rem,2.4vw,1.88rem)] font-bold tracking-[-0.025em] text-[#171417] leading-tight">
                                  Gratis
                                </span>
                              ) : (
                                <>
                                  <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                                    <span className="text-[13px] sm:text-[14px] font-semibold text-[#5C5559]">
                                      Rp
                                    </span>
                                    <span
                                      className={`sales-mono ${priceSizeClass} font-bold tracking-[-0.03em] text-[#171417] leading-tight`}
                                    >
                                      {formattedPrice}
                                    </span>
                                  </span>
                                  <span className="text-[12px] sm:text-[12.5px] text-[#6F686C] whitespace-nowrap">
                                    / acara
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {Array.isArray(service.features) && service.features.length > 0 && service.description?.trim() && (
                            <p className="text-[12.5px] sm:text-[13px] leading-relaxed text-[#6F686C] mb-4">
                              {service.description.trim()}
                            </p>
                          )}

                          <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-7">
                            {service.eventQuota ? (
                              <li className="flex items-start gap-2.5 text-[13px] sm:text-[13.5px] lg:text-[14px] leading-[1.5] text-[#3D373B]">
                                <Check className="w-4 h-4 text-[#8C3A50] shrink-0 mt-0.5" strokeWidth={2.2} />
                                <span className="min-w-0 break-words">
                                  <strong className="font-semibold">{service.eventQuota}</strong> Event Aktif
                                </span>
                              </li>
                            ) : null}
                            {service.guestQuota ? (
                              <li className="flex items-start gap-2.5 text-[13px] sm:text-[13.5px] lg:text-[14px] leading-[1.5] text-[#3D373B]">
                                <Check className="w-4 h-4 text-[#8C3A50] shrink-0 mt-0.5" strokeWidth={2.2} />
                                <span className="min-w-0 break-words">
                                  Kapasitas hingga{' '}
                                  <strong className="font-semibold">
                                    {Number(service.guestQuota).toLocaleString('id-ID')}
                                  </strong>{' '}
                                  Tamu
                                </span>
                              </li>
                            ) : null}
                            {(Array.isArray(service.features) && service.features.length > 0
                              ? service.features.map((f) => f.trim()).filter(Boolean)
                              : (service.description || '')
                                  .split('\n')
                                  .map((line) => line.trim())
                                  .filter(Boolean)
                            ).map((line, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2.5 text-[13px] sm:text-[13.5px] lg:text-[14px] leading-[1.5] text-[#4B4448]"
                              >
                                <Check className="w-4 h-4 text-[#8C3A50] shrink-0 mt-0.5" strokeWidth={2.2} />
                                <span className="min-w-0 break-words">
                                  {line.replace(/^[-•*]\s*/, '')}
                                </span>
                              </li>
                            ))}
                            {service.includeWeddingPlanner && (
                              <li className="flex items-start gap-2.5 text-[13px] sm:text-[13.5px] lg:text-[14px] leading-[1.5] text-[#8C3A50] font-medium">
                                <Check className="w-4 h-4 text-[#8C3A50] shrink-0 mt-0.5" strokeWidth={2.4} />
                                <span className="min-w-0 break-words">
                                  Termasuk Modul Wedding Planner Lengkap
                                </span>
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>

                      <div className="p-5 sm:p-6 lg:p-7 pt-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/auth/login/services/checkout/${service.id}`)}
                          className={`w-full py-2.5 px-4 rounded-lg text-[13.5px] sm:text-[14px] font-semibold transition-colors whitespace-nowrap ${
                            isPopular
                              ? 'bg-[#8C3A50] text-white hover:bg-[#702C3E]'
                              : 'bg-[#FAF8F6] text-[#171417] border border-[#D8CFD2] hover:border-[#8C3A50] hover:text-[#8C3A50]'
                          }`}
                        >
                          {service.price === 0 ? 'Mulai Gratis' : 'Pilih Paket'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[12.5px] sm:text-[13.5px] text-[#6F686C] mt-6 sm:mt-7 leading-relaxed">
              {cfg.pricingFootnote}
            </p>
          </div>
        </section>

        {/* TESTIMONIALS (#testimoni) — WORKING CAROUSEL + REVIEW MODAL */}
        <section
          id="testimoni"
          className="scroll-mt-20 py-16 sm:py-20 lg:py-24 bg-white border-y border-[#E8E2E4]"
        >
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-11">
              <div className="max-w-2xl">
                <p className="text-[13px] font-semibold text-[#8C3A50] mb-2">
                  {cfg.testimonialsKicker}
                </p>
                <h2 className="text-[clamp(1.7rem,2.9vw,2.35rem)] font-bold leading-[1.16] tracking-[-0.025em] text-[#171417] text-balance">
                  {cfg.testimonialsTitle}
                </h2>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTestiError(null);
                    setTestiSuccess(false);
                    setIsTestiModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-lg border border-[#D8CFD2] bg-[#FAF8F6] text-[13.5px] font-medium text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50] transition-colors whitespace-nowrap"
                >
                  Tulis Ulasan
                </button>

                {totalTestiPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Testimoni sebelumnya"
                      onClick={() =>
                        setTestiPage((prev) => (prev === 0 ? totalTestiPages - 1 : prev - 1))
                      }
                      className="w-10 h-10 rounded-lg border border-[#E8E2E4] bg-white text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Testimoni berikutnya"
                      onClick={() => setTestiPage((prev) => (prev + 1) % totalTestiPages)}
                      className="w-10 h-10 rounded-lg border border-[#E8E2E4] bg-white text-[#171417] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {loadingTesti ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-56 rounded-2xl bg-[#FAF8F6] border border-[#E8E2E4] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {visibleTestimonials.map((item) => (
                  <blockquote
                    key={item.id}
                    className="bg-[#FAF8F6] border border-[#E8E2E4] rounded-2xl p-6 sm:p-7 flex flex-col justify-between"
                  >
                    <div>
                      <div
                        className="flex items-center gap-1 mb-4"
                        aria-label={`Rating ${item.rating || 5} dari 5`}
                      >
                        {Array.from({ length: 5 }).map((_, starIdx) => (
                          <Star
                            key={starIdx}
                            className={`w-4 h-4 ${
                              starIdx < (item.rating || 5)
                                ? 'fill-[#8C3A50] text-[#8C3A50]'
                                : 'text-[#D5CFD2]'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[14.5px] leading-[1.7] text-[#3D373B] mb-6">
                        “{item.content}”
                      </p>
                    </div>

                    <footer className="pt-4 border-t border-[#E8E2E4] flex items-center gap-3">
                      <div
                        aria-hidden="true"
                        className="w-9 h-9 rounded-full bg-[#F2E7EA] text-[#8C3A50] text-[12px] font-bold flex items-center justify-center shrink-0"
                      >
                        {getInitials(item.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-[#171417] truncate">
                          {item.name}
                        </div>
                        <div className="text-[12.5px] text-[#6F686C] truncate">
                          {item.role || 'Klien Guestly'}
                        </div>
                      </div>
                    </footer>
                  </blockquote>
                ))}
              </div>
            )}

            {totalTestiPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                {Array.from({ length: totalTestiPages }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Halaman testimoni ${idx + 1}`}
                    onClick={() => setTestiPage(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === safeTestiPage ? 'w-7 bg-[#8C3A50]' : 'w-2 bg-[#D8CFD2] hover:bg-[#B8ABB0]'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* FAQ (#faq) & CLOSING CONVERSION BANNER */}
        <section id="faq" className="scroll-mt-20 py-16 sm:py-20 lg:py-24 bg-[#FAF8F6]">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
              {/* Left: Dynamic FAQ Accordion */}
              <div className="lg:col-span-7">
                <p className="text-[13px] font-semibold text-[#8C3A50] mb-2">Informasi Tambahan</p>
                <h2 className="text-[clamp(1.65rem,2.8vw,2.2rem)] font-bold leading-[1.18] tracking-[-0.025em] text-[#171417] mb-7">
                  {cfg.faqTitle}
                </h2>

                <div className="bg-white border border-[#E8E2E4] rounded-2xl divide-y divide-[#EFEAED] px-5 sm:px-6">
                  {cfg.faqItems.map((faq, idx) => {
                    const isOpen = openFaqIndex === idx;
                    return (
                      <div key={idx}>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                          className="w-full py-4.5 flex items-center justify-between gap-4 text-left text-[15px] font-semibold text-[#171417] hover:text-[#8C3A50] transition-colors"
                        >
                          <span>{faq.question}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-[#6F686C] shrink-0 transition-transform duration-200 ${
                              isOpen ? 'rotate-180 text-[#8C3A50]' : ''
                            }`}
                          />
                        </button>
                        {isOpen && (
                          <div className="pb-5 pr-6 text-[14.5px] leading-[1.68] text-[#5C5559]">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Deep Burgundy Conversion Card */}
              <div className="lg:col-span-5 lg:mt-10">
                <div className="rounded-2xl bg-[#6F273B] text-[#FAF8F6] p-7 sm:p-9 border border-[#5B1E2F]">
                  <p className="text-[12.5px] font-semibold text-[#F1C7D3] tracking-[0.01em] mb-3">
                    Mulai Bersama Guestly
                  </p>
                  <h2 className="text-[24px] sm:text-[27px] font-bold leading-[1.22] tracking-[-0.02em] text-white mb-3.5">
                    {cfg.ctaTitle}
                  </h2>
                  <p className="text-[14.5px] leading-[1.68] text-[#F4E3E8] mb-7">{cfg.ctaDesc}</p>

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/auth/login')}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-white text-[#6F273B] text-[14.5px] font-semibold hover:bg-[#FAF8F6] transition-colors whitespace-nowrap"
                    >
                      <span>{cfg.ctaPrimaryText}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <a
                      href={waContactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-white/25 bg-white/5 text-white text-[14.5px] font-medium hover:bg-white/12 transition-colors whitespace-nowrap"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>{cfg.ctaSecondaryText}</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* QUIET EDITORIAL FOOTER (ZERO DEAD LINKS) */}
      <footer className="bg-white border-t border-[#E8E2E4] pt-14 pb-9">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-12 border-b border-[#EFEAED]">
            <div className="lg:col-span-5">
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center mb-4"
              >
                {settings?.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt="Guestly"
                    referrerPolicy="no-referrer"
                    className="h-8 w-auto object-contain"
                  />
                ) : (
                  <span className="text-xl font-bold tracking-[-0.025em] text-[#8C3A50]">Guestly</span>
                )}
              </a>
              <p className="text-[14px] leading-[1.68] text-[#5C5559] max-w-sm mb-6">
                {cfg.footerDescription}
              </p>

              {(cfg.footerInstagram || cfg.footerFacebook || cfg.footerYoutube) && (
                <div className="flex items-center gap-3">
                  {cfg.footerInstagram && (
                    <a
                      href={cfg.footerInstagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram Guestly"
                      className="w-9 h-9 rounded-lg border border-[#E8E2E4] text-[#5C5559] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                    >
                      <Instagram className="w-4 h-4" />
                    </a>
                  )}
                  {cfg.footerFacebook && (
                    <a
                      href={cfg.footerFacebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Facebook Guestly"
                      className="w-9 h-9 rounded-lg border border-[#E8E2E4] text-[#5C5559] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                    >
                      <Facebook className="w-4 h-4" />
                    </a>
                  )}
                  {cfg.footerYoutube && (
                    <a
                      href={cfg.footerYoutube}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="YouTube Guestly"
                      className="w-9 h-9 rounded-lg border border-[#E8E2E4] text-[#5C5559] hover:border-[#8C3A50] hover:text-[#8C3A50] inline-flex items-center justify-center transition-colors"
                    >
                      <Youtube className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h4 className="text-[13.5px] font-semibold text-[#171417] mb-4">Navigasi</h4>
                <ul className="space-y-2.5 text-[14px] text-[#5C5559]">
                  <li>
                    <a href="#fitur" className="hover:text-[#8C3A50] transition-colors">
                      Fitur Utama
                    </a>
                  </li>
                  <li>
                    <a href="#alur-kerja" className="hover:text-[#8C3A50] transition-colors">
                      Alur Kerja
                    </a>
                  </li>
                  {cfg.featuresCarouselData.length > 0 && (
                    <li>
                      <a href="#galeri" className="hover:text-[#8C3A50] transition-colors">
                        Pratinjau Sistem
                      </a>
                    </li>
                  )}
                  <li>
                    <a href="#harga" className="hover:text-[#8C3A50] transition-colors">
                      Paket Harga
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-[13.5px] font-semibold text-[#171417] mb-4">Akses Cepat</h4>
                <ul className="space-y-2.5 text-[14px] text-[#5C5559]">
                  <li>
                    <a href="#testimoni" className="hover:text-[#8C3A50] transition-colors">
                      Testimoni Klien
                    </a>
                  </li>
                  <li>
                    <a href="#faq" className="hover:text-[#8C3A50] transition-colors">
                      Pertanyaan Umum
                    </a>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => navigate('/auth/login')}
                      className="hover:text-[#8C3A50] transition-colors text-left"
                    >
                      Masuk Dashboard
                    </button>
                  </li>
                  <li>
                    <a
                      href={waContactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#8C3A50] transition-colors"
                    >
                      Konsultasi WhatsApp
                    </a>
                  </li>
                </ul>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <h4 className="text-[13.5px] font-semibold text-[#171417] mb-4">Kontak</h4>
                <ul className="space-y-3 text-[14px] text-[#5C5559]">
                  <li className="flex items-start gap-2.5">
                    <Mail className="w-4 h-4 text-[#8C3A50] shrink-0 mt-0.5" />
                    <a
                      href={`mailto:${cfg.footerEmail}`}
                      className="hover:text-[#8C3A50] transition-colors break-all"
                    >
                      {cfg.footerEmail}
                    </a>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Phone className="w-4 h-4 text-[#8C3A50] shrink-0 mt-0.5" />
                    <a
                      href={waContactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#8C3A50] transition-colors"
                    >
                      {cfg.footerPhone}
                    </a>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-[#8C3A50] shrink-0 mt-0.5" />
                    <span>{cfg.footerAddress}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-7 flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px] text-[#7A7277]">
            <p>&copy; {new Date().getFullYear()} Guestly. Seluruh hak cipta dilindungi.</p>
            <p>Smart Guest Management &amp; Digital Reception Platform</p>
          </div>
        </div>
      </footer>

      {/* TESTIMONIAL SUBMISSION MODAL */}
      {isTestiModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#181316]/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !submittingTesti && setIsTestiModalOpen(false)}
        >
          <div
            className="bg-white border border-[#E8E2E4] rounded-2xl w-full max-w-md p-6 sm:p-7 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-[#171417]">Tulis Ulasan</h3>
                <p className="text-[13px] text-[#6F686C] mt-0.5">
                  Bagikan pengalaman Anda mengelola acara bersama Guestly.
                </p>
              </div>
              <button
                type="button"
                disabled={submittingTesti}
                onClick={() => setIsTestiModalOpen(false)}
                aria-label="Tutup modal"
                className="w-8 h-8 rounded-lg text-[#6F686C] hover:text-[#171417] hover:bg-[#FAF8F6] inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {testiSuccess ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-11 h-11 rounded-full bg-[#FCF0F3] text-[#8C3A50] mx-auto flex items-center justify-center">
                  <Check className="w-5 h-5" />
                </div>
                <p className="text-[15px] font-semibold text-[#171417]">Terima kasih atas ulasan Anda</p>
                <p className="text-[13.5px] text-[#5C5559]">
                  Ulasan Anda telah berhasil ditambahkan ke halaman testimoni.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitTestimonial} className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#3D373B] mb-1.5">Rating</label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setTestiForm((f) => ({ ...f, rating: r }))}
                        aria-label={`Beri ${r} bintang`}
                        className="p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C3A50]/40 rounded"
                      >
                        <Star
                          className={`w-6 h-6 transition-colors ${
                            r <= testiForm.rating
                              ? 'fill-[#8C3A50] text-[#8C3A50]'
                              : 'text-[#D5CFD2] hover:text-[#8C3A50]/60'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#3D373B] mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={testiForm.name}
                    onChange={(e) => setTestiForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="cth: Nadia Kusuma"
                    className="w-full px-3.5 py-2 rounded-lg border border-[#D8CFD2] text-[14px] text-[#171417] focus:outline-none focus:border-[#8C3A50] focus:ring-2 focus:ring-[#8C3A50]/15"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#3D373B] mb-1">
                    Peran / Instansi (Opsional)
                  </label>
                  <input
                    type="text"
                    value={testiForm.role}
                    onChange={(e) => setTestiForm((f) => ({ ...f, role: e.target.value }))}
                    placeholder="cth: Wedding Organizer / Pengantin"
                    className="w-full px-3.5 py-2 rounded-lg border border-[#D8CFD2] text-[14px] text-[#171417] focus:outline-none focus:border-[#8C3A50] focus:ring-2 focus:ring-[#8C3A50]/15"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#3D373B] mb-1">
                    Ulasan Anda
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={testiForm.content}
                    onChange={(e) => setTestiForm((f) => ({ ...f, content: e.target.value }))}
                    placeholder="Ceritakan pengalaman Anda menggunakan Guestly pada acara Anda..."
                    className="w-full px-3.5 py-2 rounded-lg border border-[#D8CFD2] text-[14px] text-[#171417] focus:outline-none focus:border-[#8C3A50] focus:ring-2 focus:ring-[#8C3A50]/15"
                  />
                </div>

                {testiError && (
                  <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {testiError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={submittingTesti}
                    onClick={() => setIsTestiModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-[#D8CFD2] text-[14px] font-medium text-[#3D373B] hover:bg-[#FAF8F6]"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingTesti}
                    className="px-5 py-2 rounded-lg bg-[#8C3A50] text-white text-[14px] font-medium hover:bg-[#702C3E] disabled:opacity-50 transition-colors"
                  >
                    {submittingTesti ? 'Mengirim...' : 'Kirim Ulasan'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SHARED VIDEO LIGHTBOX MODAL (HERO, BENTO, PROBLEM, SHOWCASE — ZERO INITIAL LOAD) */}
      <HeroVideoLightbox
        isOpen={Boolean(activeVideoModal)}
        onClose={() => setActiveVideoModal(null)}
        videoUrl={activeVideoModal?.url}
        posterSrc={activeVideoModal?.poster || SALESPAGE_DEFAULT_ASSETS.hero}
        videoFit={activeVideoModal?.fit || 'auto'}
        title={activeVideoModal?.title || 'Video Preview Guestly'}
      />
    </div>
  );
}
