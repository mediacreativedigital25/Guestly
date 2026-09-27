import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, getDocs, where, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, deleteField, runTransaction, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { EventRecord, Client, User, EInviteTemplate } from '../types';
import { parseFirestoreDate, canUserAccessEvent, canUserCreateEvent, getUserBusinessId, getRoleLabel, isPartnerBusinessRegistered } from '../lib/utils';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Image as ImageIcon, Trash2, Edit, ScanLine, Eye, ArrowUp, ArrowDown, Gift, Building2, Lock, Sparkles, Check } from 'lucide-react';
import { Modal } from '../components/Modal';
import { MediaUploader } from '../components/media/MediaUploader';
import { EInvitationCard, splitCoupleNames } from '../components/EInvitationCard';
import { eInviteTemplateService, DEFAULT_EINVITE_TEMPLATES } from '../services/eInviteTemplateService';
import { showAlert, showConfirm } from '../lib/alerts';

export default function EventsList() {
  const { appUser } = useAuth();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [isPartnerNoticeOpen, setIsPartnerNoticeOpen] = useState(false);
  const [ownerBusinessProfile, setOwnerBusinessProfile] = useState<Partial<User> | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'frame' | 'categories' | 'theme' | 'einvite'>('info');
  
  // Event Form State
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCoupleName, setNewEventCoupleName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventDigitalInviteLink, setNewEventDigitalInviteLink] = useState('');
  const [newEventFrame, setNewEventFrame] = useState('');
  const [newEventThumbnail, setNewEventThumbnail] = useState('');
  const [newEventTheme, setNewEventTheme] = useState('default');
  const [newEventDisableTicketRsvpForm, setNewEventDisableTicketRsvpForm] = useState(false);
  const [newEventClientId, setNewEventClientId] = useState('');
  const [newEventActiveUntil, setNewEventActiveUntil] = useState('');
  const [guestCategories, setGuestCategories] = useState<string[]>(['VIP', 'Keluarga', 'Reguler']);
  const [newCategory, setNewCategory] = useState('');
  const [invitationTypes, setInvitationTypes] = useState<string[]>(['Undangan Fisik', 'Undangan Cetak', 'Undangan Digital']);
  const [newInvitationType, setNewInvitationType] = useState('');
  const [sessions, setSessions] = useState<string[]>(['Akad Nikah', 'Resepsi']);
  const [newSession, setNewSession] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // E-Invitation Tab State
  const [eInviteTemplates, setEInviteTemplates] = useState<EInviteTemplate[]>(DEFAULT_EINVITE_TEMPLATES);
  const [selectedEInviteTemplateId, setSelectedEInviteTemplateId] = useState<string>('default-blush-arch');
  const [selectedEInviteTemplateUrl, setSelectedEInviteTemplateUrl] = useState<string>('');
  const [eInviteHeaderText, setEInviteHeaderText] = useState<string>('THE WEDDING OF');
  const [eInviteGroomName, setEInviteGroomName] = useState<string>('');
  const [eInviteBrideName, setEInviteBrideName] = useState<string>('');
  const [eInviteVenueName, setEInviteVenueName] = useState<string>('');
  const [eInviteVenueAddress, setEInviteVenueAddress] = useState<string>('');
  const [eInviteGreetingText, setEInviteGreetingText] = useState<string>(
    'Dengan hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara pernikahan kami.'
  );
  const [eInviteFooterText, setEInviteFooterText] = useState<string>('ATAS KEHADIRAN DAN DOA RESTUNYA');
  const [eInviteMode, setEInviteMode] = useState<'full' | 'compact'>('full');
  const [isQuickUploadingTemplate, setIsQuickUploadingTemplate] = useState(false);
  const [quickTemplateName, setQuickTemplateName] = useState('');
  const [quickTemplateUrl, setQuickTemplateUrl] = useState('');
  const [quickTemplateKey, setQuickTemplateKey] = useState('');

  useEffect(() => {
    eInviteTemplateService.getTemplates().then((list) => {
      setEInviteTemplates(list);
      const def = list.find((t) => t.isDefault) || list[0];
      if (def && !editingEventId) {
        setSelectedEInviteTemplateId(def.id);
        setSelectedEInviteTemplateUrl(def.imageUrl || '');
      }
    });
  }, [editingEventId]);

  const resetForm = () => {
    setNewEventTitle('');
    setNewEventCoupleName('');
    setNewEventDate('');
    setNewEventTime('');
    setNewEventLocation('');
    setNewEventDigitalInviteLink('');
    setNewEventFrame('');
    setNewEventThumbnail('');
    setNewEventTheme('default');
    setNewEventDisableTicketRsvpForm(false);
    setNewEventClientId('');
    setNewEventActiveUntil('');
    setGuestCategories(['VIP', 'Keluarga', 'Reguler']);
    setNewCategory('');
    setInvitationTypes(['Undangan Fisik', 'Undangan Cetak', 'Undangan Digital']);
    setNewInvitationType('');
    setSessions(['Akad Nikah', 'Resepsi']);
    setNewSession('');
    const defTpl = eInviteTemplates.find((t) => t.isDefault) || eInviteTemplates[0] || DEFAULT_EINVITE_TEMPLATES[0];
    setSelectedEInviteTemplateId(defTpl.id);
    setSelectedEInviteTemplateUrl(defTpl.imageUrl || '');
    setEInviteHeaderText('THE WEDDING OF');
    setEInviteGroomName('');
    setEInviteBrideName('');
    setEInviteVenueName('');
    setEInviteVenueAddress('');
    setEInviteGreetingText('Dengan hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara pernikahan kami.');
    setEInviteFooterText('ATAS KEHADIRAN DAN DOA RESTUNYA');
    setEInviteMode('full');
    setIsQuickUploadingTemplate(false);
    setEditingEventId(null);
    setActiveTab('info');
  };

  const isPartnerVerified = isPartnerBusinessRegistered(appUser, ownerBusinessProfile);

  const openCreateModal = () => {
    if (!canUserCreateEvent(appUser)) {
      showAlert('Akses Ditolak', 'Role Anda tidak memiliki akses untuk membuat acara baru.', 'warning');
      return;
    }

    // Check if Partner / Owner / Admin has a verified Business Profile (Nama Usaha + Alamat Lengkap) registered by Super Admin
    if (appUser && ['owner', 'partner', 'admin'].includes(appUser.role) && !isPartnerVerified) {
      setIsPartnerNoticeOpen(true);
      return;
    }

    let hasAccess = false;

    if (appUser?.role === 'superadmin' || appUser?.role === 'owner' || appUser?.role === 'admin' || appUser?.allowManualEvent || appUser?.eventManual) {
      hasAccess = true;
    } else {
      const userEventCredit = appUser?.eventCredit !== undefined ? appUser.eventCredit : (appUser?.eventQuota || 0);
      if (userEventCredit > 0) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
       showAlert('Akses Ditolak', 'Anda tidak memiliki kuota acara. Silakan hubungi Super Admin atau beli layanan terlebih dahulu.', 'warning');
       navigate('/auth/login/services/catalog');
       return;
    }

    resetForm();
    if (clients.length > 0) {
      setNewEventClientId(clients[0].id!);
    }
    setIsCreating(true);
  };

  const openEditModal = (event: EventRecord) => {
    setEditingEventId(event.id || null);
    setNewEventTitle(event.title);
    setNewEventCoupleName(event.coupleName || '');
    setNewEventDate(event.date);
    setNewEventTime(event.time || '');
    setNewEventLocation(event.location || '');
    setNewEventDigitalInviteLink(event.digitalInviteLink || '');
    setNewEventFrame(event.frameOverlayUrl || '');
    setNewEventThumbnail(event.thumbnailUrl || '');
    setNewEventTheme(event.rsvpTheme || 'default');
    setNewEventDisableTicketRsvpForm(event.disableTicketRsvpForm || false);
    setNewEventClientId(event.clientId || '');
    setNewEventActiveUntil(event.activeUntil || '');
    setGuestCategories(event.guestCategories || []);
    setNewCategory('');
    setInvitationTypes(event.invitationTypes && event.invitationTypes.length > 0 ? event.invitationTypes : ['Undangan Fisik', 'Undangan Cetak', 'Undangan Digital']);
    setNewInvitationType('');
    setSessions(event.sessions || []);
    setNewSession('');
    const defTpl = eInviteTemplates.find((t) => t.isDefault) || eInviteTemplates[0] || DEFAULT_EINVITE_TEMPLATES[0];
    setSelectedEInviteTemplateId(event.eInviteTemplateId || defTpl.id);
    setSelectedEInviteTemplateUrl(event.eInviteTemplateUrl || '');
    setEInviteHeaderText(event.eInviteHeaderText || 'THE WEDDING OF');
    const parsedCouple = splitCoupleNames(event.coupleName, event.eInviteGroomName, event.eInviteBrideName, event.title);
    setEInviteGroomName(event.eInviteGroomName || parsedCouple.groom || '');
    setEInviteBrideName(event.eInviteBrideName || parsedCouple.bride || '');
    setEInviteVenueName(event.eInviteVenueName || '');
    setEInviteVenueAddress(event.eInviteVenueAddress || '');
    setEInviteGreetingText(
      event.eInviteGreetingText ||
        'Dengan hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara pernikahan kami.'
    );
    setEInviteFooterText(event.eInviteFooterText || 'ATAS KEHADIRAN DAN DOA RESTUNYA');
    setEInviteMode(event.eInviteMode || 'full');
    setIsQuickUploadingTemplate(false);
    setActiveTab('info');
    setIsCreating(true);
  }; // Used the same modal

  const navigate = useNavigate();

  useEffect(() => {
    let unsubscribeEvents: () => void;
    let unsubscribeClients: () => void;

    const fetchEventsAndClients = async () => {
      try {
        const eventsRef = collection(db, 'events');
        const clientsRef = collection(db, 'clients');
        let q = query(eventsRef);
        let cQuery = query(clientsRef);
        
        if (appUser?.role === 'client') {
          const targetClientId = appUser?.clientId || appUser?.id || '';
          if (!targetClientId) {
            setEvents([]);
            setLoading(false);
            return;
          }
          q = query(eventsRef, where('clientId', '==', targetClientId));
        }

        const { getDocs, getDoc, limit } = await import('firebase/firestore');

        let clientsData: Client[] = [];
        const myBizIds = new Set<string>(
          [appUser?.id, appUser?.partnerId, getUserBusinessId(appUser)].filter(Boolean) as string[]
        );
        const myClientIds = new Set<string>();

        if (appUser?.role !== 'client' && appUser?.role !== 'staff') {
          try {
            const [snapClients, snapUsers] = await Promise.all([
              getDocs(cQuery),
              getDocs(collection(db, 'users')),
            ]);

            if (appUser && ['owner', 'partner', 'admin'].includes(appUser.role)) {
              snapUsers.docs.forEach(uDoc => {
                const u = uDoc.data() as User;
                if (
                  (u.partnerId && myBizIds.has(u.partnerId)) ||
                  (u.createdBy && myBizIds.has(u.createdBy)) ||
                  myBizIds.has(uDoc.id)
                ) {
                  myBizIds.add(uDoc.id);
                  if (u.partnerId) myBizIds.add(u.partnerId);
                }
              });

              const targetOwnerId = appUser.role === 'admin' ? (appUser.partnerId || '') : (appUser.id || '');
              if (targetOwnerId) {
                const foundOwner = snapUsers.docs.find(d => d.id === targetOwnerId || d.data()?.partnerId === targetOwnerId);
                if (foundOwner) {
                  setOwnerBusinessProfile({ id: foundOwner.id, ...(foundOwner.data() as User) });
                } else {
                  const ownerSnap = await getDoc(doc(db, 'users', targetOwnerId));
                  if (ownerSnap.exists()) {
                    setOwnerBusinessProfile({ id: ownerSnap.id, ...(ownerSnap.data() as User) });
                  }
                }
              }
            }

            clientsData = snapClients.docs.map(d => ({ id: d.id, ...d.data() } as Client));
            if (appUser?.role !== 'superadmin' && myBizIds.size > 0) {
              clientsData = clientsData.filter(c => c.partnerId && myBizIds.has(c.partnerId));
            }
            clientsData.forEach(c => {
              if (c.id) myClientIds.add(c.id);
            });
            setClients(clientsData);
          } catch (error) {
            console.error("Error fetching clients for events list:", error);
          }
        } else {
          setClients([]);
        }

        try {
          const qLimited = query(q, limit(100));
          const snapshot = await getDocs(qLimited);
          const rawData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EventRecord));
          const allowedPartnerIds = Array.from(myBizIds);
          const userPrimaryBizId = getUserBusinessId(appUser) || appUser?.id || '';
          const data = rawData.filter(ev => {
            const effectivePartnerId =
              ev.clientId && myClientIds.has(ev.clientId)
                ? userPrimaryBizId
                : ev.partnerId;
            return canUserAccessEvent(appUser, ev.id, effectivePartnerId, allowedPartnerIds);
          });
          setEvents(data);
          setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
          setHasMore(snapshot.docs.length === 100);
          setLoading(false);
        } catch(error) {
          handleFirestoreError(error, OperationType.GET, 'events');
          setLoading(false);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'events');
        setLoading(false);
      }
    };

    if (appUser) fetchEventsAndClients();

    return () => {};
  }, [appUser]);

  
  const handleLoadMore = async () => {
    if (!lastVisible || !appUser) return;
    setLoadingMore(true);
    try {
      const { collection, query, getDocs, where, limit, startAfter } = await import('firebase/firestore');
      const eventsRef = collection(db, 'events');
      let q = query(eventsRef);
      if (appUser?.role === 'partner') {
        q = query(eventsRef, where('partnerId', '==', appUser.id || ''));
      } else if (appUser?.role === 'client') {
        const targetClientId = appUser?.clientId || appUser?.id || '';
        q = query(eventsRef, where('clientId', '==', targetClientId));
      }
      const qLimited = query(q, startAfter(lastVisible), limit(50));
      const snapshot = await getDocs(qLimited);
      const rawData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventRecord));
      const data = rawData.filter(ev => canUserAccessEvent(appUser, ev.id, ev.partnerId));
      setEvents(prev => [...prev, ...data]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more events", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSaveEvent = async () => {
    if (!appUser || !canUserCreateEvent(appUser)) {
      showAlert('Akses Ditolak', 'Role Anda tidak memiliki akses untuk membuat atau mengubah acara.', 'warning');
      return;
    }
    if (!editingEventId && ['owner', 'partner', 'admin'].includes(appUser.role) && !isPartnerVerified) {
      setIsCreating(false);
      setIsPartnerNoticeOpen(true);
      return;
    }
    if (!newEventTitle || !newEventDate || !newEventClientId) {
      showAlert('Peringatan', 'Nama acara, tanggal, dan client wajib diisi.', 'warning');
      return;
    }
    
    const confirmed = await showConfirm('Apakah Anda yakin ingin menyimpan acara ini?');
    if (!confirmed) return;
    
    const selectedClient = clients.find(c => c.id === newEventClientId);
    const partnerId = selectedClient?.partnerId || getUserBusinessId(appUser) || appUser.id || 'default-partner';
    
    try {
      const payload: any = {
        title: newEventTitle,
        coupleName: newEventCoupleName,
        date: newEventDate,
        clientId: newEventClientId,
        updatedAt: serverTimestamp()
      };
      
      if (newEventTime) payload.time = newEventTime;
      else if (editingEventId) payload.time = deleteField();
      
      if (newEventLocation) payload.location = newEventLocation;
      else if (editingEventId) payload.location = deleteField();

      if (newEventDigitalInviteLink) payload.digitalInviteLink = newEventDigitalInviteLink;
      else if (editingEventId) payload.digitalInviteLink = deleteField();
      
      if (newEventActiveUntil) payload.activeUntil = newEventActiveUntil;
      else if (editingEventId) payload.activeUntil = deleteField();
      
      if (newEventFrame) payload.frameOverlayUrl = newEventFrame;
      else if (editingEventId) payload.frameOverlayUrl = deleteField();
      
      if (newEventThumbnail) payload.thumbnailUrl = newEventThumbnail;
      else if (editingEventId) payload.thumbnailUrl = deleteField();
      
      if (newEventTheme) payload.rsvpTheme = newEventTheme;
      else if (editingEventId) payload.rsvpTheme = deleteField();

      if (newEventDisableTicketRsvpForm !== undefined) payload.disableTicketRsvpForm = newEventDisableTicketRsvpForm;

      if (guestCategories && guestCategories.length > 0) payload.guestCategories = guestCategories;
      else if (editingEventId) payload.guestCategories = deleteField();

      if (invitationTypes && invitationTypes.length > 0) payload.invitationTypes = invitationTypes;
      else if (editingEventId) payload.invitationTypes = deleteField();

      if (sessions && sessions.length > 0) payload.sessions = sessions;
      else if (editingEventId) payload.sessions = deleteField();

      // Save E-Invitation Settings
      payload.eInviteTemplateId = selectedEInviteTemplateId || 'default-blush-arch';
      payload.eInviteTemplateUrl = selectedEInviteTemplateUrl || '';
      payload.eInviteHeaderText = eInviteHeaderText.trim() || 'THE WEDDING OF';
      payload.eInviteGroomName = eInviteGroomName.trim();
      payload.eInviteBrideName = eInviteBrideName.trim();
      payload.eInviteVenueName = eInviteVenueName.trim();
      payload.eInviteVenueAddress = eInviteVenueAddress.trim();
      payload.eInviteGreetingText = eInviteGreetingText.trim();
      payload.eInviteFooterText = eInviteFooterText.trim();
      payload.eInviteMode = eInviteMode;

      if (editingEventId) {
        await updateDoc(doc(db, 'events', editingEventId), payload);
        // Update local state
        setEvents(events.map(ev => 
          ev.id === editingEventId ? { ...ev, ...payload, updatedAt: new Date() } : ev
        ));
        setIsCreating(false);
        showAlert('Berhasil', 'Acara berhasil diperbarui!', 'success');
      } else {
        payload.status = 'published';
        payload.partnerId = partnerId;
        payload.createdAt = serverTimestamp();
        let newDocId = '';
        
        const docRef = await addDoc(collection(db, 'events'), payload);
        newDocId = docRef.id;

        // Deduct quota if not superadmin/owner/admin and manual event is not enabled
        if (appUser?.role !== 'superadmin' && appUser?.role !== 'owner' && appUser?.role !== 'admin' && !appUser?.allowManualEvent && !appUser?.eventManual) {
           const currentCredit = appUser?.eventCredit !== undefined ? appUser.eventCredit : (appUser?.eventQuota || 0);
           const newQuota = Math.max(0, currentCredit - 1);
           try {
             await updateDoc(doc(db, 'users', appUser!.id), {
               eventCredit: newQuota,
               eventQuota: newQuota,
               updatedAt: serverTimestamp()
             });
           } catch(e) {
             console.error('Failed to deduct quota:', e);
           }
        }
        
        showAlert('Berhasil', 'Acara berhasil dibuat!', 'success');
        navigate(`/auth/login/events/${newDocId}`);
      }
    } catch (error) {
      showAlert('Gagal', 'Failed to save event. Pastikan Anda memiliki pengaturan yang valid.', 'error');
      handleFirestoreError(error, editingEventId ? OperationType.UPDATE : OperationType.CREATE, editingEventId ? `events/${editingEventId}` : 'events');
    }
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !guestCategories.includes(newCategory.trim())) {
      setGuestCategories([...guestCategories, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (category: string) => {
    setGuestCategories(guestCategories.filter(c => c !== category));
  };

  const handleMoveCategory = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= guestCategories.length) return;
    const updated = [...guestCategories];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    setGuestCategories(updated);
  };

  const handleAddInvitationType = () => {
    if (newInvitationType.trim() && !invitationTypes.includes(newInvitationType.trim())) {
      setInvitationTypes([...invitationTypes, newInvitationType.trim()]);
      setNewInvitationType('');
    }
  };

  const handleRemoveInvitationType = (invType: string) => {
    setInvitationTypes(invitationTypes.filter(t => t !== invType));
  };

  const handleAddSession = () => {
    if (newSession.trim() && !sessions.includes(newSession.trim())) {
      setSessions([...sessions, newSession.trim()]);
      setNewSession('');
    }
  };

  const handleRemoveSession = (session: string) => {
    setSessions(sessions.filter(s => s !== session));
  };

  const [eventToDelete, setEventToDelete] = useState<string | null>(null);

  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    try {
      await deleteDoc(doc(db, 'events', eventToDelete));
      setEvents(events.filter(event => event.id !== eventToDelete));
      setEventToDelete(null);
      showAlert('Berhasil', 'Acara berhasil dihapus!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${eventToDelete}`);
      setEventToDelete(null);
      showAlert('Gagal', 'Gagal menghapus acara.', 'error');
    }
  };

  const promptDeleteEvent = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEventToDelete(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {appUser?.role === 'staff' ? 'Acara Tugas Anda' : 'Events'}
          </h1>
          {appUser?.role === 'staff' && (
            <p className="text-sm text-gray-500 mt-1">
              Anda masuk sebagai <span className="font-semibold text-indigo-600">{getRoleLabel(appUser.role, appUser.staffType)}</span>. Hanya menampilkan acara yang ditugaskan kepada Anda.
            </p>
          )}
        </div>
        {canUserCreateEvent(appUser) && (
          <button 
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Create Event
          </button>
        )}
      </div>

      {/* Warning banner if Owner / Partner / Admin business has not yet been registered with Name & Address by Super Admin */}
      {appUser && ['owner', 'partner', 'admin'].includes(appUser.role) && !loading && !isPartnerVerified && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5">
            <Lock className="w-5 h-5" />
          </div>
          <div className="text-xs text-amber-900 space-y-1">
            <div className="font-bold text-sm">
              Data Partner Guestly Belum Terdaftar Lengkap (Create Event Terkunci)
            </div>
            <p>
              Untuk membuat acara sebagai <strong>Partner Guestly</strong>, identitas <strong>Nama Usaha beserta Alamat Lengkap Usaha</strong> Anda wajib didaftarkan terlebih dahulu oleh <strong>Super Admin Guestly</strong>. Silakan hubungi Super Admin untuk memverifikasi data bisnis Anda.
            </p>
          </div>
        </div>
      )}

      {/* Modal Notification when Partner Business is not yet registered by Super Admin */}
      <Modal
        isOpen={isPartnerNoticeOpen}
        onClose={() => setIsPartnerNoticeOpen(false)}
        title="Verifikasi Partner Guestly Diperlukan"
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 text-sm text-amber-950">
              <div className="font-bold">Data Usaha Partner Belum Didaftarkan oleh Super Admin</div>
              <p className="text-xs text-amber-900 leading-relaxed">
                Sesuai kebijakan <strong>Partner Guestly</strong>, sebelum membuat acara baru (<em>Create Event</em>), data resmi usaha Anda meliputi <strong>Nama Usaha</strong> dan <strong>Alamat Lengkap Usaha</strong> wajib didaftarkan serta diverifikasi oleh <strong>Super Admin Guestly</strong>.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-1.5">
            <div className="font-semibold text-gray-900">Status Data Usaha Saat Ini:</div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nama Usaha:</span>
              <span className="font-semibold text-gray-900">
                {(ownerBusinessProfile?.businessName || appUser?.businessName || '').trim() || 'Belum Terdaftar'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Alamat Lengkap Usaha:</span>
              <span className="font-semibold text-red-600">
                {(ownerBusinessProfile?.businessAddress || appUser?.businessAddress || '').trim() || 'Belum Didaftarkan oleh Super Admin'}
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsPartnerNoticeOpen(false)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              Mengerti
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title={editingEventId ? "Edit Acara" : "Buat Acara Baru"}>
        <div className="mb-6 border-b border-gray-200 overflow-x-auto">
          <nav className="-mb-px flex space-x-5" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`${activeTab === 'info' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors cursor-pointer`}
            >
              Info Acara
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('frame')}
              className={`${activeTab === 'frame' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors cursor-pointer`}
            >
              Frame Layar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`${activeTab === 'categories' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors cursor-pointer`}
            >
              Kategori & Sesi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('theme')}
              className={`${activeTab === 'theme' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors cursor-pointer`}
            >
              Tema RSVP
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('einvite')}
              className={`${activeTab === 'einvite' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-semibold text-sm transition-colors flex items-center gap-1.5 cursor-pointer`}
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>E-Invitation</span>
            </button>
          </nav>
        </div>

        <div className="space-y-6">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {appUser?.role !== 'client' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                  <select required value={newEventClientId} onChange={e => setNewEventClientId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="" disabled>Pilih Client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Acara *</label>
                <input required value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Contoh: Resepsi Pernikahan John & Jane" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Mempelai</label>
                <input value={newEventCoupleName} onChange={e => setNewEventCoupleName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Contoh: Romeo & Juliet" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Acara *</label>
                  <input required value={newEventDate} onChange={e => setNewEventDate(e.target.value)} type="date" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jam Acara</label>
                  <input value={newEventTime} onChange={e => setNewEventTime(e.target.value)} type="time" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi Acara</label>
                <input value={newEventLocation} onChange={e => setNewEventLocation(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Contoh: Grand Ballroom Hotel XYZ" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link Undangan Digital</label>
                <input value={newEventDigitalInviteLink} onChange={e => setNewEventDigitalInviteLink(e.target.value)} type="url" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Contoh: https://undangan.com/john-jane" />
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-800 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-indigo-600" />
                    <span>Thumbnail WA / Foto Mempelai (Opsional)</span>
                  </label>
                  {newEventThumbnail && (
                    <button
                      type="button"
                      onClick={() => setNewEventThumbnail('')}
                      className="text-xs font-medium text-rose-600 hover:text-rose-700"
                    >
                      Reset Default
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Gambar ini akan muncul sebagai <strong>thumbnail preview link WhatsApp</strong> dan <strong>foto utama di halaman tiket/undangan RSVP</strong> (menggantikan logo default Guestly).
                </p>

                <MediaUploader
                  category="thumbnail"
                  maxSize={15 * 1024 * 1024}
                  allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                  defaultValue={newEventThumbnail || undefined}
                  onUploadSuccess={(data) => setNewEventThumbnail(data.url)}
                  onUploadError={(err) => showAlert('Gagal Upload', err, 'error')}
                />

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Atau tempel URL gambar secara langsung:
                  </label>
                  <input
                    type="text"
                    value={newEventThumbnail}
                    onChange={e => setNewEventThumbnail(e.target.value)}
                    className="block w-full px-3 py-2 rounded-md border border-gray-300 bg-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="https://contoh.com/foto-mempelai.jpg"
                  />
                </div>

                {newEventThumbnail ? (
                  <div className="flex items-center gap-3 pt-1">
                    <img
                      src={newEventThumbnail}
                      alt="Preview Thumbnail"
                      className="w-14 h-14 rounded-lg object-cover border border-indigo-200 shadow-xs shrink-0 bg-white"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-emerald-700">✓ Thumbnail kustom aktif</p>
                      <p className="text-[11px] text-gray-500 truncate">{newEventThumbnail}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 italic">
                    Belum diatur — menggunakan thumbnail default sistem.
                  </div>
                )}
              </div>
              <div className="flex items-start bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                  <div className="flex items-center h-5">
                    <input
                      id="disable-rsvp-form"
                      type="checkbox"
                      checked={newEventDisableTicketRsvpForm}
                      onChange={(e) => setNewEventDisableTicketRsvpForm(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="disable-rsvp-form" className="font-medium text-indigo-900 cursor-pointer">
                      Sembunyikan Form Kehadiran di Link Tiket Tamu
                    </label>
                    <p className="text-gray-500 mt-1">
                      Aktifkan ini jika Anda menggunakan platform (seperti Queinvite) untuk mengumpulkan konfirmasi kehadiran, dan ingin layar tiket Guestly hanya menampilkan QR Code saja.
                    </p>
                  </div>
              </div>
            </div>
          )}

          {activeTab === 'theme' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800">
                Tema ini akan mengubah tampilan Form RSVP Publik. Anda bisa mencobanya dengan melihat form rsvp publik setelah memilih tema.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Tema Form RSVP</label>
                <select value={newEventTheme} onChange={e => setNewEventTheme(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                  <option value="default">Default</option>
                  <option value="facebook">Facebook</option>
                  <option value="gold">Gold</option>
                  <option value="tiktok">Tiktok</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'einvite' && (
            <div className="space-y-5">
              {/* Template Selection Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      1. Pilih Template Kartu E-Invitation
                    </h4>
                    <p className="text-xs text-slate-500">
                      Desain diambil dari katalog Cloudflare R2 (<code className="text-indigo-600">guestly-storage/E-Invitation/</code>).
                    </p>
                  </div>
                  {appUser?.role === 'superadmin' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsQuickUploadingTemplate(!isQuickUploadingTemplate)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Upload Template Baru</span>
                      </button>
                      <Link
                        to="/auth/login/admin/e-invitation-templates"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                      >
                        <span>Kelola Katalog</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Quick Upload Form for Super Admin */}
                {appUser?.role === 'superadmin' && isQuickUploadingTemplate && (
                  <div className="p-3.5 bg-white border border-indigo-200 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-indigo-900">
                      Upload Cepat Template ke <code className="font-mono">guestly-storage/E-Invitation/</code>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Nama Template *
                      </label>
                      <input
                        type="text"
                        value={quickTemplateName}
                        onChange={(e) => setQuickTemplateName(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs"
                        placeholder="Contoh: Card 1 - Blush Floral Arch"
                      />
                    </div>
                    <MediaUploader
                      category="E-Invitation"
                      maxSize={15 * 1024 * 1024}
                      allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                      defaultValue={quickTemplateUrl || undefined}
                      onUploadSuccess={(data) => {
                        setQuickTemplateUrl(data.url);
                        setQuickTemplateKey(data.key);
                      }}
                      onUploadError={(err) => showAlert('Gagal Upload', err, 'error')}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsQuickUploadingTemplate(false)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!quickTemplateName.trim() || !quickTemplateUrl.trim()) {
                            showAlert('Peringatan', 'Nama dan file gambar template wajib diisi.', 'warning');
                            return;
                          }
                          const newTpl: EInviteTemplate = {
                            id: `tpl-${Date.now().toString(36)}`,
                            name: quickTemplateName.trim(),
                            imageUrl: quickTemplateUrl.trim(),
                            r2Key: quickTemplateKey || undefined,
                            primaryColor: '#153B31',
                            accentColor: '#C98583',
                            guestBoxBg: '#F3E4E2',
                            footerColor: '#C27D7A',
                            isDefault: false,
                            createdAt: new Date().toISOString(),
                          };
                          const updated = [...eInviteTemplates, newTpl];
                          await eInviteTemplateService.saveTemplates(updated);
                          setEInviteTemplates(updated);
                          setSelectedEInviteTemplateId(newTpl.id);
                          setSelectedEInviteTemplateUrl(newTpl.imageUrl);
                          setQuickTemplateName('');
                          setQuickTemplateUrl('');
                          setQuickTemplateKey('');
                          setIsQuickUploadingTemplate(false);
                          showAlert('Berhasil', 'Template baru berhasil ditambahkan ke katalog!', 'success');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Simpan & Gunakan Template</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Template Selector Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {eInviteTemplates.map((tpl) => {
                    const isSelected = selectedEInviteTemplateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setSelectedEInviteTemplateId(tpl.id);
                          setSelectedEInviteTemplateUrl(tpl.imageUrl || '');
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-white border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'bg-white/70 border-slate-200 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {tpl.name}
                          </span>
                          {isSelected && (
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                              <Check className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span
                            className="w-3 h-3 rounded-full border border-gray-300"
                            style={{ backgroundColor: tpl.primaryColor || '#153B31' }}
                          />
                          <span
                            className="w-3 h-3 rounded-full border border-gray-300"
                            style={{ backgroundColor: tpl.accentColor || '#C98583' }}
                          />
                          <span
                            className="w-3 h-3 rounded-full border border-gray-300"
                            style={{ backgroundColor: tpl.footerColor || '#C27D7A' }}
                          />
                          <span className="text-[10px] text-slate-400 ml-auto">
                            {tpl.imageUrl ? 'Cloudflare R2' : 'Built-in'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Variables Form */}
              <div className="space-y-3.5 border border-gray-200 rounded-xl p-4 bg-white">
                <h4 className="text-sm font-bold text-slate-900">
                  2. Data Dinamis Kartu E-Invitation
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Judul Atas Kartu
                    </label>
                    <input
                      type="text"
                      value={eInviteHeaderText}
                      onChange={(e) => setEInviteHeaderText(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                      placeholder="THE WEDDING OF"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Mempelai Pria ({'{{GROOM_NAME}}'})
                    </label>
                    <input
                      type="text"
                      value={eInviteGroomName}
                      onChange={(e) => setEInviteGroomName(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                      placeholder="Contoh: Rizky"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Mempelai Wanita ({'{{BRIDE_NAME}}'})
                    </label>
                    <input
                      type="text"
                      value={eInviteBrideName}
                      onChange={(e) => setEInviteBrideName(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                      placeholder="Contoh: Aulia"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Nama Gedung / Venue ({'{{VENUE_NAME}}'})
                    </label>
                    <input
                      type="text"
                      value={eInviteVenueName}
                      onChange={(e) => setEInviteVenueName(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                      placeholder={newEventLocation || 'Contoh: Gedung Serbaguna Graha Anugerah'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Alamat Venue ({'{{VENUE_ADDRESS}}'})
                    </label>
                    <input
                      type="text"
                      value={eInviteVenueAddress}
                      onChange={(e) => setEInviteVenueAddress(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                      placeholder="Contoh: Jl. Melati No. 25, Semarang"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Kalimat Undangan di Bawah Nama Tamu
                    </label>
                    <input
                      type="text"
                      value={eInviteGreetingText}
                      onChange={(e) => setEInviteGreetingText(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Mode Tampilan Halaman Link Tamu
                    </label>
                    <select
                      value={eInviteMode}
                      onChange={(e) => setEInviteMode(e.target.value as 'full' | 'compact')}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                    >
                      <option value="full">Lengkap (Kartu E-Invitation + Form Konfirmasi RSVP)</option>
                      <option value="compact">Ringkas (Fokus Kartu E-Invitation &amp; QR Check-In Saja)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Live Preview inside Tab */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Pratinjau Langsung Kartu E-Invitation
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Foto mempelai diambil dari Thumbnail WA / Foto Mempelai di Tab Info Acara
                  </span>
                </div>
                <EInvitationCard
                  template={
                    eInviteTemplates.find((t) => t.id === selectedEInviteTemplateId) ||
                    DEFAULT_EINVITE_TEMPLATES[0]
                  }
                  event={{
                    title: newEventTitle || 'The Wedding Of Rizky & Aulia',
                    coupleName: newEventCoupleName || 'Rizky & Aulia',
                    date: newEventDate || '2026-12-15',
                    time: newEventTime || '09.00 - 14.00 WIB',
                    location: newEventLocation || 'Gedung Serbaguna Graha Anugerah',
                    thumbnailUrl: newEventThumbnail || undefined,
                    eInviteTemplateId: selectedEInviteTemplateId,
                    eInviteTemplateUrl: selectedEInviteTemplateUrl,
                    eInviteHeaderText,
                    eInviteGroomName,
                    eInviteBrideName,
                    eInviteVenueName,
                    eInviteVenueAddress,
                    eInviteGreetingText,
                    eInviteFooterText,
                  }}
                  guest={{
                    name: 'Bpk. Adi Putro & Keluarga',
                    ticketCode: 'GUEST123456',
                    category: 'VIP',
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === 'frame' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800">
                Gunakan format <strong>PNG transparan</strong> dengan resolusi <strong>1920x1080</strong> untuk hasil terbaik pada layar sapa (overlay).
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link Frame Overlay (Opsional)</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <input
                    type="url"
                    value={newEventFrame}
                    onChange={e => setNewEventFrame(e.target.value)}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Contoh: https://contoh.com/frame.png"
                  />
                  <button
                    type="button"
                    onClick={() => setNewEventFrame('')}
                    className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-500 hover:bg-gray-100 text-sm font-medium"
                  >
                    Hapus
                  </button>
                </div>
                {newEventFrame && (
                   <div className="mt-2 text-xs text-green-600 truncate">
                      Frame diset
                   </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tambah Kategori Tamu</label>
                <div className="flex gap-2">
                  <input 
                    value={newCategory} 
                    onChange={e => setNewCategory(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                    type="text" 
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="Contoh: VIP, Keluarga, Teman Kantor..." 
                  />
                  <button onClick={handleAddCategory} type="button" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium">
                    Tambah
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Daftar Kategori (Urutan Prioritas Sort):</h4>
                {guestCategories.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Belum ada kategori ditambahkan.</p>
                ) : (
                  <ul className="space-y-2">
                    {guestCategories.map((category, idx) => (
                      <li key={category} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md border border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400 w-5">{idx + 1}.</span>
                          <span className="text-sm font-medium text-gray-800">{category}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30"
                            title="Naikkan Urutan"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(idx, 'down')}
                            disabled={idx === guestCategories.length - 1}
                            className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30"
                            title="Turunkan Urutan"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => handleRemoveCategory(category)} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-6 border-t border-gray-100 mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tambah Tipe Undangan</label>
                <div className="flex gap-2">
                  <input 
                    value={newInvitationType} 
                    onChange={e => setNewInvitationType(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddInvitationType())}
                    type="text" 
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="Contoh: Undangan Fisik, Undangan Cetak, Undangan Digital..." 
                  />
                  <button onClick={handleAddInvitationType} type="button" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium">
                    Tambah
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Daftar Tipe Undangan:</h4>
                {invitationTypes.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Belum ada tipe undangan ditambahkan.</p>
                ) : (
                  <ul className="space-y-2">
                    {invitationTypes.map(invType => (
                      <li key={invType} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md border border-gray-100">
                        <span className="text-sm font-medium text-gray-800">{invType}</span>
                        <button onClick={() => handleRemoveInvitationType(invType)} type="button" className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-6 border-t border-gray-100 mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tambah Sesi Acara</label>
                <div className="flex gap-2">
                  <input 
                    value={newSession} 
                    onChange={e => setNewSession(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSession())}
                    type="text" 
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="Contoh: Akad Nikah, Resepsi, Ngunduh Mantu..." 
                  />
                  <button onClick={handleAddSession} type="button" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium">
                    Tambah
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Daftar Sesi Acara:</h4>
                {sessions.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Belum ada sesi ditambahkan.</p>
                ) : (
                  <ul className="space-y-2">
                    {sessions.map(session => (
                      <li key={session} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md border border-gray-100">
                        <span className="text-sm font-medium text-gray-800">{session}</span>
                        <button onClick={() => handleRemoveSession(session)} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-5 border-t border-gray-100 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={() => setIsCreating(false)} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Batal
          </button>
          <button 
            type="button" 
            onClick={handleSaveEvent}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
          >
            {editingEventId ? "Simpan Perubahan" : "Simpan Acara"}
          </button>
        </div>
      </Modal>
      
      <Modal isOpen={!!eventToDelete} onClose={() => setEventToDelete(null)} title="Konfirmasi Hapus">
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-800 mb-6">
          <p>Apakah Anda yakin ingin menghapus acara ini? Tindakan ini tidak dapat dibatalkan.</p>
        </div>
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button 
            type="button" 
            onClick={() => setEventToDelete(null)} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Batal
          </button>
          <button 
            type="button" 
            onClick={handleDeleteEvent}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700"
          >
            Ya, Hapus
          </button>
        </div>
      </Modal>
      
      {loading ? (
        <p>Loading events...</p>
      ) : events.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-lg shadow-sm border border-gray-200">
          <p className="text-gray-500">
            {appUser?.role === 'staff'
              ? 'Belum ada acara yang ditugaskan kepada akun Anda. Silakan hubungi Admin atau Owner untuk penugasan acara.'
              : appUser?.role === 'client'
              ? 'Belum ada acara yang terdaftar untuk akun Anda. Acara Anda akan disiapkan oleh penyelenggara (Owner / Admin).'
              : 'Belum ada acara yang dibuat. Silakan klik tombol "Create Event" untuk membuat acara baru.'}
          </p>
        </div>
      ) : (
        
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">

              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">No</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Thumbnail</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Tanggal Dibuat</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Nama Acara</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Tanggal Acara</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Masa Aktif</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Aksi</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-500 tracking-wider">Scanner</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {events.map((event, index) => (
                  <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <Link to={`/auth/login/events/${event.id}`} className="block w-fit group">
                        {event.thumbnailUrl ? (
                          <img
                            src={event.thumbnailUrl}
                            alt={event.title}
                            className="w-14 h-10 rounded-lg object-cover border border-gray-200 shadow-2xs bg-gray-50 group-hover:ring-2 group-hover:ring-indigo-500/40 transition-all"
                          />
                        ) : (
                          <div
                            className="w-14 h-10 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400 group-hover:border-indigo-300 group-hover:text-indigo-500 transition-colors"
                            title="Belum ada thumbnail kustom"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {event.createdAt && parseFirestoreDate(event.createdAt) ? format(parseFirestoreDate(event.createdAt)!, 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link to={`/auth/login/events/${event.id}`} className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors">
                        {event.title}
                      </Link>
                      <div className="text-sm text-gray-500 capitalize">{event.status}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {parseFirestoreDate(event.date) ? format(parseFirestoreDate(event.date)!, 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {parseFirestoreDate(event.activeUntil) ? format(parseFirestoreDate(event.activeUntil)!, 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-3">
                         {appUser?.role === 'staff' && appUser?.staffType === 'souvenir' ? (
                           <Link to={`/auth/login/events/${event.id}?tab=souvenir`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-full text-xs font-semibold transition-colors" title="Kelola Souvenir">
                             <Gift className="w-3.5 h-3.5" /> Kelola Souvenir
                           </Link>
                         ) : (
                           <Link to={`/auth/login/events/${event.id}`} className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1 rounded-full hover:bg-indigo-50 transition-colors" title="Detail Acara">
                             <Eye className="w-4 h-4" />
                           </Link>
                         )}
                         {appUser?.role !== 'client' && appUser?.role !== 'staff' && (
                           <>
                             <button 
                                 onClick={() => openEditModal(event)} 
                                 className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1 rounded-full hover:bg-blue-50 transition-colors" 
                                 title="Edit Acara"
                             >
                               <Edit className="w-4 h-4" />
                             </button>
                             <button 
                                 onClick={(e) => promptDeleteEvent(event.id!, e)} 
                                 className="text-red-600 hover:text-red-900 flex items-center justify-center p-1 rounded-full hover:bg-red-50 transition-colors" 
                                 title="Hapus Acara"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </>
                         )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                       <div className="flex items-center justify-center gap-2">
                         {appUser?.role === 'staff' && appUser?.staffType === 'souvenir' ? (
                           <Link 
                             to={`/auth/login/events/${event.id}/scan?mode=souvenir`} 
                             className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white hover:bg-purple-700 rounded-full text-xs font-semibold transition-colors shadow-sm"
                           >
                             <Gift className="w-3.5 h-3.5" /> Scan Souvenir
                           </Link>
                         ) : appUser?.role === 'staff' && appUser?.staffType === 'checkin' ? (
                           <Link 
                             to={`/auth/login/events/${event.id}/scan?mode=checkin`} 
                             className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-full text-xs font-semibold transition-colors shadow-sm"
                           >
                             <ScanLine className="w-3.5 h-3.5" /> Scan Kehadiran
                           </Link>
                         ) : (
                           <Link 
                             to={`/auth/login/events/${event.id}/scan`} 
                             className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-full transition-colors"
                           >
                             <ScanLine className="w-4 h-4" /> Scan
                           </Link>
                         )}
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 border-t border-gray-200 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
