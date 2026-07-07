/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, CheckCircle2, AlertCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => Promise<void>;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onScan
}: BarcodeScannerModalProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 30, 
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdgeSize * 0.7);
            return {
              width: qrboxSize,
              height: qrboxSize
            };
          },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          rememberLastUsedCamera: true,
          supportedScanTypes: [0] // 0 = QR CODE
        },
        /* verbose= */ false
      );

      scanner.render(
        async (decodedText) => {
          // Success callback
          setIsScanning(true);
          try {
            await onScan(decodedText);
            setScanResult({ success: true, message: `Berhasil: ${decodedText}` });
            // Keep scanning or close? User said "otomatis menambah tamu", 
            // so maybe show success for a bit then reset or close.
            setTimeout(() => {
              setScanResult(null);
              setIsScanning(false);
            }, 3000);
          } catch (error: any) {
            setScanResult({ success: false, message: error.message || "Gagal memproses barcode" });
            setTimeout(() => {
              setScanResult(null);
              setIsScanning(false);
            }, 3000);
          }
        },
        (errorMessage) => {
          // Error callback (usually just noise)
        }
      );

      scannerRef.current = scanner;
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
          console.error("Failed to clear scanner", error);
        });
        scannerRef.current = null;
      }
    };
  }, [isOpen, onScan]);

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setScanResult(null);

    try {
      const html5QrCode = new Html5Qrcode("reader-hidden");
      const decodedText = await html5QrCode.scanFile(file, true);
      
      await onScan(decodedText);
      setScanResult({ success: true, message: `Berhasil: ${decodedText}` });
      
      setTimeout(() => {
        setScanResult(null);
        setIsProcessingFile(false);
      }, 3000);
      
      // Clear input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      console.error("File scan error:", error);
      setScanResult({ success: false, message: "Gagal mendeteksi QR Code dari gambar. Pastikan gambar jelas." });
      setIsProcessingFile(false);
      
      setTimeout(() => {
        setScanResult(null);
      }, 3000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-[40px] overflow-hidden shadow-2xl font-sans"
          >
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-olive/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-olive text-white rounded-xl flex items-center justify-center shadow-lg">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-serif font-bold text-gray-900">Scan Barcode Undangan</h3>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Arahkan kamera ke barcode tamu</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white rounded-full transition-all text-gray-400 hover:text-gray-600 shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8">
              <div className="relative rounded-3xl overflow-hidden border-4 border-olive/10 shadow-inner bg-gray-50 min-h-[300px]">
                <div id="reader" className="w-full [&>video]:object-cover [&_button]:px-4 [&_button]:py-2 [&_button]:bg-olive [&_button]:text-white [&_button]:rounded-lg [&_button]:hover:bg-olive/90 [&_button]:transition-colors [&_button]:mb-6 [&_button]:shadow-sm [&_a]:text-olive [&_a]:underline [&_a]:mt-6 [&_a]:block [&_a]:cursor-pointer [&_#html5-qrcode-anchor-scan-type-change]:mt-6 [&_span]:block [&_span]:mb-4"></div>
                <div id="reader-hidden" className="hidden"></div>
                
                {/* Scanning Animation Overlay */}
                {!scanResult && !isProcessingFile && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-[70%] h-[70%] border-2 border-olive/30 rounded-2xl relative overflow-hidden">
                      <motion.div 
                        animate={{ top: ['0%', '100%', '0%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute left-0 right-0 h-1 bg-olive shadow-[0_0_20px_rgba(128,128,0,1)] z-10"
                      />
                      <div className="absolute inset-0 bg-olive/5" />
                    </div>
                  </div>
                )}
                {isProcessingFile && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-20">
                    <Loader2 className="w-10 h-10 text-olive animate-spin" />
                    <p className="text-sm font-bold text-olive">Memproses Gambar...</p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-4">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileScan}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingFile}
                  className="w-full py-4 rounded-2xl border-2 border-dashed border-olive/20 text-olive font-bold flex items-center justify-center gap-2 hover:bg-olive/5 transition-all"
                >
                  <ImageIcon className="w-5 h-5" />
                  Pilih dari Galeri / Upload Foto
                </button>
              </div>
              
              <AnimatePresence>
                {scanResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={cn(
                      "mt-6 p-5 rounded-2xl flex items-start gap-4 shadow-sm border",
                      scanResult.success ? "bg-green-50/50 border-green-200/50" : "bg-red-50/50 border-red-200/50"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-full shrink-0",
                      scanResult.success ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    )}>
                      {scanResult.success ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <h4 className={cn(
                        "text-base font-bold mb-1",
                        scanResult.success ? "text-green-800" : "text-red-800"
                      )}>
                        {scanResult.success ? 'Scan Berhasil' : 'Scan Gagal'}
                      </h4>
                      <p className={cn(
                        "text-sm font-medium leading-relaxed",
                        scanResult.success ? "text-green-700" : "text-red-700"
                      )}>{scanResult.message}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-8 p-6 bg-cream/30 rounded-3xl border border-olive/5">
                <h4 className="text-xs font-bold text-olive uppercase tracking-widest mb-3">Petunjuk:</h4>
                <ul className="text-xs text-gray-500 space-y-2 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-olive mt-1.5 shrink-0" />
                    Pastikan barcode terlihat jelas dan tidak terhalang cahaya.
                  </li>
                  <li className="flex gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-olive mt-1.5 shrink-0" />
                    Sistem akan otomatis mencatat kehadiran tamu setelah scan berhasil.
                  </li>
                  <li className="flex gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-olive mt-1.5 shrink-0" />
                    Jika tamu belum terdaftar, sistem akan membuat entri baru secara otomatis.
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
