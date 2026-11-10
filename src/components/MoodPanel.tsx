import { useState } from 'react';
import type { Book } from '../types';
import { COMMON_WARNINGS, MOODS, PACES, cap, guessVibe } from '../lib/moods';
import { fetchSubjects } from '../lib/lookup';

interface Props {
  draft: Book;
  onChange: (patch: Partial<Book>) => void;
}

/** Mood, pace and content warnings for one book. Changes go into the drawer's draft. */
export function MoodPanel({ draft, onChange: change }: Readonly<Props>) {
  // Any change by hand means the tags are yours now, not a guess.
  const onChange = (patch: Partial<Book>) => change({ ...patch, vibeGuessed: undefined, vibeChecked: true });
  const [guessing, setGuessing] = useState('');
  const suggest = async () => {
    setGuessing('Looking at its genres…');
    let g = guessVibe([...draft.subjects, ...draft.tags]);
    if (!g.moods.length) {
      try {
        g = guessVibe([...draft.subjects, ...draft.tags, ...(await fetchSubjects(draft))]);
      } catch {
        return setGuessing("Couldn't reach Open Library. Try again in a moment.");
      }
    }
    if (!g.moods.length) return setGuessing('No genres to go on for this one. Pick the moods yourself.');
    setGuessing('');
    setOpen(true);
    change({ moods: g.moods, pace: g.pace ?? draft.pace, contentWarnings: draft.contentWarnings?.length ? draft.contentWarnings : g.contentWarnings, vibeGuessed: true, vibeChecked: true });
  };
  const moods = draft.moods ?? [];
  const warnings = draft.contentWarnings ?? [];
  const [warning, setWarning] = useState('');
  const [open, setOpen] = useState(!!(moods.length || draft.pace || warnings.length));
  const addWarning = (w: string) => {
    const v = w.trim().toLowerCase();
    if (v && !warnings.includes(v)) onChange({ contentWarnings: [...warnings, v] });
    setWarning('');
  };

  if (!open) {
    return (
      <div className="mood-closed">
        <button type="button" className="btn ghost small-btn" onClick={() => setOpen(true)}>
          + Add mood, pace or content warnings
        </button>
        <button type="button" className="link" onClick={suggest}>Suggest from genres</button>
        {guessing && <span className="muted small">{guessing}</span>}
      </div>
    );
  }
  return (
    <div className="mood-panel">
      {draft.vibeGuessed && (
        <p className="mood-guess">Stacks guessed these from the book's genres. Change anything that doesn't fit.</p>
      )}
      <div>
        <div className="mood-label">Mood <span className="muted small">pick any that fit</span></div>
        <fieldset className="status-pick" aria-label="Mood">
          {MOODS.map((m) => {
            const on = moods.includes(m);
            return (
              <button
                key={m}
                type="button"
                className={`status-option mood-chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange({ moods: on ? moods.filter((x) => x !== m) : [...moods, m] })}
              >
                {cap(m)}
              </button>
            );
          })}
        </fieldset>
      </div>
      <div>
        <div className="mood-label">Pace</div>
        <fieldset className="status-pick" aria-label="Pace">
          {PACES.map((p) => (
            <button
              key={p}
              type="button"
              className={`status-option${draft.pace === p ? ' on' : ''}`}
              aria-pressed={draft.pace === p}
              onClick={() => onChange({ pace: draft.pace === p ? undefined : p })}
            >
              {cap(p)}
            </button>
          ))}
        </fieldset>
      </div>
      <div>
        <div className="mood-label">Content warnings</div>
        {warnings.length > 0 && (
          <ul className="warning-list">
            {warnings.map((w) => (
              <li key={w}>
                {w}
                <button type="button" className="warning-x" aria-label={`Remove ${w}`} onClick={() => onChange({ contentWarnings: warnings.filter((x) => x !== w) })}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="warning-add">
          <input
            id="f-warning"
            list="warning-suggestions"
            value={warning}
            onChange={(e) => setWarning(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addWarning(warning);
              }
            }}
            placeholder="Type a warning, then Enter"
            aria-label="Add a content warning"
          />
          <button type="button" className="btn ghost small-btn" onClick={() => addWarning(warning)} disabled={!warning.trim()}>Add</button>
          <datalist id="warning-suggestions">
            {COMMON_WARNINGS.filter((w) => !warnings.includes(w)).map((w) => <option key={w} value={w} />)}
          </datalist>
        </div>
      </div>
    </div>
  );
}
