import type { Book, Spin } from '../types';
import { isMusic } from '../types';

const DAY = 86_400_000;
/** A record counts as "on" for this long after you press Spin. */
export const NOW_SPINNING_MS = 45 * 60_000;
/** Not played for this many days: gathering dust. */
export const DUSTY_DAYS = 180;

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface PlayInfo {
  count: number;
  last?: string;
}

/** Play count and last play for every record. */
export function playsByRecord(spins: Spin[]): Map<string, PlayInfo> {
  const m = new Map<string, PlayInfo>();
  for (const s of spins) {
    const p = m.get(s.bookId) ?? { count: 0 };
    p.count++;
    if (!p.last || s.at > p.last) p.last = s.at;
    m.set(s.bookId, p);
  }
  return m;
}

/** The spin that's playing right now, if you pressed Spin in the last 45 minutes. */
export function nowSpinning(spins: Spin[], now = Date.now()): Spin | undefined {
  const last = spins.reduce<Spin | undefined>((a, s) => (!a || s.at > a.at ? s : a), undefined);
  return last && now - Date.parse(last.at) < NOW_SPINNING_MS && Date.parse(last.at) <= now ? last : undefined;
}

/** Days in a row, up to today (or yesterday, if nothing yet today), with at least one spin. */
export function spinStreak(spins: Spin[], now = new Date()): number {
  const days = new Set(spins.map((s) => localDay(s.at)));
  const d = new Date(now);
  if (!days.has(localDay(d.toISOString()))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(localDay(d.toISOString()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const daysSince = (iso: string, now = Date.now()) => Math.floor((now - Date.parse(iso)) / DAY);

/** "today", "yesterday", "3 days ago", "2 months ago". */
export function agoLabel(iso: string, now = Date.now()): string {
  const d = daysSince(iso, now);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 730) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} years ago`;
}

/**
 * Something from your shelves to put on: never-played and long-unplayed records are
 * much more likely to come up than the one you played yesterday.
 */
export function pickRecord(records: Book[], plays: Map<string, PlayInfo>, exclude?: string, now = Date.now()): Book | undefined {
  const pool = records.filter((b) => b.id !== exclude && isMusic(b) && b.owned !== false && !b.loan);
  if (!pool.length) return;
  const weight = (b: Book) => {
    const p = plays.get(b.id);
    if (!p?.last) return 6;
    return Math.min(5, 0.2 + daysSince(p.last, now) / 60);
  };
  const total = pool.reduce((n, b) => n + weight(b), 0);
  let r = Math.random() * total;
  for (const b of pool) {
    r -= weight(b);
    if (r <= 0) return b;
  }
  return pool[pool.length - 1];
}

/** Spins per month for the 12 months up to now, oldest first. */
export function spinsPerMonth(spins: Spin[], now = new Date()): [string, number][] {
  const rows: [string, number][] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(undefined, { month: 'short', ...(d.getMonth() === 0 || i === 11 ? { year: '2-digit' } : {}) });
    rows.push([label, spins.filter((s) => localDay(s.at).startsWith(key)).length]);
  }
  return rows;
}

/** Spins per weekday, Monday first. */
export function spinsPerWeekday(spins: Spin[]): [string, number][] {
  const counts = new Array(7).fill(0) as number[];
  for (const s of spins) counts[(new Date(s.at).getDay() + 6) % 7]++;
  return counts.map((n, i) => [new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }), n]);
}

/** Most-played artists, with how many spins each. */
export function topArtists(spins: Spin[], byId: Map<string, Book>, n = 8): [string, number][] {
  const m = new Map<string, number>();
  for (const s of spins) {
    const a = byId.get(s.bookId)?.authors[0];
    if (a) m.set(a, (m.get(a) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

export const spinsSince = (spins: Spin[], since: number) => spins.filter((s) => Date.parse(s.at) >= since).length;

/** Start of this week (Monday), this month and this year, as timestamps. */
export function periodStarts(now = new Date()) {
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return { week: week.getTime(), month: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), year: new Date(now.getFullYear(), 0, 1).getTime() };
}
