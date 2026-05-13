import { useParams, Link } from 'react-router-dom';
import { QrCode, ScanLine, Plus, Trash2, Edit, Search, CheckCircle, XCircle, FileSpreadsheet, FileText, Upload, Download, Copy, Share2, Download as DownloadIcon, Monitor } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import * as htmlToImage from 'html-to-image';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Guest, EventRecord } from '../types';
import { parseFirestoreDate } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Modal } from '../components/Modal';
import { useAuth } from '../AuthContext';
import { showAlert, showConfirm } from '../lib/alerts';

export default function EventDetails() {
  const { eventId } = useParams();
  const { appUser } = useAuth();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestAddress, setNewGuestAddress] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('');
  const [newGuestCategory, setNewGuestCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [activeQrGuest, setActiveQrGuest] = useState<Guest | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch event details
        if (eventId) {
          const eventDoc = await getDoc(doc(db, 'events', eventId));
          if (eventDoc.exists()) {
            setEvent({ id: eventDoc.id, ...eventDoc.data() } as EventRecord);
          }
        }
        
        // Fetch guests
        const guestsRef = collection(db, 'events', eventId!, 'guests');
        const q = query(guestsRef);
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest));
        setGuests(data);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `events/${eventId}`);
      } finally {
        setLoading(false);
      }
    };
    if (eventId) fetchData();
  }, [eventId]);

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const confirmed = await showConfirm("Apakah Anda yakin ingin menambahkan tamu ini?");
    if (!confirmed) return;
    
    const cleanedGuestName = newGuestName.trim();
    if (guests.some(g => g.name.toLowerCase() === cleanedGuestName.toLowerCase())) {
      showAlert('Peringatan', `Tamu dengan nama "${cleanedGuestName}" sudah tersedia di daftar.`, 'warning');
      return;
    }

    try {
      const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const payload: any = {
        eventId: eventId!,
        name: cleanedGuestName,
        ticketCode: ticketCode,
        rsvpStatus: 'pending',
        attended: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      if (newGuestAddress) payload.address = newGuestAddress;
      if (newGuestPhone) payload.phone = newGuestPhone;
      if (newGuestCategory) payload.category = newGuestCategory;
      
      const guestRef = await addDoc(collection(db, 'events', eventId!, 'guests'), payload);
      setGuests([...guests, { id: guestRef.id, ...payload } as unknown as Guest]);
      setNewGuestName('');
      setNewGuestAddress('');
      setNewGuestPhone('');
      setNewGuestCategory('');
      setIsAddingGuest(false);
      showAlert('Berhasil', "Tamu berhasil ditambahkan!", "success");
    } catch (error) {
      showAlert("Gagal", "Failed to add guest. Check permissions.", "error");
      handleFirestoreError(error, OperationType.CREATE, `events/${eventId}/guests`);
    }
  };

  const [guestToDelete, setGuestToDelete] = useState<string | null>(null);

  const promptDeleteGuest = (guestId: string) => {
    setGuestToDelete(guestId);
  };

  const handleDeleteGuest = async () => {
    if (!guestToDelete) return;
    try {
      await deleteDoc(doc(db, 'events', eventId!, 'guests', guestToDelete));
      setGuests(guests.filter(g => g.id !== guestToDelete));
      setGuestToDelete(null);
      showAlert("Berhasil", "Tamu berhasil dihapus!", "success");
    } catch (error) {
       showAlert("Gagal", "Gagal menghapus tamu", "error");
       handleFirestoreError(error, OperationType.DELETE, `events/${eventId}/guests/${guestToDelete}`);
       setGuestToDelete(null);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!eventId || !event) return;
    
    const confirmed = await showConfirm(`Apakah Anda yakin ingin mengubah status acara menjadi ${newStatus}?`);
    if (!confirmed) return;
    
    try {
      await updateDoc(doc(db, 'events', eventId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      setEvent({ ...event, status: newStatus as any });
      showAlert("Berhasil", "Status acara berhasil diubah!", "success");
    } catch (error) {
      showAlert("Gagal", "Gagal mengubah status acara", "error");
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
    }
  };

  const handleToggleAttendance = async (guestId: string, currentStatus: boolean) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin ${currentStatus ? 'membatalkan' : 'mengonfirmasi'} kehadiran tamu ini?`);
    if (!confirmed) return;

    try {
      const newStatus = !currentStatus;
      const updateData: any = {
        attended: newStatus,
        updatedAt: serverTimestamp()
      };
      
      if (newStatus) {
        updateData.attendedAt = serverTimestamp();
      } else {
        updateData.attendedAt = deleteField();
      }
      
      await updateDoc(doc(db, 'events', eventId!, 'guests', guestId), updateData);
      
      setGuests(guests.map(g => g.id === guestId ? { ...g, attended: newStatus } : g));
      showAlert('Berhasil', `Status kehadiran berhasil ${newStatus ? 'dikonfirmasi' : 'dibatalkan'}!`, 'success');
    } catch (error) {
      showAlert('Gagal', "Gagal memperbarui status kehadiran", 'error');
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}/guests/${guestId}`);
    }
  };

  const filteredGuests = guests.filter(guest => 
    guest.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (guest.ticketCode && guest.ticketCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Daftar Tamu - ${event?.title || 'Event'}`, 14, 15);
    
    const tableColumn = ["No", "Nama", "Alamat", "No. Hp", "Kategori", "Status", "Waktu Kehadiran"];
    const tableRows: any[] = [];

    filteredGuests.forEach((guest, index) => {
      const guestData = [
        index + 1,
        guest.name,
        guest.address || '-',
        guest.phone || '-',
        guest.category || '-',
        guest.attended ? 'Hadir' : 'Belum Hadir',
        guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
      ];
      tableRows.push(guestData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });

    doc.save(`Daftar_Tamu_${event?.title || 'Event'}.pdf`);
  };

  const handleDownloadQR = () => {
    if (qrRef.current && activeQrGuest) {
      htmlToImage.toPng(qrRef.current)
        .then(function (dataUrl) {
          const link = document.createElement('a');
          link.download = `QR_${activeQrGuest.name.replace(/\s+/g, '_')}_${event?.title || 'Event'}.png`;
          link.href = dataUrl;
          link.click();
        })
        .catch(function (error) {
          console.error('oops, something went wrong!', error);
        });
    }
  };

  const generateShareLink = (guest: Guest) => {
    // If event has digital invite link, use it, else fallback to RSVP url.
    // In many real scenarios, the RSVP link is the invite.
    const baseUrl = window.location.origin;
    let inviteUrl = `${baseUrl}/rsvp/${eventId}/${guest.ticketCode}`;
    
    if (event?.digitalInviteLink) {
        inviteUrl = `${event.digitalInviteLink}${event.digitalInviteLink.includes('?') ? '&' : '?'}ticket=${guest.ticketCode}`;
    }
    return inviteUrl;
  };

  const handleShareWA = (guest: Guest) => {
    const baseUrl = window.location.origin;
    const qrLink = `${baseUrl}/rsvp/${eventId}/${guest.ticketCode}`;
    
    let digitalInviteLink = event?.digitalInviteLink || qrLink;
    if (event?.digitalInviteLink) {
        const separator = event.digitalInviteLink.includes('?') ? '&' : '?';
        digitalInviteLink = `${event.digitalInviteLink}${separator}to=${encodeURIComponent(guest.name)}`;
    }

    const text = `Halo *${guest.name}* 👋🏻\n\nDengan penuh rasa hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara spesial kami:\n\n✨ *${event?.title}* ✨\n\nUntuk konfirmasi kehadiran saat acara berlangsung, silakan tunjukkan QR Code berikut:\n🔳 ${qrLink}\n\nDetail lengkap acara dapat dilihat melalui undangan digital berikut:\n💌 ${digitalInviteLink}\n\nMerupakan suatu kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir serta memberikan doa dan restu kepada kami.\n\nAtas perhatian dan kehadirannya, kami ucapkan terima kasih 🙏🏻\n\nHormat kami,\n*${event?.title}*`;

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };
  const handleExportExcel = () => {
    const data = filteredGuests.map((guest, index) => ({
      "No": index + 1,
      "Nama Tamu": guest.name,
      "Alamat": guest.address || '-',
      "No. Hp": guest.phone || '-',
      "Kategori": guest.category || '-',
      "Status (Hadir / Belum Hadir)": guest.attended ? 'Hadir' : 'Belum Hadir',
      "Waktu Kehadiran": guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tamu");
    XLSX.writeFile(workbook, `Daftar_Tamu_${event?.title || 'Event'}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const data = [{
      "Nama Tamu": '',
      "Alamat": '',
      "No. Hp": '',
      "Kategori": ''
    }];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tamu");
    XLSX.writeFile(workbook, "Template_Import_Tamu.xlsx");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        let addedCount = 0;
        const duplicateNames: string[] = [];
        const newGuests: Guest[] = [];

        for (const row of data as any[]) {
           let guestName = row["Nama Tamu"] || row.Nama;
           if (guestName) {
              const cleanedName = String(guestName).trim();
              if (!cleanedName) continue;
              
              if (guests.some(g => g.name.toLowerCase() === cleanedName.toLowerCase()) || newGuests.some(g => g.name.toLowerCase() === cleanedName.toLowerCase())) {
                  duplicateNames.push(cleanedName);
                  continue;
              }

              const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
              let phone = row["No. Hp"] || row.Telepon || row.hp || "";

              const payload = {
                eventId: eventId!,
                name: cleanedName,
                ticketCode: ticketCode,
                rsvpStatus: 'pending',
                attended: false,
                category: row.Kategori ? String(row.Kategori) : '',
                email: row.Email ? String(row.Email) : '',
                phone: phone ? String(phone) : '',
                address: row.Alamat ? String(row.Alamat) : '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              };
              const docRef = await addDoc(collection(db, 'events', eventId!, 'guests'), payload);
              newGuests.push({ id: docRef.id, ...payload } as unknown as Guest);
              addedCount++;
           }
        }
        
        if (addedCount > 0 || duplicateNames.length > 0) {
          let msg = `Berhasil mengimpor ${addedCount} tamu.`;
          if (duplicateNames.length > 0) {
              const duplicatesList = duplicateNames.slice(0, 10).join(', ') + (duplicateNames.length > 10 ? ` dan ${duplicateNames.length - 10} lainnya` : '');
              msg += `\n\nInfo: Data tamu berikut sudah tersedia (duplikat nama diabaikan):\n${duplicatesList}`;
          }
          showAlert('Info Import', msg, 'info');
          if (addedCount > 0) {
              setGuests(prev => [...prev, ...newGuests]);
          }
        } else {
          showAlert('Peringatan', 'Tidak ada data tamu yang valid untuk diimpor. Pastikan ada baris "Nama Tamu".', 'warning');
        }

      } catch (error) {
        console.error(error);
        showAlert('Error', 'Terjadi kesalahan saat mengimpor file Excel.', 'error');
      }
    };
    reader.readAsBinaryString(file);
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Detail Acara</h1>
        <div className="flex gap-4">
          <Link
            to={`/events/${eventId}/greeting`}
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 font-medium"
          >
            <Monitor className="w-5 h-5" />
            Layar Sapa
          </Link>
          <Link
            to={`/events/${eventId}/scan`}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
          >
            <ScanLine className="w-5 h-5" />
            Scanner
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
           <h2 className="text-lg font-medium text-gray-900">Informasi Acara</h2>
           {event && (
             <div className="flex items-center gap-3">
               <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                 event.status === 'published' ? 'bg-green-100 text-green-800' : 
                 event.status === 'completed' ? 'bg-gray-100 text-gray-800' : 
                 'bg-yellow-100 text-yellow-800'
               }`}>
                 {event.status}
               </span>
               {appUser?.role !== 'client' && (
                 <select 
                    value={event.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="block text-sm border-gray-300 rounded-md py-1 pl-3 pr-8 focus:ring-indigo-500 focus:border-indigo-500"
                 >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="completed">Completed</option>
                 </select>
               )}
             </div>
           )}
        </div>
        <div className="p-6">
          {loading && !event ? (
            <p className="text-gray-500 text-sm">Memuat detail acara...</p>
          ) : event ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Nama Acara</h3>
                  <p className="mt-1 text-base text-gray-900">{event.title}</p>
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Waktu Pelaksanaan</h3>
                  <p className="mt-1 text-base text-gray-900">
                    {format(new Date(event.date), 'dd MMMM yyyy')} {event.time && `• ${event.time}`}
                  </p>
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Lokasi</h3>
                  <p className="mt-1 text-base text-gray-900">{event.location || '-'}</p>
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-500">Kategori Tamu Disediakan</h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {event.guestCategories && event.guestCategories.length > 0 ? (
                      event.guestCategories.map(cat => (
                        <span key={cat} className="inline-flex px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-md">{cat}</span>
                      ))
                    ) : (
                      <span className="text-gray-900">-</span>
                    )}
                  </div>
               </div>
               {event.frameOverlayUrl && (
                 <div className="md:col-span-2">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Frame / Overlay Sapa Tamu</h3>
                    <div className="w-48 h-24 bg-gray-100 border border-gray-200 rounded-md overflow-hidden relative group">
                       <img src={event.frameOverlayUrl} alt="Frame" className="object-cover w-full h-full opacity-70 group-hover:opacity-100 transition-opacity" />
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <span className="text-xs bg-black/50 text-white px-2 py-1 rounded">Pratinjau</span>
                       </div>
                    </div>
                 </div>
               )}
            </div>
          ) : (
            <p className="text-red-500 text-sm">Acara tidak ditemukan.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-gray-100 bg-gray-50 gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
            <h2 className="text-lg font-medium text-gray-900 whitespace-nowrap">Guest List ({filteredGuests.length})</h2>
            <div className="relative w-full sm:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Cari nama atau tiket..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 sm:py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".xlsx, .xls" 
              className="hidden" 
            />
            <button 
              onClick={handleDownloadTemplate}
              className="flex-1 sm:flex-none justify-center text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 font-medium flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-md transition-colors whitespace-nowrap"
              title="Download Template"
            >
              <DownloadIcon className="w-4 h-4 text-gray-500" /> Template
            </button>
            <button 
              onClick={handleImportClick}
              className="flex-1 sm:flex-none justify-center text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 font-medium flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-md transition-colors whitespace-nowrap"
              title="Import Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600"/> Import
            </button>
            <button 
              onClick={handleExportPDF}
              className="flex-1 sm:flex-none justify-center text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 font-medium flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-md transition-colors whitespace-nowrap"
              title="Export PDF"
            >
              <FileText className="w-4 h-4 text-red-500"/> PDF
            </button>
            <button 
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none justify-center text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 font-medium flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-md transition-colors whitespace-nowrap"
              title="Export Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600"/> Excel
            </button>
            <button 
              onClick={() => setIsAddingGuest(!isAddingGuest)}
              className="flex-1 sm:flex-none justify-center text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 bg-indigo-50 px-3 py-2 sm:py-1.5 rounded-md hover:bg-indigo-100 transition-colors whitespace-nowrap lg:ml-2"
            >
              <Plus className="w-4 h-4"/> {isAddingGuest ? 'Batal' : 'Tambah Tamu'}
            </button>
          </div>
        </div>

        <div className="p-0">
          {isAddingGuest && (
            <div className="p-6 bg-gray-50 border-b border-gray-100">
              <form onSubmit={handleAddGuest} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                 <h3 className="text-md font-medium text-gray-800 mb-4">Data Tamu Baru</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
                      <input required value={newGuestName} onChange={e => setNewGuestName(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Budi Santoso" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">No HP</label>
                      <input value={newGuestPhone} onChange={e => setNewGuestPhone(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="08123456789" />
                    </div>
                    <div className="md:col-span-2 lg:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                      <input value={newGuestAddress} onChange={e => setNewGuestAddress(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Jl. Sudirman No 1" />
                    </div>
                    {event?.guestCategories && event.guestCategories.length > 0 && (
                      <div className="md:col-span-2 lg:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Tamu</label>
                        <select 
                          value={newGuestCategory} 
                          onChange={e => setNewGuestCategory(e.target.value)} 
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">-- Pilih Kategori --</option>
                          {event.guestCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    )}
                 </div>
                 <div className="flex justify-end">
                   <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium text-sm transition-colors">
                     Simpan Tamu
                   </button>
                 </div>
              </form>
            </div>
          )}
          
          {loading ? (
            <div className="p-6">
              <p className="text-gray-500 text-sm">Memuat daftar tamu...</p>
            </div>
          ) : guests.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 text-sm">Belum ada tamu yang ditambahkan di daftar ini.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Tamu</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alamat</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No. Hp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kategori</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Kehadiran</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredGuests.map((guest, index) => (
                    <tr key={guest.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{guest.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{guest.address || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{guest.phone || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {guest.category ? (
                          <span className="inline-flex px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-md">{guest.category}</span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                         <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-4 ${guest.attended ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                           {guest.attended ? 'Hadir' : 'Belum Hadir'}
                         </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {guest.attendedAt && parseFirestoreDate(guest.attendedAt) ? parseFirestoreDate(guest.attendedAt)!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                           <button 
                               onClick={() => handleToggleAttendance(guest.id!, guest.attended)}
                               className={`flex items-center justify-center p-1.5 rounded-full transition-colors ${
                                 guest.attended 
                                   ? 'text-green-600 hover:text-green-900 hover:bg-green-50' 
                                   : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                               }`}
                               title={guest.attended ? 'Batalkan Kehadiran' : 'Konfirmasi Kehadiran'}
                           >
                             {guest.attended ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                           </button>
                           <button 
                               onClick={() => setActiveQrGuest(guest)}
                               className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors" 
                               title="Lihat / Bagikan QR"
                           >
                             <QrCode className="w-4 h-4" />
                           </button>
                           <button 
                               onClick={() => showAlert('Info', "Edit tamu not fully implemented yet.", 'info')} 
                               className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors" 
                               title="Edit Tamu"
                           >
                             <Edit className="w-4 h-4" />
                           </button>
                           <button 
                               onClick={() => promptDeleteGuest(guest.id!)} 
                               className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors" 
                               title="Hapus Tamu"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={!!guestToDelete} onClose={() => setGuestToDelete(null)} title="Konfirmasi Hapus">
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-800 mb-6">
          <p>Apakah Anda yakin ingin menghapus tamu ini? Tindakan ini tidak dapat dibatalkan.</p>
        </div>
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button 
            type="button" 
            onClick={() => setGuestToDelete(null)} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 bg-transparent transition-colors"
          >
            Batal
          </button>
          <button 
            type="button" 
            onClick={handleDeleteGuest}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 transition-colors"
          >
            Ya, Hapus
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!activeQrGuest} onClose={() => setActiveQrGuest(null)} title="Bagikan Undangan & QR">
        {activeQrGuest && (
          <div className="flex flex-col items-center">
            <div 
              ref={qrRef} 
              className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">{activeQrGuest.name}</h3>
              <p className="text-sm font-medium tracking-[0.2em] text-gray-500 mb-4">{activeQrGuest.ticketCode}</p>
              <QRCode value={activeQrGuest.ticketCode} size={200} />
            </div>
            
            <div className="mt-8 w-full space-y-3">
              <button 
                onClick={() => handleShareWA(activeQrGuest)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors"
              >
                <Share2 className="w-5 h-5" /> Bagikan ke WhatsApp
              </button>
              
              <div className="flex gap-3">
                <button 
                  onClick={handleDownloadQR}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-indigo-700 bg-indigo-50 font-medium rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <DownloadIcon className="w-5 h-5" /> Download QR
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(generateShareLink(activeQrGuest));
                    showAlert('Berhasil', 'Link berhasil disalin!', 'success');
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-gray-700 bg-gray-100 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Copy className="w-5 h-5" /> Salin Link
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
