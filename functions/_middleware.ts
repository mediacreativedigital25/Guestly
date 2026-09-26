const SUPABASE_URL = 'https://ryixdkgfunuhwxwiivyh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2We9njw3nI0zZqCwkYTvuA_1PargAED';
const DEFAULT_THUMBNAIL = 'https://queinvite.yulovi.com/wp-content/uploads/2026/06/Tumbnail.webp';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function onRequest(context: any) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Match /rsvp/:eventId/:ticketCode or /public/rsvp/:eventId
  const ticketMatch = url.pathname.match(/^\/rsvp\/([^\/]+)\/([^\/]+)/);
  const publicMatch = url.pathname.match(/^\/public\/rsvp\/([^\/]+)/);

  if (!ticketMatch && !publicMatch) {
    return next();
  }

  const eventId = decodeURIComponent(ticketMatch ? ticketMatch[1] : publicMatch![1]);
  const ticketCode = ticketMatch ? decodeURIComponent(ticketMatch[2]) : null;

  try {
    const supabaseUrl = env?.VITE_SUPABASE_URL || SUPABASE_URL;
    const supabaseKey = env?.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

    const eventRes = await fetch(
      `${supabaseUrl}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=*&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      }
    );

    if (!eventRes.ok) {
      return next();
    }

    const events = await eventRes.json();
    const eventRow = Array.isArray(events) && events.length > 0 ? events[0] : null;
    if (!eventRow) {
      return next();
    }

    let guestName = '';
    if (ticketCode) {
      try {
        const guestRes = await fetch(
          `${supabaseUrl}/rest/v1/guests?event_id=eq.${encodeURIComponent(eventId)}&ticket_code=eq.${encodeURIComponent(ticketCode)}&select=name&limit=1`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              Accept: 'application/json',
            },
          }
        );
        if (guestRes.ok) {
          const guests = await guestRes.json();
          if (Array.isArray(guests) && guests.length > 0 && guests[0]?.name) {
            guestName = guests[0].name;
          }
        }
      } catch (_e) {
        // ignore guest lookup error
      }
    }

    const extra = eventRow.settings && typeof eventRow.settings === 'object' ? eventRow.settings : {};
    const baseTitle =
      eventRow.title ||
      extra.title ||
      (eventRow.couple_name || extra.coupleName
        ? `The Wedding Of ${eventRow.couple_name || extra.coupleName}`
        : 'Undangan Acara');

    const title = guestName ? `${baseTitle} — Kepada Yth. ${guestName}` : baseTitle;
    const desc =
      extra.description ||
      (guestName
        ? `Undangan Digital & Tiket QR Kehadiran untuk ${guestName}. Mohon tunjukkan QR Code di dalam link ini saat tiba di lokasi acara.`
        : 'Undangan Digital & Layar Sapa RSVP. Mohon tunjukkan QR Code di dalam link ini saat tiba di lokasi acara.');

    let thumb =
      eventRow.thumbnail_url ||
      extra.thumbnailUrl ||
      eventRow.cover_image ||
      extra.coverImage ||
      eventRow.frame_overlay_url ||
      extra.frameOverlayUrl ||
      DEFAULT_THUMBNAIL;

    if (thumb && thumb.startsWith('/')) {
      thumb = `${url.origin}${thumb}`;
    }

    const response = await next();
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return response;
    }

    let html = await response.text();
    const safeTitle = escapeHtml(title);
    const safeDesc = escapeHtml(desc);
    const safeThumb = escapeHtml(thumb);
    const safeUrl = escapeHtml(url.toString());

    const metaTags = `
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <meta property="og:site_name" content="${escapeHtml(baseTitle)}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:image" content="${safeThumb}" />
    <meta property="og:image:secure_url" content="${safeThumb}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeThumb}" />
    <meta itemprop="name" content="${safeTitle}" />
    <meta itemprop="description" content="${safeDesc}" />
    <meta itemprop="image" content="${safeThumb}" />
    <link rel="image_src" href="${safeThumb}" />`;

    const startComment = '<!-- INJECT_META_TAGS -->';
    const endComment = '<!-- END_INJECT_META_TAGS -->';
    const startIndex = html.indexOf(startComment);
    const endIndex = html.indexOf(endComment);

    if (startIndex !== -1 && endIndex !== -1) {
      html = html.substring(0, startIndex) + metaTags + html.substring(endIndex + endComment.length);
    } else {
      html = html.replace('</head>', `${metaTags}\n  </head>`);
    }

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    console.error('Error injecting dynamic OG metadata:', err);
    return next();
  }
}
