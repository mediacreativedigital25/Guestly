import React, { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { EventRecord } from '../../types';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  parseISO 
} from 'date-fns';
import { id } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, Search, Filter } from 'lucide-react';
import { Modal } from '../../components/Modal';

export default function AdminCalendar() {
  const { appUser } = useAuth();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    if (appUser) {
      fetchEvents();
    }
  }, [appUser]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      let q = query(collection(db, 'events'));
      if (appUser?.role === 'partner') {
         q = query(collection(db, 'events'), where('partnerId', '==', appUser.uid));
      } else if (appUser?.role === 'client') {
         q = query(collection(db, 'events'), where('clientId', '==', appUser.uid));
      }
      const snapshot = await getDocs(q);
      const eventsData: EventRecord[] = [];
      snapshot.forEach(doc => {
        eventsData.push({ id: doc.id, ...doc.data() } as EventRecord);
      });
      setEvents(eventsData);
    } catch (error) {
      console.error('Error fetching events:', error);
      handleFirestoreError(error, OperationType.GET, 'events');
    } finally {
      setLoading(false);
    }
  };

  const dfStartMonth = startOfMonth(currentDate);
  const dfEndMonth = endOfMonth(currentDate);
  const dfStartDate = startOfWeek(dfStartMonth, { weekStartsOn: 1 });
  const dfEndDate = endOfWeek(dfEndMonth, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({
    start: dfStartDate,
    end: dfEndDate
  });

  const getEventsForDay = (day: Date) => {
    return events.filter(e => {
        if (!e.date) return false;
        try {
            const eventDate = new Date(e.date);
            return isSameDay(eventDate, day);
        } catch {
            return false;
        }
    }).filter(e => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            e.title.toLowerCase().includes(s) || 
            (e.coupleName || '').toLowerCase().includes(s) || 
            (e.location || '').toLowerCase().includes(s)
        );
    });
  };

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const today = () => setCurrentDate(new Date());

  if (appUser?.role !== 'superadmin' && appUser?.role !== 'partner' && appUser?.role !== 'client') {
     return <div className="p-8 text-center text-gray-500">Anda tidak memiliki akses ke halaman ini.</div>;
  }

  const upcomingEvents = events.filter(e => {
      if (!e.date) return false;
      return new Date(e.date) >= new Date(new Date().setHours(0,0,0,0));
  }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-indigo-600" />
            Kalender Acara
          </h1>
          <p className="text-sm text-gray-500 mt-1">Pantau semua jadwal acara pada sistem</p>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-6">
        {/* Main Calendar View */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900 capitalize w-40">
                  {format(currentDate, 'MMMM yyyy', { locale: id })}
                </h2>
             </div>
             <div className="flex items-center gap-2">
                <button onClick={today} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors">
                   Hari Ini
                </button>
                <div className="flex bg-gray-50 border border-gray-200 rounded-md overflow-hidden">
                    <button onClick={prevMonth} className="p-1.5 text-gray-600 hover:bg-gray-200 transition-colors border-r border-gray-200">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={nextMonth} className="p-1.5 text-gray-600 hover:bg-gray-200 transition-colors">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
             </div>
          </div>
          
          <div className="p-4 border-b border-gray-50 bg-gray-50/50">
             <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                    type="text" 
                    placeholder="Cari acara berdasarkan judul, nama, atau lokasi..." 
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
             {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => (
                 <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500">
                     {day}
                 </div>
             ))}
          </div>

          <div className="grid grid-cols-7 auto-rows-[minmax(100px,auto)]">
             {calendarDays.map((day, idx) => {
                 const dayEvents = getEventsForDay(day);
                 const isCurrentMonth = isSameMonth(day, currentDate);
                 const isToday = isSameDay(day, new Date());
                 
                 return (
                     <div 
                         key={day.toISOString()} 
                         className={`border-b border-r border-gray-100 p-2 ${!isCurrentMonth ? 'bg-gray-50/50' : ''} ${isToday ? 'bg-indigo-50/30' : ''}`}
                     >
                         <div className="flex justify-between items-start mb-1">
                             <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : (isCurrentMonth ? 'text-gray-900' : 'text-gray-400')}`}>
                                 {format(day, 'd')}
                             </span>
                             {dayEvents.length > 0 && (
                                 <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-full font-medium">
                                     {dayEvents.length}
                                 </span>
                             )}
                         </div>
                         <div className="space-y-1 mt-1 font-sans">
                             {dayEvents.slice(0, 3).map(event => (
                                 <div 
                                     key={event.id}
                                     onClick={() => setSelectedEvent(event)}
                                     className="text-xs p-1.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 cursor-pointer hover:bg-indigo-100 truncate flex items-center gap-1 transition-colors"
                                     title={event.title}
                                 >
                                     <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                     <span className="truncate font-medium">{event.title}</span>
                                 </div>
                             ))}
                             {dayEvents.length > 3 && (
                                 <div 
                                     className="text-[10px] text-gray-500 text-center font-medium cursor-pointer hover:text-indigo-600"
                                     onClick={() => setSelectedDate(day)}
                                 >
                                     + {dayEvents.length - 3} lainnya
                                 </div>
                             )}
                         </div>
                     </div>
                 );
             })}
          </div>
        </div>

        {/* Sidebar Mini Upcoming */}
        <div className="w-full md:w-80 space-y-4">
           <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                 <Clock className="w-4 h-4 text-indigo-500" /> Acara Mendatang
              </h3>
              <div className="space-y-3">
                 {loading ? (
                     <p className="text-sm text-gray-500">Memuat...</p>
                 ) : upcomingEvents.length === 0 ? (
                     <p className="text-sm text-gray-500">Tidak ada acara mendatang.</p>
                 ) : (
                     upcomingEvents.slice(0, 5).map(event => (
                         <div key={event.id} className="group p-3 border border-gray-100 rounded-lg hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors cursor-pointer" onClick={() => setSelectedEvent(event)}>
                             <div className="text-xs font-semibold text-indigo-600 mb-1">
                                 {format(new Date(event.date), 'dd MMM yyyy', { locale: id })}
                             </div>
                             <div className="font-medium text-gray-900 text-sm line-clamp-1 group-hover:text-indigo-700">
                                 {event.title}
                             </div>
                             {(event.time || event.location) && (
                                 <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                                     {event.time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {event.time}</span>}
                                     {event.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>}
                                 </div>
                             )}
                         </div>
                     ))
                 )}
              </div>
           </div>
        </div>
      </div>

      {/* Modal Detail Event */}
      <Modal isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} title="Detail Acara">
         {selectedEvent && (
             <div className="space-y-4">
                 <div className="bg-indigo-50 p-4 rounded-xl flex items-start gap-4">
                     <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                         <CalendarIcon className="w-6 h-6 text-indigo-600" />
                     </div>
                     <div>
                         <h3 className="text-lg font-bold text-gray-900">{selectedEvent.title}</h3>
                         {selectedEvent.coupleName && <p className="text-sm text-indigo-600 font-medium">{selectedEvent.coupleName}</p>}
                     </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                     <div className="border border-gray-100 p-3 rounded-lg bg-gray-50">
                         <div className="text-xs text-gray-500 font-medium mb-1">Tanggal</div>
                         <div className="text-sm font-semibold text-gray-900">
                             {format(new Date(selectedEvent.date), 'EEEE, dd MMMM yyyy', { locale: id })}
                         </div>
                     </div>
                     <div className="border border-gray-100 p-3 rounded-lg bg-gray-50">
                         <div className="text-xs text-gray-500 font-medium mb-1">Waktu</div>
                         <div className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                             <Clock className="w-3.5 h-3.5" /> {selectedEvent.time || '-'}
                         </div>
                     </div>
                     <div className="border border-gray-100 p-3 rounded-lg bg-gray-50 col-span-2">
                         <div className="text-xs text-gray-500 font-medium mb-1">Lokasi</div>
                         <div className="text-sm font-semibold text-gray-900 flex items-start gap-1">
                             <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {selectedEvent.location || '-'}
                         </div>
                     </div>
                 </div>
                 
                 <div className="flex justify-end pt-4 border-t border-gray-100">
                     <Link 
                         to={`/events/${selectedEvent.id}`} 
                         className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                     >
                         Buka Halaman Acara
                     </Link>
                 </div>
             </div>
         )}
      </Modal>

      {/* Modal Daftar Acara pada Tanggal Tertentu */}
      <Modal isOpen={!!selectedDate} onClose={() => setSelectedDate(null)} title={`Acara pada ${selectedDate ? format(selectedDate, 'dd MMMM yyyy', { locale: id }) : ''}`}>
         {selectedDate && (
             <div className="space-y-3">
                 {getEventsForDay(selectedDate).map(event => (
                     <div key={event.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                         <div>
                             <h4 className="font-bold text-gray-900">{event.title}</h4>
                             <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                                {event.time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {event.time}</span>}
                                {event.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>}
                             </div>
                         </div>
                         <button 
                             onClick={() => {
                                 setSelectedDate(null);
                                 setSelectedEvent(event);
                             }}
                             className="text-sm text-indigo-600 font-medium hover:text-indigo-700 px-3 py-1.5 bg-indigo-50 rounded-md"
                         >
                             Detail
                         </button>
                     </div>
                 ))}
             </div>
         )}
      </Modal>
    </div>
  );
}
