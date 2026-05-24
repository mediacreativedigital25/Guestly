import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import dotenv from "dotenv";
import firebaseConfig from "./firebase-applet-config.json";
import cron from "node-cron";

dotenv.config();

// Initialize Firebase for server
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

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
      console.log('Running daily event notification check...');
      // Get date string 3 days from now in YYYY-MM-DD
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 3);
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      const targetDateStr = `${year}-${month}-${day}`;

      console.log(`Checking events for H-3 (Target Date: ${targetDateStr})`);

      const eventsRef = collection(db, 'events');
      const q = query(eventsRef, where('date', '==', targetDateStr));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
         console.log('No events approaching H-3.');
         return;
      }

      for (const docSnap of querySnapshot.docs) {
         const event = docSnap.data();
         if (event.status === 'completed' || !event.partnerId) continue;
         
         const partnerRef = doc(db, 'users', event.partnerId);
         const partnerSnap = await getDoc(partnerRef);
         
         if (partnerSnap.exists()) {
             const partner = partnerSnap.data();
             if (partner.phone) {
                 const message = `Halo ${partner.name || 'Partner'},\n\nSebagai pengingat, acara klien Anda sudah mendekati H-3.\n\n*Detail Acara:*\n- Nama Acara: ${event.title}\n- Tanggal Acara: ${targetDateStr}\n- Lokasi: ${event.location || '-'}\n\nMohon pastikan segala perlengkapan dan kebutuhan acara disiapkan dengan matang.\n\nSalam Hangat,\nTim Guestly`;
                 
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
  // Start the background cron job for sending notifications
  startCronJob();

  const app = express();
  const PORT = 3000;

  // Manual trigger route for testing the H-3 notification
  app.post('/api/trigger-h3-notifications', async (req, res) => {
    try {
      console.log('Manual trigger: Running event notification check...');
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 3);
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      const targetDateStr = `${year}-${month}-${day}`;

      console.log(`Checking events for H-3 (Target Date: ${targetDateStr})`);

      const eventsRef = collection(db, 'events');
      const q = query(eventsRef, where('date', '==', targetDateStr));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
         res.json({ message: 'No events approaching H-3.', targetDate: targetDateStr });
         return;
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
                 const message = `Halo ${partner.name || 'Partner'},\n\nSebagai pengingat, acara klien Anda sudah mendekati H-3.\n\n*Detail Acara:*\n- Nama Acara: ${event.title}\n- Tanggal Acara: ${targetDateStr}\n- Lokasi: ${event.location || '-'}\n\nMohon pastikan segala perlengkapan dan kebutuhan acara disiapkan dengan matang.\n\nSalam Hangat,\nTim Guestly`;
                 
                 await sendWhatsAppNotification(partner.phone, message);
                 sentCount++;
             }
         }
      }
      res.json({ message: `Successfully sent ${sentCount} notifications.`, targetDate: targetDateStr });
    } catch (error: any) {
      console.error('Error running trigger:', error);
      res.status(500).json({ error: error.message });
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
        const title = eventData.title || 'Undangan Acara';
        const desc = eventData.description || 'Anda diundang ke acara kami!';
        const thumb = eventData.thumbnailUrl || eventData.frameOverlayUrl || 'https://via.placeholder.com/1200x630?text=Undangan';

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
        html = html.replace('<!-- INJECT_META_TAGS -->', metaTags);
        // Also just replace </head> if the comment isn't there
        if (!html.includes(metaTags)) {
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
