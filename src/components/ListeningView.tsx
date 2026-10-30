import { useMemo, useState } from 'react';
import type { Book, Spin } from '../types';
import { KIND_LABELS, kindOf } from '../types';
import { Cover } from './Cover';
import { Bars } from './Stats';
import { favoriteTracks } from '../lib/tracks';
import { StylusPanel } from './StylusPanel';
import type { Stylus } from '../lib/stylus';
import {
  DUSTY_DAYS,
  agoLabel,
  daysSince,
  nowSpinning,
  periodStarts,
  pickRecord,
  playsByRecord,
  spinStreak,
  spinsPerMonth,
  spinsPerWeekday,
  spinsSince,
  topArtists,
} from '../lib/spins';

interface Props {
  /** The records and CDs you own. */
  records: Book[];
  spins: Spin[];
  onSpin: (b: Book) => void;
  onOpen: (b: Book) => void;
  onRemoveSpin: (id: string) => void;
  /** Every record, including ones you've sold since (their plays still wore the stylus). */
  allRecords?: Book[];
  styluses?: Stylus[];
  onStylusChange?: (list: Stylus[]) => void;
}

const sub = (b: Book) => [b.authors[0], KIND_LABELS[kindOf(b)].one, b.publishedDate?.slice(0, 4)].filter(Boolean).join(' · ');

function RecordRow({ b, note, onOpen, onSpin }: { b: Book; note?: string; onOpen: (b: Book) => void; onSpin: (b: Book) => void }) {
  return (
    <li className="record-row">
      <button className="record-open" onClick={() => onOpen(b)}>
        <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" square />
        <span className="record-text">
          <strong>{b.title}</strong>
          <span className="muted small">{note ?? sub(b)}</span>
        </span>
      </button>
      <button className="btn ghost small-btn spin-btn" onClick={() => onSpin(b)} aria-label={`Spin ${b.title}`}>▶ Spin</button>
    </li>
  );
}

function RecordList({ items, empty, onOpen, onSpin, note }: { items: Book[]; empty: string; onOpen: (b: Book) => void; onSpin: (b: Book) => void; note?: (b: Book) => string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <>
      <ul className="record-list">
        {(all ? items : items.slice(0, 6)).map((b) => <RecordRow key={b.id} b={b} note={note?.(b)} onOpen={onOpen} onSpin={onSpin} />)}
      </ul>
      {items.length > 6 && <button className="link small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </>
  );
}

export function ListeningView({ records, spins, onSpin, onOpen, onRemoveSpin, allRecords, styluses, onStylusChange }: Props) {
  const byId = useMemo(() => new Map(records.map((b) => [b.id, b])), [records]);
  const mine = useMemo(() => spins.filter((s) => byId.has(s.bookId)), [spins, byId]);
  const plays = useMemo(() => playsByRecord(mine), [mine]);
  const [kind, setKind] = useState<'all' | 'vinyl' | 'cd'>('all');
  const [pick, setPick] = useState<Book>();

  const now = nowSpinning(mine);
  const nowBook = now && byId.get(now.bookId);
  const starts = periodStarts();
  const never = records.filter((b) => !plays.has(b.id) && !b.loan).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const dusty = records
    .filter((b) => {
      const last = plays.get(b.id)?.last;
      return last && daysSince(last) >= DUSTY_DAYS;
    })
    .sort((a, b) => plays.get(a.id)!.last!.localeCompare(plays.get(b.id)!.last!));
  const most = records
    .filter((b) => plays.has(b.id))
    .sort((a, b) => plays.get(b.id)!.count - plays.get(a.id)!.count || plays.get(b.id)!.last!.localeCompare(plays.get(a.id)!.last!))
    .slice(0, 10);
  const recent = [...mine].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  const streak = spinStreak(mine);
  const listened = records.length ? Math.round((plays.size / records.length) * 100) : 0;

  const doPick = () => {
    const pool = kind === 'all' ? records : records.filter((b) => kindOf(b) === kind);
    setPick(pickRecord(pool, plays, pick?.id));
  };

  return (
    <div className="listening-view">
      {nowBook && (
        <div className="now-spinning">
          <Cover url={nowBook.coverUrl} title={nowBook.title} author={nowBook.authors[0]} size="md" square />
          <div>
            <span className="stat-label">Now spinning</span>
            <button className="link now-title" onClick={() => onOpen(nowBook)}>{nowBook.title}</button>
            <span className="muted">{nowBook.authors.join(', ')}</span>
            <span className="muted small">
              Put on at {new Date(now!.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · play {plays.get(nowBook.id)?.count ?? 1}
            </span>
          </div>
          <span className="vinyl-disc" aria-hidden="true" />
        </div>
      )}

      <section className="panel picker-panel">
        <div className="spins-head">
          <div>
            <h3>What should I put on?</h3>
            <p className="muted small">Picks from your shelves, leaning toward records you haven't played in a while.</p>
          </div>
          <div className="picker-controls">
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Vinyl or CD">
              <option value="all">Vinyl and CDs</option>
              <option value="vinyl">Vinyl only</option>
              <option value="cd">CDs only</option>
            </select>
            <button className="btn primary" onClick={doPick} disabled={!records.length}>{pick ? 'Pick another' : 'Pick one for me'}</button>
          </div>
        </div>
        {pick && (
          <div className="pick-result">
            <Cover url={pick.coverUrl} title={pick.title} author={pick.authors[0]} size="md" square />
            <div className="record-text">
              <button className="link now-title" onClick={() => onOpen(pick)}>{pick.title}</button>
              <span className="muted">{sub(pick)}</span>
              <span className="muted small">{plays.get(pick.id)?.last ? `Last played ${agoLabel(plays.get(pick.id)!.last!)}` : 'You have never played this one'}</span>
              <button
                className="btn primary spin-btn"
                onClick={() => {
                  onSpin(pick);
                  setPick(undefined);
                }}
              >
                ▶ Spin it
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="stat-row stat-row-4">
        <div className="stat">
          <span className="stat-label">This week</span>
          <span className="stat-value">{spinsSince(mine, starts.week)}</span>
          <span className="muted">spins</span>
        </div>
        <div className="stat">
          <span className="stat-label">This month</span>
          <span className="stat-value">{spinsSince(mine, starts.month)}</span>
          <span className="muted">{spinsSince(mine, starts.year)} this year</span>
        </div>
        <div className="stat">
          <span className="stat-label">Day streak</span>
          <span className="stat-value">{streak}</span>
          <span className="muted">{streak ? 'days in a row with music' : 'spin something today'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Collection played</span>
          <span className="stat-value">{listened}%</span>
          <span className="muted">{plays.size} of {records.length} at least once</span>
        </div>
      </div>

      {styluses && onStylusChange && <StylusPanel records={allRecords ?? records} spins={spins} styluses={styluses} onChange={onStylusChange} />}

      <div className="stat-grid">
        <section className="panel">
          <h3>Never played</h3>
          <p className="muted small">{never.length ? `${never.length} in your collection with no plays yet.` : ' '}</p>
          <RecordList items={never} empty="You've played everything at least once. Nice." onOpen={onOpen} onSpin={onSpin} note={(b) => `${b.authors[0] ?? ''} · added ${agoLabel(b.addedAt)}`} />
        </section>
        <section className="panel">
          <h3>Gathering dust</h3>
          <p className="muted small">Not played in the last 6 months.</p>
          <RecordList items={dusty} empty="Nothing yet. Records show up here when you haven't played them for 6 months." onOpen={onOpen} onSpin={onSpin} note={(b) => `${b.authors[0] ?? ''} · last played ${agoLabel(plays.get(b.id)!.last!)}`} />
        </section>
        <section className="panel">
          <h3>Most played</h3>
          {most.length ? (
            <ol className="record-list most-played">
              {most.map((b) => (
                <RecordRow key={b.id} b={b} note={`${b.authors[0] ?? ''} · ${plays.get(b.id)!.count} ${plays.get(b.id)!.count === 1 ? 'play' : 'plays'}`} onOpen={onOpen} onSpin={onSpin} />
              ))}
            </ol>
          ) : (
            <p className="muted">Press Spin on a record when you put it on, and your favorites show up here.</p>
          )}
        </section>
        <section className="panel">
          <h3>Favorite tracks</h3>
          {favoriteTracks(records).length ? (
            <ul className="fav-tracks">
              {favoriteTracks(records).slice(0, 20).map(({ b, t }, i) => (
                <li key={`${b.id}-${i}`}>
                  <span className="fav-star" aria-hidden="true">★</span>
                  <span className="fav-text">
                    <strong>{t.title}</strong>
                    <button className="link muted small" onClick={() => onOpen(b)}>{[t.position, b.title, t.artist ?? b.authors[0]].filter(Boolean).join(' · ')}</button>
                  </span>
                  <button className="btn ghost small-btn spin-btn" onClick={() => onSpin(b)} aria-label={`Spin ${b.title}`}>▶ Spin</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Open a record and press ☆ next to the songs you love. They're collected here.</p>
          )}
        </section>
        <section className="panel">
          <h3>Top artists</h3>
          <Bars rows={topArtists(mine, byId)} />
        </section>
        <section className="panel">
          <h3>Spins per month</h3>
          {mine.length ? <Bars rows={spinsPerMonth(mine)} /> : <p className="muted">Nothing to show yet.</p>}
        </section>
        <section className="panel">
          <h3>When you listen</h3>
          {mine.length ? <Bars rows={spinsPerWeekday(mine)} /> : <p className="muted">Nothing to show yet.</p>}
        </section>
        <section className="panel">
          <h3>Recently played</h3>
          {recent.length ? (
            <ul className="spin-list recent-spins">
              {recent.map((s) => {
                const b = byId.get(s.bookId)!;
                return (
                  <li key={s.id}>
                    <button className="link" onClick={() => onOpen(b)}>{b.title}</button>
                    <span className="muted small">{agoLabel(s.at)}</span>
                    <button className="icon-btn" onClick={() => onRemoveSpin(s.id)} aria-label={`Remove this play of ${b.title}`} title="Remove this play">✕</button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">No plays yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
