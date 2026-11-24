import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { deleteDoc, doc } from 'firebase/firestore';
import {
  File as FileIcon,
  ImageIcon,
  FileText,
  Film,
  FileArchive,
  Upload,
  Search,
  Trash2,
  Copy,
  RefreshCw,
  X,
  Eye,
  LayoutGrid,
  List,
  ExternalLink,
  Check,
} from 'lucide-react';
import { mediaService } from '../../services/media/media.service';
import { MediaUploader } from '../../components/media/MediaUploader';
import { Modal } from '../../components/Modal';
import { DateRangeFilterBar, isWithinDateRange } from '../../components/DateRangeFilterBar';
import { showAlert, showConfirm } from '../../lib/alerts';
import { resolveMediaUrl, parseFirestoreDate } from '../../lib/utils';
import { format } from 'date-fns';
import { useAuth } from '../../AuthContext';

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

type MediaTypeFilter = 'all' | 'image' | 'video' | 'document' | 'other';
type ViewMode = 'table' | 'grid';

export default function MediaLibrary() {
  const { appUser } = useAuth();
  const [mediaFiles, setMediaFiles] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search, Filter, View & Pagination State (Create Event standard)
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<MediaTypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const fetchMedia = async (isManualRefresh = false) => {
    if (!appUser) return;
    if (isManualRefresh) {
      setRefreshing(true);
    }
    try {
      const { getDocs, limit, query, collection, orderBy, where } = await import('firebase/firestore');
      let baseQ;
      if (appUser.role === 'superadmin') {
        baseQ = query(collection(db, 'media'), orderBy('uploadedAt', 'desc'));
      } else {
        baseQ = query(collection(db, 'media'), where('uploadedBy', '==', appUser.id), orderBy('uploadedAt', 'desc'));
      }
      const qLimited = query(baseQ, limit(50));
      const snapshot = await getDocs(qLimited);
      const files: MediaItem[] = [];
      snapshot.forEach((docSnap) => {
        files.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      setMediaFiles(files);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (err) {
      console.error('MediaLibrary getDocs error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!appUser) return;
    fetchMedia();
  }, [appUser]);

  const handleLoadMore = async () => {
    if (!lastVisible || !appUser) return;
    setLoadingMore(true);
    try {
      const { collection, query, getDocs, limit, startAfter, orderBy, where } = await import('firebase/firestore');
      let baseQ;
      if (appUser.role === 'superadmin') {
        baseQ = query(collection(db, 'media'), orderBy('uploadedAt', 'desc'), startAfter(lastVisible));
      } else {
        baseQ = query(
          collection(db, 'media'),
          where('uploadedBy', '==', appUser.id),
          orderBy('uploadedAt', 'desc'),
          startAfter(lastVisible)
        );
      }
      const q = query(baseQ, limit(50));
      const snapshot = await getDocs(q);
      const files: MediaItem[] = [];
      snapshot.forEach((docSnap) => {
        files.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      setMediaFiles((prev) => [...prev, ...files]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (error) {
      console.error('Error loading more media', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const getMediaTypeCategory = (mimeType = ''): Exclude<MediaTypeFilter, 'all'> => {
    const m = mimeType.toLowerCase();
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.includes('pdf') || m.includes('doc') || m.includes('xls') || m.includes('sheet') || m.includes('text')) {
      return 'document';
    }
    return 'other';
  };

  const getMediaTypeLabel = (mimeType = '') => {
    const t = getMediaTypeCategory(mimeType);
    if (t === 'image') return 'Gambar';
    if (t === 'video') return 'Video';
    if (t === 'document') return 'Dokumen';
    if (mimeType.toLowerCase().includes('zip') || mimeType.toLowerCase().includes('rar')) return 'Arsip';
    return 'Lainnya';
  };

  const getFileIcon = (mimeType = '', size = 20) => {
    const m = mimeType.toLowerCase();
    if (m.startsWith('image/')) return <ImageIcon size={size} className="text-indigo-500" />;
    if (m.startsWith('video/')) return <Film size={size} className="text-purple-500" />;
    if (m.includes('pdf')) return <FileText size={size} className="text-rose-500" />;
    if (m.includes('zip') || m.includes('rar')) return <FileArchive size={size} className="text-amber-500" />;
    return <FileIcon size={size} className="text-gray-500" />;
  };

  const formatUploadedDate = (uploadedAt: any) => {
    const parsed = parseFirestoreDate(uploadedAt);
    if (!parsed) return '-';
    return format(parsed, 'dd MMM yyyy');
  };

  const formatUploadedDateTime = (uploadedAt: any) => {
    const parsed = parseFirestoreDate(uploadedAt);
    if (!parsed) return '-';
    return format(parsed, 'dd MMM yyyy, HH:mm');
  };

  const handleDelete = async (item: MediaItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus ${item.fileName}?`);
    if (!confirmed) return;

    try {
      if (item.key) {
        await mediaService.deleteMedia(item.key);
      }
      await deleteDoc(doc(db, 'media', item.id));
      setMediaFiles((prev) => prev.filter((m) => m.id !== item.id));
      if (selectedMedia?.id === item.id) {
        setSelectedMedia(null);
      }
      showAlert('Berhasil', 'File media berhasil dihapus', 'success');
    } catch (error) {
      console.error('Error deleting media:', error);
      showAlert('Error', 'Gagal menghapus file', 'error');
    }
  };

  const handleCopyUrl = (item: MediaItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    navigator.clipboard.writeText(item.url);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 1800);
    showAlert('Berhasil', 'URL berhasil disalin ke clipboard', 'success');
  };

  const openReplaceForMedia = (item: MediaItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedMedia(item);
    setIsReplaceModalOpen(true);
  };

  const handleReplaceSuccess = async (_data: { url: string; key: string; sizeBytes: number }) => {
    if (!selectedMedia) return;
    try {
      // MediaUploader calls mediaService which already creates a new document in 'media' collection.
      // So we just need to delete the old document.
      await deleteDoc(doc(db, 'media', selectedMedia.id));
      await fetchMedia();
      showAlert('Berhasil', 'File media berhasil diganti', 'success');
      setIsReplaceModalOpen(false);
      setSelectedMedia(null);
    } catch (error) {
      console.error('Error replacing media:', error);
      showAlert('Error', 'Gagal mengganti file', 'error');
    }
  };

  const handleUploadSuccess = () => {
    fetchMedia();
    showAlert('Berhasil', 'File media berhasil diunggah', 'success');
    setIsUploadModalOpen(false);
  };

  const availableCategories = useMemo<string[]>(() => {
    const set = new Set<string>();
    mediaFiles.forEach((m) => {
      if (m.category && m.category.trim()) {
        set.add(m.category.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [mediaFiles]);

  const filteredMedia = useMemo<MediaItem[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    return mediaFiles.filter((item) => {
      if (filterType !== 'all' && getMediaTypeCategory(item.mimeType) !== filterType) {
        return false;
      }
      if (categoryFilter !== 'all' && (item.category || '').trim() !== categoryFilter) {
        return false;
      }
      if (!isWithinDateRange(item.uploadedAt, startDate, endDate)) {
        return false;
      }
      if (!q) return true;
      const haystack = [item.fileName, item.category, item.mimeType, getMediaTypeLabel(item.mimeType)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [mediaFiles, searchTerm, filterType, categoryFilter, startDate, endDate]);

  const totalSizeBytes = useMemo(
    () => filteredMedia.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0),
    [filteredMedia]
  );

  const totalPages = Math.max(1, Math.ceil(filteredMedia.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredMedia.length);
  const paginatedMedia = useMemo<MediaItem[]>(
    () => filteredMedia.slice(startIndex, endIndex),
    [filteredMedia, startIndex, endIndex]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, categoryFilter, startDate, endDate, itemsPerPage]);

  const hasActiveFilter =
    searchTerm.trim() !== '' ||
    filterType !== 'all' ||
    categoryFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '';

  const resetFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setCategoryFilter('all');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-4">
      {/* Unified Filter Box: Row 1 Rentang Tgl Unggah | Row 2 Search, Tipe, Kategori & Limit */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-2.5 sm:p-3">
        <DateRangeFilterBar
          label="Rentang Tgl Unggah"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={() => {
            setStartDate('');
            setEndDate('');
          }}
          position="top"
        />

        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama file, kategori, atau tipe media..."
              className="w-full h-8.5 pl-8.5 pr-7 text-xs sm:text-sm bg-gray-50/70 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Filter Tipe */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as MediaTypeFilter)}
              className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[130px]"
              title="Filter tipe file"
            >
              <option value="all">Semua Tipe</option>
              <option value="image">Gambar</option>
              <option value="video">Video</option>
              <option value="document">Dokumen</option>
              <option value="other">Arsip / Lainnya</option>
            </select>

            {/* Filter Kategori */}
            {availableCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[135px] capitalize"
                title="Filter kategori media"
              >
                <option value="all">Semua Kategori</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat} className="capitalize">
                    {cat}
                  </option>
                ))}
              </select>
            )}

            {/* Tampilkan 10, 25, 50 */}
            <div className="flex items-center gap-1.5 h-8.5 px-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition shrink-0">
              <span className="text-xs text-gray-500 whitespace-nowrap">Tampilkan</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="bg-transparent text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer pr-0.5 tabular-nums"
                title="Jumlah item per halaman"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Bar (Between Filter Box & Data Box, Left Aligned + View Mode Toggle) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Media</span>
          </button>

          <button
            type="button"
            onClick={() => fetchMedia(true)}
            disabled={refreshing}
            className="h-9 px-3 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            title="Muat ulang daftar media"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Muat Ulang</span>
          </button>

          {!loading && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 pl-1 tabular-nums">
              <span>{filteredMedia.length} file</span>
              <span aria-hidden="true">·</span>
              <span>{formatBytes(totalSizeBytes)}</span>
            </div>
          )}
        </div>

        {/* View Mode Switcher: Tabel (default) / Grid */}
        <div className="inline-flex items-center p-0.5 bg-gray-100 border border-gray-200 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`h-8 px-2.5 text-xs font-medium inline-flex items-center gap-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Tampilan Tabel"
          >
            <List className="w-3.5 h-3.5" />
            <span>Tabel</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`h-8 px-2.5 text-xs font-medium inline-flex items-center gap-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Tampilan Grid Galeri"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>
        </div>
      </div>

      {/* Main Data Box */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500 gap-2">
            <RefreshCw className="animate-spin w-4 h-4 text-indigo-600" />
            <span>Memuat daftar media...</span>
          </div>
        ) : mediaFiles.length === 0 ? (
          <div className="text-center py-14 px-4">
            <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Belum ada file media yang diunggah</p>
            <p className="text-xs text-gray-500 mt-1">
              Unggah gambar, video, atau dokumen aset acara Anda untuk dikelola di sini.
            </p>
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="mt-4 h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Media Pertama</span>
            </button>
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="text-center py-14 px-4">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Tidak ada media yang cocok dengan filter</p>
            <p className="text-xs text-gray-500 mt-1">
              Coba ubah kata kunci pencarian, tipe file, atau rentang tanggal unggah.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 h-8.5 px-3 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <>
            {viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                        No
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
                        Preview
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Tgl Unggah
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Nama File
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Kategori
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Tipe
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Ukuran
                      </th>
                      <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedMedia.map((item, index) => {
                      const isImage = item.mimeType?.startsWith('image/') && !brokenImages[item.id];
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedMedia(item)}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                            {startIndex + index + 1}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isImage ? (
                              <img
                                src={resolveMediaUrl(item.url)}
                                alt={item.fileName}
                                referrerPolicy="no-referrer"
                                onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
                                className="w-14 h-10 rounded-lg object-cover border border-gray-200 shadow-2xs bg-gray-50"
                              />
                            ) : (
                              <div className="w-14 h-10 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                                {getFileIcon(item.mimeType, 18)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                            {formatUploadedDate(item.uploadedAt)}
                          </td>
                          <td className="px-4 py-3.5 max-w-[280px]">
                            <div
                              className="text-sm font-medium text-gray-900 truncate hover:text-indigo-600 transition-colors"
                              title={item.fileName}
                            >
                              {item.fileName || 'Tanpa Nama'}
                            </div>
                            <div className="text-xs text-gray-400 truncate mt-0.5">
                              {item.mimeType || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-700 capitalize">
                            {item.category || '-'}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-gray-700">
                            {getMediaTypeLabel(item.mimeType)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-600 tabular-nums">
                            {formatBytes(item.sizeBytes)}
                          </td>
                          <td
                            className="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedMedia(item)}
                                className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors cursor-pointer"
                                title="Lihat Detail & Pratinjau"
                                aria-label="Lihat Detail"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleCopyUrl(item, e)}
                                className="text-gray-600 hover:text-gray-900 flex items-center justify-center p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                                title="Salin URL Media"
                                aria-label="Salin URL"
                              >
                                {copiedId === item.id ? (
                                  <Check className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => openReplaceForMedia(item, e)}
                                className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                title="Ganti File"
                                aria-label="Ganti File"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDelete(item, e)}
                                className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                title="Hapus File"
                                aria-label="Hapus File"
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
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 p-4">
                {paginatedMedia.map((item) => {
                  const isImage = item.mimeType?.startsWith('image/') && !brokenImages[item.id];
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedMedia(item)}
                      className="group relative border border-gray-200 rounded-xl overflow-hidden cursor-pointer hover:border-indigo-400 transition-colors bg-white flex flex-col"
                    >
                      <div className="aspect-square flex items-center justify-center bg-gray-50 overflow-hidden relative">
                        {isImage ? (
                          <img
                            src={resolveMediaUrl(item.url)}
                            alt={item.fileName}
                            referrerPolicy="no-referrer"
                            onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 px-2 text-center">
                            {getFileIcon(item.mimeType, 36)}
                            <span className="text-[11px] font-medium text-gray-500">
                              {getMediaTypeLabel(item.mimeType)}
                            </span>
                          </div>
                        )}
                        <div
                          className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleCopyUrl(item, e)}
                            className="p-1.5 rounded-full bg-white/95 text-gray-700 hover:text-indigo-600 shadow-xs border border-gray-200/80 cursor-pointer"
                            title="Salin URL"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(item, e)}
                            className="p-1.5 rounded-full bg-white/95 text-red-600 hover:bg-red-50 shadow-xs border border-gray-200/80 cursor-pointer"
                            title="Hapus File"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="p-2.5 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-800 truncate" title={item.fileName}>
                          {item.fileName}
                        </p>
                        <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5 tabular-nums truncate">
                          <span>{formatBytes(item.sizeBytes)}</span>
                          {item.category && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="capitalize truncate">{item.category}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Footer (Create Event Standard) */}
            <div className="px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 sm:px-5 gap-3 bg-gray-50/50">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 tabular-nums">
                <span>
                  Menampilkan{' '}
                  <span className="font-semibold text-gray-900">
                    {filteredMedia.length === 0 ? 0 : startIndex + 1}
                  </span>{' '}
                  – <span className="font-semibold text-gray-900">{endIndex}</span> dari{' '}
                  <span className="font-semibold text-indigo-600">{filteredMedia.length}</span> file
                </span>
                {hasActiveFilter && (
                  <>
                    <span className="text-xs text-gray-400">({mediaFiles.length} total)</span>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {totalPages > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(1)}
                      disabled={safeCurrentPage === 1}
                      className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title="Halaman Pertama"
                    >
                      «
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safeCurrentPage === 1}
                      className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      Sebelumnya
                    </button>
                    <span className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg tabular-nums">
                      Hal <span className="text-indigo-600 font-bold">{safeCurrentPage}</span> / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safeCurrentPage === totalPages}
                      className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      Selanjutnya
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={safeCurrentPage === totalPages}
                      className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title="Halaman Terakhir"
                    >
                      »
                    </button>
                  </>
                )}
                {hasMore && (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg hover:bg-indigo-100 text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Media Details Modal */}
      {selectedMedia && !isReplaceModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200/80 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="md:w-3/5 bg-gray-50 flex items-center justify-center p-6 border-b md:border-b-0 md:border-r border-gray-200 min-h-[240px]">
              {selectedMedia.mimeType?.startsWith('image/') && !brokenImages[selectedMedia.id] ? (
                <img
                  src={resolveMediaUrl(selectedMedia.url)}
                  alt={selectedMedia.fileName}
                  referrerPolicy="no-referrer"
                  onError={() => setBrokenImages((prev) => ({ ...prev, [selectedMedia.id]: true }))}
                  className="max-w-full max-h-[62vh] object-contain rounded-lg border border-gray-200 bg-white"
                />
              ) : selectedMedia.mimeType?.startsWith('video/') ? (
                <video
                  src={resolveMediaUrl(selectedMedia.url)}
                  controls
                  className="max-w-full max-h-[62vh] rounded-lg"
                />
              ) : (
                <div className="flex flex-col items-center text-center gap-3">
                  {getFileIcon(selectedMedia.mimeType, 56)}
                  <p className="text-xs text-gray-500 max-w-xs break-all">{selectedMedia.fileName}</p>
                  <a
                    href={resolveMediaUrl(selectedMedia.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka File</span>
                  </a>
                </div>
              )}
            </div>

            <div className="md:w-2/5 flex flex-col bg-white min-w-0">
              <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-900 truncate pr-4">Detail Media</h3>
                <button
                  type="button"
                  onClick={() => setSelectedMedia(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto space-y-3.5 text-sm">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Nama File</p>
                  <p className="font-medium text-gray-900 break-all">{selectedMedia.fileName}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">Tipe</p>
                    <p className="font-medium text-gray-800">{getMediaTypeLabel(selectedMedia.mimeType)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">Ukuran</p>
                    <p className="font-medium text-gray-800 tabular-nums">{formatBytes(selectedMedia.sizeBytes)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">Kategori</p>
                    <p className="font-medium text-gray-800 capitalize">{selectedMedia.category || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">Diunggah Pada</p>
                    <p className="font-medium text-gray-800 tabular-nums">
                      {formatUploadedDateTime(selectedMedia.uploadedAt)}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">MIME Type</p>
                  <p className="text-xs font-mono text-gray-600 break-all">{selectedMedia.mimeType || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">URL Media</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={selectedMedia.url}
                      className="flex-1 min-w-0 h-8.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-700 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(selectedMedia)}
                      className="h-8.5 px-2.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      title="Salin URL"
                    >
                      {copiedId === selectedMedia.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Salin</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 flex items-center gap-2 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => setIsReplaceModalOpen(true)}
                  className="flex-1 h-9 px-3 inline-flex justify-center items-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-xs sm:text-sm cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Ganti File</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedMedia)}
                  className="h-9 px-3 inline-flex justify-center items-center gap-1.5 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium text-xs sm:text-sm cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Upload Media"
        maxWidth="max-w-lg"
      >
        <MediaUploader
          category="library"
          onUploadSuccess={handleUploadSuccess}
          onUploadError={(err) => showAlert('Gagal', err, 'error')}
        />
      </Modal>

      {/* Replace Modal */}
      <Modal
        isOpen={isReplaceModalOpen && Boolean(selectedMedia)}
        onClose={() => setIsReplaceModalOpen(false)}
        title={selectedMedia ? `Ganti File: ${selectedMedia.fileName}` : 'Ganti File'}
        maxWidth="max-w-lg"
      >
        {selectedMedia && (
          <div className="space-y-4">
            <div className="text-xs sm:text-sm text-amber-900 bg-amber-50 p-3 rounded-lg border border-amber-200">
              File lama akan diganti dengan file baru yang Anda unggah.
            </div>
            <MediaUploader
              category={selectedMedia.category || 'library'}
              onUploadSuccess={handleReplaceSuccess}
              onUploadError={(err) => showAlert('Gagal', err, 'error')}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
