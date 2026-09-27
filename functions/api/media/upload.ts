async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function putObjectViaR2S3Api(params: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  key: string;
  body: ArrayBuffer;
  contentType: string;
}) {
  const { accountId, accessKeyId, secretAccessKey, bucketName, key, body, contentType } = params;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(body);
  const canonicalUri = `/${bucketName}/${key}`;
  const canonicalQueryString = '';
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signatureBuffer = await hmacSha256(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorizationHeader
    },
    body
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`R2 S3 PUT failed (${response.status}): ${errText || response.statusText}`);
  }
}

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
    const allowedCategories = [
      'attachment',
      'avatar',
      'logo',
      'banner',
      'thumbnail',
      'favicon',
      'library',
      'frame',
      'document',
      'gallery',
      'testimonial',
      'branding',
      'general',
      'E-Invitation',
    ];
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
    mimeType = file.type || 'image/jpeg';

    // Validasi Ukuran (Maks 15MB)
    const maxSize = 15 * 1024 * 1024;
    if (size > maxSize) {
      statusCode = 413;
      errorCode = 'PAYLOAD_TOO_LARGE';
      throw new Error(`File size exceeds limit (${maxSize / (1024*1024)}MB)`);
    }

    // Mime Type Whitelist
    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'video/mp4', 'video/webm',
      'application/pdf'
    ];
    if (!allowedMimeTypes.includes(mimeType) && !mimeType.startsWith('image/')) {
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

    if (env.R2_BUCKET) {
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
    } else {
      const accountId = env.R2_ACCOUNT_ID || 'c6361627ef5eeb873424c706ca72c0e2';
      const accessKeyId = env.R2_ACCESS_KEY_ID || 'e3610ce08924866d3bd8611dcdba6cdf';
      const secretAccessKey = env.R2_SECRET_ACCESS_KEY || 'ec8dcd365af55a3f08006e72d5f3eb06dd7582ffbb22ec7943f6e15cec55bb64';
      const bucketName = env.R2_BUCKET_NAME || 'guestly-storage';
      // @ts-ignore
      const arrayBuffer = await file.arrayBuffer();
      await putObjectViaR2S3Api({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucketName,
        key: fileName,
        body: arrayBuffer,
        contentType: mimeType
      });
    }

    const cdnDomain = (env.CDN_DOMAIN || env.R2_PUBLIC_URL || 'https://cdn.guestly.yulovi.com').replace(/\/+$/, '');
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
