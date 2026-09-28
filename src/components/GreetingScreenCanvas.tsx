import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Heart,
  Check,
  Calendar,
  Clock,
  MapPin,
  QrCode,
  Crown,
  Armchair,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EventRecord, Guest, GreetingScreenTemplate } from '../types';
import { getMediaFallbackUrls } from '../lib/utils';
import { autoRemoveImageBackground } from '../lib/autoRemoveBg';
import { formatIndonesianEventDate, splitCoupleNames } from './EInvitationCard';
import {
  DEFAULT_GREETING_COUPLE_BG_URL,
  DEFAULT_GREETING_STAGE_CLEAN_BG_URL,
} from '../services/greetingTemplateService';
import { useSettings } from '../SettingsContext';
import { useAuth } from '../AuthContext';

export interface GreetingScreenCanvasProps {
  event?: Partial<EventRecord> | null;
  guest?: Partial<Guest> | null;
  template?: Partial<GreetingScreenTemplate> | null;
  mode?: 'welcome' | 'standby';
  appLogoUrl?: string | null;
  appFaviconUrl?: string | null;
  appBrandName?: string | null;
  appTagline?: string | null;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  fixedWidthPx?: number;
  fullscreen?: boolean;
  className?: string;
}

function toTitleCaseIndonesianDate(raw: string): string {
  if (!raw) return '11 Oktober 2026';
  return raw
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function getInitialGuestFontSize(name: string, hasBadges: boolean): number {
  const len = (name || '').trim().length;
  const maxBase = hasBadges ? 34 : 42;
  if (len <= 16) return maxBase;
  if (len <= 24) return Math.min(maxBase, 36);
  if (len <= 32) return Math.min(maxBase, 30);
  if (len <= 44) return 25;
  if (len <= 60) return 21;
  return 18;
}

export const GreetingScreenCanvas: React.FC<GreetingScreenCanvasProps> = ({
  event,
  guest,
  template,
  mode = 'welcome',
  appLogoUrl,
  appFaviconUrl,
  appBrandName,
  appTagline,
  cardRef,
  fixedWidthPx,
  fullscreen = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const guestNameRef = useRef<HTMLHeadingElement | null>(null);
  const [scale, setScale] = useState(() =>
    fixedWidthPx && fixedWidthPx > 0 ? fixedWidthPx / 1200 : 1
  );
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 675,
  });

  const { settings } = useSettings();
  const { appUser } = useAuth();
  const [partnerLogoUrl, setPartnerLogoUrl] = useState<string | null>(null);
  const [logoIdx, setLogoIdx] = useState(0);
  const [emblemIdx, setEmblemIdx] = useState(0);
  const [templateIdx, setTemplateIdx] = useState(0);
  const [couplePhotoIdx, setCouplePhotoIdx] = useState(0);
  const [processedCouplePhotoUrl, setProcessedCouplePhotoUrl] = useState<string>('');

  const guestName = (guest?.name || 'Iklas Padli').trim();
  const guestCategory = (guest?.category || '').trim();
  const guestTable = (guest?.tableNumber || (guest as any)?.seat || '').trim();
  const hasGuestBadges = Boolean(guestCategory || guestTable);

  const [guestFontSizePx, setGuestFontSizePx] = useState<number>(() =>
    getInitialGuestFontSize(guestName, hasGuestBadges)
  );

  useEffect(() => {
    setLogoIdx(0);
  }, [appLogoUrl, settings?.logoUrl, partnerLogoUrl, appUser?.logoUrl]);

  useEffect(() => {
    setEmblemIdx(0);
  }, [appFaviconUrl, settings?.faviconUrl, settings?.logoUrl]);

  useEffect(() => {
    setTemplateIdx(0);
  }, [template?.imageUrl, event?.greetingTemplateUrl, event?.frameOverlayUrl]);

  useEffect(() => {
    setCouplePhotoIdx(0);
  }, [
    event?.greetingCouplePhotoUrl,
    template?.couplePhotoUrl,
    event?.thumbnailUrl,
    event?.eInvitePhotoUrl,
    event?.greetingUseThumbnailFallback,
  ]);

  // Auto-fit Guest Name so it NEVER exceeds the blush pill box boundary
  useLayoutEffect(() => {
    if (mode !== 'welcome') return;
    const el = guestNameRef.current;
    const startSize = getInitialGuestFontSize(guestName, hasGuestBadges);
    if (!el) {
      setGuestFontSizePx(startSize);
      return;
    }

    const maxAllowedWidth = 446; // 490px box width minus 44px horizontal padding
    const maxAllowedHeight = hasGuestBadges ? 48 : 68; // 84px box height minus vertical padding & badge row

    let currentSize = startSize;
    el.style.fontSize = `${currentSize}px`;

    while (
      currentSize > 15 &&
      (el.scrollHeight > maxAllowedHeight || el.scrollWidth > maxAllowedWidth)
    ) {
      currentSize -= 1;
      el.style.fontSize = `${currentSize}px`;
    }

    setGuestFontSizePx(currentSize);
  }, [guestName, hasGuestBadges, mode]);

  useEffect(() => {
    const targetPartnerId = event?.partnerId;
    if (!targetPartnerId || targetPartnerId === 'default-partner') {
      setPartnerLogoUrl(null);
      return;
    }
    if (
      appUser &&
      (appUser.id === targetPartnerId || appUser.partnerId === targetPartnerId) &&
      appUser.logoUrl
    ) {
      setPartnerLogoUrl(appUser.logoUrl);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'users', targetPartnerId))
      .then((snap) => {
        if (!cancelled && snap.exists()) {
          const d = snap.data();
          if (d?.logoUrl || d?.brandLogo) {
            setPartnerLogoUrl(d.logoUrl || d.brandLogo);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [event?.partnerId, appUser]);

  useEffect(() => {
    if (fullscreen) {
      const updateFullscreenScale = () => {
        const vw = window.innerWidth || 1200;
        const vh = window.innerHeight || 675;
        setViewportSize({ w: vw, h: vh });
        setScale(Math.max(vw / 1200, vh / 675));
      };
      updateFullscreenScale();
      window.addEventListener('resize', updateFullscreenScale);
      return () => window.removeEventListener('resize', updateFullscreenScale);
    }

    if (fixedWidthPx && fixedWidthPx > 0) {
      setScale(fixedWidthPx / 1200);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const updateScale = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setScale(w / 1200);
      }
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedWidthPx, fullscreen]);

  const primaryColor = template?.primaryColor || event?.primaryColor || '#12392F';
  const accentColor = template?.accentColor || '#C98583';
  const coupleNameColor = template?.coupleNameColor || '#9B6B34';
  const guestBoxBg = template?.guestBoxBg || '#F2E2DC';
  const footerColor = template?.footerColor || '#C48481';

  // Mandatory Guestly Logo Badge at the top of Layar Sapa
  const showLogo = true;
  const showFooterStrip =
    event?.greetingShowFooterStrip !== undefined
      ? event.greetingShowFooterStrip
      : template?.showFooterStrip !== false;

  const useThumbnailFallback = event?.greetingUseThumbnailFallback !== false;
  const autoRemoveBgEnabled = event?.greetingAutoRemoveBg !== false;

  // Couple Photo Fallback Chain:
  // 1. Custom Layar Sapa Couple Photo (event.greetingCouplePhotoUrl)
  // 2. Template Couple Photo (template.couplePhotoUrl)
  // 3. Fallback to Event Thumbnail (event.thumbnailUrl) or E-Invitation Photo (event.eInvitePhotoUrl)
  const couplePhotoCandidates = getMediaFallbackUrls([
    event?.greetingCouplePhotoUrl,
    template?.couplePhotoUrl,
    ...(useThumbnailFallback ? [event?.thumbnailUrl, event?.eInvitePhotoUrl] : []),
  ]);
  const rawCouplePhotoUrl =
    couplePhotoIdx < couplePhotoCandidates.length
      ? couplePhotoCandidates[couplePhotoIdx]
      : '';

  // Run Automatic Background Removal on the active Couple Photo / Thumbnail Fallback
  useEffect(() => {
    if (!rawCouplePhotoUrl) {
      setProcessedCouplePhotoUrl('');
      return;
    }
    if (!autoRemoveBgEnabled) {
      setProcessedCouplePhotoUrl(rawCouplePhotoUrl);
      return;
    }

    let cancelled = false;
    setProcessedCouplePhotoUrl(rawCouplePhotoUrl);

    autoRemoveImageBackground(rawCouplePhotoUrl)
      .then((cutoutUrl) => {
        if (!cancelled && cutoutUrl) {
          setProcessedCouplePhotoUrl(cutoutUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProcessedCouplePhotoUrl(rawCouplePhotoUrl);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rawCouplePhotoUrl, autoRemoveBgEnabled]);

  // Background candidates:
  // When a custom Couple Photo or Event Thumbnail fallback is active, if the template was using
  // the default background with the built-in couple, automatically switch to the clean stage background
  // so the user's couple photo / thumbnail stands in front of the floral arch without overlapping another couple.
  const defaultStageBgForCurrentMode = rawCouplePhotoUrl
    ? DEFAULT_GREETING_STAGE_CLEAN_BG_URL
    : DEFAULT_GREETING_COUPLE_BG_URL;

  const rawBgCandidates = getMediaFallbackUrls([
    event?.greetingTemplateUrl,
    event?.frameOverlayUrl,
    template?.imageUrl,
  ]).map((url) =>
    rawCouplePhotoUrl && url === DEFAULT_GREETING_COUPLE_BG_URL
      ? DEFAULT_GREETING_STAGE_CLEAN_BG_URL
      : url
  );

  const bgCandidates = [...rawBgCandidates, defaultStageBgForCurrentMode];
  const backgroundImageUrl =
    templateIdx < bgCandidates.length
      ? bgCandidates[templateIdx]
      : defaultStageBgForCurrentMode;

  const displayCouplePhotoUrl = processedCouplePhotoUrl || rawCouplePhotoUrl;

  // Salutation above Guest Box ("BAPAK/IBU")
  const rawSalutation = (event?.greetingWelcomeSubtext || '').trim();
  const salutationText =
    !rawSalutation || rawSalutation === 'Selamat Datang, Bapak/Ibu/Saudara/i:'
      ? 'BAPAK/IBU'
      : rawSalutation.toUpperCase();

  // Sub-header above Couple Script Name ("DI ACARA PERNIKAHAN")
  const rawHeader = (event?.greetingHeaderText || '').trim();
  const eventSubheaderText =
    !rawHeader || rawHeader === 'WELCOME TO THE WEDDING OF'
      ? 'DI ACARA PERNIKAHAN'
      : rawHeader.toUpperCase();

  const { groom, bride } = splitCoupleNames(
    event?.coupleName,
    event?.greetingGroomName || event?.eInviteGroomName,
    event?.greetingBrideName || event?.eInviteBrideName,
    event?.title
  );

  const displayGroom =
    groom === 'Laras' && bride === 'Huda' && !event?.coupleName ? 'Fredi' : groom;
  const displayBride =
    groom === 'Laras' && bride === 'Huda' && !event?.coupleName ? 'Lony' : bride;
  const coupleDisplay = displayBride
    ? `${displayGroom} & ${displayBride}`
    : displayGroom;
  const coupleLen = coupleDisplay.length;
  const coupleScriptSizeClass =
    coupleLen > 30
      ? 'text-[42px] leading-[1.1]'
      : coupleLen > 22
      ? 'text-[50px] leading-[1.08]'
      : coupleLen > 15
      ? 'text-[58px] leading-[1.05]'
      : 'text-[66px] leading-[1.04]';

  // Date, Time & Venue parsing (Matching welcome.png 3-column metadata bar)
  const { dayName, dateText } = formatIndonesianEventDate(
    event?.date || '2026-10-11'
  );
  const dayTitle = toTitleCaseIndonesianDate(dayName || 'Minggu');
  const dateTitle = toTitleCaseIndonesianDate(dateText || '11 Oktober 2026');

  const rawMasterTime = (
    event?.time?.trim() ||
    event?.greetingTimeText?.trim() ||
    guest?.session?.trim() ||
    '10.00 WIB'
  ).replace(/^(\d{1,2}):(\d{2})$/, '$1.$2');
  const timeText = /wib|wita|wit/i.test(rawMasterTime)
    ? rawMasterTime
    : `${rawMasterTime} WIB`;

  const venueTitle =
    event?.location?.split(',')[0]?.trim() ||
    event?.greetingVenueTitle?.trim() ||
    event?.eInviteVenueName?.trim() ||
    'Gedung Graha Mulia';

  const venueSubtitle =
    event?.eInviteVenueAddress?.trim() ||
    event?.greetingVenueSubtitle?.trim() ||
    (event?.location && event.location.includes(',')
      ? event.location.split(',').slice(1).join(',').trim()
      : 'Semarang, Jawa Tengah');

  const checkInBadgeText =
    event?.greetingCheckInText?.trim() || 'CHECK-IN BERHASIL';

  // Footer text formatting ("Terima kasih atas kehadiran / dan doa restunya.")
  const rawFooter = (
    event?.greetingFooterText ||
    event?.eInviteFooterText ||
    ''
  ).trim();
  const isDefaultUpperFooter =
    !rawFooter || rawFooter.toUpperCase() === 'ATAS KEHADIRAN DAN DOA RESTUNYA';

  const brandName = appBrandName || 'Guestly';
  const tagline = appTagline || 'Buku Tamu Digital';
  const logoCandidates = getMediaFallbackUrls([
    appLogoUrl,
    settings?.logoUrl,
    partnerLogoUrl,
    appUser?.logoUrl,
  ]);
  const resolvedLogoUrl =
    logoIdx < logoCandidates.length ? logoCandidates[logoIdx] : '';

  const domFaviconHref =
    typeof document !== 'undefined'
      ? (document.querySelector("link[rel~='icon']") as HTMLLinkElement | null)
          ?.href || ''
      : '';
  const validDomFavicon =
    domFaviconHref && !domFaviconHref.endsWith('/favicon.ico')
      ? domFaviconHref
      : '';

  const emblemCandidates = getMediaFallbackUrls([
    appFaviconUrl,
    settings?.faviconUrl,
    validDomFavicon,
    settings?.logoUrl,
    resolvedLogoUrl,
  ]);
  const resolvedEmblemUrl =
    emblemIdx < emblemCandidates.length ? emblemCandidates[emblemIdx] : '';

  const isCustomFooterColor =
    footerColor.toUpperCase() !== '#C48481' &&
    footerColor.toUpperCase() !== '#C27D7A';

  return (
    <div
      ref={containerRef}
      className={`${
        fullscreen
          ? 'fixed inset-0 w-screen h-screen flex items-center justify-center bg-[#FAF4EE] overflow-hidden'
          : `${fixedWidthPx ? '' : 'w-full'} relative overflow-hidden rounded-[18px] sm:rounded-[26px] shadow-[0_14px_40px_-10px_rgba(0,0,0,0.14)] border border-[#E8DFD8] bg-[#FAF4EE]`
      } ${className}`}
      style={
        fullscreen
          ? undefined
          : {
              ...(fixedWidthPx ? { width: `${fixedWidthPx}px` } : {}),
              height: `${Math.round(675 * scale)}px`,
            }
      }
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        .greeting-serif { font-family: 'Playfair Display', Georgia, serif; }
        .greeting-script { font-family: 'Great Vibes', cursive; }
      `}</style>

      {/* Fixed 1200x675 (16:9) Precision Canvas */}
      <div
        ref={cardRef}
        data-export-width="1200"
        data-export-height="675"
        className="relative bg-[#FAF4EE] text-center select-none overflow-hidden"
        style={
          fullscreen
            ? {
                width: '1200px',
                height: '675px',
                transform: `scale(${Math.min(
                  viewportSize.w / 1200,
                  viewportSize.h / 675
                )})`,
                transformOrigin: 'center center',
              }
            : {
                width: '1200px',
                height: '675px',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }
        }
      >
        {/* ================================================================= */}
        {/* LAYER 1: 16:9 Stage & Couple Background (welcome.png style)        */}
        {/* ================================================================= */}
        {backgroundImageUrl && (
          <img
            src={backgroundImageUrl}
            data-export-role="template-bg"
            alt={template?.name || 'Background Layar Sapa'}
            referrerPolicy="no-referrer"
            onError={() => setTemplateIdx((prev) => prev + 1)}
            className="absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none"
          />
        )}

        {/* ================================================================= */}
        {/* LAYER 2: Couple Photo / Thumbnail Fallback (FRAMELESS + Auto Remove BG) */}
        {/* ================================================================= */}
        {displayCouplePhotoUrl && (
          <div
            className="absolute left-[18px] bottom-[98px] w-[425px] h-[525px] z-[2] pointer-events-none flex items-end justify-center overflow-hidden"
            style={{
              WebkitMaskImage:
                'radial-gradient(ellipse 94% 96% at 50% 56%, #000 78%, rgba(0,0,0,0.68) 90%, transparent 100%)',
              maskImage:
                'radial-gradient(ellipse 94% 96% at 50% 56%, #000 78%, rgba(0,0,0,0.68) 90%, transparent 100%)',
            }}
          >
            <img
              src={displayCouplePhotoUrl}
              alt={coupleDisplay}
              referrerPolicy="no-referrer"
              onError={() => setCouplePhotoIdx((prev) => prev + 1)}
              className="w-full h-full object-contain object-bottom"
            />
          </div>
        )}

        {/* ================================================================= */}
        {/* LAYER 3: Optional Guestly / Partner Brand Pill                     */}
        {/* ================================================================= */}
        {showLogo && (
          <div className="absolute top-[12px] left-[465px] right-[65px] z-[4] flex justify-center pointer-events-none">
            <div
              data-logo-box="true"
              className="px-4 py-1 rounded-full bg-white/75 backdrop-blur-md border border-[#EEDAD4] shadow-[0_2px_12px_rgba(183,131,122,0.1)] flex items-center justify-center gap-2"
            >
              {resolvedLogoUrl ? (
                <img
                  src={resolvedLogoUrl}
                  alt={brandName}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoIdx((prev) => prev + 1)}
                  className="h-[24px] max-w-[150px] w-auto object-contain"
                />
              ) : (
                <div className="flex items-center justify-center gap-2">
                  {resolvedEmblemUrl ? (
                    <img
                      src={resolvedEmblemUrl}
                      alt={brandName}
                      referrerPolicy="no-referrer"
                      onError={() => setEmblemIdx((prev) => prev + 1)}
                      className="w-4 h-4 object-contain shrink-0"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#FF4B7D] to-[#E02B5A] flex items-center justify-center text-white shrink-0">
                      <Heart size={10} fill="currentColor" />
                    </div>
                  )}
                  <span className="text-[12px] font-extrabold tracking-tight text-[#E92E63]">
                    {brandName}
                  </span>
                  <span className="text-[10px] font-semibold text-[#475569]">
                    • {tagline}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* LAYER 4: Right-Side Greeting Content (Strict Non-Overflow Bounds) */}
        {/* ================================================================= */}
        <div
          className={`absolute left-[465px] right-[65px] ${
            showLogo ? 'top-[48px]' : 'top-[38px]'
          } bottom-[106px] z-[3] flex flex-col items-center justify-between py-1 overflow-hidden`}
        >
          {/* 1. SELAMAT DATANG + Ornamental Heart Divider */}
          <div className="flex flex-col items-center shrink-0">
            <h1
              className="greeting-serif text-[42px] leading-none font-normal tracking-[0.12em] uppercase"
              style={{ color: primaryColor }}
            >
              SELAMAT DATANG
            </h1>
            <div className="flex items-center justify-center gap-3 mt-2">
              <span
                className="h-[1px] w-[68px] opacity-65"
                style={{ backgroundColor: accentColor }}
              />
              <Heart
                size={13}
                fill={accentColor}
                style={{ color: accentColor }}
              />
              <span
                className="h-[1px] w-[68px] opacity-65"
                style={{ backgroundColor: accentColor }}
              />
            </div>
          </div>

          {/* 2. BAPAK/IBU + Strict Fixed-Boundary Rounded Blush Guest Name Box */}
          <div className="flex flex-col items-center w-full shrink-0">
            <p className="text-[13.5px] font-medium tracking-[0.28em] uppercase text-[#2A2A2A] mb-1.5 truncate max-w-[490px]">
              {mode === 'welcome' ? salutationText : 'SELAMAT DATANG DI ACARA'}
            </p>

            <div
              className="w-[490px] max-w-full h-[84px] px-[22px] py-[8px] rounded-[20px] flex flex-col items-center justify-center overflow-hidden shadow-[0_6px_24px_rgba(175,125,115,0.08)]"
              style={{ backgroundColor: guestBoxBg }}
            >
              {mode === 'welcome' ? (
                <>
                  <h2
                    ref={guestNameRef}
                    style={{
                      fontSize: `${guestFontSizePx}px`,
                      lineHeight: guestFontSizePx <= 24 ? '1.16' : '1.1',
                    }}
                    className="greeting-serif font-normal text-[#3A251D] tracking-wide w-full max-w-full overflow-hidden text-ellipsis line-clamp-2 break-words"
                  >
                    {guestName}
                  </h2>
                  {hasGuestBadges && (
                    <div className="flex items-center justify-center gap-2 mt-1 shrink-0 max-w-full overflow-hidden">
                      {guestCategory && (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/85 border truncate max-w-[200px]"
                          style={{ color: primaryColor, borderColor: accentColor }}
                        >
                          <Crown size={10} className="shrink-0" style={{ color: accentColor }} />
                          <span className="truncate">{guestCategory}</span>
                        </span>
                      )}
                      {guestTable && (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/85 border truncate max-w-[200px]"
                          style={{ color: primaryColor, borderColor: accentColor }}
                        >
                          <Armchair size={10} className="shrink-0" style={{ color: accentColor }} />
                          <span className="truncate">{guestTable}</span>
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <h2 className="greeting-serif text-[28px] leading-tight font-normal text-[#3A251D] tracking-wide truncate max-w-full">
                  Silakan Scan QR Undangan
                </h2>
              )}
            </div>
          </div>

          {/* 3. DI ACARA PERNIKAHAN + Couple Calligraphy Script Name */}
          <div className="flex flex-col items-center max-w-full shrink-0">
            <p className="text-[13px] font-medium tracking-[0.26em] uppercase text-[#2A2A2A] truncate max-w-[490px]">
              {eventSubheaderText}
            </p>
            <div
              className={`greeting-script ${coupleScriptSizeClass} font-normal mt-0.5 px-4 select-none max-w-[540px] truncate`}
              style={{ color: coupleNameColor }}
            >
              {coupleDisplay}
            </div>
          </div>

          {/* 4. CHECK-IN BERHASIL Pill Badge */}
          <div className="shrink-0">
            {mode === 'welcome' ? (
              <div className="inline-flex items-center gap-3 pl-2 pr-6 py-1.5 rounded-full bg-[#E3EDE2] border border-[#D2E2D0] shadow-2xs max-w-[480px]">
                <span
                  className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Check size={20} strokeWidth={2.8} />
                </span>
                <span
                  className="text-[16.5px] font-bold tracking-[0.06em] uppercase truncate"
                  style={{ color: primaryColor }}
                >
                  {checkInBadgeText}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-3 pl-2 pr-6 py-1.5 rounded-full bg-[#EFE5DF] border border-[#E2D0C7] shadow-2xs max-w-[480px]">
                <span
                  className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  <QrCode size={18} />
                </span>
                <span
                  className="text-[15px] font-bold tracking-[0.08em] uppercase truncate"
                  style={{ color: primaryColor }}
                >
                  MENUNGGU CHECK-IN TAMU
                </span>
              </div>
            )}
          </div>

          {/* 5. 3-Column Event Metadata Bar (Date | Time | Location) */}
          <div className="flex items-center justify-center gap-4 pt-0.5 max-w-full shrink-0">
            {/* Column 1: Date */}
            <div className="flex items-center gap-2 text-left shrink-0">
              <div className="w-[34px] h-[34px] rounded-full bg-[#F4D9D6] flex items-center justify-center text-[#B66764] shrink-0">
                <Calendar size={16} strokeWidth={2.2} />
              </div>
              <div className="leading-tight">
                <div className="text-[12px] text-[#3A3A3A] font-normal">
                  {dayTitle}
                </div>
                <div className="text-[13.5px] text-[#1A1A1A] font-bold whitespace-nowrap">
                  {dateTitle}
                </div>
              </div>
            </div>

            <span className="h-[32px] w-[1px] bg-[#C9BBB4] shrink-0" />

            {/* Column 2: Time */}
            <div className="flex items-center gap-2 text-left shrink-0">
              <div className="w-[34px] h-[34px] rounded-full bg-[#F4D9D6] flex items-center justify-center text-[#B66764] shrink-0">
                <Clock size={16} strokeWidth={2.2} />
              </div>
              <div className="leading-tight">
                <div className="text-[12px] text-[#3A3A3A] font-normal">
                  Pukul
                </div>
                <div className="text-[13.5px] text-[#1A1A1A] font-bold whitespace-nowrap">
                  {timeText}
                </div>
              </div>
            </div>

            <span className="h-[32px] w-[1px] bg-[#C9BBB4] shrink-0" />

            {/* Column 3: Venue */}
            <div className="flex items-center gap-2 text-left min-w-0 max-w-[205px]">
              <div className="w-[34px] h-[34px] rounded-full bg-[#F4D9D6] flex items-center justify-center text-[#B66764] shrink-0">
                <MapPin size={16} strokeWidth={2.2} />
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-[13.5px] text-[#1A1A1A] font-bold truncate">
                  {venueTitle}
                </div>
                <div className="text-[12px] text-[#3A3A3A] font-normal truncate">
                  {venueSubtitle}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* LAYER 5: Bottom Footer Bar ("Terima kasih atas kehadiran...")     */}
        {/* ================================================================= */}
        {showFooterStrip && (
          <div
            className="absolute bottom-0 left-0 right-0 h-[98px] z-[3] flex flex-col items-center justify-center text-center pointer-events-none"
            style={{
              backgroundColor:
                (backgroundImageUrl === DEFAULT_GREETING_COUPLE_BG_URL ||
                  backgroundImageUrl === DEFAULT_GREETING_STAGE_CLEAN_BG_URL) &&
                !isCustomFooterColor
                  ? 'transparent'
                  : footerColor,
            }}
          >
            {isDefaultUpperFooter ? (
              <>
                <p className="greeting-serif text-[17.5px] tracking-[0.22em] text-white/95 leading-snug">
                  Terima kasih atas kehadiran
                </p>
                <p className="greeting-serif text-[17.5px] tracking-[0.22em] text-white/95 leading-snug mt-0.5">
                  dan doa restunya.
                </p>
              </>
            ) : (
              <p className="greeting-serif text-[18px] tracking-[0.2em] text-white/95 leading-snug max-w-[680px] px-4 truncate">
                {rawFooter}
              </p>
            )}

            <div className="flex items-center justify-center gap-3 mt-2">
              <span className="h-[1px] w-[105px] bg-white/80" />
              <Heart size={14} fill="#FFFFFF" className="text-white" />
              <span className="h-[1px] w-[105px] bg-white/80" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
