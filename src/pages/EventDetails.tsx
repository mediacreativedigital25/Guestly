import { useParams, Link, useSearchParams } from 'react-router-dom';
import { QrCode, Printer, ScanLine, Plus, Trash2, Edit, Search, CheckCircle, XCircle, FileSpreadsheet, FileText, Upload, Download, Copy, Share2, Download as DownloadIcon, Monitor, Code, MessageCircle, RefreshCcw, Users, Loader2, Gift, ArrowUpDown, AlertCircle, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, deleteDoc, updateDoc, deleteField, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { supabaseDb } from '../lib/supabaseDb';
import { Guest, EventRecord, WATemplate, EInviteTemplate } from '../types';
import { parseFirestoreDate, canUserAccessEvent, getOperatorLabel, getRoleLabel, exportCardToPng } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Modal } from '../components/Modal';
import { MediaUploader } from '../components/media/MediaUploader';
import { EInvitationCard } from '../components/EInvitationCard';
import { eInviteTemplateService, DEFAULT_EINVITE_TEMPLATES } from '../services/eInviteTemplateService';
import { useAuth } from '../AuthContext';
import { showAlert, showConfirm } from '../lib/alerts';
import { useSettings } from '../SettingsContext';
import SouvenirManagement from '../components/SouvenirManagement';
import { souvenirStorage } from '../services/souvenirStorage';

export default function EventDetails() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const { appUser } = useAuth();
  const currentOperator = getOperatorLabel(appUser);
  const isStaff = appUser?.role === 'staff';
  const isStaffCheckinOnly = isStaff && appUser?.staffType === 'checkin';
  const isStaffSouvenirOnly = isStaff && appUser?.staffType === 'souvenir';
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [clientName, setClientName] = useState<string>('');
  const [clientPartnerId, setClientPartnerId] = useState<string | null>(null);
  const [teamPartnerIds, setTeamPartnerIds] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [waTemplates, setWaTemplates] = useState<WATemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestAddress, setNewGuestAddress] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('');
  const [newGuestCategory, setNewGuestCategory] = useState('');
  const [newGuestInvitationType, setNewGuestInvitationType] = useState('');
  const [newGuestSession, setNewGuestSession] = useState('');
  const [newGuestPax, setNewGuestPax] = useState<string>('1');
  const [searchTerm, setSearchTerm] = useState('');
  const [rsvpFilter, setRsvpFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [invitationTypeFilter, setInvitationTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'category_setting' | 'category_desc' | 'newest' | 'name_asc'>('category_setting');
  const [activeTab, setActiveTab] = useState<'guest-list' | 'rsvp' | 'attended' | 'souvenir'>(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'souvenir') return 'souvenir';
    return 'guest-list';
  });

  useEffect(() => {
    if (isStaffSouvenirOnly) {
      setActiveTab('souvenir');
    } else if (isStaffCheckinOnly && (activeTab === 'souvenir' || activeTab === 'rsvp')) {
      setActiveTab('guest-list');
    } else if (searchParams.get('tab') === 'souvenir' && !isStaffCheckinOnly) {
      setActiveTab('souvenir');
    }
  }, [isStaffSouvenirOnly, isStaffCheckinOnly, searchParams]);
  const [isEmbedModalOpen, setIsEmbedModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [activeQrGuest, setActiveQrGuest] = useState<Guest | null>(null);
  const [qrModalViewMode, setQrModalViewMode] = useState<'card' | 'standard'>('card');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printFormat, setPrintFormat] = useState<'standard' | 'card-4' | 'card-8'>('standard');
  const [singlePrintGuest, setSinglePrintGuest] = useState<Guest | null>(null);
  const { settings } = useSettings();
  const [isBlasting, setIsBlasting] = useState(false);
  const [isBlastModalOpen, setIsBlastModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isEditingGuest, setIsEditingGuest] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestAddress, setEditGuestAddress] = useState('');
  const [editGuestPhone, setEditGuestPhone] = useState('');
  const [editGuestCategory, setEditGuestCategory] = useState('');
  const [editGuestInvitationType, setEditGuestInvitationType] = useState('');
  const [editGuestSession, setEditGuestSession] = useState('');
  const [editGuestPax, setEditGuestPax] = useState<string>('1');
  const [editGuestRsvpStatus, setEditGuestRsvpStatus] = useState<'pending' | 'attending' | 'declined'>('pending');
  const [isRefreshingGuests, setIsRefreshingGuests] = useState(false);

  // High-performance batch states
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [sampleProgress, setSampleProgress] = useState<{ current: number; total: number } | null>(null);

  // Thumbnail / Foto Mempelai quick-setting modal states
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState(false);
  const [thumbnailInput, setThumbnailInput] = useState('');
  const [isSavingThumbnail, setIsSavingThumbnail] = useState(false);
  const [eInviteTemplates, setEInviteTemplates] = useState<EInviteTemplate[]>(DEFAULT_EINVITE_TEMPLATES);

  useEffect(() => {
    eInviteTemplateService.getTemplates().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setEInviteTemplates(list);
      }
    });
  }, []);

  const openThumbnailModal = () => {
    setThumbnailInput(event?.thumbnailUrl || '');
    setIsThumbnailModalOpen(true);
  };

  const handleSaveThumbnail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !event) return;
    setIsSavingThumbnail(true);
    try {
      const cleanedThumb = thumbnailInput.trim();
      await updateDoc(doc(db, 'events', eventId), {
        thumbnailUrl: cleanedThumb ? cleanedThumb : deleteField(),
        updatedAt: serverTimestamp(),
      });
      setEvent({ ...event, thumbnailUrl: cleanedThumb || undefined });
      setIsThumbnailModalOpen(false);
      showAlert(
        'Berhasil',
        cleanedThumb
          ? 'Thumbnail acara / foto mempelai berhasil disimpan! Link undangan kini akan menampilkan foto tersebut.'
          : 'Thumbnail acara dikembalikan ke default sistem.',
        'success'
      );
    } catch (error) {
      console.error('Error saving thumbnail:', error);
      showAlert('Gagal', 'Gagal menyimpan pengaturan thumbnail acara.', 'error');
    } finally {
      setIsSavingThumbnail(false);
    }
  };

  const handleUpdateEInviteConfig = async (updates: {
    eInviteTheme?: 'rose' | 'gold' | 'sage';
    eInviteMode?: 'full' | 'compact';
    eInviteTemplateId?: string;
    eInviteTemplateUrl?: string;
  }) => {
    if (!eventId || !event) return;
    try {
      await updateDoc(doc(db, 'events', eventId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      setEvent({ ...event, ...updates });
    } catch (error) {
      console.error('Error updating E-Invitation config:', error);
      showAlert('Gagal', 'Gagal menyimpan pengaturan tema E-Invitation.', 'error');
    }
  };

  const fetchGuests = async (showIndicator = false) => {
    if (!eventId) return;
    if (showIndicator) setIsRefreshingGuests(true);
    souvenirStorage.hydrateFromSupabase(eventId, true);
    try {
      const guestsRef = collection(db, 'events', eventId, 'guests');
      const snapshot = await getDocs(guestsRef);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest));
      
      // Sort in-memory: newest first, then by name
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        if (timeB !== timeA) return timeB - timeA;
        return (a.name || '').localeCompare(b.name || '');
      });

      setGuests(souvenirStorage.mergeGuestsWithSouvenirs(eventId, data));
    } catch (error) {
      console.error('Error fetching guests:', error);
      handleFirestoreError(error, OperationType.GET, `events/${eventId}/guests`);
    } finally {
      setLoading(false);
      if (showIndicator) setIsRefreshingGuests(false);
    }
  };

  useEffect(() => {
    if (!eventId) return;

    let unsubscribeEvent: () => void;
    let unsubscribeGuestsRealtime: () => void;
    let intervalId: NodeJS.Timeout;

    const setupListeners = async () => {
      try {
        setLoading(true);

        // Listen to event details
        unsubscribeEvent = onSnapshot(doc(db, 'events', eventId), async (eventDoc) => {
          if (eventDoc.exists()) {
            const eventData = { id: eventDoc.id, ...eventDoc.data() } as EventRecord;
            setEvent(eventData);
            if (eventData.clientId) {
              try {
                const clientDoc = await getDoc(doc(db, 'clients', eventData.clientId));
                if (clientDoc.exists()) {
                  setClientName(clientDoc.data().name);
                  setClientPartnerId(clientDoc.data().partnerId || null);
                }
              } catch (clientErr) {
                console.warn('Failed to fetch client details:', clientErr);
              }
            }
            if (eventData.partnerId) {
              try {
                const creatorDoc = await getDoc(doc(db, 'users', eventData.partnerId));
                if (creatorDoc.exists()) {
                  const cData = creatorDoc.data();
                  const ids = [creatorDoc.id, cData.partnerId, cData.createdBy].filter(Boolean);
                  setTeamPartnerIds(ids);
                }
              } catch {
                // ignore
              }
            }
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `events/${eventId}`);
        });

        // Initial fetch for guests
        await fetchGuests();

        // Realtime subscription to Supabase Broadcast & Postgres Changes
        unsubscribeGuestsRealtime = supabaseDb.subscribeToGuests(eventId, () => {
          fetchGuests(false);
        });

        // Smart Real-Time Auto Refresh (4s) for live monitoring
        intervalId = setInterval(() => {
          if (document.visibilityState === 'visible') {
            fetchGuests(false);
          }
        }, 4000);

        // Fetch WA Templates
        getDoc(doc(db, 'settings', 'waTemplates')).then(docSnap => {
           if (docSnap.exists() && docSnap.data().templates) {
              const templates = docSnap.data().templates as WATemplate[];
              setWaTemplates(templates);
              const savedTpl = localStorage.getItem(`waTemplateId_${eventId}`);
              if (savedTpl && templates.some(t => t.id === savedTpl)) {
                 setSelectedTemplateId(savedTpl);
              } else if (templates.length > 0) {
                 setSelectedTemplateId(templates[0].id);
              }
           }
        }).catch((err: any) => {
           if (err.code !== 'permission-denied') {
             console.warn('Failed to fetch WA templates from settings', err);
           }
        });

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `events/${eventId}`);
        setLoading(false);
      }
    };

    setupListeners();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchGuests(false);
      }
    };

    const handleCompatChange = (e: any) => {
      const col = e.detail?.collectionName;
      if (!col || col === 'guests' || col === 'settings') {
        fetchGuests(false);
      }
    };

    const handleSouvenirsChanged = (e: any) => {
      if (!e.detail?.eventId || e.detail?.eventId === eventId) {
        fetchGuests(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('supabase-compat-change', handleCompatChange);
    window.addEventListener('guestly_souvenirs_changed', handleSouvenirsChanged);

    return () => {
      if (unsubscribeEvent) unsubscribeEvent();
      if (unsubscribeGuestsRealtime) unsubscribeGuestsRealtime();
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('supabase-compat-change', handleCompatChange);
      window.removeEventListener('guestly_souvenirs_changed', handleSouvenirsChanged);
    };
  }, [eventId]);

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (appUser?.role !== 'superadmin' && appUser?.guestQuota !== undefined && guests.length >= appUser.guestQuota) {
      showAlert('Kuota Habis', `Anda telah mencapai batas maksimal kuota tamu (${appUser.guestQuota} tamu). Silakan beli atau upgrade layanan Anda.`, 'warning');
      return;
    }

    const confirmed = await showConfirm("Apakah Anda yakin ingin menambahkan tamu ini?");
    if (!confirmed) return;
    
    const cleanedGuestName = newGuestName.trim();
    if (guests.some(g => g.name.toLowerCase() === cleanedGuestName.toLowerCase())) {
      showAlert('Peringatan', `Tamu dengan nama "${cleanedGuestName}" sudah tersedia di daftar.`, 'warning');
      return;
    }

    try {
      const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const parsedPax = Math.max(1, Number(newGuestPax) || 1);
      const payload: any = {
        eventId: eventId!,
        name: cleanedGuestName,
        ticketCode: ticketCode,
        pax: parsedPax,
        rsvpStatus: 'pending',
        attended: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      if (newGuestAddress) payload.address = newGuestAddress;
      if (newGuestPhone) payload.phone = newGuestPhone;
      if (newGuestCategory) payload.category = newGuestCategory;
      if (newGuestInvitationType) payload.invitationType = newGuestInvitationType;
      if (newGuestSession) payload.session = newGuestSession;
      
      if (appUser?.role === 'client') {
        await addDoc(collection(db, 'guest_edit_requests'), {
          eventId: eventId!,
          eventTitle: event?.title || 'Unknown Event',
          guestId: 'new_guest',
          clientId: event?.clientId || '',
          partnerId: event?.partnerId || null,
          type: 'add',
          originalData: {},
          requestedData: {
            name: cleanedGuestName,
            address: newGuestAddress || '',
            phone: newGuestPhone || '',
            category: newGuestCategory || '',
            invitationType: newGuestInvitationType || '',
            session: newGuestSession || '',
            pax: parsedPax,
            ticketCode: ticketCode,
            rsvpStatus: 'pending',
            attended: false,
          },
          status: 'pending',
          requestedAt: serverTimestamp()
        });
        showAlert('Berhasil', "Permintaan penambahan tamu berhasil dikirim dan menunggu persetujuan Admin/Vendor.", "success");
      } else {
        const guestRef = await addDoc(collection(db, 'events', eventId!, 'guests'), payload);
        setGuests([...guests, { id: guestRef.id, ...payload } as unknown as Guest]);
        showAlert('Berhasil', "Tamu berhasil ditambahkan!", "success");
      }

      setNewGuestName('');
      setNewGuestAddress('');
      setNewGuestPhone('');
      setNewGuestCategory('');
      setNewGuestInvitationType('');
      setNewGuestSession('');
      setNewGuestPax('1');
      setIsAddingGuest(false);
    } catch (error) {
      showAlert("Gagal", "Failed to add guest. Check permissions.", "error");
      handleFirestoreError(error, OperationType.CREATE, `events/${eventId}/guests`);
    }
  };

  const [guestToDelete, setGuestToDelete] = useState<string | null>(null);
  
  const [isEditingWishes, setIsEditingWishes] = useState(false);
  const [editingWishesGuestId, setEditingWishesGuestId] = useState<string | null>(null);
  const [editWishesText, setEditWishesText] = useState('');
  const [editStickerUrl, setEditStickerUrl] = useState<string>('');

  const STICKERS = ['❤️', '🎉', '🙏', '✨', '🔥', '🌸', '💍', '🕊️'];

  const handleEditWishesClick = (guest: Guest) => {
    setEditingWishesGuestId(guest.id!);
    setEditWishesText(guest.wishes || '');
    setEditStickerUrl(guest.stickerUrl || '');
    setIsEditingWishes(true);
  };

  const handleSaveEditWishes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWishesGuestId || !event) return;

    try {
      await updateDoc(doc(db, 'events', eventId!, 'guests', editingWishesGuestId), {
         wishes: editWishesText,
         stickerUrl: editStickerUrl,
         updatedAt: serverTimestamp()
      });
      showAlert('Berhasil', 'Ucapan berhasil diubah.', 'success');
      setIsEditingWishes(false);
      setEditingWishesGuestId(null);
    } catch (error) {
      console.error(error);
      showAlert('Error', 'Gagal mengubah ucapan.', 'error');
    }
  };

  const handleDeleteWishes = async (guestId: string) => {
    const confirmed = await showConfirm("Apakah Anda yakin ingin menghapus ucapan dan stiker dari tamu ini?");
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, 'events', eventId!, 'guests', guestId), {
         wishes: '',
         stickerUrl: '',
         updatedAt: serverTimestamp()
      });
      showAlert('Berhasil', 'Ucapan berhasil dihapus.', 'success');
    } catch (error) {
      console.error(error);
      showAlert('Error', 'Gagal menghapus ucapan.', 'error');
    }
  };

  const promptDeleteGuest = (guestId: string) => {
    setGuestToDelete(guestId);
  };

  const handleDeleteGuest = async () => {
    if (!guestToDelete) return;
    try {
      await deleteDoc(doc(db, 'events', eventId!, 'guests', guestToDelete));
      setGuests(guests.filter(g => g.id !== guestToDelete));
      setGuestToDelete(null);
      showAlert("Berhasil", "Tamu berhasil dihapus!", "success");
    } catch (error) {
       showAlert("Gagal", "Gagal menghapus tamu", "error");
       handleFirestoreError(error, OperationType.DELETE, `events/${eventId}/guests/${guestToDelete}`);
       setGuestToDelete(null);
    }
  };

  const handleBulkDeleteGuests = async () => {
    if (selectedGuestIds.length === 0) return;
    if (appUser?.role !== 'superadmin' && appUser?.role !== 'owner' && appUser?.role !== 'admin' && appUser?.role !== 'partner') {
      showAlert("Ditolak", "Hanya Super Admin, Owner, Admin, dan Partner yang dapat menghapus massal.", "error");
      return;
    }
    
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus ${selectedGuestIds.length} tamu yang dipilih?`);
    if (!confirmed) return;

    try {
      const promises = selectedGuestIds.map(id => 
        deleteDoc(doc(db, 'events', eventId!, 'guests', id))
      );
      
      await Promise.all(promises);
      
      setGuests(guests.filter(g => !selectedGuestIds.includes(g.id!)));
      setSelectedGuestIds([]);
      showAlert("Berhasil", `${selectedGuestIds.length} tamu berhasil dihapus!`, "success");
    } catch (error) {
      console.error('Error deleting guests:', error);
      showAlert("Gagal", "Gagal menghapus beberapa tamu", "error");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!eventId || !event) return;
    
    const confirmed = await showConfirm(`Apakah Anda yakin ingin mengubah status acara menjadi ${newStatus}?`);
    if (!confirmed) return;
    
    try {
      await updateDoc(doc(db, 'events', eventId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      setEvent({ ...event, status: newStatus as any });
      showAlert("Berhasil", "Status acara berhasil diubah!", "success");
    } catch (error) {
      showAlert("Gagal", "Gagal mengubah status acara", "error");
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
    }
  };

  const handleToggleAttendance = async (guestId: string, currentStatus: boolean) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin ${currentStatus ? 'membatalkan' : 'mengonfirmasi'} kehadiran tamu ini?`);
    if (!confirmed) return;

    try {
      const newStatus = !currentStatus;
      const updateData: any = {
        attended: newStatus,
        updatedAt: serverTimestamp()
      };
      
      if (newStatus) {
        updateData.attendedAt = serverTimestamp();
        updateData.checkInStaff = currentOperator;
      } else {
        updateData.attendedAt = deleteField();
        updateData.checkInStaff = deleteField();
      }
      
      await updateDoc(doc(db, 'events', eventId!, 'guests', guestId), updateData);
      
      setGuests(guests.map(g => g.id === guestId ? { ...g, attended: newStatus, checkInStaff: newStatus ? currentOperator : undefined } : g));
      showAlert('Berhasil', `Status kehadiran berhasil ${newStatus ? 'dikonfirmasi' : 'dibatalkan'}!`, 'success');
    } catch (error) {
      showAlert('Gagal', "Gagal memperbarui status kehadiran", 'error');
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}/guests/${guestId}`);
    }
  };

  const DEFAULT_CATEGORIES = ['VIP', 'Keluarga', 'Reguler'];
  const configuredCategories = event?.guestCategories && event.guestCategories.length > 0
    ? event.guestCategories
    : DEFAULT_CATEGORIES;
  const availableCategories = Array.from(
    new Set([
      ...configuredCategories,
      ...guests.map(g => g.category?.trim()).filter((v): v is string => Boolean(v))
    ])
  );

  const getCategoryRank = (cat?: string) => {
    const cleaned = (cat || '').trim().toLowerCase();
    if (!cleaned) return 999999;
    const configIdx = configuredCategories.findIndex(c => c.trim().toLowerCase() === cleaned);
    if (configIdx !== -1) return configIdx;
    const availIdx = availableCategories.findIndex(c => c.trim().toLowerCase() === cleaned);
    return availIdx !== -1 ? 1000 + availIdx : 99999;
  };

  const DEFAULT_INVITATION_TYPES = ['Undangan Fisik', 'Undangan Cetak', 'Undangan Digital'];
  const availableInvitationTypes = Array.from(
    new Set([
      ...(event?.invitationTypes && event.invitationTypes.length > 0 ? event.invitationTypes : DEFAULT_INVITATION_TYPES),
      ...guests.map(g => g.invitationType?.trim()).filter((v): v is string => Boolean(v))
    ])
  );

  const baseFilteredGuests = activeTab === 'guest-list' || activeTab === 'attended' 
    ? guests 
    : guests.filter(g => g.hasResponded || g.rsvpStatus !== 'pending' || (g.wishes && g.wishes.trim().length > 0));
  
  const filteredGuests = baseFilteredGuests.filter(guest => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = !q ||
                          (guest.name && guest.name.toLowerCase().includes(q)) || 
                          (guest.ticketCode && guest.ticketCode.toLowerCase().includes(q)) ||
                          (guest.address && guest.address.toLowerCase().includes(q)) ||
                          (guest.phone && guest.phone.includes(q)) ||
                          (guest.category && guest.category.toLowerCase().includes(q)) ||
                          (guest.invitationType && guest.invitationType.toLowerCase().includes(q)) ||
                          (guest.session && guest.session.toLowerCase().includes(q));
    
    let matchesStatus = true;
    if (activeTab === 'rsvp') {
      if (rsvpFilter !== 'all') {
        matchesStatus = guest.rsvpStatus === rsvpFilter;
      }
    } else if (activeTab === 'attended') {
      matchesStatus = guest.attended === true;
    } else {
      // activeTab === 'guest-list'
      if (attendanceFilter !== 'all') {
        const isAttended = attendanceFilter === 'attended';
        matchesStatus = guest.attended === isAttended;
      }
    }

    let matchesCategory = true;
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'unassigned') {
        matchesCategory = !guest.category || !guest.category.trim();
      } else {
        matchesCategory = (guest.category || '').trim().toLowerCase() === categoryFilter.trim().toLowerCase();
      }
    }

    let matchesInvitationType = true;
    if (invitationTypeFilter !== 'all') {
      if (invitationTypeFilter === 'unassigned') {
        matchesInvitationType = !guest.invitationType || !guest.invitationType.trim();
      } else {
        matchesInvitationType = (guest.invitationType || '').trim().toLowerCase() === invitationTypeFilter.trim().toLowerCase();
      }
    }
    
    return matchesSearch && matchesStatus && matchesCategory && matchesInvitationType;
  }).sort((a, b) => {
    if (sortBy === 'category_setting' || sortBy === 'category_desc') {
      const rankA = getCategoryRank(a.category);
      const rankB = getCategoryRank(b.category);
      if (rankA !== rankB) {
        if (rankA === 999999) return 1;
        if (rankB === 999999) return -1;
        return sortBy === 'category_setting' ? rankA - rankB : rankB - rankA;
      }
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortBy === 'name_asc') {
      return (a.name || '').localeCompare(b.name || '');
    }
    // 'newest'
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
    if (timeB !== timeA) return timeB - timeA;
    return (a.name || '').localeCompare(b.name || '');
  });

  const totalPages = itemsPerPage === 'all' ? 1 : Math.max(1, Math.ceil(filteredGuests.length / itemsPerPage));
  const startIndex = itemsPerPage === 'all' ? 0 : (currentPage - 1) * itemsPerPage;
  const endIndex = itemsPerPage === 'all' ? filteredGuests.length : Math.min(startIndex + itemsPerPage, filteredGuests.length);
  const paginatedGuests = itemsPerPage === 'all' ? filteredGuests : filteredGuests.slice(startIndex, endIndex);

  // Reset page to 1 whenever filters or itemsPerPage change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, rsvpFilter, attendanceFilter, categoryFilter, invitationTypeFilter, sortBy, activeTab, itemsPerPage]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Daftar Tamu - ${event?.title || 'Event'}`, 14, 15);
    
    const tableColumn = ["No", "Nama", "Alamat", "No. Hp", "Kategori", "Tipe Undangan", "Sesi", "Pax (Orang)", "RSVP", "Check-In", "Waktu Kehadiran"];
    const tableRows: any[] = [];

    filteredGuests.forEach((guest, index) => {
      const effectivePax = guest.rsvpStatus === 'declined' ? 0 : Math.max(1, Number(guest.pax) || 1);
      const guestData = [
        index + 1,
        guest.name,
        guest.address || '-',
        guest.phone || '-',
        guest.category || '-',
        guest.invitationType || '-',
        guest.session || '-',
        `${effectivePax} Orang`,
        guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Pending',
        guest.attended ? 'Sudah Scan' : 'Belum Hadir',
        guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
      ];
      tableRows.push(guestData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });

    doc.save(`Daftar_Tamu_${event?.title || 'Event'}.pdf`);
  };

  const handleDownloadQR = async () => {
    if (qrRef.current && activeQrGuest) {
      try {
        const prefix = qrModalViewMode === 'card' ? 'Card_QR' : 'QR_Label';
        const fileName = `${prefix}_${activeQrGuest.name.replace(/\s+/g, '_')}_${(event?.title || 'Event').replace(/\s+/g, '_')}.png`;
        await exportCardToPng(qrRef.current, fileName);
      } catch (error) {
        console.warn('Failed to download QR card:', error);
        showAlert('Gagal', 'Gagal mengunduh kartu QR.', 'error');
      }
    }
  };

  const handlePrintSingleGuest = (guest: Guest, mode: 'card' | 'standard') => {
    setSinglePrintGuest(guest);
    setPrintFormat(mode === 'card' ? 'card-4' : 'standard');
    setTimeout(() => {
      window.print();
    }, 180);
  };

  const handleExecuteBulkPrint = () => {
    setSinglePrintGuest(null);
    setIsPrintModalOpen(false);
    setTimeout(() => {
      window.print();
    }, 180);
  };

  const getQrTicketLink = (ticketCode: string) => {
    const baseUrl = window.location.origin;
    const rawThumb = event?.thumbnailUrl || event?.frameOverlayUrl || '';
    if (!rawThumb) {
      return `${baseUrl}/rsvp/${eventId}/${ticketCode}`;
    }
    let hash = 0;
    for (let i = 0; i < rawThumb.length; i++) {
      hash = ((hash << 5) - hash + rawThumb.charCodeAt(i)) | 0;
    }
    const v = Math.abs(hash).toString(36).slice(0, 6);
    return `${baseUrl}/rsvp/${eventId}/${ticketCode}?v=${v}`;
  };

  const generateShareLink = (guest: Guest) => {
    // If event has digital invite link, use it, else fallback to RSVP url.
    // In many real scenarios, the RSVP link is the invite.
    let inviteUrl = getQrTicketLink(guest.ticketCode);
    
    if (event?.digitalInviteLink) {
        inviteUrl = `${event.digitalInviteLink}${event.digitalInviteLink.includes('?') ? '&' : '?'}to=${encodeURIComponent(guest.name)}&ticket=${guest.ticketCode}`;
    }
    return inviteUrl;
  };

  const handleShareWA = (guest: Guest) => {
    const qrLink = getQrTicketLink(guest.ticketCode);
    
    let digitalInviteLink = event?.digitalInviteLink || qrLink;
    if (event?.digitalInviteLink) {
        const separator = event.digitalInviteLink.includes('?') ? '&' : '?';
        digitalInviteLink = `${event.digitalInviteLink}${separator}to=${encodeURIComponent(guest.name)}&ticket=${guest.ticketCode}${guest.phone ? `&phone=${encodeURIComponent(guest.phone)}` : ''}${guest.session ? `&session=${encodeURIComponent(guest.session)}` : ''}`;
    }

    const senderName = event?.coupleName || clientName || event?.title || 'Kami';
    
    const template = waTemplates.find(t => t.id === selectedTemplateId) || waTemplates[0];
    const defaultMessageContent = `Halo *[GUEST_NAME]* 👋🏻\n\nDengan penuh rasa hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara spesial kami:\n\n✨ *[EVENT_TITLE]* ✨\n\nUntuk konfirmasi kehadiran saat acara berlangsung, silakan tunjukkan QR Code berikut:\n🔳 [QR_LINK]\n\nDetail lengkap acara dapat dilihat melalui undangan digital berikut:\n💌 [INVITE_LINK]\n\nMerupakan suatu kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir serta memberikan doa dan restu kepada kami.\n\nAtas perhatian dan kehadirannya, kami ucapkan terima kasih 🙏🏻\n\nHormat kami,\n*[SENDER_NAME]*`;
    const templateContent = template?.content || defaultMessageContent;

    const message = templateContent
      .replace(/\[GUEST_NAME\]/g, guest.name)
      .replace(/\[EVENT_TITLE\]/g, event?.title || '')
      .replace(/\[QR_LINK\]/g, qrLink)
      .replace(/\[INVITE_LINK\]/g, digitalInviteLink)
      .replace(/\[SENDER_NAME\]/g, senderName);

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const openBlastModal = () => {
    const guestsToBlast = selectedGuestIds.length > 0 
      ? filteredGuests.filter(g => selectedGuestIds.includes(g.id!))
      : filteredGuests;

    const validGuests = guestsToBlast.filter(g => g.phone && g.phone.length >= 9);
    if (validGuests.length === 0) {
      showAlert('Info', 'Tidak ada tamu dengan nomor WhatsApp yang valid untuk diblast.', 'info');
      return;
    }

    const currentWaBlastCount = event?.waBlastCount || 0;
    const freeWaBlastQuota = 50;
    const userWaBlastQuota = appUser?.waBlastQuota || 0;
    const availableWaBlastQuota = Math.max(0, freeWaBlastQuota - currentWaBlastCount) + userWaBlastQuota;

    if (appUser?.role !== 'superadmin' && validGuests.length > availableWaBlastQuota) {
       showAlert(
         'Kuota Tidak Mencukupi', 
         `Anda mencoba mengirim ${validGuests.length} pesan, namun sisa kuota WA Blast Anda gabungan dari Free (sisa ${Math.max(0, freeWaBlastQuota - currentWaBlastCount)}) dan Add-on (${userWaBlastQuota}) adalah ${availableWaBlastQuota}. \n\nSilakan beli add-on Kuota WA Blast di menu Layanan (Katalog), atau kurangi jumlah pilihan tamu, atau gunakan tombol pesan WA manual (opsi gratis tanpa batas).`, 
         'warning'
       );
       return;
    }

    // Default template or last used one
    if (waTemplates.length > 0 && !selectedTemplateId) {
       setSelectedTemplateId(localStorage.getItem(`waTemplateId_${eventId}`) || waTemplates[0].id || '');
    }

    setIsBlastModalOpen(true);
  };

  const handleBlastWA = async () => {
    setIsBlastModalOpen(false);
    
    const guestsToBlast = selectedGuestIds.length > 0 
      ? filteredGuests.filter(g => selectedGuestIds.includes(g.id!))
      : filteredGuests;

    const validGuests = guestsToBlast.filter(g => g.phone && g.phone.length >= 9);
    
    const currentWaBlastCount = event?.waBlastCount || 0;
    const freeWaBlastQuota = 50;
    const userWaBlastQuota = appUser?.waBlastQuota || 0;

    setIsBlasting(true);
    let successCount = 0;
    let failCount = 0;
    let errors: string[] = [];

    try {
      const { sendFonnteMessage } = await import('../lib/fonnte');
      const template = waTemplates.find(t => t.id === selectedTemplateId) || waTemplates[0];

      // Use a default message if template is missing but should fallback
      const defaultMessageContent = `Halo *[GUEST_NAME]* 👋🏻\n\nDengan penuh rasa hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara spesial kami:\n\n✨ *[EVENT_TITLE]* ✨\n\nUntuk konfirmasi kehadiran saat acara berlangsung, silakan tunjukkan QR Code berikut:\n🔳 [QR_LINK]\n\nDetail lengkap acara dapat dilihat melalui undangan digital berikut:\n💌 [INVITE_LINK]\n\nMerupakan suatu kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir serta memberikan doa dan restu kepada kami.\n\nAtas perhatian dan kehadirannya, kami ucapkan terima kasih 🙏🏻\n\nHormat kami,\n*[SENDER_NAME]*`;

      const templateContent = template?.content || defaultMessageContent;

      for (const guest of validGuests) {
          const baseUrl = window.location.origin;
          const qrLink = getQrTicketLink(guest.ticketCode);
          
          let digitalInviteLink = event?.digitalInviteLink || qrLink;
          if (event?.digitalInviteLink) {
              const separator = event.digitalInviteLink.includes('?') ? '&' : '?';
              digitalInviteLink = `${event.digitalInviteLink}${separator}to=${encodeURIComponent(guest.name)}&ticket=${guest.ticketCode}${guest.phone ? `&phone=${encodeURIComponent(guest.phone)}` : ''}${guest.session ? `&session=${encodeURIComponent(guest.session)}` : ''}`;
          }

          const senderName = event?.coupleName || clientName || event?.title || 'Kami';
          
          let message = templateContent
            .replace(/\[GUEST_NAME\]/g, guest.name)
            .replace(/\[EVENT_TITLE\]/g, event?.title || '')
            .replace(/\[QR_LINK\]/g, qrLink)
            .replace(/\[INVITE_LINK\]/g, digitalInviteLink)
            .replace(/\[SENDER_NAME\]/g, senderName);

          const rawImgUrl = event?.thumbnailUrl || event?.frameOverlayUrl || 'https://queinvite.yulovi.com/wp-content/uploads/2026/06/Tumbnail.webp';
          const imgUrl: string | undefined = rawImgUrl.startsWith('/') ? `${baseUrl}${rawImgUrl}` : rawImgUrl;
          
          const result = await sendFonnteMessage(null, guest.phone!, message, imgUrl);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            if (result.error && !errors.includes(result.error)) {
              errors.push(result.error);
            }
          }

          // delay 3 seconds
          await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Update Quotas
      if (successCount > 0 && appUser?.role !== 'superadmin') {
         const countUsedFromFree = Math.min(successCount, Math.max(0, freeWaBlastQuota - currentWaBlastCount));
         const countUsedFromUser = successCount - countUsedFromFree;
         
         try {
           await updateDoc(doc(db, 'events', eventId!), { waBlastCount: currentWaBlastCount + successCount, updatedAt: serverTimestamp() });
         } catch (e) {
           console.warn("Could not update waBlastCount (Firebase Rules not deployed)", e);
         }
         
         if (countUsedFromUser > 0 && appUser?.id) {
             try {
               await updateDoc(doc(db, 'users', appUser.id), { waBlastQuota: Math.max(0, userWaBlastQuota - countUsedFromUser), updatedAt: serverTimestamp() });
             } catch (e) {
               console.warn("Could not update waBlastQuota (Firebase Rules not deployed)", e);
             }
         }
      }

      // Save the selected template for the event in localStorage
      if (selectedTemplateId) {
         localStorage.setItem(`waTemplateId_${eventId}`, selectedTemplateId);
      }

      const errorMessage = errors.length > 0 ? `\n\nAlasan Gagal:\n${errors.join('\n')}` : '';
      showAlert('Blast Selesai', `Berhasil mengirim: ${successCount}\nGagal mengirim: ${failCount}${errorMessage}`, successCount > 0 ? 'success' : 'warning');
      setSelectedGuestIds([]); // clear selection after blast
    } catch (error) {
      console.error(error);
      showAlert('Gagal', 'Terjadi kesalahan saat memproses blast WhatsApp.', 'error');
    } finally {
      setIsBlasting(false);
    }
  };

  const handleExportExcel = () => {
    const data = filteredGuests.map((guest, index) => {
      const effectivePax = guest.rsvpStatus === 'declined' ? 0 : Math.max(1, Number(guest.pax) || 1);
      return {
        "No": index + 1,
        "Nama Tamu": guest.name,
        "Alamat": guest.address || '-',
        "No. Hp": guest.phone || '-',
        "Kategori": guest.category || '-',
        "Tipe Undangan": guest.invitationType || '-',
        "Sesi": guest.session || '-',
        "Jumlah Pax (Orang)": effectivePax,
        "Status RSVP (Pra Check-In)": guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Pending',
        "Status Check-In": guest.attended ? 'Hadir' : 'Belum Hadir',
        "Waktu Kehadiran": guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-',
        "Petugas Scan Kehadiran": guest.checkInStaff || '-',
        "Status Souvenir": guest.souvenirTaken ? (guest.souvenirName || 'Sudah Diambil') : 'Belum',
        "Petugas Souvenir": guest.souvenirTakenBy || '-'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tamu");
    XLSX.writeFile(workbook, `Daftar_Tamu_${event?.title || 'Event'}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const data = [{
      "Nama Tamu": '',
      "Alamat": '',
      "No. Hp": '',
      "Kategori": '',
      "Tipe Undangan": '',
      "Sesi": '',
      "Jumlah Pax": 1
    }];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tamu");
    XLSX.writeFile(workbook, "Template_Import_Tamu.xlsx");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setIsImporting(true);
        setImportProgress({ current: 0, total: 0 });

        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        let duplicateNames: string[] = [];
        const existingNames = new Set(guests.map(g => (g.name || '').toLowerCase().trim()));
        const validRows: any[] = [];

        for (const row of data as any[]) {
          let guestName = row["Nama Tamu"] || row.Nama || row["nama"] || row["Nama Lengkap"];
          if (!guestName) continue;
          
          const cleanedName = String(guestName).trim();
          if (!cleanedName) continue;

          if (existingNames.has(cleanedName.toLowerCase())) {
            duplicateNames.push(cleanedName);
            continue;
          }

          existingNames.add(cleanedName.toLowerCase());

          const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
          const phone = row["No. Hp"] || row.Telepon || row.hp || row.Phone || row["No HP"] || "";
          const address = row.Alamat || row.address || row.Kota || "";
          const category = row.Kategori || row.category || "";
          const invitationType = row["Tipe Undangan"] || row["Jenis Undangan"] || row["Tipe"] || row.invitationType || row.tipe_undangan || "";
          const session = row.Sesi || row.session || "";
          const email = row.Email || row.email || "";
          const rawPax = row["Jumlah Pax"] || row["Pax"] || row.pax || row["Jumlah Orang"] || 1;
          const pax = Math.max(1, parseInt(String(rawPax), 10) || 1);

          validRows.push({
            name: cleanedName,
            ticketCode,
            phone: String(phone),
            address: String(address),
            category: String(category),
            invitationType: String(invitationType).trim(),
            session: String(session),
            email: String(email),
            pax
          });
        }

        if (validRows.length === 0) {
          setIsImporting(false);
          setImportProgress(null);
          if (duplicateNames.length > 0) {
            showAlert('Info', `Semua data (${duplicateNames.length} nama) sudah ada di daftar tamu (duplikat).`, 'info');
          } else {
            showAlert('Peringatan', 'Tidak ada data tamu yang valid untuk diimpor. Pastikan ada kolom "Nama Tamu".', 'warning');
          }
          return;
        }

        setImportProgress({ current: 0, total: validRows.length });

        // Batch write in chunks of 400 (well within Firestore 500 limit)
        const newlyCreatedGuests: Guest[] = [];
        const BATCH_SIZE = 400;

        for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
          const chunk = validRows.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);

          for (const item of chunk) {
            const guestDocRef = doc(collection(db, 'events', eventId!, 'guests'));
            const payload: any = {
              eventId: eventId!,
              name: item.name,
              ticketCode: item.ticketCode,
              pax: item.pax || 1,
              rsvpStatus: 'pending',
              attended: false,
              category: item.category,
              invitationType: item.invitationType,
              session: item.session,
              email: item.email,
              phone: item.phone,
              address: item.address,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };
            batch.set(guestDocRef, payload);
            newlyCreatedGuests.push({ id: guestDocRef.id, ...payload });
          }

          await batch.commit();
          setImportProgress({ current: Math.min(i + chunk.length, validRows.length), total: validRows.length });
        }

        setGuests(prev => [...newlyCreatedGuests, ...prev]);

        let msg = `Berhasil mengimpor ${newlyCreatedGuests.length} tamu sekaligus ke database!`;
        if (duplicateNames.length > 0) {
          const duplicatesList = duplicateNames.slice(0, 10).join(', ') + (duplicateNames.length > 10 ? ` dan ${duplicateNames.length - 10} lainnya` : '');
          msg += `\n\nInfo: ${duplicateNames.length} nama duplikat diabaikan:\n${duplicatesList}`;
        }
        showAlert('Sukses Impor', msg, 'success');

      } catch (error) {
        console.error('Error importing Excel:', error);
        showAlert('Error', 'Terjadi kesalahan saat mengimpor file Excel.', 'error');
      } finally {
        setIsImporting(false);
        setImportProgress(null);
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerateSampleGuests = async (count = 1000) => {
    if (!eventId) return;

    const confirmed = await showConfirm(
      `Apakah Anda yakin ingin membuat ${count.toLocaleString('id-ID')} data tamu contoh untuk acara ini?\n\nData akan langsung disimpan ke database dengan kode QR/tiket unik untuk uji coba scan dan kapasitas.`
    );
    if (!confirmed) return;

    setIsGeneratingSample(true);
    setSampleProgress({ current: 0, total: count });

    try {
      const FIRST_NAMES = ['Ahmad', 'Muhammad', 'Budi', 'Rizky', 'Dian', 'Siti', 'Nur', 'Dewi', 'Wahyu', 'Bayu', 'Eka', 'Hendra', 'Maya', 'Aditya', 'Sri', 'Dimas', 'Indah', 'Agus', 'Putri', 'Bambang', 'Anisa', 'Fajar', 'Tri', 'Rian', 'Lestari', 'Surya', 'Wulan', 'Gilang', 'Rina', 'Yusuf', 'Fitri', 'Doni', 'Ratna', 'Teguh', 'Nadia', 'Ilham', 'Tia', 'Aris', 'Sari', 'Reza'];
      const LAST_NAMES = ['Santoso', 'Pratama', 'Kusuma', 'Hidayah', 'Wijaya', 'Nugraha', 'Permatasari', 'Saputra', 'Setiawan', 'Gunawan', 'Anggraini', 'Putra', 'Wahyuni', 'Anggara', 'Ramadhan', 'Utami', 'Purnomo', 'Syahputra', 'Wibowo', 'Kurniawan', 'Siregar', 'Lubis', 'Nasution', 'Harahap', 'Ginting', 'Sitorus', 'Simanjuntak', 'Hutapea', 'Sihombing', 'Panjaitan', 'Pasaribu'];
      const CITIES = ['Jakarta Selatan', 'Jakarta Barat', 'Jakarta Timur', 'Bandung', 'Surabaya', 'Semarang', 'Yogyakarta', 'Solo', 'Malang', 'Denpasar', 'Medan', 'Bekasi', 'Tangerang', 'Depok', 'Bogor'];

      const categories = (event?.guestCategories && event.guestCategories.length > 0) ? event.guestCategories : ['VIP', 'Keluarga', 'Reguler'];
      const invTypes = availableInvitationTypes.length > 0 ? availableInvitationTypes : ['Undangan Fisik', 'Undangan Cetak', 'Undangan Digital'];
      const sessions = (event?.sessions && event.sessions.length > 0) ? event.sessions : ['Akad Nikah', 'Resepsi'];

      const existingNames = new Set(guests.map(g => (g.name || '').toLowerCase().trim()));
      const generatedList: any[] = [];

      for (let i = 1; i <= count; i++) {
        const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
        let candidateName = `${fn} ${ln}`;
        if (existingNames.has(candidateName.toLowerCase())) {
          candidateName = `${fn} ${ln} ${i}`;
        }
        existingNames.add(candidateName.toLowerCase());

        const ticketCode = 'TKT' + Math.random().toString(36).substring(2, 8).toUpperCase() + String(i).padStart(3, '0');
        const phone = `0812${Math.floor(10000000 + Math.random() * 90000000)}`;
        const city = CITIES[Math.floor(Math.random() * CITIES.length)];
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const invType = invTypes[Math.floor(Math.random() * invTypes.length)];
        const ses = sessions[Math.floor(Math.random() * sessions.length)];

        generatedList.push({
          name: candidateName,
          ticketCode,
          phone,
          address: city,
          category: cat,
          invitationType: invType,
          session: ses,
          pax: Math.random() < 0.65 ? 1 : 2
        });
      }

      // Write in batches of 400
      const newlyCreatedGuests: Guest[] = [];
      const BATCH_SIZE = 400;

      for (let i = 0; i < generatedList.length; i += BATCH_SIZE) {
        const chunk = generatedList.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const item of chunk) {
          const guestDocRef = doc(collection(db, 'events', eventId, 'guests'));
          const payload: any = {
            eventId,
            name: item.name,
            ticketCode: item.ticketCode,
            pax: item.pax || 1,
            rsvpStatus: 'pending',
            attended: false,
            category: item.category,
            invitationType: item.invitationType,
            session: item.session,
            phone: item.phone,
            address: item.address,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          batch.set(guestDocRef, payload);
          newlyCreatedGuests.push({ id: guestDocRef.id, ...payload });
        }

        await batch.commit();
        setSampleProgress({ current: Math.min(i + chunk.length, generatedList.length), total: generatedList.length });
      }

      setGuests(prev => [...newlyCreatedGuests, ...prev]);
      showAlert(
        'Berhasil!',
        `Sukses membuat ${count.toLocaleString('id-ID')} data tamu contoh! Sekarang semua data tamu tampil lengkap di tabel dengan kode tiket dan siap untuk dites scan.`,
        'success'
      );
    } catch (error) {
      console.error('Error generating sample guests:', error);
      showAlert('Error', 'Gagal membuat data tamu contoh. Cek koneksi.', 'error');
    } finally {
      setIsGeneratingSample(false);
      setSampleProgress(null);
    }
  };

  const handleClearAllGuests = async () => {
    if (!eventId || guests.length === 0) return;

    if (appUser?.role !== 'superadmin' && appUser?.role !== 'owner' && appUser?.role !== 'admin' && appUser?.role !== 'partner') {
      showAlert('Ditolak', 'Hanya Super Admin, Owner, Admin, atau Partner yang dapat menghapus semua tamu.', 'error');
      return;
    }

    const confirmed = await showConfirm(
      `PERINGATAN: Apakah Anda yakin ingin MENGHAPUS SEMUA (${guests.length}) tamu pada acara ini?\n\nTindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const BATCH_SIZE = 400;
      for (let i = 0; i < guests.length; i += BATCH_SIZE) {
        const chunk = guests.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const g of chunk) {
          if (g.id) {
            batch.delete(doc(db, 'events', eventId, 'guests', g.id));
          }
        }
        await batch.commit();
      }

      setGuests([]);
      setSelectedGuestIds([]);
      showAlert('Berhasil', 'Semua data tamu berhasil dihapus.', 'success');
    } catch (error) {
      console.error('Error clearing guests:', error);
      showAlert('Error', 'Gagal menghapus semua data tamu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedGuestIds(filteredGuests.map(g => g.id));
    } else {
      setSelectedGuestIds([]);
    }
  };

  const handleSelectGuest = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedGuestIds(prev => [...prev, id]);
    } else {
      setSelectedGuestIds(prev => prev.filter(guestId => guestId !== id));
    }
  };

  const handleEditGuestClick = (guest: Guest) => {
    setEditingGuestId(guest.id!);
    setEditGuestName(guest.name || '');
    setEditGuestAddress(guest.address || '');
    setEditGuestPhone(guest.phone || '');
    setEditGuestCategory(guest.category || '');
    setEditGuestInvitationType(guest.invitationType || '');
    setEditGuestSession(guest.session || '');
    setEditGuestPax(String(guest.pax !== undefined && guest.pax > 0 ? Number(guest.pax) : 1));
    setEditGuestRsvpStatus(guest.rsvpStatus || 'pending');
    setIsEditingGuest(true);
  };

  const handleSaveEditGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGuestId || !event) return;

    try {
      const originalGuest = guests.find(g => g.id === editingGuestId);
      if (!originalGuest) return;
      const finalPax = editGuestRsvpStatus === 'declined' ? 0 : Math.max(1, Number(editGuestPax) || 1);

      if (appUser?.role === 'client') {
        // Create approval request
        await addDoc(collection(db, 'guest_edit_requests'), {
          eventId: eventId,
          eventTitle: event.title || 'Unknown Event',
          guestId: editingGuestId,
          clientId: event.clientId || '', 
          partnerId: event.partnerId || null,
          originalData: {
            name: originalGuest.name,
            address: originalGuest.address || '',
            phone: originalGuest.phone || '',
            category: originalGuest.category || '',
            invitationType: originalGuest.invitationType || '',
            session: originalGuest.session || '',
            pax: originalGuest.pax ?? 1,
            rsvpStatus: originalGuest.rsvpStatus || 'pending',
          },
          requestedData: {
            name: editGuestName,
            address: editGuestAddress,
            phone: editGuestPhone,
            category: editGuestCategory,
            invitationType: editGuestInvitationType,
            session: editGuestSession,
            pax: finalPax,
            rsvpStatus: editGuestRsvpStatus,
          },
          status: 'pending',
          requestedAt: serverTimestamp()
        });
        
        if (event.partnerId) {
          try {
            const partnerDoc = await getDoc(doc(db, 'users', event.partnerId));
            if (partnerDoc.exists()) {
              const partnerData = partnerDoc.data();
              if (partnerData.phone) {
                const { sendFonnteMessage } = await import('../lib/fonnte');
                const message = `*🔔 Notifikasi Guestly - Pengajuan Edit Tamu*\n\nHalo, terdapat pengajuan perubahan data tamu dari Klien untuk acara *${event.title || 'Unknown Event'}*.\n\n*Data Lama:*\n- Nama: ${originalGuest.name}\n- No HP: ${originalGuest.phone || '-'}\n- Kategori: ${originalGuest.category || '-'}\n- Tipe Undangan: ${originalGuest.invitationType || '-'}\n- Alamat: ${originalGuest.address || '-'}\n- Sesi: ${originalGuest.session || '-'}\n- Pax: ${originalGuest.pax ?? 1} Orang\n\n*Data Baru:*\n- Nama: ${editGuestName}\n- No HP: ${editGuestPhone || '-'}\n- Kategori: ${editGuestCategory || '-'}\n- Tipe Undangan: ${editGuestInvitationType || '-'}\n- Alamat: ${editGuestAddress || '-'}\n- Sesi: ${editGuestSession || '-'}\n- Pax: ${finalPax} Orang\n\nSilakan login ke dashboard Guestly dan cek menu *Approvals* untuk menyetujui atau menolak perubahan ini.`;
                await sendFonnteMessage(null, partnerData.phone, message);
              }
            }
          } catch (notifyError) {
            console.warn('Failed to notify partner via Fonnte: Missing permissions to read partner phone number.', notifyError);
          }
        }

        showAlert('Berhasil', 'Permintaan edit tamu telah dikirim untuk disetujui oleh Partner/Admin.', 'success');
      } else {
        // Save directly
        await updateDoc(doc(db, 'events', eventId!, 'guests', editingGuestId), {
           name: editGuestName,
           address: editGuestAddress,
           phone: editGuestPhone,
           category: editGuestCategory,
           invitationType: editGuestInvitationType,
           session: editGuestSession,
           pax: finalPax,
           rsvpStatus: editGuestRsvpStatus,
           updatedAt: serverTimestamp()
        });
        setGuests(guests.map(g => g.id === editingGuestId ? {
          ...g,
          name: editGuestName,
          address: editGuestAddress,
          phone: editGuestPhone,
          category: editGuestCategory,
          invitationType: editGuestInvitationType,
          session: editGuestSession,
          pax: finalPax,
          rsvpStatus: editGuestRsvpStatus
        } : g));
        showAlert('Berhasil', 'Data tamu berhasil diubah.', 'success');
      }
      setIsEditingGuest(false);
      setEditingGuestId(null);
    } catch (error) {
      console.error(error);
      showAlert('Error', 'Gagal mengedit tamu.', 'error');
    }
  };

  const effectiveEventPartnerId = event
    ? (clientPartnerId && (clientPartnerId === appUser?.id || clientPartnerId === appUser?.partnerId)
        ? clientPartnerId
        : (teamPartnerIds.includes(appUser?.id || '') || (appUser?.partnerId && teamPartnerIds.includes(appUser.partnerId))
            ? (appUser?.partnerId || appUser?.id)
            : (event.partnerId || clientPartnerId || undefined)))
    : undefined;

  if (appUser && !canUserAccessEvent(appUser, eventId, effectiveEventPartnerId, teamPartnerIds)) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white p-8 rounded-2xl shadow-sm border border-red-200 text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Akses Acara Ditolak</h2>
        <p className="text-sm text-gray-600">
          Akun Anda ({getRoleLabel(appUser.role, appUser.staffType)}) belum ditugaskan pada acara ini. Anda hanya dapat melihat acara yang telah ditugaskan kepada Anda.
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Detail Acara</h1>
          {isStaff && (
            <p className="text-xs text-gray-500 mt-0.5">
              Mode Petugas: <span className="font-semibold text-indigo-600">{currentOperator}</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full sm:w-auto">
          {!isStaff && (
            <>
              <button
                 onClick={() => setIsEmbedModalOpen(true)}
                 className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 font-medium text-sm sm:text-base"
               >
                 <Code className="w-4 sm:w-5 h-4 sm:h-5 hidden sm:block" />
                 <span className="hidden sm:inline">Embed</span>
                 <span className="sm:hidden">Embed</span>
               </button>
              <Link
                 to={`/public/rsvp/${eventId}`}
                 target="_blank"
                 className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-3 sm:px-4 py-2 bg-pink-500 text-white rounded-md hover:bg-pink-600 font-medium text-sm sm:text-base"
               >
                 <FileText className="w-4 sm:w-5 h-4 sm:h-5 hidden sm:block" />
                 <span className="hidden sm:inline">Form RSVP</span>
                 <span className="sm:hidden">RSVP</span>
               </Link>
            </>
          )}
          {!isStaffSouvenirOnly && (
            <Link
              to={`/events/${eventId}/greeting`}
              target="_blank"
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 font-medium text-sm sm:text-base"
            >
              <Monitor className="w-4 sm:w-5 h-4 sm:h-5 hidden sm:block" />
              <span className="hidden sm:inline">Layar Sapa</span>
              <span className="sm:hidden">Layar</span>
            </Link>
          )}
          <Link
            to={isStaffSouvenirOnly ? `/auth/login/events/${eventId}/scan?mode=souvenir` : isStaffCheckinOnly ? `/auth/login/events/${eventId}/scan?mode=checkin` : `/auth/login/events/${eventId}/scan`}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium text-sm sm:text-base"
          >
            <ScanLine className="w-4 sm:w-5 h-4 sm:h-5" />
            <span className="hidden sm:inline">{isStaffSouvenirOnly ? 'Scanner Souvenir' : isStaffCheckinOnly ? 'Scanner Kehadiran' : 'Scanner'}</span>
            <span className="sm:hidden">Scan</span>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
           <h2 className="text-lg font-medium text-gray-900">Informasi Acara</h2>
           {event && (
             <div className="flex items-center gap-3">
               <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                 event.status === 'published' ? 'bg-green-100 text-green-800' : 
                 event.status === 'completed' ? 'bg-gray-100 text-gray-800' : 
                 'bg-yellow-100 text-yellow-800'
               }`}>
                 {event.status}
               </span>
               {appUser?.role !== 'client' && !isStaff && (
                 <select 
                    value={event.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="block text-sm border-gray-300 rounded-md py-1 pl-3 pr-8 focus:ring-indigo-500 focus:border-indigo-500"
                 >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="completed">Completed</option>
                 </select>
               )}
             </div>
           )}
        </div>
        <div className="p-6">
          {loading && !event ? (
            <p className="text-gray-500 text-sm">Memuat detail acara...</p>
          ) : event ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Nama Acara</h3>
                  <p className="mt-1 text-base text-gray-900">{event.title}</p>
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Waktu Pelaksanaan</h3>
                  <p className="mt-1 text-base text-gray-900">
                    {parseFirestoreDate(event.date) ? format(parseFirestoreDate(event.date)!, 'dd MMMM yyyy') : '-'} {event.time && `• ${event.time}`}
                  </p>
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Masa Aktif</h3>
                  <p className="mt-1 text-base text-gray-900">
                    {parseFirestoreDate(event.activeUntil) ? format(parseFirestoreDate(event.activeUntil)!, 'dd MMMM yyyy') : '-'}
                  </p>
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Lokasi</h3>
                  <p className="mt-1 text-base text-gray-900">{event.location || '-'}</p>
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Kategori Tamu Disediakan</h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {event.guestCategories && event.guestCategories.length > 0 ? (
                      event.guestCategories.map(cat => (
                        <span key={cat} className="inline-flex px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-md">{cat}</span>
                      ))
                    ) : (
                      <span className="text-gray-900">-</span>
                    )}
                  </div>
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Sesi Acara Disediakan</h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {event.sessions && event.sessions.length > 0 ? (
                      event.sessions.map(ses => (
                        <span key={ses} className="inline-flex px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-md">{ses}</span>
                      ))
                    ) : (
                      <span className="text-gray-900">-</span>
                    )}
                  </div>
               </div>
               <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500">Tipe Undangan Disediakan</h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {availableInvitationTypes.map(invType => (
                      <span key={invType} className="inline-flex px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium rounded-md">{invType}</span>
                    ))}
                  </div>
               </div>
               <div className="md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-medium text-gray-500">Thumbnail WA / Foto Mempelai</h3>
                    {!isStaff && (
                      <button
                        type="button"
                        onClick={openThumbnailModal}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>{event.thumbnailUrl ? 'Ubah Thumbnail' : 'Atur Foto Mempelai'}</span>
                      </button>
                    )}
                  </div>
                  {event.thumbnailUrl ? (
                    <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 bg-slate-50/70 max-w-xl">
                      <img
                        src={event.thumbnailUrl}
                        alt="Thumbnail Acara / Foto Mempelai"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 bg-white shrink-0 shadow-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Thumbnail Kustom Aktif
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate" title={event.thumbnailUrl}>
                          {event.thumbnailUrl}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Ditampilkan pada preview link WhatsApp & halaman undangan tiket tamu.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 max-w-xl">
                      <div className="text-xs text-slate-500">
                        Belum ada foto mempelai / thumbnail kustom. Saat ini menggunakan logo default sistem.
                      </div>
                      {!isStaff && (
                        <button
                          type="button"
                          onClick={openThumbnailModal}
                          className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                        >
                          Upload Foto
                        </button>
                      )}
                    </div>
                  )}
               </div>
               {/* E-Invitation & Digital Pass Configuration */}
               {!isStaff && (
                 <div className="md:col-span-2 pt-3 border-t border-slate-100">
                   <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                     <div>
                       <h3 className="text-sm font-semibold text-slate-800">Desain E-Invitation & Kartu Akses Tamu</h3>
                       <p className="text-xs text-slate-500 mt-0.5">
                         Mengatur tampilan link undangan personal tamu (menampilkan Nama Acara, Foto Mempelai, Kepada, & Barcode Check-In).
                       </p>
                     </div>
                     {guests.length > 0 && (
                       <Link
                         to={`/rsvp/${eventId}/${guests[0].ticketCode}`}
                         target="_blank"
                         className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                       >
                         <QrCode className="w-3.5 h-3.5" />
                         <span>Pratinjau E-Invitation ({guests[0].name})</span>
                       </Link>
                     )}
                   </div>

                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-50/70 border border-slate-200 rounded-xl p-4">
                     <div>
                       <div className="flex items-center justify-between mb-2">
                         <label className="block text-xs font-semibold text-slate-700">
                           Template Kartu E-Invitation (Cloudflare R2)
                         </label>
                         {appUser?.role === 'superadmin' && (
                           <Link
                             to="/auth/login/admin/e-invitation-templates"
                             className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline"
                           >
                             + Kelola Template
                           </Link>
                         )}
                       </div>
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                         {eInviteTemplates.map((tpl) => {
                           const activeTplId =
                             event.eInviteTemplateId ||
                             (eInviteTemplates.find((t) => t.isDefault) || eInviteTemplates[0])?.id;
                           const active = activeTplId === tpl.id;
                           return (
                             <button
                               key={tpl.id}
                               type="button"
                               onClick={() =>
                                 handleUpdateEInviteConfig({
                                   eInviteTemplateId: tpl.id,
                                   eInviteTemplateUrl: tpl.imageUrl || '',
                                 })
                               }
                               className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer text-left ${
                                 active
                                   ? 'bg-white border-indigo-600 text-indigo-700 ring-2 ring-indigo-500/20 shadow-2xs'
                                   : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'
                               }`}
                             >
                               <span className="truncate">{tpl.name}</span>
                               <span
                                 className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300"
                                 style={{ backgroundColor: tpl.footerColor || '#C27D7A' }}
                               />
                             </button>
                           );
                         })}
                       </div>
                     </div>

                     <div>
                       <label className="block text-xs font-semibold text-slate-700 mb-2">
                         Mode Tampilan Halaman Tamu
                       </label>
                       <div className="grid grid-cols-2 gap-2">
                         {[
                           { id: 'full', label: 'Lengkap (Undangan + QR + RSVP)' },
                           { id: 'compact', label: 'Ringkas (Fokus Kartu QR Saja)' },
                         ].map((m) => {
                           const active = (event.eInviteMode || 'full') === m.id;
                           return (
                             <button
                               key={m.id}
                               type="button"
                               onClick={() => handleUpdateEInviteConfig({ eInviteMode: m.id as 'full' | 'compact' })}
                               className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer text-center ${
                                 active
                                   ? 'bg-white border-indigo-600 text-indigo-700 ring-2 ring-indigo-500/20 shadow-2xs'
                                   : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'
                               }`}
                             >
                               {m.label}
                             </button>
                           );
                         })}
                       </div>
                     </div>
                   </div>
                 </div>
               )}
               {event.frameOverlayUrl && (
                 <div className="md:col-span-2">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Frame / Overlay Sapa Tamu</h3>
                    <div className="w-48 h-24 bg-gray-100 border border-gray-200 rounded-md overflow-hidden relative group">
                       <img src={event.frameOverlayUrl} alt="Frame" className="object-cover w-full h-full opacity-70 group-hover:opacity-100 transition-opacity" />
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <span className="text-xs bg-black/50 text-white px-2 py-1 rounded">Pratinjau</span>
                       </div>
                    </div>
                 </div>
               )}
            </div>
          ) : (
            <p className="text-red-500 text-sm">Acara tidak ditemukan.</p>
          )}
        </div>
      </div>

      {/* Live Real-Time Attendance, Pre-Check-In RSVP Pax (For Service Providers) & Souvenir Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-3.5 mt-6">
        {/* Card 1: Total Undangan */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-slate-500 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-600 whitespace-nowrap">Total Undangan</p>
            <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums leading-none">
              {guests.length.toLocaleString('id-ID')}
            </p>
            <span className="text-xs font-medium text-slate-500">undangan</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Total Alokasi:</span>
            <span className="font-mono tabular-nums font-semibold text-indigo-600">
              {guests.reduce((acc, g) => acc + (g.rsvpStatus === 'declined' ? 0 : Math.max(1, Number(g.pax) || 1)), 0).toLocaleString('id-ID')} Orang
            </span>
          </div>
        </div>

        {/* Card 2: Estimasi Datang (RSVP Pra Check-In) */}
        <div className="bg-indigo-50/35 p-4 rounded-lg border border-indigo-200 border-l-4 border-l-indigo-600 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-indigo-900 whitespace-nowrap">Estimasi Hadir (RSVP)</p>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-800 rounded whitespace-nowrap shrink-0">
              Pra Check-In
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <p className="text-2xl font-bold text-indigo-700 font-mono tabular-nums leading-none">
              {guests
                .filter(g => g.rsvpStatus === 'attending')
                .reduce((acc, g) => acc + Math.max(1, Number(g.pax) || 1), 0)
                .toLocaleString('id-ID')}
            </p>
            <span className="text-xs font-semibold text-indigo-700">Orang (Pax)</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-indigo-100/80 flex items-center justify-between text-[11px] font-mono tabular-nums">
            <span className="text-indigo-900 font-medium">
              {guests.filter(g => g.rsvpStatus === 'attending').length} hadir
            </span>
            <span className="text-amber-700 font-medium">
              {guests.filter(g => !g.rsvpStatus || g.rsvpStatus === 'pending').length} belum respon
            </span>
          </div>
        </div>

        {/* Card 3: Sudah Check-In (Live) */}
        <div className="bg-white p-4 rounded-lg border border-emerald-200 border-l-4 border-l-emerald-500 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-emerald-800 whitespace-nowrap">Sudah Check-In</p>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-[10px] font-semibold text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Live
              </span>
            </div>
            <div className="w-8 h-8 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums leading-none">
              {guests.filter(g => g.attended).length.toLocaleString('id-ID')}
            </p>
            <span className="text-xs font-semibold text-emerald-700 font-mono tabular-nums">
              ({guests.filter(g => g.attended).reduce((acc, g) => acc + Math.max(1, Number(g.pax) || 1), 0).toLocaleString('id-ID')} Orang)
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-emerald-100/70 flex items-center justify-between text-[11px]">
            <span className="text-emerald-700/90">Realisasi hadir:</span>
            <span className="font-mono tabular-nums font-semibold text-emerald-700">
              {guests.length > 0 ? Math.round((guests.filter(g => g.attended).length / guests.length) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Card 4: Belum Masuk Gate */}
        <div className="bg-white p-4 rounded-lg border border-amber-200 border-l-4 border-l-amber-500 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-800 whitespace-nowrap">Belum Masuk Gate</p>
            <div className="w-8 h-8 rounded-md bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums leading-none">
              {guests.filter(g => !g.attended).length.toLocaleString('id-ID')}
            </p>
            <span className="text-xs font-medium text-amber-700/80">undangan</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-amber-100/70 flex items-center justify-between text-[11px]">
            <span className="text-amber-700/90">Konfirmasi absen:</span>
            <span className="font-mono tabular-nums font-semibold text-rose-600">
              {guests.filter(g => g.rsvpStatus === 'declined').length} undangan
            </span>
          </div>
        </div>

        {/* Card 5: Souvenir Diambil */}
        <div className="bg-white p-4 rounded-lg border border-purple-200 border-l-4 border-l-purple-500 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-purple-800 whitespace-nowrap">Souvenir Diambil</p>
            <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
              <Gift className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <p className="text-2xl font-bold text-purple-700 font-mono tabular-nums leading-none">
              {guests.filter(g => g.souvenirTaken).length.toLocaleString('id-ID')}
            </p>
            <span className="text-xs font-medium text-purple-700/80">diserahkan</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-purple-100/70 flex items-center justify-between text-[11px]">
            <span className="text-purple-700/90">Belum ambil:</span>
            <span className="font-mono tabular-nums font-semibold text-purple-700">
              {guests.filter(g => !g.souvenirTaken).length.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs & Integrated Quota Bar */}
      <div className="mt-6 flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 gap-3">
        <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto">
          {!isStaff && (
            <button
              onClick={() => setActiveTab('rsvp')}
              className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'rsvp'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              RSVP & Ucapan
            </button>
          )}
          {!isStaffSouvenirOnly && (
            <>
              <button
                onClick={() => setActiveTab('guest-list')}
                className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                  activeTab === 'guest-list'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <span>Daftar Tamu</span>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  ({guests.length.toLocaleString('id-ID')})
                </span>
              </button>
              <button
                onClick={() => setActiveTab('attended')}
                className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                  activeTab === 'attended'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <span>Berhasil Scan</span>
                <span className="text-xs font-mono tabular-nums font-semibold text-emerald-600">
                  ({guests.filter(g => g.attended).length.toLocaleString('id-ID')})
                </span>
              </button>
            </>
          )}
          {!isStaffCheckinOnly && (
            <button
              onClick={() => setActiveTab('souvenir')}
              className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1.5 ${
                activeTab === 'souvenir'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Gift className="w-4 h-4" />
              <span>Souvenir & Logistik</span>
            </button>
          )}
        </nav>

        {(activeTab === 'guest-list' || activeTab === 'attended') && !isStaff && (
          <div className="pb-3 lg:pb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Kuota WA Blast:</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {Math.max(0, 50 - (event?.waBlastCount || 0)) + (appUser?.waBlastQuota || 0)}
              </span>
              <span>pesan</span>
            </div>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">·</span>
            <span className="text-slate-500 font-mono tabular-nums">
              Gratis: {Math.min(50, event?.waBlastCount || 0)}/50 terpakai
            </span>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">·</span>
            <span className="text-slate-500 font-mono tabular-nums">
              Add-on: {appUser?.waBlastQuota || 0}
            </span>
          </div>
        )}
      </div>

      {activeTab === 'souvenir' ? (
        <SouvenirManagement
          eventId={eventId!}
          event={event}
          guests={guests}
          onGuestsUpdated={() => fetchGuests(false)}
          currentUserEmail={appUser?.email}
          currentUserName={currentOperator}
        />
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden mt-4">
            <div className="p-4 sm:p-5 flex flex-col gap-4 border-b border-slate-200 bg-white">
              {/* Top Row: Section Title & Organized Action Toolbar */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 w-full">
                <div className="flex items-baseline gap-2 shrink-0">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 whitespace-nowrap">
                    {activeTab === 'rsvp' ? 'RSVP & Ucapan' : activeTab === 'attended' ? 'Berhasil Scan' : 'Daftar Tamu'}
                  </h2>
                  <span className="text-xs sm:text-sm font-mono tabular-nums font-medium text-slate-500 whitespace-nowrap">
                    {filteredGuests.length.toLocaleString('id-ID')} tamu
                    {guests.length > 0 && filteredGuests.length !== guests.length && (
                      <span className="text-slate-400"> dari {guests.length.toLocaleString('id-ID')}</span>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-start lg:justify-end gap-1.5 sm:gap-2 w-full lg:w-auto">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".xlsx, .xls"
                    className="hidden"
                  />

                  {/* Group 1: Document Import & Export Segmented Control */}
                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/60 p-0.5">
                    {!isStaff && (
                      <>
                        <button
                          onClick={handleDownloadTemplate}
                          className="h-8 px-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded-md flex items-center gap-1 transition-all whitespace-nowrap"
                          title="Download Template Excel"
                        >
                          <DownloadIcon className="w-3.5 h-3.5 text-slate-500" />
                          <span>Template</span>
                        </button>
                        <div className="w-px h-4 bg-slate-200/80" />
                        <button
                          onClick={handleImportClick}
                          disabled={isImporting || isGeneratingSample}
                          className="h-8 px-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded-md flex items-center gap-1 transition-all whitespace-nowrap disabled:opacity-50"
                          title="Import Excel (Mendukung > 1.000 Tamu Cepat)"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Import</span>
                        </button>
                        <div className="w-px h-4 bg-slate-200/80" />
                      </>
                    )}
                    <button
                      onClick={handleExportPDF}
                      className="h-8 px-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded-md flex items-center gap-1 transition-all whitespace-nowrap"
                      title="Export PDF Semua Tamu Sesuai Filter"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-500" />
                      <span>PDF</span>
                    </button>
                    <div className="w-px h-4 bg-slate-200/80" />
                    <button
                      onClick={handleExportExcel}
                      className="h-8 px-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded-md flex items-center gap-1 transition-all whitespace-nowrap"
                      title="Export Excel Semua Tamu Sesuai Filter"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Excel</span>
                    </button>
                  </div>

                  {/* Group 2: Data Utilities (Sample Data, Refresh, Reset) */}
                  <div className="inline-flex items-center gap-1.5">
                    {!isStaff && (
                      <button
                        onClick={() => handleGenerateSampleGuests(1000)}
                        disabled={isGeneratingSample || isImporting}
                        className="h-8.5 px-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 flex items-center gap-1.5 disabled:opacity-50"
                        title="Buat 1.000 data tamu contoh untuk uji coba kapasitas dan scanner"
                      >
                        {isGeneratingSample ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        ) : (
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                        )}
                        <span>+1.000 Contoh</span>
                      </button>
                    )}

                    <button
                      onClick={() => fetchGuests(true)}
                      disabled={isRefreshingGuests}
                      className="h-8.5 w-8.5 justify-center text-xs font-medium flex items-center rounded-lg transition-colors text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                      title="Refresh Seluruh Data Tamu"
                    >
                      <RefreshCcw className={`w-3.5 h-3.5 ${isRefreshingGuests ? 'animate-spin text-indigo-600' : ''}`} />
                    </button>

                    {(appUser?.role === 'superadmin' || appUser?.role === 'owner' || appUser?.role === 'partner') && guests.length > 0 && (
                      <button
                        onClick={handleClearAllGuests}
                        disabled={isGeneratingSample || isImporting}
                        className="h-8.5 w-8.5 justify-center text-xs font-medium flex items-center rounded-lg text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors disabled:opacity-50"
                        title="Kosongkan Semua Tamu (Reset Acara)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Group 3: Primary Actions (Blast WA & Tambah Tamu) */}
                  {!isStaff && (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={openBlastModal}
                        disabled={isBlasting}
                        className="h-8.5 px-3 text-xs font-medium flex items-center gap-1.5 rounded-lg transition-colors whitespace-nowrap text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-60"
                        title="Kirim Pesan WhatsApp Massal"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{isBlasting ? 'Memproses...' : 'Blast WA'}</span>
                      </button>

                      <button
                        onClick={() => setIsAddingGuest(!isAddingGuest)}
                        className={`h-8.5 px-3 text-xs font-medium flex items-center gap-1.5 rounded-lg transition-colors whitespace-nowrap ${
                          isAddingGuest
                            ? 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300'
                            : 'text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAddingGuest ? 'Batal' : 'Tambah Tamu'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Indicators for Batch Operations */}
              {(isImporting || isGeneratingSample) && (
                <div className="bg-indigo-50/80 border border-indigo-200 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                    <span className="text-xs sm:text-sm font-medium text-indigo-900">
                      {isImporting ? 'Sedang menulis data Excel ke database...' : 'Sedang membuat 1.000 tamu contoh ke database...'}
                    </span>
                  </div>
                  <span className="text-xs font-mono tabular-nums font-semibold text-indigo-700 bg-white px-2.5 py-1 rounded border border-indigo-100">
                    {isImporting && importProgress ? `${importProgress.current} / ${importProgress.total} tamu` : ''}
                    {isGeneratingSample && sampleProgress ? `${sampleProgress.current} / ${sampleProgress.total} tamu` : ''}
                  </span>
                </div>
              )}

              {/* Bottom Row: Structured Filter & Search Bar */}
              <div className="bg-slate-50/80 p-2.5 sm:p-3 rounded-xl border border-slate-200/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
                  {/* Search Input */}
                  <div className={`relative ${activeTab === 'attended' ? 'sm:col-span-2 lg:col-span-5' : 'sm:col-span-2 lg:col-span-3'}`}>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Cari nama, tiket, kota, no hp..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="block w-full h-9 pl-9 pr-8 border border-slate-200 rounded-lg text-xs sm:text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                        title="Hapus pencarian"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Status / Attendance Filter */}
                  {activeTab === 'rsvp' ? (
                    <div className="lg:col-span-2">
                      <select
                        value={rsvpFilter}
                        onChange={(e) => setRsvpFilter(e.target.value)}
                        className="block w-full h-9 pl-3 pr-7 border border-slate-200 rounded-lg text-xs sm:text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                      >
                        <option value="all">Semua Status RSVP</option>
                        <option value="attending">Hadir</option>
                        <option value="declined">Tidak Hadir</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  ) : activeTab === 'guest-list' ? (
                    <div className="lg:col-span-2">
                      <select
                        value={attendanceFilter}
                        onChange={(e) => setAttendanceFilter(e.target.value)}
                        className="block w-full h-9 pl-3 pr-7 border border-slate-200 rounded-lg text-xs sm:text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                      >
                        <option value="all">Semua Kehadiran</option>
                        <option value="attended">Sudah Scan</option>
                        <option value="not_attended">Belum Hadir</option>
                      </select>
                    </div>
                  ) : null}

                  {/* Category Filter */}
                  <div className="lg:col-span-2">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="block w-full h-9 pl-3 pr-7 border border-slate-200 rounded-lg text-xs sm:text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    >
                      <option value="all">Semua Kategori</option>
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="unassigned">Belum Diatur (-)</option>
                    </select>
                  </div>

                  {/* Invitation Type Filter */}
                  <div className="lg:col-span-2">
                    <select
                      value={invitationTypeFilter}
                      onChange={(e) => setInvitationTypeFilter(e.target.value)}
                      className="block w-full h-9 pl-3 pr-7 border border-slate-200 rounded-lg text-xs sm:text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    >
                      <option value="all">Semua Tipe Undangan</option>
                      {availableInvitationTypes.map((invType) => (
                        <option key={invType} value={invType}>{invType}</option>
                      ))}
                      <option value="unassigned">Belum Diatur (-)</option>
                    </select>
                  </div>

                  {/* Sort Order */}
                  <div className="lg:col-span-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="block w-full h-9 pl-3 pr-7 border border-slate-200 rounded-lg text-xs sm:text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                      title="Urutkan Daftar Tamu"
                    >
                      <option value="category_setting">Urut: Kategori ({configuredCategories.slice(0, 2).join(', ')}{configuredCategories.length > 2 ? '...' : ''})</option>
                      <option value="category_desc">Urut: Kategori (Terbalik)</option>
                      <option value="newest">Urut: Waktu Terbaru</option>
                      <option value="name_asc">Urut: Nama (A-Z)</option>
                    </select>
                  </div>

                  {/* Items Per Page */}
                  <div className="lg:col-span-1">
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                        setItemsPerPage(val);
                      }}
                      className="block w-full h-9 pl-2.5 pr-6 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                      title="Jumlah baris per halaman"
                    >
                      <option value={25}>25 / hal</option>
                      <option value={50}>50 / hal</option>
                      <option value={100}>100 / hal</option>
                      <option value={250}>250 / hal</option>
                      <option value={500}>500 / hal</option>
                      <option value={1000}>1.000 / hal</option>
                      <option value="all">Semua ({filteredGuests.length})</option>
                    </select>
                  </div>
                </div>

                {/* Active Filter Indicator & Quick Reset */}
                {(searchTerm || rsvpFilter !== 'all' || attendanceFilter !== 'all' || categoryFilter !== 'all' || invitationTypeFilter !== 'all') && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Menampilkan <strong className="text-slate-800 font-mono tabular-nums">{filteredGuests.length}</strong> hasil yang cocok dengan filter
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setRsvpFilter('all');
                        setAttendanceFilter('all');
                        setCategoryFilter('all');
                        setInvitationTypeFilter('all');
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                    >
                      Reset semua filter
                    </button>
                  </div>
                )}
              </div>
            </div>

        <div className="p-0">
          {isAddingGuest && (
            <div className="p-6 bg-gray-50 border-b border-gray-100">
              <form onSubmit={handleAddGuest} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                 <h3 className="text-md font-medium text-gray-800 mb-4">Data Tamu Baru</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
                      <input required value={newGuestName} onChange={e => setNewGuestName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Budi Santoso" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">No HP</label>
                      <input value={newGuestPhone} onChange={e => setNewGuestPhone(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="08123456789" />
                    </div>
                    <div className="md:col-span-2 lg:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                      <input value={newGuestAddress} onChange={e => setNewGuestAddress(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Jl. Sudirman No 1" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Tamu</label>
                      <select 
                        value={newGuestCategory} 
                        onChange={e => setNewGuestCategory(e.target.value)} 
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">-- Pilih Kategori --</option>
                        {availableCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Undangan</label>
                      <select 
                        value={newGuestInvitationType} 
                        onChange={e => setNewGuestInvitationType(e.target.value)} 
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">-- Pilih Tipe Undangan --</option>
                        {availableInvitationTypes.map(invType => (
                          <option key={invType} value={invType}>{invType}</option>
                        ))}
                      </select>
                    </div>
                    {event?.sessions && event.sessions.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sesi Acara</label>
                        <select 
                          value={newGuestSession} 
                          onChange={e => setNewGuestSession(e.target.value)} 
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">-- Pilih Sesi --</option>
                          {event.sessions.map(ses => (
                            <option key={ses} value={ses}>{ses}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Orang (Pax)</label>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={999}
                          required
                          value={newGuestPax}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setNewGuestPax(val);
                          }}
                          onBlur={() => {
                            const num = parseInt(newGuestPax, 10);
                            if (!num || num < 1) setNewGuestPax('1');
                          }}
                          placeholder="Contoh: 2"
                          className="w-full border border-gray-300 rounded-md pl-3 pr-16 py-2 focus:ring-indigo-500 focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium text-gray-500">
                          Orang
                        </span>
                      </div>
                    </div>
                 </div>
                 <div className="flex justify-end">
                   <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium text-sm transition-colors">
                     Simpan Tamu
                   </button>
                 </div>
              </form>
            </div>
          )}
          
          {loading ? (
            <div className="p-6">
              <p className="text-gray-500 text-sm">Memuat daftar tamu...</p>
            </div>
          ) : guests.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 text-sm">Belum ada tamu yang ditambahkan di daftar ini.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                {selectedGuestIds.length > 0 && (
                <div className="bg-indigo-50 px-6 py-3 border-b border-indigo-100 flex items-center justify-between">
                  <span className="text-sm text-indigo-700 font-medium">{selectedGuestIds.length} tamu terpilih</span>
                  <div className="flex items-center space-x-4">
                    <button 
                      onClick={() => {
                        setSinglePrintGuest(null);
                        setIsPrintModalOpen(true);
                      }} 
                      className="px-3.5 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                      title="Pilih cetak QR Biasa (20/Hal) atau Bentuk Card E-Invitation (4 atau 8 Card/Hal)"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak QR ({selectedGuestIds.length} Tamu)</span>
                    </button>
                    {(appUser?.role === 'superadmin' || appUser?.role === 'owner' || appUser?.role === 'admin' || appUser?.role === 'partner') && (
                      <button 
                        onClick={handleBulkDeleteGuests} 
                        className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Hapus Terpilih
                      </button>
                    )}
                    <button onClick={() => setSelectedGuestIds([])} className="text-sm text-indigo-600 hover:text-indigo-800 underline transition-colors">Batal Pilih Semua</button>
                  </div>
                </div>
              )}
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50/90 border-b border-slate-200">
                  <tr>
                    <th className="px-4 sm:px-5 py-3.5 text-left w-10">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedGuestIds.length === filteredGuests.length && filteredGuests.length > 0}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold text-slate-600 w-12">No</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Nama Tamu</th>
                    {(activeTab === 'guest-list' || activeTab === 'attended') && (
                      <>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Alamat</th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">No. Hp</th>
                        <th 
                          onClick={() => setSortBy(prev => prev === 'category_setting' ? 'category_desc' : 'category_setting')}
                          className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 cursor-pointer hover:text-indigo-600 select-none"
                          title="Klik untuk mengurutkan berdasarkan Kategori sesuai settingan"
                        >
                          <div className="inline-flex items-center gap-1">
                            <span>Kategori</span>
                            <ArrowUpDown className={`w-3.5 h-3.5 ${sortBy === 'category_setting' || sortBy === 'category_desc' ? 'text-indigo-600' : 'text-slate-400'}`} />
                          </div>
                        </th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Tipe Undangan</th>
                      </>
                    )}
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Sesi</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Jumlah Pax</th>
                    {activeTab === 'rsvp' ? (
                      <>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Status RSVP</th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Ucapan</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Status RSVP</th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Status Scan</th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Waktu Kehadiran</th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600">Souvenir</th>
                      </>
                    )}
                    <th className="px-4 sm:px-5 py-3.5 text-right text-xs font-semibold text-slate-600 sticky right-0 bg-slate-50/95 shadow-[-4px_0_12px_-3px_rgba(0,0,0,0.04)] z-10">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {paginatedGuests.map((guest, index) => (
                    <tr key={guest.id} className={`group transition-colors ${selectedGuestIds.includes(guest.id) ? 'bg-indigo-50/40' : 'hover:bg-slate-50/80'}`}>
                      <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedGuestIds.includes(guest.id)}
                          onChange={(e) => handleSelectGuest(guest.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-xs text-slate-400 font-mono tabular-nums">{startIndex + index + 1}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="text-sm font-semibold text-slate-900">{guest.name}</div>
                        {guest.ticketCode && (
                          <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">{guest.ticketCode}</div>
                        )}
                      </td>
                      {(activeTab === 'guest-list' || activeTab === 'attended') && (
                        <>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-slate-600">{guest.address || '-'}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm font-mono tabular-nums text-slate-600">{guest.phone || '-'}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-indigo-700">
                            {guest.category || <span className="text-slate-400 font-normal">-</span>}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-slate-600">
                            {guest.invitationType || <span className="text-slate-400 font-normal">-</span>}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-slate-700">
                        {guest.session || <span className="text-slate-400 font-normal">-</span>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold">
                        {guest.rsvpStatus === 'declined' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                            0 Orang
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                            {Math.max(1, Number(guest.pax) || 1)} Orang
                          </span>
                        )}
                      </td>
                      {activeTab === 'rsvp' ? (
                        <>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium">
                            <span className={`inline-flex items-center gap-1.5 ${
                              guest.rsvpStatus === 'attending' ? 'text-emerald-700' : 
                              guest.rsvpStatus === 'declined' ? 'text-rose-700' : 
                              'text-amber-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                guest.rsvpStatus === 'attending' ? 'bg-emerald-500' : 
                                guest.rsvpStatus === 'declined' ? 'bg-rose-500' : 
                                'bg-amber-500'
                              }`} />
                              {guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-600 max-w-xs truncate" title={guest.wishes || '-'}>
                            <div className="flex items-center gap-2">
                              {guest.stickerUrl && <span className="text-xl leading-none drop-shadow-sm">{guest.stickerUrl}</span>}
                              <span>{guest.wishes || '-'}</span>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium">
                            <span className={`inline-flex items-center gap-1.5 ${
                              guest.rsvpStatus === 'attending' ? 'text-emerald-700' : 
                              guest.rsvpStatus === 'declined' ? 'text-rose-700' : 
                              'text-amber-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                guest.rsvpStatus === 'attending' ? 'bg-emerald-500' : 
                                guest.rsvpStatus === 'declined' ? 'bg-rose-500' : 
                                'bg-amber-500'
                              }`} />
                              {guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                            <div className="flex flex-col items-start gap-0.5">
                              <span className={`inline-flex items-center gap-1.5 font-semibold ${guest.attended ? 'text-emerald-700' : 'text-slate-500'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${guest.attended ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                {guest.attended ? 'Sudah Scan' : 'Belum Hadir'}
                              </span>
                              {guest.attended && guest.checkInStaff && (
                                <span className="text-[11px] text-slate-500 pl-3">
                                  Oleh: <span className="font-medium text-indigo-700">{guest.checkInStaff}</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-mono tabular-nums text-slate-500">
                            {guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                            {guest.souvenirTaken ? (
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="inline-flex items-center gap-1.5 font-semibold text-purple-700">
                                  <Gift className="w-3.5 h-3.5 text-purple-600" />
                                  <span>{guest.souvenirName || 'Diambil'}</span>
                                </span>
                                {guest.souvenirTakenBy && (
                                  <span className="text-[11px] text-slate-500 pl-5">
                                    Oleh: <span className="font-medium text-purple-700">{guest.souvenirTakenBy}</span>
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Belum</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className={`px-4 sm:px-5 py-3.5 whitespace-nowrap text-sm font-medium sticky right-0 z-10 shadow-[-4px_0_12px_-3px_rgba(0,0,0,0.04)] ${selectedGuestIds.includes(guest.id) ? 'bg-indigo-50/40' : 'bg-white group-hover:bg-slate-50/90'}`}>
                        <div className="flex items-center justify-end gap-1">
                          {activeTab === 'rsvp' ? (
                            <>
                               <button
                                    onClick={() => handleEditWishesClick(guest)}
                                    className="text-slate-500 hover:text-indigo-600 flex items-center justify-center p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                                    title="Edit Ucapan"
                               >
                                 <Edit className="w-4 h-4" />
                               </button>
                               <button
                                    onClick={() => handleDeleteWishes(guest.id!)}
                                    className="text-slate-500 hover:text-rose-600 flex items-center justify-center p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                                    title="Hapus Ucapan"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                            </>
                          ) : (
                            <>
                               <button 
                                   onClick={() => handleToggleAttendance(guest.id!, guest.attended)}
                                   className={`flex items-center justify-center p-1.5 rounded-lg transition-colors ${
                                     guest.attended 
                                       ? 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50' 
                                       : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                                   }`}
                                   title={guest.attended ? 'Batalkan Kehadiran' : 'Konfirmasi Kehadiran'}
                               >
                                 {guest.attended ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                               </button>
                               <button 
                                   onClick={() => setActiveQrGuest(guest)}
                                   className="text-slate-500 hover:text-indigo-600 flex items-center justify-center p-1.5 rounded-lg hover:bg-indigo-50 transition-colors" 
                                   title="Lihat / Bagikan QR"
                               >
                                 <QrCode className="w-4 h-4" />
                               </button>
                               {!isStaff && (
                                 <>
                                   <button 
                                       onClick={() => handleEditGuestClick(guest)} 
                                       className="text-slate-500 hover:text-indigo-600 flex items-center justify-center p-1.5 rounded-lg hover:bg-indigo-50 transition-colors" 
                                       title="Edit Tamu"
                                   >
                                     <Edit className="w-4 h-4" />
                                   </button>
                                   <button 
                                       onClick={() => promptDeleteGuest(guest.id!)} 
                                       className="text-slate-500 hover:text-rose-600 flex items-center justify-center p-1.5 rounded-lg hover:bg-rose-50 transition-colors" 
                                       title="Hapus Tamu"
                                   >
                                     <Trash2 className="w-4 h-4" />
                                   </button>
                                 </>
                               )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            <div className="px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 sm:px-6 gap-3 bg-gray-50/50">
              <div>
                <p className="text-sm text-gray-700">
                  Menampilkan <span className="font-semibold text-gray-900">{filteredGuests.length === 0 ? 0 : startIndex + 1}</span> - <span className="font-semibold text-gray-900">{endIndex}</span> dari <span className="font-semibold text-indigo-600">{filteredGuests.length}</span> total tamu
                </p>
              </div>

              {itemsPerPage !== 'all' && totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Halaman Pertama"
                  >
                    «
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Sebelumnya
                  </button>
                  
                  <span className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md">
                    Halaman <span className="text-indigo-600 font-bold">{currentPage}</span> dari {totalPages}
                  </span>
                  
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Selanjutnya
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Halaman Terakhir"
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
      </>
      )}

      <Modal isOpen={isBlastModalOpen} onClose={() => setIsBlastModalOpen(false)} title="Blast WhatsApp">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
             Anda akan mengirim pesan WhatsApp secara bersamaan ke <strong>
               {selectedGuestIds.length > 0 
                  ? filteredGuests.filter(g => selectedGuestIds.includes(g.id!) && g.phone && g.phone.length >= 9).length
                  : filteredGuests.filter(g => g.phone && g.phone.length >= 9).length}
             </strong> tamu {selectedGuestIds.length > 0 ? "yang dipilih" : "di daftar ini"}. Proses ini membutuhkan waktu beberapa saat (jeda 3 detik per pesan).
          </p>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Pesan WA</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {waTemplates.length === 0 && <option value="">Default Pesan Sistem</option>}
              {waTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {waTemplates.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">Template yang dipilih akan disimpan di browser untuk acara ini.</p>
            )}
            {waTemplates.length === 0 && appUser?.role === 'superadmin' && (
              <p className="text-xs text-indigo-500 mt-1"><Link to="/admin/wa-templates" className="underline">Buat Template WA</Link> baru di menu admin.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button 
              type="button" 
              onClick={() => setIsBlastModalOpen(false)} 
              disabled={isBlasting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button 
              type="button" 
              onClick={handleBlastWA}
              disabled={isBlasting}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {isBlasting ? 'Memproses...' : 'Kirim Blast'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isEditingGuest} onClose={() => { setIsEditingGuest(false); setEditingGuestId(null); }} title="Edit Tamu">
        <form onSubmit={handleSaveEditGuest} className="p-4 bg-white">
          <div className="grid grid-cols-1 gap-4 mb-4">
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
               <input required value={editGuestName} onChange={e => setEditGuestName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Budi Santoso" />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">No HP</label>
               <input value={editGuestPhone} onChange={e => setEditGuestPhone(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="08123456789" />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
               <input value={editGuestAddress} onChange={e => setEditGuestAddress(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Jl. Sudirman No 1" />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Tamu</label>
               <select 
                 value={editGuestCategory} 
                 onChange={e => setEditGuestCategory(e.target.value)} 
                 className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
               >
                 <option value="">-- Pilih Kategori --</option>
                 {availableCategories.map(cat => (
                   <option key={cat} value={cat}>{cat}</option>
                 ))}
               </select>
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Undangan</label>
               <select 
                 value={editGuestInvitationType} 
                 onChange={e => setEditGuestInvitationType(e.target.value)} 
                 className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
               >
                 <option value="">-- Pilih Tipe Undangan --</option>
                 {availableInvitationTypes.map(invType => (
                   <option key={invType} value={invType}>{invType}</option>
                 ))}
               </select>
             </div>
             {event?.sessions && event.sessions.length > 0 && (
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Sesi Acara</label>
                 <select 
                   value={editGuestSession} 
                   onChange={e => setEditGuestSession(e.target.value)} 
                   className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                 >
                   <option value="">-- Pilih Sesi --</option>
                   {event.sessions.map(ses => (
                     <option key={ses} value={ses}>{ses}</option>
                   ))}
                 </select>
               </div>
             )}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Status RSVP (Pra Check-In)</label>
                 <select
                   value={editGuestRsvpStatus}
                   onChange={e => {
                     const nextStatus = e.target.value as 'pending' | 'attending' | 'declined';
                     setEditGuestRsvpStatus(nextStatus);
                     if (nextStatus !== 'declined' && (!parseInt(editGuestPax, 10) || parseInt(editGuestPax, 10) < 1)) {
                       setEditGuestPax('1');
                     }
                   }}
                   className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                 >
                   <option value="pending">Pending / Belum Konfirmasi</option>
                   <option value="attending">Hadir (Konfirmasi Datang)</option>
                   <option value="declined">Tidak Hadir</option>
                 </select>
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Orang (Pax)</label>
                 <div className="relative">
                   <input
                     type="number"
                     inputMode="numeric"
                     min={editGuestRsvpStatus === 'declined' ? 0 : 1}
                     max={999}
                     required={editGuestRsvpStatus !== 'declined'}
                     value={editGuestRsvpStatus === 'declined' ? '0' : editGuestPax}
                     disabled={editGuestRsvpStatus === 'declined'}
                     onChange={e => {
                       const val = e.target.value.replace(/[^0-9]/g, '');
                       setEditGuestPax(val);
                     }}
                     onBlur={() => {
                       if (editGuestRsvpStatus !== 'declined') {
                         const num = parseInt(editGuestPax, 10);
                         if (!num || num < 1) setEditGuestPax('1');
                       }
                     }}
                     placeholder="Contoh: 2"
                     className="w-full border border-gray-300 rounded-md pl-3 pr-16 py-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                   />
                   <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium text-gray-500">
                     Orang
                   </span>
                 </div>
               </div>
             </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button 
              type="button" 
              onClick={() => { setIsEditingGuest(false); setEditingGuestId(null); }} 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 transition-colors"
            >
              {appUser?.role === 'client' ? 'Ajukan Edit' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditingWishes} onClose={() => { setIsEditingWishes(false); setEditingWishesGuestId(null); }} title="Edit Ucapan">
        <form onSubmit={handleSaveEditWishes} className="p-4 bg-white">
          <div className="grid grid-cols-1 gap-4 mb-4">
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Ucapan</label>
               <textarea 
                 value={editWishesText} 
                 onChange={e => setEditWishesText(e.target.value)} 
                 className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[100px]" 
                 placeholder="Tulis ucapan di sini..." 
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Stiker (Opsional)</label>
               <div className="flex flex-wrap gap-2">
                 {STICKERS.map((sticker, idx) => (
                   <button
                     key={idx}
                     type="button"
                     onClick={() => setEditStickerUrl(editStickerUrl === sticker ? '' : sticker)}
                     className={`text-2xl transition-transform hover:scale-110 focus:outline-none ${editStickerUrl === sticker ? 'scale-125 drop-shadow-md bg-indigo-50 rounded-full' : 'opacity-70 grayscale-[30%]'}`}
                   >
                     {sticker}
                   </button>
                 ))}
               </div>
             </div>
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
            <button 
              type="button" 
              onClick={() => { setIsEditingWishes(false); setEditingWishesGuestId(null); }} 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 transition-colors"
            >
              Simpan Perubahan
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!guestToDelete} onClose={() => setGuestToDelete(null)} title="Konfirmasi Hapus">
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-800 mb-6">
          <p>Apakah Anda yakin ingin menghapus tamu ini? Tindakan ini tidak dapat dibatalkan.</p>
        </div>
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button 
            type="button" 
            onClick={() => setGuestToDelete(null)} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 bg-transparent transition-colors"
          >
            Batal
          </button>
          <button 
            type="button" 
            onClick={handleDeleteGuest}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 transition-colors"
          >
            Ya, Hapus
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!activeQrGuest} onClose={() => setActiveQrGuest(null)} title="Bagikan & Cetak Kartu QR">
        {activeQrGuest && (() => {
          const activeTemplate =
            eInviteTemplates.find((t) => t.id === event?.eInviteTemplateId) ||
            eInviteTemplates.find((t) => t.isDefault) ||
            DEFAULT_EINVITE_TEMPLATES[0];
          const qrValue = `${window.location.origin}/rsvp/${eventId}/${activeQrGuest.ticketCode}`;
          const domFav =
            typeof document !== 'undefined'
              ? (document.querySelector("link[rel~='icon']") as HTMLLinkElement | null)?.href || ''
              : '';
          const resolvedFavicon = settings?.faviconUrl || domFav || settings?.logoUrl || '';

          return (
            <div className="flex flex-col items-center">
              {/* Toggle Format Tampilan: Bentuk Card vs QR Biasa */}
              <div className="w-full grid grid-cols-2 gap-1.5 p-1 mb-4 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setQrModalViewMode('card')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    qrModalViewMode === 'card'
                      ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Bentuk Card (E-Invitation)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQrModalViewMode('standard')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    qrModalViewMode === 'standard'
                      ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>QR Biasa (Label Ringkas)</span>
                </button>
              </div>

              {qrModalViewMode === 'card' ? (
                <div className="w-full">
                  <EInvitationCard
                    cardRef={qrRef}
                    event={event}
                    guest={activeQrGuest}
                    template={activeTemplate}
                    appLogoUrl={settings?.logoUrl}
                    appFaviconUrl={settings?.faviconUrl}
                    appBrandName={settings?.appName || 'Guestly'}
                    appTagline="Buku Tamu Digital"
                  />
                </div>
              ) : (
                <div className="w-full flex justify-center py-2">
                  <div
                    ref={qrRef}
                    className="w-[320px] bg-white border-2 border-slate-300 rounded-2xl p-5 flex flex-col items-center text-center shadow-sm"
                  >
                    <div className="w-full text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 break-words px-1">
                      {event?.coupleName || event?.title || 'Undangan Pernikahan'}
                    </div>
                    <div
                      className={`w-full ${
                        activeQrGuest.name.length > 36
                          ? 'text-xs'
                          : activeQrGuest.name.length > 24
                          ? 'text-sm'
                          : 'text-base'
                      } font-bold text-slate-900 leading-snug mb-3 break-words px-1`}
                    >
                      {activeQrGuest.name}
                    </div>
                    <div className="relative p-3 bg-white rounded-xl border border-slate-200 shadow-2xs my-1">
                      <QRCode value={qrValue} size={176} level="H" bgColor="#FFFFFF" fgColor="#111827" />
                      {resolvedFavicon && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36px] h-[36px] rounded-lg bg-white shadow-xs flex items-center justify-center p-1 border border-slate-100">
                          <img
                            src={resolvedFavicon}
                            alt="Favicon"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-col items-center gap-0.5">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                        {activeQrGuest.category || 'Tamu Undangan'}
                        {activeQrGuest.session ? ` • ${activeQrGuest.session}` : ''}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-900 tracking-wider mt-1">
                        {activeQrGuest.ticketCode}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="mt-5 w-full space-y-2.5">
                <div className="w-full mb-3 text-left">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Pilih Template WhatsApp
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                       setSelectedTemplateId(e.target.value);
                       localStorage.setItem(`waTemplateId_${eventId}`, e.target.value);
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {waTemplates.length === 0 && <option value="">Default Pesan Sistem</option>}
                    {waTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={() => handleShareWA(activeQrGuest)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
                >
                  <Share2 className="w-4 h-4" /> Bagikan ke WhatsApp
                </button>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button 
                    onClick={handleDownloadQR}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    <span>{qrModalViewMode === 'card' ? 'Unduh Card' : 'Unduh QR'}</span>
                  </button>
                  <button 
                    onClick={() => handlePrintSingleGuest(activeQrGuest, qrModalViewMode)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>{qrModalViewMode === 'card' ? 'Cetak Card' : 'Cetak QR'}</span>
                  </button>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generateShareLink(activeQrGuest));
                      showAlert('Berhasil', 'Link E-Invitation berhasil disalin!', 'success');
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                  >
                    <Copy className="w-4 h-4" /> Salin Link
                  </button>
                  <Link
                    to={`/rsvp/${eventId}/${activeQrGuest.ticketCode}`}
                    target="_blank"
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors"
                  >
                    <QrCode className="w-4 h-4" /> Buka Link
                  </Link>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title={`Pilih Format Cetak QR (${selectedGuestIds.length} Tamu Terpilih)`}
      >
        {(() => {
          const sampleGuest =
            guests.find((g) => selectedGuestIds.includes(g.id!)) || guests[0] || {
              id: 'sample',
              eventId: eventId || '',
              name: 'Budi Santoso',
              ticketCode: 'GUEST123',
              category: 'VIP',
              pax: 2,
              rsvpStatus: 'attending',
              attended: false,
            };
          const activeTemplate =
            eInviteTemplates.find((t) => t.id === event?.eInviteTemplateId) ||
            eInviteTemplates.find((t) => t.isDefault) ||
            DEFAULT_EINVITE_TEMPLATES[0];
          const domFav =
            typeof document !== 'undefined'
              ? (document.querySelector("link[rel~='icon']") as HTMLLinkElement | null)?.href || ''
              : '';
          const resolvedFavicon = settings?.faviconUrl || domFav || settings?.logoUrl || '';
          const count = Math.max(1, selectedGuestIds.length);

          return (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Pilih model cetakan kertas <strong>A4 Portrait</strong> sesuai kebutuhan Anda: apakah <strong>QR Biasa (Label Stiker)</strong> atau <strong>Bentuk Card E-Invitation Landscape</strong>.
              </p>

              {/* Format Selector Cards */}
              <div className="grid grid-cols-1 gap-2.5">
                {/* Opsi 1: QR Biasa (20 QR / Hal) */}
                <button
                  type="button"
                  onClick={() => setPrintFormat('standard')}
                  className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    printFormat === 'standard'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg shrink-0 ${printFormat === 'standard' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">1. QR Biasa (Label / Stiker Undangan)</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Kotak putih ringkas berisi Nama Tamu, QR Code (Favicon Guestly), Kategori & Kode Tiket. Cocok ditempel pada amplop fisik.
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono font-semibold text-indigo-700">
                        <span>20 QR / Halaman A4 (4 Kolom × 5 Baris)</span>
                        <span>•</span>
                        <span>Estimasi: {Math.ceil(count / 20)} Halaman</span>
                      </div>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center ${printFormat === 'standard' ? 'border-indigo-600' : 'border-slate-300'}`}>
                    {printFormat === 'standard' && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                  </div>
                </button>

                {/* Opsi 2: Bentuk Card Ukuran Besar (4 Card / Hal) */}
                <button
                  type="button"
                  onClick={() => setPrintFormat('card-4')}
                  className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    printFormat === 'card-4'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg shrink-0 ${printFormat === 'card-4' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">2. Bentuk Card E-Invitation — Ukuran Besar</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Kartu akses VIP Landscape penuh warna lengkap dengan Foto Mempelai, Nama Mempelai, Waktu/Lokasi & QR Code.
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono font-semibold text-indigo-700">
                        <span>4 Card / Halaman A4 (1 Kolom × 4 Baris)</span>
                        <span>•</span>
                        <span>Estimasi: {Math.ceil(count / 4)} Halaman</span>
                      </div>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center ${printFormat === 'card-4' ? 'border-indigo-600' : 'border-slate-300'}`}>
                    {printFormat === 'card-4' && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                  </div>
                </button>

                {/* Opsi 3: Bentuk Card Ukuran Hemat (8 Card / Hal) */}
                <button
                  type="button"
                  onClick={() => setPrintFormat('card-8')}
                  className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    printFormat === 'card-8'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg shrink-0 ${printFormat === 'card-8' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">3. Bentuk Card E-Invitation — Ukuran Hemat Kertas</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Desain Card E-Invitation Landscape yang disusun 2 kolom per halaman A4 untuk menghemat kertas cetakan.
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono font-semibold text-indigo-700">
                        <span>8 Card / Halaman A4 (2 Kolom × 4 Baris)</span>
                        <span>•</span>
                        <span>Estimasi: {Math.ceil(count / 8)} Halaman</span>
                      </div>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center ${printFormat === 'card-8' ? 'border-indigo-600' : 'border-slate-300'}`}>
                    {printFormat === 'card-8' && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                  </div>
                </button>
              </div>

              {/* Pratinjau Visual Hasil Cetak */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-slate-700">
                    Pratinjau Desain yang Akan Dicetak:
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    {printFormat === 'standard'
                      ? 'Mode Label Stiker (20/Hal)'
                      : printFormat === 'card-4'
                      ? `Template: ${activeTemplate.name} (4 Card/Hal)`
                      : `Template: ${activeTemplate.name} (8 Card/Hal)`}
                  </span>
                </div>

                {printFormat === 'standard' ? (
                  <div className="flex justify-center py-2">
                    <div className="w-48 flex flex-col items-center justify-between p-2.5 border border-gray-400 rounded-lg bg-white text-black shadow-2xs">
                      <div
                        className={`w-full text-center font-bold ${
                          sampleGuest.name.length > 34
                            ? 'text-[10px]'
                            : sampleGuest.name.length > 22
                            ? 'text-[11px]'
                            : 'text-xs'
                        } leading-tight text-black break-words px-1 mb-1`}
                      >
                        {sampleGuest.name}
                      </div>
                      <div className="relative my-1 flex items-center justify-center bg-white p-1">
                        <QRCode
                          value={`${window.location.origin}/rsvp/${eventId}/${sampleGuest.ticketCode}`}
                          size={96}
                          level="H"
                        />
                        {resolvedFavicon && (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[20px] h-[20px] rounded bg-white shadow-2xs flex items-center justify-center p-0.5 border border-gray-100">
                            <img src={resolvedFavicon} alt="" className="w-full h-full object-contain" />
                          </div>
                        )}
                      </div>
                      <div className="w-full text-center mt-1">
                        <div className="text-[10px] font-semibold text-gray-700 leading-tight truncate">
                          {sampleGuest.category || 'Tamu'}
                        </div>
                        <div className="text-[10px] font-mono font-bold text-black leading-tight mt-0.5">
                          {sampleGuest.ticketCode}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-[440px] mx-auto">
                    <EInvitationCard
                      event={event}
                      guest={sampleGuest}
                      template={activeTemplate}
                      appLogoUrl={settings?.logoUrl}
                      appFaviconUrl={settings?.faviconUrl}
                      appBrandName={settings?.appName || 'Guestly'}
                      appTagline="Buku Tamu Digital"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200">
                <span className="text-xs text-slate-500">
                  Tips: Centang <strong>Background graphics</strong> pada jendela Print browser agar warna tercetak penuh.
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsPrintModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteBulkPrint}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Sekarang ({count} Tamu)</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal isOpen={isThumbnailModalOpen} onClose={() => setIsThumbnailModalOpen(false)} title="Atur Thumbnail WA & Foto Mempelai">
        <form onSubmit={handleSaveThumbnail} className="space-y-4">
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-lg text-xs text-indigo-900 leading-relaxed">
            Unggah foto mempelai atau masukkan URL gambar. Gambar ini akan menggantikan logo Guestly pada <strong>thumbnail preview link WhatsApp</strong>, <strong>pesan WA Blast</strong>, serta tampil di <strong>bagian atas kartu tiket/undangan tamu</strong>.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Foto Mempelai / Thumbnail Acara
            </label>
            <MediaUploader
              category="thumbnail"
              maxSize={15 * 1024 * 1024}
              allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
              defaultValue={thumbnailInput || undefined}
              onUploadSuccess={(data) => setThumbnailInput(data.url)}
              onUploadError={(err) => showAlert('Gagal Upload', err, 'error')}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">
                Atau masukkan URL gambar secara langsung:
              </label>
              {thumbnailInput && (
                <button
                  type="button"
                  onClick={() => setThumbnailInput('')}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Reset ke Default
                </button>
              )}
            </div>
            <input
              type="text"
              value={thumbnailInput}
              onChange={(e) => setThumbnailInput(e.target.value)}
              className="block w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="https://contoh.com/foto-mempelai.jpg"
            />
          </div>

          {thumbnailInput && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <img
                src={thumbnailInput}
                alt="Pratinjau Thumbnail"
                className="w-16 h-16 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800">Pratinjau Thumbnail Aktif</p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{thumbnailInput}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsThumbnailModalOpen(false)}
              disabled={isSavingThumbnail}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSavingThumbnail}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isSavingThumbnail ? 'Menyimpan...' : 'Simpan Thumbnail'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEmbedModalOpen} onClose={() => setIsEmbedModalOpen(false)} title="Integrasi Queinvite">
        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Salin ID Acara di bawah ini untuk menghubungkan Guestly dengan platform Queinvite.
            </p>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                ID Acara
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={eventId || ''}
                  className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-mono text-sm focus:ring-0 focus:outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(eventId || '');
                    showAlert('Berhasil', 'ID Acara disalin ke clipboard!', 'success');
                  }}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                >
                  <Copy className="w-4 h-4" /> Salin ID
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Hidden Print Area: Supports Standard QR (20/page) & Card E-Invitation (4 or 8/page) */}
      <div id="print-area" className="hidden bg-white text-black">
        {(() => {
          const selectedGuests = singlePrintGuest
            ? [singlePrintGuest]
            : guests.filter((g) => selectedGuestIds.includes(g.id!));
          if (selectedGuests.length === 0) return null;

          const baseUrl = window.location.origin;
          const activeTemplate =
            eInviteTemplates.find((t) => t.id === event?.eInviteTemplateId) ||
            eInviteTemplates.find((t) => t.isDefault) ||
            DEFAULT_EINVITE_TEMPLATES[0];
          const domFav =
            typeof document !== 'undefined'
              ? (document.querySelector("link[rel~='icon']") as HTMLLinkElement | null)?.href || ''
              : '';
          const resolvedFavicon = settings?.faviconUrl || domFav || settings?.logoUrl || '';

          if (printFormat === 'card-4' || printFormat === 'card-8') {
            const perPage = printFormat === 'card-4' ? 4 : 8;
            const cardWidthPx = printFormat === 'card-4' ? 420 : 340;
            const pageClass = printFormat === 'card-4' ? 'a4-card-page-4' : 'a4-card-page-8';
            const pages: Guest[][] = [];
            for (let i = 0; i < selectedGuests.length; i += perPage) {
              pages.push(selectedGuests.slice(i, i + perPage));
            }

            return pages.map((pageGuests, pageIndex) => (
              <div key={pageIndex} className={pageClass}>
                {pageGuests.map((guest) => (
                  <div key={guest.id} className="a4-qr-card">
                    <EInvitationCard
                      fixedWidthPx={cardWidthPx}
                      event={event}
                      guest={guest}
                      template={activeTemplate}
                      appLogoUrl={settings?.logoUrl}
                      appFaviconUrl={settings?.faviconUrl}
                      appBrandName={settings?.appName || 'Guestly'}
                      appTagline="Buku Tamu Digital"
                    />
                  </div>
                ))}
              </div>
            ));
          }

          // Default: Standard QR Label (20 per A4 page: 4 columns x 5 rows)
          const pages: Guest[][] = [];
          for (let i = 0; i < selectedGuests.length; i += 20) {
            pages.push(selectedGuests.slice(i, i + 20));
          }

          return pages.map((pageGuests, pageIndex) => (
            <div key={pageIndex} className="a4-qr-page">
              {pageGuests.map((guest) => {
                const qrLink = `${baseUrl}/rsvp/${eventId}/${guest.ticketCode}`;

                return (
                  <div
                    key={guest.id}
                    className="a4-qr-card flex flex-col items-center justify-between p-2 border border-gray-400 rounded bg-white text-black overflow-hidden"
                  >
                    <div
                      className={`w-full text-center font-bold ${
                        guest.name.length > 36
                          ? 'text-[8.5px]'
                          : guest.name.length > 22
                          ? 'text-[9.5px]'
                          : 'text-[11px]'
                      } leading-tight text-black break-words px-0.5`}
                    >
                      {guest.name}
                    </div>
                    <div className="relative my-0.5 flex items-center justify-center bg-white p-1">
                      <QRCode value={qrLink} size={104} level="H" />
                      {resolvedFavicon && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded bg-white shadow-2xs flex items-center justify-center p-0.5 border border-gray-100">
                          <img
                            src={resolvedFavicon}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                    <div className="w-full text-center">
                      <div className="text-[9px] font-semibold text-gray-700 leading-tight truncate">
                        {guest.category || 'Tamu'}
                      </div>
                      <div className="text-[9px] font-mono font-bold text-black leading-tight mt-0.5 tracking-tight">
                        {guest.ticketCode}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
