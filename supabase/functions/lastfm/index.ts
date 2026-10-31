// Stacks ↔ Last.fm. Keeps the Last.fm shared secret and everyone's session
// key on the server; the app only asks this function to link, unlink, and
// scrobble. Needs the secrets LASTFM_API_KEY and LASTFM_SECRET.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { crypto } from 'jsr:@std/crypto@1';
import { encodeHex } from 'jsr:@std/encoding@1/hex';

const API = Deno.env.get('LASTFM_API_URL') ?? 'https://ws.audioscrobbler.com/2.0/';
const KEY = Deno.env.get('LASTFM_API_KEY') ?? '';
const SECRET = Deno.env.get('LASTFM_SECRET') ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function md5(s: string) {
  return encodeHex(await crypto.subtle.digest('MD5', new TextEncoder().encode(s)));
}

/** A signed call to Last.fm, as their API asks: params sorted by name, then the secret. */
async function lastfm(params: Record<string, string>, post = false) {
  const p: Record<string, string> = { ...params, api_key: KEY };
  const sig = await md5(Object.keys(p).sort().map((k) => k + p[k]).join('') + SECRET);
  const body = new URLSearchParams({ ...p, api_sig: sig, format: 'json' });
  const res = post ? await fetch(API, { method: 'POST', body }) : await fetch(`${API}?${body}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm: ${data.message ?? data.error}`);
  return data;
}

interface Scrobble {
  artist: string;
  track: string;
  album?: string;
  albumArtist?: string;
  timestamp: number;
  duration?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!KEY || !SECRET) return reply({ error: 'Last.fm isn’t set up yet: add LASTFM_API_KEY and LASTFM_SECRET under Edge Functions → Secrets.' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(jwt);
  const uid = who.user?.id;
  if (!uid) return reply({ error: 'Sign in to Stacks first.' }, 401);

  try {
    const body = await req.json();
    switch (body.action) {
      case 'status': {
        const { data } = await admin.from('lastfm_links').select('username').eq('user_id', uid).maybeSingle();
        return reply({ apiKey: KEY, username: data?.username ?? null });
      }
      case 'link': {
        // The token Last.fm put in the address after you allowed Stacks.
        const s = await lastfm({ method: 'auth.getSession', token: String(body.token ?? '') });
        const { error } = await admin
          .from('lastfm_links')
          .upsert({ user_id: uid, session_key: s.session.key, username: s.session.name, linked_at: new Date().toISOString() });
        if (error) throw error;
        return reply({ username: s.session.name });
      }
      case 'unlink': {
        await admin.from('lastfm_links').delete().eq('user_id', uid);
        return reply({ ok: true });
      }
      case 'scrobble': {
        const { data } = await admin.from('lastfm_links').select('session_key').eq('user_id', uid).maybeSingle();
        if (!data) return reply({ error: 'Connect Last.fm first.', unlinked: true }, 400);
        const list: Scrobble[] = (body.tracks ?? []).slice(0, 50);
        if (!list.length) return reply({ accepted: 0, ignored: 0 });
        const p: Record<string, string> = { method: 'track.scrobble', sk: data.session_key };
        list.forEach((t, i) => {
          p[`artist[${i}]`] = t.artist;
          p[`track[${i}]`] = t.track;
          p[`timestamp[${i}]`] = String(Math.floor(t.timestamp));
          if (t.album) p[`album[${i}]`] = t.album;
          if (t.albumArtist) p[`albumArtist[${i}]`] = t.albumArtist;
          if (t.duration) p[`duration[${i}]`] = String(Math.round(t.duration));
        });
        const r = await lastfm(p, true);
        const attr = r.scrobbles?.['@attr'] ?? {};
        return reply({ accepted: Number(attr.accepted ?? 0), ignored: Number(attr.ignored ?? 0) });
      }
      case 'nowplaying': {
        const { data } = await admin.from('lastfm_links').select('session_key').eq('user_id', uid).maybeSingle();
        if (!data) return reply({ ok: false });
        const t = body.track as Scrobble;
        await lastfm(
          { method: 'track.updateNowPlaying', sk: data.session_key, artist: t.artist, track: t.track, ...(t.album ? { album: t.album } : {}), ...(t.duration ? { duration: String(Math.round(t.duration)) } : {}) },
          true,
        );
        return reply({ ok: true });
      }
      default:
        return reply({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return reply({ error: (e as Error).message }, 502);
  }
});
