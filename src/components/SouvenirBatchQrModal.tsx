import React, { useState, useMemo } from 'react';
import QRCode from 'react-qr-code';
import QRCodeLib from 'qrcode';
import jsPDF from 'jspdf';
import {
  X,
  QrCode,
  Printer,
  RefreshCw,
  RotateCcw,
  Copy,
  Check,
  Sparkles,
  Layers,
  PackageCheck,
} from 'lucide-react';
import { SouvenirItem, SouvenirBatchScanRecord, Guest } from '../types';
import { souvenirStorage } from '../services/souvenirStorage';
import { parseFirestoreDate } from '../lib/utils';
import { showAlert, showConfirm } from '../lib/alerts';

interface SouvenirBatchQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle?: string;
  souvenirs: SouvenirItem[];
  initialItem: SouvenirItem | null; // null = print-all mode
  guests: Guest[];
  currentOperator: string;
  isLocked?: boolean;
  onUpdated: () => void;
}

type StickerPreset = 'mini_72' | 'compact_42';

const PRESETS: Record<
  StickerPreset,
  {
    label: string;
    subtitle: string;
    cols: number;
    rows: number;
    perPage: number;
    cellW: number; // mm
    cellH: number; // mm
    qrSize: number; // mm
    marginX: number; // mm
    marginY: number; // mm
    gapX: number; // mm
    gapY: number; // mm
    titleFontSize: number;
    codeFontSize: number;
  }
> = {
  mini_72: {
    label: 'Super Hemat (2,2 × 2,8 cm)',
    subtitle: '72 stiker / lembar A4 (8 × 9) • Paling hemat kertas',
    cols: 8,
    rows: 9,
    perPage: 72,
    cellW: 22,
    cellH: 28,
    qrSize: 16.5,
    marginX: 10,
    marginY: 11,
    gapX: 2,
    gapY: 2.5,
    titleFontSize: 5.5,
    codeFontSize: 7,
  },
  compact_42: {
    label: 'Kecil Standar (3,0 × 3,5 cm)',
    subtitle: '42 stiker / lembar A4 (6 × 7) • Lebih lega & mudah digunting',
    cols: 6,
    rows: 7,
    perPage: 42,
    cellW: 30,
    cellH: 35,
    qrSize: 22.5,
    marginX: 10,
    marginY: 12,
    gapX: 2,
    gapY: 3.5,
    titleFontSize: 6.8,
    codeFontSize: 8.5,
  },
};

export default function SouvenirBatchQrModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  souvenirs,
  initialItem,
  guests,
  currentOperator,
  isLocked = false,
  onUpdated,
}: SouvenirBatchQrModalProps) {
  const [selectedItemId, setSelectedItemId] = useState<string>(
    initialItem?.id || souvenirs[0]?.id || ''
  );
  const [printScope, setPrintScope] = useState<'single' | 'all'>(
    initialItem ? 'single' : 'all'
  );
  const [preset, setPreset] = useState<StickerPreset>('mini_72');
  const [printQuantity, setPrintQuantity] = useState<number>(() => {
    if (initialItem) return Math.max(1, initialItem.initialStock || 72);
    return 72;
  });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const activeItem = useMemo(
    () => souvenirs.find((s) => s.id === selectedItemId) || initialItem || souvenirs[0] || null,
    [souvenirs, selectedItemId, initialItem]
  );

  const recentBatchScans = useMemo<SouvenirBatchScanRecord[]>(() => {
    if (!eventId || !activeItem) return [];
    return souvenirStorage
      .getActiveBatchScans(eventId)
      .filter(
        (rec) =>
          rec.souvenirId === activeItem.id ||
          (rec.batchCode && rec.batchCode === activeItem.qrBatchCode)
      )
      .slice(0, 15);
  }, [eventId, activeItem, souvenirs]);

  if (!isOpen || !activeItem) return null;

  const batchCode = (activeItem.qrBatchCode || '').toUpperCase();
  const qrPayload = souvenirStorage.formatBatchQrPayload(batchCode);
  const presetCfg = PRESETS[preset];

  const totalStickersToPrint =
    printScope === 'all'
      ? souvenirs.reduce((sum, s) => sum + Math.max(1, s.initialStock || 0), 0)
      : Math.max(1, Number(printQuantity) || 1);
  const estimatedPages = Math.max(1, Math.ceil(totalStickersToPrint / presetCfg.perPage));

  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId);
    const found = souvenirs.find((s) => s.id === itemId);
    if (found) {
      setPrintQuantity(Math.max(1, found.initialStock || presetCfg.perPage));
    }
  };

  const handleCopyPayload = () => {
    navigator.clipboard?.writeText(qrPayload).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleRegenerateCode = async () => {
    if (isLocked || !activeItem.id) return;
    const confirmed = await showConfirm(
      'Buat Kode Batch QR Baru?',
      `Kode batch saat ini (${batchCode}) untuk "${activeItem.name}" akan diganti dengan 5 karakter acak baru. Stiker QR lama yang sudah dicetak tidak akan dikenali lagi oleh scanner.`
    );
    if (!confirmed) return;

    souvenirStorage.regenerateBatchCode(eventId, activeItem.id, guests);
    onUpdated();
    showAlert('Kode Batch Diperbarui', 'Kode Batch QR baru berhasil dibuat dan disinkronkan ke Supabase.', 'success');
  };

  const handleUndoScan = async (scan: SouvenirBatchScanRecord) => {
    if (isLocked) return;
    const confirmed = await showConfirm(
      'Batalkan Scan QR Souvenir?',
      `Batalkan 1 pcs penyerahan "${scan.souvenirName}" (Batch ${scan.batchCode})? Stok sistem akan otomatis bertambah +1 pcs.`
    );
    if (!confirmed) return;

    const res = souvenirStorage.undoBatchScan(eventId, scan.id, currentOperator);
    if (res.undone) {
      onUpdated();
      showAlert('Scan Dibatalkan', 'Stok sistem telah dipulihkan +1 pcs.', 'success');
    }
  };

  const handleGenerateStickerPdf = async () => {
    const targetList: Array<{ item: SouvenirItem; count: number }> =
      printScope === 'all'
        ? souvenirs
            .filter((s) => (s.initialStock || 0) > 0)
            .map((s) => ({ item: s, count: Math.max(1, s.initialStock) }))
        : [{ item: activeItem, count: Math.min(2000, Math.max(1, Number(printQuantity) || 1)) }];

    if (targetList.length === 0) {
      showAlert('Perhatian', 'Tidak ada item souvenir dengan stok > 0 untuk dicetak.', 'warning');
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const cfg = PRESETS[preset];

      // Pre-render crisp high-contrast PNG data URL per unique batch code (Version 1 QR is super sharp!)
      const qrDataUrls = new Map<string, string>();
      for (const entry of targetList) {
        const code = (entry.item.qrBatchCode || '').toUpperCase();
        const payload = souvenirStorage.formatBatchQrPayload(code);
        if (!qrDataUrls.has(payload)) {
          const dataUrl = await QRCodeLib.toDataURL(payload, {
            width: 320,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#000000',
              light: '#FFFFFF',
            },
          });
          qrDataUrls.set(payload, dataUrl);
        }
      }

      // Flatten sticker queue
      const stickers: Array<{
        payload: string;
        code: string;
        label: string;
      }> = [];

      for (const entry of targetList) {
        const code = (entry.item.qrBatchCode || '').toUpperCase();
        const payload = souvenirStorage.formatBatchQrPayload(code);
        const cat = (entry.item.category || '').trim();
        const rawLabel =
          cat && cat.toLowerCase() !== 'semua tamu'
            ? `${cat} • ${entry.item.name}`
            : entry.item.name;
        const maxChars = preset === 'mini_72' ? 16 : 22;
        const label = rawLabel.length > maxChars ? `${rawLabel.slice(0, maxChars - 1)}…` : rawLabel;

        for (let i = 0; i < entry.count; i++) {
          stickers.push({ payload, code, label });
        }
      }

      // Draw stickers across A4 pages
      for (let idx = 0; idx < stickers.length; idx++) {
        const posInPage = idx % cfg.perPage;
        if (idx > 0 && posInPage === 0) {
          pdf.addPage();
        }

        const col = posInPage % cfg.cols;
        const row = Math.floor(posInPage / cfg.cols);

        const x = cfg.marginX + col * (cfg.cellW + cfg.gapX);
        const y = cfg.marginY + row * (cfg.cellH + cfg.gapY);
        const st = stickers[idx];

        // Subtle cut-guide border
        pdf.setDrawColor(205, 210, 218);
        pdf.setLineWidth(0.18);
        pdf.roundedRect(x, y, cfg.cellW, cfg.cellH, 1.2, 1.2);

        // QR Code image centered horizontally near top
        const qrX = x + (cfg.cellW - cfg.qrSize) / 2;
        const qrY = y + 1.4;
        const qrImg = qrDataUrls.get(st.payload);
        if (qrImg) {
          pdf.addImage(qrImg, 'PNG', qrX, qrY, cfg.qrSize, cfg.qrSize);
        }

        // Category / Souvenir Name label
        const centerX = x + cfg.cellW / 2;
        pdf.setTextColor(30, 41, 59);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(cfg.titleFontSize);
        pdf.text(st.label, centerX, qrY + cfg.qrSize + (preset === 'mini_72' ? 2.6 : 3.2), {
          align: 'center',
          maxWidth: cfg.cellW - 2,
        });

        // 5-char Batch Code in crisp monospace
        pdf.setTextColor(79, 70, 229);
        pdf.setFont('courier', 'bold');
        pdf.setFontSize(cfg.codeFontSize);
        pdf.text(st.code, centerX, y + cfg.cellH - (preset === 'mini_72' ? 1.8 : 2.3), {
          align: 'center',
        });
      }

      // Tiny page footer with event info & batch legend
      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(148, 163, 184);
        const footerTitle = (eventTitle || 'Guestly Souvenir').slice(0, 45);
        pdf.text(
          `Stiker QR Batch Souvenir • ${footerTitle} • Total ${stickers.length} stiker • Hal ${p}/${totalPages}`,
          105,
          292,
          { align: 'center' }
        );
      }

      const cleanName = (printScope === 'all' ? 'Semua_Kategori' : activeItem.name).replace(
        /[^a-zA-Z0-9]/g,
        '_'
      );
      pdf.save(`Stiker_QR_Souvenir_${cleanName}_${batchCode}.pdf`);
      showAlert(
        'PDF Stiker Siap Cetak',
        `${stickers.length} stiker QR (${estimatedPages} lembar A4) berhasil dibuat. Cetak di kertas stiker A4 skala 100% (Actual Size).`,
        'success'
      );
    } catch (err) {
      console.error('Failed to generate souvenir QR sticker PDF:', err);
      showAlert('Gagal', 'Terjadi kesalahan saat membuat PDF stiker QR.', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900">
                QR Batch Souvenir &amp; Cetak Stiker Hemat Kertas
              </h3>
              <p className="text-xs text-gray-500">
                Tempelkan stiker QR di fisik souvenir — 1× scan di Scanner langsung memotong stok sesuai kategori
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Category Selector if multiple souvenirs */}
          {souvenirs.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Pilih Jenis / Kategori Souvenir
              </label>
              <div className="flex flex-wrap gap-2">
                {souvenirs.map((s) => {
                  const isSel = s.id === activeItem.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectItem(s.id!)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-2 ${
                        isSel
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      <span>{s.name}</span>
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                          isSel ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-indigo-700'
                        }`}
                      >
                        {s.qrBatchCode}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* QR Preview Card & Batch Info */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center gap-5">
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col items-center shrink-0">
              <QRCode value={qrPayload} size={116} level="M" bgColor="#FFFFFF" fgColor="#000000" />
              <span className="mt-2 text-[10px] font-semibold text-slate-700 max-w-[120px] truncate text-center">
                {activeItem.category && activeItem.category !== 'Semua Tamu'
                  ? activeItem.category
                  : activeItem.name}
              </span>
              <span className="font-mono text-sm font-bold tracking-widest text-indigo-700">
                {batchCode}
              </span>
            </div>

            <div className="flex-1 w-full space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-bold text-gray-900 text-base">{activeItem.name}</h4>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    {activeItem.category || 'Semua Tamu'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Kode Batch 5 karakter (unik untuk kategori ini di acara ini). Isi QR:{' '}
                  <code className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold">
                    {qrPayload}
                  </code>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-gray-500 block">Stok Awal</span>
                  <span className="text-sm font-bold text-gray-900">{activeItem.initialStock}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-gray-500 block">Keluar QR Fisik</span>
                  <span className="text-sm font-bold text-indigo-600">
                    {activeItem.directQrOutCount || 0}
                  </span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-gray-500 block">Sisa Stok</span>
                  <span
                    className={`text-sm font-bold ${
                      activeItem.remainingStock <= 5 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {activeItem.remainingStock}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg cursor-pointer"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Tersalin ({qrPayload})</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Kode QR</span>
                    </>
                  )}
                </button>

                {!isLocked && (
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 rounded-lg cursor-pointer"
                    title="Buat ulang kode batch 5 karakter baru"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Ganti Kode Batch</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Print Configuration (Paper-Saving A4 Stickers) */}
          <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-indigo-600" />
                Pengaturan Cetak Stiker PDF (Kertas A4)
              </h4>
              <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                Estimasi: {estimatedPages} lembar A4
              </span>
            </div>

            {/* Scope Selector */}
            {souvenirs.length > 1 && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPrintScope('single')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    printScope === 'single'
                      ? 'bg-white border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white/60 border-gray-200 hover:bg-white'
                  }`}
                >
                  <div className="text-xs font-bold text-gray-900">Kategori Ini Saja</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {activeItem.name} ({batchCode})
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintScope('all')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    printScope === 'all'
                      ? 'bg-white border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white/60 border-gray-200 hover:bg-white'
                  }`}
                >
                  <div className="text-xs font-bold text-gray-900 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    Semua Kategori ({souvenirs.length})
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Cetak sesuai stok awal tiap kategori
                  </div>
                </button>
              </div>
            )}

            {/* Size Preset Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(PRESETS) as StickerPreset[]).map((key) => {
                const cfg = PRESETS[key];
                const isActive = preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white border-indigo-600 ring-1 ring-indigo-600 shadow-2xs'
                        : 'bg-white/70 border-gray-200 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-gray-900">{cfg.label}</span>
                      {key === 'mini_72' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Hemat
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{cfg.subtitle}</p>
                  </button>
                );
              })}
            </div>

            {/* Quantity Picker (when single scope) */}
            {printScope === 'single' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded-lg border border-gray-200">
                <div>
                  <label className="text-xs font-semibold text-gray-800 block">
                    Jumlah Stiker Dicetak (Pcs)
                  </label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setPrintQuantity(presetCfg.perPage)}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 font-medium cursor-pointer"
                    >
                      1 Lembar ({presetCfg.perPage})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintQuantity(Math.max(1, activeItem.initialStock || 1))}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 font-medium cursor-pointer"
                    >
                      Sesuai Stok Awal ({activeItem.initialStock})
                    </button>
                    {activeItem.remainingStock > 0 &&
                      activeItem.remainingStock !== activeItem.initialStock && (
                        <button
                          type="button"
                          onClick={() => setPrintQuantity(activeItem.remainingStock)}
                          className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 font-medium cursor-pointer"
                        >
                          Sisa Stok ({activeItem.remainingStock})
                        </button>
                      )}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={printQuantity}
                  onChange={(e) => setPrintQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-28 text-center font-mono font-bold text-sm border border-gray-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  Print di kertas stiker HVS/Glossy A4 dengan skala <strong>100% (Actual Size)</strong>.
                </span>
              </p>
              <button
                type="button"
                onClick={handleGenerateStickerPdf}
                disabled={isGeneratingPdf}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Membuat PDF...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>Unduh PDF ({totalStickersToPrint} Stiker)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Recent Direct QR Batch Scans for this Item (with quick Undo) */}
          {recentBatchScans.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Riwayat Scan QR Fisik Terbaru ({activeItem.directQrOutCount || recentBatchScans.length} pcs)
                </span>
                <span className="text-[10px] text-gray-500">Batch {batchCode}</span>
              </div>
              <div className="divide-y divide-gray-100 max-h-44 overflow-y-auto">
                {recentBatchScans.map((scan) => {
                  const dt = parseFirestoreDate(scan.scannedAt);
                  const timeStr = dt
                    ? dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '-';
                  return (
                    <div
                      key={scan.id}
                      className="px-4 py-2 flex items-center justify-between gap-2 text-xs hover:bg-gray-50"
                    >
                      <div>
                        <span className="font-medium text-gray-800">
                          -1 pcs • {scan.souvenirName}
                        </span>
                        <span className="text-[11px] text-gray-400 ml-2">
                          {timeStr} • {scan.scannedBy}
                        </span>
                      </div>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => handleUndoScan(scan)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Batalkan</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
