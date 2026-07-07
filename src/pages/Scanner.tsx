import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { parseFirestoreDate } from '../lib/utils';
import { CheckCircle, AlertCircle, Camera, Keyboard, ScanLine } from 'lucide-react';

const playBeep = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = 1000;
      
      gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.1);
    }
  } catch (e) {
    console.error("Audio output not supported", e);
  }
};

export default function Scanner() {
  const { eventId } = useParams();
  const [scanResult, setScanResult] = useState<{status: 'success'|'error', message: string} | null>(null);
  const [scanMode, setScanMode] = useState<'camera' | 'tool'>('camera');
  const [manualInput, setManualInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const isProcessingRef = useRef(false);
  const lastScannedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (scanMode === 'tool' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [scanMode]);

  const processTicket = async (decodedText: string) => {
    if (isProcessingRef.current) return;
    
    // Prevent scanning the same code multiple times within a short duration
    if (lastScannedCodeRef.current === decodedText) {
       return;
    }
    
    isProcessingRef.current = true;
    setIsProcessing(true);
    setScanResult(null);
    lastScannedCodeRef.current = decodedText;

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
          setScanResult({ status: 'error', message: `Tiket sudah digunakan pada ${attendedDate ? attendedDate.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}`});
        } else {
          // Mark attended
          await updateDoc(doc(db, 'events', eventId!, 'guests', guestDoc.id), {
            attended: true,
            attendedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          playBeep();
          setScanResult({ status: 'success', message: `${guestDoc.data().name} berhasil check-in!`});
        }
      }
    } catch (error) {
      setScanResult({ status: 'error', message: "Terjadi kesalahan sistem"});
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}/guests`);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      
      // Clear the last scanned code after a delay so it can be scanned again if needed
      setTimeout(() => {
        if (lastScannedCodeRef.current === decodedText) {
          lastScannedCodeRef.current = null;
        }
      }, 3000);
      
      // Auto hide scan result after 3 secs
      setTimeout(() => setScanResult(null), 3000);
    }
  };

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let isStarted = false;
    
    if (scanMode === 'camera') {
      const initScanner = () => {
        scanner = new Html5QrcodeScanner(
          "reader",
          { fps: 10, qrbox: {width: 250, height: 250} },
          /* verbose= */ false
        );

        scanner.render(async (decodedText) => {
          if (!isProcessingRef.current) {
              await processTicket(decodedText);
          }
        }, (error) => {
          // ignore empty scans
        });
        isStarted = true;
      };

      // Slight delay to ensure DOM is ready and prevent strict mode double-init 
      // issues from blocking the camera permanently
      const timer = setTimeout(() => {
        const readerElement = document.getElementById("reader");
        if (readerElement) {
           initScanner();
        }
      }, 100);
      
      return () => {
        clearTimeout(timer);
        if (scanner && isStarted) {
          scanner.clear().catch(e => console.error("Scanner clear error", e));
        }
      };
    }

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
        <div className={`mb-6 p-5 rounded-xl flex items-start gap-4 shadow-sm border ${scanResult.status === 'success' ? 'bg-green-50/50 border-green-200/50' : 'bg-red-50/50 border-red-200/50'}`}>
          <div className={`p-2 rounded-full shrink-0 ${scanResult.status === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {scanResult.status === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
          </div>
          <div>
            <h4 className={`text-base font-semibold mb-1 ${scanResult.status === 'success' ? 'text-green-800' : 'text-red-800'}`}>
              {scanResult.status === 'success' ? 'Scan Berhasil' : 'Scan Gagal'}
            </h4>
            <p className={`text-sm leading-relaxed ${scanResult.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {scanResult.message}
            </p>
          </div>
        </div>
      )}

      {scanMode === 'camera' && (
          <div className="bg-white p-2 sm:p-4 rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full">
            <div id="reader" className="w-full max-w-sm sm:max-w-md mx-auto min-h-[300px] overflow-hidden [&>video]:object-cover [&_button]:px-4 [&_button]:py-2 [&_button]:bg-indigo-600 [&_button]:text-white [&_button]:rounded-lg [&_button]:hover:bg-indigo-700 [&_button]:transition-colors [&_button]:mb-6 [&_button]:shadow-sm [&_a]:text-indigo-600 [&_a]:underline [&_a]:mt-6 [&_a]:block [&_a]:cursor-pointer [&_#html5-qrcode-anchor-scan-type-change]:mt-6 [&_span]:block [&_span]:mb-4"></div>
            <p className="text-center text-gray-500 text-xs sm:text-sm mt-4">Arahkan kamera ke QRCode untuk memindai tiket.</p>
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
