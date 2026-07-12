export async function onRequestGet(context: any) {
  const { request, env } = context;
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
  const startTime = Date.now();
  
  let statusCode = 200;
  let errorCode: string | null = null;
  let category = 'unknown';
  let mimeType = 'unknown';
  let size = 0;

  const user = context.data?.user;
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const currentUserId = user.uid || user.user_id || user.sub;
  const currentTenantId = user.tenantId || user.partnerId || user.firebase?.tenant || 'default';

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key || typeof key !== 'string') {
      statusCode = 400;
      errorCode = 'KEY_MISSING';
      throw new Error('Key is missing');
    }
    
    if (key.includes('../') || key.includes('..\\') || key.startsWith('/')) {
       statusCode = 400;
       errorCode = 'INVALID_KEY';
       throw new Error('Invalid key path');
    }

    if (!env.R2_BUCKET) {
      statusCode = 500;
      errorCode = 'R2_CONFIG_MISSING';
      throw new Error("R2_BUCKET binding is missing");
    }

    const object = await env.R2_BUCKET.head(key);
    if (!object) {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
      throw new Error('Not found');
    }

    category = object.customMetadata?.category || 'unknown';
    size = object.size;
    mimeType = object.httpMetadata?.contentType || 'unknown';

    const objectUploader = object.customMetadata?.uploadedBy;
    const objectTenant = object.customMetadata?.tenantId;

    const isUploader = objectUploader === currentUserId;
    const isSameTenant = objectTenant === currentTenantId;
    const isSuperAdmin = user.role === 'superadmin';

    if (!isUploader && !isSameTenant && !isSuperAdmin) {
       if (!objectUploader && !objectTenant) {
           statusCode = 403;
           errorCode = 'FORBIDDEN';
           throw new Error('Forbidden: You do not have permission to view this file metadata.');
       } else {
           statusCode = 403;
           errorCode = 'FORBIDDEN';
           throw new Error('Forbidden: You do not have permission to view this file metadata.');
       }
    }

    const duration = Date.now() - startTime;
    context.waitUntil(
      Promise.resolve().then(() => {
        console.log(JSON.stringify({
          action: 'INFO',
          requestId,
          userId: currentUserId,
          tenantId: currentTenantId,
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
        key: object.key,
        size: object.size,
        uploaded: object.uploaded,
        etag: object.httpEtag,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata
      }
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (statusCode === 200) statusCode = 500;
    if (!errorCode) errorCode = 'INTERNAL_ERROR';

    context.waitUntil(
      Promise.resolve().then(() => {
        console.error(JSON.stringify({
          action: 'INFO',
          requestId,
          userId: currentUserId,
          tenantId: currentTenantId,
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
    if (errorCode === 'KEY_MISSING' || errorCode === 'INVALID_KEY') finalStatus = 400;
    else if (errorCode === 'NOT_FOUND') finalStatus = 404;
    else if (errorCode === 'FORBIDDEN') finalStatus = 403;
    else if (errorCode === 'INTERNAL_ERROR' || errorCode === 'R2_CONFIG_MISSING') finalStatus = 500;

    return new Response(JSON.stringify({ 
      success: false, 
      error: { message: error.message, code: errorCode } 
    }), { 
      status: finalStatus,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
