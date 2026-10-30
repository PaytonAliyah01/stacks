import { useMemo, useState } from 'react';
import type { Book, Reading } from '../types';
import { currentReading, formatDay, lastPage, progressPct, queueKey, todayIso } from '../lib/reading';
import { Cover } from './Cover';
import { UpNext } from './UpNext';
import { SessionForm, TodaySummary } from './ReadingTimer';
import type { ActiveSession } from '../lib/sessions';

interface Props {
  books: Book[];
  readings: Reading[];
  onOpen: (b: Book) => void;
  onChange: (r: Reading) => void;
}

export function QuickProgress({ book, reading, onChange }: { book: Book; reading: Reading; onChange: (r: Reading) => void }) {
  const [value, setValue] = useState('');
  const pages = book.pageCount;
  return (
    <form
      className="quick-progress"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (!value.trim() || !Number.isFinite(n) || n < 0) return;
        const at = new Date().toISOString();
        const update = pages ? { at, page: Math.min(Math.round(n), pages) } : { at, percent: Math.min(Math.round(n), 100) };
        const done = pages ? update.page === pages : update.percent === 100;
        onChange({
          ...reading,
          updates: [...reading.updates, update],
          ...(done ? { status: 'read' as const, finishedOn: todayIso() } : {}),
          updatedAt: at,
        });
        setValue('');
      }}
    >
      <input
        data-scan-input
        type="number"
        min={0}
        max={pages ?? 100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={pages ? `Page (of ${pages})` : '% read'}
        aria-label={pages ? `Page you're on in ${book.title}` : `Percent read of ${book.title}`}
      />
      <button className="btn ghost small-btn" type="submit" disabled={!value.trim()}>Update</button>
    </form>
  );
}

export function ReadingView({ books, readings, onOpen, onChange }: Props) {
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const thisYear = String(new Date().getFullYear());

  const { want, finished, years } = useMemo(() => {
    const current = books
      .filter((b) => !b.kind || b.kind === 'book')
      .map((b) => ({ book: b, r: currentReading(readings, b.id) }))
      .filter((x): x is { book: Book; r: Reading } => !!x.r);
    const done = readings
      .filter((r) => (r.status === 'read' || r.status === 'dnf') && byId.has(r.bookId))
      .sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''));
    const ys = [...new Set(done.map((r) => r.finishedOn?.slice(0, 4) ?? 'No date'))].sort().reverse();
    return {

      want: current.filter((x) => x.r.status === 'want').sort((a, b) => queueKey(a.r) - queueKey(b.r)),
      finished: done,
      years: ys.includes(thisYear) ? ys : [thisYear, ...ys],
    };
  }, [books, readings, byId, thisYear]);

  const [year, setYear] = useState(thisYear);
  const inYear = finished.filter((r) => (r.finishedOn?.slice(0, 4) ?? 'No date') === year);
  const readInYear = inYear.filter((r) => r.status === 'read');
  const pagesInYear = readInYear.reduce((n, r) => n + (byId.get(r.bookId)?.pageCount ?? 0), 0);

  return (
    <div className="reading-view">
      <UpNext queue={want} onOpen={onOpen} onChange={onChange} />

      <section className="panel">
        <div className="finished-head">
          <h3>Finished</h3>
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <p className="year-sum">
          <strong>{readInYear.length}</strong> {readInYear.length === 1 ? 'book' : 'books'}
          {pagesInYear > 0 && <> · <strong>{pagesInYear.toLocaleString()}</strong> pages</>}
          {inYear.length > readInYear.length && <span className="muted"> · {inYear.length - readInYear.length} not finished</span>}
        </p>
        {inYear.length > 0 && (
          <ol className="finished-list">
            {inYear.map((r) => {
              const book = byId.get(r.bookId)!;
              return (
                <li key={r.id}>
                  <button className="finished-item" onClick={() => onOpen(book)}>
                    <Cover url={book.coverUrl} title={book.title} author={book.authors[0]} size="sm" />
                    <span className="finished-text">
                      <strong>{book.title}</strong>
                      <span className="muted small">{book.authors.join(', ')}</span>
                    </span>
                    <span className="finished-date">
                      {r.status === 'dnf' ? "Didn't finish · " : ''}
                      {formatDay(r.finishedOn) || 'No date'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

/** What you're reading now, with quick page updates. Sits where the scanner is on the Reading page. */
export function NowReading({
  books,
  readings,
  onOpen,
  onChange,
  active,
  onStartTimer,
}: Props & { active: ActiveSession | null; onStartTimer: (r: Reading, b: Book) => void }) {
  const [logging, setLogging] = useState<string | null>(null);
  const reading = books
    .filter((b) => !b.kind || b.kind === 'book')
    .map((b) => ({ book: b, r: currentReading(readings, b.id) }))
    .filter((x): x is { book: Book; r: Reading } => x.r?.status === 'reading')
    .sort((a, b) => b.r.updatedAt.localeCompare(a.r.updatedAt));
  return (
      <section className="panel now-panel">
        <h3>Currently reading</h3>
        <TodaySummary readings={readings} />
        {reading.length === 0 ? (
          <p className="muted">Nothing on the go. Open a book and press “Reading” to start tracking it.</p>
        ) : (
          <ul className="now-reading">
            {reading.map(({ book, r }) => {
              const pct = progressPct(r, book);
              return (
                <li key={r.id}>
                  <button className="now-cover" onClick={() => onOpen(book)} aria-label={`Open ${book.title}`}>
                    <Cover url={book.coverUrl} title={book.title} author={book.authors[0]} size="sm" />
                  </button>
                  <div className="now-body">
                    <button className="link now-title" onClick={() => onOpen(book)}>{book.title}</button>
                    <span className="muted small">{book.authors.join(', ')}</span>
                    <div className="progress-line">
                      <div className="progress-bar" aria-hidden="true"><i style={{ width: `${pct ?? 0}%` }} /></div>
                      <span className="progress-text">
                        {pct !== undefined ? `${pct}%` : 'Not started'}
                        {lastPage(r) !== undefined && book.pageCount ? ` · p. ${lastPage(r)}/${book.pageCount}` : ''}
                      </span>
                    </div>
                    <span className="muted small">Started {formatDay(r.startedOn) || 'recently'}</span>
                    <QuickProgress book={book} reading={r} onChange={onChange} />
                    {logging === r.id ? (
                      <SessionForm
                        book={book}
                        reading={r}
                        onSave={(x) => {
                          onChange(x);
                          setLogging(null);
                        }}
                        onCancel={() => setLogging(null)}
                      />
                    ) : (
                      <div className="timer-start">
                        {active?.readingId === r.id ? (
                          <span className="muted small">Timer running</span>
                        ) : (
                          <button className="btn ghost small-btn" onClick={() => onStartTimer(r, book)} disabled={!!active} title={active ? 'Another timer is running' : undefined}>
                            ▶ Start timer
                          </button>
                        )}
                        <button className="link small" onClick={() => setLogging(r.id)}>Log time</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
  );
}
