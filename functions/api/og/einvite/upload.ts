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
    .map((b) => b.toString(16).padStart(2, '0'))
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
  const encodedKey = key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    )
    .join('/');
  const canonicalUri = `/${bucketName}/${encodedKey}`;
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signatureBuffer = await hmacSha256(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
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
      Authorization: authorizationHeader,
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`R2 S3 PUT failed (${response.status}): ${errText || response.statusText}`);
  }
}

function sanitizeSegment(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function onRequestPost(context: any) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const safeEventId = sanitizeSegment(String(formData.get('eventId') || ''));
    const safeTicketCode = sanitizeSegment(String(formData.get('ticketCode') || ''));

    if (!safeEventId || !safeTicketCode) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing eventId or ticketCode' }),
        { status: 400, headers }
      );
    }

    if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing card image file' }),
        { status: 400, headers }
      );
    }

    // @ts-ignore
    const arrayBuffer: ArrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empty image file' }),
        { status: 400, headers }
      );
    }
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ success: false, error: 'Image exceeds 5MB limit' }),
        { status: 413, headers }
      );
    }

    const contentType = 'image/jpeg';
    const key = `einvite-cards/${safeEventId}/${safeTicketCode}.jpg`;

    if (env?.R2_BUCKET) {
      await env.R2_BUCKET.put(key, arrayBuffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=3600',
        },
      });
    } else {
      const accountId = env?.R2_ACCOUNT_ID || 'c6361627ef5eeb873424c706ca72c0e2';
      const accessKeyId = env?.R2_ACCESS_KEY_ID || 'e3610ce08924866d3bd8611dcdba6cdf';
      const secretAccessKey =
        env?.R2_SECRET_ACCESS_KEY || 'ec8dcd365af55a3f08006e72d5f3eb06dd7582ffbb22ec7943f6e15cec55bb64';
      const bucketName = env?.R2_BUCKET_NAME || 'guestly-storage';

      await putObjectViaR2S3Api({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucketName,
        key,
        body: arrayBuffer,
        contentType,
      });
    }

    const cdnDomain = (env?.CDN_DOMAIN || env?.R2_PUBLIC_URL || 'https://cdn.guestly.yulovi.com').replace(
      /\/+$/,
      ''
    );
    const url = `${cdnDomain}/${key}`;

    return new Response(
      JSON.stringify({ success: true, key, url }),
      { status: 200, headers }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Failed to upload E-Invite card' }),
      { status: 500, headers }
    );
  }
}
