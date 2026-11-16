// Stacks ↔ Discogs. Holds one Discogs token for the whole site (secret
// DISCOGS_TOKEN) so everyone gets barcode search, pressings and suggested
// prices without their own token. Only read-only catalogue and marketplace
// lookups pass through (no collections, wantlists or account calls), so the
// token can't be used to see or change the token owner's account.
const TOKEN = Deno.env.get('DISCOGS_TOKEN') ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** The only Discogs paths the app may ask for. */
const ALLOWED = [/^\/database\/search$/, /^\/releases\/\d+$/, /^\/marketplace\/stats\/\d+$/, /^\/marketplace\/price_suggestions\/\d+$/];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  let body: { path?: unknown; ping?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return reply({ error: 'bad request' }, 400);
  }
  if (body.ping) return reply({ ready: !!TOKEN });
  if (!TOKEN) return reply({ error: 'no site token' }, 503);
  const path = String(body.path ?? '');
  let url: URL;
  try {
    url = new URL(path, 'https://api.discogs.com');
  } catch {
    return reply({ error: 'bad path' }, 400);
  }
  if (url.origin !== 'https://api.discogs.com' || !ALLOWED.some((re) => re.test(url.pathname))) return reply({ error: 'not allowed' }, 403);
  url.searchParams.set('token', TOKEN);
  const res = await fetch(url, { headers: { 'User-Agent': 'Stacks/1.0 +https://paytonaliyah01.github.io/stacks/' } });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or not JSON */
  }
  // Discogs' own status goes in the body, so the app can tell "not on Discogs" from "function missing".
  return reply({ status: res.status, data });
});
