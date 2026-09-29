import React, { useState, useEffect } from 'react';
import { UploadCloud, Link as LinkIcon, MessageSquare, CreditCard, Image as ImageIcon, Building, Eye, EyeOff, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSettings } from '../../SettingsContext';
import { showAlert, showConfirm, showCancelAlert } from '../../lib/alerts';
import AdminSalespageSettings from './AdminSalespageSettings';
import { MediaUploader } from '../../components/media/MediaUploader';
import { sendFonnteMessage } from '../../lib/fonnte';

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('branding');
  const { settings } = useSettings();

  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl || '');
  const [faviconUrl, setFaviconUrl] = useState(settings?.faviconUrl || '');
  const [fonnteToken, setFonnteToken] = useState(settings?.fonnteToken || '');
  const [showFonnteToken, setShowFonnteToken] = useState(false);
  const [serverFonnteStatus, setServerFonnteStatus] = useState<{ configured: boolean; envConfigured: boolean; source: string } | null>(null);
  const [testWaPhone, setTestWaPhone] = useState('');
  const [isTestingWa, setIsTestingWa] = useState(false);

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
      setFonnteToken(settings.fonnteToken || '');
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

  useEffect(() => {
    if (activeTab === 'fonnte') {
      fetch('/api/fonnte-status')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) setServerFonnteStatus(data);
        })
        .catch(() => {});
    }
  }, [activeTab, settings?.fonnteToken]);

  const handleTestWhatsApp = async () => {
    if (!testWaPhone.trim()) {
      showAlert('Perhatian', 'Masukkan nomor WhatsApp tujuan untuk tes pengiriman.', 'warning');
      return;
    }
    setIsTestingWa(true);
    try {
      const tokenToUse = fonnteToken.trim() || settings?.fonnteToken || null;
      const res = await sendFonnteMessage(
        tokenToUse,
        testWaPhone.trim(),
        `✅ *Tes Integrasi WhatsApp Guestly*\n\nSelamat! Koneksi API Token Fonnte Anda telah aktif dan siap digunakan untuk mengirim notifikasi otomatis.`
      );
      if (res.success) {
        showAlert('Berhasil', `Pesan tes WhatsApp berhasil dikirim ke ${testWaPhone.trim()}!`, 'success');
      } else {
        showAlert('Gagal Mengirim WA', res.error || 'Gagal mengirim pesan WhatsApp. Pastikan Token Fonnte valid dan perangkat WhatsApp terhubung di dashboard Fonnte.', 'error');
      }
    } catch (err: any) {
      showAlert('Gagal', err.message || 'Terjadi kesalahan saat mengetes pengiriman WhatsApp.', 'error');
    } finally {
      setIsTestingWa(false);
    }
  };

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
          fonnteToken: fonnteToken.trim(),
          fonnteTemplates: {
            orderCreated: templateOrderCreated,
            orderPaid: templateOrderPaid,
            orderCancelled: templateOrderCancelled
          }
        }, { merge: true });
        setServerFonnteStatus(prev => ({
          configured: Boolean(fonnteToken.trim() || prev?.envConfigured),
          envConfigured: Boolean(prev?.envConfigured),
          source: prev?.envConfigured ? 'env' : (fonnteToken.trim() ? 'database' : 'none')
        }));
        showAlert('Berhasil', 'Pengaturan & Token Fonnte berhasil disimpan!', 'success');
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
                      onUploadSuccess={async (data) => {
                        setLogoUrl(data.url);
                        try {
                          await setDoc(doc(db, 'settings', 'global'), { logoUrl: data.url }, { merge: true });
                        } catch {
                          // ignore auto-save error
                        }
                      }}
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
                      onUploadSuccess={async (data) => {
                        setFaviconUrl(data.url);
                        try {
                          await setDoc(doc(db, 'settings', 'global'), { faviconUrl: data.url }, { merge: true });
                        } catch {
                          // ignore auto-save error
                        }
                      }}
                      onUploadError={(err) => showAlert('Gagal', `Gagal mengunggah favicon: ${err}`, 'error')}
                    />
                    <div className="text-sm text-gray-500 mt-2">Ukuran yang disarankan: 256 x 256 piksel.</div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    if (settings) {
                      setLogoUrl(settings.logoUrl || '');
                      setFaviconUrl(settings.faviconUrl || '');
                    }
                    showCancelAlert('Perubahan pengaturan branding telah dibatalkan.');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button type="button" onClick={() => handleSave('branding')} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan Branding'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'fonnte' && (
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-indigo-500" /> Integrasi WhatsApp Fonnte (Beta)
                  </h2>
                  {Boolean(fonnteToken.trim() || serverFonnteStatus?.configured) ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Token Terkonfigurasi
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      <AlertCircle className="w-3.5 h-3.5" /> Token Belum Diisi
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mb-4">Konfigurasi API Token Fonnte dan template pengiriman pesan WhatsApp otomatis.</p>
                <div className="space-y-5 max-w-3xl">
                  <div className="p-4 border border-indigo-100 bg-indigo-50/40 rounded-lg space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-1">
                        API Token Fonnte
                      </label>
                      <p className="text-xs text-gray-600 mb-2">
                        Masukkan API Token dari dashboard <a href="https://md.fonnte.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-medium">Fonnte</a> (menu Device &rarr; Token). Token ini digunakan untuk mengirim notifikasi akun Client/User baru, undangan tamu, dan invoice.
                      </p>
                      <div className="relative">
                        <input
                          type={showFonnteToken ? 'text' : 'password'}
                          value={fonnteToken}
                          onChange={e => setFonnteToken(e.target.value)}
                          placeholder={serverFonnteStatus?.envConfigured ? 'Terkonfigurasi via Server ENV (Isi untuk mengganti)...' : 'Masukkan API Token Fonnte Anda...'}
                          className="w-full border border-gray-300 rounded-md pl-3 pr-10 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowFonnteToken(!showFonnteToken)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                          title={showFonnteToken ? 'Sembunyikan Token' : 'Tampilkan Token'}
                        >
                          {showFonnteToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Test Send WhatsApp */}
                    <div className="pt-3 border-t border-indigo-100">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Uji Coba Kirim Pesan WhatsApp
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="tel"
                          value={testWaPhone}
                          onChange={e => setTestWaPhone(e.target.value)}
                          placeholder="Nomor WA Tujuan (Contoh: 081234567890)"
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleTestWhatsApp}
                          disabled={isTestingWa}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          {isTestingWa ? 'Mengirim...' : 'Tes Kirim WA'}
                        </button>
                      </div>
                    </div>
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
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    if (settings) {
                      setFonnteToken(settings.fonnteToken || '');
                      setTemplateOrderCreated(settings.fonnteTemplates?.orderCreated || '');
                      setTemplateOrderPaid(settings.fonnteTemplates?.orderPaid || '');
                      setTemplateOrderCancelled(settings.fonnteTemplates?.orderCancelled || '');
                    }
                    showCancelAlert('Perubahan pengaturan Fonnte telah dibatalkan.');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
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
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    if (settings) {
                      setActivePaymentMethod(settings.activePaymentMethod || 'manual');
                      setClientKey(settings.paymentGateway?.clientKey || '');
                      setBankName(settings.manualPayment?.bankName || '');
                      setAccountNumber(settings.manualPayment?.accountNumber || '');
                      setAccountName(settings.manualPayment?.accountName || '');
                      setInstructions(settings.manualPayment?.instructions || '');
                    }
                    showCancelAlert('Perubahan pengaturan metode pembayaran telah dibatalkan.');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
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
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    if (settings?.salespage) {
                      setSalespageData(settings.salespage);
                    }
                    showCancelAlert('Perubahan pengaturan Salespage telah dibatalkan.');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
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
