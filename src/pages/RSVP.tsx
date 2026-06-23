import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useState, useEffect } from 'react';
import { doc, getDocs, updateDoc, serverTimestamp, query, collection, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Guest, EventRecord } from '../types';
import { useSettings } from '../SettingsContext';
import { Heart, Ticket, Calendar, Clock, MapPin, MessageCircle, Loader2 } from 'lucide-react';

export default function RSVP() {
  const { eventId, ticketCode } = useParams();
  const { settings } = useSettings();
  const [guest, setGuest] = useState<Guest | null>(null);
  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [wishesInput, setWishesInput] = useState('');
  const [sessionInput, setSessionInput] = useState('');
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
    const fetchRSVP = async () => {
      try {
        const guestsRef = collection(db, 'events', eventId!, 'guests');
        const q = query(guestsRef, where('ticketCode', '==', ticketCode));
        const snapshot = await getDocs(q);
        
        let currentSession = '';
        if (!snapshot.empty) {
           const guestDoc = snapshot.docs[0];
           const guestData = { id: guestDoc.id, ...guestDoc.data() } as Guest;
           setGuest(guestData);
           if (guestData.wishes) setWishesInput(guestData.wishes);
           if (guestData.session) {
             setSessionInput(guestData.session);
             currentSession = guestData.session;
           }
        }

        const { getDoc } = await import('firebase/firestore');
        const eventSnap = await getDoc(doc(db, 'events', eventId!));
        if (eventSnap.exists()) {
           const eventData = eventSnap.data() as EventRecord;
           if (eventData) {
        document.title = eventData.title || (eventData.coupleName ? `The Wedding Of ${eventData.coupleName}` : 'Undangan Acara');
      }
      setEventData(eventData);
           if (eventData.sessions && eventData.sessions.length > 0 && !currentSession) {
             setSessionInput(eventData.sessions[0]);
           }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    if (eventId && ticketCode) fetchRSVP();
  }, [eventId, ticketCode]);

  const handleUpdateRSVP = async (status: 'attending' | 'declined') => {
    if (!guest?.id) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'events', eventId!, 'guests', guest.id), {
        rsvpStatus: status,
        wishes: wishesInput,
        session: sessionInput,
        updatedAt: serverTimestamp()
      });
      setGuest({ ...guest, rsvpStatus: status, wishes: wishesInput, session: sessionInput });
    } catch (error) {
       console.error("RSVP update failed. ", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#FFF5F6] flex flex-col items-center justify-center font-sans">
      <Loader2 className="w-12 h-12 text-[#A13444] animate-spin mb-4" />
      <div className="text-[#A13444] text-lg font-medium">Memuat undangan...</div>
    </div>
  );

  if (!guest) return (
    <div className="min-h-screen bg-[#FFF5F6] flex items-center justify-center px-4 font-sans text-center">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full">
        <p className="text-[#A13444] text-lg font-medium">Layanan tidak ditemukan</p>
        <p className="text-gray-500 mt-2">Undangan Anda tidak valid atau telah dihapus.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FCF8F8] py-8 px-4 sm:px-6 flex justify-center items-center font-sans overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
      `}</style>
      
      <div className="max-w-md w-full bg-white rounded-[32px] overflow-hidden shadow-[0_10px_40px_-10px_rgba(200,100,120,0.15)] relative border border-rose-50 flex flex-col">
        
        {/* Header Section */}
        <div className="bg-gradient-to-b from-[#fdf2f4] to-[#fce4e8] pt-12 pb-24 relative text-center flex-shrink-0 z-0">
          
          {/* Subtle floral background layer */}
          <div 
            className="absolute top-0 left-0 w-full h-full opacity-15 pointer-events-none mix-blend-multiply" 
            style={{ 
              backgroundImage: "url('https://images.unsplash.com/photo-1543851502-0e9bd28af756?auto=format&fit=crop&w=800&q=80')", 
              backgroundSize: 'cover',
              backgroundPosition: 'center 30%',
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%)'
            }}
          />

          <div className="relative z-10 px-6">
            {settings?.logoUrl && (
               <img src={settings.logoUrl} alt="Logo" className="h-auto max-h-12 w-auto max-w-[180px] object-contain mx-auto opacity-80 mix-blend-multiply" />
            )}
            
            <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase mt-10 mb-2 text-[#C47E88]">Anda Diundang</h2>
            <h1 className="text-4xl sm:text-[42px] leading-[1.1] font-playfair italic font-bold text-[#A13444] mb-4">
              {eventData?.coupleName ? (
                <>
                  The Wedding Of<br/>
                  <span className="block mt-2">{eventData.coupleName}</span>
                </>
              ) : (
                eventData?.title || 'Acara Guestly'
              )}
            </h1>
            <div className="flex justify-center text-rose-200">
               <Heart size={14} fill="currentColor" />
            </div>
            <p className="text-[#8e6b70] mt-4 text-[13px] max-w-[280px] mx-auto leading-relaxed">
              Kami sangat senang mengundang Anda ke acara kami mendatang. Mohon simpan tanggalnya.
            </p>
          </div>

          {/* SVG Wave */}
          <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none z-10">
              <svg className="relative block w-full h-[30px] sm:h-[40px]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
                  <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V0.5C72.7,21.6,150.1,43.2,217.1,53.2a50.2,50.2,0,0,0,104.29,3.24Z" fill="#ffffff"></path>
              </svg>
          </div>
        </div>
        
        {/* Body Section */}
        <div className="bg-white px-6 pb-10 relative z-10 -mt-1 flex-1">
          <div className="text-center pt-2">
            <span className="text-[#8e6b70] text-[13px] tracking-wider">Kepada</span>
            <h3 className="text-[#A13444] text-[22px] font-semibold mt-1 font-playfair">{guest.name},</h3>
            <div className="flex justify-center my-3 text-rose-200">
                <Heart size={12} fill="currentColor" />
            </div>
          </div>
          
          <div className="mt-4 flex justify-center">
            <div className="p-4 bg-white rounded-2xl shadow-[0_4px_20px_-5px_rgba(200,100,120,0.15)] border border-rose-50 ring-1 ring-rose-50/50">
               <QRCode value={guest.ticketCode} size={150} />
            </div>
          </div>
          
          <p className="text-center text-[#8e6b70] text-[13px] mt-4 mb-8 max-w-[250px] mx-auto leading-tight">
            Tunjukkan QR Code ini saat registrasi atau check-in di lokasi acara
          </p>

          <div className="relative mx-auto border-[1.5px] border-dashed border-rose-200 bg-rose-50/20 rounded-2xl p-4 text-center max-w-[280px]">
             {/* Left ticket cutout */}
             <div className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full border-r-[1.5px] border-dashed border-rose-200"></div>
             {/* Right ticket cutout */}
             <div className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full border-l-[1.5px] border-dashed border-rose-200"></div>
             
             <div className="flex flex-col items-center justify-center">
               <div className="flex items-center gap-2 mb-1.5 focus:outline-none">
                 <Ticket className="text-rose-300 transform -rotate-45" size={16} />
                 <p className="text-[11px] font-bold text-rose-400 tracking-[0.2em] uppercase">Kode Tiket</p>
               </div>
               <p className="font-mono text-[22px] text-[#A13444] font-bold tracking-[0.25em]">{guest.ticketCode}</p>
             </div>
          </div>

          <div className="mt-8 border border-rose-100 rounded-2xl p-5 sm:p-6 bg-[#FCF8F8] relative overflow-hidden">
             
             {/* Subtle botanical lines inside the box right */}
             <div className="absolute -right-8 -bottom-8 opacity-[0.03] pointer-events-none transform -rotate-12">
                <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#A13444" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 22-3-3m0 0 3-3m-3 3h8c1.657 0 3-1.343 3-3V5c0-1.657-1.343-3-3-3H6m-2 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8m-8 0v17" />
                  <path d="M12 12c-2-2.5-4-5-8-5 4 0 6 2.5-8 5zm0 0c2-2.5 4-5 8-5-4 0-6 2.5-8 5zm0 0v10" />
                </svg>
             </div>

             <div className="space-y-4.5 relative z-10 flex flex-col gap-4">
                 <div className="flex gap-4 items-start">
                     <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-rose-100 shadow-sm text-rose-400">
                       <Calendar size={16} />
                     </div>
                     <div>
                         <p className="text-[#8e6b70] text-[12px] uppercase tracking-wider font-medium mb-0.5">Tanggal</p>
                         <p className="text-[#A13444] font-medium text-[14px] leading-snug">{eventData?.date || 'Belum diatur'}</p>
                     </div>
                 </div>
                 <div className="flex gap-4 items-start">
                     <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-rose-100 shadow-sm text-rose-400">
                       <Clock size={16} />
                     </div>
                     <div>
                         <p className="text-[#8e6b70] text-[12px] uppercase tracking-wider font-medium mb-0.5">Waktu</p>
                         <p className="text-[#A13444] font-medium text-[14px] leading-snug">{eventData?.time || 'Belum diatur'}</p>
                     </div>
                 </div>
                 <div className="flex gap-4 items-start">
                     <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-rose-100 shadow-sm text-rose-400">
                       <MapPin size={16} />
                     </div>
                     <div>
                         <p className="text-[#8e6b70] text-[12px] uppercase tracking-wider font-medium mb-0.5">Lokasi</p>
                         <p className="text-[#A13444] font-medium text-[14px] leading-snug">{eventData?.location || 'Belum diatur'}</p>
                     </div>
                 </div>
             </div>
          </div>

          {timeLeft && (timeLeft.days > 0 || timeLeft.hours > 0 || timeLeft.minutes > 0 || timeLeft.seconds > 0) && (
            <div className="mt-8">
              <h4 className="text-center text-[#8e6b70] text-[11px] tracking-[0.2em] uppercase mb-4 font-bold">Menuju Hari Bahagia</h4>
              <div className="flex justify-center gap-3 sm:gap-4">
                {[
                  { label: 'Hari', value: timeLeft.days },
                  { label: 'Jam', value: timeLeft.hours },
                  { label: 'Menit', value: timeLeft.minutes },
                  { label: 'Detik', value: timeLeft.seconds }
                ].map((item, index) => (
                  <div key={index} className="flex flex-col items-center">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-2xl shadow-[0_4px_15px_-5px_rgba(200,100,120,0.1)] border border-rose-50 flex items-center justify-center mb-2">
                      <span className="text-xl sm:text-2xl font-bold font-playfair text-[#A13444]">
                        {item.value.toString().padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-[11px] text-[#A13444] font-medium tracking-wider uppercase">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-[#8e6b70] text-[13px] mt-8 mb-6 relative px-4 leading-relaxed">
             Merupakan suatu kebahagiaan bagi kami apabila Anda berkenan hadir serta memberikan doa dan restu kepada kami.
          </p>

          {!eventData?.disableTicketRsvpForm && (
            <div className="space-y-4">
              {eventData?.sessions && eventData.sessions.length > 0 && (
                 <div className="text-left">
                   <select 
                     value={sessionInput}
                     onChange={(e) => setSessionInput(e.target.value)}
                     className="w-full bg-[#fdf2f4] border border-rose-200 rounded-2xl px-4 py-3.5 focus:ring-rose-300 focus:border-rose-300 text-sm text-[#A13444] font-medium"
                   >
                     <option value="">-- Pilih Sesi Kehadiran --</option>
                     {eventData.sessions.map((ses) => (
                       <option key={ses} value={ses}>{ses}</option>
                     ))}
                   </select>
                 </div>
              )}
              
              <div className="relative border border-rose-200 rounded-2xl overflow-hidden focus-within:border-rose-400 focus-within:ring-2 focus-within:ring-rose-100 transition-all bg-white">
                  <div className="absolute left-4 top-4">
                      <MessageCircle className="text-rose-400" size={18} />
                  </div>
                  <div className="pl-12 pr-4 pt-3.5 pb-3">
                      <p className="text-[12px] text-rose-500 font-semibold tracking-wide mb-1">Pesan & Doa (Opsional)</p>
                      <textarea 
                          value={wishesInput} 
                          onChange={(e) => setWishesInput(e.target.value)}
                          className="w-full bg-transparent border-none p-0 focus:ring-0 text-[14px] text-gray-700 resize-none h-16 placeholder:text-gray-400" 
                          placeholder="Tulis pesan Anda di sini..."
                      />
                  </div>
              </div>

              <div className="pt-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => handleUpdateRSVP('attending')}
                    disabled={submitting}
                    className={`flex-1 py-3.5 px-4 rounded-2xl font-medium transition-all duration-300 text-[14px] ${guest.rsvpStatus === 'attending' ? 'bg-gradient-to-r from-[#A13444] to-[#B9707C] text-white shadow-md shadow-rose-200 scale-100' : 'bg-rose-50 text-[#A13444] hover:bg-rose-100'}`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {submitting && guest.rsvpStatus === 'attending' ? <Loader2 size={16} className="animate-spin" /> : null}
                      Hadir
                    </span>
                  </button>
                  <button
                    onClick={() => handleUpdateRSVP('declined')}
                    disabled={submitting}
                    className={`flex-1 py-3.5 px-4 rounded-2xl font-medium transition-all duration-300 text-[14px] ${guest.rsvpStatus === 'declined' ? 'bg-gray-800 text-white shadow-md scale-100' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800'}`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {submitting && guest.rsvpStatus === 'declined' ? <Loader2 size={16} className="animate-spin" /> : null}
                      Tidak Hadir
                    </span>
                  </button>
                </div>
                
                {guest.rsvpStatus !== 'pending' && (
                  <div className={`text-center text-[13px] font-medium mt-4 p-3 rounded-xl ${guest.rsvpStatus === 'attending' ? 'bg-[#fdf2f4] text-[#A13444]' : 'bg-gray-50 text-gray-600'}`}>
                    ✓ Anda telah {guest.rsvpStatus === 'attending' ? 'menerima' : 'menolak'} undangan ini
                  </div>
                )}
              </div>
            </div>
          )}

          {eventData?.disableTicketRsvpForm && (
            <div className="text-center text-sm font-medium text-[#A13444] bg-[#fdf2f4] p-4 rounded-xl">
              ✓ Akses Tiket Dibuka
            </div>
          )}

          <div className="mt-12 text-center pb-2 border-t border-rose-50 pt-8">
              <p className="text-[#8e6b70] text-[12px] mb-2 leading-relaxed">Atas perhatian dan kehadirannya,<br/>kami ucapkan terima kasih.</p>
              <p className="text-[#B9707C] text-[12px] italic">Hormat kami,</p>
              <h4 className="text-[#A13444] text-xl font-playfair font-bold mt-1.5">
                  {eventData?.coupleName || eventData?.title || 'Winda & Fajri'}
              </h4>
              <div className="flex justify-center mt-3 text-rose-300">
                  <Heart size={10} fill="currentColor" />
              </div>
          </div>
          
          <div className="absolute bottom-0 left-0 w-full h-[5px] bg-gradient-to-r from-rose-200 via-rose-300 to-rose-200 opacity-50"></div>
        </div>
      </div>
    </div>
  );
}

