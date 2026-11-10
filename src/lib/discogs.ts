import type { Book, ItemKind } from '../types';
import { kindOf } from '../types';
import { parseCsv } from './importHistory';
import { getDiscogsToken, vinylSizeOf } from './lookup';
import { newId } from './storage';

/** One release from a Discogs collection, whichever way it came in. */
export interface DiscogsItem {
  releaseId?: number;
  artists: string[];
  title: string;
  label?: string;
  catalogNumber?: string;
  vinylColor?: string;
  edition?: string;
  /** Discogs' format text, e.g. "2xLP, Album, RE" or "Vinyl LP Album". */
  format: string;
  year?: string;
  dateAdded?: string;
  mediaCondition?: string;
  sleeveCondition?: string;
  notes?: string;
  coverUrl?: string;
  genres: string[];
}

/** "Prince (2)" → "Prince", "Sade*" → "Sade". */
const cleanArtist = (a: string) => a.replace(/\s*\(\d+\)$/, '').replace(/\*$/, '').trim();

/** Vinyl, CD, or something Stacks doesn't keep (cassettes, files, DVDs). */
export function kindOfFormat(format: string): Exclude<ItemKind, 'book'> | undefined {
  // "2xLP" and "3xCD" have no word break before the format, so look for a non-letter instead.
  const has = (w: string) => new RegExp(String.raw`(?:(?<![a-z])|(?<=\dx))(?:${w})(?![a-z])`).test(format.toLowerCase());
  const vinyl = has('lp|vinyl|ep|single|acetate|lathe') || /\d+"/.test(format);
  const cd = has('cd|cdr|sacd|hdcd');
  if (cd && !vinyl) return 'cd';
  return vinyl ? 'vinyl' : undefined;
}

/** "2xLP" → 2, "3xCD, Box Set" → 3. */
const discCountOf = (format: string) => {
  const m = /(\d+)\s*x\s*(lp|cd|vinyl|\d+")/i.exec(format);
  return m ? Number(m[1]) : undefined;
};

const yearOf = (s?: string | number) => {
  const y = /\d{4}/.exec(String(s ?? ''))?.[0];
  return y && y !== '0000' ? y : undefined;
};

/** Discogs' "Export collection" .csv file. */
export function parseDiscogsCsv(text: string): DiscogsItem[] {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const head = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iArtist = col('artist');
  const iTitle = col('title');
  const iFormat = col('format');
  if (iArtist < 0 || iTitle < 0 || iFormat < 0 || col('release_id') < 0) {
    throw new Error("That doesn't look like a Discogs collection export. In Discogs, open your Collection and choose Export.");
  }
  const at = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() || undefined : undefined);
  const iCat = col('catalog#', 'catalog #', 'catno');
  const iLabel = col('label');
  const iRel = col('released');
  const iId = col('release_id');
  const iAdded = col('date added');
  const iMedia = col('collection media condition');
  const iSleeve = col('collection sleeve condition');
  const iNotes = col('collection notes');
  return rows
    .slice(1)
    .filter((r) => at(r, iTitle))
    .map((r) => ({
      releaseId: Number(at(r, iId)) || undefined,
      artists: [cleanArtist(at(r, iArtist) ?? '')].filter((a) => a && a !== 'Various'),
      title: at(r, iTitle)!,
      label: at(r, iLabel)?.split(',')[0].replace(/\s*\(\d+\)$/, ''),
      catalogNumber: at(r, iCat) && at(r, iCat) !== 'none' ? at(r, iCat) : undefined,
      format: at(r, iFormat) ?? '',
      year: yearOf(at(r, iRel)),
      dateAdded: at(r, iAdded),
      mediaCondition: at(r, iMedia),
      sleeveCondition: at(r, iSleeve),
      notes: at(r, iNotes),
      genres: [],
    }));
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A public Discogs collection, page by page. */
/** A public Discogs collection or wantlist, page by page. */
export async function fetchDiscogsCollection(username: string, onProgress?: (got: number, total: number) => void, list: 'collection' | 'wants' = 'collection'): Promise<DiscogsItem[]> {
  const user = username.trim().replace(/^https?:\/\/(www\.)?discogs\.com\/(user\/)?/i, '').replace(/\/.*$/, '');
  if (!user) throw new Error('Type your Discogs username.');
  const token = getDiscogsToken();
  const items: DiscogsItem[] = [];
  for (let page = 1; ; page++) {
    const path = list === 'wants' ? 'wants' : 'collection/folders/0/releases';
    const auth = token ? `&token=${encodeURIComponent(token)}` : '';
    const url = `https://api.discogs.com/users/${encodeURIComponent(user)}/${path}?per_page=100&page=${page}&sort=added&sort_order=desc${auth}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new Error("Couldn't reach Discogs. Check your internet connection, or use the CSV file instead.");
    }
    if (res.status === 404) throw new Error(`Discogs has no user called “${user}”.`);
    if (res.status === 401 || res.status === 403)
      throw new Error(`That ${list === 'wants' ? 'wantlist' : 'collection'} is private. Make it public in Discogs (Settings → Privacy), add your Discogs token under Backup → Lookup keys, or use the CSV file instead.`);
    if (res.status === 429) {
      await pause(5000);
      page--;
      continue;
    }
    if (!res.ok) throw new Error(`Discogs answered with an error (${res.status}). Try again in a minute, or use the CSV file.`);
    const data = (await res.json()) as any;
    for (const r of (list === 'wants' ? data.wants : data.releases) ?? []) {
      const b = r.basic_information ?? {};
      const formats: any[] = b.formats ?? [];
      const note = (id: number) => {
        if (Array.isArray(r.notes)) return r.notes.find((n: any) => n.field_id === id)?.value || undefined;
        return (id === 3 && r.notes) || undefined;
      };
      items.push({
        releaseId: b.id ?? r.id,
        artists: (b.artists ?? []).map((a: any) => cleanArtist(a.name)).filter((a: string) => a && a !== 'Various').slice(0, 3),
        title: b.title ?? '',
        label: b.labels?.[0]?.name?.replace(/\s*\(\d+\)$/, ''),
        catalogNumber: b.labels?.[0]?.catno && b.labels[0].catno !== 'none' ? b.labels[0].catno : undefined,
        format: formats.map((f) => [f.qty > 1 ? `${f.qty}x${f.name}` : f.name, ...(f.descriptions ?? [])].join(' ')).join(', '),
        year: yearOf(b.year),
        dateAdded: r.date_added,
        mediaCondition: note(1),
        sleeveCondition: note(2),
        notes: note(3),
        coverUrl: b.cover_image && !/spacer\.gif/.test(b.cover_image) ? b.cover_image : undefined,
        vinylColor: formats.some((f) => /vinyl/i.test(f.name)) ? formats.map((f) => f.text).filter(Boolean).join(', ') || undefined : undefined,
        edition: formats.flatMap((f) => f.descriptions ?? []).filter((d: string) => !/^(lp|album|ep|single|compilation|reissue|repress|remastered|stereo|mono|12"|10"|7"|33 ⅓ rpm|45 rpm|gatefold)$/i.test(d)).join(', ') || undefined,
        genres: [...(b.genres ?? []), ...(b.styles ?? [])],
      });
    }
    const pages = data.pagination?.pages ?? 1;
    onProgress?.(items.length, data.pagination?.items ?? items.length);
    if (page >= pages) break;
    // Discogs allows about one request a second without a token.
    await pause(token ? 1100 : 2600);
  }
  return items;
}

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const key = (artist: string | undefined, title: string, kind: string) => `${norm(artist ?? '')}|${norm(title)}|${kind}`;

export interface DiscogsPlan {
  newBooks: Book[];
  /** Records you already had in Stacks, now linked to their Discogs release. */
  updated: Book[];
  /** Already in Stacks and already linked: nothing to do. */
  unchanged: number;
  /** Cassettes, files and other formats Stacks doesn't keep. */
  skipped: { title: string; format: string }[];
  /** Wantlist only: records you already own, so they stay off the wantlist. */
  alreadyOwned: Book[];
}

/** wanted: the items are a wantlist, so new ones go on your wantlist instead of into your collection. */
export function planDiscogsImport(items: DiscogsItem[], existing: Book[], wanted = false): DiscogsPlan {
  const byRelease = new Map(existing.filter((b) => b.discogsId).map((b) => [b.discogsId!, b]));
  const byKey = new Map(existing.map((b) => [key(b.authors[0], b.title, kindOf(b)), b]));
  const plan: DiscogsPlan = { newBooks: [], updated: [], unchanged: 0, skipped: [], alreadyOwned: [] };
  const now = new Date().toISOString();
  for (const it of items) {
    const kind = kindOfFormat(it.format);
    if (!kind) {
      plan.skipped.push({ title: it.title, format: it.format });
      continue;
    }
    const k = key(it.artists[0], it.title, kind);
    const match = (it.releaseId && byRelease.get(it.releaseId)) || byKey.get(k);
    if (match && wanted) {
      if (match.owned !== false) plan.alreadyOwned.push(match);
      else if (!match.wishlist || (it.releaseId && !match.discogsId)) plan.updated.push({ ...match, wishlist: true, discogsId: match.discogsId ?? it.releaseId, coverUrl: match.coverUrl ?? it.coverUrl, updatedAt: now });
      else plan.unchanged++;
      continue;
    }
    if (match?.owned === false) {
      // On your wantlist (or read-only) in Stacks, but in your Discogs collection: you have it now.
      plan.updated.push({ ...match, owned: undefined, wishlist: undefined, discogsId: match.discogsId ?? it.releaseId, coverUrl: match.coverUrl ?? it.coverUrl, catalogNumber: match.catalogNumber ?? it.catalogNumber, mediaCondition: it.mediaCondition, sleeveCondition: it.sleeveCondition, updatedAt: now });
      continue;
    }
    if (match) {
      if (match.discogsId === it.releaseId || !it.releaseId) {
        plan.unchanged++;
        continue;
      }
      const up: Book = {
        ...match,
        discogsId: it.releaseId,
        catalogNumber: match.catalogNumber ?? it.catalogNumber,
        mediaCondition: match.mediaCondition ?? it.mediaCondition,
        sleeveCondition: match.sleeveCondition ?? it.sleeveCondition,
        coverUrl: match.coverUrl ?? it.coverUrl,
        updatedAt: now,
      };
      plan.updated.push(up);
      byRelease.set(it.releaseId, up);
      continue;
    }
    // Two copies of the same release in Discogs are one item with two copies here.
    const dupe = plan.newBooks.find((b) => (it.releaseId && b.discogsId === it.releaseId) || (!it.releaseId && key(b.authors[0], b.title, kindOf(b)) === k));
    if (dupe) {
      dupe.copies++;
      continue;
    }
    const added = it.dateAdded && !Number.isNaN(Date.parse(it.dateAdded.replace(' ', 'T'))) ? new Date(it.dateAdded.replace(' ', 'T')).toISOString() : now;
    plan.newBooks.push({
      id: newId(),
      kind,
      title: it.title,
      authors: it.artists.length ? it.artists : ['Various artists'],
      publisher: it.label,
      publishedDate: it.year,
      subjects: it.genres.slice(0, 8),
      coverUrl: it.coverUrl,
      sources: ['discogs'],
      discogsId: it.releaseId,
      catalogNumber: it.catalogNumber,
      vinylColor: it.vinylColor,
      edition: it.edition,
      mediaCondition: wanted ? undefined : it.mediaCondition,
      sleeveCondition: wanted ? undefined : it.sleeveCondition,
      notes: it.notes,
      ...(wanted ? { owned: false, wishlist: true } : {}),
      vinylSize: kind === 'vinyl' ? vinylSizeOf(it.format) : undefined,
      discCount: discCountOf(it.format),
      format: 'other',
      copies: 1,
      tags: [],
      addedAt: added,
      updatedAt: now,
    });
  }
  return plan;
}
