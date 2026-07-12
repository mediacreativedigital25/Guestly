export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key) {
      return new Response(JSON.stringify({ success: false, error: { message: 'Key is missing' } }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.R2_BUCKET) {
      throw new Error("R2_BUCKET binding is missing");
    }

    const object = await env.R2_BUCKET.head(key);

    if (!object) {
      return new Response(JSON.stringify({ success: false, error: { message: 'Not found' } }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        key: object.key,
        size: object.size,
        uploaded: object.uploaded,
        etag: object.httpEtag,
        httpMetadata: object.httpMetadata,
      }
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: { message: error.message } }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
