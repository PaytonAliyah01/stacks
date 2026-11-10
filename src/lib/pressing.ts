import { insideParens } from './text';

/** Goldmine grades, written the way Discogs writes them, best first. */
export const MEDIA_GRADES = [
  'Mint (M)',
  'Near Mint (NM or M-)',
  'Very Good Plus (VG+)',
  'Very Good (VG)',
  'Good Plus (G+)',
  'Good (G)',
  'Fair (F)',
  'Poor (P)',
];
export const SLEEVE_GRADES = [...MEDIA_GRADES, 'Generic', 'Not Graded', 'No Cover'];

export const GRADE_HELP: Record<string, string> = {
  'Mint (M)': 'Never played, still perfect. Usually sealed.',
  'Near Mint (NM or M-)': 'Looks and plays like new. No marks.',
  'Very Good Plus (VG+)': 'Light signs of use that barely affect the sound.',
  'Very Good (VG)': 'Surface noise and light scratches you can hear in quiet parts.',
  'Good Plus (G+)': 'Plays through with noise and clicks.',
  'Good (G)': 'Plenty of noise and wear, but plays.',
  'Fair (F)': 'Skips or heavy noise.',
  'Poor (P)': 'Barely playable.',
};

/** "Near Mint (NM or M-)" → "NM", "Very Good Plus (VG+)" → "VG+". */
export const gradeShort = (g?: string) => {
  if (!g) return '';
  const inner = insideParens(g);
  return inner ? inner.replace(/ or M-$/, '') : g;
};

/** A grade from the CSV of another app ("VG+", "nm", "near mint") in Discogs' words. */
export function normalizeGrade(g?: string): string | undefined {
  if (!g?.trim()) return;
  const s = g.trim().toLowerCase();
  return (
    SLEEVE_GRADES.find((x) => x.toLowerCase() === s) ??
    SLEEVE_GRADES.find((x) => gradeShort(x).toLowerCase() === s || x.toLowerCase().startsWith(s)) ??
    g.trim()
  );
}

export const COLOR_SUGGESTIONS = ['Black', 'Clear', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'White', 'Gold', 'Silver', 'Red marble', 'Blue marble', 'Splatter', 'Picture disc', 'Transparent red', 'Translucent blue'];

const COLOR_WORDS: [RegExp, string][] = [
  [/\bblack\b/, '#151515'],
  [/\b(clear|transparent|crystal)\b/, 'rgb(225 232 236 / 0.55)'],
  [/\bwhite|cream|bone|milky\b/, '#efece4'],
  [/\b(red|crimson|ruby|blood)\b/, '#b3262e'],
  [/\b(pink|rose|magenta)\b/, '#e07aa6'],
  [/\borange|tangerine\b/, '#e5822b'],
  [/\b(yellow|lemon|banana)\b/, '#e8c838'],
  [/\b(gold|golden|mustard)\b/, '#c9a43a'],
  [/\b(green|emerald|mint|olive|jade)\b/, '#2f8a4d'],
  [/\b(blue|navy|cobalt|sky|cyan|turquoise|teal)\b/, '#2c62b0'],
  [/\b(purple|violet|lilac|lavender|grape)\b/, '#7a46a8'],
  [/\b(silver|grey|gray|smoke)\b/, '#9ea4aa'],
  [/\b(brown|tan|coke bottle|bronze)\b/, '#7a5332'],
];

/**
 * A CSS background for a disc in the record's color: two colors swirl for marble,
 * dots for splatter. Black (or no color) returns undefined.
 */
export function discBackground(color?: string): string | undefined {
  if (!color) return;
  const c = color.toLowerCase();
  if (/picture disc/.test(c)) return 'conic-gradient(from 30deg, #d9a441, #c0503b, #4a7bb7, #6aa35a, #d9a441)';
  const found: string[] = [];
  for (const [re, css] of COLOR_WORDS) {
    const i = c.search(re);
    if (i >= 0) found.push(`${i}|${css}`);
  }
  found.sort((a, b) => Number(a.split('|')[0]) - Number(b.split('|')[0]));
  const cols = found.map((x) => x.split('|')[1]);
  if (!cols.length || (cols.length === 1 && cols[0] === '#151515')) return;
  const [a, b = /marble|swirl|smoke|galaxy|splatter|haze/.test(c) ? '#151515' : a] = cols;
  if (/splatter|splash|speckle/.test(c)) {
    return `radial-gradient(circle at 30% 35%, ${b} 0 6%, transparent 7%), radial-gradient(circle at 68% 30%, ${b} 0 4%, transparent 5%), radial-gradient(circle at 60% 72%, ${b} 0 5%, transparent 6%), radial-gradient(circle at 25% 70%, ${b} 0 3%, transparent 4%), ${a}`;
  }
  if (/marble|swirl|galaxy|smoke|haze|mix/.test(c) || a !== b) {
    return `conic-gradient(from 20deg, ${a}, ${b}, ${a}, ${b}, ${a})`;
  }
  return a;
}
