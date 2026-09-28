import { db, auth } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface MediaUploadOptions {
  file: File;
  category: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

async function optimizeImageIfNeeded(file: File, category: string): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }
  // Skip SVG or GIF or small icons
  if (file.type === 'image/svg+xml' || file.type === 'image/gif' || file.type.includes('icon')) {
    return file;
  }
  const shouldCompress =
    category === 'thumbnail' ? file.size > 600 * 1024 : file.size > 2 * 1024 * 1024;
  if (!shouldCompress) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const maxDim = category === 'thumbnail' ? 1280 : 1920;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        // Fill white background for JPEG if thumbnail
        const outMime = category === 'thumbnail' || file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
        if (outMime === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }
            const ext = outMime === 'image/jpeg' ? '.jpg' : '.webp';
            const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image';
            const optimizedFile = new File([blob], `${baseName}${ext}`, {
              type: outMime,
              lastModified: Date.now(),
            });
            resolve(optimizedFile);
          },
          outMime,
          0.85
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

async function getAuthTokenSafe(): Promise<string> {
  try {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('guestly_supabase_auth_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.uid) return `supabase-token:${parsed.uid}`;
      }
    }
  } catch {
    // ignore
  }
  return 'supabase-token:admin';
}

export const mediaService = {
  uploadMedia: async (options: MediaUploadOptions): Promise<{ url: string; key: string; sizeBytes: number }> => {
    const token = await getAuthTokenSafe();
    const processedFile = await optimizeImageIfNeeded(options.file, options.category);

    return new Promise((resolve, reject) => {
      const { category, onProgress, signal } = options;
      const formData = new FormData();
      formData.append('file', processedFile);
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
              fileName: processedFile.name,
              mimeType: processedFile.type,
              category: category,
              uploadedAt: serverTimestamp(),
              uploadedBy: auth.currentUser?.uid || null
            };

            // Save to Firestore/Supabase
            try {
               await addDoc(collection(db, 'media'), mediaData);
            } catch (fsError) {
               console.error("Gagal menyimpan ke database:", fsError);
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
          reject(new Error(`Gagal mengunggah file (HTTP ${xhr.status}).`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Koneksi terputus atau gagal mengunggah.'));
      });

      xhr.open('POST', '/api/media/upload');
      xhr.setRequestHeader('X-Auth-Token', token);
      if (typeof window !== 'undefined' && !window.location.hostname.endsWith('.run.app')) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  },

  deleteMedia: async (key: string): Promise<void> => {
    const token = await getAuthTokenSafe();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Auth-Token': token,
    };
    if (typeof window !== 'undefined' && !window.location.hostname.endsWith('.run.app')) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/media/delete', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ key })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || 'Gagal menghapus file media.');
    }
  },

  getInfo: async (key: string): Promise<any> => {
    const token = await getAuthTokenSafe();
    const headers: Record<string, string> = {
      'X-Auth-Token': token,
    };
    if (typeof window !== 'undefined' && !window.location.hostname.endsWith('.run.app')) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/media/info?key=${encodeURIComponent(key)}`, {
      headers
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || 'Gagal mendapatkan informasi file media.');
    }
    const data = await response.json();
    return data.data;
  }
};
