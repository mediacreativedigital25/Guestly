import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabaseDb } from '../lib/supabaseDb';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { parseFirestoreDate, canUserAccessEvent, getOperatorLabel, getRoleLabel, isEventExpired, isEventInactiveOrExpired, shouldHideServiceInfo, formatGuestFullName } from '../lib/utils';
import { showAlert } from '../lib/alerts';
import { useAuth } from '../AuthContext';
import { Guest, SouvenirItem, SouvenirLog, EventRecord, StaffConfirmationSource } from '../types';
import { 
  CheckCircle, 
  AlertCircle, 
  Camera, 
  Keyboard, 
  ScanLine, 
  Volume2, 
  Users, 
  CheckCircle2, 
  Clock, 
  ExternalLink, 
  ArrowLeft, 
  Zap, 
  Gift, 
  PackageCheck, 
  Boxes, 
  Sliders,
  Search,
  Sparkles,
  RefreshCw,
  TrendingUp,
  Info,
  Wifi,
  WifiOff,
  CloudDownload,
  CloudUpload,
  ShieldAlert,
  Crown,
  Star,
  UserCheck,
  UserX,
  HelpCircle,
  Phone,
  Settings,
  ChevronDown,
  ChevronUp,
  QrCode,
  Edit3,
  X,
  Lock,
  CreditCard,
  RotateCcw,
  UserPlus,
  Loader2
} from 'lucide-react';
import ScannerStressTestModal from '../components/ScannerStressTestModal';
import { Modal } from '../components/Modal';
import { StaffGuestConfirmationModal, formatStaffConfirmationSource } from '../components/StaffGuestConfirmationModal';
import { souvenirStorage, parseSouvenirBatchQrPayload } from '../services/souvenirStorage';
import { offlineSyncService, OfflineSnapshotMeta } from '../services/offlineSyncService';

const playBeep = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = 1000;
      
      gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.12);
    }
  } catch (e) {
    console.error("Audio output not supported", e);
  }
};

const playSouvenirChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const now = audioCtx.currentTime;

      // Note 1 (E5 - 659Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.5, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.18);

      // Note 2 (B5 - 987Hz)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.1);
      gain2.gain.setValueAtTime(0.6, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.35);
    }
  } catch (e) {
    console.error("Audio output error", e);
  }
};

const playVipChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      // Royal celebratory arpeggio: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        const startTime = audioCtx.currentTime + idx * 0.08;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    }
  } catch (e) {
    console.error("Audio output error", e);
  }
};

const playErrorBuzz = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 240;
      
      gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.35);
    }
  } catch (e) {
    console.error("Audio output not supported", e);
  }
};

export default function Scanner() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const { appUser } = useAuth();
  const currentOperator = getOperatorLabel(appUser);
  const isStaff = appUser?.role === 'staff';
  const isStaffCheckinOnly = isStaff && appUser?.staffType === 'checkin';
  const isStaffSouvenirOnly = isStaff && appUser?.staffType === 'souvenir';
  const isStaffAllIn = isStaff && !isStaffCheckinOnly && !isStaffSouvenirOnly;

  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'error';
    message: string;
    guestName?: string;
    category?: string;
    tableNumber?: string;
    pax?: number;
    souvenirNotice?: string;
    operatorName?: string;
    batchScanId?: string;
    batchCode?: string;
    souvenirName?: string;
  } | null>(null);

  // Dedicated VIP / VVIP Alert Modal State
  const [vipModal, setVipModal] = useState<{
    name: string;
    category: string;
    isVvip: boolean;
    tableNumber?: string;
    pax?: number;
    ticketCode?: string;
  } | null>(null);
  const [vipCountdown, setVipCountdown] = useState<number>(5);

  const [scanMode, setScanMode] = useState<'camera' | 'tool' | 'search'>('camera');
  const [manualInput, setManualInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Search state for History Feed (Riwayat Masuk Gate / Riwayat Check-In & Souvenir / Log Serah Souvenir Loket)
  const [historySearch, setHistorySearch] = useState('');

  // Search & Filter state for Manual Guest Check-In (Tanpa QR)
  const [manualGuestSearch, setManualGuestSearch] = useState('');
  const [manualGuestFilter, setManualGuestFilter] = useState<'all' | 'unattended' | 'attended' | 'vip'>('all');
  const [isManualCheckingInId, setIsManualCheckingInId] = useState<string | null>(null);
  
  // Real-time tracking & Data lists
  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [recentScans, setRecentScans] = useState<Guest[]>([]);
  const [allGuests, setAllGuests] = useState<Guest[]>([]);
  const [souvenirLogs, setSouvenirLogs] = useState<SouvenirLog[]>([]);
  const [stats, setStats] = useState({ total: 0, attended: 0, souvenirTaken: 0 });
  const [isStressTestOpen, setIsStressTestOpen] = useState(false);

  // Walk-In Guest Registration States (All Staff & Operators)
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [walkInTitle, setWalkInTitle] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInAddress, setWalkInAddress] = useState('');
  const [walkInCategory, setWalkInCategory] = useState('');
  const [walkInInvitationType, setWalkInInvitationType] = useState('');
  const [walkInSession, setWalkInSession] = useState('');
  const [walkInPax, setWalkInPax] = useState('1');
  const [isSavingWalkIn, setIsSavingWalkIn] = useState(false);
  const [pendingStaffWalkIn, setPendingStaffWalkIn] = useState<{
    payload: any;
    displayName: string;
    pax: number;
    category?: string;
  } | null>(null);
  
  // Souvenir Station Integration
  const [stationMode, setStationMode] = useState<'checkin' | 'checkin_souvenir' | 'souvenir_only'>(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'souvenir') return 'souvenir_only';
    if (modeParam === 'checkin') return 'checkin';
    if (modeParam === 'checkin_souvenir') return 'checkin_souvenir';
    if (isStaffSouvenirOnly) return 'souvenir_only';
    if (isStaffCheckinOnly) return 'checkin';
    if (isStaffAllIn) return 'checkin_souvenir';
    return 'checkin';
  });
  const [souvenirs, setSouvenirs] = useState<SouvenirItem[]>([]);
  const [selectedSouvenirId, setSelectedSouvenirId] = useState<string>('');

  useEffect(() => {
    if (isStaffSouvenirOnly) {
      setStationMode('souvenir_only');
    } else if (isStaffCheckinOnly) {
      setStationMode('checkin');
    } else {
      const modeParam = searchParams.get('mode');
      if (modeParam === 'souvenir') setStationMode('souvenir_only');
      else if (modeParam === 'checkin') setStationMode('checkin');
      else if (modeParam === 'checkin_souvenir' || isStaffAllIn) setStationMode('checkin_souvenir');
    }
  }, [isStaffSouvenirOnly, isStaffCheckinOnly, isStaffAllIn, searchParams]);

  // VIP & VVIP Modal Auto-Dismiss (5 seconds) and Keyboard Close
  useEffect(() => {
    if (!vipModal) return;
    setVipCountdown(5);
    const interval = setInterval(() => {
      setVipCountdown((prev) => {
        if (prev <= 1) {
          setVipModal(null);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        setVipModal(null);
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [vipModal]);

  // Waiting Guests Search & Manual Handout
  const [waitingSearch, setWaitingSearch] = useState('');
  const [isHandingOutId, setIsHandingOutId] = useState<string | null>(null);

  // Offline-First Emergency Mode States
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isForceOffline, setIsForceOffline] = useState<boolean>(() =>
    eventId ? offlineSyncService.isForceOffline(eventId) : false
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() =>
    eventId
      ? offlineSyncService.getSyncQueue(eventId).length + souvenirStorage.getPendingBatchScanCount(eventId)
      : 0
  );
  const [snapshotMeta, setSnapshotMeta] = useState<OfflineSnapshotMeta>(() =>
    eventId ? offlineSyncService.getSnapshotMeta(eventId) : { updatedAt: null, count: 0 }
  );
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);
  const [isPreparingOffline, setIsPreparingOffline] = useState<boolean>(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState<boolean>(false);
  const [isStatsExpanded, setIsStatsExpanded] = useState<boolean>(false);
  const [showOfflineModal, setShowOfflineModal] = useState<boolean>(() => {
    if (!eventId || typeof window === 'undefined') return false;
    const isDismissed = sessionStorage.getItem(`offline_modal_dismissed_${eventId}`);
    if (isDismissed) return false;
    const meta = offlineSyncService.getSnapshotMeta(eventId);
    return !meta.updatedAt;
  });

  const isProcessingRef = useRef(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastBatchScanRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const allGuestsRef = useRef<Guest[]>([]);
  const lastDeltaSyncRef = useRef<string>(new Date(Date.now() - 60000).toISOString());
  const scanResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showScanResult = (
    result: {
      status: 'success' | 'error';
      message: string;
      guestName?: string;
      category?: string;
      tableNumber?: string;
      pax?: number;
      souvenirNotice?: string;
      operatorName?: string;
      batchScanId?: string;
      batchCode?: string;
      souvenirName?: string;
    } | null,
    autoHideMs = 5000
  ) => {
    if (scanResultTimerRef.current) {
      clearTimeout(scanResultTimerRef.current);
      scanResultTimerRef.current = null;
    }
    setScanResult(result);
    if (result && autoHideMs > 0) {
      scanResultTimerRef.current = setTimeout(() => {
        setScanResult(null);
        scanResultTimerRef.current = null;
      }, autoHideMs);
    }
  };

  useEffect(() => {
    return () => {
      if (scanResultTimerRef.current) {
        clearTimeout(scanResultTimerRef.current);
      }
    };
  }, []);

  const refreshOfflineStatus = () => {
    if (!eventId) return;
    setPendingSyncCount(
      offlineSyncService.getSyncQueue(eventId).length + souvenirStorage.getPendingBatchScanCount(eventId)
    );
    setSnapshotMeta(offlineSyncService.getSnapshotMeta(eventId));
    setIsForceOffline(offlineSyncService.isForceOffline(eventId));
  };

  const recomputeDerivedState = (mergedList: Guest[]) => {
    if (!eventId) return;
    allGuestsRef.current = mergedList;
    setAllGuests(mergedList);

    const updatedSouvenirs = souvenirStorage.getSouvenirs(eventId, mergedList);
    setSouvenirs(updatedSouvenirs);
    if (updatedSouvenirs.length > 0) {
      setSelectedSouvenirId(prev =>
        prev && updatedSouvenirs.some(s => s.id === prev) ? prev : updatedSouvenirs[0].id!
      );
    }

    const guestSouvenirTakenCount = mergedList.filter(g => g.souvenirTaken).length;
    const totalDistributedFromInventory =
      updatedSouvenirs.length > 0
        ? updatedSouvenirs.reduce((sum, s) => sum + (s.totalDistributed || 0), 0)
        : guestSouvenirTakenCount;

    setStats({
      total: mergedList.length,
      attended: mergedList.filter(g => g.attended).length,
      souvenirTaken: Math.max(guestSouvenirTakenCount, totalDistributedFromInventory)
    });

    const attendedOrSouvenir = mergedList
      .filter(g => g.attended || g.souvenirTaken)
      .sort((a, b) => {
        const dA = parseFirestoreDate(a.attendedAt || a.souvenirTakenAt || a.updatedAt)?.getTime() || 0;
        const dB = parseFirestoreDate(b.attendedAt || b.souvenirTakenAt || b.updatedAt)?.getTime() || 0;
        return dB - dA;
      })
      .slice(0, 15);
    setRecentScans(attendedOrSouvenir);

    setSouvenirLogs(souvenirStorage.getLogs(eventId));
    refreshOfflineStatus();
  };

  const applyGuestsListToState = (rawList: Guest[], saveSnapshot = true) => {
    if (!eventId) return;
    const withPendingQueue = offlineSyncService.mergeGuestsWithPendingQueue(eventId, rawList);
    if (saveSnapshot && withPendingQueue.length > 0) {
      offlineSyncService.saveGuestsSnapshot(eventId, withPendingQueue);
    }
    const merged = souvenirStorage.mergeGuestsWithSouvenirs(eventId, withPendingQueue);
    lastDeltaSyncRef.current = new Date(Date.now() - 5000).toISOString();
    recomputeDerivedState(merged);
  };

  const openWalkInModal = (prefillName: string = '') => {
    if (!isOnline || isForceOffline) {
      showAlert(
        'Koneksi Internet Diperlukan',
        'Pendaftaran tamu Walk-In baru memerlukan koneksi internet aktif agar kode tiket dan catatan audit petugas langsung tersimpan ke server.',
        'warning'
      );
      return;
    }
    setWalkInTitle('');
    setWalkInName(prefillName.trim());
    setWalkInPhone('');
    setWalkInAddress('');
    setWalkInCategory('');
    setWalkInInvitationType('');
    setWalkInSession('');
    setWalkInPax('1');
    setIsWalkInModalOpen(true);
  };

  const persistWalkInGuest = async (
    basePayload: any,
    staffConfirmation?: { source: StaffConfirmationSource; note: string }
  ) => {
    if (!eventId) return;
    try {
      setIsSavingWalkIn(true);
      const payload: any = { ...basePayload };

      if (isStaff && staffConfirmation) {
        payload.addedByRole = 'staff';
        payload.addedByUid = appUser?.uid || appUser?.id || '';
        payload.addedByName = appUser?.name || currentOperator || 'Staff';
        payload.addedByStaffType = appUser?.staffType || 'all';
        payload.addedVia = 'scanner';
        payload.staffConfirmationSource = staffConfirmation.source;
        if (staffConfirmation.note) {
          payload.staffConfirmationNote = staffConfirmation.note;
        }
        payload.staffConfirmedAt = new Date().toISOString();
      }

      const guestRef = await addDoc(collection(db, 'events', eventId, 'guests'), payload);
      const nowIso = new Date().toISOString();
      const savedGuest: Guest = {
        ...payload,
        id: guestRef.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const nextList = [...allGuestsRef.current, savedGuest];
      applyGuestsListToState(nextList, true);

      setPendingStaffWalkIn(null);
      setIsWalkInModalOpen(false);
      setWalkInTitle('');
      setWalkInName('');
      setWalkInPhone('');
      setWalkInAddress('');
      setWalkInCategory('');
      setWalkInInvitationType('');
      setWalkInSession('');
      setWalkInPax('1');

      setManualGuestSearch(savedGuest.name);
      setManualGuestFilter('unattended');
      setScanMode('search');

      showAlert(
        'Tamu Walk-In Ditambahkan',
        isStaff && staffConfirmation
          ? `${savedGuest.name} (${savedGuest.ticketCode}) tersimpan · Konfirmasi: ${formatStaffConfirmationSource(staffConfirmation.source)}`
          : `${savedGuest.name} (${savedGuest.ticketCode}) berhasil didaftarkan dan siap di-Check-In.`,
        'success'
      );
    } catch (error) {
      showAlert('Gagal', 'Gagal menyimpan tamu baru. Periksa koneksi atau izin akses Anda.', 'error');
      handleFirestoreError(error, OperationType.CREATE, `events/${eventId}/guests`);
    } finally {
      setIsSavingWalkIn(false);
    }
  };

  const handleSubmitWalkInGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || isSavingWalkIn) return;

    if (!isOnline || isForceOffline) {
      showAlert(
        'Koneksi Internet Diperlukan',
        'Pendaftaran tamu Walk-In baru memerlukan koneksi internet aktif agar kode tiket dan catatan audit petugas langsung tersimpan ke server.',
        'warning'
      );
      return;
    }

    if (
      appUser &&
      !['superadmin', 'owner', 'partner', 'admin'].includes(appUser.role) &&
      appUser.guestQuota !== undefined &&
      appUser.guestQuota > 0 &&
      allGuestsRef.current.length >= appUser.guestQuota
    ) {
      showAlert(
        'Kuota Habis',
        `Batas maksimal kuota tamu (${appUser.guestQuota} tamu) telah tercapai. Hubungi Owner/Admin untuk menambah kuota.`,
        'warning'
      );
      return;
    }

    const cleanedTitle = walkInTitle.trim();
    const cleanedBaseName = walkInName.trim();
    if (!cleanedBaseName) {
      showAlert('Peringatan', 'Nama tamu wajib diisi.', 'warning');
      return;
    }

    const cleanedFullName = formatGuestFullName(cleanedBaseName, cleanedTitle);
    if (allGuestsRef.current.some(g => g.name.toLowerCase() === cleanedFullName.toLowerCase())) {
      showAlert('Peringatan', `Tamu dengan nama "${cleanedFullName}" sudah tersedia di daftar.`, 'warning');
      return;
    }

    const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const parsedPax = Math.max(1, Number(walkInPax) || 1);
    const payload: any = {
      eventId,
      title: cleanedTitle,
      name: cleanedFullName,
      ticketCode,
      pax: parsedPax,
      rsvpStatus: 'pending',
      attended: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (walkInAddress.trim()) payload.address = walkInAddress.trim();
    if (walkInPhone.trim()) payload.phone = walkInPhone.trim();
    if (walkInCategory) payload.category = walkInCategory;
    if (walkInInvitationType) payload.invitationType = walkInInvitationType;
    if (walkInSession) payload.session = walkInSession;

    if (isStaff) {
      setPendingStaffWalkIn({
        payload,
        displayName: cleanedFullName,
        pax: parsedPax,
        category: walkInCategory || undefined,
      });
      return;
    }

    await persistWalkInGuest(payload);
  };

  // O(1) / Incremental Update: Merge 1 or a few changed guests without re-downloading 2,000+ rows
  const applyDeltaGuestsToState = (changedGuests: Guest[]) => {
    if (!eventId || !changedGuests || changedGuests.length === 0) return;
    const currentList =
      allGuestsRef.current.length > 0
        ? allGuestsRef.current
        : offlineSyncService.getGuestsSnapshot(eventId);

    if (currentList.length === 0) {
      loadAllGuests();
      return;
    }

    const byId = new Map<string, Guest>();
    const byTicket = new Map<string, Guest>();
    for (const cg of changedGuests) {
      if (cg.id) byId.set(cg.id, cg);
      if (cg.ticketCode) byTicket.set(cg.ticketCode.trim().toUpperCase(), cg);
    }

    let matchedAny = false;
    const updatedRaw = currentList.map((existing) => {
      const incoming =
        (existing.id && byId.get(existing.id)) ||
        (existing.ticketCode && byTicket.get(existing.ticketCode.trim().toUpperCase()));
      if (!incoming) return existing;
      matchedAny = true;
      const mergedGuest: Guest = {
        ...existing,
        ...incoming,
        id: existing.id || incoming.id,
        ticketCode: existing.ticketCode || incoming.ticketCode,
        tableNumber: incoming.tableNumber || existing.tableNumber,
        pax: incoming.pax ?? existing.pax,
        attended: Boolean(existing.attended || incoming.attended),
        attendedAt: incoming.attendedAt || existing.attendedAt,
        checkInTime: incoming.checkInTime || incoming.attendedAt || existing.checkInTime,
        checkInStaff: incoming.checkInStaff || existing.checkInStaff,
        souvenirTaken: Boolean(existing.souvenirTaken || incoming.souvenirTaken),
        souvenirName: incoming.souvenirName || existing.souvenirName,
        souvenirTakenAt: incoming.souvenirTakenAt || existing.souvenirTakenAt,
        souvenirTakenBy: incoming.souvenirTakenBy || existing.souvenirTakenBy,
      };
      if (mergedGuest.id) {
        offlineSyncService.updateGuestInSnapshot(eventId, mergedGuest.id, mergedGuest);
      }
      return mergedGuest;
    });

    if (!matchedAny) {
      for (const cg of changedGuests) {
        if (cg.id && cg.name) {
          updatedRaw.unshift(cg);
          offlineSyncService.updateGuestInSnapshot(eventId, cg.id, cg);
        }
      }
    }

    const withPending = offlineSyncService.mergeGuestsWithPendingQueue(eventId, updatedRaw);
    const merged = souvenirStorage.mergeGuestsWithSouvenirs(eventId, withPending);
    recomputeDerivedState(merged);
  };

  // Lightweight Delta Sync: Only fetches guests modified since last sync (0-5 rows instead of 2,000+ rows)
  const syncRecentGuestChanges = async () => {
    if (!eventId || !navigator.onLine || offlineSyncService.isForceOffline(eventId)) return;
    if (allGuestsRef.current.length === 0) {
      await loadAllGuests();
      return;
    }
    try {
      const sinceIso = lastDeltaSyncRef.current;
      const nextCheckpoint = new Date(Date.now() - 3000).toISOString();
      const changed = await supabaseDb.getGuestsUpdatedSince(eventId, sinceIso);
      lastDeltaSyncRef.current = nextCheckpoint;
      if (changed && changed.length > 0) {
        applyDeltaGuestsToState(changed);
      }
    } catch {
      // silent delta fallback
    }
  };

  const loadAllGuests = async () => {
    if (!eventId) return;

    // 1. Always hydrate immediately from local offline snapshot if state is empty or in offline mode
    const localSnapshot = offlineSyncService.getGuestsSnapshot(eventId);
    const forceOff = offlineSyncService.isForceOffline(eventId);
    const currentlyOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (!currentlyOnline || forceOff) {
      if (localSnapshot.length > 0) {
        applyGuestsListToState(localSnapshot, false);
        return;
      }
    } else if (allGuests.length === 0 && localSnapshot.length > 0) {
      applyGuestsListToState(localSnapshot, false);
    }

    souvenirStorage.hydrateFromSupabase(eventId, true);
    try {
      const supaList = await supabaseDb.getGuests(eventId);
      if (supaList && supaList.length > 0) {
        applyGuestsListToState(supaList, true);
        return;
      } else if (supaList && localSnapshot.length === 0) {
        applyGuestsListToState(supaList, true);
        return;
      }
    } catch (supaErr) {
      console.warn("Supabase loadAllGuests fallback to local snapshot:", supaErr);
    }

    if (localSnapshot.length > 0) {
      applyGuestsListToState(localSnapshot, false);
    }
  };

  const handlePrepareOfflineData = async () => {
    if (!eventId || isPreparingOffline) return;
    setIsPreparingOffline(true);
    try {
      souvenirStorage.hydrateFromSupabase(eventId, true);
      // Also cache event metadata for Greeting Screen
      supabaseDb.getEvent(eventId).then(ev => {
        if (ev) offlineSyncService.saveEventSnapshot(eventId, ev);
      }).catch(() => {});

      const supaList = await supabaseDb.getGuests(eventId);
      if (supaList && supaList.length > 0) {
        applyGuestsListToState(supaList, true);
        playBeep();
        showScanResult({
          status: 'success',
          message: `✓ Data Offline Siap! ${supaList.length.toLocaleString('id-ID')} data tamu telah disimpan ke memori perangkat ini.`
        }, 4000);
        return;
      }
    } catch (e) {
      console.warn("Prepare offline fallback:", e);
    } finally {
      setIsPreparingOffline(false);
    }

    const fallbackList = allGuests.length > 0 ? allGuests : offlineSyncService.getGuestsSnapshot(eventId);
    if (fallbackList.length > 0) {
      offlineSyncService.saveGuestsSnapshot(eventId, fallbackList);
      refreshOfflineStatus();
      playBeep();
      showScanResult({
        status: 'success',
        message: `✓ Data Offline Tersimpan (${fallbackList.length.toLocaleString('id-ID')} tamu siap diverifikasi tanpa internet).`
      }, 4000);
    }
  };

  const handleManualSyncNow = async () => {
    if (!eventId || isSyncingQueue) return;
    setIsSyncingQueue(true);
    try {
      const res = await offlineSyncService.flushSyncQueue(eventId, { ignoreForceOffline: true });
      refreshOfflineStatus();
      await loadAllGuests();
      if (res.synced > 0) {
        playBeep();
        showScanResult({
          status: 'success',
          message: `✓ Sinkronisasi Berhasil! ${res.synced} antrean scan offline telah dikirim ke server pusat.`
        }, 4000);
      }
    } finally {
      setIsSyncingQueue(false);
    }
  };

  const handleToggleForceOffline = () => {
    if (!eventId) return;
    const next = !isForceOffline;
    offlineSyncService.setForceOffline(eventId, next);
    setIsForceOffline(next);
    if (!next && navigator.onLine) {
      // Automatically flush queue when turning emergency mode off
      handleManualSyncNow();
    }
  };

  const fetchStats = async () => {
    await loadAllGuests();
  };

  // Monitor Online/Offline network status & auto-flush sync queue
  useEffect(() => {
    if (!eventId) return;
    refreshOfflineStatus();

    const handleOnline = () => {
      setIsOnline(true);
      if (!offlineSyncService.isForceOffline(eventId)) {
        offlineSyncService.flushSyncQueue(eventId).then(() => {
          refreshOfflineStatus();
          loadAllGuests();
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueChanged = (e: any) => {
      if (!e.detail?.eventId || e.detail?.eventId === eventId) {
        refreshOfflineStatus();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('guestly_offline_queue_changed', handleQueueChanged);

    // Background Auto-Sync every 5 seconds when online and not in manual Force-Offline lock
    const syncTimer = setInterval(async () => {
      const hasPending =
        offlineSyncService.getSyncQueue(eventId).length > 0 ||
        souvenirStorage.getPendingBatchScanCount(eventId) > 0;
      if (
        navigator.onLine &&
        !offlineSyncService.isForceOffline(eventId) &&
        hasPending &&
        !isProcessingRef.current
      ) {
        setIsSyncingQueue(true);
        try {
          await offlineSyncService.flushSyncQueue(eventId);
          refreshOfflineStatus();
        } finally {
          setIsSyncingQueue(false);
        }
      }
    }, 5000);

    return () => {
      clearInterval(syncTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('guestly_offline_queue_changed', handleQueueChanged);
    };
  }, [eventId]);

  // Subscribe to real-time check-ins, souvenirs, and lightweight delta sync
  useEffect(() => {
    if (!eventId) return;

    const cachedEv = offlineSyncService.getEventSnapshot(eventId);
    if (cachedEv?.event) {
      setEventData(cachedEv.event);
    }

    supabaseDb.getEvent(eventId).then((ev) => {
      if (ev) {
        setEventData(ev);
        offlineSyncService.saveEventSnapshot(eventId, ev);
      }
    }).catch(() => {});

    // Initial full load (1x on mount)
    loadAllGuests();

    // 1. Subscribe via Supabase Realtime (Broadcast + Postgres Changes) — Incremental Single-Guest Merge
    const unsubRealtime = supabaseDb.subscribeToGuests(eventId, (payload) => {
      if (payload?.new) {
        const mapped = supabaseDb.mapRealtimeGuest(payload.new);
        if (mapped) {
          applyDeltaGuestsToState([mapped]);
          return;
        }
      }
      syncRecentGuestChanges();
    });

    // 2. Listen to local & cross-device compat changes
    const handleCompatChange = (e: any) => {
      const col = e.detail?.collectionName;
      if (col === 'settings' || col === 'events') {
        recomputeDerivedState(allGuestsRef.current);
      } else if (!col || col === 'guests') {
        syncRecentGuestChanges();
      }
    };

    const handleSouvenirsChanged = (e: any) => {
      if (!e.detail?.eventId || e.detail?.eventId === eventId) {
        recomputeDerivedState(allGuestsRef.current);
      }
    };

    const handleLogsChanged = (e: any) => {
      if (!e.detail?.eventId || e.detail?.eventId === eventId) {
        setSouvenirLogs(souvenirStorage.getLogs(eventId));
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncRecentGuestChanges();
        if (navigator.onLine && !offlineSyncService.isForceOffline(eventId)) {
          souvenirStorage.hydrateFromSupabase(eventId, true);
        }
      }
    };

    window.addEventListener('supabase-compat-change', handleCompatChange);
    window.addEventListener('guestly_souvenirs_changed', handleSouvenirsChanged);
    window.addEventListener('guestly_souvenir_logs_changed', handleLogsChanged);
    document.addEventListener('visibilitychange', handleVisibility);

    // 3. Lightweight 10-second Delta Sync (only fetches rows changed in last 10s, 0 bytes if idle)
    const liveInterval = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !isProcessingRef.current &&
        navigator.onLine &&
        !offlineSyncService.isForceOffline(eventId)
      ) {
        syncRecentGuestChanges();
        souvenirStorage.hydrateFromSupabase(eventId, true);
      }
    }, 10000);

    return () => {
      unsubRealtime();
      clearInterval(liveInterval);
      window.removeEventListener('supabase-compat-change', handleCompatChange);
      window.removeEventListener('guestly_souvenirs_changed', handleSouvenirsChanged);
      window.removeEventListener('guestly_souvenir_logs_changed', handleLogsChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [eventId]);

  useEffect(() => {
    if (scanMode === 'tool' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [scanMode]);

  const activeSouvenir = souvenirs.find(s => s.id === selectedSouvenirId) || souvenirs[0];

  const executeOnlineTicketTransaction = async (
    code: string,
    method: 'scan' | 'manual' = 'scan',
    cancelSignal?: { cancelled: boolean }
  ) => {
    // 1. Direct single-row indexed query in Supabase scoped strictly to current eventId
    let freshGuest = await supabaseDb.getGuestByTicket(eventId!, code).catch(() => null);
    if (!freshGuest) {
      freshGuest = await supabaseDb.getGuestById(code, eventId!).catch(() => null);
    }
    if (!freshGuest) {
      const memGuest = (allGuestsRef.current.length > 0 ? allGuestsRef.current : allGuests).find(
        (g) =>
          (!g.eventId || g.eventId === eventId) &&
          ((g.ticketCode || '').trim().toUpperCase() === code || g.id === code)
      );
      if (memGuest) {
        freshGuest = memGuest;
      } else {
        const notFoundErr: any = new Error('TICKET_NOT_FOUND');
        throw notFoundErr;
      }
    }

    if (!freshGuest || !freshGuest.id || (freshGuest.eventId && freshGuest.eventId !== eventId)) {
      throw new Error('TICKET_NOT_FOUND');
    }

    if (cancelSignal?.cancelled) {
      throw new Error('BALLROOM_SIGNAL_TIMEOUT');
    }

    const guestDocId = freshGuest.id;
    const nowIso = new Date().toISOString();

    // 2. Merge with in-memory & pending offline queue so duplicate scans across >4 scanners are 100% blocked
    const localMerged = offlineSyncService.mergeGuestsWithPendingQueue(
      eventId!,
      allGuestsRef.current.length > 0 ? allGuestsRef.current : allGuests
    );
    const localGuest = localMerged.find(
      (g) => g.id === guestDocId || (g.ticketCode || '').trim().toUpperCase() === code || g.id === code
    );

    const guestData: Guest = {
      ...freshGuest,
      attended: Boolean(freshGuest.attended || localGuest?.attended),
      attendedAt: freshGuest.attendedAt || localGuest?.attendedAt,
      checkInStaff: freshGuest.checkInStaff || localGuest?.checkInStaff,
      checkInMethod: freshGuest.checkInMethod || localGuest?.checkInMethod,
      souvenirTaken: Boolean(freshGuest.souvenirTaken || localGuest?.souvenirTaken),
      souvenirTakenAt: freshGuest.souvenirTakenAt || localGuest?.souvenirTakenAt,
      souvenirName: freshGuest.souvenirName || localGuest?.souvenirName,
      souvenirTakenBy: freshGuest.souvenirTakenBy || localGuest?.souvenirTakenBy,
    };

    if (stationMode === 'souvenir_only') {
      // 1. Mandatory Pre-check: Guest MUST have checked in at gate first
      if (!guestData.attended) {
        const notCheckedInErr: any = new Error('NOT_CHECKED_IN');
        notCheckedInErr.guestName = guestData.name;
        notCheckedInErr.category = guestData.category;
        notCheckedInErr.ticketCode = code;
        notCheckedInErr.tableNumber = guestData.tableNumber;
        notCheckedInErr.pax = guestData.pax;
        throw notCheckedInErr;
      }

      const isAlreadyTaken = guestData.souvenirTaken || souvenirStorage.isGuestTaken(eventId!, guestDocId);
      if (isAlreadyTaken) {
        const localTaken = souvenirStorage.getGuestTakenInfo(eventId!, guestDocId);
        const error: any = new Error('ALREADY_TAKEN_SOUVENIR');
        error.souvenirTakenAt = guestData.souvenirTakenAt || localTaken?.takenAt;
        error.guestName = guestData.name;
        error.souvenirName = guestData.souvenirName || localTaken?.souvenirName || 'Souvenir';
        error.souvenirTakenBy = guestData.souvenirTakenBy || localTaken?.takenBy;
        throw error;
      }

      if (!activeSouvenir || !activeSouvenir.id) {
        throw new Error('NO_SOUVENIR_CONFIGURED');
      }

      if ((activeSouvenir.remainingStock || 0) <= 0) {
        throw new Error('OUT_OF_STOCK');
      }

      if (cancelSignal?.cancelled) {
        throw new Error('BALLROOM_SIGNAL_TIMEOUT');
      }

      // Atomic conditional update: only updates souvenir columns (preserves gate checkInStaff & checkInMethod!)
      const claimRes = await supabaseDb.claimGuestScan(
        guestDocId,
        eventId!,
        {
          souvenirTaken: true,
          souvenirName: activeSouvenir.name,
          souvenirTakenAt: nowIso,
          souvenirTakenBy: currentOperator,
        },
        { requireNotSouvenirTaken: true }
      );

      if (!claimRes.claimed) {
        const latest = await supabaseDb.getGuestById(guestDocId, eventId!).catch(() => null);
        const localTaken = souvenirStorage.getGuestTakenInfo(eventId!, guestDocId);
        const error: any = new Error('ALREADY_TAKEN_SOUVENIR');
        error.souvenirTakenAt = latest?.souvenirTakenAt || localTaken?.takenAt;
        error.guestName = latest?.name || guestData.name;
        error.souvenirName = latest?.souvenirName || localTaken?.souvenirName || 'Souvenir';
        error.souvenirTakenBy = latest?.souvenirTakenBy || localTaken?.takenBy;
        if (latest) applyDeltaGuestsToState([latest]);
        throw error;
      }

      if (cancelSignal?.cancelled) {
        throw new Error('BALLROOM_SIGNAL_TIMEOUT');
      }

      const updatedGuestObj: Guest = {
        ...guestData,
        ...(claimRes.guest || {}),
        souvenirTaken: true,
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        souvenirTakenAt: nowIso,
        souvenirTakenBy: currentOperator,
        updatedAt: nowIso,
      };
      applyDeltaGuestsToState([updatedGuestObj]);

      return {
        name: guestData.name,
        category: guestData.category || '',
        session: guestData.session || '',
        tableNumber: guestData.tableNumber || '',
        pax: guestData.pax,
        souvenirGiven: true,
        souvenirName: activeSouvenir.name,
        guestDocId,
        mode: 'souvenir_only' as const,
        wasAlreadyAttended: !!guestData.attended,
        processedOffline: false,
      };
    } else if (stationMode === 'checkin_souvenir') {
      if (guestData.attended) {
        const error: any = new Error('ALREADY_ATTENDED');
        error.attendedAt = guestData.attendedAt;
        error.guestName = guestData.name;
        error.category = guestData.category;
        error.checkInStaff = guestData.checkInStaff;
        error.souvenirTaken = guestData.souvenirTaken || souvenirStorage.isGuestTaken(eventId!, guestDocId);
        throw error;
      }

      let souvenirGiven = false;
      let targetSouvenirName = '';

      const isAlreadyTaken = guestData.souvenirTaken || souvenirStorage.isGuestTaken(eventId!, guestDocId);
      if (activeSouvenir && activeSouvenir.id && !isAlreadyTaken && (activeSouvenir.remainingStock || 0) > 0) {
        souvenirGiven = true;
        targetSouvenirName = activeSouvenir.name;
      }

      if (cancelSignal?.cancelled) {
        throw new Error('BALLROOM_SIGNAL_TIMEOUT');
      }

      const claimRes = await supabaseDb.claimGuestScan(
        guestDocId,
        eventId!,
        {
          attended: true,
          attendedAt: nowIso,
          checkInTime: nowIso,
          checkInStaff: currentOperator,
          checkInMethod: method,
          ...(souvenirGiven
            ? {
                souvenirTaken: true,
                souvenirName: targetSouvenirName,
                souvenirTakenAt: nowIso,
                souvenirTakenBy: currentOperator,
              }
            : {}),
        },
        { requireNotAttended: true }
      );

      if (!claimRes.claimed) {
        const latest = await supabaseDb.getGuestById(guestDocId, eventId!).catch(() => null);
        const error: any = new Error('ALREADY_ATTENDED');
        error.attendedAt = latest?.attendedAt;
        error.guestName = latest?.name || guestData.name;
        error.category = latest?.category || guestData.category;
        error.checkInStaff = latest?.checkInStaff;
        error.souvenirTaken = latest?.souvenirTaken || souvenirStorage.isGuestTaken(eventId!, guestDocId);
        if (latest) applyDeltaGuestsToState([latest]);
        throw error;
      }

      if (cancelSignal?.cancelled) {
        throw new Error('BALLROOM_SIGNAL_TIMEOUT');
      }

      const updatedGuestObj: Guest = {
        ...guestData,
        ...(claimRes.guest || {}),
        attended: true,
        attendedAt: nowIso,
        checkInTime: nowIso,
        checkInStaff: currentOperator,
        checkInMethod: method,
        ...(souvenirGiven
          ? {
              souvenirTaken: true,
              souvenirId: activeSouvenir?.id,
              souvenirName: targetSouvenirName,
              souvenirTakenAt: nowIso,
              souvenirTakenBy: currentOperator,
            }
          : {}),
        updatedAt: nowIso,
      };
      applyDeltaGuestsToState([updatedGuestObj]);

      return {
        name: guestData.name,
        category: guestData.category || '',
        session: guestData.session || '',
        tableNumber: guestData.tableNumber || '',
        pax: guestData.pax,
        souvenirGiven,
        souvenirName: targetSouvenirName,
        guestDocId,
        mode: 'checkin_souvenir' as const,
        wasAlreadyAttended: false,
        processedOffline: false,
      };
    } else {
      if (guestData.attended) {
        const error: any = new Error('ALREADY_ATTENDED');
        error.attendedAt = guestData.attendedAt;
        error.guestName = guestData.name;
        error.category = guestData.category;
        error.checkInStaff = guestData.checkInStaff;
        throw error;
      }

      if (cancelSignal?.cancelled) {
        throw new Error('BALLROOM_SIGNAL_TIMEOUT');
      }

      const claimRes = await supabaseDb.claimGuestScan(
        guestDocId,
        eventId!,
        {
          attended: true,
          attendedAt: nowIso,
          checkInTime: nowIso,
          checkInStaff: currentOperator,
          checkInMethod: method,
        },
        { requireNotAttended: true }
      );

      if (!claimRes.claimed) {
        const latest = await supabaseDb.getGuestById(guestDocId, eventId!).catch(() => null);
        const error: any = new Error('ALREADY_ATTENDED');
        error.attendedAt = latest?.attendedAt;
        error.guestName = latest?.name || guestData.name;
        error.category = latest?.category || guestData.category;
        error.checkInStaff = latest?.checkInStaff;
        if (latest) applyDeltaGuestsToState([latest]);
        throw error;
      }

      if (cancelSignal?.cancelled) {
        throw new Error('BALLROOM_SIGNAL_TIMEOUT');
      }

      const updatedGuestObj: Guest = {
        ...guestData,
        ...(claimRes.guest || {}),
        attended: true,
        attendedAt: nowIso,
        checkInTime: nowIso,
        checkInStaff: currentOperator,
        checkInMethod: method,
        updatedAt: nowIso,
      };
      applyDeltaGuestsToState([updatedGuestObj]);

      return {
        name: guestData.name,
        category: guestData.category || '',
        session: guestData.session || '',
        tableNumber: guestData.tableNumber || '',
        pax: guestData.pax,
        souvenirGiven: false,
        guestDocId,
        mode: 'checkin' as const,
        wasAlreadyAttended: false,
        processedOffline: false,
      };
    }
  };

  // Direct Souvenir Batch QR scan handler (stiker QR di fisik souvenir: SV:XXXXX)
  const handleSouvenirBatchScan = (batchCode: string, source: 'camera' | 'tool') => {
    if (!eventId) return;
    const cleanCode = batchCode.trim().toUpperCase();

    if (isStaffCheckinOnly) {
      playErrorBuzz();
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      } catch {}
      showScanResult(
        {
          status: 'error',
          message: `⛔ QR ini adalah QR Stiker Souvenir (Batch ${cleanCode}). Pindai stiker ini menggunakan akun/mode Pos Souvenir atau Meja Terpadu.`,
        },
        5000
      );
      return;
    }

    const now = Date.now();
    const cooldownMs = source === 'camera' ? 2000 : 650;
    if (lastBatchScanRef.current.code === cleanCode && now - lastBatchScanRef.current.ts < cooldownMs) {
      return;
    }
    lastBatchScanRef.current = { code: cleanCode, ts: now };

    const matched = souvenirStorage.findSouvenirByBatchCode(eventId, cleanCode, allGuestsRef.current);
    if (!matched) {
      playErrorBuzz();
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      } catch {}
      showScanResult(
        {
          status: 'error',
          message: `⛔ QR Batch Souvenir (${cleanCode}) tidak terdaftar pada acara ini. Pastikan stiker sesuai dengan acara yang sedang dibuka.`,
        },
        5000
      );
      return;
    }

    if ((matched.remainingStock || 0) <= 0) {
      playErrorBuzz();
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      } catch {}
      showScanResult(
        {
          status: 'error',
          message: `⚠️ STOK HABIS: Stok fisik souvenir "${matched.name}" (Batch ${cleanCode}) sudah habis (0 pcs). Harap tambah stok di menu Manajemen Souvenir.`,
        },
        5000
      );
      return;
    }

    const forceOff = offlineSyncService.isForceOffline(eventId);
    const { record, remainingAfter, processedOffline } = souvenirStorage.recordBatchScan(eventId, {
      souvenir: matched,
      performedBy: currentOperator,
      notes:
        source === 'camera'
          ? `Scan kamera langsung stiker QR fisik souvenir (Batch ${cleanCode})`
          : `Scan alat scanner langsung stiker QR fisik souvenir (Batch ${cleanCode})`,
      forceOffline: forceOff,
    });

    if (matched.id) {
      setSelectedSouvenirId(matched.id);
    }

    playSouvenirChime();
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([70]);
      }
    } catch {}

    recomputeDerivedState(allGuestsRef.current);

    const offlineBadge = processedOffline ? ' [Tersimpan Lokal • Auto-Sync]' : '';
    showScanResult(
      {
        status: 'success',
        message: `🎁 Souvenir "${matched.name}" diserahkan (-1 pcs) • Batch: ${cleanCode} • Sisa Stok: ${remainingAfter.toLocaleString('id-ID')} pcs${offlineBadge}`,
        guestName: matched.name,
        category: matched.category && matched.category !== 'Semua Tamu' ? matched.category : undefined,
        souvenirNotice: `Batch ${cleanCode} • Sisa: ${remainingAfter} pcs`,
        operatorName: currentOperator,
        batchScanId: record.id,
        batchCode: cleanCode,
        souvenirName: matched.name,
      },
      6500
    );
  };

  const handleUndoLastBatchScan = (scanId: string) => {
    if (!eventId || !scanId) return;
    const res = souvenirStorage.undoBatchScan(
      eventId,
      scanId,
      currentOperator,
      offlineSyncService.isForceOffline(eventId)
    );
    if (res.undone) {
      playBeep();
      recomputeDerivedState(allGuestsRef.current);
      showScanResult(
        {
          status: 'success',
          message: `↩️ Scan QR souvenir dibatalkan. Stok "${res.record?.souvenirName || 'Souvenir'}" dipulihkan +1 pcs.`,
          operatorName: currentOperator,
        },
        4000
      );
    } else {
      showScanResult(
        {
          status: 'error',
          message: 'Scan QR souvenir ini sudah pernah dibatalkan sebelumnya.',
        },
        3500
      );
    }
  };

  const processTicket = async (decodedText: string, options?: { checkInMethod?: 'scan' | 'manual' }) => {
    if (isProcessingRef.current) return;

    // Auto-detect Souvenir Physical Batch QR (SV:XXXXX) — zero friction, no mode switch needed
    const directBatchCode = parseSouvenirBatchQrPayload(decodedText);
    if (directBatchCode) {
      handleSouvenirBatchScan(directBatchCode, scanMode === 'tool' ? 'tool' : 'camera');
      return;
    }

    const checkInMethod = options?.checkInMethod || 'scan';
    
    // Parse the decodedText to handle URLs or raw codes (including ?v=... query or #... hash)
    let code = decodedText.trim();
    console.log("Scanned QR raw text:", code);
    
    try {
      if (/^https?:\/\//i.test(code)) {
        const url = new URL(code);
        const ticketParam = url.searchParams.get('ticket') || url.searchParams.get('code');
        if (ticketParam) {
          code = ticketParam;
        } else {
          const pathSegments = url.pathname.split('/').filter(Boolean);
          if (pathSegments.length > 0) {
             code = pathSegments[pathSegments.length - 1];
          }
        }
      } else {
        // Strip query params (?v=...) and hash fragments first before splitting path
        const withoutQuery = code.split('?')[0].split('#')[0];
        if (withoutQuery.includes('/')) {
          const segments = withoutQuery.split('/').filter(Boolean);
          if (segments.length > 0) {
            code = segments[segments.length - 1];
          }
        } else {
          code = withoutQuery;
        }
      }
    } catch (e) {
      console.warn("Failed to parse URL from QR, using raw text", e);
    }
    
    code = (code || '').split('?')[0].split('#')[0].trim().toUpperCase();
    console.log("Extracted ticket code:", code);
    
    if (lastScannedCodeRef.current === code) {
       return;
    }
    
    isProcessingRef.current = true;
    setIsProcessing(true);
    showScanResult(null, 0);
    lastScannedCodeRef.current = code;

    try {
      const shouldUseOfflineDirectly =
        !navigator.onLine || offlineSyncService.isForceOffline(eventId!);

      let transactionResult: {
        name: string;
        category: string;
        session: string;
        tableNumber?: string;
        pax?: number;
        souvenirGiven: boolean;
        souvenirName?: string;
        guestDocId: string;
        mode: 'checkin' | 'checkin_souvenir' | 'souvenir_only';
        wasAlreadyAttended: boolean;
        processedOffline?: boolean;
      };

      const currentMemGuests =
        allGuestsRef.current.length > 0 ? allGuestsRef.current : allGuests;

      if (shouldUseOfflineDirectly) {
        transactionResult = offlineSyncService.processTicketLocally({
          eventId: eventId!,
          ticketCode: code,
          stationMode,
          activeSouvenir,
          currentOperator,
          inMemoryGuests: currentMemGuests,
          checkInMethod,
        });
      } else {
        // Smart 2.5s Timeout with cancellation guard: prevents double writes/logs if ballroom signal lags
        const cancelSignal = { cancelled: false };
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              cancelSignal.cancelled = true;
              reject(new Error('BALLROOM_SIGNAL_TIMEOUT'));
            }, 2500);
          });
          transactionResult = await Promise.race([
            executeOnlineTicketTransaction(code, checkInMethod, cancelSignal),
            timeoutPromise,
          ]);
        } catch (onlineErr: any) {
          cancelSignal.cancelled = true;
          const businessErrors = [
            'NOT_CHECKED_IN',
            'ALREADY_ATTENDED',
            'ALREADY_TAKEN_SOUVENIR',
            'OUT_OF_STOCK',
            'NO_SOUVENIR_CONFIGURED',
            'TICKET_NOT_FOUND',
            'TICKET_NOT_FOUND_LOCALLY',
            'GUEST_NOT_FOUND',
          ];
          if (businessErrors.includes(onlineErr?.message)) {
            throw onlineErr;
          }
          console.warn('Signal slow/offline during scan, switching to instant local verification:', onlineErr?.message);
          transactionResult = offlineSyncService.processTicketLocally({
            eventId: eventId!,
            ticketCode: code,
            stationMode,
            activeSouvenir,
            currentOperator,
            inMemoryGuests: currentMemGuests,
            checkInMethod,
          });
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      if (transactionResult) {
        const nowIso = new Date().toISOString();

        // Record log and update storage outside transaction
        if (transactionResult.souvenirGiven && activeSouvenir) {
          souvenirStorage.recordGuestTake(eventId!, transactionResult.guestDocId, {
            souvenirId: activeSouvenir.id!,
            souvenirName: activeSouvenir.name,
            takenAt: nowIso,
            takenBy: currentOperator
          });

          souvenirStorage.addLog(eventId!, {
            eventId: eventId!,
            souvenirId: activeSouvenir.id!,
            souvenirName: activeSouvenir.name,
            guestId: transactionResult.guestDocId,
            guestName: transactionResult.name,
            ticketCode: code,
            quantity: 1,
            action: 'TAKE',
            notes: transactionResult.mode === 'souvenir_only' 
              ? 'Scan penukaran di loket souvenir' 
              : 'Scan check-in sekaligus serah souvenir',
            performedBy: currentOperator
          });
        }

        // Sound Feedback:
        if (transactionResult.souvenirGiven) {
          playBeep();
          setTimeout(() => playSouvenirChime(), 140);
        } else {
          playBeep();
        }

        const matchedGuestObj = currentMemGuests.find(
          (g) => g.id === transactionResult.guestDocId || (g.ticketCode || '').toUpperCase() === code || g.id === code
        );
        const guestTable = transactionResult.tableNumber || matchedGuestObj?.tableNumber || '';
        const guestPax =
          transactionResult.pax ??
          (matchedGuestObj?.pax ? Math.max(1, Number(matchedGuestObj.pax)) : undefined);

        // If processed offline, merge single guest update into memory immediately
        if (transactionResult.processedOffline) {
          applyDeltaGuestsToState([
            {
              ...(matchedGuestObj || {}),
              id: transactionResult.guestDocId,
              eventId: eventId!,
              name: transactionResult.name,
              ticketCode: code,
              category: transactionResult.category,
              session: transactionResult.session,
              tableNumber: guestTable || undefined,
              pax: guestPax,
              attended: true,
              attendedAt: nowIso,
              checkInTime: nowIso,
              checkInStaff: currentOperator,
              checkInMethod,
              ...(transactionResult.souvenirGiven
                ? {
                    souvenirTaken: true,
                    souvenirName: transactionResult.souvenirName,
                    souvenirTakenAt: nowIso,
                    souvenirTakenBy: currentOperator,
                  }
                : {}),
              updatedAt: nowIso,
            } as Guest,
          ]);
        } else {
          // Refresh inventory & logs state when online
          const updated = souvenirStorage.getSouvenirs(eventId!, allGuestsRef.current);
          setSouvenirs(updated);
          setSouvenirLogs(souvenirStorage.getLogs(eventId!));
        }

        const offlineBadge = transactionResult.processedOffline ? ' [Tersimpan Lokal • Auto-Sync]' : '';
        let successMessage = `${transactionResult.name} berhasil check-in di gate!${offlineBadge}`;
        if (transactionResult.mode === 'souvenir_only') {
          successMessage = `🎁 Souvenir "${transactionResult.souvenirName}" berhasil diserahkan kepada ${transactionResult.name}!${offlineBadge}`;
        } else if (transactionResult.souvenirGiven) {
          successMessage = `✓ ${transactionResult.name} berhasil check-in & 🎁 Souvenir "${transactionResult.souvenirName}" diserahkan!${offlineBadge}`;
        }

        showScanResult({ 
          status: 'success', 
          message: successMessage,
          guestName: transactionResult.name,
          category: transactionResult.category,
          tableNumber: guestTable || undefined,
          pax: guestPax,
          souvenirNotice: transactionResult.souvenirGiven ? `Souvenir: ${transactionResult.souvenirName}` : undefined,
          operatorName: currentOperator
        }, 5000);

        // Trigger VIP / VVIP alert popup
        const guestCat = transactionResult.category || '';
        const isVvip = /vvip/i.test(guestCat);
        const isVip = /vip/i.test(guestCat);
        if (isVvip || isVip) {
          playVipChime();
          setVipModal({
            name: transactionResult.name,
            category: guestCat,
            isVvip,
            tableNumber: guestTable || undefined,
            pax: guestPax,
            ticketCode: code
          });
          try {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([150, 100, 200]);
            }
          } catch (e) {
            // ignore
          }
        }

        // Only broadcast arrival to Greeting Screen TV on gate check-ins (not souvenir desk scans)
        if (!transactionResult.processedOffline && transactionResult.mode !== 'souvenir_only') {
          // Zero-latency broadcast over shared WebSocket to Greeting Screen TV & peer Scanners
          supabaseDb.broadcastGuestArrival(eventId!, {
            id: transactionResult.guestDocId,
            event_id: eventId,
            name: transactionResult.name,
            category: transactionResult.category,
            seat: guestTable || undefined,
            tableNumber: guestTable || undefined,
            pax: guestPax,
            ticketCode: code,
            ticket_code: code,
            session: transactionResult.session,
            attended: true,
            attendedAt: nowIso,
            check_in_time: nowIso,
            checkInStaff: currentOperator,
            souvenirTaken: Boolean(transactionResult.souvenirGiven),
            souvenirName: transactionResult.souvenirName,
          });
        }

        refreshOfflineStatus();
      }
    } catch (error: any) {
      playErrorBuzz();
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      } catch (e) {}

      if (error?.message === 'NOT_CHECKED_IN') {
        const guestNameInfo = error.guestName ? `"${error.guestName}" ` : '';
        const catInfo = error.category ? `[${error.category}] ` : '';
        showScanResult({
          status: 'error',
          message: `⛔ DITOLAK: Tamu ${guestNameInfo}${catInfo}BELUM check-in di gate depan/resepsionis! Tamu tidak boleh mengambil souvenir di loket ini dan WAJIB kembali ke meja check-in depan terlebih dahulu.`,
          guestName: error.guestName,
          category: error.category,
          tableNumber: error.tableNumber,
          pax: error.pax
        }, 5000);
      } else if (error?.message === 'TICKET_NOT_FOUND' || error?.message === 'TICKET_NOT_FOUND_LOCALLY') {
        showScanResult({
          status: 'error',
          message: stationMode === 'souvenir_only'
            ? `⛔ DITOLAK: Tiket (Kode: ${code}) tidak ditemukan dalam daftar undangan acara ini! Tamu tidak terdaftar dan tidak boleh mengambil souvenir. Arahkan tamu ke Meja Registrasi Utama di depan.`
            : `Tiket tidak valid atau tidak terdaftar di acara ini. (Kode: ${code})`
        }, 5000);
      } else if (error?.message === 'GUEST_NOT_FOUND') {
        showScanResult({ 
          status: 'error', 
          message: stationMode === 'souvenir_only'
            ? `⛔ DITOLAK: Data tamu tidak ditemukan dalam database acara! Tamu tidak boleh mengambil souvenir dan harus melapor ke Meja Registrasi Utama di depan.`
            : `Data tiket tidak ditemukan di database acara.` 
        }, 5000);
      } else if (error?.message === 'ALREADY_TAKEN_SOUVENIR') {
        const takenDate = parseFirestoreDate(error.souvenirTakenAt);
        const timeFormatted = takenDate 
          ? takenDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : '-';
        const byInfo = error.souvenirTakenBy ? ` (Petugas: ${error.souvenirTakenBy})` : '';
        showScanResult({ 
          status: 'error', 
          message: `⚠️ PERINGATAN: Tamu ${error.guestName ? `atas nama "${error.guestName}" ` : ''}SUDAH PERNAH mengambil souvenir "${error.souvenirName}" pada jam ${timeFormatted}${byInfo}! Penyerahan ditolak untuk mencegah klaim ganda.`,
          guestName: error.guestName,
          operatorName: error.souvenirTakenBy
        }, 5000);
      } else if (error?.message === 'OUT_OF_STOCK') {
        showScanResult({ 
          status: 'error', 
          message: `⚠️ STOK HABIS: Stok fisik souvenir di sistem sudah habis (0 pcs). Harap tambahkan stok atau pilih souvenir lain.`,
          guestName: error.guestName
        }, 5000);
      } else if (error?.message === 'NO_SOUVENIR_CONFIGURED') {
        showScanResult({ 
          status: 'error', 
          message: `⚠️ Belum ada jenis souvenir yang dipilih atau didaftarkan pada acara ini.` 
        }, 5000);
      } else if (error?.message === 'ALREADY_ATTENDED') {
        const attendedDate = parseFirestoreDate(error.attendedAt);
        const dateFormatted = attendedDate 
          ? attendedDate.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
          : '-';
        const byInfo = error.checkInStaff ? ` oleh petugas ${error.checkInStaff}` : '';
        showScanResult({ 
          status: 'error', 
          message: `Tiket ${error.guestName ? `atas nama "${error.guestName}" ` : ''}sudah pernah check-in pada ${dateFormatted}${byInfo}${error.souvenirTaken ? ' (Souvenir sudah diambil)' : ''}.`,
          guestName: error.guestName,
          operatorName: error.checkInStaff
        }, 5000);
      } else {
        showScanResult({ status: 'error', message: "Terjadi kesalahan sistem saat scan tiket" }, 5000);
        console.error('Supabase scan error:', error);
      }
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      
      setTimeout(() => {
        if (lastScannedCodeRef.current === code) {
          lastScannedCodeRef.current = null;
        }
      }, 2500);
    }
  };

  // 1-Click Handout for Waiting Guests at Souvenir Desk
  const handleManualHandout = async (guest: Guest) => {
    if (!guest.id || !eventId || !activeSouvenir || !activeSouvenir.id) return;
    
    // Safeguard: Guest must have checked in at gate first
    if (!guest.attended) {
      playErrorBuzz();
      showScanResult({
        status: 'error',
        message: `⛔ DITOLAK: Tamu "${guest.name}" BELUM check-in di gate depan! Tamu tidak boleh mengambil souvenir dan harus kembali ke meja check-in awal.`,
        guestName: guest.name,
        category: guest.category
      }, 5000);
      return;
    }

    if ((activeSouvenir.remainingStock || 0) <= 0) {
      playErrorBuzz();
      showScanResult({
        status: 'error',
        message: `⚠️ STOK HABIS: Stok fisik souvenir "${activeSouvenir.name}" sudah habis.`
      }, 5000);
      return;
    }

    setIsHandingOutId(guest.id);
    const nowIso = new Date().toISOString();
    const shouldUseOffline = !navigator.onLine || offlineSyncService.isForceOffline(eventId);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      if (shouldUseOffline) {
        throw new Error('FORCE_LOCAL_QUEUE');
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('HANDOUT_TIMEOUT')), 2500);
      });

      // Atomic souvenir claim: only touches souvenir columns (preserves gate checkInStaff & checkInMethod)
      const claimRes = await Promise.race([
        supabaseDb.claimGuestScan(
          guest.id,
          eventId,
          {
            souvenirTaken: true,
            souvenirTakenAt: nowIso,
            souvenirName: activeSouvenir.name,
            souvenirTakenBy: currentOperator,
          },
          { requireNotSouvenirTaken: true }
        ),
        timeoutPromise
      ]);

      if (!claimRes.claimed) {
        const latest = await supabaseDb.getGuestById(guest.id, eventId).catch(() => null);
        if (latest) applyDeltaGuestsToState([latest]);
        playErrorBuzz();
        showScanResult({
          status: 'error',
          message: `⚠️ PERINGATAN: Tamu "${guest.name}" SUDAH PERNAH mengambil souvenir${latest?.souvenirTakenBy ? ` (Petugas: ${latest.souvenirTakenBy})` : ''}! Penyerahan ditolak untuk mencegah klaim ganda.`,
          guestName: guest.name,
          operatorName: latest?.souvenirTakenBy
        }, 5000);
        return;
      }

      offlineSyncService.updateGuestInSnapshot(eventId, guest.id, {
        souvenirTaken: true,
        souvenirTakenAt: nowIso,
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        souvenirQuantity: 1,
        souvenirTakenBy: currentOperator,
        updatedAt: nowIso
      });

      souvenirStorage.recordGuestTake(eventId, guest.id, {
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        takenAt: nowIso,
        takenBy: currentOperator
      });

      souvenirStorage.addLog(eventId, {
        eventId,
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        guestId: guest.id,
        guestName: guest.name,
        ticketCode: guest.ticketCode || '',
        quantity: 1,
        action: 'TAKE',
        notes: 'Penyerahan langsung 1-klik via daftar antrean meja souvenir',
        performedBy: currentOperator
      });

      playSouvenirChime();
      showScanResult({
        status: 'success',
        message: `🎁 Souvenir "${activeSouvenir.name}" berhasil diserahkan kepada ${guest.name}!`,
        guestName: guest.name,
        category: guest.category,
        souvenirNotice: `Souvenir: ${activeSouvenir.name}`,
        operatorName: currentOperator
      }, 5000);

      // Trigger VIP alert popup if applicable
      const guestCat = guest.category || '';
      const isVvip = /vvip/i.test(guestCat);
      const isVip = /vip/i.test(guestCat);
      if (isVvip || isVip) {
        playVipChime();
        setVipModal({
          name: guest.name,
          category: guestCat,
          isVvip,
          tableNumber: guest.tableNumber || undefined,
          pax: guest.pax,
          ticketCode: guest.ticketCode
        });
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([150, 100, 200]);
          }
        } catch (e) {}
      }

      // Incremental single-guest update in memory instead of full 2,000-guest reload
      applyDeltaGuestsToState([
        {
          ...guest,
          ...(claimRes.guest || {}),
          souvenirTaken: true,
          souvenirTakenAt: nowIso,
          souvenirId: activeSouvenir.id,
          souvenirName: activeSouvenir.name,
          souvenirQuantity: 1,
          souvenirTakenBy: currentOperator,
          updatedAt: nowIso,
        },
      ]);
    } catch (e: any) {
      console.warn("Manual handout offline/timeout fallback, queueing locally:", e?.message);
      const attendedAtVal = typeof guest.attendedAt === 'string' ? guest.attendedAt : nowIso;
      const checkInStaffVal = guest.checkInStaff || currentOperator;

      offlineSyncService.updateGuestInSnapshot(eventId, guest.id, {
        souvenirTaken: true,
        souvenirTakenAt: nowIso,
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        souvenirQuantity: 1,
        souvenirTakenBy: currentOperator,
        updatedAt: nowIso
      });

      offlineSyncService.enqueueSyncItem(eventId, {
        eventId,
        guestId: guest.id,
        ticketCode: (guest.ticketCode || '').toUpperCase(),
        guestName: guest.name,
        category: guest.category || '',
        session: guest.session || '',
        mode: 'souvenir_only',
        attended: true,
        attendedAt: attendedAtVal,
        checkInStaff: checkInStaffVal,
        souvenirGiven: true,
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        souvenirTakenAt: nowIso,
        souvenirTakenBy: currentOperator
      });

      souvenirStorage.recordGuestTake(eventId, guest.id, {
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        takenAt: nowIso,
        takenBy: currentOperator
      });
      souvenirStorage.addLog(eventId, {
        eventId,
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        guestId: guest.id,
        guestName: guest.name,
        ticketCode: guest.ticketCode || '',
        quantity: 1,
        action: 'TAKE',
        notes: 'Penyerahan dicatat secara lokal (Antrean Auto-Sync)',
        performedBy: currentOperator
      });
      playSouvenirChime();
      showScanResult({
        status: 'success',
        message: `🎁 Souvenir "${activeSouvenir.name}" berhasil dicatat untuk ${guest.name}! [Tersimpan Lokal • Auto-Sync]`,
        guestName: guest.name,
        operatorName: currentOperator
      }, 5000);

      const guestCatOffline = guest.category || '';
      const isVvipOffline = /vvip/i.test(guestCatOffline);
      const isVipOffline = /vip/i.test(guestCatOffline);
      if (isVvipOffline || isVipOffline) {
        playVipChime();
        setVipModal({
          name: guest.name,
          category: guestCatOffline,
          isVvip: isVvipOffline,
          tableNumber: guest.tableNumber || undefined,
          pax: guest.pax,
          ticketCode: guest.ticketCode
        });
      }

      applyDeltaGuestsToState([
        {
          ...guest,
          souvenirTaken: true,
          souvenirTakenAt: nowIso,
          souvenirId: activeSouvenir.id,
          souvenirName: activeSouvenir.name,
          souvenirQuantity: 1,
          souvenirTakenBy: currentOperator,
          updatedAt: nowIso,
        },
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsHandingOutId(null);
    }
  };

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let isStarted = false;

    if (scanMode === 'camera' && !isEventInactiveOrExpired(eventData)) {
      const initScanner = () => {
        scanner = new Html5QrcodeScanner(
          "reader",
          { fps: 15, qrbox: {width: 250, height: 250} },
          /* verbose= */ false
        );

        scanner.render(async (decodedText) => {
          if (!isProcessingRef.current) {
              await processTicket(decodedText, { checkInMethod: 'scan' });
          }
        }, () => {});
        isStarted = true;
      };

      const timer = setTimeout(() => {
        const readerElement = document.getElementById("reader");
        if (readerElement) {
           initScanner();
        }
      }, 100);
      
      return () => {
        clearTimeout(timer);
        if (scanner && isStarted) {
          scanner.clear().catch(e => console.error("Scanner clear error", e));
        }
      };
    }
  }, [eventId, scanMode, stationMode, selectedSouvenirId, eventData?.status, eventData?.activeUntil, eventData?.subscriptionStatus]);

  const handleManualGuestCheckIn = async (guest: Guest) => {
    if (isProcessingRef.current || isManualCheckingInId) return;
    setIsManualCheckingInId(guest.id || 'manual');
    lastScannedCodeRef.current = null; // Clear debounce
    try {
      const targetCode = (guest.ticketCode || guest.id || '').trim();
      if (!targetCode) {
        alert("Kode tiket atau ID tamu tidak valid.");
        return;
      }
      await processTicket(targetCode, { checkInMethod: 'manual' });
    } finally {
      setIsManualCheckingInId(null);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const inputVal = manualInput.trim();
    setManualInput('');
    if (inputRef.current) {
      inputRef.current.focus();
    }

    const currentList = allGuestsRef.current.length > 0 ? allGuestsRef.current : allGuests;

    // 1. Auto-detect Souvenir Batch QR (SV:XXXXX) immediately in USB/Bluetooth scanner mode
    const directBatchFromTool = parseSouvenirBatchQrPayload(inputVal);
    if (directBatchFromTool) {
      handleSouvenirBatchScan(directBatchFromTool, 'tool');
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    const isLikelyUrlOrCode =
      /^https?:\/\//i.test(inputVal) || inputVal.includes('/');
    const exactTicket = currentList.find(
      (g) => (g.ticketCode || '').trim().toUpperCase() === inputVal.toUpperCase() || g.id === inputVal
    );

    if (exactTicket) {
      // Exact ticket code / ID submitted in USB Barcode Scanner mode counts as 'scan'
      await processTicket(exactTicket.ticketCode || exactTicket.id || inputVal, { checkInMethod: 'scan' });
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    if (isLikelyUrlOrCode) {
      // Full QR URL shot by USB/Bluetooth barcode scanner
      await processTicket(inputVal, { checkInMethod: 'scan' });
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    // Check if operator typed a bare 5-char souvenir batch code (e.g. K7M9P) as fallback for damaged sticker
    if (eventId && /^[A-Z0-9]{5}$/i.test(inputVal)) {
      const matchedSouvenirByCode = souvenirStorage.findSouvenirByBatchCode(eventId, inputVal, currentList);
      if (matchedSouvenirByCode && matchedSouvenirByCode.qrBatchCode) {
        handleSouvenirBatchScan(matchedSouvenirByCode.qrBatchCode, 'tool');
        if (inputRef.current) inputRef.current.focus();
        return;
      }
    }

    // Check if input matches guest name
    const matchingByName = currentList.filter((g) =>
      (g.name || '').toLowerCase().includes(inputVal.toLowerCase())
    );

    if (matchingByName.length === 1) {
      await processTicket(matchingByName[0].ticketCode || matchingByName[0].id || inputVal, { checkInMethod: 'manual' });
    } else if (matchingByName.length > 1) {
      // Multiple guests found, switch to search tab to let operator choose
      setScanMode('search');
      setManualGuestSearch(inputVal);
    } else {
      // Fallback: send as raw ticket code to trigger proper validation/not found message
      await processTicket(inputVal, { checkInMethod: 'scan' });
    }

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Waiting guests list for Souvenir Desk (guests attended at gate who haven't taken souvenir)
  const allWaitingForSouvenir = allGuests.filter(g => {
    const isTaken = g.souvenirTaken || souvenirStorage.isGuestTaken(eventId || '', g.id || '');
    return g.attended && !isTaken;
  });

  // Calculations for differentiated statistics
  const checkinPercentage = stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : 0;
  const souvenirPercentage = stats.attended > 0 ? Math.min(100, Math.round((stats.souvenirTaken / stats.attended) * 100)) : 0;
  const waitingForSouvenirCount = allWaitingForSouvenir.length;
  const unattendedCount = Math.max(0, stats.total - stats.attended);

  const waitingGuests = allWaitingForSouvenir.filter(g => {
    if (!waitingSearch.trim()) return true;
    const term = waitingSearch.toLowerCase();
    return (
      (g.name || '').toLowerCase().includes(term) ||
      (g.ticketCode || '').toLowerCase().includes(term) ||
      (g.category || '').toLowerCase().includes(term) ||
      (g.tableNumber || '').toLowerCase().includes(term)
    );
  });

  // Filtered guests list for "Cari Tamu (Tanpa QR)" mode
  const filteredManualGuests = allGuests.filter((g) => {
    if (manualGuestFilter === 'unattended' && g.attended) return false;
    if (manualGuestFilter === 'attended' && !g.attended) return false;
    if (manualGuestFilter === 'vip' && !/vip/i.test(g.category || '')) return false;

    if (!manualGuestSearch.trim()) return true;
    const term = manualGuestSearch.toLowerCase().trim();
    return (
      (g.name || '').toLowerCase().includes(term) ||
      (g.ticketCode || '').toLowerCase().includes(term) ||
      (g.category || '').toLowerCase().includes(term) ||
      (g.tableNumber || '').toLowerCase().includes(term) ||
      (g.phone || '').toLowerCase().includes(term) ||
      (g.notes || '').toLowerCase().includes(term) ||
      (g.session || '').toLowerCase().includes(term)
    );
  });

  if (appUser && !canUserAccessEvent(appUser, eventId)) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white p-8 rounded-2xl shadow-sm border border-red-200 text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Akses Acara Ditolak</h2>
        <p className="text-sm text-gray-600">
          Akun Anda ({getRoleLabel(appUser.role, appUser.staffType)}) belum ditugaskan pada acara ini. Anda hanya dapat membuka scanner untuk acara yang telah ditugaskan kepada Anda.
        </p>
        <Link
          to="/auth/login/events"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Acara
        </Link>
      </div>
    );
  }

  if (eventData && isEventInactiveOrExpired(eventData)) {
    const expired = isEventExpired(eventData);
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white p-8 rounded-2xl shadow-sm border border-rose-200 text-center space-y-4">
        <div className="w-14 h-14 bg-rose-50 text-[#8C3A50] rounded-2xl border border-rose-200 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#8C3A50]">
            {expired ? 'Masa Aktif Acara Berakhir' : 'Acara Berstatus Draft'}
          </p>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            QR Scanner &amp; Check-In Dikunci
          </h2>
          <p className="text-sm font-medium text-slate-700 mt-1">{eventData.title}</p>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          {expired
            ? 'Masa aktif 30 hari acara ini telah habis dan otomatis berubah menjadi Draft. Silakan perpanjang paket terlebih dahulu agar sistem Scanner kembali aktif.'
            : 'Scanner kehadiran dan penukaran souvenir hanya dapat digunakan ketika status acara Published.'}
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            to={appUser?.role === 'staff' ? '/auth/login/events' : `/auth/login/events/${eventId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{appUser?.role === 'staff' ? 'Kembali ke Daftar Acara' : 'Kembali ke Detail Acara'}</span>
          </Link>
          {appUser?.role !== 'staff' && !shouldHideServiceInfo(appUser) && (
            <Link
              to={`/auth/login/services/catalog?renewEvent=${eventId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-bold shadow-xs transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span>Top-Up Paket</span>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-4 pb-12">
      {/* Top Header & Navigation - Streamlined 1-Row Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-3 sm:p-3.5 rounded-lg shadow-2xs border border-slate-200 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 truncate">
              <ScanLine className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="truncate">
                {isStaffCheckinOnly
                  ? 'Scanner Kehadiran Gate'
                  : isStaffSouvenirOnly
                  ? 'Scanner Loket Souvenir'
                  : 'Scanner & POS Tamu'}
              </span>
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-0.5">
              <span>
                Petugas: <strong className="text-slate-800">{currentOperator}</strong>
              </span>
              <span className="text-slate-300">•</span>
              {/* Distinct Network Connection Status Badge & Offline Data Counter */}
              <div className="inline-flex items-center gap-2">
                {!isOnline || isForceOffline ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                    Offline
                  </span>
                ) : pendingSyncCount > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    Sinkronisasi ({pendingSyncCount})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Online
                  </span>
                )}

                <span className="text-[11px] font-medium text-slate-500">
                  {snapshotMeta.updatedAt
                    ? `Data Tamu Offline: ${(snapshotMeta.count || stats.total).toLocaleString('id-ID')} Tersimpan`
                    : 'Data Offline Belum Disimpan'}
                </span>

                {/* Compact prepare button */}
                <button
                  onClick={handlePrepareOfflineData}
                  disabled={isPreparingOffline || !isOnline}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded transition-colors cursor-pointer disabled:opacity-50"
                  title="Perbarui daftar tamu offline di memori browser"
                >
                  <CloudDownload className={`w-3 h-3 ${isPreparingOffline ? 'animate-bounce' : ''}`} />
                  <span>{isPreparingOffline ? 'Menyimpan...' : 'Perbarui'}</span>
                </button>

                {/* Manual sync button if pending queue exists */}
                {pendingSyncCount > 0 && (
                  <button
                    onClick={handleManualSyncNow}
                    disabled={isSyncingQueue || !isOnline}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors cursor-pointer disabled:opacity-50"
                    title="Kirim antrean offline sekarang"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingQueue ? 'animate-spin' : ''}`} />
                    <span>Sync ({pendingSyncCount})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Controls: Walk-In + Mode Switcher + Tools Dropdown */}
        <div className="flex flex-wrap items-center justify-end gap-2 self-end md:self-auto shrink-0">
          {/* Quick Walk-In Guest Button (All Staff & Operators) */}
          <button
            type="button"
            onClick={() => openWalkInModal()}
            className="h-7.5 sm:h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
            title={
              isStaff
                ? 'Tambah tamu susulan / Walk-In (memerlukan konfirmasi Keluarga/Vendor)'
                : 'Tambah tamu susulan / Walk-In'
            }
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Tamu Walk-In</span>
          </button>

          {/* Mode Switcher */}
          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md">
            <button
              onClick={() => setScanMode('camera')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                scanMode === 'camera'
                  ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Pindai QR dengan kamera perangkat"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kamera</span>
            </button>
            <button
              onClick={() => setScanMode('tool')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                scanMode === 'tool'
                  ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Gunakan barcode scanner eksternal USB / Bluetooth"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Alat Scanner</span>
            </button>
            <button
              onClick={() => setScanMode('search')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                scanMode === 'search'
                  ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Check-in untuk tamu yang tidak membawa atau lupa membuka QR tiket"
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Cari Tamu (Tanpa QR)</span>
            </button>
          </div>

          {/* Tools & Settings Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
              className="h-7.5 sm:h-8 flex items-center gap-1.5 px-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer shadow-2xs"
              title="Menu Alat & Pengaturan Tambahan"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Alat</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isToolsDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setIsToolsDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-30 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Alat Scanner & Audio
                  </div>

                  {/* Sound Beep Test */}
                  <button
                    onClick={() => {
                      playBeep();
                      setIsToolsDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-indigo-600 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tes Suara Beep Sukses</span>
                  </button>

                  {/* Open Greeting TV Screen */}
                  {!isStaffSouvenirOnly && (
                    <a
                      href={`/events/${eventId}/greeting`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsToolsDropdownOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Buka Layar Sapa TV/Monitor</span>
                    </a>
                  )}

                  {/* Emergency Offline Mode Toggle */}
                  <button
                    onClick={() => {
                      handleToggleForceOffline();
                      setIsToolsDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 cursor-pointer border-t border-slate-100"
                  >
                    <ShieldAlert className={`w-3.5 h-3.5 ${isForceOffline ? 'text-rose-600' : 'text-slate-400'}`} />
                    <span className={isForceOffline ? 'text-rose-700 font-bold' : ''}>
                      {isForceOffline ? 'Matikan Mode Darurat' : 'Paksa Mode Darurat (Offline)'}
                    </span>
                  </button>

                  {/* Stress Test Tool - EXCLUSIVELY for Super Admin */}
                  {appUser?.role === 'superadmin' && (
                    <div className="border-t border-slate-100 pt-1 mt-1">
                      <div className="px-3 py-1 text-[9px] font-bold text-amber-700 bg-amber-50 mx-2 rounded">
                        Khusus Super Admin
                      </div>
                      <button
                        onClick={() => {
                          setIsStressTestOpen(true);
                          setIsToolsDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-900 hover:bg-amber-50 cursor-pointer font-semibold"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                        <span>Uji Ketahanan & Stress Test</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Compact POS Mode Bar & Quick Stats */}
      <div className="bg-white p-2.5 sm:p-3 rounded-lg shadow-2xs border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* POS Station Mode Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md">
            {!isStaffSouvenirOnly && (
              <button
                onClick={() => setStationMode('checkin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                  stationMode === 'checkin'
                    ? 'bg-white text-blue-700 shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Check-In Saja</span>
              </button>
            )}
            {!isStaffCheckinOnly && !isStaffSouvenirOnly && (
              <button
                onClick={() => setStationMode('checkin_souvenir')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                  stationMode === 'checkin_souvenir'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Gift className="w-3.5 h-3.5 text-amber-300" />
                <span>Check-In + Souvenir</span>
              </button>
            )}
            {!isStaffCheckinOnly && (
              <button
                onClick={() => setStationMode('souvenir_only')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                  stationMode === 'souvenir_only'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5 text-emerald-100" />
                <span>Khusus Meja Souvenir</span>
              </button>
            )}
          </div>

          {/* Souvenir Dropdown if applicable */}
          {stationMode !== 'checkin' && souvenirs.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              {souvenirs.length > 1 ? (
                <select
                  value={selectedSouvenirId}
                  onChange={(e) => setSelectedSouvenirId(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-md px-2 py-1 bg-slate-50 text-slate-800 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {souvenirs.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Sisa: {s.remainingStock} pcs)
                    </option>
                  ))}
                </select>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-900 font-medium">
                  <Gift className="w-3 h-3 text-emerald-600" />
                  {souvenirs[0].name}: <strong>{souvenirs[0].remainingStock}</strong>/{souvenirs[0].initialStock} pcs
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quick Stats Summary & Collapsible Toggle */}
        <div className="flex items-center justify-between md:justify-end gap-3 text-xs">
          <div className="flex items-center gap-2">
            {stationMode === 'checkin' && (
              <span className="text-slate-700">
                Hadir: <strong className="text-emerald-700">{stats.attended.toLocaleString('id-ID')}</strong>/{stats.total.toLocaleString('id-ID')} ({checkinPercentage}%)
                <span className="text-slate-300 mx-1.5">•</span>
                Belum: <strong className="text-amber-700">{unattendedCount.toLocaleString('id-ID')}</strong>
              </span>
            )}
            {stationMode === 'checkin_souvenir' && (
              <span className="text-slate-700">
                Souvenir Diserahkan: <strong className="text-purple-700">{stats.souvenirTaken.toLocaleString('id-ID')}</strong>
                <span className="text-slate-300 mx-1.5">•</span>
                Belum Ambil: <strong className="text-amber-700">{waitingForSouvenirCount.toLocaleString('id-ID')}</strong>
              </span>
            )}
            {stationMode === 'souvenir_only' && (
              <span className="text-slate-700">
                Diserahkan: <strong className="text-emerald-700">{stats.souvenirTaken.toLocaleString('id-ID')}</strong> pcs
                <span className="text-slate-300 mx-1.5">•</span>
                Antre: <strong className="text-amber-700">{waitingGuests.length}</strong>
              </span>
            )}
          </div>

          <button
            onClick={() => setIsStatsExpanded(!isStatsExpanded)}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 font-semibold px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            title={isStatsExpanded ? 'Lipat kartu statistik' : 'Buka detail 4 kartu statistik'}
          >
            <span>{isStatsExpanded ? 'Ringkas' : 'Detail'}</span>
            {isStatsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Differentiated POS Stats Cards (Collapsible) */}
      {isStatsExpanded && (
        <div className="animate-in fade-in duration-200">
          {stationMode === 'checkin' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-slate-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Total Tamu Undangan</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">{stats.total.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Kuota terdaftar</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-emerald-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-700 font-semibold">Sudah Check-In</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">{stats.attended.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">Telah masuk gate</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-amber-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-700 font-semibold">Belum Masuk Gate</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1 font-mono tabular-nums">{unattendedCount.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">Sisa tamu di jalan</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-blue-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-700 font-semibold">Tingkat Kehadiran</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1 font-mono tabular-nums">{checkinPercentage}%</p>
                  <p className="text-[11px] text-blue-600 mt-0.5 font-mono tabular-nums">{stats.attended}/{stats.total} Tamu</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}

          {stationMode === 'checkin_souvenir' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-purple-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-700 font-semibold">Hadir & Terima Souvenir</p>
                  <p className="text-2xl font-bold text-purple-800 mt-1 font-mono tabular-nums">{stats.souvenirTaken.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-purple-600 mt-0.5">Check-in komplit</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                  <Gift className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-amber-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-700 font-semibold">Hadir Belum Ambil</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1 font-mono tabular-nums">{waitingForSouvenirCount.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">Souvenir dilewati</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-indigo-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-700 font-semibold">Sisa Stok di Meja</p>
                  <p className="text-2xl font-bold text-indigo-700 mt-1 font-mono tabular-nums">{(activeSouvenir?.remainingStock ?? 0).toLocaleString('id-ID')} pcs</p>
                  <p className="text-[11px] text-indigo-500 mt-0.5">Dari {activeSouvenir?.initialStock ?? 0} pcs awal</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <Boxes className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-emerald-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-700 font-semibold">Rasio Serah Souvenir</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">{souvenirPercentage}%</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5 font-mono tabular-nums">{stats.souvenirTaken}/{stats.attended} Tamu Hadir</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}

          {stationMode === 'souvenir_only' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-emerald-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-700 font-semibold">Souvenir Diserahkan</p>
                  <p className="text-2xl font-bold text-emerald-800 mt-1 font-mono tabular-nums">{stats.souvenirTaken.toLocaleString('id-ID')} pcs</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">Telah dibagikan</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                  <PackageCheck className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-amber-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-700 font-semibold">Menunggu di Venue</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1 font-mono tabular-nums">{waitingForSouvenirCount.toLocaleString('id-ID')} Tamu</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">Sudah hadir di gate</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-blue-500 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-700 font-semibold">Sisa Stok Fisik</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1 font-mono tabular-nums">{(activeSouvenir?.remainingStock ?? 0).toLocaleString('id-ID')} pcs</p>
                  <p className="text-[11px] text-blue-600 mt-0.5">
                    {(activeSouvenir?.remainingStock ?? 0) <= 10 ? '⚠️ Stok Menipis' : 'Stok Aman'}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  <Boxes className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-slate-400 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Belum Masuk Gate</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1 font-mono tabular-nums">{unattendedCount.toLocaleString('id-ID')} Tamu</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Belum scan di pintu</p>
                </div>
                <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Live Scan Result Notification Banner */}
      {scanResult && (
        <div className={`p-4 rounded-lg flex items-start gap-3.5 shadow-xs border ${
          scanResult.status === 'success' 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
            : 'bg-rose-50 border-rose-300 text-rose-900'
        }`}>
          <div className={`p-2 rounded-md shrink-0 ${scanResult.status === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            {scanResult.status === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-base font-bold">
                {scanResult.status === 'success' 
                  ? (scanResult.batchScanId
                      ? '✓ Souvenir Fisik Diserahkan (-1 Stok)'
                      : stationMode === 'souvenir_only'
                      ? '✓ Souvenir Berhasil Diserahkan'
                      : '✓ Check-in Berhasil') 
                  : (stationMode === 'souvenir_only' ? '✕ Penyerahan Souvenir Ditolak' : '✕ Verifikasi Gagal')}
              </h4>
              <div className="flex flex-wrap items-center gap-1.5">
                {scanResult.batchCode && (
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                    QR Batch: {scanResult.batchCode}
                  </span>
                )}
                {scanResult.category && (
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded border ${
                    /vvip/i.test(scanResult.category)
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : /vip/i.test(scanResult.category)
                      ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}>
                    {/vvip|vip/i.test(scanResult.category) ? `👑 ${scanResult.category}` : scanResult.category}
                  </span>
                )}
                {scanResult.tableNumber && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-amber-500 text-white shadow-2xs">
                    🪑 Meja: {scanResult.tableNumber}
                  </span>
                )}
                {scanResult.pax && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/80 text-slate-800 border border-slate-300">
                    {scanResult.pax} Kursi (Pax)
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm font-medium mt-1 leading-relaxed">
              {scanResult.message}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              {scanResult.operatorName ? (
                <p className="text-xs font-semibold opacity-85">
                  👤 Dicatat oleh petugas: {scanResult.operatorName}
                </p>
              ) : <span />}
              {scanResult.status === 'success' && scanResult.batchScanId && (
                <button
                  type="button"
                  onClick={() => handleUndoLastBatchScan(scanResult.batchScanId!)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Batalkan (+1 Stok)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Scanner Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Scanner Area (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          {scanMode === 'camera' && (
            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-2xs border border-slate-200 overflow-hidden w-full">
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Pemindai Kamera ({stationMode === 'souvenir_only' ? 'Loket Souvenir' : stationMode === 'checkin_souvenir' ? 'Meja Terpadu' : 'Gate Check-in'})
                </span>
                <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Real-time
                </span>
              </div>
              <div id="reader" className="w-full max-w-xl mx-auto min-h-[340px] overflow-hidden rounded-md border border-slate-200 [&>video]:object-cover [&_button]:px-4 [&_button]:py-2 [&_button]:bg-indigo-600 [&_button]:text-white [&_button]:rounded-md [&_button]:hover:bg-indigo-700 [&_button]:transition-colors [&_button]:mb-4 [&_button]:font-medium [&_a]:text-indigo-600 [&_a]:underline [&_a]:mt-4 [&_a]:block [&_a]:cursor-pointer [&_#html5-qrcode-anchor-scan-type-change]:mt-4 [&_span]:block [&_span]:mb-3"></div>
              <p className="text-center text-slate-500 text-xs mt-3">
                {stationMode === 'souvenir_only'
                  ? 'Arahkan kamera ke QR tiket tamu ATAU langsung ke Stiker QR fisik souvenir (auto-deteksi, -1 stok otomatis).'
                  : stationMode === 'checkin_souvenir'
                  ? 'Arahkan kamera ke QR tiket tamu (check-in + souvenir) atau Stiker QR fisik souvenir untuk potong stok langsung.'
                  : 'Arahkan kamera ke QR tiket tamu untuk memverifikasi tiket masuk ke gate.'}
              </p>

              {/* Quick switch to manual search if guest forgot / doesn't have QR */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setScanMode('search')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/80 px-3 py-1.5 rounded-full transition-all cursor-pointer shadow-2xs"
                >
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Tamu tidak membawa QR? Cari Nama Tamu & Check-In Manual »</span>
                </button>
              </div>
            </div>
          )}

          {scanMode === 'tool' && (
            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-2xs border border-slate-200">
              <div className="max-w-md mx-auto text-center space-y-4">
                <div className="bg-indigo-50 w-14 h-14 rounded-lg border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600">
                  <ScanLine className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Mode Alat Barcode Scanner (Kasir)</h3>
                  <p className="text-xs text-slate-500">
                    {stationMode === 'checkin'
                      ? 'Tembakkan laser pemindai USB/Bluetooth langsung ke tiket fisik atau ketik nama/kode tiket.'
                      : 'Tembakkan laser USB/Bluetooth ke QR tiket tamu ATAU langsung ke Stiker QR Souvenir (SV:XXXXX) / kode batch 5 karakter.'}
                  </p>
                </div>
                
                <form onSubmit={handleManualSubmit}>
                  <input 
                    ref={inputRef}
                    type="text"
                    value={manualInput}
                    onChange={e => setManualInput(e.target.value)}
                    className="w-full text-center text-lg font-mono tracking-widest p-3.5 border border-indigo-300 rounded-md focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all outline-none placeholder:text-slate-400 placeholder:text-sm"
                    placeholder={stationMode === 'checkin' ? 'Scan kode tiket atau ketik nama tamu...' : 'Scan tiket tamu, Stiker QR Souvenir, atau nama...'}
                    autoFocus
                    disabled={isProcessing}
                  />
                  <button type="submit" className="hidden">Submit</button>
                </form>
                
                {isProcessing ? (
                  <p className="text-indigo-600 font-medium text-sm animate-pulse flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" /> Memverifikasi tiket ke database...
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">Kursor otomatis standby di kotak input. Tekan Enter setelah mengetik.</p>
                )}

                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setScanMode('search')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/80 px-3 py-1.5 rounded-full transition-all cursor-pointer shadow-2xs"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Tamu tidak bawa QR? Cari di Daftar Tamu Lengkap »</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode 3: Cari Tamu & Check-In Manual (Tanpa QR) */}
          {scanMode === 'search' && (
            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-2xs border border-slate-200 space-y-3.5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    Pencarian Tamu & Check-In Cepat (Tanpa QR)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Solusi saat tamu tidak membawa fisik kartu tiket atau lupa membuka QR di smartphone
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
                    {stationMode === 'souvenir_only' ? 'Pos: Loket Souvenir' : stationMode === 'checkin_souvenir' ? 'Pos: Combo Check-in' : 'Pos: Gate Check-in'}
                  </span>
                </div>
              </div>

              {/* Search Bar & Filters */}
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={manualGuestSearch}
                    onChange={(e) => setManualGuestSearch(e.target.value)}
                    placeholder="Ketik nama tamu, nomor WhatsApp, meja, atau tiket..."
                    className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white text-slate-900 placeholder:text-slate-400 transition-all shadow-2xs"
                    autoFocus
                  />
                  {manualGuestSearch && (
                    <button
                      onClick={() => setManualGuestSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      title="Hapus pencarian"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filter Chips */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setManualGuestFilter('all')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        manualGuestFilter === 'all'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Semua ({stats.total})
                    </button>
                    <button
                      onClick={() => setManualGuestFilter('unattended')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        manualGuestFilter === 'unattended'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      Belum Hadir ({unattendedCount})
                    </button>
                    <button
                      onClick={() => setManualGuestFilter('attended')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        manualGuestFilter === 'attended'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      Sudah Hadir ({stats.attended})
                    </button>
                    <button
                      onClick={() => setManualGuestFilter('vip')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        manualGuestFilter === 'vip'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      👑 VIP / VVIP
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400">
                    Menampilkan {filteredManualGuests.length} tamu
                  </span>
                </div>
              </div>

              {/* Guest Cards List */}
              <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1">
                {filteredManualGuests.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <UserX className="w-8 h-8 mx-auto opacity-35 mb-2" />
                    <p className="text-xs font-medium text-slate-600">
                      {manualGuestSearch ? `Tidak ada tamu cocok dengan "${manualGuestSearch}"` : 'Tidak ada data tamu.'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Coba periksa kembali ejaan nama atau ubah filter status di atas.
                    </p>
                    <button
                      type="button"
                      onClick={() => openWalkInModal(manualGuestSearch)}
                      className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer shadow-2xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>
                        {manualGuestSearch.trim()
                          ? `Daftarkan "${manualGuestSearch.trim()}" (Walk-In)`
                          : 'Tambah Tamu Walk-In'}
                      </span>
                    </button>
                  </div>
                ) : (
                  filteredManualGuests.slice(0, 50).map((guest) => {
                    const attendedDate = guest.attendedAt ? parseFirestoreDate(guest.attendedAt) : null;
                    const timeStr = attendedDate ? attendedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : null;
                    const isVvip = /vvip/i.test(guest.category || '');
                    const isVip = /vip/i.test(guest.category || '');

                    return (
                      <div
                        key={guest.id}
                        className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          guest.attended
                            ? 'bg-slate-50/70 border-slate-200'
                            : isVvip
                            ? 'bg-amber-50/40 border-amber-200 hover:bg-amber-50/70'
                            : isVip
                            ? 'bg-purple-50/40 border-purple-200 hover:bg-purple-50/70'
                            : 'bg-white border-slate-200/90 hover:border-indigo-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{guest.name}</span>
                            {isVvip ? (
                              <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                👑 VVIP
                              </span>
                            ) : isVip ? (
                              <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-purple-100 text-purple-900 border border-purple-300">
                                ⭐ VIP
                              </span>
                            ) : guest.category ? (
                              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {guest.category}
                              </span>
                            ) : null}

                            {guest.tableNumber && (
                              <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-amber-500 text-white shadow-2xs">
                                🪑 Meja {guest.tableNumber}
                              </span>
                            )}
                            <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              {Math.max(1, Number(guest.pax) || 1)} Pax
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                            {guest.ticketCode && (
                              <span className="font-mono text-slate-600 font-medium">
                                Tiket: {guest.ticketCode}
                              </span>
                            )}
                            {(guest.phone || guest.whatsapp) && (
                              <span className="flex items-center gap-1 text-slate-500">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {guest.phone || guest.whatsapp}
                              </span>
                            )}
                            {guest.attended && timeStr && (
                              <span className="text-emerald-700 font-semibold flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Hadir {timeStr}
                                </span>
                                {guest.checkInMethod === 'manual' ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                    <Keyboard className="w-2.5 h-2.5 text-amber-600" /> Manual
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded">
                                    <QrCode className="w-2.5 h-2.5 text-sky-600" /> Scan QR
                                  </span>
                                )}
                                {guest.checkInStaff ? ` (${guest.checkInStaff})` : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons depending on stationMode and guest status */}
                        <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                          {guest.attended ? (
                            stationMode === 'souvenir_only' ? (
                              guest.souvenirTaken ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-md">
                                  <PackageCheck className="w-3 h-3 text-emerald-600" /> Souvenir Diserahkan ✓
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleManualHandout(guest)}
                                  disabled={isHandingOutId === guest.id}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-md flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
                                >
                                  {isHandingOutId === guest.id ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Gift className="w-3.5 h-3.5" />
                                  )}
                                  <span>Serahkan Souvenir</span>
                                </button>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Sudah Hadir
                              </span>
                            )
                          ) : (
                            /* Guest is NOT yet attended */
                            stationMode === 'souvenir_only' ? (
                              <div className="flex items-center gap-1.5" title="Tamu harus check-in di pintu gate terlebih dahulu sebelum dapat mengambil souvenir">
                                <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md">
                                  ⛔ Wajib Check-in Gate Dulu
                                </span>
                              </div>
                            ) : stationMode === 'checkin_souvenir' ? (
                              <button
                                onClick={() => handleManualGuestCheckIn(guest)}
                                disabled={isManualCheckingInId === guest.id || isProcessing}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-md flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
                              >
                                {isManualCheckingInId === guest.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Gift className="w-3.5 h-3.5" />
                                )}
                                <span>Check-In & Souvenir</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleManualGuestCheckIn(guest)}
                                disabled={isManualCheckingInId === guest.id || isProcessing}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
                              >
                                {isManualCheckingInId === guest.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5" />
                                )}
                                <span>Check-In Sekarang</span>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Special Feature for "Khusus Meja Souvenir": Waiting Queue & 1-Click Handout */}
          {stationMode === 'souvenir_only' && (
            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-2xs border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2.5 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    Antrean Tamu Menunggu Souvenir
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tamu yang sudah check-in di gate tetapi belum mengambil souvenir ({waitingGuests.length} orang)
                  </p>
                </div>
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={waitingSearch}
                    onChange={e => setWaitingSearch(e.target.value)}
                    placeholder="Cari nama atau tiket..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                  />
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {waitingGuests.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <PackageCheck className="w-7 h-7 mx-auto opacity-40 mb-1.5" />
                    <p className="text-xs font-medium">Tidak ada antrean tamu menunggu souvenir.</p>
                    <p className="text-[10px] text-slate-400">Semua tamu yang hadir sudah menerima souvenir atau belum ada yang hadir di gate.</p>
                  </div>
                ) : (
                  waitingGuests.slice(0, 50).map(guest => {
                    const attendedDate = guest.attendedAt ? parseFirestoreDate(guest.attendedAt) : null;
                    const timeStr = attendedDate ? attendedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';

                    return (
                      <div 
                        key={guest.id} 
                        className="p-2.5 bg-slate-50 hover:bg-emerald-50/50 rounded-md border border-slate-200/80 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate">{guest.name}</span>
                            {guest.category && (
                              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded">
                                {guest.category}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Kode: <span className="font-mono font-medium">{guest.ticketCode || '-'}</span> • Masuk gate: {timeStr}
                          </p>
                        </div>

                        <button
                          onClick={() => handleManualHandout(guest)}
                          disabled={isHandingOutId === guest.id}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isHandingOutId === guest.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Gift className="w-3.5 h-3.5" />
                          )}
                          <span>Serahkan Souvenir</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live Feed Column (1 Col) - Differentiated per POS Mode */}
        <div className="bg-white p-4 sm:p-5 rounded-lg shadow-2xs border border-slate-200 flex flex-col h-full">
          {/* Header of Feed */}
          {stationMode === 'checkin' && (
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  Riwayat Masuk Gate
                </h3>
                <p className="text-[11px] text-slate-400">Tamu yang baru saja check-in</p>
              </div>
              <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                Gate Only
              </span>
            </div>
          )}

          {stationMode === 'checkin_souvenir' && (
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-purple-600" />
                  Riwayat Check-In & Souvenir
                </h3>
                <p className="text-[11px] text-slate-400">Meja terpadu check-in + serah fisik</p>
              </div>
              <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                Gate + Souvenir
              </span>
            </div>
          )}

          {stationMode === 'souvenir_only' && (
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  Log Serah Souvenir Loket
                </h3>
                <p className="text-[11px] text-slate-400">Catatan penukaran fisik real-time</p>
              </div>
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                Loket Souvenir
              </span>
            </div>
          )}

          {/* Search Bar for History Feed */}
          <div className="relative mb-2.5">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder={
                stationMode === 'souvenir_only'
                  ? 'Cari nama penerima / tiket...'
                  : 'Cari riwayat scan / nama / meja...'
              }
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white text-slate-800 placeholder:text-slate-400 transition-all shadow-2xs"
            />
            {historySearch && (
              <button
                onClick={() => setHistorySearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Hapus filter pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Feed Content */}
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[460px] pr-1">
            {/* Mode 1: Check-in Saja Feed */}
            {stationMode === 'checkin' && (
              historySearch.trim() ? (
                (() => {
                  const q = historySearch.toLowerCase().trim();
                  const matched = allGuests.filter(g =>
                    (g.name || '').toLowerCase().includes(q) ||
                    (g.ticketCode || '').toLowerCase().includes(q) ||
                    (g.tableNumber || '').toLowerCase().includes(q) ||
                    (g.category || '').toLowerCase().includes(q)
                  );
                  const attendedMatches = matched.filter(g => g.attended);
                  const unattendedMatches = matched.filter(g => !g.attended);

                  if (matched.length === 0) {
                    return (
                      <div className="text-center py-10 text-slate-400">
                        <Search className="w-7 h-7 mx-auto opacity-35 mb-1.5" />
                        <p className="text-xs font-semibold text-slate-700">Tidak ditemukan</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Tamu "{historySearch}" belum ada di riwayat maupun daftar undangan.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      <div className="text-[11px] bg-slate-100/80 px-2.5 py-1 rounded-md text-slate-600 flex items-center justify-between">
                        <span>
                          Ditemukan: <strong className="text-emerald-700">{attendedMatches.length} sudah scan</strong>, <strong className="text-amber-700">{unattendedMatches.length} belum scan</strong>
                        </span>
                        <button
                          onClick={() => setHistorySearch('')}
                          className="text-indigo-600 hover:underline font-semibold cursor-pointer text-[10px]"
                        >
                          Reset
                        </button>
                      </div>

                      {/* Attended (Sudah Scan) */}
                      {attendedMatches.map((guest, idx) => {
                        const attendedDate = guest.attendedAt ? parseFirestoreDate(guest.attendedAt) : null;
                        const timeStr = attendedDate ? attendedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                        const isManual = guest.checkInMethod === 'manual';
                        return (
                          <div key={guest.id || idx} className="p-2.5 bg-emerald-50/40 hover:bg-emerald-50 rounded-md border border-emerald-200/80 transition-colors flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{guest.name}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                {guest.category && (
                                  <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                                    {guest.category}
                                  </span>
                                )}
                                {guest.tableNumber && (
                                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                    Meja {guest.tableNumber}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {isManual ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                    <Keyboard className="w-2.5 h-2.5 text-amber-600" /> Manual
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded">
                                    <QrCode className="w-2.5 h-2.5 text-sky-600" /> Scan QR
                                  </span>
                                )}
                                {guest.checkInStaff && (
                                  <span className="text-[10px] text-slate-400 truncate">
                                    Petugas: <span className="font-medium text-slate-600">{guest.checkInStaff}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <span className="text-[11px] font-mono font-medium text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
                                {timeStr}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                                isManual 
                                  ? 'text-amber-800 bg-amber-100/80 border-amber-200' 
                                  : 'text-emerald-800 bg-emerald-100 border border-emerald-200'
                              }`}>
                                <CheckCircle2 className={`w-2.5 h-2.5 ${isManual ? 'text-amber-600' : 'text-emerald-600'}`} />
                                {isManual ? 'Check-In Manual' : 'Sudah Scan'}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Unattended (Terdaftar tetapi Belum Scan) */}
                      {unattendedMatches.length > 0 && (
                        <div className="pt-2">
                          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Terdaftar Namun Belum Scan ({unattendedMatches.length}):
                          </p>
                          <div className="space-y-1.5">
                            {unattendedMatches.map((guest, idx) => (
                              <div key={guest.id || idx} className="p-2 bg-amber-50/50 rounded-md border border-amber-200/70 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">{guest.name}</p>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                    {guest.category && <span>{guest.category}</span>}
                                    {guest.tableNumber && <span>• Meja {guest.tableNumber}</span>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleManualGuestCheckIn(guest)}
                                  disabled={isManualCheckingInId === guest.id}
                                  className="shrink-0 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded flex items-center gap-1 shadow-2xs cursor-pointer disabled:opacity-50"
                                >
                                  {isManualCheckingInId === guest.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                  <span>Check-In</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : recentScans.filter(g => g.attended).length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock className="w-8 h-8 mx-auto opacity-40 mb-2" />
                  <p className="text-xs font-medium">Belum ada tamu yang check-in di gate.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Daftar tamu yang masuk pintu acara akan muncul di sini secara real-time.</p>
                </div>
              ) : (
                recentScans.filter(g => g.attended).map((guest, idx) => {
                  const attendedDate = guest.attendedAt ? parseFirestoreDate(guest.attendedAt) : null;
                  const timeStr = attendedDate ? attendedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                  const isManual = guest.checkInMethod === 'manual';
                  
                  return (
                    <div key={guest.id || idx} className="p-2.5 bg-slate-50 hover:bg-blue-50/40 rounded-md border border-slate-200/80 transition-colors flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{guest.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {guest.category && (
                            <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                              {guest.category}
                            </span>
                          )}
                          <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                            {Math.max(1, Number(guest.pax) || 1)} Orang
                          </span>
                          {guest.session && (
                            <span className="text-[10px] text-slate-500">
                              • {guest.session}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {isManual ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                              <Keyboard className="w-2.5 h-2.5 text-amber-600" /> Manual
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded">
                              <QrCode className="w-2.5 h-2.5 text-sky-600" /> Scan QR
                            </span>
                          )}
                          {guest.checkInStaff && (
                            <span className="text-[10px] text-slate-400 truncate">
                              Petugas: <span className="font-medium text-slate-600">{guest.checkInStaff}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[11px] font-mono font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {timeStr}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                          isManual 
                            ? 'text-amber-800 bg-amber-100/80 border-amber-200' 
                            : 'text-emerald-800 bg-emerald-100 border border-emerald-200'
                        }`}>
                          <CheckCircle2 className={`w-2.5 h-2.5 ${isManual ? 'text-amber-600' : 'text-emerald-600'}`} />
                          {isManual ? 'Check-In Manual' : 'Hadir di Gate'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* Mode 2: Check-in + Souvenir Feed */}
            {stationMode === 'checkin_souvenir' && (
              historySearch.trim() ? (
                (() => {
                  const q = historySearch.toLowerCase().trim();
                  const matched = allGuests.filter(g =>
                    (g.name || '').toLowerCase().includes(q) ||
                    (g.ticketCode || '').toLowerCase().includes(q) ||
                    (g.tableNumber || '').toLowerCase().includes(q) ||
                    (g.category || '').toLowerCase().includes(q)
                  );
                  const attendedMatches = matched.filter(g => g.attended);
                  const unattendedMatches = matched.filter(g => !g.attended);

                  if (matched.length === 0) {
                    return (
                      <div className="text-center py-10 text-slate-400">
                        <Search className="w-7 h-7 mx-auto opacity-35 mb-1.5" />
                        <p className="text-xs font-semibold text-slate-700">Tidak ditemukan</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Tamu "{historySearch}" belum ada di riwayat maupun daftar undangan.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      <div className="text-[11px] bg-slate-100/80 px-2.5 py-1 rounded-md text-slate-600 flex items-center justify-between">
                        <span>
                          Ditemukan: <strong className="text-purple-700">{attendedMatches.length} sudah scan</strong>, <strong className="text-amber-700">{unattendedMatches.length} belum scan</strong>
                        </span>
                        <button
                          onClick={() => setHistorySearch('')}
                          className="text-purple-600 hover:underline font-semibold cursor-pointer text-[10px]"
                        >
                          Reset
                        </button>
                      </div>

                      {/* Attended */}
                      {attendedMatches.map((guest, idx) => {
                        const attendedDate = guest.attendedAt ? parseFirestoreDate(guest.attendedAt) : null;
                        const timeStr = attendedDate ? attendedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                        return (
                          <div key={guest.id || idx} className="p-2.5 bg-purple-50/40 hover:bg-purple-50 rounded-md border border-purple-200/80 transition-colors flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{guest.name}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                {guest.category && (
                                  <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-100">
                                    {guest.category}
                                  </span>
                                )}
                                {guest.ticketCode && (
                                  <span className="text-[10px] font-mono text-slate-500">
                                    {guest.ticketCode}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {guest.checkInMethod === 'manual' ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                    <Keyboard className="w-2.5 h-2.5 text-amber-600" /> Manual
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded">
                                    <QrCode className="w-2.5 h-2.5 text-sky-600" /> Scan QR
                                  </span>
                                )}
                                {(guest.checkInStaff || guest.souvenirTakenBy) && (
                                  <span className="text-[10px] text-slate-400 truncate">
                                    Petugas: <span className="font-medium text-slate-600">{guest.souvenirTakenBy || guest.checkInStaff}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <span className="text-[11px] font-mono font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                                {timeStr}
                              </span>
                              {guest.souvenirTaken ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 truncate max-w-[120px]">
                                  <Gift className="w-2.5 h-2.5 text-emerald-600 shrink-0" /> {guest.souvenirName || 'Souvenir'} ✓
                                </span>
                              ) : (
                                <span className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  Souvenir Dilewati
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Unattended */}
                      {unattendedMatches.length > 0 && (
                        <div className="pt-2">
                          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Belum Check-In ({unattendedMatches.length}):
                          </p>
                          <div className="space-y-1.5">
                            {unattendedMatches.map((guest, idx) => (
                              <div key={guest.id || idx} className="p-2 bg-amber-50/50 rounded-md border border-amber-200/70 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">{guest.name}</p>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                    {guest.category && <span>{guest.category}</span>}
                                    {guest.tableNumber && <span>• Meja {guest.tableNumber}</span>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleManualGuestCheckIn(guest)}
                                  disabled={isManualCheckingInId === guest.id}
                                  className="shrink-0 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded flex items-center gap-1 shadow-2xs cursor-pointer disabled:opacity-50"
                                >
                                  {isManualCheckingInId === guest.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                                  <span>Check-In & Souvenir</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : recentScans.filter(g => g.attended).length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Gift className="w-8 h-8 mx-auto opacity-40 mb-2" />
                  <p className="text-xs font-medium">Belum ada scan terpadu.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tamu yang check-in dan menerima souvenir akan muncul di sini.</p>
                </div>
              ) : (
                recentScans.filter(g => g.attended).map((guest, idx) => {
                  const attendedDate = guest.attendedAt ? parseFirestoreDate(guest.attendedAt) : null;
                  const timeStr = attendedDate ? attendedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                  
                  return (
                    <div key={guest.id || idx} className="p-2.5 bg-slate-50 hover:bg-purple-50/40 rounded-md border border-slate-200/80 transition-colors flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{guest.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {guest.category && (
                            <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-100">
                              {guest.category}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-500">
                            {guest.ticketCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {guest.checkInMethod === 'manual' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                              <Keyboard className="w-2.5 h-2.5 text-amber-600" /> Manual
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded">
                              <QrCode className="w-2.5 h-2.5 text-sky-600" /> Scan QR
                            </span>
                          )}
                          {(guest.checkInStaff || guest.souvenirTakenBy) && (
                            <span className="text-[10px] text-slate-400 truncate">
                              Petugas: <span className="font-medium text-slate-600">{guest.souvenirTakenBy || guest.checkInStaff}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[11px] font-mono font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          {timeStr}
                        </span>
                        {guest.souvenirTaken ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 truncate max-w-[120px]">
                            <Gift className="w-2.5 h-2.5 text-emerald-600 shrink-0" /> {guest.souvenirName || 'Souvenir'} ✓
                          </span>
                        ) : (
                          <span className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Souvenir Dilewati
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* Mode 3: Khusus Meja Souvenir Feed (Loads from Souvenir Logs) */}
            {stationMode === 'souvenir_only' && (
              historySearch.trim() ? (
                (() => {
                  const q = historySearch.toLowerCase().trim();
                  const matchedLogs = souvenirLogs.filter(log =>
                    (log.guestName || '').toLowerCase().includes(q) ||
                    (log.ticketCode || '').toLowerCase().includes(q) ||
                    (log.souvenirName || '').toLowerCase().includes(q) ||
                    (log.performedBy || '').toLowerCase().includes(q)
                  );
                  const matchedGuests = allGuests.filter(g =>
                    (g.name || '').toLowerCase().includes(q) ||
                    (g.ticketCode || '').toLowerCase().includes(q) ||
                    (g.tableNumber || '').toLowerCase().includes(q) ||
                    (g.category || '').toLowerCase().includes(q)
                  );
                  const waitingMatched = matchedGuests.filter(g => g.attended && !g.souvenirTaken && !souvenirStorage.isGuestTaken(eventId || '', g.id || ''));
                  const unAttendedMatched = matchedGuests.filter(g => !g.attended);

                  if (matchedLogs.length === 0 && waitingMatched.length === 0 && unAttendedMatched.length === 0) {
                    return (
                      <div className="text-center py-10 text-slate-400">
                        <Search className="w-7 h-7 mx-auto opacity-35 mb-1.5" />
                        <p className="text-xs font-semibold text-slate-700">Tidak ditemukan</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Tidak ada catatan penyerahan atau tamu cocok dengan "{historySearch}".
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      <div className="text-[11px] bg-slate-100/80 px-2.5 py-1 rounded-md text-slate-600 flex items-center justify-between">
                        <span>
                          Ditemukan: <strong className="text-emerald-700">{matchedLogs.length} diserahkan</strong>, <strong className="text-amber-700">{waitingMatched.length} antre</strong>
                        </span>
                        <button
                          onClick={() => setHistorySearch('')}
                          className="text-emerald-700 hover:underline font-semibold cursor-pointer text-[10px]"
                        >
                          Reset
                        </button>
                      </div>

                      {/* Sudah diserahkan */}
                      {matchedLogs.map((log, idx) => {
                        const logDate = log.timestamp ? parseFirestoreDate(log.timestamp) : null;
                        const timeStr = logDate ? logDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                        const isReturn = log.action === 'RETURN';
                        return (
                          <div key={log.id || idx} className={`p-2.5 rounded-md border transition-colors flex items-center justify-between gap-3 ${isReturn ? 'bg-rose-50/40 border-rose-200/80' : 'bg-emerald-50/40 hover:bg-emerald-50 border-emerald-200/80'}`}>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{log.guestName}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100 truncate max-w-[140px]">
                                  🎁 {log.souvenirName}
                                </span>
                                {log.batchCode && (
                                  <span className="text-[9px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                    Batch: {log.batchCode}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Petugas: {log.performedBy || 'Loket Souvenir'}
                              </p>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                {timeStr}
                              </span>
                              {isReturn ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">
                                  <RotateCcw className="w-2.5 h-2.5 text-rose-600" /> Batal (+1)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                                  <CheckCircle className="w-2.5 h-2.5 text-emerald-600" /> Diserahkan
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Antrean Menunggu Souvenir (Sudah di gate tapi belum ambil) */}
                      {waitingMatched.length > 0 && (
                        <div className="pt-2">
                          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                            Hadir di Gate • Belum Ambil Souvenir ({waitingMatched.length}):
                          </p>
                          <div className="space-y-1.5">
                            {waitingMatched.map((g, idx) => (
                              <div key={g.id || idx} className="p-2 bg-amber-50/50 rounded-md border border-amber-200/70 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">{g.name}</p>
                                  <p className="text-[10px] text-slate-500">
                                    {g.category || 'Tamu'} • Tiket: {g.ticketCode || '-'}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleManualHandout(g)}
                                  disabled={isHandingOutId === g.id}
                                  className="shrink-0 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded flex items-center gap-1 shadow-2xs cursor-pointer disabled:opacity-50"
                                >
                                  {isHandingOutId === g.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                                  <span>Serahkan</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Belum Check-in di Gate (Wajib Gate Dulu) */}
                      {unAttendedMatched.length > 0 && (
                        <div className="pt-2">
                          <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            Belum Check-In di Gate ({unAttendedMatched.length}):
                          </p>
                          <div className="space-y-1.5">
                            {unAttendedMatched.map((g, idx) => (
                              <div key={g.id || idx} className="p-2 bg-rose-50/40 rounded-md border border-rose-200/60 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">{g.name}</p>
                                  <p className="text-[10px] text-slate-500">{g.category || 'Tamu'}</p>
                                </div>
                                <span className="text-[9px] font-semibold text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded border border-rose-200 shrink-0">
                                  ⛔ Wajib Check-In Gate Dulu
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : souvenirLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <PackageCheck className="w-8 h-8 mx-auto opacity-40 mb-2" />
                  <p className="text-xs font-medium">Belum ada penyerahan souvenir.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tamu yang menukarkan tiket di loket ini akan tercatat otomatis di sini.</p>
                </div>
              ) : (
                souvenirLogs.slice(0, 15).map((log, idx) => {
                  const logDate = log.timestamp ? parseFirestoreDate(log.timestamp) : null;
                  const timeStr = logDate ? logDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                  const isReturn = log.action === 'RETURN';
                  
                  return (
                    <div key={log.id || idx} className={`p-2.5 rounded-md border transition-colors flex items-center justify-between gap-3 ${isReturn ? 'bg-rose-50/40 border-rose-200/80' : 'bg-slate-50 hover:bg-emerald-50/40 border-slate-200/80'}`}>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{log.guestName}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100 truncate max-w-[140px]">
                            🎁 {log.souvenirName}
                          </span>
                          {log.batchCode && (
                            <span className="text-[9px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                              Batch: {log.batchCode}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Petugas: {log.performedBy || 'Loket Souvenir'}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {timeStr}
                        </span>
                        {isReturn ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">
                            <RotateCcw className="w-2.5 h-2.5 text-rose-600" /> Batal (+1)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                            <CheckCircle className="w-2.5 h-2.5 text-emerald-600" /> Diserahkan
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 mt-3 flex justify-between items-center text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Sinkronisasi otomatis
            </span>
            <Link 
              to={`/auth/login/events/${eventId}`}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Lihat Semua »
            </Link>
          </div>
        </div>
      </div>

      {/* Dedicated High-Priority Alert Popup for VIP & VVIP Guests - Styled with Guestly Signature Theme */}
      {vipModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            setVipModal(null);
            inputRef.current?.focus();
          }}
        >
          <div 
            className={`relative w-full max-w-md rounded-2xl sm:rounded-3xl p-6 sm:p-7 text-center border transition-all duration-200 transform scale-100 shadow-2xl bg-white ${
              vipModal.isVvip 
                ? 'border-amber-300 ring-4 ring-amber-200/40 bg-gradient-to-b from-amber-50/40 via-white to-white' 
                : 'border-rose-200 ring-4 ring-rose-100/60 bg-gradient-to-b from-rose-50/40 via-white to-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Guestly Brand Header & Close Button */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-[#8C3A50] text-[11px] font-bold tracking-wider uppercase">
                <Sparkles className="w-3.5 h-3.5 text-[#8C3A50]" />
                <span>Guestly • Priority Access</span>
              </div>
              <button
                onClick={() => {
                  setVipModal(null);
                  inputRef.current?.focus();
                }}
                className="p-1.5 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Tutup (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Glowing Icon Header */}
            <div className="flex justify-center mb-3">
              <div className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full flex items-center justify-center relative shadow-lg ${
                vipModal.isVvip 
                  ? 'bg-gradient-to-tr from-[#8C3A50] via-amber-500 to-amber-300 text-white shadow-amber-500/25 ring-4 ring-amber-200/50' 
                  : 'bg-gradient-to-tr from-[#722B3E] via-[#8C3A50] to-[#C25972] text-white shadow-[#8C3A50]/30 ring-4 ring-rose-200/60'
              }`}>
                {vipModal.isVvip ? (
                  <Crown className="w-9 h-9 sm:w-10 sm:h-10 animate-pulse text-white drop-shadow-md" />
                ) : (
                  <Star className="w-9 h-9 sm:w-10 sm:h-10 animate-pulse text-white drop-shadow-md" />
                )}
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8C3A50] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#8C3A50]"></span>
                </span>
              </div>
            </div>

            {/* VIP / VVIP Badge */}
            <div className="mb-2">
              <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-2xs ${
                vipModal.isVvip 
                  ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                  : 'bg-rose-50 text-[#8C3A50] border border-rose-200'
              }`}>
                {vipModal.isVvip ? '👑 TAMU KEHORMATAN VVIP' : '⭐ TAMU KEHORMATAN VIP'}
              </span>
            </div>

            {/* Guest Name */}
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2 mb-1 break-words">
              {vipModal.name}
            </h2>

            {/* Specific Category if detailed */}
            {vipModal.category && (
              <p className="text-xs font-medium text-slate-600 mb-3">
                Kategori: <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">{vipModal.category}</span>
              </p>
            )}

            {/* Table & Pax Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
              {vipModal.tableNumber && (
                <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-2xs">
                  <span>🪑</span>
                  <span>Meja: <span className="font-extrabold text-amber-950">{vipModal.tableNumber}</span></span>
                </div>
              )}
              {vipModal.pax && (
                <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold text-xs sm:text-sm flex items-center gap-1.5 shadow-2xs">
                  <Users className="w-3.5 h-3.5 text-[#8C3A50]" />
                  <span>{vipModal.pax} Tamu</span>
                </div>
              )}
              {vipModal.ticketCode && (
                <div className="px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[11px] shadow-2xs">
                  {vipModal.ticketCode}
                </div>
              )}
            </div>

            {/* Field Crew Brief Guidance */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left mb-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-rose-50 text-[#8C3A50] flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3" />
                </span>
                <p className="text-xs font-bold text-slate-900">Instruksi Khusus Petugas Front Gate & Usher</p>
              </div>
              <p className="text-[12px] text-slate-600 leading-relaxed pl-7">
                Sambut tamu dengan hormat & ramah. Berikan pendampingan langsung menuju meja atau area kehormatan.
              </p>
            </div>

            {/* Acknowledge Button styled with Guestly Burgundy */}
            <button
              onClick={() => {
                setVipModal(null);
                inputRef.current?.focus();
              }}
              className="w-full py-3 px-5 rounded-xl font-bold text-sm text-white bg-[#8C3A50] hover:bg-[#722B3E] border border-[#8C3A50] shadow-md shadow-[#8C3A50]/25 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <span>Mengerti & Lanjutkan Scan</span>
              <span className="text-xs font-medium bg-white/25 px-2 py-0.5 rounded-full font-mono text-white">
                ({vipCountdown}s)
              </span>
            </button>
            <p className="text-[11px] text-slate-500 mt-2 font-medium">
              Auto-close {vipCountdown} dtk • Tekan <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-800">Enter</kbd> atau <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-800">Esc</kbd> untuk lanjut
            </p>
          </div>
        </div>
      )}

      {/* Offline Data Not Prepared Warning Modal (Guestly Styled) */}
      {showOfflineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-center animate-in zoom-in-95 duration-200 relative">
            <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-3.5 text-amber-600 shadow-2xs">
              <CloudDownload className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">
              Data Offline Belum Disiapkan
            </h3>
            
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Perangkat ini belum menyimpan cadangan data tamu ke memori browser. Sangat disarankan untuk menyiapkan data offline sekarang agar scanner dapat memindai tiket secara instan <strong>(&lt; 0,1 detik)</strong> tanpa bergantung pada stabilitas sinyal internet gedung.
            </p>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 my-4 text-left">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-500">Status Jaringan:</span>
                <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {isOnline ? 'Online (Siap Diunduh)' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Total Tamu Acara:</span>
                <span className="font-bold text-slate-800">
                  {stats.total > 0 ? `${stats.total.toLocaleString('id-ID')} Tamu Terdaftar` : 'Memuat data...'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 mt-5">
              <button
                onClick={async () => {
                  await handlePrepareOfflineData();
                  if (eventId) {
                    sessionStorage.setItem(`offline_modal_dismissed_${eventId}`, 'true');
                  }
                  setShowOfflineModal(false);
                }}
                disabled={isPreparingOffline || !isOnline}
                className="w-full sm:flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <CloudDownload className={`w-4 h-4 ${isPreparingOffline ? 'animate-bounce' : ''}`} />
                <span>{isPreparingOffline ? 'Menyimpan ke Memori...' : 'Siapkan Data Sekarang'}</span>
              </button>

              <button
                onClick={() => {
                  if (eventId) {
                    sessionStorage.setItem(`offline_modal_dismissed_${eventId}`, 'true');
                  }
                  setShowOfflineModal(false);
                }}
                disabled={isPreparingOffline}
                className="w-full sm:w-auto py-2.5 px-4 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Lanjut Online Saja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Stress Test Tool Modal - Exclusively for Super Admin */}
      {eventId && appUser?.role === 'superadmin' && (
        <ScannerStressTestModal
          isOpen={isStressTestOpen}
          onClose={() => setIsStressTestOpen(false)}
          eventId={eventId}
          onRefreshStats={fetchStats}
        />
      )}

      {/* Walk-In Guest Registration Modal */}
      <Modal
        isOpen={isWalkInModalOpen}
        onClose={() => {
          if (!isSavingWalkIn) {
            setIsWalkInModalOpen(false);
          }
        }}
        title="Tambah Tamu Walk-In"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmitWalkInGuest} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pangkat / Jabatan</label>
              <input
                type="text"
                value={walkInTitle}
                onChange={(e) => setWalkInTitle(e.target.value)}
                placeholder="Bpk. / Ibu / Dr."
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Tamu <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder="Nama lengkap tamu"
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            {(walkInTitle.trim() || walkInName.trim()) && (
              <div className="sm:col-span-3 px-3 py-2 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center justify-between text-xs">
                <span className="text-slate-600">Nama Tercatat:</span>
                <span className="font-semibold text-indigo-900">
                  {formatGuestFullName(walkInName, walkInTitle)}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">No HP / WhatsApp</label>
              <input
                type="text"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
                placeholder="08123456789"
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat / Instansi</label>
              <input
                type="text"
                value={walkInAddress}
                onChange={(e) => setWalkInAddress(e.target.value)}
                placeholder="Kota / Asal instansi"
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori Tamu</label>
              <select
                value={walkInCategory}
                onChange={(e) => setWalkInCategory(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">-- Pilih Kategori --</option>
                {(eventData?.guestCategories && eventData.guestCategories.length > 0
                  ? eventData.guestCategories
                  : ['Reguler', 'VIP', 'VVIP', 'Keluarga']
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Undangan</label>
              <select
                value={walkInInvitationType}
                onChange={(e) => setWalkInInvitationType(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">-- Pilih Tipe --</option>
                {(eventData?.invitationTypes && eventData.invitationTypes.length > 0
                  ? eventData.invitationTypes
                  : ['Digital', 'Cetak', 'Walk-In']
                ).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {eventData?.sessions && eventData.sessions.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sesi Acara</label>
                <select
                  value={walkInSession}
                  onChange={(e) => setWalkInSession(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="">-- Pilih Sesi --</option>
                  {eventData.sessions.map((ses) => (
                    <option key={ses} value={ses}>
                      {ses}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Orang (Pax)</label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  required
                  value={walkInPax}
                  onChange={(e) => setWalkInPax(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => {
                    const num = parseInt(walkInPax, 10);
                    if (!num || num < 1) setWalkInPax('1');
                  }}
                  className="w-full h-9 pl-3 pr-14 text-sm tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-500">
                  Orang
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isSavingWalkIn}
              onClick={() => setIsWalkInModalOpen(false)}
              className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSavingWalkIn}
              className="h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSavingWalkIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>Simpan Tamu</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Mandatory Staff Confirmation Popup before saving Walk-In Guest */}
      <StaffGuestConfirmationModal
        isOpen={Boolean(pendingStaffWalkIn)}
        guestName={pendingStaffWalkIn?.displayName || ''}
        guestPax={pendingStaffWalkIn?.pax}
        guestCategory={pendingStaffWalkIn?.category}
        staffName={appUser?.name || currentOperator}
        isSubmitting={isSavingWalkIn}
        onCancel={() => {
          if (!isSavingWalkIn) setPendingStaffWalkIn(null);
        }}
        onConfirm={async (source, note) => {
          if (!pendingStaffWalkIn) return;
          await persistWalkInGuest(pendingStaffWalkIn.payload, { source, note });
        }}
      />
    </div>
  );
}
