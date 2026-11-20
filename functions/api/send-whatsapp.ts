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
  try {
    const { request, env } = context;
    const { target, message, url, token, strictToken, schedule } = await request.json();

    const trimmedRaw = String(target || '').trim();
    const isGroupTarget = trimmedRaw.toLowerCase().includes('@g.us');
    let normalizedTarget = '';
    if (isGroupTarget) {
      normalizedTarget = trimmedRaw.replace(/\s+/g, '');
    } else {
      const rawTarget = trimmedRaw.replace(/[\s\-().]/g, '');
      normalizedTarget = rawTarget.startsWith('+62')
        ? '0' + rawTarget.slice(3)
        : rawTarget.startsWith('62') && rawTarget.length > 9
        ? '0' + rawTarget.slice(2)
        : rawTarget;
    }

    const cleanCustom = token && String(token).trim() ? String(token).trim() : '';
    const fonnteToken = cleanCustom
      ? cleanCustom
      : strictToken
      ? ''
      : await resolveGlobalFonnteToken(env);

    if (!normalizedTarget || !message) {
      return new Response(JSON.stringify({ success: false, error: 'Target and message are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!fonnteToken) {
      return new Response(
        JSON.stringify({
          success: false,
          notConfigured: true,
          error: 'Token Fonnte belum diatur di menu Pengaturan > Token Fonnte.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const body = new URLSearchParams();
    body.append('target', normalizedTarget);
    body.append('message', message);
    if (!isGroupTarget) {
      body.append('countryCode', '62');
    }
    if (url) {
      body.append('url', url);
    }
    if (schedule && Number(schedule) > 0) {
      body.append('schedule', String(Math.floor(Number(schedule))));
    }

    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: fonnteToken,
      },
      body,
    });

    const result = await response.json();

    if (result.status) {
      return new Response(JSON.stringify({ success: true, result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      const reasonStr = String(result.reason || 'Fonnte API error');
      const isMediaError = /url|media|file|image|attachment|package|plan|upgrade/i.test(reasonStr);
      return new Response(JSON.stringify({ success: false, error: reasonStr, isMediaError }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
