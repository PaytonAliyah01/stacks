import type { Track } from '../types';
import type { BookMetadata } from '../types';

const TIMEOUT_MS = 8000;

export async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      // Keep the service's own explanation (Google's says exactly what's wrong with a key).
      let detail = '';
      try {
        detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? '';
      } catch {
        /* no body */
      }
      throw Object.assign(new Error(`HTTP ${res.status}`), { detail });
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const https = (u?: string) => u?.replace(/^http:/, 'https:');

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fromOpenLibrary(isbn13: string): Promise<Partial<BookMetadata> | null> {
  const data = (await getJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`,
  )) as Record<string, any>;
  const b = data[`ISBN:${isbn13}`];
  if (!b?.title) return null;
  return {
    title: b.title,
    subtitle: b.subtitle,
    authors: (b.authors ?? []).map((a: any) => a.name).filter(Boolean),
    publisher: b.publishers?.[0]?.name,
    publishedDate: b.publish_date,
    pageCount: b.number_of_pages,
    subjects: (b.subjects ?? []).slice(0, 12).map((s: any) => s.name),
    coverUrl: https(b.cover?.large ?? b.cover?.medium),
    openLibraryKey: b.key,
  };
}

// Second Open Library route: the edition record. Some books are missing from
// the /api/books index but still have an edition page.
async function fromOpenLibraryEdition(isbn13: string): Promise<Partial<BookMetadata> | null> {
  let e: any;
  try {
    e = await getJson(`https://openlibrary.org/isbn/${isbn13}.json`);
  } catch (err) {
    if (err instanceof Error && err.message === 'HTTP 404') return null;
    throw err;
  }
  if (!e?.title) return null;
  const authors: string[] = [];
  for (const a of (e.authors ?? []).slice(0, 4)) {
    try {
      const au = (await getJson(`https://openlibrary.org${a.key}.json`)) as any;
      if (au?.name) authors.push(au.name);
    } catch {
      /* author names are a nice-to-have */
    }
  }
  return {
    title: e.title,
    subtitle: e.subtitle,
    authors,
    publisher: e.publishers?.[0],
    publishedDate: e.publish_date,
    pageCount: e.number_of_pages,
    subjects: (e.subjects ?? []).slice(0, 12),
    coverUrl: e.covers?.[0] ? `https://covers.openlibrary.org/b/id/${e.covers[0]}-L.jpg` : undefined,
    openLibraryKey: e.key,
  };
}

const GOOGLE_KEY_PREF = 'stacks.googleBooksKey';

/** An optional free Google Books API key the person can add in Settings. */
export function getGoogleKey(): string {
  try {
    return localStorage.getItem(GOOGLE_KEY_PREF) ?? '';
  } catch {
    return '';
  }
}
export function setGoogleKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(GOOGLE_KEY_PREF, key.trim());
    else localStorage.removeItem(GOOGLE_KEY_PREF);
  } catch {
    /* preference only */
  }
}

const isServerError = (err: unknown) => err instanceof Error && (/^HTTP 5\d\d$/.test(err.message) || err.name === 'AbortError');

/**
 * Google Books often answers 503 ("try again") for a moment even when the key is fine,
 * so ask up to three times before giving up.
 */
async function getGoogle(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getJson(url);
    } catch (err) {
      if (attempt >= 2 || !isServerError(err)) throw err;
      await new Promise((r) => setTimeout(r, attempt ? 1800 : 700));
    }
  }
}

function googleUrl(q: string, extra = '') {
  const key = getGoogleKey();
  return `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}${extra}${key ? `&key=${encodeURIComponent(key)}` : ''}`;
}

function fromGoogleVolume(item: any): Partial<BookMetadata> | null {
  const v = item?.volumeInfo;
  if (!v?.title) return null;
  const thumb = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail;
  const ids: any[] = v.industryIdentifiers ?? [];
  return {
    title: v.title,
    subtitle: v.subtitle,
    authors: v.authors ?? [],
    publisher: v.publisher,
    publishedDate: v.publishedDate,
    pageCount: v.pageCount || undefined,
    language: v.language,
    description: v.description,
    subjects: v.categories ?? [],
    coverUrl: https(thumb)?.replace('&edge=curl', ''),
    googleBooksId: item.id,
    isbn13: ids.find((i) => i.type === 'ISBN_13')?.identifier,
    isbn10: ids.find((i) => i.type === 'ISBN_10')?.identifier,
  };
}

/**
 * Google's ISBN search misses some editions that a plain search finds, so try
 * a few ways: isbn:13, isbn:10, then the bare number.
 */
async function fromGoogleBooks(isbn13: string, isbn10?: string): Promise<Partial<BookMetadata> | null> {
  const queries = [`isbn:${isbn13}`, ...(isbn10 ? [`isbn:${isbn10}`] : []), isbn13];
  for (const q of queries) {
    const data = (await getGoogle(googleUrl(q))) as any;
    // A bare-number search can match other books; only accept one that lists this ISBN.
    const items: any[] = data.items ?? [];
    const match =
      q.startsWith('isbn:')
        ? items[0]
        : items.find((it) => (it.volumeInfo?.industryIdentifiers ?? []).some((i: any) => i.identifier === isbn13 || i.identifier === isbn10));
    const meta = fromGoogleVolume(match);
    if (meta) return meta;
  }
  return null;
}

/**
 * Try a Google Books key with one small request. Returns null when it works,
 * or what went wrong in plain words.
 */
export async function testGoogleKey(key: string): Promise<string | null> {
  try {
    await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:9780547928227&maxResults=1&key=${encodeURIComponent(key.trim())}`);
    return null;
  } catch (err) {
    const detail = (err as { detail?: string }).detail ?? '';
    if (/referer|referrer/i.test(detail))
      return 'The key only allows certain websites. Stacks runs from a file on your computer, so it has no website address. In Google Cloud, set the key’s “Application restrictions” to None.';
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(detail))
      return 'The Books API isn’t turned on for this key’s project yet. Open the Books API page in Google Cloud, check the project name at the top matches the key’s project, and press Enable. It can take a few minutes to start working.';
    if (/API key not valid|API_KEY_INVALID/i.test(detail))
      return 'Google doesn’t recognise this key. Copy it again from Credentials (the “Show key” button) and paste it without spaces.';
    if (/API_KEY_SERVICE_BLOCKED|are blocked/i.test(detail))
      return 'The key is limited to other APIs. In Google Cloud, edit the key and under “API restrictions” add Books API (or choose “Don’t restrict key”).';
    if (/quota|rate/i.test(detail)) return 'This key has used up its lookups for today. It resets at midnight Pacific time.';
    return `Google said: ${detail || describe(err)}`;
  }
}

export interface SearchHit {
  id: string;
  source: 'googlebooks' | 'openlibrary';
  metadata: Partial<BookMetadata>;
}

/** Search both databases by title and/or author, for when a barcode isn't found. */
export async function searchBooks(query: string): Promise<{ hits: SearchHit[]; problem?: string; problemKind?: 'quota' | 'server' | 'other' }> {
  const [gb, ol] = await Promise.allSettled([
    // If Google keeps failing on the full search, a plainer one sometimes goes through.
    getGoogle(googleUrl(query, '&maxResults=12&printType=books')).catch((err) => {
      if (!isServerError(err)) throw err;
      return getGoogle(googleUrl(query, '&maxResults=10'));
    }),
    getJson(
      `https://openlibrary.org/search.json?limit=12&fields=key,title,subtitle,author_name,publisher,first_publish_year,number_of_pages_median,cover_i,isbn&q=${encodeURIComponent(query)}`,
    ),
  ]);
  const hits: SearchHit[] = [];
  if (gb.status === 'fulfilled') {
    for (const it of ((gb.value as any).items ?? []) as any[]) {
      const m = fromGoogleVolume(it);
      if (m) hits.push({ id: `gb:${it.id}`, source: 'googlebooks', metadata: m });
    }
  }
  if (ol.status === 'fulfilled') {
    for (const d of ((ol.value as any).docs ?? []) as any[]) {
      if (!d.title) continue;
      hits.push({
        id: `ol:${d.key}`,
        source: 'openlibrary',
        metadata: {
          title: d.title,
          subtitle: d.subtitle,
          authors: d.author_name ?? [],
          publisher: d.publisher?.[0],
          publishedDate: d.first_publish_year ? String(d.first_publish_year) : undefined,
          pageCount: d.number_of_pages_median,
          subjects: [],
          coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
          openLibraryKey: d.key,
        },
      });
    }
  }
  const problem =
    gb.status === 'rejected' && ol.status === 'rejected'
      ? "Couldn't reach Google Books or Open Library. Check your internet connection."
      : gb.status === 'rejected'
        ? `Google Books didn't answer (${describe(gb.reason)}), so these results are from Open Library only.`
        : undefined;
  const problemKind =
    gb.status !== 'rejected' ? undefined : ['HTTP 429', 'HTTP 403'].includes((gb.reason as Error)?.message) ? 'quota' : isServerError(gb.reason) ? 'server' : 'other';
  return { hits, problem, problemKind };
}

function describe(reason: unknown): string {
  if (reason instanceof Error) {
    if (reason.name === 'AbortError') return 'it timed out';
    if (reason.message === 'HTTP 429') return 'too many requests today';
    if (reason.message === 'HTTP 403') return 'it refused the request';
    if (/^HTTP 5\d\d$/.test(reason.message)) return `a temporary problem on Google's side, ${reason.message}`;
    return reason.message;
  }
  return String(reason);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type LookupResult =
  | { status: 'found'; metadata: BookMetadata }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/**
 * Ask Open Library and Google Books at the same time. Open Library wins on
 * fields both have; Google Books fills the gaps (it usually has descriptions).
 */
export async function lookupIsbn(isbn13: string, isbn10?: string): Promise<LookupResult> {
  const [ol, gb] = await Promise.allSettled([
    fromOpenLibrary(isbn13).then((r) => r ?? fromOpenLibraryEdition(isbn13)),
    fromGoogleBooks(isbn13, isbn10),
  ]);
  const a = ol.status === 'fulfilled' ? ol.value : null;
  const b = gb.status === 'fulfilled' ? gb.value : null;

  if (!a && !b) {
    if (ol.status === 'rejected' && gb.status === 'rejected') {
      const why = (r: PromiseRejectedResult) =>
        r.reason instanceof Error ? (r.reason.name === 'AbortError' ? 'timed out' : r.reason.message) : String(r.reason);
      const message = !navigator.onLine
        ? 'This computer is offline. Connect to the internet and press Retry.'
        : `Couldn't reach the book databases (Open Library: ${why(ol)}; Google Books: ${why(gb)}). ` +
          'Make sure Stacks is open in Chrome or Edge, not a preview window, then press Retry.';
      return { status: 'error', message };
    }
    // Open Library had nothing, but Google never answered: that isn't "not found".
    if (gb.status === 'rejected') {
      const limited = gb.reason instanceof Error && ['HTTP 429', 'HTTP 403'].includes(gb.reason.message);
      return {
        status: 'error',
        message: limited
          ? "Open Library doesn't have this book and Google Books is limiting free lookups right now. Press Retry later, use “Search by title”, or add your own free Google Books key (Backup menu → Lookup keys)."
          : `Open Library doesn't have this book and Google Books didn't answer (${describe(gb.reason)}). Press Retry.`,
      };
    }
    return { status: 'not-found' };
  }

  const pick = <K extends keyof BookMetadata>(k: K) => {
    const av = a?.[k];
    const empty = av === undefined || av === '' || (Array.isArray(av) && av.length === 0);
    return (empty ? b?.[k] : av) as BookMetadata[K];
  };

  return {
    status: 'found',
    metadata: {
      isbn13,
      isbn10,
      title: pick('title'),
      subtitle: pick('subtitle'),
      authors: pick('authors') ?? [],
      publisher: pick('publisher'),
      publishedDate: pick('publishedDate'),
      pageCount: pick('pageCount'),
      language: pick('language'),
      description: pick('description'),
      subjects: pick('subjects') ?? [],
      coverUrl: pick('coverUrl'),
      openLibraryKey: a?.openLibraryKey,
      googleBooksId: b?.googleBooksId,
      sources: [...(a ? ['openlibrary' as const] : []), ...(b ? ['googlebooks' as const] : [])],
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// MusicBrainz asks for at most one request a second; space scans out.
let mbQueue: Promise<unknown> = Promise.resolve();
function queuedMusicBrainz(code: string): Promise<Partial<BookMetadata> | null> {
  const run = mbQueue.then(() => fromMusicBrainz(code));
  mbQueue = run.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, 1100)));
  return run;
}

/** Scanners often send a 12-digit UPC as 13 digits with a leading 0; try both. */
const barcodeVariants = (code: string) => [...new Set([code, code.length === 13 && code.startsWith('0') ? code.slice(1) : '0' + code])];

export const vinylSizeOf = (text: string) => {
  const m = text.match(/(\d{1,2})"/);
  const size = m ? Number(m[1]) : 12;
  return size === 7 ? 7 : size === 10 ? 10 : 12;
};

async function fromMusicBrainz(code: string): Promise<Partial<BookMetadata> | null> {
  const variants = barcodeVariants(code);
  const query = variants.map((v) => `barcode:${v}`).join(' OR ');
  const data = (await getJson(`https://musicbrainz.org/ws/2/release?fmt=json&limit=5&query=${encodeURIComponent(query)}`)) as any;
  const rel = (data.releases ?? []).find((r: any) => variants.includes(r.barcode));
  if (!rel?.title) return null;
  const formats: string[] = (rel.media ?? []).map((m: any) => String(m.format ?? ''));
  const vinyl = formats.some((f) => /vinyl/i.test(f));
  return {
    kind: vinyl ? 'vinyl' : 'cd',
    title: rel.title,
    authors: (rel['artist-credit'] ?? []).map((a: any) => a.name ?? a.artist?.name).filter(Boolean),
    publisher: (rel['label-info'] ?? []).map((l: any) => l.label?.name).filter(Boolean)[0],
    publishedDate: rel.date,
    trackCount: rel['track-count'] || undefined,
    discCount: rel.media?.length || undefined,
    vinylSize: vinyl ? vinylSizeOf(formats.join(' ')) : undefined,
    musicBrainzId: rel.id,
  };
}

const DISCOGS_TOKEN_PREF = 'stacks.discogsToken';

/** A free personal Discogs token the person can add in Settings. */
export function getDiscogsToken(): string {
  try {
    return localStorage.getItem(DISCOGS_TOKEN_PREF) ?? '';
  } catch {
    return '';
  }
}
export function setDiscogsToken(token: string) {
  try {
    if (token.trim()) localStorage.setItem(DISCOGS_TOKEN_PREF, token.trim());
    else localStorage.removeItem(DISCOGS_TOKEN_PREF);
  } catch {
    /* preference only */
  }
}

/** Discogs knows the most pressings, but only answers barcode searches with a token. */
async function fromDiscogs(code: string): Promise<Partial<BookMetadata> | null> {
  const token = getDiscogsToken();
  if (!token) return null;
  for (const v of barcodeVariants(code)) {
    const data = (await getJson(
      `https://api.discogs.com/database/search?type=release&per_page=5&barcode=${encodeURIComponent(v)}&token=${encodeURIComponent(token)}`,
    )) as any;
    const r = data.results?.[0];
    if (!r?.title) continue;
    // Search titles read "Artist - Album".
    const [artist, ...rest] = String(r.title).split(' - ');
    const formats: string[] = r.format ?? [];
    const vinyl = formats.some((f) => /vinyl|LP/i.test(f));
    const meta: Partial<BookMetadata> = {
      kind: vinyl ? 'vinyl' : 'cd',
      title: rest.length ? rest.join(' - ') : r.title,
      authors: rest.length ? [artist.replace(/ \(\d+\)$/, '')] : [],
      publisher: r.label?.[0],
      publishedDate: r.year ? String(r.year) : undefined,
      subjects: [...(r.genre ?? []), ...(r.style ?? [])].slice(0, 8),
      coverUrl: r.cover_image && !/spacer\.gif/.test(r.cover_image) ? r.cover_image : undefined,
      vinylSize: vinyl ? vinylSizeOf(formats.join(' ')) : undefined,
      discogsId: r.id,
    };
    // The release page has the track list and the exact artist names.
    try {
      const rel = (await getJson(`https://api.discogs.com/releases/${r.id}?token=${encodeURIComponent(token)}`)) as any;
      const tracks = (rel.tracklist ?? []).filter((t: any) => t.type_ === 'track');
      if (tracks.length) meta.trackCount = tracks.length;
      const artists = (rel.artists ?? []).map((a: any) => String(a.name).replace(/ \(\d+\)$/, '')).filter(Boolean);
      if (artists.length) meta.authors = artists;
      const qty = (rel.formats ?? []).reduce((n: number, f: any) => n + (Number(f.qty) || 0), 0);
      if (qty) meta.discCount = qty;
    } catch {
      /* the search result is enough */
    }
    return meta;
  }
  return null;
}

/**
 * Deezer and iTunes don't let other pages read their answers directly, but
 * both offer JSONP: load the answer as a script that calls us back.
 */
let jsonpCount = 0;
function jsonp(url: string, param = 'callback'): Promise<any> {
  return new Promise((resolve, reject) => {
    const name = `__stacksJsonp${Date.now()}_${jsonpCount++}`;
    const script = document.createElement('script');
    const w = window as any;
    const done = () => {
      clearTimeout(timer);
      delete w[name];
      script.remove();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('timed out'));
    }, TIMEOUT_MS);
    w[name] = (data: unknown) => {
      done();
      resolve(data);
    };
    script.onerror = () => {
      done();
      reject(new Error('blocked'));
    };
    script.src = `${url}${url.includes('?') ? '&' : '?'}${param}=${name}`;
    document.head.appendChild(script);
  });
}

async function fromDeezer(code: string): Promise<Partial<BookMetadata> | null> {
  for (const v of barcodeVariants(code)) {
    const a = await jsonp(`https://api.deezer.com/album/upc:${v}?output=jsonp`);
    if (!a?.title || a.error) continue;
    return {
      title: a.title,
      authors: a.artist?.name ? [a.artist.name] : [],
      publisher: a.label,
      publishedDate: a.release_date,
      trackCount: a.nb_tracks || undefined,
      subjects: (a.genres?.data ?? []).map((g: any) => g.name).filter(Boolean),
      coverUrl: a.cover_xl || a.cover_big,
    };
  }
  return null;
}

async function fromItunes(code: string): Promise<Partial<BookMetadata> | null> {
  for (const v of barcodeVariants(code)) {
    const data = await jsonp(`https://itunes.apple.com/lookup?upc=${v}&entity=album`);
    const a = (data?.results ?? []).find((r: any) => r.wrapperType === 'collection');
    if (!a?.collectionName) continue;
    return {
      title: a.collectionName.replace(/ - (Single|EP)$/, ''),
      authors: a.artistName ? [a.artistName] : [],
      publishedDate: a.releaseDate?.slice(0, 10),
      trackCount: a.trackCount || undefined,
      subjects: a.primaryGenreName ? [a.primaryGenreName] : [],
      coverUrl: a.artworkUrl100?.replace('100x100bb', '600x600bb'),
    };
  }
  return null;
}

/**
 * Records and CDs: MusicBrainz and Discogs know physical releases (and say
 * whether it's vinyl or a CD); Deezer and iTunes know the album and usually
 * have good cover art, so they fill the gaps.
 */
export async function lookupBarcode(code: string): Promise<LookupResult> {
  const settled = await Promise.allSettled([queuedMusicBrainz(code), fromDiscogs(code), fromDeezer(code), fromItunes(code)]);
  const [mb, dc, dz, it] = settled.map((r) => (r.status === 'fulfilled' ? r.value : null));
  const found = [
    { m: dc, source: 'discogs' as const },
    { m: mb, source: 'musicbrainz' as const },
    { m: dz, source: 'deezer' as const },
    { m: it, source: 'itunes' as const },
  ].filter((x) => x.m?.title);

  if (!found.length) {
    // Only an error when no database answered at all (Discogs counts only with a token).
    const asked = settled.filter((_, i) => i !== 1 || getDiscogsToken());
    if (asked.every((r) => r.status === 'rejected')) {
      return {
        status: 'error',
        message: !navigator.onLine
          ? 'This computer is offline. Connect to the internet and press Retry.'
          : "Couldn't reach the music databases. Wait a moment and press Retry.",
      };
    }
    return { status: 'not-found' };
  }

  // First source with a value wins, in the order above.
  const pick = <K extends keyof BookMetadata>(k: K) => {
    for (const { m } of found) {
      const v = m![k];
      if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) return v as BookMetadata[K];
    }
    return undefined;
  };
  const caa = mb?.musicBrainzId ? `https://coverartarchive.org/release/${mb.musicBrainzId}/front-500` : undefined;
  const kind = pick('kind') ?? 'cd';
  return {
    status: 'found',
    metadata: {
      kind,
      barcode: code,
      title: pick('title')!,
      authors: pick('authors') ?? [],
      publisher: pick('publisher'),
      publishedDate: pick('publishedDate'),
      subjects: pick('subjects') ?? [],
      trackCount: pick('trackCount'),
      discCount: pick('discCount'),
      vinylSize: kind === 'vinyl' ? pick('vinylSize') ?? 12 : undefined,
      // Discogs, Deezer and iTunes covers are more reliable than the Cover Art Archive's.
      coverUrl: dc?.coverUrl ?? dz?.coverUrl ?? it?.coverUrl ?? caa,
      musicBrainzId: mb?.musicBrainzId,
      discogsId: dc?.discogsId,
      sources: found.map((x) => x.source),
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Every subject Open Library knows for a book, found by ISBN or else by title
 * and author. Used to guess moods. Returns [] when nothing is found.
 */
export async function fetchSubjects(book: { isbn13?: string; title: string; authors: string[] }): Promise<string[]> {
  const q = book.isbn13
    ? `isbn=${book.isbn13}`
    : `title=${encodeURIComponent(book.title)}${book.authors[0] ? `&author=${encodeURIComponent(book.authors[0])}` : ''}`;
  const data = (await getJson(`https://openlibrary.org/search.json?${q}&fields=subject&limit=1`)) as { docs?: { subject?: string[] }[] };
  return data.docs?.[0]?.subject ?? [];
}

/** The series Open Library lists for an edition, as raw text like "The Expanse ; 1". */
export async function fetchSeries(isbn13: string): Promise<string[]> {
  try {
    const e = (await getJson(`https://openlibrary.org/isbn/${isbn13}.json`)) as { series?: string[] };
    return e.series ?? [];
  } catch (err) {
    if (err instanceof Error && err.message === 'HTTP 404') return [];
    throw err;
  }
}

const FORMAT_WORDS = /^(lp|album|ep|single|compilation|reissue|repress|remastered|stereo|mono|vinyl|cd|12"|10"|7"|33 ⅓ rpm|45 rpm|78 rpm|gatefold|mini-album|maxi-single)$/i;

/** Color, edition and the rest of a Discogs release's pressing details. */
export function pressingFrom(rel: any): Partial<BookMetadata> & { vinylColor?: string; edition?: string; pressingCountry?: string; matrix?: string; catalogNumber?: string } {
  const formats: any[] = rel.formats ?? [];
  const vinyl = formats.some((f) => /vinyl/i.test(f.name));
  const cd = formats.some((f) => /^cd/i.test(f.name));
  const descriptions = formats.flatMap((f) => f.descriptions ?? []) as string[];
  const edition = descriptions.filter((d) => !FORMAT_WORDS.test(d)).join(', ');
  const color = formats.map((f) => f.text).filter(Boolean).join(', ');
  const matrix = (rel.identifiers ?? []).filter((x: any) => /matrix|runout/i.test(x.type)).map((x: any) => x.value).slice(0, 2).join(' / ');
  const qty = formats.reduce((n, f) => n + (Number(f.qty) || 0), 0);
  return {
    kind: vinyl ? 'vinyl' : cd ? 'cd' : undefined,
    vinylSize: vinyl ? vinylSizeOf(descriptions.join(' ')) : undefined,
    discCount: qty || undefined,
    vinylColor: vinyl && color ? color : undefined,
    edition: edition || undefined,
    pressingCountry: rel.country || undefined,
    matrix: matrix || undefined,
    catalogNumber: rel.labels?.[0]?.catno && rel.labels[0].catno !== 'none' ? rel.labels[0].catno : undefined,
    publisher: rel.labels?.[0]?.name?.replace(/\s*\(\d+\)$/, ''),
  };
}

/** Details from a Discogs release page: barcode, track count, genres, pressing, and the cover when Discogs shares it. */
export async function fetchDiscogsRelease(id: number): Promise<ReturnType<typeof pressingFrom>> {
  const token = getDiscogsToken();
  const rel = (await getJson(`https://api.discogs.com/releases/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`)) as any;
  const tracks = (rel.tracklist ?? []).filter((t: any) => !t.type_ || t.type_ === 'track');
  const barcode = (rel.identifiers ?? []).find((x: any) => x.type === 'Barcode')?.value?.replace(/\D/g, '');
  const img = rel.images?.find((i: any) => i.type === 'primary') ?? rel.images?.[0];
  return {
    ...pressingFrom(rel),
    title: rel.title || undefined,
    authors: (rel.artists ?? []).map((a: any) => String(a.name).replace(/ \(\d+\)$/, '').replace(/\*$/, '')).filter(Boolean),
    trackCount: tracks.length || undefined,
    barcode: barcode && barcode.length >= 8 ? barcode : undefined,
    subjects: [...(rel.genres ?? []), ...(rel.styles ?? [])].slice(0, 8),
    coverUrl: img?.uri && !/spacer\.gif/.test(img.uri) ? img.uri : rel.thumb || undefined,
    publishedDate: rel.released && rel.released !== '0' ? rel.released.replace(/-00/g, '') : rel.year ? String(rel.year) : undefined,
    discogsId: id,
  };
}

export interface PressingHit {
  id: number;
  title: string;
  format: string;
  country?: string;
  year?: string;
  catno?: string;
  label?: string;
  thumb?: string;
}

/** Releases that could be this record (needs a Discogs token): by barcode, else by artist and title. */
export async function searchPressings(q: { barcode?: string; artist?: string; title?: string }): Promise<PressingHit[]> {
  const token = getDiscogsToken();
  if (!token) throw new Error('needs a token');
  const params = q.barcode
    ? `barcode=${encodeURIComponent(q.barcode)}`
    : `artist=${encodeURIComponent(q.artist ?? '')}&release_title=${encodeURIComponent(q.title ?? '')}`;
  const data = (await getJson(`https://api.discogs.com/database/search?type=release&per_page=25&${params}&token=${encodeURIComponent(token)}`)) as any;
  return (data.results ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    format: (r.format ?? []).join(', '),
    country: r.country,
    year: r.year,
    catno: r.catno,
    label: r.label?.[0],
    thumb: r.thumb && !/spacer\.gif/.test(r.thumb) ? r.thumb : undefined,
  }));
}

/** "https://www.discogs.com/release/1873013-Fleetwood-Mac-Rumours" or "r1873013" or "1873013" → 1873013. */
export const discogsIdFrom = (s: string) => {
  const m = s.trim().match(/release\/(\d+)|^\[?r?(\d+)\]?$/i);
  return m ? Number(m[1] ?? m[2]) : undefined;
};

/** Album art from Deezer by artist and title, for records that came in without a cover. */
export async function findAlbumCover(artist: string, title: string): Promise<string | undefined> {
  const q = `artist:"${artist.replace(/"/g, '')}" album:"${title.replace(/"/g, '')}"`;
  const data = await jsonp(`https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=3&output=jsonp`);
  const a = (data?.data ?? [])[0];
  return a?.cover_xl || a?.cover_big || undefined;
}

/** Discogs marketplace numbers for one release, in the given currency. */
export async function fetchMarketPrices(releaseId: number, currency: string, condition = 'Very Good Plus (VG+)'): Promise<{ lowest?: number; suggested?: number; forSale?: number; currency: string }> {
  const token = getDiscogsToken();
  const tok = token ? `&token=${encodeURIComponent(token)}` : '';
  const stats = (await getJson(`https://api.discogs.com/marketplace/stats/${releaseId}?curr_abbr=${currency}${tok}`)) as any;
  const out: { lowest?: number; suggested?: number; forSale?: number; currency: string } = {
    lowest: typeof stats?.lowest_price?.value === 'number' ? stats.lowest_price.value : undefined,
    forSale: typeof stats?.num_for_sale === 'number' ? stats.num_for_sale : undefined,
    currency: stats?.lowest_price?.currency ?? currency,
  };
  // Suggested prices by condition need a token (and seller settings filled in on Discogs).
  if (token) {
    try {
      const sug = (await getJson(`https://api.discogs.com/marketplace/price_suggestions/${releaseId}?token=${encodeURIComponent(token)}`)) as any;
      const s = sug?.[condition] ?? sug?.['Very Good Plus (VG+)'];
      if (typeof s?.value === 'number') {
        // Suggestions come in the seller's currency; only use them when it matches.
        if (!s.currency || s.currency === out.currency) out.suggested = Math.round(s.value * 100) / 100;
      }
    } catch {
      /* lowest price is enough */
    }
  }
  return out;
}

/** The Discogs release id for a barcode (needs a token). */
export async function discogsIdForBarcode(code: string): Promise<number | undefined> {
  return (await fromDiscogs(code))?.discogsId;
}

const msToClock = (ms?: number) => {
  if (!ms) return undefined;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The track list from Discogs, else MusicBrainz, else Deezer (by artist and title). */
export async function fetchTrackList(b: { discogsId?: number; musicBrainzId?: string; authors: string[]; title: string }): Promise<Track[] | undefined> {
  const strip = (a: string) => a.replace(/ \(\d+\)$/, '').replace(/\*$/, '');
  if (b.discogsId) {
    try {
      const token = getDiscogsToken();
      const rel = (await getJson(`https://api.discogs.com/releases/${b.discogsId}${token ? `?token=${encodeURIComponent(token)}` : ''}`)) as any;
      const main = (rel.artists ?? []).map((a: any) => strip(a.name)).join(', ');
      const tracks: Track[] = (rel.tracklist ?? [])
        .filter((t: any) => (!t.type_ || t.type_ === 'track') && t.title)
        .map((t: any) => {
          const artist = (t.artists ?? []).map((a: any) => strip(a.name)).join(', ');
          return { position: t.position || undefined, title: t.title, duration: t.duration || undefined, artist: artist && artist !== main ? artist : undefined };
        });
      if (tracks.length) return tracks;
    } catch {
      /* try the next source */
    }
  }
  if (b.musicBrainzId) {
    try {
      const rel = (await getJson(`https://musicbrainz.org/ws/2/release/${b.musicBrainzId}?inc=recordings&fmt=json`)) as any;
      const media: any[] = rel.media ?? [];
      const many = media.length > 1;
      const tracks: Track[] = media.flatMap((m, i) =>
        (m.tracks ?? []).map((t: any) => ({
          position: many ? `${i + 1}-${String(t.position ?? t.number).padStart(2, '0')}` : String(t.number ?? t.position ?? ''),
          title: t.title,
          duration: msToClock(t.length),
        })),
      );
      if (tracks.length) return tracks;
    } catch {
      /* try the next source */
    }
  }
  if (b.authors[0] && b.title) {
    const q = `artist:"${b.authors[0].replace(/"/g, '')}" album:"${b.title.replace(/"/g, '')}"`;
    const found = await jsonp(`https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=1&output=jsonp`);
    const id = found?.data?.[0]?.id;
    if (id) {
      const list = await jsonp(`https://api.deezer.com/album/${id}/tracks?limit=100&output=jsonp`);
      const tracks: Track[] = (list?.data ?? []).map((t: any, i: number) => ({
        position: t.disk_number > 1 ? `${t.disk_number}-${String(t.track_position ?? i + 1).padStart(2, '0')}` : String(t.track_position ?? i + 1),
        title: t.title,
        duration: t.duration ? msToClock(t.duration * 1000) : undefined,
      }));
      if (tracks.length) return tracks;
    }
  }
  return undefined;
}
