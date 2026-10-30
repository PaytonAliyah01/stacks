import { useState } from 'react';
import type { Spin } from '../types';
import { todayIso as todayIsoDate } from '../lib/reading';
import { agoLabel } from '../lib/spins';

interface Props {
  /** This record's spins. */
  spins: Spin[];
  onSpin: (at?: string) => void;
  onRemove: (id: string) => void;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The record drawer's play log. Not a <form>: it sits inside the drawer's form. */
export function SpinsPanel({ spins, onSpin, onRemove }: Props) {
  const [earlier, setEarlier] = useState(false);
  const [day, setDay] = useState(todayIsoDate());
  const [all, setAll] = useState(false);
  const sorted = [...spins].sort((a, b) => b.at.localeCompare(a.at));
  const shown = all ? sorted : sorted.slice(0, 5);
  return (
    <section className="panel spins-panel" aria-label="Plays">
      <div className="spins-head">
        <div>
          <h3>Plays</h3>
          <p className="muted small">
            {sorted.length
              ? `Played ${sorted.length === 1 ? 'once' : `${sorted.length} times`} · last ${agoLabel(sorted[0].at)}`
              : 'Never played yet. Press Spin when you put it on.'}
          </p>
        </div>
        <button type="button" className="btn primary spin-btn" onClick={() => onSpin()}>▶ Spin it now</button>
      </div>
      {earlier ? (
        <div className="spin-earlier">
          <input id="spin-day" type="date" value={day} max={todayIsoDate()} onChange={(e) => setDay(e.target.value)} aria-label="Day you played it" />
          <button
            type="button"
            className="btn ghost small-btn"
            onClick={() => {
              if (!day) return;
              onSpin(new Date(`${day}T20:00:00`).toISOString());
              setEarlier(false);
            }}
          >
            Add play
          </button>
          <button type="button" className="link small" onClick={() => setEarlier(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="link small" onClick={() => setEarlier(true)}>+ Add a play from another day</button>
      )}
      {shown.length > 0 && (
        <ul className="spin-list">
          {shown.map((s) => (
            <li key={s.id}>
              <span>{when(s.at)}</span>
              <button type="button" className="icon-btn" onClick={() => onRemove(s.id)} aria-label={`Remove the play on ${when(s.at)}`} title="Remove this play">✕</button>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > 5 && (
        <button type="button" className="link small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${sorted.length} plays`}</button>
      )}
    </section>
  );
}
