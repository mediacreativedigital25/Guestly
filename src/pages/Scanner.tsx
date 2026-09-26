import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { doc, serverTimestamp, collection, query, where, getDocs, limit, runTransaction, onSnapshot, orderBy, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { supabaseDb } from '../lib/supabaseDb';
import { parseFirestoreDate, canUserAccessEvent, getOperatorLabel, getRoleLabel } from '../lib/utils';
import { useAuth } from '../AuthContext';
import { Guest, SouvenirItem, SouvenirLog } from '../types';
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
  Info
} from 'lucide-react';
import ScannerStressTestModal from '../components/ScannerStressTestModal';
import { souvenirStorage } from '../services/souvenirStorage';

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
  const isStaffCheckinOnly = appUser?.role === 'staff' && appUser?.staffType === 'checkin';
  const isStaffSouvenirOnly = appUser?.role === 'staff' && appUser?.staffType === 'souvenir';

  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'error';
    message: string;
    guestName?: string;
    category?: string;
    souvenirNotice?: string;
    operatorName?: string;
  } | null>(null);
  const [scanMode, setScanMode] = useState<'camera' | 'tool'>('camera');
  const [manualInput, setManualInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Real-time tracking & Data lists
  const [recentScans, setRecentScans] = useState<Guest[]>([]);
  const [allGuests, setAllGuests] = useState<Guest[]>([]);
  const [souvenirLogs, setSouvenirLogs] = useState<SouvenirLog[]>([]);
  const [stats, setStats] = useState({ total: 0, attended: 0, souvenirTaken: 0 });
  const [isStressTestOpen, setIsStressTestOpen] = useState(false);
  
  // Souvenir Station Integration
  const [stationMode, setStationMode] = useState<'checkin' | 'checkin_souvenir' | 'souvenir_only'>(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'souvenir') return 'souvenir_only';
    if (modeParam === 'checkin') return 'checkin';
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
    }
  }, [isStaffSouvenirOnly, isStaffCheckinOnly, searchParams]);

  // Waiting Guests Search & Manual Handout
  const [waitingSearch, setWaitingSearch] = useState('');
  const [isHandingOutId, setIsHandingOutId] = useState<string | null>(null);

  const isProcessingRef = useRef(false);
  const lastScannedCodeRef = useRef<string | null>(null);

  const applyGuestsListToState = (rawList: Guest[]) => {
    if (!eventId) return;
    const merged = souvenirStorage.mergeGuestsWithSouvenirs(eventId, rawList);
    setAllGuests(merged);
    setStats({
      total: merged.length,
      attended: merged.filter(g => g.attended).length,
      souvenirTaken: merged.filter(g => g.souvenirTaken).length
    });

    const attendedOrSouvenir = merged
      .filter(g => g.attended || g.souvenirTaken)
      .sort((a, b) => {
        const dA = parseFirestoreDate(a.attendedAt || a.souvenirTakenAt || a.updatedAt)?.getTime() || 0;
        const dB = parseFirestoreDate(b.attendedAt || b.souvenirTakenAt || b.updatedAt)?.getTime() || 0;
        return dB - dA;
      })
      .slice(0, 15);
    setRecentScans(attendedOrSouvenir);

    const updatedSouvenirs = souvenirStorage.getSouvenirs(eventId, merged);
    setSouvenirs(updatedSouvenirs);
    if (updatedSouvenirs.length > 0) {
      setSelectedSouvenirId(prev => prev || updatedSouvenirs[0].id!);
    }
    setSouvenirLogs(souvenirStorage.getLogs(eventId));
  };

  const loadAllGuests = async () => {
    if (!eventId) return;
    souvenirStorage.hydrateFromSupabase(eventId, true);
    try {
      const supaList = await supabaseDb.getGuests(eventId);
      if (supaList) {
        applyGuestsListToState(supaList);
        return;
      }
    } catch (supaErr) {
      console.warn("Supabase loadAllGuests fallback:", supaErr);
    }

    try {
      const guestsRef = collection(db, 'events', eventId, 'guests');
      const snap = await getDocs(guestsRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Guest));
      applyGuestsListToState(list);
    } catch (e) {
      console.warn("Failed to load guests list (falling back gracefully):", e);
    }
  };

  const fetchStats = async () => {
    await loadAllGuests();
  };

  // Subscribe to real-time check-ins, souvenirs, and live monitoring heartbeat
  useEffect(() => {
    if (!eventId) return;

    // Initial load
    loadAllGuests();

    // 1. Subscribe via Supabase Realtime (Broadcast + Postgres Changes)
    const unsubRealtime = supabaseDb.subscribeToGuests(eventId, () => {
      loadAllGuests();
    });

    // 2. Listen to local & cross-device compat changes
    const handleCompatChange = (e: any) => {
      const col = e.detail?.collectionName;
      if (!col || col === 'guests' || col === 'settings' || col === 'events') {
        loadAllGuests();
      }
    };

    const handleSouvenirsChanged = (e: any) => {
      if (!e.detail?.eventId || e.detail?.eventId === eventId) {
        loadAllGuests();
      }
    };

    const handleLogsChanged = (e: any) => {
      if (!e.detail?.eventId || e.detail?.eventId === eventId) {
        setSouvenirLogs(souvenirStorage.getLogs(eventId));
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadAllGuests();
      }
    };

    window.addEventListener('supabase-compat-change', handleCompatChange);
    window.addEventListener('guestly_souvenirs_changed', handleSouvenirsChanged);
    window.addEventListener('guestly_souvenir_logs_changed', handleLogsChanged);
    document.addEventListener('visibilitychange', handleVisibility);

    // 3. Guaranteed 3-second real-time monitoring heartbeat when tab is visible
    const liveInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isProcessingRef.current) {
        loadAllGuests();
      }
    }, 3000);

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

  const processTicket = async (decodedText: string) => {
    if (isProcessingRef.current) return;
    
    // Parse the decodedText to handle URLs or raw codes
    let code = decodedText.trim();
    console.log("Scanned QR raw text:", code);
    
    try {
      if (code.startsWith('http')) {
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
      } else if (code.includes('/')) {
        const segments = code.split('/');
        code = segments[segments.length - 1];
      }
    } catch (e) {
      console.warn("Failed to parse URL from QR, using raw text", e);
    }
    
    code = (code || '').toUpperCase();
    console.log("Extracted ticket code:", code);
    
    if (lastScannedCodeRef.current === code) {
       return;
    }
    
    isProcessingRef.current = true;
    setIsProcessing(true);
    setScanResult(null);
    lastScannedCodeRef.current = code;

    try {
      const guestsRef = collection(db, 'events', eventId!, 'guests');
      const q = query(guestsRef, where('ticketCode', '==', code), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        playErrorBuzz();
        setScanResult({ status: 'error', message: `Tiket tidak valid atau tidak terdaftar. (Kode: ${code})`});
      } else {
        const guestDocId = snapshot.docs[0].id;
        const guestDocRef = doc(db, 'events', eventId!, 'guests', guestDocId);

        // Atomic Check-in / Souvenir Handover using Firestore Transaction
        const transactionResult = await runTransaction(db, async (transaction) => {
          const freshSnap = await transaction.get(guestDocRef);
          if (!freshSnap.exists()) {
            throw new Error('GUEST_NOT_FOUND');
          }

          const guestData = freshSnap.data();

          if (stationMode === 'souvenir_only') {
            // LOKET SOUVENIR KHUSUS (Tamu menukarkan tiket di meja souvenir terpisah)
            const isAlreadyTaken = guestData.souvenirTaken || souvenirStorage.isGuestTaken(eventId!, guestDocId);
            if (isAlreadyTaken) {
              const localTaken = souvenirStorage.getGuestTakenInfo(eventId!, guestDocId);
              const error = new Error('ALREADY_TAKEN_SOUVENIR');
              (error as any).souvenirTakenAt = guestData.souvenirTakenAt || localTaken?.takenAt;
              (error as any).guestName = guestData.name;
              (error as any).souvenirName = guestData.souvenirName || localTaken?.souvenirName || 'Souvenir';
              (error as any).souvenirTakenBy = guestData.souvenirTakenBy || localTaken?.takenBy;
              throw error;
            }

            if (!activeSouvenir || !activeSouvenir.id) {
              throw new Error('NO_SOUVENIR_CONFIGURED');
            }

            if ((activeSouvenir.remainingStock || 0) <= 0) {
              throw new Error('OUT_OF_STOCK');
            }

            // Update Guest document in Firestore
            transaction.update(guestDocRef, {
              souvenirTaken: true,
              souvenirTakenAt: serverTimestamp(),
              souvenirId: activeSouvenir.id,
              souvenirName: activeSouvenir.name,
              souvenirQuantity: 1,
              souvenirTakenBy: currentOperator,
              attended: true,
              attendedAt: guestData.attendedAt || serverTimestamp(),
              checkInStaff: guestData.checkInStaff || currentOperator,
              updatedAt: serverTimestamp()
            });

            return { 
              name: guestData.name, 
              category: guestData.category || '', 
              session: guestData.session || '',
              souvenirGiven: true,
              souvenirName: activeSouvenir.name,
              guestDocId,
              mode: 'souvenir_only',
              wasAlreadyAttended: !!guestData.attended
            };

          } else if (stationMode === 'checkin_souvenir') {
            // MEJA RESEPSIONIS GABUNGAN: Check-In + Serahkan Souvenir
            if (guestData.attended) {
              const error = new Error('ALREADY_ATTENDED');
              (error as any).attendedAt = guestData.attendedAt;
              (error as any).guestName = guestData.name;
              (error as any).category = guestData.category;
              (error as any).checkInStaff = guestData.checkInStaff;
              (error as any).souvenirTaken = guestData.souvenirTaken || souvenirStorage.isGuestTaken(eventId!, guestDocId);
              throw error;
            }

            const guestUpdate: any = {
              attended: true,
              attendedAt: serverTimestamp(),
              checkInStaff: currentOperator,
              updatedAt: serverTimestamp()
            };

            let souvenirGiven = false;
            let targetSouvenirName = '';

            const isAlreadyTaken = guestData.souvenirTaken || souvenirStorage.isGuestTaken(eventId!, guestDocId);
            if (activeSouvenir && activeSouvenir.id && !isAlreadyTaken && (activeSouvenir.remainingStock || 0) > 0) {
              guestUpdate.souvenirTaken = true;
              guestUpdate.souvenirTakenAt = serverTimestamp();
              guestUpdate.souvenirId = activeSouvenir.id;
              guestUpdate.souvenirName = activeSouvenir.name;
              guestUpdate.souvenirQuantity = 1;
              guestUpdate.souvenirTakenBy = currentOperator;
              souvenirGiven = true;
              targetSouvenirName = activeSouvenir.name;
            }

            transaction.update(guestDocRef, guestUpdate);

            return { 
              name: guestData.name, 
              category: guestData.category || '', 
              session: guestData.session || '',
              souvenirGiven,
              souvenirName: targetSouvenirName,
              guestDocId,
              mode: 'checkin_souvenir',
              wasAlreadyAttended: false
            };

          } else {
            // CHECK-IN SAJA
            if (guestData.attended) {
              const error = new Error('ALREADY_ATTENDED');
              (error as any).attendedAt = guestData.attendedAt;
              (error as any).guestName = guestData.name;
              (error as any).category = guestData.category;
              (error as any).checkInStaff = guestData.checkInStaff;
              throw error;
            }

            transaction.update(guestDocRef, {
              attended: true,
              attendedAt: serverTimestamp(),
              checkInStaff: currentOperator,
              updatedAt: serverTimestamp()
            });

            return { 
              name: guestData.name, 
              category: guestData.category || '', 
              session: guestData.session || '',
              souvenirGiven: false,
              guestDocId,
              mode: 'checkin',
              wasAlreadyAttended: false
            };
          }
        });

        // Record log and update storage outside transaction
        if (transactionResult.souvenirGiven && activeSouvenir) {
          souvenirStorage.recordGuestTake(eventId!, transactionResult.guestDocId, {
            souvenirId: activeSouvenir.id!,
            souvenirName: activeSouvenir.name,
            takenAt: new Date().toISOString(),
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

          // Refresh inventory & logs state
          const updated = souvenirStorage.getSouvenirs(eventId!);
          setSouvenirs(updated);
          setSouvenirLogs(souvenirStorage.getLogs(eventId!));
        }

        // Sound Feedback:
        if (transactionResult.souvenirGiven) {
          playBeep();
          setTimeout(() => playSouvenirChime(), 140);
        } else {
          playBeep();
        }

        // Update stats precisely according to mode
        if (transactionResult.mode === 'souvenir_only') {
          setStats(prev => ({
            ...prev,
            attended: transactionResult.wasAlreadyAttended ? prev.attended : prev.attended + 1,
            souvenirTaken: prev.souvenirTaken + 1
          }));
        } else if (transactionResult.mode === 'checkin_souvenir') {
          setStats(prev => ({
            ...prev,
            attended: prev.attended + 1,
            souvenirTaken: transactionResult.souvenirGiven ? prev.souvenirTaken + 1 : prev.souvenirTaken
          }));
        } else {
          setStats(prev => ({
            ...prev,
            attended: prev.attended + 1
          }));
        }
        
        let successMessage = `${transactionResult.name} berhasil check-in di gate!`;
        if (transactionResult.mode === 'souvenir_only') {
          successMessage = `🎁 Souvenir "${transactionResult.souvenirName}" berhasil diserahkan kepada ${transactionResult.name}!`;
        } else if (transactionResult.souvenirGiven) {
          successMessage = `✓ ${transactionResult.name} berhasil check-in & 🎁 Souvenir "${transactionResult.souvenirName}" diserahkan!`;
        }

        setScanResult({ 
          status: 'success', 
          message: successMessage,
          guestName: transactionResult.name,
          category: transactionResult.category,
          souvenirNotice: transactionResult.souvenirGiven ? `Souvenir: ${transactionResult.souvenirName}` : undefined,
          operatorName: currentOperator
        });

        // Supabase Realtime Broadcast to Greeting Screen & database update
        supabaseDb.broadcastGuestArrival(eventId!, {
          name: transactionResult.name,
          category: transactionResult.category,
          ticketCode: code,
          session: transactionResult.session,
          attended: true,
          attendedAt: new Date().toISOString()
        });

        // Also sync state into Supabase guests table
        supabaseDb.getGuestByTicket(eventId!, code).then((found) => {
          if (found?.id) {
            supabaseDb.updateGuest(found.id, {
              attended: true,
              attendedAt: new Date().toISOString(),
              checkInStaff: found.checkInStaff || currentOperator,
              souvenirTaken: Boolean(transactionResult.souvenirGiven),
              souvenirName: transactionResult.souvenirName || undefined,
              souvenirTakenBy: transactionResult.souvenirGiven ? currentOperator : undefined
            });
          }
        }).catch(e => console.warn('Supabase guest sync error:', e));

        loadAllGuests();
      }
    } catch (error: any) {
      playErrorBuzz();
      if (error?.message === 'ALREADY_TAKEN_SOUVENIR') {
        const takenDate = parseFirestoreDate(error.souvenirTakenAt);
        const timeFormatted = takenDate 
          ? takenDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : '-';
        const byInfo = error.souvenirTakenBy ? ` (Petugas: ${error.souvenirTakenBy})` : '';
        setScanResult({ 
          status: 'error', 
          message: `⚠️ PERINGATAN: Tamu ${error.guestName ? `atas nama "${error.guestName}" ` : ''}SUDAH PERNAH mengambil souvenir "${error.souvenirName}" pada jam ${timeFormatted}${byInfo}! Penyerahan ditolak untuk mencegah klaim ganda.`,
          guestName: error.guestName,
          operatorName: error.souvenirTakenBy
        });
      } else if (error?.message === 'OUT_OF_STOCK') {
        setScanResult({ 
          status: 'error', 
          message: `⚠️ STOK HABIS: Stok fisik souvenir di sistem sudah habis (0 pcs). Harap tambahkan stok atau pilih souvenir lain.`,
          guestName: error.guestName
        });
      } else if (error?.message === 'NO_SOUVENIR_CONFIGURED') {
        setScanResult({ 
          status: 'error', 
          message: `⚠️ Belum ada jenis souvenir yang dipilih atau didaftarkan pada acara ini.` 
        });
      } else if (error?.message === 'ALREADY_ATTENDED') {
        const attendedDate = parseFirestoreDate(error.attendedAt);
        const dateFormatted = attendedDate 
          ? attendedDate.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
          : '-';
        const byInfo = error.checkInStaff ? ` oleh petugas ${error.checkInStaff}` : '';
        setScanResult({ 
          status: 'error', 
          message: `Tiket ${error.guestName ? `atas nama "${error.guestName}" ` : ''}sudah pernah check-in pada ${dateFormatted}${byInfo}${error.souvenirTaken ? ' (Souvenir sudah diambil)' : ''}.`,
          guestName: error.guestName,
          operatorName: error.checkInStaff
        });
      } else if (error?.message === 'GUEST_NOT_FOUND') {
        setScanResult({ status: 'error', message: `Data tiket tidak ditemukan di database acara.` });
      } else {
        setScanResult({ status: 'error', message: "Terjadi kesalahan sistem saat scan tiket"});
        handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}/guests`);
      }
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      
      setTimeout(() => {
        if (lastScannedCodeRef.current === code) {
          lastScannedCodeRef.current = null;
        }
      }, 2500);
      
      setTimeout(() => setScanResult(null), 5000);
    }
  };

  // 1-Click Handout for Waiting Guests at Souvenir Desk
  const handleManualHandout = async (guest: Guest) => {
    if (!guest.id || !eventId || !activeSouvenir || !activeSouvenir.id) return;
    if ((activeSouvenir.remainingStock || 0) <= 0) {
      playErrorBuzz();
      setScanResult({
        status: 'error',
        message: `⚠️ STOK HABIS: Stok fisik souvenir "${activeSouvenir.name}" sudah habis.`
      });
      return;
    }

    setIsHandingOutId(guest.id);
    try {
      const guestDocRef = doc(db, 'events', eventId, 'guests', guest.id);
      await updateDoc(guestDocRef, {
        souvenirTaken: true,
        souvenirTakenAt: serverTimestamp(),
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        souvenirQuantity: 1,
        souvenirTakenBy: currentOperator,
        attended: true,
        attendedAt: guest.attendedAt || serverTimestamp(),
        checkInStaff: guest.checkInStaff || currentOperator,
        updatedAt: serverTimestamp()
      });

      souvenirStorage.recordGuestTake(eventId, guest.id, {
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        takenAt: new Date().toISOString(),
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
      setScanResult({
        status: 'success',
        message: `🎁 Souvenir "${activeSouvenir.name}" berhasil diserahkan kepada ${guest.name}!`,
        guestName: guest.name,
        category: guest.category,
        souvenirNotice: `Souvenir: ${activeSouvenir.name}`,
        operatorName: currentOperator
      });

      setStats(prev => ({
        ...prev,
        souvenirTaken: prev.souvenirTaken + 1
      }));

      // Refresh inventory and lists
      const updated = souvenirStorage.getSouvenirs(eventId);
      setSouvenirs(updated);
      setSouvenirLogs(souvenirStorage.getLogs(eventId));
      loadAllGuests();
    } catch (e: any) {
      console.warn("Manual handout error, saving locally:", e);
      // Fallback local persistence
      souvenirStorage.recordGuestTake(eventId, guest.id, {
        souvenirId: activeSouvenir.id,
        souvenirName: activeSouvenir.name,
        takenAt: new Date().toISOString(),
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
        notes: 'Penyerahan dicatat secara lokal',
        performedBy: currentOperator
      });
      playSouvenirChime();
      setScanResult({
        status: 'success',
        message: `🎁 Souvenir "${activeSouvenir.name}" berhasil dicatat untuk ${guest.name}!`,
        guestName: guest.name,
        operatorName: currentOperator
      });
      setStats(prev => ({
        ...prev,
        souvenirTaken: prev.souvenirTaken + 1
      }));
      const updated = souvenirStorage.getSouvenirs(eventId);
      setSouvenirs(updated);
      setSouvenirLogs(souvenirStorage.getLogs(eventId));
      loadAllGuests();
    } finally {
      setIsHandingOutId(null);
    }
  };

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let isStarted = false;
    
    if (scanMode === 'camera') {
      const initScanner = () => {
        scanner = new Html5QrcodeScanner(
          "reader",
          { fps: 15, qrbox: {width: 250, height: 250} },
          /* verbose= */ false
        );

        scanner.render(async (decodedText) => {
          if (!isProcessingRef.current) {
              await processTicket(decodedText);
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
  }, [eventId, scanMode, stationMode, selectedSouvenirId]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const code = manualInput.trim();
    setManualInput('');
    if (inputRef.current) {
       inputRef.current.focus();
    }
    await processTicket(code);
    if (inputRef.current) {
        inputRef.current.focus();
    }
  };

  // Calculations for differentiated statistics
  const checkinPercentage = stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : 0;
  const souvenirPercentage = stats.attended > 0 ? Math.round((stats.souvenirTaken / stats.attended) * 100) : 0;
  const waitingForSouvenirCount = Math.max(0, stats.attended - stats.souvenirTaken);
  const unattendedCount = Math.max(0, stats.total - stats.attended);

  // Waiting guests list for Souvenir Desk (guests attended at gate who haven't taken souvenir)
  const waitingGuests = allGuests.filter(g => {
    const isTaken = g.souvenirTaken || souvenirStorage.isGuestTaken(eventId || '', g.id || '');
    return g.attended && !isTaken;
  }).filter(g => {
    if (!waitingSearch.trim()) return true;
    const term = waitingSearch.toLowerCase();
    return (
      (g.name || '').toLowerCase().includes(term) ||
      (g.ticketCode || '').toLowerCase().includes(term) ||
      (g.category || '').toLowerCase().includes(term) ||
      (g.tableNumber || '').toLowerCase().includes(term)
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

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-4 pb-12">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-lg shadow-2xs border border-slate-200 gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={appUser?.role === 'staff' ? '/auth/login/events' : `/auth/login/events/${eventId}`}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors border border-transparent hover:border-slate-200"
            title={appUser?.role === 'staff' ? 'Kembali ke Acara Tugas' : 'Kembali ke Detail Acara'}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-indigo-600" />
              {isStaffCheckinOnly
                ? 'Scanner Kehadiran Tamu (Gate Masuk)'
                : isStaffSouvenirOnly
                ? 'Scanner Loket Penukaran Souvenir'
                : 'Sistem Scanner & POS Meja'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Petugas Aktif: <span className="font-semibold text-indigo-600">{currentOperator}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Sound Test */}
          <button
            onClick={() => { playBeep(); }}
            className="h-8.5 flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer"
            title="Tes Suara Beep Sukses"
          >
            <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> Tes Beep
          </button>

          {/* Stress Test Tool - Only for SuperAdmin / Owner / Admin */}
          {appUser?.role !== 'staff' && (
            <button
              onClick={() => setIsStressTestOpen(true)}
              className="h-8.5 flex items-center gap-1.5 px-3 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md transition-colors cursor-pointer"
              title="Buka Alat Uji Ketahanan & Stress Test Scanner"
            >
              <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" /> Uji Ketahanan
            </button>
          )}

          {/* Open Greeting Screen */}
          {!isStaffSouvenirOnly && (
            <a
              href={`/events/${eventId}/greeting`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8.5 flex items-center gap-1.5 px-3 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors"
              title="Buka Layar Sapa untuk TV/Monitor"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Layar Sapa TV
            </a>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md">
            <button
              onClick={() => setScanMode('camera')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${scanMode === 'camera' ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Camera className="w-3.5 h-3.5" /> Kamera
            </button>
            <button
              onClick={() => setScanMode('tool')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${scanMode === 'tool' ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Keyboard className="w-3.5 h-3.5" /> Alat Scanner
            </button>
          </div>
        </div>
      </div>

      {/* POS Station Mode Selector */}
      <div className="bg-white p-3.5 sm:p-4 rounded-lg shadow-2xs border border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 mr-1">
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              Mode POS:
            </span>
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
          </div>

          {/* Souvenir Stock Indicator (Only shown if mode involves souvenirs) */}
          {stationMode !== 'checkin' && souvenirs.length > 0 && (
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              {souvenirs.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 font-medium">Souvenir:</span>
                  <select
                    value={selectedSouvenirId}
                    onChange={(e) => setSelectedSouvenirId(e.target.value)}
                    className="text-xs font-semibold border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-800 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {souvenirs.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Sisa: {s.remainingStock} pcs)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900 font-medium">
                  <Gift className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{souvenirs[0].name}: <strong>{souvenirs[0].remainingStock}</strong> / {souvenirs[0].initialStock} pcs</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Operational Context Banner */}
        {stationMode === 'checkin' && (
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-md p-2.5 px-3 flex items-center justify-between text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 shrink-0" />
              <span><strong>Pos Resepsionis Masuk:</strong> Khusus verifikasi tiket kedatangan tamu. Souvenir dibagikan di loket terpisah.</span>
            </div>
            <span className="font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] shrink-0 hidden sm:inline-block">Gate Masuk</span>
          </div>
        )}

        {stationMode === 'checkin_souvenir' && (
          <div className="bg-purple-50/70 border border-purple-200/80 rounded-md p-2.5 px-3 flex items-center justify-between text-xs text-purple-900">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-purple-600 shrink-0" />
              <span><strong>Meja All-in-One:</strong> Sekali scan tiket langsung mencatat kehadiran tamu SEKALIGUS penyerahan souvenir fisik.</span>
            </div>
            <span className="font-semibold px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] shrink-0 hidden sm:inline-block">Combo Check-in</span>
          </div>
        )}

        {stationMode === 'souvenir_only' && (
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-md p-2.5 px-3 flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span><strong>Loket Logistik Souvenir:</strong> Booth penukaran souvenir untuk tamu yang sudah masuk acara. Sistem otomatis tolak penyerahan ganda.</span>
            </div>
            <span className="font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] shrink-0 hidden sm:inline-block">Souvenir Desk</span>
          </div>
        )}
      </div>

      {/* Differentiated POS Stats Cards based on Active Tab */}
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
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold">
                {scanResult.status === 'success' 
                  ? (stationMode === 'souvenir_only' ? '✓ Souvenir Berhasil Diserahkan' : '✓ Check-in Berhasil') 
                  : '✕ Verifikasi Gagal'}
              </h4>
              {scanResult.category && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {scanResult.category}
                </span>
              )}
            </div>
            <p className="text-sm font-medium mt-1 leading-relaxed">
              {scanResult.message}
            </p>
            {scanResult.operatorName && (
              <p className="text-xs font-semibold mt-1.5 opacity-85">
                👤 Dicatat oleh petugas: {scanResult.operatorName}
              </p>
            )}
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
                  ? 'Arahkan kamera ke QR tiket tamu untuk menukarkan souvenir fisik.'
                  : stationMode === 'checkin_souvenir'
                  ? 'Arahkan kamera ke QR tiket tamu untuk mencatat check-in sekaligus penyerahan souvenir.'
                  : 'Arahkan kamera ke QR tiket tamu untuk memverifikasi tiket masuk ke gate.'}
              </p>
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
                  <p className="text-xs text-slate-500">Tembakkan laser pemindai USB/Bluetooth langsung ke tiket fisik atau layar ponsel tamu.</p>
                </div>
                
                <form onSubmit={handleManualSubmit}>
                  <input 
                    ref={inputRef}
                    type="text"
                    value={manualInput}
                    onChange={e => setManualInput(e.target.value)}
                    className="w-full text-center text-lg font-mono tracking-widest p-3.5 border border-indigo-300 rounded-md focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all outline-none placeholder:text-slate-400 placeholder:text-sm"
                    placeholder="Scan atau ketik kode tiket..."
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
                  <p className="text-xs text-slate-400">Kursor otomatis standby di kotak input. Tekan Enter setelah mengetik manual.</p>
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
                  waitingGuests.slice(0, 15).map(guest => {
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

          {/* Feed Content */}
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[460px] pr-1">
            {/* Mode 1: Check-in Saja Feed */}
            {stationMode === 'checkin' && (
              recentScans.filter(g => g.attended).length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock className="w-8 h-8 mx-auto opacity-40 mb-2" />
                  <p className="text-xs font-medium">Belum ada tamu yang check-in di gate.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Daftar tamu yang masuk pintu acara akan muncul di sini secara real-time.</p>
                </div>
              ) : (
                recentScans.filter(g => g.attended).map((guest, idx) => {
                  const attendedDate = guest.attendedAt ? parseFirestoreDate(guest.attendedAt) : null;
                  const timeStr = attendedDate ? attendedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                  
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
                        {guest.checkInStaff && (
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            Petugas Scan: <span className="font-medium text-slate-600">{guest.checkInStaff}</span>
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[11px] font-mono font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {timeStr}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Hadir di Gate
                        </span>
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* Mode 2: Check-in + Souvenir Feed */}
            {stationMode === 'checkin_souvenir' && (
              recentScans.filter(g => g.attended).length === 0 ? (
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
                        {(guest.checkInStaff || guest.souvenirTakenBy) && (
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            Petugas: <span className="font-medium text-slate-600">{guest.souvenirTakenBy || guest.checkInStaff}</span>
                          </p>
                        )}
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
              souvenirLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <PackageCheck className="w-8 h-8 mx-auto opacity-40 mb-2" />
                  <p className="text-xs font-medium">Belum ada penyerahan souvenir.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tamu yang menukarkan tiket di loket ini akan tercatat otomatis di sini.</p>
                </div>
              ) : (
                souvenirLogs.slice(0, 15).map((log, idx) => {
                  const logDate = log.timestamp ? parseFirestoreDate(log.timestamp) : null;
                  const timeStr = logDate ? logDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                  
                  return (
                    <div key={log.id || idx} className="p-2.5 bg-slate-50 hover:bg-emerald-50/40 rounded-md border border-slate-200/80 transition-colors flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{log.guestName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100 truncate max-w-[140px]">
                            🎁 {log.souvenirName}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Petugas: {log.performedBy || 'Loket Souvenir'}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {timeStr}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                          <CheckCircle className="w-2.5 h-2.5 text-emerald-600" /> Diserahkan
                        </span>
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

      {/* In-App Stress Test Tool Modal */}
      {eventId && (
        <ScannerStressTestModal
          isOpen={isStressTestOpen}
          onClose={() => setIsStressTestOpen(false)}
          eventId={eventId}
          onRefreshStats={fetchStats}
        />
      )}
    </div>
  );
}
