import type { Book, Spin } from '../types';
import { kindOf } from '../types';
import { totalSeconds } from './tracks';
import { newId } from './storage';

/** A needle on your turntable. Kept in this browser and in backups. */
export interface Stylus {
  id: string;
  name: string;
  /** Tip shape, which decides how long it lasts. */
  shape: StylusShape;
  /** Replace after this many hours. */
  lifeHours: number;
  /** YYYY-MM-DD */
  installedOn: string;
  retiredOn?: string;
  /** Hours it already had when you started tracking it. */
  startHours?: number;
}

export type StylusShape = 'conical' | 'elliptical' | 'fine' | 'unknown';

export const SHAPES: Record<StylusShape, { label: string; hours: number }> = {
  conical: { label: 'Conical (spherical)', hours: 500 },
  elliptical: { label: 'Elliptical', hours: 800 },
  fine: { label: 'Fine line, Shibata or micro-ridge', hours: 1000 },
  unknown: { label: "Don't know", hours: 600 },
};

const KEY = 'stacks.styluses';

export function loadStyluses(): Stylus[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => s && typeof s.id === 'string' && typeof s.installedOn === 'string') : [];
  } catch {
    return [];
  }
}

export function saveStyluses(list: Stylus[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked */
  }
}

export const newStylus = (name: string, shape: StylusShape, installedOn: string, startHours?: number): Stylus => ({
  id: newId(),
  name: name.trim() || 'Stylus',
  shape,
  lifeHours: SHAPES[shape].hours,
  installedOn,
  startHours: startHours && startHours > 0 ? startHours : undefined,
});

/** How long one play of a record takes, in hours: from its track list, else a typical length for its size. */
export function playHours(b: Book): number {
  const s = totalSeconds(b.tracks ?? []);
  if (s > 0) return s / 3600;
  const perDisc = b.vinylSize === 7 ? 8 : b.vinylSize === 10 ? 25 : 42;
  return (perDisc * Math.max(1, b.discCount ?? 1)) / 60;
}

const dayOf = (iso: string) => iso.slice(0, 10);

/** Vinyl spins while this stylus was on the turntable. */
export function spinsOn(st: Stylus, spins: Spin[], byId: Map<string, Book>) {
  return spins.filter((x) => {
    const b = byId.get(x.bookId);
    if (!b || kindOf(b) !== 'vinyl') return false;
    const d = dayOf(new Date(x.at).toISOString());
    // The day you swap counts for the new stylus.
    return d >= st.installedOn && (!st.retiredOn || d < st.retiredOn);
  });
}

export interface StylusWear {
  hours: number;
  plays: number;
  pct: number;
  /** Hours played in the last 30 days, for the forecast. */
  recentHours: number;
  /** Rough days left at the recent pace. */
  daysLeft?: number;
}

export function wear(st: Stylus, spins: Spin[], byId: Map<string, Book>, now = Date.now()): StylusWear {
  const on = spinsOn(st, spins, byId);
  const hoursOf = (list: Spin[]) => list.reduce((n, x) => n + playHours(byId.get(x.bookId)!), 0);
  const hours = (st.startHours ?? 0) + hoursOf(on);
  const recentHours = hoursOf(on.filter((x) => now - Date.parse(x.at) < 30 * 86_400_000));
  const left = Math.max(0, st.lifeHours - hours);
  return {
    hours,
    plays: on.length,
    pct: Math.min(100, Math.round((hours / st.lifeHours) * 100)),
    recentHours,
    daysLeft: recentHours > 0 ? Math.round(left / (recentHours / 30)) : undefined,
  };
}

export const hoursLabel = (h: number) => (h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString());
