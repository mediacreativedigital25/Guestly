import { useParams, useSearchParams, Link } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import {
  doc,
  getDocs,
  updateDoc,
  serverTimestamp,
  query,
  collection,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { supabaseDb } from '../lib/supabaseDb';
import { Guest, EventRecord, EInviteTemplate } from '../types';
import { useSettings } from '../SettingsContext';
import { useAuth } from '../AuthContext';
import { exportCardToPng, parseFirestoreDate, getMediaFallbackUrls } from '../lib/utils';
import { EInvitationCard } from '../components/EInvitationCard';
import {
  eInviteTemplateService,
  DEFAULT_EINVITE_TEMPLATES,
} from '../services/eInviteTemplateService';
import {
  Heart,
  Clock,
  MapPin,
  MessageCircle,
  Loader2,
  Download,
  CheckCircle2,
  ExternalLink,
  Send,
  Users,
  ArrowLeft,
} from 'lucide-react';

type InviteThemeKey = 'rose' | 'gold' | 'sage';

const STICKERS = ['❤️', '🎉', '🙏', '✨', '🔥', '🌸', '💍', '🕊️'];

interface CachedGuestPass {
  guest: Guest;
  eventData: EventRecord;
  savedAt: number;
}

function getPassCacheKey(eventId?: string, ticketCode?: string): string {
  const normTicket = String(ticketCode || 'tk').trim().split('?')[0].split('#')[0].toUpperCase();
  return `guestly_einvite_pass_v1_${eventId || 'ev'}_${normTicket}`;
}

function readCachedPass(eventId?: string, ticketCode?: string): CachedGuestPass | null {
  if (typeof window === 'undefined' || !eventId || !ticketCode) return null;
  try {
    const raw = localStorage.getItem(getPassCacheKey(eventId, ticketCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGuestPass;
    if (parsed && parsed.guest && parsed.guest.ticketCode) {
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeCachedPass(eventId: string, ticketCode: string, guest: Guest, eventData: EventRecord) {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedGuestPass = {
      guest,
      eventData,
      savedAt: Date.now(),
    };
    localStorage.setItem(getPassCacheKey(eventId, ticketCode), JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export default function RSVP() {
  const { eventId, ticketCode } = useParams();
  const [searchParams] = useSearchParams();
  const { settings } = useSettings();
  const { appUser } = useAuth();

  // Instant Zero-Latency Cache Hydration for Ballroom Entrance
  const initialCached = readCachedPass(eventId, ticketCode);

  const [guest, setGuest] = useState<Guest | null>(initialCached?.guest || null);
  const [eventData, setEventData] = useState<EventRecord | null>(initialCached?.eventData || null);
  const [guestsWithWishes, setGuestsWithWishes] = useState<Guest[]>([]);
  const [templates, setTemplates] = useState<EInviteTemplate[]>(() =>
    eInviteTemplateService.getCachedTemplates()
  );
  const [loading, setLoading] = useState<boolean>(!initialCached);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [downloadingPass, setDownloadingPass] = useState(false);
  const [forceShowRsvp, setForceShowRsvp] = useState(false);
  const [footerLogoIdx, setFooterLogoIdx] = useState(0);

  // RSVP & Wishes Form State
  const [rsvpChoice, setRsvpChoice] = useState<'attending' | 'pending' | 'declined'>(
    (initialCached?.guest?.rsvpStatus as 'attending' | 'pending' | 'declined') || 'attending'
  );
  const [wishesInput, setWishesInput] = useState(initialCached?.guest?.wishes || '');
  const [selectedSticker, setSelectedSticker] = useState<string>(
    initialCached?.guest?.stickerUrl || ''
  );
  const [sessionInput, setSessionInput] = useState(initialCached?.guest?.session || '');
  const [paxInput, setPaxInput] = useState<string>(
    initialCached?.guest?.pax && initialCached.guest.pax > 0
      ? String(Number(initialCached.guest.pax))
      : '1'
  );
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  const downloadableCardRef = useRef<HTMLDivElement | null>(null);
  const rsvpSectionRef = useRef<HTMLDivElement | null>(null);

  // Support URL preview overrides (?theme=gold&mode=compact)
  const themeParam = searchParams.get('theme') as InviteThemeKey | null;
  const modeParam = searchParams.get('mode') as 'full' | 'compact' | null;

  const isCompactMode = !forceShowRsvp && modeParam === 'compact';

  const showRsvpSection = forceShowRsvp || !isCompactMode;

  const activeTemplate: EInviteTemplate = (() => {
    if (themeParam === 'gold') return DEFAULT_EINVITE_TEMPLATES[1];
    if (themeParam === 'sage') return DEFAULT_EINVITE_TEMPLATES[2];
    if (eventData?.eInviteTemplateId) {
      const found = templates.find((t) => t.id === eventData.eInviteTemplateId);
      if (found) return found;
    }
    if (eventData?.eInviteTheme === 'gold') return DEFAULT_EINVITE_TEMPLATES[1];
    if (eventData?.eInviteTheme === 'sage') return DEFAULT_EINVITE_TEMPLATES[2];
    return templates.find((t) => t.isDefault) || templates[0] || DEFAULT_EINVITE_TEMPLATES[0];
  })();

  const primaryColor = activeTemplate.primaryColor || '#153B31';
  const accentColor = activeTemplate.accentColor || '#C98583';
  const guestBoxBg = activeTemplate.guestBoxBg || '#F3E4E2';

  const footerLogoCandidates = getMediaFallbackUrls([settings?.logoUrl, settings?.faviconUrl]);
  const resolvedFooterLogo =
    footerLogoIdx < footerLogoCandidates.length ? footerLogoCandidates[footerLogoIdx] : '';

  useEffect(() => {
    setFooterLogoIdx(0);
  }, [settings?.logoUrl, settings?.faviconUrl]);

  useEffect(() => {
    eInviteTemplateService.getTemplates().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setTemplates(list);
      }
    });
  }, []);

  useEffect(() => {
    if (!eventData?.date) return;

    const calculateTimeLeft = () => {
      let parsedDate = new Date(eventData.date);

      if (isNaN(parsedDate.getTime())) {
        const parts = eventData.date.split(/[/\-]/);
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          parsedDate = new Date(year, month, day);
        }
      }

      if (isNaN(parsedDate.getTime())) return null;

      if (eventData.time) {
        const timeMatch = eventData.time.match(/(\d{2})[:.](\d{2})/);
        if (timeMatch) {
          parsedDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
        }
      }

      const difference = parsedDate.getTime() - new Date().getTime();

      if (difference > 0) {
        return {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        };
      }
      return null;
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [eventData?.date, eventData?.time]);

  const fetchWishesWall = async (targetEventId: string) => {
    try {
      const allGuests = await supabaseDb.getGuests(targetEventId);
      const withWishes = allGuests
        .filter((g) => g.wishes && g.wishes.trim().length > 0)
        .sort((a, b) => {
          const tA = parseFirestoreDate(a.updatedAt || a.createdAt)?.getTime() || 0;
          const tB = parseFirestoreDate(b.updatedAt || b.createdAt)?.getTime() || 0;
          return tB - tA;
        });
      setGuestsWithWishes(withWishes);
    } catch {
      // ignore wishes fetch error
    }
  };

  useEffect(() => {
    const fetchRSVP = async () => {
      if (!eventId || !ticketCode) return;
      try {
        const { getDoc } = await import('firebase/firestore');
        const guestsRef = collection(db, 'events', eventId, 'guests');
        const q = query(guestsRef, where('ticketCode', '==', ticketCode), limit(1));

        // Fetch Guest, Event & Wishes Wall in parallel for minimal latency
        const [snapshot, eventSnap] = await Promise.all([
          getDocs(q),
          getDoc(doc(db, 'events', eventId)),
          fetchWishesWall(eventId),
        ]);

        let currentSession = '';
        let fetchedGuest: Guest | null = null;

        if (!snapshot.empty) {
          const guestDoc = snapshot.docs[0];
          const guestData = { id: guestDoc.id, ...guestDoc.data() } as Guest;
          fetchedGuest = guestData;
          setGuest(guestData);
          setNotFound(false);
          if (guestData.rsvpStatus) {
            setRsvpChoice(guestData.rsvpStatus as 'attending' | 'pending' | 'declined');
          }
          if (guestData.wishes) setWishesInput(guestData.wishes);
          if (guestData.stickerUrl) setSelectedSticker(guestData.stickerUrl);
          if (guestData.pax && guestData.pax > 0) setPaxInput(String(Number(guestData.pax)));
          if (guestData.session) {
            setSessionInput(guestData.session);
            currentSession = guestData.session;
          }
        } else if (!initialCached) {
          setNotFound(true);
        }

        if (eventSnap.exists()) {
          const evData = { id: eventSnap.id, ...eventSnap.data() } as EventRecord;
          const pageTitle =
            evData.title ||
            (evData.coupleName ? `The Wedding Of ${evData.coupleName}` : 'Undangan Acara');
          document.title = pageTitle;

          const thumbUrl = evData.eInvitePhotoUrl || evData.thumbnailUrl || evData.frameOverlayUrl;
          if (thumbUrl) {
            const absThumb = thumbUrl.startsWith('/')
              ? `${window.location.origin}${thumbUrl}`
              : thumbUrl;
            const setMeta = (selector: string, attr: string, val: string) => {
              let el = document.querySelector(selector) as HTMLMetaElement | null;
              if (!el) {
                el = document.createElement('meta');
                if (selector.includes('property=')) {
                  el.setAttribute('property', selector.match(/property="([^"]+)"/)?.[1] || '');
                } else if (selector.includes('name=')) {
                  el.setAttribute('name', selector.match(/name="([^"]+)"/)?.[1] || '');
                }
                document.head.appendChild(el);
              }
              el.setAttribute(attr, val);
            };
            setMeta('meta[property="og:title"]', 'content', pageTitle);
            setMeta('meta[property="og:image"]', 'content', absThumb);
            setMeta('meta[name="twitter:image"]', 'content', absThumb);
          }

          setEventData(evData);
          if (evData.sessions && evData.sessions.length > 0 && !currentSession) {
            setSessionInput(evData.sessions[0]);
          }

          if (fetchedGuest) {
            writeCachedPass(eventId, ticketCode, fetchedGuest, evData);
          }
        }
      } catch (error) {
        console.warn('RSVP fetch fallback to local cache:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRSVP();

    if (!eventId) return;

    const unsubscribeRealtime = supabaseDb.subscribeToGuests(eventId, () => {
      fetchWishesWall(eventId);
    });

    const handleCompatChange = (e: any) => {
      const col = e.detail?.collectionName;
      if (!col || col === 'guests') {
        fetchWishesWall(eventId);
      }
    };

    window.addEventListener('supabase-compat-change', handleCompatChange);

    return () => {
      unsubscribeRealtime();
      window.removeEventListener('supabase-compat-change', handleCompatChange);
    };
  }, [eventId, ticketCode]);

  useEffect(() => {
    const sendHeight = () => {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'guestly-rsvp-resize', height }, '*');
    };

    sendHeight();
    const observer = new ResizeObserver(() => sendHeight());
    observer.observe(document.body);

    return () => observer.disconnect();
  }, [guest?.rsvpStatus, wishesInput, sessionInput, submitting, guestsWithWishes.length]);

  const handleScrollToRsvp = () => {
    setForceShowRsvp(true);
    setTimeout(() => {
      rsvpSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleSubmitRSVPForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guest?.id || !eventId) return;
    setSubmitting(true);
    setSubmitSuccess(false);

    const updatedPax = rsvpChoice === 'declined' ? 0 : Math.max(1, Number(paxInput) || 1);
    const cleanedWishes = wishesInput.trim();

    try {
      await updateDoc(doc(db, 'events', eventId, 'guests', guest.id), {
        rsvpStatus: rsvpChoice,
        pax: updatedPax,
        wishes: cleanedWishes,
        stickerUrl: selectedSticker || '',
        session: sessionInput,
        updatedAt: serverTimestamp(),
      });

      const nowIso = new Date().toISOString();
      const updatedGuest: Guest = {
        ...guest,
        rsvpStatus: rsvpChoice,
        pax: updatedPax,
        wishes: cleanedWishes,
        stickerUrl: selectedSticker || '',
        session: sessionInput,
        updatedAt: nowIso as any,
      };
      setGuest(updatedGuest);
      setSubmitSuccess(true);

      if (cleanedWishes.length > 0) {
        setGuestsWithWishes((prev) => {
          const rest = prev.filter((g) => g.id !== updatedGuest.id);
          return [updatedGuest, ...rest];
        });
      } else {
        setGuestsWithWishes((prev) => prev.filter((g) => g.id !== updatedGuest.id));
      }

      if (eventData && ticketCode) {
        writeCachedPass(eventId, ticketCode, updatedGuest, eventData);
      }
    } catch (error) {
      console.error('RSVP update failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPassCard = async () => {
    if (!downloadableCardRef.current || downloadingPass) return;
    setDownloadingPass(true);
    try {
      const safeGuestName = (guest?.name || ticketCode || 'Tamu').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeEventName = (eventData?.coupleName || eventData?.title || 'Undangan').replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      );
      const fileName = `E-Invitation_${safeGuestName}_${safeEventName}.png`;
      await exportCardToPng(downloadableCardRef.current, fileName);
    } catch (err) {
      console.warn('Failed to download E-Invitation card:', err);
    } finally {
      setDownloadingPass(false);
    }
  };

  if (notFound && !guest) {
    return (
      <div className="min-h-screen bg-[#FAF6F2] flex items-center justify-center px-4 font-sans text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full border border-[#E8DFD8]">
          <p className="text-lg font-bold" style={{ color: primaryColor }}>
            Undangan Tidak Ditemukan
          </p>
          <p className="text-gray-500 mt-2 text-sm">
            Tautan E-Invitation tidak valid atau data tamu telah diperbarui.
          </p>
        </div>
      </div>
    );
  }

  // QR-First Instant Fallback Guest if still loading first-time over slow connection
  const displayGuest: Partial<Guest> = guest || {
    name: loading ? 'Memuat Data Tamu...' : 'Tamu Undangan',
    ticketCode: ticketCode || 'GUEST',
  };

  const customMapsRaw = (eventData?.eInviteMapsUrl || eventData?.mapsUrl || '').trim();
  const venueSearchTarget =
    eventData?.eInviteVenueAddress ||
    eventData?.eInviteVenueName ||
    eventData?.location ||
    '';
  const mapsQueryUrl = customMapsRaw
    ? /^https?:\/\//i.test(customMapsRaw)
      ? customMapsRaw
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customMapsRaw)}`
    : venueSearchTarget
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueSearchTarget)}`
    : null;

  return (
    <div className="min-h-screen bg-[#F5EFEA] py-5 sm:py-9 px-3 sm:px-6 flex flex-col items-center justify-start font-sans overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&display=swap');
        .font-playfair { font-family: 'Playfair Display', Georgia, serif; }
      `}</style>

      <div className="w-full max-w-4xl space-y-5">
        {appUser && eventId && (
          <div className="flex items-center justify-between bg-white/90 backdrop-blur-xs border border-[#E8DFD8] rounded-2xl px-4 py-2.5 shadow-2xs">
            <Link
              to={`/auth/login/events/${eventId}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Kembali ke Detail Acara</span>
            </Link>
            <span className="text-xs text-slate-500">
              Mode Pratinjau E-Invitation &amp; RSVP ({guest?.name || ticketCode})
            </span>
          </div>
        )}

        {/* 1. LANDSCAPE E-INVITATION CARD (Matches Card 1.png + Cloudflare R2 Template) */}
        <EInvitationCard
          cardRef={downloadableCardRef}
          event={eventData}
          guest={displayGuest}
          template={activeTemplate}
          appLogoUrl={settings?.logoUrl}
          appBrandName={settings?.appName || 'Guestly'}
          appTagline="Buku Tamu Digital"
        />

        {/* 2. QUICK ACTION BAR & CHECK-IN STATUS */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-[#E8DFD8] flex flex-col lg:flex-row items-center justify-between gap-3.5">
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-2.5 gap-y-1 text-xs text-slate-600">
            {guest?.category && (
              <span className="font-semibold" style={{ color: primaryColor }}>
                Kategori: {guest.category}
              </span>
            )}
            {guest?.category && (guest?.session || sessionInput || guest?.tableNumber || guest?.attended || guest?.rsvpStatus) && (
              <span aria-hidden="true" className="text-slate-300">·</span>
            )}
            {(guest?.session || sessionInput) && (
              <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                <Clock size={12} />
                <span>{guest?.session || sessionInput}</span>
              </span>
            )}
            {guest?.tableNumber && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-semibold text-amber-800">
                  Meja: {guest.tableNumber}
                </span>
              </>
            )}
            {guest?.attended && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <CheckCircle2 size={13} />
                  <span>Sudah Check-In</span>
                </span>
              </>
            )}
            {guest?.rsvpStatus && guest.rsvpStatus !== 'pending' && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-semibold" style={{ color: primaryColor }}>
                  RSVP:{' '}
                  {guest.rsvpStatus === 'attending'
                    ? `Hadir (${guest.pax || 1} Orang)`
                    : 'Berhalangan'}
                </span>
              </>
            )}
            {!guest?.category && !guest?.session && !guest?.tableNumber && !guest?.attended && (
              <span className="text-xs text-slate-500 font-medium">
                Tunjukkan QR Code pada kartu di atas saat Check-In di lokasi acara.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 w-full lg:w-auto">
            {guest && (
              <button
                type="button"
                onClick={handleScrollToRsvp}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all hover:opacity-90 cursor-pointer"
                style={{
                  borderColor: accentColor,
                  color: primaryColor,
                  backgroundColor: guestBoxBg,
                }}
              >
                <MessageCircle size={14} />
                <span>Isi RSVP &amp; Ucapan</span>
              </button>
            )}

            {mapsQueryUrl && (
              <a
                href={mapsQueryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all hover:opacity-90"
                style={{
                  borderColor: accentColor,
                  color: primaryColor,
                  backgroundColor: '#FAF6F2',
                }}
              >
                <MapPin size={14} />
                <span>Buka Google Maps</span>
                <ExternalLink size={12} />
              </a>
            )}

            <button
              type="button"
              onClick={handleDownloadPassCard}
              disabled={downloadingPass}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-xs disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {downloadingPass ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Menyimpan Kartu...</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Simpan Kartu (PNG)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3. COUNTDOWN, RSVP CONFIRMATION FORM & WISHES WALL */}
        {showRsvpSection && guest && (
          <div ref={rsvpSectionRef} className="space-y-5 w-full scroll-mt-4">
            {/* RSVP & Wishes Card */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-[#E8DFD8]">
              {timeLeft &&
                (timeLeft.days > 0 ||
                  timeLeft.hours > 0 ||
                  timeLeft.minutes > 0 ||
                  timeLeft.seconds > 0) && (
                  <div className="mb-7 pb-6 border-b border-[#EFE6E0]">
                    <h4
                      className="text-center text-xs tracking-[0.2em] uppercase mb-3.5 font-bold"
                      style={{ color: accentColor }}
                    >
                      Menuju Hari Bahagia
                    </h4>
                    <div className="flex justify-center gap-3 sm:gap-4">
                      {[
                        { label: 'Hari', value: timeLeft.days },
                        { label: 'Jam', value: timeLeft.hours },
                        { label: 'Menit', value: timeLeft.minutes },
                        { label: 'Detik', value: timeLeft.seconds },
                      ].map((item, index) => (
                        <div key={index} className="flex flex-col items-center">
                          <div
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border flex items-center justify-center mb-1.5"
                            style={{
                              backgroundColor: guestBoxBg,
                              borderColor: accentColor,
                            }}
                          >
                            <span
                              className="text-xl sm:text-2xl font-bold font-playfair tabular-nums"
                              style={{ color: primaryColor }}
                            >
                              {item.value.toString().padStart(2, '0')}
                            </span>
                          </div>
                          <span
                            className="text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase"
                            style={{ color: primaryColor }}
                          >
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <form onSubmit={handleSubmitRSVPForm} className="space-y-5">
                <div className="text-center">
                  <h3
                    className="text-xl sm:text-2xl font-playfair font-bold"
                    style={{ color: primaryColor }}
                  >
                    Konfirmasi Kehadiran &amp; Ucapan Doa
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Mohon konfirmasi rencana kehadiran serta berikan doa restu untuk acara kami.
                  </p>
                </div>

                {/* Guest Identity Summary */}
                <div
                  className="rounded-2xl px-4 py-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  style={{
                    backgroundColor: '#FAF6F2',
                    borderColor: '#E2D5CE',
                  }}
                >
                  <div>
                    <span className="block text-[11px] text-slate-500 font-medium">
                      Tamu Undangan
                    </span>
                    <span className="text-sm sm:text-base font-bold" style={{ color: primaryColor }}>
                      {guest.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
                    <span>Tiket: {guest.ticketCode}</span>
                    {guest.category && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{guest.category}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Attendance Status Selection (Segmented Buttons) */}
                <div>
                  <label
                    className="block text-xs font-semibold mb-2"
                    style={{ color: primaryColor }}
                  >
                    Status Konfirmasi Kehadiran
                  </label>
                  <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-[#FAF6F2] border border-[#E2D5CE]">
                    {[
                      { value: 'attending' as const, label: 'Hadir' },
                      { value: 'pending' as const, label: 'Masih Ragu' },
                      { value: 'declined' as const, label: 'Berhalangan' },
                    ].map((opt) => {
                      const active = rsvpChoice === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setRsvpChoice(opt.value);
                            setSubmitSuccess(false);
                            if (opt.value !== 'declined' && (!parseInt(paxInput, 10) || parseInt(paxInput, 10) < 1)) {
                              setPaxInput('1');
                            }
                          }}
                          className="py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer"
                          style={
                            active
                              ? {
                                  backgroundColor:
                                    opt.value === 'declined' ? '#334155' : primaryColor,
                                  color: '#FFFFFF',
                                }
                              : {
                                  backgroundColor: 'transparent',
                                  color: primaryColor,
                                }
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pax & Session Row */}
                {rsvpChoice !== 'declined' && (
                  <div
                    className={`grid grid-cols-1 ${
                      eventData?.sessions && eventData.sessions.length > 0
                        ? 'sm:grid-cols-2'
                        : ''
                    } gap-4`}
                  >
                    <div className="text-left">
                      <label
                        className="block text-xs font-semibold mb-1.5"
                        style={{ color: primaryColor }}
                      >
                        Jumlah Orang yang Akan Hadir (Pax)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={999}
                          value={paxInput}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setPaxInput(val);
                            setSubmitSuccess(false);
                          }}
                          onBlur={() => {
                            const num = parseInt(paxInput, 10);
                            if (!num || num < 1) setPaxInput('1');
                          }}
                          placeholder="Contoh: 2"
                          className="w-full bg-[#FAF6F2] border border-[#E2D5CE] rounded-2xl pl-4 pr-16 py-3 text-sm font-semibold tabular-nums"
                          style={{ color: primaryColor }}
                        />
                        <span
                          className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-semibold opacity-75"
                          style={{ color: primaryColor }}
                        >
                          <Users size={13} className="mr-1" />
                          Orang
                        </span>
                      </div>
                    </div>

                    {eventData?.sessions && eventData.sessions.length > 0 && (
                      <div className="text-left">
                        <label
                          className="block text-xs font-semibold mb-1.5"
                          style={{ color: primaryColor }}
                        >
                          Sesi Kehadiran
                        </label>
                        <select
                          value={sessionInput}
                          onChange={(e) => {
                            setSessionInput(e.target.value);
                            setSubmitSuccess(false);
                          }}
                          className="w-full bg-[#FAF6F2] border border-[#E2D5CE] rounded-2xl px-4 py-3 text-sm font-medium"
                          style={{ color: primaryColor }}
                        >
                          <option value="">-- Pilih Sesi Kehadiran --</option>
                          {eventData.sessions.map((ses) => (
                            <option key={ses} value={ses}>
                              {ses}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Wishes & Doa Restu Textarea */}
                <div>
                  <label
                    className="block text-xs font-semibold mb-1.5"
                    style={{ color: primaryColor }}
                  >
                    Ucapan &amp; Doa Restu
                  </label>
                  <div className="relative border border-[#E2D5CE] rounded-2xl overflow-hidden bg-[#FAF6F2]">
                    <div className="p-3.5">
                      <textarea
                        value={wishesInput}
                        onChange={(e) => {
                          setWishesInput(e.target.value);
                          setSubmitSuccess(false);
                        }}
                        className="w-full bg-transparent border-none p-0 focus:ring-0 focus:outline-none text-sm text-slate-800 resize-none h-24 placeholder:text-slate-400"
                        placeholder="Tuliskan ucapan selamat dan doa restu Anda untuk mempelai / penyelenggara acara..."
                      />
                    </div>
                  </div>
                </div>

                {/* Sticker / Reaction Selector */}
                <div>
                  <label
                    className="block text-xs font-semibold mb-2"
                    style={{ color: primaryColor }}
                  >
                    Pilih Stiker Ucapan (Opsional)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {STICKERS.map((sticker, idx) => {
                      const isPicked = selectedSticker === sticker;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedSticker(isPicked ? '' : sticker);
                            setSubmitSuccess(false);
                          }}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform cursor-pointer border ${
                            isPicked
                              ? 'scale-110 shadow-xs'
                              : 'bg-[#FAF6F2] border-[#E2D5CE] opacity-75 hover:opacity-100'
                          }`}
                          style={
                            isPicked
                              ? {
                                  backgroundColor: guestBoxBg,
                                  borderColor: accentColor,
                                }
                              : undefined
                          }
                        >
                          {sticker}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Submit Button & Confirmation Feedback */}
                <div className="pt-1 space-y-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 px-5 rounded-2xl font-semibold transition-all duration-200 text-sm text-white cursor-pointer shadow-xs flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Menyimpan Konfirmasi...</span>
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        <span>
                          {guest.rsvpStatus && guest.rsvpStatus !== 'pending'
                            ? 'Perbarui Konfirmasi & Ucapan'
                            : 'Kirim Konfirmasi & Ucapan'}
                        </span>
                      </>
                    )}
                  </button>

                  {submitSuccess && (
                    <div
                      className="text-center text-xs sm:text-sm font-semibold p-3.5 rounded-2xl border flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: guestBoxBg,
                        color: primaryColor,
                        borderColor: accentColor,
                      }}
                    >
                      <CheckCircle2 size={16} className="shrink-0" />
                      <span>
                        Terima kasih! Konfirmasi kehadiran dan ucapan doa Anda telah tersimpan.
                      </span>
                    </div>
                  )}

                  {!submitSuccess && guest.rsvpStatus && guest.rsvpStatus !== 'pending' && (
                    <div className="text-center text-xs text-slate-600 pt-1">
                      Status tercatat saat ini:{' '}
                      <strong style={{ color: primaryColor }}>
                        {guest.rsvpStatus === 'attending'
                          ? `Hadir (${guest.pax || 1} Orang)`
                          : 'Berhalangan Hadir'}
                      </strong>
                    </div>
                  )}
                </div>
              </form>

              {/* Footer Signature */}
              <div className="mt-7 text-center border-t border-[#EFE6E0] pt-5">
                <p className="text-xs text-slate-500 italic">Kami yang berbahagia,</p>
                <h4
                  className="text-lg font-playfair font-bold mt-0.5"
                  style={{ color: primaryColor }}
                >
                  {eventData?.coupleName || eventData?.title || 'Mempelai & Keluarga'}
                </h4>
                <div
                  className="flex justify-center mt-2 opacity-60"
                  style={{ color: accentColor }}
                >
                  <Heart size={12} fill="currentColor" />
                </div>
              </div>
            </div>

            {/* 4. LIVE WISHES WALL (Dinding Ucapan & Doa Tamu) */}
            {guestsWithWishes.length > 0 && (
              <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-[#E8DFD8]">
                <div className="flex items-center justify-between border-b border-[#EFE6E0] pb-4 mb-5">
                  <div>
                    <h3
                      className="text-lg sm:text-xl font-playfair font-bold"
                      style={{ color: primaryColor }}
                    >
                      Ucapan &amp; Doa Restu
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Doa dan harapan terbaik dari para tamu undangan
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold tabular-nums"
                    style={{ color: primaryColor }}
                  >
                    {guestsWithWishes.length} Ucapan
                  </span>
                </div>

                <div className="divide-y divide-[#EFE6E0] max-h-[480px] overflow-y-auto pr-1">
                  {guestsWithWishes.map((wGuest, idx) => {
                    const wishDate = parseFirestoreDate(wGuest.updatedAt || wGuest.createdAt);
                    const statusLabel =
                      wGuest.rsvpStatus === 'attending'
                        ? `Hadir · ${wGuest.pax || 1} Orang`
                        : wGuest.rsvpStatus === 'declined'
                        ? 'Berhalangan'
                        : 'Masih Ragu';

                    return (
                      <div key={wGuest.id || idx} className="py-4 first:pt-0 last:pb-0 flex items-start gap-3.5">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border"
                          style={{
                            backgroundColor: guestBoxBg,
                            color: primaryColor,
                            borderColor: accentColor,
                          }}
                        >
                          {(wGuest.name || 'T').charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h4
                                className="text-sm font-bold truncate"
                                style={{ color: primaryColor }}
                              >
                                {wGuest.name}
                              </h4>
                              {wGuest.stickerUrl && (
                                <span className="text-base leading-none">{wGuest.stickerUrl}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span
                                className="font-semibold"
                                style={{
                                  color:
                                    wGuest.rsvpStatus === 'attending'
                                      ? primaryColor
                                      : wGuest.rsvpStatus === 'declined'
                                      ? '#64748B'
                                      : '#B45309',
                                }}
                              >
                                {statusLabel}
                              </span>
                              {wishDate && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {wishDate.toLocaleDateString('id-ID', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {wGuest.wishes && (
                            <p className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                              {wGuest.wishes}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. FOOTER: Created and Supported by (Logo Guestly) */}
        <footer className="pt-3 pb-4 flex flex-col items-center justify-center gap-1.5 text-center select-none">
          <span className="text-[11px] font-medium tracking-wide text-slate-500">
            Created and Supported by
          </span>
          {resolvedFooterLogo ? (
            <img
              src={resolvedFooterLogo}
              alt="Guestly"
              onError={() => setFooterLogoIdx((prev) => prev + 1)}
              className="h-6 max-w-[110px] w-auto object-contain opacity-90"
            />
          ) : (
            <div className="inline-flex items-center gap-1.5">
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                style={{ backgroundColor: primaryColor }}
              >
                G
              </span>
              <span
                className="text-xs font-bold tracking-tight"
                style={{ color: primaryColor }}
              >
                Guestly
              </span>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

