import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { GuestlyService } from '../../types';
import { Modal } from '../../components/Modal';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { showAlert, showConfirm } from '../../lib/alerts';

export default function AdminServices() {
  const [services, setServices] = useState<GuestlyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'package' | 'addon'>('package');
  const [activePeriodDays, setActivePeriodDays] = useState<number>(30);
  const [eventQuota, setEventQuota] = useState<number>(0);
  const [clientQuota, setClientQuota] = useState<number>(0);
  const [guestQuota, setGuestQuota] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [normalPrice, setNormalPrice] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [targetRole, setTargetRole] = useState<'client' | 'partner' | 'all'>('all');

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const servicesRef = collection(db, 'services');
        const snapshot = await getDocs(query(servicesRef));
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GuestlyService));
        setServices(data);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'services');
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  const resetForm = () => {
    setName('');
    setDescription('');
    setType('package');
    setTargetRole('all');
    setActivePeriodDays(30);
    setEventQuota(0);
    setClientQuota(0);
    setGuestQuota(0);
    setPrice(0);
    setNormalPrice(0);
    setIsActive(true);
    setEditingServiceId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsCreating(true);
  };

  const openEditModal = (service: GuestlyService) => {
    setName(service.name);
    setDescription(service.description);
    setType(service.type);
    setTargetRole(service.targetRole || 'all');
    setActivePeriodDays(service.activePeriodDays || 0);
    setEventQuota(service.eventQuota || 0);
    setClientQuota(service.clientQuota || 0);
    setGuestQuota(service.guestQuota || 0);
    setPrice(service.price);
    setNormalPrice(service.normalPrice || 0);
    setIsActive(service.isActive);
    setEditingServiceId(service.id!);
    setIsCreating(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('Peringatan', 'Nama service wajib diisi', 'warning');
      return;
    }

    const confirmed = await showConfirm("Apakah Anda yakin ingin menyimpan layanan ini?");
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    try {
      const payload: any = {
        name,
        description,
        type,
        targetRole,
        activePeriodDays: Number(activePeriodDays),
        eventQuota: Number(eventQuota),
        clientQuota: Number(clientQuota),
        guestQuota: Number(guestQuota),
        price: Number(price),
        normalPrice: Number(normalPrice),
        isActive,
        updatedAt: serverTimestamp()
      };

      if (editingServiceId) {
        await updateDoc(doc(db, 'services', editingServiceId), payload);
        setServices(services.map(s => s.id === editingServiceId ? { ...s, ...payload, updatedAt: new Date() } as GuestlyService : s));
      } else {
        payload.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'services'), payload);
        setServices([...services, { id: docRef.id, ...payload, createdAt: new Date() } as GuestlyService]);
      }
      setIsCreating(false);
      showAlert("Berhasil", "Layanan berhasil disimpan!", "success");
    } catch (error) {
      showAlert("Gagal", "Gagal menyimpan service", "error");
      handleFirestoreError(error, editingServiceId ? OperationType.UPDATE : OperationType.CREATE, editingServiceId ? `services/${editingServiceId}` : 'services');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'services', deletingId));
      setServices(services.filter(s => s.id !== deletingId));
      setDeletingId(null);
      showAlert("Berhasil", "Layanan berhasil dihapus!", "success");
    } catch (error) {
      showAlert("Gagal", "Gagal menghapus service", "error");
      handleFirestoreError(error, OperationType.DELETE, `services/${deletingId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Layanan Guestly</h1>
          <p className="mt-1 text-sm text-gray-500">Kelola master paket dan fitur yang tersedia di Guestly</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition"
        >
          <Plus className="w-4 h-4" /> Tambah Layanan
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Memuat data layanan...</div>
        ) : services.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Belum ada layanan yang ditambahkan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Nama Layanan</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Tipe</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Kategori</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider text-right">Harga</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider text-center">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {services.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{service.name}</div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">{service.description}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold capitalize ${
                        service.type === 'package' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {service.type === 'package' ? 'Paket' : 'Add-on'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold capitalize ${
                        service.targetRole === 'client' ? 'bg-orange-100 text-orange-800' : 
                        service.targetRole === 'partner' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {service.targetRole === 'client' ? 'Client' : service.targetRole === 'partner' ? 'Partner' : 'Semua'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {service.normalPrice && service.normalPrice > service.price ? (
                        <div className="flex flex-col items-end">
                          <span className="text-gray-400 line-through text-xs mb-0.5">Rp {service.normalPrice.toLocaleString('id-ID')}</span>
                          <span className="text-green-600 font-medium">Rp {service.price.toLocaleString('id-ID')}</span>
                        </div>
                      ) : (
                        <span>Rp {service.price.toLocaleString('id-ID')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                        service.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {service.isActive ? 'Aktif' : 'Tidak Aktif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                      <button 
                        onClick={() => openEditModal(service)} 
                        className="text-indigo-600 hover:text-indigo-900 p-2 rounded-md hover:bg-indigo-50 transition-colors inline-block"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeletingId(service.id!)} 
                        className="text-red-600 hover:text-red-900 p-2 rounded-md hover:bg-red-50 transition-colors inline-block ml-2"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isCreating} onClose={() => !isSaving && setIsCreating(false)} title={editingServiceId ? "Edit Layanan" : "Tambah Layanan"}>
         <form onSubmit={handleSave} className="space-y-6">
            {/* Informasi Dasar */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2">Informasi Dasar</h3>
              
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama Layanan <span className="text-red-500">*</span></label>
                 <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-gray-400"
                    required
                    placeholder="Misal: Paket Undangan Digital Basic"
                 />
              </div>
              
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1.5">Deskripsi Singkat</label>
                 <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-gray-400 resize-none"
                    rows={3}
                    placeholder="Jelaskan fitur dan keunggulan layanan ini..."
                 />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipe Layanan</label>
                   <select 
                      value={type}
                      onChange={(e) => setType(e.target.value as 'package' | 'addon')}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                   >
                      <option value="package">Paket (Berdiri Sendiri)</option>
                      <option value="addon">Add-on (Tambahan)</option>
                   </select>
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1.5">Target Pengguna</label>
                   <select 
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value as 'client' | 'partner' | 'all')}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                   >
                      <option value="all">Semua (Client & Partner)</option>
                      <option value="client">Khusus Client (Publik)</option>
                      <option value="partner">Khusus Partner (B2B)</option>
                   </select>
                </div>
              </div>
            </div>

            {/* Harga & Kuota */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2">Harga & Ketersediaan</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1.5">Harga Normal (opsional)</label>
                   <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">Rp</span>
                     <input 
                        type="number" 
                        value={normalPrice}
                        onChange={(e) => setNormalPrice(Number(e.target.value))}
                        min="0"
                        placeholder="0"
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                     />
                   </div>
                   <p className="text-[11px] text-gray-500 mt-1.5">Harga sebelum diskon (dicoret)</p>
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1.5">Harga Jual <span className="text-red-500">*</span></label>
                   <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 text-sm font-medium">Rp</span>
                     <input 
                        type="number" 
                        value={price}
                        onChange={(e) => setPrice(Number(e.target.value))}
                        min="0"
                        placeholder="0"
                        required
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm font-medium text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                     />
                   </div>
                   <p className="text-[11px] text-gray-500 mt-1.5">Harga aktual yang dibayar pengguna</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                <div>
                   <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Masa Aktif</label>
                   <div className="flex items-center gap-2">
                     <input 
                        type="number" 
                        value={activePeriodDays}
                        onChange={(e) => setActivePeriodDays(Number(e.target.value))}
                        min="0"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-center bg-white"
                     />
                     <span className="text-gray-500 text-sm font-medium">Hari</span>
                   </div>
                   <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">Masa berlaku paket. Isi 0 untuk selamanya.</p>
                </div>
                <div>
                   <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Kuota Acara</label>
                   <input 
                      type="number" 
                      value={eventQuota}
                      onChange={(e) => setEventQuota(Number(e.target.value))}
                      min="0"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-center bg-white"
                   />
                   <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">Max event yang bisa dibuat pengguna.</p>
                </div>
                <div>
                   <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Kuota Klien</label>
                   <input 
                      type="number" 
                      value={clientQuota}
                      onChange={(e) => setClientQuota(Number(e.target.value))}
                      min="0"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-center bg-white"
                   />
                   <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">Max klien yang bisa ditambah.</p>
                </div>
                <div>
                   <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Kuota Tamu</label>
                   <input 
                      type="number" 
                      value={guestQuota}
                      onChange={(e) => setGuestQuota(Number(e.target.value))}
                      min="0"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-center bg-white"
                   />
                   <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">Total kontak/tamu yang bisa diundang.</p>
                </div>
              </div>
            </div>

            {/* Status toggle */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
               <div>
                 <h4 className="text-sm font-semibold text-gray-900">Status Layanan</h4>
                 <p className="text-xs text-gray-500 mt-0.5">Layanan aktif dapat dibeli oleh pengguna baru.</p>
               </div>
               <button
                 type="button"
                 role="switch"
                 aria-checked={isActive}
                 onClick={() => setIsActive(!isActive)}
                 className={`${
                   isActive ? 'bg-indigo-600' : 'bg-gray-200'
                 } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2`}
               >
                 <span
                   aria-hidden="true"
                   className={`${
                     isActive ? 'translate-x-5' : 'translate-x-0'
                   } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                 />
               </button>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-100 mt-8 !mb-2">
               <button 
                 type="button" 
                 onClick={() => setIsCreating(false)} 
                 disabled={isSaving}
                 className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
               >
                 Batal
               </button>
               <button 
                 type="submit" 
                 disabled={isSaving}
                 className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-70 flex items-center justify-center min-w-[120px]"
               >
                 {isSaving ? (
                   <span className="flex items-center gap-2">
                     <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                     </svg>
                     Menyimpan...
                   </span>
                 ) : editingServiceId ? "Simpan Perubahan" : "Tambahkan Layanan"}
               </button>
            </div>
         </form>
      </Modal>

      <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="Konfirmasi Hapus">
        <div className="p-1">
          <p className="text-gray-600 mb-6">
            Apakah Anda yakin ingin menghapus layanan ini?
          </p>
          <div className="flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => setDeletingId(null)} 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Batal
            </button>
            <button 
              type="button" 
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700"
            >
              Hapus Layanan
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
