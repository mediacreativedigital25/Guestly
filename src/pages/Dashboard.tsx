import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { EventRecord, Guest } from '../types';

export default function Dashboard() {
  const { appUser } = useAuth();
  const [metrics, setMetrics] = useState({
    totalEvents: 0,
    draftEvents: 0,
    publishedEvents: 0,
    expectedGuests: 0,
    attendedGuests: 0
  });
  const [superMetrics, setSuperMetrics] = useState({
    totalUsers: 0,
    totalPartners: 0,
    totalClients: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        
        let eventsRef = collection(db, 'events');
        let q = query(eventsRef);
        
        if (appUser?.role === 'partner') {
          const partnerId = appUser.id;
          q = query(eventsRef, where('partnerId', '==', partnerId));
        } else if (appUser?.role === 'client') {
          if (!appUser?.clientId) {
             setLoading(false);
             return;
          }
          q = query(eventsRef, where('clientId', '==', appUser.clientId));
        }

        if (appUser?.role === 'superadmin') {
          const usersRef = collection(db, 'users');
          const usersSnapshot = await getDocs(usersRef);
          let partners = 0;
          usersSnapshot.forEach(u => {
            if (u.data().role === 'partner') partners++;
          });
          
          const clientsRef = collection(db, 'clients');
          const clientsSnapshot = await getDocs(clientsRef);
          
          setSuperMetrics({
            totalUsers: usersSnapshot.size,
            totalPartners: partners,
            totalClients: clientsSnapshot.size
          });
        }

        const eventsSnapshot = await getDocs(q);
        const eventsList: EventRecord[] = [];
        let drafts = 0;
        let published = 0;
        
        eventsSnapshot.forEach(doc => {
          const data = doc.data() as EventRecord;
          eventsList.push({ ...data, id: doc.id });
          if (data.status === 'draft') drafts++;
          if (data.status === 'published' || data.status === 'completed') published++;
        });

        let expected = 0;
        let attended = 0;

        // Fetch guests for each event
        for (const event of eventsList) {
          // If we only want to connect data when event is published:
          if (event.status === 'published' || event.status === 'completed') {
            const guestsRef = collection(db, 'events', event.id!, 'guests');
            const guestsSnapshot = await getDocs(guestsRef);
            expected += guestsSnapshot.size;
            
            guestsSnapshot.forEach(guestDoc => {
              if (guestDoc.data().attended === true) {
                attended++;
              }
            });
          }
        }

        setMetrics({
          totalEvents: eventsList.length,
          draftEvents: drafts,
          publishedEvents: published,
          expectedGuests: expected,
          attendedGuests: attended
        });

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'dashboard-metrics');
      } finally {
        setLoading(false);
      }
    };

    if (appUser) {
      fetchMetrics();
    }
  }, [appUser]);
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <p className="text-gray-600">Selamat datang, {appUser?.name}! Anda login sebagai <span className="font-medium text-indigo-600">{appUser?.role}</span>.</p>
      </div>
      
      {loading ? (
        <div className="text-gray-500">Memuat data dashboard...</div>
      ) : (
        <div className="space-y-6">
          {appUser?.role === 'superadmin' && (
            <div>
               <h2 className="text-lg font-medium text-gray-900 mb-4">Statistik Super Admin</h2>
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
            <h2 className="text-lg font-medium text-gray-900 mb-4">Ringkasan Acara</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Acara</h3>
                <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.totalEvents}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-yellow-400">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Draft</h3>
                <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.draftEvents}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-indigo-500">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Acara Aktif</h3>
                <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.publishedEvents}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-green-500">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Tamu Hadir</h3>
                <div className="mt-2 flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900">{metrics.attendedGuests}</p>
                  <p className="text-sm text-gray-500 font-medium">/ {metrics.expectedGuests} Tamu</p>
               </div>
               <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5">
                 <div 
                   className="bg-green-500 h-1.5 rounded-full" 
                   style={{ width: metrics.expectedGuests > 0 ? `${(metrics.attendedGuests / metrics.expectedGuests) * 100}%` : '0%' }}
                 ></div>
               </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
