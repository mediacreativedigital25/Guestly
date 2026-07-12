import { useParams, Link } from 'react-router-dom';
import { QrCode, Printer, ScanLine, Plus, Trash2, Edit, Search, CheckCircle, XCircle, FileSpreadsheet, FileText, Upload, Download, Copy, Share2, Download as DownloadIcon, Monitor, Code, MessageCircle, RefreshCcw } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import * as htmlToImage from 'html-to-image';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, deleteDoc, updateDoc, deleteField, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Guest, EventRecord, WATemplate } from '../types';
import { parseFirestoreDate } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Modal } from '../components/Modal';
import { useAuth } from '../AuthContext';
import { showAlert, showConfirm } from '../lib/alerts';
import { useSettings } from '../SettingsContext';

export default function EventDetails() {
  const { eventId } = useParams();
  const { appUser } = useAuth();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [clientName, setClientName] = useState<string>('');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [waTemplates, setWaTemplates] = useState<WATemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestAddress, setNewGuestAddress] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('');
  const [newGuestCategory, setNewGuestCategory] = useState('');
  const [newGuestSession, setNewGuestSession] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [rsvpFilter, setRsvpFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'guest-list' | 'rsvp' | 'attended'>('guest-list');
  const [isEmbedModalOpen, setIsEmbedModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [activeQrGuest, setActiveQrGuest] = useState<Guest | null>(null);
  const { settings } = useSettings();
  const [isBlasting, setIsBlasting] = useState(false);
  const [isBlastModalOpen, setIsBlastModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isEditingGuest, setIsEditingGuest] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestAddress, setEditGuestAddress] = useState('');
  const [editGuestPhone, setEditGuestPhone] = useState('');
  const [editGuestCategory, setEditGuestCategory] = useState('');
  const [editGuestSession, setEditGuestSession] = useState('');
  const [isRefreshingGuests, setIsRefreshingGuests] = useState(false);

  const [lastVisibleGuest, setLastVisibleGuest] = useState<any>(null);
  const [hasMoreGuests, setHasMoreGuests] = useState(false);
  const [loadingMoreGuests, setLoadingMoreGuests] = useState(false);


  // Reset page when filters change

  const handleLoadMoreGuests = async () => {
    if (!eventId || !lastVisibleGuest) return;
    setLoadingMoreGuests(true);
    try {
      const { startAfter, limit, query, collection, getDocs } = await import('firebase/firestore');
      const guestsRef = collection(db, 'events', eventId, 'guests');
      const q = query(guestsRef, startAfter(lastVisibleGuest), limit(50));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest));
      setGuests(prev => [...prev, ...data]);
      setLastVisibleGuest(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreGuests(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more guests", error);
    } finally {
      setLoadingMoreGuests(false);
    }
  };

  useEffect(() => {
  }, [searchTerm, rsvpFilter, attendanceFilter, activeTab]);

  const fetchGuests = async (showIndicator = false) => {
    if (!eventId) return;
    if (showIndicator) setIsRefreshingGuests(true);
    try {
      const { limit, orderBy, query, collection, getDocs } = await import('firebase/firestore');
      const guestsRef = collection(db, 'events', eventId, 'guests');
      // Using limit to scale, ordered by createdAt or similar if possible. We rely on default sort if not.
      // Wait, let's use limit(50)
      const q = query(guestsRef, limit(50));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest));
      setGuests(data);
      setLastVisibleGuest(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreGuests(snapshot.docs.length === 50);
    } catch (error) {
      console.error('Error fetching guests:', error);
    } finally {
      setLoading(false);
      if (showIndicator) setIsRefreshingGuests(false);
    }
  };

  useEffect(() => {
    if (!eventId) return;

    let unsubscribeEvent: () => void;
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
                }
              } catch (clientErr) {
                console.warn('Failed to fetch client details:', clientErr);
              }
            }
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `events/${eventId}`);
        });

        // Initial fetch for guests
        await fetchGuests();

        // Smart Auto Refresh (30s)
        intervalId = setInterval(() => {
          if (document.visibilityState === 'visible') {
            fetchGuests();
          }
        }, 30000);

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
        fetchGuests();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (unsubscribeEvent) unsubscribeEvent();
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      const payload: any = {
        eventId: eventId!,
        name: cleanedGuestName,
        ticketCode: ticketCode,
        rsvpStatus: 'pending',
        attended: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      if (newGuestAddress) payload.address = newGuestAddress;
      if (newGuestPhone) payload.phone = newGuestPhone;
      if (newGuestCategory) payload.category = newGuestCategory;
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
            session: newGuestSession || '',
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
      setNewGuestSession('');
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
    if (appUser?.role !== 'superadmin' && appUser?.role !== 'partner') {
      showAlert("Ditolak", "Hanya Super Admin dan Partner yang dapat menghapus massal.", "error");
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
      } else {
        updateData.attendedAt = deleteField();
      }
      
      await updateDoc(doc(db, 'events', eventId!, 'guests', guestId), updateData);
      
      setGuests(guests.map(g => g.id === guestId ? { ...g, attended: newStatus } : g));
      showAlert('Berhasil', `Status kehadiran berhasil ${newStatus ? 'dikonfirmasi' : 'dibatalkan'}!`, 'success');
    } catch (error) {
      showAlert('Gagal', "Gagal memperbarui status kehadiran", 'error');
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}/guests/${guestId}`);
    }
  };

  const baseFilteredGuests = activeTab === 'guest-list' || activeTab === 'attended' 
    ? guests 
    : guests.filter(g => g.hasResponded || g.rsvpStatus !== 'pending' || (g.wishes && g.wishes.trim().length > 0));
  
  const filteredGuests = baseFilteredGuests.filter(guest => {
    const matchesSearch = guest.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (guest.ticketCode && guest.ticketCode.toLowerCase().includes(searchTerm.toLowerCase()));
    
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
    
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredGuests.length / itemsPerPage);
  const paginatedGuests = filteredGuests;

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Daftar Tamu - ${event?.title || 'Event'}`, 14, 15);
    
    const tableColumn = ["No", "Nama", "Alamat", "No. Hp", "Kategori", "Sesi", "Status", "Waktu Kehadiran"];
    const tableRows: any[] = [];

    filteredGuests.forEach((guest, index) => {
      const guestData = [
        index + 1,
        guest.name,
        guest.address || '-',
        guest.phone || '-',
        guest.category || '-',
        guest.session || '-',
        guest.attended ? 'Hadir' : 'Belum Hadir',
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

  const handleDownloadQR = () => {
    if (qrRef.current && activeQrGuest) {
      htmlToImage.toPng(qrRef.current)
        .then(function (dataUrl) {
          const link = document.createElement('a');
          link.download = `QR_${activeQrGuest.name.replace(/\s+/g, '_')}_${event?.title || 'Event'}.png`;
          link.href = dataUrl;
          link.click();
        })
        .catch(function (error) {
          console.error('oops, something went wrong!', error);
        });
    }
  };

  const generateShareLink = (guest: Guest) => {
    // If event has digital invite link, use it, else fallback to RSVP url.
    // In many real scenarios, the RSVP link is the invite.
    const baseUrl = window.location.origin;
    let inviteUrl = `${baseUrl}/rsvp/${eventId}/${guest.ticketCode}`;
    
    if (event?.digitalInviteLink) {
        inviteUrl = `${event.digitalInviteLink}${event.digitalInviteLink.includes('?') ? '&' : '?'}to=${encodeURIComponent(guest.name)}&ticket=${guest.ticketCode}`;
    }
    return inviteUrl;
  };

  const handleShareWA = (guest: Guest) => {
    const baseUrl = window.location.origin;
    const qrLink = `${baseUrl}/rsvp/${eventId}/${guest.ticketCode}`;
    
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
          const qrLink = `${baseUrl}/rsvp/${eventId}/${guest.ticketCode}`;
          
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

          const imgUrl: string | undefined = event?.thumbnailUrl || event?.frameOverlayUrl || 'https://queinvite.yulovi.com/wp-content/uploads/2026/06/Tumbnail.webp';
          
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
    const data = filteredGuests.map((guest, index) => ({
      "No": index + 1,
      "Nama Tamu": guest.name,
      "Alamat": guest.address || '-',
      "No. Hp": guest.phone || '-',
      "Kategori": guest.category || '-',
      "Sesi": guest.session || '-',
      "Status (Hadir / Belum Hadir)": guest.attended ? 'Hadir' : 'Belum Hadir',
      "Waktu Kehadiran": guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
    }));

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
      "Sesi": ''
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
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        let addedCount = 0;
        const duplicateNames: string[] = [];
        const newGuests: Guest[] = [];

        for (const row of data as any[]) {
           if (appUser?.role !== 'superadmin' && appUser?.guestQuota !== undefined && (guests.length + addedCount) >= appUser.guestQuota) {
             showAlert('Peringatan', `Impor dihentikan karena mencapai batas maksimal kuota tamu (${appUser.guestQuota} tamu). Silakan upgrade layanan.`, 'warning');
             break;
           }

           let guestName = row["Nama Tamu"] || row.Nama;
           if (guestName) {
              const cleanedName = String(guestName).trim();
              if (!cleanedName) continue;
              
              if (guests.some(g => g.name.toLowerCase() === cleanedName.toLowerCase()) || newGuests.some(g => g.name.toLowerCase() === cleanedName.toLowerCase())) {
                  duplicateNames.push(cleanedName);
                  continue;
              }

              const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
              let phone = row["No. Hp"] || row.Telepon || row.hp || "";

              const payload = {
                eventId: eventId!,
                name: cleanedName,
                ticketCode: ticketCode,
                rsvpStatus: 'pending',
                attended: false,
                category: row.Kategori ? String(row.Kategori) : '',
                session: row.Sesi ? String(row.Sesi) : '',
                email: row.Email ? String(row.Email) : '',
                phone: phone ? String(phone) : '',
                address: row.Alamat ? String(row.Alamat) : '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              };
              const docRef = await addDoc(collection(db, 'events', eventId!, 'guests'), payload);
              newGuests.push({ id: docRef.id, ...payload } as unknown as Guest);
              addedCount++;
           }
        }
        
        if (addedCount > 0 || duplicateNames.length > 0) {
          let msg = `Berhasil mengimpor ${addedCount} tamu.`;
          if (duplicateNames.length > 0) {
              const duplicatesList = duplicateNames.slice(0, 10).join(', ') + (duplicateNames.length > 10 ? ` dan ${duplicateNames.length - 10} lainnya` : '');
              msg += `\n\nInfo: Data tamu berikut sudah tersedia (duplikat nama diabaikan):\n${duplicatesList}`;
          }
          showAlert('Info Import', msg, 'info');
          if (addedCount > 0) {
              setGuests(prev => [...prev, ...newGuests]);
          }
        } else {
          showAlert('Peringatan', 'Tidak ada data tamu yang valid untuk diimpor. Pastikan ada baris "Nama Tamu".', 'warning');
        }

      } catch (error) {
        console.error(error);
        showAlert('Error', 'Terjadi kesalahan saat mengimpor file Excel.', 'error');
      }
    };
    reader.readAsBinaryString(file);
    if(fileInputRef.current) fileInputRef.current.value = "";
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
    setEditGuestSession(guest.session || '');
    setIsEditingGuest(true);
  };

  const handleSaveEditGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGuestId || !event) return;

    try {
      const originalGuest = guests.find(g => g.id === editingGuestId);
      if (!originalGuest) return;

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
            session: originalGuest.session || '',
          },
          requestedData: {
            name: editGuestName,
            address: editGuestAddress,
            phone: editGuestPhone,
            category: editGuestCategory,
            session: editGuestSession,
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
                const message = `*🔔 Notifikasi Guestly - Pengajuan Edit Tamu*\n\nHalo, terdapat pengajuan perubahan data tamu dari Klien untuk acara *${event.title || 'Unknown Event'}*.\n\n*Data Lama:*\n- Nama: ${originalGuest.name}\n- No HP: ${originalGuest.phone || '-'}\n- Kategori: ${originalGuest.category || '-'}\n- Alamat: ${originalGuest.address || '-'}\n- Sesi: ${originalGuest.session || '-'}\n\n*Data Baru:*\n- Nama: ${editGuestName}\n- No HP: ${editGuestPhone || '-'}\n- Kategori: ${editGuestCategory || '-'}\n- Alamat: ${editGuestAddress || '-'}\n- Sesi: ${editGuestSession || '-'}\n\nSilakan login ke dashboard Guestly dan cek menu *Approvals* untuk menyetujui atau menolak perubahan ini.`;
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
           session: editGuestSession,
           updatedAt: serverTimestamp()
        });
        showAlert('Berhasil', 'Data tamu berhasil diubah.', 'success');
      }
      setIsEditingGuest(false);
      setEditingGuestId(null);
    } catch (error) {
      console.error(error);
      showAlert('Error', 'Gagal mengedit tamu.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Detail Acara</h1>
        <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full sm:w-auto">
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
          <Link
            to={`/events/${eventId}/greeting`}
            target="_blank"
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 font-medium text-sm sm:text-base"
          >
            <Monitor className="w-4 sm:w-5 h-4 sm:h-5 hidden sm:block" />
            <span className="hidden sm:inline">Layar Sapa</span>
            <span className="sm:hidden">Layar</span>
          </Link>
          <Link
            to={`/auth/login/events/${eventId}/scan`}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium text-sm sm:text-base"
          >
            <ScanLine className="w-4 sm:w-5 h-4 sm:h-5" />
            <span className="hidden sm:inline">Scanner</span>
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
               {appUser?.role !== 'client' && (
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

      <div className="border-b border-gray-200 mb-6 mt-8">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('rsvp')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'rsvp' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            RSVP & Ucapan
          </button>
          <button
            onClick={() => setActiveTab('guest-list')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'guest-list' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Daftar Tamu
          </button>
          <button
            onClick={() => setActiveTab('attended')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'attended' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Berhasil Scan
          </button>
        </nav>
      </div>

      {(activeTab === 'guest-list' || activeTab === 'attended') && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <MessageCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-blue-800">Kuota WA Blast Otomatis: {Math.max(0, 50 - (event?.waBlastCount || 0)) + (appUser?.waBlastQuota || 0)} Pesan Tersedia</h4>
            <p className="text-xs text-blue-700 mt-1">Setiap acara mendapatkan <strong>50 kuota gratis</strong> (Terpakai: {Math.min(50, event?.waBlastCount || 0)}/50). Jika habis, sistem akan menggunakan kuota add-on Anda (Sisa: {appUser?.waBlastQuota || 0}). Anda dapat membeli add-on di menu Layanan. Pengiriman WA secara manual tidak mengurangi kuota.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 flex flex-col gap-4 border-b border-gray-100 bg-gray-50">
          {/* Top Row: Title & Action Buttons */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 w-full">
            <h2 className="text-lg font-medium text-gray-900 whitespace-nowrap">
               {activeTab === 'rsvp' ? 'RSVP & Ucapan' : activeTab === 'attended' ? 'Berhasil Scan' : 'Daftar Tamu'} ({filteredGuests.length})
            </h2>
            
            <div className="flex flex-wrap items-center justify-start lg:justify-end gap-3 w-full lg:w-auto">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
              
              <div className="flex items-center rounded-md shadow-sm border border-gray-300 bg-white overflow-hidden">
                <button 
                  onClick={handleDownloadTemplate}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 font-medium flex items-center gap-1.5 border-r border-gray-200 transition-colors whitespace-nowrap"
                  title="Download Template"
                >
                  <DownloadIcon className="w-4 h-4 text-gray-500" /> <span className="hidden sm:inline">Template</span>
                </button>
                <button 
                  onClick={handleImportClick}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 font-medium flex items-center gap-1.5 border-r border-gray-200 transition-colors whitespace-nowrap"
                  title="Import Excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600"/> <span className="hidden sm:inline">Import</span>
                </button>
                <button 
                  onClick={handleExportPDF}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 font-medium flex items-center gap-1.5 border-r border-gray-200 transition-colors whitespace-nowrap"
                  title="Export PDF"
                >
                  <FileText className="w-4 h-4 text-red-500"/> <span className="hidden sm:inline">PDF</span>
                </button>
                <button 
                  onClick={handleExportExcel}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  title="Export Excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600"/> <span className="hidden sm:inline">Excel</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => fetchGuests(true)}
                  disabled={isRefreshingGuests}
                  className={`justify-center text-sm font-medium flex items-center gap-1.5 px-4 py-2 rounded-md transition-colors whitespace-nowrap ${
                    isRefreshingGuests 
                      ? 'text-gray-500 bg-gray-100 cursor-not-allowed opacity-70 border border-gray-200' 
                      : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 shadow-sm'
                  }`}
                  title="Refresh Tamu"
                >
                  <RefreshCcw className={`w-4 h-4 text-gray-500 ${isRefreshingGuests ? 'animate-spin' : ''}`}/>
                </button>
                <button 
                  onClick={openBlastModal}
                  disabled={isBlasting}
                  className={`justify-center text-sm font-medium flex items-center gap-1.5 px-4 py-2 rounded-md transition-colors whitespace-nowrap ${
                    isBlasting 
                      ? 'text-green-700 bg-green-100 cursor-not-allowed opacity-70 border border-green-200' 
                      : 'text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 shadow-sm'
                  }`}
                  title="Blast WA"
                >
                  <MessageCircle className="w-4 h-4 text-green-600"/> {isBlasting ? 'Memproses...' : 'Blast WA'}
                </button>
                <button 
                  onClick={() => setIsAddingGuest(!isAddingGuest)}
                  className={`justify-center text-sm font-medium flex items-center gap-1.5 px-4 py-2 rounded-md transition-colors whitespace-nowrap ${
                    isAddingGuest 
                      ? 'text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300' 
                      : 'text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm border border-transparent'
                  }`}
                >
                  <Plus className="w-4 h-4"/> {isAddingGuest ? 'Batal' : 'Tambah Tamu'}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Search & Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
            <div className="relative w-full sm:max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Cari nama atau tiket..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {activeTab === 'rsvp' ? (
                <select
                  value={rsvpFilter}
                  onChange={(e) => setRsvpFilter(e.target.value)}
                  className="block w-full sm:w-auto pl-3 pr-8 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
                >
                  <option value="all">Semua Status</option>
                  <option value="attending">Hadir</option>
                  <option value="declined">Tidak Hadir</option>
                  <option value="pending">Pending</option>
                </select>
              ) : activeTab === 'guest-list' ? (
                <select
                  value={attendanceFilter}
                  onChange={(e) => setAttendanceFilter(e.target.value)}
                  className="block w-full sm:w-auto pl-3 pr-8 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
                >
                  <option value="all">Semua Kehadiran</option>
                  <option value="attended">Sudah Scan</option>
                  <option value="not_attended">Belum Hadir</option>
                </select>
              ) : null}
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                }}
                className="block w-full sm:w-auto pl-3 pr-8 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
              >
                <option value={10}>Tampilkan 10</option>
                <option value={25}>Tampilkan 25</option>
                <option value={50}>Tampilkan 50</option>
              </select>
            </div>
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
                    {event?.guestCategories && event.guestCategories.length > 0 && (
                      <div className="md:col-span-2 lg:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Tamu</label>
                        <select 
                          value={newGuestCategory} 
                          onChange={e => setNewGuestCategory(e.target.value)} 
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">-- Pilih Kategori --</option>
                          {event.guestCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {event?.sessions && event.sessions.length > 0 && (
                      <div className="md:col-span-2 lg:col-span-3">
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
                      onClick={() => window.print()} 
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center transition-colors"
                    >
                      <Printer className="w-4 h-4 mr-1" />
                      Cetak QR
                    </button>
                    {(appUser?.role === 'superadmin' || appUser?.role === 'partner') && (
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
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedGuestIds.length === filteredGuests.length && filteredGuests.length > 0}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Tamu</th>
                    {(activeTab === 'guest-list' || activeTab === 'attended') && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alamat</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No. Hp</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kategori</th>
                      </>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sesi</th>
                    {activeTab === 'rsvp' ? (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status RSVP</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ucapan</th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status RSVP</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Scan</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Kehadiran</th>
                      </>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-white shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {paginatedGuests.map((guest, index) => (
                    <tr key={guest.id} className={`group transition-colors ${selectedGuestIds.includes(guest.id) ? 'bg-indigo-50/30' : 'hover:bg-gray-50'}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedGuestIds.includes(guest.id)}
                          onChange={(e) => handleSelectGuest(guest.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{guest.name}</div>
                      </td>
                      {(activeTab === 'guest-list' || activeTab === 'attended') && (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{guest.address || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{guest.phone || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {guest.category ? (
                              <span className="inline-flex px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-md">{guest.category}</span>
                            ) : '-'}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {guest.session ? (
                          <span className="inline-flex px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-md">{guest.session}</span>
                        ) : '-'}
                      </td>
                      {activeTab === 'rsvp' ? (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                             <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-4 ${
                               guest.rsvpStatus === 'attending' ? 'bg-green-100 text-green-800' : 
                               guest.rsvpStatus === 'declined' ? 'bg-red-100 text-red-800' : 
                               'bg-yellow-100 text-yellow-800'
                             }`}>
                               {guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Pending'}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={guest.wishes || '-'}>
                            <div className="flex items-center gap-2">
                              {guest.stickerUrl && <span className="text-xl leading-none drop-shadow-sm">{guest.stickerUrl}</span>}
                              <span>{guest.wishes || '-'}</span>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                             <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-4 ${
                               guest.rsvpStatus === 'attending' ? 'bg-green-100 text-green-800' : 
                               guest.rsvpStatus === 'declined' ? 'bg-red-100 text-red-800' : 
                               'bg-yellow-100 text-yellow-800'
                             }`}>
                               {guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Pending'}
                             </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                             <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-4 ${guest.attended ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                               {guest.attended ? 'Sudah Scan' : 'Belum Hadir'}
                             </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                          </td>
                        </>
                      )}
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium sticky right-0 z-10 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] ${selectedGuestIds.includes(guest.id) ? 'bg-indigo-50/30' : 'bg-white group-hover:bg-gray-50'}`}>
                        <div className="flex space-x-2">
                          {activeTab === 'rsvp' ? (
                            <>
                               <button
                                    onClick={() => handleEditWishesClick(guest)}
                                    className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors"
                                    title="Edit Ucapan"
                               >
                                 <Edit className="w-4 h-4" />
                               </button>
                               <button
                                    onClick={() => handleDeleteWishes(guest.id!)}
                                    className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                    title="Hapus Ucapan"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                            </>
                          ) : (
                            <>
                               <button 
                                   onClick={() => handleToggleAttendance(guest.id!, guest.attended)}
                                   className={`flex items-center justify-center p-1.5 rounded-full transition-colors ${
                                     guest.attended 
                                       ? 'text-green-600 hover:text-green-900 hover:bg-green-50' 
                                       : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                                   }`}
                                   title={guest.attended ? 'Batalkan Kehadiran' : 'Konfirmasi Kehadiran'}
                               >
                                 {guest.attended ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                               </button>
                               <button 
                                   onClick={() => setActiveQrGuest(guest)}
                                   className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors" 
                                   title="Lihat / Bagikan QR"
                               >
                                 <QrCode className="w-4 h-4" />
                               </button>
                               <button 
                                   onClick={() => handleEditGuestClick(guest)} 
                                   className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors" 
                                   title="Edit Tamu"
                               >
                                 <Edit className="w-4 h-4" />
                               </button>
                               <button 
                                   onClick={() => promptDeleteGuest(guest.id!)} 
                                   className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors" 
                                   title="Hapus Tamu"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                {hasMoreGuests && (
                  <button
                    onClick={handleLoadMoreGuests}
                    disabled={loadingMoreGuests}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 w-full justify-center"
                  >
                    {loadingMoreGuests ? 'Memuat...' : 'Muat Lebih Banyak'}
                  </button>
                )}
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Total data dimuat: <span className="font-medium">{filteredGuests.length}</span>
                  </p>
                </div>
                <div>
                  {hasMoreGuests && (
                    <button
                      onClick={handleLoadMoreGuests}
                      disabled={loadingMoreGuests}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {loadingMoreGuests ? 'Memuat...' : 'Muat Lebih Banyak'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

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
             {event?.guestCategories && event.guestCategories.length > 0 && (
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Tamu</label>
                 <select 
                   value={editGuestCategory} 
                   onChange={e => setEditGuestCategory(e.target.value)} 
                   className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                 >
                   <option value="">-- Pilih Kategori --</option>
                   {event.guestCategories.map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                   ))}
                 </select>
               </div>
             )}
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

      <Modal isOpen={!!activeQrGuest} onClose={() => setActiveQrGuest(null)} title="Bagikan Undangan & QR">
        {activeQrGuest && (
          <div className="flex flex-col items-center">
            <div 
              ref={qrRef} 
              className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">{activeQrGuest.name}</h3>
              <p className="text-sm font-medium tracking-[0.2em] text-gray-500 mb-4">{activeQrGuest.ticketCode}</p>
              <QRCode value={activeQrGuest.ticketCode} size={200} />
            </div>
            
            <div className="mt-8 w-full space-y-3">
              <div className="w-full mb-4 text-left">
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors"
              >
                <Share2 className="w-5 h-5" /> Bagikan ke WhatsApp
              </button>
              
              <div className="flex gap-3">
                <button 
                  onClick={handleDownloadQR}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-indigo-700 bg-indigo-50 font-medium rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <DownloadIcon className="w-5 h-5" /> Download QR
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(generateShareLink(activeQrGuest));
                    showAlert('Berhasil', 'Link berhasil disalin!', 'success');
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-gray-700 bg-gray-100 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Copy className="w-5 h-5" /> Salin Link
                </button>
              </div>
            </div>
          </div>
        )}
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

      {/* Hidden Print Area */}
      <div id="print-area" className="hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 p-8 bg-white text-black min-h-screen">
          {guests.filter(g => selectedGuestIds.includes(g.id!)).map(guest => {
             const baseUrl = window.location.origin;
             const qrLink = `${baseUrl}/rsvp/${eventId}/${guest.ticketCode}`;
             return (
               <div key={guest.id} className="flex flex-col items-center justify-center p-4 border-2 border-gray-800 rounded-lg" style={{ pageBreakInside: 'avoid' }}>
                 <div className="text-center font-bold text-lg mb-2 truncate w-full">{guest.name}</div>
                 <QRCode value={qrLink} size={150} />
                 <div className="text-center text-sm mt-2">{guest.category || '-'}</div>
                 <div className="text-center text-xs mt-1 font-mono">{guest.ticketCode}</div>
               </div>
             )
          })}
        </div>
      </div>
    </div>
  );
}
