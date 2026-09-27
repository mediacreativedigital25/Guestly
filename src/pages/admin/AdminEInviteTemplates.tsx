import React, { useEffect, useState } from 'react';
import { EInviteTemplate } from '../../types';
import {
  eInviteTemplateService,
  DEFAULT_EINVITE_TEMPLATES,
} from '../../services/eInviteTemplateService';
import { MediaUploader } from '../../components/media/MediaUploader';
import { EInvitationCard } from '../../components/EInvitationCard';
import { mediaService } from '../../services/media/media.service';
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  Sparkles,
  Copy,
  Star,
  Image as ImageIcon,
  X,
  HelpCircle,
} from 'lucide-react';
import { showAlert, showConfirm, showCancelAlert } from '../../lib/alerts';

const CHATGPT_PROMPT_TEMPLATE = `Tolong buatkan gambar desain "Blank Background Template" untuk kartu E-Invitation pernikahan digital dengan spesifikasi tata letak (layout) yang SANGAT KETAT berikut agar bisa ditumpuk dengan teks & foto dinamis di aplikasi web saya:

1. UKURAN & RASIO:
- Orientasi: Landscape (Horizontal), Rasio 16:9 (1600 x 900 px), memenuhi penuh seluruh kanvas (full-bleed dari ujung ke ujung tanpa margin luar/tanpa bayangan kartu di luar kanvas).

2. ZONA TATA LETAK (JANGAN ISI DENGAN TEKS APAPUN):
- Latar Belakang Utama (80% bagian atas): Warna dasar permukaan halus dan bersih (contoh: Warm Cream #FAF6F2) agar teks gelap di tengah & kanan mudah dibaca.
- Sisi Kiri (Lebar 0% s/d 36%): Buat garis lengkung ganda tipis (arch curve outline) dari atas ke bawah pita footer karena area kiri ini akan diisi oleh Foto Mempelai berbentuk lengkung dari aplikasi.
- Sudut Kiri Atas & Sudut Kanan Atas: Berikan ilustrasi daun/bunga line-art elegan yang lembut di pojok atas, jangan sampai masuk ke area tengah.
- Area Tengah & Kanan (Lebar 38% s/d 95%): HARUS 100% KOSONG & BERSIH (tanpa teks, tanpa kotak, tanpa QR code, tanpa ikon) karena akan diisi teks nama mempelai, nama tamu, jadwal, dan QR code oleh sistem.
- Pita Bawah / Footer Strip (Tinggi 20% paling bawah, membentang penuh dari kiri ke kanan): Berupa pita warna kontras yang elegan (contoh: Dusty Rose #C27D7A) dengan ornamen line-art bunga/daun tipis di pojok kiri bawah dan pojok kanan bawah pita. Bagian tengah pita bawah biarkan KOSONG TANPA TEKS (teks "TERIMA KASIH" akan ditambahkan oleh sistem).

3. ATURAN MUTLAK:
- JANGAN menulis huruf, angka, kata, atau placeholder apapun di dalam gambar.
- JANGAN menggambar foto mempelai/manusia, kotak QR code, atau ikon kalender/lokasi.
- Hasilkan murni desain background kanvas + garis lengkung kiri + pita bawah (footer) + ornamen bunga line-art di sudut-sudutnya.

Untuk template kali ini, gunakan tema warna: [SEBUTKAN TEMA WARNA, MISAL: DUSTY ROSE & CREAM / ROYAL GOLD & IVORY / EMERALD SAGE & CREAM].`;

const generateId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'tpl-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);

export default function AdminEInviteTemplates() {
  const [templates, setTemplates] = useState<EInviteTemplate[]>(DEFAULT_EINVITE_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPromptGuide, setShowPromptGuide] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EInviteTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<{
    name: string;
    imageUrl: string;
    r2Key: string;
    primaryColor: string;
    accentColor: string;
    guestBoxBg: string;
    footerColor: string;
    isDefault: boolean;
  }>({
    name: '',
    imageUrl: '',
    r2Key: '',
    primaryColor: '#153B31',
    accentColor: '#C98583',
    guestBoxBg: '#F3E4E2',
    footerColor: '#C27D7A',
    isDefault: false,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const list = await eInviteTemplateService.getTemplates();
      setTemplates(list);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (tpl?: EInviteTemplate) => {
    if (tpl) {
      setEditingTemplate(tpl);
      setFormData({
        name: tpl.name,
        imageUrl: tpl.imageUrl || '',
        r2Key: tpl.r2Key || '',
        primaryColor: tpl.primaryColor || '#153B31',
        accentColor: tpl.accentColor || '#C98583',
        guestBoxBg: tpl.guestBoxBg || '#F3E4E2',
        footerColor: tpl.footerColor || '#C27D7A',
        isDefault: Boolean(tpl.isDefault),
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        imageUrl: '',
        r2Key: '',
        primaryColor: '#153B31',
        accentColor: '#C98583',
        guestBoxBg: '#F3E4E2',
        footerColor: '#C27D7A',
        isDefault: templates.length === 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showAlert('Peringatan', 'Nama template wajib diisi.', 'warning');
      return;
    }

    setSaving(true);
    try {
      let nextList: EInviteTemplate[];
      const now = new Date().toISOString();

      if (editingTemplate) {
        nextList = templates.map((t) =>
          t.id === editingTemplate.id
            ? {
                ...t,
                name: formData.name.trim(),
                imageUrl: formData.imageUrl.trim(),
                r2Key: formData.r2Key || t.r2Key,
                primaryColor: formData.primaryColor,
                accentColor: formData.accentColor,
                guestBoxBg: formData.guestBoxBg,
                footerColor: formData.footerColor,
                isDefault: formData.isDefault,
                updatedAt: now,
              }
            : formData.isDefault
            ? { ...t, isDefault: false }
            : t
        );
      } else {
        const newTpl: EInviteTemplate = {
          id: generateId(),
          name: formData.name.trim(),
          imageUrl: formData.imageUrl.trim(),
          r2Key: formData.r2Key || undefined,
          primaryColor: formData.primaryColor,
          accentColor: formData.accentColor,
          guestBoxBg: formData.guestBoxBg,
          footerColor: formData.footerColor,
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

      await eInviteTemplateService.saveTemplates(nextList);
      setTemplates(nextList);
      setIsModalOpen(false);
      showAlert(
        'Berhasil',
        editingTemplate
          ? 'Template E-Invitation berhasil diperbarui.'
          : 'Template E-Invitation berhasil disimpan ke katalog.',
        'success'
      );
    } catch (err) {
      console.error('Error saving E-Invitation template:', err);
      showAlert('Gagal', 'Gagal menyimpan template E-Invitation.', 'error');
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
      await eInviteTemplateService.saveTemplates(nextList);
      setTemplates(nextList);
      showAlert('Berhasil', 'Template default berhasil diperbarui.', 'success');
    } catch {
      showAlert('Gagal', 'Gagal mengubah template default.', 'error');
    }
  };

  const handleDelete = async (tpl: EInviteTemplate) => {
    if (templates.length <= 1) {
      showAlert('Peringatan', 'Minimal harus ada 1 template di dalam katalog.', 'warning');
      return;
    }
    const ok = await showConfirm(`Hapus template "${tpl.name}" dari katalog?`);
    if (!ok) return;

    try {
      if (tpl.r2Key && tpl.r2Key.startsWith('E-Invitation/')) {
        await mediaService.deleteMedia(tpl.r2Key).catch(() => {});
      }
      const nextList = templates.filter((t) => t.id !== tpl.id);
      if (!nextList.some((t) => t.isDefault) && nextList.length > 0) {
        nextList[0].isDefault = true;
      }
      await eInviteTemplateService.saveTemplates(nextList);
      setTemplates(nextList);
      showAlert('Berhasil', 'Template berhasil dihapus.', 'success');
    } catch {
      showAlert('Gagal', 'Gagal menghapus template.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            Kelola katalog desain kartu E-Invitation yang disimpan di{' '}
            <code className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-mono text-xs">
              guestly-storage/E-Invitation/
            </code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowPromptGuide(!showPromptGuide)}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-indigo-200 bg-indigo-50/70 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Instruksi Prompt ChatGPT</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Template Baru</span>
          </button>
        </div>
      </div>

      {/* Collapsible ChatGPT Prompt Guide */}
      {showPromptGuide && (
        <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-indigo-950">
                Panduan Instruksi / Prompt Standar untuk ChatGPT
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Salin teks di bawah ini ke ChatGPT saat membuat gambar Blank Background Template (rasio 16:9) agar posisi lengkungan foto, teks mempelai, dan pita bawah 100% sejajar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(CHATGPT_PROMPT_TEMPLATE);
                showAlert('Berhasil', 'Instruksi Prompt ChatGPT berhasil disalin!', 'success');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Prompt</span>
            </button>
          </div>
          <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-60 leading-relaxed">
            {CHATGPT_PROMPT_TEMPLATE}
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
              {/* Live Rendered Card Preview */}
              <div className="p-4 bg-slate-50 border-b border-gray-100">
                <EInvitationCard
                  template={tpl}
                  event={{
                    title: 'The Wedding Of Rizky & Aulia',
                    coupleName: 'Rizky & Aulia',
                    eInviteGroomName: 'Rizky',
                    eInviteBrideName: 'Aulia',
                    date: '2026-12-15',
                    time: '09.00 - 14.00 WIB',
                    eInviteVenueName: 'Gedung Serbaguna Graha Anugerah',
                    eInviteVenueAddress: 'Jl. Melati No. 25, Semarang',
                  }}
                  guest={{
                    name: 'Bpk. Adi Putro & Keluarga',
                    ticketCode: 'GUEST123456',
                    category: 'VIP',
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
                    {tpl.imageUrl
                      ? `Cloudflare R2: ${tpl.r2Key || tpl.imageUrl}`
                      : 'Built-in Vector Template (Sesuai Card 1.png)'}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: tpl.primaryColor || '#153B31' }}
                      title="Warna Teks Utama"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: tpl.accentColor || '#C98583' }}
                      title="Warna Aksen"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: tpl.guestBoxBg || '#F3E4E2' }}
                      title="Warna Kotak Sapaan"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: tpl.footerColor || '#C27D7A' }}
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

      {/* Modal Add / Edit Template */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {editingTemplate
                    ? 'Edit Template E-Invitation'
                    : 'Upload Template E-Invitation Baru'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  File gambar otomatis disimpan ke bucket{' '}
                  <code className="text-indigo-600 font-mono">
                    guestly-storage/E-Invitation/
                  </code>
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
                      Nama Template *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Contoh: Card 1 - Blush Floral Arch"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-indigo-600" />
                      <span>Upload Gambar Template (16:9)</span>
                    </label>
                    <MediaUploader
                      category="E-Invitation"
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
                    <div className="mt-2">
                      <label className="block text-xs text-gray-500 mb-1">
                        Atau masukkan URL gambar Cloudflare R2 secara langsung:
                      </label>
                      <input
                        type="text"
                        value={formData.imageUrl}
                        onChange={(e) =>
                          setFormData({ ...formData, imageUrl: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="https://cdn.guestly.yulovi.com/E-Invitation/..."
                      />
                    </div>
                  </div>

                  {/* Color Harmony Pickers */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Warna Teks Utama
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
                        Warna Aksen (&amp; / Garis)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.accentColor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              accentColor: e.target.value,
                            })
                          }
                          className="h-8 w-10 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={formData.accentColor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              accentColor: e.target.value,
                            })
                          }
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Warna Kotak Tamu
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

                  <label className="flex items-center gap-2 pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) =>
                        setFormData({ ...formData, isDefault: e.target.checked })
                      }
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-gray-700">
                      Jadikan sebagai Template Default untuk acara baru
                    </span>
                  </label>
                </div>

                {/* Right Column: Live Preview */}
                <div className="lg:col-span-7 flex flex-col justify-center bg-slate-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Live Preview Kartu E-Invitation (16:9)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Data dinamis otomatis menyesuaikan acara &amp; tamu
                    </span>
                  </div>
                  <EInvitationCard
                    template={formData}
                    event={{
                      title: 'The Wedding Of Rizky & Aulia',
                      coupleName: 'Rizky & Aulia',
                      eInviteGroomName: 'Rizky',
                      eInviteBrideName: 'Aulia',
                      date: '2026-12-15',
                      time: '09.00 - 14.00 WIB',
                      eInviteVenueName: 'Gedung Serbaguna Graha Anugerah',
                      eInviteVenueAddress: 'Jl. Melati No. 25, Semarang',
                    }}
                    guest={{
                      name: 'Bpk. Adi Putro & Keluarga',
                      ticketCode: 'GUEST123456',
                      category: 'VIP',
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    showCancelAlert('Perubahan template E-Invitation dibatalkan.');
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
                  <span>{saving ? 'Menyimpan...' : 'Simpan Template'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
