import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MediaDropzone } from './MediaDropzone';
import { MediaPreview } from './MediaPreview';
import { MediaProgress } from './MediaProgress';
import { MediaError } from './MediaError';
import { mediaService } from '../../services/media/media.service';

interface MediaUploaderProps {
  category: string;
  maxSize?: number; // in bytes
  allowedMimeTypes?: string[];
  defaultValue?: string;
  disabled?: boolean;
  onUploadSuccess?: (data: { url: string; key: string; sizeBytes: number }) => void;
  onUploadError?: (error: string) => void;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  category,
  maxSize = 5 * 1024 * 1024,
  allowedMimeTypes,
  defaultValue,
  disabled,
  onUploadSuccess,
  onUploadError
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(defaultValue);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setPreviewUrl(defaultValue);
  }, [defaultValue]);

  const uploadFile = useCallback(async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    setIsUploading(true);
    setProgress(20);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await mediaService.uploadMedia({
        file: selectedFile, 
        category, 
        signal: abortController.signal,
        onProgress: (prog) => {
          setProgress(prog);
        }
      });
      
      setProgress(100);
      
      setPreviewUrl(result.url);
      onUploadSuccess?.(result);
      
      setTimeout(() => {
        setIsUploading(false);
        setProgress(0);
      }, 500);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Upload dibatalkan.');
        onUploadError?.('Upload dibatalkan.');
      } else {
        const errMsg = err.message || 'Gagal mengunggah file.';
        setError(errMsg);
        onUploadError?.(errMsg);
      }
      setIsUploading(false);
      setProgress(0);
    } finally {
      abortControllerRef.current = null;
    }
  }, [category, onUploadSuccess, onUploadError]);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null);
    if (selectedFile.size > maxSize) {
      const err = `Ukuran file melebihi batas maksimal (${Math.round(maxSize / 1024 / 1024)}MB)`;
      setError(err);
      onUploadError?.(err);
      return;
    }
    
    if (allowedMimeTypes && allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(selectedFile.type)) {
      const err = 'Tipe file tidak didukung.';
      setError(err);
      onUploadError?.(err);
      return;
    }

    uploadFile(selectedFile);
  }, [maxSize, allowedMimeTypes, uploadFile, onUploadError]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (file) {
      uploadFile(file);
    }
  }, [file, uploadFile]);

  const handleClear = useCallback(() => {
    setFile(null);
    setPreviewUrl(undefined);
    setError(null);
  }, []);

  return (
    <div className="w-full">
      {!previewUrl && !file && !isUploading && (
        <MediaDropzone 
          onFileSelect={handleFileSelect} 
          disabled={disabled} 
          allowedMimeTypes={allowedMimeTypes} 
        />
      )}

      {((previewUrl && !isUploading) || (file && !isUploading && !error)) && (
        <MediaPreview 
          url={previewUrl} 
          file={file || undefined} 
          onClear={handleClear} 
          disabled={disabled}
        />
      )}

      {isUploading && (
        <div className="p-4 border rounded-lg bg-white border-gray-200 shadow-sm">
          <MediaPreview file={file || undefined} disabled={true} />
          <MediaProgress progress={progress} />
          <div className="mt-3 flex justify-end">
            <button 
              type="button"
              onClick={handleCancel}
              className="text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
            >
              Batalkan Upload
            </button>
          </div>
        </div>
      )}

      {error && !isUploading && (
        <div className="mt-2">
          {file && (
             <div className="mb-2 opacity-60">
               <MediaPreview file={file} disabled={true} />
             </div>
          )}
          <MediaError message={error} />
          {file && (
            <div className="flex items-center gap-3 mt-3">
              <button 
                type="button"
                onClick={handleRetry}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
              >
                Coba Lagi
              </button>
              <button 
                type="button"
                onClick={handleClear}
                className="text-sm font-medium text-gray-600 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors"
              >
                Hapus
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
