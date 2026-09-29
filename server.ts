import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cron from "node-cron";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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

function startCronJob() {
  // Run daily at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    try {
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

  // Dynamic metadata for RSVP pages using Supabase
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

        let indexHtmlPath = '';
        if (process.env.NODE_ENV !== "production") {
          indexHtmlPath = path.join(process.cwd(), 'index.html');
        } else {
          indexHtmlPath = path.join(process.cwd(), 'dist', 'index.html');
        }

        let html = fs.readFileSync(indexHtmlPath, 'utf8');
        const extra = eventRow.settings && typeof eventRow.settings === 'object' ? eventRow.settings : {};

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

        let thumb =
          eventRow.thumbnail_url ||
          extra.thumbnailUrl ||
          eventRow.cover_image ||
          extra.coverImage ||
          eventRow.frame_overlay_url ||
          extra.frameOverlayUrl ||
          'https://queinvite.yulovi.com/wp-content/uploads/2026/06/Tumbnail.webp';

        const protocol = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'https';
        const host = req.get('host') || 'localhost:3000';
        const origin = `${protocol}://${host}`;

        if (thumb && thumb.startsWith('/')) {
          thumb = `${origin}${thumb}`;
        }

        const safeTitle = escapeHtml(title);
        const safeDesc = escapeHtml(desc);
        const safeThumb = escapeHtml(thumb);
        const safeUrl = escapeHtml(`${origin}${req.originalUrl}`);

        const metaTags = `
          <title>${safeTitle}</title>
          <meta name="description" content="${safeDesc}" />
          <meta property="og:site_name" content="${escapeHtml(baseTitle)}" />
          <meta property="og:title" content="${safeTitle}" />
          <meta property="og:description" content="${safeDesc}" />
          <meta property="og:image" content="${safeThumb}" />
          <meta property="og:image:secure_url" content="${safeThumb}" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:url" content="${safeUrl}" />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="${safeTitle}" />
          <meta name="twitter:description" content="${safeDesc}" />
          <meta name="twitter:image" content="${safeThumb}" />
          <meta itemprop="name" content="${safeTitle}" />
          <meta itemprop="description" content="${safeDesc}" />
          <meta itemprop="image" content="${safeThumb}" />
          <link rel="image_src" href="${safeThumb}" />
        `;

        const startComment = '<!-- INJECT_META_TAGS -->';
        const endComment = '<!-- END_INJECT_META_TAGS -->';
        const startIndex = html.indexOf(startComment);
        const endIndex = html.indexOf(endComment);
        
        if (startIndex !== -1 && endIndex !== -1) {
          html = html.substring(0, startIndex) + metaTags + html.substring(endIndex + endComment.length);
        } else if (!html.includes(metaTags)) {
          html = html.replace('</head>', `${metaTags}</head>`);
        }

        if (vite) {
          html = await vite.transformIndexHtml(req.url, html);
        }

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
      } else {
        next();
      }
    } catch (e) {
      console.error("Error setting metadata:", e);
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
