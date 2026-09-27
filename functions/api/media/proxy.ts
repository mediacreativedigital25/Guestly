function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function guessMimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  return 'image/jpeg';
}

export async function onRequestGet(context: any) {
  const { request, env } = context;
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=86400',
  };

  try {
    const reqUrl = new URL(request.url);
    const targetUrl = (reqUrl.searchParams.get('url') || '').trim();
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing url parameter' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (targetUrl.startsWith('data:')) {
      return new Response(
        JSON.stringify({ success: true, dataUrl: targetUrl }),
        { status: 200, headers: corsHeaders }
      );
    }

    const r2KeyMatch =
      targetUrl.match(/^https?:\/\/cdn\.guestly\.yulovi\.com\/+(.+)$/i) ||
      targetUrl.match(/^\/api\/media\/r2\/+(.+)$/i);
    const r2Key = r2KeyMatch?.[1] ? decodeURIComponent(r2KeyMatch[1]) : null;

    // 1. If R2_BUCKET binding is available on Cloudflare Pages, read directly from R2
    if (r2Key && env?.R2_BUCKET) {
      try {
        const obj = await env.R2_BUCKET.get(r2Key);
        if (obj) {
          const buf = await obj.arrayBuffer();
          const mime = obj.httpMetadata?.contentType || guessMimeFromUrl(r2Key);
          const b64 = arrayBufferToBase64(buf);
          return new Response(
            JSON.stringify({ success: true, dataUrl: `data:${mime};base64,${b64}` }),
            { status: 200, headers: corsHeaders }
          );
        }
      } catch {
        // fallback to HTTP fetch below
      }
    }

    // 2. Fetch via HTTP (resolving relative paths against CDN or origin)
    let fetchUrl = targetUrl;
    if (r2Key) {
      const cdnDomain = (
        env?.CDN_DOMAIN ||
        env?.R2_PUBLIC_URL ||
        'https://cdn.guestly.yulovi.com'
      ).replace(/\/+$/, '');
      fetchUrl = `${cdnDomain}/${r2Key}`;
    } else if (targetUrl.startsWith('/')) {
      fetchUrl = `${reqUrl.origin}${targetUrl}`;
    }

    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GuestlyCardExporter/1.0)',
        Accept: 'image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Upstream returned ${response.status}`,
        }),
        { status: response.status, headers: corsHeaders }
      );
    }

    const contentType = response.headers.get('content-type') || guessMimeFromUrl(fetchUrl);
    const buf = await response.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);

    return new Response(
      JSON.stringify({
        success: true,
        dataUrl: `data:${contentType};base64,${b64}`,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Proxy error',
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}
