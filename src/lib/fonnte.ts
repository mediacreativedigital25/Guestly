import { auth } from './firebase';

export async function sendFonnteMessage(token: string | null | undefined, target: string, message: string, url?: string): Promise<{ success: boolean; error?: string }> {
  if (!target) {
    console.warn("Target phone number is missing, cannot send message.");
    return { success: false, error: "Nomor HP tujuan kosong" };
  }

  try {
    const user = auth.currentUser;
    let idToken = '';
    if (user) {
      idToken = await user.getIdToken();
    } else {
      console.warn("User is not authenticated, proceeding without token");
    }

    const response = await fetch("/api/send-whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({
        target,
        message,
        url,
      }),
    });

    if (response.status === 404 || response.status === 405) {
      console.warn(`Express backend API /api/send-whatsapp not found (${response.status}). Falling back to direct front-end fetch if VITE_FONNTE_TOKEN is set. Pastikan Anda tidak menghosting secara statis saja atau tambahkan VITE_FONNTE_TOKEN dilingkungan.`);
      if ((import.meta as any).env.VITE_FONNTE_TOKEN) {
         try {
           const body = new URLSearchParams({
             "target": target,
             "message": message,
             "countryCode": "62"
           });
           
           // Jika aplikasi dihosting statis (Cloudflare Pages), thumbnail URL adalah direct cloud storage URL.
           // Kita sertakan ke Fonnte agar pesan dikirim sebagai Media dengan Gambar.
           if (url && !url.includes('/api/thumbnail')) {
             body.append("url", url);
           }
           const directResponse = await fetch("https://api.fonnte.com/send", {
             method: "POST",
             headers: {
               "Authorization": (import.meta as any).env.VITE_FONNTE_TOKEN
             },
             body: body
           });
           const directData = await directResponse.json();
           if (directData.status) {
             return { success: true };
           } else {
             return { success: false, error: directData.reason || "Fonnte API error (Direct fallback)" };
           }
         } catch (fallbackError: any) {
           return { success: false, error: "Static fallback error (CORS/Network): " + fallbackError.message };
         }
      } else {
         return { success: false, error: `Server API backend tidak ditemukan. URL /api/send-whatsapp mengembalikan ${response.status}. Pastikan deploy dengan Express.` };
      }
    }

    // Try catch JSON parse to handle unexpected HTML returns from other error codes (like 502)
    let data;
    try {
      data = await response.json();
    } catch (parseError: any) {
      return { success: false, error: `Invalid proxy response (bukan JSON): ${response.status} ${response.statusText}` };
    }
    if (response.ok && data.success) {
      console.log("WhatsApp message sent successfully via proxy:", data);
      return { success: true };
    } else {
      console.error("WhatsApp proxy error:", data);
      return { success: false, error: data.error || data.reason || "Terjadi kesalahan pada server WhatsApp" };
    }
  } catch (error: any) {
    console.error("WhatsApp connection error:", error);
    return { success: false, error: error.message || "Gagal menghubungi server WhatsApp" };
  }
}
