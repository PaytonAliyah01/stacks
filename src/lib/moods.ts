import type { Book } from '../types';

/** The same 14 moods StoryGraph uses, so imports line up. */
export const MOODS = [
  'adventurous', 'challenging', 'dark', 'emotional', 'funny', 'hopeful', 'informative',
  'inspiring', 'lighthearted', 'mysterious', 'reflective', 'relaxing', 'sad', 'tense',
] as const;
export type Mood = (typeof MOODS)[number];

export type Pace = 'slow' | 'medium' | 'fast';
export const PACES: Pace[] = ['slow', 'medium', 'fast'];

/** Suggestions only; any warning can be typed in. */
export const COMMON_WARNINGS = [
  'violence', 'death', 'grief', 'abuse', 'sexual content', 'self-harm', 'suicide', 'addiction',
  'animal death', 'war', 'racism', 'mental illness', 'gore', 'cancer', 'pregnancy loss',
];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Reads moods from StoryGraph's "Moods" column, keeping only ones we know. */
export function parseMoods(raw: string): Mood[] {
  const known = new Set<string>(MOODS);
  return [...new Set(raw.split(',').map((m) => m.trim().toLowerCase()).filter((m) => known.has(m)))] as Mood[];
}

export function parsePace(raw: string): Pace | undefined {
  const p = raw.trim().toLowerCase();
  return (PACES as string[]).includes(p) ? (p as Pace) : undefined;
}

/** StoryGraph lists warnings as "Graphic: violence; Moderate: grief" or plain comma lists. */
export function parseWarnings(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[;,]/)
        .map((w) => w.replace(/^\s*(graphic|moderate|minor)\s*:\s*/i, '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export const hasVibe = (b: Book) => !!(b.moods?.length || b.pace || b.contentWarnings?.length);

/** A filter value like "mood:dark" or "pace:fast"; "any" matches everything. */
export function matchesVibe(b: Book, filter: string): boolean {
  if (filter === 'any') return true;
  const [kind, value] = filter.split(':');
  if (kind === 'mood') return !!b.moods?.includes(value);
  if (kind === 'pace') return b.pace === value;
  return true;
}

/*
 * Guessing moods from genres. Book databases don't publish moods, but they do
 * publish subjects ("Psychological fiction", "Humorous stories", "Murder"),
 * and those say a lot about how a book feels.
 */
const MOOD_RULES: [RegExp, Mood[]][] = [
  [/horror|ghost|haunt|supernatural|vampire|zombie/, ['dark', 'tense']],
  [/thriller|suspense/, ['tense', 'mysterious']],
  [/myster|detective|crime|whodunit/, ['mysterious', 'tense']],
  [/murder|serial kill|psychopath/, ['dark', 'tense']],
  [/humou?r|comed|comic|satir|funny|parod/, ['funny', 'lighthearted']],
  [/romance|love stor|romantic/, ['emotional', 'hopeful']],
  [/adventure|quest|voyage|explor|pirate|treasure/, ['adventurous']],
  [/fantasy|magic|dragon|wizard|fairy/, ['adventurous']],
  [/science fiction|sci-fi|space|dystop|time travel|robot|cyberpunk/, ['adventurous', 'challenging']],
  [/dystop|apocalyp/, ['dark', 'tense']],
  [/war\b|world war|military|soldier|holocaust/, ['dark', 'emotional']],
  [/grief|death|dying|loss|bereave|mourning/, ['sad', 'emotional']],
  [/tragedy|tragic/, ['sad', 'dark']],
  [/family|friendship|coming of age|bildungsroman|young adult/, ['emotional', 'hopeful']],
  [/psycholog|philosoph|existential/, ['reflective', 'challenging']],
  [/literary|classic/, ['reflective', 'challenging']],
  [/poetry|poems|essays|meditation|nature writing/, ['reflective', 'relaxing']],
  [/history|historical|biograph|memoir|autobiograph/, ['informative', 'reflective']],
  [/science\b|popular science|nonfiction|non-fiction|economics|politic|sociology|psychology\b/, ['informative']],
  [/self-help|self help|personal development|success|motivat|leadership|spiritual|mindful/, ['inspiring', 'informative']],
  [/cozy|cosy|feel-good|feel good|wholesome|cooking|gardening/, ['relaxing', 'lighthearted']],
  [/children|picture book|juvenile/, ['lighthearted', 'funny']],
  [/inspir|hope|resilien|courage|overcom/, ['inspiring', 'hopeful']],
];

const FAST = /thriller|suspense|action|adventure|horror|young adult|juvenile|page-?turner|crime|myster/;
const SLOW = /literary|classic|philosoph|poetry|essays|history|historical|biograph|epic|meditation/;

const WARNING_RULES: [RegExp, string][] = [
  [/violence|violent|murder|assault|torture/, 'violence'],
  [/\bdeath\b|dying/, 'death'],
  [/grief|bereave|mourning/, 'grief'],
  [/suicide/, 'suicide'],
  [/self-harm|self harm/, 'self-harm'],
  [/child abuse|domestic violence|\babuse/, 'abuse'],
  [/rape|sexual (abuse|assault|violence)/, 'sexual violence'],
  [/drug|addiction|alcoholism/, 'addiction'],
  [/racism|race relations|slavery/, 'racism'],
  [/\bwar\b|world war|genocide|holocaust/, 'war'],
  [/mental illness|depression|mental health|schizophren/, 'mental illness'],
  [/cancer/, 'cancer'],
];

export interface VibeGuess {
  moods: Mood[];
  pace?: Pace;
  contentWarnings: string[];
}

/** Up to three moods, a pace and likely warnings from a list of subjects. Empty when there's nothing to go on. */
export function guessVibe(subjects: string[]): VibeGuess {
  const text = subjects.map((s) => s.toLowerCase());
  const score = new Map<Mood, number>();
  let fast = 0;
  let slow = 0;
  const warnings = new Set<string>();
  // "Fiction" alone, or a library code, says nothing.
  for (const s of text.filter((t) => t.length >= 4)) {
    for (const m of MOOD_RULES.filter(([re]) => re.test(s)).flatMap(([, ms]) => ms)) score.set(m, (score.get(m) ?? 0) + 1);
    if (FAST.test(s)) fast++;
    if (SLOW.test(s)) slow++;
    for (const [re, w] of WARNING_RULES) if (re.test(s)) warnings.add(w);
  }
  const moods = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);
  const pace = paceOf(fast, slow);
  return { moods, pace, contentWarnings: [...warnings] };
}

function paceOf(fast: number, slow: number): Pace | undefined {
  if (fast > slow) return 'fast';
  if (slow > fast) return 'slow';
  return fast > 0 ? 'medium' : undefined;
}
