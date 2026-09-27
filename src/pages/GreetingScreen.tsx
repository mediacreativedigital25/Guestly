import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabaseDb } from '../lib/supabaseDb';
import { EventRecord, Guest } from '../types';
import { parseFirestoreDate } from '../lib/utils';
import { useSettings } from '../SettingsContext';
import { ScanLine } from 'lucide-react';
import { offlineSyncService } from '../services/offlineSyncService';

export default function GreetingScreen() {
  const { eventId } = useParams();
  const { settings } = useSettings();
  
  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [latestGuest, setLatestGuest] = useState<Guest | null>(null);
  const [showGreeting, setShowGreeting] = useState(false);
  const [errorInfo, setErrorInfo] = useState('');
  const [partnerLogoUrl, setPartnerLogoUrl] = useState<string | null>(null);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerGreetingDisplay = (newRecord: any) => {
    if (!newRecord || !newRecord.attended) return;
    const guest: Guest = {
      id: newRecord.id,
      eventId: newRecord.event_id || eventId || '',
      name: newRecord.name,
      ticketCode: newRecord.ticket_code || newRecord.ticketCode || '',
      category: newRecord.category,
      tableNumber: newRecord.seat || newRecord.tableNumber,
      pax: newRecord.pax,
      session: newRecord.session,
      rsvpStatus: newRecord.rsvp_status || newRecord.rsvpStatus,
      attended: true,
      attendedAt: newRecord.check_in_time || newRecord.attendedAt || new Date().toISOString(),
      wishes: newRecord.wishes,
      createdAt: newRecord.created_at,
      updatedAt: newRecord.updated_at
    };

    setLatestGuest(guest);
    setShowGreeting(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Hide greeting after 8 seconds and return to waiting screen
    timeoutRef.current = setTimeout(() => {
      setShowGreeting(false);
    }, 8000);
  };

  // Fetch Event Info and Latest Guest
  useEffect(() => {
    if (!eventId) return;

    // 0. Load cached offline snapshot immediately if available
    const cachedSnapshot = offlineSyncService.getEventSnapshot(eventId);
    if (cachedSnapshot?.event) {
      setEventData(cachedSnapshot.event);
      if (cachedSnapshot.partnerLogoUrl) {
        setPartnerLogoUrl(cachedSnapshot.partnerLogoUrl);
      }
    }
    
    // 1. Initial Load of Event from Supabase
    supabaseDb.getEvent(eventId).then(async (data) => {
      if (data) {
        setEventData(data);
        let resolvedLogo: string | null = null;
        if (data.partnerId) {
          try {
            const partner = await supabaseDb.getUser(data.partnerId);
            if (partner && (partner as any).logoUrl) {
              resolvedLogo = (partner as any).logoUrl;
              setPartnerLogoUrl(resolvedLogo);
            }
          } catch {
            // ignore partner fetch error when offline
          }
        }
        offlineSyncService.saveEventSnapshot(eventId, data, resolvedLogo);
      }
    }).catch(err => {
      console.warn("Error fetching event data from Supabase, checking offline snapshot:", err);
      const fallback = offlineSyncService.getEventSnapshot(eventId);
      if (fallback?.event) {
        setEventData(fallback.event);
        if (fallback.partnerLogoUrl) setPartnerLogoUrl(fallback.partnerLogoUrl);
      } else {
        setErrorInfo('Gagal memuat data acara dari Supabase (Periksa koneksi internet).');
      }
    });

    // 2. Realtime WebSocket subscription to Supabase guests table
    const unsubscribeGuests = supabaseDb.subscribeToGuests(eventId, (payload) => {
      triggerGreetingDisplay(payload.new);
    });

    // 3. Offline same-device BroadcastChannel & Storage listener
    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel(`guestly_greeting_${eventId}`);
        bc.onmessage = (ev) => {
          if (ev.data?.type === 'GUEST_ARRIVAL' && ev.data?.payload) {
            triggerGreetingDisplay(ev.data.payload);
          }
        };
      } catch {
        // ignore BroadcastChannel init error
      }
    }

    const handleStoragePing = (e: StorageEvent) => {
      if (e.key === `guestly_local_greeting_ping_${eventId}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          triggerGreetingDisplay(parsed);
        } catch {
          // ignore parse error
        }
      }
    };
    window.addEventListener('storage', handleStoragePing);

    return () => {
      unsubscribeGuests();
      if (bc) bc.close();
      window.removeEventListener('storage', handleStoragePing);
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
