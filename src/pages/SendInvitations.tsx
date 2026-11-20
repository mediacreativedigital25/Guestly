import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Lock,
  MessageCircle,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../AuthContext';
import {
  EventRecord,
  Guest,
  User as AppUser,
  WATemplate,
  WaMediaMode,
  WaTokenSource,
} from '../types';
import {
  canUserAccessEvent,
  formatGuestFullName,
  getMediaFallbackUrls,
  getUserBusinessId,
  isEventExpired,
  isEventInactiveOrExpired,
  renderCardToJpegBlob,
  resolveMediaUrl,
  shouldHideServiceInfo,
} from '../lib/utils';
import { EInvitationCard } from '../components/EInvitationCard';
import {
  checkFonnteDevice,
  FonnteDeviceCheckResult,
  normalizePhoneTarget,
  sendFonnteMessage,
  toWhatsAppInternational,
} from '../lib/fonnte';
import {
  saveGuestWaStatus,
  subscribeWaDispatch,
  WaDispatchMap,
} from '../services/waDispatchService';
import { showAlert, showConfirm } from '../lib/alerts';

type StatusFilter = 'all' | 'pending' | 'sent' | 'failed' | 'no_phone';

const DEFAULT_WA_MESSAGE = `Halo *[GUEST_NAME]* 👋🏻

Dengan penuh rasa hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara spesial kami:

✨ *[EVENT_TITLE]* ✨

Untuk konfirmasi kehadiran saat acara berlangsung, silakan tunjukkan QR Code berikut:
🔳 [QR_LINK]

Detail lengkap acara dapat dilihat melalui undangan digital berikut:
💌 [INVITE_LINK]

Merupakan suatu kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir serta memberikan doa dan restu kepada kami.

Atas perhatian dan kehadirannya, kami ucapkan terima kasih 🙏🏻

Hormat kami,
*[SENDER_NAME]*`;

function formatWaTimestamp(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderWhatsAppPreviewNodes(text: string): React.ReactNode {
  return text.split('\n').map((line, idx) => {
    const parts = line.split(/(\*[^*]+\*)/g);
    return (
      <React.Fragment key={idx}>
        {parts.map((part, pIdx) => {
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return (
              <strong key={pIdx} className="font-semibold text-slate-900">
                {part.slice(1, -1)}
              </strong>
            );
          }
          return <React.Fragment key={pIdx}>{part}</React.Fragment>;
        })}
        {idx < text.split('\n').length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export default function SendInvitations() {
  const { eventId } = useParams<{ eventId: string }>();
  const { appUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientUserAccount, setClientUserAccount] = useState<AppUser | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [waTemplates, setWaTemplates] = useState<WATemplate[]>([]);
  const [dispatchMap, setDispatchMap] = useState<WaDispatchMap>({});

  // Token & device check state
  const [deviceCheck, setDeviceCheck] = useState<FonnteDeviceCheckResult | null>(null);
  const [isCheckingDevice, setIsCheckingDevice] = useState(false);
  const [isTokenEditorOpen, setIsTokenEditorOpen] = useState(false);
  const [tokenTargetScope, setTokenTargetScope] = useState<'profile' | 'event'>('profile');
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenValue, setShowTokenValue] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);

  // Message composer & media mode
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [messageText, setMessageText] = useState<string>(DEFAULT_WA_MESSAGE);
  const [isMessageCustomized, setIsMessageCustomized] = useState(false);
  const [mediaMode, setMediaMode] = useState<WaMediaMode>('einvite');
  const [previewGuestId, setPreviewGuestId] = useState<string>('');
  const [delayMs, setDelayMs] = useState<number>(4000);
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [previewImgLoading, setPreviewImgLoading] = useState<boolean>(false);
  const [previewImgError, setPreviewImgError] = useState<boolean>(false);
  const [previewRetryCount, setPreviewRetryCount] = useState<number>(0);

  // Off-screen 1200x675 E-Invitation Card render stage for guaranteed WhatsApp & Fonnte delivery
  const hiddenEInviteRef = useRef<HTMLDivElement | null>(null);
  const [cardRenderGuest, setCardRenderGuest] = useState<Guest | null>(null);
  const uploadedCardCacheRef = useRef<Record<string, string>>({});
  const [preparingManualGuestId, setPreparingManualGuestId] = useState<string | null>(null);

  // Filters & selection
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const hasAutoSelectedFilterRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);

  // Sending execution state
  const [isBlasting, setIsBlasting] = useState(false);
  const [sendingGuestId, setSendingGuestId] = useState<string | null>(null);
  const [blastProgress, setBlastProgress] = useState<{
    current: number;
    total: number;
    sent: number;
    failed: number;
    currentGuestName: string;
  } | null>(null);
  const abortBlastRef = useRef(false);

  const isStaff = appUser?.role === 'staff' || appUser?.role === 'greeting';

  // Load Event, Guests, Templates, Client Account, and subscribe to Dispatch Status
  useEffect(() => {
    if (!eventId || !appUser) return;

    if (isStaff) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    let unsubGuests: (() => void) | null = null;
    let unsubEvent: (() => void) | null = null;
    let unsubDispatch: (() => void) | null = null;

    const loadAll = async () => {
      setLoading(true);
      try {
        const myBizId = getUserBusinessId(appUser) || appUser.id || '';
        const teamIds = new Set<string>([appUser.id, appUser.partnerId, myBizId].filter(Boolean) as string[]);

        if (appUser.role !== 'superadmin' && appUser.role !== 'client') {
          const usersSnap = await getDocs(collection(db, 'users'));
          usersSnap.docs.forEach((d) => {
            const u = d.data() as AppUser;
            if (
              (u.partnerId && teamIds.has(u.partnerId)) ||
              (u.createdBy && teamIds.has(u.createdBy)) ||
              teamIds.has(d.id)
            ) {
              teamIds.add(d.id);
              if (u.partnerId) teamIds.add(u.partnerId);
            }
          });
        }

        const eventRef = doc(db, 'events', eventId);
        const eventSnap = await getDoc(eventRef);
        if (!eventSnap.exists()) {
          setLoading(false);
          return;
        }
        const evData = { id: eventSnap.id, ...eventSnap.data() } as EventRecord;

        if (!canUserAccessEvent(appUser, evData.id, evData.partnerId, Array.from(teamIds))) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }

        setEvent(evData);

        if (evData.clientId) {
          try {
            const clSnap = await getDoc(doc(db, 'clients', evData.clientId));
            if (clSnap.exists()) {
              setClientName((clSnap.data() as any).name || '');
            }
          } catch {
            // ignore
          }
        }

        // Load client user account so partner/admin can also see if client has set their own Fonnte token
        if (evData.clientUid) {
          try {
            const cuSnap = await getDoc(doc(db, 'users', evData.clientUid));
            if (cuSnap.exists()) {
              setClientUserAccount({ id: cuSnap.id, ...cuSnap.data() } as AppUser);
            }
          } catch {
            // ignore
          }
        } else if (evData.clientId) {
          try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const found = usersSnap.docs
              .map((d) => ({ id: d.id, ...d.data() } as AppUser))
              .find((u) => u.clientId === evData.clientId && u.role === 'client');
            if (found) setClientUserAccount(found);
          } catch {
            // ignore
          }
        }

        // Load WA Templates
        try {
          const tplSnap = await getDocs(collection(db, 'wa_templates'));
          const tpls = tplSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WATemplate));
          setWaTemplates(tpls);
          const savedTplId = localStorage.getItem(`waTemplateId_${eventId}`) || '';
          const matchedTpl = tpls.find((t) => t.id === savedTplId) || tpls[0];
          if (matchedTpl) {
            setSelectedTemplateId(matchedTpl.id || '');
            setMessageText(matchedTpl.content || DEFAULT_WA_MESSAGE);
          }
        } catch {
          // ignore
        }

        unsubEvent = onSnapshot(eventRef, (snap) => {
          if (snap.exists()) {
            setEvent({ id: snap.id, ...snap.data() } as EventRecord);
          }
        });

        unsubGuests = onSnapshot(collection(db, 'events', eventId, 'guests'), (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Guest));
          list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));
          setGuests(list);
        });

        unsubDispatch = subscribeWaDispatch(eventId, (statuses) => {
          setDispatchMap(statuses);
        });
      } catch (err) {
        console.error('Error loading SendInvitations:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();

    return () => {
      if (unsubGuests) unsubGuests();
      if (unsubEvent) unsubEvent();
      if (unsubDispatch) unsubDispatch();
    };
  }, [eventId, appUser?.id, isStaff]);

  // Resolve active Fonnte Token priority:
  // 1. Event-specific token (event.fonnteToken)
  // 2. Client / Current User personal token (clientUserAccount.fonnteToken or appUser.fonnteToken)
  // 3. Fallback Global Token (subject to Guestly WA Blast quota)
  const resolvedTokenInfo = useMemo(() => {
    const evToken = (event?.fonnteToken || '').trim();
    if (evToken) {
      return {
        token: evToken,
        source: 'event' as WaTokenSource,
        isOwnToken: true,
        label: 'Token Khusus Acara Ini',
      };
    }

    const ownAccountToken = (appUser?.fonnteToken || '').trim();
    const clientToken = (clientUserAccount?.fonnteToken || '').trim();

    if (appUser?.role === 'client') {
      if (ownAccountToken) {
        return {
          token: ownAccountToken,
          source: 'client' as WaTokenSource,
          isOwnToken: true,
          label: 'Token Fonnte Pribadi Anda',
        };
      }
    } else {
      if (clientToken) {
        return {
          token: clientToken,
          source: 'client' as WaTokenSource,
          isOwnToken: true,
          label: `Token Fonnte Milik Client (${clientUserAccount?.name || clientName || 'Client'})`,
        };
      }
      if (ownAccountToken) {
        return {
          token: ownAccountToken,
          source: 'client' as WaTokenSource,
          isOwnToken: true,
          label: 'Token Fonnte Akun Anda',
        };
      }
    }

    return {
      token: '',
      source: 'global' as WaTokenSource,
      isOwnToken: false,
      label: 'Fallback Token Global Guestly',
    };
  }, [event?.fonnteToken, appUser?.fonnteToken, appUser?.role, clientUserAccount?.fonnteToken, clientUserAccount?.name, clientName]);

  // Auto-check Fonnte device whenever active token changes
  const runDeviceCheck = async (silent = false) => {
    setIsCheckingDevice(true);
    try {
      const res = resolvedTokenInfo.isOwnToken
        ? await checkFonnteDevice(resolvedTokenInfo.token, false)
        : await checkFonnteDevice(undefined, true);
      setDeviceCheck(res);
      if (!silent) {
        if (res.connected) {
          showAlert(
            'Perangkat Terhubung',
            `Nomor pengirim: ${res.device || '-'} (${res.name || 'Device Fonnte'}). Siap mengirim undangan.`,
            'success'
          );
        } else {
          showAlert(
            'Perangkat Belum Terhubung',
            res.error || 'Token belum terhubung ke perangkat WhatsApp aktif di Fonnte.',
            'warning'
          );
        }
      }
    } finally {
      setIsCheckingDevice(false);
    }
  };

  useEffect(() => {
    if (!loading && event) {
      runDeviceCheck(true);
    }
  }, [loading, resolvedTokenInfo.token, resolvedTokenInfo.isOwnToken]);

  // Sync token input when opening editor
  useEffect(() => {
    if (tokenTargetScope === 'event') {
      setTokenInput(event?.fonnteToken || '');
    } else {
      setTokenInput(appUser?.fonnteToken || '');
    }
  }, [tokenTargetScope, event?.fonnteToken, appUser?.fonnteToken]);

  const handleSaveInlineToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !appUser?.id) return;
    const clean = tokenInput.trim();
    setIsSavingToken(true);
    try {
      if (tokenTargetScope === 'event') {
        await updateDoc(doc(db, 'events', eventId), {
          fonnteToken: clean || null,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'users', appUser.id), {
          fonnteToken: clean || null,
          updatedAt: serverTimestamp(),
        });
      }
      setIsTokenEditorOpen(false);
      if (clean) {
        const res = await checkFonnteDevice(clean, false);
        setDeviceCheck(res);
        showAlert(
          'Token Fonnte Disimpan',
          res.connected
            ? `Token terhubung (${res.device || 'Connected'}). Pengiriman tidak memotong kuota Guestly.`
            : 'Token tersimpan. Pastikan device WhatsApp sudah scan QR di dashboard Fonnte.',
          res.connected ? 'success' : 'info'
        );
      } else {
        showAlert('Token Dihapus', 'Pengiriman akan memakai fallback Token Global atau manual.', 'info');
      }
    } catch (err: any) {
      showAlert('Gagal', err?.message || 'Gagal menyimpan token Fonnte.', 'error');
    } finally {
      setIsSavingToken(false);
    }
  };

  // Quota math for Global Token Fallback
  const freeWaBlastQuota = 50;
  const currentWaBlastCount = event?.waBlastCount || 0;
  const userWaBlastQuota = appUser?.waBlastQuota || 0;
  const availableGuestlyQuota = Math.max(0, freeWaBlastQuota - currentWaBlastCount) + userWaBlastQuota;

  // Derived guest status helpers
  const getGuestStatus = (guest: Guest) => {
    const entry = guest.id ? dispatchMap[guest.id] : undefined;
    return entry?.status || 'pending';
  };

  const hasValidPhone = (guest: Guest) => {
    const norm = normalizePhoneTarget(guest.phone || '');
    return norm.length >= 9;
  };

  const stats = useMemo(() => {
    let total = guests.length;
    let validPhone = 0;
    let pending = 0;
    let sent = 0;
    let sentFonnte = 0;
    let sentManual = 0;
    let failed = 0;
    let noPhone = 0;

    for (const g of guests) {
      const hasPhone = hasValidPhone(g);
      if (hasPhone) validPhone++;
      else noPhone++;

      const entry = g.id ? dispatchMap[g.id] : undefined;
      const st = entry?.status || 'pending';
      if (st === 'sent') {
        sent++;
        if (entry?.method === 'manual') sentManual++;
        else sentFonnte++;
      } else if (st === 'failed') {
        failed++;
      } else if (hasPhone) {
        pending++;
      }
    }

    return { total, validPhone, pending, sent, sentFonnte, sentManual, failed, noPhone };
  }, [guests, dispatchMap]);

  // Smart default filter: avoid landing on an empty "Belum Dikirim (0)" screen when guests exist
  useEffect(() => {
    if (loading || hasAutoSelectedFilterRef.current) return;
    if (guests.length === 0) return;
    hasAutoSelectedFilterRef.current = true;
    if (stats.pending === 0) {
      if (stats.failed > 0) setStatusFilter('failed');
      else if (stats.sent > 0) setStatusFilter('sent');
      else setStatusFilter('all');
    }
  }, [loading, guests.length, stats.pending, stats.failed, stats.sent]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>(event?.guestCategories || []);
    guests.forEach((g) => {
      if (g.category) set.add(g.category);
    });
    return Array.from(set);
  }, [event?.guestCategories, guests]);

  const availableSessions = useMemo(() => {
    const set = new Set<string>(event?.sessions || []);
    guests.forEach((g) => {
      if (g.session) set.add(g.session);
    });
    return Array.from(set);
  }, [event?.sessions, guests]);

  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      const st = getGuestStatus(g);
      const valid = hasValidPhone(g);

      if (statusFilter === 'pending' && (st !== 'pending' || !valid)) return false;
      if (statusFilter === 'sent' && st !== 'sent') return false;
      if (statusFilter === 'failed' && st !== 'failed') return false;
      if (statusFilter === 'no_phone' && valid) return false;

      if (categoryFilter !== 'all' && (g.category || '') !== categoryFilter) return false;
      if (sessionFilter !== 'all' && (g.session || '') !== sessionFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const fullName = formatGuestFullName(g.name, g.title).toLowerCase();
        const phone = (g.phone || '').toLowerCase();
        const ticket = (g.ticketCode || '').toLowerCase();
        if (!fullName.includes(q) && !phone.includes(q) && !ticket.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [guests, dispatchMap, statusFilter, categoryFilter, sessionFilter, searchTerm]);

  // Build message & media URL for any guest
  const buildGuestPayload = (guest: Guest) => {
    const origin = window.location.origin;
    const qrLink = `${origin}/rsvp/${eventId}/${guest.ticketCode}`;
    const displayName = formatGuestFullName(guest.name, guest.title) || guest.name;

    let digitalInviteLink = event?.digitalInviteLink || qrLink;
    if (event?.digitalInviteLink) {
      const separator = event.digitalInviteLink.includes('?') ? '&' : '?';
      digitalInviteLink = `${event.digitalInviteLink}${separator}to=${encodeURIComponent(displayName)}&ticket=${guest.ticketCode}${guest.phone ? `&phone=${encodeURIComponent(guest.phone)}` : ''}${guest.session ? `&session=${encodeURIComponent(guest.session)}` : ''}`;
    }

    const senderName = event?.coupleName || clientName || event?.title || 'Kami';

    const message = messageText
      .replace(/\[GUEST_NAME\]/g, displayName)
      .replace(/\[EVENT_TITLE\]/g, event?.title || '')
      .replace(/\[QR_LINK\]/g, qrLink)
      .replace(/\[INVITE_LINK\]/g, digitalInviteLink)
      .replace(/\[SENDER_NAME\]/g, senderName);

    let mediaUrl: string | undefined = undefined;
    if (mediaMode === 'einvite') {
      mediaUrl = `${origin}/api/og/einvite/${encodeURIComponent(eventId!)}/${encodeURIComponent(guest.ticketCode)}.jpg`;
    } else if (mediaMode === 'thumbnail') {
      mediaUrl = `${origin}/api/media/wa-thumbnail/${encodeURIComponent(eventId!)}.jpg`;
    }

    return { message, mediaUrl, qrLink, displayName };
  };

  const previewGuest = useMemo(() => {
    return (
      guests.find((g) => g.id === previewGuestId) ||
      filteredGuests[0] ||
      guests[0] || {
        id: 'preview',
        eventId: eventId || '',
        name: 'Bapak Budi Santoso',
        ticketCode: 'TKT8899AA',
        rsvpStatus: 'pending' as const,
        attended: false,
        category: 'VIP',
        session: event?.sessions?.[0] || 'Resepsi',
        createdAt: '',
        updatedAt: '',
      }
    );
  }, [guests, filteredGuests, previewGuestId, eventId, event?.sessions]);

  const previewPayload = useMemo(() => buildGuestPayload(previewGuest), [previewGuest, messageText, mediaMode, event, clientName]);

  const thumbnailPreviewCandidates = useMemo(() => {
    if (mediaMode !== 'thumbnail') return [];
    const vTag = encodeURIComponent(String(event?.updatedAt || 'v3'));
    const urls = getMediaFallbackUrls([
      event?.thumbnailUrl,
      (event as any)?.coverImage,
      event?.eInvitePhotoUrl,
      event?.frameOverlayUrl,
    ]);

    if (previewPayload.mediaUrl) {
      const serverUrl = `${previewPayload.mediaUrl}?v=${vTag}&r=${previewRetryCount}`;
      if (!urls.includes(serverUrl)) urls.push(serverUrl);
    }
    return urls;
  }, [mediaMode, event, previewPayload.mediaUrl, previewRetryCount]);

  const [thumbnailCandidateIdx, setThumbnailCandidateIdx] = useState(0);

  const previewImgSrc = useMemo(() => {
    if (mediaMode !== 'thumbnail') return '';
    return thumbnailPreviewCandidates[thumbnailCandidateIdx] || '';
  }, [mediaMode, thumbnailPreviewCandidates, thumbnailCandidateIdx]);

  useEffect(() => {
    setThumbnailCandidateIdx(0);
    if (mediaMode === 'thumbnail' && thumbnailPreviewCandidates.length > 0) {
      setPreviewImgLoading(true);
      setPreviewImgError(false);
    } else {
      setPreviewImgLoading(false);
      setPreviewImgError(false);
    }
  }, [mediaMode, thumbnailPreviewCandidates]);

  const handleSelectTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    if (eventId) localStorage.setItem(`waTemplateId_${eventId}`, tplId);
    const tpl = waTemplates.find((t) => t.id === tplId);
    if (tpl?.content) {
      setMessageText(tpl.content);
      setIsMessageCustomized(false);
    } else {
      setMessageText(DEFAULT_WA_MESSAGE);
      setIsMessageCustomized(false);
    }
  };

  // Render the guest's exact 1200x675 Kartu E-Invite in-browser and upload to R2 CDN
  // so both Fonnte image attachment AND WhatsApp OG link preview display the real personalized card
  const ensureGuestEInviteCardUrl = async (guest: Guest): Promise<string> => {
    const fallbackUrl = `${window.location.origin}/api/og/einvite/${encodeURIComponent(eventId!)}/${encodeURIComponent(guest.ticketCode)}.jpg`;
    if (!eventId || !event || !guest.ticketCode) return fallbackUrl;

    const cacheKey = `${eventId}_${guest.ticketCode}_${String(event.updatedAt || '')}_${guest.name || ''}_${event.eInviteTemplateId || ''}_${event.eInviteTheme || ''}`;
    if (uploadedCardCacheRef.current[cacheKey]) {
      return uploadedCardCacheRef.current[cacheKey];
    }

    try {
      setCardRenderGuest(guest);
      // Wait for React commit + QR SVG + image decode inside the offscreen 1200x675 card
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 220)))
      );

      const cardEl = hiddenEInviteRef.current;
      if (!cardEl) return fallbackUrl;

      const jpegBlob = await renderCardToJpegBlob(cardEl, 0.88);
      if (!jpegBlob || jpegBlob.size === 0) return fallbackUrl;

      const formData = new FormData();
      formData.append('file', jpegBlob, `${guest.ticketCode}.jpg`);
      formData.append('eventId', eventId);
      formData.append('ticketCode', guest.ticketCode);

      const uploadRes = await fetch('/api/og/einvite/upload', {
        method: 'POST',
        body: formData,
      });

      if (uploadRes.ok) {
        const data = await uploadRes.json().catch(() => null);
        if (data?.success && data?.url) {
          const freshUrl = `${data.url}?v=${Date.now()}`;
          uploadedCardCacheRef.current[cacheKey] = freshUrl;
          return freshUrl;
        }
      }
      return fallbackUrl;
    } catch (err) {
      console.warn('Auto-render E-Invite card failed, using server fallback:', err);
      return fallbackUrl;
    }
  };

  // Single-guest send via Fonnte
  const handleSendSingleFonnte = async (guest: Guest) => {
    if (!eventId || !guest.id) return;
    if (!hasValidPhone(guest)) {
      showAlert('Nomor Tidak Valid', `Tamu "${guest.name}" belum memiliki nomor WhatsApp yang valid.`, 'warning');
      return;
    }

    if (!resolvedTokenInfo.isOwnToken && appUser?.role !== 'superadmin' && availableGuestlyQuota < 1) {
      showAlert(
        'Kuota Global Habis',
        'Kuota WA Blast Guestly Anda sudah habis. Pasang Token Fonnte Pribadi Anda (gratis tanpa batas kuota) atau gunakan tombol WA Manual.',
        'warning'
      );
      return;
    }

    if (!resolvedTokenInfo.isOwnToken && !deviceCheck?.configured) {
      showAlert(
        'Token Fonnte Belum Tersedia',
        'Silakan isi Token Fonnte Anda terlebih dahulu atau gunakan tombol Manual (WA).',
        'warning'
      );
      setIsTokenEditorOpen(true);
      return;
    }

    setSendingGuestId(guest.id);
    try {
      const payload = buildGuestPayload(guest);
      let finalMediaUrl = payload.mediaUrl;
      if (mediaMode === 'einvite') {
        finalMediaUrl = await ensureGuestEInviteCardUrl(guest);
      }
      const res = await sendFonnteMessage(
        resolvedTokenInfo.isOwnToken ? resolvedTokenInfo.token : null,
        guest.phone!,
        payload.message,
        finalMediaUrl,
        {
          strictToken: resolvedTokenInfo.isOwnToken,
          fallbackTextOnMediaError: true,
        }
      );

      const nowIso = new Date().toISOString();
      if (res.success) {
        await saveGuestWaStatus(eventId, guest.id, {
          status: 'sent',
          sentAt: nowIso,
          method: 'fonnte',
          tokenSource: resolvedTokenInfo.source,
          mediaMode: res.usedTextFallback ? 'text' : mediaMode,
          lastError: '',
        });

        // Deduct Guestly quota ONLY if using Global Token fallback (not own token)
        if (!resolvedTokenInfo.isOwnToken && appUser?.role !== 'superadmin') {
          const usedFree = Math.min(1, Math.max(0, freeWaBlastQuota - currentWaBlastCount));
          const usedAddOn = 1 - usedFree;
          try {
            await updateDoc(doc(db, 'events', eventId), {
              waBlastCount: currentWaBlastCount + 1,
              updatedAt: serverTimestamp(),
            });
          } catch {
            // ignore
          }
          if (usedAddOn > 0 && appUser?.id) {
            try {
              await updateDoc(doc(db, 'users', appUser.id), {
                waBlastQuota: Math.max(0, userWaBlastQuota - usedAddOn),
                updatedAt: serverTimestamp(),
              });
            } catch {
              // ignore
            }
          }
        }

        showAlert(
          'Undangan Terkirim',
          `Undangan berhasil dikirim ke ${guest.name} (${guest.phone}).${
            res.usedTextFallback ? '\n\n(Dikirim sebagai pesan + link preview karena paket Fonnte membatasi lampiran gambar).' : ''
          }`,
          'success'
        );
      } else {
        await saveGuestWaStatus(eventId, guest.id, {
          status: 'failed',
          method: 'fonnte',
          tokenSource: resolvedTokenInfo.source,
          lastError: res.error || 'Gagal dikirim',
        });
        showAlert('Gagal Mengirim', res.error || 'Terjadi kesalahan saat mengirim ke Fonnte.', 'error');
      }
    } finally {
      setSendingGuestId(null);
    }
  };

  // Single-guest Manual WhatsApp (pre-renders E-Invite OG card to R2 so WA link preview shows the real card)
  const handleSendManualWA = async (guest: Guest) => {
    if (!eventId || !guest.id) return;
    const { message } = buildGuestPayload(guest);
    const intlPhone = toWhatsAppInternational(guest.phone || '');
    const waUrl = intlPhone
      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    if (mediaMode === 'einvite') {
      // Open tab synchronously inside click gesture so browsers never block the popup
      const waTab = window.open('about:blank', '_blank');
      if (waTab && !waTab.closed) {
        try {
          waTab.document.write(
            '<!doctype html><html><head><meta charset="utf-8"><title>Menyiapkan Kartu E-Invite...</title></head><body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F5F3F4;color:#272426;"><div style="text-align:center;padding:24px;"><p style="font-size:15px;font-weight:600;margin:0 0 6px;">Menyiapkan Kartu E-Invite personal...</p><p style="font-size:12px;color:#6E666B;margin:0;">Otomatis membuka WhatsApp dalam sesaat.</p></div></body></html>'
          );
          waTab.document.close();
        } catch {
          // ignore cross-origin write errors
        }
      }
      setPreparingManualGuestId(guest.id);
      try {
        await ensureGuestEInviteCardUrl(guest);
      } catch {
        // continue to WhatsApp even if card upload fails
      } finally {
        setPreparingManualGuestId(null);
      }
      if (waTab && !waTab.closed) {
        waTab.location.href = waUrl;
      } else {
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }

    const nowIso = new Date().toISOString();
    await saveGuestWaStatus(eventId, guest.id, {
      status: 'sent',
      sentAt: nowIso,
      method: 'manual',
      tokenSource: 'manual',
      mediaMode: mediaMode === 'einvite' ? 'einvite' : 'text',
      lastError: '',
    });
  };

  const handleToggleManualStatus = async (guest: Guest) => {
    if (!eventId || !guest.id) return;
    const current = getGuestStatus(guest);
    if (current === 'sent') {
      await saveGuestWaStatus(eventId, guest.id, null);
    } else {
      await saveGuestWaStatus(eventId, guest.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        method: 'manual',
        tokenSource: 'manual',
        lastError: '',
      });
    }
  };

  // Bulk Broadcast Runner
  const runBroadcast = async (targetGuests: Guest[], label: string) => {
    if (!eventId) return;
    const validTargets = targetGuests.filter((g) => hasValidPhone(g));
    if (validTargets.length === 0) {
      showAlert('Tidak Ada Target Valid', 'Tidak ada tamu dengan nomor WhatsApp valid pada daftar tersebut.', 'info');
      return;
    }

    if (!resolvedTokenInfo.isOwnToken) {
      if (!deviceCheck?.configured) {
        showAlert(
          'Token Fonnte Belum Tersedia',
          'Silakan isi Token Fonnte pribadi Anda di panel atas agar bisa langsung mengirim broadcast tanpa memotong kuota.',
          'warning'
        );
        setIsTokenEditorOpen(true);
        return;
      }

      if (appUser?.role !== 'superadmin' && validTargets.length > availableGuestlyQuota) {
        showAlert(
          'Kuota Guestly Tidak Mencukupi',
          `Anda akan mengirim ${validTargets.length} pesan menggunakan Token Global, sedangkan sisa kuota Guestly Anda adalah ${availableGuestlyQuota} pesan.\n\nSolusi: Pasang Token Fonnte Pribadi Anda di halaman ini agar pengiriman bebas batas kuota Guestly, atau kirim secara manual.`,
          'warning'
        );
        return;
      }
    } else if (deviceCheck && !deviceCheck.connected) {
      const proceed = await showConfirm(
        `Status device Fonnte saat ini terbaca belum terhubung (${deviceCheck.error || 'Disconnected'}).\n\nTetap coba jalankan broadcast ke ${validTargets.length} tamu?`
      );
      if (!proceed) return;
    } else {
      const proceed = await showConfirm(
        `Siap mengirim undangan ${label} ke ${validTargets.length} tamu menggunakan ${resolvedTokenInfo.label}?\n\n${
          resolvedTokenInfo.isOwnToken
            ? '• Mode Token Sendiri: TIDAK memotong kuota WA Blast Guestly.'
            : `• Mode Fallback Global: Akan memotong hingga ${validTargets.length} kuota WA Blast Guestly.`
        }\n• Jeda antar pesan: ${(delayMs / 1000).toFixed(1)} detik.`
      );
      if (!proceed) return;
    }

    if (selectedTemplateId) {
      localStorage.setItem(`waTemplateId_${eventId}`, selectedTemplateId);
    }

    abortBlastRef.current = false;
    setIsBlasting(true);
    let sentCount = 0;
    let failCount = 0;
    let firstError = '';

    setBlastProgress({
      current: 0,
      total: validTargets.length,
      sent: 0,
      failed: 0,
      currentGuestName: validTargets[0].name,
    });

    try {
      for (let i = 0; i < validTargets.length; i++) {
        if (abortBlastRef.current) break;

        const guest = validTargets[i];
        setBlastProgress({
          current: i + 1,
          total: validTargets.length,
          sent: sentCount,
          failed: failCount,
          currentGuestName: guest.name,
        });

        const payload = buildGuestPayload(guest);
        let finalMediaUrl = payload.mediaUrl;
        if (mediaMode === 'einvite') {
          finalMediaUrl = await ensureGuestEInviteCardUrl(guest);
        }
        const res = await sendFonnteMessage(
          resolvedTokenInfo.isOwnToken ? resolvedTokenInfo.token : null,
          guest.phone!,
          payload.message,
          finalMediaUrl,
          {
            strictToken: resolvedTokenInfo.isOwnToken,
            fallbackTextOnMediaError: true,
          }
        );

        if (guest.id) {
          if (res.success) {
            sentCount++;
            await saveGuestWaStatus(eventId, guest.id, {
              status: 'sent',
              sentAt: new Date().toISOString(),
              method: 'fonnte',
              tokenSource: resolvedTokenInfo.source,
              mediaMode: res.usedTextFallback ? 'text' : mediaMode,
              lastError: '',
            });
          } else {
            failCount++;
            if (!firstError && res.error) firstError = res.error;
            await saveGuestWaStatus(eventId, guest.id, {
              status: 'failed',
              method: 'fonnte',
              tokenSource: resolvedTokenInfo.source,
              lastError: res.error || 'Gagal mengirim',
            });
          }
        }

        setBlastProgress({
          current: i + 1,
          total: validTargets.length,
          sent: sentCount,
          failed: failCount,
          currentGuestName: guest.name,
        });

        if (i < validTargets.length - 1 && !abortBlastRef.current) {
          // Slight natural jitter (+/- 400ms) around chosen delay
          const jitter = Math.floor(Math.random() * 800) - 400;
          await new Promise((r) => setTimeout(r, Math.max(1500, delayMs + jitter)));
        }
      }

      // Deduct Guestly quota ONLY if using Global Token fallback
      if (sentCount > 0 && !resolvedTokenInfo.isOwnToken && appUser?.role !== 'superadmin') {
        const countUsedFromFree = Math.min(sentCount, Math.max(0, freeWaBlastQuota - currentWaBlastCount));
        const countUsedFromUser = sentCount - countUsedFromFree;
        try {
          await updateDoc(doc(db, 'events', eventId), {
            waBlastCount: currentWaBlastCount + sentCount,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // ignore
        }
        if (countUsedFromUser > 0 && appUser?.id) {
          try {
            await updateDoc(doc(db, 'users', appUser.id), {
              waBlastQuota: Math.max(0, userWaBlastQuota - countUsedFromUser),
              updatedAt: serverTimestamp(),
            });
          } catch {
            // ignore
          }
        }
      }

      setSelectedGuestIds([]);

      const stoppedNote = abortBlastRef.current ? ' (dihentikan lebih awal oleh pengguna)' : '';
      showAlert(
        abortBlastRef.current ? 'Broadcast Dihentikan' : 'Broadcast Selesai',
        `Ringkasan pengiriman${stoppedNote}:\n• Berhasil terkirim: ${sentCount} tamu\n• Gagal: ${failCount} tamu${
          firstError ? `\n\nCatatan error pertama: ${firstError}` : ''
        }`,
        sentCount > 0 ? 'success' : 'warning'
      );
    } finally {
      setIsBlasting(false);
      setBlastProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (accessDenied || !event) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto mt-8">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">
          {accessDenied ? 'Akses Ditolak' : 'Acara Tidak Ditemukan'}
        </h2>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          {accessDenied
            ? 'Halaman kirim undangan tidak tersedia untuk role Anda.'
            : 'Data acara tidak ditemukan atau telah dihapus.'}
        </p>
        <Link
          to="/auth/login/events"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Acara</span>
        </Link>
      </div>
    );
  }

  const isEventLocked = isEventInactiveOrExpired(event) && appUser?.role !== 'superadmin';
  const eventExpired = isEventExpired(event);
  const hideServiceCatalog = shouldHideServiceInfo(appUser);

  if (isEventLocked) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-[#8C3A50] flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          {eventExpired ? 'Masa Aktif Acara Berakhir' : 'Acara Berstatus Draft'}
        </h2>
        <p className="text-sm text-slate-600 mt-1.5 mb-6 leading-relaxed">
          {eventExpired
            ? `Fitur Kirim Undangan WhatsApp untuk "${event.title}" dikunci sementara karena masa aktif acara telah habis. Silakan lakukan Top-Up Paket untuk membuka kembali pengiriman undangan.`
            : `Fitur Kirim Undangan WhatsApp untuk "${event.title}" dikunci sementara karena acara masih berstatus Draft. Silakan lakukan Top-Up Paket untuk mengaktifkan acara.`}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Link
            to={`/auth/login/events/${eventId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Detail Acara</span>
          </Link>
          {!hideServiceCatalog && (
            <Link
              to={`/auth/login/services/catalog?renewEvent=${eventId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-semibold shadow-xs transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span>Top-Up Paket / Perpanjang</span>
            </Link>
          )}
        </div>
      </div>
    );
  }

  const allFilteredSelectableIds = filteredGuests.filter((g) => g.id && hasValidPhone(g)).map((g) => g.id!);
  const isAllSelected =
    allFilteredSelectableIds.length > 0 &&
    allFilteredSelectableIds.every((id) => selectedGuestIds.includes(id));

  const pendingTargets = guests.filter((g) => getGuestStatus(g) === 'pending' && hasValidPhone(g));
  const failedTargets = guests.filter((g) => getGuestStatus(g) === 'failed' && hasValidPhone(g));
  const selectedTargets = guests.filter((g) => g.id && selectedGuestIds.includes(g.id) && hasValidPhone(g));

  const canSaveToEvent = ['superadmin', 'owner', 'admin', 'partner', 'client'].includes(appUser?.role || '');

  return (
    <div className="space-y-4 pb-20">
      {/* Compact Page Header & Integrated Fonnte Token Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3.5 sm:px-5 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              to={`/auth/login/events/${eventId}`}
              className="mt-0.5 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
              title="Kembali ke Detail Acara"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  Kirim Undangan WhatsApp
                </h1>
                <span className="text-xs text-slate-400 hidden sm:inline">·</span>
                <span className="text-xs font-medium text-slate-600 truncate">
                  {event.title}
                </span>
              </div>

              {/* Inline Fonnte Connection Status */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs">
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    resolvedTokenInfo.isOwnToken && deviceCheck?.connected
                      ? 'text-emerald-700'
                      : resolvedTokenInfo.isOwnToken
                      ? 'text-amber-700'
                      : 'text-slate-700'
                  }`}
                >
                  {resolvedTokenInfo.isOwnToken && deviceCheck?.connected ? (
                    <Wifi className="w-3.5 h-3.5 shrink-0" />
                  ) : resolvedTokenInfo.isOwnToken ? (
                    <WifiOff className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <MessageCircle className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  )}
                  <span>{resolvedTokenInfo.label}</span>
                </span>

                <span className="text-slate-300" aria-hidden="true">•</span>

                {resolvedTokenInfo.isOwnToken ? (
                  <span className="text-slate-600">
                    {deviceCheck?.connected ? (
                      <>
                        Device: <strong className="font-mono text-slate-800">{deviceCheck.device || '-'}</strong> ·{' '}
                        <span className="text-emerald-700 font-medium">Bebas Kuota Guestly</span>
                      </>
                    ) : (
                      <span className="text-amber-700">
                        {deviceCheck?.error || 'Device Fonnte belum Connected (cek QR di md.fonnte.com)'}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-600">
                    Sisa Kuota Global: <strong className="font-mono tabular-nums text-slate-900">{availableGuestlyQuota}</strong> pesan · Manual WA selalu tersedia
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => runDeviceCheck(false)}
              disabled={isCheckingDevice}
              className="h-8.5 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isCheckingDevice ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>Cek Device</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTokenEditorOpen(!isTokenEditorOpen)}
              className="h-8.5 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{resolvedTokenInfo.isOwnToken ? 'Ganti Token' : 'Pasang Token Sendiri'}</span>
            </button>

            <Link
              to={`/auth/login/events/${eventId}`}
              className="h-8.5 px-3 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Daftar Tamu</span>
            </Link>
          </div>
        </div>

        {/* Inline Token Configuration Drawer */}
        {isTokenEditorOpen && (
          <form
            onSubmit={handleSaveInlineToken}
            className="border-t border-slate-200 bg-slate-50/80 p-4 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900">Atur Token Fonnte Pribadi</h3>
                <p className="text-xs text-slate-500">
                  Ambil API Token dari <strong>Device &rarr; Token</strong> di{' '}
                  <a
                    href="https://md.fonnte.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 underline inline-flex items-center gap-0.5"
                  >
                    md.fonnte.com <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  atau kelola di{' '}
                  <Link to="/auth/login/profile" className="text-indigo-600 underline">
                    Profil Akun
                  </Link>
                  . Token sendiri tidak memotong kuota Guestly.
                </p>
              </div>

              {canSaveToEvent && (
                <div className="inline-flex p-1 bg-slate-200/70 rounded-lg text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setTokenTargetScope('profile')}
                    className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      tokenTargetScope === 'profile'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Akun Saya
                  </button>
                  <button
                    type="button"
                    onClick={() => setTokenTargetScope('event')}
                    className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      tokenTargetScope === 'event'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Khusus Acara Ini
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type={showTokenValue ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Masukkan API Token Fonnte (kosongkan lalu simpan untuk kembali ke Fallback Global)..."
                  className="w-full h-9 border border-slate-300 rounded-lg pl-3 pr-9 text-xs sm:text-sm font-mono bg-white focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowTokenValue(!showTokenValue)}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showTokenValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={isSavingToken}
                className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSavingToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Simpan &amp; Hubungkan</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTokenEditorOpen(false)}
                className="h-9 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Compact Interactive 4-Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => {
            setStatusFilter('all');
            setSelectedGuestIds([]);
          }}
          className={`text-left bg-white rounded-xl border px-3.5 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'all' ? 'border-slate-400 ring-1 ring-slate-300' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Total Tamu</span>
            <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {stats.total.toLocaleString('id-ID')}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            <span className="font-mono font-semibold text-slate-700">{stats.validPhone}</span> No. WA ·{' '}
            <span className="font-mono">{stats.noPhone}</span> tanpa nomor
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('pending');
            setSelectedGuestIds([]);
          }}
          className={`text-left bg-white rounded-xl border px-3.5 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'pending' ? 'border-amber-400 ring-1 ring-amber-200' : 'border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-800">Belum Dikirim</span>
            <span className="text-lg font-bold font-mono tabular-nums text-amber-700">
              {stats.pending.toLocaleString('id-ID')}
            </span>
          </div>
          <p className="text-[11px] text-amber-700/80 mt-0.5 truncate">Siap blast (punya No. WA)</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('sent');
            setSelectedGuestIds([]);
          }}
          className={`text-left bg-white rounded-xl border px-3.5 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'sent' ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-emerald-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-800">Sudah Dikirim</span>
            <span className="text-lg font-bold font-mono tabular-nums text-emerald-700">
              {stats.sent.toLocaleString('id-ID')}
            </span>
          </div>
          <p className="text-[11px] text-emerald-700/80 mt-0.5 truncate">
            Fonnte <span className="font-mono font-semibold">{stats.sentFonnte}</span> · Manual{' '}
            <span className="font-mono font-semibold">{stats.sentManual}</span>
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('failed');
            setSelectedGuestIds([]);
          }}
          className={`text-left bg-white rounded-xl border px-3.5 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'failed' ? 'border-rose-400 ring-1 ring-rose-200' : 'border-rose-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-rose-800">Gagal Kirim</span>
            <span className="text-lg font-bold font-mono tabular-nums text-rose-600">
              {stats.failed.toLocaleString('id-ID')}
            </span>
          </div>
          <p className="text-[11px] text-rose-600/80 mt-0.5 truncate">Periksa nomor atau kirim ulang</p>
        </button>
      </div>

      {/* Collapsible Composer & WhatsApp Preview Bar (Option 1: Compact by default so table stays focused) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-slate-50/40">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Template selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Template:</span>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="h-8.5 border border-slate-300 rounded-lg px-2.5 text-xs font-medium bg-white text-slate-800 focus:ring-indigo-500 focus:border-indigo-500 max-w-[190px]"
              >
                {waTemplates.length === 0 && <option value="">Default Pesan Sistem</option>}
                {waTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Compact Media Mode Switcher */}
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80">
              <button
                type="button"
                onClick={() => setMediaMode('einvite')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  mediaMode === 'einvite'
                    ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Kartu E-Invite</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaMode('thumbnail')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  mediaMode === 'thumbnail'
                    ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ImageIcon className="w-3 h-3" />
                <span>Thumbnail</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaMode('text')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  mediaMode === 'text'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageCircle className="w-3 h-3" />
                <span>Teks</span>
              </button>
            </div>

            {/* Delay selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Jeda:</span>
              <select
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
                className="h-8.5 border border-slate-300 rounded-lg px-2.5 text-xs font-medium bg-white text-slate-800 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value={4000}>Aman (4 dtk)</option>
                <option value={2500}>Cepat (2.5 dtk)</option>
                <option value={6000}>Ekstra Aman (6 dtk)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isMessageCustomized && (
              <button
                type="button"
                onClick={() => handleSelectTemplate(selectedTemplateId)}
                className="h-8.5 px-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsComposerOpen((prev) => !prev)}
              className={`h-8.5 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                isComposerOpen
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isComposerOpen ? 'Tutup Editor & Pratinjau' : 'Edit Pesan & Pratinjau WA'}</span>
              {isComposerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Expandable Message Editor & WhatsApp Bubble Preview */}
        {isComposerOpen && (
          <div className="p-4 sm:p-5 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left: Editor filling full column height (zero empty whitespace) */}
            <div className="lg:col-span-7 flex flex-col space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">Isi Pesan Undangan</label>
                <div className="flex flex-wrap gap-1">
                  {['[GUEST_NAME]', '[EVENT_TITLE]', '[QR_LINK]', '[INVITE_LINK]', '[SENDER_NAME]'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setMessageText((prev) => `${prev} ${tag}`);
                        setIsMessageCustomized(true);
                      }}
                      className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded border border-slate-200 transition-colors cursor-pointer"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={messageText}
                onChange={(e) => {
                  setMessageText(e.target.value);
                  setIsMessageCustomized(true);
                }}
                className="w-full flex-1 min-h-[260px] border border-slate-300 rounded-lg p-3 text-xs sm:text-sm text-slate-800 focus:ring-indigo-500 focus:border-indigo-500 bg-white leading-relaxed resize-y"
              />

              <p className="text-[11px] text-slate-500 leading-snug">
                {mediaMode === 'einvite'
                  ? 'Mode Kartu E-Invitation mengirim gambar 16:9 personal berisi nama tamu & QR tiket di atas pesan.'
                  : mediaMode === 'thumbnail'
                  ? 'Mode Thumbnail mengirim poster/foto acara dalam format JPG agar tampil bersih di WhatsApp.'
                  : 'Mode Teks mengandalkan link preview otomatis tanpa lampiran gambar langsung.'}
              </p>
            </div>

            {/* Right: Controlled-height Live WhatsApp Bubble Preview */}
            <div className="lg:col-span-5 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pratinjau WhatsApp</span>
                </div>
                {guests.length > 0 && (
                  <select
                    value={previewGuest.id || ''}
                    onChange={(e) => setPreviewGuestId(e.target.value)}
                    className="max-w-[170px] h-7 text-[11px] border border-slate-200 rounded-md px-2 bg-white text-slate-700"
                    title="Pilih tamu untuk pratinjau"
                  >
                    {guests.slice(0, 30).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex-1 rounded-xl border border-slate-200 bg-[#EFEAE2] p-3.5 max-h-[430px] overflow-y-auto">
                <div className="bg-white rounded-xl rounded-tl-xs shadow-xs border border-black/5 p-2.5 max-w-full space-y-2">
                  {mediaMode === 'einvite' && event && (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-[#FAF6F2] aspect-[1200/675]">
                      <EInvitationCard
                        event={event}
                        guest={previewGuest}
                        className="w-full h-full"
                      />
                    </div>
                  )}

                  {mediaMode === 'thumbnail' && (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-[#FAF6F2] flex items-center justify-center aspect-video">
                      {previewImgSrc ? (
                        <>
                          {previewImgLoading && !previewImgError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-100 text-slate-500 z-10">
                              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                              <span className="text-[11px] font-medium">Memuat pratinjau...</span>
                            </div>
                          )}
                          {previewImgError ? (
                            <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-slate-500">
                              <ImageIcon className="w-6 h-6 text-slate-400" />
                              <span className="text-[11px]">Pratinjau gambar gagal dimuat.</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setThumbnailCandidateIdx(0);
                                  setPreviewImgError(false);
                                  setPreviewImgLoading(true);
                                  setPreviewRetryCount((c) => c + 1);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Muat Ulang</span>
                              </button>
                            </div>
                          ) : (
                            <img
                              src={previewImgSrc}
                              alt="Pratinjau Thumbnail Acara"
                              onLoad={() => setPreviewImgLoading(false)}
                              onError={() => {
                                if (thumbnailCandidateIdx + 1 < thumbnailPreviewCandidates.length) {
                                  setThumbnailCandidateIdx((idx) => idx + 1);
                                } else {
                                  setPreviewImgLoading(false);
                                  setPreviewImgError(true);
                                }
                              }}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center text-slate-500">
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                          <span className="text-[11px]">Belum ada foto thumbnail pada acara ini.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {mediaMode === 'text' && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800 block">Link Preview Otomatis (OG Card)</span>
                      <span className="truncate block text-indigo-600">{previewPayload.qrLink}</span>
                    </div>
                  )}

                  <div className="text-xs text-slate-800 leading-relaxed break-words px-1">
                    {renderWhatsAppPreviewNodes(previewPayload.message)}
                  </div>

                  <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 px-1 pt-0.5">
                    <span>10:30</span>
                    <CheckCheck className="w-3.5 h-3.5 text-sky-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Progress Banner during Broadcast */}
      {isBlasting && blastProgress && (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Sedang Mengirim Undangan ({blastProgress.current} / {blastProgress.total})
                </p>
                <p className="text-xs text-slate-500">
                  Memproses: <span className="font-medium text-slate-800">{blastProgress.currentGuestName}</span> ·
                  Terkirim: <span className="font-mono font-semibold text-emerald-700">{blastProgress.sent}</span> ·
                  Gagal: <span className="font-mono font-semibold text-rose-600">{blastProgress.failed}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                abortBlastRef.current = true;
              }}
              className="h-9 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <PauseCircle className="w-4 h-4" />
              <span>Hentikan Broadcast</span>
            </button>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{
                width: `${Math.round((blastProgress.current / Math.max(1, blastProgress.total)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Guest Dispatch List & Controls */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
          {/* Top Action Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'pending', label: `Belum Dikirim (${stats.pending})` },
                  { id: 'sent', label: `Sudah Dikirim (${stats.sent})` },
                  { id: 'failed', label: `Gagal (${stats.failed})` },
                  { id: 'no_phone', label: `Tanpa No. HP (${stats.noPhone})` },
                  { id: 'all', label: `Semua (${stats.total})` },
                ] as { id: StatusFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setSelectedGuestIds([]);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedTargets.length > 0 && (
                <button
                  type="button"
                  disabled={isBlasting}
                  onClick={() => runBroadcast(selectedTargets, 'Terpilih')}
                  className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim Terpilih ({selectedTargets.length})</span>
                </button>
              )}

              {failedTargets.length > 0 && (
                <button
                  type="button"
                  disabled={isBlasting}
                  onClick={() => runBroadcast(failedTargets, 'Ulang yang Gagal')}
                  className="h-9 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Kirim Ulang Gagal ({failedTargets.length})</span>
                </button>
              )}

              <button
                type="button"
                disabled={isBlasting || pendingTargets.length === 0}
                onClick={() => runBroadcast(pendingTargets, 'Belum Dikirim')}
                className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Blast Belum Dikirim ({pendingTargets.length})</span>
              </button>
            </div>
          </div>

          {/* Search & Attribute Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama tamu, no. HP, kode tiket..."
                className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-lg text-xs sm:text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 border border-slate-200 rounded-lg px-3 text-xs sm:text-sm bg-white text-slate-700"
            >
              <option value="all">Semua Kategori</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              className="h-9 border border-slate-200 rounded-lg px-3 text-xs sm:text-sm bg-white text-slate-700"
            >
              <option value="all">Semua Sesi</option>
              {availableSessions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {filteredGuests.length === 0 ? (
          <div className="p-8 text-center space-y-2.5">
            <p className="text-slate-600 text-sm font-medium">
              {statusFilter === 'pending' && stats.noPhone > 0 && stats.pending === 0
                ? `Belum ada tamu dengan nomor WhatsApp (${stats.noPhone} tamu saat ini belum memiliki No. HP).`
                : 'Tidak ada data tamu pada filter status ini.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {statusFilter !== 'all' && guests.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer"
                >
                  Tampilkan Semua Tamu ({guests.length})
                </button>
              )}
              {statusFilter === 'pending' && stats.noPhone > 0 && (
                <Link
                  to={`/auth/login/events/${eventId}`}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
                >
                  Lengkapi No. HP di Daftar Tamu
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedGuestIds(allFilteredSelectableIds);
                        } else {
                          setSelectedGuestIds([]);
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3">Tamu</th>
                  <th className="px-4 py-3">No. WhatsApp</th>
                  <th className="px-4 py-3">Kategori / Sesi</th>
                  <th className="px-4 py-3">Status Pengiriman</th>
                  <th className="px-4 py-3 text-right">Aksi Kirim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-sm">
                {filteredGuests.map((guest) => {
                  const entry = guest.id ? dispatchMap[guest.id] : undefined;
                  const status = entry?.status || 'pending';
                  const validPhone = hasValidPhone(guest);
                  const isSendingThis = sendingGuestId === guest.id;
                  const fullName = formatGuestFullName(guest.name, guest.title);

                  return (
                    <tr key={guest.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          disabled={!validPhone || isBlasting}
                          checked={Boolean(guest.id && selectedGuestIds.includes(guest.id))}
                          onChange={(e) => {
                            if (!guest.id) return;
                            if (e.target.checked) {
                              setSelectedGuestIds((prev) => [...prev, guest.id!]);
                            } else {
                              setSelectedGuestIds((prev) => prev.filter((id) => id !== guest.id));
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{fullName}</div>
                        <div className="text-xs font-mono text-slate-400">{guest.ticketCode}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {validPhone ? (
                          guest.phone
                        ) : (
                          <span className="text-slate-400 font-sans">Belum ada nomor</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        <span>{guest.category || 'Reguler'}</span>
                        {guest.session ? (
                          <>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span>{guest.session}</span>
                          </>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {status === 'sent' ? (
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                Terkirim ({entry?.method === 'manual' ? 'Manual' : 'Fonnte'})
                              </span>
                            </div>
                            {entry?.sentAt && (
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums pl-5">
                                {formatWaTimestamp(entry.sentAt)}
                                {(entry.count || 1) > 1 ? ` · ${entry.count}x` : ''}
                              </div>
                            )}
                          </div>
                        ) : status === 'failed' ? (
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1.5 font-semibold text-rose-600">
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>Gagal Kirim</span>
                            </div>
                            {entry?.lastError && (
                              <div className="text-[11px] text-rose-600/90 pl-5 max-w-[240px] truncate" title={entry.lastError}>
                                {entry.lastError}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-slate-500 font-medium">
                            <Clock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                            <span>Belum Dikirim</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={!validPhone || isBlasting || isSendingThis}
                            onClick={() => handleSendSingleFonnte(guest)}
                            className="h-8 px-2.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Kirim otomatis via Fonnte"
                          >
                            {isSendingThis ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>{status === 'sent' ? 'Kirim Ulang' : 'Kirim'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBlasting || preparingManualGuestId === guest.id}
                            onClick={() => handleSendManualWA(guest)}
                            className="h-8 px-2.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                            title="Buka WhatsApp Manual dan tandai sudah dikirim"
                          >
                            {preparingManualGuestId === guest.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <MessageCircle className="w-3.5 h-3.5" />
                            )}
                            <span>{preparingManualGuestId === guest.id ? 'Siapkan...' : 'Manual'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (guest.id) setPreviewGuestId(guest.id);
                              setIsComposerOpen(true);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 inline-flex items-center justify-center transition-colors cursor-pointer"
                            title="Lihat pratinjau pesan & E-Invitation tamu ini"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleManualStatus(guest)}
                            className={`h-8 w-8 rounded-lg border inline-flex items-center justify-center transition-colors cursor-pointer ${
                              status === 'sent'
                                ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                                : 'border-slate-200 bg-white text-slate-400 hover:text-emerald-600 hover:border-emerald-200'
                            }`}
                            title={
                              status === 'sent'
                                ? 'Reset status ke Belum Dikirim'
                                : 'Tandai Sudah Dikirim secara manual'
                            }
                          >
                            {status === 'sent' ? <Check className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky Bulk Action Bar when guests are checked */}
      {selectedTargets.length > 0 && !isBlasting && (
        <div className="sticky bottom-4 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto bg-slate-900 text-white rounded-xl shadow-lg border border-slate-800 px-4 py-2.5 flex items-center gap-3">
            <span className="text-xs font-medium">
              <strong className="font-mono tabular-nums">{selectedTargets.length}</strong> tamu dipilih
            </span>
            <button
              type="button"
              onClick={() => runBroadcast(selectedTargets, 'Terpilih')}
              className="h-8 px-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Kirim Sekarang</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedGuestIds([])}
              className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer"
              title="Batalkan pilihan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* Off-screen 1200x675 E-Invitation Card render stage (auto-captured to JPEG & uploaded to R2) */}
      {event && (
        <div
          aria-hidden="true"
          className="fixed -left-[9999px] top-0 pointer-events-none select-none z-[-1]"
        >
          <EInvitationCard
            event={event}
            guest={cardRenderGuest || previewGuest}
            cardRef={hiddenEInviteRef}
            fixedWidthPx={1200}
          />
        </div>
      )}
    </div>
  );
}
