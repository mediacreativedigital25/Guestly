import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Building2, UploadCloud, Link as LinkIcon, Phone, Image as ImageIcon, ExternalLink, AlertCircle } from 'lucide-react';

export default function WhiteLabelSettings() {
  const { appUser } = useAuth();
  
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (appUser) {
      setBusinessName(appUser.businessName || '');
      setPhone(appUser.phone || '');
      setLogoUrl(appUser.logoUrl || '');
    }
  }, [appUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.id) return;
    
    setIsSaving(true);
    setMessage({ text: '', type: '' });
    
    // Check if the base64 string is too large (over ~800KB)
    if (logoUrl.startsWith('data:image') && logoUrl.length > 800000) {
      setMessage({ text: 'Ukuran gambar terlalu besar. Silakan kompres terlebih dahulu.', type: 'error' });
      setIsSaving(false);
      return;
    }
    
    try {
      const userRef = doc(db, 'users', appUser.id);
      await updateDoc(userRef, {
        businessName,
        phone,
        logoUrl,
        updatedAt: serverTimestamp()
      });
      
      // Update appUser context manually if needed
      appUser.businessName = businessName;
      appUser.phone = phone;
      appUser.logoUrl = logoUrl;
      
      setMessage({ text: 'Pengaturan berhasil disimpan.', type: 'success' });
    } catch (error: any) {
      console.error(error);
      setMessage({ text: error.message || 'Gagal menyimpan pengaturan.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) { // 800KB limit
      setMessage({ 
        text: 'Ukuran file melebihi 800KB. Silakan kompres gambar Anda menggunakan tools kompresor.', 
        type: 'error' 
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setLogoUrl(event.target.result as string);
        setMessage({ text: '', type: '' });
      }
    };
    reader.readAsDataURL(file);
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

              <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
                <label className="block text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Logo Usaha
                </label>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center gap-2"
                    >
                      <UploadCloud className="w-4 h-4" /> Pilih Gambar Logo
                    </button>
                    <span className="text-sm text-gray-500">Maks. 800KB</span>
                  </div>
                  
                  <div className="flex items-start bg-blue-50 p-3 rounded-md border border-blue-100">
                    <AlertCircle className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-800">
                        Jika gambar oversize (lebih dari 800KB), kompres terlebih dahulu di:
                      </p>
                      <a 
                        href="https://imgtools.zyvora.my.id/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-white px-2 py-1 rounded border border-indigo-200"
                      >
                        <ExternalLink className="w-3 h-3" /> imgtools.zyvora.my.id
                      </a>
                    </div>
                  </div>

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

              {logoUrl && (
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Preview Logo</label>
                   <div className="p-4 border border-gray-200 bg-white rounded-lg inline-block shadow-sm">
                     <img src={logoUrl} alt="Preview Logo" className="h-24 object-contain" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Invalid+Image'; }} />
                   </div>
                </div>
              )}
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

