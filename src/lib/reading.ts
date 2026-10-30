import type { Book, Reading } from '../types';

/** The read-through that decides a book's status now: the most recently started one. */
export function currentReading(readings: Reading[], bookId: string): Reading | undefined {
  let best: Reading | undefined;
  for (const r of readings) if (r.bookId === bookId && (!best || r.createdAt > best.createdAt)) best = r;
  return best;
}

/** Every read-through of a book, newest first. */
export function readingsOf(readings: Reading[], bookId: string): Reading[] {
  return readings.filter((r) => r.bookId === bookId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** How far along, 0–100, from the latest update. */
export function progressPct(r: Reading | undefined, book: Book): number | undefined {
  const last = r?.updates[r.updates.length - 1];
  if (!last) return undefined;
  if (last.percent !== undefined) return Math.max(0, Math.min(100, last.percent));
  if (last.page !== undefined && book.pageCount) return Math.max(0, Math.min(100, Math.round((last.page / book.pageCount) * 100)));
  return undefined;
}

export const lastPage = (r: Reading | undefined) => r?.updates[r.updates.length - 1]?.page;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const formatDay = (iso?: string) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Sort key for the to-read queue: your own order, else the day it was added. */
export const queueKey = (r: Reading) => r.queueOrder ?? Date.parse(r.createdAt);
