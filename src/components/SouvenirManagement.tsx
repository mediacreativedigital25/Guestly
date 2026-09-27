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
  Boxes
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SouvenirItem, SouvenirLog, Guest, EventRecord } from '../types';
import { parseFirestoreDate } from '../lib/utils';
import { showAlert, showConfirm, showCancelAlert } from '../lib/alerts';
import { souvenirStorage } from '../services/souvenirStorage';
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
}

export default function SouvenirManagement({
  eventId,
  event,
  guests,
  onGuestsUpdated,
  currentUserEmail,
  currentUserName
}: SouvenirManagementProps) {
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

  // Guest distribution filtering
  const [guestSearch, setGuestSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'taken' | 'not_taken'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Active view inside souvenir tab: 'overview' | 'distribution' | 'audit_trail'
  const [viewTab, setViewTab] = useState<'overview' | 'distribution' | 'audit_trail'>('overview');

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
    const wb = XLSX.utils.book_new();

    // Sheet 1: Rekapitulasi Stok Souvenir
    const stockSummaryData = souvenirs.map((s, index) => {
      const auditVal = s.physicalStockAudit ?? s.remainingStock;
      const discrepancy = auditVal - s.remainingStock;
      return {
        'No': index + 1,
        'Nama Souvenir': s.name,
        'Kategori / Target': s.category || 'Semua',
        'Stok Awal Fisik (Pcs)': s.initialStock,
        'Pengambilan / Keluar (Pcs)': s.totalDistributed,
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
      'Stok Awal Fisik (Pcs)': totalInitial,
      'Pengambilan / Keluar (Pcs)': totalDistributed,
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
      return [
        s.name,
        s.category || 'Semua',
        s.initialStock.toString(),
        s.totalDistributed.toString(),
        s.remainingStock.toString(),
        auditVal.toString(),
        discrepancy === 0 ? '0 (Cocok)' : `${discrepancy > 0 ? '+' : ''}${discrepancy} pcs`,
        discrepancy === 0 ? 'SINKRON' : 'SELISIH'
      ];
    });

    tableData.push([
      'TOTAL KESELURUHAN',
      '-',
      totalInitial.toString(),
      totalDistributed.toString(),
      totalRemainingSystem.toString(),
      totalPhysicalAudit.toString(),
      overallDiscrepancy === 0 ? '0 (Cocok)' : `${overallDiscrepancy} pcs`,
      overallDiscrepancy === 0 ? 'SINKRON 100%' : 'ADA SELISIH'
    ]);

    autoTable(doc, {
      startY: 52,
      head: [['Nama Souvenir', 'Kategori', 'Stok Awal', 'Keluar', 'Sisa Sistem', 'Cek Fisik', 'Selisih', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8 },
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

    doc.line(20, signY + 30, 80, signY + 30);
    doc.text('(................................................)', 20, signY + 35);
    doc.text('Nama Terang / Stempel', 20, signY + 40);

    doc.line(130, signY + 30, 190, signY + 30);
    doc.text('(................................................)', 130, signY + 35);
    doc.text('Nama Terang / Petugas', 130, signY + 40);

    const cleanTitle = eventTitle.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Berita_Acara_Souvenir_${cleanTitle}.pdf`);
    showAlert('Berhasil', 'Dokumen Berita Acara Souvenir PDF berhasil diunduh.', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Status Sinkronisasi Fisik & Sistem */}
      <div className={`p-4 sm:p-5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
        overallDiscrepancy === 0 && totalDistributed > 0 
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
          : overallDiscrepancy !== 0
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-indigo-50 border-indigo-200 text-indigo-900'
      }`}>
        <div className="flex items-start gap-3.5">
          <div className={`p-2.5 rounded-lg flex-shrink-0 ${
            overallDiscrepancy === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
          }`}>
            {overallDiscrepancy === 0 ? <PackageCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">
                {overallDiscrepancy === 0 
                  ? 'Audit Stok: Fisik & Sistem 100% Sinkron' 
                  : `Perhatian: Ditemukan Selisih ${Math.abs(overallDiscrepancy)} Pcs Antara Fisik dan Sistem`}
              </h3>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                overallDiscrepancy === 0 ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
              }`}>
                {overallDiscrepancy === 0 ? 'VALID & MATCH' : `${overallDiscrepancy > 0 ? '+' : ''}${overallDiscrepancy} PCS`}
              </span>
            </div>
            <p className="text-xs sm:text-sm opacity-90 mt-1">
              {overallDiscrepancy === 0
                ? 'Semua souvenir yang diserahkan tercatat secara sinkron tanpa selisih terhadap hitung fisik meja.'
                : 'Lakukan pemeriksaan meja souvenir atau gunakan tombol Stock Opname untuk menyelaraskan catatan fisik & sistem.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Link
            to={`/auth/login/events/${eventId}/scan`}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm transition-colors"
          >
            <ScanLine className="w-4 h-4" />
            <span>Buka Scanner Meja</span>
          </Link>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs sm:text-sm font-medium rounded-lg shadow-sm transition-colors"
            title="Download Rekapitulasi Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs sm:text-sm font-medium rounded-lg shadow-sm transition-colors"
            title="Cetak Berita Acara PDF"
          >
            <FileText className="w-4 h-4 text-rose-600" />
            <span>Berita Acara</span>
          </button>
        </div>
      </div>

      {/* 4 Quick Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Stok Awal Fisik</span>
            <Boxes className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalInitial}</span>
            <span className="text-xs text-gray-500">pcs</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Total alokasi semua jenis</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Terdistribusi (Sistem)</span>
            <Gift className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-600">{totalDistributed}</span>
            <span className="text-xs text-indigo-500">
              ({totalInitial > 0 ? Math.round((totalDistributed / totalInitial) * 100) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">{guestsTakenCount} dari {guests.length} tamu</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Sisa Stok Sistem</span>
            <TrendingDown className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${totalRemainingSystem <= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {totalRemainingSystem}
            </span>
            <span className="text-xs text-gray-500">pcs</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Stok Awal - Pengambilan</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Hasil Cek Fisik Meja</span>
            <ClipboardCheck className={`w-4 h-4 ${overallDiscrepancy === 0 ? 'text-emerald-500' : 'text-amber-500'}`} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalPhysicalAudit}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              overallDiscrepancy === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {overallDiscrepancy === 0 ? 'Cocok' : `Selisih ${overallDiscrepancy}`}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Stock opname terakhir</p>
        </div>
      </div>

      {/* Internal Navigation Tabs inside Souvenir Section */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex space-x-6">
          <button
            onClick={() => setViewTab('overview')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              viewTab === 'overview'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Katalog & Inventaris Stok ({souvenirs.length})</span>
          </button>
          <button
            onClick={() => setViewTab('distribution')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              viewTab === 'distribution'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>Loket Penyerahan Tamu ({guestsTakenCount}/{guests.length})</span>
          </button>
          <button
            onClick={() => setViewTab('audit_trail')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              viewTab === 'audit_trail'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Trail Logistik ({logs.length})</span>
          </button>
        </div>

        {viewTab === 'overview' && (
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm transition-colors mb-2"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Jenis Souvenir</span>
          </button>
        )}
      </div>

      {/* VIEW 1: OVERVIEW / INVENTORY LIST */}
      {viewTab === 'overview' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white p-8 text-center rounded-xl border border-gray-200">
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Memuat data souvenir...</p>
            </div>
          ) : souvenirs.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-300">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <Gift className="w-6 h-6" />
              </div>
              <h4 className="text-base font-semibold text-gray-900">Belum Ada Souvenir Terdaftar</h4>
              <p className="text-sm text-gray-500 max-w-md mx-auto mt-1 mb-4">
                Daftarkan jenis souvenir acara ini (misal: Tumbler Custom, Pouch Kulit, Payung) beserta jumlah stok awal fisiknya.
              </p>
              <button
                onClick={() => {
                  resetForm();
                  setIsAddModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Souvenir Pertama</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {souvenirs.map((item) => {
                const auditVal = item.physicalStockAudit ?? item.remainingStock;
                const discrepancy = auditVal - item.remainingStock;
                const percentage = item.initialStock > 0 
                  ? Math.min(100, Math.round((item.totalDistributed / item.initialStock) * 100))
                  : 0;

                return (
                  <div key={item.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:border-indigo-300 transition-all">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-900 text-base">{item.name}</h4>
                            <span className="text-[11px] font-medium px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                              {item.category || 'Semua Tamu'}
                            </span>
                          </div>
                          {item.notes && (
                            <p className="text-xs text-gray-500 mt-1">{item.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-gray-50 transition-colors"
                            title="Edit Data Souvenir"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSouvenir(item)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-md hover:bg-gray-50 transition-colors"
                            title="Hapus Souvenir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Distribution Progress Bar */}
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Terdistribusi: <strong>{item.totalDistributed}</strong> pcs</span>
                          <span>Stok Awal: <strong>{item.initialStock}</strong> pcs ({percentage}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              percentage > 90 ? 'bg-amber-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Stock Details Matrix */}
                      <div className="mt-4 grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg text-center">
                        <div>
                          <span className="text-[11px] text-gray-500 block">Sisa Sistem</span>
                          <span className={`text-base font-bold ${item.remainingStock <= 5 ? 'text-rose-600' : 'text-gray-900'}`}>
                            {item.remainingStock} <span className="text-[10px] font-normal text-gray-500">pcs</span>
                          </span>
                        </div>
                        <div className="border-x border-gray-200">
                          <span className="text-[11px] text-gray-500 block">Cek Fisik Meja</span>
                          <span className="text-base font-bold text-gray-900">
                            {auditVal} <span className="text-[10px] font-normal text-gray-500">pcs</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-500 block">Selisih Fisik</span>
                          <span className={`text-base font-bold ${
                            discrepancy === 0 ? 'text-emerald-600' : 'text-amber-600'
                          }`}>
                            {discrepancy === 0 ? '0' : `${discrepancy > 0 ? '+' : ''}${discrepancy}`}
                          </span>
                        </div>
                      </div>

                      {/* Last audit note */}
                      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                        <span>Pemeriksaan terakhir: {item.lastAuditAt ? (parseFirestoreDate(item.lastAuditAt)?.toLocaleDateString('id-ID') || '-') : 'Belum pernah'}</span>
                        {item.lastAuditBy && <span>Oleh: {item.lastAuditBy}</span>}
                      </div>
                    </div>

                    {/* Stock Opname Action Button */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        discrepancy === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {discrepancy === 0 ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {discrepancy === 0 ? 'Sesuai dengan Fisik' : 'Perlu Penyelarasan Fisik'}
                      </span>

                      <button
                        onClick={() => openAuditModal(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Hitung Fisik (Stock Opname)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: GUEST DISTRIBUTION DESK (LOKET PENYERAHAN TAMU) */}
      {viewTab === 'distribution' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Search & Filter Bar */}
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama tamu, kode tiket, kategori, atau sesi..."
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs sm:text-sm border border-gray-300 rounded-lg py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">Semua Status Souvenir</option>
                <option value="not_taken">Belum Ambil Souvenir ({guests.length - guestsTakenCount})</option>
                <option value="taken">Sudah Ambil Souvenir ({guestsTakenCount})</option>
              </select>

              {event?.guestCategories && event.guestCategories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="text-xs sm:text-sm border border-gray-300 rounded-lg py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">Semua Kategori</option>
                  {event.guestCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Guest Distribution Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Nama Tamu & Kategori</th>
                  <th className="px-4 py-3 text-left">Kode Tiket</th>
                  <th className="px-4 py-3 text-center">Kehadiran (Check-In)</th>
                  <th className="px-4 py-3 text-left">Status Souvenir</th>
                  <th className="px-4 py-3 text-left">Waktu & Petugas</th>
                  <th className="px-4 py-3 text-right">Aksi Meja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredGuests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                      Tidak ada data tamu yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredGuests.map((guest) => {
                    const isTaken = !!guest.souvenirTaken;
                    const isLoading = actionLoadingId === guest.id;

                    return (
                      <tr key={guest.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{guest.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {guest.category && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded">
                                {guest.category}
                              </span>
                            )}
                            {guest.session && (
                              <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {guest.session}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-600">
                          {guest.ticketCode || '-'}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          {guest.attended ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3" /> Hadir
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              Belum Hadir
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {isTaken ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                              <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sudah Ambil ({guest.souvenirName || 'Souvenir'})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                              <Boxes className="w-3.5 h-3.5 text-gray-400" />
                              <span>Belum Mengambil</span>
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                          {isTaken ? (
                            <div>
                              <div>{guest.souvenirTakenAt ? parseFirestoreDate(guest.souvenirTakenAt)?.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</div>
                              <div className="text-[10px] text-gray-400">{guest.souvenirTakenBy || 'Petugas'}</div>
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {isTaken ? (
                            <button
                              onClick={() => handleUndoSouvenir(guest)}
                              disabled={isLoading}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-200 transition-colors disabled:opacity-50"
                              title="Batalkan pengambilan souvenir"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Batal</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleHandoutSouvenir(guest)}
                              disabled={isLoading || totalRemainingSystem <= 0}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors disabled:opacity-50"
                            >
                              <Gift className="w-3.5 h-3.5" />
                              <span>Serahkan</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: AUDIT TRAIL LOG */}
      {viewTab === 'audit_trail' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-gray-900 text-sm">Riwayat Aktivitas Logistik & Souvenir</h4>
              <p className="text-xs text-gray-500">Mencatat setiap transaksi penyerahan, pembatalan, dan penyesuaian fisik secara realtime.</p>
            </div>
            <span className="text-xs font-mono bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
              {logs.length} transaksi terakhir
            </span>
          </div>

          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Belum ada catatan aktivitas penyerahan souvenir.
              </div>
            ) : (
              logs.map((log) => {
                const date = log.timestamp ? parseFirestoreDate(log.timestamp) : null;
                const isTake = log.action === 'TAKE';
                const isReturn = log.action === 'RETURN';

                return (
                  <div key={log.id} className="p-4 flex items-start justify-between gap-3 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${
                        isTake ? 'bg-indigo-50 text-indigo-600' :
                        isReturn ? 'bg-rose-50 text-rose-600' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {isTake ? <Gift className="w-4 h-4" /> :
                         isReturn ? <RotateCcw className="w-4 h-4" /> :
                         <Sliders className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            isTake ? 'bg-indigo-100 text-indigo-700' :
                            isReturn ? 'bg-rose-100 text-rose-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {isTake ? 'PENYERAHAN' : isReturn ? 'PEMBATALAN' : 'PENYESUAIAN FISIK'}
                          </span>
                          <span className="font-medium text-gray-900 text-sm">{log.guestName}</span>
                          {log.ticketCode && (
                            <span className="text-xs font-mono text-gray-400">({log.ticketCode})</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Souvenir: <strong>{log.souvenirName}</strong> • Jumlah: <strong>{log.quantity} pcs</strong>
                        </p>
                        {log.notes && (
                          <p className="text-xs text-gray-500 mt-0.5 italic">{log.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-xs text-gray-400 flex-shrink-0">
                      <div>{date ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}</div>
                      <div className="text-[10px]">{log.performedBy || 'Petugas'}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
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
    </div>
  );
}
