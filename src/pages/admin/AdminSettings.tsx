import React, { useState, useEffect } from 'react';
import { UploadCloud, Link as LinkIcon, MessageSquare, CreditCard, Image as ImageIcon, Building } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSettings } from '../../SettingsContext';
import { showAlert, showConfirm } from '../../lib/alerts';
import AdminSalespageSettings from './AdminSalespageSettings';
import { MediaUploader } from '../../components/media/MediaUploader';

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('branding');
  const { settings } = useSettings();

  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl || '');
  const [faviconUrl, setFaviconUrl] = useState(settings?.faviconUrl || '');
  const [templateOrderCreated, setTemplateOrderCreated] = useState(settings?.fonnteTemplates?.orderCreated || '');
  const [templateOrderPaid, setTemplateOrderPaid] = useState(settings?.fonnteTemplates?.orderPaid || '');
  const [templateOrderCancelled, setTemplateOrderCancelled] = useState(settings?.fonnteTemplates?.orderCancelled || '');
  const [activePaymentMethod, setActivePaymentMethod] = useState(settings?.activePaymentMethod || 'manual');
  const [clientKey, setClientKey] = useState(settings?.paymentGateway?.clientKey || '');
  
  const [bankName, setBankName] = useState(settings?.manualPayment?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(settings?.manualPayment?.accountNumber || '');
  const [accountName, setAccountName] = useState(settings?.manualPayment?.accountName || '');
  const [instructions, setInstructions] = useState(settings?.manualPayment?.instructions || '');

  // Salespage settings
  const [salespageData, setSalespageData] = useState<any>({});

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setLogoUrl(settings.logoUrl || '');
      setFaviconUrl(settings.faviconUrl || '');
      setTemplateOrderCreated(settings.fonnteTemplates?.orderCreated || '');
      setTemplateOrderPaid(settings.fonnteTemplates?.orderPaid || '');
      setTemplateOrderCancelled(settings.fonnteTemplates?.orderCancelled || '');
      setActivePaymentMethod(settings.activePaymentMethod || 'manual');
      setClientKey(settings.paymentGateway?.clientKey || '');
      setBankName(settings.manualPayment?.bankName || '');
      setAccountNumber(settings.manualPayment?.accountNumber || '');
      setAccountName(settings.manualPayment?.accountName || '');
      setInstructions(settings.manualPayment?.instructions || '');
      
      // Load salespage settings
      if (settings.salespage) {
        setSalespageData(settings.salespage);
      }
    }
  }, [settings]);

  const updateSP = (key: string, value: any) => {
    setSalespageData((prev: any) => ({ ...prev, [key]: value }));
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
        await setDoc(globalSettingsRef, { 
          ...currentData, 
          fonnteTemplates: {
            orderCreated: templateOrderCreated,
            orderPaid: templateOrderPaid,
            orderCancelled: templateOrderCancelled
          }
        }, { merge: true });
        showAlert('Berhasil', 'Fonnte settings saved successfully!', 'success');
      } else if (tab === 'payment_methods') {
        await setDoc(globalSettingsRef, { 
          ...currentData, 
          activePaymentMethod,
          paymentGateway: { clientKey },
          manualPayment: { bankName, accountNumber, accountName, instructions }
        }, { merge: true });
        showAlert('Berhasil', 'Metode Pembayaran berhasil disimpan!', 'success');
      } else if (tab === 'salespage') {
        await setDoc(globalSettingsRef, {
          ...currentData,
          salespage: salespageData
        }, { merge: true });
        showAlert('Berhasil', 'Halaman Salespage berhasil disimpan!', 'success');
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
          <button
            onClick={() => setActiveTab('salespage')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'salespage' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Halaman Salespage
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
                    <MediaUploader
                      category="logo"
                      maxSize={2 * 1024 * 1024}
                      allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                      defaultValue={logoUrl}
                      onUploadSuccess={(data) => setLogoUrl(data.url)}
                      onUploadError={(err) => showAlert('Gagal', `Gagal mengunggah logo: ${err}`, 'error')}
                    />
                    <div className="text-sm text-gray-500 mt-2">Ukuran yang disarankan: 365 x 70 piksel.</div>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-4">
                  <ImageIcon className="w-5 h-5 text-indigo-500" /> Upload Favicon
                </h2>
                <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
                  <div className="space-y-4">
                    <MediaUploader
                      category="favicon"
                      maxSize={512 * 1024}
                      allowedMimeTypes={['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp', '.ico']}
                      defaultValue={faviconUrl}
                      onUploadSuccess={(data) => setFaviconUrl(data.url)}
                      onUploadError={(err) => showAlert('Gagal', `Gagal mengunggah favicon: ${err}`, 'error')}
                    />
                    <div className="text-sm text-gray-500 mt-2">Ukuran yang disarankan: 256 x 256 piksel.</div>
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
                <p className="text-sm text-gray-500 mb-4">Template pengiriman pesan WhatsApp.</p>
                <div className="space-y-4 max-w-3xl">
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-4 mb-4">
                    <p className="text-sm font-medium">Informasi Keamanan</p>
                    <p className="text-sm mt-1">Demi keamanan maksimum, API Token Fonnte tidak lagi disimpan di database. Silakan atur token Anda melalui Environment Variable <code>FONNTE_TOKEN</code> di sisi server (\`.env\`).</p>
                  </div>
                  
                  <div className="pt-4 border-t border-gray-200">
                    <h3 className="text-md font-semibold text-gray-900 mb-3">Template Pesan WhatsApp</h3>
                    <p className="text-xs text-gray-500 mb-4">Anda dapat menggunakan variabel berikut dalam template: <br/><code>{"{userName}"}</code>, <code>{"{serviceName}"}</code>, <code>{"{invoiceId}"}</code>, <code>{"{amount}"}</code></p>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pesanan Dibuat (Pending)</label>
                        <textarea 
                          value={templateOrderCreated} 
                          onChange={e => setTemplateOrderCreated(e.target.value)} 
                          placeholder={"Halo {userName},\n\nPesanan Anda untuk {serviceName} berhasil dibuat.\nNomor: {invoiceId}\nTotal: {amount}"} 
                          rows={4} 
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pesanan Dibayar (Sukses)</label>
                        <textarea 
                          value={templateOrderPaid} 
                          onChange={e => setTemplateOrderPaid(e.target.value)} 
                          placeholder={"Halo {userName},\n\nPembayaran untuk pesanan {serviceName} ({invoiceId}) telah berhasil dikonfirmasi.\nLayanan Anda sudah aktif."} 
                          rows={4} 
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pesanan Dibatalkan</label>
                        <textarea 
                          value={templateOrderCancelled} 
                          onChange={e => setTemplateOrderCancelled(e.target.value)} 
                          placeholder={"Halo {userName},\n\nMohon maaf, pesanan layanan {serviceName} ({invoiceId}) telah dibatalkan."} 
                          rows={4} 
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button type="button" onClick={() => handleSave('fonnte')} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan Fonnte'}
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
                      <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-4 mb-4">
                        <p className="text-sm font-medium">Informasi Keamanan</p>
                        <p className="text-sm mt-1">Demi keamanan maksimum, API Token Tripay (Private Key) tidak lagi disimpan di database. Silakan atur token Anda melalui Environment Variable <code>TRIPAY_PRIVATE_KEY</code> di sisi server (\`.env\`).</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tripay API Key (Public)</label>
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

          {activeTab === 'salespage' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Pengaturan Salespage</h2>
                <button type="button" onClick={() => handleSave('salespage')} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
              <AdminSalespageSettings 
                data={salespageData} 
                updateData={updateSP} 
              />
              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button type="button" onClick={() => handleSave('salespage')} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan Halaman Salespage'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
