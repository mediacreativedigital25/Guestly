import React from 'react';
import { Film, X } from 'lucide-react';
import { getHeroVideoSourceLabel, HeroVideoFitMode } from '../salespage/HeroMediaStage';

interface SalespageVideoFieldProps {
  label?: string;
  videoUrl: string;
  videoMode?: 'autoplay' | 'click';
  videoFit?: HeroVideoFitMode;
  onChangeUrl: (url: string) => void;
  onChangeMode: (mode: 'autoplay' | 'click') => void;
  onChangeFit: (fit: HeroVideoFitMode) => void;
}

export const SalespageVideoField: React.FC<SalespageVideoFieldProps> = ({
  label = 'Mode Video (Opsional — 0% Beban Server)',
  videoUrl,
  videoMode = 'click',
  videoFit = 'auto',
  onChangeUrl,
  onChangeMode,
  onChangeFit,
}) => {
  const hasUrl = Boolean(videoUrl && videoUrl.trim() !== '');
  const detectedLabel = getHeroVideoSourceLabel(videoUrl);

  return (
    <div className="p-3.5 rounded-lg bg-slate-50/90 border border-gray-200 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
          <Film className="w-3.5 h-3.5 text-[#8C3A50] shrink-0" />
          <span>{label}</span>
        </div>
        {hasUrl && (
          <button
            type="button"
            onClick={() => onChangeUrl('')}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-red-600 transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Hapus Video</span>
          </button>
        )}
      </div>

      <input
        type="text"
        value={videoUrl || ''}
        onChange={(e) => onChangeUrl(e.target.value)}
        placeholder="Tempel link YouTube, YouTube Shorts, Vimeo, atau .mp4/.webm CDN (kosongkan jika hanya foto)"
        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      />

      {hasUrl && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Mode Pemutaran</label>
            <select
              value={videoMode}
              onChange={(e) => onChangeMode(e.target.value === 'autoplay' ? 'autoplay' : 'click')}
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="click">Klik untuk Putar (Paling Ringan)</option>
              <option value="autoplay">Putar Otomatis (Autoplay Loop)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">
              Orientasi &amp; Framing Video
            </label>
            <select
              value={videoFit}
              onChange={(e) => onChangeFit(e.target.value as HeroVideoFitMode)}
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="auto">Otomatis (Deteksi Portrait / Utuh)</option>
              <option value="portrait">Portrait 9:16 (Reels / Shorts)</option>
              <option value="contain">Tampil Utuh / Fit (Tanpa Terpotong)</option>
              <option value="cover">Penuhi Bingkai (Full Bleed)</option>
            </select>
          </div>
        </div>
      )}

      {detectedLabel && (
        <p className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1">
          Terdeteksi: {detectedLabel}
        </p>
      )}
    </div>
  );
};
