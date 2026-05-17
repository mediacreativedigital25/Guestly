import React from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'react-qr-code';

export default function PublicQR() {
  const [searchParams] = useSearchParams();
  const ticketCode = searchParams.get('ticket') || searchParams.get('code');
  const name = searchParams.get('name') || searchParams.get('to');
  
  if (!ticketCode) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <p className="text-gray-500 text-sm">Kode tiket tidak ditemukan.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-transparent p-4">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center w-full max-w-sm">
        {name && (
          <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">{name}</h3>
        )}
        <p className="text-sm font-medium tracking-[0.2em] text-gray-500 mb-6 text-center">
          {ticketCode}
        </p>
        <div className="bg-white p-2 rounded-lg break-inside-avoid">
            <QRCode value={ticketCode} size={200} style={{ maxWidth: '100%', height: 'auto' }} />
        </div>
      </div>
    </div>
  );
}
