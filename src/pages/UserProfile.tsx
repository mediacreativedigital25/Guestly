import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { User, Lock, Save } from 'lucide-react';
import { showAlert } from '../lib/alerts';

export default function UserProfile() {
  const { currentUser, appUser } = useAuth();
  const [name, setName] = useState(appUser?.name || '');
  const [phone, setPhone] = useState(appUser?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        name,
        phone
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
      showAlert('Berhasil', 'Password berhasil diperbarui. Halaman akan dimuat ulang.', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
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

  if (!appUser || !currentUser) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Profil Saya</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4 flex items-center gap-2">
            <User className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-medium text-gray-900">Informasi Dasar</h2>
          </div>
          <div className="p-6">
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 p-4 rounded-lg border border-gray-100 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Login Sebagai / Role</p>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${
                    appUser.role === 'superadmin' ? 'bg-purple-100 text-purple-800' :
                    appUser.role === 'partner' ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {appUser.role}
                  </span>
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-sm text-gray-500 mb-1">Email</p>
                <p className="font-medium text-gray-900 break-all">{appUser.email}</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. WhatsApp / HP</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {isSavingProfile ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-medium text-gray-900">Ubah Password</h2>
          </div>
          <div className="p-6">
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  placeholder="••••••••"
                />
              </div>
              <div className="bg-yellow-50 p-3 rounded text-sm text-yellow-800">
                Penting: Akun Anda mungkin memerlukan relogin (login ulang) sebelum mengizinkan perubahan passsword.
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingPassword || !newPassword || !confirmPassword}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" />
                  {isSavingPassword ? 'Memproses...' : 'Ubah Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
