/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  db,
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
  firebaseConfig,
} from '../firebase';
import { 
  getAuth, 
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { Guest, EventRecord, User, AppUser } from '../types';
import { PACKAGES } from '../constants';
import { toast } from 'sonner';
import { 
  MessageSquare, 
  Trash2, 
  Reply, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  UserIcon, 
  LayoutDashboard, 
  Edit3, 
  Save, 
  X, 
  Download, 
  FileSpreadsheet, 
  QrCode, 
  ExternalLink,
  Search,
  Filter,
  Calendar,
  Globe,
  Gift,
  UserCheck,
  Users,
  Plus,
  ShieldCheck,
  AlertCircle,
  Clock,
  Camera,
  Share2,
  Copy,
  Phone,
  Image,
  Key,
  Lock,
  Upload,
  Loader2,
  RefreshCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { cn, getExpirationDate, getDaysRemaining } from '../lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import Papa from 'papaparse';
import ConfirmModal from './ConfirmModal';
import BarcodeScannerModal from './BarcodeScannerModal';
import { auth, updatePassword } from '../firebase';

interface ClientPanelProps {
  event: EventRecord;
}

export default function ClientPanel({ event: initialEvent }: ClientPanelProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'staff' | 'settings'>('dashboard');
  const [event, setEvent] = useState<EventRecord>(initialEvent);
  const [entries, setEntries] = useState<Guest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [filter, setFilter] = useState<'all' | 'hadir' | 'tidak_hadir' | 'ragu_ragu'>('all');
  const [searchTerm, setSearchTerm] = useState("");

  // Event Editing State
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editEventForm, setEditEventForm] = useState({
    title: initialEvent.title,
    date: initialEvent.date,
    location: initialEvent.location,
    souvenirTypes: initialEvent.souvenirTypes || [],
    invitationUrl: initialEvent.invitationUrl || ''
  });

  // Entry Editing State
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryText, setEditEntryText] = useState("");
  const [isRefreshingEntries, setIsRefreshingEntries] = useState(false);

  const [lastVisibleGuest, setLastVisibleGuest] = useState<any>(null);
  const [hasMoreGuests, setHasMoreGuests] = useState(false);
  const [loadingMoreGuests, setLoadingMoreGuests] = useState(false);


  // Confirmation Modals
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, type: 'guest' | 'staff' } | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Profile Settings State
  const [userData, setUserData] = useState<AppUser | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: ''
  });
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [resellerBrand, setResellerBrand] = useState<{ name: string, logo: string } | null>(null);

  const currentUser = auth.currentUser;


  const handleLoadMoreGuests = async () => {
    if (!event.id || !lastVisibleGuest) return;
    setLoadingMoreGuests(true);
    try {
      const { startAfter, limit } = await import('firebase/firestore');
      const q = query(
        collection(db, 'guests'), 
        where('eventId', '==', event.id),
        orderBy('timestamp', 'desc'),
        startAfter(lastVisibleGuest),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const guestEntries = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Guest[];
      setEntries(prev => [...prev, ...guestEntries]);
      setLastVisibleGuest(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreGuests(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more guests", error);
    } finally {
      setLoadingMoreGuests(false);
    }
  };

  useEffect(() => {
    setEvent(initialEvent);
    setEditEventForm({
      title: initialEvent.title,
      date: initialEvent.date,
      location: initialEvent.location,
      souvenirTypes: initialEvent.souvenirTypes || [],
      invitationUrl: initialEvent.invitationUrl || ''
    });
  }, [initialEvent]);

  const fetchEntries = async (showIndicator = false) => {
    if (!event.id) return;
    if (showIndicator) setIsRefreshingEntries(true);
    try {
      const { limit } = await import('firebase/firestore');
      const q = query(
        collection(db, 'guests'), 
        where('eventId', '==', event.id),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const guestEntries = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Guest[];
      setEntries(guestEntries);
      setLastVisibleGuest(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreGuests(snapshot.docs.length === 50);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'guests');
    } finally {
      setIsLoading(false);
      if (showIndicator) setIsRefreshingEntries(false);
    }
  };



  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const setup = async () => {
      setIsLoading(true);
      await fetchEntries();

      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchEntries();
        }
      }, 30000);
    };

    setup();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchEntries();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [event.id]);

  // Fetch User Data and Reseller Brand


  useEffect(() => {
    if (currentUser) {
      const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (doc) => {
        if (doc.exists()) {
          const data = { uid: doc.id, ...doc.data() as any } as unknown as AppUser;
          setUserData(data);
          setProfileForm({
            name: data.name || '',
            phone: data.phone || ''
          });
        }
      });
      return () => unsubscribe();
    }
  }, [currentUser]);



  useEffect(() => {
    if (event.resellerUid) {
      const fetchResellerBrand = async () => {
        try {
          const resellerDoc = await getDoc(doc(db, 'users', event.resellerUid!));
          if (resellerDoc.exists()) {
            const data = resellerDoc.data();
            if (data.brandName || data.brandLogo) {
              setResellerBrand({
                name: data.brandName || '',
                logo: data.brandLogo || ''
              });
            }
          }
        } catch (error) {
          console.error("Error fetching reseller brand:", error);
        }
      };
      fetchResellerBrand();
    }
  }, [event.resellerUid]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), profileForm);
      toast.success("Profil berhasil diperbarui!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error("Password baru tidak cocok.");
    }
    if (passwordForm.newPassword.length < 6) {
      return toast.error("Password minimal 6 karakter.");
    }
    try {
      await updatePassword(currentUser, passwordForm.newPassword);
      toast.success("Password berhasil diperbarui!");
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        toast.error("Silakan logout dan login kembali untuk mengubah password.");
      } else {
        toast.error("Gagal memperbarui password: " + error.message);
      }
    }
  };

  const handleUpdateEvent = async () => {
    try {
      await updateDoc(doc(db, 'events', event.id), editEventForm);
      setEvent({ ...event, ...editEventForm });
      toast.success("Detail event diperbarui!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${event.id}`);
    }
  };

  const handleUpdateEntry = async (id: string) => {
    if (!editEntryText) return;
    try {
      await updateDoc(doc(db, 'guests', id), {
        message: editEntryText
      });
      toast.success("Pesan tamu diperbarui.");
      setEditingEntryId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `guests/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'guests', id));
      toast.success("Pesan berhasil dihapus.");
    } catch (error) {
      toast.error("Gagal menghapus pesan. Periksa koneksi atau izin Anda.");
      handleFirestoreError(error, OperationType.DELETE, `guests/${id}`);
    }
  };

  const handleReply = async (id: string) => {
    if (!replyText) return;
    try {
      await updateDoc(doc(db, 'guests', id), {
        reply: replyText
      });
      toast.success("Balasan terkirim!");
      setReplyingTo(null);
      setReplyText("");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `guests/${id}`);
    }
  };

  const exportToCSV = () => {
    const dataToExport = entries.map(e => ({
      Nama: e.name,
      Kehadiran: e.attendance.replace('_', ' '),
      Pesan: e.message,
      Balasan: e.reply || '-',
      Tanggal: e.timestamp ? format(e.timestamp.toDate(), 'dd/MM/yyyy HH:mm') : '-'
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `data_tamu_${event.slug}_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Data tamu berhasil diunduh!");
  };

  const stats = {
    total: entries.length,
    hadir: entries.filter(e => e.attendance === 'hadir').length,
    tidak_hadir: entries.filter(e => e.attendance === 'tidak_hadir').length,
    ragu_ragu: entries.filter(e => e.attendance === 'ragu_ragu').length,
    souvenirClaimed: entries.filter(e => e.souvenirClaimed).length,
    checkedIn: entries.filter(e => e.checkInTime).length,
  };

  const daysRemaining = getDaysRemaining(event);
  const isNearExpiry = daysRemaining <= 3 && daysRemaining > 0;
  const isExpired = daysRemaining <= 0 || event.subscriptionStatus === 'expired';

  const handleExtendEvent = () => {
    const message = `Halo Admin Guestly, saya ingin memperpanjang masa aktif event saya:\n\nEvent: ${event.title}\nSlug: ${event.slug}\nEmail: ${currentUser?.email}\n\nMohon bantuannya untuk proses perpanjangan.`;
    window.open(`https://wa.me/6281234567890?text=${encodeURIComponent(message)}`, '_blank'); // Replace with real admin number if available
  };

  const guestLimit = event.maxGuests || 10;
  const progressPercentage = Math.min(100, (stats.total / guestLimit) * 100);

  const handleCheckIn = async (entryId: string) => {
    try {
      await updateDoc(doc(db, 'guests', entryId), {
        checkInTime: serverTimestamp()
      });
      toast.success("Check-in berhasil!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `guests/${entryId}`);
    }
  };

  const handleToggleSouvenir = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'guests', id), {
        souvenirClaimed: !current
      });
      toast.success(!current ? "Souvenir ditandai sudah diambil" : "Souvenir dibatalkan");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `guests/${id}`);
    }
  };

  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', password: '' });
  const [staffList, setStaffList] = useState<User[]>([]);

  // 1. Fetch Staff


  useEffect(() => {
    if (!event.id) return;
    const q = query(collection(db, 'users'), where('eventId', '==', event.id), where('role', '==', 'staff'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStaffList(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() as any } as unknown as AppUser)));
    });
    return () => unsubscribe();
  }, [event.id]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (staffList.length >= event.maxStaff) {
      toast.error(`Maksimal ${event.maxStaff} staff untuk paket ini.`);
      return;
    }

    try {
      const secondaryApp = getApps().find(app => app.name === 'secondary') || initializeApp(firebaseConfig, 'secondary');
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newStaff.email, newStaff.password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, 'users', uid), {
        name: newStaff.name,
        email: newStaff.email,
        role: 'staff',
        eventId: event.id,
        createdAt: new Date()
      });

      await secondaryAuth.signOut();
      setIsAddingStaff(false);
      setNewStaff({ name: '', email: '', password: '' });
      toast.success("Staff berhasil ditambahkan!");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteStaff = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast.success("Staff berhasil dihapus");
    } catch (error) {
      toast.error("Gagal menghapus staff. Periksa koneksi atau izin Anda.");
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  const getInvitationLink = (guestName: string) => {
    if (!(event as any).invitationUrl) return null;
    const baseUrl = (event as any).invitationUrl.endsWith('/') ? (event as any).invitationUrl : `${(event as any).invitationUrl}/`;
    return `${baseUrl}?to=${encodeURIComponent(guestName)}`;
  };

  const handleCopyInvitation = (guestName: string) => {
    const link = getInvitationLink(guestName);
    if (link) {
      navigator.clipboard.writeText(link);
      toast.success(`Link undangan untuk ${guestName} disalin!`);
    } else {
      toast.error("URL Undangan Digital belum diatur di Pengaturan.");
      setActiveTab('settings');
    }
  };

  const handleShareWhatsApp = (guestName: string) => {
    const link = getInvitationLink(guestName);
    if (link) {
      const message = `Halo ${guestName}, kami mengundang Anda untuk hadir di acara kami. Silakan buka link undangan berikut untuk detail dan QR Code check-in: ${link}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      toast.error("URL Undangan Digital belum diatur di Pengaturan.");
      setActiveTab('settings');
    }
  };

  const handleScan = async (decodedText: string) => {
    if (!event.id) return;

    let guestName = decodedText.trim();

    // Try to extract name if it's a URL (common in digital invitations)
    try {
      if (decodedText.startsWith('http')) {
        const url = new URL(decodedText);
        const to = url.searchParams.get('to') || url.searchParams.get('guest') || url.searchParams.get('name');
        if (to) {
          guestName = decodeURIComponent(to).replace(/\+/g, ' ').trim();
        }
      }
    } catch (e) {
      // Not a valid URL, use raw text
    }

    try {
      // 1. Check if guest already exists for this event with the same name
      const q = query(
        collection(db, 'guests'), 
        where('eventId', '==', event.id),
        where('name', '==', guestName)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // Guest exists, update status to hadir
        const guestDoc = snapshot.docs[0];
        const guestData = guestDoc.data();
        
        if (guestData.attendance === 'hadir') {
          toast.info(`${guestName} sudah tercatat hadir.`);
          return;
        }

        await updateDoc(doc(db, 'guests', guestDoc.id), {
          attendance: 'hadir',
          timestamp: serverTimestamp() // Update timestamp to check-in time
        });
        toast.success(`${guestName} berhasil check-in!`);
      } else {
        // Guest doesn't exist, create new entry
        await addDoc(collection(db, 'guests'), {
          name: guestName,
          attendance: 'hadir',
          message: 'Hadir via Scan Barcode',
          eventId: event.id,
          timestamp: serverTimestamp(),
          souvenirClaimed: false
        });
        toast.success(`Tamu baru ${guestName} berhasil ditambahkan & hadir!`);
      }
    } catch (error) {
      console.error("Error processing scan:", error);
      throw new Error("Gagal memproses data scan.");
    }
  };
  const filteredEntries = entries.filter(e => {
    const matchesFilter = filter === 'all' || e.attendance === filter;
    const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         e.message.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const eventPublicUrl = `${window.location.origin}/?event=${event.slug}`;

  return (
    <div className="mx-auto space-y-12 pb-20 font-sans">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-olive text-white rounded-[24px] flex items-center justify-center shadow-lg">
            <LayoutDashboard className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-serif font-bold text-gray-800">{event.title}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <p className="text-xs text-gray-500 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> {event.date} &bull; <Globe className="w-3 h-3" /> {event.location}
              </p>
              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                isExpired ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
              )}>
                <Clock className="w-3 h-3" /> 
                {isExpired ? 'Expired' : 'Active'}
              </div>
              {userData?.package && (
                <span className="bg-olive/10 text-olive px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                  {PACKAGES[userData.package]?.name || 'Custom Package'}
                </span>
              )}
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-medium">
                    Hingga: {format(getExpirationDate(event), 'dd MMM yyyy', { locale: id })}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold",
                    isNearExpiry ? "text-orange-600" : isExpired ? "text-red-600" : "text-green-600"
                  )}>
                    {isExpired ? '(Sudah Berakhir)' : `(${daysRemaining} Hari Lagi)`}
                  </span>
                </div>
                {event.createdAt && (
                  <span className="text-[9px] text-gray-400 italic">
                    Terdaftar: {format(event.createdAt.toDate ? event.createdAt.toDate() : new Date(event.createdAt), 'dd MMM yyyy', { locale: id })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-olive/10 shadow-sm mr-4">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                activeTab === 'dashboard' ? "bg-olive text-white shadow-md" : "text-gray-400 hover:text-olive"
              )}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
            </button>
            {event.maxStaff > 0 && (
              <button 
                onClick={() => setActiveTab('staff')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'staff' ? "bg-olive text-white shadow-md" : "text-gray-400 hover:text-olive"
                )}
              >
                <Users className="w-3.5 h-3.5" /> Staff ({event.maxStaff})
              </button>
            )}
            <button 
              onClick={() => setActiveTab('settings')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                activeTab === 'settings' ? "bg-olive text-white shadow-md" : "text-gray-400 hover:text-olive"
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Pengaturan
            </button>
          </div>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-white border border-olive/10 px-5 py-3 rounded-2xl text-sm font-bold text-olive hover:bg-olive/5 transition-all shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-12">
          {/* Expiration Banner */}
          {isNearExpiry && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-orange-50 border border-orange-200 p-6 rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-lg">Masa Aktif Event Hampir Berakhir</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Event Anda akan berakhir dalam <span className="font-bold text-orange-600">{daysRemaining} hari</span>. 
                    Segera perpanjang masa aktif atau ekspor data tamu Anda sebelum akses ditutup.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
                <button 
                  onClick={exportToCSV}
                  className="flex-1 md:flex-none px-6 py-3 bg-white border border-orange-200 rounded-2xl text-sm font-bold text-orange-600 hover:bg-orange-100 transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Data
                </button>
                <button 
                  onClick={handleExtendEvent}
                  className="flex-1 md:flex-none px-6 py-3 bg-orange-600 rounded-2xl text-sm font-bold text-white hover:bg-orange-700 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" /> Perpanjang Sekarang
                </button>
              </div>
            </motion.div>
          )}

          {isExpired && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-200 p-6 rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-lg">Masa Aktif Event Telah Berakhir</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Akses dashboard Anda telah dibatasi. Silakan ekspor data tamu Anda atau hubungi admin untuk aktivasi kembali.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
                <button 
                  onClick={exportToCSV}
                  className="flex-1 md:flex-none px-6 py-3 bg-white border border-red-200 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-100 transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Data
                </button>
                <button 
                  onClick={handleExtendEvent}
                  className="flex-1 md:flex-none px-6 py-3 bg-red-600 rounded-2xl text-sm font-bold text-white hover:bg-red-700 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" /> Hubungi Admin
                </button>
              </div>
            </motion.div>
          )}

          {/* Stats & QR Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Progress Bar */}
          <div className="bg-white p-8 rounded-[32px] border border-olive/10 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-olive" />
                <h4 className="font-serif font-bold text-gray-800">Kapasitas Tamu</h4>
              </div>
              <span className="text-sm font-bold text-olive bg-cream px-3 py-1 rounded-full">
                {stats.total} / {guestLimit} Tamu
              </span>
            </div>
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progressPercentage}%` }}
                className={cn(
                  "h-full transition-all duration-1000",
                  progressPercentage > 90 ? "bg-red-500" : "bg-olive"
                )}
              />
            </div>
            <p className="text-[10px] text-gray-400 font-medium italic">
              {progressPercentage >= 100 ? 'Kapasitas tamu sudah penuh!' : `Tersisa ${guestLimit - stats.total} slot tamu lagi.`}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Tamu', value: stats.total, icon: UserIcon, color: 'bg-blue-50 text-blue-600' },
              { label: 'Check-in', value: stats.checkedIn, icon: UserCheck, color: 'bg-green-50 text-green-600' },
              { label: 'Souvenir', value: stats.souvenirClaimed, icon: Gift, color: 'bg-purple-50 text-purple-600' },
              { label: 'Hadir', value: stats.hadir, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
            ].map((stat, i) => (
              <div key={i} className="bg-white p-6 rounded-[24px] border border-olive/5 shadow-sm hover:shadow-md transition-all">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", stat.color)}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-serif font-bold text-gray-800 mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-[40px] border-2 border-olive/20 shadow-xl flex flex-col items-center justify-center text-center transform hover:scale-[1.02] transition-all">
          <div className="p-6 bg-cream rounded-[32px] mb-6 shadow-2xl border border-olive/5">
            <QRCodeSVG value={eventPublicUrl} size={180} level="H" includeMargin={true} />
          </div>
          <h4 className="text-xl font-serif font-bold text-olive">QR Code Guestbook</h4>
          <p className="text-xs text-gray-500 mt-2 mb-6 max-w-[200px]">Scan QR code ini untuk mengakses halaman buku tamu digital Anda secara langsung.</p>
          <a 
            href={eventPublicUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full py-3 bg-olive text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-olive/90 transition-all shadow-md"
          >
            Buka Halaman Tamu <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Guest List Section */}
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <h3 className="text-xl font-serif font-bold">Daftar Tamu & Pesan</h3>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => fetchEntries(true)}
              disabled={isRefreshingEntries}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all shadow-sm ${
                isRefreshingEntries 
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed opacity-70' 
                  : 'bg-white text-olive border border-olive/10 hover:bg-olive/5 active:scale-95'
              }`}
            >
              <RefreshCcw className={`w-4 h-4 ${isRefreshingEntries ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={() => setIsScannerOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-olive text-white rounded-2xl text-sm font-bold hover:bg-olive/90 transition-all shadow-lg active:scale-95"
            >
              <Camera className="w-4 h-4" /> Scan Barcode
            </button>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Cari nama atau pesan..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-11 pr-4 py-3 rounded-2xl border border-olive/10 bg-white focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm w-full md:w-64"
              />
            </div>
            <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-olive/10">
              {(['all', 'hadir', 'tidak_hadir', 'ragu_ragu'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize",
                    filter === f ? "bg-olive text-white shadow-md" : "text-gray-400 hover:text-olive"
                  )}
                >
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {filteredEntries.map((entry) => (
            <motion.div
              key={entry.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-[32px] border border-olive/5 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-cream rounded-2xl flex items-center justify-center text-olive shadow-inner">
                    <UserIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-serif text-lg font-bold text-gray-800 flex items-center gap-2">
                      {entry.name}
                    </h4>
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest mt-1">
                      {entry.timestamp ? format(entry.timestamp.toDate(), 'EEEE, dd MMMM yyyy HH:mm', { locale: id }) : 'Baru saja'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 mr-2">
                    {!entry.checkInTime ? (
                      <button 
                        onClick={() => handleCheckIn(entry.id!)}
                        className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-all flex items-center gap-1 text-[10px] font-bold"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Check-in
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-xl">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Checked
                      </div>
                    )}
                    
                    <button 
                      onClick={() => handleToggleSouvenir(entry.id!, !!entry.souvenirClaimed)}
                      className={cn(
                        "p-2 rounded-xl transition-all flex items-center gap-1 text-[10px] font-bold",
                        entry.souvenirClaimed 
                          ? "bg-purple-100 text-purple-600" 
                          : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                      )}
                    >
                      <Gift className="w-3.5 h-3.5" /> {entry.souvenirClaimed ? 'Souvenir OK' : 'Souvenir'}
                    </button>
                  </div>

                  <span className={cn(
                    "text-[10px] font-bold uppercase px-3 py-1.5 rounded-full shadow-sm",
                    entry.attendance === 'hadir' && "bg-green-100 text-green-700",
                    entry.attendance === 'tidak_hadir' && "bg-red-100 text-red-700",
                    entry.attendance === 'ragu_ragu' && "bg-amber-100 text-amber-700",
                  )}>
                    {entry.attendance.replace('_', ' ')}
                  </span>
                  <div className="flex items-center gap-1 bg-cream/30 p-1 rounded-2xl border border-olive/5 flex-wrap justify-end">
                    <button
                      onClick={() => handleShareWhatsApp(entry.name)}
                      className="p-2.5 text-green-500 hover:bg-green-50 rounded-xl transition-all active:scale-95"
                      title="Kirim WhatsApp"
                    >
                      <MessageSquare className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                    <button
                      onClick={() => handleCopyInvitation(entry.name)}
                      className="p-2.5 text-olive hover:bg-olive/5 rounded-xl transition-all active:scale-95"
                      title="Salin Link"
                    >
                      <Copy className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingEntryId(entry.id!);
                        setEditEntryText(entry.message);
                      }}
                      className="p-2.5 text-blue-400 hover:bg-blue-50 rounded-xl transition-all active:scale-95"
                      title="Edit Pesan"
                    >
                      <Edit3 className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: entry.id!, type: 'guest' })}
                      className="p-2.5 text-red-400 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                      title="Hapus Pesan"
                    >
                      <Trash2 className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {editingEntryId === entry.id ? (
                <div className="mb-6 space-y-4">
                  <textarea
                    value={editEntryText}
                    onChange={(e) => setEditEntryText(e.target.value)}
                    className="w-full px-5 py-3 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-gray-700 text-sm"
                    rows={4}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleUpdateEntry(entry.id!)}
                      className="bg-olive text-white px-6 py-2.5 rounded-xl font-bold shadow-lg text-sm"
                    >
                      Simpan Pesan
                    </button>
                    <button
                      onClick={() => setEditingEntryId(null)}
                      className="bg-gray-100 text-gray-500 px-6 py-2.5 rounded-xl font-bold text-sm"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-6 p-5 bg-cream/20 rounded-[24px] border border-olive/5">
                  <p className="text-gray-700 text-base font-sans leading-relaxed whitespace-pre-wrap italic">
                    "{entry.message}"
                  </p>
                </div>
              )}

              {entry.reply ? (
                <div className="bg-olive/5 p-5 rounded-[24px] border border-olive/10 relative">
                  <div className="absolute -top-3 left-8 w-6 h-6 bg-olive/5 border-t border-l border-olive/10 rotate-45" />
                  <p className="text-[10px] font-bold text-olive uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Reply className="w-3 h-3" /> Balasan Anda:
                  </p>
                  <p className="text-sm text-gray-700 font-sans leading-relaxed">{entry.reply}</p>
                  <button 
                    onClick={() => {
                      setReplyingTo(entry.id!);
                      setReplyText(entry.reply!);
                    }}
                    className="text-[10px] text-blue-600 mt-3 font-bold uppercase hover:underline flex items-center gap-1"
                  >
                    <Edit3 className="w-2.5 h-2.5" /> Ubah Balasan
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setReplyingTo(entry.id!)}
                  className="flex items-center gap-2 text-xs font-bold text-olive hover:bg-olive/5 px-5 py-2.5 rounded-xl border border-olive/10 transition-all"
                >
                  <Reply className="w-3.5 h-3.5" /> Balas Pesan Ini
                </button>
              )}

              <AnimatePresence>
                {replyingTo === entry.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 space-y-4 overflow-hidden"
                  >
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Tulis balasan hangat Anda di sini..."
                      className="w-full px-6 py-4 rounded-3xl border border-olive/10 bg-white focus:outline-none focus:ring-2 focus:ring-olive/20 text-gray-700"
                      rows={3}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleReply(entry.id!)}
                        className="bg-olive text-white px-8 py-3 rounded-2xl font-bold shadow-lg"
                      >
                        Kirim Balasan
                      </button>
                      <button
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyText("");
                        }}
                        className="bg-gray-100 text-gray-500 px-8 py-3 rounded-2xl font-bold"
                      >
                        Batal
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
          {filteredEntries.length === 0 && !isLoading && (
            <div className="text-center py-32 bg-white/50 rounded-[48px] border border-dashed border-olive/20">
              <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 font-serif text-xl italic">Tidak ada pesan yang ditemukan.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )}

      {activeTab === 'settings' && (
        <div className="space-y-12">
          {/* Subscription Info Banner */}
          <div className="bg-white p-8 rounded-[40px] border border-olive/10 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className={cn(
                "w-16 h-16 rounded-[24px] flex items-center justify-center shadow-inner",
                isExpired ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
              )}>
                <Clock className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-olive uppercase tracking-widest mb-1">Informasi Berlangganan</p>
                <h4 className="text-2xl font-serif font-bold text-gray-800">
                  {isExpired ? 'Masa Aktif Berakhir' : `${daysRemaining} Hari Tersisa`}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-gray-500">
                    Event Anda aktif hingga <span className="font-bold">{format(getExpirationDate(event), 'dd MMMM yyyy', { locale: id })}</span>.
                  </p>
                  {userData?.package && (
                    <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                      {PACKAGES[userData.package]?.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <button 
                onClick={exportToCSV}
                className="flex-1 lg:flex-none px-6 py-3.5 bg-white border border-olive/10 rounded-2xl text-sm font-bold text-olive hover:bg-olive/5 transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export Data
              </button>
              <button 
                onClick={handleExtendEvent}
                className="flex-1 lg:flex-none px-6 py-3.5 bg-olive text-white rounded-2xl text-sm font-bold hover:bg-olive/90 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" /> Perpanjang
              </button>
            </div>
          </div>

          {/* Reseller Branding */}
          {resellerBrand && (
            <div className="bg-white p-8 rounded-[40px] border border-olive/10 shadow-sm flex flex-col md:flex-row items-center gap-6">
              {resellerBrand.logo && (
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-cream flex items-center justify-center border border-olive/5 shadow-inner">
                  <img src={resellerBrand.logo} alt={resellerBrand.name} className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold text-olive uppercase tracking-widest mb-1">Dikelola Oleh Partner Kami</p>
                <h4 className="text-2xl font-serif font-bold text-gray-800">{resellerBrand.name || 'Partner Resmi Guestly'}</h4>
                <p className="text-xs text-gray-500 mt-1">Acara ini didaftarkan dan dikelola melalui partner resmi kami.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Profile Settings */}
            <div className="bg-white p-8 rounded-[40px] border border-olive/10 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cream rounded-2xl flex items-center justify-center text-olive"><UserIcon className="w-5 h-5" /></div>
                <h3 className="text-xl font-serif font-bold">Pengaturan Profil</h3>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Nama Lengkap</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" value={profileForm.name} 
                        onChange={e => setProfileForm({...profileForm, name: e.target.value})}
                        placeholder="Nama Lengkap" className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm" required 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Nomor WhatsApp</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="tel" value={profileForm.phone} 
                        onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
                        placeholder="Contoh: 08123456789" className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm" 
                      />
                    </div>
                  </div>
                  
                </div>

                <button type="submit" className={cn(
                  "w-full bg-olive text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95 hover:bg-olive/90"
                )}>
                  Simpan Profil
                </button>
              </form>

              <div className="pt-8 border-t border-olive/5">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center text-red-600"><Key className="w-5 h-5" /></div>
                  <h3 className="text-xl font-serif font-bold">Ubah Password</h3>
                </div>
                
                <form onSubmit={handleUpdatePassword} className="space-y-5">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Password Baru</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                          type="password" value={passwordForm.newPassword} 
                          onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                          placeholder="Minimal 6 karakter" className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm" required 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Konfirmasi Password Baru</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                          type="password" value={passwordForm.confirmPassword} 
                          onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                          placeholder="Ulangi password baru" className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm" required 
                        />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95 hover:bg-red-700">
                    Update Password
                  </button>
                </form>
              </div>
            </div>

            {/* Event Settings */}
            <div className="bg-white p-8 rounded-[40px] border border-olive/10 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cream rounded-2xl flex items-center justify-center text-olive"><Calendar className="w-5 h-5" /></div>
                <h3 className="text-xl font-serif font-bold">Pengaturan Event</h3>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-olive uppercase tracking-widest ml-2">Nama Acara</label>
                  <input 
                    type="text" value={editEventForm.title}
                    onChange={e => setEditEventForm({...editEventForm, title: e.target.value})}
                    className="w-full px-5 py-4 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-olive uppercase tracking-widest ml-2">Tanggal</label>
                    <input 
                      type="text" value={editEventForm.date}
                      onChange={e => setEditEventForm({...editEventForm, date: e.target.value})}
                      className="w-full px-5 py-4 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-olive uppercase tracking-widest ml-2">Lokasi</label>
                    <input 
                      type="text" value={editEventForm.location}
                      onChange={e => setEditEventForm({...editEventForm, location: e.target.value})}
                      className="w-full px-5 py-4 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-olive uppercase tracking-widest ml-2">URL Undangan Digital (Base URL)</label>
                  <input 
                    type="url" value={editEventForm.invitationUrl}
                    onChange={e => setEditEventForm({...editEventForm, invitationUrl: e.target.value})}
                    className="w-full px-5 py-4 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm"
                    placeholder="Contoh: https://queinvite.yulovi.com/novii-agung/"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-bold text-olive uppercase tracking-widest ml-2">Jenis Souvenir</label>
                  <div className="flex flex-wrap gap-2">
                    {editEventForm.souvenirTypes.map((type, index) => (
                      <div key={index} className="flex items-center gap-2 bg-cream px-4 py-2 rounded-xl border border-olive/10">
                        <span className="text-sm text-olive font-medium">{type}</span>
                        <button 
                          onClick={() => {
                            const newTypes = [...editEventForm.souvenirTypes];
                            newTypes.splice(index, 1);
                            setEditEventForm({...editEventForm, souvenirTypes: newTypes});
                          }}
                          className="text-red-400 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => {
                        const type = prompt("Masukkan jenis souvenir baru:");
                        if (type) setEditEventForm({...editEventForm, souvenirTypes: [...editEventForm.souvenirTypes, type]});
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-olive/30 text-olive text-sm font-bold hover:bg-olive/5 transition-all"
                    >
                      <Plus className="w-4 h-4" /> Tambah
                    </button>
                  </div>
                </div>

                <button 
                  onClick={handleUpdateEvent}
                  className="w-full bg-olive text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95 hover:bg-olive/90"
                >
                  Simpan Perubahan Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="space-y-8">
          <div className="bg-white p-10 rounded-[40px] border border-olive/10 shadow-xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-serif font-bold text-gray-800">Manajemen Staff</h3>
                <p className="text-gray-500 text-sm mt-1">Kelola akun usher untuk membantu check-in tamu (Maks {event.maxStaff})</p>
              </div>
              {staffList.length < event.maxStaff && (
                <button 
                  onClick={() => setIsAddingStaff(true)}
                  className="bg-olive text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-olive/90 transition-all shadow-lg"
                >
                  <Plus className="w-5 h-5" /> Tambah Staff
                </button>
              )}
            </div>

            <AnimatePresence>
              {isAddingStaff && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mb-10 p-8 bg-cream/30 rounded-[32px] border border-olive/10"
                >
                  <form onSubmit={handleAddStaff} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive uppercase tracking-widest ml-2">Nama Staff</label>
                      <input 
                        type="text" required value={newStaff.name}
                        onChange={e => setNewStaff({...newStaff, name: e.target.value})}
                        className="w-full px-5 py-4 rounded-2xl border border-olive/10 bg-white focus:outline-none focus:ring-2 focus:ring-olive/20"
                        placeholder="Contoh: Usher 1"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive uppercase tracking-widest ml-2">Email</label>
                      <input 
                        type="email" required value={newStaff.email}
                        onChange={e => setNewStaff({...newStaff, email: e.target.value})}
                        className="w-full px-5 py-4 rounded-2xl border border-olive/10 bg-white focus:outline-none focus:ring-2 focus:ring-olive/20"
                        placeholder="email@staff.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-olive uppercase tracking-widest ml-2">Password</label>
                      <input 
                        type="password" required value={newStaff.password}
                        onChange={e => setNewStaff({...newStaff, password: e.target.value})}
                        className="w-full px-5 py-4 rounded-2xl border border-olive/10 bg-white focus:outline-none focus:ring-2 focus:ring-olive/20"
                        placeholder="******"
                      />
                    </div>
                    <div className="md:col-span-3 flex justify-end gap-4 mt-4">
                      <button 
                        type="button" onClick={() => setIsAddingStaff(false)}
                        className="px-8 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all"
                      >
                        Batal
                      </button>
                      <button 
                        type="submit"
                        className="bg-olive text-white px-10 py-4 rounded-2xl font-bold hover:bg-olive/90 transition-all shadow-lg"
                      >
                        Simpan Staff
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {staffList.map((staff) => (
                <div key={staff.uid} className="bg-white p-6 rounded-[32px] border border-olive/10 shadow-sm flex items-center justify-between group hover:border-olive/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-cream rounded-2xl flex items-center justify-center text-olive">
                      <UserIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800">{staff.name}</h4>
                      <p className="text-xs text-gray-500">{staff.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setConfirmDelete({ id: staff.uid, type: 'staff' })}
                    className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
              {staffList.length === 0 && (
                <div className="col-span-full py-20 text-center">
                  <Users className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-400 font-serif italic">Belum ada staff yang terdaftar.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={confirmDelete?.type === 'guest'}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete.id)}
        title="Hapus Pesan"
        message="Apakah Anda yakin ingin menghapus pesan ini? Tindakan ini tidak dapat dibatalkan."
      />

      <ConfirmModal
        isOpen={confirmDelete?.type === 'staff'}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteStaff(confirmDelete.id)}
        title="Hapus Staff"
        message="Apakah Anda yakin ingin menghapus akun staff ini? Staff tersebut tidak akan bisa login lagi."
      />

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScan}
      />
    </div>
  );
}
