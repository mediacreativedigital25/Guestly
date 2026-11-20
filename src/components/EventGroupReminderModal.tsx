import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import {
  Users,
  CalendarClock,
  Send,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  Clock,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { EventRecord, User } from '../types';
import { getRoleLabel, isGreetingScreenUser } from '../lib/utils';
import { Modal } from './Modal';
import {
  PartnerGroupConfig,
  DEFAULT_GROUP_REMINDER_TIME,
  DEFAULT_GROUP_REMINDER_H0_TIME,
  resolvePartnerGroupConfig,
  computeReminderUnixTimestampWIB,
  formatUnixWibReadable,
  computeStaffSignature,
  buildGroupReminderMessage,
  scheduleOrSendEventGroupReminders,
} from '../lib/waGroupReminder';
import { showAlert } from '../lib/alerts';

interface EventGroupReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventRecord;
  currentAppUser: User | null;
  onEventUpdated?: (updatedLog: NonNullable<EventRecord['groupReminderLog']>) => void;
}

export function EventGroupReminderModal({
  isOpen,
  onClose,
  event,
  currentAppUser,
  onEventUpdated,
}: EventGroupReminderModalProps) {
  const [loading, setLoading] = useState(false);
  const [partnerConfig, setPartnerConfig] = useState<PartnerGroupConfig | null>(null);
  const [assignedStaff, setAssignedStaff] = useState<User[]>([]);
  const [previewMode, setPreviewMode] = useState<'h3' | 'h1' | 'h0' | 'now'>('h3');
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [localLog, setLocalLog] = useState<EventRecord['groupReminderLog']>(event.groupReminderLog);

  useEffect(() => {
    setLocalLog(event.groupReminderLog);
  }, [event.groupReminderLog]);

  useEffect(() => {
    if (!isOpen || !event?.id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as User));
        const staffForEvent = allUsers.filter(
          (u) =>
            u.role === 'staff' &&
            !isGreetingScreenUser(u) &&
            Array.isArray(u.assignedEventIds) &&
            u.assignedEventIds.includes(event.id!)
        );
        const config = await resolvePartnerGroupConfig(
          event.partnerId || currentAppUser?.partnerId || currentAppUser?.id || null,
          allUsers,
          currentAppUser
        );
        if (!cancelled) {
          setAssignedStaff(staffForEvent);
          setPartnerConfig(config);
        }
      } catch (err) {
        console.error('Error loading event group reminder info:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, event?.id, event?.partnerId, currentAppUser]);

  const reminderTime = partnerConfig?.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME;
  const reminderH0Time = partnerConfig?.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME;
  const nowSec = Math.floor(Date.now() / 1000);
  const h3Ts = useMemo(
    () => computeReminderUnixTimestampWIB(event.date, 3, reminderTime),
    [event.date, reminderTime]
  );
  const h1Ts = useMemo(
    () => computeReminderUnixTimestampWIB(event.date, 1, reminderTime),
    [event.date, reminderTime]
  );
  const h0Ts = useMemo(
    () => computeReminderUnixTimestampWIB(event.date, 0, reminderH0Time),
    [event.date, reminderH0Time]
  );

  const currentSignature = useMemo(() => computeStaffSignature(assignedStaff), [assignedStaff]);
  const staffChangedSinceLastSync = Boolean(
    localLog?.lastStaffSignature !== undefined &&
      (localLog.h3ScheduledAt || localLog.h1ScheduledAt || localLog.h0ScheduledAt) &&
      localLog.lastStaffSignature !== currentSignature
  );

  const previewMessage = useMemo(
    () =>
      buildGroupReminderMessage({
        event,
        staffList: assignedStaff,
        businessName: partnerConfig?.businessName || 'Guestly',
        mode: previewMode,
      }),
    [event, assignedStaff, partnerConfig?.businessName, previewMode]
  );

  const hasGroupConfigured = Boolean(
    partnerConfig?.waGroupReminderEnabled && partnerConfig?.waGroupId?.trim()
  );

  const handleScheduleReminders = async () => {
    if (!partnerConfig || !partnerConfig.waGroupId.trim()) {
      showAlert(
        'Grup WA Belum Diatur',
        'Atur Kode Grup WhatsApp terlebih dahulu di Manajemen Bisnis (Super Admin) atau Profil Saya (Owner/Partner).',
        'warning'
      );
      return;
    }

    setIsScheduling(true);
    try {
      const res = await scheduleOrSendEventGroupReminders({
        event: { ...event, groupReminderLog: localLog },
        staffList: assignedStaff,
        partnerConfig,
        mode: 'auto_schedule',
        forceReschedule: true,
      });

      if (res.updatedLog) {
        setLocalLog(res.updatedLog);
        onEventUpdated?.(res.updatedLog);
      }

      if (res.errors.length > 0) {
        showAlert(
          'Sebagian / Gagal Dijadwalkan',
          `${res.errors.join('\n')}\n\nPastikan device Fonnte aktif & nomor WA pengirim sudah bergabung ke Grup WA.`,
          'warning'
        );
      } else if (res.scheduledH3 || res.scheduledH1 || res.scheduledH0) {
        const parts: string[] = [];
        if (res.scheduledH3) parts.push(`H-3 (${formatUnixWibReadable(h3Ts)})`);
        if (res.scheduledH1) parts.push(`H-1 (${formatUnixWibReadable(h1Ts)})`);
        if (res.scheduledH0) parts.push(`Hari H (${formatUnixWibReadable(h0Ts)})`);
        showAlert(
          'Jadwal Grup WA Aktif',
          `Pengingat otomatis berhasil dijadwalkan di Fonnte via ${res.tokenSource}:\n• ${parts.join('\n• ')}`,
          'success'
        );
      } else {
        showAlert(
          'Informasi Jadwal',
          res.skippedReason || 'Tidak ada jadwal baru yang perlu dikirim.',
          'info'
        );
      }
    } finally {
      setIsScheduling(false);
    }
  };

  const handleSendNow = async () => {
    if (!partnerConfig || !partnerConfig.waGroupId.trim()) {
      showAlert(
        'Grup WA Belum Diatur',
        'Atur Kode Grup WhatsApp terlebih dahulu di Manajemen Bisnis (Super Admin) atau Profil Saya (Owner/Partner).',
        'warning'
      );
      return;
    }

    setIsSendingNow(true);
    try {
      const res = await scheduleOrSendEventGroupReminders({
        event: { ...event, groupReminderLog: localLog },
        staffList: assignedStaff,
        partnerConfig,
        mode: 'send_now',
      });

      if (res.updatedLog) {
        setLocalLog(res.updatedLog);
        onEventUpdated?.(res.updatedLog);
      }

      if (res.success) {
        showAlert(
          'Terkirim ke Grup WA',
          `Info jadwal acara & daftar Staff bertugas berhasil dikirim ke grup "${partnerConfig.waGroupName || partnerConfig.waGroupId}" via ${res.tokenSource}!`,
          'success'
        );
      } else {
        showAlert(
          'Gagal Kirim ke Grup',
          res.errors.join('\n') || 'Gagal mengirim pesan ke Grup WA. Pastikan nomor Fonnte sudah terhubung & menjadi anggota grup.',
          'error'
        );
      }
    } finally {
      setIsSendingNow(false);
    }
  };

  const settingsLink =
    currentAppUser?.role === 'superadmin' ? '/auth/login/businesses' : '/auth/login/profile';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pengingat Grup WhatsApp Tim (H-3, H-1 & Hari H)"
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="py-10 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <span>Memuat konfigurasi Grup WA &amp; daftar Staff...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Group Target Summary */}
          {hasGroupConfigured && partnerConfig ? (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-600" />
                    {partnerConfig.waGroupName || 'Grup WhatsApp Tim'}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white text-emerald-800 border border-emerald-200">
                    {partnerConfig.fonnteToken ? 'Token Fonnte Vendor' : 'Token Global Guestly'}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-900/80 font-mono">
                  {partnerConfig.waGroupId}
                </p>
                <p className="text-[11px] text-emerald-800 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Jam kirim: H-3 &amp; H-1 <strong>{reminderTime} WIB</strong> · Hari H <strong>{reminderH0Time} WIB</strong>
                </p>
              </div>
              <Link
                to={settingsLink}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-white border border-emerald-200 px-3 py-1.5 rounded-lg shrink-0 self-start sm:self-center"
              >
                <Settings className="w-3.5 h-3.5" />
                Ubah Pengaturan
              </Link>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-xs text-amber-950">
                <p className="font-bold">Grup WhatsApp Tim Belum Diaktifkan</p>
                <p className="text-amber-900/90 leading-relaxed">
                  Masukkan Kode Grup WA (<code>@g.us</code>) dan aktifkan pengingat otomatis terlebih dahulu agar jadwal H-3, H-1 &amp; Hari H dapat dikirim ke grup tim via Fonnte.
                </p>
                <Link
                  to={settingsLink}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 px-3 py-1.5 rounded-lg mt-1"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {currentAppUser?.role === 'superadmin'
                    ? 'Atur di Manajemen Bisnis'
                    : 'Atur di Profil Saya'}
                </Link>
              </div>
            </div>
          )}

          {/* H-3, H-1 & Hari H Schedule Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  H-3
                </span>
                {localLog?.h3ScheduledAt && localLog.h3TargetTimestamp === h3Ts ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Dijadwalkan
                  </span>
                ) : h3Ts && h3Ts > nowSec + 60 ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    Belum
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                    Lewat
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">{formatUnixWibReadable(h3Ts)}</p>
            </div>

            <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  H-1
                </span>
                {localLog?.h1ScheduledAt && localLog.h1TargetTimestamp === h1Ts ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Dijadwalkan
                  </span>
                ) : h1Ts && h1Ts > nowSec + 60 ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    Belum
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                    Lewat
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">{formatUnixWibReadable(h1Ts)}</p>
            </div>

            <div className="border border-rose-200/80 rounded-xl p-3 bg-rose-50/30 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-rose-900 flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  Hari H
                </span>
                {localLog?.h0ScheduledAt && localLog.h0TargetTimestamp === h0Ts ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Dijadwalkan
                  </span>
                ) : h0Ts && h0Ts > nowSec + 60 ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                    Belum
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                    Lewat
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">{formatUnixWibReadable(h0Ts)}</p>
            </div>
          </div>

          {/* Assigned Staff Summary */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                Staff Ditugaskan pada Acara Ini ({assignedStaff.length} Orang)
              </span>
              <Link
                to="/auth/login/users"
                onClick={onClose}
                className="text-[11px] font-semibold text-indigo-600 hover:underline"
              >
                Kelola / Tugaskan Staff &rarr;
              </Link>
            </div>

            {staffChangedSinceLastSync && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  Daftar Staff berubah sejak jadwal terakhir. Klik <strong>Jadwalkan Ulang</strong> atau <strong>Kirim Sekarang</strong> agar info grup selalu terbaru.
                </span>
              </div>
            )}

            {assignedStaff.length > 0 ? (
              <div className="space-y-1.5">
                {assignedStaff.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-900">{s.name}</span>
                      <span className="text-slate-500 ml-1.5">
                        · {getRoleLabel('staff', s.staffType || 'checkin')}
                      </span>
                      {s.assignmentNotes?.trim() && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Catatan: {s.assignmentNotes}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      {s.phone?.trim() || 'Tanpa No. WA'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Belum ada Staff lapangan yang ditugaskan ke acara ini. Pesan grup akan tetap mencantumkan peringatan agar koordinator segera menugaskan Staff.
              </p>
            )}
          </div>

          {/* Preview Message */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">Pratinjau Pesan Grup WA</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setPreviewMode('h3')}
                  className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                    previewMode === 'h3' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  H-3
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('h1')}
                  className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                    previewMode === 'h1' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  H-1
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('h0')}
                  className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                    previewMode === 'h0' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Hari H
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('now')}
                  className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                    previewMode === 'now' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Sekarang
                </button>
              </div>
            </div>
            <pre className="w-full max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800">
              {previewMessage}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(previewMessage);
                  setCopiedPreview(true);
                  setTimeout(() => setCopiedPreview(false), 2200);
                } catch {
                  showAlert('Info', 'Gagal menyalin otomatis. Silakan salin manual dari pratinjau.', 'info');
                }
              }}
              className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {copiedPreview ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Salin Pesan
                </>
              )}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSendNow}
                disabled={isSendingNow || isScheduling || !partnerConfig?.waGroupId?.trim()}
                className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSendingNow ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{isSendingNow ? 'Mengirim...' : 'Kirim ke Grup Sekarang'}</span>
              </button>

              <button
                type="button"
                onClick={handleScheduleReminders}
                disabled={isScheduling || isSendingNow || !partnerConfig?.waGroupId?.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isScheduling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CalendarClock className="w-3.5 h-3.5" />
                )}
                <span>
                  {isScheduling
                    ? 'Menjadwalkan...'
                    : staffChangedSinceLastSync
                    ? 'Jadwalkan Ulang H-3, H-1 & Hari H'
                    : 'Jadwalkan Otomatis H-3, H-1 & Hari H'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
