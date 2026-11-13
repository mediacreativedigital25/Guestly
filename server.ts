import express from "express";
import path from "path";
import fs from "fs";
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
  const cleaned = String(raw || '').trim().replace(/[\s\-().]/g, '');
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

  // Proxy endpoint for sending WhatsApp messages via Fonnte securely
  app.post('/api/send-whatsapp', async (req, res) => {
    try {
      const { target, message, url, token: customToken } = req.body;
      const normalizedTarget = normalizePhoneTarget(target);
      if (!normalizedTarget) {
        return res.status(400).json({ success: false, error: 'Nomor WhatsApp tujuan tidak valid atau kosong.' });
      }

      const token = await resolveServerFonnteToken(customToken);
      
      if (!token) {
        return res.json({ 
          success: false, 
          notConfigured: true, 
          error: 'Token Fonnte belum diatur. Silakan isi API Token Fonnte di menu Pengaturan > Token Fonnte.' 
        });
      }

      const body = new URLSearchParams({
        "target": normalizedTarget,
        "message": message,
        "countryCode": "62"
      });
      if (url) {
        body.append("url", url);
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
        return res.status(400).json({ success: false, error: result.reason || 'Fonnte API error' });
      }
    } catch (error: any) {
      console.error('Error proxying wa message:', error);
      res.status(500).json({ success: false, error: error.message });
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

    if (candidateKey) {
      const baseName = path.basename(candidateKey);
      const localPaths = [
        path.join(uploadsBaseDir, candidateKey),
        path.join(uploadsBaseDir, baseName),
      ];
      for (const p of localPaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          return {
            buffer: fs.readFileSync(p),
            contentType: guessMimeType(p),
          };
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
              try {
                fs.writeFileSync(path.join(uploadsBaseDir, baseName), buf);
              } catch {
                // ignore cache write error
              }
              return { buffer: buf, contentType };
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
          return {
            buffer: Buffer.from(arrayBuffer),
            contentType,
          };
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
        const category =
          rawCategory === 'Layar Sapa'
            ? 'Layar Sapa'
            : rawCategory.replace(/[^a-zA-Z0-9_-]/g, '') || 'attachment';
        const key = `${category}/${req.file.filename}`;
        let finalUrl = `/api/media/r2/${key}`;

        const r2Client = getR2Client();
        if (r2Client) {
          try {
            const fileContent = fs.readFileSync(req.file.path);
            await r2Client.send(new PutObjectCommand({
              Bucket: r2BucketName,
              Key: key,
              Body: fileContent,
              ContentType: req.file.mimetype,
            }));
          } catch (r2Error: any) {
            console.warn('R2 upload failed, falling back to local server storage:', r2Error.message);
            finalUrl = `/uploads/${req.file.filename}`;
          }
        }

        return res.json({
          success: true,
          data: {
            url: finalUrl,
            key: key,
            sizeBytes: req.file.size
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
      const { key } = req.body;
      if (key) {
        const localFileName = path.basename(key);
        const filePath = path.join(uploadsBaseDir, localFileName);
        if (fs.existsSync(filePath)) {
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
      const key = req.query.key as string;
      if (!key) {
        return res.status(400).json({ success: false, error: { message: 'Key file diperlukan' } });
      }
      const filePath = path.join(uploadsBaseDir, key);
      if (!fs.existsSync(filePath)) {
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

  function formatIndonesianDateOg(dateInput?: any): string {
    if (!dateInput) return '';
    const days = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
    const months = [
      'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
      'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER',
    ];
    const dt = new Date(dateInput);
    if (!isNaN(dt.getTime())) {
      return `${days[dt.getDay()]}, ${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
    }
    return String(dateInput).trim();
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
    const versionKey = `${eventRow.updated_at || ''}_${guestRow?.updated_at || ''}_${guestRow?.name || ''}`;
    const cacheKey = `${eventRow.id}_${ticketCode || 'public'}_${Buffer.from(versionKey).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`;

    const memHit = ogMemoryCache.get(cacheKey);
    if (memHit) return memHit;

    const diskPath = path.join(ogCacheDir, `${cacheKey}.jpg`);
    if (fs.existsSync(diskPath)) {
      const buf = fs.readFileSync(diskPath);
      ogMemoryCache.set(cacheKey, buf);
      return buf;
    }

    const tplId = String(extra.eInviteTemplateId || 'default-blush-arch');
    let primaryColor = '#153B31';
    let accentColor = '#8C3A50';
    let cardBg = '#FFF9FA';
    let guestBoxBg = '#F6E6EA';
    if (tplId === 'default-royal-gold') {
      primaryColor = '#4A3519';
      accentColor = '#B38748';
      cardBg = '#FDF9F2';
      guestBoxBg = '#F4ECDD';
    } else if (tplId === 'default-emerald-sage') {
      primaryColor = '#16382C';
      accentColor = '#4F7A65';
      cardBg = '#F6FBF8';
      guestBoxBg = '#E4F0EA';
    }

    const WIDTH = 1200;
    const HEIGHT = 630;

    // Base background (either custom eInviteTemplateUrl or soft luxury gradient)
    let baseLayer: ReturnType<typeof sharp>;
    const tplImgUrl = String(extra.eInviteTemplateUrl || '').trim();
    const tplMedia = tplImgUrl ? await resolveMediaBuffer(tplImgUrl).catch(() => null) : null;
    if (tplMedia?.buffer) {
      baseLayer = sharp(tplMedia.buffer).resize(WIDTH, HEIGHT, { fit: 'cover' });
    } else {
      const bgSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${cardBg}" />
            <stop offset="100%" stop-color="${guestBoxBg}" />
          </linearGradient>
        </defs>
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)" />
        <rect x="20" y="20" width="${WIDTH - 40}" height="${HEIGHT - 40}" rx="28" fill="none" stroke="${accentColor}" stroke-opacity="0.35" stroke-width="2" />
      </svg>`;
      baseLayer = sharp(Buffer.from(bgSvg));
    }

    const composites: Parameters<ReturnType<typeof sharp>['composite']>[0] = [];

    // Left panel: Couple photo inside rounded arch frame
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

    if (photoMedia?.buffer) {
      try {
        const photoW = 370;
        const photoH = 510;
        const maskSvg = Buffer.from(
          `<svg width="${photoW}" height="${photoH}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${photoW}" height="${photoH}" rx="185" ry="185" fill="#fff"/>
          </svg>`
        );
        const maskedPhoto = await sharp(photoMedia.buffer)
          .resize(photoW, photoH, { fit: 'cover', position: 'attention' })
          .composite([{ input: maskSvg, blend: 'dest-in' }])
          .png()
          .toBuffer();
        composites.push({ input: maskedPhoto, left: 60, top: 60 });
      } catch {
        // ignore bad image
      }
    }

    // Right panel: Invitation Card & Typography SVG
    const headerLabel = escapeHtml(truncateText(extra.eInviteHeaderText || 'THE WEDDING OF', 32).toUpperCase());
    const coupleLine = couple.bride
      ? `${couple.groom} &amp; ${couple.bride}`
      : escapeHtml(couple.groom);
    const coupleDisplay = truncateText(coupleLine.replace(/&amp;/g, '&'), 34);
    const dateLabel = escapeHtml(truncateText(formatIndonesianDateOg(eventRow.date || extra.date), 38));
    const timeLabel = escapeHtml(truncateText(eventRow.time || extra.time || '', 28));
    const dateTimeStr = [dateLabel, timeLabel].filter(Boolean).join(' • ');
    const venueLabel = escapeHtml(truncateText(extra.eInviteVenueName || eventRow.location || extra.location || '', 48));
    const guestName = guestRow?.name ? escapeHtml(truncateText(guestRow.name, 28)) : '';
    const guestSession = guestRow?.session ? escapeHtml(truncateText(guestRow.session, 24)) : '';

    const initials = `${(couple.groom || 'G').charAt(0).toUpperCase()}${couple.bride ? ' & ' + couple.bride.charAt(0).toUpperCase() : ''}`;
    const noPhotoArch = !photoMedia?.buffer
      ? `<rect x="60" y="60" width="370" height="510" rx="185" fill="${guestBoxBg}" stroke="${accentColor}" stroke-width="3" />
         <text x="245" y="330" text-anchor="middle" font-family="Georgia, serif" font-size="68" font-weight="bold" fill="${accentColor}">${escapeHtml(initials)}</text>`
      : `<rect x="56" y="56" width="378" height="518" rx="189" fill="none" stroke="${accentColor}" stroke-width="3" stroke-opacity="0.7" />`;

    const qrLink = ticketCode
      ? `${origin}/rsvp/${encodeURIComponent(eventRow.id)}/${encodeURIComponent(ticketCode)}`
      : `${origin}/public/rsvp/${encodeURIComponent(eventRow.id)}`;

    let qrPngBuf: Buffer | null = null;
    try {
      const qrSvg = await QRCode.toString(qrLink, {
        type: 'svg',
        margin: 1,
        width: 132,
        color: { dark: '#111827', light: '#FFFFFF' },
      });
      qrPngBuf = await sharp(Buffer.from(qrSvg)).resize(132, 132).png().toBuffer();
    } catch {
      qrPngBuf = null;
    }

    const cardOverlaySvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="464" y="48" width="684" height="534" rx="28" fill="#FFFFFF" fill-opacity="0.93" stroke="${accentColor}" stroke-opacity="0.28" stroke-width="2" />
      ${noPhotoArch}

      <text x="510" y="114" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="bold" letter-spacing="4" fill="${accentColor}">
        ${headerLabel}
      </text>

      <text x="510" y="182" font-family="Georgia, 'Times New Roman', serif" font-size="${coupleDisplay.length > 24 ? 38 : 48}" font-weight="bold" fill="${primaryColor}">
        ${escapeHtml(coupleDisplay)}
      </text>

      <line x1="510" y1="210" x2="660" y2="210" stroke="${accentColor}" stroke-width="3" stroke-linecap="round" />

      ${dateTimeStr ? `<text x="510" y="256" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="600" fill="#334155">${dateTimeStr}</text>` : ''}
      ${venueLabel ? `<text x="510" y="292" font-family="Arial, Helvetica, sans-serif" font-size="19" fill="#64748B">${venueLabel}</text>` : ''}

      <rect x="510" y="346" width="${qrPngBuf ? 430 : 590}" height="184" rx="18" fill="${guestBoxBg}" stroke="${accentColor}" stroke-opacity="0.3" stroke-width="1.5" />
      <text x="536" y="388" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="bold" letter-spacing="1.5" fill="${accentColor}">
        ${guestName ? 'KEPADA YTH. BAPAK / IBU / SAUDARA/I' : 'UNDANGAN DIGITAL &amp; RSVP'}
      </text>
      <text x="536" y="438" font-family="Georgia, 'Times New Roman', serif" font-size="${guestName && guestName.length > 20 ? 28 : 34}" font-weight="bold" fill="${primaryColor}">
        ${guestName || 'Buka Tautan Untuk Konfirmasi RSVP'}
      </text>
      <text x="536" y="484" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#475569">
        ${guestSession ? `Sesi: ${guestSession}` : 'Mohon tunjukkan QR Code saat tiba di lokasi'}
      </text>
      ${qrPngBuf ? `
        <rect x="962" y="346" width="152" height="184" rx="18" fill="#FFFFFF" stroke="${accentColor}" stroke-opacity="0.35" stroke-width="1.5" />
        <text x="1038" y="514" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="${accentColor}">SCAN QR</text>
      ` : ''}
    </svg>`;

    composites.push({ input: Buffer.from(cardOverlaySvg), left: 0, top: 0 });
    if (qrPngBuf) {
      composites.push({ input: qrPngBuf, left: 972, top: 356 });
    }

    const finalBuf = await baseLayer
      .composite(composites)
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();

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
          <meta property="og:image:height" content="630" />
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

  function getIndexHtmlPath(): string {
    return process.env.NODE_ENV !== "production"
      ? path.join(process.cwd(), 'index.html')
      : path.join(process.cwd(), 'dist', 'index.html');
  }

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
