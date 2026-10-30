import type { Book, Reading } from '../types';
import { lastPage, todayIso } from './reading';

const KEY = 'stacks.activeSession';
const GOAL_KEY = 'stacks.dailyMinutesGoal';

/** The timer that's running (or paused). Kept in localStorage so a reload or closed tab doesn't lose it. */
export interface ActiveSession {
  readingId: string;
  bookId: string;
  startedAt: number; // ms
  fromPage?: number;
  /** Time already counted before the last pause. */
  bankedMs: number;
  /** When the current stretch began; absent while paused. */
  runningSince?: number;
}

export function loadActive(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}
export function saveActive(a: ActiveSession | null) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch {
    /* private window: the timer still works until reload */
  }
}

export const elapsedMs = (a: ActiveSession, now = Date.now()) => a.bankedMs + (a.runningSince ? now - a.runningSince : 0);

export function startSession(reading: Reading, book: Book): ActiveSession {
  const now = Date.now();
  return { readingId: reading.id, bookId: book.id, startedAt: now, fromPage: lastPage(reading), bankedMs: 0, runningSince: now };
}

export const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export const hoursAndMinutes = (minutes: number) => {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

export function getDailyGoal(): number {
  try {
    return Number(localStorage.getItem(GOAL_KEY)) || 0;
  } catch {
    return 0;
  }
}
export function setDailyGoal(n: number) {
  try {
    if (n > 0) localStorage.setItem(GOAL_KEY, String(n));
    else localStorage.removeItem(GOAL_KEY);
  } catch {
    /* ignore */
  }
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Minutes read on each day (local time), from every session. */
export function minutesByDay(readings: Reading[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of readings) for (const s of r.sessions ?? []) m.set(localDay(s.start), (m.get(localDay(s.start)) ?? 0) + s.minutes);
  return m;
}

/** Days in a row, ending today or yesterday, with a timed session or a page update. */
export function readingStreak(readings: Reading[]): number {
  const days = new Set<string>(minutesByDay(readings).keys());
  for (const r of readings) for (const u of r.updates) days.add(localDay(u.at));
  const d = new Date();
  if (!days.has(todayIso())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(localDay(d.toISOString()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/**
 * The reading with the finished session added. A page reached also counts as
 * a progress update, and the last page marks the book read.
 */
export function withSession(reading: Reading, book: Book, start: string, minutes: number, toPage?: number, fromPage?: number): Reading {
  const now = new Date().toISOString();
  const pages = book.pageCount;
  const page = toPage !== undefined && pages ? Math.min(toPage, pages) : toPage;
  const done = page !== undefined && !!pages && page >= pages;
  return {
    ...reading,
    sessions: [...(reading.sessions ?? []), { start, minutes: Math.max(1, Math.round(minutes)), fromPage, toPage: page }],
    updates: page !== undefined ? [...reading.updates, { at: now, page }] : reading.updates,
    ...(done ? { status: 'read' as const, finishedOn: todayIso() } : {}),
    updatedAt: now,
  };
}
