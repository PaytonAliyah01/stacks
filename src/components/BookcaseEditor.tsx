import { useEffect, useState } from 'react';
import { BOOKCASE_PRESETS, type Bookcase, type BookcaseType } from '../types';
import { bookcaseName } from '../lib/labels';

interface Props {
  bookcase: Bookcase;
  isNew: boolean;
  bookCount: number;
  onSave: (bc: Bookcase) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const COLORS: { value: Bookcase['color']; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'oak', label: 'Oak' },
  { value: 'walnut', label: 'Walnut' },
  { value: 'black', label: 'Black' },
];

export function BookcaseEditor({ bookcase, isNew, bookCount, onSave, onDelete, onClose }: Readonly<Props>) {
  const [d, setD] = useState(bookcase);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof Bookcase>(k: K, v: Bookcase[K]) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickType = (type: BookcaseType) => {
    const p = BOOKCASE_PRESETS[type];
    // Keep the name in step with the type until the person names it themselves.
    const autoName = bookcaseName;
    setD((x) => ({
      ...x,
      type,
      name: !x.name.trim() || x.name === autoName(x.type) ? autoName(type) : x.name,
      shelves: p.shelves,
      sections: p.sections,
      sectionWidthCm: p.sectionWidthCm,
    }));
  };

  const shrinking = !isNew && (d.shelves < bookcase.shelves || d.sections < bookcase.sections);

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer narrow" role="dialog" aria-modal="true" aria-label={isNew ? 'Add a bookcase' : `Edit ${bookcase.name}`}>
        <form
          className="drawer-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ ...d, name: d.name.trim() || 'Bookcase', updatedAt: new Date().toISOString() });
          }}
        >
          <header className="drawer-head">
            <h2 className="drawer-heading">{isNew ? 'Add a bookcase' : 'Edit bookcase'}</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </header>
          <label className="field">
            <span>Name</span>
            <input id="bc-name" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Living room Billy" autoFocus />
          </label>
          <label className="field">
            <span>Type</span>
            <select id="bc-type" value={d.type} onChange={(e) => pickType(e.target.value as BookcaseType)}>
              {Object.entries(BOOKCASE_PRESETS).map(([v, p]) => (
                <option key={v} value={v}>{p.label}</option>
              ))}
            </select>
          </label>
          <div className="grid-3">
            <label className="field">
              <span>Shelves</span>
              <input id="bc-shelves" type="number" min={1} max={12} value={d.shelves}
                onChange={(e) => set('shelves', Math.min(12, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
            <label className="field">
              <span>Cubes across</span>
              <input id="bc-sections" type="number" min={1} max={6} value={d.sections}
                onChange={(e) => set('sections', Math.min(6, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
            <label className="field">
              <span>Shelf width (cm)</span>
              <input id="bc-width" type="number" min={10} max={300} value={d.sectionWidthCm}
                onChange={(e) => set('sectionWidthCm', Math.min(300, Math.max(10, Number(e.target.value) || 10)))} />
            </label>
          </div>
          <p className="muted small">The sizes fill in from the type. Change them if yours has extra shelves or a different width. “Cubes across” is for cube units like Kallax.</p>
          <fieldset className="swatches">
            <legend>Finish</legend>
            {COLORS.map((c) => (
              <label key={c.value} className={`swatch wood-${c.value}`}>
                <input type="radio" name="bc-color" value={c.value} checked={d.color === c.value} onChange={() => set('color', c.value)} />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>
          {shrinking && (
            <p className="form-warn">Books on shelves or cubes you remove will go back to “Not on a bookcase”.</p>
          )}
          <footer className="drawer-foot">
            {!isNew &&
              (confirm ? (
                <span className="confirm">
                  Delete? {bookCount > 0 && `Its ${bookCount} books stay in your library.`}
                  <button type="button" className="btn danger" onClick={() => onDelete(bookcase.id)}>Delete</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="btn ghost danger-text" onClick={() => setConfirm(true)}>Delete bookcase</button>
              ))}
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary">{isNew ? 'Add bookcase' : 'Save'}</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
