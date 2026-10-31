import type { Book, Spin, Track } from '../types';
import { SITE_URL, supabase } from './cloud';

/**
 * Last.fm scrobbling. The "lastfm" Supabase Edge Function holds the secret
 * and your session key; this side keeps a queue of tracks from your spins and
 * sends each one once it would have finished playing. The queue lives on the
 * device you spun on, so a spin is never sent twice from two devices.
 */

export interface QueuedScrobble {
  spinId: string;
  artist: string;
  track: string;
  album?: string;
  albumArtist?: string;
  /** When the track started, in seconds (Last.fm's way). */
  timestamp: number;
  duration?: number;
  /** Not before this time (ms): the track has to have played long enough. */
  due: number;
}

const QUEUE = 'stacks.lastfm.queue';
const ON = 'stacks.lastfm.on';
/** Last.fm takes scrobbles up to two weeks old. */
const MAX_AGE_MS = 13 * 86400_000;

class NotReady extends Error {}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('lastfm', { body: { action, ...extra } });
  if (error) {
    // The function's own message, when it sent one.
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx?.status === 404) throw new NotReady('Last.fm isn’t set up on the server yet (deploy the “lastfm” Edge Function).');
    if (ctx && typeof ctx.json === 'function') {
      try {
        msg = ((await ctx.json()) as { error?: string }).error ?? msg;
      } catch {
        /* no body */
      }
    }
    if (/Requested function was not found|Failed to send a request/i.test(msg)) throw new NotReady('Last.fm isn’t set up on the server yet (deploy the “lastfm” Edge Function).');
    throw new Error(msg);
  }
  return data as T;
}

export const lastfmStatus = () => call<{ apiKey: string; username: string | null }>('status');
export const unlinkLastfm = () => call<{ ok: boolean }>('unlink');
export const linkLastfm = (token: string) => call<{ username: string }>('link', { token });

/** Where to send you to allow Stacks on Last.fm. Last.fm comes back with ?token=… */
export const lastfmAuthUrl = (apiKey: string) => `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(apiKey)}&cb=${encodeURIComponent(SITE_URL)}`;

/** The token in the address after coming back from Last.fm, removed from the address. */
export function takeLastfmToken(): string | undefined {
  const u = new URL(location.href);
  const t = u.searchParams.get('token');
  if (!t) return undefined;
  u.searchParams.delete('token');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
  return t;
}

export function scrobblingOn(): boolean {
  try {
    return localStorage.getItem(ON) === '1';
  } catch {
    return false;
  }
}
export function setScrobblingOn(on: boolean) {
  try {
    if (on) localStorage.setItem(ON, '1');
    else localStorage.removeItem(ON);
  } catch {
    /* blocked */
  }
}

function readQueue(): QueuedScrobble[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) ?? '[]') as QueuedScrobble[];
  } catch {
    return [];
  }
}
function writeQueue(q: QueuedScrobble[]) {
  try {
    localStorage.setItem(QUEUE, JSON.stringify(q));
  } catch {
    /* full or blocked */
  }
}
export const pendingScrobbles = () => readQueue().length;

/** "4:12" or "1:02:03" → seconds. */
export function seconds(d?: string): number | undefined {
  if (!d) return undefined;
  const parts = d.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((s, n) => s * 60 + n, 0) || undefined;
}

/** A track counts once it played half its length, or 4 minutes. Tracks under 30 seconds never count. */
const playedEnough = (dur: number) => Math.min(dur / 2, 240);
const DEFAULT_TRACK = 240;
/** Turning the record over takes a moment. */
const FLIP = 20;

/** Every track of a spin, timed from when you put the record on. */
export function plan(spin: Spin, b: Book, tracks: Track[]): QueuedScrobble[] {
  let t = Date.parse(spin.at) / 1000;
  let side = '';
  const out: QueuedScrobble[] = [];
  for (const tr of tracks) {
    const s = (tr.position ?? '').match(/^[A-Za-z]+/)?.[0] ?? '';
    if (side && s && s !== side) t += FLIP;
    if (s) side = s;
    const dur = seconds(tr.duration);
    const len = dur ?? DEFAULT_TRACK;
    if (dur === undefined || dur >= 30)
      out.push({
        spinId: spin.id,
        artist: tr.artist || b.authors[0] || 'Unknown artist',
        track: tr.title,
        album: b.title,
        albumArtist: tr.artist && b.authors[0] && tr.artist !== b.authors[0] ? b.authors[0] : undefined,
        timestamp: Math.floor(t),
        duration: dur,
        due: (t + playedEnough(len)) * 1000,
      });
    t += len;
  }
  return out;
}

export function enqueue(items: QueuedScrobble[]) {
  if (items.length) writeQueue([...readQueue(), ...items]);
}

/** Undo a spin: its tracks that haven't gone out yet are dropped. */
export function dropSpin(spinId: string) {
  writeQueue(readQueue().filter((x) => x.spinId !== spinId));
}

/** The first track, for Last.fm's "now playing". */
export async function nowPlaying(item: QueuedScrobble) {
  await call('nowplaying', { track: item }).catch(() => undefined);
}

let flushing = false;
/** Send every track that has played long enough. Returns how many Last.fm took. */
export async function flush(now = Date.now()): Promise<{ sent: number; error?: string }> {
  if (flushing) return { sent: 0 };
  flushing = true;
  try {
    const q = readQueue().filter((x) => now - x.timestamp * 1000 < MAX_AGE_MS);
    const ready = q.filter((x) => x.due <= now);
    let sent = 0;
    for (let i = 0; i < ready.length; i += 50) {
      const batch = ready.slice(i, i + 50);
      await call('scrobble', { tracks: batch.map(({ spinId: _s, due: _d, ...t }) => t) });
      sent += batch.length;
      // Take them off the queue as soon as they're in, in case the next batch fails.
      const gone = new Set(batch);
      writeQueue(readQueue().filter((x) => ![...gone].some((g) => g.spinId === x.spinId && g.timestamp === x.timestamp && g.track === x.track)));
    }
    if (q.length !== readQueue().length && !ready.length) writeQueue(q);
    return { sent };
  } catch (e) {
    return { sent: 0, error: (e as Error).message };
  } finally {
    flushing = false;
  }
}
