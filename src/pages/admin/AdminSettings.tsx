import React, { useState, useEffect } from 'react';
import { UploadCloud, Link as LinkIcon, MessageSquare, CreditCard, Image as ImageIcon } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSettings } from '../../SettingsContext';

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('branding');
  const { settings } = useSettings();

  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl || '');
  const [faviconUrl, setFaviconUrl] = useState(settings?.faviconUrl || '');
  const [fonnteToken, setFonnteToken] = useState(settings?.fonnteToken || '');
  const [serverKey, setServerKey] = useState(settings?.paymentGateway?.serverKey || '');
  const [clientKey, setClientKey] = useState(settings?.paymentGateway?.clientKey || '');
  
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setLogoUrl(settings.logoUrl || '');
      setFaviconUrl(settings.faviconUrl || '');
      setFonnteToken(settings.fonnteToken || '');
      setServerKey(settings.paymentGateway?.serverKey || '');
      setClientKey(settings.paymentGateway?.clientKey || '');
    }
  }, [settings]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'logo' && file.size > 800 * 1024) {
      alert('Logo size must be less than 800KB');
      return;
    }
    if (type === 'favicon' && file.size > 200 * 1024) {
      alert('Favicon size must be less than 200KB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (type === 'logo') setLogoUrl(base64String);
      if (type === 'favicon') setFaviconUrl(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (tab: string) => {
    setIsSaving(true);
    try {
      const globalSettingsRef = doc(db, 'settings', 'global');
      const currentDoc = await getDoc(globalSettingsRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};

      if (tab === 'branding') {
        await setDoc(globalSettingsRef, { ...currentData, logoUrl, faviconUrl }, { merge: true });
        alert('Branding saved successfully!');
      } else if (tab === 'fonnte') {
        await setDoc(globalSettingsRef, { ...currentData, fonnteToken }, { merge: true });
        alert('Fonnte token saved successfully!');
      } else if (tab === 'payment') {
        await setDoc(globalSettingsRef, { ...currentData, paymentGateway: { serverKey, clientKey } }, { merge: true });
        alert('Payment Gateway saved successfully!');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Admin Setting</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('branding')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'branding' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Branding (Logo & Favicon)
          </button>
          <button
            onClick={() => setActiveTab('fonnte')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'fonnte' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Token Fonnte (Beta)
          </button>
          <button
            onClick={() => setActiveTab('payment')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'payment' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Payment Gateway (Beta)
          </button>
        </div>

        <div className="p-6 sm:p-8">
          {activeTab === 'branding' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-4">
                  <ImageIcon className="w-5 h-5 text-indigo-500" /> Upload Logo Platform
                </h2>
                <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <label className="cursor-pointer px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        <UploadCloud className="w-4 h-4" /> Pilih Logo
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'logo')} />
                      </label>
                      <span className="text-sm text-gray-500">Maks. 800KB. Ukuran yang disarankan: 365 x 70 piksel.</span>
                    </div>
                    {logoUrl && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Preview Logo:</p>
                        <img src={logoUrl} alt="Logo" className="h-auto max-h-20 w-auto max-w-full object-contain" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-4">
                  <ImageIcon className="w-5 h-5 text-indigo-500" /> Upload Favicon
                </h2>
                <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <label className="cursor-pointer px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        <UploadCloud className="w-4 h-4" /> Pilih Favicon
                        <input type="file" accept=".ico,.png" className="hidden" onChange={(e) => handleFileUpload(e, 'favicon')} />
                      </label>
                      <span className="text-sm text-gray-500">Maks. 200KB (.ico or .png). Ukuran yang disarankan: 256 x 256 piksel.</span>
                    </div>
                    {faviconUrl && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Preview Favicon:</p>
                        <img src={faviconUrl} alt="Favicon" className="h-8 w-8 object-contain" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button type="button" onClick={() => handleSave('branding')} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan Branding'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'fonnte' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-1">
                  <MessageSquare className="w-5 h-5 text-indigo-500" /> Integrasi WhatsApp Fonnte (Beta)
                </h2>
                <p className="text-sm text-gray-500 mb-4">Pengaturan token untuk API Fonnte pengiriman pesan WhatsApp.</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Token</label>
                    <input type="password" value={fonnteToken} onChange={e => setFonnteToken(e.target.value)} placeholder="Masukkan Token Fonnte" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button type="button" onClick={() => handleSave('fonnte')} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan Token'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'payment' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-1">
                  <CreditCard className="w-5 h-5 text-indigo-500" /> Payment Gateway (Beta)
                </h2>
                <p className="text-sm text-gray-500 mb-4">Integrasi dengan sistem pembayaran otomatis untuk invoice (seperti Midtrans, Xendit, atau lainnya).</p>
                <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-md mb-4 text-sm font-medium">
                  Modul ini sedang dalam tahap pengembangan (Beta). Hubungi pengembang untuk integrasi lebih lanjut.
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Server Key / Secret Key</label>
                    <input type="password" value={serverKey} onChange={e => setServerKey(e.target.value)} placeholder="Masukkan Server Key" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Client Key / Public Key</label>
                    <input type="text" value={clientKey} onChange={e => setClientKey(e.target.value)} placeholder="Masukkan Client Key" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button type="button" onClick={() => handleSave('payment')} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan Payment API'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
