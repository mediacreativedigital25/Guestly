import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Building2, UploadCloud, Link as LinkIcon, Phone, Image as ImageIcon, MapPin, Lock, CheckCircle2 } from 'lucide-react';
import { MediaUploader } from '../components/media/MediaUploader';
import { showAlert, showCancelAlert } from '../lib/alerts';

export default function WhiteLabelSettings() {
  const { appUser } = useAuth();
  
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [brandingImageUrl, setBrandingImageUrl] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const isSuperAdmin = appUser?.role === 'superadmin';
  const isVerifiedPartner = Boolean(businessName.trim() && businessAddress.trim());

  useEffect(() => {
    if (appUser) {
      setBusinessName(appUser.businessName || '');
      setBusinessAddress(appUser.businessAddress || '');
      setBusinessCity(appUser.businessCity || '');
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
      const updatePayload: any = {
        phone,
        logoUrl,
        bannerUrl,
        brandingImageUrl,
        updatedAt: serverTimestamp()
      };

      // Only Super Admin can directly alter official Business Name & Address
      if (isSuperAdmin) {
        updatePayload.businessName = businessName.trim();
        updatePayload.businessAddress = businessAddress.trim();
        updatePayload.businessCity = businessCity.trim();
      }

      await updateDoc(userRef, updatePayload);
      
      if (isSuperAdmin) {
        appUser.businessName = businessName.trim();
        appUser.businessAddress = businessAddress.trim();
        appUser.businessCity = businessCity.trim();
      }
      appUser.phone = phone;
      appUser.logoUrl = logoUrl;
      appUser.bannerUrl = bannerUrl;
      appUser.brandingImageUrl = brandingImageUrl;
      
      setMessage({ text: 'Pengaturan branding berhasil disimpan.', type: 'success' });
      showAlert('Berhasil', 'Pengaturan branding berhasil disimpan.', 'success');
    } catch (error: any) {
      console.error(error);
      setMessage({ text: error.message || 'Gagal menyimpan pengaturan.', type: 'error' });
      showAlert('Gagal', error.message || 'Gagal menyimpan pengaturan.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (appUser?.role !== 'partner' && appUser?.role !== 'superadmin' && appUser?.role !== 'owner') {
    return <div className="p-8 text-center text-red-600">Anda tidak memiliki akses ke halaman ini.</div>;
  }

  return (
    <div className="w-full space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 sm:p-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-5">
            <div>
              <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-500" /> Identitas Usaha & Branding Partner
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Informasi ini akan ditampilkan sebagai branding resmi Anda kepada klien yang Anda kelola.
              </p>
            </div>
            {isVerifiedPartner ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
                <CheckCircle2 className="w-3.5 h-3.5" /> Partner Terverifikasi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 self-start sm:self-auto">
                <Lock className="w-3.5 h-3.5" /> Menunggu Verifikasi Super Admin
              </span>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {message.text && (
              <div className={`p-4 rounded-md text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {message.text}
              </div>
            )}

            {/* Official Partner Business Registration Section */}
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  Identitas Resmi Partner Guestly
                </div>
                {!isSuperAdmin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    <Lock className="w-3 h-3" /> Dikelola Super Admin
                  </span>
                )}
              </div>

              {!isSuperAdmin && (
                <p className="text-xs text-amber-900">
                  Pendaftaran serta perubahan <strong>Nama Usaha</strong> dan <strong>Alamat Resmi Partner</strong> dilakukan terpusat oleh <strong>Super Admin Guestly</strong>. Hubungi Super Admin jika terdapat pembaruan data usaha.
                </p>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Nama Usaha Resmi
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building2 className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={businessName}
                      disabled={!isSuperAdmin}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className={`pl-10 w-full border rounded-md px-3 py-2 text-sm ${
                        isSuperAdmin
                          ? 'border-gray-300 bg-white focus:ring-indigo-500 focus:border-indigo-500'
                          : 'border-amber-200 bg-gray-100/80 text-gray-700 font-semibold cursor-not-allowed'
                      }`}
                      placeholder="Belum didaftarkan oleh Super Admin"
                    />
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Alamat Lengkap Usaha
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <MapPin className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={businessAddress}
                      disabled={!isSuperAdmin}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      className={`pl-10 w-full border rounded-md px-3 py-2 text-sm ${
                        isSuperAdmin
                          ? 'border-gray-300 bg-white focus:ring-indigo-500 focus:border-indigo-500'
                          : 'border-amber-200 bg-gray-100/80 text-gray-700 cursor-not-allowed'
                      }`}
                      placeholder="Belum didaftarkan oleh Super Admin"
                    />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Kota / Domisili
                  </label>
                  <input
                    type="text"
                    value={businessCity}
                    disabled={!isSuperAdmin}
                    onChange={(e) => setBusinessCity(e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm ${
                      isSuperAdmin
                        ? 'border-gray-300 bg-white focus:ring-indigo-500 focus:border-indigo-500'
                        : 'border-amber-200 bg-gray-100/80 text-gray-700 cursor-not-allowed'
                    }`}
                    placeholder="-"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Logo Section */}
                <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 flex flex-col justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-indigo-500" /> Logo Usaha
                    </label>
                    <MediaUploader 
                      category="logo"
                      maxSize={2 * 1024 * 1024}
                      allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                      defaultValue={logoUrl}
                      onUploadSuccess={(data) => setLogoUrl(data.url)}
                      onUploadError={(err) => setMessage({ text: `Gagal mengunggah logo: ${err}`, type: 'error' })}
                    />
                  </div>
                  
                  <div className="mt-4">
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
                <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 flex flex-col justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-indigo-500" /> Banner Usaha
                    </label>
                    <MediaUploader 
                      category="banner"
                      maxSize={5 * 1024 * 1024}
                      allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                      defaultValue={bannerUrl}
                      onUploadSuccess={(data) => setBannerUrl(data.url)}
                      onUploadError={(err) => setMessage({ text: `Gagal mengunggah banner: ${err}`, type: 'error' })}
                    />
                  </div>
                  
                  <div className="mt-4">
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
                <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 flex flex-col justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-indigo-500" /> Branding Image
                    </label>
                    <MediaUploader 
                      category="banner"
                      maxSize={5 * 1024 * 1024}
                      allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                      defaultValue={brandingImageUrl}
                      onUploadSuccess={(data) => setBrandingImageUrl(data.url)}
                      onUploadError={(err) => setMessage({ text: `Gagal mengunggah branding: ${err}`, type: 'error' })}
                    />
                  </div>
                  
                  <div className="mt-4">
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
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  if (appUser) {
                    setBusinessName(appUser.businessName || '');
                    setBusinessAddress(appUser.businessAddress || '');
                    setBusinessCity(appUser.businessCity || '');
                    setPhone(appUser.phone || '');
                    setLogoUrl(appUser.logoUrl || '');
                    setBannerUrl(appUser.bannerUrl || '');
                    setBrandingImageUrl(appUser.brandingImageUrl || '');
                  }
                  showCancelAlert('Perubahan pengaturan White Label dibatalkan.');
                }}
                className="px-5 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium disabled:opacity-50 transition-colors"
              >
                Batal
              </button>
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

