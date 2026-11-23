import { useParams, Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { QrCode, Printer, ScanLine, Plus, Trash2, Edit, Search, CheckCircle, XCircle, FileSpreadsheet, FileText, Upload, Download, Copy, Share2, Download as DownloadIcon, Monitor, Code, MessageCircle, RefreshCcw, Users, Loader2, Gift, ArrowUpDown, AlertCircle, ArrowLeft, Image as ImageIcon, Calendar, MapPin, Clock, ChevronDown, ChevronUp, MoreHorizontal, X, Check, ChevronRight, Send, Lock, CreditCard } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'react-qr-code';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, deleteDoc, updateDoc, deleteField, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { supabaseDb } from '../lib/supabaseDb';
import { Guest, EventRecord, WATemplate, EInviteTemplate } from '../types';
import { parseFirestoreDate, canUserAccessEvent, getOperatorLabel, getRoleLabel, exportCardToPng, resolveMediaUrl, getGuestBaseName, formatGuestFullName, isEventExpired, isEventInactiveOrExpired, getDaysRemaining, resolveEventActiveUntil, computeDefaultActiveUntil, DEFAULT_EVENT_ACTIVE_DAYS, shouldHideServiceInfo, isVendorManagedClient, isSelfRegisteredClient } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Modal } from '../components/Modal';
import { MediaUploader } from '../components/media/MediaUploader';
import { EInvitationCard } from '../components/EInvitationCard';
import { eInviteTemplateService, DEFAULT_EINVITE_TEMPLATES } from '../services/eInviteTemplateService';
import { useAuth } from '../AuthContext';
import { showAlert, showConfirm, showCancelAlert } from '../lib/alerts';
import { useSettings } from '../SettingsContext';
import SouvenirManagement from '../components/SouvenirManagement';
import { souvenirStorage } from '../services/souvenirStorage';
import { subscribeWaDispatch, saveGuestWaStatus, clearWaDispatchMap, WaDispatchMap } from '../services/waDispatchService';
import { toWhatsAppInternational } from '../lib/fonnte';
import { EventGroupReminderModal } from '../components/EventGroupReminderModal';

export default function EventDetails() {
  const { eventId, guestId: routeGuestId } = useParams<{ eventId: string; guestId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { appUser } = useAuth();
  const currentOperator = getOperatorLabel(appUser);
  const isSuperAdmin = appUser?.role === 'superadmin';
  const isStaff = appUser?.role === 'staff';
  const isStaffCheckinOnly = isStaff && appUser?.staffType === 'checkin';
  const isStaffSouvenirOnly = isStaff && appUser?.staffType === 'souvenir';
  const isManagedClient = isVendorManagedClient(appUser);
  const isSelfClient = isSelfRegisteredClient(appUser);
  const canDirectEditRank =
    appUser?.role === 'superadmin' ||
    appUser?.role === 'owner' ||
    appUser?.role === 'partner';
  const [event, setEvent] = useState<EventRecord | null>(null);
  const eventExpired = isEventExpired(event);
  const eventInactive = isEventInactiveOrExpired(event);
  const isEventLocked = Boolean(event && eventInactive && !isSuperAdmin);
  const showEventLockedAlert = () => {
    showAlert(
      'Fitur Terkunci',
      eventExpired
        ? 'Masa aktif acara ini telah berakhir dan status otomatis menjadi Draft. Silakan lakukan Top-Up Paket terlebih dahulu untuk membuka kembali fitur ini.'
        : 'Acara ini berstatus Draft sehingga seluruh fitur operasional & ekspor dikunci sementara. Silakan lakukan Top-Up Paket atau hubungi Super Admin.',
      'warning'
    );
  };
  const [clientName, setClientName] = useState<string>('');
  const [clientPartnerId, setClientPartnerId] = useState<string | null>(null);
  const [teamPartnerIds, setTeamPartnerIds] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [waTemplates, setWaTemplates] = useState<WATemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [newGuestTitle, setNewGuestTitle] = useState('');
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
  const [waSendFilter, setWaSendFilter] = useState<'all' | 'pending' | 'sent' | 'failed'>('all');
  const [waDispatchMap, setWaDispatchMap] = useState<WaDispatchMap>({});
  const [clientFonnteToken, setClientFonnteToken] = useState<string>('');
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
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printPrepStatus, setPrintPrepStatus] = useState('');
  const [printRenderGuests, setPrintRenderGuests] = useState<Guest[] | null>(null);
  const [printRenderFormat, setPrintRenderFormat] = useState<'standard' | 'card-4' | 'card-8'>('standard');
  const { settings } = useSettings();
  const [isBlasting, setIsBlasting] = useState(false);
  const [isBlastModalOpen, setIsBlastModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isEditingGuest, setIsEditingGuest] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editGuestTitle, setEditGuestTitle] = useState('');
  const [editGuestName, setEditGuestName] = useState('');
  const [inlineTitleDrafts, setInlineTitleDrafts] = useState<Record<string, string>>({});
  const [savingTitleGuestId, setSavingTitleGuestId] = useState<string | null>(null);
  const [isBulkRankModalOpen, setIsBulkRankModalOpen] = useState(false);
  const [bulkRankValue, setBulkRankValue] = useState('');
  const [isSavingBulkRank, setIsSavingBulkRank] = useState(false);
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Thumbnail / Foto Mempelai quick-setting modal states
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState(false);
  const [thumbnailInput, setThumbnailInput] = useState('');
  const [isSavingThumbnail, setIsSavingThumbnail] = useState(false);
  const [isOptionsDropdownOpen, setIsOptionsDropdownOpen] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [isGroupReminderModalOpen, setIsGroupReminderModalOpen] = useState(false);
  const [eInviteTemplates, setEInviteTemplates] = useState<EInviteTemplate[]>(DEFAULT_EINVITE_TEMPLATES);

  useEffect(() => {
    eInviteTemplateService.getTemplates().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setEInviteTemplates(list);
      }
    });
  }, []);

  const openThumbnailModal = () => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    setThumbnailInput(event?.thumbnailUrl || '');
    setIsThumbnailModalOpen(true);
  };

  const handleSaveThumbnail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !event) return;
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    setIsSavingThumbnail(true);
    try {
      const cleanedThumb = thumbnailInput.trim();
      await updateDoc(doc(db, 'events', eventId), {
        thumbnailUrl: cleanedThumb ? cleanedThumb : deleteField(),
        eInvitePhotoUrl: cleanedThumb ? cleanedThumb : deleteField(),
        coverImage: cleanedThumb ? cleanedThumb : deleteField(),
        updatedAt: serverTimestamp(),
      });
      setEvent({
        ...event,
        thumbnailUrl: cleanedThumb || undefined,
        eInvitePhotoUrl: cleanedThumb || undefined,
      });
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
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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
    let unsubscribeWaDispatch: () => void;
    let intervalId: NodeJS.Timeout;

    const setupListeners = async () => {
      try {
        setLoading(true);

        // Listen to event details
        unsubscribeEvent = onSnapshot(doc(db, 'events', eventId), async (eventDoc) => {
          if (eventDoc.exists()) {
            let eventData = { id: eventDoc.id, ...eventDoc.data() } as EventRecord;
            const resolvedActive = !eventData.activeUntil && eventData.createdAt
              ? computeDefaultActiveUntil(eventData.createdAt, eventData.activeDays || DEFAULT_EVENT_ACTIVE_DAYS)
              : eventData.activeUntil;
            if (eventData.status === 'published' && isEventExpired(eventData)) {
              const expiryUpdate: any = {
                status: 'draft',
                subscriptionStatus: 'expired',
                activeDays: eventData.activeDays || DEFAULT_EVENT_ACTIVE_DAYS,
                ...(resolvedActive ? { activeUntil: resolvedActive } : {}),
                updatedAt: serverTimestamp(),
              };
              eventData = {
                ...eventData,
                status: 'draft',
                subscriptionStatus: 'expired',
                activeDays: eventData.activeDays || DEFAULT_EVENT_ACTIVE_DAYS,
                ...(resolvedActive ? { activeUntil: resolvedActive } : {}),
              };
              updateDoc(doc(db, 'events', eventId), expiryUpdate).catch(() => {});
            } else if (!eventData.activeUntil && resolvedActive) {
              eventData = {
                ...eventData,
                activeUntil: resolvedActive,
                activeDays: eventData.activeDays || DEFAULT_EVENT_ACTIVE_DAYS,
              };
              updateDoc(doc(db, 'events', eventId), {
                activeUntil: resolvedActive,
                activeDays: eventData.activeDays || DEFAULT_EVENT_ACTIVE_DAYS,
              }).catch(() => {});
            }
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
            if (eventData.clientUid) {
              try {
                const cUserDoc = await getDoc(doc(db, 'users', eventData.clientUid));
                if (cUserDoc.exists()) {
                  setClientFonnteToken(String((cUserDoc.data() as any)?.fonnteToken || '').trim());
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

        // Subscribe to WA dispatch statuses
        unsubscribeWaDispatch = subscribeWaDispatch(eventId, (statuses) => {
          setWaDispatchMap(statuses);
        });

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
      if (unsubscribeWaDispatch) unsubscribeWaDispatch();
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('supabase-compat-change', handleCompatChange);
      window.removeEventListener('guestly_souvenirs_changed', handleSouvenirsChanged);
    };
  }, [eventId]);

  // Sync URL sub-routes (/events/:eventId/guests/add, /events/:eventId/guests/:guestId/edit)
  useEffect(() => {
    const path = location.pathname;
    if (isEventLocked && (path.endsWith('/guests/add') || (routeGuestId && path.endsWith('/edit')))) {
      setIsAddingGuest(false);
      setIsEditingGuest(false);
      setEditingGuestId(null);
      if (eventId) navigate(`/auth/login/events/${eventId}`, { replace: true });
      return;
    }
    if (path.endsWith('/guests/add')) {
      setIsAddingGuest(true);
    } else if (routeGuestId && path.endsWith('/edit')) {
      if (guests.length > 0 && editingGuestId !== routeGuestId) {
        const target = guests.find(g => g.id === routeGuestId);
        if (target) {
          setEditingGuestId(target.id!);
          setEditGuestTitle(target.title || '');
          setEditGuestName(getGuestBaseName(target.name || '', target.title || ''));
          setEditGuestAddress(target.address || '');
          setEditGuestPhone(target.phone || '');
          setEditGuestCategory(target.category || '');
          setEditGuestInvitationType(target.invitationType || '');
          setEditGuestSession(target.session || '');
          setEditGuestPax(String(target.pax !== undefined && target.pax > 0 ? Number(target.pax) : 1));
          setEditGuestRsvpStatus(target.rsvpStatus || 'pending');
          setIsEditingGuest(true);
        }
      }
    } else if (path === `/auth/login/events/${eventId}`) {
      if (isEditingGuest) {
        setIsEditingGuest(false);
        setEditingGuestId(null);
      }
      if (isAddingGuest) {
        setIsAddingGuest(false);
      }
    }
  }, [location.pathname, routeGuestId, guests.length, isEventLocked]);

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    
    if (
      appUser &&
      !['superadmin', 'owner', 'partner', 'admin'].includes(appUser.role) &&
      appUser.guestQuota !== undefined &&
      appUser.guestQuota > 0 &&
      guests.length >= appUser.guestQuota
    ) {
      showAlert('Kuota Habis', `Anda telah mencapai batas maksimal kuota tamu (${appUser.guestQuota} tamu). Silakan beli atau upgrade layanan Anda.`, 'warning');
      return;
    }
    
    const cleanedGuestTitle = newGuestTitle.trim();
    const cleanedBaseName = newGuestName.trim();
    const cleanedGuestName = formatGuestFullName(cleanedBaseName, cleanedGuestTitle);
    if (guests.some(g => g.name.toLowerCase() === cleanedGuestName.toLowerCase())) {
      showAlert('Peringatan', `Tamu dengan nama "${cleanedGuestName}" sudah tersedia di daftar.`, 'warning');
      return;
    }

    try {
      const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const parsedPax = Math.max(1, Number(newGuestPax) || 1);
      const payload: any = {
        eventId: eventId!,
        title: cleanedGuestTitle,
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
      
      if (isManagedClient) {
        await addDoc(collection(db, 'guest_edit_requests'), {
          eventId: eventId!,
          eventTitle: event?.title || 'Unknown Event',
          guestId: 'new_guest',
          clientId: event?.clientId || appUser?.clientId || '',
          clientName: clientName || appUser?.name || event?.coupleName || '',
          clientPhone: appUser?.phone || '',
          requesterName: appUser?.name || clientName || '',
          partnerId: event?.partnerId || null,
          type: 'add',
          originalData: {},
          requestedData: {
            title: cleanedGuestTitle,
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

      setNewGuestTitle('');
      setNewGuestName('');
      setNewGuestAddress('');
      setNewGuestPhone('');
      setNewGuestCategory('');
      setNewGuestInvitationType('');
      setNewGuestSession('');
      setNewGuestPax('1');
      setIsAddingGuest(false);
      if (location.pathname.endsWith('/guests/add')) {
        navigate(`/auth/login/events/${eventId}`);
      }
    } catch (error) {
      showAlert("Gagal", "Failed to add guest. Check permissions.", "error");
      handleFirestoreError(error, OperationType.CREATE, `events/${eventId}/guests`);
    }
  };

  const [guestToDelete, setGuestToDelete] = useState<string | null>(null);
  const [rsvpGuestToDelete, setRsvpGuestToDelete] = useState<Guest | null>(null);
  const [isDeletingRsvpAction, setIsDeletingRsvpAction] = useState(false);
  
  const [isEditingWishes, setIsEditingWishes] = useState(false);
  const [editingWishesGuestId, setEditingWishesGuestId] = useState<string | null>(null);
  const [editWishesText, setEditWishesText] = useState('');
  const [editStickerUrl, setEditStickerUrl] = useState<string>('');

  const STICKERS = ['❤️', '🎉', '🙏', '✨', '🔥', '🌸', '💍', '🕊️'];

  const handleEditWishesClick = (guest: Guest) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    setEditingWishesGuestId(guest.id!);
    setEditWishesText(guest.wishes || '');
    setEditStickerUrl(guest.stickerUrl || '');
    setIsEditingWishes(true);
  };

  const handleSaveEditWishes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWishesGuestId || !event) return;
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }

    try {
      await updateDoc(doc(db, 'events', eventId!, 'guests', editingWishesGuestId), {
         wishes: editWishesText,
         stickerUrl: editStickerUrl,
         updatedAt: serverTimestamp()
      });
      setGuests(prev =>
        prev.map(g =>
          g.id === editingWishesGuestId
            ? { ...g, wishes: editWishesText, stickerUrl: editStickerUrl }
            : g
        )
      );
      showAlert('Berhasil', 'Ucapan berhasil diubah.', 'success');
      setIsEditingWishes(false);
      setEditingWishesGuestId(null);
    } catch (error) {
      console.error(error);
      showAlert('Error', 'Gagal mengubah ucapan.', 'error');
    }
  };

  const handleDeleteWishes = (guestId: string) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    const found = guests.find(g => g.id === guestId);
    if (found) {
      setRsvpGuestToDelete(found);
    }
  };

  const handleConfirmResetRsvpAndWishes = async () => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    if (!rsvpGuestToDelete?.id) return;
    const targetId = rsvpGuestToDelete.id;
    setIsDeletingRsvpAction(true);
    try {
      await updateDoc(doc(db, 'events', eventId!, 'guests', targetId), {
        wishes: '',
        stickerUrl: '',
        rsvpStatus: 'pending',
        status: 'pending',
        hasResponded: false,
        updatedAt: serverTimestamp()
      } as any);
      setGuests(prev =>
        prev.map(g =>
          g.id === targetId
            ? { ...g, wishes: '', stickerUrl: '', rsvpStatus: 'pending', hasResponded: false }
            : g
        )
      );
      setSelectedGuestIds(prev => prev.filter(id => id !== targetId));
      setRsvpGuestToDelete(null);
      showAlert('Berhasil', 'Ucapan telah dihapus dan tamu dikeluarkan dari daftar RSVP & Ucapan.', 'success');
    } catch (error) {
      console.error(error);
      showAlert('Error', 'Gagal menghapus ucapan dan mereset RSVP.', 'error');
    } finally {
      setIsDeletingRsvpAction(false);
    }
  };

  const handleConfirmPermanentDeleteFromRsvp = async () => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    if (!rsvpGuestToDelete?.id) return;
    const targetId = rsvpGuestToDelete.id;
    setIsDeletingRsvpAction(true);
    try {
      await deleteDoc(doc(db, 'events', eventId!, 'guests', targetId));
      setGuests(prev => prev.filter(g => g.id !== targetId));
      setSelectedGuestIds(prev => prev.filter(id => id !== targetId));
      setRsvpGuestToDelete(null);
      showAlert('Berhasil', 'Ucapan beserta data tamu telah dihapus permanen dari acara!', 'success');
    } catch (error) {
      console.error(error);
      showAlert('Gagal', 'Gagal menghapus data tamu secara permanen.', 'error');
      handleFirestoreError(error, OperationType.DELETE, `events/${eventId}/guests/${targetId}`);
    } finally {
      setIsDeletingRsvpAction(false);
    }
  };

  const handleBulkResetRsvpAndWishes = async () => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    if (selectedGuestIds.length === 0) return;
    const confirmed = await showConfirm(
      `Apakah Anda yakin ingin menghapus ucapan dan mengeluarkan ${selectedGuestIds.length} tamu terpilih dari daftar RSVP & Ucapan?\n\n(Data tamu tetap tersimpan di Daftar Tamu utama)`
    );
    if (!confirmed) return;

    try {
      await Promise.all(
        selectedGuestIds.map(id =>
          updateDoc(doc(db, 'events', eventId!, 'guests', id), {
            wishes: '',
            stickerUrl: '',
            rsvpStatus: 'pending',
            status: 'pending',
            hasResponded: false,
            updatedAt: serverTimestamp()
          } as any)
        )
      );
      const selectedSet = new Set(selectedGuestIds);
      setGuests(prev =>
        prev.map(g =>
          g.id && selectedSet.has(g.id)
            ? { ...g, wishes: '', stickerUrl: '', rsvpStatus: 'pending', hasResponded: false }
            : g
        )
      );
      const count = selectedGuestIds.length;
      setSelectedGuestIds([]);
      showAlert('Berhasil', `${count} ucapan berhasil dihapus dan dikeluarkan dari daftar RSVP & Ucapan!`, 'success');
    } catch (error) {
      console.error('Error resetting bulk RSVP:', error);
      showAlert('Gagal', 'Gagal menghapus beberapa ucapan terpilih.', 'error');
    }
  };

  const promptDeleteGuest = (guestId: string) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    setGuestToDelete(guestId);
  };

  const handleDeleteGuest = async () => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    if (selectedGuestIds.length === 0) return;
    if (appUser?.role !== 'superadmin' && appUser?.role !== 'owner' && appUser?.role !== 'admin' && appUser?.role !== 'partner' && !isSelfClient) {
      showAlert("Ditolak", "Hanya Super Admin, Owner, Admin, Partner, dan Client Mandiri yang dapat menghapus massal.", "error");
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

    if (!isSuperAdmin) {
      showAlert(
        'Akses Terbatas',
        'Perubahan status acara secara manual hanya dapat dilakukan oleh Super Admin. Silakan gunakan menu Top-Up Paket untuk memperpanjang atau mengaktifkan acara.',
        'warning'
      );
      return;
    }

    if (newStatus === 'published' && isEventExpired(event)) {
      showAlert(
        'Masa Aktif Berakhir',
        'Masa aktif acara ini telah habis. Silakan perpanjang melalui Top-Up Paket atau ubah tanggal Masa Aktif Acara di menu Edit Events terlebih dahulu.',
        'warning'
      );
      return;
    }

    const confirmed = await showConfirm(`Apakah Anda yakin ingin mengubah status acara menjadi ${newStatus}?`);
    if (!confirmed) return;

    try {
      const extraUpdates =
        newStatus === 'published' && !isEventExpired(event)
          ? { subscriptionStatus: 'active' }
          : {};
      await updateDoc(doc(db, 'events', eventId), {
        status: newStatus,
        ...extraUpdates,
        updatedAt: serverTimestamp()
      });
      setEvent({ ...event, status: newStatus as any, ...(extraUpdates as any) });
      showAlert("Berhasil", "Status acara berhasil diubah!", "success");
    } catch (error) {
      showAlert("Gagal", "Gagal mengubah status acara", "error");
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
    }
  };

  const handleToggleAttendance = async (guestId: string, currentStatus: boolean) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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
        updateData.checkInMethod = 'manual';
      } else {
        updateData.attendedAt = deleteField();
        updateData.checkInStaff = deleteField();
        updateData.checkInMethod = deleteField();
      }
      
      await updateDoc(doc(db, 'events', eventId!, 'guests', guestId), updateData);
      
      setGuests(guests.map(g => g.id === guestId ? { ...g, attended: newStatus, checkInStaff: newStatus ? currentOperator : undefined, checkInMethod: newStatus ? 'manual' : undefined } : g));
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
    
    let matchesWaSend = true;
    if (activeTab === 'guest-list' && waSendFilter !== 'all') {
      const dispatchStatus = guest.id ? (waDispatchMap[guest.id]?.status || 'pending') : 'pending';
      matchesWaSend = dispatchStatus === waSendFilter;
    }

    return matchesSearch && matchesStatus && matchesCategory && matchesInvitationType && matchesWaSend;
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
  }, [searchTerm, rsvpFilter, attendanceFilter, waSendFilter, categoryFilter, invitationTypeFilter, sortBy, activeTab, itemsPerPage]);

  const handleExportPDF = () => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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

  const prepareAndTriggerPrint = async (
    targetGuests: Guest[],
    targetFormat: 'standard' | 'card-4' | 'card-8'
  ) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    if (targetGuests.length === 0) {
      showAlert('Info', 'Tidak ada tamu yang dipilih untuk dicetak.', 'info');
      return;
    }

    const perPage = targetFormat === 'card-4' ? 4 : targetFormat === 'card-8' ? 8 : 20;
    const totalPages = Math.ceil(targetGuests.length / perPage);

    setIsPrintModalOpen(false);
    setPrintRenderFormat(targetFormat);
    setPrintRenderGuests(targetGuests);
    setIsPreparingPrint(true);
    setPrintPrepStatus(
      `Menyiapkan ${targetGuests.length} QR (${totalPages} halaman A4)...`
    );

    try {
      // Wait 2 frames so React portals #print-area into document.body
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      // Wait for web fonts (capped at 2s)
      if (document.fonts && document.fonts.ready) {
        setPrintPrepStatus('Memuat tipografi & desain kartu...');
        await Promise.race([
          document.fonts.ready,
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);
      }

      // Wait for all images inside #print-area to load or settle (capped at 8s)
      const printEl = document.getElementById('print-area');
      if (printEl) {
        const imgs = Array.from(printEl.querySelectorAll('img'));
        const pendingImgs = imgs.filter((img) => !img.complete || img.naturalWidth === 0);

        if (pendingImgs.length > 0) {
          let settledCount = imgs.length - pendingImgs.length;
          setPrintPrepStatus(
            `Memuat foto & aset cetak (${settledCount}/${imgs.length})...`
          );

          await Promise.race([
            Promise.all(
              pendingImgs.map(
                (img) =>
                  new Promise<void>((resolve) => {
                    const done = () => {
                      settledCount += 1;
                      setPrintPrepStatus(
                        `Memuat foto & aset cetak (${Math.min(settledCount, imgs.length)}/${imgs.length})...`
                      );
                      resolve();
                    };
                    img.addEventListener('load', done, { once: true });
                    img.addEventListener('error', done, { once: true });
                    if (img.complete) done();
                  })
              )
            ),
            new Promise<void>((resolve) => setTimeout(resolve, 8000)),
          ]);
        }
      }

      setPrintPrepStatus('Membuka pratinjau cetak PDF...');
      await new Promise<void>((resolve) => setTimeout(resolve, 160));

      // Hide loading modal right before opening native browser print dialog
      setIsPreparingPrint(false);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      const handleAfterPrint = () => {
        setPrintRenderGuests(null);
        setSinglePrintGuest(null);
      };
      window.addEventListener('afterprint', handleAfterPrint, { once: true });

      window.print();
    } catch (err) {
      console.error('Error preparing QR print:', err);
      setIsPreparingPrint(false);
      setPrintRenderGuests(null);
      showAlert('Gagal', 'Terjadi kendala saat menyiapkan dokumen cetak QR.', 'error');
    }
  };

  const handlePrintSingleGuest = (guest: Guest, mode: 'card' | 'standard') => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    const targetFormat = mode === 'card' ? 'card-4' : 'standard';
    setSinglePrintGuest(guest);
    setPrintFormat(targetFormat);
    prepareAndTriggerPrint([guest], targetFormat);
  };

  const handleExecuteBulkPrint = () => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    setSinglePrintGuest(null);
    const selectedSet = new Set(selectedGuestIds);
    const orderedFromFiltered = filteredGuests.filter((g) => g.id && selectedSet.has(g.id));
    const orderedSet = new Set(orderedFromFiltered.map((g) => g.id));
    const remainingSelected = guests.filter(
      (g) => g.id && selectedSet.has(g.id) && !orderedSet.has(g.id)
    );
    prepareAndTriggerPrint([...orderedFromFiltered, ...remainingSelected], printFormat);
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

  const handleShareWA = async (guest: Guest) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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

    const intlPhone = toWhatsAppInternational(guest.phone || '');
    const waUrl = intlPhone
      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    if (eventId && guest.id) {
      saveGuestWaStatus(eventId, guest.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        method: 'manual',
        tokenSource: 'manual',
      }).catch(() => {});
    }
  };

  const resolvedOwnFonnteToken = (
    event?.fonnteToken ||
    (appUser?.role === 'client' ? appUser?.fonnteToken : clientFonnteToken || appUser?.fonnteToken) ||
    ''
  ).trim();
  const isUsingOwnFonnteToken = Boolean(resolvedOwnFonnteToken);

  const openBlastModal = () => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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

    if (!isUsingOwnFonnteToken && appUser?.role !== 'superadmin' && validGuests.length > availableWaBlastQuota) {
       showAlert(
         'Kuota Tidak Mencukupi', 
         `Anda mencoba mengirim ${validGuests.length} pesan menggunakan Token Global, namun sisa kuota WA Blast Guestly Anda adalah ${availableWaBlastQuota}.\n\nPasang Token Fonnte Pribadi di menu Profil Saya / halaman Kirim Undangan (gratis tanpa potong kuota), atau gunakan tombol WA manual.`, 
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
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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

          const imgUrl = `${baseUrl}/api/og/einvite/${encodeURIComponent(eventId!)}/${encodeURIComponent(guest.ticketCode)}.jpg`;
          
          const result = await sendFonnteMessage(
            isUsingOwnFonnteToken ? resolvedOwnFonnteToken : null,
            guest.phone!,
            message,
            imgUrl,
            { strictToken: isUsingOwnFonnteToken, fallbackTextOnMediaError: true }
          );
          if (result.success) {
            successCount++;
            if (eventId && guest.id) {
              await saveGuestWaStatus(eventId, guest.id, {
                status: 'sent',
                sentAt: new Date().toISOString(),
                method: 'fonnte',
                tokenSource: event?.fonnteToken ? 'event' : isUsingOwnFonnteToken ? 'client' : 'global',
                mediaMode: result.usedTextFallback ? 'text' : 'einvite',
                lastError: '',
              }).catch(() => {});
            }
          } else {
            failCount++;
            if (result.error && !errors.includes(result.error)) {
              errors.push(result.error);
            }
            if (eventId && guest.id) {
              await saveGuestWaStatus(eventId, guest.id, {
                status: 'failed',
                method: 'fonnte',
                tokenSource: event?.fonnteToken ? 'event' : isUsingOwnFonnteToken ? 'client' : 'global',
                lastError: result.error || 'Gagal mengirim',
              }).catch(() => {});
            }
          }

          // delay 3 seconds
          await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Update Quotas only when using Global Token fallback
      if (successCount > 0 && !isUsingOwnFonnteToken && appUser?.role !== 'superadmin') {
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
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    const data = filteredGuests.map((guest, index) => {
      const effectivePax = guest.rsvpStatus === 'declined' ? 0 : Math.max(1, Number(guest.pax) || 1);
      return {
        "No": index + 1,
        "Pangkat / Jabatan": guest.title || '-',
        "Nama Tamu": guest.name,
        "Kode Tiket": guest.ticketCode || '-',
        "Alamat": guest.address || '-',
        "No. Hp": guest.phone || '-',
        "Kategori": guest.category || '-',
        "Tipe Undangan": guest.invitationType || '-',
        "Sesi": guest.session || '-',
        "Jumlah Pax (Orang)": effectivePax,
        "Status RSVP (Pra Check-In)": guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Pending',
        "Status Check-In": guest.attended ? 'Hadir' : 'Belum Hadir',
        "Metode Check-In": guest.attended ? (guest.checkInMethod === 'manual' ? 'Manual' : 'Scan QR') : '-',
        "Waktu Kehadiran": guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-',
        "Petugas Check-In Kehadiran": guest.checkInStaff || '-',
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
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    const data = [{
      "Pangkat / Jabatan": '',
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
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    setIsImportModalOpen(true);
  };

  const processFile = async (file: File) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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
          
          const rawTitle = String(
            row["Pangkat / Jabatan"] || row["Pangkat"] || row["Jabatan"] || row["Gelar"] || ""
          ).trim();
          const cleanRowTitle = rawTitle === '-' ? '' : rawTitle;
          const cleanedName = formatGuestFullName(String(guestName).trim(), cleanRowTitle);
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
            title: cleanRowTitle,
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
              title: item.title || '',
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
        setIsImportModalOpen(false);
        setSelectedImportFile(null);

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
    if (modalFileInputRef.current) modalFileInputRef.current.value = "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleGenerateSampleGuests = async (count = 1000) => {
    if (!eventId) return;
    if (appUser?.role !== 'superadmin') {
      showAlert('Akses Dibatasi', 'Hanya Super Admin yang diizinkan membuat data tamu contoh.', 'warning');
      return;
    }

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
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
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

      await clearWaDispatchMap(eventId);
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

  const handleQuickSaveGuestTitle = async (guest: Guest, rawDraftTitle: string) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    if (!canDirectEditRank || !guest.id || !eventId) return;
    const nextTitle = rawDraftTitle.trim();
    const prevTitle = (guest.title || '').trim();
    if (nextTitle === prevTitle) return;

    const nextFullName = formatGuestFullName(guest.name, nextTitle, prevTitle);
    setSavingTitleGuestId(guest.id);

    setGuests(prev =>
      prev.map(g => (g.id === guest.id ? { ...g, title: nextTitle, name: nextFullName } : g))
    );

    try {
      await updateDoc(doc(db, 'events', eventId, 'guests', guest.id), {
        title: nextTitle,
        name: nextFullName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating guest rank/title:', error);
      showAlert('Gagal', 'Gagal menyimpan pangkat/jabatan tamu.', 'error');
      fetchGuests(false);
    } finally {
      setSavingTitleGuestId(null);
    }
  };

  const handleBulkSetRank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    if (!canDirectEditRank || !eventId || selectedGuestIds.length === 0) return;

    const nextTitle = bulkRankValue.trim();
    setIsSavingBulkRank(true);

    try {
      const targetGuests = guests.filter(g => g.id && selectedGuestIds.includes(g.id));
      await Promise.all(
        targetGuests.map(g => {
          const nextFullName = formatGuestFullName(g.name, nextTitle, g.title || '');
          return updateDoc(doc(db, 'events', eventId, 'guests', g.id!), {
            title: nextTitle,
            name: nextFullName,
            updatedAt: serverTimestamp(),
          });
        })
      );

      setGuests(prev =>
        prev.map(g => {
          if (!g.id || !selectedGuestIds.includes(g.id)) return g;
          return {
            ...g,
            title: nextTitle,
            name: formatGuestFullName(g.name, nextTitle, g.title || ''),
          };
        })
      );

      setInlineTitleDrafts(prev => {
        const next = { ...prev };
        selectedGuestIds.forEach(id => {
          next[id] = nextTitle;
        });
        return next;
      });

      setIsBulkRankModalOpen(false);
      setBulkRankValue('');
      showAlert(
        'Berhasil',
        nextTitle
          ? `Pangkat/Jabatan "${nextTitle}" berhasil diterapkan ke ${targetGuests.length} tamu terpilih tanpa mengubah QR Code.`
          : `Pangkat/Jabatan pada ${targetGuests.length} tamu terpilih berhasil dikosongkan.`,
        'success'
      );
    } catch (error) {
      console.error('Error bulk updating rank:', error);
      showAlert('Gagal', 'Gagal memperbarui pangkat/jabatan secara massal.', 'error');
    } finally {
      setIsSavingBulkRank(false);
    }
  };

  const handleEditGuestClick = (guest: Guest) => {
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    setEditingGuestId(guest.id!);
    setEditGuestTitle(guest.title || '');
    setEditGuestName(getGuestBaseName(guest.name || '', guest.title || ''));
    setEditGuestAddress(guest.address || '');
    setEditGuestPhone(guest.phone || '');
    setEditGuestCategory(guest.category || '');
    setEditGuestInvitationType(guest.invitationType || '');
    setEditGuestSession(guest.session || '');
    setEditGuestPax(String(guest.pax !== undefined && guest.pax > 0 ? Number(guest.pax) : 1));
    setEditGuestRsvpStatus(guest.rsvpStatus || 'pending');
    setIsEditingGuest(true);
    if (eventId && guest.id && !location.pathname.endsWith(`/guests/${guest.id}/edit`)) {
      navigate(`/auth/login/events/${eventId}/guests/${guest.id}/edit`);
    }
  };

  const handleSaveEditGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEventLocked) {
      showEventLockedAlert();
      return;
    }
    if (!editingGuestId || !event) return;

    try {
      const originalGuest = guests.find(g => g.id === editingGuestId);
      if (!originalGuest) return;
      const finalPax = editGuestRsvpStatus === 'declined' ? 0 : Math.max(1, Number(editGuestPax) || 1);
      const cleanedTitle = editGuestTitle.trim();
      const finalFullName = formatGuestFullName(
        editGuestName.trim(),
        cleanedTitle,
        originalGuest.title || ''
      );

      if (isManagedClient) {
        // Create approval request
        await addDoc(collection(db, 'guest_edit_requests'), {
          eventId: eventId,
          eventTitle: event.title || 'Unknown Event',
          guestId: editingGuestId,
          clientId: event.clientId || appUser?.clientId || '',
          clientName: clientName || appUser?.name || event.coupleName || '',
          clientPhone: appUser?.phone || '',
          requesterName: appUser?.name || clientName || '',
          partnerId: event.partnerId || null,
          type: 'edit',
          originalData: {
            title: originalGuest.title || '',
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
            title: cleanedTitle,
            name: finalFullName,
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
                const message = `*🔔 Notifikasi Guestly - Pengajuan Edit Tamu*\n\nHalo, terdapat pengajuan perubahan data tamu dari Klien untuk acara *${event.title || 'Unknown Event'}*.\n\n*Data Lama:*\n- Pangkat/Jabatan: ${originalGuest.title || '-'}\n- Nama: ${originalGuest.name}\n- No HP: ${originalGuest.phone || '-'}\n- Kategori: ${originalGuest.category || '-'}\n- Tipe Undangan: ${originalGuest.invitationType || '-'}\n- Alamat: ${originalGuest.address || '-'}\n- Sesi: ${originalGuest.session || '-'}\n- Pax: ${originalGuest.pax ?? 1} Orang\n\n*Data Baru:*\n- Pangkat/Jabatan: ${cleanedTitle || '-'}\n- Nama: ${finalFullName}\n- No HP: ${editGuestPhone || '-'}\n- Kategori: ${editGuestCategory || '-'}\n- Tipe Undangan: ${editGuestInvitationType || '-'}\n- Alamat: ${editGuestAddress || '-'}\n- Sesi: ${editGuestSession || '-'}\n- Pax: ${finalPax} Orang\n\nSilakan login ke dashboard Guestly dan cek menu *Approvals* untuk menyetujui atau menolak perubahan ini.`;
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
           title: cleanedTitle,
           name: finalFullName,
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
          title: cleanedTitle,
          name: finalFullName,
          address: editGuestAddress,
          phone: editGuestPhone,
          category: editGuestCategory,
          invitationType: editGuestInvitationType,
          session: editGuestSession,
          pax: finalPax,
          rsvpStatus: editGuestRsvpStatus
        } : g));
        setInlineTitleDrafts(prev => ({ ...prev, [editingGuestId]: cleanedTitle }));
        showAlert('Berhasil', 'Data tamu berhasil diubah.', 'success');
      }
      setIsEditingGuest(false);
      setEditingGuestId(null);
      if (location.pathname.includes('/guests/')) {
        navigate(`/auth/login/events/${eventId}`);
      }
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

  const resolvedActiveDate = event ? resolveEventActiveUntil(event) : null;
  const daysLeft = event ? getDaysRemaining(event) : 0;
  const hideServiceCatalog = shouldHideServiceInfo(appUser);
  const hasActiveGuestFilter =
    searchTerm.trim() !== '' ||
    rsvpFilter !== 'all' ||
    attendanceFilter !== 'all' ||
    waSendFilter !== 'all' ||
    categoryFilter !== 'all' ||
    invitationTypeFilter !== 'all';

  const resetGuestFilters = () => {
    setSearchTerm('');
    setRsvpFilter('all');
    setAttendanceFilter('all');
    setWaSendFilter('all');
    setCategoryFilter('all');
    setInvitationTypeFilter('all');
  };

  return (
    <div className="space-y-4">
      {/* Expiry & Draft Lock Warning Banner */}
      {event && eventInactive && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-100 text-[#8C3A50] flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#6E293C]">
                {eventExpired
                  ? 'Masa Aktif Acara Berakhir — Mode Baca Saja (Status Draft)'
                  : 'Acara Berstatus Draft — Seluruh Fitur Operasional Dikunci'}
              </h3>
              <p className="text-xs text-rose-800/90 mt-0.5 leading-relaxed">
                {isSuperAdmin
                  ? 'Acara ini sedang berstatus Draft / Kedaluwarsa. Sebagai Super Admin Anda masih memiliki akses penuh untuk mengelola data, ekspor laporan, atau mengubah status.'
                  : eventExpired
                  ? 'Masa aktif 30 hari acara ini telah habis. Data tamu, RSVP, dan statistik tetap aman untuk dilihat, namun seluruh fitur operasional (kelola tamu, impor, ekspor Excel/PDF, kirim undangan/WA, check-in manual, souvenir, QR Scanner, Layar Sapa, dan Form RSVP Publik) dikunci sementara hingga dilakukan Top-Up Paket.'
                  : 'Acara ini berstatus Draft. Seluruh fitur operasional, ekspor laporan, kirim undangan, check-in, souvenir, dan akses publik dikunci sementara hingga acara diaktifkan melalui Top-Up Paket.'}
              </p>
            </div>
          </div>

          {!isStaff && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!hideServiceCatalog ? (
                <Link
                  to={`/auth/login/services/catalog?renewEvent=${eventId}`}
                  className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs sm:text-sm font-medium shadow-xs transition-colors whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Top-Up Paket / Perpanjang</span>
                </Link>
              ) : (
                <span className="text-xs font-medium text-[#8C3A50]">
                  Hubungi Partner/Admin untuk perpanjangan
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* H-7 Active Period Reminder Banner */}
      {event && !eventInactive && daysLeft > 0 && daysLeft <= 7 && !isStaff && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-amber-900">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs font-medium tabular-nums">
              Masa aktif acara tersisa <strong>{daysLeft} hari</strong>{' '}
              {resolvedActiveDate ? `(berakhir ${format(resolvedActiveDate, 'dd MMM yyyy')})` : ''}. Setelah habis, status otomatis berubah menjadi <strong>Draft</strong>.
            </p>
          </div>
          {!hideServiceCatalog && (
            <Link
              to={`/auth/login/services/catalog?renewEvent=${eventId}`}
              className="h-8.5 px-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shrink-0 transition-colors whitespace-nowrap"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Perpanjang Masa Aktif</span>
            </Link>
          )}
        </div>
      )}

      {/* Event Context Header Card (Unified Create Event Style) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-3.5 sm:p-4">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
          {/* Left Column: Photo + Event Main Info */}
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            {/* Event Photo / Thumbnail with quick change overlay */}
            <div className="relative group shrink-0">
              {event?.thumbnailUrl ? (
                <img
                  src={resolveMediaUrl(event.thumbnailUrl)}
                  alt={event.title}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-gray-200 bg-gray-50"
                />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              {!isStaff && !isEventLocked && (
                <button
                  type="button"
                  onClick={openThumbnailModal}
                  className="absolute inset-0 bg-black/45 hover:bg-black/60 text-white rounded-xl flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-semibold"
                  title="Ubah Foto Mempelai / Thumbnail"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Ubah</span>
                </button>
              )}
            </div>

            {/* Title & Core Details */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate" title={event?.title}>
                  {event?.title || 'Detail Acara'}
                </h1>

                {event && (
                  <div className="inline-flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold capitalize inline-flex items-center gap-1 ${
                        event.status === 'published'
                          ? 'text-emerald-700'
                          : event.status === 'completed'
                          ? 'text-gray-600'
                          : 'text-amber-700'
                      }`}
                      title={
                        !isSuperAdmin
                          ? 'Status acara dikelola otomatis melalui Top-Up Paket (perubahan manual hanya untuk Super Admin)'
                          : undefined
                      }
                    >
                      <span>·</span>
                      <span>{event.status}</span>
                      {isEventLocked && <Lock className="w-3 h-3 text-amber-600" />}
                    </span>

                    {isSuperAdmin && (
                      <select
                        value={event.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        className="h-7 text-xs border border-gray-200 rounded-lg px-2 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                        title="Ubah Status Acara (Khusus Super Admin)"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="completed">Completed</option>
                      </select>
                    )}
                  </div>
                )}

                {isStaff && (
                  <span className="text-xs text-gray-500">
                    · Petugas: <strong className="font-semibold text-indigo-600">{currentOperator}</strong>
                  </span>
                )}
              </div>

              {/* Clean Unboxed Metadata Row */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 mt-1 tabular-nums">
                <span className="inline-flex items-center gap-1 text-gray-700 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>
                    {event?.date && parseFirestoreDate(event.date)
                      ? format(parseFirestoreDate(event.date)!, 'dd MMMM yyyy')
                      : '-'}
                  </span>
                  {event?.time && <span className="text-gray-500 font-normal">({event.time})</span>}
                </span>

                {event?.location && (
                  <>
                    <span aria-hidden="true" className="text-gray-300">·</span>
                    <span className="inline-flex items-center gap-1 text-gray-600 truncate max-w-xs sm:max-w-md">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </span>
                  </>
                )}

                {resolvedActiveDate && (
                  <>
                    <span aria-hidden="true" className="text-gray-300">·</span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        eventExpired
                          ? 'text-rose-600 font-semibold'
                          : daysLeft <= 7
                          ? 'text-amber-600 font-semibold'
                          : 'text-gray-500'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {eventExpired ? 'Kedaluwarsa sejak ' : 'Aktif s/d '}
                        {format(resolvedActiveDate, 'dd MMM yyyy')}
                        {!eventExpired && ` (${daysLeft} hr)`}
                      </span>
                    </span>
                  </>
                )}
              </div>

              {/* Compact Unboxed Configuration Summary */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-500 mt-1.5">
                {event?.guestCategories && event.guestCategories.length > 0 && (
                  <span>
                    <span className="text-gray-400">Kategori:</span>{' '}
                    <span className="text-gray-700 font-medium">{event.guestCategories.join(', ')}</span>
                  </span>
                )}

                {event?.sessions && event.sessions.length > 0 && (
                  <>
                    {event?.guestCategories && event.guestCategories.length > 0 && (
                      <span aria-hidden="true" className="text-gray-300">·</span>
                    )}
                    <span>
                      <span className="text-gray-400">Sesi:</span>{' '}
                      <span className="text-gray-700 font-medium">{event.sessions.join(', ')}</span>
                    </span>
                  </>
                )}

                <span aria-hidden="true" className="text-gray-300">·</span>
                <button
                  type="button"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
                  title={isConfigExpanded ? 'Sembunyikan detail konfigurasi' : 'Lihat tipe undangan & frame'}
                >
                  <span>{isConfigExpanded ? 'Sembunyikan Konfigurasi' : 'Konfigurasi Lengkap'}</span>
                  {isConfigExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Clean Event Operational Actions */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end shrink-0 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-gray-100">
            {eventInactive ? (
              <>
                <button
                  type="button"
                  disabled
                  className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-gray-100 text-gray-400 border border-gray-200 rounded-lg font-medium text-xs sm:text-sm cursor-not-allowed whitespace-nowrap"
                  title="Scanner dikunci saat acara berstatus Draft atau Masa Aktif berakhir"
                >
                  <Lock className="w-4 h-4" />
                  <span>Scanner Terkunci</span>
                </button>
                {!isStaff && !hideServiceCatalog && (
                  <Link
                    to={`/auth/login/services/catalog?renewEvent=${eventId}`}
                    className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-xs sm:text-sm shadow-xs transition-colors whitespace-nowrap"
                    title="Perpanjang masa aktif acara melalui Katalog Paket & Add-on"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Top-Up Paket</span>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link
                  to={
                    isStaffSouvenirOnly
                      ? `/auth/login/events/${eventId}/scan?mode=souvenir`
                      : isStaffCheckinOnly
                      ? `/auth/login/events/${eventId}/scan?mode=checkin`
                      : `/auth/login/events/${eventId}/scan`
                  }
                  className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-xs sm:text-sm shadow-xs transition-colors whitespace-nowrap"
                  title="Buka sistem scanner QR tiket & POS penukaran souvenir"
                >
                  <ScanLine className="w-4 h-4" />
                  <span>
                    {isStaffSouvenirOnly
                      ? 'Scanner Souvenir'
                      : isStaffCheckinOnly
                      ? 'Scanner Kehadiran'
                      : 'Buka Scanner'}
                  </span>
                </Link>

                {!isStaff && guests.length > 0 && (
                  <Link
                    to={`/rsvp/${eventId}/${guests[0].ticketCode}`}
                    className="h-9 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg font-medium text-xs sm:text-sm transition-colors whitespace-nowrap"
                    title="Lihat tampilan Kartu E-Invitation + Form RSVP & Ucapan Tamu"
                  >
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span>E-Invitation</span>
                  </Link>
                )}

                {!isStaffSouvenirOnly && (
                  <Link
                    to={`/events/${eventId}/greeting`}
                    target="_blank"
                    className="h-9 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg font-medium text-xs sm:text-sm transition-colors whitespace-nowrap"
                    title="Buka Layar Sapa Tamu untuk TV/Monitor"
                  >
                    <Monitor className="w-4 h-4 text-indigo-600" />
                    <span>Layar Sapa</span>
                  </Link>
                )}

                {appUser && ['superadmin', 'owner', 'partner', 'admin'].includes(appUser.role) && (
                  <button
                    type="button"
                    onClick={() => setIsGroupReminderModalOpen(true)}
                    className="h-9 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg font-medium text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
                    title="Jadwalkan / Kirim Pengingat Grup WhatsApp Tim (H-3, H-1 & Hari H)"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <span>Grup Tim</span>
                  </button>
                )}
              </>
            )}

            {/* Options Dropdown Menu for Secondary Actions */}
            {!isStaff && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (isEventLocked) {
                      showEventLockedAlert();
                      return;
                    }
                    setIsOptionsDropdownOpen(!isOptionsDropdownOpen);
                  }}
                  disabled={isEventLocked}
                  className={`h-9 px-2.5 inline-flex items-center gap-1 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isEventLocked
                      ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                      : 'text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 cursor-pointer'
                  }`}
                  title={
                    isEventLocked
                      ? 'Menu Lainnya dikunci hingga dilakukan Top-Up Paket'
                      : 'Opsi & Alat Acara Lainnya'
                  }
                >
                  {isEventLocked ? (
                    <Lock className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <MoreHorizontal className="w-4 h-4 text-gray-600" />
                  )}
                  <span className="hidden sm:inline">Lainnya</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>

                {isOptionsDropdownOpen && !isEventLocked && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setIsOptionsDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEmbedModalOpen(true);
                          setIsOptionsDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-gray-700 hover:bg-gray-50 hover:text-indigo-600 cursor-pointer"
                      >
                        <Code className="w-4 h-4 text-gray-500" />
                        <span>Embed Kode Widget</span>
                      </button>

                      <Link
                        to={`/public/rsvp/${eventId}`}
                        onClick={() => setIsOptionsDropdownOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-gray-700 hover:bg-gray-50 hover:text-indigo-600"
                      >
                        <FileText className="w-4 h-4 text-pink-500" />
                        <span>Form RSVP Publik</span>
                      </Link>

                      {appUser?.role !== 'client' && (
                        <Link
                          to={`/auth/login/events/${eventId}/send-access`}
                          onClick={() => setIsOptionsDropdownOpen(false)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-gray-700 hover:bg-rose-50 hover:text-[#8C3A50]"
                        >
                          <Send className="w-4 h-4 text-[#8C3A50]" />
                          <span>Kirim Akses ke Client</span>
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          openThumbnailModal();
                          setIsOptionsDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-gray-700 hover:bg-gray-50 hover:text-indigo-600 cursor-pointer border-t border-gray-100"
                      >
                        <ImageIcon className="w-4 h-4 text-indigo-500" />
                        <span>Atur Foto Mempelai</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expanded Config Details (Collapsible Drawer) */}
        {isConfigExpanded && (
          <div className="mt-3.5 pt-3.5 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Tipe Undangan Disediakan</h4>
              <p className="text-gray-600">{availableInvitationTypes.join(' · ')}</p>
            </div>

            {event?.frameOverlayUrl && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1.5">Frame / Overlay Layar Sapa</h4>
                <div className="w-36 h-20 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <img
                    src={resolveMediaUrl(event.frameOverlayUrl)}
                    alt="Frame"
                    referrerPolicy="no-referrer"
                    className="object-cover w-full h-full"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Standardized 5-Card KPI Strip (Clean Flat Cards, Tabular Figures) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Undangan */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-3.5 flex flex-col justify-between">
          <p className="text-xs font-medium text-gray-500">Total Undangan</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums leading-none">
              {guests.length.toLocaleString('id-ID')}
            </p>
            <span className="text-xs text-gray-400">undangan</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 tabular-nums">
            <span>Total alokasi</span>
            <span className="font-semibold text-indigo-600">
              {guests
                .reduce((acc, g) => acc + (g.rsvpStatus === 'declined' ? 0 : Math.max(1, Number(g.pax) || 1)), 0)
                .toLocaleString('id-ID')}{' '}
              Org
            </span>
          </div>
        </div>

        {/* Card 2: Estimasi Hadir (RSVP) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-medium text-gray-500">Estimasi Hadir (RSVP)</p>
            <span className="text-[11px] text-indigo-600 font-medium">Pra Check-In</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <p className="text-xl sm:text-2xl font-bold text-indigo-600 tabular-nums leading-none">
              {guests
                .filter((g) => g.rsvpStatus === 'attending')
                .reduce((acc, g) => acc + Math.max(1, Number(g.pax) || 1), 0)
                .toLocaleString('id-ID')}
            </p>
            <span className="text-xs text-gray-500">Orang</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-gray-600 font-medium">
              {guests.filter((g) => g.rsvpStatus === 'attending').length} hadir
            </span>
            <span className="text-amber-700 font-medium">
              {guests.filter((g) => !g.rsvpStatus || g.rsvpStatus === 'pending').length} pending
            </span>
          </div>
        </div>

        {/* Card 3: Sudah Check-In */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-medium text-gray-500">Sudah Check-In</p>
            <span className="text-[11px] font-medium text-emerald-600">Realtime</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <p className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums leading-none">
              {guests.filter((g) => g.attended).length.toLocaleString('id-ID')}
            </p>
            <span className="text-xs text-gray-500 tabular-nums">
              ({guests
                .filter((g) => g.attended)
                .reduce((acc, g) => acc + Math.max(1, Number(g.pax) || 1), 0)
                .toLocaleString('id-ID')}{' '}
              Org)
            </span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 tabular-nums">
            <span>Realisasi hadir</span>
            <span className="font-semibold text-emerald-700">
              {guests.length > 0 ? Math.round((guests.filter((g) => g.attended).length / guests.length) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Card 4: Belum Masuk Gate */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-3.5 flex flex-col justify-between">
          <p className="text-xs font-medium text-gray-500">Belum Masuk Gate</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <p className="text-xl sm:text-2xl font-bold text-amber-700 tabular-nums leading-none">
              {guests.filter((g) => !g.attended).length.toLocaleString('id-ID')}
            </p>
            <span className="text-xs text-gray-400">undangan</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 tabular-nums">
            <span>Konfirmasi absen</span>
            <span className="font-semibold text-rose-600">
              {guests.filter((g) => g.rsvpStatus === 'declined').length} undangan
            </span>
          </div>
        </div>

        {/* Card 5: Souvenir Diambil */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-3.5 flex flex-col justify-between col-span-2 sm:col-span-1">
          <p className="text-xs font-medium text-gray-500">Souvenir Diambil</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums leading-none">
              {guests.filter((g) => g.souvenirTaken).length.toLocaleString('id-ID')}
            </p>
            <span className="text-xs text-gray-400">diserahkan</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 tabular-nums">
            <span>Belum ambil</span>
            <span className="font-semibold text-gray-700">
              {guests.filter((g) => !g.souvenirTaken).length.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs & Integrated WA Blast Quota */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-gray-200 gap-2 pt-1">
        <nav className="-mb-px flex space-x-5 sm:space-x-7 overflow-x-auto">
          {!isStaff && (
            <button
              type="button"
              onClick={() => setActiveTab('rsvp')}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors cursor-pointer ${
                activeTab === 'rsvp'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              RSVP & Ucapan
            </button>
          )}
          {!isStaffSouvenirOnly && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('guest-list')}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'guest-list'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                <span>Daftar Tamu</span>
                <span className="text-xs tabular-nums text-gray-400">
                  ({guests.length.toLocaleString('id-ID')})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('attended')}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'attended'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                <span>Berhasil Scan</span>
                <span className="text-xs tabular-nums font-semibold text-emerald-600">
                  ({guests.filter((g) => g.attended).length.toLocaleString('id-ID')})
                </span>
              </button>
            </>
          )}
          {!isStaffCheckinOnly && (
            <button
              type="button"
              onClick={() => setActiveTab('souvenir')}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'souvenir'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Souvenir & Logistik</span>
            </button>
          )}
        </nav>

        {(activeTab === 'guest-list' || activeTab === 'attended') && !isStaff && (
          <div className="pb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 tabular-nums">
            <span className="inline-flex items-center gap-1 text-gray-700 font-medium">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Kuota WA Blast:</span>
              <strong className="text-gray-900">
                {Math.max(0, 50 - (event?.waBlastCount || 0)) + (appUser?.waBlastQuota || 0)}
              </strong>
              <span>pesan</span>
            </span>
            <span aria-hidden="true" className="text-gray-300 hidden sm:inline">·</span>
            <span>Gratis {Math.min(50, event?.waBlastCount || 0)}/50</span>
            <span aria-hidden="true" className="text-gray-300 hidden sm:inline">·</span>
            <span>Add-on {appUser?.waBlastQuota || 0}</span>
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
          isLocked={isEventLocked}
        />
      ) : (
        <div className="space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
            className="hidden"
          />

          {/* BOX 1: Unified Filter Box (Create Event Standard) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-2.5 sm:p-3 space-y-2">
            {/* Row 1: Search + Primary Filter Dropdowns + Limit */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari nama tamu, kode tiket, alamat, no HP, atau sesi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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
                {/* Status / Attendance Filter */}
                {activeTab === 'rsvp' ? (
                  <select
                    value={rsvpFilter}
                    onChange={(e) => setRsvpFilter(e.target.value)}
                    className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[135px]"
                    title="Filter status RSVP"
                  >
                    <option value="all">Semua Status RSVP</option>
                    <option value="attending">Hadir</option>
                    <option value="declined">Tidak Hadir</option>
                    <option value="pending">Pending</option>
                  </select>
                ) : activeTab === 'guest-list' ? (
                  <select
                    value={attendanceFilter}
                    onChange={(e) => setAttendanceFilter(e.target.value)}
                    className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[135px]"
                    title="Filter status kehadiran"
                  >
                    <option value="all">Semua Kehadiran</option>
                    <option value="attended">Sudah Scan</option>
                    <option value="not_attended">Belum Hadir</option>
                  </select>
                ) : null}

                {/* Category Filter */}
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[130px]"
                  title="Filter kategori tamu"
                >
                  <option value="all">Semua Kategori</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="unassigned">Belum Diatur (-)</option>
                </select>

                {/* Tampilkan Limit */}
                <div className="flex items-center gap-1.5 h-8.5 px-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition shrink-0">
                  <span className="text-xs text-gray-500 whitespace-nowrap">Tampilkan</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                      setItemsPerPage(val);
                    }}
                    className="bg-transparent text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer pr-0.5 tabular-nums"
                    title="Jumlah baris per halaman"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                    <option value={1000}>1.000</option>
                    <option value="all">Semua</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Row 2: Secondary Filters (Tipe Undangan, Status Kirim WA, Urutan) */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
              <select
                value={invitationTypeFilter}
                onChange={(e) => setInvitationTypeFilter(e.target.value)}
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[155px]"
                title="Filter tipe undangan"
              >
                <option value="all">Semua Tipe Undangan</option>
                {availableInvitationTypes.map((invType) => (
                  <option key={invType} value={invType}>{invType}</option>
                ))}
                <option value="unassigned">Belum Diatur (-)</option>
              </select>

              {activeTab === 'guest-list' && (
                <select
                  value={waSendFilter}
                  onChange={(e) => setWaSendFilter(e.target.value as any)}
                  className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[145px]"
                  title="Filter status kirim undangan WA"
                >
                  <option value="all">Semua Status Kirim</option>
                  <option value="pending">Belum Dikirim</option>
                  <option value="sent">Sudah Dikirim</option>
                  <option value="failed">Gagal Kirim</option>
                </select>
              )}

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[180px]"
                title="Urutkan Daftar Tamu"
              >
                <option value="category_setting">
                  Urut: Kategori ({configuredCategories.slice(0, 2).join(', ')}{configuredCategories.length > 2 ? '...' : ''})
                </option>
                <option value="category_desc">Urut: Kategori (Terbalik)</option>
                <option value="newest">Urut: Waktu Terbaru</option>
                <option value="name_asc">Urut: Nama (A-Z)</option>
              </select>

              {hasActiveGuestFilter && (
                <button
                  type="button"
                  onClick={resetGuestFilters}
                  className="h-8.5 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
          </div>

          {/* PRIMARY ACTION BAR (Between Filter Box & Table Box, Left-Aligned — Create Event Standard) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {!isStaff && (
                <button
                  type="button"
                  onClick={() => {
                    if (isEventLocked) {
                      showEventLockedAlert();
                      return;
                    }
                    setIsAddingGuest(true);
                    if (eventId && !location.pathname.endsWith('/guests/add')) {
                      navigate(`/auth/login/events/${eventId}/guests/add`);
                    }
                  }}
                  disabled={isEventLocked}
                  className={`h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors whitespace-nowrap shadow-xs ${
                    isEventLocked
                      ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                      : 'text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                  }`}
                  title={isEventLocked ? 'Tambah Tamu dikunci — lakukan Top-Up Paket untuk membuka' : 'Tambah data tamu baru'}
                >
                  {isEventLocked ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>Tambah Tamu</span>
                </button>
              )}

              {!isStaff && (
                isEventLocked ? (
                  <button
                    type="button"
                    disabled
                    className="h-9 px-3 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 rounded-lg whitespace-nowrap text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed"
                    title="Kirim Undangan dikunci — lakukan Top-Up Paket untuk membuka"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Kirim Undangan</span>
                  </button>
                ) : (
                  <Link
                    to={`/auth/login/events/${eventId}/send-invitations`}
                    className="h-9 px-3 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 rounded-lg transition-colors whitespace-nowrap text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"
                    title="Buka halaman khusus Kirim Undangan & Tracking Status Terkirim"
                  >
                    <Send className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Kirim Undangan</span>
                  </Link>
                )
              )}

              {!isStaff && (
                <button
                  type="button"
                  onClick={openBlastModal}
                  disabled={isEventLocked || isBlasting}
                  className={`h-9 px-3 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 rounded-lg transition-colors whitespace-nowrap ${
                    isEventLocked
                      ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                      : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 cursor-pointer'
                  }`}
                  title={isEventLocked ? 'Blast WA dikunci — lakukan Top-Up Paket untuk membuka' : 'Blast WhatsApp Cepat'}
                >
                  {isEventLocked ? (
                    <Lock className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>{isBlasting ? 'Memproses...' : 'Blast WA'}</span>
                </button>
              )}

              {!isStaff && (
                <button
                  type="button"
                  onClick={() => {
                    if (isEventLocked) {
                      showEventLockedAlert();
                      return;
                    }
                    setIsImportModalOpen(true);
                  }}
                  disabled={isEventLocked || isImporting || isGeneratingSample}
                  className={`h-9 px-3 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 rounded-lg transition-colors whitespace-nowrap ${
                    isEventLocked
                      ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                      : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer disabled:opacity-50'
                  }`}
                  title={isEventLocked ? 'Import dikunci — lakukan Top-Up Paket untuk membuka' : 'Import data tamu dari Excel & unduh template'}
                >
                  {isEventLocked ? (
                    <Lock className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>Import</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isEventLocked) {
                    showEventLockedAlert();
                    return;
                  }
                  setIsExportModalOpen(true);
                }}
                disabled={isEventLocked}
                className={`h-9 px-3 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  isEventLocked
                    ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                    : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer'
                }`}
                title={isEventLocked ? 'Export Excel/PDF dikunci — lakukan Top-Up Paket untuk membuka' : 'Ekspor data tamu ke Excel atau PDF'}
              >
                {isEventLocked ? (
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>Export</span>
              </button>

              <button
                type="button"
                onClick={() => fetchGuests(true)}
                disabled={isRefreshingGuests}
                className="h-9 px-3 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 rounded-lg transition-colors text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="Muat Ulang Data Tamu"
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${isRefreshingGuests ? 'animate-spin text-indigo-600' : 'text-gray-500'}`} />
                <span className="hidden sm:inline">Muat Ulang</span>
              </button>

              {appUser?.role === 'superadmin' && (
                <button
                  type="button"
                  onClick={() => handleGenerateSampleGuests(1000)}
                  disabled={isGeneratingSample || isImporting}
                  className="h-9 px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="[Khusus Super Admin] Buat 1.000 data tamu contoh untuk uji coba performa dan scanner"
                >
                  {isGeneratingSample ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                  ) : (
                    <Users className="w-3.5 h-3.5 text-amber-700" />
                  )}
                  <span>+1.000 Contoh</span>
                </button>
              )}

              {(appUser?.role === 'superadmin' || appUser?.role === 'owner' || appUser?.role === 'partner') && guests.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllGuests}
                  disabled={isEventLocked || isGeneratingSample || isImporting}
                  className={`h-9 w-9 justify-center inline-flex items-center rounded-lg transition-colors ${
                    isEventLocked
                      ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                      : 'text-rose-600 bg-white hover:bg-rose-50 border border-gray-200 hover:border-rose-200 cursor-pointer disabled:opacity-50'
                  }`}
                  title={isEventLocked ? 'Reset Semua Tamu dikunci — lakukan Top-Up Paket' : 'Kosongkan Semua Tamu (Reset Acara)'}
                >
                  {isEventLocked ? <Lock className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            <div className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
              <span className="font-semibold text-gray-800">
                {activeTab === 'rsvp' ? 'RSVP & Ucapan' : activeTab === 'attended' ? 'Berhasil Scan' : 'Daftar Tamu'}
              </span>
              <span className="mx-1.5 text-gray-300" aria-hidden="true">·</span>
              <span>
                {filteredGuests.length.toLocaleString('id-ID')} tamu
                {guests.length > 0 && filteredGuests.length !== guests.length && ` dari ${guests.length.toLocaleString('id-ID')}`}
              </span>
            </div>
          </div>

          {/* Progress Indicators for Batch Operations */}
          {(isImporting || isGeneratingSample) && (
            <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                <span className="text-xs sm:text-sm font-medium text-indigo-900">
                  {isImporting ? 'Sedang menulis data Excel ke database...' : 'Sedang membuat 1.000 tamu contoh ke database...'}
                </span>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-100">
                {isImporting && importProgress ? `${importProgress.current} / ${importProgress.total} tamu` : ''}
                {isGeneratingSample && sampleProgress ? `${sampleProgress.current} / ${sampleProgress.total} tamu` : ''}
              </span>
            </div>
          )}

          {/* BOX 2: Standardized Table Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-14 text-sm text-gray-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Memuat daftar tamu...</span>
              </div>
            ) : guests.length === 0 ? (
              <div className="text-center py-14 px-4">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">Belum ada tamu yang ditambahkan</p>
                <p className="text-xs text-gray-500 mt-1">
                  Tambahkan tamu secara manual atau impor daftar tamu dari Excel untuk memulai.
                </p>
              </div>
            ) : filteredGuests.length === 0 ? (
              <div className="text-center py-14 px-4">
                <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">Tidak ada tamu yang cocok dengan filter</p>
                <p className="text-xs text-gray-500 mt-1">
                  Coba ubah kata kunci pencarian, kategori, atau filter status.
                </p>
                {hasActiveGuestFilter && (
                  <button
                    type="button"
                    onClick={resetGuestFilters}
                    className="mt-4 h-8.5 px-3 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            ) : (
              <>
                {selectedGuestIds.length > 0 && !isEventLocked && (
                  <div className="bg-indigo-50/80 px-4 sm:px-5 py-3 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-indigo-800 font-semibold tabular-nums">
                      {selectedGuestIds.length} tamu terpilih
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSinglePrintGuest(null);
                          setIsPrintModalOpen(true);
                        }}
                        className="h-8 px-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                        title="Pilih cetak QR Biasa (20/Hal) atau Bentuk Card E-Invitation (4 atau 8 Card/Hal)"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Cetak QR ({selectedGuestIds.length})</span>
                      </button>
                      {canDirectEditRank && (
                        <button
                          type="button"
                          onClick={() => {
                            setBulkRankValue('');
                            setIsBulkRankModalOpen(true);
                          }}
                          className="h-8 px-3 bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Tambahkan atau ubah Pangkat / Jabatan ke semua tamu terpilih sekaligus tanpa mengubah QR Code"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Set Pangkat ({selectedGuestIds.length})</span>
                        </button>
                      )}
                      {activeTab === 'rsvp' && !isStaff && (
                        <button
                          type="button"
                          onClick={handleBulkResetRsvpAndWishes}
                          className="h-8 px-3 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Hapus ucapan & keluarkan dari list RSVP (Data tamu tetap ada di Daftar Tamu)"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-amber-700" />
                          <span>Hapus Ucapan ({selectedGuestIds.length})</span>
                        </button>
                      )}
                      {(appUser?.role === 'superadmin' || appUser?.role === 'owner' || appUser?.role === 'admin' || appUser?.role === 'partner') && (
                        <button
                          type="button"
                          onClick={handleBulkDeleteGuests}
                          className="h-8 px-3 text-xs text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{activeTab === 'rsvp' ? 'Hapus Permanen' : 'Hapus Terpilih'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedGuestIds([])}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline px-1 cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3.5 text-left w-10">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            checked={!isEventLocked && selectedGuestIds.length === filteredGuests.length && filteredGuests.length > 0}
                            disabled={isEventLocked}
                            onChange={handleSelectAll}
                            title={isEventLocked ? 'Aksi massal dikunci hingga Top-Up Paket' : undefined}
                          />
                        </th>
                        <th className="px-3 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                          No
                        </th>
                        <th className="px-3 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">
                          <div className="flex flex-col">
                            <span>Pangkat / Jabatan</span>
                            {canDirectEditRank && !isEventLocked && (
                              <span className="text-[10px] font-normal normal-case tracking-normal text-indigo-600">
                                Ketik & Enter
                              </span>
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Nama Tamu
                        </th>
                        {(activeTab === 'guest-list' || activeTab === 'attended') && (
                          <>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Alamat
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              No. Hp
                            </th>
                            <th
                              onClick={() => setSortBy((prev) => (prev === 'category_setting' ? 'category_desc' : 'category_setting'))}
                              className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none"
                              title="Klik untuk mengurutkan berdasarkan Kategori sesuai settingan"
                            >
                              <div className="inline-flex items-center gap-1">
                                <span>Kategori</span>
                                <ArrowUpDown
                                  className={`w-3.5 h-3.5 ${
                                    sortBy === 'category_setting' || sortBy === 'category_desc' ? 'text-indigo-600' : 'text-gray-400'
                                  }`}
                                />
                              </div>
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Tipe Undangan
                            </th>
                          </>
                        )}
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Sesi
                        </th>
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Pax
                        </th>
                        {activeTab === 'rsvp' ? (
                          <>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Status RSVP
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Ucapan
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Status Kirim
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Status RSVP
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Status Scan
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Waktu Hadir
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Souvenir
                            </th>
                          </>
                        )}
                        <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 shadow-[-4px_0_12px_-3px_rgba(0,0,0,0.04)] z-10">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedGuests.map((guest, index) => (
                        <tr
                          key={guest.id}
                          className={`group transition-colors ${
                            selectedGuestIds.includes(guest.id) ? 'bg-indigo-50/40' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              checked={!isEventLocked && selectedGuestIds.includes(guest.id)}
                              disabled={isEventLocked}
                              onChange={(e) => handleSelectGuest(guest.id, e.target.checked)}
                            />
                          </td>
                          <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                            {startIndex + index + 1}
                          </td>
                          <td className="px-3 py-3.5 whitespace-nowrap">
                            {canDirectEditRank && !isEventLocked ? (
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  value={
                                    guest.id && inlineTitleDrafts[guest.id] !== undefined
                                      ? inlineTitleDrafts[guest.id]
                                      : guest.title || ''
                                  }
                                  onChange={(e) => {
                                    if (!guest.id) return;
                                    setInlineTitleDrafts((prev) => ({
                                      ...prev,
                                      [guest.id!]: e.target.value,
                                    }));
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.currentTarget.blur();
                                    } else if (e.key === 'Escape' && guest.id) {
                                      setInlineTitleDrafts((prev) => ({
                                        ...prev,
                                        [guest.id!]: guest.title || '',
                                      }));
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  onBlur={(e) => {
                                    handleQuickSaveGuestTitle(guest, e.target.value);
                                  }}
                                  placeholder="+ Pangkat/Gelar..."
                                  className="w-36 px-2.5 py-1 text-xs font-medium text-gray-800 bg-gray-50/70 hover:bg-white focus:bg-white border border-gray-200 focus:border-indigo-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition placeholder:text-gray-400 placeholder:font-normal"
                                  title="Ketik Pangkat/Jabatan (contoh: Letkol, Mayor, Bpk., Ibu) lalu tekan Enter"
                                />
                                {savingTitleGuestId === guest.id && (
                                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin absolute right-2" />
                                )}
                              </div>
                            ) : guest.title ? (
                              <span className="text-xs font-medium text-gray-700">{guest.title}</span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{guest.name}</div>
                            {guest.ticketCode && (
                              <div className="text-[11px] font-mono tabular-nums text-gray-400 mt-0.5">
                                {guest.ticketCode}
                              </div>
                            )}
                          </td>
                          {(activeTab === 'guest-list' || activeTab === 'attended') && (
                            <>
                              <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-600">
                                {guest.address || '-'}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-sm tabular-nums text-gray-600">
                                {guest.phone || '-'}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-indigo-700">
                                {guest.category || <span className="text-gray-400 font-normal">-</span>}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-600">
                                {guest.invitationType || <span className="text-gray-400">-</span>}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-700">
                            {guest.session || <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold tabular-nums">
                            {guest.rsvpStatus === 'declined' ? (
                              <span className="text-rose-600">0 Org</span>
                            ) : (
                              <span className="text-gray-800">{Math.max(1, Number(guest.pax) || 1)} Org</span>
                            )}
                          </td>
                          {activeTab === 'rsvp' ? (
                            <>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium">
                                <span
                                  className={
                                    guest.rsvpStatus === 'attending'
                                      ? 'text-emerald-700'
                                      : guest.rsvpStatus === 'declined'
                                      ? 'text-rose-700'
                                      : 'text-amber-700'
                                  }
                                >
                                  {guest.rsvpStatus === 'attending'
                                    ? 'Hadir'
                                    : guest.rsvpStatus === 'declined'
                                    ? 'Tidak Hadir'
                                    : 'Pending'}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-sm text-gray-600 max-w-xs truncate" title={guest.wishes || '-'}>
                                <div className="flex items-center gap-2">
                                  {guest.stickerUrl && <span className="text-lg leading-none">{guest.stickerUrl}</span>}
                                  <span className="truncate">{guest.wishes || '-'}</span>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium">
                                {(() => {
                                  const dispatchEntry = guest.id ? waDispatchMap[guest.id] : undefined;
                                  const st = dispatchEntry?.status || 'pending';
                                  if (st === 'sent') {
                                    return (
                                      <span
                                        className="text-emerald-700"
                                        title={dispatchEntry?.sentAt ? `Terkirim ${new Date(dispatchEntry.sentAt).toLocaleString('id-ID')}` : 'Terkirim'}
                                      >
                                        Terkirim ({dispatchEntry?.method === 'manual' ? 'Manual' : 'Fonnte'})
                                      </span>
                                    );
                                  }
                                  if (st === 'failed') {
                                    return (
                                      <span className="text-rose-600" title={dispatchEntry?.lastError || 'Gagal mengirim'}>
                                        Gagal
                                      </span>
                                    );
                                  }
                                  return <span className="text-gray-400">Belum</span>;
                                })()}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium">
                                <span
                                  className={
                                    guest.rsvpStatus === 'attending'
                                      ? 'text-emerald-700'
                                      : guest.rsvpStatus === 'declined'
                                      ? 'text-rose-700'
                                      : 'text-amber-700'
                                  }
                                >
                                  {guest.rsvpStatus === 'attending'
                                    ? 'Hadir'
                                    : guest.rsvpStatus === 'declined'
                                    ? 'Tidak Hadir'
                                    : 'Pending'}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                                <div className="flex flex-col items-start gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-semibold ${guest.attended ? 'text-emerald-700' : 'text-gray-400'}`}>
                                      {guest.attended ? 'Hadir' : 'Belum Hadir'}
                                    </span>
                                    {guest.attended && (
                                      <span className="text-[11px] text-gray-500">
                                        · {guest.checkInMethod === 'manual' ? 'Manual' : 'Scan QR'}
                                      </span>
                                    )}
                                  </div>
                                  {guest.attended && guest.checkInStaff && (
                                    <span className="text-[11px] text-gray-500">
                                      Oleh: <span className="font-medium text-indigo-600">{guest.checkInStaff}</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs tabular-nums text-gray-500">
                                {guest.attendedAt && parseFirestoreDate(guest.attendedAt)
                                  ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    })
                                  : '-'}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                                {guest.souvenirTaken ? (
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className="font-semibold text-indigo-700">
                                      {guest.souvenirName || 'Diambil'}
                                    </span>
                                    {guest.souvenirTakenBy && (
                                      <span className="text-[11px] text-gray-500">
                                        Oleh: {guest.souvenirTakenBy}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">Belum</span>
                                )}
                              </td>
                            </>
                          )}
                          <td
                            className={`px-4 py-3.5 whitespace-nowrap text-sm font-medium sticky right-0 z-10 shadow-[-4px_0_12px_-3px_rgba(0,0,0,0.04)] ${
                              selectedGuestIds.includes(guest.id)
                                ? 'bg-indigo-50/40'
                                : 'bg-white group-hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-end space-x-1">
                              {isEventLocked ? (
                                <span
                                  className="inline-flex items-center gap-1 text-xs text-gray-400 cursor-not-allowed"
                                  title="Aksi tamu dikunci sementara — lakukan Top-Up Paket untuk membuka kembali"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Terkunci</span>
                                </span>
                              ) : activeTab === 'rsvp' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleEditWishesClick(guest)}
                                    className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                    title="Edit Ucapan"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteWishes(guest.id!)}
                                    className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                    title="Hapus Ucapan"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAttendance(guest.id!, guest.attended)}
                                    className={`flex items-center justify-center p-1.5 rounded-full transition-colors cursor-pointer ${
                                      guest.attended
                                        ? 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                                        : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                                    }`}
                                    title={guest.attended ? 'Batalkan Kehadiran' : 'Konfirmasi Kehadiran'}
                                  >
                                    {guest.attended ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveQrGuest(guest)}
                                    className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors cursor-pointer"
                                    title="Lihat / Bagikan QR"
                                  >
                                    <QrCode className="w-4 h-4" />
                                  </button>
                                  {!isStaff && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleEditGuestClick(guest)}
                                        className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                        title="Edit Tamu"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => promptDeleteGuest(guest.id!)}
                                        className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
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

                {/* Pagination Footer (Create Event Standard) */}
                <div className="px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 sm:px-5 gap-3 bg-gray-50/50">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 tabular-nums">
                    <span>
                      Menampilkan{' '}
                      <span className="font-semibold text-gray-900">
                        {filteredGuests.length === 0 ? 0 : startIndex + 1}
                      </span>{' '}
                      – <span className="font-semibold text-gray-900">{endIndex}</span> dari{' '}
                      <span className="font-semibold text-indigo-600">{filteredGuests.length}</span> tamu
                    </span>
                    {hasActiveGuestFilter && (
                      <>
                        <span className="text-xs text-gray-400">({guests.length} total)</span>
                        <button
                          type="button"
                          onClick={resetGuestFilters}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline cursor-pointer"
                        >
                          Reset
                        </button>
                      </>
                    )}
                  </div>

                  {itemsPerPage !== 'all' && totalPages > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title="Halaman Pertama"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        Sebelumnya
                      </button>
                      <span className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg tabular-nums">
                        Hal <span className="text-indigo-600 font-bold">{currentPage}</span> / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        Selanjutnya
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
      )}

      <Modal isOpen={isBlastModalOpen} onClose={() => setIsBlastModalOpen(false)} title="Blast WhatsApp">
        <div className="space-y-4">
          <div className={`p-3 rounded-lg border text-xs ${
            isUsingOwnFonnteToken
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            {isUsingOwnFonnteToken ? (
              <span>
                <strong>Mode Token Sendiri Aktif:</strong> Pengiriman memakai Token Fonnte {event?.fonnteToken ? 'Acara' : 'Client/Akun'} dan <strong>tidak memotong kuota Guestly</strong>.
              </span>
            ) : (
              <span>
                <strong>Mode Fallback Token Global:</strong> Akan memotong kuota WA Blast Guestly. Untuk kirim lebih terkontrol &amp; melihat preview Kartu E-Invitation, gunakan halaman{' '}
                <Link to={`/auth/login/events/${eventId}/send-invitations`} onClick={() => setIsBlastModalOpen(false)} className="underline font-semibold text-indigo-700">
                  Kirim Undangan
                </Link>.
              </span>
            )}
          </div>
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
              onClick={() => {
                setIsBlastModalOpen(false);
                showCancelAlert('Pengiriman WA Blast telah dibatalkan.');
              }} 
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

      <Modal
        isOpen={isBulkRankModalOpen}
        onClose={() => {
          if (!isSavingBulkRank) setIsBulkRankModalOpen(false);
        }}
        title={`Set Pangkat / Jabatan (${selectedGuestIds.length} Tamu Terpilih)`}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleBulkSetRank} className="p-4 bg-white space-y-4">
          <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
            Pangkat/Jabatan yang Anda masukkan akan otomatis digabungkan di depan nama asli tamu (contoh: <strong>Letkol Adi Saputra</strong>) <strong>tanpa mengubah Kode Tiket / QR Code</strong>.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pangkat / Gelar / Jabatan
            </label>
            <input
              type="text"
              value={bulkRankValue}
              onChange={e => setBulkRankValue(e.target.value)}
              placeholder="Contoh: Letkol, Mayor, Kolonel, Bpk., Ibu..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Letkol', 'Mayor', 'Kolonel', 'Kapten', 'Lettu', 'Letda', 'Jenderal', 'Bpk.', 'Ibu', 'Dr.', 'Ir.', 'H.', 'Hj.'].map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBulkRankValue(preset)}
                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                    bulkRankValue === preset
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
              {bulkRankValue && (
                <button
                  type="button"
                  onClick={() => setBulkRankValue('')}
                  className="px-2 py-1 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer"
                >
                  Kosongkan Pangkat
                </button>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              disabled={isSavingBulkRank}
              onClick={() => setIsBulkRankModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSavingBulkRank}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSavingBulkRank ? 'Menyimpan...' : `Terapkan ke ${selectedGuestIds.length} Tamu`}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAddingGuest}
        onClose={() => {
          setIsAddingGuest(false);
          if (location.pathname.endsWith('/guests/add')) {
            navigate(`/auth/login/events/${eventId}`);
          }
        }}
        title="Data Tamu Baru"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleAddGuest} className="p-4 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pangkat / Jabatan</label>
              <input
                value={newGuestTitle}
                onChange={e => setNewGuestTitle(e.target.value)}
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Contoh: Letkol / Bpk."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
              <input
                required
                value={newGuestName}
                onChange={e => setNewGuestName(e.target.value)}
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Adi Saputra"
              />
            </div>
            {(newGuestTitle.trim() || newGuestName.trim()) && (
              <div className="sm:col-span-3 px-3 py-2 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center justify-between text-xs">
                <span className="text-slate-600">Hasil Akhir Nama Tamu:</span>
                <span className="font-bold text-indigo-900">
                  {formatGuestFullName(newGuestName, newGuestTitle)}
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">No HP</label>
              <input
                value={newGuestPhone}
                onChange={e => setNewGuestPhone(e.target.value)}
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="08123456789"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
              <input
                value={newGuestAddress}
                onChange={e => setNewGuestAddress(e.target.value)}
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Jl. Sudirman No 1"
              />
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
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setIsAddingGuest(false);
                if (location.pathname.endsWith('/guests/add')) {
                  navigate(`/auth/login/events/${eventId}`);
                }
                showCancelAlert('Penambahan tamu baru telah dibatalkan.');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              {isManagedClient ? 'Ajukan Tambah Tamu' : 'Simpan Tamu'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditingGuest}
        onClose={() => {
          setIsEditingGuest(false);
          setEditingGuestId(null);
          if (location.pathname.includes('/guests/')) {
            navigate(`/auth/login/events/${eventId}`);
          }
        }}
        title="Edit Tamu"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveEditGuest} className="p-4 bg-white">
          <div className="grid grid-cols-1 gap-4 mb-4">
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Pangkat / Jabatan</label>
                 <input
                   value={editGuestTitle}
                   onChange={e => setEditGuestTitle(e.target.value)}
                   type="text"
                   className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                   placeholder="Contoh: Letkol / Bpk."
                 />
               </div>
               <div className="sm:col-span-2">
                 <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
                 <input required value={editGuestName} onChange={e => setEditGuestName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Adi Saputra" />
               </div>
             </div>
             {(editGuestTitle.trim() || editGuestName.trim()) && (
               <div className="px-3 py-2 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center justify-between text-xs">
                 <span className="text-slate-600">Hasil Akhir Nama Tamu (QR Tetap Sama):</span>
                 <span className="font-bold text-indigo-900">
                   {formatGuestFullName(editGuestName, editGuestTitle)}
                 </span>
               </div>
             )}
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
              onClick={() => {
                setIsEditingGuest(false);
                setEditingGuestId(null);
                if (location.pathname.includes('/guests/')) {
                  navigate(`/auth/login/events/${eventId}`);
                }
                showCancelAlert('Perubahan data tamu telah dibatalkan.');
              }} 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 transition-colors"
            >
              {isManagedClient ? 'Ajukan Edit' : 'Simpan Perubahan'}
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
              onClick={() => {
                setIsEditingWishes(false);
                setEditingWishesGuestId(null);
                showCancelAlert('Perubahan ucapan telah dibatalkan.');
              }} 
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
            onClick={() => {
              setGuestToDelete(null);
              showCancelAlert('Penghapusan tamu telah dibatalkan.');
            }} 
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

      <Modal
        isOpen={!!rsvpGuestToDelete}
        onClose={() => {
          if (!isDeletingRsvpAction) setRsvpGuestToDelete(null);
        }}
        title="Hapus Ucapan & Data RSVP"
        maxWidth="max-w-lg"
      >
        {rsvpGuestToDelete && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-sm font-semibold text-slate-900">{rsvpGuestToDelete.name}</div>
              {rsvpGuestToDelete.wishes ? (
                <p className="text-xs text-slate-600 mt-1 italic line-clamp-3">
                  "{rsvpGuestToDelete.stickerUrl ? `${rsvpGuestToDelete.stickerUrl} ` : ''}{rsvpGuestToDelete.wishes}"
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-1">Tidak ada teks ucapan (Status RSVP: {rsvpGuestToDelete.rsvpStatus === 'attending' ? 'Hadir' : rsvpGuestToDelete.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Pending'})</p>
              )}
            </div>

            <p className="text-xs text-slate-600">
              Pilih tindakan penghapusan yang Anda inginkan untuk data di atas:
            </p>

            <div className="space-y-2.5">
              {/* Opsi 1: Hapus Ucapan & Keluarkan dari List RSVP */}
              <button
                type="button"
                disabled={isDeletingRsvpAction}
                onClick={handleConfirmResetRsvpAndWishes}
                className="w-full text-left p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 transition-colors flex items-start justify-between gap-3 cursor-pointer disabled:opacity-50"
              >
                <div>
                  <div className="text-sm font-bold text-amber-900">
                    1. Hapus Ucapan & Keluarkan dari List RSVP
                  </div>
                  <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                    Menghapus pesan ucapan/stiker dan mengeluarkan baris ini dari tab <strong>RSVP & Ucapan</strong>. Data tamu di tab <strong>Daftar Tamu utama tetap aman</strong>.
                  </p>
                </div>
                <Trash2 className="w-4 h-4 text-amber-700 shrink-0 mt-1" />
              </button>

              {/* Opsi 2: Hapus Permanen Beserta Data Tamu */}
              <button
                type="button"
                disabled={isDeletingRsvpAction}
                onClick={handleConfirmPermanentDeleteFromRsvp}
                className="w-full text-left p-3.5 rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100/70 transition-colors flex items-start justify-between gap-3 cursor-pointer disabled:opacity-50"
              >
                <div>
                  <div className="text-sm font-bold text-rose-900">
                    2. Hapus Permanen Tamu & Ucapan
                  </div>
                  <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                    Menghapus ucapan sekaligus menghapus data tamu ini <strong>secara permanen</strong> dari seluruh daftar acara (cocok untuk menghapus input spam).
                  </p>
                </div>
                <Trash2 className="w-4 h-4 text-rose-700 shrink-0 mt-1" />
              </button>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingRsvpAction}
                onClick={() => {
                  setRsvpGuestToDelete(null);
                  showCancelAlert('Penghapusan telah dibatalkan.');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        )}
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
                    onClick={() => {
                      setIsPrintModalOpen(false);
                      showCancelAlert('Pencetakan QR telah dibatalkan.');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteBulkPrint}
                    disabled={isPreparingPrint}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {isPreparingPrint ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Printer className="w-4 h-4" />
                    )}
                    <span>{isPreparingPrint ? 'Menyiapkan PDF...' : `Cetak Sekarang (${count} Tamu)`}</span>
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
                src={resolveMediaUrl(thumbnailInput)}
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
              onClick={() => {
                setIsThumbnailModalOpen(false);
                showCancelAlert('Pengaturan thumbnail telah dibatalkan.');
              }}
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

      {/* Modal Import Data Tamu */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          if (!isImporting) {
            setIsImportModalOpen(false);
            setSelectedImportFile(null);
          }
        }}
        title="Import Data Tamu"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            Unggah file spreadsheet Microsoft Excel (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">.xlsx</code> / <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">.xls</code>) untuk memasukkan ratusan atau ribuan data tamu secara instan.
          </p>

          {/* Bagian 1: Download Template */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Langkah 1: Unduh Format Template
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pastikan susunan kolom sesuai dengan template resmi agar data terbaca sempurna.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 rounded-lg shadow-2xs transition-colors shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh Template Tamu (.xlsx)
              </button>
            </div>

            <div className="bg-white rounded-lg p-3 border border-slate-200 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Kolom yang didukung:</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">Nama Tamu * (Wajib)</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Pangkat / Jabatan</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Alamat</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">No. Hp</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Kategori</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Tipe Undangan</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Sesi</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Jumlah Pax</span>
              </div>
            </div>
          </div>

          {/* Bagian 2: Unggah File */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-indigo-600" />
              Langkah 2: Pilih File yang Telah Diisi
            </h4>

            <input
              type="file"
              ref={modalFileInputRef}
              accept=".xlsx, .xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSelectedImportFile(file);
              }}
            />

            {!selectedImportFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                    setSelectedImportFile(file);
                  } else {
                    showAlert('File Tidak Sesuai', 'Hanya file Excel (.xlsx atau .xls) yang didukung.', 'warning');
                  }
                }}
                onClick={() => modalFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 ${
                  isDraggingFile
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/70'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-slate-700">
                  Klik untuk memilih file atau seret file ke sini
                </div>
                <p className="text-xs text-slate-400">
                  Mendukung Microsoft Excel (.xlsx, .xls)
                </p>
              </div>
            ) : (
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {selectedImportFile.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(selectedImportFile.size / 1024).toFixed(1)} KB • Siap diimpor
                    </p>
                  </div>
                </div>

                {!isImporting && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImportFile(null);
                      if (modalFileInputRef.current) modalFileInputRef.current.value = '';
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white transition-colors"
                    title="Hapus file terpilih"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Progress Indicator */}
          {isImporting && (
            <div className="space-y-2 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  Mengimpor data tamu ke database...
                </span>
                <span>
                  {importProgress?.total
                    ? `${importProgress.current} / ${importProgress.total} (${Math.round(
                        (importProgress.current / importProgress.total) * 100
                      )}%)`
                    : 'Memproses...'}
                </span>
              </div>
              <div className="w-full h-2 bg-indigo-200/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-200 rounded-full"
                  style={{
                    width: importProgress?.total
                      ? `${Math.round((importProgress.current / importProgress.total) * 100)}%`
                      : '20%'
                  }}
                />
              </div>
            </div>
          )}

          {/* Info Duplikat */}
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200/80 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Sistem akan otomatis memeriksa nama yang sudah terdaftar. Jika ada nama yang sama persis, data tersebut akan dilewati untuk mencegah data ganda.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={isImporting}
              onClick={() => {
                setIsImportModalOpen(false);
                setSelectedImportFile(null);
              }}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!selectedImportFile || isImporting}
              onClick={() => {
                if (selectedImportFile) processFile(selectedImportFile);
              }}
              className="px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengimpor...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Mulai Import Tamu</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Export Data Tamu */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Ekspor Data Tamu"
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          {/* Ringkasan Data */}
          <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-indigo-950">
                {event?.title || 'Acara'}
              </p>
              <p className="text-indigo-700 mt-0.5">
                Total tamu yang akan diekspor: <span className="font-bold">{filteredGuests.length.toLocaleString('id-ID')}</span> tamu
                {filteredGuests.length !== guests.length && (
                  <span className="text-indigo-600 font-normal"> (dari {guests.length.toLocaleString('id-ID')} total, sesuai filter aktif)</span>
                )}
              </p>
            </div>
            <div className="px-2.5 py-1 rounded-md bg-white border border-indigo-200 font-mono font-semibold text-indigo-700 shrink-0 text-xs">
              {filteredGuests.length} Tamu
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Pilih format dokumen ekspor yang Anda butuhkan di bawah ini:
          </p>

          <div className="space-y-3">
            {/* Opsi 1: Excel */}
            <div className="border border-slate-200 hover:border-emerald-300 rounded-xl p-4 transition-all hover:bg-emerald-50/20 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-950">
                        Microsoft Excel (.xlsx)
                      </h4>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Format Lengkap
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Berisi data lengkap: Nama, Pangkat/Jabatan, Kode Tiket QR, Nomor HP, Alamat, Kategori, Sesi, Pax, RSVP, Kehadiran, Metode Check-In (Scan/Manual), Waktu Hadir, Petugas, dan Souvenir.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    handleExportExcel();
                    setIsExportModalOpen(false);
                  }}
                  className="w-full py-2.5 px-4 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download File Excel (.xlsx)
                </button>
              </div>
            </div>

            {/* Opsi 2: PDF */}
            <div className="border border-slate-200 hover:border-rose-300 rounded-xl p-4 transition-all hover:bg-rose-50/20 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-rose-950">
                        Dokumen PDF (.pdf)
                      </h4>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                        Siap Cetak
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Format tabel rapi siap cetak dan arsip (Nomor Urut, Nama, Alamat, No. HP, Kategori, Tipe Undangan, Sesi, Pax, RSVP, Status Check-In, dan Waktu Kehadiran).
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    handleExportPDF();
                    setIsExportModalOpen(false);
                  }}
                  className="w-full py-2.5 px-4 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download Dokumen PDF (.pdf)
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsExportModalOpen(false)}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* Loading Overlay while Preparing A4 Print / PDF Assets */}
      {isPreparingPrint && (
        <div className="fixed inset-0 z-[100] bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 text-center space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Menyiapkan Dokumen Cetak QR
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {printPrepStatus || 'Memuat data tamu, gambar kartu & tata letak A4...'}
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full w-2/3 bg-indigo-600 rounded-full animate-pulse" />
            </div>
            <p className="text-[11px] text-slate-400">
              Mohon tunggu sejenak hingga jendela Print/PDF terbuka otomatis.
            </p>
          </div>
        </div>
      )}

      {/* Portaled Print Area directly inside document.body (isolated from sidebar, header & h-screen overflow-hidden) */}
      {typeof document !== 'undefined' &&
        printRenderGuests &&
        printRenderGuests.length > 0 &&
        createPortal(
          <div
            id="print-area"
            className={`bg-white text-black ${isPreparingPrint ? 'print-area-preloading' : ''}`}
          >
            {(() => {
              const selectedGuests = printRenderGuests;
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

              if (printRenderFormat === 'card-4' || printRenderFormat === 'card-8') {
                const perPage = printRenderFormat === 'card-4' ? 4 : 8;
                const cardWidthPx = printRenderFormat === 'card-4' ? 420 : 344;
                const cardHeightPx = Math.round((675 * cardWidthPx) / 1200);
                const pageClass = printRenderFormat === 'card-4' ? 'a4-card-page-4' : 'a4-card-page-8';
                const pages: Guest[][] = [];
                for (let i = 0; i < selectedGuests.length; i += perPage) {
                  pages.push(selectedGuests.slice(i, i + perPage));
                }

                return pages.map((pageGuests, pageIndex) => (
                  <div key={pageIndex} className={pageClass}>
                    {pageGuests.map((guest) => (
                      <div
                        key={guest.id}
                        className="a4-qr-card"
                        style={{ width: `${cardWidthPx}px`, height: `${cardHeightPx}px` }}
                      >
                        <EInvitationCard
                          fixedWidthPx={cardWidthPx}
                          event={event}
                          guest={guest}
                          template={activeTemplate}
                          appLogoUrl={settings?.logoUrl}
                          appFaviconUrl={settings?.faviconUrl}
                          appBrandName={settings?.appName || 'Guestly'}
                          appTagline="Buku Tamu Digital"
                          className="!shadow-none"
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
          </div>,
          document.body
        )}

      {/* Modal Pengingat Grup WhatsApp Tim (H-3 & H-1) */}
      {event && (
        <EventGroupReminderModal
          isOpen={isGroupReminderModalOpen}
          onClose={() => setIsGroupReminderModalOpen(false)}
          event={event}
          currentAppUser={appUser}
          onEventUpdated={(updatedLog) => {
            setEvent((prev) => (prev ? { ...prev, groupReminderLog: updatedLog } : prev));
          }}
        />
      )}
    </div>
  );
}
