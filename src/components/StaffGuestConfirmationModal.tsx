import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { StaffConfirmationSource } from '../types';

export function formatStaffConfirmationSource(source?: StaffConfirmationSource | string | null): string {
  if (source === 'keluarga') return 'Pihak Keluarga';
  if (source === 'vendor') return 'Pihak Vendor / WO';
  if (source === 'keluarga_vendor') return 'Pihak Keluarga & Vendor';
  return 'Terkonfirmasi';
}

interface StaffGuestConfirmationModalProps {
  isOpen: boolean;
  guestName: string;
  guestPax?: number;
  guestCategory?: string;
  staffName?: string;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: (source: StaffConfirmationSource, note: string) => void | Promise<void>;
}

const CONFIRMATION_OPTIONS: {
  value: StaffConfirmationSource;
  label: string;
  description: string;
}[] = [
  {
    value: 'keluarga',
    label: 'Pihak Keluarga',
    description: 'Sudah dikonfirmasi oleh perwakilan keluarga / mempelai',
  },
  {
    value: 'vendor',
    label: 'Pihak Vendor / WO',
    description: 'Sudah dikonfirmasi oleh koordinator Vendor / WO acara',
  },
  {
    value: 'keluarga_vendor',
    label: 'Keluarga & Vendor',
    description: 'Sudah dikonfirmasi oleh kedua belah pihak',
  },
];

export function StaffGuestConfirmationModal({
  isOpen,
  guestName,
  guestPax,
  guestCategory,
  staffName,
  isSubmitting = false,
  onCancel,
  onConfirm,
}: StaffGuestConfirmationModalProps) {
  const [selectedSource, setSelectedSource] = useState<StaffConfirmationSource | ''>('');
  const [confirmationNote, setConfirmationNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedSource('');
      setConfirmationNote('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmClick = () => {
    if (!selectedSource || isSubmitting) return;
    onConfirm(selectedSource, confirmationNote.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-confirm-guest-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="staff-confirm-guest-title"
                className="text-base font-semibold text-slate-900 leading-snug"
              >
                Konfirmasi Penambahan Tamu
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Validasi petugas sebelum data tamu disimpan ke daftar acara
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Tutup dialog konfirmasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Mandatory Question */}
          <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-3.5">
            <p className="text-sm font-semibold text-slate-900 leading-relaxed">
              Apakah sudah konfirmasi dari Pihak Keluarga maupun Vendor?
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Pastikan penambahan tamu baru telah diketahui oleh perwakilan keluarga atau koordinator vendor. Catatan petugas akan tersimpan otomatis sebagai jejak audit.
            </p>
          </div>

          {/* Guest Summary (Clean unboxed metadata) */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-3.5 py-2.5">
            <div className="text-xs text-slate-500">Tamu yang akan ditambahkan</div>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">{guestName}</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-1 tabular-nums">
              <span>{Math.max(1, Number(guestPax) || 1)} Orang (Pax)</span>
              {guestCategory && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{guestCategory}</span>
                </>
              )}
              {staffName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Petugas: {staffName}</span>
                </>
              )}
            </div>
          </div>

          {/* Source Selection (Required) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Sumber Konfirmasi <span className="text-rose-600">*</span>
            </label>
            <div className="space-y-2">
              {CONFIRMATION_OPTIONS.map((option) => {
                const isSelected = selectedSource === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setSelectedSource(option.value)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors flex items-start justify-between gap-3 cursor-pointer disabled:opacity-60 ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div>
                      <div className={`text-sm font-semibold ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                        {option.label}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{option.description}</div>
                    </div>
                    <span
                      className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Approver Note */}
          <div>
            <label
              htmlFor="staff-confirmation-note"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Nama Pemberi Konfirmasi / Catatan <span className="font-normal text-slate-400">(Opsional)</span>
            </label>
            <input
              id="staff-confirmation-note"
              type="text"
              disabled={isSubmitting}
              value={confirmationNote}
              onChange={(e) => setConfirmationNote(e.target.value)}
              placeholder="Contoh: Ibu Ani (Keluarga) / Kak Rina (WO)"
              maxLength={120}
              className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!selectedSource || isSubmitting}
            onClick={handleConfirmClick}
            className="h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Ya, Sudah Konfirmasi &amp; Simpan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
