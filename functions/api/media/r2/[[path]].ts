function guessMimeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  return 'image/jpeg';
}

export async function onRequestGet(context: any) {
  const { request, env, params } = context;
  const rawParts = params?.path;
  const key = Array.isArray(rawParts)
    ? rawParts.map((p: string) => decodeURIComponent(p)).join('/')
    : typeof rawParts === 'string'
    ? decodeURIComponent(rawParts)
    : '';

  if (!key || key.includes('..')) {
    return new Response('Invalid media key', { status: 400 });
  }

  // 1. Try Cloudflare Pages R2_BUCKET binding if present
  if (env?.R2_BUCKET) {
    try {
      const obj = await env.R2_BUCKET.get(key);
      if (obj) {
        const headers = new Headers();
        headers.set(
          'Content-Type',
          obj.httpMetadata?.contentType || guessMimeFromKey(key)
        );
        headers.set('Cache-Control', 'public, max-age=31536000');
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(obj.body, { status: 200, headers });
      }
    } catch {
      // fallback to CDN fetch below
    }
  }

  // 2. Fallback: proxy from public R2 CDN domain
  const cdnDomain = (
    env?.CDN_DOMAIN ||
    env?.R2_PUBLIC_URL ||
    'https://cdn.guestly.yulovi.com'
  ).replace(/\/+$/, '');
  const encodedKeyPath = key
    .split('/')
    .map((seg: string) => encodeURIComponent(seg))
    .join('/');
  const upstream = await fetch(`${cdnDomain}/${encodedKeyPath}`, {
    headers: {
      'User-Agent': request.headers.get('User-Agent') || 'GuestlyMediaEdge/1.0',
    },
  });

  if (!upstream.ok) {
    return new Response('Media not found', { status: upstream.status });
  }

  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') || guessMimeFromKey(key)
  );
  headers.set('Cache-Control', 'public, max-age=31536000');
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(upstream.body, { status: 200, headers });
}
