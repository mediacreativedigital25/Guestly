import React, { useEffect, useState } from 'react';
import { GreetingScreenTemplate } from '../../types';
import {
  greetingTemplateService,
  DEFAULT_GREETING_TEMPLATES,
  DEFAULT_GREETING_COUPLE_BG_URL,
} from '../../services/greetingTemplateService';
import { MediaUploader } from '../../components/media/MediaUploader';
import { GreetingScreenCanvas } from '../../components/GreetingScreenCanvas';
import { mediaService } from '../../services/media/media.service';
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  Copy,
  Star,
  Image as ImageIcon,
  X,
  HelpCircle,
  Monitor,
  UserCheck,
  Clock,
  Users,
} from 'lucide-react';
import { showAlert, showConfirm, showCancelAlert } from '../../lib/alerts';

const CHATGPT_GREETING_PROMPT = `Tolong buatkan gambar desain "Blank Background Template dengan Foto Mempelai di Kiri" (Tanpa Teks Apapun) khusus untuk Layar Sapa (Welcome Greeting Screen TV/Proyektor) acara pernikahan digital dengan spesifikasi tata letak (layout) SANGAT KETAT berikut agar bisa ditumpuk dengan teks sambutan tamu dinamis di aplikasi web saya:

1. UKURAN & RASIO:
- Orientasi: Landscape (Horizontal), Rasio 16:9 (1920 x 1080 px), memenuhi penuh seluruh kanvas (full-bleed dari ujung ke ujung tanpa margin luar).

2. ZONA TATA LETAK (JANGAN ISI DENGAN TEKS APAPUN):
- Sisi Kiri (X: 0% s/d 38%): Tampilkan Foto Sepasang Mempelai Pernikahan Indonesia yang anggun dan romantis (mempelai pria mengenakan jas krem/beige dengan dasi kupu-kupu, mempelai wanita mengenakan kebaya/gaun pengantin renda putih berhijab sambil memegang buket bunga mawar blush & putih) dengan latar belakang lengkungan bunga pelaminan bokeh lembut di belakang mereka.
- Dekorasi Bunga Sudut: Rangkaian bunga mawar blush pink, mawar putih, daun eucalyptus hijau, daun emas (gold leaves), dan tirai tipis di sudut Kiri Atas, Kanan Atas, Kiri Bawah, dan Kanan Bawah.
- Sisi Kanan (X: 40% s/d 96%, Y: 8% s/d 84%): Biarkan BERSIH, KOSONG, dan rata berwarna Warm Cream terang (#FAF4EE) tanpa teks apapun karena sistem aplikasi akan menampilkan secara otomatis:
  1) Judul "SELAMAT DATANG"
  2) Sapaan "BAPAK/IBU" dan Kotak Nama Tamu ("Iklas Padli")
  3) Teks "DI ACARA PERNIKAHAN" dan Nama Kaligrafi Mempelai ("Fredi & Lony")
  4) Badge Status "CHECK-IN BERHASIL"
  5) Baris Info Tanggal, Jam ("Pukul 10.00 WIB"), dan Lokasi Gedung.
- Pita Bawah / Footer (Y: 85% s/d 100%): Pita horizontal berwarna Dusty Rose (#C48481) polos tanpa teks di bagian bawah, dihiasi rangkaian bunga di sudut kiri bawah dan kanan bawah (teks "Terima kasih atas kehadiran dan doa restunya." akan ditambahkan otomatis oleh sistem).

3. ATURAN MUTLAK:
- JANGAN menulis huruf, angka, kata, logo, atau teks placeholder apapun di dalam gambar.
- Hasilkan murni desain Background 16:9 dengan Foto Mempelai di sisi kiri + area kosong krem di sisi kanan + pita bawah polos + bunga sudut.`;

const generateId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'greet-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);

export default function AdminGreetingTemplates() {
  const [templates, setTemplates] = useState<GreetingScreenTemplate[]>(DEFAULT_GREETING_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPromptGuide, setShowPromptGuide] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GreetingScreenTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<'welcome' | 'standby'>('welcome');
  const [previewGuestName, setPreviewGuestName] = useState<string>('Iklas Padli');

  const [formData, setFormData] = useState<{
    name: string;
    imageUrl: string;
    couplePhotoUrl: string;
    r2Key: string;
    primaryColor: string;
    accentColor: string;
    coupleNameColor: string;
    guestBoxBg: string;
    footerColor: string;
    showFooterStrip: boolean;
    isDefault: boolean;
  }>({
    name: '',
    imageUrl: DEFAULT_GREETING_COUPLE_BG_URL,
    couplePhotoUrl: '',
    r2Key: '',
    primaryColor: '#12392F',
    accentColor: '#C98583',
    coupleNameColor: '#9B6B34',
    guestBoxBg: '#F2E2DC',
    footerColor: '#C48481',
    showFooterStrip: true,
    isDefault: false,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const list = await greetingTemplateService.getTemplates();
      setTemplates(list);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (tpl?: GreetingScreenTemplate) => {
    if (tpl) {
      setEditingTemplate(tpl);
      setFormData({
        name: tpl.name,
        imageUrl: tpl.imageUrl || DEFAULT_GREETING_COUPLE_BG_URL,
        couplePhotoUrl: tpl.couplePhotoUrl || '',
        r2Key: tpl.r2Key || '',
        primaryColor: tpl.primaryColor || '#12392F',
        accentColor: tpl.accentColor || '#C98583',
        coupleNameColor: tpl.coupleNameColor || '#9B6B34',
        guestBoxBg: tpl.guestBoxBg || '#F2E2DC',
        footerColor: tpl.footerColor || '#C48481',
        showFooterStrip: tpl.showFooterStrip !== false,
        isDefault: Boolean(tpl.isDefault),
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        imageUrl: DEFAULT_GREETING_COUPLE_BG_URL,
        couplePhotoUrl: '',
        r2Key: '',
        primaryColor: '#12392F',
        accentColor: '#C98583',
        coupleNameColor: '#9B6B34',
        guestBoxBg: '#F2E2DC',
        footerColor: '#C48481',
        showFooterStrip: true,
        isDefault: templates.length === 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showAlert('Peringatan', 'Nama template Layar Sapa wajib diisi.', 'warning');
      return;
    }

    setSaving(true);
    try {
      let nextList: GreetingScreenTemplate[];
      const now = new Date().toISOString();

      if (editingTemplate) {
        nextList = templates.map((t) =>
          t.id === editingTemplate.id
            ? {
                ...t,
                name: formData.name.trim(),
                imageUrl: formData.imageUrl.trim() || DEFAULT_GREETING_COUPLE_BG_URL,
                couplePhotoUrl: formData.couplePhotoUrl.trim() || undefined,
                r2Key: formData.r2Key || t.r2Key,
                primaryColor: formData.primaryColor,
                accentColor: formData.accentColor,
                coupleNameColor: formData.coupleNameColor,
                guestBoxBg: formData.guestBoxBg,
                footerColor: formData.footerColor,
                showFooterStrip: formData.showFooterStrip,
                isDefault: formData.isDefault,
                updatedAt: now,
              }
            : formData.isDefault
            ? { ...t, isDefault: false }
            : t
        );
      } else {
        const newTpl: GreetingScreenTemplate = {
          id: generateId(),
          name: formData.name.trim(),
          imageUrl: formData.imageUrl.trim() || DEFAULT_GREETING_COUPLE_BG_URL,
          couplePhotoUrl: formData.couplePhotoUrl.trim() || undefined,
          r2Key: formData.r2Key || undefined,
          primaryColor: formData.primaryColor,
          accentColor: formData.accentColor,
          coupleNameColor: formData.coupleNameColor,
          guestBoxBg: formData.guestBoxBg,
          footerColor: formData.footerColor,
          showFooterStrip: formData.showFooterStrip,
          isDefault: formData.isDefault,
          createdAt: now,
          updatedAt: now,
        };
        nextList = formData.isDefault
          ? [...templates.map((t) => ({ ...t, isDefault: false })), newTpl]
          : [...templates, newTpl];
      }

      if (!nextList.some((t) => t.isDefault) && nextList.length > 0) {
        nextList[0].isDefault = true;
      }

      await greetingTemplateService.saveTemplates(nextList);
      setTemplates(nextList);
      setIsModalOpen(false);
      showAlert(
        'Berhasil',
        editingTemplate
          ? 'Template Layar Sapa berhasil diperbarui.'
          : 'Template Layar Sapa berhasil disimpan ke katalog.',
        'success'
      );
    } catch (err) {
      console.error('Error saving Layar Sapa template:', err);
      showAlert('Gagal', 'Gagal menyimpan template Layar Sapa.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (tplId: string) => {
    try {
      const nextList = templates.map((t) => ({
        ...t,
        isDefault: t.id === tplId,
      }));
      await greetingTemplateService.saveTemplates(nextList);
      setTemplates(nextList);
      showAlert('Berhasil', 'Template Layar Sapa default berhasil diperbarui.', 'success');
    } catch {
      showAlert('Gagal', 'Gagal mengubah template default.', 'error');
    }
  };

  const handleDelete = async (tpl: GreetingScreenTemplate) => {
    if (templates.length <= 1) {
      showAlert('Peringatan', 'Minimal harus ada 1 template Layar Sapa di dalam katalog.', 'warning');
      return;
    }
    const ok = await showConfirm(`Hapus template "${tpl.name}" dari katalog Layar Sapa?`);
    if (!ok) return;

    try {
      if (tpl.r2Key && tpl.r2Key.startsWith('Layar Sapa/')) {
        await mediaService.deleteMedia(tpl.r2Key).catch(() => {});
      }
      const nextList = templates.filter((t) => t.id !== tpl.id);
      if (!nextList.some((t) => t.isDefault) && nextList.length > 0) {
        nextList[0].isDefault = true;
      }
      await greetingTemplateService.saveTemplates(nextList);
      setTemplates(nextList);
      showAlert('Berhasil', 'Template Layar Sapa berhasil dihapus.', 'success');
    } catch {
      showAlert('Gagal', 'Gagal menghapus template Layar Sapa.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-indigo-600" />
            <span>Manajemen Katalog Template Layar Sapa</span>
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Kelola katalog desain Background &amp; Foto Mempelai untuk tampilan Layar Sapa acara.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Toggle Preview Mode */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setPreviewMode('welcome')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                previewMode === 'welcome'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Saat Tamu Check-In</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('standby')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                previewMode === 'standby'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Mode Standby</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowPromptGuide(!showPromptGuide)}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-indigo-200 bg-indigo-50/70 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Prompt Background ChatGPT</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Template Layar Sapa</span>
          </button>
        </div>
      </div>

      {/* Collapsible ChatGPT Prompt Guide */}
      {showPromptGuide && (
        <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-indigo-950">
                Panduan Prompt Pembuatan Background Layar Sapa + Foto Mempelai (16:9)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Salin prompt di bawah ini untuk membuat gambar background 16:9 dengan Foto Mempelai di sisi kiri dan ruang sapaan tamu di sisi kanan (seperti welcome.png).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(CHATGPT_GREETING_PROMPT);
                showAlert('Berhasil', 'Instruksi Prompt Layar Sapa berhasil disalin!', 'success');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Prompt</span>
            </button>
          </div>
          <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-60 leading-relaxed">
            {CHATGPT_GREETING_PROMPT}
          </pre>
        </div>
      )}

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className={`bg-white rounded-2xl border transition-all overflow-hidden shadow-xs flex flex-col ${
                tpl.isDefault ? 'border-indigo-500 ring-2 ring-indigo-500/15' : 'border-gray-200'
              }`}
            >
              {/* Live Rendered Greeting Screen Preview */}
              <div className="p-4 bg-slate-50 border-b border-gray-100">
                <GreetingScreenCanvas
                  template={tpl}
                  mode={previewMode}
                  event={{
                    title: 'The Wedding Of Fredi & Lony',
                    coupleName: 'Fredi & Lony',
                    greetingGroomName: 'Fredi',
                    greetingBrideName: 'Lony',
                    date: '2026-10-11',
                    greetingTimeText: '10.00 WIB',
                    greetingVenueTitle: 'Gedung Graha Mulia',
                    greetingVenueSubtitle: 'Semarang, Jawa Tengah',
                  }}
                  guest={{
                    name: 'Iklas Padli',
                    ticketCode: 'GUEST123456',
                  }}
                />
              </div>

              {/* Template Meta & Actions */}
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900 truncate">
                      {tpl.name}
                    </h3>
                    {tpl.isDefault && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Star className="w-3 h-3 fill-indigo-600" /> Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {tpl.r2Key
                      ? 'Template Kustom Tersimpan di Katalog'
                      : 'Dilengkapi Foto Mempelai & Dekorasi Bunga Panggung Bawaan'}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: tpl.primaryColor || '#12392F' }}
                      title="Warna Teks Utama"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: tpl.coupleNameColor || '#9B6B34' }}
                      title="Warna Kaligrafi Mempelai"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: tpl.guestBoxBg || '#F2E2DC' }}
                      title="Warna Kotak Sapaan"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: tpl.footerColor || '#C48481' }}
                      title="Warna Pita Bawah"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!tpl.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(tpl.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenModal(tpl)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tpl)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add / Edit Layar Sapa Template */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {editingTemplate
                    ? 'Edit Template Layar Sapa'
                    : 'Upload Template / Background Layar Sapa Baru'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Atur gambar latar belakang (16:9), foto mempelai, dan skema warna Layar Sapa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Inputs */}
                <div className="lg:col-span-5 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Nama Template Layar Sapa *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Contoh: Layar Sapa 1 - Blush Floral & Couple"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-indigo-600" />
                        <span>Background Layar Sapa 16:9</span>
                      </label>
                      {formData.imageUrl !== DEFAULT_GREETING_COUPLE_BG_URL && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              imageUrl: DEFAULT_GREETING_COUPLE_BG_URL,
                              r2Key: '',
                            }))
                          }
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                        >
                          Gunakan Background + Foto Mempelai Bawaan
                        </button>
                      )}
                    </div>
                    <MediaUploader
                      category="Layar Sapa"
                      maxSize={15 * 1024 * 1024}
                      allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                      defaultValue={formData.imageUrl || undefined}
                      onUploadSuccess={(data) =>
                        setFormData((prev) => ({
                          ...prev,
                          imageUrl: data.url,
                          r2Key: data.key,
                        }))
                      }
                      onUploadError={(err) =>
                        showAlert('Gagal Upload', err, 'error')
                      }
                    />
                  </div>

                  {/* Optional Separate Couple Photo Upload */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-rose-600" />
                        <span>Ganti Foto Mempelai Sisi Kiri (Opsional — Tanpa Bingkai)</span>
                      </label>
                      {formData.couplePhotoUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({ ...prev, couplePhotoUrl: '' }))
                          }
                          className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                        >
                          Reset ke Foto Mempelai Bawaan
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mb-1.5">
                      Foto mempelai ditampilkan menyatu tanpa bingkai (frameless) di sisi kiri layar sapa.
                    </p>
                    <MediaUploader
                      category="Layar Sapa"
                      maxSize={10 * 1024 * 1024}
                      allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                      defaultValue={formData.couplePhotoUrl || undefined}
                      onUploadSuccess={(data) =>
                        setFormData((prev) => ({
                          ...prev,
                          couplePhotoUrl: data.url,
                        }))
                      }
                      onUploadError={(err) =>
                        showAlert('Gagal Upload', err, 'error')
                      }
                    />
                  </div>

                  {/* Color Harmony Pickers */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Warna Teks &amp; Check-In
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.primaryColor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              primaryColor: e.target.value,
                            })
                          }
                          className="h-8 w-10 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={formData.primaryColor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              primaryColor: e.target.value,
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Warna Kaligrafi Mempelai
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.coupleNameColor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              coupleNameColor: e.target.value,
                            })
                          }
                          className="h-8 w-10 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={formData.coupleNameColor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              coupleNameColor: e.target.value,
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Warna Kotak Nama Tamu
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.guestBoxBg}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              guestBoxBg: e.target.value,
                            })
                          }
                          className="h-8 w-10 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={formData.guestBoxBg}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              guestBoxBg: e.target.value,
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Warna Pita Bawah
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.footerColor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              footerColor: e.target.value,
                            })
                          }
                          className="h-8 w-10 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={formData.footerColor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              footerColor: e.target.value,
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-gray-100">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.showFooterStrip}
                        onChange={(e) =>
                          setFormData({ ...formData, showFooterStrip: e.target.checked })
                        }
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-medium text-gray-700">
                        Tampilkan Teks Footer (&ldquo;Terima kasih atas kehadiran dan doa restunya.&rdquo;)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isDefault}
                        onChange={(e) =>
                          setFormData({ ...formData, isDefault: e.target.checked })
                        }
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-medium text-gray-700">
                        Jadikan sebagai Template Layar Sapa Default untuk acara baru
                      </span>
                    </label>
                  </div>
                </div>

                {/* Right Column: Live Preview */}
                <div className="lg:col-span-7 flex flex-col justify-center bg-slate-50 rounded-xl p-4 border border-gray-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Live Preview Layar Sapa (16:9) + Foto Mempelai
                    </span>
                    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('welcome')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          previewMode === 'welcome'
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-600'
                        }`}
                      >
                        Saat Tamu Check-In
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('standby')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          previewMode === 'standby'
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-600'
                        }`}
                      >
                        Mode Standby
                      </button>
                    </div>
                  </div>
                  <GreetingScreenCanvas
                    template={formData}
                    mode={previewMode}
                    event={{
                      title: 'The Wedding Of Fredi & Lony',
                      coupleName: 'Fredi & Lony',
                      greetingGroomName: 'Fredi',
                      greetingBrideName: 'Lony',
                      date: '2026-10-11',
                      greetingTimeText: '10.00 WIB',
                      greetingVenueTitle: 'Gedung Graha Mulia',
                      greetingVenueSubtitle: 'Semarang, Jawa Tengah',
                    }}
                    guest={{
                      name: previewGuestName || 'Iklas Padli',
                      ticketCode: 'GUEST123456',
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Uji Panjang Nama Tamu (Otomatis Menyesuaikan Kotak):
                    </label>
                    <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                      <input
                        type="text"
                        value={previewGuestName}
                        onChange={(e) => setPreviewGuestName(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1 text-xs bg-white"
                        placeholder="Ketik nama tamu untuk tes batas kotak..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    showCancelAlert('Perubahan template Layar Sapa dibatalkan.');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Template Layar Sapa'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
