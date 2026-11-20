const SUPABASE_URL = 'https://ryixdkgfunuhwxwiivyh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2We9njw3nI0zZqCwkYTvuA_1PargAED';

async function resolveGlobalFonnteToken(env: any): Promise<string> {
  if (env?.FONNTE_TOKEN && String(env.FONNTE_TOKEN).trim()) {
    return String(env.FONNTE_TOKEN).trim();
  }
  try {
    const supabaseUrl = env?.VITE_SUPABASE_URL || SUPABASE_URL;
    const supabaseKey = env?.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/settings?id=eq.global&select=*&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      }
    );
    if (res.ok) {
      const rows = await res.json();
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      const token =
        row?.fonnte_token ||
        row?.fonnteToken ||
        row?.data?.fonnteToken ||
        row?.settings?.fonnteToken ||
        '';
      if (token && String(token).trim()) {
        return String(token).trim();
      }
    }
  } catch {
    // ignore
  }
  return '';
}

export async function onRequestPost(context: any) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { request, env } = context;
    const body = await request.json().catch(() => ({}));
    const cleanCustom = body?.token ? String(body.token).trim() : '';
    const useGlobal = Boolean(body?.useGlobal);

    const resolvedToken = cleanCustom
      ? cleanCustom
      : useGlobal
      ? await resolveGlobalFonnteToken(env)
      : '';

    if (!resolvedToken) {
      return new Response(
        JSON.stringify({
          success: false,
          configured: false,
          connected: false,
          error: 'Token Fonnte belum diisi.',
        }),
        { status: 200, headers }
      );
    }

    const response = await fetch('https://api.fonnte.com/device', {
      method: 'POST',
      headers: {
        Authorization: resolvedToken,
      },
    });

    const result: any = await response.json().catch(() => ({}));
    const rawStatus = String(result?.device_status || '').toLowerCase();
    const isConnected =
      Boolean(result?.status) &&
      (rawStatus === 'connect' || rawStatus === 'connected' || (!rawStatus && Boolean(result?.device)));

    if (result?.status) {
      return new Response(
        JSON.stringify({
          success: true,
          configured: true,
          connected: isConnected,
          device: result.device || '',
          name: result.name || '',
          quota: result.quota ?? '',
          expired: result.expired || '',
          deviceStatus: result.device_status || (isConnected ? 'connect' : 'unknown'),
          reason: result.reason || '',
        }),
        { status: 200, headers }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        configured: true,
        connected: false,
        deviceStatus: result?.device_status || 'disconnect',
        error: result?.reason || 'Token tidak valid atau device WhatsApp belum terhubung di Fonnte.',
      }),
      { status: 200, headers }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        configured: false,
        connected: false,
        error: error?.message || 'Gagal memeriksa koneksi device Fonnte.',
      }),
      { status: 500, headers }
    );
  }
}
