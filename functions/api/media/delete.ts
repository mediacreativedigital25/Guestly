export async function onRequestDelete(context: any) {
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
  const role = user.role || 'user'; // check if tenant admin

  try {
    const body = await request.json();
    const key = body.key;

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

    // Get object to check authorization
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

    // Authorization check
    // Pastikan hanya: uploader atau tenant admin yang dapat menghapus file.
    const isUploader = objectUploader === currentUserId;
    // Assuming role 'admin' or 'partner' is tenant admin
    const isTenantAdmin = objectTenant === currentTenantId && (role === 'admin' || role === 'partner' || user.isTenantAdmin === true);
    // If there is no customMetadata, fallback? Let's just deny it or allow if superadmin
    const isSuperAdmin = role === 'superadmin';

    if (!isUploader && !isTenantAdmin && !isSuperAdmin) {
       // If no metadata, deny unless superadmin
       if (!objectUploader && !objectTenant) {
           statusCode = 403;
           errorCode = 'FORBIDDEN';
           throw new Error('Forbidden: You do not have permission to delete this file.');
       } else {
           statusCode = 403;
           errorCode = 'FORBIDDEN';
           throw new Error('Forbidden: You do not have permission to delete this file.');
       }
    }

    await env.R2_BUCKET.delete(key);

    const duration = Date.now() - startTime;
    context.waitUntil(
      Promise.resolve().then(() => {
        console.log(JSON.stringify({
          action: 'DELETE',
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

    return new Response(JSON.stringify({ success: true }), { 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (statusCode === 200) statusCode = 500;
    if (!errorCode) errorCode = 'INTERNAL_ERROR';

    context.waitUntil(
      Promise.resolve().then(() => {
        console.error(JSON.stringify({
          action: 'DELETE',
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
