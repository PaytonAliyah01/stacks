import { useMemo, useState } from 'react';
import type { Book, Reading } from '../types';
import { STATUS_LABELS } from '../types';
import { groupSeries, titleWithoutSeries, type SeriesGroup } from '../lib/series';
import { Cover } from './Cover';

interface Props {
  books: Book[];
  readings: Reading[];
  onOpen: (b: Book) => void;
  /** Save a book's series or number. */
  onUpdate: (b: Book) => void;
  /** Look up a missing book to put on the wishlist. */
  onFindMissing: (seriesName: string, number: number) => void;
}

function NumberFix({ entry, onUpdate }: Readonly<{ entry: { book: Book }; onUpdate: (b: Book) => void }>) {
  const [v, setV] = useState('');
  const save = () => {
    const n = Number(v.replace(',', '.'));
    if (Number.isNaN(n) || n <= 0) return;
    onUpdate({ ...entry.book, series: { ...entry.book.series!, number: n }, seriesManual: true });
  };
  return (
    <span className="number-fix">
      <input
        type="number"
        min={0}
        step="any"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="#"
        aria-label={`Number of ${entry.book.title} in the series`}
      />
      <button className="btn ghost small-btn" onClick={save} disabled={Number.isNaN(Number(v)) || Number(v) <= 0}>Set</button>
    </span>
  );
}

/** Rename the series, change any book's number, or take a book out. */
function EditSeries({ group, onUpdate, onDone }: Readonly<{ group: SeriesGroup; onUpdate: (b: Book) => void; onDone: () => void }>) {
  const all = [...group.entries, ...group.unnumbered];
  const [name, setName] = useState(group.name);
  const [nums, setNums] = useState<Record<string, string>>(() =>
    Object.fromEntries(all.map((e) => [e.book.id, e.number !== undefined ? String(e.number) : ''])),
  );
  const save = () => {
    const finalName = name.trim() || group.name;
    for (const e of all) {
      const n = Number((nums[e.book.id] ?? '').replace(',', '.'));
      const number = n > 0 ? n : undefined;
      if (finalName === e.book.series?.name && number === e.book.series?.number) continue;
      onUpdate({ ...e.book, series: { name: finalName, number }, seriesChecked: true, seriesManual: true });
    }
    onDone();
  };
  return (
    <div className="edit-series">
      <label className="edit-series-name">
        <span className="small muted">Series name</span>
        <input id="series-rename" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </label>
      <p className="small muted">Change the numbers to put the books in the right order. Leave a number empty if you don't know it.</p>
      <ul className="edit-series-books">
        {all
          .slice()
          .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.book.title.localeCompare(b.book.title))
          .map((e) => (
            <li key={e.book.id}>
              <input
                type="number"
                min={0}
                step="any"
                value={nums[e.book.id] ?? ''}
                onChange={(ev) => setNums({ ...nums, [e.book.id]: ev.target.value })}
                placeholder="#"
                aria-label={`Number of ${e.book.title} in the series`}
              />
              <span className="edit-series-title">{titleWithoutSeries(e.book.title)}</span>
              <button
                className="btn ghost small-btn"
                title="This book isn't part of this series"
                onClick={() => onUpdate({ ...e.book, series: undefined, seriesChecked: true, seriesManual: true })}
              >
                Not in series
              </button>
            </li>
          ))}
      </ul>
      <div className="edit-series-actions">
        <button className="btn" onClick={save}>Save</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Fold this series into another one, for when Stacks didn't see they're the same. */
function MergeSeries({ group, others, onUpdate }: Readonly<{ group: SeriesGroup; others: string[]; onUpdate: (b: Book) => void }>) {
  if (!others.length) return null;
  return (
    <select
      className="merge-series"
      value=""
      onChange={(e) => {
        const target = e.target.value;
        if (!target) return;
        for (const x of [...group.entries, ...group.unnumbered]) {
          onUpdate({ ...x.book, series: { name: target, number: x.number }, seriesChecked: true, seriesManual: true });
        }
      }}
      aria-label={`Merge ${group.name} into another series`}
    >
      <option value="">Same series as…</option>
      {others.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

/** Pick one of your books by the same author to add to this series. */
function AddToSeries({ group, books, onUpdate }: Readonly<{ group: SeriesGroup; books: Book[]; onUpdate: (b: Book) => void }>) {
  const [id, setId] = useState('');
  const [n, setN] = useState('');
  const authors = new Set(group.authors.map((a) => a.toLowerCase()));
  const options = books
    .filter((b) => !b.series && b.authors.some((a) => authors.has(a.toLowerCase())))
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!options.length) return null;
  return (
    <div className="add-to-series">
      <select value={id} onChange={(e) => setId(e.target.value)} aria-label={`Add a book to ${group.name}`}>
        <option value="">+ Add one of your books to this series…</option>
        {options.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
      </select>
      {id && (
        <>
          <input type="number" min={0} step="any" value={n} onChange={(e) => setN(e.target.value)} placeholder="#" aria-label="Number in the series" />
          <button
            className="btn ghost small-btn"
            onClick={() => {
              const b = books.find((x) => x.id === id)!;
              const num = Number(n.replace(',', '.'));
              onUpdate({ ...b, series: { name: group.name, number: num > 0 ? num : undefined }, seriesChecked: true, seriesManual: true });
              setId('');
              setN('');
            }}
          >
            Add
          </button>
        </>
      )}
    </div>
  );
}

export function SeriesView({ books, readings, onOpen, onUpdate, onFindMissing }: Readonly<Props>) {
  const groups = useMemo(() => groupSeries(books, readings), [books, readings]);
  const [filter, setFilter] = useState<'all' | 'gaps' | 'unfinished'>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const shown = groups.filter((g) =>
    filter === 'gaps' ? g.missing.length > 0 : filter === 'unfinished' ? g.read < g.entries.length : true,
  );

  if (groups.length === 0) {
    return (
      <div className="empty">
        <p>No series yet. Stacks fills them in from Open Library and from Goodreads titles like “Leviathan Wakes (The Expanse, #1)”. You can also open a book and press “+ Part of a series?”.</p>
      </div>
    );
  }

  return (
    <div className="series-view">
      <div className="finished-head">
        <p className="muted">
          {groups.length} series · {groups.reduce((n, g) => n + g.missing.length, 0)} gaps
        </p>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Show">
          <option value="all">All series</option>
          <option value="gaps">With missing books</option>
          <option value="unfinished">Not finished reading</option>
        </select>
      </div>
      {shown.map((g) => {
        // Missing numbers sit in their place among the books.
        const slots: ({ kind: 'book'; e: (typeof g.entries)[number] } | { kind: 'gap'; n: number })[] = [];
        const gaps = [...g.missing];
        for (const e of g.entries) {
          while (gaps.length && gaps[0] < e.number!) slots.push({ kind: 'gap', n: gaps.shift()! });
          slots.push({ kind: 'book', e });
        }
        for (const n of gaps) slots.push({ kind: 'gap', n });
        return (
          <section key={g.name} className="panel series-card">
            <div className="series-head">
              <h3 className="series-title">{g.name}</h3>
              <span className="muted small">
                {g.owned} owned · {g.read} read{g.missing.length ? ` · ${g.missing.length} missing` : ''}
              </span>
              {editing !== g.name && (
                <button className="btn ghost small-btn series-edit-btn" onClick={() => setEditing(g.name)}>Edit series</button>
              )}
            </div>
            {editing === g.name && <EditSeries group={g} onUpdate={onUpdate} onDone={() => setEditing(null)} />}
            <div className="progress-bar series-progress" aria-hidden="true">
              <i style={{ width: `${Math.round((g.read / Math.max(1, g.entries.length + g.unnumbered.length + g.missing.length)) * 100)}%` }} />
            </div>
            {g.next && (
              <p className="small">
                Next up: <button className="link" onClick={() => onOpen(g.next!)}>{titleWithoutSeries(g.next.title)}</button>
              </p>
            )}
            <ol className="series-row">
              {slots.map((s) =>
                s.kind === 'book' ? (
                  <li key={s.e.book.id}>
                    <button className={`series-book${s.e.status === 'read' ? ' is-read' : ''}${s.e.book.owned === false ? ' not-owned' : ''}`} onClick={() => onOpen(s.e.book)} title={s.e.book.title}>
                      <span className="series-num-badge">{s.e.number}</span>
                      <Cover url={s.e.book.coverUrl} title={s.e.book.title} author={s.e.book.authors[0]} size="sm" />
                      <span className="series-book-title">{titleWithoutSeries(s.e.book.title)}</span>
                      <span className="series-book-status">
                        {s.e.status ? STATUS_LABELS[s.e.status] : null}
                        {!s.e.status && s.e.book.wishlist ? 'On wishlist' : null}
                        {!s.e.status && !s.e.book.wishlist && (s.e.book.owned === false) ? 'Not owned' : null}
                        {!s.e.status && !s.e.book.wishlist && !(s.e.book.owned === false) ? 'Unread' : null}
                      </span>
                    </button>
                  </li>
                ) : (
                  <li key={`gap-${s.n}`}>
                    <button className="series-gap" onClick={() => onFindMissing(g.name, s.n)} title={`Find ${g.name} #${s.n}`}>
                      <span className="series-num-badge">{s.n}</span>
                      <span className="gap-box">Missing</span>
                      <span className="series-book-status">Find it</span>
                    </button>
                  </li>
                ),
              )}
            </ol>
            {g.unnumbered.length > 0 && (
              <div className="unnumbered">
                <p className="small">
                  <strong>Which number {g.unnumbered.length === 1 ? 'is this' : 'are these'}?</strong>{' '}
                  <span className="muted">Set {g.unnumbered.length === 1 ? 'it' : 'them'} so the gaps above are right.</span>
                </p>
                <ul>
                  {g.unnumbered.map((e) => (
                    <li key={e.book.id}>
                      <button className="link" onClick={() => onOpen(e.book)}>{titleWithoutSeries(e.book.title)}</button>
                      <span className="muted small">{e.status ? STATUS_LABELS[e.status] : null}
                      {!e.status && (e.book.owned === false) ? 'Not owned' : null}
                      {!e.status && !(e.book.owned === false) ? 'Unread' : null}</span>
                      <NumberFix entry={e} onUpdate={onUpdate} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="series-tools">
              <AddToSeries group={g} books={books} onUpdate={onUpdate} />
              <MergeSeries group={g} others={groups.filter((x) => x !== g).map((x) => x.name)} onUpdate={onUpdate} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
