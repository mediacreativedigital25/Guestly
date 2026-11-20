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
    const shouldRefresh = body?.refresh !== false;

    const resolvedToken = cleanCustom
      ? cleanCustom
      : useGlobal
      ? await resolveGlobalFonnteToken(env)
      : '';

    if (!resolvedToken) {
      return new Response(
        JSON.stringify({
          success: false,
          groups: [],
          error: 'Token Fonnte belum diatur. Pastikan Token Vendor atau Token Global Guestly sudah terhubung.',
        }),
        { status: 200, headers }
      );
    }

    // Trigger Fonnte to refresh its cached group list first (best-effort)
    if (shouldRefresh) {
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

      return new Response(
        JSON.stringify({
          success: true,
          groups,
          tokenSource: cleanCustom ? 'Token Fonnte Vendor' : 'Token Global Guestly',
        }),
        { status: 200, headers }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        groups: [],
        error: result?.reason || 'Gagal mengambil daftar grup dari Fonnte. Pastikan device WhatsApp terhubung.',
      }),
      { status: 200, headers }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        groups: [],
        error: error?.message || 'Gagal menghubungi API Fonnte.',
      }),
      { status: 500, headers }
    );
  }
}
