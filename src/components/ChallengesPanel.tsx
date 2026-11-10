import { useMemo, useState } from 'react';
import type { Book, Challenge, ChallengeMeasure, Reading } from '../types';
import { BADGES, progressOf } from '../lib/challenges';
import { formatDay, todayIso } from '../lib/reading';
import { newId } from '../lib/storage';
import { unitWord } from '../lib/labels';

interface Props {
  challenges: Challenge[];
  books: Book[];
  readings: Reading[];
  onSave: (c: Challenge) => void;
  onRemove: (id: string) => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString();

type Progress = ReturnType<typeof progressOf>;

function paceText(c: Challenge, p: Progress): string {
  if (!p.started) return `Starts ${formatDay(c.startOn)}`;
  if (p.done >= c.goal) return 'Goal reached!';
  if (p.ended) return `Ended ${formatDay(c.endOn)}`;
  const diff = p.done - p.expected;
  if (Math.abs(diff) < (c.measure === 'books' ? 0.5 : c.goal / 100)) return 'Right on pace';
  const u = c.measure === 'books' ? 'book' : 'page';
  const plural = Math.round(Math.abs(diff)) === 1 ? '' : 's';
  return `${fmt(Math.abs(diff))} ${u}${plural} ${diff > 0 ? 'ahead of' : 'behind'} pace`;
}

function needText(c: Challenge, p: Progress): string {
  if (!p.started || p.ended || p.done >= c.goal) return '';
  if (c.measure !== 'books') return `About ${fmt(p.perWeekNeeded / 7)} pages a day to finish on time.`;
  const rate = p.perWeekNeeded < 1 ? `1 book every ${Math.max(1, Math.round(7 / Math.max(p.perWeekNeeded, 0.01)))} days` : `${p.perWeekNeeded.toFixed(1)} books a week`;
  return `About ${rate} to finish on time.`;
}

function ChallengeForm({ initial, onSave, onCancel }: Readonly<{ initial?: Challenge; onSave: (c: Challenge) => void; onCancel: () => void }>) {
  const year = new Date().getFullYear();
  const [measure, setMeasure] = useState<ChallengeMeasure>(initial?.measure ?? 'books');
  const [goal, setGoal] = useState(String(initial?.goal ?? 24));
  const [period, setPeriod] = useState<'year' | 'custom'>(
    initial && !(initial.startOn.endsWith('-01-01') && initial.endOn.endsWith('-12-31')) ? 'custom' : 'year',
  );
  const [yearValue, setYearValue] = useState(initial?.startOn.slice(0, 4) ?? String(year));
  const [startOn, setStartOn] = useState(initial?.startOn ?? todayIso());
  const [endOn, setEndOn] = useState(initial?.endOn ?? `${year}-12-31`);
  const [name, setName] = useState(initial?.name ?? '');
  const [error, setError] = useState('');

  return (
    <div className="challenge-form">
      <div className="grid-2">
        <label className="field">
          <span>Read</span>
          <div className="goal-row">
            <input id="c-goal" type="number" min={1} value={goal} onChange={(e) => setGoal(e.target.value)} />
            <select id="c-measure" value={measure} onChange={(e) => setMeasure(e.target.value as ChallengeMeasure)} aria-label="Books or pages">
              <option value="books">books</option>
              <option value="pages">pages</option>
            </select>
          </div>
        </label>
        <label className="field">
          <span>When</span>
          <select id="c-period" value={period} onChange={(e) => setPeriod(e.target.value as 'year' | 'custom')}>
            <option value="year">A whole year</option>
            <option value="custom">Dates I choose</option>
          </select>
        </label>
        {period === 'year' ? (
          <label className="field">
            <span>Year</span>
            <input id="c-year" type="number" min={1900} max={2100} value={yearValue} onChange={(e) => setYearValue(e.target.value)} />
          </label>
        ) : (
          <>
            <label className="field">
              <span>From</span>
              <input id="c-start" type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} />
            </label>
            <label className="field">
              <span>Until</span>
              <input id="c-end" type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)} />
            </label>
          </>
        )}
        <label className="field">
          <span>Name (optional)</span>
          <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer of sci-fi" />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="challenge-form-actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const n = Math.round(Number(goal));
            if (!n || n < 1) return setError('Set a goal of at least 1.');
            const s = period === 'year' ? `${yearValue}-01-01` : startOn;
            const e = period === 'year' ? `${yearValue}-12-31` : endOn;
            if (!s || !e || e < s) return setError('The end date has to be after the start date.');
            const now = new Date().toISOString();
            const unit = measure === 'books' ? unitWord('books', n) : 'pages';
            onSave({
              id: initial?.id ?? newId(),
              name: name.trim() || (period === 'year' ? `${n.toLocaleString()} ${unit} in ${yearValue}` : `${n.toLocaleString()} ${unit}`),
              measure,
              goal: n,
              startOn: s,
              endOn: e,
              // Changing the goal or dates can change what's earned, so start the badges fresh.
              badges: initial?.goal === n && initial.measure === measure && initial.startOn === s && initial.endOn === e ? initial.badges : {},
              createdAt: initial?.createdAt ?? now,
              updatedAt: now,
            });
          }}
        >
          {initial ? 'Save challenge' : 'Start challenge'}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function ChallengesPanel({ challenges, books, readings, onSave, onRemove }: Readonly<Props>) {
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const today = todayIso();
  const sorted = [...challenges].sort((a, b) => Number(a.endOn < today) - Number(b.endOn < today) || a.endOn.localeCompare(b.endOn));

  return (
    <section className="panel challenges">
      <div className="finished-head">
        <h3>Challenges</h3>
        {!adding && <button className="btn ghost small-btn" onClick={() => setAdding(true)}>+ New challenge</button>}
      </div>
      {adding && (
        <ChallengeForm
          onCancel={() => setAdding(false)}
          onSave={(c) => {
            onSave(c);
            setAdding(false);
          }}
        />
      )}
      {challenges.length === 0 && !adding && (
        <p className="muted">Set yourself a goal, like 24 books this year, and earn badges as you go.</p>
      )}
      <ul className="challenge-list">
        {sorted.map((c) => {
          if (editing === c.id) {
            return (
              <li key={c.id}>
                <ChallengeForm
                  initial={c}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => {
                    onSave(next);
                    setEditing(null);
                  }}
                />
              </li>
            );
          }
          const p = progressOf(c, readings, byId, today);
          const u = c.measure === 'books' ? 'book' : 'page';
          const pace = paceText(c, p);
          const need = needText(c, p);
          return (
            <li key={c.id} className="challenge">
              <div className="challenge-top">
                <div className="challenge-ring" style={{ ['--pct' as string]: Math.min(100, p.pct) }} aria-hidden="true">
                  <span>{Math.min(999, p.pct)}%</span>
                </div>
                <div className="challenge-text">
                  <strong className="challenge-name">{c.name}</strong>
                  <span>
                    <b>{fmt(p.done)}</b> of {fmt(c.goal)} {u}s · {formatDay(c.startOn)} – {formatDay(c.endOn)}
                  </span>
                  <span className={`pace ${pace.endsWith('behind pace') ? 'behind' : 'good'}`}>{pace}</span>
                  {need && <span className="muted small">{need}</span>}
                </div>
                <div className="challenge-tools">
                  <button className="link" onClick={() => setEditing(c.id)}>Edit</button>
                  {confirming === c.id ? (
                    <>
                      <button className="link danger-text" onClick={() => onRemove(c.id)}>Delete</button>
                      <button className="link" onClick={() => setConfirming(null)}>Keep</button>
                    </>
                  ) : (
                    <button className="link muted-link" onClick={() => setConfirming(c.id)}>Delete</button>
                  )}
                </div>
              </div>
              <ul className="badges" aria-label="Badges">
                {BADGES.map((b) => {
                  const on = c.badges[b.id];
                  const earned = on ? ` Earned ${formatDay(on)}.` : '';
                  return (
                    <li key={b.id} className={`badge-medal ${on ? 'earned' : 'locked'}`} title={`${b.name}: ${b.description(c)}${earned}`}>
                      <span className="medal" aria-hidden="true">{b.mark}</span>
                      <span className="medal-name">{b.name}</span>
                      <span className="sr-only">{on ? `earned ${formatDay(on)}` : `not earned yet. ${b.description(c)}`}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
