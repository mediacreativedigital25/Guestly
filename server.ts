import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cron from "node-cron";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import QRCode from "qrcode";
import { supabase } from "./src/lib/supabase.ts";

dotenv.config();

const uploadsBaseDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsBaseDir)) {
  fs.mkdirSync(uploadsBaseDir, { recursive: true });
}

// Cloudflare R2 Credentials
const r2AccountId = process.env.R2_ACCOUNT_ID || 'c6361627ef5eeb873424c706ca72c0e2';
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID || 'e3610ce08924866d3bd8611dcdba6cdf';
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY || 'ec8dcd365af55a3f08006e72d5f3eb06dd7582ffbb22ec7943f6e15cec55bb64';
const r2BucketName = process.env.R2_BUCKET_NAME || 'guestly-storage';
const r2PublicUrl = process.env.R2_PUBLIC_URL || 'https://cdn.guestly.yulovi.com';

function getR2Client() {
  if (!r2SecretAccessKey) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsBaseDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

function normalizePhoneTarget(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().includes('@g.us')) {
    return trimmed.replace(/\s+/g, '');
  }
  const cleaned = trimmed.replace(/[\s\-().]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+62')) return '0' + cleaned.slice(3);
  if (cleaned.startsWith('62') && cleaned.length > 9) return '0' + cleaned.slice(2);
  return cleaned;
}

async function resolveServerFonnteToken(customToken?: string | null): Promise<string> {
  if (customToken && String(customToken).trim()) {
    return String(customToken).trim();
  }
  const envToken = (process.env.FONNTE_TOKEN || process.env.VITE_FONNTE_TOKEN || '').trim();
  if (envToken) {
    return envToken;
  }
  try {
    const { data: rows } = await supabase
      .from('settings')
      .select('id, data')
      .in('id', ['global', 'doc:settings:global']);
    if (rows && rows.length > 0) {
      for (const r of rows) {
        const dbToken = r?.data?.fonnteToken;
        if (dbToken && String(dbToken).trim()) {
          return String(dbToken).trim();
        }
      }
    }
  } catch (_e) {
    // ignore
  }
  return '';
}

async function sendWhatsAppNotification(target: string, message: string) {
  const token = await resolveServerFonnteToken();
  if (!token) {
    console.warn("FONNTE_TOKEN is not set in environment variables or database settings. Notification won't be sent.");
    return;
  }
  const normalizedTarget = normalizePhoneTarget(target);
  if (!normalizedTarget) return;
  
  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        "Authorization": token
      },
      body: new URLSearchParams({
        "target": normalizedTarget,
        "message": message,
        "countryCode": "62"
      })
    });
    const result = await response.json();
    console.log("Fonnte API response:", result);
  } catch (error) {
    console.error("Error sending WhatsApp message via Fonnte:", error);
  }
}

async function getPartnerPhone(partnerId: string): Promise<{ name?: string; phone?: string } | null> {
  const { data: metaRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', `doc:users:${partnerId}`)
    .maybeSingle();

  if (metaRow?.data?.phone) {
    return { name: metaRow.data.name, phone: metaRow.data.phone };
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('*')
    .eq('id', partnerId)
    .maybeSingle();

  if (userRow) {
    return { name: userRow.name, phone: (userRow as any).phone };
  }
  return null;
}

async function syncExpiredEvents() {
  try {
    const { data: rows, error } = await supabase
      .from('events')
      .select('id, status, active_until, created_at, date, settings')
      .eq('status', 'published');

    if (error || !rows || rows.length === 0) return;

    const now = Date.now();
    for (const row of rows) {
      const extra = row.settings && typeof row.settings === 'object' ? row.settings : {};
      const activeDays =
        typeof extra.activeDays === 'number' && extra.activeDays > 0 ? extra.activeDays : 30;
      const rawActive = extra.activeUntil || row.active_until;

      let expiryDate: Date | null = null;
      let normalizedYmd = '';

      if (rawActive) {
        const parsed = new Date(rawActive);
        if (!isNaN(parsed.getTime())) {
          if (typeof rawActive === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawActive.trim())) {
            parsed.setHours(23, 59, 59, 999);
            normalizedYmd = rawActive.trim();
          } else {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            normalizedYmd = `${y}-${m}-${d}`;
          }
          expiryDate = parsed;
        }
      }

      if (!expiryDate && row.created_at) {
        const created = new Date(row.created_at);
        if (!isNaN(created.getTime())) {
          const calc = new Date(created.getTime());
          calc.setDate(calc.getDate() + activeDays);
          calc.setHours(23, 59, 59, 999);
          expiryDate = calc;
          const y = calc.getFullYear();
          const m = String(calc.getMonth() + 1).padStart(2, '0');
          const d = String(calc.getDate()).padStart(2, '0');
          normalizedYmd = `${y}-${m}-${d}`;
        }
      }

      if (!expiryDate) continue;

      if (expiryDate.getTime() < now) {
        await supabase
          .from('events')
          .update({
            status: 'draft',
            active_until: normalizedYmd || row.active_until,
            settings: {
              ...extra,
              activeUntil: normalizedYmd || extra.activeUntil,
              activeDays,
              subscriptionStatus: 'expired',
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      } else if (!rawActive && normalizedYmd) {
        await supabase
          .from('events')
          .update({
            active_until: normalizedYmd,
            settings: {
              ...extra,
              activeUntil: normalizedYmd,
              activeDays,
              subscriptionStatus: extra.subscriptionStatus || 'active',
            },
          })
          .eq('id', row.id);
      }
    }
  } catch (err) {
    console.warn('syncExpiredEvents warning:', err);
  }
}

function startCronJob() {
  // Initial expiry sweep at server boot
  syncExpiredEvents();

  // Run expiry check hourly
  cron.schedule('0 * * * *', async () => {
    await syncExpiredEvents();
  });

  // Run daily at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    try {
      await syncExpiredEvents();
      const token = await resolveServerFonnteToken();
      if (!token) {
        console.log('FONNTE_TOKEN is not set. Skipping daily event notification check.');
        return;
      }
      console.log('Running daily event notification check via Supabase...');
      const offsets = [30, 14, 7, 3];

      for (const offset of offsets) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + offset);
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        const targetDateStr = `${year}-${month}-${day}`;

        const { data: events } = await supabase
          .from('events')
          .select('*')
          .eq('date', targetDateStr);

        if (!events || events.length === 0) continue;

        for (const event of events) {
          if (event.status === 'completed' || !event.partner_id) continue;
          const partner = await getPartnerPhone(event.partner_id);
          if (partner?.phone) {
            const message = `Halo ${partner.name || 'Partner'},\n\nSebagai pengingat, acara klien Anda sudah mendekati H-${offset}.\n\n*Detail Acara:*\n- Nama Acara: ${event.title}\n- Tanggal Acara: ${targetDateStr}\n- Lokasi: ${event.location || '-'}\n\nMohon pastikan segala perlengkapan dan kebutuhan acara disiapkan dengan matang.\n\nSalam Hangat,\nTim Guestly`;
            await sendWhatsAppNotification(partner.phone, message);
          }
        }
      }
    } catch (error) {
      console.error('Error running cron job:', error);
    }
  });
}

async function startServer() {
  startCronJob();

  const app = express();
  const PORT = 3000;

  app.post('/api/trigger-notifications', async (_req, res) => {
    try {
      let totalSentCount = 0;
      const logs: string[] = [];
      const offsets = [30, 14, 7, 3];

      for (const offset of offsets) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + offset);
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        const targetDateStr = `${year}-${month}-${day}`;

        const { data: events } = await supabase
          .from('events')
          .select('*')
          .eq('date', targetDateStr);

        if (!events || events.length === 0) {
          logs.push(`No events approaching H-${offset}.`);
          continue;
        }

        let sentCount = 0;
        for (const event of events) {
          if (event.status === 'completed' || !event.partner_id) continue;
          const partner = await getPartnerPhone(event.partner_id);
          if (partner?.phone) {
            const message = `Halo ${partner.name || 'Partner'},\n\nSebagai pengingat, acara klien Anda sudah mendekati H-${offset}.\n\n*Detail Acara:*\n- Nama Acara: ${event.title}\n- Tanggal Acara: ${targetDateStr}\n- Lokasi: ${event.location || '-'}\n\nMohon pastikan segala perlengkapan dan kebutuhan acara disiapkan dengan matang.\n\nSalam Hangat,\nTim Guestly`;
            await sendWhatsAppNotification(partner.phone, message);
            sentCount++;
          }
        }
        logs.push(`Sent ${sentCount} notifications for H-${offset}.`);
        totalSentCount += sentCount;
      }
      res.json({ message: `Successfully sent ${totalSentCount} notifications.`, logs });
    } catch (error: any) {
      console.error('Error running trigger:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.set("trust proxy", true);
  app.use(express.json({ limit: "50mb" }));

  // Check Fonnte token configuration status
  app.get('/api/fonnte-status', async (_req, res) => {
    try {
      const envConfigured = Boolean((process.env.FONNTE_TOKEN || process.env.VITE_FONNTE_TOKEN || '').trim());
      const resolved = await resolveServerFonnteToken();
      res.json({
        configured: Boolean(resolved),
        envConfigured,
        source: envConfigured ? 'env' : (resolved ? 'database' : 'none')
      });
    } catch (e: any) {
      res.json({ configured: false, envConfigured: false, source: 'none', error: e.message });
    }
  });

  // Check Fonnte device connection status safely from server-side
  app.post('/api/fonnte/check-device', async (req, res) => {
    try {
      const { token: customToken, useGlobal } = req.body || {};
      const cleanCustom = customToken ? String(customToken).trim() : '';
      const resolvedToken = cleanCustom
        ? cleanCustom
        : useGlobal
        ? await resolveServerFonnteToken()
        : '';

      if (!resolvedToken) {
        return res.json({
          success: false,
          configured: false,
          connected: false,
          error: 'Token Fonnte belum diisi.',
        });
      }

      const response = await fetch('https://api.fonnte.com/device', {
        method: 'POST',
        headers: {
          Authorization: resolvedToken,
        },
      });

      const result = await response.json();
      const rawStatus = String(result?.device_status || '').toLowerCase();
      const isConnected =
        Boolean(result?.status) &&
        (rawStatus === 'connect' || rawStatus === 'connected' || (!rawStatus && Boolean(result?.device)));

      if (result?.status) {
        return res.json({
          success: true,
          configured: true,
          connected: isConnected,
          device: result.device || '',
          name: result.name || '',
          quota: result.quota ?? '',
          expired: result.expired || '',
          deviceStatus: result.device_status || (isConnected ? 'connect' : 'unknown'),
          reason: result.reason || '',
        });
      }

      return res.json({
        success: false,
        configured: true,
        connected: false,
        deviceStatus: result?.device_status || 'disconnect',
        error: result?.reason || 'Token tidak valid atau device WhatsApp belum terhubung di Fonnte.',
      });
    } catch (error: any) {
      console.error('Error checking Fonnte device:', error);
      res.status(500).json({
        success: false,
        configured: true,
        connected: false,
        error: error?.message || 'Gagal menghubungi server Fonnte.',
      });
    }
  });

  // Fetch WhatsApp group list from Fonnte safely from server-side
  app.post('/api/fonnte/groups', async (req, res) => {
    try {
      const { token: customToken, useGlobal, refresh } = req.body || {};
      const cleanCustom = customToken ? String(customToken).trim() : '';
      const resolvedToken = cleanCustom
        ? cleanCustom
        : useGlobal
        ? await resolveServerFonnteToken()
        : '';

      if (!resolvedToken) {
        return res.json({
          success: false,
          groups: [],
          error: 'Token Fonnte belum diatur. Pastikan Token Vendor atau Token Global Guestly sudah terhubung.',
        });
      }

      if (refresh !== false) {
        try {
          await fetch('https://api.fonnte.com/fetch-group', {
            method: 'POST',
            headers: { Authorization: resolvedToken },
          });
        } catch {
          // continue to get-whatsapp-group
        }
      }

      const groupRes = await fetch('https://api.fonnte.com/get-whatsapp-group', {
        method: 'POST',
        headers: { Authorization: resolvedToken },
      });
      const result: any = await groupRes.json().catch(() => ({}));

      if (result?.status && Array.isArray(result.data)) {
        const groups = result.data
          .filter((g: any) => g && g.id)
          .map((g: any) => ({
            id: String(g.id).trim(),
            name: String(g.name || g.id).trim(),
          }));
        return res.json({
          success: true,
          groups,
          tokenSource: cleanCustom ? 'Token Fonnte Vendor' : 'Token Global Guestly',
        });
      }

      return res.json({
        success: false,
        groups: [],
        error: result?.reason || 'Gagal mengambil daftar grup dari Fonnte. Pastikan device WhatsApp terhubung.',
      });
    } catch (error: any) {
      console.error('Error fetching Fonnte groups:', error);
      res.status(500).json({
        success: false,
        groups: [],
        error: error?.message || 'Gagal menghubungi server Fonnte.',
      });
    }
  });

  // Proxy endpoint for sending WhatsApp messages via Fonnte securely
  app.post('/api/send-whatsapp', async (req, res) => {
    try {
      const { target, message, url, token: customToken, strictToken, schedule } = req.body;
      const normalizedTarget = normalizePhoneTarget(target);
      const isGroupTarget = normalizedTarget.toLowerCase().includes('@g.us');
      if (!normalizedTarget) {
        return res.status(400).json({ success: false, error: 'Nomor atau ID Grup WhatsApp tujuan tidak valid atau kosong.' });
      }

      const cleanCustomToken = customToken ? String(customToken).trim() : '';
      const token = strictToken
        ? cleanCustomToken
        : await resolveServerFonnteToken(cleanCustomToken);
      
      if (!token) {
        return res.json({ 
          success: false, 
          notConfigured: true, 
          error: 'Token Fonnte belum diatur. Silakan isi API Token Fonnte terlebih dahulu.' 
        });
      }

      let resolvedMediaUrl = url ? String(url).trim() : '';
      if (resolvedMediaUrl.startsWith('/')) {
        const origin = getPublicOrigin(req);
        resolvedMediaUrl = `${origin}${resolvedMediaUrl}`;
      }

      const body = new URLSearchParams({
        "target": normalizedTarget,
        "message": message,
      });
      if (!isGroupTarget) {
        body.append("countryCode", "62");
      }
      if (resolvedMediaUrl) {
        body.append("url", resolvedMediaUrl);
      }
      if (schedule && Number(schedule) > 0) {
        body.append("schedule", String(Math.floor(Number(schedule))));
      }

      const response = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          "Authorization": token
        },
        body: body
      });
      
      const result = await response.json();
      
      if (result.status) {
        return res.json({ success: true, result });
      } else {
        const reasonStr = String(result.reason || 'Fonnte API error');
        const isMediaError = /url|media|file|image|attachment|package|plan|upgrade/i.test(reasonStr);
        return res.status(400).json({ success: false, error: reasonStr, isMediaError });
      }
    } catch (error: any) {
      console.error('Error proxying wa message:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ================= FORGOT PASSWORD (WHATSAPP OTP + ADMIN FALLBACK) =================
  function normalizePhoneDigits62(raw: string): string {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('62')) return digits;
    if (digits.startsWith('0')) return '62' + digits.slice(1);
    if (digits.startsWith('8')) return '62' + digits;
    return digits;
  }

  function maskPhoneForDisplay(raw: string): string {
    const target = normalizePhoneTarget(raw);
    const digits = target.replace(/\D/g, '');
    if (digits.length <= 6) return digits;
    const prefix = digits.slice(0, 4);
    const suffix = digits.slice(-3);
    const hidden = '•'.repeat(Math.max(3, digits.length - 7));
    return `${prefix}${hidden}${suffix}`;
  }

  function extractUserPhone(userRow: any, meta: any): string {
    const candidates = [
      meta?.phone,
      meta?.whatsapp,
      meta?.whatsappNumber,
      meta?.phoneNumber,
      meta?.noWa,
      userRow?.phone,
      userRow?.whatsapp,
    ];
    for (const c of candidates) {
      const str = String(c || '').trim();
      const digits = str.replace(/\D/g, '');
      if (digits.length >= 9) return str;
    }
    return '';
  }

  function hashResetOtp(userId: string, otp: string): string {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${otp.trim()}:guestly-otp-v1`)
      .digest('hex');
  }

  async function resolveAdminWhatsappNumber(): Promise<string> {
    try {
      const { data: rows } = await supabase
        .from('settings')
        .select('id, data')
        .in('id', ['global', 'doc:settings:global']);
      for (const r of rows || []) {
        const raw = r?.data?.adminPhone;
        if (raw && String(raw).replace(/\D/g, '').length >= 9) {
          return normalizePhoneDigits62(String(raw));
        }
      }
    } catch {
      // ignore fallback
    }
    return '6285158636606';
  }

  async function findUserForPasswordReset(identifier: string): Promise<{
    id: string;
    email: string;
    name: string;
    phone: string;
    role: string;
    meta: any;
  } | null> {
    const trimmed = String(identifier || '').trim();
    if (!trimmed) return null;
    const isEmail = trimmed.includes('@');
    const cleanEmail = trimmed.toLowerCase();
    const cleanPhone62 = !isEmail ? normalizePhoneDigits62(trimmed) : '';

    if (isEmail) {
      const { data: userRow } = await supabase
        .from('users')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (userRow) {
        const { data: metaRow } = await supabase
          .from('settings')
          .select('data')
          .eq('id', `doc:users:${userRow.id}`)
          .maybeSingle();
        const meta = metaRow?.data || {};
        return {
          id: userRow.id,
          email: userRow.email || meta.email || cleanEmail,
          name: meta.name || userRow.name || 'Pengguna',
          phone: extractUserPhone(userRow, meta),
          role: meta.role || userRow.role || 'client',
          meta,
        };
      }
    }

    // Fallback full scan across settings doc:users:% (also handles phone lookup & migrated users)
    const { data: metaRows } = await supabase
      .from('settings')
      .select('id, data')
      .like('id', 'doc:users:%');

    for (const row of metaRows || []) {
      const d = row?.data || {};
      const uid = String(row.id || '').replace('doc:users:', '');
      if (!uid) continue;

      if (isEmail) {
        if (d.email && String(d.email).trim().toLowerCase() === cleanEmail) {
          return {
            id: uid,
            email: d.email,
            name: d.name || 'Pengguna',
            phone: extractUserPhone(null, d),
            role: d.role || 'client',
            meta: d,
          };
        }
      } else if (cleanPhone62.length >= 9) {
        const extracted = extractUserPhone(null, d);
        if (extracted && normalizePhoneDigits62(extracted) === cleanPhone62) {
          return {
            id: uid,
            email: d.email || '',
            name: d.name || 'Pengguna',
            phone: extracted,
            role: d.role || 'client',
            meta: d,
          };
        }
      }
    }

    return null;
  }

  app.post('/api/auth/forgot-password/request', async (req, res) => {
    try {
      const { identifier } = req.body || {};
      const trimmed = String(identifier || '').trim();
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          error: 'Masukkan email atau nomor WhatsApp yang terdaftar.',
        });
      }

      const adminPhone = await resolveAdminWhatsappNumber();
      const user = await findUserForPasswordReset(trimmed);
      if (!user) {
        return res.status(404).json({
          success: false,
          code: 'ACCOUNT_NOT_FOUND',
          adminPhone,
          error: 'Akun dengan email atau nomor WhatsApp tersebut tidak ditemukan. Periksa kembali ejaan Anda.',
        });
      }

      if (!user.phone) {
        return res.json({
          success: false,
          code: 'NO_WHATSAPP',
          fallbackAdminWa: true,
          adminPhone,
          userName: user.name,
          userEmail: user.email,
          error:
            'Akun ini belum mendaftarkan nomor WhatsApp, sehingga kode OTP tidak dapat dikirim otomatis. Silakan hubungi Admin via WhatsApp untuk bantuan reset kata sandi.',
        });
      }

      const otpDocId = `doc:password_reset_otp:${user.id}`;
      const { data: existingOtpRow } = await supabase
        .from('settings')
        .select('data')
        .eq('id', otpDocId)
        .maybeSingle();

      const nowMs = Date.now();
      const COOLDOWN_MS = 60 * 1000;
      const EXPIRY_MS = 5 * 60 * 1000;
      const maskedPhone = maskPhoneForDisplay(user.phone);

      if (existingOtpRow?.data?.createdAtMs) {
        const elapsed = nowMs - Number(existingOtpRow.data.createdAtMs);
        if (elapsed < COOLDOWN_MS) {
          const retryAfterSec = Math.max(1, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
          return res.status(429).json({
            success: false,
            code: 'COOLDOWN',
            retryAfterSec,
            maskedPhone,
            error: `Kode OTP baru saja dikirim ke ${maskedPhone}. Tunggu ${retryAfterSec} detik untuk mengirim ulang.`,
          });
        }
      }

      const token = await resolveServerFonnteToken();
      if (!token) {
        return res.json({
          success: false,
          code: 'FONNTE_NOT_CONFIGURED',
          fallbackAdminWa: true,
          adminPhone,
          userName: user.name,
          userEmail: user.email,
          error:
            'Layanan pengiriman OTP WhatsApp otomatis sedang tidak tersedia. Silakan hubungi Admin via WhatsApp untuk reset kata sandi manual.',
        });
      }

      const otpCode = String(crypto.randomInt(100000, 1000000));
      const otpHash = hashResetOtp(user.id, otpCode);
      const targetPhone = normalizePhoneTarget(user.phone);

      const message = `🔐 *Kode Reset Kata Sandi Guestly*

Halo Kak *${user.name}*,

Kami menerima permintaan reset kata sandi untuk akun Guestly Anda (*${user.email || maskedPhone}*).

Kode OTP Anda:
*${otpCode}*

⏱️ Berlaku selama *5 menit* (hanya dapat digunakan 1 kali).
⚠️ *Jangan bagikan kode ini kepada siapa pun*, termasuk pihak yang mengaku admin.

Jika Anda tidak merasa meminta reset kata sandi, abaikan pesan ini — kata sandi Anda tetap aman.

─────────────────
*Guestly* · Smart Guest Management`;

      const waBody = new URLSearchParams({
        target: targetPhone,
        message,
        countryCode: '62',
      });

      const waRes = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: token },
        body: waBody,
      });
      const waResult = await waRes.json().catch(() => ({}));

      if (!waResult?.status) {
        return res.json({
          success: false,
          code: 'FONNTE_FAILED',
          fallbackAdminWa: true,
          adminPhone,
          userName: user.name,
          userEmail: user.email,
          error:
            'Pengiriman OTP WhatsApp otomatis sedang terkendala. Silakan hubungi Admin via WhatsApp untuk bantuan reset kata sandi.',
        });
      }

      await supabase.from('settings').upsert(
        {
          id: otpDocId,
          data: {
            userId: user.id,
            email: user.email,
            maskedPhone,
            otpHash,
            createdAtMs: nowMs,
            expiresAtMs: nowMs + EXPIRY_MS,
            attempts: 0,
            maxAttempts: 5,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      return res.json({
        success: true,
        maskedPhone,
        expiresInSec: Math.floor(EXPIRY_MS / 1000),
        cooldownSec: Math.floor(COOLDOWN_MS / 1000),
        resolvedEmail: user.email,
      });
    } catch (error: any) {
      console.error('Error requesting password reset OTP:', error);
      const adminPhone = await resolveAdminWhatsappNumber();
      return res.status(500).json({
        success: false,
        fallbackAdminWa: true,
        adminPhone,
        error: 'Terjadi kesalahan saat memproses permintaan reset kata sandi. Silakan coba lagi atau hubungi Admin via WhatsApp.',
      });
    }
  });

  app.post('/api/auth/forgot-password/confirm', async (req, res) => {
    try {
      const { identifier, otp, newPassword } = req.body || {};
      const trimmedId = String(identifier || '').trim();
      const cleanOtp = String(otp || '').replace(/\D/g, '').trim();
      const cleanPassword = String(newPassword || '');

      if (!trimmedId || !cleanOtp || !cleanPassword) {
        return res.status(400).json({
          success: false,
          error: 'Lengkapi kode OTP dan kata sandi baru Anda.',
        });
      }

      if (!/^\d{6}$/.test(cleanOtp)) {
        return res.status(400).json({
          success: false,
          error: 'Kode OTP harus berupa 6 digit angka.',
        });
      }

      if (cleanPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Kata sandi baru minimal harus 6 karakter.',
        });
      }

      const user = await findUserForPasswordReset(trimmedId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Akun tidak ditemukan. Silakan ulangi proses dari awal.',
        });
      }

      const otpDocId = `doc:password_reset_otp:${user.id}`;
      const { data: otpRow } = await supabase
        .from('settings')
        .select('data')
        .eq('id', otpDocId)
        .maybeSingle();

      const otpData = otpRow?.data;
      if (!otpData || !otpData.otpHash) {
        return res.status(400).json({
          success: false,
          error: 'Kode OTP tidak ditemukan atau sudah digunakan. Silakan minta kode OTP baru.',
        });
      }

      const nowMs = Date.now();
      if (nowMs > Number(otpData.expiresAtMs || 0)) {
        await supabase.from('settings').delete().eq('id', otpDocId);
        return res.status(400).json({
          success: false,
          code: 'OTP_EXPIRED',
          error: 'Kode OTP sudah kedaluwarsa (lebih dari 5 menit). Silakan minta kode OTP baru.',
        });
      }

      const currentAttempts = Number(otpData.attempts || 0);
      const maxAttempts = Number(otpData.maxAttempts || 5);
      if (currentAttempts >= maxAttempts) {
        await supabase.from('settings').delete().eq('id', otpDocId);
        return res.status(400).json({
          success: false,
          code: 'OTP_LOCKED',
          error: 'Terlalu banyak percobaan kode OTP yang salah. Silakan minta kode OTP baru.',
        });
      }

      const expectedHashBuf = Buffer.from(String(otpData.otpHash), 'hex');
      const incomingHashBuf = Buffer.from(hashResetOtp(user.id, cleanOtp), 'hex');
      const isMatch =
        expectedHashBuf.length === incomingHashBuf.length &&
        crypto.timingSafeEqual(expectedHashBuf, incomingHashBuf);

      if (!isMatch) {
        const nextAttempts = currentAttempts + 1;
        const remaining = Math.max(0, maxAttempts - nextAttempts);
        if (remaining === 0) {
          await supabase.from('settings').delete().eq('id', otpDocId);
          return res.status(400).json({
            success: false,
            code: 'OTP_LOCKED',
            error: 'Kode OTP salah dan batas percobaan habis. Silakan minta kode OTP baru.',
          });
        }
        await supabase.from('settings').upsert(
          {
            id: otpDocId,
            data: { ...otpData, attempts: nextAttempts },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
        return res.status(400).json({
          success: false,
          code: 'OTP_INVALID',
          error: `Kode OTP tidak sesuai. Sisa percobaan: ${remaining}x.`,
        });
      }

      // OTP valid: update password AND force-logout all old device sessions cleanly
      const nowIso = new Date().toISOString();
      const userDocId = `doc:users:${user.id}`;
      const { data: latestUserMetaRow } = await supabase
        .from('settings')
        .select('data')
        .eq('id', userDocId)
        .maybeSingle();

      const updatedUserMeta = {
        ...(latestUserMetaRow?.data || user.meta || {}),
        id: user.id,
        email: user.email,
        name: user.name,
        _password: cleanPassword,
        activeDevices: [],
        activeDeviceId: null,
        activeDeviceName: null,
        sessionRevoked: true,
        passwordResetAt: nowIso,
        updatedAt: nowIso,
      };

      const { error: updateErr } = await supabase.from('settings').upsert(
        {
          id: userDocId,
          data: updatedUserMeta,
          updated_at: nowIso,
        },
        { onConflict: 'id' }
      );

      if (updateErr) {
        throw updateErr;
      }

      // Touch users table updated_at (non-fatal)
      await supabase
        .from('users')
        .update({ updated_at: nowIso })
        .eq('id', user.id);

      // Delete OTP immediately (strict one-time use)
      await supabase.from('settings').delete().eq('id', otpDocId);

      // Send security confirmation notice via WhatsApp (Opsi 2: masked password, non-blocking)
      if (user.phone) {
        const maskPasswordForNotice = (pwd: string): string => {
          const chars = Array.from(pwd);
          if (chars.length >= 8) {
            return `${chars.slice(0, 2).join('')}${'•'.repeat(Math.max(4, chars.length - 4))}${chars.slice(-2).join('')}`;
          }
          if (chars.length >= 3) {
            return `${chars[0]}${'•'.repeat(Math.max(4, chars.length - 2))}${chars[chars.length - 1]}`;
          }
          return '••••••';
        };

        const formatLocalPhoneDisplay = (raw62: string): string => {
          const d = String(raw62 || '').replace(/\D/g, '');
          const local = d.startsWith('62') ? '0' + d.slice(2) : d;
          if (local.length >= 10) {
            return `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`;
          }
          return local || '0851-5863-6606';
        };

        const adminPhone62 = await resolveAdminWhatsappNumber();
        const adminPhoneDisplay = formatLocalPhoneDisplay(adminPhone62);
        const maskedPassword = maskPasswordForNotice(cleanPassword);
        const charCount = Array.from(cleanPassword).length;
        const origin = getPublicOrigin(req) || 'https://guestly.yulovi.com';
        const loginUrl = `${origin.replace(/\/+$/, '')}/auth/login`;
        const formattedTimeWib =
          new Intl.DateTimeFormat('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
            .format(new Date())
            .replace(/\./g, ':') + ' WIB';

        const confirmMsg = `✅ *Kata Sandi Guestly Berhasil Diperbarui*

Halo Kak *${user.name}*,

Kata sandi akun Guestly Anda telah berhasil diperbarui pada *${formattedTimeWib}*. Berikut ringkasan akses akun Anda:

📧 *Username / Email* : ${user.email || user.phone}
🔑 *Kata Sandi Baru* : ${maskedPassword} _(${charCount} karakter — disamarkan demi keamanan)_
🌐 *Link Login* : ${loginUrl}

🔒 Demi keamanan akun, seluruh sesi login pada perangkat lama telah otomatis dikeluarkan. Silakan masuk kembali menggunakan kata sandi baru Anda.

Jika Anda *tidak merasa* melakukan perubahan ini, segera hubungi Admin Guestly:
📞 ${adminPhoneDisplay}

─────────────────
*Guestly*
Smart Digital Guestbook & Event Management`;
        sendWhatsAppNotification(user.phone, confirmMsg).catch(() => {});
      }

      return res.json({
        success: true,
        email: user.email,
        message: 'Kata sandi berhasil diperbarui dan semua sesi perangkat lama telah dikeluarkan.',
      });
    } catch (error: any) {
      console.error('Error confirming password reset:', error);
      return res.status(500).json({
        success: false,
        error: 'Gagal memperbarui kata sandi. Silakan coba lagi beberapa saat.',
      });
    }
  });

  app.use('/uploads', express.static(uploadsBaseDir));

  function guessMimeType(name: string): string {
    const ext = path.extname(name).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.ico') return 'image/x-icon';
    return 'image/jpeg';
  }

  async function resolveMediaBuffer(rawInput: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const input = String(rawInput || '').trim();
    if (!input) return null;

    let candidateKey = '';
    if (input.startsWith('/api/media/r2/')) {
      candidateKey = decodeURIComponent(input.replace(/^\/api\/media\/r2\/+/, '').split('?')[0]);
    } else if (input.startsWith('/uploads/')) {
      candidateKey = decodeURIComponent(input.replace(/^\/uploads\/+/, '').split('?')[0]);
    } else if (/^https?:\/\/cdn\.guestly\.yulovi\.com\/+/i.test(input)) {
      candidateKey = decodeURIComponent(
        input.replace(/^https?:\/\/cdn\.guestly\.yulovi\.com\/+/i, '').split('?')[0]
      );
    } else if (!input.startsWith('http://') && !input.startsWith('https://')) {
      candidateKey = decodeURIComponent(input.replace(/^\/+/, '').split('?')[0]);
    } else {
      try {
        const u = new URL(input);
        if (u.pathname.startsWith('/api/media/r2/')) {
          candidateKey = decodeURIComponent(u.pathname.replace(/^\/api\/media\/r2\/+/, ''));
        } else if (u.pathname.startsWith('/uploads/')) {
          candidateKey = decodeURIComponent(u.pathname.replace(/^\/uploads\/+/, ''));
        }
      } catch {
        // ignore URL parse error
      }
    }

    const isRasterImageType = (ct: string) =>
      /^image\/(png|jpe?g|webp|gif)$/i.test(ct.split(';')[0].trim());

    const verifyBufferUsable = async (buf: Buffer, ct: string): Promise<boolean> => {
      if (!buf || buf.length === 0) return false;
      if (isRasterImageType(ct)) {
        try {
          const meta = await sharp(buf).metadata();
          return Boolean(meta && meta.width && meta.height);
        } catch {
          return false;
        }
      }
      return true;
    };

    if (candidateKey) {
      const baseName = path.basename(candidateKey);
      const uploadsResolvedBase = path.resolve(uploadsBaseDir);
      const localPaths = [
        path.resolve(uploadsResolvedBase, candidateKey),
        path.resolve(uploadsResolvedBase, baseName),
      ].filter((p) => p.startsWith(uploadsResolvedBase + path.sep));
      for (const p of localPaths) {
        try {
          if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) {
            const buf = fs.readFileSync(p);
            const contentType = guessMimeType(p);
            if (await verifyBufferUsable(buf, contentType)) {
              return { buffer: buf, contentType };
            }
          }
        } catch {
          // ignore unreadable/corrupt local cache file and continue to R2/HTTP
        }
      }

      const r2Client = getR2Client();
      if (r2Client) {
        const keysToTry = Array.from(new Set([candidateKey, baseName]));
        for (const k of keysToTry) {
          try {
            const r2Obj = await r2Client.send(
              new GetObjectCommand({
                Bucket: r2BucketName,
                Key: k,
              })
            );
            if (r2Obj.Body) {
              const bytes = await r2Obj.Body.transformToByteArray();
              const buf = Buffer.from(bytes);
              const contentType = r2Obj.ContentType || guessMimeType(k);
              if (await verifyBufferUsable(buf, contentType)) {
                try {
                  fs.writeFileSync(path.join(uploadsBaseDir, baseName), buf);
                } catch {
                  // ignore cache write error
                }
                return { buffer: buf, contentType };
              }
            }
          } catch {
            // continue to next candidate
          }
        }
      }
    }

    if (input.startsWith('http://') || input.startsWith('https://')) {
      const response = await fetch(input, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'image/*,*/*;q=0.8',
        },
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type') || guessMimeType(input);
        if (!contentType.includes('text/html')) {
          const arrayBuffer = await response.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          if (await verifyBufferUsable(buf, contentType)) {
            if (candidateKey) {
              try {
                fs.writeFileSync(path.join(uploadsBaseDir, path.basename(candidateKey)), buf);
              } catch {
                // ignore cache write error
              }
            }
            return {
              buffer: buf,
              contentType,
            };
          }
        }
      }
    }

    return null;
  }

  app.use('/api/media/r2', async (req, res) => {
    try {
      const key = decodeURIComponent(req.path.replace(/^\/+/, ''));
      if (!key) {
        return res.status(400).send('Missing media key');
      }
      const resolved = await resolveMediaBuffer(key);
      if (!resolved) {
        return res.status(404).send('Media not found');
      }
      res.setHeader('Content-Type', resolved.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(resolved.buffer);
    } catch (err: any) {
      return res.status(500).send(err?.message || 'Error serving media');
    }
  });

  app.get('/api/media/proxy', async (req, res) => {
    try {
      const targetUrl = String(req.query.url || '').trim();
      if (!targetUrl) {
        return res.status(400).json({ success: false, error: 'Invalid URL' });
      }
      const resolved = await resolveMediaBuffer(targetUrl);
      if (!resolved) {
        return res.status(404).json({ success: false, error: 'Failed to fetch image' });
      }
      const base64 = resolved.buffer.toString('base64');
      return res.json({
        success: true,
        dataUrl: `data:${resolved.contentType};base64,${base64}`,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Proxy error' });
    }
  });

  app.post('/api/media/upload', (req, res) => {
    const authHeader = String(req.headers['x-auth-token'] || req.headers.authorization || '').trim();
    if (!authHeader) {
      return res.status(401).json({ success: false, error: { message: 'Sesi autentikasi diperlukan untuk mengunggah file.' } });
    }
    upload.single('file')(req, res, async (multerErr: any) => {
      if (multerErr) {
        console.error('Multer upload error:', multerErr);
        return res.status(400).json({
          success: false,
          error: { message: multerErr.message || 'Gagal menerima file yang diunggah.' }
        });
      }
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, error: { message: 'File tidak ditemukan untuk diunggah.' } });
        }

        const rawCategory = String(req.body.category || 'attachment').trim();
        const normalizedCategory =
          rawCategory === 'Layar Sapa'
            ? 'Layar Sapa'
            : rawCategory === 'salespage'
            ? 'super_admin_media'
            : rawCategory.replace(/[^a-zA-Z0-9_-]/g, '') || 'attachment';

        const uploadsResolvedBase = path.resolve(uploadsBaseDir);
        let finalFileName = path.basename(req.file.filename);
        let finalMimeType = req.file.mimetype || 'application/octet-stream';
        let finalSizeBytes = req.file.size;
        let fileContent: Buffer = fs.readFileSync(req.file.path);

        // Automatically convert all raster images in super_admin_media to compact WebP via sharp
        const isSuperAdminRasterImage =
          normalizedCategory === 'super_admin_media' &&
          finalMimeType !== 'image/svg+xml' &&
          !finalMimeType.includes('icon') &&
          (finalMimeType.startsWith('image/') ||
            /\.(jpe?g|png|webp|gif|avif|tiff?|bmp)$/i.test(finalFileName));

        if (isSuperAdminRasterImage) {
          try {
            const webpBuffer = await sharp(fileContent)
              .rotate()
              .resize({
                width: 1920,
                height: 1920,
                fit: 'inside',
                withoutEnlargement: true,
              })
              .webp({ quality: 82, effort: 4 })
              .toBuffer();

            const baseParsed = path.parse(finalFileName).name.replace(/[^a-zA-Z0-9_-]/g, '') || `${Date.now()}`;
            const webpFileName = `${baseParsed}.webp`;
            const webpDiskPath = path.resolve(uploadsResolvedBase, webpFileName);

            if (webpDiskPath.startsWith(uploadsResolvedBase + path.sep)) {
              fs.writeFileSync(webpDiskPath, webpBuffer);
              const originalDiskPath = path.resolve(req.file.path);
              if (
                originalDiskPath !== webpDiskPath &&
                originalDiskPath.startsWith(uploadsResolvedBase + path.sep) &&
                fs.existsSync(originalDiskPath)
              ) {
                try {
                  fs.unlinkSync(originalDiskPath);
                } catch {
                  // ignore cleanup error
                }
              }
              finalFileName = webpFileName;
              finalMimeType = 'image/webp';
              finalSizeBytes = webpBuffer.length;
              fileContent = webpBuffer;
            }
          } catch (sharpErr: any) {
            console.warn('Sharp WebP conversion skipped, keeping original image:', sharpErr?.message);
          }
        }

        const key = `${normalizedCategory}/${finalFileName}`;
        let finalUrl = `/api/media/r2/${key}`;

        const r2Client = getR2Client();
        if (r2Client) {
          try {
            await r2Client.send(new PutObjectCommand({
              Bucket: r2BucketName,
              Key: key,
              Body: fileContent,
              ContentType: finalMimeType,
              CacheControl: 'public, max-age=31536000, immutable',
            }));
          } catch (r2Error: any) {
            console.warn('R2 upload failed, falling back to local server storage:', r2Error.message);
            finalUrl = `/uploads/${finalFileName}`;
          }
        } else {
          finalUrl = `/uploads/${finalFileName}`;
        }

        return res.json({
          success: true,
          data: {
            url: finalUrl,
            key,
            sizeBytes: finalSizeBytes,
            mimeType: finalMimeType,
            fileName: finalFileName,
            category: normalizedCategory,
          }
        });
      } catch (err: any) {
        console.error('Error in /api/media/upload:', err);
        return res.status(500).json({ success: false, error: { message: err.message || 'Gagal memproses file' } });
      }
    });
  });

  app.delete('/api/media/delete', async (req, res) => {
    try {
      const authHeader = String(req.headers['x-auth-token'] || req.headers.authorization || '').trim();
      if (!authHeader) {
        return res.status(401).json({ success: false, error: { message: 'Sesi autentikasi diperlukan untuk menghapus file.' } });
      }
      const { key } = req.body;
      if (key && typeof key === 'string' && !key.includes('..')) {
        const uploadsResolvedBase = path.resolve(uploadsBaseDir);
        const localFileName = path.basename(key);
        const filePath = path.resolve(uploadsResolvedBase, localFileName);
        if (filePath.startsWith(uploadsResolvedBase + path.sep) && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        const r2Client = getR2Client();
        if (r2Client) {
          try {
            await r2Client.send(new DeleteObjectCommand({
              Bucket: r2BucketName,
              Key: key,
            }));
          } catch (r2Error: any) {
            console.warn('R2 delete failed:', r2Error.message);
          }
        }
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Error in /api/media/delete:', err);
      return res.status(500).json({ success: false, error: { message: err.message || 'Gagal menghapus file' } });
    }
  });

  app.get('/api/media/info', (req, res) => {
    try {
      const key = String(req.query.key || '').trim();
      if (!key || key.includes('..')) {
        return res.status(400).json({ success: false, error: { message: 'Key file diperlukan' } });
      }
      const uploadsResolvedBase = path.resolve(uploadsBaseDir);
      const candidatePath = path.resolve(uploadsResolvedBase, key);
      const fallbackPath = path.resolve(uploadsResolvedBase, path.basename(key));
      const filePath =
        candidatePath.startsWith(uploadsResolvedBase + path.sep) && fs.existsSync(candidatePath)
          ? candidatePath
          : fallbackPath.startsWith(uploadsResolvedBase + path.sep) && fs.existsSync(fallbackPath)
          ? fallbackPath
          : null;
      if (!filePath) {
        return res.status(404).json({ success: false, error: { message: 'File tidak ditemukan' } });
      }
      const stat = fs.statSync(filePath);
      return res.json({
        success: true,
        data: {
          key,
          size: stat.size,
          uploaded: stat.mtime
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err.message } });
    }
  });

  let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
  }

  function escapeHtml(str: string): string {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncateText(text: string, maxLen: number): string {
    const clean = String(text || '').trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, Math.max(0, maxLen - 1)).trim() + '…';
  }

  function formatIndonesianDateOgParts(dateInput?: any): { dayName: string; dateText: string } {
    if (!dateInput) {
      return { dayName: 'MINGGU', dateText: '15 DESEMBER 2026' };
    }
    const days = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
    const months = [
      'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
      'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER',
    ];
    const dt = new Date(dateInput);
    if (!isNaN(dt.getTime())) {
      return {
        dayName: days[dt.getDay()] || '',
        dateText: `${dt.getDate()} ${months[dt.getMonth()] || ''} ${dt.getFullYear()}`,
      };
    }
    const rawStr = String(dateInput).trim();
    const parts = rawStr.split(/[-/]/);
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10) > 31 ? parseInt(parts[0], 10) : parseInt(parts[2], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[0], 10) > 31 ? parseInt(parts[2], 10) : parseInt(parts[0], 10);
      const parsed = new Date(y, m, d);
      if (!isNaN(parsed.getTime())) {
        return {
          dayName: days[parsed.getDay()] || '',
          dateText: `${parsed.getDate()} ${months[parsed.getMonth()] || ''} ${parsed.getFullYear()}`,
        };
      }
    }
    return { dayName: '', dateText: rawStr.toUpperCase() };
  }

  function wrapSvgText(text: string, maxChars: number, maxLines: number): string[] {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const words = clean.split(' ');
    const lines: string[] = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          current = word;
        } else {
          lines.push(word.slice(0, maxChars - 1) + '…');
          current = '';
        }
        if (lines.length >= maxLines) {
          const lastIdx = lines.length - 1;
          if (!lines[lastIdx].endsWith('…') && i < words.length) {
            lines[lastIdx] = truncateText(lines[lastIdx], maxChars);
          }
          return lines.slice(0, maxLines);
        }
      }
    }
    if (current) {
      if (lines.length >= maxLines) {
        lines[maxLines - 1] = truncateText(`${lines[maxLines - 1]} ${current}`, maxChars);
      } else {
        lines.push(truncateText(current, maxChars));
      }
    }
    return lines.slice(0, maxLines);
  }

  function splitCoupleOg(coupleName?: string, groomOverride?: string, brideOverride?: string, fallbackTitle?: string) {
    const source = String(coupleName || '').trim();
    if (source) {
      const parts = source.split(/\s*(?:&|\bdan\b|\band\b|\+)\s*/i);
      if (parts.length >= 2) {
        return { groom: parts[0].trim(), bride: parts.slice(1).join(' & ').trim() };
      }
    }
    if (groomOverride?.trim() || brideOverride?.trim()) {
      return {
        groom: (groomOverride || '').trim() || 'Mempelai Pria',
        bride: (brideOverride || '').trim() || 'Mempelai Wanita',
      };
    }
    if (source) return { groom: source, bride: '' };
    const cleanTitle = String(fallbackTitle || 'Undangan Pernikahan')
      .replace(/^(the\s+wedding\s+of|resepsi\s+pernikahan|pernikahan|undangan)\s+/i, '')
      .trim();
    const titleParts = cleanTitle.split(/\s*(?:&|\bdan\b|\band\b|\+)\s*/i);
    if (titleParts.length >= 2) {
      return { groom: titleParts[0].trim(), bride: titleParts.slice(1).join(' & ').trim() };
    }
    return { groom: cleanTitle, bride: '' };
  }

  const ogCacheDir = path.join(uploadsBaseDir, 'og-cache');
  if (!fs.existsSync(ogCacheDir)) {
    fs.mkdirSync(ogCacheDir, { recursive: true });
  }
  const ogMemoryCache = new Map<string, Buffer>();

  async function renderEInvitationOgImage(
    eventRow: any,
    guestRow: any | null,
    origin: string
  ): Promise<Buffer> {
    const extra = eventRow.settings && typeof eventRow.settings === 'object' ? eventRow.settings : {};
    const ticketCode = guestRow?.ticket_code ? String(guestRow.ticket_code).trim() : '';

    // Lookup admin E-Invitation templates catalog & global/partner branding
    let catalogTemplates: any[] = [];
    let globalBrand: any = {};
    let partnerLogoUrl = '';
    try {
      const { data: settingsRows } = await supabase
        .from('settings')
        .select('id, data')
        .in('id', [
          'eInviteTemplates',
          'doc:settings:eInviteTemplates',
          'global',
          'doc:settings:global',
          ...(eventRow.partner_id && eventRow.partner_id !== 'default-partner'
            ? [`doc:users:${eventRow.partner_id}`]
            : []),
        ]);
      if (settingsRows) {
        for (const row of settingsRows) {
          if (row.id === 'eInviteTemplates' || row.id === 'doc:settings:eInviteTemplates') {
            if (Array.isArray(row.data?.templates) && row.data.templates.length > 0) {
              catalogTemplates = row.data.templates;
            }
          } else if (row.id === 'global' || row.id === 'doc:settings:global') {
            if (row.data && typeof row.data === 'object') {
              globalBrand = { ...globalBrand, ...row.data };
            }
          } else if (eventRow.partner_id && row.id === `doc:users:${eventRow.partner_id}`) {
            partnerLogoUrl = String(row.data?.logoUrl || row.data?.brandLogo || '').trim();
          }
        }
      }
      if (!partnerLogoUrl && eventRow.partner_id && eventRow.partner_id !== 'default-partner') {
        const { data: partnerUser } = await supabase
          .from('users')
          .select('logo_url')
          .eq('id', eventRow.partner_id)
          .maybeSingle();
        if (partnerUser?.logo_url) partnerLogoUrl = String(partnerUser.logo_url).trim();
      }
    } catch {
      // ignore catalog lookup error and fall back gracefully
    }

    const tplId = String(extra.eInviteTemplateId || 'default-blush-arch');
    const matchedTemplate =
      catalogTemplates.find((t: any) => t.id === tplId) ||
      catalogTemplates.find((t: any) => t.isDefault) ||
      null;

    const theme = String(extra.eInviteTheme || '').trim();
    const defaultPalette =
      tplId === 'default-royal-gold' || theme === 'gold'
        ? {
            primaryColor: '#4A3519',
            accentColor: '#B38748',
            guestBoxBg: '#F5EFE4',
            footerColor: '#9E7840',
          }
        : tplId === 'default-emerald-sage' || theme === 'sage'
        ? {
            primaryColor: '#16382C',
            accentColor: '#4F7A65',
            guestBoxBg: '#E6F0EB',
            footerColor: '#3B6652',
          }
        : {
            primaryColor: '#153B31',
            accentColor: '#C98583',
            guestBoxBg: '#F3E4E2',
            footerColor: '#C27D7A',
          };

    const primaryColor = String(matchedTemplate?.primaryColor || defaultPalette.primaryColor);
    const accentColor = String(matchedTemplate?.accentColor || defaultPalette.accentColor);
    const guestBoxBg = String(matchedTemplate?.guestBoxBg || defaultPalette.guestBoxBg);
    const footerColor = String(matchedTemplate?.footerColor || defaultPalette.footerColor);
    const tplImgUrl = String(extra.eInviteTemplateUrl || matchedTemplate?.imageUrl || '').trim();

    const versionKey = `v3-16x9_${eventRow.updated_at || ''}_${guestRow?.updated_at || ''}_${guestRow?.name || ''}_${guestRow?.category || ''}_${tplId}_${tplImgUrl}`;
    const cacheKey = `${eventRow.id}_${ticketCode || 'public'}_${Buffer.from(versionKey).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;

    const memHit = ogMemoryCache.get(cacheKey);
    if (memHit && memHit.length > 0) return memHit;

    const diskPath = path.join(ogCacheDir, `${cacheKey}.jpg`);
    if (fs.existsSync(diskPath)) {
      const buf = fs.readFileSync(diskPath);
      if (buf.length > 0) {
        ogMemoryCache.set(cacheKey, buf);
        return buf;
      }
    }

    const WIDTH = 1200;
    const HEIGHT = 675;
    const ARCH_PATH = 'M 0,0 L 242,0 C 362,54 432,198 432,340 C 432,428 410,498 386,543 L 0,543 Z';

    // LAYER 0 & 1: Template background image (or exact vector EInvitationCard fallback)
    let baseLayer: ReturnType<typeof sharp> | null = null;
    const tplMedia = tplImgUrl ? await resolveMediaBuffer(tplImgUrl).catch(() => null) : null;
    if (tplMedia?.buffer && tplMedia.buffer.length > 0) {
      try {
        const renderedTplBg = await sharp(tplMedia.buffer)
          .rotate()
          .resize(WIDTH, HEIGHT, { fit: 'cover' })
          .png()
          .toBuffer();
        baseLayer = sharp(renderedTplBg);
      } catch {
        baseLayer = null;
      }
    }
    if (!baseLayer) {
      const bgSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${HEIGHT}" fill="#FAF6F2" />
        <path d="${ARCH_PATH}" fill="#F6ECE8" />
        <path d="M 242,0 C 362,54 432,198 432,340 C 432,428 410,498 386,543" fill="none" stroke="${accentColor}" stroke-width="4" stroke-opacity="0.55" />
        <path d="M 254,0 C 374,54 444,198 444,340 C 444,428 422,498 398,543" fill="none" stroke="#C5A678" stroke-width="2" stroke-opacity="0.7" />
        <g opacity="0.45" stroke="#B7837A" stroke-width="1.4" fill="none">
          <path d="M 1200,18 C 1150,32 1110,75 1085,135" />
          <path d="M 1140,42 C 1125,28 1105,26 1090,36 C 1104,48 1124,50 1140,42 Z" fill="#F3DDD8" />
          <path d="M 1118,74 C 1100,62 1080,64 1068,76 C 1082,86 1102,84 1118,74 Z" fill="#E3E6DF" />
          <path d="M 1165,88 C 1152,106 1154,126 1166,138 C 1176,124 1174,104 1165,88 Z" fill="#F3DDD8" />
        </g>
        <rect x="0" y="543" width="${WIDTH}" height="132" fill="${footerColor}" />
        <g stroke="#FFF5F3" stroke-opacity="0.55" stroke-width="1.3" fill="none">
          <path d="M 18,668 C 55,625 105,589 175,567" />
          <path d="M 62,631 C 48,611 50,589 65,573 C 78,589 76,613 62,631 Z" fill="#FFFFFF" fill-opacity="0.12" />
          <path d="M 98,607 C 86,589 90,569 106,557 C 116,573 112,593 98,607 Z" fill="#FFFFFF" fill-opacity="0.12" />
          <path d="M 1182,668 C 1145,625 1095,589 1025,567" />
          <path d="M 1138,631 C 1152,611 1150,589 1135,573 C 1122,589 1124,613 1138,631 Z" fill="#FFFFFF" fill-opacity="0.12" />
          <circle cx="1095" cy="628" r="36" stroke="#FFF5F3" stroke-opacity="0.4" fill="#FFFFFF" fill-opacity="0.08" />
          <circle cx="1095" cy="628" r="12" stroke="#FFF5F3" stroke-opacity="0.5" />
        </g>
      </svg>`;
      baseLayer = sharp(Buffer.from(bgSvg));
    }

    const composites: Parameters<ReturnType<typeof sharp>['composite']>[0] = [];

    // LAYER 2: Left Arch Couple Photo (432x543 clipped to exact EInvitationCard arch curve)
    const photoUrl = String(
      extra.eInvitePhotoUrl ||
        eventRow.thumbnail_url ||
        extra.thumbnailUrl ||
        eventRow.cover_image ||
        extra.coverImage ||
        ''
    ).trim();
    const photoMedia = photoUrl ? await resolveMediaBuffer(photoUrl).catch(() => null) : null;

    const couple = splitCoupleOg(
      eventRow.couple_name || extra.coupleName,
      extra.eInviteGroomName,
      extra.eInviteBrideName,
      eventRow.title || extra.title
    );

    let hasPhoto = false;
    if (photoMedia?.buffer && photoMedia.buffer.length > 0) {
      try {
        const photoW = 432;
        const photoH = 543;
        const archMaskSvg = Buffer.from(
          `<svg width="${photoW}" height="${photoH}" xmlns="http://www.w3.org/2000/svg">
            <path d="${ARCH_PATH}" fill="#ffffff" />
          </svg>`
        );
        const maskedPhoto = await sharp(photoMedia.buffer)
          .rotate()
          .resize(photoW, photoH, { fit: 'cover', position: 'top' })
          .composite([{ input: archMaskSvg, blend: 'dest-in' }])
          .png()
          .toBuffer();
        composites.push({ input: maskedPhoto, left: 0, top: 0 });
        hasPhoto = true;
      } catch {
        hasPhoto = false;
      }
    }

    // Resolve Logo & QR Favicon Emblem
    const logoUrlCandidate = partnerLogoUrl || String(globalBrand?.logoUrl || '').trim();
    const faviconUrlCandidate = String(globalBrand?.faviconUrl || logoUrlCandidate || '').trim();

    let logoPngBuf: Buffer | null = null;
    let logoDims = { width: 0, height: 0 };
    if (logoUrlCandidate) {
      try {
        const logoMedia = await resolveMediaBuffer(logoUrlCandidate).catch(() => null);
        if (logoMedia?.buffer && logoMedia.buffer.length > 0) {
          const { data, info } = await sharp(logoMedia.buffer)
            .resize(244, 58, { fit: 'inside', withoutEnlargement: false })
            .png()
            .toBuffer({ resolveWithObject: true });
          logoPngBuf = data;
          logoDims = { width: info.width, height: info.height };
        }
      } catch {
        logoPngBuf = null;
      }
    }

    let emblemPngBuf: Buffer | null = null;
    if (faviconUrlCandidate) {
      try {
        const embMedia = await resolveMediaBuffer(faviconUrlCandidate).catch(() => null);
        if (embMedia?.buffer && embMedia.buffer.length > 0) {
          emblemPngBuf = await sharp(embMedia.buffer)
            .resize(34, 34, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .png()
            .toBuffer();
        }
      } catch {
        emblemPngBuf = null;
      }
    }

    // Prepare Dynamic Text Values matching EInvitationCard.tsx
    const headerLabel = escapeHtml(String(extra.eInviteHeaderText || 'THE WEDDING OF').toUpperCase());
    const maxCoupleLen = Math.max(couple.groom.length, couple.bride.length);
    const coupleFontSize = maxCoupleLen > 24 ? 26 : maxCoupleLen > 18 ? 34 : maxCoupleLen > 13 ? 40 : 46;

    const guestNameRaw = String(guestRow?.name || 'Nama Tamu Undangan').trim();
    const guestCategoryRaw = String(guestRow?.category || '').trim();
    const guestCodeRaw = ticketCode || 'GUEST123456';
    const greetingRaw = String(
      extra.eInviteGreetingText ||
        'Dengan hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam acara pernikahan kami.'
    ).trim();

    const guestNameFontSize =
      guestNameRaw.length > 42 ? 18 : guestNameRaw.length > 26 ? 21 : guestNameRaw.length > 18 ? 24 : 26;
    const guestNameLines = wrapSvgText(guestNameRaw, guestNameFontSize <= 21 ? 30 : 24, 2);
    const greetingLines = wrapSvgText(greetingRaw, 50, guestNameLines.length > 1 ? 2 : 3);

    const { dayName, dateText } = formatIndonesianDateOgParts(eventRow.date || extra.date);
    const rawTime = String(guestRow?.session || eventRow.time || extra.time || '09.00 - 14.00').trim();
    const timeDisplay = /wib|wita|wit/i.test(rawTime) ? rawTime : `${rawTime} WIB`;

    const rawLocation = String(eventRow.location || extra.location || '').trim();
    const venueNameRaw =
      (rawLocation ? rawLocation.split(',')[0].trim() : '') ||
      String(extra.eInviteVenueName || '').trim() ||
      'Lokasi Acara';
    const venueAddrRaw =
      String(extra.eInviteVenueAddress || extra.greetingVenueSubtitle || '').trim() ||
      (rawLocation.includes(',') ? rawLocation.split(',').slice(1).join(',').trim() : rawLocation);

    const venueNameLines = wrapSvgText(venueNameRaw, 34, 1);
    const venueAddrLines = wrapSvgText(venueAddrRaw, 46, 2);

    const footerSubText = escapeHtml(
      String(extra.eInviteFooterText || 'ATAS KEHADIRAN DAN DOA RESTUNYA').toUpperCase()
    );
    const initials = `${(couple.groom || 'G').charAt(0).toUpperCase()}${
      couple.bride ? ' & ' + couple.bride.charAt(0).toUpperCase() : ''
    }`;

    // QR Code (matching EInvitationCard.tsx: value={guestCode}, level="H")
    const qrValue = ticketCode || `${origin}/public/rsvp/${encodeURIComponent(eventRow.id)}`;
    let qrPngBuf: Buffer | null = null;
    try {
      const qrSvg = await QRCode.toString(qrValue, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 188,
        color: { dark: '#111827', light: '#FFFFFF' },
      });
      qrPngBuf = await sharp(Buffer.from(qrSvg)).resize(188, 188).png().toBuffer();
    } catch {
      qrPngBuf = null;
    }

    // Dynamic Couple Header Vertical Layout (x center = 654, range y=24..190)
    const coupleHeaderSvg = couple.bride
      ? `
        <text x="654" y="42" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12.5" font-weight="600" letter-spacing="4.2" fill="${primaryColor}">${headerLabel}</text>
        <text x="654" y="88" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${coupleFontSize}" font-weight="500" fill="${primaryColor}">${escapeHtml(truncateText(couple.groom, 26))}</text>
        <text x="654" y="120" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-style="italic" fill="${accentColor}">&amp;</text>
        <text x="654" y="164" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${coupleFontSize}" font-weight="500" fill="${primaryColor}">${escapeHtml(truncateText(couple.bride, 26))}</text>
        <line x1="538" y1="184" x2="634" y2="184" stroke="${accentColor}" stroke-opacity="0.65" stroke-width="1.5" />
        <g transform="translate(654, 185)">
          <path d="M 0,5.5 C -4.5,0 -9,-2.8 -9,-5.8 C -9,-8.5 -6.2,-10.2 -3.4,-10.2 C -1.6,-10.2 -0.5,-9.2 0,-8 C 0.5,-9.2 1.6,-10.2 3.4,-10.2 C 6.2,-10.2 9,-8.5 9,-5.8 C 9,-2.8 4.5,0 0,5.5 Z" fill="${accentColor}" />
        </g>
        <line x1="674" y1="184" x2="770" y2="184" stroke="${accentColor}" stroke-opacity="0.65" stroke-width="1.5" />
      `
      : `
        <text x="654" y="48" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12.5" font-weight="600" letter-spacing="4.2" fill="${primaryColor}">${headerLabel}</text>
        <text x="654" y="118" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${coupleFontSize}" font-weight="500" fill="${primaryColor}">${escapeHtml(truncateText(couple.groom, 28))}</text>
        <line x1="538" y1="168" x2="634" y2="168" stroke="${accentColor}" stroke-opacity="0.65" stroke-width="1.5" />
        <g transform="translate(654, 169)">
          <path d="M 0,5.5 C -4.5,0 -9,-2.8 -9,-5.8 C -9,-8.5 -6.2,-10.2 -3.4,-10.2 C -1.6,-10.2 -0.5,-9.2 0,-8 C 0.5,-9.2 1.6,-10.2 3.4,-10.2 C 6.2,-10.2 9,-8.5 9,-5.8 C 9,-2.8 4.5,0 0,5.5 Z" fill="${accentColor}" />
        </g>
        <line x1="674" y1="168" x2="770" y2="168" stroke="${accentColor}" stroke-opacity="0.65" stroke-width="1.5" />
      `;

    // Guest Box SVG (x=456, y=200, w=396, h=154, rx=18)
    const guestNameStartY = 258;
    const guestNameLineStep = guestNameFontSize + 4;
    const greetingStartY = guestNameStartY + guestNameLines.length * guestNameLineStep + 2;
    const categoryWidth = guestCategoryRaw ? Math.min(110, Math.max(54, guestCategoryRaw.length * 8 + 20)) : 0;

    const guestNameTspans = guestNameLines
      .map(
        (line, i) =>
          `<text x="476" y="${guestNameStartY + i * guestNameLineStep}" font-family="Georgia, 'Times New Roman', serif" font-size="${guestNameFontSize}" font-weight="bold" fill="${primaryColor}">${escapeHtml(line)}</text>`
      )
      .join('');

    const greetingTspans = greetingLines
      .map(
        (line, i) =>
          `<text x="476" y="${greetingStartY + i * 16}" font-family="Georgia, 'Times New Roman', serif" font-size="12" fill="#2E2E2E">${escapeHtml(line)}</text>`
      )
      .join('');

    const categoryBadgeSvg = guestCategoryRaw
      ? `<rect x="${832 - categoryWidth}" y="212" width="${categoryWidth}" height="20" rx="10" fill="#FFFFFF" fill-opacity="0.88" stroke="${accentColor}" stroke-width="1" />
         <text x="${832 - categoryWidth / 2}" y="225.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" letter-spacing="0.8" fill="${primaryColor}">${escapeHtml(truncateText(guestCategoryRaw.toUpperCase(), 14))}</text>`
      : '';

    const brandNameText = escapeHtml(String(globalBrand?.appName || 'Guestly'));
    const brandTaglineText = escapeHtml(String(globalBrand?.tagline || 'Buku Tamu Digital'));

    const cardOverlaySvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <!-- Fallback Arch Avatar if photo missing -->
      ${
        !hasPhoto
          ? `<path d="${ARCH_PATH}" fill="#F6ECE8" />
             <path d="M 242,0 C 362,54 432,198 432,340 C 432,428 410,498 386,543" fill="none" stroke="${accentColor}" stroke-width="3" stroke-opacity="0.6" />
             <text x="200" y="290" text-anchor="middle" font-family="Georgia, serif" font-size="72" font-weight="bold" fill="${accentColor}">${escapeHtml(initials)}</text>`
          : ''
      }

      <!-- Subtle top-left delicate botanical leaf overlay on photo corner -->
      <g stroke="#C67D73" stroke-width="1.5" opacity="0.7" fill="none">
        <path d="M 8,165 C 28,115 62,65 115,22" />
        <path d="M 32,120 C 18,104 20,84 34,70 C 46,86 44,106 32,120 Z" fill="#FBEAE7" fill-opacity="0.55" />
        <path d="M 56,86 C 42,70 44,50 58,36 C 70,52 68,72 56,86 Z" fill="#FBEAE7" fill-opacity="0.55" />
        <path d="M 48,112 C 66,104 86,108 98,120 C 82,130 62,126 48,112 Z" fill="#FBEAE7" fill-opacity="0.55" />
        <path d="M 74,76 C 92,68 112,72 124,84 C 108,94 88,90 74,76 Z" fill="#FBEAE7" fill-opacity="0.55" />
      </g>

      <!-- LAYER 3: Center Column -->
      ${coupleHeaderSvg}

      <!-- Guest Invitation Box -->
      <rect x="456" y="200" width="396" height="154" rx="18" fill="${guestBoxBg}" stroke="#E5CECA" stroke-opacity="0.75" stroke-width="1.2" />
      <text x="476" y="226" font-family="Georgia, 'Times New Roman', serif" font-size="14" fill="#262626">Kepada Yth.</text>
      ${categoryBadgeSvg}
      ${guestNameTspans}
      ${greetingTspans}

      <!-- Schedule & Venue Info -->
      <circle cx="478" cy="396" r="22" fill="#F6DCDD" />
      <g transform="translate(478, 396)" stroke="#C9444B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <rect x="-8" y="-6.5" width="16" height="14.5" rx="2" />
        <line x1="-4" y1="-9" x2="-4" y2="-4.5" />
        <line x1="4" y1="-9" x2="4" y2="-4.5" />
        <line x1="-8" y1="-1.5" x2="8" y2="-1.5" />
      </g>
      ${dayName ? `<text x="514" y="382" font-family="Arial, Helvetica, sans-serif" font-size="11.5" font-weight="600" letter-spacing="0.8" fill="#263642">${escapeHtml(dayName)}</text>` : ''}
      <text x="514" y="402" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="bold" fill="#152836">${escapeHtml(dateText)}</text>
      <text x="514" y="420" font-family="Arial, Helvetica, sans-serif" font-size="12.5" fill="#354652">${escapeHtml(truncateText(timeDisplay, 38))}</text>

      <line x1="456" y1="436" x2="852" y2="436" stroke="${accentColor}" stroke-opacity="0.55" stroke-width="1" />

      <circle cx="478" cy="476" r="22" fill="#F6DCDD" />
      <g transform="translate(478, 476)" stroke="#C9444B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M 0,8.5 C 0,8.5 6.5,2.2 6.5,-2.5 A 6.5,6.5 0 1 0 -6.5,-2.5 C -6.5,2.2 0,8.5 0,8.5 Z" />
        <circle cx="0" cy="-2.5" r="2.2" />
      </g>
      ${venueNameLines.map((line, i) => `<text x="514" y="${466 + i * 18}" font-family="Arial, Helvetica, sans-serif" font-size="15.5" font-weight="bold" fill="#152836">${escapeHtml(line)}</text>`).join('')}
      ${venueAddrLines.map((line, i) => `<text x="514" y="${486 + i * 16}" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#354652">${escapeHtml(line)}</text>`).join('')}

      <!-- LAYER 4: Right Column (Logo Box & White QR Card) -->
      <rect x="874" y="22" width="288" height="78" rx="20" fill="#FFFFFF" fill-opacity="0.72" stroke="#FFFFFF" stroke-opacity="0.95" stroke-width="1.5" />
      ${
        !logoPngBuf
          ? `<circle cx="944" cy="61" r="21" fill="#E92E63" />
             <g transform="translate(944, 63)">
               <path d="M 0,6 C -5,0 -10,-3 -10,-6.5 C -10,-9.5 -7,-11.5 -3.8,-11.5 C -1.8,-11.5 -0.5,-10.2 0,-9 C 0.5,-10.2 1.8,-11.5 3.8,-11.5 C 7,-11.5 10,-9.5 10,-6.5 C 10,-3 5,0 0,6 Z" fill="#FFFFFF" />
             </g>
             <text x="976" y="61" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="bold" fill="#E92E63">${brandNameText}</text>
             <text x="976" y="79" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="600" fill="#1E2E3B">${brandTaglineText}</text>`
          : ''
      }

      <!-- White QR Card -->
      <rect x="874" y="112" width="288" height="416" rx="24" fill="#FFFFFF" stroke="#EFE6E0" stroke-width="1.5" />
      ${
        qrPngBuf
          ? ''
          : `<rect x="924" y="130" width="188" height="188" rx="12" fill="#F8FAFC" stroke="#E2E8F0" />`
      }
      <text x="1018" y="346" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="bold" letter-spacing="2" fill="${primaryColor}">${escapeHtml(truncateText(guestCodeRaw, 18))}</text>
      <rect x="896" y="362" width="244" height="36" rx="18" fill="${primaryColor}" />
      <text x="1018" y="384.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" letter-spacing="1.6" fill="#FFFFFF">SCAN UNTUK CHECK-IN</text>
      <line x1="896" y1="414" x2="1140" y2="414" stroke="#E5E7EB" stroke-width="1" />
      <text x="1018" y="438" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11.5" fill="#3B4A54">Tunjukkan QR Code ini</text>
      <text x="1018" y="455" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11.5" fill="#3B4A54">saat kedatangan di area registrasi.</text>

      <!-- LAYER 5: Footer Strip Text -->
      <text x="600" y="592" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="400" letter-spacing="6" fill="#FFFFFF">TERIMA KASIH</text>
      <text x="600" y="618" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="400" letter-spacing="3.2" fill="#FFFFFF" fill-opacity="0.95">${footerSubText}</text>
      <line x1="474" y1="638" x2="580" y2="638" stroke="#FFFFFF" stroke-opacity="0.8" stroke-width="1.2" />
      <g transform="translate(600, 640)">
        <path d="M 0,4.5 C -4,0 -7.5,-2.5 -7.5,-5 C -7.5,-7.2 -5.2,-8.8 -2.8,-8.8 C -1.4,-8.8 -0.4,-7.9 0,-6.8 C 0.4,-7.9 1.4,-8.8 2.8,-8.8 C 5.2,-8.8 7.5,-7.2 7.5,-5 C 7.5,-2.5 4,0 0,4.5 Z" fill="#FFFFFF" />
      </g>
      <line x1="620" y1="638" x2="726" y2="638" stroke="#FFFFFF" stroke-opacity="0.8" stroke-width="1.2" />
    </svg>`;

    composites.push({ input: Buffer.from(cardOverlaySvg), left: 0, top: 0 });

    if (logoPngBuf && logoDims.width > 0 && logoDims.height > 0) {
      composites.push({
        input: logoPngBuf,
        left: Math.round(874 + (288 - logoDims.width) / 2),
        top: Math.round(22 + (78 - logoDims.height) / 2),
      });
    }

    if (qrPngBuf) {
      composites.push({ input: qrPngBuf, left: 924, top: 130 });
      // Center QR Emblem Badge (44x44px rounded box matching EInvitationCard.tsx)
      const emblemBoxSvg = Buffer.from(
        `<svg width="44" height="44" xmlns="http://www.w3.org/2000/svg">
          <rect x="0.5" y="0.5" width="43" height="43" rx="10" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1" />
          ${
            !emblemPngBuf
              ? `<rect x="4" y="4" width="36" height="36" rx="7" fill="${primaryColor}" />
                 <text x="22" y="29" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#FFFFFF">G</text>`
              : ''
          }
        </svg>`
      );
      composites.push({ input: emblemBoxSvg, left: 996, top: 202 });
      if (emblemPngBuf) {
        composites.push({ input: emblemPngBuf, left: 1001, top: 207 });
      }
    }

    const finalBuf = await baseLayer
      .composite(composites)
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    if (finalBuf.length > 0) {
      if (ogMemoryCache.size > 200) {
        const oldestKey = ogMemoryCache.keys().next().value;
        if (oldestKey) ogMemoryCache.delete(oldestKey);
      }
      ogMemoryCache.set(cacheKey, finalBuf);
      try {
        fs.writeFileSync(diskPath, finalBuf);
      } catch {
        // ignore disk cache error
      }
    }
    return finalBuf;
  }

  function injectMetaIntoHtml(
    html: string,
    opts: {
      title: string;
      description: string;
      imageUrl?: string;
      pageUrl: string;
      siteName: string;
    }
  ): string {
    const safeTitle = escapeHtml(opts.title);
    const safeDesc = escapeHtml(opts.description);
    const safeUrl = escapeHtml(opts.pageUrl);
    const safeSite = escapeHtml(opts.siteName);
    const safeImage = opts.imageUrl ? escapeHtml(opts.imageUrl) : '';

    const imageMeta = safeImage
      ? `
          <meta property="og:image" content="${safeImage}" />
          <meta property="og:image:secure_url" content="${safeImage}" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="675" />
          <meta name="twitter:image" content="${safeImage}" />
          <meta itemprop="image" content="${safeImage}" />
          <link rel="image_src" href="${safeImage}" />`
      : '';

    const metaTags = `
          <title>${safeTitle}</title>
          <meta name="description" content="${safeDesc}" />
          <meta property="og:site_name" content="${safeSite}" />
          <meta property="og:title" content="${safeTitle}" />
          <meta property="og:description" content="${safeDesc}" />${imageMeta}
          <meta property="og:url" content="${safeUrl}" />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="${safeTitle}" />
          <meta name="twitter:description" content="${safeDesc}" />
          <meta itemprop="name" content="${safeTitle}" />
          <meta itemprop="description" content="${safeDesc}" />
        `;

    const startComment = '<!-- INJECT_META_TAGS -->';
    const endComment = '<!-- END_INJECT_META_TAGS -->';
    const startIndex = html.indexOf(startComment);
    const endIndex = html.indexOf(endComment);

    if (startIndex !== -1 && endIndex !== -1) {
      return html.substring(0, startIndex) + metaTags + html.substring(endIndex + endComment.length);
    }
    return html.replace('</head>', `${metaTags}</head>`);
  }

  function getRequestOrigin(req: express.Request): string {
    const protocol = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    return `${protocol}://${host}`;
  }

  function getPublicOrigin(req: express.Request): string {
    const reqOrigin = getRequestOrigin(req);
    const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (appUrl && /^https?:\/\//i.test(appUrl) && /localhost|127\.0\.0\.1/i.test(reqOrigin)) {
      return appUrl;
    }
    return reqOrigin;
  }

  function getIndexHtmlPath(): string {
    return process.env.NODE_ENV !== "production"
      ? path.join(process.cwd(), 'index.html')
      : path.join(process.cwd(), 'dist', 'index.html');
  }

  // Upload browser-rendered 1200x675 personalized E-Invite JPEG to R2 / local OG cache
  app.post('/api/og/einvite/upload', (req, res) => {
    upload.single('file')(req, res, async (multerErr: any) => {
      if (multerErr) {
        return res.status(400).json({ success: false, error: multerErr.message });
      }
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'File tidak ditemukan' });
        }
        const safeEventId = String(req.body?.eventId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const safeTicketCode = String(req.body?.ticketCode || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeEventId || !safeTicketCode) {
          return res.status(400).json({ success: false, error: 'Missing eventId or ticketCode' });
        }

        const key = `einvite-cards/${safeEventId}/${safeTicketCode}.jpg`;
        const fileContent = fs.readFileSync(req.file.path);
        const r2Client = getR2Client();
        let finalUrl = `${getRequestOrigin(req)}/api/og/einvite/${encodeURIComponent(safeEventId)}/${encodeURIComponent(safeTicketCode)}.jpg`;

        if (r2Client) {
          try {
            await r2Client.send(
              new PutObjectCommand({
                Bucket: r2BucketName,
                Key: key,
                Body: fileContent,
                ContentType: 'image/jpeg',
                CacheControl: 'public, max-age=3600',
              })
            );
            const cdnDomain = (
              process.env.CDN_DOMAIN ||
              process.env.R2_PUBLIC_URL ||
              'https://cdn.guestly.yulovi.com'
            ).replace(/\/+$/, '');
            finalUrl = `${cdnDomain}/${key}`;
          } catch (r2Err: any) {
            console.warn('E-Invite R2 upload failed, using server OG endpoint:', r2Err?.message);
          }
        }

        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // ignore temp cleanup error
        }

        return res.json({ success: true, key, url: finalUrl });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err?.message || 'Upload failed' });
      }
    });
  });

  // E-Card Invitation OG Image endpoint (for WhatsApp Invitation Link Preview)
  app.get(['/api/og/einvite/:eventId', '/api/og/einvite/:eventId/:ticketCode'], async (req, res) => {
    try {
      const rawEventId = String(req.params.eventId || '').replace(/\.(jpg|jpeg|png|webp)$/i, '');
      const rawTicket = req.params.ticketCode
        ? String(req.params.ticketCode).replace(/\.(jpg|jpeg|png|webp)$/i, '')
        : '';

      if (!rawEventId) {
        return res.status(400).send('Missing eventId');
      }

      const { data: eventRow } = await supabase
        .from('events')
        .select('*')
        .eq('id', rawEventId)
        .maybeSingle();

      if (!eventRow) {
        return res.status(404).send('Event not found');
      }

      let guestRow: any = null;
      if (rawTicket) {
        const { data: g } = await supabase
          .from('guests')
          .select('*')
          .eq('event_id', rawEventId)
          .eq('ticket_code', rawTicket)
          .maybeSingle();
        guestRow = g || null;
      }

      const origin = getRequestOrigin(req);
      const imageBuffer = await renderEInvitationOgImage(eventRow, guestRow, origin);

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(imageBuffer);
    } catch (err: any) {
      console.error('Error generating E-Card OG image:', err);
      return res.status(500).send(err?.message || 'Error rendering OG image');
    }
  });

  // Normalized JPEG Event Thumbnail endpoint for WhatsApp / Fonnte media delivery
  app.get(['/api/media/wa-thumbnail/:eventId', '/api/media/wa-thumbnail/:eventId.jpg'], async (req, res) => {
    try {
      const rawEventId = String(req.params.eventId || '').replace(/\.(jpg|jpeg|png|webp)$/i, '');
      if (!rawEventId) {
        return res.status(400).send('Missing eventId');
      }

      const { data: eventRow } = await supabase
        .from('events')
        .select('*')
        .eq('id', rawEventId)
        .maybeSingle();

      if (!eventRow) {
        return res.status(404).send('Event not found');
      }

      const extra = eventRow.settings && typeof eventRow.settings === 'object' ? eventRow.settings : {};
      const candidateUrl = String(
        eventRow.thumbnail_url ||
          extra.thumbnailUrl ||
          eventRow.cover_image ||
          extra.coverImage ||
          eventRow.frame_overlay_url ||
          extra.frameOverlayUrl ||
          extra.eInvitePhotoUrl ||
          ''
      ).trim();

      if (candidateUrl) {
        const media = await resolveMediaBuffer(candidateUrl).catch(() => null);
        if (media?.buffer && media.buffer.length > 0) {
          try {
            const jpgBuf = await sharp(media.buffer)
              .rotate()
              .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 86, mozjpeg: true })
              .toBuffer();
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=1800');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.send(jpgBuf);
          } catch {
            // fall through to dynamic E-Card OG image fallback
          }
        }
      }

      // Fallback to dynamic E-Card OG image if no standalone thumbnail image is available
      const origin = getRequestOrigin(req);
      const fallbackBuf = await renderEInvitationOgImage(eventRow, null, origin);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(fallbackBuf);
    } catch (err: any) {
      console.error('Error serving WhatsApp JPEG thumbnail:', err);
      return res.status(500).send(err?.message || 'Error rendering thumbnail');
    }
  });

  // Dynamic metadata for Invitation / RSVP pages -> pulls E-Card Invitation OG image
  app.get(['/public/rsvp/:eventId', '/rsvp/:eventId/:ticketCode'], async (req, res, next) => {
    try {
      const eventId = req.params.eventId;
      const ticketCode = req.params.ticketCode;
      if (!eventId) return next();

      const { data: eventRow } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();

      if (eventRow) {
        let guestName = '';
        if (ticketCode) {
          try {
            const { data: guestRow } = await supabase
              .from('guests')
              .select('name')
              .eq('event_id', eventId)
              .eq('ticket_code', ticketCode)
              .maybeSingle();
            if (guestRow?.name) {
              guestName = guestRow.name;
            }
          } catch (_e) {
            // ignore
          }
        }

        const extra = eventRow.settings && typeof eventRow.settings === 'object' ? eventRow.settings : {};
        const origin = getRequestOrigin(req);

        const baseTitle =
          eventRow.title ||
          extra.title ||
          (eventRow.couple_name || extra.coupleName
            ? `The Wedding Of ${eventRow.couple_name || extra.coupleName}`
            : 'Undangan Acara');
        const title = guestName ? `${baseTitle} — Kepada Yth. ${guestName}` : baseTitle;
        const desc =
          extra.description ||
          (guestName
            ? `Undangan Digital & Tiket QR Kehadiran untuk ${guestName}. Mohon tunjukkan QR Code di dalam link ini saat tiba di lokasi acara.`
            : 'Undangan Digital & Layar Sapa RSVP. Mohon tunjukkan QR Code di dalam link ini saat tiba di lokasi acara.');

        const eCardOgImage = ticketCode
          ? `${origin}/api/og/einvite/${encodeURIComponent(eventId)}/${encodeURIComponent(ticketCode)}.jpg`
          : `${origin}/api/og/einvite/${encodeURIComponent(eventId)}.jpg`;

        let html = fs.readFileSync(getIndexHtmlPath(), 'utf8');
        html = injectMetaIntoHtml(html, {
          title,
          description: desc,
          imageUrl: eCardOgImage,
          pageUrl: `${origin}${req.originalUrl}`,
          siteName: baseTitle,
        });

        if (vite) {
          html = await vite.transformIndexHtml(req.url, html);
        }

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
      } else {
        next();
      }
    } catch (e) {
      console.error("Error setting RSVP metadata:", e);
      next();
    }
  });

  // Dynamic metadata for Client Login / Dashboard Ready links -> pulls Event Thumbnail or Guestly Brand
  app.get(['/auth/login', '/auth/login/*'], async (req, res, next) => {
    try {
      if (/\.(js|css|png|jpg|jpeg|webp|svg|ico|json|woff2?|map)$/i.test(req.path)) {
        return next();
      }

      const origin = getRequestOrigin(req);
      let eventIdParam = String(req.query.event || '').trim();
      if (!eventIdParam) {
        const match = req.path.match(/^\/auth\/login\/events\/([^/]+)/);
        if (match && match[1] && match[1] !== 'add') {
          eventIdParam = match[1];
        }
      }

      let title = 'Guestly | Smart Guest Management';
      let description = 'Platform Manajemen Tamu, RSVP & Buku Tamu Digital Profesional.';
      let siteName = 'Guestly';
      let thumb = '';

      if (eventIdParam) {
        const { data: eventRow } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventIdParam)
          .maybeSingle();

        if (eventRow) {
          const extra = eventRow.settings && typeof eventRow.settings === 'object' ? eventRow.settings : {};
          const eventTitle =
            eventRow.title ||
            extra.title ||
            (eventRow.couple_name || extra.coupleName
              ? `The Wedding Of ${eventRow.couple_name || extra.coupleName}`
              : 'Buku Tamu Digital');

          title = `Buku Tamu Digital Siap — ${eventTitle}`;
          description = `Dashboard pengelolaan tamu, RSVP, dan buku tamu digital untuk acara ${eventTitle}. Login untuk menambahkan atau memperbarui daftar tamu secara mandiri.`;
          siteName = eventTitle;
          thumb = String(
            eventRow.thumbnail_url ||
              extra.thumbnailUrl ||
              eventRow.cover_image ||
              extra.coverImage ||
              extra.eInvitePhotoUrl ||
              ''
          ).trim();
        }
      }

      if (!thumb) {
        try {
          const { data: settingsRows } = await supabase
            .from('settings')
            .select('id, data')
            .in('id', ['global', 'doc:settings:global']);
          const globalData = settingsRows?.find((r) => r?.data)?.data;
          if (globalData) {
            if (!eventIdParam && globalData.appName) {
              siteName = String(globalData.appName);
              title = `${siteName} | ${globalData.appTagline || 'Smart Guest Management'}`;
            }
            thumb = String(
              globalData.brandingImageUrl ||
                globalData.bannerUrl ||
                globalData.appLogoUrl ||
                ''
            ).trim();
          }
        } catch {
          // ignore
        }
      }

      if (thumb && thumb.startsWith('/')) {
        thumb = `${origin}${thumb}`;
      }

      let html = fs.readFileSync(getIndexHtmlPath(), 'utf8');
      html = injectMetaIntoHtml(html, {
        title,
        description,
        imageUrl: thumb || undefined,
        pageUrl: `${origin}${req.originalUrl}`,
        siteName,
      });

      if (vite) {
        html = await vite.transformIndexHtml(req.url, html);
      }

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(html);
    } catch (e) {
      console.error("Error setting auth/login metadata:", e);
      next();
    }
  });

  if (vite) {
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
