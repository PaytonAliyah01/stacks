import { useMemo, useState } from 'react';
import type { Book, Reading } from '../types';
import { queueKey, todayIso } from '../lib/reading';
import { Cover } from './Cover';
import { VibeSelect } from './VibeSelect';
import { cap, matchesVibe } from '../lib/moods';
import { seriesLabel } from '../lib/series';

interface Props {
  /** Want-to-read books, in queue order. */
  queue: { book: Book; r: Reading }[];
  onOpen: (b: Book) => void;
  onChange: (r: Reading) => void;
}

type Length = 'any' | 'short' | 'medium' | 'long';
const LENGTHS: Record<Length, [string, (p?: number) => boolean]> = {
  any: ['Any length', () => true],
  short: ['Short (under 300 pages)', (p) => !!p && p < 300],
  medium: ['Medium (300–500)', (p) => !!p && p >= 300 && p <= 500],
  long: ['Long (over 500)', (p) => !!p && p > 500],
};
const SHOWN = 8;

/** Moves one reading to a new place in the queue by giving it a key between its new neighbours. */
function moveTo(queue: Props['queue'], from: number, to: number): Reading | undefined {
  if (from === to || to < 0 || to >= queue.length) return;
  const rest = queue.filter((_, i) => i !== from).map((x) => queueKey(x.r));
  // Halfway between the new neighbours, or a minute past the end.
  let order: number;
  if (to === 0) order = rest[to] - 60_000;
  else if (to >= rest.length) order = rest[to - 1] + 60_000;
  else order = (rest[to - 1] + rest[to]) / 2;
  return { ...queue[from].r, queueOrder: order, updatedAt: new Date().toISOString() };
}

const startReading = (r: Reading): Reading => {
  const now = new Date().toISOString();
  return { ...r, status: 'reading', startedOn: r.startedOn ?? todayIso(), updatedAt: now };
};

function Picker({ queue, onOpen, onChange, onClose }: Readonly<Props & { onClose: () => void }>) {
  const [length, setLength] = useState<Length>('any');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [topic, setTopic] = useState('any');
  const [vibe, setVibe] = useState('any');
  const [seed, setSeed] = useState(0);

  const topics = useMemo(() => {
    const m = new Map<string, number>();
    for (const { book } of queue) for (const t of new Set([...book.tags, ...book.subjects.slice(0, 3)])) if (t) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].filter(([, n]) => n > 1 || m.size < 12).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);
  }, [queue]);

  const pool = queue
    .map((x, i) => ({ ...x, i }))
    .filter(({ book }) => LENGTHS[length][1](book.pageCount))
    .filter(({ book }) => !ownedOnly || book.owned !== false)
    .filter(({ book }) => matchesVibe(book, vibe))
    .filter(({ book }) => topic === 'any' || book.tags.includes(topic) || book.subjects.slice(0, 3).includes(topic));

  // Three different books, picked at random but leaning toward the top of your queue.
  const picks = useMemo(() => {
    const left = [...pool];
    const out: typeof pool = [];
    while (out.length < 3 && left.length) {
      const weights = left.map((x) => 1 / (1 + x.i * 0.25));
      let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
      let k = 0;
      while (k < left.length - 1 && (roll -= weights[k]) > 0) k++;
      out.push(left.splice(k, 1)[0]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, length, ownedOnly, topic, vibe, queue]);

  return (
    <div className="picker">
      <div className="picker-head">
        <strong>What should I read next?</strong>
        <button className="link muted-link" onClick={onClose}>Close</button>
      </div>
      <div className="picker-filters">
        <select value={length} onChange={(e) => setLength(e.target.value as Length)} aria-label="Length">
          {(Object.keys(LENGTHS) as Length[]).map((k) => <option key={k} value={k}>{LENGTHS[k][0]}</option>)}
        </select>
        <VibeSelect value={vibe} onChange={setVibe} />
        {topics.length > 0 && (
          <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Genre or tag">
            <option value="any">Any genre or tag</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} /> Only books I own</label>
        <button className="btn ghost small-btn" onClick={() => setSeed((n) => n + 1)} disabled={pool.length <= 3}>Shuffle</button>
      </div>
      {picks.length === 0 ? (
        <p className="muted">Nothing on your list matches. Try another filter.</p>
      ) : (
        <ul className="picks">
          {picks.map(({ book, r, i }) => (
            <li key={r.id} className="pick">
              <button className="pick-cover" onClick={() => onOpen(book)} aria-label={`Open ${book.title}`}>
                <Cover url={book.coverUrl} title={book.title} author={book.authors[0]} size="sm" />
              </button>
              <div className="pick-body">
                <button className="link pick-title" onClick={() => onOpen(book)}>{book.title}</button>
                <span className="muted small">{book.authors.join(', ')}</span>
                <span className="muted small">
                  #{i + 1} in your queue{book.pageCount ? ` · ${book.pageCount} pages` : ''}{book.owned === false ? ' · not owned' : ''}
                </span>
                <MoodTags book={book} />
                <button className="btn primary small-btn" onClick={() => onChange(startReading(r))}>Start reading</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MoodTags({ book }: Readonly<{ book: Book }>) {
  const tags = [...(book.moods ?? []).slice(0, 3).map(cap), ...(book.pace ? [`${cap(book.pace)} paced`] : [])];
  if (!tags.length) return null;
  return (
    <span className="mood-tags">
      {tags.map((t) => <span key={t} className="mood-tag">{t}</span>)}
    </span>
  );
}

/** The ordered to-read list, with drag or arrow reordering and the "what next" picker. */
export function UpNext({ queue, onOpen, onChange }: Readonly<Props>) {
  const [all, setAll] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    const r = moveTo(queue, from, to);
    if (r) onChange(r);
  };
  const shown = all ? queue : queue.slice(0, SHOWN);

  return (
    <section className="panel up-next">
      <div className="finished-head">
        <h3>Up next · {queue.length}</h3>
        {queue.length > 0 && !picking && (
          <button className="btn ghost small-btn" onClick={() => setPicking(true)}>What should I read next?</button>
        )}
      </div>
      {picking && queue.length > 0 && <Picker queue={queue} onOpen={onOpen} onChange={onChange} onClose={() => setPicking(false)} />}
      {queue.length === 0 ? (
        <p className="muted">Open a book and press “Want to read” to line it up here.</p>
      ) : (
        <>
          <p className="muted small">Drag books, or use the arrows, to put them in the order you want to read them.</p>
          <ol className="queue">
            {shown.map(({ book, r }, i) => (
              <li
                key={r.id}
                className={`queue-item${dragFrom === i ? ' dragging' : ''}${dropAt === i && dragFrom !== i ? ' drop-here' : ''}`}
                draggable
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', r.id);
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  setDropAt(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) move(dragFrom, i);
                  setDragFrom(null);
                  setDropAt(null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDropAt(null);
                }}
              >
                <span className="queue-num" aria-hidden="true">{i + 1}</span>
                <span className="queue-grip" aria-hidden="true">⋮⋮</span>
                <button className="queue-cover" onClick={() => onOpen(book)} aria-label={`Open ${book.title}`} tabIndex={-1}>
                  <Cover url={book.coverUrl} title={book.title} author={book.authors[0]} size="sm" />
                </button>
                <span className="queue-text">
                  <button className="link queue-title" onClick={() => onOpen(book)}>{book.title}</button>
                  <span className="muted small">
                    {book.authors.join(', ')}
                    {book.series ? ` · ${seriesLabel(book.series)}` : ''}
                    {book.pageCount ? ` · ${book.pageCount} pages` : ''}
                    {book.owned === false ? ' · not owned' : ''}
                  </span>
                  <MoodTags book={book} />
                </span>
                <span className="queue-tools">
                  <button className="icon-btn" onClick={() => move(i, 0)} disabled={i === 0} aria-label={`Move ${book.title} to the top`} title="Move to top">⤒</button>
                  <button className="icon-btn" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${book.title} up`} title="Up">↑</button>
                  <button className="icon-btn" onClick={() => move(i, i + 1)} disabled={i === queue.length - 1} aria-label={`Move ${book.title} down`} title="Down">↓</button>
                  <button className="btn ghost small-btn" onClick={() => onChange(startReading(r))}>Start</button>
                </span>
              </li>
            ))}
          </ol>
          {queue.length > SHOWN && (
            <button className="link" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${queue.length}`}</button>
          )}
        </>
      )}
    </section>
  );
}
