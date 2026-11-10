import type { Book, Spin } from '../types';
import { isMusic } from '../types';
import { jsonp } from './lookup';
import { agoLabel, daysSince, playsByRecord } from './spins';
import { cleanSubjects, recKey, type Rec, type Shelf } from './recommend';
import type { FeedEntry } from './feed';
import { countOf } from './labels';

/**
 * Music recommendations: records from your own crates to put on, new albums
 * by the artists you spin most, artists like them (from Deezer), and what
 * your friends are spinning.
 */

export interface MusicTaste {
  /** Artist name as you wrote it → how much you play them. */
  artists: Map<string, { name: string; weight: number; spins: number; owned: number }>;
  genres: Map<string, number>;
  /** Your most played records, most played first. */
  favorites: Book[];
}

export const artistKey = (a: string) => a.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
/** "Rumours (Remastered 2004) [Deluxe]" → "rumours". */
export const albumKey = (t: string) => t.toLowerCase().replace(/[([].*?[)\]]/g, '').replace(/[^a-z0-9]/g, '');

export function musicTasteOf(records: Book[], spins: Spin[]): MusicTaste {
  const plays = playsByRecord(spins);
  const artists: MusicTaste['artists'] = new Map();
  const genres = new Map<string, number>();
  for (const b of records) {
    if (!isMusic(b)) continue;
    const n = plays.get(b.id)?.count ?? 0;
    // Owning a record says a little; playing it says a lot.
    const w = (b.owned === false ? 0.2 : 0.5) + n;
    const a = b.authors[0];
    if (a && !/various/i.test(a)) {
      const k = artistKey(a);
      const cur = artists.get(k) ?? { name: a, weight: 0, spins: 0, owned: 0 };
      cur.weight += w;
      cur.spins += n;
      if (b.owned !== false) cur.owned++;
      artists.set(k, cur);
    }
    for (const g of cleanSubjects(b.subjects ?? [])) genres.set(g, (genres.get(g) ?? 0) + w);
  }
  const favorites = records
    .filter((b) => isMusic(b) && (plays.get(b.id)?.count ?? 0) > 0)
    .sort((a, b) => (plays.get(b.id)?.count ?? 0) - (plays.get(a.id)?.count ?? 0))
    .slice(0, 20);
  return { artists, genres, favorites };
}

/** Records you own to put on: long unplayed ones that sound like what you love. */
export function fromCrates(records: Book[], spins: Spin[], t: MusicTaste, hidden: Set<string>): Rec[] {
  const plays = playsByRecord(spins);
  const out: { rec: Rec; score: number }[] = [];
  for (const b of records) {
    if (!isMusic(b) || b.owned === false || b.loan || hidden.has(recKey(b.title, b.authors[0]))) continue;
    const p = plays.get(b.id);
    if (p?.last && daysSince(p.last) < 21) continue;
    const gs = cleanSubjects(b.subjects);
    let fit = 0;
    for (const g of gs) fit += t.genres.get(g) ?? 0;
    fit = gs.length ? fit / Math.sqrt(gs.length) : 0;
    const artist = t.artists.get(artistKey(b.authors[0] ?? ''));
    const artistPlays = artist ? artist.spins - (p?.count ?? 0) : 0;
    const dust = p?.last ? Math.min(3, daysSince(p.last) / 60) : 3;
    const score = dust * 2 + Math.log2(1 + fit) + Math.log2(1 + Math.max(0, artistPlays));
    // The favorite it has most in common with, for the reason.
    const like = t.favorites.find((f) => f.id !== b.id && cleanSubjects(f.subjects).filter((g) => gs.includes(g)).length >= 2);
    let when: string;
    if (p?.last) when = `Last spun ${agoLabel(p.last)}`;
    else if (daysSince(b.addedAt) > 30) when = 'Never played since you got it';
    else when = 'Not played yet';
    let reason = when;
    if (like) reason = `${when} · like ${like.title}`;
    else if (artistPlays > 2) reason = `${when} · you play ${b.authors[0]} a lot`;
    out.push({
      score,
      rec: {
        key: recKey(b.title, b.authors[0]),
        title: b.title,
        authors: b.authors,
        cover: b.coverUrl,
        bookId: b.id,
        reason,
      },
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 8).map((x) => x.rec);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function deezerArtist(name: string): Promise<{ id: number; name: string } | undefined> {
  const r = await jsonp(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5&output=jsonp`);
  const list: any[] = r?.data ?? [];
  const hit = list.find((a) => artistKey(a.name) === artistKey(name)) ?? list[0];
  return hit ? { id: hit.id, name: hit.name } : undefined;
}

export interface DzAlbum {
  title: string;
  cover?: string;
  date?: string;
  fans: number;
  link?: string;
  type: string;
}
export async function deezerAlbums(id: number): Promise<DzAlbum[]> {
  const r = await jsonp(`https://api.deezer.com/artist/${id}/albums?limit=100&output=jsonp`);
  return ((r?.data ?? []) as any[]).map((a) => ({
    title: a.title,
    cover: a.cover_medium ?? a.cover,
    date: a.release_date,
    fans: a.fans ?? 0,
    link: a.link,
    type: a.record_type,
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Live albums, deluxe repeats and the like aren't a new record to want.
export const NOT_NEW = /\blive\b|deluxe|remaster|anniversary|edition|greatest hits|best of|collection|karaoke|instrumental|acoustic version|mixtape|\bremix/i;

/** New albums by your top artists, and records by artists like them. Needs Deezer. */
export async function fromDeezer(records: Book[], t: MusicTaste, hidden: Set<string>): Promise<Shelf[]> {
  const have = new Set(records.map((b) => `${artistKey(b.authors[0] ?? '')}|${albumKey(b.title)}`));
  const haveArtists = new Set(records.map((b) => artistKey(b.authors[0] ?? '')));
  const seen = new Set<string>();
  const top = [...t.artists.values()].sort((a, b) => b.weight - a.weight).slice(0, 3);
  if (!top.length) return [];
  const ok = (artist: string, a: DzAlbum) => {
    const k = `${artistKey(artist)}|${albumKey(a.title)}`;
    if (have.has(k) || seen.has(k) || hidden.has(recKey(a.title, artist)) || NOT_NEW.test(a.title) || a.type !== 'album') return false;
    // "OK Computer OKNOTOK 1997 2017" is a reissue of the OK Computer you have.
    const ak = albumKey(a.title);
    if (records.some((b) => artistKey(b.authors[0] ?? '') === artistKey(artist) && albumKey(b.title).length > 3 && ak.startsWith(albumKey(b.title)))) return false;
    seen.add(k);
    return true;
  };
  const rec = (artist: string, a: DzAlbum, reason: string): Rec => ({
    key: recKey(a.title, artist),
    title: a.title,
    authors: [artist],
    cover: a.cover,
    year: a.date ? Number(a.date.slice(0, 4)) || undefined : undefined,
    link: a.link,
    reason,
  });

  const found = await Promise.allSettled(top.map((x) => deezerArtist(x.name)));
  if (found.every((f) => f.status === 'rejected')) throw new Error("Couldn't reach Deezer for new music. Check your connection and try again.");
  const ids = found.map((f, i) => (f.status === 'fulfilled' && f.value ? { ...f.value, mine: top[i] } : undefined));

  // 1. More by the artists you play most: newest albums you don't have.
  const more: Rec[] = [];
  const albums = await Promise.allSettled(ids.map((x) => (x ? deezerAlbums(x.id) : Promise.resolve([]))));
  albums.forEach((res, i) => {
    const x = ids[i];
    if (!x || res.status !== 'fulfilled') return;
    const why = x.mine.spins > 1 ? `You've spun ${x.mine.name} ${x.mine.spins} times` : `You have ${x.mine.owned === 1 ? 'a record' : countOf(x.mine.owned, 'record')} by ${x.mine.name}`;
    const recent = (d?: string) => !!d && Date.now() - Date.parse(d) < 365 * 86_400_000;
    const list = res.value.filter((a) => ok(x.mine.name, a)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    for (const a of list.slice(0, 3)) more.push(rec(x.mine.name, a, recent(a.date) ? `New from ${x.mine.name}` : why));
  });
  const shelves: Shelf[] = [];
  if (more.length) shelves.push({ id: 'music-artists', title: 'More from artists you spin', recs: more });

  // 2. Artists like your two favorites, each with their best-loved album.
  const likeShelves = await Promise.all(
    ids.slice(0, 2).map(async (x): Promise<Shelf | undefined> => {
        if (!x) return undefined;
        let related: { id: number; name: string }[] = [];
        try {
          const r = await jsonp(`https://api.deezer.com/artist/${x.id}/related?limit=10&output=jsonp`);
          related = ((r?.data ?? []) as { id: number; name: string }[]).filter((a) => !haveArtists.has(artistKey(a.name))).slice(0, 4);
        } catch {
          return undefined;
        }
        const picks = await Promise.allSettled(related.map((a) => deezerAlbums(a.id)));
        const recs: Rec[] = [];
        picks.forEach((res, i) => {
          if (res.status !== 'fulfilled') return;
          const best = res.value.filter((a) => ok(related[i].name, { ...a })).sort((a, b) => b.fans - a.fans)[0];
          if (best) recs.push(rec(related[i].name, best, `Fans of ${x.mine.name} love it`));
        });
        return recs.length ? { id: `music-like:${artistKey(x.mine.name)}`, title: `Because you spin ${x.mine.name}`, recs } : undefined;
    }),
  );
  shelves.push(...likeShelves.filter((x): x is Shelf => !!x));
  return shelves;
}

/** Records your friends put on that you don't have, most spun first. */
export function friendsSpinning(feed: FeedEntry[], records: Book[], uid: string, hidden: Set<string>): Rec[] {
  const have = new Set(records.map((b) => `${artistKey(b.authors[0] ?? '')}|${albumKey(b.title)}`));
  const out = new Map<string, Rec & { n: number; who: Set<string> }>();
  for (const e of feed) {
    if (e.user_id === uid || e.kind !== 'spin') continue;
    const it = e.items[0];
    if (!it || it.kind === 'book') continue;
    const key = recKey(it.title, it.by);
    if (have.has(`${artistKey(it.by ?? '')}|${albumKey(it.title)}`) || hidden.has(key)) continue;
    const who = e.display_name || `@${e.username}`;
    const cur = out.get(key) ?? { key, n: 0, who: new Set<string>(), title: it.title, authors: it.by ? [it.by] : [], cover: it.cover, reason: '' };
    cur.n++;
    cur.who.add(who);
    out.set(key, cur);
  }
  return [...out.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)
    .map(({ n, who, ...r }) => ({
      ...r,
      reason: who.size > 1 ? `${who.size} friends are spinning it` : `${[...who][0]} spun it${n > 1 ? ' ' : ''}${n > 1 ? countOf(n, 'time') : ''}`,
    }));
}

/** A short fingerprint of your music taste, so new favorites fetch fresh results. */
export const musicTasteId = (t: MusicTaste) =>
  [...t.artists.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((a) => a.name)
    .join('|');
