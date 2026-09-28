import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Calendar, MapPin, Heart } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EventRecord, Guest, EInviteTemplate } from '../types';
import { parseFirestoreDate, getMediaFallbackUrls } from '../lib/utils';
import { useSettings } from '../SettingsContext';
import { useAuth } from '../AuthContext';

const INDONESIAN_DAYS = [
  'MINGGU',
  'SENIN',
  'SELASA',
  'RABU',
  'KAMIS',
  'JUMAT',
  'SABTU',
];

const INDONESIAN_MONTHS = [
  'JANUARI',
  'FEBRUARI',
  'MARET',
  'APRIL',
  'MEI',
  'JUNI',
  'JULI',
  'AGUSTUS',
  'SEPTEMBER',
  'OKTOBER',
  'NOVEMBER',
  'DESEMBER',
];

export function formatIndonesianEventDate(dateInput?: any): {
  dayName: string;
  dateText: string;
} {
  if (!dateInput) {
    return { dayName: 'MINGGU', dateText: '15 DESEMBER 2026' };
  }
  const parsed = parseFirestoreDate(dateInput);
  if (parsed && !isNaN(parsed.getTime())) {
    const dayName = INDONESIAN_DAYS[parsed.getDay()] || '';
    const d = parsed.getDate();
    const m = INDONESIAN_MONTHS[parsed.getMonth()] || '';
    const y = parsed.getFullYear();
    return { dayName, dateText: `${d} ${m} ${y}` };
  }
  const rawStr = String(dateInput).trim();
  const parts = rawStr.split(/[-/]/);
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10) > 31 ? parseInt(parts[0], 10) : parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[0], 10) > 31 ? parseInt(parts[2], 10) : parseInt(parts[0], 10);
    const dt = new Date(y, m, d);
    if (!isNaN(dt.getTime())) {
      return {
        dayName: INDONESIAN_DAYS[dt.getDay()] || '',
        dateText: `${dt.getDate()} ${INDONESIAN_MONTHS[dt.getMonth()] || ''} ${dt.getFullYear()}`,
      };
    }
  }
  return { dayName: '', dateText: rawStr.toUpperCase() };
}

export function splitCoupleNames(
  coupleName?: string,
  groomOverride?: string,
  brideOverride?: string,
  fallbackTitle?: string
): { groom: string; bride: string } {
  const source = (coupleName || '').trim();
  if (source) {
    const parts = source.split(/\s*(?:&|\bdan\b|\band\b|\+)\s*/i);
    if (parts.length >= 2) {
      return {
        groom: parts[0].trim(),
        bride: parts.slice(1).join(' & ').trim(),
      };
    }
  }
  if (groomOverride?.trim() || brideOverride?.trim()) {
    return {
      groom: (groomOverride || '').trim() || 'Mempelai Pria',
      bride: (brideOverride || '').trim() || 'Mempelai Wanita',
    };
  }
  if (source) {
    return { groom: source, bride: '' };
  }
  const cleanTitle = (fallbackTitle || 'Rizky & Aulia')
    .replace(/^(the\s+wedding\s+of|resepsi\s+pernikahan|pernikahan|undangan)\s+/i, '')
    .trim();
  const titleParts = cleanTitle.split(/\s*(?:&|\bdan\b|\band\b|\+)\s*/i);
  if (titleParts.length >= 2) {
    return {
      groom: titleParts[0].trim(),
      bride: titleParts.slice(1).join(' & ').trim(),
    };
  }
  return { groom: cleanTitle || 'Rizky', bride: '' };
}

export interface EInvitationCardProps {
  event?: Partial<EventRecord> | null;
  guest?: Partial<Guest> | null;
  template?: Partial<EInviteTemplate> | null;
  appLogoUrl?: string | null;
  appFaviconUrl?: string | null;
  appBrandName?: string | null;
  appTagline?: string | null;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  fixedWidthPx?: number;
  className?: string;
}

const DEFAULT_COUPLE_PHOTO =
  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=900&q=80';

export const EInvitationCard: React.FC<EInvitationCardProps> = ({
  event,
  guest,
  template,
  appLogoUrl,
  appFaviconUrl,
  appBrandName,
  appTagline,
  cardRef,
  fixedWidthPx,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(() => (fixedWidthPx && fixedWidthPx > 0 ? fixedWidthPx / 1200 : 1));
  const reactId = React.useId();
  const clipPathId = `einvite-left-arch-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { settings } = useSettings();
  const { appUser } = useAuth();
  const [partnerLogoUrl, setPartnerLogoUrl] = useState<string | null>(null);
  const [couplePhotoIdx, setCouplePhotoIdx] = useState(0);
  const [logoIdx, setLogoIdx] = useState(0);
  const [emblemIdx, setEmblemIdx] = useState(0);
  const [templateIdx, setTemplateIdx] = useState(0);

  const rawCoupleUrlKey = [
    event?.eInvitePhotoUrl,
    event?.thumbnailUrl,
    (event as any)?.coverImage,
    (event as any)?.cover_image,
    event?.frameOverlayUrl,
  ]
    .filter(Boolean)
    .join('|');

  useEffect(() => {
    setCouplePhotoIdx(0);
  }, [rawCoupleUrlKey]);

  useEffect(() => {
    setLogoIdx(0);
  }, [appLogoUrl, settings?.logoUrl, partnerLogoUrl, appUser?.logoUrl]);

  useEffect(() => {
    setEmblemIdx(0);
  }, [appFaviconUrl, settings?.faviconUrl, settings?.logoUrl]);

  useEffect(() => {
    setTemplateIdx(0);
  }, [template?.imageUrl, event?.eInviteTemplateUrl]);

  useEffect(() => {
    const targetPartnerId = event?.partnerId;
    if (!targetPartnerId || targetPartnerId === 'default-partner') {
      setPartnerLogoUrl(null);
      return;
    }
    if (appUser && (appUser.id === targetPartnerId || appUser.partnerId === targetPartnerId) && appUser.logoUrl) {
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
  }, [fixedWidthPx]);

  const primaryColor =
    template?.primaryColor ||
    (event?.eInviteTheme === 'gold'
      ? '#4A3519'
      : event?.eInviteTheme === 'sage'
      ? '#16382C'
      : '#153B31');

  const accentColor =
    template?.accentColor ||
    (event?.eInviteTheme === 'gold'
      ? '#B38748'
      : event?.eInviteTheme === 'sage'
      ? '#4F7A65'
      : '#C98583');

  const guestBoxBg =
    template?.guestBoxBg ||
    (event?.eInviteTheme === 'gold'
      ? '#F5EFE4'
      : event?.eInviteTheme === 'sage'
      ? '#E6F0EB'
      : '#F3E4E2');

  const footerColor =
    template?.footerColor ||
    (event?.eInviteTheme === 'gold'
      ? '#9E7840'
      : event?.eInviteTheme === 'sage'
      ? '#3B6652'
      : '#C27D7A');

  const templateCandidates = getMediaFallbackUrls([
    template?.imageUrl,
    event?.eInviteTemplateUrl,
  ]);
  const templateImageUrl =
    templateIdx < templateCandidates.length ? templateCandidates[templateIdx] : '';

  const couplePhotoCandidates = [
    ...getMediaFallbackUrls([
      event?.thumbnailUrl,
      event?.eInvitePhotoUrl,
      (event as any)?.coverImage,
      (event as any)?.cover_image,
      event?.frameOverlayUrl,
    ]),
    DEFAULT_COUPLE_PHOTO,
  ];
  const couplePhotoUrl =
    couplePhotoCandidates[Math.min(couplePhotoIdx, couplePhotoCandidates.length - 1)];

  const headerText = (event?.eInviteHeaderText || 'THE WEDDING OF').toUpperCase();
  const { groom, bride } = splitCoupleNames(
    event?.coupleName,
    event?.eInviteGroomName,
    event?.eInviteBrideName,
    event?.title
  );

  const guestName = guest?.name || 'Nama Tamu Undangan';
  const guestCode = guest?.ticketCode || 'GUEST123456';
  const guestCategory = guest?.category || '';

  const maxCoupleLen = Math.max(groom.length, bride.length);
  const coupleNameSizeClass =
    maxCoupleLen > 24
      ? 'text-[26px] leading-[1.08]'
      : maxCoupleLen > 18
      ? 'text-[34px] leading-[1.06]'
      : maxCoupleLen > 13
      ? 'text-[40px] leading-[1.04]'
      : 'text-[46px] leading-[1.02]';

  const guestNameLen = guestName.length;
  const guestNameSizeClass =
    guestNameLen > 55
      ? 'text-[15.5px] leading-[1.22]'
      : guestNameLen > 40
      ? 'text-[17.5px] leading-[1.2]'
      : guestNameLen > 26
      ? 'text-[21px] leading-[1.18]'
      : guestNameLen > 18
      ? 'text-[24px] leading-[1.16]'
      : 'text-[27px] leading-[1.15]';

  const greetingText =
    event?.eInviteGreetingText ||
    'Dengan hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara pernikahan kami.';

  const footerText =
    event?.eInviteFooterText || 'ATAS KEHADIRAN DAN DOA RESTUNYA';

  const { dayName, dateText } = formatIndonesianEventDate(event?.date);
  const rawTime = (guest?.session || event?.time || '09.00 - 14.00').trim();
  const timeDisplay = /wib|wita|wit/i.test(rawTime) ? rawTime : `${rawTime} WIB`;

  const venueName =
    (event?.location ? event.location.split(',')[0].trim() : '') ||
    event?.eInviteVenueName ||
    'Gedung Serbaguna Graha Anugerah';

  const venueAddress =
    event?.eInviteVenueAddress ||
    event?.greetingVenueSubtitle ||
    (event?.location && event.location.includes(',')
      ? event.location.split(',').slice(1).join(',').trim()
      : event?.location || 'Jl. Melati No. 25, Semarang');

  const brandName = appBrandName || 'Guestly';
  const tagline = appTagline || 'Buku Tamu Digital';
  const logoCandidates = getMediaFallbackUrls([
    appLogoUrl,
    settings?.logoUrl,
    partnerLogoUrl,
    appUser?.logoUrl,
  ]);
  const resolvedLogoUrl = logoIdx < logoCandidates.length ? logoCandidates[logoIdx] : '';

  const domFaviconHref =
    typeof document !== 'undefined'
      ? (document.querySelector("link[rel~='icon']") as HTMLLinkElement | null)?.href || ''
      : '';
  const validDomFavicon =
    domFaviconHref && !domFaviconHref.endsWith('/favicon.ico') ? domFaviconHref : '';

  const emblemCandidates = getMediaFallbackUrls([
    appFaviconUrl,
    settings?.faviconUrl,
    validDomFavicon,
    settings?.logoUrl,
    resolvedLogoUrl,
  ]);
  const resolvedQrEmblemUrl =
    emblemIdx < emblemCandidates.length ? emblemCandidates[emblemIdx] : '';

  return (
    <div
      ref={containerRef}
      className={`${fixedWidthPx ? '' : 'w-full'} relative overflow-hidden rounded-[18px] sm:rounded-[26px] shadow-[0_14px_40px_-10px_rgba(0,0,0,0.14)] border border-[#E8DFD8] bg-[#FAF6F2] ${className}`}
      style={{
        ...(fixedWidthPx ? { width: `${fixedWidthPx}px` } : {}),
        height: `${Math.round(675 * scale)}px`,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,600&display=swap');
        .einvite-serif { font-family: 'Playfair Display', Georgia, serif; }
      `}</style>

      {/* Fixed 1200x675 (16:9) Precision Canvas */}
      <div
        ref={cardRef}
        data-export-width="1200"
        data-export-height="675"
        className="relative bg-[#FAF6F2] text-left select-none overflow-hidden"
        style={{
          width: '1200px',
          height: '675px',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {/* SVG Clip Path Definition for Left Arch matching Card 1.png */}
        <svg width="0" height="0" className="absolute">
          <defs>
            <clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
              <path d="M 0,0 L 242,0 C 362,54 432,198 432,340 C 432,428 410,498 386,543 L 0,543 Z" />
            </clipPath>
          </defs>
        </svg>

        {/* LAYER 0: Built-in Vector Background matching Card 1.png (Always renders instantly, 0ms lag) */}
        <div className="absolute inset-0 bg-[#FAF6F2] z-0">
          {/* Soft blush fill inside arch */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 1200 675"
            fill="none"
          >
            <path
              d="M 0,0 L 242,0 C 362,54 432,198 432,340 C 432,428 410,498 386,543 L 0,543 Z"
              fill="#F6ECE8"
            />
            {/* Inner Pink Arch Line */}
            <path
              d="M 242,0 C 362,54 432,198 432,340 C 432,428 410,498 386,543"
              stroke={accentColor}
              strokeWidth="4"
              strokeOpacity="0.55"
            />
            {/* Outer Gold Arch Line */}
            <path
              d="M 254,0 C 374,54 444,198 444,340 C 444,428 422,498 398,543"
              stroke="#C5A678"
              strokeWidth="2"
              strokeOpacity="0.7"
            />

            {/* Top-Right Botanical Line Art */}
            <g opacity="0.45" stroke="#B7837A" strokeWidth="1.4">
              <path d="M 1200,18 C 1150,32 1110,75 1085,135" />
              <path d="M 1140,42 C 1125,28 1105,26 1090,36 C 1104,48 1124,50 1140,42 Z" fill="#F3DDD8" />
              <path d="M 1118,74 C 1100,62 1080,64 1068,76 C 1082,86 1102,84 1118,74 Z" fill="#E3E6DF" />
              <path d="M 1165,88 C 1152,106 1154,126 1166,138 C 1176,124 1174,104 1165,88 Z" fill="#F3DDD8" />
            </g>
          </svg>

          {/* Bottom Footer Strip (y: 543..675, height: 132px) */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[132px]"
            style={{ backgroundColor: footerColor }}
          >
            {/* Left & Right Footer Botanical Ornaments */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 1200 132"
              fill="none"
            >
              {/* Left floral lines */}
              <g stroke="#FFF5F3" strokeOpacity="0.6" strokeWidth="1.3">
                <path d="M 18,125 C 55,82 105,46 175,24" />
                <path d="M 62,88 C 48,68 50,46 65,30 C 78,46 76,70 62,88 Z" fill="#FFFFFF" fillOpacity="0.12" />
                <path d="M 98,64 C 86,46 90,26 106,14 C 116,30 112,50 98,64 Z" fill="#FFFFFF" fillOpacity="0.12" />
                <path d="M 115,72 C 135,62 158,66 172,80 C 154,90 132,86 115,72 Z" fill="#FFFFFF" fillOpacity="0.12" />
                <path d="M 74,102 C 96,94 118,100 130,114 C 112,122 90,116 74,102 Z" fill="#FFFFFF" fillOpacity="0.12" />
              </g>
              {/* Right floral lines */}
              <g stroke="#FFF5F3" strokeOpacity="0.6" strokeWidth="1.3">
                <path d="M 1182,125 C 1145,82 1095,46 1025,24" />
                <path d="M 1138,88 C 1152,68 1150,46 1135,30 C 1122,46 1124,70 1138,88 Z" fill="#FFFFFF" fillOpacity="0.12" />
                <path d="M 1102,64 C 1114,46 1110,26 1094,14 C 1084,30 1088,50 1102,64 Z" fill="#FFFFFF" fillOpacity="0.12" />
                <path d="M 1085,72 C 1065,62 1042,66 1028,80 C 1046,90 1068,86 1085,72 Z" fill="#FFFFFF" fillOpacity="0.12" />
                <circle cx="1095" cy="85" r="36" stroke="#FFF5F3" strokeOpacity="0.45" fill="#FFFFFF" fillOpacity="0.08" />
                <circle cx="1095" cy="85" r="12" stroke="#FFF5F3" strokeOpacity="0.55" />
              </g>
            </svg>
          </div>
        </div>

        {/* LAYER 1: Uploaded Template Image from Cloudflare R2 (guestly-storage/E-Invitation/) */}
        {templateImageUrl && (
          <img
            src={templateImageUrl}
            data-export-role="template-bg"
            alt={template?.name || 'Template E-Invitation'}
            onError={() => {
              setTemplateIdx((prev) => prev + 1);
            }}
            className="absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none"
          />
        )}

        {/* LAYER 2: Left Arch Couple Photo (Clipped to match Card 1.png arch curve) */}
        <div
          data-arch-clip="true"
          className="absolute top-0 left-0 w-[432px] h-[543px] z-[2] overflow-hidden"
          style={{
            clipPath:
              "path('M 0,0 L 242,0 C 362,54 432,198 432,340 C 432,428 410,498 386,543 L 0,543 Z')",
          }}
        >
          <img
            src={couplePhotoUrl}
            data-export-role="arch-photo"
            alt={`${groom} & ${bride}`}
            onError={() => {
              setCouplePhotoIdx((prev) =>
                prev < couplePhotoCandidates.length - 1 ? prev + 1 : prev
              );
            }}
            className="w-full h-full object-cover object-top"
          />
          {/* Top-left delicate botanical leaf accent over photo corner (like Template 1.png) */}
          <svg
            data-export-ignore="true"
            className="absolute top-0 left-0 w-[160px] h-[200px] pointer-events-none"
            viewBox="0 0 160 200"
            fill="none"
          >
            <g stroke="#C67D73" strokeWidth="1.5" opacity="0.75">
              <path d="M 8,165 C 28,115 62,65 115,22" />
              <path d="M 32,120 C 18,104 20,84 34,70 C 46,86 44,106 32,120 Z" fill="#FBEAE7" fillOpacity="0.55" />
              <path d="M 56,86 C 42,70 44,50 58,36 C 70,52 68,72 56,86 Z" fill="#FBEAE7" fillOpacity="0.55" />
              <path d="M 48,112 C 66,104 86,108 98,120 C 82,130 62,126 48,112 Z" fill="#FBEAE7" fillOpacity="0.55" />
              <path d="M 74,76 C 92,68 112,72 124,84 C 108,94 88,90 74,76 Z" fill="#FBEAE7" fillOpacity="0.55" />
            </g>
          </svg>
        </div>

        {/* LAYER 3: Center Dynamic Content ({{GROOM_NAME}}, {{BRIDE_NAME}}, {{GUEST_NAME}}, Date & Venue) */}
        <div className="absolute top-[24px] left-[456px] w-[396px] h-[504px] z-[3] flex flex-col justify-between">
          {/* Top Couple Header */}
          <div className="w-full text-center">
            <p
              className="w-full text-center text-[13px] font-medium tracking-[0.36em] uppercase mb-1"
              style={{ color: primaryColor }}
            >
              {headerText}
            </p>

            {bride ? (
              <div className="einvite-serif flex flex-col items-center w-full">
                <h1
                  className={`${coupleNameSizeClass} font-normal tracking-tight w-full text-center break-words px-1`}
                  style={{ color: primaryColor }}
                >
                  {groom}
                </h1>
                <span
                  className="text-[32px] leading-[0.88] italic my-0.5 w-full text-center"
                  style={{ color: accentColor }}
                >
                  &amp;
                </span>
                <h1
                  className={`${coupleNameSizeClass} font-normal tracking-tight w-full text-center break-words px-1`}
                  style={{ color: primaryColor }}
                >
                  {bride}
                </h1>
              </div>
            ) : (
              <h1
                className={`einvite-serif ${coupleNameSizeClass} font-normal tracking-tight w-full text-center break-words py-3 px-1`}
                style={{ color: primaryColor }}
              >
                {groom}
              </h1>
            )}

            {/* Heart Divider */}
            <div className="flex items-center justify-center gap-3 mt-2">
              <span
                className="h-[1.5px] w-[96px] rounded-full opacity-65"
                style={{ backgroundColor: accentColor }}
              />
              <Heart
                size={16}
                fill={accentColor}
                style={{ color: accentColor }}
              />
              <span
                className="h-[1.5px] w-[96px] rounded-full opacity-65"
                style={{ backgroundColor: accentColor }}
              />
            </div>
          </div>

          {/* Guest Invitation Box (Kepada Yth. {{GUEST_NAME}}) */}
          <div
            className="w-full rounded-[18px] px-5 py-3 border border-[#E5CECA]/70 shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
            style={{ backgroundColor: guestBoxBg }}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="einvite-serif text-[14px] text-[#262626] whitespace-nowrap">
                Kepada Yth.
              </span>
              {guestCategory && (
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/85 border whitespace-nowrap shrink-0"
                  style={{ color: primaryColor, borderColor: accentColor }}
                >
                  {guestCategory}
                </span>
              )}
            </div>
            <h2
              className={`einvite-serif ${guestNameSizeClass} font-bold mt-1 w-full break-words`}
              style={{ color: primaryColor }}
            >
              {guestName}
            </h2>
            <p className="einvite-serif text-[12px] text-[#2E2E2E] leading-[1.32] mt-1 w-full">
              {greetingText}
            </p>
          </div>

          {/* Schedule & Venue Info */}
          <div className="w-full space-y-2 pt-0.5">
            {/* Row 1: Date & Time */}
            <div className="flex items-center gap-3.5 w-full">
              <div className="w-[44px] h-[44px] rounded-full bg-[#F6DCDD] flex items-center justify-center shrink-0">
                <Calendar size={21} className="text-[#C9444B]" />
              </div>
              <div className="min-w-0 flex-1">
                {dayName && (
                  <p className="w-full text-[12px] font-medium uppercase tracking-wider text-[#263642] leading-tight">
                    {dayName}
                  </p>
                )}
                <p className="w-full text-[17.5px] font-bold uppercase tracking-wide text-[#152836] leading-tight">
                  {dateText}
                </p>
                <p className="w-full text-[12.5px] text-[#354652] leading-tight mt-0.5">
                  {timeDisplay}
                </p>
              </div>
            </div>

            <div
              className="h-[1px] w-full opacity-55"
              style={{ backgroundColor: accentColor }}
            />

            {/* Row 2: Venue */}
            <div className="flex items-center gap-3.5 w-full">
              <div className="w-[44px] h-[44px] rounded-full bg-[#F6DCDD] flex items-center justify-center shrink-0">
                <MapPin size={21} className="text-[#C9444B]" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`w-full ${
                    venueName.length > 32 ? 'text-[14.5px] leading-tight' : 'text-[16.5px] leading-snug'
                  } font-bold text-[#152836] break-words`}
                >
                  {venueName}
                </p>
                <p
                  className={`w-full ${
                    venueAddress.length > 44 ? 'text-[11.5px] leading-tight' : 'text-[12.5px] leading-snug'
                  } text-[#354652] break-words mt-0.5`}
                >
                  {venueAddress}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* LAYER 4: Right Column ({{APP_LOGO}}, QR Card, {{GUEST_CODE}}, SCAN UNTUK CHECK-IN) */}
        <div className="absolute top-[22px] left-[874px] w-[288px] h-[508px] z-[3] flex flex-col justify-between items-center">
          {/* App / Partner Logo Header (Transparan lembut / frosted glass blur agar menyatu dengan latar kartu) */}
          <div
            data-logo-box="true"
            className="w-full bg-white/45 backdrop-blur-md rounded-[20px] px-4 py-2.5 shadow-[0_4px_20px_rgba(183,131,122,0.08)] border border-white/60 flex flex-col items-center justify-center min-h-[78px]"
            style={{
              WebkitBackdropFilter: 'blur(10px)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {resolvedLogoUrl ? (
              <img
                src={resolvedLogoUrl}
                alt={brandName}
                onError={() => setLogoIdx((prev) => prev + 1)}
                className="h-[60px] max-h-[62px] max-w-[256px] w-auto object-contain"
              />
            ) : (
              <div className="flex items-center justify-center gap-3 w-full">
                {resolvedQrEmblemUrl ? (
                  <img
                    src={resolvedQrEmblemUrl}
                    alt={brandName}
                    onError={() => setEmblemIdx((prev) => prev + 1)}
                    className="w-12 h-12 object-contain shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FF4B7D] to-[#E02B5A] flex items-center justify-center text-white shadow-xs shrink-0">
                    <Heart size={22} fill="currentColor" />
                  </div>
                )}
                <div className="text-left">
                  <div className="text-[28px] font-extrabold tracking-tight text-[#E92E63] leading-none whitespace-nowrap">
                    {brandName}
                  </div>
                  <div className="text-[12.5px] font-semibold text-[#1E2E3B] tracking-wide mt-1 whitespace-nowrap">
                    {tagline}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* White QR Card */}
          <div className="w-full bg-white rounded-[24px] px-5 pt-4 pb-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-[#EFE6E0] flex flex-col items-center">
            {/* QR Code with Center Emblem */}
            <div className="relative p-1.5 bg-white rounded-xl">
              <QRCode
                value={guestCode}
                size={190}
                level="H"
                style={{ display: 'block' }}
              />
              {/* Center QR Guestly Favicon Emblem (44x44px = ~5.3% area, safe under Level H 30% error correction) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[44px] h-[44px] rounded-xl bg-white shadow-xs flex items-center justify-center p-1 border border-gray-200">
                {resolvedQrEmblemUrl ? (
                  <img
                    src={resolvedQrEmblemUrl}
                    alt={`${brandName} Favicon`}
                    onError={() => setEmblemIdx((prev) => prev + 1)}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div
                    className="w-full h-full rounded-lg flex items-center justify-center text-white font-extrabold text-[18px] leading-none"
                    style={{ backgroundColor: primaryColor }}
                  >
                    G
                  </div>
                )}
              </div>
            </div>

            {/* {{GUEST_CODE}} */}
            <p
              className="w-full text-center text-[21px] font-bold tracking-[0.1em] mt-3 leading-none whitespace-nowrap"
              style={{ color: primaryColor }}
            >
              {guestCode}
            </p>

            {/* SCAN UNTUK CHECK-IN Capsule */}
            <div
              className="mt-3 w-full py-2.5 rounded-full text-white text-[12.5px] font-medium tracking-[0.14em] uppercase text-center shadow-xs"
              style={{ backgroundColor: primaryColor }}
            >
              SCAN UNTUK CHECK-IN
            </div>

            {/* Helper text */}
            <div className="w-full border-t border-gray-200 mt-3 pt-2.5 text-center">
              <p className="text-[11.5px] text-[#3B4A54] leading-[1.35]">
                Tunjukkan QR Code ini
                <br />
                saat kedatangan di area registrasi.
              </p>
            </div>
          </div>
        </div>

        {/* LAYER 5: Footer Strip Text ("TERIMA KASIH ATAS KEHADIRAN DAN DOA RESTUNYA") */}
        <div className="absolute bottom-0 left-[240px] right-[240px] h-[132px] z-[3] flex flex-col items-center justify-center text-center pointer-events-none">
          <p className="text-[22px] font-normal tracking-[0.28em] uppercase text-white leading-tight">
            TERIMA KASIH
          </p>
          <p className="text-[13px] font-normal tracking-[0.26em] uppercase text-white/95 mt-1.5">
            {footerText}
          </p>
          <div className="flex items-center justify-center gap-3 mt-2.5">
            <span className="h-[1px] w-[105px] bg-white/80" />
            <Heart size={14} fill="#FFFFFF" className="text-white" />
            <span className="h-[1px] w-[105px] bg-white/80" />
          </div>
        </div>
      </div>
    </div>
  );
};
