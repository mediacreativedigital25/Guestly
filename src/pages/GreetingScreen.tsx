import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EventRecord, Guest } from '../types';
import { parseFirestoreDate } from '../lib/utils';
import { useSettings } from '../SettingsContext';
import { ScanLine } from 'lucide-react';

export default function GreetingScreen() {
  const { eventId } = useParams();
  const { settings } = useSettings();
  
  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [latestGuest, setLatestGuest] = useState<Guest | null>(null);
  const [showGreeting, setShowGreeting] = useState(false);
  const [errorInfo, setErrorInfo] = useState('');
  const [partnerLogoUrl, setPartnerLogoUrl] = useState<string | null>(null);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Event Info and Latest Guest
  useEffect(() => {
    if (!eventId) return;
    
    // Subscribe to Event Info
    const eventRef = doc(db, 'events', eventId);
    const unsubscribeEvent = onSnapshot(eventRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as EventRecord;
        setEventData(data);
        
        // Fetch partner logo
        if (data.partnerId) {
           try {
              const { getDoc } = await import('firebase/firestore');
              const partnerDocRef = doc(db, 'users', data.partnerId);
              const partnerDocSnap = await getDoc(partnerDocRef);
              if (partnerDocSnap.exists() && partnerDocSnap.data().logoUrl) {
                 setPartnerLogoUrl(partnerDocSnap.data().logoUrl);
              }
           } catch (e) {
              console.error("Error fetching partner logo:", e);
           }
        }
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
      if (err.code === 'permission-denied') {
        setErrorInfo('Akses ditolak. Rekomendasi: Gunakan Cloudflare endpoint khusus untuk Public Greeting Screen agar lebih aman (tanpa expose PII).');
      } else if (err.code !== 'unavailable') {
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

  const displayLogoUrl = partnerLogoUrl || settings?.logoUrl;

const renderFormattedTitle = (title: string, isMain: boolean = false) => {
    const weddingMatch = title.match(/^(the wedding of\s+)(.*)$/i);
    if (weddingMatch) {
      if (isMain) {
         return (
          <span className="flex flex-col items-center gap-2 sm:gap-4 leading-none">
            <span className="text-lg sm:text-2xl md:text-3xl font-light font-['Poppins'] opacity-90 pb-2" style={{ fontFamily: '"Poppins", sans-serif' }}>
              The Wedding Of
            </span>
            <span className="leading-tight font-['Great_Vibes'] font-normal pb-4 text-[0.8em] sm:text-[1em]" style={{ fontFamily: '"Great Vibes", cursive' }}>{weddingMatch[2].replace(/ dan /gi, ' & ')}</span>
          </span>
         );
      } else {
         return (
           <span className="flex flex-col items-center gap-1">
             <span className="text-sm sm:text-base font-light font-['Poppins'] opacity-90" style={{ fontFamily: '"Poppins", sans-serif' }}>
               The Wedding Of
             </span>
             <span className="leading-tight font-['Great_Vibes'] font-normal text-[0.9em] sm:text-[1.1em]" style={{ fontFamily: '"Great Vibes", cursive' }}>{weddingMatch[2].replace(/ dan /gi, ' & ')}</span>
           </span>
         );
      }
    }
    return title;
  };

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center relative overflow-hidden font-sans">
      {/* Background Frame / Overlay */}
      {eventData.frameOverlayUrl ? (
         <div 
           className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
           style={{ backgroundImage: `url(${eventData.frameOverlayUrl})` }}
         />
      ) : (
         <div 
           className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
           style={{ backgroundImage: `url(/bg-default.png)` }}
         />
      )}
      
      {/* Subtle overlay to ensure text remains readable */}
      <div className="absolute inset-0 z-0 bg-black/30 backdrop-blur-[2px]" />

      {/* Main Content Container */}
      <div className="z-10 w-full px-6 py-12 flex flex-col items-center justify-center transition-all duration-1000 min-h-screen">
         {displayLogoUrl && (
           <img src={displayLogoUrl} alt="Vendor Logo" className="absolute top-12 h-auto max-h-20 w-auto max-w-[240px] object-contain opacity-80" />
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
               Di Acara {renderFormattedTitle(eventData.title, false)}
             </p>
           </div>
         ) : (
           <div className="flex flex-col items-center justify-center space-y-8 sm:space-y-12 animate-in fade-in duration-1000 w-full px-4 mt-8">
             <h1 
               className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl text-white/90 font-bold tracking-tight drop-shadow-xl text-center max-w-full break-words leading-tight"
               style={{ fontFamily: eventData.fontFamily || 'inherit' }}
             >
               {renderFormattedTitle(eventData.title, true)}
             </h1>
             
             <div className="flex flex-col items-center space-y-8">
                <p className="text-sm sm:text-lg text-white/70 tracking-[0.3em] sm:tracking-[0.5em] uppercase font-light text-center border-b border-white/20 pb-4 px-8">
                  Menunggu Tamu...
                </p>
                
                <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 shadow-xl">
                  <div className="bg-white/20 p-3 rounded-xl border border-white/20">
                    <ScanLine className="w-8 h-8 text-white/90" />
                  </div>
                  <div className="flex flex-col">
                     <span className="text-white/70 text-sm font-light">Scan QR untuk</span>
                     <span className="text-white font-semibold text-lg">Check-In</span>
                  </div>
                </div>
             </div>
           </div>
         )}
         
         {!showGreeting && (
             <div className="absolute bottom-8 flex flex-col items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
               <span className="text-[10px] font-light tracking-[0.2em] text-white/60 uppercase">Powered by</span>
               <div className="flex items-center gap-2">
                 <span className="text-xl font-bold tracking-tight text-white/90 font-serif">Guestly</span>
               </div>
             </div>
         )}
      </div>
    </div>
  );
}
