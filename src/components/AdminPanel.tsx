/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  db, 
  auth,
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  where,
  getDocs,
  setDoc,
  createUserWithEmailAndPassword,
  handleFirestoreError,
  OperationType,
  storage,
  ref,
  uploadBytes,
  getDownloadURL
} from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { AppUser, EventDetails, PackageTier } from '../types';
import { PACKAGES } from '../constants';
import { toast } from 'sonner';
import { 
  Users, 
  Calendar, 
  Plus, 
  Trash2, 
  Search, 
  ExternalLink, 
  Filter, 
  Activity, 
  ShieldCheck,
  Mail,
  Lock,
  Globe,
  Clock,
  UserPlus,
  MessageSquare,
  Package,
  CheckCircle2,
  LayoutDashboard,
  Edit3,
  User,
  X,
  AlertCircle,
  Phone,
  Image,
  Key,
  Upload,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import ConfirmModal from './ConfirmModal';
import { updatePassword } from '../firebase';

// Initialize secondary auth outside component to avoid re-initialization errors
const getSecondaryAuth = () => {
  const name = 'Secondary';
  const app = getApps().find(a => a.name === name) || initializeApp(firebaseConfig, name);
  return getAuth(app);
};

interface AdminPanelProps {
  user: AppUser | null;
}

export default function AdminPanel({ user }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'partners' | 'events' | 'settings'>('dashboard');
  const [clients, setClients] = useState<AppUser[]>([]);
  const [resellers, setResellers] = useState<AppUser[]>([]);
  const [events, setEvents] = useState<EventDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [clientPackageFilter, setClientPackageFilter] = useState<PackageTier | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'subscriptionStatus' | 'title', direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  
  // Confirmation Modals
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, type: 'event' | 'client' } | null>(null);
  const [managingGuests, setManagingGuests] = useState<EventDetails | null>(null);
  const [eventGuests, setEventGuests] = useState<any[]>([]);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [newGuest, setNewGuest] = useState({ name: '', attendance: 'hadir' as const, message: '' });

  const [allGuests, setAllGuests] = useState<any[]>([]);
  const [totalGuests, setTotalGuests] = useState(0);
  
  const [editingClient, setEditingClient] = useState<AppUser | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventDetails | null>(null);

  // Profile Settings State
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    brandName: '',
    brandLogo: '',
    fonnteToken: ''
  });
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [isUploading, setIsUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("File harus berupa gambar.");
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 1MB.");
      return;
    }

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `logos/${auth.currentUser?.uid}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setProfileForm(prev => ({ ...prev, brandLogo: downloadURL }));
      toast.success("Logo berhasil diunggah.");
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error("Gagal mengunggah logo.");
    } finally {
      setIsUploading(false);
    }
  };

  const currentUser = auth.currentUser;
  const [currentUserData, setCurrentUserData] = useState<AppUser | null>(user);

  useEffect(() => {
    if (user) {
      setCurrentUserData(user);
    }
  }, [user]);

  useEffect(() => {
    if (currentUser) {
      const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (doc) => {
        if (doc.exists()) {
          setCurrentUserData({ uid: doc.id, ...doc.data() } as AppUser);
        }
      });
      return () => unsubscribe();
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUserData) {
      setProfileForm({
        name: currentUserData.name || '',
        phone: currentUserData.phone || '',
        brandName: currentUserData.brandName || '',
        brandLogo: currentUserData.brandLogo || '',
        fonnteToken: currentUserData.fonnteToken || ''
      });
    }
  }, [currentUserData]);

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

  const isResellerMode = currentUserData?.role?.toLowerCase() === 'reseller';
  const isAdminMode = currentUserData?.role?.toLowerCase() === 'admin';

  useEffect(() => {
    console.log("AdminPanel - Current User Data:", currentUserData);
    console.log("AdminPanel - Is Admin Mode:", isAdminMode);
    console.log("AdminPanel - Is Reseller Mode:", isResellerMode);
  }, [currentUserData, isAdminMode, isResellerMode]);

  if (!currentUserData) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-olive"></div>
      </div>
    );
  }

  // Form States
  const [newClient, setNewClient] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    phone: '',
    role: 'client' as 'client' | 'reseller',
    eventQuota: 5,
    package: 'trial' as PackageTier,
    brandName: '',
    brandLogo: ''
  });
  const [isUploadingClientLogo, setIsUploadingClientLogo] = useState(false);

  const handleNewClientLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("File harus berupa gambar.");
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 1MB.");
      return;
    }

    setIsUploadingClientLogo(true);
    try {
      const storageRef = ref(storage, `logos/client_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setNewClient(prev => ({ ...prev, brandLogo: downloadURL }));
      toast.success("Logo berhasil diunggah.");
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error("Gagal mengunggah logo.");
    } finally {
      setIsUploadingClientLogo(false);
    }
  };

  const sendWA = async (phone: string, message: string) => {
    // Get Fonnte Token from Super Admin (specifically 64.iklas@gmail.com or first admin found)
    try {
      let adminData: AppUser | undefined;
      
      // Try to find the main admin first
      const mainAdminQuery = query(collection(db, 'users'), where('email', '==', '64.iklas@gmail.com'));
      const mainAdminDocs = await getDocs(mainAdminQuery);
      
      if (!mainAdminDocs.empty) {
        adminData = mainAdminDocs.docs[0].data() as AppUser;
      } else {
        // Fallback to any admin
        const adminQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
        const adminDocs = await getDocs(adminQuery);
        adminData = adminDocs.docs[0]?.data() as AppUser;
      }

      const token = adminData?.fonnteToken;

      if (!token) {
        console.warn("Fonnte Token not found in Admin settings.");
        return;
      }

      const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Authorization': token,
        },
        body: new URLSearchParams({
          target: phone,
          message: message,
        }),
      });
      const data = await response.json();
      console.log("Fonnte Response:", data);
    } catch (error) {
      console.error("Error sending WA:", error);
    }
  };
  const [newEvent, setNewEvent] = useState({ 
    title: '', 
    date: '', 
    location: '', 
    clientUid: '', 
    slug: '',
    subscriptionStatus: 'active' as 'active' | 'expired',
    activeDays: 30,
    invitationUrl: '',
    maxGuests: 0
  });

  useEffect(() => {
    // Sync form when editing
    if (editingClient) {
      setNewClient({ 
        name: (editingClient as any).name || '', 
        email: editingClient.email,
        password: (editingClient as any).password || '',
        phone: (editingClient as any).phone || '',
        role: editingClient.role as 'client' | 'reseller',
        eventQuota: editingClient.eventQuota || 5,
        package: editingClient.package || 'trial',
        brandName: (editingClient as any).brandName || '',
        brandLogo: (editingClient as any).brandLogo || ''
      });
    } else {
      setNewClient({ name: '', email: '', password: '', phone: '', role: 'client', eventQuota: 5, package: 'trial', brandName: '', brandLogo: '' });
    }
  }, [editingClient]);

  useEffect(() => {
    if (editingEvent) {
      setNewEvent({
        title: editingEvent.title,
        date: editingEvent.date,
        location: editingEvent.location,
        clientUid: editingEvent.clientUid,
        slug: editingEvent.slug,
        subscriptionStatus: editingEvent.subscriptionStatus,
        activeDays: editingEvent.activeDays || 30,
        invitationUrl: editingEvent.invitationUrl || '',
        maxGuests: editingEvent.maxGuests || 0
      });
    } else {
      setNewEvent({ title: '', date: '', location: '', clientUid: '', slug: '', subscriptionStatus: 'active', activeDays: 30, invitationUrl: '', maxGuests: 0 });
    }
  }, [editingEvent]);

  useEffect(() => {
    if (!currentUserData) return;

    // Fetch Users (Clients & Resellers)
    const isAdmin = currentUserData.role?.toLowerCase() === 'admin';
    
    const usersQuery = isResellerMode 
      ? query(collection(db, 'users'), where('belongsToReseller', '==', currentUser?.uid))
      : (isAdmin ? collection(db, 'users') : null);

    let unsubscribeUsers = () => {};
    if (usersQuery) {
      unsubscribeUsers = onSnapshot(usersQuery as any, (snapshot) => {
        const userList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
        
        let clientList = userList.filter(u => u.role?.toLowerCase() === 'client');
        const resellerList = userList.filter(u => u.role?.toLowerCase() === 'reseller');
        
        setClients(clientList);
        setResellers(resellerList);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });
    }

    // Fetch Events
    const eventsQuery = isResellerMode 
      ? query(collection(db, 'events'), where('resellerUid', '==', currentUser?.uid), orderBy('date', 'desc'))
      : (isAdmin ? query(collection(db, 'events'), orderBy('date', 'desc')) : null);

    let unsubscribeEvents = () => {};
    if (eventsQuery) {
      unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
        const eventList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventDetails));
        setEvents(eventList);
        setIsLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'events');
      });
    }

    // Fetch All Guests for aggregation
    const unsubscribeGuests = onSnapshot(collection(db, 'guests'), (snapshot) => {
      const guestList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllGuests(guestList);
      
      if (isResellerMode) {
        // Filter guests for events belonging to this reseller
        const resellerEventIds = events.map(e => e.id);
        const resellerGuests = guestList.filter((g: any) => resellerEventIds.includes(g.eventId));
        setTotalGuests(resellerGuests.length);
      } else {
        setTotalGuests(snapshot.size);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'guests');
    });

    return () => {
      unsubscribeUsers();
      unsubscribeEvents();
      unsubscribeGuests();
    };
  }, [isResellerMode, currentUser, currentUserData]);

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await updateDoc(doc(db, 'users', editingClient.uid), {
          name: newClient.name,
          email: newClient.email,
          phone: newClient.phone,
          password: newClient.password,
          role: newClient.role,
          eventQuota: newClient.role === 'reseller' ? newClient.eventQuota : null,
          package: newClient.role === 'client' ? newClient.package : null,
          brandName: newClient.brandName || '',
          brandLogo: newClient.brandLogo || ''
        });
        toast.success("Data user diperbarui di database.");
        setEditingClient(null);
      } else {
        // 1. Create user in Firebase Authentication using secondary auth
        const secondaryAuth = getSecondaryAuth();
        const userCredential = await createUserWithEmailAndPassword(
          secondaryAuth, 
          newClient.email, 
          newClient.password
        );
        
        const uid = userCredential.user.uid;

        // 2. Save user data to Firestore with the same UID
        const userData: any = {
          name: newClient.name,
          email: newClient.email,
          phone: newClient.phone,
          password: newClient.password,
          role: newClient.role,
          eventQuota: newClient.role === 'reseller' ? newClient.eventQuota : null,
          package: newClient.role === 'client' ? newClient.package : null,
          brandName: newClient.brandName || '',
          brandLogo: newClient.brandLogo || '',
          eventsCreated: 0,
          createdAt: new Date()
        };

        if (isResellerMode) {
          userData.belongsToReseller = currentUser?.uid;
        }

        await setDoc(doc(db, 'users', uid), userData);
        
        // 3. Send WA Notification
        const loginLink = window.location.origin;
        const waMessage = newClient.role === 'reseller' 
          ? `Halo ${newClient.name},\n\nSelamat! Anda telah terdaftar sebagai Partner (Reseller) di Guestly.\n\nLink Login: ${loginLink}\nEmail: ${newClient.email}\nPassword: ${newClient.password}\nQuota Event: ${newClient.eventQuota}\n\nSilakan login untuk mulai mengelola event Anda.`
          : `Halo ${newClient.name},\n\nSelamat! Akun Client Anda telah berhasil dibuat di Guestly.\n\nLink Login: ${loginLink}\nEmail: ${newClient.email}\nPassword: ${newClient.password}\nPaket: ${newClient.package}\n\nSilakan login untuk mengelola detail acara Anda.`;
        
        if (newClient.phone) {
          sendWA(newClient.phone, waMessage);
        }

        toast.success(`${newClient.role === 'reseller' ? 'Reseller' : 'Client'} baru berhasil didaftarkan.`);
      }
      setNewClient({ name: '', email: '', password: '', phone: '', role: 'client', eventQuota: 5, package: 'trial', brandName: '', brandLogo: '' });
    } catch (error: any) {
      console.error("Error saving client:", error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error("Email sudah terdaftar di Firebase Authentication.");
      } else {
        toast.error("Gagal mendaftarkan client: " + error.message);
      }
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleSaveEvent triggered. Current User:", currentUser?.email, "Role:", currentUserData?.role);
    if (!newEvent.clientUid) return toast.error("Pilih client terlebih dahulu.");

    // Enforce 1 client 1 event limit
    const clientAlreadyHasEvent = events.some(e => e.clientUid === newEvent.clientUid && e.id !== editingEvent?.id);
    if (clientAlreadyHasEvent) {
      return toast.error("Client ini sudah memiliki acara. Maksimal 1 acara per client.");
    }
    
    // Auto-generate slug if empty
    const finalSlug = newEvent.slug || newEvent.title.toLowerCase()
      .replace(/ /g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .trim();

    try {
      if (editingEvent) {
        await updateDoc(doc(db, 'events', editingEvent.id), {
          ...newEvent,
          slug: finalSlug
        });
        toast.success("Event diperbarui!");
        setEditingEvent(null);
      } else {
        // Find owner (client or reseller) email to store in event for easier lookup
        const selectedOwner = [...clients, ...resellers].find(u => u.uid === newEvent.clientUid);
        
        // Get package config
        const ownerPackage = selectedOwner?.package || 'trial';
        const pkgConfig = PACKAGES[ownerPackage];

        const eventData: any = {
          ...newEvent,
          clientEmail: selectedOwner?.email || '',
          slug: finalSlug,
          createdAt: new Date(),
          maxGuests: newEvent.maxGuests || pkgConfig.maxGuests,
          maxStaff: pkgConfig.maxStaff,
          activeDays: newEvent.activeDays || pkgConfig.activeDays,
          souvenirTypes: ['Souvenir Utama'], // Default souvenir type
        };

        console.log("Attempting to save event with data:", eventData);

        // If owner is a reseller, set resellerUid and increment their eventsCreated
        if (selectedOwner?.role === 'reseller') {
          eventData.resellerUid = selectedOwner.uid;
          console.log("Owner is reseller, updating quota for:", selectedOwner.uid);
          try {
            await updateDoc(doc(db, 'users', selectedOwner.uid), {
              eventsCreated: (selectedOwner.eventsCreated || 0) + 1
            });
          } catch (err) {
            console.error("Error updating reseller quota:", err);
            // Continue anyway, or handle specifically
          }
        } else if (isResellerMode) {
          // If a reseller is creating an event for a client
          eventData.resellerUid = currentUser?.uid;
          console.log("Reseller mode, updating own quota for:", currentUser?.uid);
          try {
            await updateDoc(doc(db, 'users', currentUser!.uid), {
              eventsCreated: (currentUserData?.eventsCreated || 0) + 1
            });
          } catch (err) {
            console.error("Error updating own reseller quota:", err);
          }
        }
        
        console.log("Final eventData to be saved:", eventData);
        await addDoc(collection(db, 'events'), eventData);
        toast.success("Event berhasil dibuat!");
      }
      setNewEvent({ title: '', date: '', location: '', clientUid: '', slug: '', subscriptionStatus: 'active', activeDays: 30, invitationUrl: '', maxGuests: 0 });
    } catch (error: any) {
      console.error("Error saving event:", error);
      handleFirestoreError(error, editingEvent ? OperationType.UPDATE : OperationType.CREATE, editingEvent ? `events/${editingEvent.id}` : 'events');
      toast.error("Gagal menyimpan event.");
    }
  };

  const copyEventLink = (slug: string) => {
    const url = `${window.location.origin}/?event=${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link event disalin ke clipboard!");
  };

  const copyClientCredentials = (client: any) => {
    const text = `Halo ${client.name},\n\nBerikut adalah akses Dashboard Guestly Anda:\nLink: ${window.location.origin}\nEmail: ${client.email}\nPassword: ${client.password || '********'}\n\nSilakan login untuk mengelola tamu Anda.`;
    navigator.clipboard.writeText(text);
    toast.success("Akses login client disalin ke clipboard!");
  };

  const sendWhatsAppCredentials = (client: any) => {
    const text = `Halo ${client.name},\n\nBerikut adalah akses Dashboard Guestly Anda:\nLink: ${window.location.origin}\nEmail: ${client.email}\nPassword: ${client.password || '********'}\n\nSilakan login untuk mengelola tamu Anda.`;
    const phone = client.phone?.replace(/[^0-9]/g, '');
    if (!phone) {
      toast.error("Nomor WhatsApp tidak ditemukan.");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'events', id));
      toast.success("Event dihapus.");
    } catch (error) {
      toast.error("Gagal menghapus event.");
      handleFirestoreError(error, OperationType.DELETE, `events/${id}`);
    }
  };

  const handleDeleteClient = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast.success("Client dihapus.");
    } catch (error) {
      toast.error("Gagal menghapus client.");
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  useEffect(() => {
    if (!managingGuests) {
      setEventGuests([]);
      return;
    }
    const q = query(collection(db, 'guests'), where('eventId', '==', managingGuests.id), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEventGuests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [managingGuests]);

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingGuests || !newGuest.name) return;

    try {
      await addDoc(collection(db, 'guests'), {
        ...newGuest,
        eventId: managingGuests.id,
        timestamp: new Date(),
        souvenirClaimed: false
      });
      setNewGuest({ name: '', attendance: 'hadir', message: '' });
      setIsAddingGuest(false);
      toast.success("Tamu berhasil ditambahkan!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'guests');
    }
  };

  const handleDeleteGuest = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'guests', id));
      toast.success("Tamu dihapus.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `guests/${id}`);
    }
  };

  const stats = {
    totalClients: clients.length,
    totalResellers: resellers.length,
    activeEvents: events.filter(e => e.subscriptionStatus === 'active').length,
    totalEvents: events.length,
    totalGuests: isResellerMode 
      ? allGuests.filter(g => events.some(e => e.id === g.eventId)).length
      : allGuests.length
  };

  const sortedEvents = events
    .filter(event => 
      event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.location.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'date') {
        return (a.date > b.date ? 1 : -1) * direction;
      }
      if (sortConfig.key === 'subscriptionStatus') {
        return (a.subscriptionStatus > b.subscriptionStatus ? 1 : -1) * direction;
      }
      if (sortConfig.key === 'title') {
        return (a.title.toLowerCase() > b.title.toLowerCase() ? 1 : -1) * direction;
      }
      return 0;
    });

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-3">
          <ShieldCheck className={cn("w-8 h-8", isResellerMode ? "text-orange-600" : "text-olive")} />
          <div>
            <h2 className="text-2xl font-serif font-bold">{isResellerMode ? 'Reseller Dashboard' : 'Super Admin Panel'}</h2>
            <p className="text-xs text-gray-500">
              {isResellerMode 
                ? `Kelola event Anda. Quota: ${currentUserData?.eventsCreated || 0}/${currentUserData?.eventQuota || 0}` 
                : 'Kelola client dan event digital guestbook.'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-olive/10 shadow-sm overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'dashboard' ? "bg-olive text-white shadow-md" : "text-gray-400 hover:text-olive"
            )}
          >
            <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
          </button>
          <button 
            onClick={() => {
              setActiveTab('clients');
              setNewClient({...newClient, role: 'client'});
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'clients' ? "bg-olive text-white shadow-md" : "text-gray-400 hover:text-olive"
            )}
          >
            <User className="w-3.5 h-3.5" /> Clients
          </button>
          {!isResellerMode && (
            <button 
              onClick={() => {
                setActiveTab('partners');
                setNewClient({...newClient, role: 'reseller'});
              }}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
                activeTab === 'partners' ? "bg-orange-600 text-white shadow-md" : "text-gray-400 hover:text-orange-600"
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Partners
            </button>
          )}
          <button 
            onClick={() => setActiveTab('events')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'events' ? "bg-olive text-white shadow-md" : "text-gray-400 hover:text-olive"
            )}
          >
            <Calendar className="w-3.5 h-3.5" /> All Events
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'settings' ? "bg-olive text-white shadow-md" : "text-gray-400 hover:text-olive"
            )}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Settings
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* Stats Header */}
          <div className={cn("grid grid-cols-1 gap-4", isResellerMode ? "md:grid-cols-3" : "md:grid-cols-5")}>
            {!isResellerMode && (
              <>
                <div className="bg-white p-6 rounded-[24px] border border-olive/5 shadow-sm hover:shadow-md transition-all">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-blue-50 text-blue-600">
                    <Users className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-gray-500 font-medium">Total Client</p>
                  <p className="text-2xl font-serif font-bold text-gray-800">{stats.totalClients}</p>
                </div>
                <div className="bg-white p-6 rounded-[24px] border border-olive/5 shadow-sm hover:shadow-md transition-all">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-orange-50 text-orange-600">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-gray-500 font-medium">Total Reseller</p>
                  <p className="text-2xl font-serif font-bold text-gray-800">{stats.totalResellers}</p>
                </div>
              </>
            )}
            <div className="bg-white p-6 rounded-[24px] border border-olive/5 shadow-sm hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-cream text-olive">
                <MessageSquare className="w-5 h-5" />
              </div>
              <p className="text-xs text-gray-500 font-medium">{isResellerMode ? 'Total Tamu Saya' : 'Total Tamu'}</p>
              <p className="text-2xl font-serif font-bold text-gray-800">{stats.totalGuests}</p>
            </div>
            <div className="bg-white p-6 rounded-[24px] border border-olive/5 shadow-sm hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-green-50 text-green-600">
                <Activity className="w-5 h-5" />
              </div>
              <p className="text-xs text-gray-500 font-medium">Event Aktif</p>
              <p className="text-2xl font-serif font-bold text-gray-800">{stats.activeEvents}</p>
            </div>
            <div className="bg-white p-6 rounded-[24px] border border-olive/5 shadow-sm hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-purple-50 text-purple-600">
                <Globe className="w-5 h-5" />
              </div>
              <p className="text-xs text-gray-500 font-medium">Total Event</p>
              <p className="text-2xl font-serif font-bold text-gray-800">{stats.totalEvents}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-12">
            {/* Quick Actions or Recent Activity could go here */}
            <div className="bg-white p-8 rounded-[32px] border border-olive/10 shadow-sm">
              <h3 className="text-xl font-serif font-bold mb-6">Quick Overview</h3>
              <p className="text-sm text-gray-500">Selamat datang di panel administrasi. Gunakan tab di atas untuk mengelola user dan melihat seluruh event yang terdaftar.</p>
              <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4">
                <button onClick={() => setActiveTab('clients')} className="p-4 bg-cream/50 rounded-2xl border border-olive/10 text-olive font-bold text-sm hover:bg-cream transition-all flex flex-col items-center gap-2">
                  <User className="w-6 h-6" /> Kelola Client
                </button>
                {!isResellerMode && (
                  <button onClick={() => setActiveTab('partners')} className="p-4 bg-orange-50 rounded-2xl border border-orange-100 text-orange-600 font-bold text-sm hover:bg-orange-100 transition-all flex flex-col items-center gap-2">
                    <ShieldCheck className="w-6 h-6" /> Kelola Partner
                  </button>
                )}
                <button onClick={() => setActiveTab('events')} className="p-4 bg-olive/5 rounded-2xl border border-olive/10 text-olive font-bold text-sm hover:bg-olive/10 transition-all flex flex-col items-center gap-2">
                  <Calendar className="w-6 h-6" /> Lihat Semua Event
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'clients' && (
        <div className="space-y-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cream rounded-2xl flex items-center justify-center text-olive"><User className="w-5 h-5" /></div>
              <h3 className="text-2xl font-serif font-bold">Manajemen Client</h3>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Cari nama atau email..."
                  value={userSearchTerm}
                  onChange={e => setUserSearchTerm(e.target.value)}
                  className="pl-11 pr-4 py-2.5 rounded-2xl border border-olive/10 bg-white focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm w-full md:w-64 shadow-sm"
                />
              </div>
              
              <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-olive/10 shadow-sm">
                <button 
                  onClick={() => setClientPackageFilter('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all",
                    clientPackageFilter === 'all' ? "bg-olive text-white" : "text-gray-400 hover:text-olive"
                  )}
                >
                  Semua Paket
                </button>
                {(Object.keys(PACKAGES) as PackageTier[]).map((pkg) => (
                  <button 
                    key={pkg}
                    onClick={() => setClientPackageFilter(pkg)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all capitalize",
                      clientPackageFilter === pkg ? "bg-purple-600 text-white" : "text-gray-400 hover:text-purple-600"
                    )}
                  >
                    {pkg}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* User Form (Sidebar) */}
            <div className="lg:col-span-1">
              <section className="bg-white p-8 rounded-[40px] border-2 border-olive/20 shadow-xl sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-cream rounded-2xl flex items-center justify-center text-olive"><UserPlus className="w-5 h-5" /></div>
                  <h3 className="text-xl font-serif font-bold">{editingClient ? 'Edit Client' : (isResellerMode ? 'Tambah Client Saya' : 'Tambah Client Baru')}</h3>
                </div>
                <form onSubmit={handleSaveClient} className="space-y-5">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Informasi Dasar</label>
                      <input 
                        type="text" value={newClient.name} 
                        onChange={e => setNewClient({...newClient, name: e.target.value, role: 'client'})}
                        placeholder="Nama Lengkap" className="w-full px-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm" required 
                      />
                      <input 
                        type="email" value={newClient.email} 
                        onChange={e => setNewClient({...newClient, email: e.target.value, role: 'client'})}
                        placeholder="Email Address" className="w-full px-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required 
                      />
                      <input 
                        type="tel" value={newClient.phone} 
                        onChange={e => setNewClient({...newClient, phone: e.target.value, role: 'client'})}
                        placeholder="Nomor WhatsApp" className="w-full px-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required 
                      />
                      <input 
                        type="text" value={newClient.password} 
                        onChange={e => setNewClient({...newClient, password: e.target.value, role: 'client'})}
                        placeholder="Password Login" className="w-full px-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required 
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Pilih Paket</label>
                      <div className="grid grid-cols-1 gap-2">
                        {(Object.keys(PACKAGES) as PackageTier[]).map((pkg) => (
                          <button
                            key={pkg}
                            type="button"
                            onClick={() => setNewClient({...newClient, package: pkg, role: 'client'})}
                            className={cn(
                              "p-4 rounded-2xl border text-left transition-all flex items-center justify-between",
                              newClient.package === pkg 
                                ? "border-olive bg-olive/5 ring-1 ring-olive" 
                                : "border-gray-100 bg-gray-50 hover:border-olive/20"
                            )}
                          >
                            <div>
                              <p className="text-xs font-bold text-gray-800">{PACKAGES[pkg].name}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">{PACKAGES[pkg].maxGuests} Tamu • {PACKAGES[pkg].activeDays} Hari</p>
                            </div>
                            {newClient.package === pkg && <CheckCircle2 className="w-4 h-4 text-olive" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {!editingClient && (
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[10px] text-amber-700 leading-relaxed">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="w-3 h-3" />
                        <p className="font-bold">Penting:</p>
                      </div>
                      <p>Pastikan email & password ini juga didaftarkan di Firebase Authentication agar user bisa login.</p>
                    </div>
                  )}
                  
                  <div className="flex gap-3 pt-2">
                    {editingClient && (
                      <button 
                        type="button" 
                        onClick={() => setEditingClient(null)}
                        className="flex-1 py-4 rounded-2xl font-bold text-sm text-gray-500 hover:bg-gray-100 transition-all border border-gray-200"
                      >
                        Batal
                      </button>
                    )}
                    <button type="submit" className="flex-[2] text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95 bg-olive hover:bg-olive/90">
                      {editingClient ? 'Update Client' : 'Simpan Client'}
                    </button>
                  </div>
                </form>
              </section>
            </div>

            {/* User Lists */}
            <div className="lg:col-span-2 space-y-12">
              <section className="space-y-6">
                <div className="flex items-center justify-between px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-cream rounded-xl flex items-center justify-center text-olive"><User className="w-4 h-4" /></div>
                    <h3 className="text-xl font-serif font-bold">Daftar Client</h3>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {clients.filter(c => 
                      (c.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) || c.email.toLowerCase().includes(userSearchTerm.toLowerCase())) &&
                      (clientPackageFilter === 'all' || c.package === clientPackageFilter)
                    ).length} User
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {clients
                    .filter(c => 
                      (c.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) || c.email.toLowerCase().includes(userSearchTerm.toLowerCase())) &&
                      (clientPackageFilter === 'all' || c.package === clientPackageFilter)
                    )
                    .map(client => (
                      <div key={client.uid} className="bg-white p-5 rounded-[32px] border border-olive/5 flex items-center justify-between group hover:border-olive/20 hover:shadow-md transition-all">
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className="w-12 h-12 rounded-2xl bg-cream flex items-center justify-center font-bold text-olive shadow-inner shrink-0">
                            {client.name?.[0] || 'C'}
                          </div>
                          <div className="overflow-hidden">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="font-bold text-gray-800 text-sm truncate">{client.name || 'No Name'}</p>
                              {client.package && (
                                <span className="text-[8px] px-2 py-0.5 rounded-full font-bold uppercase bg-purple-100 text-purple-600">
                                  {client.package}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 truncate">{client.email}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <MessageSquare className="w-3 h-3 text-olive/40" />
                              <span className="text-[10px] font-bold text-olive">
                                {allGuests.filter(g => events.some(e => e.clientUid === client.uid && e.id === g.eventId)).length} Tamu
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => sendWhatsAppCredentials(client)}
                            className="p-2 text-green-500 hover:bg-green-50 rounded-xl transition-all"
                            title="Kirim via WhatsApp"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => copyClientCredentials(client)}
                            className="p-2 text-olive hover:bg-olive/5 rounded-xl transition-all"
                            title="Salin Akses Login"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingClient(client)}
                            className="p-2 text-blue-400 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setConfirmDelete({ id: client.uid, type: 'client' })}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  {clients.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-gray-50/50 rounded-[32px] border border-dashed border-gray-200">
                      <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-xs text-gray-400 italic">Belum ada client terdaftar.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'partners' && !isResellerMode && (
        <div className="space-y-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600"><ShieldCheck className="w-5 h-5" /></div>
              <h3 className="text-2xl font-serif font-bold">Manajemen Partner (Reseller)</h3>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Cari nama atau email..."
                  value={userSearchTerm}
                  onChange={e => setUserSearchTerm(e.target.value)}
                  className="pl-11 pr-4 py-2.5 rounded-2xl border border-orange-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm w-full md:w-64 shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Reseller Form (Sidebar) */}
            <div className="lg:col-span-1">
              <section className="bg-white p-8 rounded-[40px] border-2 border-orange-200 shadow-xl sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600"><UserPlus className="w-5 h-5" /></div>
                  <h3 className="text-xl font-serif font-bold">{editingClient ? 'Edit Partner' : 'Tambah Partner Baru'}</h3>
                </div>
                <form onSubmit={handleSaveClient} className="space-y-5">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest ml-2">Informasi Dasar</label>
                      <input 
                        type="text" value={newClient.name} 
                        onChange={e => setNewClient({...newClient, name: e.target.value, role: 'reseller'})}
                        placeholder="Nama Lengkap" className="w-full px-5 py-3.5 rounded-2xl border border-orange-100 bg-orange-50/10 focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm" required 
                      />
                      <input 
                        type="email" value={newClient.email} 
                        onChange={e => setNewClient({...newClient, email: e.target.value, role: 'reseller'})}
                        placeholder="Email Address" className="w-full px-5 py-3.5 rounded-2xl border border-orange-100 bg-orange-50/10 text-sm" required 
                      />
                      <input 
                        type="tel" value={newClient.phone} 
                        onChange={e => setNewClient({...newClient, phone: e.target.value, role: 'reseller'})}
                        placeholder="Nomor WhatsApp" className="w-full px-5 py-3.5 rounded-2xl border border-orange-100 bg-orange-50/10 text-sm" required 
                      />
                      <input 
                        type="text" value={newClient.password} 
                        onChange={e => setNewClient({...newClient, password: e.target.value, role: 'reseller'})}
                        placeholder="Password Login" className="w-full px-5 py-3.5 rounded-2xl border border-orange-100 bg-orange-50/10 text-sm" required 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest ml-2">Informasi Brand Partner</label>
                      <input 
                        type="text" value={newClient.brandName} 
                        onChange={e => setNewClient({...newClient, brandName: e.target.value, role: 'reseller'})}
                        placeholder="Nama Brand Partner" className="w-full px-5 py-3.5 rounded-2xl border border-orange-100 bg-orange-50/10 text-sm" 
                      />
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <input 
                            type="url" value={newClient.brandLogo} 
                            onChange={e => setNewClient({...newClient, brandLogo: e.target.value, role: 'reseller'})}
                            placeholder="URL Logo Brand" className="flex-1 px-5 py-3.5 rounded-2xl border border-orange-100 bg-orange-50/10 text-sm" 
                          />
                          <label className={cn(
                            "cursor-pointer p-3.5 rounded-2xl border-2 border-dashed border-orange-200 hover:border-orange-400 transition-all flex items-center justify-center text-orange-600",
                            isUploadingClientLogo && "opacity-50 cursor-not-allowed"
                          )}>
                            {isUploadingClientLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*"
                              onChange={handleNewClientLogoUpload}
                              disabled={isUploadingClientLogo}
                            />
                          </label>
                        </div>
                        {newClient.brandLogo && (
                          <div className="mt-2 flex justify-center p-3 bg-orange-50/50 rounded-2xl border border-dashed border-orange-100">
                            <img src={newClient.brandLogo} alt="Preview Logo" className="h-12 object-contain" referrerPolicy="no-referrer" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest ml-2">Quota Event Reseller</label>
                      <input 
                        type="number" value={newClient.eventQuota} 
                        onChange={e => setNewClient({...newClient, eventQuota: parseInt(e.target.value), role: 'reseller'})}
                        placeholder="Quota Event" className="w-full px-5 py-3.5 rounded-2xl border border-orange-200 bg-orange-50/30 text-sm font-bold text-orange-700" required 
                      />
                    </div>
                  </div>

                  {!editingClient && (
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[10px] text-amber-700 leading-relaxed">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="w-3 h-3" />
                        <p className="font-bold">Penting:</p>
                      </div>
                      <p>Pastikan email & password ini juga didaftarkan di Firebase Authentication agar user bisa login.</p>
                    </div>
                  )}
                  
                  <div className="flex gap-3 pt-2">
                    {editingClient && (
                      <button 
                        type="button" 
                        onClick={() => setEditingClient(null)}
                        className="flex-1 py-4 rounded-2xl font-bold text-sm text-gray-500 hover:bg-gray-100 transition-all border border-gray-200"
                      >
                        Batal
                      </button>
                    )}
                    <button type="submit" className="flex-[2] text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95 bg-orange-600 hover:bg-orange-700">
                      {editingClient ? 'Update Partner' : 'Simpan Partner'}
                    </button>
                  </div>
                </form>
              </section>
            </div>

            {/* Reseller List */}
            <div className="lg:col-span-2 space-y-12">
              <section className="space-y-6">
                <div className="flex items-center justify-between px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600"><ShieldCheck className="w-4 h-4" /></div>
                    <h3 className="text-xl font-serif font-bold">Daftar Partner</h3>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {resellers.filter(r => 
                      r.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) || r.email.toLowerCase().includes(userSearchTerm.toLowerCase())
                    ).length} User
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {resellers
                    .filter(r => 
                      r.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) || r.email.toLowerCase().includes(userSearchTerm.toLowerCase())
                    )
                    .map(reseller => (
                      <div key={reseller.uid} className="bg-white p-5 rounded-[32px] border border-orange-100 flex flex-col gap-4 group hover:border-orange-300 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 overflow-hidden">
                            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center font-bold text-orange-600 shadow-inner shrink-0">
                              {reseller.name?.[0] || 'R'}
                            </div>
                            <div className="overflow-hidden">
                              <p className="font-bold text-gray-800 text-sm truncate">{reseller.name || 'No Name'}</p>
                              <p className="text-[11px] text-gray-400 truncate">{reseller.email}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <MessageSquare className="w-3 h-3 text-orange-600/40" />
                                <span className="text-[10px] font-bold text-orange-600">
                                  {allGuests.filter(g => events.some(e => e.resellerUid === reseller.uid && e.id === g.eventId)).length} Tamu
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={() => sendWhatsAppCredentials(reseller)}
                              className="p-2 text-green-500 hover:bg-green-50 rounded-xl transition-all"
                              title="Kirim via WhatsApp"
                            >
                              <Phone className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => copyClientCredentials(reseller)}
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                              title="Salin Akses Login"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setEditingClient(reseller)}
                              className="p-2 text-blue-400 hover:bg-blue-50 rounded-xl transition-all"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setConfirmDelete({ id: reseller.uid, type: 'client' })}
                              className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="pt-4 border-t border-orange-50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Quota Penggunaan</span>
                            <span className="text-[10px] font-bold text-orange-600">
                              {reseller.eventsCreated || 0} / {reseller.eventQuota || 0} Event
                            </span>
                          </div>
                          <div className="w-full h-2 bg-orange-50 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-orange-500 transition-all duration-500" 
                              style={{ width: `${Math.min(100, ((reseller.eventsCreated || 0) / (reseller.eventQuota || 1)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  {resellers.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-gray-50/50 rounded-[32px] border border-dashed border-gray-200">
                      <ShieldCheck className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-xs text-gray-400 italic">Belum ada reseller terdaftar.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cream rounded-2xl flex items-center justify-center text-olive"><Calendar className="w-5 h-5" /></div>
              <h3 className="text-2xl font-serif font-bold">Overview Semua Event</h3>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Cari event..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-11 pr-4 py-2.5 rounded-2xl border border-olive/10 bg-white focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm w-full md:w-64 shadow-sm"
                />
              </div>
              
              <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-olive/10 shadow-sm">
                <button 
                  onClick={() => setSortConfig({ key: 'date', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1",
                    sortConfig.key === 'date' ? "bg-olive text-white" : "text-gray-400 hover:text-olive"
                  )}
                >
                  <Clock className="w-3 h-3" /> Tgl {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </button>
                <button 
                  onClick={() => setSortConfig({ key: 'subscriptionStatus', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1",
                    sortConfig.key === 'subscriptionStatus' ? "bg-olive text-white" : "text-gray-400 hover:text-olive"
                  )}
                >
                  <Activity className="w-3 h-3" /> Status {sortConfig.key === 'subscriptionStatus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </button>
                <button 
                  onClick={() => setSortConfig({ key: 'title', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1",
                    sortConfig.key === 'title' ? "bg-olive text-white" : "text-gray-400 hover:text-olive"
                  )}
                >
                  <Filter className="w-3 h-3" /> Nama {sortConfig.key === 'title' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </button>
              </div>

              <button 
                onClick={() => setEditingEvent(null)}
                className="bg-olive text-white px-5 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-olive/90 transition-all shadow-md"
              >
                <Plus className="w-4 h-4" /> Event Baru
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Event Form (Sidebar in this tab) */}
            <div className="lg:col-span-1">
              <section className="bg-white p-6 rounded-[32px] border border-olive/10 shadow-sm sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-cream rounded-xl flex items-center justify-center text-olive"><Edit3 className="w-4 h-4" /></div>
                  <h3 className="text-lg font-serif font-bold">{editingEvent ? 'Edit Event' : 'Form Event'}</h3>
                </div>
                <form onSubmit={handleSaveEvent} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">Pemilik Event</label>
                    <select 
                      value={newEvent.clientUid} 
                      onChange={e => setNewEvent({...newEvent, clientUid: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required
                    >
                      <option value="">Pilih Client/Reseller</option>
                      {!isResellerMode && (
                        <optgroup label="Resellers">
                          {resellers.map(r => (
                            <option key={r.uid} value={r.uid} disabled={(r.eventsCreated || 0) >= (r.eventQuota || 0)}>
                              {(r as any).name} ({r.eventsCreated || 0}/{r.eventQuota || 0})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Clients">
                        {clients.map(c => {
                          const hasEvent = events.some(e => e.clientUid === c.uid && e.id !== editingEvent?.id);
                          return (
                            <option key={c.uid} value={c.uid} disabled={hasEvent}>
                              {(c as any).name} ({c.email}) {hasEvent ? '(Sudah punya acara)' : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">Judul Acara</label>
                    <input 
                      type="text" value={newEvent.title} 
                      onChange={e => {
                        const title = e.target.value;
                        const slug = title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
                        setNewEvent({...newEvent, title, slug});
                      }}
                      placeholder="Contoh: Wedding of Iklas & Partner" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">URL Slug</label>
                    <input 
                      type="text" value={newEvent.slug} 
                      onChange={e => setNewEvent({...newEvent, slug: e.target.value})}
                      placeholder="iklas-wedding" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">Tanggal</label>
                      <input 
                        type="text" value={newEvent.date} 
                        onChange={e => setNewEvent({...newEvent, date: e.target.value})}
                        placeholder="YYYY-MM-DD" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">Status</label>
                      <select 
                        value={newEvent.subscriptionStatus} 
                        onChange={e => setNewEvent({...newEvent, subscriptionStatus: e.target.value as 'active' | 'expired'})}
                        className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required
                      >
                        <option value="active">Active</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">Masa Aktif (Hari)</label>
                      <input 
                        type="number" value={newEvent.activeDays} 
                        onChange={e => setNewEvent({...newEvent, activeDays: parseInt(e.target.value)})}
                        placeholder="30" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">Max Guests (Add-on)</label>
                      <input 
                        type="number" value={newEvent.maxGuests || 0} 
                        onChange={e => setNewEvent({...newEvent, maxGuests: parseInt(e.target.value)})}
                        placeholder="100" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm font-bold text-olive" 
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">Lokasi</label>
                    <input 
                      type="text" value={newEvent.location} 
                      onChange={e => setNewEvent({...newEvent, location: e.target.value})}
                      placeholder="Nama Gedung / Kota" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-olive uppercase tracking-widest ml-2">URL Undangan Digital</label>
                    <input 
                      type="url" value={newEvent.invitationUrl} 
                      onChange={e => setNewEvent({...newEvent, invitationUrl: e.target.value})}
                      placeholder="https://queinvite.yulovi.com/novii-agung/" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="flex-1 bg-olive text-white py-3 rounded-2xl font-bold text-sm hover:bg-olive/90 transition-all shadow-md">
                      {editingEvent ? 'Update' : 'Simpan'}
                    </button>
                    {editingEvent && (
                      <button type="button" onClick={() => setEditingEvent(null)} className="px-4 bg-gray-100 text-gray-500 rounded-2xl font-bold text-sm hover:bg-gray-200 transition-all">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </form>
              </section>
            </div>

            {/* Event List (Main Content in this tab) */}
            <div className="lg:col-span-2 space-y-4">
              {sortedEvents.map(event => (
                <motion.div 
                  key={event.id} 
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-6 rounded-[32px] border border-olive/5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
                >
                  <div className={cn(
                    "absolute top-0 left-0 w-1.5 h-full",
                    event.subscriptionStatus === 'active' ? "bg-green-500" : "bg-red-500"
                  )} />
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-serif text-xl font-bold text-gray-800">{event.title}</h4>
                        <span className={cn(
                          "text-[9px] font-bold uppercase px-2 py-1 rounded-full",
                          event.subscriptionStatus === 'active' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        )}>
                          {event.subscriptionStatus}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-olive" /> {event.date}</div>
                        <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-olive" /> {event.location}</div>
                        <div className="flex items-center gap-1.5 font-mono bg-cream px-2 py-0.5 rounded-lg text-[10px]">/{event.slug}</div>
                      </div>

                      <div className="flex items-center gap-4 pt-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center"><User className="w-3 h-3" /></div>
                          <span className="text-[10px] text-gray-400 font-medium">Owner: {event.clientEmail || 'N/A'}</span>
                        </div>
                        {event.resellerUid && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 bg-orange-50 text-orange-600 rounded-lg flex items-center justify-center"><ShieldCheck className="w-3 h-3" /></div>
                            <span className="text-[10px] text-orange-600 font-bold">Reseller Event</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setManagingGuests(event)}
                        className="p-3 bg-cream text-olive rounded-2xl hover:bg-olive/10 transition-all shadow-sm"
                        title="Kelola Tamu (Add-on)"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => copyEventLink(event.slug)}
                        className="p-3 bg-cream text-olive rounded-2xl hover:bg-olive/10 transition-all shadow-sm"
                        title="Salin Link"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditingEvent(event)}
                        className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-all shadow-sm"
                        title="Edit Event"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {!isResellerMode && (
                        <button 
                          onClick={() => setConfirmDelete({ id: event.id, type: 'event' })}
                          className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all shadow-sm"
                          title="Hapus Event"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Max Guests</span>
                        <span className="text-sm font-bold text-gray-700">{event.maxGuests}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Active Days</span>
                        <span className="text-sm font-bold text-gray-700">{event.activeDays}</span>
                      </div>
                    </div>
                    <a 
                      href={`/?event=${event.slug}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-olive hover:underline flex items-center gap-1.5"
                    >
                      Buka Halaman <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </motion.div>
              ))}
              {sortedEvents.length === 0 && (
                <div className="text-center py-20 bg-white/50 rounded-[48px] border border-dashed border-olive/20">
                  <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-400 font-serif text-lg italic">Tidak ada event yang ditemukan.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Profile Settings */}
          <div className="bg-white p-8 rounded-[40px] border border-olive/10 shadow-sm space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cream rounded-2xl flex items-center justify-center text-olive"><User className="w-5 h-5" /></div>
              <h3 className="text-xl font-serif font-bold">Pengaturan Profil</h3>
            </div>
            
            <form onSubmit={handleUpdateProfile} className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Nama Lengkap</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
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

                {(isAdminMode || isResellerMode) && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Nama Brand</label>
                      <div className="relative">
                        <ShieldCheck className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                          type="text" value={profileForm.brandName} 
                          onChange={e => setProfileForm({...profileForm, brandName: e.target.value})}
                          placeholder="Nama Brand / Bisnis Anda" className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm" 
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Logo Brand</label>
                      <div className="relative">
                        <div className="flex items-center gap-4">
                          <div className="relative flex-1">
                            <Image className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                              type="url" value={profileForm.brandLogo} 
                              onChange={e => setProfileForm({...profileForm, brandLogo: e.target.value})}
                              placeholder="https://example.com/logo.png" className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm" 
                            />
                          </div>
                          <label className={cn(
                            "cursor-pointer px-6 py-3.5 rounded-2xl border-2 border-dashed border-olive/20 hover:border-olive/40 transition-all flex items-center gap-2 text-xs font-bold text-olive",
                            isUploading && "opacity-50 cursor-not-allowed"
                          )}>
                            {isUploading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4" />
                                Upload File
                              </>
                            )}
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*"
                              onChange={handleLogoUpload}
                              disabled={isUploading}
                            />
                          </label>
                        </div>
                      </div>
                      {profileForm.brandLogo && (
                        <div className="mt-2 flex justify-center p-4 bg-cream/20 rounded-2xl border border-dashed border-olive/10">
                          <img src={profileForm.brandLogo} alt="Preview Logo" className="h-16 object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                    </div>
                  </>
                )}

                {isAdminMode && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Fonnte API Token</label>
                    <div className="relative">
                      <Key className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="password" value={profileForm.fonnteToken} 
                        onChange={e => setProfileForm({...profileForm, fonnteToken: e.target.value})}
                        placeholder="Masukkan Token Fonnte" className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-olive/10 bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 text-sm" 
                      />
                    </div>
                    <p className="text-[9px] text-gray-400 ml-2 italic">Digunakan untuk mengirim notifikasi WhatsApp otomatis.</p>
                  </div>
                )}
              </div>

              <button type="submit" className="w-full bg-olive text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95 hover:bg-olive/90">
                Simpan Perubahan
              </button>
            </form>
          </div>

          {/* Password Settings */}
          <div className="bg-white p-8 rounded-[40px] border border-olive/10 shadow-sm space-y-8">
            <div className="flex items-center gap-3">
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

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[10px] text-amber-700 leading-relaxed">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-3 h-3" />
                <p className="font-bold">Catatan:</p>
              </div>
              <p>Jika Anda baru saja login, Anda dapat langsung mengubah password. Jika tidak, sistem mungkin meminta Anda untuk login kembali demi keamanan.</p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={confirmDelete?.type === 'event'}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteEvent(confirmDelete.id)}
        title="Hapus Event"
        message="Apakah Anda yakin ingin menghapus event ini? Semua pesan tamu dan data terkait juga akan hilang dari dashboard client. Tindakan ini tidak dapat dibatalkan."
      />

      <ConfirmModal
        isOpen={confirmDelete?.type === 'client'}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteClient(confirmDelete.id)}
        title="Hapus User"
        message="Apakah Anda yakin ingin menghapus user ini? User tersebut tidak akan bisa login lagi."
      />

      {/* Guest Management Modal */}
      {managingGuests && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-olive/40 backdrop-blur-sm" onClick={() => setManagingGuests(null)} />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-8 border-b border-olive/10 flex items-center justify-between bg-cream/30">
              <div>
                <h3 className="text-2xl font-serif font-bold text-olive">Kelola Tamu: {managingGuests.title}</h3>
                <p className="text-xs text-gray-500 mt-1">Hanya Super Admin yang dapat menambah tamu secara manual (Fitur Add-on)</p>
              </div>
              <button onClick={() => setManagingGuests(null)} className="p-2 hover:bg-olive/10 rounded-full transition-all">
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Add Guest Form */}
              <div className="bg-cream/20 p-6 rounded-[32px] border border-olive/10">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="font-serif font-bold text-olive flex items-center gap-2">
                    <UserPlus className="w-5 h-5" /> Tambah Tamu Manual
                  </h4>
                  {!isAddingGuest && (
                    <button onClick={() => setIsAddingGuest(true)} className="text-xs font-bold text-olive bg-white px-4 py-2 rounded-xl border border-olive/10 shadow-sm hover:bg-olive/5">
                      Buka Form
                    </button>
                  )}
                </div>

                {isAddingGuest && (
                  <form onSubmit={handleAddGuest} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Nama Tamu</label>
                      <input 
                        type="text" required value={newGuest.name}
                        onChange={e => setNewGuest({...newGuest, name: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-white text-sm"
                        placeholder="Nama lengkap"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Status</label>
                      <select 
                        value={newGuest.attendance}
                        onChange={e => setNewGuest({...newGuest, attendance: e.target.value as any})}
                        className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-white text-sm"
                      >
                        <option value="hadir">Hadir</option>
                        <option value="tidak_hadir">Tidak Hadir</option>
                        <option value="ragu_ragu">Ragu Ragu</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-olive uppercase tracking-widest ml-2">Pesan</label>
                      <input 
                        type="text" value={newGuest.message}
                        onChange={e => setNewGuest({...newGuest, message: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-white text-sm"
                        placeholder="Pesan (opsional)"
                      />
                    </div>
                    <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                      <button type="button" onClick={() => setIsAddingGuest(false)} className="px-4 py-2 text-xs font-bold text-gray-500">Batal</button>
                      <button type="submit" className="bg-olive text-white px-6 py-2 rounded-xl text-xs font-bold shadow-md">Simpan Tamu</button>
                    </div>
                  </form>
                )}
              </div>

              {/* Guest List */}
              <div className="space-y-4">
                <h4 className="font-serif font-bold text-gray-800">Daftar Tamu Terdaftar ({eventGuests.length})</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {eventGuests.map(guest => (
                    <div key={guest.id} className="p-4 bg-white rounded-2xl border border-olive/5 flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-cream rounded-lg flex items-center justify-center text-olive font-bold text-xs">
                          {guest.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">{guest.name}</p>
                          <p className="text-[10px] text-gray-400 capitalize">{guest.attendance.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteGuest(guest.id)}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {eventGuests.length === 0 && (
                    <div className="col-span-full py-8 text-center text-gray-400 italic text-sm">
                      Belum ada tamu terdaftar.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
