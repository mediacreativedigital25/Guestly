import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { WATemplate } from '../../types';
import { Plus, Edit2, Trash2, X, Check, Search, FileText } from 'lucide-react';
import { showAlert as showPopupAlert, showConfirm, showCancelAlert } from '../../lib/alerts';

const generateId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);

export default function AdminWATemplates() {
  const [templates, setTemplates] = useState<WATemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WATemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [placeholderFilter, setPlaceholderFilter] = useState<'all' | 'qr' | 'invite'>('all');
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    content: ''
  });

  const placeholders = [
    { tag: '[GUEST_NAME]', description: 'Nama Tamu' },
    { tag: '[EVENT_TITLE]', description: 'Judul Acara' },
    { tag: '[QR_LINK]', description: 'Link QR Code Tiket' },
    { tag: '[INVITE_LINK]', description: 'Link Undangan Digital' },
    { tag: '[SENDER_NAME]', description: 'Nama Pengirim (Nama Pasangan / Judul)' }
  ];

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const docRef = doc(db, 'settings', 'waTemplates');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().templates) {
        setTemplates(docSnap.data().templates as WATemplate[]);
      } else {
        setTemplates([]);
      }
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        console.warn('Permission denied fetching templates. This may happen if Firebase Rules are not deployed.');
        setTemplates([]);
        return;
      }
      handleFirestoreError(error, OperationType.GET, 'settings/waTemplates');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (message: string, type: 'success' | 'error' | 'info') => {
    setAlert({ message, type });
    showPopupAlert(type === 'success' ? 'Berhasil' : type === 'error' ? 'Gagal' : 'Informasi', message, type);
    setTimeout(() => setAlert(null), 3000);
  };

  const handleOpenModal = (template?: WATemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        content: template.content
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        content: 'Halo *[GUEST_NAME]* 👋🏻\n\nDengan penuh rasa hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara spesial kami:\n\n✨ *[EVENT_TITLE]* ✨\n\nUntuk konfirmasi kehadiran saat acara berlangsung, silakan tunjukkan QR Code berikut:\n🔳 [QR_LINK]\n\nDetail lengkap acara dapat dilihat melalui undangan digital berikut:\n💌 [INVITE_LINK]\n\nMerupakan suatu kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir serta memberikan doa dan restu kepada kami.\n\nAtas perhatian dan kehadirannya, kami ucapkan terima kasih 🙏🏻\n\nHormat kami,\n*[SENDER_NAME]*'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = (showCancel = false) => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    setFormData({ name: '', content: '' });
    if (showCancel) {
      showCancelAlert('Perubahan template WhatsApp dibatalkan.');
    }
  };

  const saveTemplatesToDb = async (newTemplates: WATemplate[]) => {
    try {
      await setDoc(doc(db, 'settings', 'waTemplates'), { 
        templates: newTemplates, 
        updatedAt: serverTimestamp() 
      }, { merge: true });
      fetchTemplates();
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        showAlert('Tidak ada akses (Gagal menyimpan template). Pastikan Firestore Rules telah di-deploy.', 'error');
        return;
      }
      throw error;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.content) return;

    try {
      let updatedTemplates;
      if (editingTemplate?.id) {
        updatedTemplates = templates.map(t => 
          t.id === editingTemplate.id 
            ? { ...t, name: formData.name, content: formData.content, updatedAt: new Date().toISOString() }
            : t
        );
        await saveTemplatesToDb(updatedTemplates);
        handleCloseModal(false);
        showAlert('Template berhasil diperbarui', 'success');
      } else {
        const newTemplate: WATemplate = {
          id: generateId(),
          name: formData.name,
          content: formData.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        updatedTemplates = [...templates, newTemplate];
        await saveTemplatesToDb(updatedTemplates);
        handleCloseModal(false);
        showAlert('Template baru berhasil ditambahkan', 'success');
      }
    } catch (error) {
      showAlert('Terjadi kesalahan saat menyimpan template', 'error');
      handleFirestoreError(error, OperationType.UPDATE, 'settings/waTemplates');
    }
  };

  const handleDelete = async (templateId: string) => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin menghapus template ini?');
    if (!confirmed) return;
    try {
      const updatedTemplates = templates.filter(t => t.id !== templateId);
      await saveTemplatesToDb(updatedTemplates);
      showAlert('Template berhasil dihapus', 'success');
    } catch (error) {
      showAlert('Terjadi kesalahan saat menghapus template', 'error');
      handleFirestoreError(error, OperationType.UPDATE, 'settings/waTemplates');
    }
  };

  const insertPlaceholder = (tag: string) => {
    const textarea = document.getElementById('templateContent') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const content = formData.content;
      const newContent = content.substring(0, start) + tag + content.substring(end);
      setFormData({ ...formData, content: newContent });
      
      // Reset cursor position to right after the inserted tag
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + tag.length;
        textarea.focus();
      }, 0);
    } else {
      // Fallback if textarea ref/id is lost
      setFormData({ ...formData, content: formData.content + tag });
    }
  };

  const filteredTemplates = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return templates.filter((t) => {
      if (placeholderFilter === 'qr' && !(t.content || '').includes('[QR_LINK]')) return false;
      if (placeholderFilter === 'invite' && !(t.content || '').includes('[INVITE_LINK]')) return false;
      if (q) {
        const nameMatch = (t.name || '').toLowerCase().includes(q);
        const contentMatch = (t.content || '').toLowerCase().includes(q);
        return nameMatch || contentMatch;
      }
      return true;
    });
  }, [templates, searchTerm, placeholderFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, placeholderFilter, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTemplates.length);
  const paginatedTemplates = filteredTemplates.slice(startIndex, endIndex);

  const hasActiveFilters = Boolean(searchTerm.trim() || placeholderFilter !== 'all');

  const resetFilters = () => {
    setSearchTerm('');
    setPlaceholderFilter('all');
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alert && (
        <div
          className={`px-4 py-3 rounded-xl text-xs font-medium border ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : alert.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}
        >
          {alert.message}
        </div>
      )}

      {/* Box 1: Unified Filter & Search Box */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-2.5 sm:p-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nama atau isi template WhatsApp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8.5 pl-9 pr-8 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={placeholderFilter}
              onChange={(e) => setPlaceholderFilter(e.target.value as 'all' | 'qr' | 'invite')}
              className="h-8.5 px-2.5 text-xs bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">Semua Template</option>
              <option value="qr">Ada [QR_LINK]</option>
              <option value="invite">Ada [INVITE_LINK]</option>
            </select>

            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="h-8.5 px-2.5 text-xs bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value={10}>Tampilkan 10</option>
              <option value={25}>Tampilkan 25</option>
              <option value={50}>Tampilkan 50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Primary Action Bar (Left-Aligned between Filter Box & Table Box) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleOpenModal()}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Template Baru</span>
        </button>
      </div>

      {/* Box 2: Table Container */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredTemplates.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-2">
            <FileText className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">
              {hasActiveFilters
                ? 'Tidak ada template yang cocok dengan pencarian atau filter.'
                : 'Belum ada template WhatsApp yang tersimpan.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
              >
                Reset Pencarian &amp; Filter
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                      No
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Nama Template
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Cuplikan Isi Pesan
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Diperbarui
                    </th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedTemplates.map((template, index) => {
                    const updatedDate = template.updatedAt ? new Date(template.updatedAt) : null;
                    return (
                      <tr key={template.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs font-mono text-gray-500">
                          {startIndex + index + 1}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">{template.name}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-xs text-gray-500 line-clamp-2 max-w-xl">
                            {template.content}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-500">
                          {updatedDate && !isNaN(updatedDate.getTime())
                            ? updatedDate.toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '-'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenModal(template)}
                              className="p-1.5 rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                              title="Edit Template"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => template.id && handleDelete(template.id)}
                              className="p-1.5 rounded-full text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Hapus Template"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50/70 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>
                  Menampilkan <strong className="text-gray-900">{startIndex + 1}</strong> –{' '}
                  <strong className="text-gray-900">{endIndex}</strong> dari{' '}
                  <strong className="text-gray-900">{filteredTemplates.length}</strong> template
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Halaman Pertama"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Sebelumnya
                </button>
                <span className="px-2.5 py-1 text-gray-700 font-medium">
                  Hal {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Selanjutnya
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Halaman Terakhir"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={() => handleCloseModal(false)} />
            
            <div className="relative inline-block w-full max-w-2xl p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-2xl shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">
                  {editingTemplate ? 'Edit Template WA' : 'Template WA Baru'}
                </h3>
                <button
                  type="button"
                  onClick={() => handleCloseModal(false)}
                  className="text-gray-400 hover:text-gray-500 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Template
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border-gray-300 border px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Contoh: Undangan Utama (Formal)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Isi Pesan
                  </label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {placeholders.map((p) => (
                      <button
                        key={p.tag}
                        type="button"
                        onClick={() => insertPlaceholder(p.tag)}
                        className="inline-flex items-center px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs text-gray-700 hover:bg-gray-200"
                        title={p.description}
                      >
                        <Plus className="w-3 h-3 mr-1" /> {p.tag}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="templateContent"
                    required
                    rows={12}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full border-gray-300 border px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Gunakan tombol di atas untuk menyisipkan variabel dinamis. Format WhatsApp seperti *tebal* dan _miring_ dapat digunakan.
                  </p>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => handleCloseModal(true)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 mr-3"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Simpan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
