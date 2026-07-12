export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const category = formData.get('category') || 'attachment';

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ success: false, error: { message: 'File is missing' } }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      return new Response(JSON.stringify({ success: false, error: { message: 'File size exceeds limit (5MB)' } }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!file.type.startsWith('image/') && !file.type.startsWith('audio/') && !file.type.startsWith('video/') && !file.type.startsWith('application/pdf')) {
      return new Response(JSON.stringify({ success: false, error: { message: 'Invalid file type' } }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const nameParts = file.name.split('.');
    const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
    const fieldname = file.name.replace(ext, '').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `${category}/${fieldname}-${uniqueSuffix}${ext}`;

    if (!env.R2_BUCKET) {
      throw new Error("R2_BUCKET binding is missing");
    }

    await env.R2_BUCKET.put(fileName, file.stream(), {
      httpMetadata: { contentType: file.type }
    });

    const cdnDomain = env.R2_PUBLIC_URL || 'https://cdn.guestly.yulovi.com';
    const url = `${cdnDomain}/${fileName}`;

    return new Response(JSON.stringify({
      success: true,
      data: {
        url: url,
        key: fileName,
        sizeBytes: file.size
      }
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: { message: error.message } }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
