import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export async function onRequest(context: any) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  
  // Skip authentication for health endpoint
  if (url.pathname === '/api/media/health') {
    return next();
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const token = authHeader.substring(7);
  try {
    const projectId = env.FIREBASE_PROJECT_ID || 'ai-studio-070ca58a-03bd-401d-816a-71b36c0bffd9';
    
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    
    // Pass user info to subsequent handlers
    context.data = context.data || {};
    context.data.user = payload;
    
    return next();
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: { message: 'Unauthorized - Invalid Token', code: 'UNAUTHORIZED' } }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
