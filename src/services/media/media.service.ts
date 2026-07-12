import { db, auth } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface MediaUploadOptions {
  file: File;
  category: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export const mediaService = {
  uploadMedia: (options: MediaUploadOptions): Promise<{ url: string; key: string; sizeBytes: number }> => {
    return new Promise((resolve, reject) => {
      const { file, category, onProgress, signal } = options;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      
      const xhr = new XMLHttpRequest();
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new DOMException('Upload dibatalkan', 'AbortError'));
        });
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', async () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.success) {
            
            const mediaData = {
              url: data.data.url,
              key: data.data.key,
              sizeBytes: data.data.sizeBytes,
              fileName: file.name,
              mimeType: file.type,
              category: category,
              uploadedAt: serverTimestamp(),
              uploadedBy: auth.currentUser?.uid || null
            };

            // Save to Firestore
            try {
               await addDoc(collection(db, 'media'), mediaData);
            } catch (fsError) {
               console.error("Gagal menyimpan ke Firestore:", fsError);
               // Lanjutkan resolve agar proses upload tidak dianggap gagal, 
               // atau bisa reject tergantung kebijakan.
            }

            resolve({
              url: data.data.url,
              key: data.data.key,
              sizeBytes: data.data.sizeBytes
            });
          } else {
            reject(new Error(data.error?.message || 'Gagal mengunggah file.'));
          }
        } catch (err) {
          reject(new Error('Respons server tidak valid.'));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Koneksi terputus atau gagal mengunggah.'));
      });

      xhr.open('POST', '/api/media/upload');
      xhr.send(formData);
    });
  },

  deleteMedia: async (key: string): Promise<void> => {
    const response = await fetch('/api/media/delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ key })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || 'Gagal menghapus file dari R2.');
    }
  },

  getInfo: async (key: string): Promise<any> => {
    const response = await fetch(`/api/media/info?key=${encodeURIComponent(key)}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || 'Gagal mendapatkan info file dari R2.');
    }
    const data = await response.json();
    return data.data;
  }
};
