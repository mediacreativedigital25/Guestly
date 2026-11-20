import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface FonnteDeviceCheckResult {
  success: boolean;
  configured: boolean;
  connected: boolean;
  device?: string;
  name?: string;
  quota?: string | number;
  expired?: string;
  deviceStatus?: string;
  reason?: string;
  error?: string;
}

export interface SendFonnteOptions {
  strictToken?: boolean;
  fallbackTextOnMediaError?: boolean;
  schedule?: number; // UNIX timestamp in seconds (WIB/UTC)
}

export interface SendFonnteResult {
  success: boolean;
  error?: string;
  isMediaError?: boolean;
  usedTextFallback?: boolean;
}

export interface FonnteGroupItem {
  id: string;
  name: string;
}

export interface FetchFonnteGroupsResult {
  success: boolean;
  groups: FonnteGroupItem[];
  tokenSource?: string;
  error?: string;
}

export function normalizePhoneTarget(raw: string): string {
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

export function toWhatsAppInternational(raw: string): string {
  const cleaned = String(raw || '').trim().replace(/[\s\-().+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('0')) return '62' + cleaned.slice(1);
  if (cleaned.startsWith('62')) return cleaned;
  return cleaned;
}

async function resolveClientFonnteToken(explicitToken?: string | null, strictToken = false): Promise<string> {
  if (explicitToken && explicitToken.trim()) {
    return explicitToken.trim();
  }
  if (strictToken) {
    return '';
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

export async function checkFonnteDevice(
  token?: string | null,
  useGlobal = false
): Promise<FonnteDeviceCheckResult> {
  try {
    const cleanToken = token ? token.trim() : '';
    const user = auth.currentUser;
    let idToken = '';
    if (user) {
      idToken = await user.getIdToken();
    }

    const response = await fetch('/api/fonnte/check-device', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        token: cleanToken || undefined,
        useGlobal,
      }),
    });

    const data = await response.json();
    return data as FonnteDeviceCheckResult;
  } catch (err: any) {
    return {
      success: false,
      configured: Boolean(token && token.trim()),
      connected: false,
      error: err?.message || 'Gagal memeriksa koneksi device Fonnte.',
    };
  }
}

export async function fetchFonnteGroups(
  token?: string | null,
  useGlobal = true,
  refresh = true
): Promise<FetchFonnteGroupsResult> {
  try {
    const cleanToken = token ? token.trim() : '';
    const resolvedClientToken = cleanToken
      ? cleanToken
      : useGlobal
      ? await resolveClientFonnteToken(null, false)
      : '';
    const user = auth.currentUser;
    let idToken = '';
    if (user) {
      idToken = await user.getIdToken();
    }

    const response = await fetch('/api/fonnte/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        token: cleanToken || resolvedClientToken || undefined,
        useGlobal: !cleanToken && useGlobal,
        refresh,
      }),
    });

    if (response.status === 404 || response.status === 405) {
      if (resolvedClientToken) {
        if (refresh) {
          try {
            await fetch('https://api.fonnte.com/fetch-group', {
              method: 'POST',
              headers: { Authorization: resolvedClientToken },
            });
          } catch {
            // ignore
          }
        }
        const directRes = await fetch('https://api.fonnte.com/get-whatsapp-group', {
          method: 'POST',
          headers: { Authorization: resolvedClientToken },
        });
        const directData = await directRes.json().catch(() => ({}));
        if (directData?.status && Array.isArray(directData.data)) {
          return {
            success: true,
            groups: directData.data
              .filter((g: any) => g && g.id)
              .map((g: any) => ({ id: String(g.id).trim(), name: String(g.name || g.id).trim() })),
            tokenSource: cleanToken ? 'Token Fonnte Vendor' : 'Token Global Guestly',
          };
        }
        return {
          success: false,
          groups: [],
          error: directData?.reason || 'Gagal mengambil daftar grup dari Fonnte.',
        };
      }
      return {
        success: false,
        groups: [],
        error: 'Token Fonnte belum diatur.',
      };
    }

    const data = await response.json();
    return data as FetchFonnteGroupsResult;
  } catch (err: any) {
    return {
      success: false,
      groups: [],
      error: err?.message || 'Gagal mengambil daftar grup dari Fonnte.',
    };
  }
}

async function sendDirectToFonnte(
  token: string,
  target: string,
  message: string,
  url?: string,
  schedule?: number
): Promise<SendFonnteResult> {
  try {
    const isGroupTarget = target.toLowerCase().includes('@g.us');
    const body = new URLSearchParams({
      target,
      message,
    });
    if (!isGroupTarget) {
      body.append('countryCode', '62');
    }
    if (url && !url.includes('/api/thumbnail')) {
      body.append('url', url);
    }
    if (schedule && Number(schedule) > 0) {
      body.append('schedule', String(Math.floor(Number(schedule))));
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
    const reasonStr = String(directData.reason || 'Fonnte API error');
    const isMediaError = /url|media|file|image|attachment|package|plan|upgrade/i.test(reasonStr);
    return { success: false, error: reasonStr, isMediaError };
  } catch (err: any) {
    return { success: false, error: 'Gagal menghubungi API Fonnte: ' + (err?.message || String(err)) };
  }
}

export async function sendFonnteMessage(
  token: string | null | undefined,
  target: string,
  message: string,
  url?: string,
  options?: SendFonnteOptions
): Promise<SendFonnteResult> {
  const normalizedTarget = normalizePhoneTarget(target);
  if (!normalizedTarget) {
    console.warn('Target phone number or group ID is missing, cannot send message.');
    return { success: false, error: 'Nomor HP atau ID Grup tujuan kosong atau tidak valid' };
  }

  let resolvedUrl = url ? String(url).trim() : undefined;
  if (resolvedUrl && resolvedUrl.startsWith('/') && typeof window !== 'undefined') {
    resolvedUrl = `${window.location.origin}${resolvedUrl}`;
  }

  const strictToken = Boolean(options?.strictToken);
  const scheduleTs =
    options?.schedule && Number(options.schedule) > 0 ? Math.floor(Number(options.schedule)) : undefined;

  try {
    const resolvedToken = await resolveClientFonnteToken(token, strictToken);
    const user = auth.currentUser;
    let idToken = '';
    if (user) {
      idToken = await user.getIdToken();
    }

    const response = await fetch('/api/send-whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        target: normalizedTarget,
        message,
        url: resolvedUrl,
        token: resolvedToken || undefined,
        strictToken,
        schedule: scheduleTs,
      }),
    });

    if (response.status === 404 || response.status === 405) {
      if (resolvedToken) {
        const directRes = await sendDirectToFonnte(
          resolvedToken,
          normalizedTarget,
          message,
          resolvedUrl,
          scheduleTs
        );
        if (!directRes.success && resolvedUrl && directRes.isMediaError && options?.fallbackTextOnMediaError) {
          const retry = await sendDirectToFonnte(
            resolvedToken,
            normalizedTarget,
            message,
            undefined,
            scheduleTs
          );
          return { ...retry, usedTextFallback: retry.success };
        }
        return directRes;
      }
      return {
        success: false,
        error: 'Token Fonnte belum diatur di menu Profil Saya atau Pengaturan.',
      };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      if (resolvedToken) {
        return await sendDirectToFonnte(resolvedToken, normalizedTarget, message, resolvedUrl);
      }
      return { success: false, error: `Invalid proxy response (bukan JSON): ${response.status} ${response.statusText}` };
    }

    if (response.ok && data.success) {
      return { success: true };
    }

    if (data?.notConfigured) {
      if (resolvedToken) {
        return await sendDirectToFonnte(resolvedToken, normalizedTarget, message, resolvedUrl);
      }
      return { success: false, error: data.error };
    }

    if (resolvedUrl && data?.isMediaError && options?.fallbackTextOnMediaError) {
      const retryRes = await sendFonnteMessage(token, target, message, undefined, {
        ...options,
        fallbackTextOnMediaError: false,
      });
      if (retryRes.success) {
        return { success: true, usedTextFallback: true };
      }
    }

    return {
      success: false,
      error: data.error || data.reason || 'Terjadi kesalahan pada server WhatsApp',
      isMediaError: Boolean(data?.isMediaError),
    };
  } catch (error: any) {
    console.warn('WhatsApp connection notice:', error);
    return { success: false, error: error.message || 'Gagal menghubungi server WhatsApp' };
  }
}
