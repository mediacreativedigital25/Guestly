import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { EventRecord, User } from '../types';
import { getRoleLabel, isGreetingScreenUser, parseFirestoreDate } from './utils';
import { sendFonnteMessage } from './fonnte';

export const DEFAULT_GROUP_REMINDER_TIME = '07:00';
export const DEFAULT_GROUP_REMINDER_H0_TIME = '05:30';

export interface PartnerGroupConfig {
  partnerId: string | null;
  businessName: string;
  fonnteToken: string | null;
  waGroupId: string;
  waGroupName: string;
  waGroupReminderEnabled: boolean;
  waGroupReminderH3: boolean;
  waGroupReminderH1: boolean;
  waGroupReminderH0: boolean;
  waGroupReminderTime: string;
  waGroupReminderH0Time: string;
}

const ID_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ID_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function formatIndonesianDateTitleCase(dateInput?: any): string {
  if (!dateInput) return 'Menunggu konfirmasi';
  const parsed = parseFirestoreDate(dateInput);
  if (parsed && !isNaN(parsed.getTime())) {
    return `${ID_DAYS[parsed.getDay()]}, ${parsed.getDate()} ${ID_MONTHS[parsed.getMonth()]} ${parsed.getFullYear()}`;
  }
  const rawStr = String(dateInput).trim();
  const parts = rawStr.split(/[-/]/);
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10) > 31 ? parseInt(parts[0], 10) : parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[0], 10) > 31 ? parseInt(parts[2], 10) : parseInt(parts[0], 10);
    const dt = new Date(y, m, d);
    if (!isNaN(dt.getTime())) {
      return `${ID_DAYS[dt.getDay()]}, ${dt.getDate()} ${ID_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
    }
  }
  return rawStr;
}

function extractEventYmd(dateInput?: any): { year: number; month: number; day: number } | null {
  if (!dateInput) return null;
  const rawStr = String(dateInput).trim();
  // Prefer direct YYYY-MM-DD match to avoid timezone shifts
  const isoMatch = rawStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10) - 1,
      day: parseInt(isoMatch[3], 10),
    };
  }
  const parsed = parseFirestoreDate(dateInput);
  if (parsed && !isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth(),
      day: parsed.getDate(),
    };
  }
  return null;
}

/**
 * Computes UNIX timestamp (seconds) for (eventDate - daysBefore) at timeHHMM in WIB (UTC+7).
 */
export function computeReminderUnixTimestampWIB(
  eventDateInput: any,
  daysBefore: number,
  timeHHMM: string = DEFAULT_GROUP_REMINDER_TIME
): number | null {
  const ymd = extractEventYmd(eventDateInput);
  if (!ymd) return null;

  const cleanTime = (timeHHMM || DEFAULT_GROUP_REMINDER_TIME).trim();
  const timeMatch = cleanTime.match(/^(\d{1,2}):(\d{2})$/);
  const hour = timeMatch ? Math.min(23, Math.max(0, parseInt(timeMatch[1], 10))) : 7;
  const minute = timeMatch ? Math.min(59, Math.max(0, parseInt(timeMatch[2], 10))) : 0;

  // Date.UTC treats fields as UTC; subtract 7 hours to convert WIB -> UTC
  const utcMs = Date.UTC(ymd.year, ymd.month, ymd.day - daysBefore, hour, minute, 0) - 7 * 3600 * 1000;
  return Math.floor(utcMs / 1000);
}

export function formatUnixWibReadable(unixSec?: number | null): string {
  if (!unixSec || !Number.isFinite(unixSec)) return '-';
  // Shift to WIB (+7h) and read UTC components so output is always WIB regardless of browser TZ
  const wibDate = new Date((unixSec + 7 * 3600) * 1000);
  const dayName = ID_DAYS[wibDate.getUTCDay()] || '';
  const d = wibDate.getUTCDate();
  const m = ID_MONTHS[wibDate.getUTCMonth()] || '';
  const y = wibDate.getUTCFullYear();
  const hh = String(wibDate.getUTCHours()).padStart(2, '0');
  const mm = String(wibDate.getUTCMinutes()).padStart(2, '0');
  return `${dayName}, ${d} ${m} ${y} · ${hh}:${mm} WIB`;
}

export function computeStaffSignature(staffList: User[]): string {
  const regularStaff = staffList
    .filter((u) => u.role === 'staff' && !isGreetingScreenUser(u))
    .sort((a, b) => (a.id || a.email || '').localeCompare(b.id || b.email || ''));

  return regularStaff
    .map(
      (s) =>
        `${s.id || s.email}|${(s.name || '').trim()}|${s.staffType || 'checkin'}|${(s.phone || '').trim()}|${(s.assignmentNotes || '').trim()}`
    )
    .join(';');
}

export async function resolvePartnerGroupConfig(
  partnerId?: string | null,
  usersCache?: User[],
  currentAppUser?: User | null
): Promise<PartnerGroupConfig | null> {
  const buildFromOwner = (owner: User): PartnerGroupConfig => ({
    partnerId: owner.partnerId || owner.id || null,
    businessName: (owner.businessName || owner.name || 'Guestly').trim(),
    fonnteToken: owner.fonnteToken?.trim() || null,
    waGroupId: (owner.waGroupId || '').trim(),
    waGroupName: (owner.waGroupName || '').trim(),
    waGroupReminderEnabled: Boolean(owner.waGroupReminderEnabled),
    waGroupReminderH3: owner.waGroupReminderH3 !== false,
    waGroupReminderH1: owner.waGroupReminderH1 !== false,
    waGroupReminderH0: owner.waGroupReminderH0 !== false,
    waGroupReminderTime: (owner.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME).trim() || DEFAULT_GROUP_REMINDER_TIME,
    waGroupReminderH0Time: (owner.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME).trim() || DEFAULT_GROUP_REMINDER_H0_TIME,
  });

  // 1. Check current logged-in Owner/Partner directly
  if (
    currentAppUser &&
    (currentAppUser.role === 'owner' || currentAppUser.role === 'partner') &&
    (!partnerId || partnerId === currentAppUser.id || partnerId === currentAppUser.partnerId)
  ) {
    return buildFromOwner(currentAppUser);
  }

  // 2. Check cached users list
  if (partnerId && Array.isArray(usersCache) && usersCache.length > 0) {
    const matched = usersCache.find(
      (u) =>
        (u.role === 'owner' || u.role === 'partner') &&
        (u.id === partnerId || u.partnerId === partnerId)
    );
    if (matched) {
      return buildFromOwner(matched);
    }
  }

  // 3. Fallback: fetch owner doc directly from Firestore
  if (partnerId && partnerId !== 'default-partner') {
    try {
      const snap = await getDoc(doc(db, 'users', partnerId));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as User;
        return buildFromOwner(data);
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function buildGroupReminderMessage(params: {
  event: EventRecord;
  staffList: User[];
  businessName?: string | null;
  mode: 'h3' | 'h1' | 'h0' | 'now';
}): string {
  const { event, staffList, businessName, mode } = params;
  const orgName = (businessName || 'Guestly').trim();

  const headerLine =
    mode === 'h3'
      ? '📢 *PENGINGAT EVENT (H-3)*'
      : mode === 'h1'
      ? '🔔 *PENGINGAT FINAL EVENT (H-1 BESOK!)*'
      : mode === 'h0'
      ? '🚀 *PENGINGAT HARI H — ACARA HARI INI!*'
      : '📢 *INFO & KONFIRMASI TIM EVENT*';

  const introLine =
    mode === 'h3'
      ? 'Halo Tim! Mengingatkan bahwa *3 hari lagi* kita akan bertugas pada acara berikut:'
      : mode === 'h1'
      ? 'Halo Tim! Mengingatkan bahwa *BESOK (H-1)* kita akan bertugas pada acara berikut:'
      : mode === 'h0'
      ? 'Selamat pagi Tim! Hari ini adalah *HARI H* pelaksanaan acara. Mohon seluruh tim bersiap & hadir tepat waktu pada acara berikut:'
      : 'Halo Tim! Berikut info jadwal acara & konfirmasi daftar Staff yang bertugas:';

  const formattedDate = formatIndonesianDateTitleCase(event.date);
  const timePart = event.time?.trim() ? ` · ${event.time.trim()}` : '';
  const venueParts = [
    event.eInviteVenueName?.trim() || event.location?.trim() || '',
    event.eInviteVenueAddress?.trim() || '',
  ].filter(Boolean);
  const venueText = venueParts.length > 0 ? Array.from(new Set(venueParts)).join(', ') : 'Menunggu konfirmasi';
  const mapsUrl = (event.mapsUrl || event.eInviteMapsUrl || '').trim();

  const assignedStaff = staffList.filter(
    (u) => u.role === 'staff' && !isGreetingScreenUser(u)
  );

  const lines: string[] = [
    headerLine,
    `🏢 *Penyelenggara* : ${orgName}`,
    '',
    introLine,
    '',
    `🎉 *Acara* : ${event.title}`,
    `📅 *Tanggal* : ${formattedDate}${timePart}`,
    `📍 *Lokasi* : ${venueText}`,
  ];

  if (mapsUrl) {
    lines.push(`🗺️ *Google Maps* : ${mapsUrl}`);
  }

  lines.push('');

  if (assignedStaff.length > 0) {
    lines.push(`👥 *Daftar Staff yang Bertugas (${assignedStaff.length} Orang)* :`);
    assignedStaff.forEach((staff, idx) => {
      const roleLabel = getRoleLabel('staff', staff.staffType || 'checkin');
      const phonePart = staff.phone?.trim() ? ` · ${staff.phone.trim()}` : '';
      lines.push(`${idx + 1}. *${staff.name}* — ${roleLabel}${phonePart}`);
      if (staff.assignmentNotes?.trim()) {
        lines.push(`   📝 Catatan: ${staff.assignmentNotes.trim()}`);
      }
    });
  } else {
    lines.push(
      `⚠️ *Daftar Staff yang Bertugas* :`,
      `Belum ada Staff lapangan yang ditugaskan ke acara ini. Mohon koordinator segera menugaskan Staff melalui menu *Manajemen User → User & Petugas*.`
    );
  }

  lines.push(
    '',
    `✅ *Checklist Kesiapan Tim* :`,
    `• Mohon masing-masing Staff konfirmasi kehadiran di grup ini.`,
    `• Pastikan sudah tes login aplikasi Guestly di perangkat yang akan dipakai (ingat aturan *1 User = 1 Perangkat*).`,
    `• Pastikan baterai perangkat penuh & koneksi internet aman.`,
    '',
    `Terima kasih, semangat bertugas! 🙏`
  );

  return lines.join('\n');
}

export interface GroupReminderDispatchResult {
  success: boolean;
  tokenSource: string;
  scheduledH3: boolean;
  scheduledH1: boolean;
  scheduledH0: boolean;
  sentNow: boolean;
  skippedReason?: string;
  errors: string[];
  updatedLog?: EventRecord['groupReminderLog'];
}

export async function scheduleOrSendEventGroupReminders(params: {
  event: EventRecord;
  staffList: User[];
  partnerConfig: PartnerGroupConfig;
  mode: 'auto_schedule' | 'send_now';
  forceReschedule?: boolean;
}): Promise<GroupReminderDispatchResult> {
  const { event, staffList, partnerConfig, mode, forceReschedule = false } = params;
  const groupId = partnerConfig.waGroupId.trim();
  const vendorToken = partnerConfig.fonnteToken?.trim() || null;
  const tokenSource = vendorToken ? 'Token Fonnte Vendor' : 'Token Global Guestly';

  if (!groupId) {
    return {
      success: false,
      tokenSource,
      scheduledH3: false,
      scheduledH1: false,
      scheduledH0: false,
      sentNow: false,
      skippedReason: 'Kode Grup WhatsApp belum diatur pada profil bisnis Partner.',
      errors: ['Kode Grup WhatsApp belum diatur.'],
    };
  }

  const sendToGroup = async (message: string, scheduleTs?: number) => {
    return vendorToken
      ? await sendFonnteMessage(vendorToken, groupId, message, undefined, {
          strictToken: true,
          schedule: scheduleTs,
        })
      : await sendFonnteMessage(null, groupId, message, undefined, {
          strictToken: false,
          schedule: scheduleTs,
        });
  };

  const currentLog = event.groupReminderLog || {};
  const reminderTime = partnerConfig.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME;
  const reminderH0Time = partnerConfig.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME;
  const nextLog: NonNullable<EventRecord['groupReminderLog']> = {
    ...currentLog,
    groupId,
    groupName: partnerConfig.waGroupName || currentLog.groupName || '',
    reminderTime,
    reminderH0Time,
  };
  const staffSignature = computeStaffSignature(staffList);

  if (mode === 'send_now') {
    const msg = buildGroupReminderMessage({
      event,
      staffList,
      businessName: partnerConfig.businessName,
      mode: 'now',
    });
    const res = await sendToGroup(msg);
    if (!res.success) {
      return {
        success: false,
        tokenSource,
        scheduledH3: false,
        scheduledH1: false,
        scheduledH0: false,
        sentNow: false,
        errors: [res.error || 'Gagal mengirim pesan ke Grup WhatsApp.'],
      };
    }

    nextLog.lastManualSentAt = new Date().toISOString();
    nextLog.lastStaffSignature = staffSignature;
    if (event.id) {
      try {
        await updateDoc(doc(db, 'events', event.id), {
          groupReminderLog: nextLog,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking
      }
    }

    return {
      success: true,
      tokenSource,
      scheduledH3: false,
      scheduledH1: false,
      scheduledH0: false,
      sentNow: true,
      errors: [],
      updatedLog: nextLog,
    };
  }

  // mode === 'auto_schedule'
  const nowSec = Math.floor(Date.now() / 1000);
  const errors: string[] = [];
  let scheduledH3 = false;
  let scheduledH1 = false;
  let scheduledH0 = false;
  let anyChanged = false;

  const sameGroupAndRoster =
    !forceReschedule &&
    currentLog.groupId === groupId &&
    currentLog.lastStaffSignature === staffSignature;

  // Schedule H-3
  if (partnerConfig.waGroupReminderH3) {
    const h3Ts = computeReminderUnixTimestampWIB(event.date, 3, reminderTime);
    const alreadyScheduledH3 = Boolean(
      sameGroupAndRoster &&
        currentLog.reminderTime === reminderTime &&
        currentLog.h3TargetTimestamp === h3Ts
    );
    if (h3Ts && h3Ts > nowSec + 60 && !alreadyScheduledH3) {
      const msgH3 = buildGroupReminderMessage({
        event,
        staffList,
        businessName: partnerConfig.businessName,
        mode: 'h3',
      });
      const resH3 = await sendToGroup(msgH3, h3Ts);
      if (resH3.success) {
        scheduledH3 = true;
        anyChanged = true;
        nextLog.h3ScheduledAt = new Date().toISOString();
        nextLog.h3TargetTimestamp = h3Ts;
      } else {
        errors.push(`H-3 gagal dijadwalkan: ${resH3.error || 'Fonnte error'}`);
      }
    }
  }

  // Schedule H-1
  if (partnerConfig.waGroupReminderH1) {
    const h1Ts = computeReminderUnixTimestampWIB(event.date, 1, reminderTime);
    const alreadyScheduledH1 = Boolean(
      sameGroupAndRoster &&
        currentLog.reminderTime === reminderTime &&
        currentLog.h1TargetTimestamp === h1Ts
    );
    if (h1Ts && h1Ts > nowSec + 60 && !alreadyScheduledH1) {
      const msgH1 = buildGroupReminderMessage({
        event,
        staffList,
        businessName: partnerConfig.businessName,
        mode: 'h1',
      });
      const resH1 = await sendToGroup(msgH1, h1Ts);
      if (resH1.success) {
        scheduledH1 = true;
        anyChanged = true;
        nextLog.h1ScheduledAt = new Date().toISOString();
        nextLog.h1TargetTimestamp = h1Ts;
      } else {
        errors.push(`H-1 gagal dijadwalkan: ${resH1.error || 'Fonnte error'}`);
      }
    }
  }

  // Schedule Hari H (H-0, default 05:30 WIB)
  if (partnerConfig.waGroupReminderH0) {
    const h0Ts = computeReminderUnixTimestampWIB(event.date, 0, reminderH0Time);
    const alreadyScheduledH0 = Boolean(
      sameGroupAndRoster &&
        currentLog.reminderH0Time === reminderH0Time &&
        currentLog.h0TargetTimestamp === h0Ts
    );
    if (h0Ts && h0Ts > nowSec + 60 && !alreadyScheduledH0) {
      const msgH0 = buildGroupReminderMessage({
        event,
        staffList,
        businessName: partnerConfig.businessName,
        mode: 'h0',
      });
      const resH0 = await sendToGroup(msgH0, h0Ts);
      if (resH0.success) {
        scheduledH0 = true;
        anyChanged = true;
        nextLog.h0ScheduledAt = new Date().toISOString();
        nextLog.h0TargetTimestamp = h0Ts;
      } else {
        errors.push(`Hari H gagal dijadwalkan: ${resH0.error || 'Fonnte error'}`);
      }
    }
  }

  if (anyChanged) {
    nextLog.lastStaffSignature = staffSignature;
    if (event.id) {
      try {
        await updateDoc(doc(db, 'events', event.id), {
          groupReminderLog: nextLog,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking
      }
    }
  }

  const h3Future = Boolean(
    partnerConfig.waGroupReminderH3 &&
      (computeReminderUnixTimestampWIB(event.date, 3, reminderTime) || 0) > nowSec + 60
  );
  const h1Future = Boolean(
    partnerConfig.waGroupReminderH1 &&
      (computeReminderUnixTimestampWIB(event.date, 1, reminderTime) || 0) > nowSec + 60
  );
  const h0Future = Boolean(
    partnerConfig.waGroupReminderH0 &&
      (computeReminderUnixTimestampWIB(event.date, 0, reminderH0Time) || 0) > nowSec + 60
  );

  let skippedReason: string | undefined;
  if (!scheduledH3 && !scheduledH1 && !scheduledH0 && errors.length === 0) {
    if (!h3Future && !h1Future && !h0Future) {
      skippedReason = 'Waktu jadwal H-3, H-1, dan Hari H untuk acara ini sudah terlewat. Gunakan tombol "Kirim ke Grup Sekarang" untuk mengirim langsung.';
    } else if (sameGroupAndRoster) {
      skippedReason = 'Jadwal H-3, H-1 & Hari H sudah tersinkron dengan daftar Staff terbaru.';
    }
  }

  return {
    success: errors.length === 0 && (scheduledH3 || scheduledH1 || scheduledH0 || Boolean(skippedReason)),
    tokenSource,
    scheduledH3,
    scheduledH1,
    scheduledH0,
    sentNow: false,
    skippedReason,
    errors,
    updatedLog: anyChanged ? nextLog : currentLog,
  };
}

export async function sendTestGroupMessage(params: {
  groupId: string;
  groupName?: string;
  businessName?: string;
  vendorToken?: string | null;
}): Promise<{ success: boolean; tokenSource: string; error?: string }> {
  const { groupId, groupName, businessName, vendorToken } = params;
  const cleanGroup = groupId.trim();
  const cleanToken = vendorToken?.trim() || null;
  const tokenSource = cleanToken ? 'Token Fonnte Vendor' : 'Token Global Guestly';

  if (!cleanGroup) {
    return { success: false, tokenSource, error: 'Kode Grup WhatsApp belum diisi.' };
  }

  const msg = [
    `✅ *TES KONEKSI GRUP TIM EVENT*`,
    `🏢 *Penyelenggara* : ${businessName?.trim() || 'Guestly'}`,
    groupName?.trim() ? `👥 *Grup* : ${groupName.trim()}` : '',
    ``,
    `Halo Tim! Grup ini telah berhasil terhubung dengan sistem pengingat otomatis event (H-3, H-1 & Hari H).`,
    `Pengingat jadwal acara & daftar Staff yang bertugas akan dikirim otomatis ke grup ini. 🙏`,
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n');

  const res = cleanToken
    ? await sendFonnteMessage(cleanToken, cleanGroup, msg, undefined, { strictToken: true })
    : await sendFonnteMessage(null, cleanGroup, msg, undefined, { strictToken: false });

  return {
    success: res.success,
    tokenSource,
    error: res.error,
  };
}
