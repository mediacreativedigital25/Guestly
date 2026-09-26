import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { collection, query, getDocs, where, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { EventRecord, Guest } from '../types';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { format, isSameDay } from 'date-fns';
import { parseFirestoreDate, getRoleLabel, canUserAccessEvent } from '../lib/utils';

export default function Dashboard() {
  const { appUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (appUser?.role === 'staff') {
      navigate('/auth/login/events', { replace: true });
    }
  }, [appUser, navigate]);
  
  // Parse activeUntil safely
  let isTrial = false;
  if (appUser?.role === 'client') {
    let activeDate: Date | null = null;
    if (appUser.activeUntil) {
       if (appUser.activeUntil.toDate) activeDate = appUser.activeUntil.toDate();
       else if (typeof appUser.activeUntil === 'string') activeDate = new Date(appUser.activeUntil);
       else if (appUser.activeUntil.seconds) activeDate = new Date(appUser.activeUntil.seconds * 1000);
    }
    // Consider trial if no active date, or active date is less than 7 days from now, or low event quota
    if (!activeDate || activeDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) || (appUser.eventQuota && appUser.eventQuota <= 1)) {
      isTrial = true;
    }
  }

  const [metrics, setMetrics] = useState({
    totalEvents: 0,
    draftEvents: 0,
    publishedEvents: 0,
    expectedGuests: 0,
    expectedPax: 0,
    rsvpAttendingGuests: 0,
    rsvpAttendingPax: 0,
    rsvpPendingGuests: 0,
    rsvpDeclinedGuests: 0,
    attendedGuests: 0,
    attendedPax: 0
  });
  const [superMetrics, setSuperMetrics] = useState({
    totalUsers: 0,
    totalPartners: 0,
    totalClients: 0,
  });
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeGuestsList: (() => void)[] = [];

    const setupListeners = async (showLoading = true) => {
      try {
        if (appUser?.role === 'staff') return;
        if (showLoading) setLoading(true);
        
        let eventsRef = collection(db, 'events');
        let q = query(eventsRef);
        
        if (appUser?.role === 'partner') {
          const partnerId = appUser.id || '';
          q = query(eventsRef, where('partnerId', '==', partnerId));
        } else if (appUser?.role === 'client') {
          const targetClientId = appUser?.clientId || appUser?.id || '';
          if (!targetClientId) {
             setLoading(false);
             return;
          }
          q = query(eventsRef, where('clientId', '==', targetClientId));
        }

        if (appUser?.role === 'superadmin' || appUser?.role === 'owner') {
          try {
             const { getCountFromServer } = await import('firebase/firestore');
             const usersRef = collection(db, 'users');
             const totalUsersSnap = await getCountFromServer(usersRef);
             const partnersSnap = await getCountFromServer(query(usersRef, where('role', '==', 'partner')));
             const clientsSnap = await getCountFromServer(collection(db, 'clients'));
             setSuperMetrics(prev => ({ 
               ...prev, 
               totalUsers: totalUsersSnap.data().count, 
               totalPartners: partnersSnap.data().count,
               totalClients: clientsSnap.data().count 
             }));
          } catch (error: any) {
             handleFirestoreError(error, OperationType.GET, 'superadmin metrics');
          }
        }

        try {
          const eventsSnapshot = await getDocs(q);
          const eventsList: EventRecord[] = [];
          let drafts = 0;
          let published = 0;
              
          eventsSnapshot.forEach(doc => {
            if (!canUserAccessEvent(appUser, doc.id)) return;
            const data = doc.data() as EventRecord;
            eventsList.push({ ...data, id: doc.id });
            if (data.status === 'draft') drafts++;
            if (data.status === 'published' || data.status === 'completed') published++;
          });

          setEvents(eventsList);
             
          // Clean up old guest listeners
          unsubscribeGuestsList.forEach(unsub => unsub());
          unsubscribeGuestsList = [];

          const publishedEvents = eventsList.filter(e => e.status === 'published' || e.status === 'completed');
             
          if (publishedEvents.length === 0) {
            setMetrics({
              totalEvents: eventsList.length,
              draftEvents: drafts,
              publishedEvents: published,
              expectedGuests: 0,
              expectedPax: 0,
              rsvpAttendingGuests: 0,
              rsvpAttendingPax: 0,
              rsvpPendingGuests: 0,
              rsvpDeclinedGuests: 0,
              attendedGuests: 0,
              attendedPax: 0
            });
            setLoading(false);
            return;
          }

          let currentExpected = 0;
          let currentExpectedPax = 0;
          let currentRsvpAttendingGuests = 0;
          let currentRsvpAttendingPax = 0;
          let currentRsvpPendingGuests = 0;
          let currentRsvpDeclinedGuests = 0;
          let currentAttended = 0;
          let currentAttendedPax = 0;

          await Promise.all(publishedEvents.map(async (event) => {
             try {
                const guestsRef = collection(db, 'events', event.id!, 'guests');
                const guestsSnap = await getDocs(guestsRef);
                guestsSnap.forEach((gDoc) => {
                  const g = gDoc.data() as Guest;
                  const guestPax = g.rsvpStatus === 'declined' ? 0 : Math.max(1, Number(g.pax) || 1);
                  currentExpected += 1;
                  currentExpectedPax += guestPax;
                  if (g.rsvpStatus === 'attending') {
                    currentRsvpAttendingGuests += 1;
                    currentRsvpAttendingPax += Math.max(1, Number(g.pax) || 1);
                  } else if (g.rsvpStatus === 'declined') {
                    currentRsvpDeclinedGuests += 1;
                  } else {
                    currentRsvpPendingGuests += 1;
                  }
                  if (g.attended) {
                    currentAttended += 1;
                    currentAttendedPax += Math.max(1, Number(g.pax) || 1);
                  }
                });
             } catch (e) {
                console.error("Error fetching guest counts for event", event.id, e);
             }
          }));

          setMetrics({
             totalEvents: eventsList.length,
             draftEvents: drafts,
             publishedEvents: published,
             expectedGuests: currentExpected,
             expectedPax: currentExpectedPax,
             rsvpAttendingGuests: currentRsvpAttendingGuests,
             rsvpAttendingPax: currentRsvpAttendingPax,
             rsvpPendingGuests: currentRsvpPendingGuests,
             rsvpDeclinedGuests: currentRsvpDeclinedGuests,
             attendedGuests: currentAttended,
             attendedPax: currentAttendedPax
          });
          setLoading(false);
        } catch (error: any) {
            handleFirestoreError(error, OperationType.GET, 'dashboard-metrics');
            setLoading(false);
        }

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'dashboard-metrics');
        setLoading(false);
      }
    };

    if (appUser) {
      setupListeners(true);
    }

    const handleCompatChange = (e: any) => {
      const col = e.detail?.collectionName;
      if (!col || col === 'guests' || col === 'events') {
        setupListeners(false);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setupListeners(false);
      }
    };

    window.addEventListener('supabase-compat-change', handleCompatChange);
    document.addEventListener('visibilitychange', handleVisibility);

    const liveInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && appUser) {
        setupListeners(false);
      }
    }, 5000);

    return () => {
      clearInterval(liveInterval);
      window.removeEventListener('supabase-compat-change', handleCompatChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribeGuestsList.forEach(unsub => unsub());
    };
  }, [appUser]);

  // Sync public stats for SalesPage
  useEffect(() => {
    if (appUser?.role === 'superadmin' && (metrics.totalEvents > 0 || metrics.expectedGuests > 0)) {
      try {
        setDoc(doc(db, 'settings', 'publicStats'), {
          totalEvents: metrics.totalEvents,
          totalGuests: metrics.expectedGuests,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn("Could not sync public stats:", err);
      }
    }
  }, [appUser?.role, metrics.totalEvents, metrics.expectedGuests]);

  const tileContent = ({ date, view }: { date: Date, view: string }) => {
    if (view === 'month') {
      const hasEvent = events.some(event => {
          const d = parseFirestoreDate(event.date);
          if (!d || isNaN(d.getTime())) return false;
          return isSameDay(d, date) && event.status !== 'completed';
      });
      return hasEvent ? <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mx-auto mt-1"></div> : null;
    }
    return null;
  };
  
  const selectedDateEvents = events.filter(event => {
      const d = parseFirestoreDate(event.date);
      if (!d || isNaN(d.getTime())) return false;
      return isSameDay(d, selectedDate) && event.status !== 'completed';
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <p className="text-gray-600">Selamat datang, {appUser?.name}! Anda login sebagai <span className="font-medium text-indigo-600">{getRoleLabel(appUser?.role, appUser?.staffType)}</span>.</p>
        
        {isTrial && (
          <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-lg flex items-start gap-3">
            <div className="p-2 bg-indigo-100 rounded-full text-indigo-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-indigo-900">Tingkatkan Layanan Anda</h3>
              <p className="text-sm text-indigo-700 mt-1">
                Anda saat ini menggunakan akses masa percobaan. Untuk membuat lebih banyak acara dan mengundang lebih banyak tamu tanpa batas waktu, silakan upgrade layanan Anda.
              </p>
              <button onClick={() => navigate('/auth/login/services/catalog')} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mt-2 inline-block">
                Lihat Katalog Layanan &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
      
      {loading ? (
        <div className="text-gray-500">Memuat data dashboard...</div>
      ) : (
        <div className="space-y-6">
          {(appUser?.role === 'superadmin' || appUser?.role === 'owner') && (
            <div>
               <h2 className="text-lg font-medium text-gray-900 mb-4">Statistik Global Sistem</h2>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                 <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-purple-500">
                   <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total User</h3>
                   <p className="text-3xl font-bold text-gray-900 mt-2">{superMetrics.totalUsers}</p>
                 </div>
                 <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-orange-500">
                   <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Partner</h3>
                   <p className="text-3xl font-bold text-gray-900 mt-2">{superMetrics.totalPartners}</p>
                 </div>
                 <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-teal-500">
                   <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Client</h3>
                   <p className="text-3xl font-bold text-gray-900 mt-2">{superMetrics.totalClients}</p>
                 </div>
                 <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-indigo-500">
                   <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Acara Aktif</h3>
                   <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.publishedEvents}</p>
                 </div>
               </div>
            </div>
          )}

          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Ringkasan Acara & Estimasi Kehadiran (Pra Check-In)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              <div className="bg-white p-5 rounded-lg shadow-2xs border border-gray-200 border-l-4 border-l-blue-500 flex flex-col justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Total Acara</h3>
                <p className="text-3xl font-bold text-gray-900 mt-2 font-mono tabular-nums">{metrics.totalEvents}</p>
                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-600">{metrics.publishedEvents} Aktif</span>
                  <span className="text-gray-500">{metrics.draftEvents} Draft</span>
                </div>
              </div>
              <div className="bg-white p-5 rounded-lg shadow-2xs border border-gray-200 border-l-4 border-l-indigo-500 flex flex-col justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Total Undangan</h3>
                <div className="mt-2 flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900 font-mono tabular-nums">{metrics.expectedGuests.toLocaleString('id-ID')}</p>
                  <p className="text-xs text-gray-500 font-medium">Undangan</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Total Alokasi:</span>
                  <span className="font-semibold text-indigo-600 font-mono tabular-nums">{metrics.expectedPax.toLocaleString('id-ID')} Orang</span>
                </div>
              </div>
              <div className="bg-emerald-50/25 p-5 rounded-lg shadow-2xs border border-emerald-200 border-l-4 border-l-emerald-600 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider whitespace-nowrap">Estimasi Hadir (RSVP)</h3>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded whitespace-nowrap">Pra Check-In</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-emerald-700 font-mono tabular-nums">{metrics.rsvpAttendingPax.toLocaleString('id-ID')}</p>
                  <p className="text-xs text-emerald-800 font-semibold">Orang (Pax)</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-emerald-100 flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="text-emerald-900 font-medium">{metrics.rsvpAttendingGuests} hadir</span>
                  <span className="text-amber-600 font-medium">{metrics.rsvpPendingGuests} pending</span>
                  <span className="text-rose-600 font-medium">{metrics.rsvpDeclinedGuests} absen</span>
                </div>
              </div>
              <div className="bg-white p-5 rounded-lg shadow-2xs border border-gray-200 border-l-4 border-l-green-500 flex flex-col justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Realisasi Check-In</h3>
                <div className="mt-2 flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900 font-mono tabular-nums">{metrics.attendedPax.toLocaleString('id-ID')}</p>
                  <p className="text-xs text-gray-600 font-semibold">Orang Masuk</p>
               </div>
               <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                 <span className="text-gray-500">{metrics.attendedGuests} / {metrics.expectedGuests} scan</span>
                 <span className="font-mono tabular-nums font-semibold text-green-600">
                   {metrics.expectedGuests > 0 ? Math.round((metrics.attendedGuests / metrics.expectedGuests) * 100) : 0}%
                 </span>
               </div>
              </div>
            </div>
          </div>

          {(appUser?.role === 'partner' || appUser?.role === 'client' || appUser?.role === 'admin' || appUser?.role === 'owner' || appUser?.role === 'superadmin') && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Pengingat Kalender Acara</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 lg:col-span-1">
                  <style>
                    {`
                      .react-calendar {
                        border: none;
                        font-family: inherit;
                        width: 100%;
                      }
                      .react-calendar__tile--active {
                        background: #4f46e5;
                        color: white;
                        border-radius: 6px;
                      }
                      .react-calendar__tile--active:enabled:hover,
                      .react-calendar__tile--active:enabled:focus {
                        background: #4338ca;
                      }
                      .react-calendar__tile--now {
                        background: #e0e7ff;
                        border-radius: 6px;
                        color: #4338ca;
                      }
                      .react-calendar__tile {
                        padding: 0.75em 0.5em;
                      }
                    `}
                  </style>
                  <Calendar 
                    onChange={(val) => setSelectedDate(val as Date)} 
                    value={selectedDate}
                    tileContent={tileContent}
                    className="w-full"
                  />
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 lg:col-span-2">
                  <h3 className="text-base font-medium text-gray-900 mb-4 border-b pb-2">
                    Jadwal Acara: {format(selectedDate, 'dd MMMM yyyy')}
                  </h3>
                  {selectedDateEvents.length > 0 ? (
                    <div className="space-y-4">
                      {selectedDateEvents.map(event => {
                        // Check if Event is H-3
                        const parsedDate = parseFirestoreDate(event.date);
                        const diffTime = parsedDate ? parsedDate.getTime() - new Date().getTime() : 0;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const isWarning = diffDays > 0 && diffDays <= 3;
                        
                        return (
                          <div key={event.id} className={`p-4 rounded-lg border ${isWarning ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold text-gray-900">{event.title}</h4>
                                <p className="text-sm text-gray-600 mt-1 flex items-center">
                                  <svg className="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                  {event.time || 'Waktu belum diatur'}
                                </p>
                                {event.location && (
                                  <p className="text-sm text-gray-600 mt-1 flex items-center">
                                    <svg className="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                    {event.location}
                                  </p>
                                )}
                              </div>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                event.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {event.status}
                              </span>
                            </div>
                            {isWarning && (
                              <div className="mt-3 text-sm text-orange-700 bg-orange-100 bg-opacity-50 p-2 rounded flex items-start">
                                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                <span>Acara ini akan berlangsung dalam H-{diffDays}. Mohon pastikan segala perlengkapan siap.</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      <p>Tidak ada jadwal acara pada tanggal ini.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

