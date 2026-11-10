import { useMemo, useState } from 'react';
import type { Book, Spin } from '../types';
import { SHAPES, hoursLabel, newStylus, wear, type Stylus, type StylusShape } from '../lib/stylus';
import { formatDay, todayIso } from '../lib/reading';

interface Props {
  records: Book[];
  spins: Spin[];
  styluses: Stylus[];
  onChange: (list: Stylus[]) => void;
}

function NewStylusForm({ onAdd, onCancel }: Readonly<{ onAdd: (s: Stylus) => void; onCancel?: () => void }>) {
  const [name, setName] = useState('');
  const [shape, setShape] = useState<StylusShape>('elliptical');
  const [day, setDay] = useState(todayIso());
  const [used, setUsed] = useState('');
  return (
    <div className="stylus-form">
      <label className="field">
        <span>Stylus or cartridge</span>
        <input id="stylus-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ortofon 2M Red, Audio-Technica AT-VM95E" />
      </label>
      <label className="field">
        <span>Tip shape</span>
        <select id="stylus-shape" value={shape} onChange={(e) => setShape(e.target.value as StylusShape)}>
          {(Object.keys(SHAPES) as StylusShape[]).map((k) => (
            <option key={k} value={k}>{SHAPES[k].label} · about {SHAPES[k].hours} hours</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Put on</span>
        <input id="stylus-day" type="date" value={day} max={todayIso()} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label className="field">
        <span>Hours it already had</span>
        <input id="stylus-used" type="number" min={0} value={used} onChange={(e) => setUsed(e.target.value)} placeholder="0 for a new one" />
      </label>
      <div className="stylus-form-actions">
        <button className="btn primary small-btn" disabled={!day} onClick={() => onAdd(newStylus(name, shape, day, Number(used) || 0))}>Start tracking</button>
        {onCancel && <button className="link small" onClick={onCancel}>Cancel</button>}
      </div>
      <p className="muted small">Stacks counts the length of every vinyl record you spin from that day on. CDs don't wear a stylus, so they don't count.</p>
    </div>
  );
}

export function StylusPanel({ records, spins, styluses, onChange }: Readonly<Props>) {
  const byId = useMemo(() => new Map(records.map((b) => [b.id, b])), [records]);
  const active = styluses.find((s) => !s.retiredOn);
  const old = styluses.filter((s) => s.retiredOn).sort((a, b) => b.retiredOn!.localeCompare(a.retiredOn!));
  const [adding, setAdding] = useState(false);
  const [editingLife, setEditingLife] = useState(false);
  const w = active && wear(active, spins, byId);

  const replace = (s: Stylus) => {
    const today = todayIso();
    onChange([...styluses.map((x) => (x.retiredOn ? x : { ...x, retiredOn: s.installedOn < today ? s.installedOn : today })), s]);
    setAdding(false);
  };

  return (
    <section className="panel stylus-panel" aria-label="Stylus">
      <div className="spins-head">
        <div>
          <h3>Stylus</h3>
          <p className="muted small">{active ? `${active.name} · on since ${formatDay(active.installedOn)}` : 'Track how worn your turntable’s needle is.'}</p>
        </div>
        {active && !adding && <button className="btn ghost small-btn" onClick={() => setAdding(true)}>I replaced it</button>}
      </div>

      {!active || adding ? (
        <NewStylusForm onAdd={replace} onCancel={adding ? () => setAdding(false) : undefined} />
      ) : (
        w && (
          <div className="stylus-wear">
            <div className={`stylus-meter ${w.pct >= 100 ? 'over' : w.pct >= 85 ? 'warn' : ''}`}>
              <i style={{ width: `${w.pct}%` }} />
            </div>
            <div className="stylus-numbers">
              <span>
                <strong>{hoursLabel(w.hours)}</strong> of {active.lifeHours} hours · {w.pct}% worn
              </span>
              <span className="muted small">
                {w.plays} vinyl play{w.plays === 1 ? '' : 's'}
                {active.startHours ? ` + ${active.startHours} hours from before` : ''}
                {w.daysLeft !== undefined && w.pct < 100 && ` · at your pace, about ${w.daysLeft > 60 ? `${Math.round(w.daysLeft / 30)} months` : `${w.daysLeft} days`} left`}
              </span>
            </div>
            {(w.pct >= 100) ? (
              <p className="stylus-alert">Time for a new stylus. A worn one sounds dull and can damage your records.</p>
            ) : null}
            {!(w.pct >= 100) && (w.pct >= 85) ? (
              <p className="stylus-alert soft">Your stylus is nearly worn out. Good time to order a new one.</p>
            ) : null}
            {editingLife ? (
              <label className="stylus-life">
                Replace after
                <input
                  id="stylus-life"
                  type="number"
                  min={50}
                  defaultValue={active.lifeHours}
                  onBlur={(e) => {
                    const n = Math.round(Number(e.target.value));
                    if (n >= 50) onChange(styluses.map((x) => (x.id === active.id ? { ...x, lifeHours: n } : x)));
                    setEditingLife(false);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  autoFocus
                />
                hours
              </label>
            ) : (
              <button className="link small" onClick={() => setEditingLife(true)}>Change how long it lasts</button>
            )}
          </div>
        )
      )}

      {old.length > 0 && (
        <details className="stylus-history">
          <summary className="small">Earlier styluses ({old.length})</summary>
          <ul>
            {old.map((s) => {
              const ow = wear(s, spins, byId);
              return (
                <li key={s.id} className="small">
                  <strong>{s.name}</strong> <span className="muted">{formatDay(s.installedOn)} to {formatDay(s.retiredOn)} · {hoursLabel(ow.hours)} hours, {ow.plays} plays</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
