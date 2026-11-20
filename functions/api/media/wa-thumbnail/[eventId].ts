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
        'User-Agent': 'Mozilla/5.0 (compatible; GuestlyThumbnailProxy/1.0)',
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
  const rawEventId = decodeURIComponent(String(params?.eventId || '')).replace(/\.(jpg|jpeg|png|webp)$/i, '');

  if (!rawEventId) {
    return new Response('Missing eventId', { status: 400 });
  }

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
      eventRow?.thumbnail_url,
      extra.thumbnailUrl,
      eventRow?.cover_image,
      extra.coverImage,
      extra.eInvitePhotoUrl,
      eventRow?.frame_overlay_url,
      extra.frameOverlayUrl,
      DEFAULT_THUMBNAIL,
    ].filter((u): u is string => Boolean(u && String(u).trim()));

    for (const candidate of candidates) {
      const imgRes = await fetchImageResponse(candidate, reqUrl.origin, env);
      if (imgRes) return imgRes;
    }

    return new Response('Thumbnail not available', { status: 404 });
  } catch (err: any) {
    return new Response(err?.message || 'Error fetching thumbnail', { status: 500 });
  }
}
