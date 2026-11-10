import { useState } from 'react';
import type { Book } from '../types';
import { seriesLabel } from '../lib/series';

/** The book's series, shown as one line and edited in place. Changes go into the drawer's draft. */
export function SeriesField({ draft, knownNames, onChange }: Readonly<{ draft: Book; knownNames: string[]; onChange: (patch: Partial<Book>) => void }>) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(draft.series?.name ?? '');
  const [number, setNumber] = useState(draft.series?.number !== undefined ? String(draft.series.number) : '');

  if (!editing) {
    return (
      <div className="series-line">
        {draft.series ? (
          <>
            <span className="mood-label">Series</span>
            <span className="series-name">{seriesLabel(draft.series)}</span>
            <button type="button" className="link" onClick={() => setEditing(true)}>Edit</button>
          </>
        ) : (
          <button type="button" className="link" onClick={() => setEditing(true)}>+ Part of a series?</button>
        )}
      </div>
    );
  }
  const apply = (n: string, num: string) => {
    const v = Number(num.replace(',', '.'));
    onChange({
      series: n.trim() ? { name: n.trim(), number: num.trim() && Number.isFinite(v) && v > 0 ? v : undefined } : undefined,
      seriesChecked: true,
      seriesManual: true,
    });
  };
  return (
    <div className="series-edit">
      <label className="field">
        <span>Series</span>
        <input
          id="f-series"
          list="series-names"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            apply(e.target.value, number);
          }}
          placeholder="The Expanse"
        />
        <datalist id="series-names">{knownNames.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <label className="field series-num">
        <span>Number</span>
        <input
          id="f-series-number"
          type="number"
          min={0}
          step="any"
          value={number}
          onChange={(e) => {
            setNumber(e.target.value);
            apply(name, e.target.value);
          }}
          placeholder="1"
        />
      </label>
      <button type="button" className="link" onClick={() => setEditing(false)}>Done</button>
    </div>
  );
}
