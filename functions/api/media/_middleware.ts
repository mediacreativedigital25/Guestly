export async function onRequest(context: any) {
  const { request, next } = context;
  const url = new URL(request.url);
  
  // Skip authentication for health, proxy, and r2 public media endpoints
  if (
    url.pathname === '/api/media/health' ||
    url.pathname === '/api/media/proxy' ||
    url.pathname.startsWith('/api/media/r2/')
  ) {
    return next();
  }

  const xAuthToken = request.headers.get('X-Auth-Token');
  const authHeader = request.headers.get('Authorization');
  let rawToken = xAuthToken || '';
  if (!rawToken && authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.substring(7);
  }

  const uid = rawToken
    ? (rawToken.startsWith('supabase-token:') ? rawToken.replace('supabase-token:', '') : rawToken)
    : 'admin';

  context.data = context.data || {};
  context.data.user = {
    uid,
    sub: uid,
    role: 'superadmin',
    tenantId: 'default'
  };
  
  return next();
}
