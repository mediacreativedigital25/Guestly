import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { File as FileIcon, ImageIcon, FileText, Film, FileArchive, Upload, Search, Filter, Trash2, Copy, RefreshCw, X } from 'lucide-react';
import { mediaService } from '../../services/media/media.service';
import { MediaUploader } from '../../components/media/MediaUploader';
import { showAlert, showConfirm } from '../../lib/alerts';
import { format } from 'date-fns';

interface MediaItem {
  id: string;
  url: string;
  key: string;
  sizeBytes: number;
  fileName: string;
  mimeType: string;
  category: string;
  uploadedAt: any;
  uploadedBy: string;
}

export default function MediaLibrary() {
  const [mediaFiles, setMediaFiles] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'media'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const files: MediaItem[] = [];
      snapshot.forEach((doc) => {
        files.push({ id: doc.id, ...doc.data() } as MediaItem);
      });
      setMediaFiles(files);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const getFileIcon = (mimeType: string, size: number = 24) => {
    if (mimeType.startsWith('image/')) return <ImageIcon size={size} className="text-blue-500" />;
    if (mimeType.startsWith('video/')) return <Film size={size} className="text-purple-500" />;
    if (mimeType.includes('pdf')) return <FileText size={size} className="text-red-500" />;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return <FileArchive size={size} className="text-yellow-500" />;
    return <FileIcon size={size} className="text-gray-500" />;
  };

  const handleDelete = async (item: MediaItem) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus ${item.fileName}?`);
    if (!confirmed) return;

    try {
      if (item.key) {
        await mediaService.deleteMedia(item.key);
      }
      await deleteDoc(doc(db, 'media', item.id));
      setSelectedMedia(null);
      showAlert('Berhasil', 'File media berhasil dihapus', 'success');
    } catch (error) {
      console.error("Error deleting media:", error);
      showAlert('Error', 'Gagal menghapus file', 'error');
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    showAlert('Berhasil', 'URL berhasil disalin ke clipboard', 'success');
  };

  const filteredMedia = mediaFiles.filter((item) => {
    const matchesSearch = item.fileName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || 
                          (filterType === 'image' && item.mimeType?.startsWith('image/')) ||
                          (filterType === 'video' && item.mimeType?.startsWith('video/')) ||
                          (filterType === 'document' && (item.mimeType?.includes('pdf') || item.mimeType?.includes('doc') || item.mimeType?.includes('xls')));
    return matchesSearch && matchesFilter;
  });

  const handleReplaceSuccess = async (data: { url: string; key: string; sizeBytes: number }) => {
    if (!selectedMedia) return;
    try {
      // MediaUploader calls mediaService which already creates a new document in 'media' collection.
      // So we just need to delete the old document.
      await deleteDoc(doc(db, 'media', selectedMedia.id));
      
      showAlert('Berhasil', 'File media berhasil diganti', 'success');
      setIsReplaceModalOpen(false);
      setSelectedMedia(null);
    } catch (error) {
      console.error("Error replacing media:", error);
      showAlert('Error', 'Gagal mengganti file', 'error');
    }
  };

  const handleUploadSuccess = () => {
    showAlert('Berhasil', 'File media berhasil diunggah', 'success');
    setIsUploadModalOpen(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
          <p className="text-sm text-gray-500">Kelola semua file R2 Anda di sini.</p>
        </div>
        <button 
          onClick={() => setIsUploadModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
        >
          <Upload size={18} />
          Upload Media
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Cari nama file..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
            />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="text-gray-400 w-5 h-5" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto"
            >
              <option value="all">Semua Tipe</option>
              <option value="image">Gambar</option>
              <option value="video">Video</option>
              <option value="document">Dokumen</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64 text-gray-500">
            <RefreshCw className="animate-spin w-6 h-6 mr-2" />
            Memuat media...
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64 text-gray-500">
            <FileIcon className="w-12 h-12 mb-3 text-gray-300" />
            <p>Tidak ada media ditemukan</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
            {filteredMedia.map((item) => (
              <div 
                key={item.id} 
                className="group relative border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:border-indigo-500 transition-colors bg-gray-50"
                onClick={() => setSelectedMedia(item)}
              >
                <div className="aspect-square flex items-center justify-center bg-gray-100 overflow-hidden">
                  {item.mimeType?.startsWith('image/') ? (
                    <img src={item.url} alt={item.fileName} className="w-full h-full object-cover" />
                  ) : (
                    getFileIcon(item.mimeType, 48)
                  )}
                </div>
                <div className="p-2 bg-white">
                  <p className="text-xs font-medium text-gray-700 truncate" title={item.fileName}>
                    {item.fileName}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {formatBytes(item.sizeBytes)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Media Details Modal */}
      {selectedMedia && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row">
            <div className="md:w-2/3 bg-gray-100 flex items-center justify-center p-6 border-b md:border-b-0 md:border-r border-gray-200">
              {selectedMedia.mimeType?.startsWith('image/') ? (
                <img src={selectedMedia.url} alt={selectedMedia.fileName} className="max-w-full max-h-[60vh] object-contain rounded" />
              ) : selectedMedia.mimeType?.startsWith('video/') ? (
                <video src={selectedMedia.url} controls className="max-w-full max-h-[60vh] rounded" />
              ) : (
                <div className="flex flex-col items-center">
                  {getFileIcon(selectedMedia.mimeType, 64)}
                  <a href={selectedMedia.url} target="_blank" rel="noopener noreferrer" className="mt-4 text-indigo-600 hover:underline">
                    Buka File
                  </a>
                </div>
              )}
            </div>
            
            <div className="md:w-1/3 flex flex-col bg-white">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 truncate pr-4">Detail Media</h3>
                <button onClick={() => setSelectedMedia(null)} className="text-gray-400 hover:text-gray-700">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto space-y-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs mb-1">Nama File</p>
                  <p className="font-medium break-all">{selectedMedia.fileName}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Tipe File</p>
                  <p className="font-medium">{selectedMedia.mimeType}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Ukuran</p>
                  <p className="font-medium">{formatBytes(selectedMedia.sizeBytes)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Diunggah Pada</p>
                  <p className="font-medium">
                    {selectedMedia.uploadedAt?.seconds 
                      ? format(new Date(selectedMedia.uploadedAt.seconds * 1000), 'dd MMM yyyy HH:mm') 
                      : 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Kategori</p>
                  <p className="font-medium capitalize">{selectedMedia.category || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">URL</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input 
                      type="text" 
                      readOnly 
                      value={selectedMedia.url} 
                      className="flex-1 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs outline-none"
                    />
                    <button 
                      onClick={() => handleCopyUrl(selectedMedia.url)}
                      className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                      title="Copy URL"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 flex flex-col gap-2">
                <button 
                  onClick={() => setIsReplaceModalOpen(true)}
                  className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors font-medium text-sm"
                >
                  <RefreshCw size={16} /> Ganti File
                </button>
                <button 
                  onClick={() => handleDelete(selectedMedia)}
                  className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors font-medium text-sm"
                >
                  <Trash2 size={16} /> Hapus File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Upload Media</h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <MediaUploader 
                category="library"
                onUploadSuccess={handleUploadSuccess}
                onUploadError={(err) => showAlert('Gagal', err, 'error')}
              />
            </div>
          </div>
        </div>
      )}

      {/* Replace Modal */}
      {isReplaceModalOpen && selectedMedia && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Ganti File: {selectedMedia.fileName}</h3>
              <button onClick={() => setIsReplaceModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 text-sm text-gray-600 bg-yellow-50 p-3 rounded-md border border-yellow-200">
                File lama akan diganti dengan file baru yang Anda unggah.
              </div>
              <MediaUploader 
                category={selectedMedia.category || 'library'}
                onUploadSuccess={handleReplaceSuccess}
                onUploadError={(err) => showAlert('Gagal', err, 'error')}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
