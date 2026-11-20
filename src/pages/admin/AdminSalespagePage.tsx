import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Globe, ExternalLink, Save, Loader2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import { useSettings } from '../../SettingsContext';
import { showAlert, showCancelAlert } from '../../lib/alerts';
import AdminSalespageSettings from './AdminSalespageSettings';

export default function AdminSalespagePage() {
  const { appUser } = useAuth();
  const { settings } = useSettings();
  const [salespageData, setSalespageData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings?.salespage) {
      setSalespageData(settings.salespage);
    }
  }, [settings?.salespage]);

  if (appUser && appUser.role !== 'superadmin') {
    return <Navigate to="/auth/login" replace />;
  }

  const updateSP = (key: string, value: any) => {
    setSalespageData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const globalSettingsRef = doc(db, 'settings', 'global');
      const currentDoc = await getDoc(globalSettingsRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};

      await setDoc(
        globalSettingsRef,
        {
          ...currentData,
          salespage: salespageData,
        },
        { merge: true }
      );
      showAlert('Berhasil', 'Setting Salespage berhasil disimpan!', 'success');
    } catch (error) {
      console.error('Error saving salespage settings:', error);
      showAlert('Gagal', 'Gagal menyimpan Setting Salespage.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setSalespageData(settings?.salespage || {});
    showCancelAlert('Perubahan Setting Salespage telah dibatalkan.');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 sm:px-7 sm:py-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#8C3A50]/10 text-[#8C3A50] flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Setting Salespage</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Kelola konten, media foto/video, partner, statistik, alur kerja, FAQ, dan tampilan halaman depan salespage.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Lihat Salespage
            </a>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Simpan Perubahan
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-7 space-y-6">
          <AdminSalespageSettings
            data={salespageData}
            updateData={updateSP}
            onReplaceData={setSalespageData}
          />

          <div className="pt-5 border-t border-gray-200 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Simpan Halaman Salespage
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
