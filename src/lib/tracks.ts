import type { Book, Track } from '../types';

/** "4:12" → 252 seconds. */
export const seconds = (d?: string) => {
  const m = d?.match(/^(?:(\d+):)?(\d+):(\d{2})$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};

export const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export interface TrackGroup {
  /** "Side A", "Disc 2", or "" when the record isn't split up. */
  label: string;
  tracks: { t: Track; i: number }[];
  seconds: number;
}

/** Sides for vinyl (from "A1", "B2"), discs for CDs (from "2-03"). */
export function groupTracks(tracks: Track[]): TrackGroup[] {
  const groups: TrackGroup[] = [];
  tracks.forEach((t, i) => {
    const pos = t.position?.trim() ?? '';
    const side = /^([A-Za-z])\d*/.exec(pos)?.[1]?.toUpperCase();
    const disc = /^(\d+)[-.](\d+)$/.exec(pos)?.[1];
    let label = disc ? `Disc ${disc}` : '';
    if (side) label = `Side ${side}`;
    let g = groups[groups.length - 1];
    if (g?.label !== label) {
      g = { label, tracks: [], seconds: 0 };
      groups.push(g);
    }
    g.tracks.push({ t, i });
    g.seconds += seconds(t.duration);
  });
  return groups;
}

export const totalSeconds = (tracks: Track[]) => tracks.reduce((n, t) => n + seconds(t.duration), 0);

/**
 * A track list typed or pasted by hand, one per line:
 * "A1 Second Hand News 2:56", "1. Airbag (4:44)", or just a title.
 */
export function parseTrackText(text: string): Track[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      let rest = line;
      let duration: string | undefined;
      const d = /[\s([–-]*\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?\s*$/.exec(rest);
      if (d) {
        duration = d[1];
        rest = rest.slice(0, d.index).trim();
      }
      let position: string | undefined;
      const p = /^([A-Za-z]?\d{1,2}(?:[-.]\d{1,2})?|[A-Z])[.):\s-]+\s*/.exec(rest);
      if (p && rest.length > p[0].length) {
        position = p[1].replace(/\.$/, '');
        rest = rest.slice(p[0].length).trim();
      }
      return { position, title: rest.replace(/^[-–]\s*/, ''), duration };
    })
    .filter((t) => t.title);
}

/** Back to the text form, for editing. */
export const trackText = (tracks: Track[]) => tracks.map((t) => [t.position, t.title, t.duration].filter(Boolean).join(' ')).join('\n');

/** Keep your favorites when a fresh track list comes in. */
export function keepFavorites(next: Track[], old?: Track[]): Track[] {
  const fav = new Set((old ?? []).filter((t) => t.favorite).map((t) => t.title.toLowerCase()));
  return next.map((t) => (fav.has(t.title.toLowerCase()) ? { ...t, favorite: true } : t));
}

/** Every favorite track in the collection. */
export const favoriteTracks = (books: Book[]) =>
  books.flatMap((b) => (b.tracks ?? []).filter((t) => t.favorite).map((t) => ({ b, t })));
