export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const key = body.key;

    if (!key) {
      return new Response(JSON.stringify({ success: false, error: { message: 'Key is missing' } }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.R2_BUCKET) {
      throw new Error("R2_BUCKET binding is missing");
    }

    await env.R2_BUCKET.delete(key);

    return new Response(JSON.stringify({ success: true }), { 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: { message: error.message } }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
