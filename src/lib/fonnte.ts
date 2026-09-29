import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

function normalizePhoneTarget(raw: string): string {
  const cleaned = String(raw || '').trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+62')) return '0' + cleaned.slice(3);
  if (cleaned.startsWith('62') && cleaned.length > 9) return '0' + cleaned.slice(2);
  return cleaned;
}

async function resolveClientFonnteToken(explicitToken?: string | null): Promise<string> {
  if (explicitToken && explicitToken.trim()) {
    return explicitToken.trim();
  }
  const viteToken = ((import.meta as any).env?.VITE_FONNTE_TOKEN || '').trim();
  if (viteToken) {
    return viteToken;
  }
  try {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('guestly_global_settings_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.fonnteToken && String(parsed.fonnteToken).trim()) {
          return String(parsed.fonnteToken).trim();
        }
      }
    }
  } catch {
    // ignore localStorage errors
  }
  try {
    const snap = await getDoc(doc(db, 'settings', 'global'));
    if (snap.exists()) {
      const data = snap.data() as any;
      if (data?.fonnteToken && String(data.fonnteToken).trim()) {
        return String(data.fonnteToken).trim();
      }
    }
  } catch {
    // ignore firestore errors
  }
  return '';
}

async function sendDirectToFonnte(token: string, target: string, message: string, url?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const body = new URLSearchParams({
      target,
      message,
      countryCode: '62',
    });
    if (url && !url.includes('/api/thumbnail')) {
      body.append('url', url);
    }
    const directResponse = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: token,
      },
      body,
    });
    const directData = await directResponse.json();
    if (directData.status) {
      return { success: true };
    }
    return { success: false, error: directData.reason || 'Fonnte API error' };
  } catch (err: any) {
    return { success: false, error: 'Gagal menghubungi API Fonnte: ' + (err?.message || String(err)) };
  }
}

export async function sendFonnteMessage(token: string | null | undefined, target: string, message: string, url?: string): Promise<{ success: boolean; error?: string }> {
  const normalizedTarget = normalizePhoneTarget(target);
  if (!normalizedTarget) {
    console.warn("Target phone number is missing, cannot send message.");
    return { success: false, error: "Nomor HP tujuan kosong atau tidak valid" };
  }

  try {
    const resolvedToken = await resolveClientFonnteToken(token);
    const user = auth.currentUser;
    let idToken = '';
    if (user) {
      idToken = await user.getIdToken();
    }

    const response = await fetch("/api/send-whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({
        target: normalizedTarget,
        message,
        url,
        token: resolvedToken || undefined
      }),
    });

    if (response.status === 404 || response.status === 405) {
      if (resolvedToken) {
        return await sendDirectToFonnte(resolvedToken, normalizedTarget, message, url);
      }
      return {
        success: false,
        error: `Token Fonnte belum diatur di menu Pengaturan > Token Fonnte.`
      };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      if (resolvedToken) {
        return await sendDirectToFonnte(resolvedToken, normalizedTarget, message, url);
      }
      return { success: false, error: `Invalid proxy response (bukan JSON): ${response.status} ${response.statusText}` };
    }

    if (response.ok && data.success) {
      console.log("WhatsApp message sent successfully via proxy:", data);
      return { success: true };
    } else if (data?.notConfigured) {
      if (resolvedToken) {
        return await sendDirectToFonnte(resolvedToken, normalizedTarget, message, url);
      }
      console.warn("Pemberitahuan WhatsApp dilewati (Token Fonnte belum diatur di menu Pengaturan).");
      return { success: false, error: data.error };
    } else {
      console.warn("WhatsApp proxy notice:", data);
      return { success: false, error: data.error || data.reason || "Terjadi kesalahan pada server WhatsApp" };
    }
  } catch (error: any) {
    console.warn("WhatsApp connection notice:", error);
    return { success: false, error: error.message || "Gagal menghubungi server WhatsApp" };
  }
}
