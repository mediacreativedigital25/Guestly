import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { supabaseDb } from '../lib/supabaseDb';
import { EventRecord, Guest, GreetingScreenTemplate } from '../types';
import { useSettings } from '../SettingsContext';
import { useAuth } from '../AuthContext';
import { isGreetingScreenUser } from '../lib/utils';
import { showConfirm } from '../lib/alerts';
import { Maximize2, Minimize2, Sparkles, Clock, LogOut } from 'lucide-react';
import { offlineSyncService } from '../services/offlineSyncService';
import {
  greetingTemplateService,
  DEFAULT_GREETING_TEMPLATES,
} from '../services/greetingTemplateService';
import { GreetingScreenCanvas } from '../components/GreetingScreenCanvas';

export default function GreetingScreen() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { appUser, logout } = useAuth();

  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [templates, setTemplates] = useState<GreetingScreenTemplate[]>(
    DEFAULT_GREETING_TEMPLATES
  );
  const [latestGuest, setLatestGuest] = useState<Guest | null>(null);
  const [showGreeting, setShowGreeting] = useState(false);
  const [errorInfo, setErrorInfo] = useState('');
  const [partnerLogoUrl, setPartnerLogoUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerGreetingDisplay = (newRecord: any) => {
    if (!newRecord || !newRecord.attended) return;
    const guest: Guest = {
      id: newRecord.id,
      eventId: newRecord.event_id || eventId || '',
      name: newRecord.name || 'Tamu Undangan Kehormatan',
      ticketCode: newRecord.ticket_code || newRecord.ticketCode || '',
      category: newRecord.category,
      tableNumber: newRecord.seat || newRecord.tableNumber,
      pax: newRecord.pax,
      session: newRecord.session,
      rsvpStatus: newRecord.rsvp_status || newRecord.rsvpStatus,
      attended: true,
      attendedAt:
        newRecord.check_in_time ||
        newRecord.attendedAt ||
        new Date().toISOString(),
      wishes: newRecord.wishes,
      createdAt: newRecord.created_at,
      updatedAt: newRecord.updated_at,
    };

    setLatestGuest(guest);
    setShowGreeting(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Hide greeting after 10 seconds and return to standby screen
    timeoutRef.current = setTimeout(() => {
      setShowGreeting(false);
    }, 10000);
  };

  useEffect(() => {
    greetingTemplateService.getTemplates().then((list) => {
      setTemplates(list);
    });
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Fetch Event Info and Listen for Guest Check-In
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
    supabaseDb
      .getEvent(eventId)
      .then(async (data) => {
        if (data) {
          setEventData(data);
          let resolvedLogo: string | null = null;
          if (data.partnerId) {
            try {
              const partner = await supabaseDb.getUser(data.partnerId);
              if (partner && ((partner as any).logoUrl || (partner as any).brandLogo)) {
                resolvedLogo = (partner as any).logoUrl || (partner as any).brandLogo;
                setPartnerLogoUrl(resolvedLogo);
              }
            } catch {
              // ignore partner fetch error when offline
            }
          }
          offlineSyncService.saveEventSnapshot(eventId, data, resolvedLogo);
        }
      })
      .catch((err) => {
        console.warn(
          'Error fetching event data from Supabase, checking offline snapshot:',
          err
        );
        const fallback = offlineSyncService.getEventSnapshot(eventId);
        if (fallback?.event) {
          setEventData(fallback.event);
          if (fallback.partnerLogoUrl) setPartnerLogoUrl(fallback.partnerLogoUrl);
        } else {
          setErrorInfo(
            'Gagal memuat data acara dari Supabase (Periksa koneksi internet).'
          );
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

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Strict 1-User-1-Event enforcement for Layar Sapa role accounts
  if (
    isGreetingScreenUser(appUser) &&
    Array.isArray(appUser?.assignedEventIds) &&
    appUser.assignedEventIds.length > 0 &&
    eventId !== appUser.assignedEventIds[0]
  ) {
    return <Navigate to={`/events/${appUser.assignedEventIds[0]}/greeting`} replace />;
  }

  if (errorInfo) {
    return (
      <div className="min-h-screen bg-[#FAF5F0] text-rose-600 flex items-center justify-center font-medium">
        {errorInfo}
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-[#FAF5F0] text-slate-800 flex flex-col items-center justify-center space-y-4">
        <img
          src={settings?.faviconUrl || settings?.logoUrl || '/favicon.ico'}
          alt="Guestly Logo"
          className="w-16 h-16 object-contain animate-pulse"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
        <p className="text-slate-600 font-medium">Memuat Layar Sapa Guestly...</p>
      </div>
    );
  }

  const activeTemplate =
    templates.find((t) => t.id === eventData.greetingTemplateId) ||
    templates.find((t) => t.isDefault) ||
    DEFAULT_GREETING_TEMPLATES[0];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#FAF5F0] select-none group">
      <GreetingScreenCanvas
        fullscreen
        template={activeTemplate}
        event={eventData}
        guest={latestGuest}
        mode={showGreeting && latestGuest ? 'welcome' : 'standby'}
        appLogoUrl={partnerLogoUrl || settings?.logoUrl}
      />

      {/* Discreet Operator Floating Controls (Only visible when hovering bottom-right corner) */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button
          type="button"
          onClick={() => {
            if (showGreeting) {
              setShowGreeting(false);
            } else {
              triggerGreetingDisplay({
                id: 'demo-guest',
                name: latestGuest?.name || 'Iklas Padli',
                category: latestGuest?.category || '',
                seat: latestGuest?.tableNumber || '',
                attended: true,
              });
            }
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/90 hover:bg-white text-slate-800 text-xs font-semibold shadow-lg border border-slate-200 backdrop-blur-md cursor-pointer"
          title="Tes Tampilan Sambutan Tamu"
        >
          {showGreeting ? (
            <>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Mode Standby</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-rose-600" />
              <span>Simulasi Tamu Hadir</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-900/85 hover:bg-slate-900 text-white text-xs font-semibold shadow-lg backdrop-blur-md cursor-pointer"
          title="Layar Penuh (Fullscreen)"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Keluar Fullscreen</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fullscreen TV</span>
            </>
          )}
        </button>

        {appUser && (
          <button
            type="button"
            onClick={async () => {
              const confirmed = await showConfirm(
                'Keluar dari Akun Layar Sapa?',
                `Anda akan keluar dari sesi ${appUser.name || appUser.email} dan kembali ke halaman login.`
              );
              if (!confirmed) return;
              if (typeof document !== 'undefined' && document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
              }
              logout();
              navigate('/auth/login', { replace: true });
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-semibold shadow-lg backdrop-blur-md cursor-pointer"
            title={`Keluar Akun (${appUser.name || appUser.email})`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Akun</span>
          </button>
        )}
      </div>
    </div>
  );
}
