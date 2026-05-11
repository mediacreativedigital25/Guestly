import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { parseFirestoreDate } from '../lib/utils';
import { CheckCircle, AlertCircle, Camera, Keyboard, ScanLine } from 'lucide-react';

export default function Scanner() {
  const { eventId } = useParams();
  const [scanResult, setScanResult] = useState<{status: 'success'|'error', message: string} | null>(null);
  const [scanMode, setScanMode] = useState<'camera' | 'tool'>('camera');
  const [manualInput, setManualInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (scanMode === 'tool' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [scanMode]);

  const processTicket = async (decodedText: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setScanResult(null);
    try {
      const guestsRef = collection(db, 'events', eventId!, 'guests');
      const q = query(guestsRef, where('ticketCode', '==', decodedText));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setScanResult({ status: 'error', message: "Tiket tidak valid."});
      } else {
        const guestDoc = snapshot.docs[0];
        if (guestDoc.data().attended) {
          const attendedDate = parseFirestoreDate(guestDoc.data().attendedAt);
          setScanResult({ status: 'error', message: `Tiket sudah digunakan pada ${attendedDate ? attendedDate.toLocaleString() : '-'}`});
        } else {
          // Mark attended
          await updateDoc(doc(db, 'events', eventId!, 'guests', guestDoc.id), {
            attended: true,
            attendedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          setScanResult({ status: 'success', message: `${guestDoc.data().name} berhasil check-in!`});
          // Auto hide after 3 secs
          setTimeout(() => setScanResult(null), 3000);
        }
      }
    } catch (error) {
      setScanResult({ status: 'error', message: "Terjadi kesalahan sistem"});
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}/guests`);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    
    if (scanMode === 'camera') {
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: {width: 250, height: 250} },
        /* verbose= */ false
      );

      scanner.render(async (decodedText) => {
        if (!isProcessing) {
            await processTicket(decodedText);
        }
      }, (error) => {
        // ignore empty scans
      });
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [eventId, scanMode]); // re-run if mode changes

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const code = manualInput.trim();
    setManualInput(''); // Clear input immediately for next scan
    if (inputRef.current) {
       inputRef.current.focus();
    }
    await processTicket(code);
    if (inputRef.current) {
        inputRef.current.focus();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
        <h1 className="text-xl font-bold text-gray-900">Scan Kehadiran</h1>
        <div className="flex items-center p-1 bg-gray-100 rounded-lg">
           <button
             onClick={() => setScanMode('camera')}
             className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${scanMode === 'camera' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
           >
             <Camera className="w-4 h-4" /> Kamera Device
           </button>
           <button
             onClick={() => setScanMode('tool')}
             className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${scanMode === 'tool' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
           >
             <Keyboard className="w-4 h-4" /> Alat Scanner
           </button>
        </div>
      </div>
      
      {scanResult && (
        <div className={`p-4 rounded-md flex items-center gap-3 ${scanResult.status === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {scanResult.status === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
          <p className="font-medium">{scanResult.message}</p>
        </div>
      )}

      {scanMode === 'camera' && (
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div id="reader" width="600px" className="mx-auto"></div>
            <p className="text-center text-gray-500 text-sm mt-4">Arahkan kamera ke QRCode untuk memindai tiket.</p>
          </div>
      )}

      {scanMode === 'tool' && (
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="max-w-md mx-auto text-center space-y-6">
               <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-indigo-600 mb-4">
                 <ScanLine className="w-8 h-8" />
               </div>
               <div>
                   <h3 className="text-lg font-semibold text-gray-900 mb-1">Mode Alat Scanner</h3>
                   <p className="text-sm text-gray-500">Gunakan alat scanner barcode (kasir) Anda. Pastikan kursor berada di dalam kotak di bawah ini.</p>
               </div>
               
               <form onSubmit={handleManualSubmit}>
                 <input 
                   ref={inputRef}
                   type="text"
                   value={manualInput}
                   onChange={e => setManualInput(e.target.value)}
                   className="w-full text-center text-lg font-mono tracking-widest p-4 border-2 border-indigo-200 rounded-lg focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all outline-none"
                   placeholder="Scan atau ketik kode tiket..."
                   autoFocus
                   disabled={isProcessing}
                 />
                 <button type="submit" className="hidden">Submit</button>
               </form>
               
               {isProcessing && <p className="text-indigo-600 font-medium text-sm animate-pulse">Memproses tiket...</p>}
            </div>
          </div>
      )}
    </div>
  );
}
