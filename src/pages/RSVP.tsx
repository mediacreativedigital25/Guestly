import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useState, useEffect } from 'react';
import { doc, getDocs, updateDoc, serverTimestamp, query, collection, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Guest, EventRecord } from '../types';
import { useSettings } from '../SettingsContext';

export default function RSVP() {
  const { eventId, ticketCode } = useParams();
  const { settings } = useSettings();
  const [guest, setGuest] = useState<Guest | null>(null);
  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [wishesInput, setWishesInput] = useState('');

  useEffect(() => {
    const fetchRSVP = async () => {
      try {
        const guestsRef = collection(db, 'events', eventId!, 'guests');
        const q = query(guestsRef, where('ticketCode', '==', ticketCode));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
           const guestDoc = snapshot.docs[0];
           const guestData = { id: guestDoc.id, ...guestDoc.data() } as Guest;
           setGuest(guestData);
           if (guestData.wishes) setWishesInput(guestData.wishes);
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
        updatedAt: serverTimestamp()
      });
      setGuest({ ...guest, rsvpStatus: status, wishes: wishesInput });
    } catch (error) {
       console.error("RSVP update failed. ", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center p-12">Memuat undangan...</div>;

  if (!guest) return <div className="text-center p-12 text-gray-500">Undangan tidak ditemukan atau tidak valid.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-center font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-indigo-600 px-6 py-12 text-center text-white relative">
          {settings?.logoUrl && (
             <img src={settings.logoUrl} alt="Logo" className="absolute top-4 left-1/2 -translate-x-1/2 h-auto max-h-14 w-auto max-w-[200px] object-contain opacity-80" />
          )}
          <h2 className="text-sm font-medium tracking-widest uppercase mb-1 mt-4">Anda Diundang</h2>
          <h1 className="text-3xl font-bold font-serif italic mb-2">{eventData?.title || 'Acara Guestly'}</h1>
          <p className="opacity-90 mt-4 text-sm max-w-xs mx-auto">Kami sangat senang mengundang Anda ke acara kami mendatang. Mohon simpan tanggalnya.</p>
        </div>
        
        <div className="px-8 py-10">
          <p className="text-center text-gray-600 mb-8">Kepada <span className="font-semibold text-gray-900">{guest.name}</span>,</p>
          
          <div className="flex justify-center mb-8">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
               <QRCode value={guest.ticketCode} size={150} />
            </div>
          </div>
          
          <div className="text-center mb-8">
            <p className="text-sm tracking-widest text-gray-400 uppercase mb-1">Kode Tiket</p>
            <p className="font-mono text-lg font-medium tracking-[0.2em]">{guest.ticketCode}</p>
          </div>

          <div className="space-y-4">
            <div className="text-left mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Pesan & Doa (Opsional)</label>
              <textarea
                value={wishesInput}
                onChange={(e) => setWishesInput(e.target.value)}
                placeholder="Tuliskan ucapan dan doa untuk penyelenggara acara..."
                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-indigo-500 focus:border-indigo-500 resize-none h-24"
              />
            </div>
            
            <p className="text-center text-sm font-medium text-gray-700">Apakah Anda akan hadir?</p>
            <div className="flex gap-4">
              <button
                onClick={() => handleUpdateRSVP('attending')}
                disabled={submitting}
                className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${guest.rsvpStatus === 'attending' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Hadir
              </button>
              <button
                onClick={() => handleUpdateRSVP('declined')}
                disabled={submitting}
                className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${guest.rsvpStatus === 'declined' ? 'bg-red-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Tidak Hadir
              </button>
            </div>
            {guest.rsvpStatus !== 'pending' && (
              <p className="text-center text-sm text-gray-500 mt-4">
                Anda telah {guest.rsvpStatus === 'attending' ? 'menerima' : 'menolak'} undangan ini.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
