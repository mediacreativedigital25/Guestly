import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EventRecord, Guest } from '../types';
import { parseFirestoreDate } from '../lib/utils';
import { useSettings } from '../SettingsContext';

export default function GreetingScreen() {
  const { eventId } = useParams();
  const { settings } = useSettings();
  
  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [latestGuest, setLatestGuest] = useState<Guest | null>(null);
  const [showGreeting, setShowGreeting] = useState(false);
  const [errorInfo, setErrorInfo] = useState('');
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Event Info and Latest Guest
  useEffect(() => {
    if (!eventId) return;
    
    // Subscribe to Event Info
    const eventRef = doc(db, 'events', eventId);
    const unsubscribeEvent = onSnapshot(eventRef, (docSnap) => {
      if (docSnap.exists()) {
        setEventData({ id: docSnap.id, ...docSnap.data() } as EventRecord);
      }
    }, (err: any) => {
      console.error(err);
      if (err.code !== 'unavailable') {
        setErrorInfo('Failed to load event data.');
      }
    });

    // Subscribe to the most recently attended guest
    // Using orderBy attendedAt desc, limit 1 avoids composite index while ensuring we get the latest check-in.
    const guestsRef = collection(db, 'events', eventId, 'guests');
    const q = query(
      guestsRef,
      orderBy('attendedAt', 'desc'),
      limit(1)
    );

    const unsubscribeGuests = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const guestData = snapshot.docs[0].data() as Guest;
        
        const attendedDate = guestData.attendedAt ? parseFirestoreDate(guestData.attendedAt) : null;
        if (guestData.attended && attendedDate) {
          // Check if the check-in happened recently (within the last 15 seconds)
          // to prevent showing old check-ins when the page is first loaded
          const checkInTime = attendedDate.getTime();
          const now = new Date().getTime();
          
          if (now - checkInTime < 15000) {
            setLatestGuest(guestData);
            setShowGreeting(true);
            
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }
            
            // Hide greeting after 8 seconds and return to waiting screen
            timeoutRef.current = setTimeout(() => {
              setShowGreeting(false);
            }, 8000);
          }
        }
      }
    }, (err: any) => {
      console.error(err);
      if (err.code !== 'unavailable') {
        setErrorInfo('Failed to listen to guest check-ins. ' + err.message);
      }
    });

    return () => {
      unsubscribeEvent();
      unsubscribeGuests();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [eventId]);

  if (errorInfo) {
    return <div className="min-h-screen bg-black text-red-500 flex items-center justify-center">{errorInfo}</div>;
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center space-y-4">
        <img 
          src={settings?.faviconUrl || settings?.logoUrl || "/favicon.ico"} 
          alt="Guestly Logo" 
          className="w-16 h-16 object-contain animate-pulse"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        <p className="text-gray-400 font-medium">Memuat Event...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center relative overflow-hidden font-sans">
      {/* Background Frame / Overlay */}
      {eventData.frameOverlayUrl ? (
         <div 
           className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
           style={{ backgroundImage: `url(${eventData.frameOverlayUrl})` }}
         />
      ) : (
         <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-900 via-slate-900 to-black" />
      )}
      
      {/* Subtle overlay to ensure text remains readable */}
      <div className="absolute inset-0 z-0 bg-black/30 backdrop-blur-[2px]" />

      {/* Main Content Container */}
      <div className="z-10 w-full px-6 py-12 flex flex-col items-center justify-center transition-all duration-1000">
         {settings?.logoUrl && !showGreeting && (
           <img src={settings.logoUrl} alt="Logo" className="absolute top-8 h-auto max-h-24 w-auto max-w-[280px] object-contain opacity-50" />
         )}

         {showGreeting && latestGuest ? (
           <div className="flex flex-col items-center space-y-4 animate-in slide-in-from-bottom-8 fade-in zoom-in duration-700 ease-out w-full px-4">
             <h2 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl text-white font-light tracking-[0.2em] drop-shadow-lg uppercase mb-2 sm:mb-4 text-center">
               Selamat Datang
             </h2>
             
             <h1 
               className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl text-white font-bold tracking-tight drop-shadow-2xl my-4 sm:my-6 text-center leading-tight max-w-full break-words"
               style={{ 
                 fontFamily: eventData.fontFamily || 'inherit',
                 color: eventData.primaryColor || '#ffffff',
                 textShadow: '0 4px 12px rgba(0,0,0,0.5)'
               }}
             >
               {latestGuest.name}
             </h1>
             
             <div className="h-1 w-16 sm:w-24 bg-white/50 rounded-full my-4 sm:my-6" />

             <p className="text-xl sm:text-2xl md:text-3xl text-gray-100 font-medium tracking-wide drop-shadow-md text-center max-w-full break-words">
               Di Acara {eventData.title}
             </p>
           </div>
         ) : (
           <div className="flex flex-col items-center justify-center space-y-4 sm:space-y-6 animate-in fade-in duration-1000 w-full px-4">
             <h1 
               className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl text-white/70 font-bold tracking-tight drop-shadow-xl text-center max-w-full break-words leading-tight"
               style={{ fontFamily: eventData.fontFamily || 'inherit' }}
             >
               {eventData.title}
             </h1>
             <p className="text-lg sm:text-xl md:text-2xl text-white/50 tracking-[0.2em] sm:tracking-[0.3em] uppercase drop-shadow-md text-center">
               Menunggu Tamu...
             </p>
           </div>
         )}
      </div>
    </div>
  );
}
