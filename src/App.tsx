/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary';
import { 
  db, 
  auth, 
  signOut, 
  signInWithEmailAndPassword,
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  deleteDoc, 
  doc,
  getDoc,
  where,
  getDocs,
  updateDoc,
  handleFirestoreError,
  OperationType
} from './firebase';
import { GuestEntry, EventDetails, AppUser } from './types';
import { isEventExpired } from './lib/utils';
import EventHeader from './components/EventHeader';
import GuestbookForm from './components/GuestbookForm';
import GuestbookList from './components/GuestbookList';
import AdminPanel from './components/AdminPanel';
import ClientPanel from './components/ClientPanel';
import { Lock, LogOut, User, LayoutDashboard, X, ShieldCheck, Home, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [entries, setEntries] = useState<GuestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentEvent, setCurrentEvent] = useState<EventDetails | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const checkAndUpdateEventStatus = async (event: EventDetails) => {
    if (event.subscriptionStatus === 'active' && isEventExpired(event)) {
      console.log(`Event ${event.slug} has expired. Updating status...`);
      try {
        await updateDoc(doc(db, 'events', event.id), {
          subscriptionStatus: 'expired'
        });
        return { ...event, subscriptionStatus: 'expired' } as EventDetails;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `events/${event.id}`);
      }
    }
    return event;
  };

  // Detect event from URL slug (e.g., ?event=iklas-wedding)
  const urlParams = new URLSearchParams(window.location.search);
  const eventSlug = urlParams.get('event');

  useEffect(() => {
    // 1. Handle Auth State
    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      console.log("Auth State Changed:", firebaseUser?.email);
      setIsAuthLoading(true);
      if (firebaseUser) {
        try {
          // 1. Try direct UID lookup first
          let userDoc;
          try {
            userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
            throw err;
          }

          let userData: AppUser | null = null;

          if (userDoc.exists()) {
            userData = { uid: firebaseUser.uid, ...userDoc.data() } as AppUser;
            console.log("User data found by UID:", userData.role);
          } else {
            console.log("User data NOT found by UID, trying email fallback...");
            // 2. Fallback: Search by email if UID lookup fails (for manually created users)
            const q = query(collection(db, 'users'), where('email', '==', firebaseUser.email));
            try {
              const querySnapshot = await getDocs(q);
              if (!querySnapshot.empty) {
                const docData = querySnapshot.docs[0].data();
                userData = { uid: firebaseUser.uid, ...docData } as AppUser;
                console.log("User data found by email:", userData.role);
              }
            } catch (err) {
              handleFirestoreError(err, OperationType.GET, 'users-query-by-email');
              // Don't throw here, just continue to see if we can at least set basic user info
            }
          }

          if (userData) {
            setUser(userData);
            
            // 3. Fetch Event for Client or Staff
            if (userData.role?.toLowerCase() === 'client' || userData.role?.toLowerCase() === 'staff') {
              console.log("Fetching event for client/staff...");
              // For staff, we might store eventId directly in their user doc
              const eventId = (userData as any).eventId;
              
              if (userData.role?.toLowerCase() === 'staff' && eventId) {
                try {
                  const eventDoc = await getDoc(doc(db, 'events', eventId));
                  if (eventDoc.exists()) {
                    let eventData = { id: eventDoc.id, ...eventDoc.data() } as EventDetails;
                    eventData = await checkAndUpdateEventStatus(eventData);
                    setCurrentEvent(eventData);
                  }
                } catch (err) {
                  handleFirestoreError(err, OperationType.GET, `events/${eventId}`);
                }
              } else {
                const eventQ = query(collection(db, 'events'), where('clientUid', '==', userData.uid));
                try {
                  const eventSnapshot = await getDocs(eventQ);
                  
                  if (!eventSnapshot.empty) {
                    let eventData = { id: eventSnapshot.docs[0].id, ...eventSnapshot.docs[0].data() } as EventDetails;
                    eventData = await checkAndUpdateEventStatus(eventData);
                    setCurrentEvent(eventData);
                    console.log("Event found by clientUid:", eventData.slug);
                  } else {
                    console.log("Event NOT found by clientUid, trying email fallback...");
                    const eventQEmail = query(collection(db, 'events'), where('clientEmail', '==', userData.email));
                    const eventSnapshotEmail = await getDocs(eventQEmail);
                    if (!eventSnapshotEmail.empty) {
                      let eventData = { id: eventSnapshotEmail.docs[0].id, ...eventSnapshotEmail.docs[0].data() } as EventDetails;
                      eventData = await checkAndUpdateEventStatus(eventData);
                      setCurrentEvent(eventData);
                      console.log("Event found by clientEmail:", eventData.slug);
                    } else {
                      console.log("No event found for this client.");
                      setCurrentEvent(null);
                    }
                  }
                } catch (err) {
                  handleFirestoreError(err, OperationType.GET, 'events-query');
                }
              }
            }
          } else {
            console.log("No user data found in Firestore.");
            // Default to admin if email matches hardcoded admin
            if (firebaseUser.email === "64.iklas@gmail.com") {
              setUser({ uid: firebaseUser.uid, email: firebaseUser.email!, role: 'admin' });
            } else {
              // If logged in but no data, at least set basic user info
              setUser({ uid: firebaseUser.uid, email: firebaseUser.email!, role: 'client' });
            }
          }
        } catch (error) {
          // This catch block handles the top-level errors that weren't caught specifically
          console.error("Top-level auth error:", error);
        } finally {
          setIsAuthLoading(false);
        }
      } else {
        setUser(null);
        setCurrentEvent(null);
        setIsAuthLoading(false);
      }
    });

    // 2. Handle Guest Event Fetching
    if (eventSlug) {
      const fetchEventBySlug = async () => {
        const q = query(collection(db, 'events'), where('slug', '==', eventSlug));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          let eventData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as EventDetails;
          eventData = await checkAndUpdateEventStatus(eventData);
          setCurrentEvent(eventData);
          
          // Fetch entries for this event
          const guestQ = query(
            collection(db, 'guests'), 
            where('eventId', '==', eventData.id),
            orderBy('timestamp', 'desc')
          );
          onSnapshot(guestQ, (s) => {
            setEntries(s.docs.map(d => ({ id: d.id, ...d.data() })) as GuestEntry[]);
            setIsLoading(false);
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'guests');
            setIsLoading(false);
          });
        } else {
          toast.error("Event tidak ditemukan.");
          setIsLoading(false);
        }
      };
      fetchEventBySlug();
    } else {
      setIsLoading(false);
    }

    return () => unsubscribeAuth();
  }, [eventSlug]);

  const handleSubmit = async (data: any) => {
    if (!currentEvent) return;
    setIsSubmitting(true);
    try {
      // Prevent duplicate messages (same name and message for the same event)
      const duplicateQuery = query(
        collection(db, 'guests'),
        where('eventId', '==', currentEvent.id),
        where('name', '==', data.name),
        where('message', '==', data.message)
      );
      const duplicateSnapshot = await getDocs(duplicateQuery);
      
      if (!duplicateSnapshot.empty) {
        toast.error("Pesan serupa sudah pernah dikirim sebelumnya.");
        setIsSubmitting(false);
        return;
      }

      await addDoc(collection(db, 'guests'), {
        ...data,
        timestamp: serverTimestamp(),
        eventId: currentEvent.id,
      });
      toast.success("Pesan Anda telah terkirim! Terima kasih.");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'guests');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setShowLoginModal(false);
      setEmail("");
      setPassword("");
      toast.success("Login Berhasil!");
    } catch (error: any) {
      toast.error("Login Gagal. Periksa email dan password.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    toast.success("Berhasil keluar.");
  };

  // Determine View
  const isGuestView = !!eventSlug;
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const isReseller = user?.role?.toLowerCase() === 'reseller';
  const isClient = user?.role?.toLowerCase() === 'client';

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-cream selection:bg-olive/20">
      <Toaster position="top-center" richColors />
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-cream/80 backdrop-blur-md border-b border-olive/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-olive font-serif text-lg font-bold">
            <User className="w-5 h-5" />
            <span>Guestly</span>
          </div>
          
          <div className="flex items-center gap-3 font-sans">
            {user ? (
              <>
                <div className="hidden md:flex items-center gap-3 mr-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-olive uppercase tracking-wider leading-none">{user.role}</span>
                    <span className="text-xs text-gray-500 font-medium truncate max-w-[150px]">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-olive/10 text-olive rounded-full text-[10px] font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-3 h-3" /> {user.role} Mode
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-white border border-olive/10 px-3 py-1.5 rounded-xl text-xs font-medium hover:bg-red-50 hover:text-red-600 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" /> Keluar
                </button>
              </>
            ) : (
              !isGuestView && (
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 bg-olive text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-olive/90 transition-all shadow-sm"
                >
                  <Lock className="w-4 h-4" /> Login
                </button>
              )
            )}
            {isGuestView && (
              <a href="/" className="text-olive hover:underline text-sm font-medium flex items-center gap-1">
                <Home className="w-4 h-4" /> Home
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowLoginModal(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-white rounded-[32px] p-8 shadow-2xl font-sans">
              <button onClick={() => setShowLoginModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-2 hover:bg-cream rounded-full transition-all"><X className="w-6 h-6" /></button>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-cream rounded-2xl flex items-center justify-center text-olive mx-auto mb-4 shadow-inner"><Lock className="w-8 h-8" /></div>
                <h2 className="text-xl font-serif font-bold">Login Sistem</h2>
                <p className="text-xs text-gray-500 mt-2">Masuk sebagai Admin atau Client.</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full px-4 py-2.5 rounded-2xl border border-olive/10 bg-cream/30 text-sm" required />
                <button type="submit" disabled={isLoggingIn} className="w-full bg-olive text-white py-3.5 rounded-2xl font-bold text-base transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
                  {isLoggingIn ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Masuk"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="pt-24 pb-20 px-6">
        {isLoading || isAuthLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-olive/20 border-t-olive rounded-full animate-spin" />
            <p className="text-gray-500 font-sans">Memuat Sesi...</p>
          </div>
        ) : isGuestView ? (
          currentEvent ? (
            <div className="max-w-4xl mx-auto">
              <EventHeader event={currentEvent} />
              <GuestbookForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
              <GuestbookList entries={entries} isLoading={isLoading} />
            </div>
          ) : (
            <div className="text-center py-20 font-serif">
              <h2 className="text-3xl mb-4">404</h2>
              <p className="text-xs text-gray-500">Event tidak ditemukan atau sudah berakhir.</p>
            </div>
          )
        ) : isAdmin || isReseller ? (
          <AdminPanel user={user} />
        ) : isClient || user?.role === 'staff' ? (
          currentEvent ? (
            <ClientPanel event={currentEvent} />
          ) : (
            <div className="max-w-4xl mx-auto text-center py-20 font-serif">
              <div className="w-20 h-20 bg-cream rounded-3xl flex items-center justify-center text-olive mx-auto mb-6">
                <Calendar className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Halo, {user?.email}</h2>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Anda berhasil login, namun belum ada Event yang ditautkan ke akun Anda. 
                Silakan hubungi Admin untuk mengaktifkan event Anda.
              </p>
            </div>
          )
        ) : (
          <div className="max-w-4xl mx-auto text-center py-20 font-serif">
            <div className="w-24 h-24 bg-cream rounded-[40px] flex items-center justify-center text-olive mx-auto mb-8 shadow-sm">
              <Calendar className="w-12 h-12" />
            </div>
            <h1 className="text-5xl font-bold mb-6 text-gray-900">Guestly</h1>
            <p className="text-lg text-gray-500 max-w-md mx-auto mb-10 leading-relaxed">
              Platform buku tamu digital modern untuk segala jenis acara Anda. 
              Kelola tamu dengan mudah, cepat, dan elegan.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => setShowLoginModal(true)}
                className="w-full sm:w-auto bg-olive text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-olive/90 transition-all shadow-lg"
              >
                Mulai Sekarang
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="py-12 border-t border-olive/5 text-center text-gray-400 font-sans text-sm">
        <p>&copy; 2026 Guestly. Dibuat dengan cinta untuk momen spesial Anda.</p>
      </footer>
    </div>
    </ErrorBoundary>
  );
}
