export async function onRequestPost(context: any) {
  try {
    const { request, env } = context;
    const { target, message, url, token } = await request.json();

    const fonnteToken = token || env.FONNTE_TOKEN;
    if (!target || !message) {
      return new Response(JSON.stringify({ success: false, error: 'Target and message are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!fonnteToken) {
      return new Response(JSON.stringify({ success: false, error: 'Fonnte token is not configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = new URLSearchParams();
    body.append('target', target);
    body.append('message', message);
    body.append('countryCode', '62');
    if (url) {
      body.append('url', url);
    }

    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        "Authorization": fonnteToken,
      },
      body: body,
    });

    const result = await response.json();

    if (result.status) {
      return new Response(JSON.stringify({ success: true, result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: result.reason || 'Fonnte API error' }), {
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
