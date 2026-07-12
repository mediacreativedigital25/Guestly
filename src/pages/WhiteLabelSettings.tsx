import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Building2, UploadCloud, Link as LinkIcon, Phone, Image as ImageIcon } from 'lucide-react';
import { MediaUploader } from '../components/media/MediaUploader';

export default function WhiteLabelSettings() {
  const { appUser } = useAuth();
  
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [brandingImageUrl, setBrandingImageUrl] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (appUser) {
      setBusinessName(appUser.businessName || '');
      setPhone(appUser.phone || '');
      setLogoUrl(appUser.logoUrl || '');
      setBannerUrl(appUser.bannerUrl || '');
      setBrandingImageUrl(appUser.brandingImageUrl || '');
    }
  }, [appUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.id) return;
    
    setIsSaving(true);
    setMessage({ text: '', type: '' });
    
    try {
      const userRef = doc(db, 'users', appUser.id);
      await updateDoc(userRef, {
        businessName,
        phone,
        logoUrl,
        bannerUrl,
        brandingImageUrl,
        updatedAt: serverTimestamp()
      });
      
      appUser.businessName = businessName;
      appUser.phone = phone;
      appUser.logoUrl = logoUrl;
      appUser.bannerUrl = bannerUrl;
      appUser.brandingImageUrl = brandingImageUrl;
      
      setMessage({ text: 'Pengaturan berhasil disimpan.', type: 'success' });
    } catch (error: any) {
      console.error(error);
      setMessage({ text: error.message || 'Gagal menyimpan pengaturan.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (appUser?.role !== 'partner' && appUser?.role !== 'superadmin') {
    return <div className="p-8 text-center text-red-600">Anda tidak memiliki akses ke halaman ini.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">White Label Settings</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 sm:p-8 space-y-8">
          <div>
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-500" /> Profil Usaha
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Informasi ini akan ditampilkan sebagai branding Anda kepada klien yang Anda kelola.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {message.text && (
              <div className={`p-4 rounded-md text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {message.text}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Usaha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="pl-10 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Contoh: Bintang Project Wedding"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  No HP / WhatsApp
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Contoh: 081234567890"
                  />
                </div>
              </div>

              {/* Logo Section */}
              <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
                <label className="block text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Logo Usaha
                </label>
                
                <div className="space-y-4">
                  <MediaUploader 
                    category="logo"
                    maxSize={2 * 1024 * 1024}
                    allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                    defaultValue={logoUrl}
                    onUploadSuccess={(data) => setLogoUrl(data.url)}
                    onUploadError={(err) => setMessage({ text: `Gagal mengunggah logo: ${err}`, type: 'error' })}
                  />
                  
                  <div className="flex items-center gap-2 py-2">
                    <div className="h-px flex-1 bg-gray-300"></div>
                    <span className="text-xs text-gray-500 font-medium uppercase">Atau URL Gambar</span>
                    <div className="h-px flex-1 bg-gray-300"></div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="pl-10 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                </div>
              </div>

              {/* Banner Section */}
              <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
                <label className="block text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Banner Usaha
                </label>
                
                <div className="space-y-4">
                  <MediaUploader 
                    category="banner"
                    maxSize={5 * 1024 * 1024}
                    allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                    defaultValue={bannerUrl}
                    onUploadSuccess={(data) => setBannerUrl(data.url)}
                    onUploadError={(err) => setMessage({ text: `Gagal mengunggah banner: ${err}`, type: 'error' })}
                  />
                  
                  <div className="flex items-center gap-2 py-2">
                    <div className="h-px flex-1 bg-gray-300"></div>
                    <span className="text-xs text-gray-500 font-medium uppercase">Atau URL Gambar</span>
                    <div className="h-px flex-1 bg-gray-300"></div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="url"
                      value={bannerUrl}
                      onChange={(e) => setBannerUrl(e.target.value)}
                      className="pl-10 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="https://example.com/banner.png"
                    />
                  </div>
                </div>
              </div>

              {/* Branding Image Section */}
              <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
                <label className="block text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Branding Image
                </label>
                
                <div className="space-y-4">
                  <MediaUploader 
                    category="banner"
                    maxSize={5 * 1024 * 1024}
                    allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                    defaultValue={brandingImageUrl}
                    onUploadSuccess={(data) => setBrandingImageUrl(data.url)}
                    onUploadError={(err) => setMessage({ text: `Gagal mengunggah branding: ${err}`, type: 'error' })}
                  />
                  
                  <div className="flex items-center gap-2 py-2">
                    <div className="h-px flex-1 bg-gray-300"></div>
                    <span className="text-xs text-gray-500 font-medium uppercase">Atau URL Gambar</span>
                    <div className="h-px flex-1 bg-gray-300"></div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="url"
                      value={brandingImageUrl}
                      onChange={(e) => setBrandingImageUrl(e.target.value)}
                      className="pl-10 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="https://example.com/branding.png"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    Simpan Pengaturan
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

