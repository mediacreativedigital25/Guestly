import React, { useState, useEffect } from 'react';
import { 
  Gift, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle, 
  RefreshCw, 
  FileSpreadsheet, 
  FileText, 
  Search, 
  ScanLine, 
  History, 
  Sliders, 
  Check, 
  X, 
  RotateCcw,
  ClipboardCheck,
  TrendingDown,
  PackageCheck,
  Boxes,
  Lock,
  QrCode,
  Printer
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SouvenirItem, SouvenirLog, Guest, EventRecord } from '../types';
import { parseFirestoreDate } from '../lib/utils';
import { showAlert, showConfirm, showCancelAlert } from '../lib/alerts';
import { souvenirStorage } from '../services/souvenirStorage';
import SouvenirBatchQrModal from './SouvenirBatchQrModal';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Link } from 'react-router-dom';

interface SouvenirManagementProps {
  eventId: string;
  event: EventRecord | null;
  guests: Guest[];
  onGuestsUpdated?: () => void;
  currentUserEmail?: string;
  currentUserName?: string;
  isLocked?: boolean;
}

export default function SouvenirManagement({
  eventId,
  event,
  guests,
  onGuestsUpdated,
  currentUserEmail,
  currentUserName,
  isLocked = false
}: SouvenirManagementProps) {
  const showSouvenirLockedAlert = () => {
    showAlert(
      'Fitur Terkunci',
      'Masa aktif acara telah berakhir / berstatus Draft. Seluruh operasional souvenir dan ekspor Berita Acara dikunci sementara hingga dilakukan Top-Up Paket.',
      'warning'
    );
  };
  const [souvenirs, setSouvenirs] = useState<SouvenirItem[]>(() => 
    souvenirStorage.getSouvenirs(eventId, guests)
  );
  const [logs, setLogs] = useState<SouvenirLog[]>(() => 
    souvenirStorage.getLogs(eventId)
  );
  const [loading, setLoading] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isBatchQrModalOpen, setIsBatchQrModalOpen] = useState(false);
  const [batchQrInitialItem, setBatchQrInitialItem] = useState<SouvenirItem | null>(null);
  const [selectedSouvenir, setSelectedSouvenir] = useState<SouvenirItem | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formInitialStock, setFormInitialStock] = useState<number>(100);
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stock Opname / Physical Audit form
  const [auditPhysicalCount, setAuditPhysicalCount] = useState<number>(0);
  const [auditReason, setAuditReason] = useState('Pemeriksaan Rutin / Sesuai');
  const [auditNotes, setAuditNotes] = useState('');
  const [shouldAdjustSystem, setShouldAdjustSystem] = useState(false);

  // Guest distribution filtering & pagination
  const [guestSearch, setGuestSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'taken' | 'not_taken'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [distItemsPerPage, setDistItemsPerPage] = useState<number>(25);
  const [distCurrentPage, setDistCurrentPage] = useState<number>(1);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Active view inside souvenir tab: 'overview' | 'distribution' | 'audit_trail'
  const [viewTab, setViewTab] = useState<'overview' | 'distribution' | 'audit_trail'>('overview');

  useEffect(() => {
    setDistCurrentPage(1);
  }, [guestSearch, statusFilter, categoryFilter, distItemsPerPage]);

  // Synchronize souvenirs whenever guests prop updates
  useEffect(() => {
    if (!eventId) return;
    const current = souvenirStorage.getSouvenirs(eventId, guests);
    setSouvenirs(current);
  }, [eventId, guests]);

  // Listen to custom cross-tab or cross-component sync events
  useEffect(() => {
    if (!eventId) return;

    const handleSouvenirsChanged = (e: any) => {
      if (e.detail?.eventId === eventId) {
        setSouvenirs(souvenirStorage.getSouvenirs(eventId, guests));
      }
    };

    const handleLogsChanged = (e: any) => {
      if (e.detail?.eventId === eventId) {
        setLogs(souvenirStorage.getLogs(eventId));
      }
    };

    const handleSynced = (e: any) => {
      if (e.detail?.eventId === eventId) {
        setSouvenirs(souvenirStorage.getSouvenirs(eventId, guests));
        setLogs(souvenirStorage.getLogs(eventId));
      }
    };

    window.addEventListener('guestly_souvenirs_changed', handleSouvenirsChanged);
    window.addEventListener('guestly_souvenir_logs_changed', handleLogsChanged);
    window.addEventListener('guestly_souvenir_synced', handleSynced);

    return () => {
      window.removeEventListener('guestly_souvenirs_changed', handleSouvenirsChanged);
      window.removeEventListener('guestly_souvenir_logs_changed', handleLogsChanged);
      window.removeEventListener('guestly_souvenir_synced', handleSynced);
    };
  }, [eventId, guests]);

  // Overall totals calculation
  const totalInitial = souvenirs.reduce((sum, s) => sum + (s.initialStock || 0), 0);
  const totalDistributed = souvenirs.reduce((sum, s) => sum + (s.totalDistributed || 0), 0);
  const totalDirectQrOut = souvenirs.reduce((sum, s) => sum + (s.directQrOutCount || 0), 0);
  const totalRemainingSystem = souvenirs.reduce((sum, s) => sum + (s.remainingStock || 0), 0);
  const totalPhysicalAudit = souvenirs.reduce((sum, s) => sum + (s.physicalStockAudit ?? s.remainingStock), 0);
  const overallDiscrepancy = totalPhysicalAudit - totalRemainingSystem;

  const configuredCategories = event?.guestCategories && event.guestCategories.length > 0
    ? event.guestCategories
    : ['VIP', 'Keluarga', 'Reguler'];

  const getCategoryRank = (cat?: string) => {
    const cleaned = (cat || '').trim().toLowerCase();
    if (!cleaned) return 999999;
    const idx = configuredCategories.findIndex(c => c.trim().toLowerCase() === cleaned);
    return idx !== -1 ? idx : 99999;
  };

  // Filtered guest list for distribution
  const filteredGuests = guests.filter((g) => {
    const matchSearch = 
      (g.name || '').toLowerCase().includes(guestSearch.toLowerCase()) ||
      (g.ticketCode || '').toLowerCase().includes(guestSearch.toLowerCase()) ||
      (g.category || '').toLowerCase().includes(guestSearch.toLowerCase()) ||
      (g.session || '').toLowerCase().includes(guestSearch.toLowerCase());

    const isTaken = !!g.souvenirTaken;
    const matchStatus = 
      statusFilter === 'all' ? true :
      statusFilter === 'taken' ? isTaken :
      !isTaken;

    const matchCat = categoryFilter === 'all' || (g.category || '').trim().toLowerCase() === categoryFilter.trim().toLowerCase();

    return matchSearch && matchStatus && matchCat;
  }).sort((a, b) => {
    const rankA = getCategoryRank(a.category);
    const rankB = getCategoryRank(b.category);
    if (rankA !== rankB) return rankA - rankB;
    return (a.name || '').localeCompare(b.name || '');
  });

  const guestsTakenCount = guests.filter(g => !!g.souvenirTaken).length;

  // Create Souvenir Type
  const handleCreateSouvenir = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    if (!formName.trim() || formInitialStock < 0) {
      showAlert('Perhatian', 'Mohon isi nama souvenir dan stok awal yang valid.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = souvenirStorage.addItem(
        eventId,
        {
          eventId,
          name: formName.trim(),
          category: formCategory.trim() || 'Semua Tamu',
          initialStock: Number(formInitialStock),
          totalDistributed: 0,
          remainingStock: Number(formInitialStock),
          physicalStockAudit: Number(formInitialStock),
          lastAuditAt: new Date().toISOString(),
          lastAuditBy: currentUserName || currentUserEmail || 'Admin',
          notes: formNotes.trim() || ''
        },
        guests
      );

      setSouvenirs(updated);
      showAlert('Berhasil', `Souvenir "${formName}" berhasil didaftarkan dengan stok awal ${formInitialStock} pcs.`, 'success');
      setIsAddModalOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      showAlert('Gagal', 'Terjadi kesalahan saat menambahkan souvenir.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (item: SouvenirItem) => {
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    setSelectedSouvenir(item);
    setFormName(item.name);
    setFormCategory(item.category || '');
    setFormInitialStock(item.initialStock);
    setFormNotes(item.notes || '');
    setIsEditModalOpen(true);
  };

  // Update Souvenir Item
  const handleUpdateSouvenir = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    if (!selectedSouvenir?.id) return;

    setIsSubmitting(true);
    try {
      const newInitial = Number(formInitialStock);
      const updated = souvenirStorage.updateItem(
        eventId,
        selectedSouvenir.id,
        {
          name: formName.trim(),
          category: formCategory.trim() || 'Semua Tamu',
          initialStock: newInitial,
          notes: formNotes.trim()
        },
        guests
      );

      setSouvenirs(updated);
      showAlert('Berhasil', 'Data souvenir berhasil diperbarui.', 'success');
      setIsEditModalOpen(false);
      setSelectedSouvenir(null);
      resetForm();
    } catch (err) {
      console.error(err);
      showAlert('Gagal', 'Gagal memperbarui data souvenir.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Souvenir Item
  const handleDeleteSouvenir = async (item: SouvenirItem) => {
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    if (!item.id) return;
    if ((item.totalDistributed || 0) > 0) {
      const proceed = await showConfirm(
        `Souvenir "${item.name}" sudah dibagikan sebanyak ${item.totalDistributed} pcs. Menghapusnya akan mempengaruhi catatan rekapitulasi. Lanjutkan hapus?`
      );
      if (!proceed) return;
    } else {
      const proceed = await showConfirm(`Apakah Anda yakin ingin menghapus "${item.name}"?`);
      if (!proceed) return;
    }

    try {
      const updated = souvenirStorage.deleteItem(eventId, item.id, guests);
      setSouvenirs(updated);
      showAlert('Berhasil', 'Souvenir berhasil dihapus.', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Gagal', 'Gagal menghapus souvenir.', 'error');
    }
  };

  // Open Physical Stock Audit Modal
  const openAuditModal = (item: SouvenirItem) => {
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    setSelectedSouvenir(item);
    setAuditPhysicalCount(item.physicalStockAudit ?? item.remainingStock);
    setAuditReason('Pemeriksaan Rutin / Sesuai');
    setAuditNotes('');
    setShouldAdjustSystem(false);
    setIsAuditModalOpen(true);
  };

  // Submit Stock Opname / Physical Audit
  const handleSaveAudit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    if (!selectedSouvenir?.id) return;

    setIsSubmitting(true);
    try {
      const physicalCount = Number(auditPhysicalCount);
      const systemRemaining = selectedSouvenir.remainingStock;
      const discrepancy = physicalCount - systemRemaining;

      if (shouldAdjustSystem && discrepancy !== 0) {
        // Adjust initial stock to match physical reality
        const newInitial = physicalCount + selectedSouvenir.totalDistributed;
        
        const updated = souvenirStorage.updateItem(
          eventId,
          selectedSouvenir.id,
          {
            initialStock: newInitial,
            physicalStockAudit: physicalCount,
            lastAuditAt: new Date().toISOString(),
            lastAuditBy: currentUserName || currentUserEmail || 'Admin',
            notes: auditNotes ? `${selectedSouvenir.notes ? selectedSouvenir.notes + ' | ' : ''}Penyesuaian: ${auditNotes}` : selectedSouvenir.notes || ''
          },
          guests
        );
        setSouvenirs(updated);

        // Record Adjustment Log
        souvenirStorage.addLog(eventId, {
          eventId,
          souvenirId: selectedSouvenir.id,
          souvenirName: selectedSouvenir.name,
          guestName: `[Penyesuaian Stok Fisik vs Sistem]`,
          quantity: discrepancy,
          action: 'ADJUSTMENT',
          notes: `Fisik: ${physicalCount} pcs, Sistem Lama: ${systemRemaining} pcs (Selisih: ${discrepancy > 0 ? '+' : ''}${discrepancy}). Alasan: ${auditReason}. ${auditNotes}`,
          performedBy: currentUserName || currentUserEmail || 'Admin'
        });
        setLogs(souvenirStorage.getLogs(eventId));

        showAlert('Berhasil', `Stok sistem berhasil diselaraskan dengan jumlah fisik nyata (${physicalCount} pcs). Log transaksi audit telah dicatat.`, 'success');
      } else {
        // Just record audit check count
        const updated = souvenirStorage.updateItem(
          eventId,
          selectedSouvenir.id,
          {
            physicalStockAudit: physicalCount,
            lastAuditAt: new Date().toISOString(),
            lastAuditBy: currentUserName || currentUserEmail || 'Admin'
          },
          guests
        );
        setSouvenirs(updated);

        // Add note log
        souvenirStorage.addLog(eventId, {
          eventId,
          souvenirId: selectedSouvenir.id,
          souvenirName: selectedSouvenir.name,
          guestName: `[Audit Cek Fisik]`,
          quantity: 0,
          action: 'ADJUSTMENT',
          notes: `Hasil hitung fisik: ${physicalCount} pcs. Sistem: ${systemRemaining} pcs (Selisih: ${discrepancy}). Catatan: ${auditNotes || auditReason}`,
          performedBy: currentUserName || currentUserEmail || 'Admin'
        });
        setLogs(souvenirStorage.getLogs(eventId));

        showAlert('Berhasil', `Hasil audit fisik berhasil dicatat. Status: ${discrepancy === 0 ? '🟢 Sinkron 100%' : `⚠️ Ada selisih ${discrepancy} pcs`}`, 'success');
      }

      setIsAuditModalOpen(false);
      setSelectedSouvenir(null);
    } catch (err) {
      console.error(err);
      showAlert('Gagal', 'Terjadi kesalahan saat menyimpan audit fisik.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hand out souvenir to a guest
  const handleHandoutSouvenir = async (guest: Guest, targetSouvenir?: SouvenirItem) => {
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    if (!guest.id) return;
    
    // Auto-select souvenir if not provided
    const souvenir = targetSouvenir || souvenirs[0];
    if (!souvenir || !souvenir.id) {
      showAlert('Perhatian', 'Belum ada data jenis souvenir yang didaftarkan. Silakan tambahkan souvenir terlebih dahulu.', 'warning');
      return;
    }

    if (souvenir.remainingStock <= 0) {
      showAlert('Stok Habis', `Stok souvenir "${souvenir.name}" sudah habis (Sisa 0 pcs). Silakan cek kembali fisik atau tambah stok.`, 'error');
      return;
    }

    setActionLoadingId(guest.id);
    try {
      // 1. Record in local authoritative storage immediately for zero-lag and resilience
      souvenirStorage.recordGuestTake(eventId, guest.id, {
        souvenirId: souvenir.id,
        souvenirName: souvenir.name,
        takenAt: new Date().toISOString(),
        takenBy: currentUserName || currentUserEmail || 'Petugas Meja Souvenir'
      });

      // 2. Add audit log entry
      souvenirStorage.addLog(eventId, {
        eventId,
        souvenirId: souvenir.id,
        souvenirName: souvenir.name,
        guestId: guest.id,
        guestName: guest.name,
        ticketCode: guest.ticketCode || '',
        quantity: 1,
        action: 'TAKE',
        notes: 'Penyerahan manual di meja souvenir',
        performedBy: currentUserName || currentUserEmail || 'Petugas Meja Souvenir'
      });
      setLogs(souvenirStorage.getLogs(eventId));

      // 3. Try to update guest document in Firestore (graceful fallback)
      try {
        const guestRef = doc(db, 'events', eventId, 'guests', guest.id);
        await updateDoc(guestRef, {
          souvenirTaken: true,
          souvenirTakenAt: serverTimestamp(),
          souvenirId: souvenir.id,
          souvenirName: souvenir.name,
          souvenirQuantity: 1,
          souvenirTakenBy: currentUserName || currentUserEmail || 'Petugas Meja Souvenir',
          updatedAt: serverTimestamp()
        });
      } catch (firestoreErr) {
        console.warn('Firestore guest doc update fallback:', firestoreErr);
      }

      // 4. Trigger guest refresh and notify
      if (onGuestsUpdated) onGuestsUpdated();
      showAlert('Berhasil', `Souvenir "${souvenir.name}" berhasil diserahkan kepada ${guest.name}.`, 'success');
    } catch (err: any) {
      console.error(err);
      showAlert('Gagal', 'Terjadi kesalahan sistem saat penyerahan souvenir.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Return / Cancel Souvenir Handout (Undo)
  const handleUndoSouvenir = async (guest: Guest) => {
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    if (!guest.id || !guest.souvenirTaken) return;

    const confirmUndo = await showConfirm(
      `Apakah Anda yakin ingin membatalkan status pengambilan souvenir untuk "${guest.name}"? Stok souvenir akan otomatis dikembalikan.`
    );
    if (!confirmUndo) return;

    setActionLoadingId(guest.id);
    try {
      // 1. Remove from local store
      souvenirStorage.removeGuestTake(eventId, guest.id);

      // 2. Log undo
      souvenirStorage.addLog(eventId, {
        eventId,
        souvenirId: guest.souvenirId || 'unknown',
        souvenirName: guest.souvenirName || 'Souvenir',
        guestId: guest.id,
        guestName: guest.name,
        ticketCode: guest.ticketCode || '',
        quantity: 1,
        action: 'RETURN',
        notes: 'Pembatalan / pengembalian souvenir oleh petugas',
        performedBy: currentUserName || currentUserEmail || 'Admin'
      });
      setLogs(souvenirStorage.getLogs(eventId));

      // 3. Try Firestore update
      try {
        const guestRef = doc(db, 'events', eventId, 'guests', guest.id);
        await updateDoc(guestRef, {
          souvenirTaken: false,
          souvenirTakenAt: null,
          souvenirId: null,
          souvenirName: null,
          souvenirQuantity: null,
          souvenirTakenBy: null,
          updatedAt: serverTimestamp()
        });
      } catch (firestoreErr) {
        console.warn('Firestore undo fallback:', firestoreErr);
      }

      if (onGuestsUpdated) onGuestsUpdated();
      showAlert('Berhasil Dibatalkan', `Pengambilan souvenir ${guest.name} dibatalkan. Stok sistem otomatis dipulihkan.`, 'success');
    } catch (err) {
      console.error(err);
      showAlert('Gagal', 'Gagal membatalkan pengambilan souvenir.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormCategory('');
    setFormInitialStock(100);
    setFormNotes('');
  };

  // Export Excel Berita Acara & Rekapitulasi Souvenir
  const handleExportExcel = () => {
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    const wb = XLSX.utils.book_new();

    // Sheet 1: Rekapitulasi Stok Souvenir
    const stockSummaryData = souvenirs.map((s, index) => {
      const auditVal = s.physicalStockAudit ?? s.remainingStock;
      const discrepancy = auditVal - s.remainingStock;
      const directQr = s.directQrOutCount || 0;
      const guestOut = Math.max(0, (s.totalDistributed || 0) - directQr);
      return {
        'No': index + 1,
        'Nama Souvenir': s.name,
        'Kategori / Target': s.category || 'Semua',
        'Kode Batch QR': s.qrBatchCode || '-',
        'Stok Awal Fisik (Pcs)': s.initialStock,
        'Keluar via Tamu (Pcs)': guestOut,
        'Keluar via QR Fisik (Pcs)': directQr,
        'Total Keluar (Pcs)': s.totalDistributed,
        'Sisa Stok Sistem (Pcs)': s.remainingStock,
        'Hasil Hitung Fisik Meja (Pcs)': auditVal,
        'Selisih Fisik vs Sistem': discrepancy === 0 ? 'COCOK (0)' : `${discrepancy > 0 ? '+' : ''}${discrepancy} pcs`,
        'Status Sinkronisasi': discrepancy === 0 ? 'SINKRON' : 'SELISIH',
        'Pemeriksaan Terakhir': s.lastAuditAt ? (parseFirestoreDate(s.lastAuditAt)?.toLocaleDateString('id-ID') || '-') : '-',
        'Auditor': s.lastAuditBy || '-',
        'Catatan Logistik': s.notes || '-'
      };
    });

    // Add totals row
    stockSummaryData.push({
      'No': 999 as any,
      'Nama Souvenir': 'TOTAL KESELURUHAN',
      'Kategori / Target': '-',
      'Kode Batch QR': '-',
      'Stok Awal Fisik (Pcs)': totalInitial,
      'Keluar via Tamu (Pcs)': Math.max(0, totalDistributed - totalDirectQrOut),
      'Keluar via QR Fisik (Pcs)': totalDirectQrOut,
      'Total Keluar (Pcs)': totalDistributed,
      'Sisa Stok Sistem (Pcs)': totalRemainingSystem,
      'Hasil Hitung Fisik Meja (Pcs)': totalPhysicalAudit,
      'Selisih Fisik vs Sistem': overallDiscrepancy === 0 ? 'COCOK (0)' : `${overallDiscrepancy} pcs`,
      'Status Sinkronisasi': overallDiscrepancy === 0 ? 'SINKRON 100%' : 'ADA SELISIH',
      'Pemeriksaan Terakhir': '-',
      'Auditor': '-',
      'Catatan Logistik': '-'
    });

    const wsSummary = XLSX.utils.json_to_sheet(stockSummaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Rekap Stok Souvenir');

    // Sheet 2: Log Pengambilan Tamu
    const guestDistributionData = guests
      .filter(g => g.souvenirTaken)
      .map((g, index) => ({
        'No': index + 1,
        'Nama Tamu': g.name,
        'Kode Tiket': g.ticketCode || '-',
        'Kategori': g.category || 'Reguler',
        'Sesi': g.session || '-',
        'Jenis Souvenir': g.souvenirName || 'Souvenir',
        'Jumlah (Pcs)': g.souvenirQuantity || 1,
        'Waktu Pengambilan': g.souvenirTakenAt ? parseFirestoreDate(g.souvenirTakenAt)?.toLocaleString('id-ID') : '-',
        'Diserahkan Oleh': g.souvenirTakenBy || 'Petugas Meja'
      }));

    const wsDistribution = XLSX.utils.json_to_sheet(guestDistributionData);
    XLSX.utils.book_append_sheet(wb, wsDistribution, 'Daftar Tamu Penerima');

    // Sheet 3: Riwayat Audit Trail Log
    const logsData = logs.map((l, index) => ({
      'No': index + 1,
      'Waktu': l.timestamp ? parseFirestoreDate(l.timestamp)?.toLocaleString('id-ID') : '-',
      'Aksi': l.action,
      'Jenis Souvenir': l.souvenirName,
      'Nama Tamu / Subjek': l.guestName,
      'Jumlah': l.quantity,
      'Catatan': l.notes || '-',
      'Petugas': l.performedBy || '-'
    }));
    const wsLogs = XLSX.utils.json_to_sheet(logsData);
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Audit Trail Logistik');

    const cleanTitle = (event?.title || 'Acara').replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(wb, `Berita_Acara_Souvenir_${cleanTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showAlert('Berhasil', 'Laporan Rekapitulasi & Berita Acara Souvenir berhasil diekspor ke Excel.', 'success');
  };

  // Export PDF Berita Acara Resmi
  const handleExportPDF = () => {
    if (isLocked) {
      showSouvenirLockedAlert();
      return;
    }
    const doc = new jsPDF();
    const eventTitle = event?.title || 'Acara';
    const eventDate = event?.date || '-';
    const eventLocation = event?.location || '-';

    // Header
    doc.setFontSize(16);
    doc.text('BERITA ACARA SERAH TERIMA & LOGISTIK SOUVENIR', 14, 20);
    doc.setFontSize(10);
    doc.text(`Nama Acara     : ${eventTitle}`, 14, 28);
    doc.text(`Tanggal & Lokasi: ${eventDate} | ${eventLocation}`, 14, 34);
    doc.text(`Tanggal Cetak   : ${new Date().toLocaleString('id-ID')}`, 14, 40);
    doc.text(`Pencetak Dokumen: ${currentUserName || currentUserEmail || 'Admin/Petugas'}`, 14, 46);

    // Summary Table
    const tableData = souvenirs.map(s => {
      const auditVal = s.physicalStockAudit ?? s.remainingStock;
      const discrepancy = auditVal - s.remainingStock;
      const directQr = s.directQrOutCount || 0;
      const guestOut = Math.max(0, (s.totalDistributed || 0) - directQr);
      return [
        s.name,
        s.category || 'Semua',
        s.qrBatchCode || '-',
        s.initialStock.toString(),
        directQr > 0 ? `${s.totalDistributed} (${guestOut}+${directQr} QR)` : s.totalDistributed.toString(),
        s.remainingStock.toString(),
        auditVal.toString(),
        discrepancy === 0 ? '0 (Cocok)' : `${discrepancy > 0 ? '+' : ''}${discrepancy} pcs`,
        discrepancy === 0 ? 'SINKRON' : 'SELISIH'
      ];
    });

    tableData.push([
      'TOTAL KESELURUHAN',
      '-',
      '-',
      totalInitial.toString(),
      totalDirectQrOut > 0
        ? `${totalDistributed} (${Math.max(0, totalDistributed - totalDirectQrOut)}+${totalDirectQrOut} QR)`
        : totalDistributed.toString(),
      totalRemainingSystem.toString(),
      totalPhysicalAudit.toString(),
      overallDiscrepancy === 0 ? '0 (Cocok)' : `${overallDiscrepancy} pcs`,
      overallDiscrepancy === 0 ? 'SINKRON 100%' : 'ADA SELISIH'
    ]);

    autoTable(doc, {
      startY: 52,
      head: [['Nama Souvenir', 'Kategori', 'Batch QR', 'Awal', 'Keluar', 'Sisa', 'Fisik', 'Selisih', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 7.5 },
      footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 25;
    if (finalY > 240) {
      doc.addPage();
    }

    const signY = finalY > 240 ? 40 : finalY;
    doc.setFontSize(9);
    doc.text('Pihak Penyelenggara / Wedding Organizer,', 20, signY);
    doc.text('Petugas Logistik & Meja Souvenir,', 130, signY);

    doc.text('(................................................)', 20, signY + 30);
    doc.text('Nama Terang / Stempel', 20, signY + 35);

    doc.text('(................................................)', 130, signY + 30);
    doc.text('Nama Terang / Petugas', 130, signY + 35);

    const cleanTitle = eventTitle.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Berita_Acara_Souvenir_${cleanTitle}.pdf`);
    showAlert('Berhasil', 'Dokumen Berita Acara Souvenir PDF berhasil diunduh.', 'success');
  };

  const distTotalPages = Math.max(1, Math.ceil(filteredGuests.length / distItemsPerPage));
  const distSafePage = Math.min(distCurrentPage, distTotalPages);
  const distStartIndex = (distSafePage - 1) * distItemsPerPage;
  const distEndIndex = Math.min(distStartIndex + distItemsPerPage, filteredGuests.length);
  const paginatedDistGuests = filteredGuests.slice(distStartIndex, distEndIndex);
  const hasDistFilter = guestSearch.trim() !== '' || statusFilter !== 'all' || categoryFilter !== 'all';

  return (
    <div className="space-y-4">
      {/* Top Status Strip: Audit Sinkronisasi Fisik & Sistem */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              overallDiscrepancy === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {overallDiscrepancy === 0 ? <PackageCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-sm sm:text-base text-gray-900">
                {overallDiscrepancy === 0
                  ? 'Audit Stok: Fisik & Sistem Sinkron'
                  : `Ditemukan Selisih ${Math.abs(overallDiscrepancy)} Pcs Antara Fisik & Sistem`}
              </h3>
              <span
                className={`text-xs font-semibold tabular-nums ${
                  overallDiscrepancy === 0 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                · {overallDiscrepancy === 0 ? 'Sesuai (0 selisih)' : `${overallDiscrepancy > 0 ? '+' : ''}${overallDiscrepancy} pcs`}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {overallDiscrepancy === 0
                ? 'Semua souvenir yang diserahkan tercatat sinkron tanpa selisih terhadap hitung fisik meja.'
                : 'Lakukan pemeriksaan meja souvenir atau gunakan Stock Opname untuk menyelaraskan catatan fisik & sistem.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
          {isLocked ? (
            <button
              type="button"
              disabled
              className="h-9 px-3.5 inline-flex items-center justify-center gap-1.5 bg-gray-100 border border-gray-200 text-gray-400 text-xs sm:text-sm font-medium rounded-lg cursor-not-allowed whitespace-nowrap"
              title="Scanner Meja dikunci — lakukan Top-Up Paket untuk membuka"
            >
              <Lock className="w-4 h-4" />
              <span>Scanner Terkunci</span>
            </button>
          ) : (
            <Link
              to={`/auth/login/events/${eventId}/scan`}
              className="h-9 px-3.5 inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium rounded-lg shadow-xs transition-colors whitespace-nowrap"
            >
              <ScanLine className="w-4 h-4" />
              <span>Buka Scanner Meja</span>
            </Link>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isLocked}
            className={`h-9 px-3 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              isLocked
                ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 cursor-pointer'
            }`}
            title={isLocked ? 'Export Excel dikunci — lakukan Top-Up Paket untuk membuka' : 'Download Rekapitulasi Excel'}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5 text-gray-400" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={isLocked}
            className={`h-9 px-3 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              isLocked
                ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 cursor-pointer'
            }`}
            title={isLocked ? 'Export Berita Acara PDF dikunci — lakukan Top-Up Paket untuk membuka' : 'Cetak Berita Acara PDF'}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5 text-gray-400" /> : <FileText className="w-3.5 h-3.5 text-rose-600" />}
            <span>Berita Acara</span>
          </button>
        </div>
      </div>

      {/* Standardized 4 Quick Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <p className="text-xs font-medium text-gray-500">Stok Awal Fisik</p>
          <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-xl sm:text-2xl font-bold text-gray-900">{totalInitial.toLocaleString('id-ID')}</span>
            <span className="text-xs text-gray-400">pcs</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100">Total alokasi semua jenis</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <p className="text-xs font-medium text-gray-500">Terdistribusi (Sistem)</p>
          <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-xl sm:text-2xl font-bold text-indigo-600">{totalDistributed.toLocaleString('id-ID')}</span>
            <span className="text-xs text-gray-500">
              ({totalInitial > 0 ? Math.round((totalDistributed / totalInitial) * 100) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 tabular-nums">
            {totalDirectQrOut > 0
              ? `${guestsTakenCount} tamu · ${totalDirectQrOut} scan QR fisik`
              : `${guestsTakenCount} dari ${guests.length} tamu`}
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <p className="text-xs font-medium text-gray-500">Sisa Stok Sistem</p>
          <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
            <span className={`text-xl sm:text-2xl font-bold ${totalRemainingSystem <= 10 ? 'text-amber-600' : 'text-emerald-700'}`}>
              {totalRemainingSystem.toLocaleString('id-ID')}
            </span>
            <span className="text-xs text-gray-400">pcs</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100">Stok awal dikurangi distribusi</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <p className="text-xs font-medium text-gray-500">Hasil Cek Fisik Meja</p>
          <div className="mt-1.5 flex items-baseline gap-2 tabular-nums">
            <span className="text-xl sm:text-2xl font-bold text-gray-900">{totalPhysicalAudit.toLocaleString('id-ID')}</span>
            <span className={`text-xs font-semibold ${overallDiscrepancy === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {overallDiscrepancy === 0 ? 'Cocok' : `Selisih ${overallDiscrepancy > 0 ? '+' : ''}${overallDiscrepancy}`}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100">Stock opname terakhir</p>
        </div>
      </div>

      {/* Internal Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-200 gap-2">
        <div className="flex space-x-5 sm:space-x-6 overflow-x-auto -mb-px">
          <button
            type="button"
            onClick={() => setViewTab('overview')}
            className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewTab === 'overview'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Katalog & Inventaris</span>
            <span className="text-xs tabular-nums text-gray-400">({souvenirs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('distribution')}
            className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewTab === 'distribution'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Loket Penyerahan Tamu</span>
            <span className="text-xs tabular-nums text-gray-400">
              ({guestsTakenCount}/{guests.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('audit_trail')}
            className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewTab === 'audit_trail'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail</span>
            <span className="text-xs tabular-nums text-gray-400">({logs.length})</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: OVERVIEW / INVENTORY TABLE */}
      {viewTab === 'overview' && (
        <div className="space-y-4">
          {/* Left-Aligned Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isLocked) {
                  showSouvenirLockedAlert();
                  return;
                }
                resetForm();
                setIsAddModalOpen(true);
              }}
              disabled={isLocked}
              className={`h-9 px-3.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg shadow-xs transition-colors whitespace-nowrap ${
                isLocked
                  ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
              }`}
              title={isLocked ? 'Tambah souvenir dikunci — lakukan Top-Up Paket untuk membuka' : undefined}
            >
              {isLocked ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>Tambah Jenis Souvenir</span>
            </button>

            {souvenirs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBatchQrInitialItem(null);
                  setIsBatchQrModalOpen(true);
                }}
                className="h-9 px-3 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
                title="Cetak stiker QR Batch hemat kertas untuk semua kategori souvenir"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-600" />
                <span>Cetak Stiker QR</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="py-12 text-center">
                <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-500">Memuat data souvenir...</p>
              </div>
            ) : souvenirs.length === 0 ? (
              <div className="py-14 px-4 text-center">
                <Gift className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h4 className="text-sm font-semibold text-gray-800">Belum Ada Souvenir Terdaftar</h4>
                <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                  Daftarkan jenis souvenir acara ini (misal: Tumbler Custom, Pouch Kulit, Payung) beserta jumlah stok awal fisiknya.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) {
                      showSouvenirLockedAlert();
                      return;
                    }
                    resetForm();
                    setIsAddModalOpen(true);
                  }}
                  disabled={isLocked}
                  className={`mt-4 h-9 px-3.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg shadow-xs transition-colors ${
                    isLocked
                      ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                  }`}
                >
                  {isLocked ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>Tambah Souvenir Pertama</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                        No
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Jenis Souvenir
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Target / QR Batch
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Distribusi
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Sisa Sistem
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Cek Fisik & Selisih
                      </th>
                      <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {souvenirs.map((item, idx) => {
                      const auditVal = item.physicalStockAudit ?? item.remainingStock;
                      const discrepancy = auditVal - item.remainingStock;
                      const percentage =
                        item.initialStock > 0
                          ? Math.min(100, Math.round((item.totalDistributed / item.initialStock) * 100))
                          : 0;

                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3.5 max-w-[260px]">
                            <div className="text-sm font-medium text-gray-900">{item.name}</div>
                            {item.notes && (
                              <div className="text-xs text-gray-500 truncate mt-0.5" title={item.notes}>
                                {item.notes}
                              </div>
                            )}
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              Audit terakhir: {item.lastAuditAt ? parseFirestoreDate(item.lastAuditAt)?.toLocaleDateString('id-ID') || '-' : 'Belum pernah'}
                              {item.lastAuditBy ? ` · ${item.lastAuditBy}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                            <div className="font-medium text-gray-700">{item.category || 'Semua Tamu'}</div>
                            {item.qrBatchCode && (
                              <div className="text-[11px] font-mono text-indigo-600 mt-0.5">
                                {item.qrBatchCode}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap min-w-[170px]">
                            <div className="flex items-center justify-between text-xs tabular-nums mb-1">
                              <span className="font-semibold text-gray-800">
                                {item.totalDistributed} / {item.initialStock} pcs
                              </span>
                              <span className="text-gray-500">{percentage}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full transition-all ${percentage > 90 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            {(item.directQrOutCount || 0) > 0 && (
                              <div className="text-[11px] text-indigo-600 mt-0.5 tabular-nums">
                                {item.directQrOutCount} via QR fisik
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm font-semibold tabular-nums">
                            <span className={item.remainingStock <= 5 ? 'text-rose-600' : 'text-gray-900'}>
                              {item.remainingStock} pcs
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs tabular-nums">
                            <div className="font-semibold text-gray-900">{auditVal} pcs</div>
                            <div className={`mt-0.5 font-medium ${discrepancy === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {discrepancy === 0
                                ? 'Sesuai fisik'
                                : `Selisih ${discrepancy > 0 ? '+' : ''}${discrepancy} pcs`}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchQrInitialItem(item);
                                  setIsBatchQrModalOpen(true);
                                }}
                                className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors cursor-pointer"
                                title={`Lihat & cetak stiker QR Batch (${item.qrBatchCode})`}
                              >
                                <QrCode className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openAuditModal(item)}
                                disabled={isLocked}
                                className={`flex items-center justify-center p-1.5 rounded-full transition-colors ${
                                  isLocked
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 cursor-pointer'
                                }`}
                                title={isLocked ? 'Stock Opname dikunci' : 'Stock Opname / Cek Fisik'}
                              >
                                <ClipboardCheck className="w-4 h-4" />
                              </button>
                              {!isLocked && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(item)}
                                    className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                    title="Edit Data Souvenir"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSouvenir(item)}
                                    className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                    title="Hapus Souvenir"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: GUEST DISTRIBUTION DESK (LOKET PENYERAHAN TAMU) */}
      {viewTab === 'distribution' && (
        <div className="space-y-4">
          {/* Box 1: Unified Filter Box */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-2.5 sm:p-3">
            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari nama tamu, kode tiket, kategori, atau sesi..."
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  className="w-full h-8.5 pl-8.5 pr-7 text-xs sm:text-sm bg-gray-50/70 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
                {guestSearch && (
                  <button
                    type="button"
                    onClick={() => setGuestSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors cursor-pointer"
                    title="Hapus pencarian"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[155px]"
                >
                  <option value="all">Semua Status Souvenir</option>
                  <option value="not_taken">Belum Ambil ({guests.length - guestsTakenCount})</option>
                  <option value="taken">Sudah Ambil ({guestsTakenCount})</option>
                </select>

                {event?.guestCategories && event.guestCategories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[130px]"
                  >
                    <option value="all">Semua Kategori</option>
                    {event.guestCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-1.5 h-8.5 px-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition shrink-0">
                  <span className="text-xs text-gray-500 whitespace-nowrap">Tampilkan</span>
                  <select
                    value={distItemsPerPage}
                    onChange={(e) => setDistItemsPerPage(Number(e.target.value))}
                    className="bg-transparent text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer pr-0.5 tabular-nums"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Box 2: Guest Distribution Table + Pagination */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            {filteredGuests.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Search className="w-9 h-9 text-gray-300 mx-auto mb-2.5" />
                <p className="text-sm font-medium text-gray-700">Tidak ada data tamu yang cocok dengan filter</p>
                {hasDistFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setGuestSearch('');
                      setStatusFilter('all');
                      setCategoryFilter('all');
                    }}
                    className="mt-3 h-8 px-3 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Reset Filter
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
                          Nama Tamu
                        </th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Kode Tiket
                        </th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Kehadiran
                        </th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Status Souvenir
                        </th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Waktu & Petugas
                        </th>
                        <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Aksi Meja
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {paginatedDistGuests.map((guest, index) => {
                        const isTaken = !!guest.souvenirTaken;
                        const isLoading = actionLoadingId === guest.id;

                        return (
                          <tr key={guest.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                              {distStartIndex + index + 1}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{guest.name}</div>
                              {(guest.category || guest.session) && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {[guest.category, guest.session].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-gray-600 tabular-nums">
                              {guest.ticketCode || '-'}
                            </td>

                            <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium">
                              {guest.attended ? (
                                <span className="text-emerald-700">Hadir</span>
                              ) : (
                                <span className="text-gray-400">Belum Hadir</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium">
                              {isTaken ? (
                                <span className="text-emerald-700">
                                  Sudah Ambil ({guest.souvenirName || 'Souvenir'})
                                </span>
                              ) : (
                                <span className="text-gray-400">Belum Mengambil</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-500 tabular-nums">
                              {isTaken ? (
                                <div>
                                  <div className="text-gray-700 font-medium">
                                    {guest.souvenirTakenAt
                                      ? parseFirestoreDate(guest.souvenirTakenAt)?.toLocaleTimeString('id-ID', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : '-'}
                                  </div>
                                  <div className="text-[11px] text-gray-400">{guest.souvenirTakenBy || 'Petugas'}</div>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              {isLocked ? (
                                <span
                                  className="inline-flex items-center gap-1 text-xs text-gray-400 cursor-not-allowed"
                                  title="Penyerahan souvenir dikunci — lakukan Top-Up Paket untuk membuka"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Terkunci</span>
                                </span>
                              ) : isTaken ? (
                                <button
                                  type="button"
                                  onClick={() => handleUndoSouvenir(guest)}
                                  disabled={isLoading}
                                  className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                                  title="Batalkan pengambilan souvenir"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Batal</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleHandoutSouvenir(guest)}
                                  disabled={isLoading || totalRemainingSystem <= 0}
                                  className="h-8 px-3 inline-flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <Gift className="w-3.5 h-3.5" />
                                  <span>Serahkan</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 sm:px-5 gap-3 bg-gray-50/50">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 tabular-nums">
                    <span>
                      Menampilkan <span className="font-semibold text-gray-900">{distStartIndex + 1}</span> –{' '}
                      <span className="font-semibold text-gray-900">{distEndIndex}</span> dari{' '}
                      <span className="font-semibold text-indigo-600">{filteredGuests.length}</span> tamu
                    </span>
                    {hasDistFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setGuestSearch('');
                          setStatusFilter('all');
                          setCategoryFilter('all');
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {distTotalPages > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDistCurrentPage(1)}
                        disabled={distSafePage === 1}
                        className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        onClick={() => setDistCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={distSafePage === 1}
                        className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        Sebelumnya
                      </button>
                      <span className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg tabular-nums">
                        Hal <span className="text-indigo-600 font-bold">{distSafePage}</span> / {distTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDistCurrentPage((p) => Math.min(distTotalPages, p + 1))}
                        disabled={distSafePage === distTotalPages}
                        className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        Selanjutnya
                      </button>
                      <button
                        type="button"
                        onClick={() => setDistCurrentPage(distTotalPages)}
                        disabled={distSafePage === distTotalPages}
                        className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: AUDIT TRAIL LOG (STANDARDIZED TABLE) */}
      {viewTab === 'audit_trail' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          {logs.length === 0 ? (
            <div className="py-14 px-4 text-center">
              <History className="w-10 h-10 text-gray-300 mx-auto mb-2.5" />
              <p className="text-sm font-medium text-gray-700">Belum ada catatan aktivitas penyerahan souvenir</p>
              <p className="text-xs text-gray-500 mt-1">
                Setiap penyerahan, pembatalan, dan stock opname akan tercatat secara realtime di sini.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                      No
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Waktu
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Aktivitas
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Tamu / Subjek
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Souvenir & Qty
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Petugas
                    </th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {logs.map((log, idx) => {
                    const date = log.timestamp ? parseFirestoreDate(log.timestamp) : null;
                    const isTake = log.action === 'TAKE';
                    const isReturn = log.action === 'RETURN';

                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-500 tabular-nums">
                          {date
                            ? date.toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : '-'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold">
                          <span
                            className={
                              isTake ? 'text-indigo-700' : isReturn ? 'text-rose-700' : 'text-amber-700'
                            }
                          >
                            {isTake ? 'Penyerahan' : isReturn ? 'Pembatalan' : 'Penyesuaian Fisik'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 max-w-[260px]">
                          <div className="text-sm font-medium text-gray-900 truncate">{log.guestName}</div>
                          {(log.ticketCode || log.notes) && (
                            <div className="text-xs text-gray-500 truncate mt-0.5" title={log.notes || log.ticketCode}>
                              {[log.ticketCode, log.notes].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-700 tabular-nums">
                          <span className="font-medium text-gray-900">{log.souvenirName}</span>
                          <span className="text-gray-400"> · </span>
                          <span>{log.quantity} pcs</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-600">
                          {log.performedBy || 'Petugas'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          {!isLocked &&
                          isTake &&
                          log.batchScanId &&
                          !souvenirStorage.getBatchScansMap(eventId)[log.batchScanId]?.voided ? (
                            <button
                              type="button"
                              onClick={async () => {
                                const confirmed = await showConfirm(
                                  'Batalkan Scan QR Batch?',
                                  `Batalkan 1 pcs "${log.souvenirName}" (Batch ${log.batchCode || '-'}) dan kembalikan +1 stok?`
                                );
                                if (!confirmed) return;
                                const res = souvenirStorage.undoBatchScan(
                                  eventId,
                                  log.batchScanId!,
                                  currentUserName || currentUserEmail || 'Admin'
                                );
                                if (res.undone) {
                                  setSouvenirs(souvenirStorage.getSouvenirs(eventId, guests));
                                  setLogs(souvenirStorage.getLogs(eventId));
                                  showAlert('Berhasil Dibatalkan', 'Stok sistem dipulihkan +1 pcs.', 'success');
                                }
                              }}
                              className="h-7.5 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Batal (+1)</span>
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: TAMBAH SOUVENIR */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-scale-in">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Tambah Jenis Souvenir</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSouvenir} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nama Souvenir <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Misal: Tumbler Custom, Pouch Kulit, Payung Lipat"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Kategori / Target Tamu
                </label>
                <input
                  type="text"
                  placeholder="Misal: Semua Tamu, VIP, Keluarga, Reguler"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Stok Awal Fisik (Pcs) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={formInitialStock}
                  onChange={(e) => setFormInitialStock(parseInt(e.target.value) || 0)}
                  required
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Jumlah fisik nyata yang disiapkan di meja logistik/kardus saat awal acara.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Catatan / Keterangan Logistik
                </label>
                <textarea
                  rows={2}
                  placeholder="Misal: 5 kardus @ 100 pcs di meja kanan pintu masuk"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    showCancelAlert('Penambahan souvenir baru telah dibatalkan.');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors font-medium disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Souvenir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SOUVENIR */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-scale-in">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Ubah Data Souvenir</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSouvenir} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nama Souvenir <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Kategori / Target Tamu
                </label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Stok Awal Fisik (Pcs) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={formInitialStock}
                  onChange={(e) => setFormInitialStock(parseInt(e.target.value) || 0)}
                  required
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Sudah terdistribusi: <strong>{selectedSouvenir?.totalDistributed || 0} pcs</strong>. Sisa stok akan otomatis disesuaikan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Catatan / Keterangan Logistik
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    showCancelAlert('Perubahan data souvenir telah dibatalkan.');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors font-medium disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Perbarui'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCK OPNAME / AUDIT FISIK VS SISTEM */}
      {isAuditModalOpen && selectedSouvenir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 animate-scale-in">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Hitung Fisik (Stock Opname)</h3>
                <p className="text-xs text-gray-500">Souvenir: <strong>{selectedSouvenir.name}</strong></p>
              </div>
              <button 
                onClick={() => setIsAuditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAudit} className="space-y-4">
              {/* Comparison Box */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-2 gap-3 text-center">
                <div>
                  <span className="text-xs text-gray-500 block">Sisa Menurut Sistem</span>
                  <span className="text-xl font-bold text-indigo-600">
                    {selectedSouvenir.remainingStock} <span className="text-xs font-normal text-gray-500">pcs</span>
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">Stok awal: {selectedSouvenir.initialStock} - Keluar: {selectedSouvenir.totalDistributed}</p>
                </div>

                <div>
                  <span className="text-xs text-gray-500 block">Hitung Fisik Nyata</span>
                  <span className="text-xl font-bold text-gray-900">
                    {auditPhysicalCount} <span className="text-xs font-normal text-gray-500">pcs</span>
                  </span>
                  <p className={`text-[10px] font-bold mt-0.5 ${
                    auditPhysicalCount - selectedSouvenir.remainingStock === 0 
                      ? 'text-emerald-600' 
                      : 'text-amber-600'
                  }`}>
                    {auditPhysicalCount - selectedSouvenir.remainingStock === 0 
                      ? '🟢 Cocok (0 Selisih)' 
                      : `⚠️ Selisih: ${auditPhysicalCount - selectedSouvenir.remainingStock > 0 ? '+' : ''}${auditPhysicalCount - selectedSouvenir.remainingStock} pcs`}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Jumlah Fisik Nyata di Meja / Kardus Saat Ini (Pcs) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={auditPhysicalCount}
                  onChange={(e) => setAuditPhysicalCount(parseInt(e.target.value) || 0)}
                  required
                  className="w-full text-base font-semibold border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-center"
                />
              </div>

              {auditPhysicalCount !== selectedSouvenir.remainingStock && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Alasan Selisih
                    </label>
                    <select
                      value={auditReason}
                      onChange={(e) => setAuditReason(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="Kerusakan / Cacat Fisik">Kerusakan / Cacat Fisik Produk</option>
                      <option value="Bonus Tambahan Vendor Belum Tercatat">Bonus Tambahan Vendor Belum Tercatat</option>
                      <option value="Hilang / Salah Hitung Awal">Hilang / Salah Hitung Awal</option>
                      <option value="Tamu Mengambil Lebih Dari 1 Tanpa Scan">Tamu Mengambil Lebih Dari 1 Tanpa Scan</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shouldAdjustSystem}
                        onChange={(e) => setShouldAdjustSystem(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="text-xs text-amber-900">
                        <strong className="block">Selaraskan Stok Sistem dengan Fisik (Adjustment)</strong>
                        <span>Centang ini jika ingin sistem langsung mengubah sisa stok menjadi <strong>{auditPhysicalCount} pcs</strong> dan mencatat transaksi adjustment resmi.</span>
                      </div>
                    </label>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Catatan Auditor
                </label>
                <textarea
                  rows={2}
                  placeholder="Misal: Sudah dihitung bersama vendor souvenir jam 14:00"
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAuditModalOpen(false);
                    showCancelAlert('Pemeriksaan stok fisik (Stock Opname) telah dibatalkan.');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors font-medium disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Hasil Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QR BATCH SOUVENIR & CETAK STIKER */}
      <SouvenirBatchQrModal
        isOpen={isBatchQrModalOpen}
        onClose={() => setIsBatchQrModalOpen(false)}
        eventId={eventId}
        eventTitle={event?.title}
        souvenirs={souvenirs}
        initialItem={batchQrInitialItem}
        guests={guests}
        currentOperator={currentUserName || currentUserEmail || 'Admin'}
        isLocked={isLocked}
        onUpdated={() => {
          setSouvenirs(souvenirStorage.getSouvenirs(eventId, guests));
          setLogs(souvenirStorage.getLogs(eventId));
        }}
      />
    </div>
  );
}
