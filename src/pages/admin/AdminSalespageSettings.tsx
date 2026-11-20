import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  ExternalLink,
  Layout,
  Handshake,
  BarChart3,
  LayoutGrid,
  Layers,
  ListOrdered,
  FileText,
  Video,
  Columns2,
  Maximize2,
} from 'lucide-react';
import {
  DEFAULT_SALESPAGE_CONFIG,
  SALESPAGE_DEFAULT_ASSETS,
  SalespageBentoItem,
  SalespageCarouselItem,
  SalespageFaqItem,
  SalespagePartnerItem,
  resolveSalespageConfig,
} from '../../lib/salespageDefaults';
import { SalespageImageField } from '../../components/admin/SalespageImageField';
import { SalespageVideoField } from '../../components/admin/SalespageVideoField';
import { getHeroVideoSourceLabel } from '../../components/salespage/HeroMediaStage';
import { showConfirm, showAlert } from '../../lib/alerts';

interface Props {
  data: any;
  updateData: (key: string, value: any) => void;
  onReplaceData?: (nextData: Record<string, any>) => void;
}

type EditorSection = 'hero' | 'partners' | 'stats' | 'bento' | 'showcase' | 'steps' | 'closing';

const SECTION_TABS: { id: EditorSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'hero', label: 'Hero & CTA', icon: Layout },
  { id: 'partners', label: 'Our Partner', icon: Handshake },
  { id: 'stats', label: 'Statistik', icon: BarChart3 },
  { id: 'bento', label: 'Bento Fitur', icon: LayoutGrid },
  { id: 'showcase', label: 'Masalah & Galeri', icon: Layers },
  { id: 'steps', label: 'Alur Kerja', icon: ListOrdered },
  { id: 'closing', label: 'Harga, FAQ & Footer', icon: FileText },
];

export default function AdminSalespageSettings({ data, updateData, onReplaceData }: Props) {
  const [activeSection, setActiveSection] = useState<EditorSection>('hero');
  const resolved = resolveSalespageConfig(data);

  // Partners helpers
  const partnersList: SalespagePartnerItem[] = Array.isArray(data?.partners)
    ? data.partners
    : DEFAULT_SALESPAGE_CONFIG.partners;

  const setPartnersList = (next: SalespagePartnerItem[]) => updateData('partners', next);

  const addPartner = () => {
    setPartnersList([
      ...partnersList,
      { id: `partner-${Date.now()}`, name: '', logoUrl: '', websiteUrl: '' },
    ]);
  };

  const updatePartner = (index: number, field: keyof SalespagePartnerItem, value: string) => {
    const next = [...partnersList];
    next[index] = { ...next[index], [field]: value };
    setPartnersList(next);
  };

  const removePartner = (index: number) => {
    setPartnersList(partnersList.filter((_, i) => i !== index));
  };

  const movePartner = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= partnersList.length) return;
    const next = [...partnersList];
    [next[index], next[target]] = [next[target], next[index]];
    setPartnersList(next);
  };

  // Bento helpers
  const bentoList: SalespageBentoItem[] =
    Array.isArray(data?.bentoItems) && data.bentoItems.length > 0
      ? data.bentoItems
      : DEFAULT_SALESPAGE_CONFIG.bentoItems.map((item) => ({ ...item, imageUrl: '' }));

  const setBentoList = (next: SalespageBentoItem[]) => updateData('bentoItems', next);

  const addBentoItem = () => {
    setBentoList([
      ...bentoList,
      {
        id: `bento-${Date.now()}`,
        category: 'Fitur Unggulan',
        title: '',
        description: '',
        imageUrl: '',
        videoUrl: '',
        videoMode: 'click',
        videoFit: 'auto',
        span: 'normal',
      },
    ]);
  };

  const updateBentoItem = (index: number, field: keyof SalespageBentoItem, value: string) => {
    const next = [...bentoList];
    next[index] = { ...next[index], [field]: value };
    setBentoList(next);
  };

  const removeBentoItem = (index: number) => {
    setBentoList(bentoList.filter((_, i) => i !== index));
  };

  const moveBentoItem = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= bentoList.length) return;
    const next = [...bentoList];
    [next[index], next[target]] = [next[target], next[index]];
    setBentoList(next);
  };

  // Carousel Showcase helpers
  const carouselList: SalespageCarouselItem[] =
    Array.isArray(data?.featuresCarouselData) && data.featuresCarouselData.length > 0
      ? data.featuresCarouselData
      : DEFAULT_SALESPAGE_CONFIG.featuresCarouselData.map((item) => ({ ...item, img: '' }));

  const setCarouselList = (next: SalespageCarouselItem[]) => updateData('featuresCarouselData', next);

  const addCarouselItem = () => {
    setCarouselList([
      ...carouselList,
      { title: '', description: '', img: '', videoUrl: '', videoMode: 'click', videoFit: 'auto', link: '' },
    ]);
  };

  const updateCarouselItem = (index: number, field: keyof SalespageCarouselItem, value: string) => {
    const next = [...carouselList];
    next[index] = { ...next[index], [field]: value };
    setCarouselList(next);
  };

  const removeCarouselItem = (index: number) => {
    setCarouselList(carouselList.filter((_, i) => i !== index));
  };

  // FAQ helpers
  const faqList: SalespageFaqItem[] =
    Array.isArray(data?.faqItems) && data.faqItems.length > 0
      ? data.faqItems
      : DEFAULT_SALESPAGE_CONFIG.faqItems;

  const setFaqList = (next: SalespageFaqItem[]) => updateData('faqItems', next);

  const addFaqItem = () => {
    setFaqList([...faqList, { question: '', answer: '' }]);
  };

  const updateFaqItem = (index: number, field: keyof SalespageFaqItem, value: string) => {
    const next = [...faqList];
    next[index] = { ...next[index], [field]: value };
    setFaqList(next);
  };

  const removeFaqItem = (index: number) => {
    setFaqList(faqList.filter((_, i) => i !== index));
  };

  const handleResetToDefault = async () => {
    const confirmed = await showConfirm(
      'Reset ke Pengaturan Default?',
      'Seluruh draf teks, gambar kustom, dan daftar partner di formulir ini akan dikembalikan ke bawaan Guestly V2.5.2. Klik "Simpan Perubahan" setelahnya untuk menerapkan ke halaman publik.'
    );
    if (!confirmed) return;

    if (onReplaceData) {
      onReplaceData({});
    } else {
      Object.keys(data || {}).forEach((k) => updateData(k, undefined));
    }
    showAlert(
      'Draf Direset',
      'Formulir telah dikembalikan ke konten default. Klik "Simpan Perubahan" untuk menyimpan ke database.',
      'info'
    );
  };

  const getDefaultBentoFallback = (id: string) => {
    if (id === 'bento-qr') return SALESPAGE_DEFAULT_ASSETS.bentoQr;
    if (id === 'bento-tv') return SALESPAGE_DEFAULT_ASSETS.bentoWelcome;
    if (id === 'bento-souvenir') return SALESPAGE_DEFAULT_ASSETS.bentoSouvenir;
    return undefined;
  };

  return (
    <div className="space-y-6">
      {/* Studio Utility Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
        <div>
          <p className="text-sm font-semibold text-gray-900">CMS Dinamis Halaman Salespage</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Kosongkan kolom untuk memakai konten atau foto editorial bawaan Guestly. Semua gambar mendukung Upload langsung maupun URL.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Lihat Salespage
          </a>
          <button
            type="button"
            onClick={handleResetToDefault}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-300 text-gray-700 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Default
          </button>
        </div>
      </div>

      {/* Section Switcher Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar border-b border-gray-200">
        {SECTION_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/60'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SECTION 1: HERO & CTA */}
      {activeSection === 'hero' && (
        <div className="space-y-5 border border-gray-200 rounded-xl p-5 bg-gray-50">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Hero Section (Layout, Media &amp; Video Dinamis)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Pilih gaya tampilan Hero (Split 2 Kolom atau Full Background dengan area teks buram), atur foto, serta tautan video tanpa beban server.
            </p>
          </div>

          {/* Hero Layout & Blur Controls */}
          <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Pilihan Layout Hero</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateData('heroLayout', 'split')}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all ${
                    resolved.heroLayout === 'split'
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600/20'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <Columns2
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      resolved.heroLayout === 'split' ? 'text-indigo-600' : 'text-gray-400'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Split 2 Kolom</div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Narasi &amp; tombol di sisi kiri, bingkai foto atau video rapi di sisi kanan.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => updateData('heroLayout', 'fullbg')}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all ${
                    resolved.heroLayout === 'fullbg'
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600/20'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <Maximize2
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      resolved.heroLayout === 'fullbg' ? 'text-indigo-600' : 'text-gray-400'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Full Background (Area Teks Buram)</div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Foto/video penuh 1 section dengan lapisan buram elegan di belakang area teks.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {resolved.heroLayout === 'fullbg' && (
              <div className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Gaya Efek Buram Area Teks
                  </label>
                  <select
                    value={resolved.heroBlurStyle}
                    onChange={(e) => updateData('heroBlurStyle', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="gradient">Seamless Gradient Blur (Tanpa Kotak, Memudar Halus)</option>
                    <option value="card">Panel Kaca Buram (Frosted Glass Card)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Nuansa Lapisan Buram
                  </label>
                  <select
                    value={resolved.heroBlurTone}
                    onChange={(e) => updateData('heroBlurTone', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="dark">Dark Frosted (Gelap Mewah · Teks Putih)</option>
                    <option value="light">Light Ivory Frosted (Terang Gading · Teks Gelap)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Label Pembuka (Kicker)</label>
              <input
                type="text"
                value={data?.heroKicker ?? ''}
                onChange={(e) => updateData('heroKicker', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.heroKicker}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Judul Utama (Headline)</label>
              <textarea
                value={data?.heroTitle ?? ''}
                onChange={(e) => updateData('heroTitle', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.heroTitle}
                rows={2}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frasa Penekanan (Warna Burgundy)
              </label>
              <input
                type="text"
                value={data?.heroHighlight ?? ''}
                onChange={(e) => updateData('heroHighlight', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.heroHighlight}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Harus cocok dengan potongan kata di Judul Utama agar otomatis diberi warna aksen Burgundy.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Poin Bukti Konkret (1 baris per poin)
              </label>
              <textarea
                value={data?.heroProofPoints ?? ''}
                onChange={(e) => updateData('heroProofPoints', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.heroProofPoints}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Pendek (Subtitle)</label>
              <textarea
                value={data?.heroSubtitle ?? ''}
                onChange={(e) => updateData('heroSubtitle', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.heroSubtitle}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teks Tombol CTA Utama</label>
              <input
                type="text"
                value={data?.heroCtaPrimary ?? ''}
                onChange={(e) => updateData('heroCtaPrimary', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.heroCtaPrimary}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teks Aksi Sekunder</label>
              <input
                type="text"
                value={data?.heroCtaSecondary ?? ''}
                onChange={(e) => updateData('heroCtaSecondary', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.heroCtaSecondary}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200 space-y-4">
            <SalespageImageField
              label="Gambar Hero / Poster Video (Disarankan Landscape / 4:3)"
              value={data?.heroImage || ''}
              onChange={(url) => updateData('heroImage', url)}
              fallbackPreview={SALESPAGE_DEFAULT_ASSETS.hero}
              helperText="Digunakan sebagai visual Hero sekaligus poster/thumbnail instan saat Video Hero diaktifkan."
            />

            {/* Zero-Server-Load Video Hero Settings */}
            <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-3">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-sm font-semibold text-gray-900">
                  Video Hero (Opsional — 0% Beban Server)
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Tempel link <strong>YouTube</strong>, <strong>Vimeo</strong>, atau tautan langsung <strong>.mp4 / .webm CDN</strong>. Streaming ditangani penuh oleh penyedia video sehingga server aplikasi tidak terbebani.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">URL Video Hero</label>
                  <input
                    type="text"
                    value={data?.heroVideoUrl ?? ''}
                    onChange={(e) => updateData('heroVideoUrl', e.target.value)}
                    placeholder="https://youtube.com/shorts/... atau https://youtu.be/... atau https://cdn.../hero.mp4"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mode Pemutaran</label>
                  <select
                    value={resolved.heroVideoMode}
                    onChange={(e) => updateData('heroVideoMode', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="click">Klik untuk Putar (Paling Ringan)</option>
                    <option value="autoplay">Putar Otomatis (Autoplay Loop)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Orientasi & Framing Video
                  </label>
                  <select
                    value={resolved.heroVideoFit}
                    onChange={(e) => updateData('heroVideoFit', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="auto">Otomatis (Deteksi Portrait / Utuh)</option>
                    <option value="portrait">Portrait 9:16 (Reels / Shorts — Tanpa Terpotong)</option>
                    <option value="contain">Tampil Utuh / Fit (Tanpa Terpotong)</option>
                    <option value="cover">Penuhi Bingkai (Full Bleed Landscape)</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 leading-relaxed">
                Tips: Jika memakai video vertikal di YouTube (<code>youtu.be</code> / <code>watch?v=</code> / <code>shorts</code>), pilih <strong>Portrait 9:16</strong> agar sisi hitam kanan-kiri hilang dan judul YouTube otomatis tersembunyi. Untuk hasil paling bersih tanpa tombol jeda bawaan YouTube sama sekali, gunakan tautan langsung <code>.mp4 / .webm</code> CDN.
              </p>

              {getHeroVideoSourceLabel(data?.heroVideoUrl) && (
                <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">
                  Terdeteksi: {getHeroVideoSourceLabel(data?.heroVideoUrl)}
                </p>
              )}
            </div>

            {resolved.heroLayout === 'split' && (
              <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resolved.heroOverlayEnabled}
                    onChange={(e) => updateData('heroOverlayEnabled', e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-800">
                    Tampilkan keterangan sorotan tipis di bagian bawah foto Hero (Mode Split)
                  </span>
                </label>

                {resolved.heroOverlayEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Label Singkat</label>
                      <input
                        type="text"
                        value={data?.heroOverlayLabel ?? ''}
                        onChange={(e) => updateData('heroOverlayLabel', e.target.value)}
                        placeholder={DEFAULT_SALESPAGE_CONFIG.heroOverlayLabel}
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Kalimat Sorotan</label>
                      <input
                        type="text"
                        value={data?.heroOverlayTitle ?? ''}
                        onChange={(e) => updateData('heroOverlayTitle', e.target.value)}
                        placeholder={DEFAULT_SALESPAGE_CONFIG.heroOverlayTitle}
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: OUR PARTNER */}
      {activeSection === 'partners' && (
        <div className="space-y-5 border border-gray-200 rounded-xl p-5 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Section Our Partner (Marquee Monokrom)</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Tampil tepat di bawah Hero. Logo otomatis tampil monokrom elegan dan berwarna saat kursor diarahkan.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200">
              <input
                type="checkbox"
                checked={resolved.partnersEnabled}
                onChange={(e) => updateData('partnersEnabled', e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium text-gray-800 whitespace-nowrap">Tampilkan Section</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Judul Label Partner</label>
              <input
                type="text"
                value={data?.partnersTitle ?? ''}
                onChange={(e) => updateData('partnersTitle', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.partnersTitle}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ukuran Tampil Logo</label>
              <select
                value={resolved.partnersLogoSize}
                onChange={(e) => updateData('partnersLogoSize', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="sm">Ringkas (56–80 px)</option>
                <option value="md">Standar Ideal (80–112 px)</option>
                <option value="lg">Ekstra Besar (96–144 px)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Daftar Partner ({partnersList.length})</label>
              <button
                type="button"
                onClick={addPartner}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Partner
              </button>
            </div>

            {partnersList.length === 0 ? (
              <div className="p-6 text-center bg-white border border-dashed border-gray-300 rounded-lg text-sm text-gray-500">
                Belum ada partner. Klik "Tambah Partner" untuk mulai menambahkan logo mitra.
              </div>
            ) : (
              partnersList.map((partner, index) => (
                <div
                  key={partner.id || index}
                  className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-500">Partner #{index + 1}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => movePartner(index, -1)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100"
                        title="Pindah ke atas"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === partnersList.length - 1}
                        onClick={() => movePartner(index, 1)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100"
                        title="Pindah ke bawah"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePartner(index)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                        title="Hapus partner"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nama Partner / Venue / WO</label>
                      <input
                        type="text"
                        value={partner.name || ''}
                        onChange={(e) => updatePartner(index, 'name', e.target.value)}
                        placeholder="cth: Aurelia Grand Ballroom"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tautan Website / IG (Opsional)</label>
                      <input
                        type="text"
                        value={partner.websiteUrl || ''}
                        onChange={(e) => updatePartner(index, 'websiteUrl', e.target.value)}
                        placeholder="https://..."
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                  </div>

                  <SalespageImageField
                    label="Logo Partner (PNG/SVG transparan disarankan)"
                    value={partner.logoUrl || ''}
                    onChange={(url) => updatePartner(index, 'logoUrl', url)}
                    previewMode="logo"
                    helperText="Jika logo kosong, nama partner akan otomatis tampil sebagai tipografi wordmark elegan."
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: STATISTIK */}
      {activeSection === 'stats' && (
        <div className="space-y-5 border border-gray-200 rounded-xl p-5 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Baris Statistik & Bukti Angka</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                4 metrik presisi di bawah section Our Partner. Gunakan mode Manual/Custom untuk mengisi angka sendiri, atau Data Live untuk menarik total otomatis dari database.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shrink-0">
              <button
                type="button"
                onClick={() => updateData('statsUseLive', false)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  !resolved.statsUseLive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Manual / Custom
              </button>
              <button
                type="button"
                onClick={() => updateData('statsUseLive', true)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  resolved.statsUseLive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Data Live DB
              </button>
            </div>
          </div>

          {resolved.statsUseLive && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
              Mode <strong>Data Live DB</strong> sedang aktif: Nilai Angka pada Metrik #1 (Acara) dan Metrik #2 (Tamu) otomatis diganti oleh jumlah real dari database. Pilih <strong>Manual / Custom</strong> jika ingin menampilkan angka custom/dummy sesuai isian di bawah.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((num) => {
              const isOverriddenByLive = resolved.statsUseLive && (num === 1 || num === 2);
              return (
                <div key={num} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-indigo-700">Metrik #{num}</span>
                    {isOverriddenByLive && (
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        Otomatis Live DB
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Angka</label>
                    <input
                      type="text"
                      value={data?.[`stat${num}Value`] ?? ''}
                      onChange={(e) => updateData(`stat${num}Value`, e.target.value)}
                      placeholder={(DEFAULT_SALESPAGE_CONFIG as any)[`stat${num}Value`]}
                      className={`w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm ${
                        isOverriddenByLive ? 'bg-gray-50 text-gray-500' : 'bg-white'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Label Utama</label>
                    <input
                      type="text"
                      value={data?.[`stat${num}Label`] ?? ''}
                      onChange={(e) => updateData(`stat${num}Label`, e.target.value)}
                      placeholder={(DEFAULT_SALESPAGE_CONFIG as any)[`stat${num}Label`]}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan Ringkas</label>
                    <input
                      type="text"
                      value={data?.[`stat${num}Caption`] ?? ''}
                      onChange={(e) => updateData(`stat${num}Caption`, e.target.value)}
                      placeholder={(DEFAULT_SALESPAGE_CONFIG as any)[`stat${num}Caption`]}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 4: BENTO FITUR */}
      {activeSection === 'bento' && (
        <div className="space-y-5 border border-gray-200 rounded-xl p-5 bg-gray-50">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Bento Fitur Unggulan (Asimetris)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Kartu bertipe "Lebar" tampil penuh secara horizontal (sorotan utama), sedangkan "Standar" tersusun rapi 2 kolom seimbang di layar desktop.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label Pembuka Seksi</label>
              <input
                type="text"
                value={data?.bentoKicker ?? ''}
                onChange={(e) => updateData('bentoKicker', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.bentoKicker}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Judul Seksi Fitur</label>
              <input
                type="text"
                value={data?.bentoTitle ?? ''}
                onChange={(e) => updateData('bentoTitle', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.bentoTitle}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Seksi</label>
              <textarea
                value={data?.bentoSubtitle ?? ''}
                onChange={(e) => updateData('bentoSubtitle', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.bentoSubtitle}
                rows={2}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Kartu Fitur ({bentoList.length})</label>
              <button
                type="button"
                onClick={addBentoItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Kartu Fitur
              </button>
            </div>

            {bentoList.map((item, index) => (
              <div key={item.id || index} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-500">Kartu #{index + 1}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveBentoItem(index, -1)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === bentoList.length - 1}
                      onClick={() => moveBentoItem(index, 1)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBentoItem(index)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Kategori Singkat</label>
                    <input
                      type="text"
                      value={item.category || ''}
                      onChange={(e) => updateBentoItem(index, 'category', e.target.value)}
                      placeholder="cth: Gate & Check-In"
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ukuran Kartu Desktop</label>
                    <select
                      value={item.span || 'normal'}
                      onChange={(e) => updateBentoItem(index, 'span', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                    >
                      <option value="wide">Lebar (Sorotan Utama)</option>
                      <option value="normal">Standar (1/3 Kolom)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Judul Fitur</label>
                    <input
                      type="text"
                      value={item.title || ''}
                      onChange={(e) => updateBentoItem(index, 'title', e.target.value)}
                      placeholder="Judul kapabilitas..."
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
                  <textarea
                    value={item.description || ''}
                    onChange={(e) => updateBentoItem(index, 'description', e.target.value)}
                    rows={2}
                    placeholder="Jelaskan manfaat nyata fitur ini..."
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                  />
                </div>

                <SalespageImageField
                  label="Foto / Poster Fitur (Opsional)"
                  value={item.imageUrl || ''}
                  onChange={(url) => updateBentoItem(index, 'imageUrl', url)}
                  fallbackPreview={getDefaultBentoFallback(item.id)}
                  helperText="Jika Mode Video diisi, foto ini otomatis menjadi cover/poster sebelum video diputar."
                />

                <SalespageVideoField
                  label="Video Kartu Fitur (Opsional)"
                  videoUrl={item.videoUrl || ''}
                  videoMode={item.videoMode === 'autoplay' ? 'autoplay' : 'click'}
                  videoFit={item.videoFit || 'auto'}
                  onChangeUrl={(url) => updateBentoItem(index, 'videoUrl', url)}
                  onChangeMode={(mode) => updateBentoItem(index, 'videoMode', mode)}
                  onChangeFit={(fit) => updateBentoItem(index, 'videoFit', fit)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 5: MASALAH, SOLUSI & GALERI */}
      {activeSection === 'showcase' && (
        <div className="space-y-6">
          {/* Dark Luxury Problem & Solution */}
          <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-gray-50">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Bab Gelap Mewah: Masalah & Solusi</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Tampil dengan latar Deep Obsidian Charcoal untuk kontras editorial yang tegas.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label Pembuka Bab Gelap</label>
                <input
                  type="text"
                  value={data?.darkSectionKicker ?? ''}
                  onChange={(e) => updateData('darkSectionKicker', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.darkSectionKicker}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul Masalah</label>
                <input
                  type="text"
                  value={data?.problemTitle ?? ''}
                  onChange={(e) => updateData('problemTitle', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.problemTitle}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>

            <SalespageImageField
              label="Foto / Poster Bab Gelap"
              value={data?.problemImage || ''}
              onChange={(url) => updateData('problemImage', url)}
              fallbackPreview={SALESPAGE_DEFAULT_ASSETS.darkBallroom}
              helperText="Upload foto suasana ballroom/resepsi bernuansa hangat atau gelap (menjadi poster jika video diisi)."
            />

            <SalespageVideoField
              label="Video Bab Gelap Masalah & Solusi (Opsional)"
              videoUrl={data?.problemVideoUrl || ''}
              videoMode={resolved.problemVideoMode}
              videoFit={resolved.problemVideoFit}
              onChangeUrl={(url) => updateData('problemVideoUrl', url)}
              onChangeMode={(mode) => updateData('problemVideoMode', mode)}
              onChangeFit={(fit) => updateData('problemVideoFit', fit)}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Daftar Poin Masalah (1 poin per baris)
              </label>
              <textarea
                value={data?.problemItems ?? ''}
                onChange={(e) => updateData('problemItems', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.problemItems}
                rows={4}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>

            <div className="pt-4 border-t border-gray-200 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul Solusi Guestly</label>
                <input
                  type="text"
                  value={data?.solutionTitle ?? ''}
                  onChange={(e) => updateData('solutionTitle', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.solutionTitle}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Solusi</label>
                <textarea
                  value={data?.solutionDesc ?? ''}
                  onChange={(e) => updateData('solutionDesc', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.solutionDesc}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          {/* Interactive Feature Gallery Carousel */}
          <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-gray-50">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Galeri Preview Produk Interaktif</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pengunjung dapat mengklik tiap tab fitur untuk melihat foto/tangkapan layar sistem secara langsung.
                </p>
              </div>
              <button
                type="button"
                onClick={addCarouselItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Slide
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul Galeri</label>
                <input
                  type="text"
                  value={data?.featuresCarouselTitle ?? ''}
                  onChange={(e) => updateData('featuresCarouselTitle', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.featuresCarouselTitle}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Singkat Galeri</label>
                <input
                  type="text"
                  value={data?.featuresCarouselDesc ?? ''}
                  onChange={(e) => updateData('featuresCarouselDesc', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.featuresCarouselDesc}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>

            <div className="space-y-3">
              {carouselList.map((item, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-500">Slide #{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeCarouselItem(index)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                      title="Hapus slide"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Judul Slide</label>
                      <input
                        type="text"
                        value={item.title || ''}
                        onChange={(e) => updateCarouselItem(index, 'title', e.target.value)}
                        placeholder="cth: Registrasi QR & Pencarian Instan"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Link Tujuan (Opsional)</label>
                      <input
                        type="text"
                        value={item.link || ''}
                        onChange={(e) => updateCarouselItem(index, 'link', e.target.value)}
                        placeholder="https://..."
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Penjelasan Singkat</label>
                    <textarea
                      value={item.description || ''}
                      onChange={(e) => updateCarouselItem(index, 'description', e.target.value)}
                      rows={2}
                      placeholder="Deskripsi singkat tentang fitur pada slide ini..."
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                    />
                  </div>

                  <SalespageImageField
                    label="Gambar / Poster Preview Slide"
                    value={item.img || ''}
                    onChange={(url) => updateCarouselItem(index, 'img', url)}
                    fallbackPreview={
                      DEFAULT_SALESPAGE_CONFIG.featuresCarouselData[
                        index % DEFAULT_SALESPAGE_CONFIG.featuresCarouselData.length
                      ]?.img
                    }
                  />

                  <SalespageVideoField
                    label="Video Preview Slide (Opsional)"
                    videoUrl={item.videoUrl || ''}
                    videoMode={item.videoMode === 'autoplay' ? 'autoplay' : 'click'}
                    videoFit={item.videoFit || 'auto'}
                    onChangeUrl={(url) => updateCarouselItem(index, 'videoUrl', url)}
                    onChangeMode={(mode) => updateCarouselItem(index, 'videoMode', mode)}
                    onChangeFit={(fit) => updateCarouselItem(index, 'videoFit', fit)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: ALUR KERJA 01-04 */}
      {activeSection === 'steps' && (
        <div className="space-y-5 border border-gray-200 rounded-xl p-5 bg-gray-50">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Alur Kerja Editorial (01 – 04)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Ditampilkan bernomor presisi di dalam bab gelap untuk menjelaskan tahapan penggunaan Guestly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Judul Seksi Alur Kerja</label>
              <input
                type="text"
                value={data?.stepsTitle ?? ''}
                onChange={(e) => updateData('stepsTitle', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.stepsTitle}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subjudul Alur Kerja</label>
              <input
                type="text"
                value={data?.stepsSubtitle ?? ''}
                onChange={(e) => updateData('stepsSubtitle', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.stepsSubtitle}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2.5">
                <span className="text-xs font-mono font-semibold text-indigo-700">0{step}</span>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Judul Langkah {step}</label>
                  <input
                    type="text"
                    value={data?.[`s${step}Title`] ?? ''}
                    onChange={(e) => updateData(`s${step}Title`, e.target.value)}
                    placeholder={(DEFAULT_SALESPAGE_CONFIG as any)[`s${step}Title`]}
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi Langkah {step}</label>
                  <textarea
                    value={data?.[`s${step}Desc`] ?? ''}
                    onChange={(e) => updateData(`s${step}Desc`, e.target.value)}
                    placeholder={(DEFAULT_SALESPAGE_CONFIG as any)[`s${step}Desc`]}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 7: HARGA, FAQ, CTA PENUTUP & FOOTER */}
      {activeSection === 'closing' && (
        <div className="space-y-6">
          {/* Pricing & Testimonials Headings */}
          <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-gray-50">
            <h3 className="text-base font-semibold text-gray-900">Tajuk Paket Harga & Testimoni</h3>
            <p className="text-xs text-gray-500">
              Daftar paket harga otomatis ditarik dari menu Layanan (Services) dan ulasan otomatis ditarik dari koleksi Testimoni.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label Seksi Harga</label>
                <input
                  type="text"
                  value={data?.pricingKicker ?? ''}
                  onChange={(e) => updateData('pricingKicker', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.pricingKicker}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul Seksi Harga</label>
                <input
                  type="text"
                  value={data?.pricingTitle ?? ''}
                  onChange={(e) => updateData('pricingTitle', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.pricingTitle}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Subjudul Harga</label>
                <input
                  type="text"
                  value={data?.pricingSubtitle ?? ''}
                  onChange={(e) => updateData('pricingSubtitle', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.pricingSubtitle}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Bawah Harga</label>
                <input
                  type="text"
                  value={data?.pricingFootnote ?? ''}
                  onChange={(e) => updateData('pricingFootnote', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.pricingFootnote}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul Seksi Testimoni</label>
                <input
                  type="text"
                  value={data?.testimonialsTitle ?? ''}
                  onChange={(e) => updateData('testimonialsTitle', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.testimonialsTitle}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          {/* FAQ CRUD */}
          <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">FAQ (Pertanyaan Umum)</h3>
              <button
                type="button"
                onClick={addFaqItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah FAQ
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Judul Seksi FAQ</label>
              <input
                type="text"
                value={data?.faqTitle ?? ''}
                onChange={(e) => updateData('faqTitle', e.target.value)}
                placeholder={DEFAULT_SALESPAGE_CONFIG.faqTitle}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>

            <div className="space-y-3">
              {faqList.map((faq, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">FAQ #{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeFaqItem(index)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={faq.question}
                    onChange={(e) => updateFaqItem(index, 'question', e.target.value)}
                    placeholder="Pertanyaan..."
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                  />
                  <textarea
                    value={faq.answer}
                    onChange={(e) => updateFaqItem(index, 'answer', e.target.value)}
                    rows={2}
                    placeholder="Jawaban singkat dan jelas..."
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Closing CTA Banner */}
          <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-gray-50">
            <h3 className="text-base font-semibold text-gray-900">Banner CTA Penutup</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul Banner CTA</label>
                <input
                  type="text"
                  value={data?.ctaTitle ?? ''}
                  onChange={(e) => updateData('ctaTitle', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.ctaTitle}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi CTA</label>
                <textarea
                  value={data?.ctaDesc ?? ''}
                  onChange={(e) => updateData('ctaDesc', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.ctaDesc}
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teks Tombol Utama</label>
                <input
                  type="text"
                  value={data?.ctaPrimaryText ?? ''}
                  onChange={(e) => updateData('ctaPrimaryText', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.ctaPrimaryText}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teks Tombol WhatsApp</label>
                <input
                  type="text"
                  value={data?.ctaSecondaryText ?? ''}
                  onChange={(e) => updateData('ctaSecondaryText', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.ctaSecondaryText}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          {/* Footer Contact & Social */}
          <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-gray-50">
            <h3 className="text-base font-semibold text-gray-900">Informasi Footer & Sosial Media</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Singkat Brand</label>
                <textarea
                  value={data?.footerDescription ?? ''}
                  onChange={(e) => updateData('footerDescription', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.footerDescription}
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Kontak</label>
                <input
                  type="email"
                  value={data?.footerEmail ?? ''}
                  onChange={(e) => updateData('footerEmail', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.footerEmail}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor WhatsApp / Telepon</label>
                <input
                  type="text"
                  value={data?.footerPhone ?? ''}
                  onChange={(e) => updateData('footerPhone', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.footerPhone}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi / Alamat</label>
                <input
                  type="text"
                  value={data?.footerAddress ?? ''}
                  onChange={(e) => updateData('footerAddress', e.target.value)}
                  placeholder={DEFAULT_SALESPAGE_CONFIG.footerAddress}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Instagram (Opsional)</label>
                <input
                  type="text"
                  value={data?.footerInstagram ?? ''}
                  onChange={(e) => updateData('footerInstagram', e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Facebook (Opsional)</label>
                <input
                  type="text"
                  value={data?.footerFacebook ?? ''}
                  onChange={(e) => updateData('footerFacebook', e.target.value)}
                  placeholder="https://facebook.com/..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL YouTube (Opsional)</label>
                <input
                  type="text"
                  value={data?.footerYoutube ?? ''}
                  onChange={(e) => updateData('footerYoutube', e.target.value)}
                  placeholder="https://youtube.com/..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
