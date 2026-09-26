import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import dotenv from "dotenv";
import firebaseConfig from "./firebase-applet-config.json";
import cron from "node-cron";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

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
  destination: (req, file, cb) => {
    cb(null, uploadsBaseDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

// Initialize Firebase for server
const firebaseApp = initializeApp(firebaseConfig);
const db = initializeFirestore(firebaseApp, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);

async function sendWhatsAppNotification(target: string, message: string) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    console.warn("FONNTE_TOKEN is not set in environment variables. Notification won't be sent.");
    return;
  }
  
  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        "Authorization": token
      },
      body: new URLSearchParams({
        "target": target,
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

function startCronJob() {
  // Run daily at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    try {
      const token = process.env.FONNTE_TOKEN;
      if (!token) {
        console.log('FONNTE_TOKEN is not set. Skipping daily event notification check.');
        return;
      }
      console.log('Running daily event notification check...');
      const offsets = [30, 14, 7, 3];

      for (const offset of offsets) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + offset);
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        const targetDateStr = `${year}-${month}-${day}`;

        console.log(`Checking events for H-${offset} (Target Date: ${targetDateStr})`);

        const eventsRef = collection(db, 'events');
        const q = query(eventsRef, where('date', '==', targetDateStr));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
           console.log(`No events approaching H-${offset}.`);
           continue;
        }

        for (const docSnap of querySnapshot.docs) {
           const event = docSnap.data();
           if (event.status === 'completed' || !event.partnerId) continue;
           
           const partnerRef = doc(db, 'users', event.partnerId);
           const partnerSnap = await getDoc(partnerRef);
           
           if (partnerSnap.exists()) {
               const partner = partnerSnap.data();
               if (partner.phone) {
                   const message = `Halo ${partner.name || 'Partner'},\n\nSebagai pengingat, acara klien Anda sudah mendekati H-${offset}.\n\n*Detail Acara:*\n- Nama Acara: ${event.title}\n- Tanggal Acara: ${targetDateStr}\n- Lokasi: ${event.location || '-'}\n\nMohon pastikan segala perlengkapan dan kebutuhan acara disiapkan dengan matang.\n\nSalam Hangat,\nTim Guestly`;
                   
                   await sendWhatsAppNotification(partner.phone, message);
               }
           }
        }
      }
    } catch (error) {
      console.error('Error running cron job:', error);
    }
  });
}

async function startServer() {
  // Start the background cron job for sending notifications
  startCronJob();

  const app = express();
  const PORT = 3000;

  // Manual trigger route for testing the notifications
  app.post('/api/trigger-notifications', async (req, res) => {
    try {
      console.log('Manual trigger: Running event notification check...');
      let totalSentCount = 0;
      let logs = [];
      const offsets = [30, 14, 7, 3];

      for (const offset of offsets) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + offset);
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        const targetDateStr = `${year}-${month}-${day}`;

        console.log(`Checking events for H-${offset} (Target Date: ${targetDateStr})`);

        const eventsRef = collection(db, 'events');
        const q = query(eventsRef, where('date', '==', targetDateStr));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
           logs.push(`No events approaching H-${offset}.`);
           continue;
        }

        let sentCount = 0;
        for (const docSnap of querySnapshot.docs) {
           const event = docSnap.data();
           if (event.status === 'completed' || !event.partnerId) continue;
           
           const partnerRef = doc(db, 'users', event.partnerId);
           const partnerSnap = await getDoc(partnerRef);
           
           if (partnerSnap.exists()) {
               const partner = partnerSnap.data();
               if (partner.phone) {
                   const message = `Halo ${partner.name || 'Partner'},\n\nSebagai pengingat, acara klien Anda sudah mendekati H-${offset}.\n\n*Detail Acara:*\n- Nama Acara: ${event.title}\n- Tanggal Acara: ${targetDateStr}\n- Lokasi: ${event.location || '-'}\n\nMohon pastikan segala perlengkapan dan kebutuhan acara disiapkan dengan matang.\n\nSalam Hangat,\nTim Guestly`;
                   
                   await sendWhatsAppNotification(partner.phone, message);
                   sentCount++;
               }
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
  app.use(express.json({ limit: "50mb" })); // Add body parsing

  // Proxy endpoint for sending WhatsApp messages via Fonnte securely (token hidden from client)
  app.post('/api/send-whatsapp', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
      }
      
      const idToken = authHeader.split('Bearer ')[1];
      
      // Verify token via Firebase REST API
      const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`;
      const verifyResponse = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      
      if (!verifyResponse.ok) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Invalid token' });
      }

      const { target, message, url, token: customToken } = req.body;
      let token = process.env.FONNTE_TOKEN || process.env.VITE_FONNTE_TOKEN || customToken;
      
      // If not in env or request, attempt to read from settings document
      if (!token) {
        try {
          const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
          if (settingsSnap.exists() && settingsSnap.data()?.fonnteToken) {
            token = settingsSnap.data().fonnteToken;
          }
        } catch (e) {
          // Firestore might be unreadable or on backup DB, ignore
        }
      }
      
      if (!token) {
        console.warn('WhatsApp proxy: FONNTE_TOKEN is not configured yet. Skipping message dispatch.');
        return res.json({ 
          success: false, 
          notConfigured: true, 
          error: 'Pemberitahuan WhatsApp dilewati karena FONNTE_TOKEN belum diatur di menu Pengaturan.' 
        });
      }

      const body = new URLSearchParams({
        "target": target,
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

  // Serve uploaded media statically
  app.use('/uploads', express.static(uploadsBaseDir));

  // Media upload endpoint
  app.post('/api/media/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: { message: 'File tidak ditemukan untuk diunggah.' } });
      }

      const category = (req.body.category || 'attachment').replace(/[^a-zA-Z0-9_-]/g, '');
      const key = `${category}/${req.file.filename}`;
      let finalUrl = `/uploads/${req.file.filename}`;

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
          finalUrl = `${r2PublicUrl.replace(/\/+$/, '')}/${key}`;
          console.log(`Uploaded successfully to Cloudflare R2: ${finalUrl}`);
        } catch (r2Error: any) {
          console.warn('R2 upload failed, falling back to local server storage:', r2Error.message);
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

  // Media delete endpoint
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
            console.log(`Deleted from Cloudflare R2: ${key}`);
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

  // Media info endpoint
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



  // Add a route to inject dynamic metadata for RSVP page
  app.get(['/public/rsvp/:eventId', '/rsvp/:eventId/:ticketCode'], async (req, res, next) => {
    try {
      const eventId = req.params.eventId;
      if (!eventId) return next();

      const docRef = doc(db, 'events', eventId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const eventData = docSnap.data();
        
        let indexHtmlPath = '';
        let vite = null;

        if (process.env.NODE_ENV !== "production") {
          indexHtmlPath = path.join(process.cwd(), 'index.html');
        } else {
          indexHtmlPath = path.join(process.cwd(), 'dist', 'index.html');
        }

        let html = fs.readFileSync(indexHtmlPath, 'utf8');

        // Prepare meta tags
        const title = eventData.title || (eventData.coupleName ? `The Wedding Of ${eventData.coupleName}` : 'Undangan Acara');
        const desc = eventData.description || 'Undangan Digital & Layar Sapa RSVP. Mohon tunjukkan QR Code di dalam link ini saat tiba di lokasi acara.';
        
        let thumb = eventData.thumbnailUrl || eventData.frameOverlayUrl || 'https://queinvite.yulovi.com/wp-content/uploads/2026/06/Tumbnail.webp';
        
        // Ensure cache buster for images
        if (thumb.startsWith('http')) {
          try {
            const urlObj = new URL(thumb);
            urlObj.searchParams.set('t', Date.now().toString());
            thumb = urlObj.toString();
          } catch (e) {
            // Ignore if invalid URL
          }
        }


        const metaTags = `
          <title>${title}</title>
          <meta name="description" content="${desc}" />
          <meta property="og:title" content="${title}" />
          <meta property="og:description" content="${desc}" />
          <meta property="og:image" content="${thumb}" />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="${title}" />
          <meta name="twitter:description" content="${desc}" />
          <meta name="twitter:image" content="${thumb}" />
        `;

        // Inject meta tags into the head
        const startComment = '<!-- INJECT_META_TAGS -->';
        const endComment = '<!-- END_INJECT_META_TAGS -->';
        
        const startIndex = html.indexOf(startComment);
        const endIndex = html.indexOf(endComment);
        
        if (startIndex !== -1 && endIndex !== -1) {
           html = html.substring(0, startIndex) + metaTags + html.substring(endIndex + endComment.length);
        } else if (!html.includes(metaTags)) {
           html = html.replace('</head>', `${metaTags}</head>`);
        }

        if (process.env.NODE_ENV !== "production") {
          // If in dev, we need to let Vite transform the HTML
          vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
          });
          html = await vite.transformIndexHtml(req.url, html);
        }

        res.send(html);
      } else {
        next();
      }
    } catch (e) {
      console.error("Error setting metadata:", e);
      next();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
