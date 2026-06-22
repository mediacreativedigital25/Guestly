import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { WATemplate } from '../../types';
import { Plus, Edit2, Trash2, X, Check, Search, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function AdminWATemplates() {
  const [templates, setTemplates] = useState<WATemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WATemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
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

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    setFormData({ name: '', content: '' });
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
        showAlert('Template berhasil diperbarui', 'success');
      } else {
        const newTemplate: WATemplate = {
          id: uuidv4(),
          name: formData.name,
          content: formData.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        updatedTemplates = [...templates, newTemplate];
        showAlert('Template baru berhasil ditambahkan', 'success');
      }
      await saveTemplatesToDb(updatedTemplates);
      handleCloseModal();
    } catch (error) {
      showAlert('Terjadi kesalahan saat menyimpan template', 'error');
      handleFirestoreError(error, OperationType.UPDATE, 'settings/waTemplates');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus template ini?')) return;
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

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Template WA Blast</h1>
        <button
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Template Baru
        </button>
      </div>

      {alert && (
        <div className={`p-4 rounded-md ${alert.type === 'success' ? 'bg-green-50 text-green-800' : alert.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
          {alert.message}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Cari template..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Template</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-gray-500">
                    <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    Belum ada template.
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((template) => (
                  <tr key={template.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{template.name}</div>
                      <div className="text-sm text-gray-500 truncate max-w-md mt-1">{template.content}</div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleOpenModal(template)}
                        className="text-indigo-600 hover:text-indigo-900 inline-flex items-center"
                      >
                        <Edit2 className="w-4 h-4 mr-1" /> Edit
                      </button>
                      <button
                        onClick={() => template.id && handleDelete(template.id)}
                        className="text-red-600 hover:text-red-900 inline-flex items-center"
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Hapus
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={handleCloseModal} />
            
            <div className="relative inline-block w-full max-w-2xl p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-2xl shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">
                  {editingTemplate ? 'Edit Template WA' : 'Template WA Baru'}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-500 transition-colors"
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
                    onClick={handleCloseModal}
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
