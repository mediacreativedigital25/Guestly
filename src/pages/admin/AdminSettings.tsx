import React, { useState, useEffect } from 'react';
import { UploadCloud, Link as LinkIcon, MessageSquare, CreditCard, Image as ImageIcon, Building } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSettings } from '../../SettingsContext';
import { showAlert, showConfirm } from '../../lib/alerts';

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('branding');
  const { settings } = useSettings();

  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl || '');
  const [faviconUrl, setFaviconUrl] = useState(settings?.faviconUrl || '');
  const [fonnteToken, setFonnteToken] = useState(settings?.fonnteToken || '');
  const [activePaymentMethod, setActivePaymentMethod] = useState(settings?.activePaymentMethod || 'manual');
  const [serverKey, setServerKey] = useState(settings?.paymentGateway?.serverKey || '');
  const [clientKey, setClientKey] = useState(settings?.paymentGateway?.clientKey || '');
  
  const [bankName, setBankName] = useState(settings?.manualPayment?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(settings?.manualPayment?.accountNumber || '');
  const [accountName, setAccountName] = useState(settings?.manualPayment?.accountName || '');
  const [instructions, setInstructions] = useState(settings?.manualPayment?.instructions || '');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setLogoUrl(settings.logoUrl || '');
      setFaviconUrl(settings.faviconUrl || '');
      setFonnteToken(settings.fonnteToken || '');
      setActivePaymentMethod(settings.activePaymentMethod || 'manual');
      setServerKey(settings.paymentGateway?.serverKey || '');
      setClientKey(settings.paymentGateway?.clientKey || '');
      setBankName(settings.manualPayment?.bankName || '');
      setAccountNumber(settings.manualPayment?.accountNumber || '');
      setAccountName(settings.manualPayment?.accountName || '');
      setInstructions(settings.manualPayment?.instructions || '');
    }
  }, [settings]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'logo' && file.size > 800 * 1024) {
      showAlert('Peringatan', 'Logo size must be less than 800KB', 'warning');
      return;
    }
    if (type === 'favicon' && file.size > 200 * 1024) {
      showAlert('Peringatan', 'Favicon size must be less than 200KB', 'warning');
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
    const confirmed = await showConfirm("Apakah Anda yakin ingin menyimpan pengaturan ini?");
    if (!confirmed) {
      return;
    }
    
    setIsSaving(true);
    try {
      const globalSettingsRef = doc(db, 'settings', 'global');
      const currentDoc = await getDoc(globalSettingsRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};

      if (tab === 'branding') {
        await setDoc(globalSettingsRef, { ...currentData, logoUrl, faviconUrl }, { merge: true });
        showAlert('Berhasil', 'Branding saved successfully!', 'success');
      } else if (tab === 'fonnte') {
        await setDoc(globalSettingsRef, { ...currentData, fonnteToken }, { merge: true });
        showAlert('Berhasil', 'Fonnte token saved successfully!', 'success');
      } else if (tab === 'payment_methods') {
        await setDoc(globalSettingsRef, { 
          ...currentData, 
          activePaymentMethod,
          paymentGateway: { serverKey, clientKey },
          manualPayment: { bankName, accountNumber, accountName, instructions }
        }, { merge: true });
        showAlert('Berhasil', 'Metode Pembayaran berhasil disimpan!', 'success');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showAlert('Gagal', 'Failed to save settings.', 'error');
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
            onClick={() => setActiveTab('payment_methods')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'payment_methods' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Metode Pembayaran
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

          {activeTab === 'payment_methods' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-indigo-500" /> Pengaturan Pembayaran
                </h2>
                <p className="text-sm text-gray-500 mb-6">Kelola dan pilih metode pembayaran utama yang akan digunakan pelanggan.</p>
                
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-8">
                  <label className="block text-sm font-semibold text-gray-900 mb-3">Pilih Metode Pembayaran Utama</label>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className={`flex-1 flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${activePaymentMethod === 'manual' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 bg-white hover:border-indigo-300'}`}>
                      <input type="radio" name="paymentMethod" value="manual" checked={activePaymentMethod === 'manual'} onChange={() => setActivePaymentMethod('manual')} className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                      <div className="ml-3">
                        <span className="block text-sm font-medium text-gray-900">Manual Transfer</span>
                        <span className="block text-xs text-gray-500 mt-0.5">Verifikasi manual via admin</span>
                      </div>
                    </label>
                    <label className={`flex-1 flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${activePaymentMethod === 'tripay' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 bg-white hover:border-indigo-300'}`}>
                      <input type="radio" name="paymentMethod" value="tripay" checked={activePaymentMethod === 'tripay'} onChange={() => setActivePaymentMethod('tripay')} className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                      <div className="ml-3">
                        <span className="block text-sm font-medium text-gray-900">Tripay (Payment Gateway)</span>
                        <span className="block text-xs text-gray-500 mt-0.5">Pembayaran & verifikasi otomatis (Beta)</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8 border-t border-gray-100 pt-8">
                  {/* Manual Payment Fields */}
                  <div className={`p-5 border rounded-lg ${activePaymentMethod === 'manual' ? 'border-indigo-200 bg-white shadow-sm ring-1 ring-indigo-500' : 'border-gray-200 bg-gray-50/50'}`}>
                    <h3 className="text-md font-semibold text-gray-900 flex items-center gap-2 mb-4">
                      <Building className="w-5 h-5 text-gray-400" /> Informasi Rekening Bank (Manual)
                    </h3>
                    <div className="space-y-4 max-w-3xl">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nama Bank</label>
                          <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Misal: BCA" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Rekening</label>
                          <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Misal: 1234567890" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nama Pemilik Rekening</label>
                        <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Misal: PT Karya Kreatif" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Instruksi Tambahan (Opsional)</label>
                        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Misal: Harap sertakan nomor invoice pada berita transfer..." rows={3} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                      </div>
                    </div>
                  </div>

                  {/* Tripay Payment Fields */}
                  <div className={`p-5 border rounded-lg ${activePaymentMethod === 'tripay' ? 'border-indigo-200 bg-white shadow-sm ring-1 ring-indigo-500' : 'border-gray-200 bg-gray-50/50'}`}>
                    <h3 className="text-md font-semibold text-gray-900 flex items-center gap-2 mb-4">
                      Tripay Payment Gateway (Beta)
                    </h3>
                    <div className="p-3 bg-yellow-50/80 text-yellow-800 border border-yellow-200 rounded text-xs font-medium mb-4">
                      Integrasi Tripay sedang dalam pengembangan (Beta). Untuk sekarang, pembayaran otomatis mungkin belum sepenuhnya berfungsi.
                    </div>
                    <div className="space-y-4 max-w-3xl">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tripay Private Key</label>
                        <input type="password" value={serverKey} onChange={e => setServerKey(e.target.value)} placeholder="Masukkan Private Key" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tripay API Key</label>
                        <input type="text" value={clientKey} onChange={e => setClientKey(e.target.value)} placeholder="Masukkan API Key" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button type="button" onClick={() => handleSave('payment_methods')} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan Pembayaran'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
