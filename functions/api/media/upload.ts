export async function onRequestPost(context: any) {
  const { request, env } = context;
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
  const startTime = Date.now();
  
  let statusCode = 200;
  let errorCode: string | null = null;
  let category = 'attachment';
  let mimeType = 'unknown';
  let size = 0;
  
  const user = context.data?.user;
  if (!user) {
     return new Response(JSON.stringify({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const userId = user.uid || user.user_id || user.sub;
  const uploadedBy = userId;
  const tenantId = user.tenantId || user.partnerId || user.firebase?.tenant || 'default';

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const reqCategory = formData.get('category');
    
    // Validasi: Category sesuai enum, Tidak boleh menerima Null Byte, Script Injection dll
    const allowedCategories = ['attachment', 'avatar', 'logo', 'document', 'gallery', 'testimonial'];
    category = reqCategory && typeof reqCategory === 'string' ? reqCategory : 'attachment';
    if (!allowedCategories.includes(category)) {
      statusCode = 400;
      errorCode = 'INVALID_CATEGORY';
      throw new Error('Invalid category');
    }

    if (!file || typeof file === 'string' || !('stream' in file)) {
      statusCode = 400;
      errorCode = 'FILE_MISSING';
      throw new Error('File is missing');
    }

    // @ts-ignore
    size = file.size;
    // @ts-ignore
    mimeType = file.type;

    // TODO: Implement Rate Limiting Abstraction (e.g., 10 upload / menit / user)

    // Validasi Ukuran (Maks 5MB atau 10MB)
    const maxSize = category === 'document' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (size > maxSize) {
      statusCode = 413;
      errorCode = 'PAYLOAD_TOO_LARGE';
      throw new Error(`File size exceeds limit (${maxSize / (1024*1024)}MB)`);
    }

    // Mime Type Whitelist
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'video/mp4', 'video/webm',
      'application/pdf'
    ];
    if (!allowedMimeTypes.includes(mimeType)) {
      statusCode = 415;
      errorCode = 'UNSUPPORTED_MEDIA_TYPE';
      throw new Error('Invalid file type');
    }

    // Path traversal / Null Byte checks
    if (category.includes('..') || category.includes('/') || category.includes('\\') || category.includes('\0')) {
       statusCode = 400;
       errorCode = 'INVALID_CATEGORY_PATH';
       throw new Error('Invalid category path');
    }

    // Nama file wajib dibuat oleh server. Gunakan UUID. Jangan menggunakan nama asli file sebagai object key.
    const uniqueSuffix = crypto.randomUUID();
    // @ts-ignore
    const nameParts = file.name ? file.name.split('.') : [];
    const ext = nameParts.length > 1 ? '.' + nameParts.pop()?.toLowerCase() : '';
    
    // Protect against malicious extension parsing
    if (ext.includes('/') || ext.includes('\\') || ext.includes('\0')) {
       statusCode = 400;
       errorCode = 'INVALID_EXTENSION';
       throw new Error('Invalid file extension');
    }

    const fileName = `${category}/${uniqueSuffix}${ext}`;

    if (!env.R2_BUCKET) {
      statusCode = 500;
      errorCode = 'R2_CONFIG_MISSING';
      throw new Error("R2_BUCKET binding is missing");
    }

    // @ts-ignore
    await env.R2_BUCKET.put(fileName, file.stream(), {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        tenantId,
        userId,
        uploadedBy,
        category,
        // @ts-ignore
        originalName: file.name
      }
    });

    const cdnDomain = env.CDN_DOMAIN || env.R2_PUBLIC_URL || 'https://cdn.guestly.yulovi.com';
    const url = `${cdnDomain}/${fileName}`;

    const duration = Date.now() - startTime;

    context.waitUntil(
      Promise.resolve().then(() => {
        console.log(JSON.stringify({
          action: 'UPLOAD',
          requestId,
          userId,
          tenantId,
          category,
          mimeType,
          size,
          duration,
          success: true,
          errorCode: null
        }));
      })
    );

    return new Response(JSON.stringify({
      success: true,
      data: {
        url: url,
        key: fileName,
        sizeBytes: size
      }
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (statusCode === 200) statusCode = 500;
    if (!errorCode) errorCode = 'INTERNAL_ERROR';

    context.waitUntil(
      Promise.resolve().then(() => {
        console.error(JSON.stringify({
          action: 'UPLOAD',
          requestId,
          userId,
          tenantId,
          category,
          mimeType,
          size,
          duration,
          success: false,
          errorCode,
          errorMessage: error.message
        }));
      })
    );

    let finalStatus = statusCode;
    if (errorCode === 'FILE_MISSING' || errorCode === 'INVALID_CATEGORY' || errorCode === 'INVALID_EXTENSION' || errorCode === 'INVALID_CATEGORY_PATH') {
      finalStatus = 400;
    } else if (errorCode === 'PAYLOAD_TOO_LARGE') {
      finalStatus = 413;
    } else if (errorCode === 'UNSUPPORTED_MEDIA_TYPE') {
      finalStatus = 415;
    } else if (errorCode === 'INTERNAL_ERROR' || errorCode === 'R2_CONFIG_MISSING') {
      finalStatus = 500;
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: { message: error.message, code: errorCode } 
    }), { 
      status: finalStatus,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
