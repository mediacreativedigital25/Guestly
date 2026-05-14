import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EventRecord, Guest } from '../types';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { parseFirestoreDate } from '../lib/utils';

const THEMES = {
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
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rsvpStatus, setRsvpStatus] = useState('attending');
  const [wishes, setWishes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorObj, setErrorObj] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        if (eventId) {
          const eventDoc = await getDoc(doc(db, 'events', eventId));
          if (eventDoc.exists()) {
            setEventData({ id: eventDoc.id, ...eventDoc.data() } as EventRecord);
          }

          const guestsRef = collection(db, 'events', eventId, 'guests');
          const q = query(guestsRef, orderBy('createdAt', 'desc'));
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest));
          setGuestsWithWishes(data.filter(g => g.wishes || g.rsvpStatus));
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
      
      const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const payload: any = {
        eventId: eventId!,
        name: name.trim(),
        ticketCode: ticketCode,
        rsvpStatus: rsvpStatus as any,
        attended: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      if (phone.trim()) payload.phone = phone.trim();
      if (wishes.trim()) payload.wishes = wishes.trim();

      const guestRef = await addDoc(collection(db, 'events', eventId!, 'guests'), payload);
      
      // Update local list
      const newGuest: Guest = { 
        id: guestRef.id, 
        ...payload, 
        createdAt: new Date() 
      } as unknown as Guest;
      
      setGuestsWithWishes(prev => [newGuest, ...prev]);
      setSubmitSuccess(true);
      
      // Reset form
      setName('');
      setPhone('');
      setWishes('');
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
    <div className={`${isEmbed ? 'p-0 bg-transparent' : `min-h-screen ${theme.bgApp} py-12 px-4 sm:px-6 lg:px-8`} ${theme.font} flex flex-col items-center`}>
       <div className="max-w-2xl w-full">
         <div className={`${isDark || theme.cardOverride ? theme.cardOverride : 'bg-white'} ${isEmbed ? 'rounded-none shadow-none border-none' : 'rounded-2xl shadow-xl overflow-hidden mb-8 border border-gray-100'}`}>
           
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
               </div>
               {/* Decorative circles */}
               <div className="absolute top-0 left-0 -mt-8 -ml-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
               <div className="absolute bottom-0 right-0 -mb-8 -mr-8 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
             </div>
           )}

           <div className={`${isEmbed ? 'p-4 sm:p-6' : 'p-6 sm:p-10'} ${isDark ? 'text-white' : ''}`}>
             {submitSuccess ? (
                <div className="text-center py-8">
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Terima Kasih!</h2>
                  <p className={`mb-8 max-w-sm mx-auto ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    Konfirmasi kehadiran dan pesan Anda telah berhasil dikirim.
                  </p>
                  <button 
                    onClick={() => setSubmitSuccess(false)}
                    className={`inline-flex justify-center px-6 py-3 border border-transparent text-base font-medium rounded-xl transition-colors ${theme.btnSecondary}`}
                  >
                    Kirim Pesan Lain
                  </button>
                </div>
             ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {errorObj && (
                    <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <p>{errorObj}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Nama Lengkap <span className="text-red-500">*</span></label>
                      <input 
                        required 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        type="text" 
                        className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white placeholder-neutral-500' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'} rounded-xl px-4 py-3 transition-colors ${theme.ringColor}`} 
                        placeholder="Contoh: Budi Santoso" 
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>No. WhatsApp</label>
                      <input 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                        type="text" 
                        className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white placeholder-neutral-500' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'} rounded-xl px-4 py-3 transition-colors ${theme.ringColor}`} 
                        placeholder="Contoh: 08123456789" 
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Hanya untuk keperluan notifikasi acara.</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Konfirmasi Kehadiran <span className="text-red-500">*</span></label>
                    <select 
                      value={rsvpStatus} 
                      onChange={e => setRsvpStatus(e.target.value)} 
                      className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white' : 'border-gray-300 bg-white text-gray-900'} rounded-xl px-4 py-3 transition-colors ${theme.ringColor}`}
                    >
                      <option value="attending">Hadir</option>
                      <option value="pending">Masih Ragu</option>
                      <option value="declined">Tidak Hadir</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Ucapan & Doa</label>
                    <textarea 
                      value={wishes} 
                      onChange={e => setWishes(e.target.value)} 
                      className={`w-full border ${isDark ? 'border-neutral-700 bg-neutral-800 text-white placeholder-neutral-500' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'} rounded-xl px-4 py-3 resize-none h-28 transition-colors ${theme.ringColor}`} 
                      placeholder="Tuliskan ucapan dan doa untuk penyelenggara acara..." 
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={submitting}
                    className={`w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-base transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${theme.btnPrimary}`}
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className={`w-5 h-5 animate-spin ${theme.spinner}`} /> Mengirim...
                      </span>
                    ) : 'Kirim RSVP'}
                  </button>
                </form>
             )}
           </div>
         </div>
         
         {/* Wishes List */}
         {guestsWithWishes.length > 0 && (
           <div className={`${isDark || theme.cardOverride ? theme.cardOverride : 'bg-white'} ${isEmbed ? `rounded-none shadow-none border-t ${isDark ? 'border-neutral-800' : 'border-gray-100'} p-4 sm:p-6 mt-8` : `rounded-2xl shadow-xl border ${isDark ? 'border-neutral-800' : 'border-gray-100'} p-6 sm:p-10 mb-12`} overflow-hidden`}>
             <h2 className={`text-2xl font-bold mb-6 text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>Ucapan & Doa ({guestsWithWishes.length})</h2>
             <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {guestsWithWishes.map((guest, idx) => (
                  <div key={guest.id || idx} className={`${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-100'} rounded-xl p-5 border flex items-start gap-4`}>
                    <div className={`h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-lg ${theme.avatarBg}`}>
                      {guest.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{guest.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          guest.rsvpStatus === 'attending' ? (isDark ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800') : 
                          guest.rsvpStatus === 'declined' ? (isDark ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800') : 
                          (isDark ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-800')
                        }`}>
                          {guest.rsvpStatus === 'attending' ? 'Hadir' : guest.rsvpStatus === 'declined' ? 'Tidak Hadir' : 'Masih Ragu'}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 mb-2 ${isDark ? 'text-neutral-500' : 'text-gray-500'}`}>
                        {guest.createdAt && (guest.createdAt as any).seconds 
                          ? parseFirestoreDate(guest.createdAt)?.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) 
                          : 'Baru saja'}
                      </p>
                      {guest.wishes && (
                        <p className={`text-sm whitespace-pre-wrap ${isDark ? 'text-neutral-300' : 'text-gray-700'}`}>{guest.wishes}</p>
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
