import { createClient, type Session } from '@supabase/supabase-js';
import { SYNC_STORES, onLocalChange, rawStore, type SyncStore } from './storage';
import { loadStyluses, saveStyluses } from './stylus';

/**
 * Accounts and sync. Your library still lives in this browser first, so Stacks
 * works offline; when you're signed in, every change is also sent to your
 * account, and changes from your other devices come back.
 *
 * Supabase table `items`: one row per book, bookcase, reading, etc.
 * (user_id, store, id, data, deleted, updated_at). Row level security means
 * each person only ever sees their own rows.
 */
const SUPABASE_URL = 'https://axctweotsncvgypaappd.supabase.co';
// The publishable key is meant to be public; the table's security rules do the protecting.
const SUPABASE_KEY = 'sb_publishable_szTGXlMOFqlwFaLA_BHUpA_rrkGzRoE';
export const SITE_URL = 'https://paytonaliyah01.github.io/stacks/';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'stacks.auth' },
});

/** Settings kept in localStorage that also sync, as rows in a 'prefs' store. */
type Store = SyncStore | 'prefs';
const PREFS: Record<string, { load: () => unknown; save: (v: never) => void }> = {
  styluses: { load: loadStyluses, save: saveStyluses },
};

const DIRTY_KEY = 'stacks.sync.dirty';
const OWNER_KEY = 'stacks.sync.owner';
const sinceKey = (uid: string) => `stacks.sync.since.${uid}`;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
};

/** "store|id" of everything changed here that the account hasn't got yet. */
function loadDirty(): Set<string> {
  try {
    return new Set(JSON.parse(read(DIRTY_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
let dirty = loadDirty();
const saveDirty = () => write(DIRTY_KEY, JSON.stringify([...dirty]));
/** Bumped on every change, so a change made while sending isn't forgotten. */
const gen = new Map<string, number>();

export type SyncState =
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: string }
  | { kind: 'offline'; pending: number }
  | { kind: 'error'; message: string; pending: number };

let state: SyncState = { kind: 'off' };
let session: Session | null = null;
const listeners = new Set<(s: SyncState) => void>();
let onRemoteChange: (() => void) | undefined;
let timer: number | undefined;
let running: Promise<void> | undefined;
let again = false;

function setState(s: SyncState) {
  state = s;
  listeners.forEach((fn) => fn(s));
}
export const syncState = () => state;
export function watchSync(fn: (s: SyncState) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const pendingCount = () => dirty.size;

/** Called after changes from your other devices were saved here, so the screens reload. */
export function onRemote(fn: () => void) {
  onRemoteChange = fn;
}

function markDirty(store: Store, ids: string[]) {
  for (const id of ids) {
    const k = `${store}|${id}`;
    dirty.add(k);
    gen.set(k, (gen.get(k) ?? 0) + 1);
  }
  saveDirty();
  if (session) schedule(1500);
}
onLocalChange((store, ids) => markDirty(store, ids));
export const prefChanged = (name: keyof typeof PREFS) => markDirty('prefs', [name]);

function schedule(ms: number) {
  clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), ms);
}

async function push(uid: string) {
  const keys = [...dirty];
  if (!keys.length) return;
  const sentGen = new Map(keys.map((k) => [k, gen.get(k) ?? 0]));
  const rows = [];
  for (const key of keys) {
    const [store, ...rest] = key.split('|');
    const id = rest.join('|');
    if (store === 'prefs') {
      const p = PREFS[id];
      if (p) rows.push({ user_id: uid, store, id, data: { value: p.load() }, deleted: false });
      continue;
    }
    const item = await rawStore.rawGet(store as SyncStore, id);
    rows.push({ user_id: uid, store, id, data: item ?? null, deleted: !item });
  }
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await supabase.from('items').upsert(rows.slice(i, i + 400), { onConflict: 'user_id,store,id' });
    if (error) throw error;
  }
  // Only forget what was sent; anything changed while sending goes next time.
  for (const k of keys) if ((gen.get(k) ?? 0) === sentGen.get(k)) dirty.delete(k);
  saveDirty();
}

async function pull(uid: string): Promise<boolean> {
  const since = read(sinceKey(uid));
  // A little overlap, in case two saves landed at nearly the same moment.
  const from = since ? new Date(Date.parse(since) - 10_000).toISOString() : '1970-01-01T00:00:00Z';
  let newest = since ?? '';
  let any = false;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('items')
      .select('store,id,data,deleted,updated_at')
      .gt('updated_at', from)
      .order('updated_at', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    const rows = data ?? [];
    const byStore = new Map<Store, { puts: { id: string }[]; deletes: string[] }>();
    for (const r of rows) {
      if (r.updated_at > newest) newest = r.updated_at;
      if (dirty.has(`${r.store}|${r.id}`)) continue; // your newer change here wins
      if (r.store === 'prefs') {
        const p = PREFS[r.id];
        if (p && !r.deleted) {
          const cur = JSON.stringify(p.load());
          const next = (r.data as { value: unknown })?.value;
          if (JSON.stringify(next) !== cur) {
            p.save(next as never);
            any = true;
          }
        }
        continue;
      }
      if (!(SYNC_STORES as readonly string[]).includes(r.store)) continue;
      const g = byStore.get(r.store) ?? { puts: [], deletes: [] };
      if (r.deleted || !r.data) g.deletes.push(r.id);
      else g.puts.push(r.data);
      byStore.set(r.store, g);
    }
    for (const [name, g] of byStore) {
      await rawStore.rawApply(name as SyncStore, g.puts, g.deletes);
      any = true;
    }
    if (rows.length < 1000) break;
  }
  if (newest) write(sinceKey(uid), newest);
  return any;
}

/** Sends your changes and fetches everyone else's. Safe to call any time. */
export function syncNow(): Promise<void> {
  if (!session) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  const uid = session.user.id;
  setState({ kind: 'syncing' });
  running = (async () => {
    try {
      do {
        again = false;
        await push(uid);
        if (await pull(uid)) onRemoteChange?.();
      } while (again);
      setState({ kind: 'synced', at: new Date().toISOString() });
    } catch (e) {
      const offline = !navigator.onLine || e instanceof TypeError || /fetch|network/i.test(String((e as Error)?.message));
      setState(offline ? { kind: 'offline', pending: dirty.size } : { kind: 'error', message: (e as Error)?.message ?? String(e), pending: dirty.size });
    } finally {
      running = undefined;
    }
  })();
  return running;
}

/** Everything already on this device goes to the account the first time it's linked. */
async function adoptLocal() {
  for (const name of SYNC_STORES) {
    const all = await rawStore.rawAll(name);
    all.forEach((x) => dirty.add(`${name}|${x.id}`));
  }
  Object.keys(PREFS).forEach((k) => dirty.add(`prefs|${k}`));
  saveDirty();
}

async function clearLocal() {
  await rawStore.rawClearAll();
  dirty = new Set();
  saveDirty();
  Object.values(PREFS).forEach((p) => p.save([] as never));
}

async function started(s: Session) {
  session = s;
  const owner = read(OWNER_KEY);
  if (owner !== s.user.id) {
    // Someone else's library was on this device and they signed out without
    // clearing it; never mix two people's books.
    if (owner) await clearLocal();
    else await adoptLocal();
    write(OWNER_KEY, s.user.id);
    write(sinceKey(s.user.id), null);
  }
  await syncNow();
}

let booted = false;
/** Starts sync if someone's signed in, and follows sign-ins and sign-outs. */
export function startSync() {
  if (booted) return;
  booted = true;
  supabase.auth.onAuthStateChange((event, s) => {
    if (s && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      if (!session || session.user.id !== s.user.id) void started(s);
      else session = s;
    } else if (s && event === 'TOKEN_REFRESHED') session = s;
    else if (!s) {
      session = null;
      setState({ kind: 'off' });
    }
  });
  window.addEventListener('focus', () => session && schedule(300));
  window.addEventListener('online', () => session && schedule(300));
  window.setInterval(() => session && !document.hidden && void syncNow(), 60_000);
}

/** Sends anything not yet sent, signs out, and empties this device so the next person starts clean. */
export async function signOut(keepCopy: boolean) {
  await syncNow().catch(() => undefined);
  if (!keepCopy && dirty.size) throw new Error(`${dirty.size} change${dirty.size === 1 ? " hasn't" : "s haven't"} reached your account yet. Connect to the internet and try again, so nothing is lost.`);
  await supabase.auth.signOut();
  session = null;
  if (!keepCopy) {
    await clearLocal();
    write(OWNER_KEY, null);
  }
  setState({ kind: 'off' });
}
