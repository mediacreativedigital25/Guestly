const SUPABASE_URL = 'https://ryixdkgfunuhwxwiivyh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2We9njw3nI0zZqCwkYTvuA_1PargAED';
const DEFAULT_THUMBNAIL = 'https://queinvite.yulovi.com/wp-content/uploads/2026/06/Tumbnail.webp';

function guessMimeFromUrl(url: string): string {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function fetchImageResponse(targetUrl: string, reqOrigin: string, env: any): Promise<Response | null> {
  const cleanUrl = String(targetUrl || '').trim();
  if (!cleanUrl) return null;

  const r2KeyMatch =
    cleanUrl.match(/^https?:\/\/cdn\.guestly\.yulovi\.com\/+(.+)$/i) ||
    cleanUrl.match(/^\/api\/media\/r2\/+(.+)$/i);
  const r2Key = r2KeyMatch?.[1] ? decodeURIComponent(r2KeyMatch[1].split('?')[0]) : null;

  if (r2Key && env?.R2_BUCKET) {
    try {
      const obj = await env.R2_BUCKET.get(r2Key);
      if (obj) {
        const mime = obj.httpMetadata?.contentType || guessMimeFromUrl(r2Key);
        return new Response(obj.body, {
          status: 200,
          headers: {
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=1800',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch {
      // fall through to HTTP fetch
    }
  }

  let fetchUrl = cleanUrl;
  if (r2Key) {
    const cdnDomain = (env?.CDN_DOMAIN || env?.R2_PUBLIC_URL || 'https://cdn.guestly.yulovi.com').replace(/\/+$/, '');
    fetchUrl = `${cdnDomain}/${r2Key}`;
  } else if (cleanUrl.startsWith('/')) {
    fetchUrl = `${reqOrigin}${cleanUrl}`;
  }

  try {
    const upstream = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GuestlyEInviteOG/1.0)',
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    if (!upstream.ok) return null;
    const ct = upstream.headers.get('content-type') || guessMimeFromUrl(fetchUrl);
    if (!ct.toLowerCase().startsWith('image/')) return null;

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=1800',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return null;
  }
}

export async function onRequestGet(context: any) {
  const { request, params, env } = context;
  const reqUrl = new URL(request.url);
  const rawParts = Array.isArray(params?.path)
    ? params.path
    : params?.path
    ? [String(params.path)]
    : [];

  const rawEventId = decodeURIComponent(String(rawParts[0] || '')).replace(/\.(jpg|jpeg|png|webp)$/i, '');
  const rawTicket = rawParts[1]
    ? decodeURIComponent(String(rawParts[1])).replace(/\.(jpg|jpeg|png|webp)$/i, '')
    : '';

  if (!rawEventId) {
    return new Response('Missing eventId', { status: 400 });
  }

  const safeEventId = rawEventId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeTicket = rawTicket.replace(/[^a-zA-Z0-9_-]/g, '');

  // 1. Check pre-rendered personalized 1200x675 E-Invite card in R2 bucket or CDN
  if (safeEventId && safeTicket) {
    const r2Candidates = [
      `einvite-cards/${safeEventId}/${safeTicket}.jpg`,
      `einvite-cards/${safeEventId}/${safeTicket}.png`,
    ];
    if (env?.R2_BUCKET) {
      for (const key of r2Candidates) {
        try {
          const cached = await env.R2_BUCKET.get(key);
          if (cached) {
            return new Response(cached.body, {
              status: 200,
              headers: {
                'Content-Type': cached.httpMetadata?.contentType || guessMimeFromUrl(key),
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
        } catch {
          // continue
        }
      }
    }

    const cdnDomain = (env?.CDN_DOMAIN || env?.R2_PUBLIC_URL || 'https://cdn.guestly.yulovi.com').replace(/\/+$/, '');
    const cdnCardRes = await fetchImageResponse(
      `${cdnDomain}/einvite-cards/${safeEventId}/${safeTicket}.jpg`,
      reqUrl.origin,
      env
    );
    if (cdnCardRes) return cdnCardRes;
  }

  // 2. Fall back to the event's verified cover/thumbnail image (never returning HTML)
  const supabaseUrl = env?.VITE_SUPABASE_URL || SUPABASE_URL;
  const supabaseKey = env?.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

  try {
    const eventRes = await fetch(
      `${supabaseUrl}/rest/v1/events?id=eq.${encodeURIComponent(rawEventId)}&select=*&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      }
    );

    let eventRow: any = null;
    if (eventRes.ok) {
      const rows = await eventRes.json();
      if (Array.isArray(rows) && rows.length > 0) {
        eventRow = rows[0];
      }
    }

    const extra = eventRow?.settings && typeof eventRow.settings === 'object' ? eventRow.settings : {};
    const candidates = [
      extra.eInvitePhotoUrl,
      eventRow?.thumbnail_url,
      extra.thumbnailUrl,
      eventRow?.cover_image,
      extra.coverImage,
      eventRow?.frame_overlay_url,
      extra.frameOverlayUrl,
      DEFAULT_THUMBNAIL,
    ].filter((u): u is string => Boolean(u && String(u).trim()));

    for (const candidate of candidates) {
      const imgRes = await fetchImageResponse(candidate, reqUrl.origin, env);
      if (imgRes) return imgRes;
    }

    return new Response('E-Invite image not available', { status: 404 });
  } catch (err: any) {
    return new Response(err?.message || 'Error serving E-Invite image', { status: 500 });
  }
}
