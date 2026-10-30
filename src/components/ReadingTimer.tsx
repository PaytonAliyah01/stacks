import { useEffect, useState } from 'react';
import type { Book, Reading } from '../types';
import { clock, elapsedMs, getDailyGoal, hoursAndMinutes, minutesByDay, readingStreak, setDailyGoal, withSession, type ActiveSession } from '../lib/sessions';
import { lastPage, todayIso } from '../lib/reading';
import { Cover } from './Cover';

/** Minutes and the page reached, for finishing a timed session or logging one by hand. */
export function SessionForm({
  book,
  reading,
  minutes: initialMinutes,
  start,
  fromPage,
  onSave,
  onCancel,
  cancelLabel = 'Cancel',
  extra,
}: {
  book: Book;
  reading: Reading;
  minutes?: number;
  start?: string;
  fromPage?: number;
  onSave: (r: Reading) => void;
  onCancel: () => void;
  cancelLabel?: string;
  extra?: React.ReactNode;
}) {
  const [minutes, setMinutes] = useState(initialMinutes !== undefined ? String(Math.max(1, Math.round(initialMinutes))) : '');
  const [page, setPage] = useState(lastPage(reading) !== undefined ? String(lastPage(reading)) : '');
  const [error, setError] = useState('');
  return (
    <div className="session-form">
      <div className="session-fields">
        <label className="field">
          <span>Minutes read</span>
          <input id="s-minutes" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} autoFocus={initialMinutes === undefined} />
        </label>
        <label className="field">
          <span>{book.pageCount ? `Page you reached (of ${book.pageCount})` : 'Page you reached'}</span>
          <input id="s-page" type="number" min={0} max={book.pageCount} value={page} onChange={(e) => setPage(e.target.value)} autoFocus={initialMinutes !== undefined} />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="session-actions">
        <button
          type="button"
          className="btn primary small-btn"
          onClick={() => {
            const m = Number(minutes);
            if (!m || m < 1) return setError('Enter how many minutes you read.');
            const p = page.trim() ? Math.round(Number(page)) : undefined;
            if (p !== undefined && (!Number.isFinite(p) || p < 0)) return setError("That page number doesn't look right.");
            const begun = start ?? new Date(Date.now() - m * 60_000).toISOString();
            onSave(withSession(reading, book, begun, m, p, fromPage ?? lastPage(reading)));
          }}
        >
          Save session
        </button>
        {extra}
        <button type="button" className="btn ghost small-btn" onClick={onCancel}>{cancelLabel}</button>
      </div>
    </div>
  );
}

/** The running timer, pinned to the corner on every page. */
export function TimerBar({
  active,
  book,
  reading,
  onChange,
  onSave,
}: {
  active: ActiveSession;
  book?: Book;
  reading?: Reading;
  onChange: (a: ActiveSession | null) => void;
  onSave: (r: Reading) => void;
}) {
  const [, tick] = useState(0);
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!active.runningSince) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active.runningSince]);

  if (!book || !reading) return null;
  const ms = elapsedMs(active);
  const paused = !active.runningSince;
  const pause = () => onChange({ ...active, bankedMs: ms, runningSince: undefined });
  const resume = () => onChange({ ...active, runningSince: Date.now() });

  return (
    <div className={`timer-bar${stopping ? ' stopping' : ''}`} role="region" aria-label="Reading timer">
      <div className="timer-top">
        <Cover url={book.coverUrl} title={book.title} author={book.authors[0]} size="sm" />
        <div className="timer-text">
          <span className="muted small">{paused ? 'Paused' : 'Reading'}</span>
          <strong className="timer-title">{book.title}</strong>
        </div>
        <span className={`timer-clock${paused ? ' paused' : ''}`} aria-live="off">{clock(ms)}</span>
      </div>
      {stopping ? (
        <SessionForm
          book={book}
          reading={reading}
          minutes={ms / 60_000}
          start={new Date(active.startedAt).toISOString()}
          fromPage={active.fromPage}
          onSave={(r) => {
            onSave(r);
            onChange(null);
          }}
          onCancel={() => {
            setStopping(false);
            resume();
          }}
          cancelLabel="Keep reading"
          extra={
            <button type="button" className="link muted-link" onClick={() => onChange(null)}>
              Discard
            </button>
          }
        />
      ) : (
        <div className="timer-actions">
          {paused ? (
            <button type="button" className="btn ghost small-btn" onClick={resume}>Resume</button>
          ) : (
            <button type="button" className="btn ghost small-btn" onClick={pause}>Pause</button>
          )}
          <button
            type="button"
            className="btn primary small-btn"
            onClick={() => {
              if (!paused) pause();
              setStopping(true);
            }}
          >
            Stop
          </button>
        </div>
      )}
    </div>
  );
}

/** Today's minutes against the daily goal, and the streak. */
export function TodaySummary({ readings }: { readings: Reading[] }) {
  const [goal, setGoal] = useState(getDailyGoal);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal || 30));
  const today = minutesByDay(readings).get(todayIso()) ?? 0;
  const streak = readingStreak(readings);
  const pct = goal ? Math.min(100, Math.round((today / goal) * 100)) : 0;

  return (
    <div className="today">
      <div className="today-row">
        <span>
          <strong>Today:</strong> {hoursAndMinutes(today)}
          {goal ? ` of ${goal} min` : ''}
        </span>
        {streak > 0 && <span className="streak">{streak}-day streak</span>}
      </div>
      {goal > 0 && (
        <div className="progress-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
      {editing ? (
        <div className="goal-edit">
          <input id="daily-goal" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Minutes a day" />
          <span className="muted small">min a day</span>
          <button
            type="button"
            className="btn ghost small-btn"
            onClick={() => {
              const n = Math.max(0, Math.round(Number(value) || 0));
              setDailyGoal(n);
              setGoal(n);
              setEditing(false);
            }}
          >
            Save
          </button>
        </div>
      ) : (
        <button type="button" className="link small" onClick={() => setEditing(true)}>
          {goal ? 'Change daily goal' : 'Set a daily reading goal'}
        </button>
      )}
      {goal > 0 && today >= goal && <span className="goal-met">Daily goal reached</span>}
    </div>
  );
}
