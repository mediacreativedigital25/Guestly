import React, { useMemo } from 'react';
import { File as FileIcon, X } from 'lucide-react';

interface MediaPreviewProps {
  url?: string;
  file?: File;
  onClear?: () => void;
  disabled?: boolean;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({ url, file, onClear, disabled }) => {
  const previewUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    return url;
  }, [file, url]);

  const isImage = useMemo(() => {
    if (file) return file.type.startsWith('image/');
    return url?.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i);
  }, [file, url]);

  if (!previewUrl) return null;

  return (
    <div className="relative inline-block border border-gray-200 rounded-lg overflow-hidden bg-gray-50 shadow-sm w-full">
      {isImage ? (
        <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-48 object-contain" />
      ) : (
        <div className="flex items-center gap-3 p-4">
           <FileIcon className="w-8 h-8 text-gray-400 shrink-0" />
           <span className="text-sm font-medium text-gray-700 truncate">{file?.name || 'File Document'}</span>
        </div>
      )}
      
      {onClear && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow-sm text-gray-500 hover:text-red-500 hover:bg-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
