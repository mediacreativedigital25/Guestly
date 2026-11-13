import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { db } from '../lib/firebase';
import { canUserAccessEvent, getUserBusinessId, resolveMediaUrl } from '../lib/utils';
import { Client, EventRecord, User } from '../types';

type MessageStyle = 'elegan' | 'ringkas';

interface UserWithPassword extends User {
  _password?: string;
}

export default function SendClientAccess() {
  const { eventId, clientId: paramClientId } = useParams<{ eventId?: string; clientId?: string }>();
  const navigate = useNavigate();
  const { appUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notFoundError, setNotFoundError] = useState('');

  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [clientData, setClientData] = useState<Client | null>(null);
  const [clientEvents, setClientEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [matchedUser, setMatchedUser] = useState<UserWithPassword | null>(null);

  // Form fields (auto-filled from DB, editable by admin)
  const [clientName, setClientName] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [usernameEmail, setUsernameEmail] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordFromDb, setPasswordFromDb] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [includePassword, setIncludePassword] = useState(true);
  const [loginUrl, setLoginUrl] = useState(`${window.location.origin}/auth/login`);
  const [messageStyle, setMessageStyle] = useState<MessageStyle>('elegan');

  // Custom message override
  const [isMessageEdited, setIsMessageEdited] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  // Copy feedback states
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isForbiddenRole =
    appUser?.role === 'client' || appUser?.role === 'staff' || appUser?.role === 'greeting';

  useEffect(() => {
    if (!appUser) return;

    if (isForbiddenRole) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setAccessDenied(false);
      setNotFoundError('');

      try {
        const isSuperAdmin = appUser.role === 'superadmin';
        const myBizId = getUserBusinessId(appUser) || appUser.id || '';
        const teamPartnerIds = new Set<string>(
          [appUser.id, appUser.partnerId, myBizId].filter(Boolean) as string[]
        );

        const usersSnap = await getDocs(collection(db, 'users'));
        const allUsers = usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as UserWithPassword[];

        if (!isSuperAdmin) {
          allUsers.forEach((u) => {
            if (
              (u.partnerId && teamPartnerIds.has(u.partnerId)) ||
              (u.createdBy && teamPartnerIds.has(u.createdBy)) ||
              (u.id && teamPartnerIds.has(u.id))
            ) {
              if (u.id) teamPartnerIds.add(u.id);
              if (u.partnerId) teamPartnerIds.add(u.partnerId);
            }
          });
        }

        let resolvedClientId = paramClientId || '';
        let resolvedEvent: EventRecord | null = null;

        if (eventId) {
          const evSnap = await getDoc(doc(db, 'events', eventId));
          if (!evSnap.exists()) {
            setNotFoundError('Data acara tidak ditemukan.');
            setLoading(false);
            return;
          }
          resolvedEvent = { id: evSnap.id, ...evSnap.data() } as EventRecord;

          if (!canUserAccessEvent(appUser, resolvedEvent.id, resolvedEvent.partnerId, Array.from(teamPartnerIds))) {
            setAccessDenied(true);
            setLoading(false);
            return;
          }

          setEventData(resolvedEvent);
          setEventTitle(resolvedEvent.title || '');
          setSelectedEventId(resolvedEvent.id || '');
          if (resolvedEvent.id) {
            setLoginUrl(`${window.location.origin}/auth/login?event=${resolvedEvent.id}`);
          }
          if (resolvedEvent.clientId) {
            resolvedClientId = resolvedEvent.clientId;
          }
        }

        let resolvedClient: Client | null = null;
        if (resolvedClientId) {
          const clSnap = await getDoc(doc(db, 'clients', resolvedClientId));
          if (clSnap.exists()) {
            resolvedClient = { id: clSnap.id, ...clSnap.data() } as Client;
            if (
              !isSuperAdmin &&
              resolvedClient.partnerId &&
              !teamPartnerIds.has(resolvedClient.partnerId)
            ) {
              setAccessDenied(true);
              setLoading(false);
              return;
            }
            setClientData(resolvedClient);
          } else if (paramClientId) {
            setNotFoundError('Data client tidak ditemukan.');
            setLoading(false);
            return;
          }
        }

        // If opened from Clients page, also load events belonging to this client
        if (paramClientId && resolvedClientId) {
          const evQ = query(collection(db, 'events'), where('clientId', '==', resolvedClientId));
          const evSnaps = await getDocs(evQ);
          const list = evSnaps.docs.map((d) => ({ id: d.id, ...d.data() } as EventRecord));
          setClientEvents(list);
          if (list.length > 0 && !resolvedEvent) {
            setSelectedEventId(list[0].id || '');
            setEventTitle(list[0].title || '');
            setEventData(list[0]);
            if (list[0].id) {
              setLoginUrl(`${window.location.origin}/auth/login?event=${list[0].id}`);
            }
          }
        }

        // Match corresponding User account (to get authoritative email & _password)
        const targetUid = resolvedEvent?.clientUid;
        const targetEmail = (
          resolvedClient?.contactEmail ||
          resolvedEvent?.clientEmail ||
          ''
        )
          .trim()
          .toLowerCase();

        const foundUser =
          allUsers.find((u) => targetUid && (u.id === targetUid || u.uid === targetUid)) ||
          allUsers.find((u) => resolvedClientId && u.clientId === resolvedClientId && u.role === 'client') ||
          allUsers.find((u) => resolvedClientId && u.clientId === resolvedClientId) ||
          allUsers.find((u) => targetEmail && (u.email || '').trim().toLowerCase() === targetEmail) ||
          null;

        setMatchedUser(foundUser);

        const initialName =
          resolvedClient?.name || foundUser?.name || resolvedEvent?.coupleName || '';
        const initialEmail =
          foundUser?.email || resolvedClient?.contactEmail || resolvedEvent?.clientEmail || '';
        const dbPassword = foundUser?._password || '';

        setClientName(initialName);
        setUsernameEmail(initialEmail);
        setPasswordValue(dbPassword);
        setPasswordFromDb(Boolean(dbPassword));
      } catch (err) {
        console.error('Error loading client access details:', err);
        setNotFoundError('Gagal memuat data akses client.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [appUser, eventId, paramClientId, isForbiddenRole]);

  const generatedMessage = useMemo(() => {
    const safeName = clientName.trim() || '[Nama Client]';
    const safeEvent = eventTitle.trim();
    const safeEmail = usernameEmail.trim() || '[Email Client]';
    const safePass = passwordValue.trim() || '[Tulis Password]';
    const safeLink = loginUrl.trim() || `${window.location.origin}/auth/login`;

    const passwordLine = includePassword ? `\n• *Password* : ${safePass}` : '';

    if (messageStyle === 'ringkas') {
      const eventPhrase = safeEvent ? ` untuk acara *${safeEvent}*` : '';
      return `*Akses Dashboard Buku Tamu Digital — Guestly*

Yth. *${safeName}*,

Layanan Buku Tamu Digital${eventPhrase} telah berhasil dibuat dan aktif. Silakan gunakan rincian akun berikut untuk mengakses dashboard Anda:

• *Nama Client* : ${safeName}
• *Username / Email* : ${safeEmail}${passwordLine}
• *Link Login* : ${safeLink}

Di dalam dashboard, Anda dapat menambahkan daftar tamu baru maupun memperbarui data tamu secara mandiri. Demi keamanan akun, kami menyarankan untuk segera mengganti kata sandi setelah login pertama kali.

Terima kasih atas kepercayaan Anda.`;
    }

    const eventPhrase = safeEvent ? ` untuk acara *${safeEvent}*` : '';
    return `✨ *Pemberitahuan Aktivasi Buku Tamu Digital — Guestly*

Halo Kak *${safeName}*,

Dengan senang hati kami informasikan bahwa sistem *Buku Tamu Digital*${eventPhrase} telah berhasil dibuat dan siap digunakan.

Berikut adalah rincian akses dashboard Anda:

• *Nama Client* : ${safeName}
• *Username / Email* : ${safeEmail}${passwordLine}
• *Link Login* : ${safeLink}

Melalui dashboard tersebut, Anda dapat menambahkan daftar tamu baru, mengedit data tamu, serta memantau seluruh informasi acara secara real-time dan mandiri.

*Catatan Keamanan:* Mohon simpan informasi akun ini dengan baik dan jangan membagikannya kepada pihak yang tidak berkepentingan. Kami menyarankan untuk memperbarui kata sandi setelah login pertama kali.

Apabila memerlukan bantuan atau penyesuaian data, silakan hubungi tim kami kapan saja. Terima kasih! 🙏`;
  }, [clientName, eventTitle, usernameEmail, passwordValue, includePassword, loginUrl, messageStyle]);

  const activeMessage = isMessageEdited ? customMessage : generatedMessage;

  const handleCopyText = async (text: string, fieldKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (fieldKey === 'full') {
        setCopiedFull(true);
        setTimeout(() => setCopiedFull(false), 2500);
      } else {
        setCopiedField(fieldKey);
        setTimeout(() => setCopiedField(null), 1800);
      }
    } catch {
      // Fallback for restricted clipboard environments
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (fieldKey === 'full') {
        setCopiedFull(true);
        setTimeout(() => setCopiedFull(false), 2500);
      } else {
        setCopiedField(fieldKey);
        setTimeout(() => setCopiedField(null), 1800);
      }
    }
  };

  const handleSelectClientEvent = (evId: string) => {
    setSelectedEventId(evId);
    const found = clientEvents.find((e) => e.id === evId);
    if (found) {
      setEventData(found);
      setEventTitle(found.title || '');
      setLoginUrl(`${window.location.origin}/auth/login?event=${found.id}`);
    } else {
      setEventData(null);
      setEventTitle('');
      setLoginUrl(`${window.location.origin}/auth/login`);
    }
  };

  const backTarget = eventId
    ? '/auth/login/events'
    : paramClientId
    ? '/auth/login/clients'
    : '/auth/login';

  if (loading) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-[#8C3A50]" />
        <p className="text-sm font-medium">Menyiapkan informasi akses client...</p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-sm mt-8">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-[#8C3A50] flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Akses Terbatas</h2>
        <p className="text-sm text-slate-600 mb-6">
          Anda tidak memiliki hak akses untuk melihat atau menyalin kredensial akun client.
        </p>
        <button
          type="button"
          onClick={() => navigate('/auth/login')}
          className="px-4 py-2 bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Kembali ke Dashboard
        </button>
      </div>
    );
  }

  if (notFoundError) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm mt-8">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Data Tidak Ditemukan</h2>
        <p className="text-sm text-slate-600 mb-6">{notFoundError}</p>
        <Link
          to={backTarget}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Compact Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link
            to={backTarget}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-[#8C3A50] hover:border-rose-200 hover:bg-rose-50 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali</span>
          </Link>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              passwordFromDb
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            <KeyRound className="w-3 h-3" />
            {passwordFromDb
              ? 'Password diambil otomatis dari database'
              : 'Password belum tercatat — isi manual'}
          </span>
        </div>

        {eventId && (
          <Link
            to={`/auth/login/events/${eventId}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors self-start sm:self-center shrink-0"
          >
            <Calendar className="w-3.5 h-3.5 text-[#8C3A50]" />
            Detail Acara
          </Link>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Rincian Akun & Pengaturan */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Rincian Akses Client</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ubah data di bawah ini jika ingin menyesuaikan isi pesan.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Nama Client */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Client
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Contoh: Irna & Acep"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8C3A50]/20 focus:border-[#8C3A50] transition-all"
                />
              </div>
            </div>

            {/* Nama Acara */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Acara / Buku Tamu <span className="text-slate-400 font-normal">(Opsional)</span>
              </label>
              {paramClientId && clientEvents.length > 0 && (
                <select
                  value={selectedEventId}
                  onChange={(e) => handleSelectClientEvent(e.target.value)}
                  className="w-full mb-2 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#8C3A50]/20 focus:border-[#8C3A50]"
                >
                  {clientEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                  <option value="">-- Tanpa menyertakan nama acara --</option>
                </select>
              )}
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Contoh: The Wedding Of Irna & Acep"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8C3A50]/20 focus:border-[#8C3A50] transition-all"
                />
              </div>
            </div>

            {/* Username / Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username (Email)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={usernameEmail}
                    onChange={(e) => setUsernameEmail(e.target.value)}
                    placeholder="email@client.com"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8C3A50]/20 focus:border-[#8C3A50] transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyText(usernameEmail, 'email')}
                  disabled={!usernameEmail}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:text-[#8C3A50] hover:border-rose-200 hover:bg-rose-50 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1 text-xs font-medium cursor-pointer"
                  title="Salin Email"
                >
                  {copiedField === 'email' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includePassword}
                    onChange={(e) => setIncludePassword(e.target.checked)}
                    className="rounded border-slate-300 text-[#8C3A50] focus:ring-[#8C3A50]"
                  />
                  Sertakan di pesan
                </label>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    disabled={!includePassword}
                    placeholder={
                      matchedUser
                        ? 'Tulis / sesuaikan password client'
                        : 'Akun user belum terhubung — tulis password'
                    }
                    className="w-full pl-9 pr-10 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8C3A50]/20 focus:border-[#8C3A50] disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyText(passwordValue, 'password')}
                  disabled={!passwordValue || !includePassword}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:text-[#8C3A50] hover:border-rose-200 hover:bg-rose-50 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1 text-xs font-medium cursor-pointer"
                  title="Salin Password"
                >
                  {copiedField === 'password' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Link Login */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Link Login
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={loginUrl}
                    onChange={(e) => setLoginUrl(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8C3A50]/20 focus:border-[#8C3A50] transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyText(loginUrl, 'link')}
                  disabled={!loginUrl}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:text-[#8C3A50] hover:border-rose-200 hover:bg-rose-50 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1 text-xs font-medium cursor-pointer"
                  title="Salin Link Login"
                >
                  {copiedField === 'link' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              {eventData && (
                <div className="mt-2.5 flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  {eventData.thumbnailUrl ? (
                    <img
                      src={resolveMediaUrl(eventData.thumbnailUrl)}
                      alt={eventData.title}
                      className="w-12 h-9 rounded-lg object-cover border border-slate-200 shrink-0 bg-white"
                    />
                  ) : (
                    <div className="w-12 h-9 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-[#8C3A50] shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-700 truncate">
                      Preview Thumbnail Link WhatsApp
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {eventData.thumbnailUrl
                        ? 'Menarik foto thumbnail acara ini secara otomatis.'
                        : 'Acara belum punya thumbnail — memakai branding Guestly.'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Gaya Bahasa Template */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Gaya Bahasa Pesan
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMessageStyle('elegan');
                    setIsMessageEdited(false);
                  }}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    messageStyle === 'elegan'
                      ? 'border-[#8C3A50] bg-rose-50/70 text-[#8C3A50]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Elegan & Profesional
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">Hangat & formal (Wedding)</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMessageStyle('ringkas');
                    setIsMessageEdited(false);
                  }}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    messageStyle === 'ringkas'
                      ? 'border-[#8C3A50] bg-rose-50/70 text-[#8C3A50]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold">Ringkas & Bisnis</div>
                  <div className="text-[11px] opacity-80 mt-0.5">Singkat & langsung ke inti</div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Preview & Copy Pesan */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Pratinjau Pesan Siap Kirim</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Anda dapat mengedit teks secara langsung sebelum disalin ke WhatsApp atau Email.
              </p>
            </div>
            {isMessageEdited && (
              <button
                type="button"
                onClick={() => setIsMessageEdited(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[#8C3A50] bg-slate-100 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset ke Template
              </button>
            )}
          </div>

          <textarea
            value={activeMessage}
            onChange={(e) => {
              setIsMessageEdited(true);
              setCustomMessage(e.target.value);
            }}
            rows={16}
            className="w-full flex-1 p-4 text-sm leading-relaxed text-slate-800 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8C3A50]/20 focus:border-[#8C3A50] focus:bg-white font-sans resize-y transition-all"
          />

          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-slate-500">
              Format pesan mendukung cetak tebal WhatsApp (<code className="px-1 py-0.5 bg-slate-100 rounded text-slate-700">*teks*</code>).
            </p>
            <button
              type="button"
              onClick={() => handleCopyText(activeMessage, 'full')}
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all cursor-pointer ${
                copiedFull
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[#8C3A50] hover:bg-[#722B3E]'
              }`}
            >
              {copiedFull ? (
                <>
                  <Check className="w-4 h-4" />
                  Pesan Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Salin Pesan Lengkap
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
