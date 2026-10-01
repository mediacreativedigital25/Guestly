import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { collection, query, getDocs, where, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { supabaseDb } from '../lib/supabaseDb';
import { EventRecord, Guest } from '../types';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { format, isSameDay, addMonths, startOfDay, endOfDay, differenceInCalendarDays } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { parseFirestoreDate, getRoleLabel, canUserAccessEvent, shouldHideServiceInfo, getUserBusinessId, isGreetingScreenUser } from '../lib/utils';

export default function Dashboard() {
  const { appUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isGreetingScreenUser(appUser)) {
      const targetEventId =
        Array.isArray(appUser?.assignedEventIds) && appUser.assignedEventIds.length > 0
          ? appUser.assignedEventIds[0]
          : null;
      if (targetEventId) {
        navigate(`/events/${targetEventId}/greeting`, { replace: true });
      }
      return;
    }
    if (appUser?.role === 'staff') {
      navigate('/auth/login/events', { replace: true });
    }
  }, [appUser, navigate]);

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
  const [isFilteringByDate, setIsFilteringByDate] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  // Check if client is under a WO / Partner (via user profile, hideServiceInfo, or event partnerId)
  const isClientUnderWO = Boolean(
    shouldHideServiceInfo(appUser) ||
    (appUser?.partnerId && appUser.partnerId !== 'default-partner') ||
    appUser?.businessName ||
    events.some(ev => ev.partnerId && ev.partnerId !== 'default-partner')
  );

  // Parse activeUntil safely — only show trial upgrade prompt for standalone end-user clients not under a WO
  let isTrial = false;
  if (appUser?.role === 'client' && !loading && !isClientUnderWO) {
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

  useEffect(() => {
    let unsubscribeGuestsList: (() => void)[] = [];
    let isMounted = true;

    const setupListeners = async (showLoading = true) => {
      try {
        if (appUser?.role === 'staff') return;
        if (showLoading) setLoading(true);
        
        let eventsRef = collection(db, 'events');
        let q = query(eventsRef);
        
        if (appUser?.role === 'client') {
          const targetClientId = appUser?.clientId || appUser?.id || '';
          if (!targetClientId) {
             if (isMounted) setLoading(false);
             return;
          }
          q = query(eventsRef, where('clientId', '==', targetClientId));
        }

        try {
          const myBizIds = new Set<string>(
            [appUser?.id, appUser?.partnerId, getUserBusinessId(appUser)].filter(Boolean) as string[]
          );
          const myClientIds = new Set<string>();
          const needsUsersAndClients = Boolean(
            appUser && ['superadmin', 'owner', 'partner', 'admin'].includes(appUser.role)
          );

          // Step 1 & 3: Fetch events + users/clients in a single parallel batch
          const [eventsSnapshot, snapUsers, snapClients] = await Promise.all([
            getDocs(q),
            needsUsersAndClients ? getDocs(collection(db, 'users')).catch(() => null) : Promise.resolve(null),
            needsUsersAndClients ? getDocs(collection(db, 'clients')).catch(() => null) : Promise.resolve(null),
          ]);

          if (!isMounted) return;

          if (appUser?.role === 'superadmin' && snapUsers) {
            let partnersAndOwnersCount = 0;
            snapUsers.docs.forEach((uDoc) => {
              const r = uDoc.data()?.role;
              if (r === 'partner' || r === 'owner') partnersAndOwnersCount++;
            });
            setSuperMetrics((prev) => ({
              ...prev,
              totalUsers: snapUsers.docs.length,
              totalPartners: partnersAndOwnersCount,
              totalClients: snapClients ? snapClients.docs.length : prev.totalClients,
            }));
          }

          if (appUser && ['owner', 'partner', 'admin'].includes(appUser.role)) {
            snapUsers?.docs.forEach((uDoc) => {
              const u = uDoc.data();
              if (
                (u.partnerId && myBizIds.has(u.partnerId)) ||
                (u.createdBy && myBizIds.has(u.createdBy)) ||
                myBizIds.has(uDoc.id)
              ) {
                myBizIds.add(uDoc.id);
                if (u.partnerId) myBizIds.add(u.partnerId);
              }
            });
            snapClients?.docs.forEach((cDoc) => {
              const c = cDoc.data();
              if (c.partnerId && myBizIds.has(c.partnerId)) {
                myClientIds.add(cDoc.id);
              }
            });
          }

          const allowedPartnerIds = Array.from(myBizIds);
          const userPrimaryBizId = getUserBusinessId(appUser) || appUser?.id || '';

          const eventsList: EventRecord[] = [];
          let drafts = 0;
          let published = 0;
              
          eventsSnapshot.forEach(doc => {
            const data = doc.data() as EventRecord;
            const effectivePartnerId =
              data.clientId && myClientIds.has(data.clientId)
                ? userPrimaryBizId
                : data.partnerId;
            if (!canUserAccessEvent(appUser, doc.id, effectivePartnerId, allowedPartnerIds)) return;
            eventsList.push({ ...data, id: doc.id });
            if (data.status === 'draft') drafts++;
            if (data.status === 'published' || data.status === 'completed') published++;
          });

          setEvents(eventsList);
          setMetrics(prev => ({
            ...prev,
            totalEvents: eventsList.length,
            draftEvents: drafts,
            publishedEvents: published,
          }));

          // Unblock Dashboard UI immediately as soon as events are loaded (~0.2s)
          setLoading(false);
             
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

          // Step 2: Fetch only lightweight 4-column summary for all published events at once
          const publishedEventIds = publishedEvents.map(e => e.id!).filter(Boolean);
          try {
            const summaryRows = await supabaseDb.getGuestsSummaryForEvents(publishedEventIds);
            for (const g of summaryRows) {
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
            }
          } catch {
            // Fallback to compat getDocs if summary query fails
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
          }

          if (!isMounted) return;

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
        } catch (error: any) {
            handleFirestoreError(error, OperationType.GET, 'dashboard-metrics');
            if (isMounted) setLoading(false);
        }

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'dashboard-metrics');
        if (isMounted) setLoading(false);
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

    // Step 4: 30-second lightweight background refresh interval
    const liveInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && appUser) {
        setupListeners(false);
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(liveInterval);
      window.removeEventListener('supabase-compat-change', handleCompatChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribeGuestsList.forEach(unsub => unsub());
    };
  }, [appUser?.id, appUser?.role, appUser?.partnerId, appUser?.clientId]);

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
          return isSameDay(d, date) && event.status === 'published';
      });
      return hasEvent ? <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mx-auto mt-1"></div> : null;
    }
    return null;
  };
  
  const todayStart = startOfDay(new Date());
  const threeMonthsLimit = endOfDay(addMonths(todayStart, 3));

  const upcomingThreeMonthsEvents = events
    .filter(event => {
      if (event.status !== 'published') return false;
      const d = parseFirestoreDate(event.date);
      if (!d || isNaN(d.getTime())) return false;
      return d >= todayStart && d <= threeMonthsLimit;
    })
    .sort((a, b) => {
      const da = parseFirestoreDate(a.date)?.getTime() || 0;
      const dbTime = parseFirestoreDate(b.date)?.getTime() || 0;
      return da - dbTime;
    });

  const selectedDateEvents = events
    .filter(event => {
      if (event.status !== 'published') return false;
      const d = parseFirestoreDate(event.date);
      if (!d || isNaN(d.getTime())) return false;
      return isSameDay(d, selectedDate);
    })
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const displayedScheduleEvents = isFilteringByDate ? selectedDateEvents : upcomingThreeMonthsEvents;

  return (
    <div className="space-y-6">
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
          {appUser?.role === 'superadmin' && (
            <div>
               <h2 className="text-lg font-medium text-gray-900 mb-4">Statistik Global Sistem</h2>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                 <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-purple-500">
                   <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total User</h3>
                   <p className="text-3xl font-bold text-gray-900 mt-2">{superMetrics.totalUsers}</p>
                 </div>
                 <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-orange-500">
                   <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Owner / Partner</h3>
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
                    onChange={(val) => {
                      setSelectedDate(val as Date);
                      setIsFilteringByDate(true);
                    }} 
                    value={selectedDate}
                    tileContent={tileContent}
                    className="w-full"
                  />
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 lg:col-span-2 flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-gray-100 pb-3.5">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {isFilteringByDate
                          ? `Jadwal Acara: ${format(selectedDate, 'dd MMMM yyyy', { locale: localeId })}`
                          : 'Jadwal Acara Mendatang (3 Bulan ke Depan)'}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {isFilteringByDate
                          ? 'Menampilkan acara berstatus Published pada tanggal yang dipilih.'
                          : `${format(todayStart, 'dd MMM yyyy', { locale: localeId })} – ${format(threeMonthsLimit, 'dd MMM yyyy', { locale: localeId })} · ${upcomingThreeMonthsEvents.length} Acara Aktif`}
                      </p>
                    </div>
                    {isFilteringByDate && (
                      <button
                        type="button"
                        onClick={() => setIsFilteringByDate(false)}
                        className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto shrink-0 cursor-pointer"
                      >
                        Lihat 3 Bulan ke Depan
                      </button>
                    )}
                  </div>

                  {displayedScheduleEvents.length > 0 ? (
                    <div className="divide-y divide-gray-100 border border-gray-200/80 rounded-xl overflow-hidden bg-white max-h-[380px] overflow-y-auto">
                      {displayedScheduleEvents.map((event) => {
                        const parsedDate = parseFirestoreDate(event.date);
                        const diffDays = parsedDate ? differenceInCalendarDays(parsedDate, todayStart) : 0;
                        const isWarning = diffDays >= 0 && diffDays <= 3;
                        const countdownLabel =
                          diffDays === 0
                            ? 'Hari Ini'
                            : diffDays > 0 && diffDays <= 7
                            ? `H-${diffDays}`
                            : `${diffDays} Hari Lagi`;

                        return (
                          <div
                            key={event.id}
                            onClick={() => navigate(`/auth/login/events/${event.id}`)}
                            className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-3.5 sm:px-4 sm:py-3.5 transition-colors cursor-pointer ${
                              isWarning
                                ? 'bg-amber-50/40 hover:bg-amber-50/80'
                                : 'bg-white hover:bg-slate-50/90'
                            }`}
                          >
                            <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                              {/* Compact Calendar Date Badge */}
                              <div
                                className={`w-13 h-13 rounded-xl border flex flex-col items-center justify-center shrink-0 text-center ${
                                  isWarning
                                    ? 'bg-amber-100/70 border-amber-300 text-amber-900'
                                    : 'bg-indigo-50/60 border-indigo-100 text-indigo-700'
                                }`}
                              >
                                <span className="text-[10px] font-bold uppercase tracking-wider leading-none">
                                  {parsedDate ? format(parsedDate, 'MMM', { locale: localeId }) : 'TGL'}
                                </span>
                                <span className="text-lg font-extrabold font-mono tabular-nums leading-tight mt-0.5">
                                  {parsedDate ? format(parsedDate, 'dd', { locale: localeId }) : '--'}
                                </span>
                              </div>

                              {/* Event Title & Metadata */}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <h4 className="font-bold text-gray-900 text-sm sm:text-base truncate group-hover:text-indigo-600 transition-colors">
                                    {event.title}
                                  </h4>
                                  <span
                                    className={`text-xs font-semibold ${
                                      isWarning ? 'text-amber-700' : 'text-indigo-600'
                                    }`}
                                  >
                                    · {countdownLabel}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                                  <span className="font-medium text-gray-700">
                                    {parsedDate
                                      ? format(parsedDate, 'EEEE, dd MMMM yyyy', { locale: localeId })
                                      : event.date}
                                  </span>
                                  <span aria-hidden="true" className="text-gray-300">•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    {event.time || 'Waktu belum diatur'}
                                  </span>
                                  {event.location && (
                                    <>
                                      <span aria-hidden="true" className="text-gray-300">•</span>
                                      <span className="inline-flex items-center gap-1 truncate max-w-[240px] sm:max-w-[300px]" title={event.location}>
                                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        </svg>
                                        <span className="truncate">{event.location}</span>
                                      </span>
                                    </>
                                  )}
                                </div>

                                {isWarning && (
                                  <p className="mt-1.5 text-[11px] font-medium text-amber-800 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                    <span>
                                      {diffDays === 0
                                        ? 'Berlangsung hari ini — pastikan seluruh tim & perlengkapan siap.'
                                        : `Berlangsung dalam H-${diffDays} — mohon pastikan perlengkapan siap.`}
                                    </span>
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Action Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/auth/login/events/${event.id}`);
                              }}
                              className="text-xs font-semibold text-indigo-600 group-hover:text-white bg-indigo-50/70 group-hover:bg-indigo-600 border border-indigo-200/80 group-hover:border-indigo-600 px-3.5 py-2 rounded-lg transition-all self-end sm:self-center shrink-0 cursor-pointer whitespace-nowrap"
                            >
                              Lihat Acara &rarr;
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-gray-500">
                      <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      <p className="text-sm">
                        {isFilteringByDate
                          ? 'Tidak ada jadwal acara berstatus Published pada tanggal ini.'
                          : 'Belum ada jadwal acara berstatus Published untuk 3 bulan ke depan.'}
                      </p>
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

