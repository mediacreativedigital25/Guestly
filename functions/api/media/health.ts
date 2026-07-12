export async function onRequestGet(context: any) {
  return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
