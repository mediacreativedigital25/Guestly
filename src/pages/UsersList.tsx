import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, doc, deleteDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, createAuthUserSilently } from '../lib/firebase';
import { User, Role } from '../types';
import { Shield, Trash2, Edit, Plus } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { Modal } from '../components/Modal';
import { showAlert, showConfirm } from '../lib/alerts';

export default function UsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('client');
  const [newUserPartnerId, setNewUserPartnerId] = useState('');
  const [newUserClientId, setNewUserClientId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { appUser } = useAuth();
  const { settings } = useSettings();

  useEffect(() => {
    const fetchUsers = async () => {
      if (appUser?.role !== 'superadmin') return;

      try {
        const q = query(collection(db, 'users'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(data);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [appUser]);

  const handleDelete = async (userId: string) => {
    const confirmed = await showConfirm('Yakin ingin menghapus pengguna ini?');
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        setUsers(users.filter(u => u.id !== userId));
        showAlert('Berhasil', 'Pengguna berhasil dihapus!', 'success');
      } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('Gagal', 'Gagal menghapus pengguna.', 'error');
      }
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const confirmed = await showConfirm('Yakin ingin mengubah role pengguna ini?');
    if (!confirmed) {
      // Revert select visually if possible, or just let React handle it.
      // Better to fetch again, but for now we rely on the state not changing if canceled.
      // Easiest is just trigger a re-render by doing setUsers([...users]) to revert select visually
      setUsers([...users]);
      return;
    }
    
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
      showAlert('Berhasil', 'Role berhasil diperbarui!', 'success');
    } catch (error) {
      console.error('Error updating role:', error);
      showAlert('Gagal', 'Gagal memperbarui role.', 'error');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (newUserPassword.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      // 1. Create User in Auth via REST API
      const uid = await createAuthUserSilently(newUserEmail, newUserPassword);

      // 2. Add user document in Firestore
      const newUserDoc: User = {
        name: newUserName,
        email: newUserEmail,
        phone: newUserPhone,
        role: newUserRole,
        partnerId: newUserPartnerId || null,
        clientId: newUserClientId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', uid), newUserDoc);

      setUsers([...users, { id: uid, ...newUserDoc }]);
      
      // 3. Send WhatsApp Notification
      if (settings?.fonnteToken && newUserPhone) {
        import('../lib/fonnte').then(({ sendFonnteMessage }) => {
          const loginUrl = window.location.origin;
          const message = `NOTIFIKASI AKUN GUESTLY\n\n🔐 Informasi Akun Guestly\n\nHalo kak ${newUserName} 👋\nBerikut informasi akun Guestly kakak:\n\n📧 Email : ${newUserEmail}\n🔑 Password : ${newUserPassword}\n🌐 Login : ${loginUrl}\n\nMohon simpan informasi akun dengan baik 😊\n\n📞 Jika memiliki kendala atau membutuhkan bantuan, jangan ragu menghubungi 085158636606`;
          sendFonnteMessage(settings.fonnteToken!, newUserPhone, message);
        });
      }

      // Reset form
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserPhone('');
      setNewUserRole('client');
      setNewUserPartnerId('');
      setNewUserClientId('');
      setIsAddingUser(false);
      showAlert('Berhasil', 'User berhasil ditambahkan!', 'success');
    } catch (err: any) {
      console.error('Error adding user:', err);
      setError(err.message || 'Gagal menambahkan user');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (appUser?.role !== 'superadmin') {
    return <div className="p-8"><div className="bg-red-50 text-red-700 p-4 rounded-md">Akses Ditolak</div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen User</h1>
        <button
          onClick={() => setIsAddingUser(true)} 
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
        >
          <Plus className="w-4 h-4" /> Tambah User
        </button>
      </div>

      <Modal isOpen={isAddingUser} onClose={() => setIsAddingUser(false)} title="Tambah User Baru">
        <form onSubmit={handleAddUser} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama</label>
            <input required value={newUserName} onChange={e => setNewUserName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="John Doe" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email / Username</label>
            <input required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} type="email" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="email@contoh.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">No. WhatsApp / Telepon</label>
            <input required value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} type="tel" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="08123456789" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input required minLength={6} value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} type="password" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Min. 6 karakter" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select 
              value={newUserRole} 
              onChange={e => setNewUserRole(e.target.value as Role)} 
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="client">Client</option>
              <option value="partner">Partner</option>
              <option value="superadmin">Super Admin</option>
            </select>
          </div>

          {newUserRole === 'partner' && (
            <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Partner ID</label>
               <input value={newUserPartnerId} onChange={e => setNewUserPartnerId(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Biarkan kosong jika buat otomatis atau isi ID Partner" />
               <p className="text-xs text-gray-500 mt-1">Opsional: Isi dengan ID jika akan diasosiasikan dengan ID Partner yang sudah ada.</p>
            </div>
          )}

          {newUserRole === 'client' && (
            <>
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Partner ID (Parent)</label>
                 <input value={newUserPartnerId} onChange={e => setNewUserPartnerId(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="ID Partner yang mengelola client ini" />
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                 <input value={newUserClientId} onChange={e => setNewUserClientId(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="ID Client yang sudah dibuat" />
              </div>
            </>
          )}

          <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAddingUser(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium mr-3"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center min-w-[100px]"
            >
              {isSubmitting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <div className="flex justify-center p-8 bg-white rounded-lg shadow-sm border border-gray-100">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Partner/Client ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                          {user.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <select 
                         value={user.role} 
                         onChange={(e) => handleRoleChange(user.id!, e.target.value)}
                         className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm bg-gray-50"
                       >
                         <option value="superadmin">Super Admin</option>
                         <option value="partner">Partner</option>
                         <option value="client">Client</option>
                       </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>Partner: {user.partnerId || '-'}</div>
                      <div>Client: {user.clientId || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {user.id !== appUser.id && (
                        <button
                          onClick={() => handleDelete(user.id!)}
                          className="text-red-600 hover:text-red-900 flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-md hover:bg-red-100 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" /> Hapus
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      Belum ada user.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
