import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, getDocs, where, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, deleteField, runTransaction, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { EventRecord, Client } from '../types';
import { parseFirestoreDate } from '../lib/utils';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Image as ImageIcon, Trash2, Edit, ScanLine, Eye } from 'lucide-react';
import { Modal } from '../components/Modal';
import { showAlert, showConfirm } from '../lib/alerts';

export default function EventsList() {
  const { appUser } = useAuth();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'frame' | 'categories' | 'theme'>('info');
  
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
  const [sessions, setSessions] = useState<string[]>(['Akad Nikah', 'Resepsi']);
  const [newSession, setNewSession] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

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
    setSessions(['Akad Nikah', 'Resepsi']);
    setNewSession('');
    setEditingEventId(null);
    setActiveTab('info');
  };

  const openCreateModal = () => {
    let isActive = false;
    let hasQuota = false;

    if (appUser?.role === 'superadmin') {
      isActive = true;
      hasQuota = true;
    } else {
      let activeDate: Date | null = null;
      if (appUser?.activeUntil) {
         if (appUser.activeUntil.toDate) activeDate = appUser.activeUntil.toDate();
         else if (typeof appUser.activeUntil === 'string') activeDate = new Date(appUser.activeUntil);
         else if (appUser.activeUntil.seconds) activeDate = new Date(appUser.activeUntil.seconds * 1000);
      }
      if (activeDate && activeDate > new Date()) {
         isActive = true;
      }
      if (appUser?.eventQuota && appUser.eventQuota > 0) {
         hasQuota = true;
      }
    }

    if (!isActive) {
       showAlert('Akses Ditolak', 'Masa aktif akun Anda telah habis. Silakan beli layanan terlebih dahulu.', 'warning');
       navigate('/auth/login/services/catalog');
       return;
    }
    
    if (!hasQuota) {
       showAlert('Akses Ditolak', 'Anda tidak memiliki kuota acara. Silakan beli layanan terlebih dahulu.', 'warning');
       navigate('/auth/login/services/catalog');
       return;
    }

    resetForm();
    if (appUser?.role === 'client') {
      setNewEventClientId(appUser.id || '');
    } else if (clients.length > 0) {
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
    setSessions(event.sessions || []);
    setNewSession('');
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
        
        if (appUser?.role === 'partner') {
          const partnerId = appUser.id;
          q = query(eventsRef, where('partnerId', '==', partnerId));
          cQuery = query(clientsRef, where('partnerId', '==', partnerId));
        } else if (appUser?.role === 'client') {
          const targetClientId = appUser?.clientId || appUser?.id;
          if (!targetClientId) {
            setEvents([]);
            return;
          }
          q = query(eventsRef, where('clientId', '==', targetClientId));
          // No need to fetch all clients for a client user, just their own record if needed, but we don't necessarily need the list for the dropdown since they can't create events.
        }

        unsubscribeEvents = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventRecord));
          setEvents(data);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'events');
          setLoading(false);
        });

        if (appUser?.role === 'client') {
           setClients([]);
        } else {
           unsubscribeClients = onSnapshot(cQuery, (snapClients) => {
             const clientsData = snapClients.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
             setClients(clientsData);
           }, (error) => {
             console.error("Error fetching clients for events list:", error);
           });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'events');
        setLoading(false);
      }
    };

    if (appUser) fetchEventsAndClients();

    return () => {
      if (unsubscribeEvents) unsubscribeEvents();
      if (unsubscribeClients) unsubscribeClients();
    };
  }, [appUser]);

  const handleSaveEvent = async () => {
    if (!appUser) return;
    if (!newEventTitle || !newEventDate || !newEventClientId) {
      showAlert('Peringatan', 'Nama acara, tanggal, dan client wajib diisi.', 'warning');
      return;
    }
    
    const confirmed = await showConfirm('Apakah Anda yakin ingin menyimpan acara ini?');
    if (!confirmed) return;
    
    const selectedClient = clients.find(c => c.id === newEventClientId);
    const partnerId = selectedClient?.partnerId || (appUser.role === 'partner' ? appUser.id : (appUser.partnerId || 'default-partner'));
    
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

      if (sessions && sessions.length > 0) payload.sessions = sessions;
      else if (editingEventId) payload.sessions = deleteField();

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

        // Deduct quota if not superadmin
        if (appUser?.role !== 'superadmin') {
           const newQuota = Math.max(0, (appUser?.eventQuota || 0) - 1);
           try {
             await updateDoc(doc(db, 'users', appUser!.id), {
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <button 
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
        >
          <Plus className="w-4 h-4" />
          Create Event
        </button>
      </div>

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title={editingEventId ? "Edit Acara" : "Buat Acara Baru"}>
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('info')}
              className={`${activeTab === 'info' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Info Acara
            </button>
            <button
              onClick={() => setActiveTab('frame')}
              className={`${activeTab === 'frame' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Frame Layar
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`${activeTab === 'categories' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Kategori & Sesi
            </button>
            <button
              onClick={() => setActiveTab('theme')}
              className={`${activeTab === 'theme' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Tema RSVP
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link Thumbnail WA (Opsional)</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <input
                    type="url"
                    value={newEventThumbnail}
                    onChange={e => setNewEventThumbnail(e.target.value)}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Kosongkan untuk default, atau masukkan link gambar"
                  />
                  <button
                    type="button"
                    onClick={() => setNewEventThumbnail('')}
                    className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-500 hover:bg-gray-100 text-sm font-medium"
                  >
                    Reset Default
                  </button>
                </div>
                {newEventThumbnail && (
                   <div className="mt-2 text-xs text-indigo-600 truncate">
                      Menggunakan link kustom
                   </div>
                )}
                {!newEventThumbnail && (
                   <div className="mt-2 text-xs text-gray-500 italic">
                      Menggunakan thumbnail default sistem
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
                <h4 className="text-sm font-medium text-gray-700 mb-2">Daftar Kategori:</h4>
                {guestCategories.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Belum ada kategori ditambahkan.</p>
                ) : (
                  <ul className="space-y-2">
                    {guestCategories.map(category => (
                      <li key={category} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md border border-gray-100">
                        <span className="text-sm font-medium text-gray-800">{category}</span>
                        <button onClick={() => handleRemoveCategory(category)} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded">
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
          <p className="text-gray-500">No events found. Let's create one!</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">No</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {event.createdAt && parseFirestoreDate(event.createdAt) ? format(parseFirestoreDate(event.createdAt)!, 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{event.title}</div>
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
                         <Link to={`/auth/login/events/${event.id}`} className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1 rounded-full hover:bg-indigo-50 transition-colors" title="Detail Acara">
                           <Eye className="w-4 h-4" />
                         </Link>
                         {appUser?.role !== 'client' && (
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
                       <Link 
                         to={`/auth/login/events/${event.id}/scan`} 
                         className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-full transition-colors"
                       >
                         <ScanLine className="w-4 h-4" /> Scan
                       </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
