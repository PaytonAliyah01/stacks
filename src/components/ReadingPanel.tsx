import { useEffect, useState } from 'react';
import { STATUS_LABELS, type Book, type ReadStatus, type Reading } from '../types';
import { newId } from '../lib/storage';
import { formatDay, lastPage, progressPct, todayIso } from '../lib/reading';

interface Props {
  book: Book;
  /** This book's read-throughs, newest first. */
  readings: Reading[];
  onChange: (r: Reading) => void;
  onRemove: (id: string) => void;
}

const STATUSES: ReadStatus[] = ['want', 'reading', 'read', 'dnf'];

/** Five stars, each split in half: click the left half for a half star. Click the same value again to clear. */
export function Stars({ value, onChange }: { value?: number; onChange?: (v: number | undefined) => void }) {
  const [hover, setHover] = useState<number>();
  const shown = hover ?? value ?? 0;
  return (
    <div className="stars" role={onChange ? 'radiogroup' : 'img'} aria-label={value ? `${value} out of 5 stars` : 'Not rated'} onMouseLeave={() => setHover(undefined)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = shown >= n ? 'full' : shown >= n - 0.5 ? 'half' : 'empty';
        return (
          <span key={n} className={`star ${fill}`}>
            ★
            {onChange &&
              [n - 0.5, n].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`star-hit ${v % 1 ? 'left' : 'right'}`}
                  aria-label={`${v} star${v === 1 ? '' : 's'}`}
                  aria-checked={value === v}
                  role="radio"
                  onMouseEnter={() => setHover(v)}
                  onClick={() => onChange(value === v ? undefined : v)}
                />
              ))}
          </span>
        );
      })}
      {onChange && <span className="stars-value">{value ? `${value} / 5` : 'Rate it'}</span>}
    </div>
  );
}

export function ReadingPanel({ book, readings, onChange, onRemove }: Props) {
  const current = readings[0];
  const earlier = readings.slice(1).filter((r) => r.status === 'read' || r.status === 'dnf');
  const pct = progressPct(current, book);
  const pages = book.pageCount;
  const [amount, setAmount] = useState('');

  useEffect(() => setAmount(''), [current?.id]);

  const save = (r: Reading) => onChange({ ...r, updatedAt: new Date().toISOString() });

  const fresh = (status: ReadStatus): Reading => {
    const now = new Date().toISOString();
    return { id: newId(), bookId: book.id, status, updates: [], createdAt: now, updatedAt: now };
  };

  const setStatus = (status: ReadStatus) => {
    const today = todayIso();
    const r = current ?? fresh(status);
    const next: Reading = { ...r, status };
    if (status === 'want') {
      next.startedOn = undefined;
      next.finishedOn = undefined;
    }
    if (status === 'reading') {
      next.startedOn ??= today;
      next.finishedOn = undefined;
    }
    if (status === 'read' || status === 'dnf') next.finishedOn ??= today;
    if (status === 'read' && pct !== 100) {
      next.updates = [...next.updates, pages ? { at: new Date().toISOString(), page: pages } : { at: new Date().toISOString(), percent: 100 }];
    }
    save(next);
  };

  const logProgress = () => {
    if (!current) return;
    const n = Number(amount);
    if (!amount.trim() || !Number.isFinite(n) || n < 0) return;
    const update = pages ? { at: new Date().toISOString(), page: Math.min(Math.round(n), pages) } : { at: new Date().toISOString(), percent: Math.min(Math.round(n), 100) };
    const done = pages ? update.page === pages : update.percent === 100;
    save({
      ...current,
      updates: [...current.updates, update],
      ...(done ? { status: 'read' as const, finishedOn: current.finishedOn ?? todayIso() } : {}),
    });
    setAmount('');
  };

  const recent = current ? [...current.updates].reverse().slice(0, 5) : [];

  return (
    <section className="reading-panel" aria-label="Reading">
      <div className="status-pick" role="radiogroup" aria-label="Reading status">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={current?.status === s}
            className={`status-option status-${s} ${current?.status === s ? 'on' : ''}`}
            onClick={() => setStatus(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {current?.status === 'reading' && (
        <>
          <div className="progress-line">
            <div className="progress-bar" aria-hidden="true"><i style={{ width: `${pct ?? 0}%` }} /></div>
            <span className="progress-text">
              {pct !== undefined ? `${pct}%` : 'Not started'}
              {lastPage(current) !== undefined && pages ? ` · page ${lastPage(current)} of ${pages}` : ''}
            </span>
          </div>
          {/* Not a <form>: this sits inside the book form, and forms can't nest. */}
          <div className="progress-form">
            <label className="field">
              <span>{pages ? `Page you're on (of ${pages})` : 'How far, in %'}</span>
              <input
                id="f-progress"
                data-scan-input
                type="number"
                min={0}
                max={pages ?? 100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    logProgress();
                  }
                }}
                placeholder={pages ? String(lastPage(current) ?? '') : String(pct ?? '')}
              />
            </label>
            <button className="btn primary" type="button" onClick={logProgress} disabled={!amount.trim()}>Update</button>
          </div>
          {!pages && <p className="hint">Add the page count under the details to track by page instead.</p>}
        </>
      )}

      {current && current.status !== 'want' && (
        <div className="grid-2 reading-dates">
          <label className="field">
            <span>Started</span>
            <input type="date" value={current.startedOn ?? ''} onChange={(e) => save({ ...current, startedOn: e.target.value || undefined })} />
          </label>
          {(current.status === 'read' || current.status === 'dnf') && (
            <label className="field">
              <span>{current.status === 'read' ? 'Finished' : 'Stopped'}</span>
              <input type="date" value={current.finishedOn ?? ''} onChange={(e) => save({ ...current, finishedOn: e.target.value || undefined })} />
            </label>
          )}
        </div>
      )}

      {recent.length > 0 && current?.status === 'reading' && (
        <ol className="progress-log">
          {recent.map((u) => (
            <li key={u.at}>
              <span>{u.page !== undefined ? `Page ${u.page}` : `${u.percent}%`}</span>
              <span className="muted">{formatDay(u.at)}</span>
            </li>
          ))}
        </ol>
      )}

      {(current?.status === 'read' || current?.status === 'dnf') && (
        <div className="rating-block">
          <Stars value={current.rating} onChange={(v) => save({ ...current, rating: v })} />
          <label className="field">
            <span>Your thoughts</span>
            <textarea
              id="f-review"
              rows={3}
              defaultValue={current.review ?? ''}
              key={current.id}
              placeholder="What did you think?"
              onBlur={(e) => {
                const v = e.target.value.trim() || undefined;
                if (v !== current.review) save({ ...current, review: v });
              }}
            />
          </label>
        </div>
      )}

      <div className="reading-actions">
        {(current?.status === 'read' || current?.status === 'dnf') && (
          <button
            type="button"
            className="link"
            onClick={() => save({ ...fresh('reading'), startedOn: todayIso() })}
          >
            Read it again
          </button>
        )}
        {current && (
          <button type="button" className="link muted-link" onClick={() => onRemove(current.id)}>
            {current.status === 'want' ? 'Remove from want to read' : readings.length > 1 ? 'Undo this read' : 'Clear reading status'}
          </button>
        )}
      </div>

      {earlier.length > 0 && (
        <div className="earlier-reads">
          <span className="section-label">Earlier reads</span>
          <ul>
            {earlier.map((r) => (
              <li key={r.id}>
                {r.status === 'dnf' ? "Didn't finish" : 'Read'}
                {r.startedOn || r.finishedOn ? ': ' : ''}
                {[formatDay(r.startedOn), formatDay(r.finishedOn)].filter(Boolean).join(' – ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
