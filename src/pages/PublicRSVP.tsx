import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { collection, query, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EventRecord, Guest } from '../types';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { parseFirestoreDate } from '../lib/utils';

const THEMES: Record<string, {
  bgApp: string;
  bgHeader: string;
  btnPrimary: string;
  btnSecondary: string;
  ringColor: string;
  spinner: string;
  avatarBg: string;
  font: string;
  cardOverride?: string;
}> = {
  default: {
    bgApp: 'bg-gray-50',
    bgHeader: 'bg-indigo-600',
    btnPrimary: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 text-white',
    btnSecondary: 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100',
    ringColor: 'focus:ring-indigo-500 focus:border-indigo-500',
    spinner: 'text-indigo-600',
    avatarBg: 'bg-indigo-100 text-indigo-700',
    font: 'font-sans'
  },
  facebook: {
    bgApp: 'bg-[#f0f2f5]',
    bgHeader: 'bg-[#1877f2]',
    btnPrimary: 'bg-[#1877f2] hover:bg-[#166fe5] focus:ring-[#1877f2] text-white font-bold',
    btnSecondary: 'text-[#1877f2] bg-blue-50 hover:bg-blue-100',
    ringColor: 'focus:ring-[#1877f2] focus:border-[#1877f2]',
    spinner: 'text-[#1877f2]',
    avatarBg: 'bg-[#e4e6eb] text-[#050505]',
    font: 'font-sans'
  },
  gold: {
    bgApp: 'bg-stone-50',
    bgHeader: 'bg-gradient-to-r from-yellow-700 via-yellow-500 to-yellow-600',
    btnPrimary: 'bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 focus:ring-yellow-500 text-white shadow-md',
    btnSecondary: 'text-yellow-800 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200',
    ringColor: 'focus:ring-yellow-600 focus:border-yellow-600',
    spinner: 'text-yellow-600',
    avatarBg: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    font: 'font-serif'
  },
  tiktok: {
    bgApp: 'bg-neutral-900',
    bgHeader: 'bg-black border-b-[3px] border-b-[#00f2fe] drop-shadow-[0_4px_4px_rgba(255,0,80,0.5)]',
    btnPrimary: 'bg-[#fe2c55] hover:bg-[#e62045] focus:ring-[#fe2c55] text-white font-bold',
    btnSecondary: 'text-white bg-[#252525] hover:bg-[#333333] border border-[#333]',
    ringColor: 'focus:ring-[#25F4EE] focus:border-[#25F4EE] bg-neutral-800 text-white border-neutral-700 placeholder-neutral-500',
    spinner: 'text-[#fe2c55]',
    avatarBg: 'bg-black text-white border-2 border-[#25F4EE]',
    font: 'font-sans',
    cardOverride: 'bg-neutral-900 border-neutral-800 text-white'
  }
};

export default function PublicRSVP() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';
  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestsWithWishes, setGuestsWithWishes] = useState<Guest[]>([]);
  
  // Form state
  const [name, setName] = useState(searchParams.get('to') || searchParams.get('name') || '');
  const isNamePrefilled = Boolean(searchParams.get('to') || searchParams.get('name'));
  const [phone, setPhone] = useState(searchParams.get('phone') || '');
  const [rsvpStatus, setRsvpStatus] = useState('attending');
  const [sessionInput, setSessionInput] = useState(searchParams.get('session') || '');
  const [wishes, setWishes] = useState('');
  const [selectedSticker, setSelectedSticker] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  const STICKERS = ['❤️', '🎉', '🙏', '✨', '🔥', '🌸', '💍', '🕊️'];
  const [errorObj, setErrorObj] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);

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
          const timeMatch = eventData.time.match(/(\d{2}):(\d{2})/);
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
          seconds: Math.floor((difference / 1000) % 60)
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        if (eventId) {
          const eventDoc = await getDoc(doc(db, 'events', eventId));
          if (eventDoc.exists()) {
            const eData = { id: eventDoc.id, ...eventDoc.data() } as EventRecord;
            if (eData) {
              document.title = eData.title || (eData.coupleName ? `The Wedding Of ${eData.coupleName}` : 'Undangan Acara');
            }
            setEventData(eData);
          }

          const guestsRef = collection(db, 'events', eventId, 'guests');
          const q = query(guestsRef, orderBy('createdAt', 'desc'));
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest));
          setGuestsWithWishes(data.filter(g => g.wishes && g.wishes.trim().length > 0));
        }
      } catch (error) {
        console.error("Error fetching event data", error);
        setErrorObj("Gagal memuat data acara.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [eventId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorObj("Nama wajib diisi");
      return;
    }

    try {
      setSubmitting(true);
      setErrorObj(null);
      
      let existingGuest: Guest | null = null;
      let existingGuestId: string | null = null;
      
      const ticketParam = searchParams.get('ticket');
      
      if (ticketParam) {
        const q = query(collection(db, 'events', eventId!, 'guests'), where('ticketCode', '==', ticketParam || ''));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          existingGuestId = snapshot.docs[0].id;
          existingGuest = snapshot.docs[0].data() as Guest;
        }
      } else {
        // Fallback: check by name if no ticket provided (case-insensitive)
        const allGuestsSnapshot = await getDocs(collection(db, 'events', eventId!, 'guests'));
        const searchName = name.trim().toLowerCase();
        
        for (const doc of allGuestsSnapshot.docs) {
           const gData = doc.data() as Guest;
           if (gData.name && gData.name.trim().toLowerCase() === searchName) {
             existingGuestId = doc.id;
             existingGuest = gData;
             break;
           }
        }
      }
      
      let newGuest: Guest;

      if (existingGuestId && existingGuest) {
        const updatePayload: any = {
          rsvpStatus: rsvpStatus as any,
          updatedAt: serverTimestamp()
        };
        if (wishes.trim()) updatePayload.wishes = wishes.trim();
        if (sessionInput) updatePayload.session = sessionInput;
        if (phone.trim()) updatePayload.phone = phone.trim();
        if (selectedSticker) updatePayload.stickerUrl = selectedSticker;

        await updateDoc(doc(db, 'events', eventId!, 'guests', existingGuestId), updatePayload);
        newGuest = {
           ...existingGuest,
           ...updatePayload,
           id: existingGuestId,
           updatedAt: new Date(),
        } as unknown as Guest;
      } else {
        const payload: any = {
          name: name.trim(),
          rsvpStatus: rsvpStatus as any,
          updatedAt: serverTimestamp()
        };
        if (phone.trim()) payload.phone = phone.trim();
        if (wishes.trim()) payload.wishes = wishes.trim();
        if (sessionInput) payload.session = sessionInput;
        if (selectedSticker) payload.stickerUrl = selectedSticker;
        
        const ticketCode = ticketParam || Math.random().toString(36).substring(2, 10).toUpperCase();
        payload.eventId = eventId!;
        payload.ticketCode = ticketCode;
        payload.attended = false;
        payload.createdAt = serverTimestamp();
        
        const guestRef = await addDoc(collection(db, 'events', eventId!, 'guests'), payload);
        newGuest = { 
          id: guestRef.id, 
          ...payload, 
          createdAt: new Date() 
        } as unknown as Guest;
      }
      
      setGuestsWithWishes(prev => {
        const filtered = prev.filter(g => g.id !== newGuest.id);
        return [newGuest, ...filtered];
      });
      setSubmitSuccess(true);
      
      // Send Fonnte WhatsApp Notification if phone is provided
      let targetPhone = phone.trim();
      if (!targetPhone && existingGuest && existingGuest.phone) {
          targetPhone = existingGuest.phone;
      }

      if (targetPhone && rsvpStatus === 'attending') {
        import('../lib/fonnte').then(({ sendFonnteMessage }) => {
          const eventName = eventData?.title || 'acara kami';
          const coupleName = eventData?.coupleName ? `*${eventData.coupleName}*` : '*Penyelenggara Acara*';
          const qrLink = `${window.location.origin}/rsvp/${eventId}/${newGuest.ticketCode}`;
          
          const waMessage = `Hallo kak *${name.trim()}*,\n\nTerima kasih telah melakukan konfirmasi kehadiran (Hadir) pada acara *${eventName}*.\n\nKehadiran dan doa restu Anda sangat berarti bagi kami. Kami menantikan kehadiran Anda di acara nanti!\n\nIni adalah kode QR anda untuk check in:\n${qrLink}\n\nSalam Hangat,\n${coupleName}\n\n_Notifikasi otomatis dari Guestly,_\nInfo dan layanan\n085158636606`;

          sendFonnteMessage(null, targetPhone, waMessage).catch(console.error);
        }).catch(err => console.error("Failed to load fonnte module", err));
      }
      
      // Reset form
      if (!isNamePrefilled) {
        setName('');
      }
      if (!searchParams.get('phone')) {
        setPhone('');
      }
      setWishes('');
      if (!searchParams.get('session')) {
        setSessionInput('');
      }
      setSelectedSticker('');
      setRsvpStatus('attending');
      
    } catch (error: any) {
      console.error(error);
      setErrorObj(error.message || "Terjadi kesalahan saat mengirim RSVP");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
     return (
       <div className="flex justify-center items-center h-screen bg-gray-50">
         <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
       </div>
     );
  }

  if (!eventData) {
     return (
       <div className="flex flex-col justify-center items-center h-screen bg-gray-50 p-4">
         <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
         <h1 className="text-2xl font-bold text-gray-900 mb-2">Acara Tidak Ditemukan</h1>
         <p className="text-gray-500 text-center">Maaf, tautan tidak valid atau acara telah dihapus.</p>
       </div>
     );
  }

  const themeKey = (eventData.rsvpTheme as keyof typeof THEMES) || 'default';
  const theme = THEMES[themeKey] || THEMES.default;
  const isDark = themeKey === 'tiktok';

  return (
    <div className={`${isEmbed ? 'p-0 bg-transparent h-screen flex flex-col overflow-hidden' : `min-h-screen ${theme.bgApp} py-12 px-4 sm:px-6 lg:px-8`} ${theme.font} flex flex-col items-center`}>
       <div className={`max-w-2xl w-full ${isEmbed ? 'h-full flex flex-col' : ''}`}>
         <div className={`${isDark || theme.cardOverride ? theme.cardOverride : 'bg-white'} ${isEmbed ? 'rounded-none shadow-none border-none flex-none' : 'rounded-2xl shadow-xl overflow-hidden mb-8 border border-gray-100'}`}>
           
           {/* Header */}
           {!isEmbed && (
             <div className={`${theme.bgHeader} px-6 py-10 text-center relative overflow-hidden`}>
               <div className="relative z-10">
                 <span className="inline-block px-3 py-1 bg-white/20 text-white text-xs font-semibold rounded-full tracking-wider mb-4 uppercase">
                    RSVP & BUKU TAMU
                 </span>
                 <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 leading-tight">
                   {eventData.title}
                 </h1>
                 {timeLeft && (timeLeft.days > 0 || timeLeft.hours > 0 || timeLeft.minutes > 0 || timeLeft.seconds > 0) && (
                    <div className="mt-6 flex justify-center gap-2 sm:gap-4">
                      {[
                        { label: 'Hari', value: timeLeft.days },
                        { label: 'Jam', value: timeLeft.hours },
                        { label: 'Menit', value: timeLeft.minutes },
                        { label: 'Detik', value: timeLeft.seconds }
                      ].map((item, index) => (
                        <div key={index} className="flex flex-col items-center">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/30 flex items-center justify-center mb-1.5 shadow-lg">
                            <span className="text-xl sm:text-2xl font-bold text-white">
                              {item.value.toString().padStart(2, '0')}
                            </span>
                          </div>
                          <span className="text-[9px] sm:text-[11px] text-white/90 font-medium tracking-wider uppercase">{item.label}</span>
                        </div>
                      ))}
                    </div>
                 )}
               </div>
               {/* Decorative circles */}
               <div className="absolute top-0 left-0 -mt-8 -ml-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
               <div className="absolute bottom-0 right-0 -mb-8 -mr-8 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
             </div>
           )}

           <div className={`${isEmbed ? 'p-3 sm:p-4' : 'p-6 sm:p-10'} ${isDark ? 'text-white' : ''}`}>
             {submitSuccess ? (
                <div className="text-center py-6">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Terima Kasih!</h2>
                  <p className={`mb-6 max-w-sm mx-auto text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    Konfirmasi kehadiran dan pesan Anda telah berhasil dikirim.
                  </p>
                  <button 
                    onClick={() => setSubmitSuccess(false)}
                    className={`inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg transition-colors ${theme.btnSecondary}`}
                  >
                    Kirim Pesan Lain
                  </button>
                </div>
             ) : (
                <form onSubmit={handleSubmit} className={`${isEmbed ? 'space-y-4' : 'space-y-6'}`}>
                  {errorObj && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>{errorObj}</p>
                    </div>
                  )}

                  <div className={`grid grid-cols-1 ${isEmbed ? 'sm:grid-cols-2 gap-4' : 'md:grid-cols-2 gap-6'}`}>
                    <div className={`${isEmbed ? 'space-y-1' : 'space-y-1'}`}>
                      <label className={`block text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Nama Lengkap <span className="text-red-500">*</span></label>
                      <input 
                        required 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        type="text" 
                        readOnly={isNamePrefilled}
                        className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white placeholder-neutral-500' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'} ${isEmbed ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'} transition-colors ${theme.ringColor} ${isNamePrefilled ? 'cursor-not-allowed opacity-80' : ''}`} 
                        placeholder="Contoh: Budi Santoso" 
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className={`block text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No. WhatsApp</label>
                      <input 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                        type="text" 
                        className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white placeholder-neutral-500' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'} ${isEmbed ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'} transition-colors ${theme.ringColor}`} 
                        placeholder="Contoh: 08123456789" 
                      />
                      <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Hanya untuk keperluan notifikasi acara.</p>
                    </div>
                  </div>

                  {eventData?.sessions && eventData.sessions.length > 0 && (
                    <div className="space-y-1">
                      <label className={`block text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Sesi Acara</label>
                      <select 
                        value={sessionInput} 
                        onChange={e => setSessionInput(e.target.value)} 
                        className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white' : 'border-gray-300 bg-white text-gray-900'} ${isEmbed ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'} transition-colors ${theme.ringColor}`}
                      >
                        <option value="">-- Pilih Sesi --</option>
                        {eventData.sessions.map((ses, idx) => (
                          <option key={idx} value={ses}>{ses}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Konfirmasi Kehadiran <span className="text-red-500">*</span></label>
                    <select 
                      value={rsvpStatus} 
                      onChange={e => setRsvpStatus(e.target.value)} 
                      className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white' : 'border-gray-300 bg-white text-gray-900'} ${isEmbed ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'} transition-colors ${theme.ringColor}`}
                    >
                      <option value="attending">Hadir</option>
                      <option value="pending">Masih Ragu</option>
                      <option value="declined">Tidak Hadir</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Ucapan & Doa</label>
                    <textarea 
                      value={wishes} 
                      onChange={e => setWishes(e.target.value)} 
                      className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white placeholder-neutral-500' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'} ${isEmbed ? 'rounded-lg px-3 py-2 h-16 text-sm' : 'rounded-xl px-4 py-3 h-28'} resize-none transition-colors ${theme.ringColor}`} 
                      placeholder="Tuliskan ucapan dan doa untuk penyelenggara acara..." 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Pilih Stiker (Opsional)</label>
                    <div className="flex flex-wrap gap-2">
                      {STICKERS.map((sticker, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedSticker(selectedSticker === sticker ? '' : sticker)}
                          className={`text-2xl transition-transform hover:scale-110 focus:outline-none ${selectedSticker === sticker ? 'scale-125 drop-shadow-md bg-indigo-50 dark:bg-indigo-900/30 rounded-full' : 'opacity-70 grayscale-[30%]'}`}
                        >
                          {sticker}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={submitting}
                    className={`w-full flex justify-center ${isEmbed ? 'py-2.5 px-3 text-sm rounded-lg' : 'py-3.5 px-4 text-base rounded-xl'} border border-transparent shadow-sm font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${theme.btnPrimary}`}
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className={`w-4 h-4 animate-spin ${theme.spinner}`} /> Mengirim...
                      </span>
                    ) : 'Kirim RSVP'}
                  </button>
                </form>
             )}
           </div>
         </div>
         
         {/* Wishes List */}
         {guestsWithWishes.length > 0 && (
           <div className={`${isDark || theme.cardOverride ? theme.cardOverride : 'bg-white'} ${isEmbed ? `rounded-none shadow-none border-t ${isDark ? 'border-neutral-800' : 'border-gray-100'} p-3 sm:p-4 flex-1 flex flex-col overflow-hidden` : `rounded-2xl shadow-xl border ${isDark ? 'border-neutral-800' : 'border-gray-100'} p-6 sm:p-10 mb-12`} overflow-hidden`}>
             <h2 className={`${isEmbed ? 'text-base mb-3' : 'text-2xl mb-6'} font-bold text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>Ucapan & Doa ({guestsWithWishes.length})</h2>
             <div className={`${isEmbed ? 'space-y-3 flex-1 overflow-y-auto pr-1' : 'space-y-6 max-h-[600px] overflow-y-auto pr-2'} custom-scrollbar`}>
                {guestsWithWishes.map((guest, idx) => (
                  <div key={guest.id || idx} className={`${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-100'} ${isEmbed ? 'rounded-lg p-3' : 'rounded-xl p-5'} border flex items-start gap-3`}>
                    <div className={`${isEmbed ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-lg'} flex-shrink-0 rounded-full flex items-center justify-center font-bold ${theme.avatarBg}`}>
                      {guest.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <h3 className={`${isEmbed ? 'text-xs' : 'text-sm'} font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{guest.name}</h3>
                        <div className="flex items-center gap-2">
                          {guest.stickerUrl && (
                            <span className="text-lg leading-none drop-shadow-sm">{guest.stickerUrl}</span>
                          )}
                          <span className={`inline-flex items-center ${isEmbed ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-xs'} rounded font-semibold ${
                            guest.rsvpStatus === 'attending' ? (isDark ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800') : 
                            guest.rsvpStatus === 'declined' ? (isDark ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800') : 
                            (isDark ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-800')
                          }`}>
                            {guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Masih Ragu'}
                          </span>
                        </div>
                      </div>
                      <p className={`mt-0.5 mb-1 ${isEmbed ? 'text-[10px]' : 'text-xs'} ${isDark ? 'text-neutral-500' : 'text-gray-500'}`}>
                        {guest.createdAt && (guest.createdAt as any).seconds 
                          ? parseFirestoreDate(guest.createdAt)?.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) 
                          : 'Baru saja'}
                      </p>
                      {guest.wishes && (
                        <p className={`whitespace-pre-wrap ${isEmbed ? 'text-xs' : 'text-sm'} ${isDark ? 'text-neutral-300' : 'text-gray-700'}`}>{guest.wishes}</p>
                      )}
                    </div>
                  </div>
                ))}
             </div>
           </div>
         )}
       </div>
    </div>
  );
}
