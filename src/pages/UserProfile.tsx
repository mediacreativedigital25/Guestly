import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  User,
  Lock,
  Save,
  MessageCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wifi,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { showAlert, showCancelAlert, showConfirm } from '../lib/alerts';
import { getRoleLabel } from '../lib/utils';
import { checkFonnteDevice, FonnteDeviceCheckResult } from '../lib/fonnte';
import { WaGroupSettingsPanel, WaGroupSettingsValue } from '../components/WaGroupSettingsPanel';
import { DEFAULT_GROUP_REMINDER_TIME, DEFAULT_GROUP_REMINDER_H0_TIME } from '../lib/waGroupReminder';

export default function UserProfile() {
  const { currentUser, appUser } = useAuth();
  const [name, setName] = useState(appUser?.name || '');
  const [phone, setPhone] = useState(appUser?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Personal Fonnte Token Integration
  const [fonnteToken, setFonnteToken] = useState(appUser?.fonnteToken || '');
  const [showFonnteToken, setShowFonnteToken] = useState(false);
  const [isSavingFonnte, setIsSavingFonnte] = useState(false);
  const [isCheckingDevice, setIsCheckingDevice] = useState(false);
  const [deviceCheck, setDeviceCheck] = useState<FonnteDeviceCheckResult | null>(null);

  // WhatsApp Group Reminder Settings (Owner / Partner)
  const isBusinessOwner = appUser?.role === 'owner' || appUser?.role === 'partner';
  const [waGroupSettings, setWaGroupSettings] = useState<WaGroupSettingsValue>({
    waGroupId: appUser?.waGroupId || '',
    waGroupName: appUser?.waGroupName || '',
    waGroupReminderEnabled: Boolean(appUser?.waGroupReminderEnabled),
    waGroupReminderH3: appUser?.waGroupReminderH3 !== false,
    waGroupReminderH1: appUser?.waGroupReminderH1 !== false,
    waGroupReminderH0: appUser?.waGroupReminderH0 !== false,
    waGroupReminderTime: appUser?.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME,
    waGroupReminderH0Time: appUser?.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME,
  });
  const [isSavingWaGroup, setIsSavingWaGroup] = useState(false);

  useEffect(() => {
    if (appUser) {
      setName(appUser.name || '');
      setPhone(appUser.phone || '');
      setFonnteToken(appUser.fonnteToken || '');
      setWaGroupSettings({
        waGroupId: appUser.waGroupId || '',
        waGroupName: appUser.waGroupName || '',
        waGroupReminderEnabled: Boolean(appUser.waGroupReminderEnabled),
        waGroupReminderH3: appUser.waGroupReminderH3 !== false,
        waGroupReminderH1: appUser.waGroupReminderH1 !== false,
        waGroupReminderH0: appUser.waGroupReminderH0 !== false,
        waGroupReminderTime: appUser.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME,
        waGroupReminderH0Time: appUser.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME,
      });
    }
  }, [
    appUser?.id,
    appUser?.name,
    appUser?.phone,
    appUser?.fonnteToken,
    appUser?.waGroupId,
    appUser?.waGroupName,
    appUser?.waGroupReminderEnabled,
    appUser?.waGroupReminderH3,
    appUser?.waGroupReminderH1,
    appUser?.waGroupReminderH0,
    appUser?.waGroupReminderTime,
    appUser?.waGroupReminderH0Time,
  ]);

  useEffect(() => {
    if (appUser?.fonnteToken && appUser.fonnteToken.trim()) {
      checkFonnteDevice(appUser.fonnteToken.trim(), false).then(setDeviceCheck).catch(() => {});
    } else {
      setDeviceCheck(null);
    }
  }, [appUser?.fonnteToken]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        name,
        phone,
        updatedAt: serverTimestamp(),
      });
      showAlert('Berhasil', 'Profil berhasil diperbarui.', 'success');
    } catch (error) {
      console.error(error);
      showAlert('Gagal', 'Terjadi kesalahan saat menyimpan profil.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    if (newPassword !== confirmPassword) {
      showAlert('Error', 'Password baru dan konfirmasi tidak cocok.', 'error');
      return;
    }

    if (newPassword.length < 6) {
      showAlert('Error', 'Password minimal 6 karakter.', 'error');
      return;
    }

    setIsSavingPassword(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      showAlert('Berhasil', 'Password berhasil diperbarui dan tersimpan ke Supabase.', 'success');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/requires-recent-login') {
        showAlert('Gagal', 'Sesi anda telah berakhir. Silakan logout dan login kembali untuk mengganti password.', 'error');
      } else {
        showAlert('Gagal', error.message || 'Terjadi kesalahan.', 'error');
      }
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleTestFonnteConnection = async () => {
    const clean = fonnteToken.trim();
    if (!clean) {
      showAlert('Token Kosong', 'Masukkan API Token Fonnte Anda terlebih dahulu sebelum melakukan pengetesan.', 'warning');
      return;
    }
    setIsCheckingDevice(true);
    try {
      const res = await checkFonnteDevice(clean, false);
      setDeviceCheck(res);
      if (res.connected) {
        showAlert(
          'Device Fonnte Terhubung',
          `Nomor pengirim aktif: ${res.device || '-'} (${res.name || 'Device Fonnte'}). Siap digunakan untuk kirim undangan tanpa memotong kuota Guestly.`,
          'success'
        );
      } else {
        showAlert(
          'Belum Terhubung',
          res.error || 'Token valid atau perangkat belum terhubung. Pastikan nomor WhatsApp sudah scan QR di dashboard Fonnte.',
          'warning'
        );
      }
    } finally {
      setIsCheckingDevice(false);
    }
  };

  const handleSaveFonnteToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const clean = fonnteToken.trim();
    setIsSavingFonnte(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        fonnteToken: clean || null,
        updatedAt: serverTimestamp(),
      });
      if (clean) {
        const res = await checkFonnteDevice(clean, false);
        setDeviceCheck(res);
        showAlert(
          'Token Fonnte Disimpan',
          res.connected
            ? `Token tersimpan dan terhubung (${res.device || 'Connected'}). Pengiriman broadcast undangan Anda tidak akan memotong kuota Guestly.`
            : 'Token Fonnte berhasil disimpan. Pastikan status device Connected di dashboard Fonnte sebelum mengirim undangan.',
          res.connected ? 'success' : 'info'
        );
      } else {
        setDeviceCheck(null);
        showAlert('Token Dihapus', 'Token Fonnte pribadi telah dihapus. Pengiriman akan menggunakan Token Global Guestly (sesuai kuota) atau mode manual.', 'info');
      }
    } catch (error: any) {
      console.error(error);
      showAlert('Gagal', error?.message || 'Gagal menyimpan token Fonnte.', 'error');
    } finally {
      setIsSavingFonnte(false);
    }
  };

  const handleClearFonnteToken = async () => {
    if (!currentUser) return;
    const confirmed = await showConfirm('Hapus Token Fonnte pribadi dari akun Anda? Jika dihapus, pengiriman akan menggunakan Token Global Guestly atau kirim manual.');
    if (!confirmed) return;

    setIsSavingFonnte(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        fonnteToken: null,
        updatedAt: serverTimestamp(),
      });
      setFonnteToken('');
      setDeviceCheck(null);
      showAlert('Berhasil', 'Token Fonnte pribadi berhasil dihapus.', 'success');
    } catch (error: any) {
      showAlert('Gagal', error?.message || 'Gagal menghapus token Fonnte.', 'error');
    } finally {
      setIsSavingFonnte(false);
    }
  };

  const handleSaveWaGroupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (waGroupSettings.waGroupReminderEnabled && !waGroupSettings.waGroupId.trim()) {
      showAlert(
        'Kode Grup Kosong',
        'Masukkan atau pilih Kode Grup WhatsApp terlebih dahulu sebelum mengaktifkan pengingat otomatis.',
        'warning'
      );
      return;
    }

    setIsSavingWaGroup(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        waGroupId: waGroupSettings.waGroupId.trim(),
        waGroupName: waGroupSettings.waGroupName.trim(),
        waGroupReminderEnabled: Boolean(
          waGroupSettings.waGroupReminderEnabled && waGroupSettings.waGroupId.trim()
        ),
        waGroupReminderH3: Boolean(waGroupSettings.waGroupReminderH3),
        waGroupReminderH1: Boolean(waGroupSettings.waGroupReminderH1),
        waGroupReminderH0: Boolean(waGroupSettings.waGroupReminderH0),
        waGroupReminderTime: waGroupSettings.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME,
        waGroupReminderH0Time: waGroupSettings.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME,
        updatedAt: serverTimestamp(),
      });
      showAlert(
        'Pengaturan Grup Disimpan',
        waGroupSettings.waGroupReminderEnabled && waGroupSettings.waGroupId.trim()
          ? `Pengingat otomatis Grup WA aktif (H-3 & H-1 pukul ${waGroupSettings.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME} WIB, Hari H pukul ${waGroupSettings.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME} WIB).`
          : 'Pengaturan Grup WhatsApp tim berhasil disimpan.',
        'success'
      );
    } catch (error: any) {
      console.error(error);
      showAlert('Gagal', error?.message || 'Gagal menyimpan pengaturan Grup WhatsApp.', 'error');
    } finally {
      setIsSavingWaGroup(false);
    }
  };

  if (!appUser || !currentUser) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center gap-2">
            <User className="h-5 w-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Informasi Dasar</h2>
          </div>
          <div className="p-6">
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-4 rounded-lg border border-slate-200/70 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Login Sebagai / Role</p>
                <span className="text-sm font-semibold text-slate-900">
                  {getRoleLabel(appUser.role, appUser.staffType)}
                </span>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-slate-500 mb-1">Email</p>
                <p className="text-sm font-medium text-slate-900 break-all">{appUser.email}</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">No. WhatsApp / HP</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  disabled={isSavingProfile}
                  onClick={() => {
                    setName(appUser.name || '');
                    setPhone(appUser.phone || '');
                    showCancelAlert('Perubahan profil telah dibatalkan.');
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-2 border border-transparent rounded-lg shadow-xs text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isSavingProfile ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Ubah Password</h2>
          </div>
          <div className="p-6">
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password Baru</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  placeholder="••••••••"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  disabled={isSavingPassword}
                  onClick={() => {
                    setNewPassword('');
                    setConfirmPassword('');
                    showCancelAlert('Perubahan password telah dibatalkan.');
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingPassword}
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-2 border border-transparent rounded-lg shadow-xs text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isSavingPassword ? 'Menyimpan...' : 'Perbarui Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Integrasi WhatsApp Fonnte Pribadi */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Integrasi WhatsApp (Token Fonnte Pribadi)</h2>
              <p className="text-xs text-slate-500">
                Gunakan nomor WhatsApp Anda sendiri untuk mengirim undangan massal tanpa memotong kuota WA Blast Guestly.
              </p>
            </div>
          </div>

          {appUser.fonnteToken ? (
            deviceCheck?.connected ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Terhubung{deviceCheck.device ? ` · ${deviceCheck.device}` : ''}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deviceCheck ? 'Belum Terhubung' : 'Token Tersimpan'}</span>
              </div>
            )
          ) : (
            <span className="text-xs text-slate-500">Menggunakan Fallback Global / Manual</span>
          )}
        </div>

        <div className="p-6 space-y-5">
          <form onSubmit={handleSaveFonnteToken} className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  API Token Fonnte
                </label>
                <a
                  href="https://md.fonnte.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  <span>Buka Dashboard Fonnte</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showFonnteToken ? 'text' : 'password'}
                  value={fonnteToken}
                  onChange={(e) => setFonnteToken(e.target.value)}
                  placeholder="Tempel Token Device dari menu Device > Token di Fonnte..."
                  className="w-full border border-slate-300 rounded-lg pl-3.5 pr-10 py-2.5 text-sm font-mono focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowFonnteToken(!showFonnteToken)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showFonnteToken ? 'Sembunyikan Token' : 'Tampilkan Token'}
                >
                  {showFonnteToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {deviceCheck && (
              <div
                className={`p-3.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  deviceCheck.connected
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-semibold flex items-center gap-1.5">
                    {deviceCheck.connected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>
                      {deviceCheck.connected
                        ? `Device Terhubung (${deviceCheck.name || 'WhatsApp Aktif'})`
                        : 'Perangkat Fonnte Belum Terhubung'}
                    </span>
                  </div>
                  {deviceCheck.connected ? (
                    <p className="text-emerald-800/90 pl-5.5">
                      Nomor Pengirim: <span className="font-mono font-semibold">{deviceCheck.device || '-'}</span>
                      {deviceCheck.quota !== '' && deviceCheck.quota !== undefined ? (
                        <> · Kuota Fonnte: <span className="font-mono font-semibold">{deviceCheck.quota}</span></>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-amber-800/90 pl-5.5">
                      {deviceCheck.error || 'Scan QR WhatsApp di dashboard Fonnte lalu klik Tes Koneksi lagi.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="submit"
                disabled={isSavingFonnte}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSavingFonnte ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{isSavingFonnte ? 'Menyimpan...' : 'Simpan Token'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestFonnteConnection}
                disabled={isCheckingDevice || !fonnteToken.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isCheckingDevice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                <span>{isCheckingDevice ? 'Memeriksa...' : 'Tes Koneksi & Cek Device'}</span>
              </button>

              {appUser.fonnteToken && (
                <button
                  type="button"
                  onClick={handleClearFonnteToken}
                  disabled={isSavingFonnte}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer ml-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus Token</span>
                </button>
              )}
            </div>
          </form>

          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-800">Cara Mendapatkan & Menghubungkan Token Fonnte:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Daftar atau login ke akun Fonnte di <span className="font-medium text-slate-800">md.fonnte.com</span>, lalu tambahkan Device dan scan QR dengan WhatsApp Anda.</li>
              <li>Masuk ke menu <span className="font-medium text-slate-800">Device &rarr; Token</span>, salin API Token perangkat tersebut.</li>
              <li>Tempel token di atas lalu klik <span className="font-medium text-slate-800">Tes Koneksi</span> &amp; <span className="font-medium text-slate-800">Simpan Token</span>. Selama memakai token sendiri, pengiriman undangan tidak memotong kuota Guestly.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Pengaturan Grup WhatsApp Tim (Khusus Owner / Partner) */}
      {isBusinessOwner && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Pengingat Grup WhatsApp Tim (H-3, H-1 &amp; Hari H)
              </h2>
              <p className="text-xs text-slate-500">
                Kirim pengingat jadwal acara dan konfirmasi daftar Staff bertugas otomatis ke Grup WA tim Anda via Fonnte.
              </p>
            </div>
            {waGroupSettings.waGroupReminderEnabled && waGroupSettings.waGroupId.trim() ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Aktif · {waGroupSettings.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME} / Hari H {waGroupSettings.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME} WIB
              </span>
            ) : (
              <span className="text-xs text-slate-500">Belum diaktifkan</span>
            )}
          </div>

          <form onSubmit={handleSaveWaGroupSettings} className="p-6 space-y-4">
            <WaGroupSettingsPanel
              value={waGroupSettings}
              onChange={setWaGroupSettings}
              vendorFonnteToken={fonnteToken.trim() || appUser.fonnteToken || null}
              businessName={appUser.businessName || appUser.name}
            />

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSavingWaGroup}
                className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSavingWaGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{isSavingWaGroup ? 'Menyimpan...' : 'Simpan Pengaturan Grup WA'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
