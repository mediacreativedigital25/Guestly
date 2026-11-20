import React, { useRef, useState } from 'react';
import { UploadCloud, Link as LinkIcon, X, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { mediaService } from '../../services/media/media.service';

interface SalespageImageFieldProps {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  category?: string;
  placeholder?: string;
  helperText?: string;
  previewMode?: 'landscape' | 'logo';
  fallbackPreview?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const SalespageImageField: React.FC<SalespageImageFieldProps> = ({
  label,
  value,
  onChange,
  category = 'super_admin_media',
  placeholder = 'https://... atau klik Upload Gambar',
  helperText,
  previewMode = 'landscape',
  fallbackPreview,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadMeta, setUploadMeta] = useState<string | null>(null);
  const [imgBroken, setImgBroken] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Reset input so re-uploading the same file works
    e.target.value = '';
    setError(null);
    setUploadMeta(null);

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('Ukuran gambar melebihi batas maksimal 10MB.');
      return;
    }

    const isImage =
      selectedFile.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(selectedFile.name);
    if (!isImage) {
      setError('Format file harus berupa gambar (JPG, PNG, WEBP, atau SVG).');
      return;
    }

    setIsUploading(true);
    setProgress(20);
    try {
      const result = await mediaService.uploadMedia({
        file: selectedFile,
        category,
        onProgress: (p) => setProgress(p),
      });
      setProgress(100);
      setImgBroken(false);
      const kb = Math.max(1, Math.round((result.sizeBytes || 0) / 1024));
      const isWebp = /\.webp($|\?)/i.test(result.key || result.url);
      setUploadMeta(
        isWebp
          ? `Tersimpan otomatis sebagai WebP (${kb.toLocaleString('id-ID')} KB)`
          : `Tersimpan (${kb.toLocaleString('id-ID')} KB)`
      );
      onChange(result.url);
    } catch (err: any) {
      setError(err?.message || 'Gagal mengunggah gambar. Silakan coba lagi atau tempel URL.');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setProgress(0);
      }, 300);
    }
  };

  const displayPreview = value?.trim() || fallbackPreview || '';

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}

      <div className="flex flex-col sm:flex-row gap-3 items-start">
        {/* Preview Box */}
        <div
          className={`relative shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white flex items-center justify-center ${
            previewMode === 'logo' ? 'w-28 h-16 p-2' : 'w-full sm:w-32 h-24'
          }`}
        >
          {displayPreview && !imgBroken ? (
            <img
              src={displayPreview}
              alt={label || 'Preview gambar'}
              referrerPolicy="no-referrer"
              onError={() => setImgBroken(true)}
              className={
                previewMode === 'logo'
                  ? 'max-h-full max-w-full object-contain'
                  : 'w-full h-full object-cover'
              }
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 text-xs gap-1 p-2 text-center">
              <ImageIcon className="w-5 h-5" />
              <span>{previewMode === 'logo' ? 'Belum ada logo' : 'Default'}</span>
            </div>
          )}

          {!value && fallbackPreview && !imgBroken && (
            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[10px] font-medium bg-gray-900/75 text-white rounded">
              Default
            </span>
          )}
        </div>

        {/* Upload + URL Controls */}
        <div className="flex-1 w-full space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,image/avif"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Mengunggah {progress}%
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload Gambar (Auto WebP)
                </>
              )}
            </button>

            {value && (
              <button
                type="button"
                disabled={isUploading}
                onClick={() => {
                  setImgBroken(false);
                  setError(null);
                  setUploadMeta(null);
                  onChange('');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 hover:text-red-600 transition-colors whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                Hapus
              </button>
            )}
          </div>

          <div className="relative">
            <LinkIcon className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={value || ''}
              onChange={(e) => {
                setImgBroken(false);
                setError(null);
                setUploadMeta(null);
                onChange(e.target.value);
              }}
              placeholder={placeholder}
              className="w-full border border-gray-300 rounded-md pl-8 pr-3 py-1.5 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {isUploading && (
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {uploadMeta && !error && (
            <p className="text-xs font-medium text-emerald-700">{uploadMeta}</p>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {helperText && !error && <p className="text-xs text-gray-500">{helperText}</p>}
        </div>
      </div>
    </div>
  );
};
