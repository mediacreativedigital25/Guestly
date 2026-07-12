import React, { useCallback, useRef } from 'react';
import { UploadCloud } from 'lucide-react';

interface MediaDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  allowedMimeTypes?: string[];
}

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({ onFileSelect, disabled, allowedMimeTypes }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (allowedMimeTypes && allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.type)) {
         return;
      }
      onFileSelect(file);
    }
  }, [onFileSelect, disabled, allowedMimeTypes]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect, disabled]);

  return (
    <div 
      onDragOver={(e) => e.preventDefault()} 
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : 'cursor-pointer border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50/50 bg-white'}
      `}
    >
      <UploadCloud className="w-8 h-8 text-indigo-500 mb-2" />
      <p className="text-sm text-gray-700 font-medium mb-1">
        Tarik & lepas file di sini atau klik untuk memilih
      </p>
      {allowedMimeTypes && (
        <p className="text-xs text-gray-500">
          Format: {allowedMimeTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')}
        </p>
      )}
      <input 
        ref={inputRef}
        type="file" 
        className="hidden" 
        onChange={handleChange} 
        disabled={disabled}
        accept={allowedMimeTypes?.join(',')}
      />
    </div>
  );
};
