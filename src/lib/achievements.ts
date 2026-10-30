import type { Book, Reading } from '../types';

/** A lifetime achievement: worked out from all your reading, not tied to a challenge. */
export interface Achievement {
  id: string;
  group: string;
  name: string;
  mark: string;
  description: string;
  earnedOn: string | null;
  /** How far along, for ones not earned yet. */
  progress?: { now: number; target: number };
}

interface Done {
  r: Reading;
  b: Book;
  on: string;
}

/** The day a running total first reached `target`. */
function reached(done: Done[], target: number, amount: (d: Done) => number): string | null {
  let sum = 0;
  for (const d of done) {
    sum += amount(d);
    if (sum >= target) return d.on;
  }
  return null;
}

export function achievementsOf(books: Book[], readings: Reading[]): Achievement[] {
  const byId = new Map(books.map((b) => [b.id, b]));
  const done: Done[] = readings
    .filter((r) => r.status === 'read' && byId.has(r.bookId))
    .map((r) => ({ r, b: byId.get(r.bookId)!, on: r.finishedOn ?? r.updatedAt.slice(0, 10) }))
    .sort((a, b) => a.on.localeCompare(b.on));
  const pages = done.reduce((n, d) => n + (d.b.pageCount ?? 0), 0);
  const list: Achievement[] = [];

  for (const [n, name] of [[1, 'First chapter'], [10, 'Ten down'], [25, 'Bookworm'], [50, 'Fifty books'], [100, 'Centurion'], [250, 'Library legend']] as const) {
    list.push({
      id: `books-${n}`, group: 'Books read', name, mark: String(n),
      description: `Finish ${n} book${n === 1 ? '' : 's'}.`,
      earnedOn: reached(done, n, () => 1),
      progress: { now: done.length, target: n },
    });
  }
  for (const [n, name] of [[1000, 'Thousand pages'], [10000, 'Ten thousand'], [50000, 'Page mountain'], [100000, 'Hundred thousand']] as const) {
    list.push({
      id: `pages-${n}`, group: 'Pages read', name, mark: n >= 1000 ? `${n / 1000}k` : String(n),
      description: `Read ${n.toLocaleString()} pages.`,
      earnedOn: reached(done, n, (d) => d.b.pageCount ?? 0),
      progress: { now: pages, target: n },
    });
  }

  const rated = readings.filter((r) => r.rating).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const reviewed = readings.filter((r) => r.review?.trim()).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const nth = (rs: Reading[], n: number) => (rs.length >= n ? (rs[n - 1].finishedOn ?? rs[n - 1].updatedAt.slice(0, 10)) : null);
  list.push(
    { id: 'rate-10', group: 'Opinions', name: 'Critic', mark: '★', description: 'Rate 10 books.', earnedOn: nth(rated, 10), progress: { now: rated.length, target: 10 } },
    { id: 'review-1', group: 'Opinions', name: 'First review', mark: '✎', description: 'Write about a book you finished.', earnedOn: nth(reviewed, 1), progress: { now: reviewed.length, target: 1 } },
    { id: 'review-10', group: 'Opinions', name: 'Reviewer', mark: '✎✎', description: 'Write about 10 books.', earnedOn: nth(reviewed, 10), progress: { now: reviewed.length, target: 10 } },
  );

  // Variety: different authors and genres, the day the count was reached.
  const firstReach = (key: (d: Done) => string[], n: number) => {
    const seen = new Set<string>();
    for (const d of done) {
      for (const k of key(d)) seen.add(k.toLowerCase());
      if (seen.size >= n) return { on: d.on, now: seen.size };
    }
    return { on: null, now: seen.size };
  };
  const authors = firstReach((d) => d.b.authors.slice(0, 1), 10);
  const genres = firstReach((d) => [...d.b.subjects.slice(0, 3), ...d.b.tags], 5);
  list.push(
    { id: 'authors-10', group: 'Variety', name: 'Explorer', mark: '10', description: 'Read books by 10 different authors.', earnedOn: authors.on, progress: { now: authors.now, target: 10 } },
    { id: 'genres-5', group: 'Variety', name: 'Genre hopper', mark: '5', description: 'Read across 5 different genres or tags.', earnedOn: genres.on, progress: { now: genres.now, target: 5 } },
  );

  // Habits.
  const counts = new Map<string, number>();
  let reread: string | null = null;
  for (const d of done) {
    const c = (counts.get(d.b.id) ?? 0) + 1;
    counts.set(d.b.id, c);
    if (c === 2 && !reread) reread = d.on;
  }
  const quick = done.find((d) => d.r.startedOn && (Date.parse(d.on) - Date.parse(d.r.startedOn)) / 86_400_000 <= 2);
  const epic = done.find((d) => (d.b.pageCount ?? 0) >= 800);
  const finisherCount = done.filter((d) => d.r.startedOn).length;
  list.push(
    { id: 'reread', group: 'Habits', name: 'Old friend', mark: '↺', description: 'Read a book a second time.', earnedOn: reread },
    { id: 'weekend', group: 'Habits', name: 'In one sitting', mark: '48h', description: 'Finish a book within two days of starting it.', earnedOn: quick?.on ?? null },
    { id: 'epic', group: 'Habits', name: 'Epic', mark: '800', description: 'Finish a book of 800 pages or more.', earnedOn: epic?.on ?? null },
    { id: 'tracker', group: 'Habits', name: 'Tracker', mark: '✓', description: 'Track 5 books from start to finish.', earnedOn: finisherCount >= 5 ? done.filter((d) => d.r.startedOn)[4].on : null, progress: { now: finisherCount, target: 5 } },
  );

  // Your own shelves.
  const owned = books.filter((b) => b.owned !== false && (!b.kind || b.kind === 'book'));
  const ownedRead = owned.filter((b) => done.some((d) => d.b.id === b.id));
  const byAdded = [...owned].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  list.push(
    { id: 'own-100', group: 'Your shelves', name: 'Collector', mark: '100', description: 'Own 100 books.', earnedOn: byAdded.length >= 100 ? byAdded[99].addedAt.slice(0, 10) : null, progress: { now: owned.length, target: 100 } },
    {
      id: 'own-read-25', group: 'Your shelves', name: 'Shelf reader', mark: '25', description: 'Read 25 of the books you own.',
      earnedOn: ownedRead.length >= 25 ? done.filter((d) => d.b.owned !== false)[24]?.on ?? null : null,
      progress: { now: ownedRead.length, target: 25 },
    },
  );
  return list;
}
